/**
 * WhatsAppNotificationContext
 *
 * Single real-time source of truth for WhatsApp notifications.
 * Listens to the existing `whatsappConversations` Firestore collection —
 * NO separate notification collection is created or used.
 *
 * The Flask webhook updates whatsappConversations on every incoming
 * student message with:
 *   unreadForAdmin: true     ← new student message
 *   unreadCount: Increment(1)
 *   lastMessage, lastMessageAt, lastSender, ticketDisplayId, issueType, complaintStatus
 *
 * When admin replies, the webhook sets:
 *   unreadForAdmin: false
 *   unreadCount: 0
 *
 * Exposed API:
 *   whatsappNotifications     — all conversations, newest first (used for Notifications page)
 *   unreadWhatsAppCount       — count of conversations where unreadForAdmin === true
 *   markWhatsAppRead(convId)  — set unreadForAdmin=false, unreadCount=0 on ONE conversation
 *   markTicketRead(ticketId)  — same but looks up conv by ticketId
 *   clearWhatsAppNotification(convId)      — same as markWhatsAppRead (no data deleted)
 *   clearAllWhatsAppNotifications()        — reset notification state on ALL conversations
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { db } from '../firebase';
import {
    collection, query, onSnapshot,
    doc, updateDoc, getDocs, writeBatch,
} from 'firebase/firestore';

// ─── Context ────────────────────────────────────────────────────────────────

const WhatsAppNotificationContext = createContext({
    whatsappNotifications: [],
    unreadWhatsAppCount: 0,
    markWhatsAppRead: () => {},
    markTicketRead: () => {},
    clearWhatsAppNotification: () => {},
    clearAllWhatsAppNotifications: () => {},
});

// ─── Provider ────────────────────────────────────────────────────────────────

export const WhatsAppNotificationProvider = ({ children }) => {
    const [whatsappNotifications, setWhatsappNotifications] = useState([]);
    const { isAuthenticated } = useAuth();

    // Real-time listener on whatsappConversations (the existing collection).
    // Querying without orderBy avoids index requirements or document exclusions if missing fields.
    useEffect(() => {
        if (!isAuthenticated) {
            setWhatsappNotifications([]);
            return;
        }

        const q = query(collection(db, 'whatsappConversations'));

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const convs = snapshot.docs.map((d) => {
                    const data = d.data();
                    
                    // Unread logic: explicit unreadForAdmin (boolean or string), OR lastSender is student with unreadCount > 0, OR lastSender is student and unreadForAdmin is not explicitly false
                    const isUnread = data.unreadForAdmin === true ||
                        data.unreadForAdmin === 'true' ||
                        data.unreadForAdmin === 'True' ||
                        (data.lastSender === 'student' && (data.unreadCount > 0 || data.unreadForAdmin !== false));

                    // Date parsing
                    let jsDate = new Date();
                    if (data.lastMessageAt?.toDate) {
                        jsDate = data.lastMessageAt.toDate();
                    } else if (data.createdAt?.toDate) {
                        jsDate = data.createdAt.toDate();
                    } else if (data.lastMessageAt) {
                        jsDate = new Date(data.lastMessageAt);
                    }

                    return {
                        // Document identity
                        id: d.id,
                        conversationId: data.conversationId || d.id,

                        // Ticket link
                        ticketId: data.ticketId || '',
                        ticketDisplayId: data.ticketDisplayId || (data.ticketId ? `#${data.ticketId.slice(0, 8)}` : 'Ticket'),

                        // Student info
                        studentName: data.studentName || data.studentPhone || 'Student',
                        mobileNumber: data.studentPhone || '',
                        whatsappNumber: data.studentPhoneFull || data.studentPhone || '',

                        // Complaint info (denormalized by backend for display)
                        issueType: data.issueType || 'WhatsApp Message',
                        complaintStatus: data.complaintStatus || 'Active',

                        // Last message preview
                        messagePreview: data.lastMessage || '',
                        lastSender: data.lastSender || '',
                        lastMessageType: data.lastMessageType || 'text',

                        // Notification state
                        read: !isUnread,
                        unreadCount: data.unreadCount || 0,

                        // Timestamp — JS Date
                        timestamp: jsDate,
                    };
                });

                // Client-side sort: newest first
                convs.sort((a, b) => (b.timestamp?.getTime?.() || 0) - (a.timestamp?.getTime?.() || 0));

                setWhatsappNotifications(convs);
            },
            (err) => {
                console.error('[WhatsAppNotificationContext] Firestore listener error:', err);
            },
        );

        return () => unsubscribe();
    }, [isAuthenticated]);

    // Unread = conversations where read === false
    const unreadWhatsAppCount = whatsappNotifications.filter((n) => !n.read).length;

    // ── Actions ───────────────────────────────────────────────────────────────

    /** Mark one conversation as read by conversation doc ID. Does NOT delete anything. */
    const markWhatsAppRead = useCallback(async (convDocId) => {
        if (!convDocId) return;
        try {
            await updateDoc(doc(db, 'whatsappConversations', convDocId), {
                unreadForAdmin: false,
                unreadCount: 0,
            });
        } catch (err) {
            console.error('[WhatsAppNotificationContext] markWhatsAppRead error:', err);
        }
    }, []);

    /** Mark all unread conversations for a given ticketId as read. */
    const markTicketRead = useCallback(async (ticketId) => {
        if (!ticketId) return;
        const toRead = whatsappNotifications.filter(
            (n) => (n.ticketId === ticketId || n.ticketDisplayId === ticketId) && !n.read,
        );
        await Promise.all(toRead.map((n) => markWhatsAppRead(n.id)));
    }, [whatsappNotifications, markWhatsAppRead]);

    /** Clear individual WhatsApp notification — resets notification state only, no data deleted. */
    const clearWhatsAppNotification = useCallback(async (convDocId) => {
        // "Clear" = mark as read. Conversations are never deleted.
        await markWhatsAppRead(convDocId);
    }, [markWhatsAppRead]);

    /** Clear ALL WhatsApp notifications — resets unread state on all conversations. No data deleted. */
    const clearAllWhatsAppNotifications = useCallback(async () => {
        try {
            const unread = whatsappNotifications.filter((n) => !n.read);
            if (unread.length === 0) return;

            // Batch update (up to 500 per batch)
            const batchSize = 499;
            for (let i = 0; i < unread.length; i += batchSize) {
                const batch = writeBatch(db);
                unread.slice(i, i + batchSize).forEach((n) => {
                    batch.update(doc(db, 'whatsappConversations', n.id), {
                        unreadForAdmin: false,
                        unreadCount: 0,
                    });
                });
                await batch.commit();
            }
        } catch (err) {
            console.error('[WhatsAppNotificationContext] clearAllWhatsAppNotifications error:', err);
        }
    }, [whatsappNotifications]);

    const value = {
        whatsappNotifications,
        unreadWhatsAppCount,
        markWhatsAppRead,
        markTicketRead,
        clearWhatsAppNotification,
        clearAllWhatsAppNotifications,
    };

    return (
        <WhatsAppNotificationContext.Provider value={value}>
            {children}
        </WhatsAppNotificationContext.Provider>
    );
};

// ─── Hook ────────────────────────────────────────────────────────────────────

export const useWhatsAppNotifications = () => useContext(WhatsAppNotificationContext);
