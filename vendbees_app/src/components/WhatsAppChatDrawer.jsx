import React, { useState, useEffect, useRef } from 'react';
import {
    X, Send, Check, CheckCheck, AlertCircle, Phone, User, Hash, Clock,
    Maximize2, FileText, Download, Play, Pause, MapPin, Eye, Image as ImageIcon
} from 'lucide-react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { sendWhatsAppMessage } from '../utils/whatsappApi';
import clsx from 'clsx';
import WhatsAppConversationCenter from './WhatsAppConversationCenter';

const WhatsAppChatDrawer = ({ complaint, onClose }) => {
    // ─── ALL HOOKS FIRST — before any conditional return ───────────────────
    const [isMaximized, setIsMaximized] = useState(false);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);
    const [playingAudioId, setPlayingAudioId] = useState(null);
    const [lightboxImage, setLightboxImage] = useState(null);
    const messagesEndRef = useRef(null);
    const chatContainerRef = useRef(null);
    const audioRefs = useRef({});

    const [whatsappPhone, setWhatsappPhone] = useState('');

    const ticketId = complaint?.id;
    const rawPhone = complaint?.student?.phone || complaint?.mobileNumber;
    const studentPhone = whatsappPhone || rawPhone;
    const studentName = complaint?.student?.name || complaint?.fullName || 'Student';
    const ticketDisplayId = complaint?.ticket_id || complaint?.ticketId || 'N/A';

    useEffect(() => {
        if (!rawPhone || rawPhone === 'N/A') {
            setWhatsappPhone('N/A');
            return;
        }
        const fetchStudent = async () => {
            try {
                const userRef = doc(db, 'students', rawPhone.replace(/\D/g, '').slice(-10));
                const userSnap = await getDoc(userRef);
                if (userSnap.exists()) {
                    const data = userSnap.data();
                    setWhatsappPhone(data.whatsappNumber || data.mobileNumber || rawPhone);
                } else {
                    setWhatsappPhone(rawPhone);
                }
            } catch (err) {
                console.error("Error fetching student details for chat drawer:", err);
                setWhatsappPhone(rawPhone);
            }
        };
        fetchStudent();
    }, [rawPhone]);

    // 1. Subscribe to real-time chat messages
    useEffect(() => {
        if (!ticketId) return;

        const q = query(
            collection(db, 'tickets', ticketId, 'chats'),
            orderBy('timestamp', 'asc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setMessages(msgs);
            setError(null);
            setTimeout(scrollToBottom, 50);
        }, (err) => {
            console.error('Firestore chat listener error:', err);
            setError('Failed to load conversation messages in real-time.');
        });

        return () => unsubscribe();
    }, [ticketId]);

    // Escape key handler for lightbox
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') setLightboxImage(null);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // ─── NOW the conditional render — after all hooks ───────────────────────
    if (isMaximized) {
        return (
            <WhatsAppConversationCenter
                complaint={complaint}
                onClose={onClose}
                onMinimize={() => setIsMaximized(false)}
            />
        );
    }

    // ─── HELPERS ────────────────────────────────────────────────────────────

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const handleSend = async (e) => {
        e.preventDefault();
        if (!newMessage.trim() || !ticketId || !studentPhone || studentPhone === 'N/A') return;

        setSending(true);
        setError(null);
        const textToSend = newMessage;
        setNewMessage('');

        try {
            const response = await sendWhatsAppMessage(ticketId, studentPhone, textToSend);
            if (!response.success) {
                setError(response.error || 'Failed to send message via WhatsApp.');
            }
        } catch (err) {
            setError(err.message || 'An error occurred while sending the message.');
        } finally {
            setSending(false);
            setTimeout(scrollToBottom, 50);
        }
    };

    const toggleAudio = (msgId) => {
        const audio = audioRefs.current[msgId];
        if (!audio) return;
        if (playingAudioId === msgId) {
            audio.pause();
            setPlayingAudioId(null);
        } else {
            if (playingAudioId && audioRefs.current[playingAudioId]) {
                audioRefs.current[playingAudioId].pause();
            }
            audio.play();
            setPlayingAudioId(msgId);
        }
    };

    const formatFileSize = (bytes) => {
        if (!bytes || bytes === 0) return '';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const renderStatusIcon = (status) => {
        switch (status) {
            case 'sending':  return <Clock size={12} className="text-slate-400 animate-pulse" />;
            case 'sent':     return <Check size={14} className="text-slate-400" />;
            case 'delivered':return <CheckCheck size={14} className="text-slate-400" />;
            case 'read':     return <CheckCheck size={14} className="text-blue-500" />;
            case 'failed':   return <AlertCircle size={14} className="text-red-500" />;
            default:         return null;
        }
    };

    const formatTime = (ts) => {
        if (!ts) return '';
        const date = ts.toDate ? ts.toDate() : new Date(ts);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const renderMessageContent = (msg) => {
        const isAdmin = msg.senderType === 'admin';

        // Image
        if (msg.messageType === 'image' && msg.mediaUrl) {
            return (
                <div className="relative group rounded-xl overflow-hidden mb-1.5 cursor-pointer max-w-[220px]">
                    <img
                        src={msg.mediaUrl}
                        alt="Media"
                        className="w-full h-auto object-cover max-h-[160px]"
                    />
                    <div
                        onClick={() => setLightboxImage(msg.mediaUrl)}
                        className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all"
                    >
                        <Eye size={20} className="text-white" />
                    </div>
                    {msg.caption && <p className="text-xs mt-1 px-1">{msg.caption}</p>}
                </div>
            );
        }

        // Audio / Voice
        if ((msg.messageType === 'audio' || msg.messageType === 'voice') && msg.mediaUrl) {
            return (
                <div className={clsx(
                    "flex items-center gap-2.5 rounded-xl p-2.5 mb-1.5 max-w-[220px]",
                    isAdmin ? "bg-slate-700" : "bg-slate-100 border border-slate-200"
                )}>
                    <audio
                        ref={el => audioRefs.current[msg.id] = el}
                        src={msg.mediaUrl}
                        onEnded={() => setPlayingAudioId(null)}
                        className="hidden"
                    />
                    <button
                        onClick={() => toggleAudio(msg.id)}
                        className="w-8 h-8 bg-green-500 hover:bg-green-600 rounded-full flex items-center justify-center text-white shrink-0"
                    >
                        {playingAudioId === msg.id ? <Pause size={12} /> : <Play size={12} className="ml-0.5" />}
                    </button>
                    <div className="flex items-end gap-0.5 h-5">
                        {[...Array(10)].map((_, i) => (
                            <span
                                key={i}
                                className={clsx(
                                    "w-[2.5px] rounded-full transition-all",
                                    playingAudioId === msg.id ? "animate-pulse bg-green-400" : isAdmin ? "bg-slate-500" : "bg-slate-300"
                                )}
                                style={{ height: `${Math.max(3, Math.sin(i * 0.8) * 12 + 8)}px` }}
                            />
                        ))}
                    </div>
                </div>
            );
        }

        // Document
        if (msg.messageType === 'document' && msg.mediaUrl) {
            return (
                <div className={clsx(
                    "flex items-center gap-2.5 rounded-xl p-2.5 mb-1.5 max-w-[240px]",
                    isAdmin ? "bg-slate-700" : "bg-slate-100 border border-slate-200"
                )}>
                    <div className={clsx("w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                        isAdmin ? "bg-slate-600" : "bg-slate-200")}>
                        <FileText size={16} className={isAdmin ? "text-slate-300" : "text-slate-600"} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate">{msg.fileName || 'document'}</p>
                        {msg.fileSize && <p className="text-[10px] opacity-60">{formatFileSize(msg.fileSize)}</p>}
                    </div>
                    <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer"
                        className={clsx("p-1.5 rounded-lg transition-colors shrink-0",
                            isAdmin ? "bg-slate-600 hover:bg-slate-500 text-slate-300" : "bg-white hover:bg-slate-50 border text-slate-600")}>
                        <Download size={12} />
                    </a>
                </div>
            );
        }

        // Location
        if (msg.messageType === 'location' && msg.latitude) {
            return (
                <a
                    href={`https://maps.google.com/?q=${msg.latitude},${msg.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={clsx(
                        "flex items-center gap-2 rounded-xl p-2.5 mb-1.5 max-w-[220px]",
                        isAdmin ? "bg-slate-700" : "bg-slate-100 border border-slate-200"
                    )}
                >
                    <MapPin size={16} className="text-green-500 shrink-0" />
                    <div>
                        <p className="text-xs font-bold">Location</p>
                        <p className="text-[10px] opacity-60">{msg.latitude?.toFixed(4)}, {msg.longitude?.toFixed(4)}</p>
                    </div>
                </a>
            );
        }

        return null; // falls through to text rendering
    };

    // ─── RENDER ─────────────────────────────────────────────────────────────
    return (
        <>
            <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[460px] bg-slate-50 border-l border-slate-200 shadow-2xl flex flex-col h-full">
                {/* Header */}
                <div className="px-6 py-5 border-b border-slate-200 bg-white flex items-center justify-between shadow-sm shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center text-green-600">
                            <User size={24} />
                        </div>
                        <div>
                            <h3 className="font-black text-slate-800 text-base leading-tight">{studentName}</h3>
                            <p className="text-xs font-bold text-slate-500 flex items-center gap-1.5 mt-0.5">
                                <Phone size={11} className="text-slate-400" /> {studentPhone}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => setIsMaximized(true)}
                            className="p-2.5 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-500 transition-colors border border-slate-200"
                            title="Maximize conversation center"
                        >
                            <Maximize2 size={16} />
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2.5 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-500 transition-colors border border-slate-200"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Sub-header Context Banner */}
                <div className="px-6 py-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-600 shrink-0">
                    <span className="flex items-center gap-1">
                        <Hash size={13} className="text-slate-400" /> Complaint ID: {ticketDisplayId}
                    </span>
                    <span className="bg-slate-200 px-2 py-0.5 rounded-md text-[10px] uppercase">WhatsApp Chat</span>
                </div>

                {/* Error Alert */}
                {error && (
                    <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700 text-xs font-bold shrink-0">
                        <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <p>{error}</p>
                            <button onClick={() => setError(null)} className="underline mt-1 hover:text-red-800 block">Dismiss</button>
                        </div>
                    </div>
                )}

                {/* Chat Messages */}
                <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-5 space-y-2.5">
                    {messages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center px-4">
                            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-4 border border-slate-200">
                                <User size={28} />
                            </div>
                            <h4 className="text-slate-700 font-black text-sm">No Messages Yet</h4>
                            <p className="text-slate-500 font-bold text-xs max-w-[240px] mt-1.5">
                                Start the conversation by typing a message below.
                            </p>
                        </div>
                    ) : (
                        messages.map((msg) => {
                            const isAdmin = msg.senderType === 'admin';
                            const isInternal = msg.senderType === 'internal';
                            const mediaContent = renderMessageContent(msg);

                            return (
                                <div
                                    key={msg.id}
                                    className={clsx(
                                        'flex flex-col max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm font-semibold shadow-sm',
                                        isInternal
                                            ? 'bg-amber-50 text-amber-900 border border-amber-200 self-center max-w-[90%] w-full'
                                            : isAdmin
                                                ? 'bg-slate-800 text-white rounded-tr-none ml-auto'
                                                : 'bg-white text-slate-800 rounded-tl-none mr-auto border border-slate-200'
                                    )}
                                >
                                    {isInternal && (
                                        <span className="text-[9px] font-bold text-amber-600 uppercase tracking-wider mb-1">🔒 Internal Note</span>
                                    )}

                                    {mediaContent}

                                    {/* Text content — always show for text type, show caption/fallback for others */}
                                    {(!msg.messageType || msg.messageType === 'text' || msg.messageType === 'reaction' || msg.messageType === 'contacts' || msg.messageType === 'interactive' || msg.messageType === 'note' || (!mediaContent && msg.message)) && (
                                        <p className="leading-relaxed whitespace-pre-wrap break-words text-sm">
                                            {msg.message}
                                        </p>
                                    )}

                                    {/* Timestamp + delivery status */}
                                    <div className={clsx(
                                        'flex items-center gap-1 text-[10px] mt-1 font-bold justify-end',
                                        isInternal ? 'text-amber-600' : isAdmin ? 'text-slate-300' : 'text-slate-400'
                                    )}>
                                        <span>{formatTime(msg.timestamp)}</span>
                                        {isAdmin && !isInternal && renderStatusIcon(msg.status)}
                                    </div>
                                </div>
                            );
                        })
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Message Input */}
                <form
                    onSubmit={handleSend}
                    className="p-5 border-t border-slate-200 bg-white flex items-center gap-3 shrink-0"
                >
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder={
                            studentPhone === 'N/A'
                                ? 'No phone number available'
                                : 'Type message on WhatsApp...'
                        }
                        disabled={sending || studentPhone === 'N/A'}
                        className="flex-1 px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-slate-800/20 focus:border-slate-800 disabled:opacity-50 disabled:bg-slate-100 transition-all text-slate-800 placeholder-slate-400"
                    />
                    <button
                        type="submit"
                        disabled={sending || !newMessage.trim() || studentPhone === 'N/A'}
                        className={clsx(
                            'p-3.5 bg-slate-800 hover:bg-slate-900 text-white rounded-2xl transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:hover:bg-slate-800 disabled:active:scale-100',
                            sending && 'animate-pulse'
                        )}
                    >
                        <Send size={18} />
                    </button>
                </form>
            </div>

            {/* Lightbox */}
            {lightboxImage && (
                <div
                    className="fixed inset-0 bg-slate-950/90 flex items-center justify-center z-[100]"
                    onClick={() => setLightboxImage(null)}
                >
                    <button
                        onClick={() => setLightboxImage(null)}
                        className="absolute top-6 right-6 p-2.5 bg-white/10 hover:bg-white/20 rounded-full text-white"
                    >
                        <X size={24} />
                    </button>
                    <img
                        src={lightboxImage}
                        alt="Full preview"
                        className="max-w-[90%] max-h-[90%] object-contain rounded-lg shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
        </>
    );
};

export default WhatsAppChatDrawer;
