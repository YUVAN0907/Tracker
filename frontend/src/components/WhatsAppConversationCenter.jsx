import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Send, Check, CheckCheck, AlertCircle, Phone, User, Hash, Clock,
  Search, Paperclip, Smile, Zap, Lock, Unlock, Image as ImageIcon, 
  FileText, Download, Play, Pause, MapPin, Eye, ArrowUp, Trash2, ArrowLeft, Maximize2, Minimize2
} from 'lucide-react';
import { db } from '../firebase';
import { 
  collection, query, orderBy, limit, onSnapshot, 
  getDocs, startAfter, doc, getDoc
} from 'firebase/firestore';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import clsx from 'clsx';
import './WhatsAppChat.css';

import { 
  sendWhatsAppMessage, 
  sendWhatsAppImage, 
  sendWhatsAppDocument,
  sendInternalNote 
} from '../utils/whatsappApi';

const WhatsAppConversationCenter = ({ complaint, onClose, onMinimize }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  
  // Pagination & Loading States
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastVisibleDoc, setLastVisibleDoc] = useState(null);
  
  // Feature Toggles & State
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isInternalMode, setIsInternalMode] = useState(false);
  
  // Attachments State
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]); // Array of { file, preview, type, id }
  const [uploadProgress, setUploadProgress] = useState(null); // Float percentage or null
  const [isDragging, setIsDragging] = useState(false);
  
  // Lightbox & Media Previews
  const [lightboxImage, setLightboxImage] = useState(null);
  
  // Quick Replies State
  const [showQuickReplies, setShowQuickReplies] = useState(false);

  // Audio Players Ref/State
  const [playingAudioId, setPlayingAudioId] = useState(null);
  const audioRefs = useRef({});

  // Refs for scrolling and click handlers
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const attachMenuRef = useRef(null);
  const quickRepliesRef = useRef(null);
  const fileInputRef = useRef(null);
  const docInputRef = useRef(null);

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
        console.error("Error fetching student details for conversation center:", err);
        setWhatsappPhone(rawPhone);
      }
    };
    fetchStudent();
  }, [rawPhone]);

  // Quick reply list
  const QUICK_REPLIES = [
    "Issue Resolved ✅",
    "Refund Processed 💰",
    "Technician Assigned 🔧",
    "Checking the Machine 🔍",
    "Sorry for the inconvenience 🙏",
    "We are looking into this ⏳"
  ];

  // 1. Subscribe to real-time chat messages (last 50 messages initially)
  useEffect(() => {
    if (!ticketId) return;

    setLoadingHistory(true);
    const q = query(
      collection(db, "tickets", ticketId, "chats"),
      orderBy("timestamp", "desc"),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs;
      if (docs.length > 0) {
        setLastVisibleDoc(docs[docs.length - 1]);
        if (docs.length < 50) {
          setHasMore(false);
        }
      } else {
        setHasMore(false);
      }

      // Reverse messages to display in chronological order
      const msgs = docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).reverse();

      setMessages(msgs);
      setLoadingHistory(false);
      setError(null);
      
      // Auto scroll to bottom
      setTimeout(scrollToBottom, 50);
    }, (err) => {
      console.error("Firestore real-time listener error:", err);
      setError("Failed to stream new messages.");
      setLoadingHistory(false);
    });

    return () => unsubscribe();
  }, [ticketId]);

  // Click outside handlers
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target)) {
        setShowEmojiPicker(false);
      }
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target)) {
        setShowAttachMenu(false);
      }
      if (quickRepliesRef.current && !quickRepliesRef.current.contains(e.target)) {
        setShowQuickReplies(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Escape key handler for lightbox
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setLightboxImage(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Scroll to bottom helper
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Load more messages (older) on scroll up
  const loadMoreMessages = async () => {
    if (!hasMore || loadingHistory || !lastVisibleDoc || !ticketId) return;

    setLoadingHistory(true);
    try {
      const q = query(
        collection(db, "tickets", ticketId, "chats"),
        orderBy("timestamp", "desc"),
        startAfter(lastVisibleDoc),
        limit(50)
      );

      const snapshot = await getDocs(q);
      const docs = snapshot.docs;
      
      if (docs.length > 0) {
        setLastVisibleDoc(docs[docs.length - 1]);
        if (docs.length < 50) {
          setHasMore(false);
        }

        const olderMsgs = docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })).reverse();

        // Prepend older messages
        setMessages(prev => [...olderMsgs, ...prev]);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error("Load more messages error:", err);
      setError("Failed to load older messages.");
    } finally {
      setLoadingHistory(false);
    }
  };

  // Handle Drag & Drop events
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    handleFileSelection(files);
  };

  // Process selected files (images / docs)
  const handleFileSelection = (files) => {
    const newFiles = files.map(file => {
      const isImage = file.type.startsWith('image/');
      const preview = isImage ? URL.createObjectURL(file) : null;
      return {
        file,
        preview,
        type: isImage ? 'image' : 'document',
        id: Math.random().toString(36).substring(2, 9),
        name: file.name,
        size: file.size
      };
    });
    setSelectedFiles(prev => [...prev, ...newFiles]);
  };

  // Remove attachment from selected list
  const removeFile = (id) => {
    setSelectedFiles(prev => {
      const target = prev.find(f => f.id === id);
      if (target && target.preview) {
        URL.revokeObjectURL(target.preview);
      }
      return prev.filter(f => f.id !== id);
    });
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

// Send message or multiple attachments
  const handleSend = async (e) => {
    e.preventDefault();
    const isTextEmpty = !newMessage.trim();
    const isAttachEmpty = selectedFiles.length === 0;

    if (isTextEmpty && isAttachEmpty) return;
    if (!ticketId || !studentPhone || studentPhone === 'N/A') return;

    setSending(true);
    setError(null);

    try {
      // 1. Check if we are in Internal Note mode
      if (isInternalMode) {
        if (!isTextEmpty) {
          const res = await sendInternalNote(ticketId, newMessage);
          if (res.success) {
            setNewMessage('');
          } else {
            setError(res.error || 'Failed to post internal note.');
          }
        }
        // Fall through to finally — setSending(false) is guaranteed
        return;
      }


      // 2. Outgoing WhatsApp text / media messages
      if (selectedFiles.length > 0) {
        // Send each attachment via the backend (which handles upload + send + Firestore)
        for (const attach of selectedFiles) {
          setUploadProgress(10); // Show progress feedback immediately
          
          let response;
          if (attach.type === 'image') {
            response = await sendWhatsAppImage(ticketId, studentPhone, attach.file, newMessage);
          } else {
            response = await sendWhatsAppDocument(ticketId, studentPhone, attach.file, newMessage);
          }

          setUploadProgress(100);

          if (!response.success) {
            throw new Error(response.error || `Failed to send ${attach.name}`);
          }
        }
        
        // Clear attachments & text
        setSelectedFiles([]);
        setNewMessage('');
        setUploadProgress(null);

      } else {
        // Simple text message
        const response = await sendWhatsAppMessage(ticketId, studentPhone, newMessage);
        if (response.success) {
          setNewMessage('');
        } else {
          setError(response.error || 'Failed to send message.');
        }
      }
    } catch (err) {
      console.error("Send message error:", err);
      setError(err.message || 'An error occurred while sending the message.');
    } finally {
      setSending(false);
      setUploadProgress(null);
      setTimeout(scrollToBottom, 50);
    }
  };

  // Audio play/pause controls
  const toggleAudio = (msgId, url) => {
    const currentAudio = audioRefs.current[msgId];
    if (!currentAudio) return;

    if (playingAudioId === msgId) {
      currentAudio.pause();
      setPlayingAudioId(null);
    } else {
      // Stop currently playing audio first
      if (playingAudioId && audioRefs.current[playingAudioId]) {
        audioRefs.current[playingAudioId].pause();
      }
      currentAudio.play();
      setPlayingAudioId(msgId);
    }
  };

  // Group messages by Date
  const groupMessagesByDate = (msgs) => {
    const groups = {};
    msgs.forEach(msg => {
      if (!msg.timestamp) return;
      const date = msg.timestamp.toDate ? msg.timestamp.toDate() : new Date(msg.timestamp);
      const dateString = date.toDateString();
      if (!groups[dateString]) {
        groups[dateString] = [];
      }
      groups[dateString].push(msg);
    });
    return groups;
  };

  // Format date label for dividers
  const formatDateLabel = (dateStr) => {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const msgDate = new Date(dateStr);
    if (msgDate.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (msgDate.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return msgDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    }
  };

  // Highlight search query helper
  const highlightSearchText = (text, queryStr) => {
    if (!queryStr) return text;
    const parts = text.split(new RegExp(`(${queryStr})`, 'gi'));
    return parts.map((part, index) => 
      part.toLowerCase() === queryStr.toLowerCase() 
        ? <span key={index} className="wa-search-highlight">{part}</span> 
        : part
    );
  };

  // Message filtering logic for search
  const filteredMessages = messages.filter(msg => {
    if (!searchQuery) return true;
    
    // Search text content
    const msgTextMatch = msg.message?.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Search sender name or phone
    const senderMatch = msg.senderType === 'admin' 
      ? 'admin'.includes(searchQuery.toLowerCase())
      : studentName.toLowerCase().includes(searchQuery.toLowerCase()) || studentPhone.includes(searchQuery);
    
    // Search message type
    const typeMatch = msg.messageType?.toLowerCase().includes(searchQuery.toLowerCase());
    
    return msgTextMatch || senderMatch || typeMatch;
  });

  // Delivery status ticks
  const renderStatusTicks = (status) => {
    switch (status) {
      case 'sending':
        return <Clock size={11} className="text-slate-400 animate-pulse" />;
      case 'sent':
        return <Check size={13} className="text-slate-400" />;
      case 'delivered':
        return <CheckCheck size={13} className="text-slate-400" />;
      case 'read':
        return <CheckCheck size={13} className="text-emerald-500 font-bold" />;
      case 'failed':
        return <AlertCircle size={13} className="text-red-500" />;
      default:
        return null;
    }
  };

  const formatMsgTime = (ts) => {
    if (!ts) return 'Just now';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Count search query matches
  const totalMatches = messages.reduce((count, msg) => {
    if (!searchQuery || !msg.message) return count;
    return count + (msg.message.toLowerCase().includes(searchQuery.toLowerCase()) ? 1 : 0);
  }, 0);

  const messageGroups = groupMessagesByDate(filteredMessages);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md wa-fullscreen-overlay"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag & Drop Overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-slate-800/80 border-4 border-dashed border-emerald-500 flex flex-col items-center justify-center text-white z-50 rounded-2xl animate-pulse">
          <ImageIcon size={48} className="text-emerald-400 mb-4" />
          <h3 className="text-xl font-bold">Drop files here to send</h3>
          <p className="text-slate-400 text-sm mt-1">Images, PDFs and documents are supported</p>
        </div>
      )}

      {/* Main Conversation Dialog */}
      <div className="w-full h-full max-h-[90vh] max-w-[1100px] bg-slate-50 border border-slate-200 rounded-3xl shadow-2xl flex flex-col overflow-hidden wa-fullscreen-container">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between shadow-sm shrink-0">
          <div className="flex items-center gap-3">
            {/* User Icon Avatar */}
            <div className="relative w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600">
              <User size={24} />
              <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full"></span>
            </div>
            <div>
              <h3 className="font-extrabold text-slate-800 text-base leading-tight">{studentName}</h3>
              <p className="text-xs font-bold text-slate-500 flex items-center gap-1.5 mt-0.5">
                <Phone size={11} className="text-slate-400" /> {studentPhone}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Search Toggle Button */}
            <button 
              onClick={() => {
                setShowSearch(!showSearch);
                setSearchQuery('');
              }}
              className={clsx(
                "p-2.5 rounded-xl text-slate-500 transition-colors hover:bg-slate-100 border",
                showSearch ? "bg-slate-100 border-slate-300" : "bg-white border-slate-200"
              )}
              title="Search conversation"
            >
              <Search size={18} />
            </button>

            {/* Minimize / Restore Button */}
            <button 
              onClick={onMinimize}
              className="p-2.5 bg-white hover:bg-slate-100 rounded-xl text-slate-500 transition-colors border border-slate-200"
              title="Minimize to side drawer"
            >
              <Minimize2 size={18} />
            </button>

            {/* Close Button */}
            <button 
              onClick={onClose}
              className="p-2.5 bg-red-50 hover:bg-red-100 rounded-xl text-red-600 transition-colors border border-red-200"
              title="Close chat"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Search Bar Panel */}
        {showSearch && (
          <div className="px-6 py-3 bg-white border-b border-slate-200 flex items-center gap-4 shrink-0 shadow-inner">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search messages by text, sender or type..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                autoFocus
              />
            </div>
            {searchQuery && (
              <span className="text-xs font-bold text-slate-500 whitespace-nowrap">
                {totalMatches} matches
              </span>
            )}
            <button 
              onClick={() => {
                setShowSearch(false);
                setSearchQuery('');
              }}
              className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
            >
              Clear
            </button>
          </div>
        )}

        {/* Context Banner */}
        <div className="px-6 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-600 shrink-0">
          <span className="flex items-center gap-1">
            <Hash size={13} className="text-slate-400" /> Complaint ID: {ticketDisplayId}
          </span>
          <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wide">
            Conversation Center
          </span>
        </div>

        {/* Messages Log Panel */}
        <div 
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto p-6 bg-slate-50 custom-scrollbar flex flex-col"
        >
          {/* Lazy Load Button */}
          {hasMore && (
            <button 
              onClick={loadMoreMessages} 
              disabled={loadingHistory}
              className="mx-auto my-3 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 text-xs font-bold rounded-2xl shadow-sm transition-all disabled:opacity-50"
            >
              {loadingHistory ? "Loading..." : "Load Older Messages"}
            </button>
          )}

          {messages.length === 0 ? (
            <div className="my-auto flex flex-col items-center justify-center text-center px-4">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-4 border border-slate-200">
                <User size={28} />
              </div>
              <h4 className="text-slate-700 font-extrabold text-sm">No Messages Match</h4>
              <p className="text-slate-500 font-bold text-xs max-w-[240px] mt-1.5">
                Type a search query above or send a message to start conversing.
              </p>
            </div>
          ) : (
            Object.keys(messageGroups).map((dateStr) => (
              <React.Fragment key={dateStr}>
                {/* Date Divider */}
                <div className="wa-date-separator">
                  <span className="wa-date-label">{formatDateLabel(dateStr)}</span>
                </div>

                {messageGroups[dateStr].map((msg) => {
                  const isAdmin = msg.senderType === 'admin';
                  const isInternal = msg.senderType === 'internal';
                  
                  return (
                    <div 
                      key={msg.id}
                      className={clsx(
                        "my-1.5 flex flex-col max-w-[80%] rounded-2xl px-4 py-3 text-sm font-semibold shadow-sm wa-message-enter",
                        isInternal 
                          ? "bg-amber-50 text-amber-900 border border-amber-200 self-center max-w-[90%]" 
                          : isAdmin
                            ? "bg-slate-800 text-white rounded-tr-none ml-auto"
                            : "bg-white text-slate-800 rounded-tl-none mr-auto border border-slate-200"
                      )}
                    >
                      {/* Internal Note Indicator Header */}
                      {isInternal && (
                        <div className="flex items-center gap-1 text-[10px] text-amber-600 font-bold uppercase tracking-wider mb-1">
                          <Lock size={10} /> Internal Note
                        </div>
                      )}

                      {/* --- Image Message --- */}
                      {msg.messageType === 'image' && msg.mediaUrl && (
                        <div className="relative group rounded-xl overflow-hidden mb-2 cursor-pointer border border-slate-200 max-w-[280px]">
                          <img 
                            src={msg.mediaUrl} 
                            alt="Media item" 
                            className="w-full h-auto object-cover max-h-[220px]" 
                          />
                          <div 
                            onClick={() => setLightboxImage(msg.mediaUrl)}
                            className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all"
                          >
                            <Eye size={24} className="text-white" />
                          </div>
                        </div>
                      )}

                      {/* --- Document Message --- */}
                      {msg.messageType === 'document' && msg.mediaUrl && (
                        <div className="flex items-center gap-3 bg-slate-100 border rounded-xl p-3 mb-2 max-w-[320px] text-slate-800">
                          <div className="w-10 h-10 bg-slate-200 rounded-lg flex items-center justify-center text-slate-600 shrink-0">
                            <FileText size={20} />
                          </div>
                          <div className="flex-1 overflow-hidden">
                            <p className="text-xs font-bold truncate">{msg.fileName || 'document.pdf'}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">{msg.fileSize ? formatFileSize(msg.fileSize) : 'Download file'}</p>
                          </div>
                          <a 
                            href={msg.mediaUrl} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="p-1.5 bg-white hover:bg-slate-50 border rounded-lg text-slate-600 hover:text-slate-800 transition-colors"
                          >
                            <Download size={14} />
                          </a>
                        </div>
                      )}

                      {/* --- Audio Player Message --- */}
                      {(msg.messageType === 'audio' || msg.messageType === 'voice') && msg.mediaUrl && (
                        <div className="flex items-center gap-3 bg-slate-100 border rounded-xl p-2.5 mb-2 max-w-[280px] text-slate-800">
                          <button 
                            onClick={() => toggleAudio(msg.id, msg.mediaUrl)}
                            className="w-9 h-9 bg-emerald-500 hover:bg-emerald-600 rounded-full flex items-center justify-center text-white shrink-0 transition-colors shadow-sm"
                          >
                            {playingAudioId === msg.id ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
                          </button>
                          
                          <div className="flex-1">
                            <audio 
                              ref={el => audioRefs.current[msg.id] = el}
                              src={msg.mediaUrl} 
                              onEnded={() => setPlayingAudioId(null)}
                              className="hidden"
                            />
                            {/* Static Audio Waveform Simulation */}
                            <div className="flex items-end gap-0.5 h-6 px-1">
                              {[...Array(14)].map((_, i) => (
                                <span 
                                  key={i} 
                                  className={clsx(
                                    "w-[3px] bg-slate-300 rounded-full transition-all",
                                    playingAudioId === msg.id ? "animate-pulse bg-emerald-500" : ""
                                  )}
                                  style={{ height: `${Math.max(4, Math.sin(i) * 16 + 10)}px` }}
                                ></span>
                              ))}
                            </div>
                            <span className="text-[9px] text-slate-400 mt-1 block">Audio Clip</span>
                          </div>
                        </div>
                      )}

                      {/* --- Location Message --- */}
                      {msg.messageType === 'location' && msg.latitude && (
                        <div className="mb-2 max-w-[280px]">
                          <a 
                            href={`https://maps.google.com/?q=${msg.latitude},${msg.longitude}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center gap-2.5 p-3 bg-slate-100 border rounded-xl hover:bg-slate-200 transition-colors text-slate-800"
                          >
                            <MapPin size={20} className="text-emerald-500 shrink-0" />
                            <div className="flex-1 overflow-hidden">
                              <p className="text-xs font-bold">Coordinates Location</p>
                              <p className="text-[10px] text-slate-500 mt-0.5 truncate">{msg.latitude}, {msg.longitude}</p>
                            </div>
                          </a>
                        </div>
                      )}

                      {/* Message Text Content */}
                      <p className="leading-relaxed whitespace-pre-wrap break-words">
                        {highlightSearchText(msg.message, searchQuery)}
                      </p>

                      {/* Metadata Timestamp & Status */}
                      <div 
                        className={clsx(
                          "flex items-center gap-1 text-[10px] mt-1.5 font-bold justify-end",
                          isInternal 
                            ? "text-amber-600" 
                            : isAdmin 
                              ? "text-slate-300" 
                              : "text-slate-400"
                        )}
                      >
                        <span>{formatMsgTime(msg.timestamp)}</span>
                        {isAdmin && !isInternal && renderStatusTicks(msg.status)}
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Attachments Preview Area */}
        {selectedFiles.length > 0 && (
          <div className="px-6 py-4 bg-slate-100 border-t border-slate-200 flex flex-wrap gap-3 shrink-0 max-h-[140px] overflow-y-auto">
            {selectedFiles.map((item) => (
              <div key={item.id} className="relative w-20 h-20 bg-white border border-slate-200 rounded-xl overflow-hidden flex items-center justify-center group shadow-sm">
                {item.type === 'image' ? (
                  <img src={item.preview} alt="Upload preview" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center justify-center p-2 text-center">
                    <FileText size={24} className="text-slate-400" />
                    <span className="text-[8px] font-bold text-slate-500 truncate w-16 mt-1">{item.name}</span>
                  </div>
                )}
                
                {/* Trash delete file button */}
                <button 
                  onClick={() => removeFile(item.id)}
                  className="absolute top-1 right-1 p-1 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Upload Progress Bar */}
        {uploadProgress !== null && (
          <div className="w-full bg-slate-200 h-1.5 shrink-0">
            <div 
              className="bg-emerald-500 h-full transition-all duration-300 progress-striped"
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
        )}

        {/* Errors Banner */}
        {error && (
          <div className="mx-6 mt-3 p-3.5 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700 text-xs font-bold shrink-0 animate-in fade-in">
            <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p>{error}</p>
              <button onClick={() => setError(null)} className="underline mt-1 hover:text-red-800 block">Dismiss</button>
            </div>
          </div>
        )}

        {/* Input Bar & Actions Panel */}
        <div className="p-4 border-t border-slate-200 bg-white flex flex-col gap-2 shrink-0">
          
          <div className="flex items-center justify-between shrink-0 px-1">
            <div className="flex items-center gap-1.5">
              
              {/* Emoji Picker Trigger */}
              <div className="relative" ref={emojiPickerRef}>
                <button 
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className={clsx(
                    "p-2 bg-slate-50 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors border",
                    showEmojiPicker ? "bg-slate-100 text-slate-800" : "border-slate-200"
                  )}
                  title="Emoji"
                >
                  <Smile size={18} />
                </button>
                {showEmojiPicker && (
                  <div className="absolute bottom-12 left-0 z-[70] shadow-2xl wa-emoji-picker-container">
                    <Picker 
                      data={data} 
                      onEmojiSelect={(emoji) => setNewMessage(prev => prev + emoji.native)}
                      theme="light"
                      previewPosition="none"
                      skinTonePosition="none"
                    />
                  </div>
                )}
              </div>

              {/* Attachment Dropdown Trigger */}
              <div className="relative" ref={attachMenuRef}>
                <button 
                  type="button"
                  onClick={() => setShowAttachMenu(!showAttachMenu)}
                  className={clsx(
                    "p-2 bg-slate-50 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors border",
                    showAttachMenu ? "bg-slate-100 text-slate-800" : "border-slate-200"
                  )}
                  title="Attach file"
                >
                  <Paperclip size={18} />
                </button>
                
                {showAttachMenu && (
                  <div className="absolute bottom-12 left-0 z-50 bg-white border border-slate-200 rounded-2xl shadow-xl p-2.5 flex flex-col gap-1.5 min-w-[150px]">
                    <button 
                      onClick={() => {
                        fileInputRef.current?.click();
                        setShowAttachMenu(false);
                      }}
                      className="flex items-center gap-2 px-3 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 rounded-xl transition-colors"
                    >
                      <ImageIcon size={16} className="text-emerald-500" /> Send Image
                    </button>
                    <button 
                      onClick={() => {
                        docInputRef.current?.click();
                        setShowAttachMenu(false);
                      }}
                      className="flex items-center gap-2 px-3 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 rounded-xl transition-colors"
                    >
                      <FileText size={16} className="text-blue-500" /> Send Document
                    </button>
                  </div>
                )}
              </div>

              {/* Quick Replies Toggle */}
              <div className="relative" ref={quickRepliesRef}>
                <button 
                  type="button"
                  onClick={() => setShowQuickReplies(!showQuickReplies)}
                  className={clsx(
                    "p-2 bg-slate-50 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors border",
                    showQuickReplies ? "bg-slate-100 text-slate-800" : "border-slate-200"
                  )}
                  title="Quick replies"
                >
                  <Zap size={18} />
                </button>

                {showQuickReplies && (
                  <div className="absolute bottom-12 left-0 z-50 bg-white border border-slate-200 rounded-2xl shadow-xl p-3 flex flex-col gap-1.5 min-w-[230px] max-h-[250px] overflow-y-auto custom-scrollbar">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1 px-1">Quick Templates</p>
                    {QUICK_REPLIES.map((reply, i) => (
                      <button 
                        key={i}
                        onClick={() => {
                          setNewMessage(prev => prev + (prev.endsWith(' ') || prev === '' ? '' : ' ') + reply);
                          setShowQuickReplies(false);
                        }}
                        className="text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 px-3 py-2 rounded-xl transition-colors truncate"
                      >
                        {reply}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Hidden File Inputs */}
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                multiple
                onChange={(e) => handleFileSelection(Array.from(e.target.files))}
              />
              <input 
                type="file" 
                ref={docInputRef} 
                className="hidden" 
                accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" 
                multiple
                onChange={(e) => handleFileSelection(Array.from(e.target.files))}
              />
            </div>

            {/* Internal Mode Toggle Switch */}
            <button 
              type="button"
              onClick={() => setIsInternalMode(!isInternalMode)}
              className={clsx(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors",
                isInternalMode 
                  ? "bg-amber-50 text-amber-700 border-amber-300 shadow-sm" 
                  : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
              )}
              title="Toggle Internal Admin Note"
            >
              {isInternalMode ? <Lock size={13} /> : <Unlock size={13} />}
              <span>{isInternalMode ? "Internal Mode" : "Public Chat"}</span>
            </button>
          </div>

          <form 
            onSubmit={handleSend}
            className="flex items-center gap-3 shrink-0"
          >
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={
                studentPhone === 'N/A'
                  ? "No phone number available"
                  : isInternalMode 
                    ? "Type internal note... (visible only to admins)"
                    : "Type message on WhatsApp..."
              }
              rows={1}
              disabled={sending || studentPhone === 'N/A'}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e);
                }
              }}
              className={clsx(
                "flex-1 px-5 py-3.5 bg-slate-50 border rounded-2xl text-sm font-semibold focus:outline-none focus:ring-2 disabled:opacity-50 disabled:bg-slate-100 transition-all text-slate-800 placeholder-slate-400 custom-scrollbar resize-none max-h-[120px] leading-relaxed",
                isInternalMode 
                  ? "border-amber-300 focus:ring-amber-500/20 focus:border-amber-500" 
                  : "border-slate-200 focus:ring-emerald-500/20 focus:border-emerald-500"
              )}
            />
            
            <button
              type="submit"
              disabled={sending || (newMessage.trim() === '' && selectedFiles.length === 0) || studentPhone === 'N/A'}
              className={clsx(
                "p-3.5 text-white rounded-2xl transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:active:scale-100 shrink-0",
                isInternalMode
                  ? "bg-amber-500 hover:bg-amber-600 disabled:hover:bg-amber-500"
                  : "bg-emerald-600 hover:bg-emerald-700 disabled:hover:bg-emerald-600",
                sending && "animate-pulse"
              )}
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      </div>

      {/* Full-screen Lightbox Overlay */}
      {lightboxImage && (
        <div 
          className="fixed inset-0 bg-slate-950/90 flex items-center justify-center z-[80] wa-lightbox"
          onClick={() => setLightboxImage(null)}
        >
          <button 
            onClick={() => setLightboxImage(null)}
            className="absolute top-6 right-6 p-2.5 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
          >
            <X size={24} />
          </button>
          <img 
            src={lightboxImage} 
            alt="Fullscreen preview" 
            className="max-w-[90%] max-h-[90%] object-contain rounded-lg shadow-2xl"
          />
        </div>
      )}
    </div>
  );
};

export default WhatsAppConversationCenter;
