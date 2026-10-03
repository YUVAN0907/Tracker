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
 *   notificationCleared: false (reset so notification reappears)
 *   unreadCount: Increment(1)
 *   lastMessage, lastMessageAt, lastSender, ticketDisplayId, issueType, complaintStatus
 *
 * IMPORTANT — Read vs Clear are SEPARATE operations:
 *   READ:    Opening/viewing a notification does NOT remove it from the popup.
 *            Only the unread dot/badge may change.
 *   CLEARED: Only an explicit × (individual) or "Clear All" action hides the notification.
 *            Setting notificationCleared=true on the Firestore doc hides it from the popup.
 *            This does NOT delete any chat messages, conversations, or tickets.
 *
 * Exposed API:
 *   whatsappNotifications          — uncleared student-sent conversations, newest first
 *   unreadWhatsAppCount            — count where unreadForAdmin===true AND not cleared
 *   clearWhatsAppNotification(id)  — set notificationCleared=true (individual ×)
 *   clearAllWhatsAppNotifications()— set notificationCleared=true on all visible notifications
 *   markTicketRead(ticketId)       — DEPRECATED; kept for call-site compatibility but is now a no-op
 *                                    Opening/clicking a notification must NOT auto-clear it.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { db } from '../firebase';
import {
    collection, query, onSnapshot,
    doc, updateDoc, writeBatch,
} from 'firebase/firestore';

// ─── Context ────────────────────────────────────────────────────────────────

const WhatsAppNotificationContext = createContext({
    whatsappNotifications: [],
    unreadWhatsAppCount: 0,
    markTicketRead: () => {},          // no-op — kept for call-site compatibility
    clearWhatsAppNotification: () => {},
    clearAllWhatsAppNotifications: () => {},
});

// ─── Provider ────────────────────────────────────────────────────────────────

export const WhatsAppNotificationProvider = ({ children }) => {
    const [whatsappNotifications, setWhatsappNotifications] = useState([]);
    const { isAuthenticated } = useAuth();

    // Real-time listener on whatsappConversations (the existing collection).
    useEffect(() => {
        if (!isAuthenticated) {
            setWhatsappNotifications([]);
            return;
        }

        const q = query(collection(db, 'whatsappConversations'));

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const convs = [];

                snapshot.docs.forEach((d) => {
                    const data = d.data();

                    // Skip conversations that have been explicitly cleared by the admin.
                    // notificationCleared=true means the admin pressed × or Clear All.
                    if (data.notificationCleared === true) return;

                    // Only show conversations where a student sent the last message.
                    // Admin-sent messages and system status updates never show as notifications.
                    if (data.lastSender !== 'student') return;

                    // Unread = student sent a message the admin hasn't seen yet.
                    const isUnread = (
                        data.unreadForAdmin === true ||
                        data.unreadForAdmin === 'true' ||
                        data.unreadForAdmin === 'True' ||
                        data.unreadCount > 0 ||
                        data.unreadForAdmin !== false
                    );

                    // Date parsing
                    let jsDate = new Date();
                    if (data.lastMessageAt?.toDate) {
                        jsDate = data.lastMessageAt.toDate();
                    } else if (data.createdAt?.toDate) {
                        jsDate = data.createdAt.toDate();
                    } else if (data.lastMessageAt) {
                        jsDate = new Date(data.lastMessageAt);
                    }

                    convs.push({
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
                    });
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

    // Unread = conversations where read === false (and not cleared, already filtered above)
    const unreadWhatsAppCount = whatsappNotifications.filter((n) => !n.read).length;

    // ── Actions ───────────────────────────────────────────────────────────────

    /**
     * Clear individual WhatsApp notification (explicit × button only).
     * Sets notificationCleared=true on the Firestore conversation document.
     * Does NOT delete any chat messages, complaints, or conversations.
     * Does NOT affect unreadForAdmin or unreadCount.
     *
     * When the student sends another message, the backend resets notificationCleared=false
     * so the notification reappears automatically.
     */
    const clearWhatsAppNotification = useCallback(async (convDocId) => {
        if (!convDocId) return;
        try {
            await updateDoc(doc(db, 'whatsappConversations', convDocId), {
                notificationCleared: true,
            });
        } catch (err) {
            console.error('[WhatsAppNotificationContext] clearWhatsAppNotification error:', err);
        }
    }, []);

    /**
     * Clear ALL WhatsApp notifications (explicit "Clear All" button only).
     * Sets notificationCleared=true on all currently visible conversation documents.
     * Does NOT delete any chat messages, complaints, or conversations.
     */
    const clearAllWhatsAppNotifications = useCallback(async () => {
        try {
            if (whatsappNotifications.length === 0) return;

            // Batch update (up to 499 per batch)
            const batchSize = 499;
            for (let i = 0; i < whatsappNotifications.length; i += batchSize) {
                const batch = writeBatch(db);
                whatsappNotifications.slice(i, i + batchSize).forEach((n) => {
                    batch.update(doc(db, 'whatsappConversations', n.id), {
                        notificationCleared: true,
                    });
                });
                await batch.commit();
            }
        } catch (err) {
            console.error('[WhatsAppNotificationContext] clearAllWhatsAppNotifications error:', err);
        }
    }, [whatsappNotifications]);

    /**
     * No-op. Kept for call-site compatibility.
     * Opening/clicking a notification must NOT auto-clear or auto-read it.
     * The notification remains until the admin explicitly presses × or Clear All.
     */
    const markTicketRead = useCallback(async (_ticketId) => {
        // Intentionally no-op: read ≠ cleared. See module docstring.
    }, []);

    const value = {
        whatsappNotifications,
        unreadWhatsAppCount,
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
