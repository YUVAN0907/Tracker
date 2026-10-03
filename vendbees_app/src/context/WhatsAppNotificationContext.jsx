/**
 * WhatsAppNotificationContext
 *
 * Single real-time source of truth for WhatsApp notifications.
 * Listens to the existing `whatsappConversations` Firestore collection.
 *
 * Incoming Student Message:
 *   - The Flask webhook updates the student's conversation document with:
 *       lastSender: 'student'
 *       unreadForAdmin: true
 *       notificationCleared: false
 *       unreadCount: Increment(1)
 *       lastMessage, lastMessageAt, ticketDisplayId, issueType, complaintStatus
 *
 * Notification Lifecycle:
 *   - Display in Popup: Every conversation where lastSender === 'student'
 *     AND notificationCleared !== true.
 *   - Click Notification: Navigates to /complaints, selects ticket & opens WhatsApp drawer.
 *     Marks the notification as read (unreadForAdmin: false) so the unread badge clears,
 *     but DOES NOT delete or clear the notification card from the popup.
 *   - Individual Clear (×): Sets notificationCleared: true, removing it from the popup.
 *   - Clear All: Batch-sets notificationCleared: true on all visible conversations.
 *   - Next Message: When the student sends a new message, the webhook resets
 *     notificationCleared: false and unreadForAdmin: true, so the notification immediately
 *     reappears in real time.
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
    markTicketRead: () => {},
    markWhatsAppRead: () => {},
    clearWhatsAppNotification: () => {},
    clearAllWhatsAppNotifications: () => {},
});

// ─── Provider ────────────────────────────────────────────────────────────────

export const WhatsAppNotificationProvider = ({ children }) => {
    const [whatsappNotifications, setWhatsappNotifications] = useState([]);
    const { isAuthenticated } = useAuth();

    // Real-time listener on whatsappConversations collection
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

                    // Only show notifications for conversations where student was the last sender.
                    // Outgoing admin replies or automated system status updates never show as notifications.
                    if (data.lastSender !== 'student') return;

                    // Skip conversations that have been explicitly cleared by the admin.
                    if (data.notificationCleared === true) return;

                    // Unread logic:
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

                        // Complaint info
                        issueType: data.issueType || 'General',
                        complaintStatus: data.complaintStatus || 'Submitted',

                        // Message preview
                        messagePreview: data.lastMessage || '',
                        lastSender: data.lastSender || 'student',
                        lastMessageType: data.lastMessageType || 'text',

                        // Read status (true if admin has opened/seen it, false if unread)
                        read: !isUnread,
                        unreadCount: data.unreadCount || 0,

                        // Timestamp
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

    // Unread count (number of conversations with unread student messages)
    const unreadWhatsAppCount = whatsappNotifications.filter((n) => !n.read).length;

    // ── Actions ───────────────────────────────────────────────────────────────

    /**
     * Mark a conversation as read (when clicked/opened).
     * Does NOT clear or remove the notification from the popup.
     */
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

    /**
     * Mark ticket as read.
     */
    const markTicketRead = useCallback(async (ticketId) => {
        if (!ticketId) return;
        const targets = whatsappNotifications.filter(
            (n) => n.ticketId === ticketId || n.ticketDisplayId === ticketId,
        );
        await Promise.all(targets.map((n) => markWhatsAppRead(n.id)));
    }, [whatsappNotifications, markWhatsAppRead]);

    /**
     * Clear individual WhatsApp notification (explicit × button only).
     * Sets notificationCleared: true so it is hidden from the popup.
     * Does NOT delete the conversation or chat history.
     */
    const clearWhatsAppNotification = useCallback(async (convDocId) => {
        if (!convDocId) return;
        try {
            await updateDoc(doc(db, 'whatsappConversations', convDocId), {
                notificationCleared: true,
                unreadForAdmin: false,
                unreadCount: 0,
            });
        } catch (err) {
            console.error('[WhatsAppNotificationContext] clearWhatsAppNotification error:', err);
        }
    }, []);

    /**
     * Clear ALL WhatsApp notifications (explicit "Clear All" button only).
     * Batch-sets notificationCleared: true on all currently visible conversations.
     * Future messages from any student will reset notificationCleared: false and reappear.
     */
    const clearAllWhatsAppNotifications = useCallback(async () => {
        try {
            if (whatsappNotifications.length === 0) return;

            const batchSize = 499;
            for (let i = 0; i < whatsappNotifications.length; i += batchSize) {
                const batch = writeBatch(db);
                whatsappNotifications.slice(i, i + batchSize).forEach((n) => {
                    batch.update(doc(db, 'whatsappConversations', n.id), {
                        notificationCleared: true,
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
        markTicketRead,
        markWhatsAppRead,
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
