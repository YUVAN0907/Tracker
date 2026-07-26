import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Bell, User, ChevronDown, LogOut, Lock, X, MessageCircle, CheckCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useWhatsAppNotifications } from '../context/WhatsAppNotificationContext';
import ChangePasswordModal from './ChangePasswordModal';

// ── WhatsApp SVG icon ─────────────────────────────────────────────────────────
const WAIcon = ({ size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
);

// ── Relative-time helper ──────────────────────────────────────────────────────
function relTime(date) {
    if (!date) return '';
    const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    const m = Math.floor(diff / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

const Header = ({ title, subtitle }) => {
    const { ourPOs, warehouseStocks, stocks } = useData();
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const {
        whatsappNotifications,
        unreadWhatsAppCount,
        clearWhatsAppNotification,
        clearAllWhatsAppNotifications,
        markTicketRead,
    } = useWhatsAppNotifications();

    const [showUserMenu, setShowUserMenu]             = useState(false);
    const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
    const [showWANotifPanel, setShowWANotifPanel]     = useState(false);
    const [toasts, setToasts]                         = useState([]);
    const toastIdRef  = useRef(0);
    const menuRef     = useRef(null);
    const waNotifRef  = useRef(null);

    // ── Toast helpers ─────────────────────────────────────────────────────────
    const addToast = (toast) => {
        const id = ++toastIdRef.current;
        setToasts(prev => [{ id, ...toast }, ...prev]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), toast.duration || 6000);
    };
    const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));

    // ── Existing PO & System Notification Count (UNCHANGED) ────────────────────
    const notificationCount = useMemo(() => {
        if (!ourPOs || ourPOs.length === 0) return 0;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const overduePOIds  = new Set();
        const approvalPOIds = new Set();
        ourPOs.forEach(po => {
            if (po.Status === 'Completed') return;
            const cd = new Date(po.Created_Date);
            if (!isNaN(cd.getTime())) {
                cd.setHours(0, 0, 0, 0);
                if (Math.floor((today - cd) / 86400000) > 5) overduePOIds.add(po.PO_ID);
            }
            if ((user?.role === 'manager' || user?.role === 'admin') && po.Status === 'Waiting for Approval')
                approvalPOIds.add(po.PO_ID);
        });
        return overduePOIds.size + approvalPOIds.size;
    }, [ourPOs, user]);

    // ── Login-time pop-ups (existing logic, unchanged) ────────────────────────
    const prevUserRef = useRef(null);
    useEffect(() => {
        if (!user || prevUserRef.current) { prevUserRef.current = user; return; }
        prevUserRef.current = user;

        let criticalCount = 0;
        const today = new Date(); today.setHours(0, 0, 0, 0);

        if (ourPOs?.length > 0) {
            const critPOs = new Set();
            ourPOs.forEach(po => {
                if (po.Status === 'Rejected') { critPOs.add(po.PO_ID); return; }
                const cd = new Date(po.Created_Date);
                if (!isNaN(cd.getTime())) {
                    cd.setHours(0, 0, 0, 0);
                    if (Math.floor((today - cd) / 86400000) > 10) critPOs.add(po.PO_ID);
                }
            });
            criticalCount += critPOs.size;
        }
        if (warehouseStocks?.length > 0) {
            const critExp = new Set();
            warehouseStocks.forEach(item => {
                const exp = item.EXPD || item.expd || item.Expiry || item.expiry;
                if (!exp) return;
                const ed = new Date(exp); if (isNaN(ed.getTime())) return;
                ed.setHours(0, 0, 0, 0);
                const days = Math.floor((ed - today) / 86400000);
                if (days <= 3 && days >= 0) critExp.add(item.caseLabel || item.Case_Label || item.id);
            });
            criticalCount += critExp.size;
        }

        let approvalCount = 0;
        if ((user?.role === 'manager' || user?.role === 'admin') && ourPOs?.length > 0) {
            const waiting = new Set();
            ourPOs.forEach(po => { if (po.Status === 'Waiting for Approval') waiting.add(po.PO_ID); });
            approvalCount = waiting.size;
        }

        const toastEntries = [];
        if (criticalCount > 0) toastEntries.push({ title: 'Critical Alerts', message: `${criticalCount} critical alert${criticalCount > 1 ? 's' : ''}`, route: '/notifications', severity: 'critical' });
        if (approvalCount > 0) toastEntries.push({ title: 'Approvals Pending', message: `${approvalCount} purchase order${approvalCount > 1 ? 's' : ''} awaiting approval`, route: '/po-approval', severity: 'warning' });
        toastEntries.forEach(t => addToast(t));
    }, [user, ourPOs, warehouseStocks, stocks]);

    const handleToastClick = (toast) => { if (toast.route) navigate(toast.route); removeToast(toast.id); };

    // ── Close menus on outside click ──────────────────────────────────────────
    useEffect(() => {
        const handler = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) setShowUserMenu(false);
            if (waNotifRef.current && !waNotifRef.current.contains(e.target)) setShowWANotifPanel(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleLogout = async () => { await logout(); navigate('/login'); };

    // ── WhatsApp notification click → navigate to complaints & open chat ─────
    const handleWANotifClick = async (notif) => {
        setShowWANotifPanel(false);
        await markTicketRead(notif.ticketId);
        navigate('/complaints', { state: { openTicket: notif.ticketId, openChat: true } });
    };

    // Unread WhatsApp messages (newest first)
    const unreadWA = whatsappNotifications.filter(n => !n.read);

    return (
        <header className="h-20 bg-white border-b border-slate-100 px-8 flex items-center justify-between sticky top-0 z-10">
            <div>
                <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
                {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
            </div>

            <div className="flex items-center gap-4">

                {/* ── 1. SEPARATE WHATSAPP NOTIFICATION BUTTON & PANEL ──────────── */}
                <div ref={waNotifRef} className="relative">
                    <button
                        id="header-whatsapp-notification-button"
                        onClick={() => setShowWANotifPanel(v => !v)}
                        className={`relative p-2 rounded-full transition-colors ${
                            unreadWhatsAppCount > 0
                                ? 'text-green-600 bg-green-50 hover:bg-green-100'
                                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                        }`}
                        title="WhatsApp Messages"
                    >
                        <WAIcon size={20} />
                        {unreadWhatsAppCount > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-green-500 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold text-white px-1">
                                {unreadWhatsAppCount > 9 ? '9+' : unreadWhatsAppCount}
                            </span>
                        )}
                    </button>

                    {/* ── WhatsApp Notifications Dropdown ─────────────────────── */}
                    {showWANotifPanel && (
                        <div
                            id="header-whatsapp-notification-panel"
                            className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden"
                            style={{ maxHeight: '80vh' }}
                        >
                            {/* Panel Header */}
                            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-green-50">
                                <span className="text-sm font-semibold text-green-800 flex items-center gap-2">
                                    <WAIcon size={16} />
                                    WhatsApp Messages
                                    {unreadWhatsAppCount > 0 && (
                                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-green-600 text-white">
                                            {unreadWhatsAppCount} unread
                                        </span>
                                    )}
                                </span>
                                <div className="flex items-center gap-2">
                                    {unreadWA.length > 0 && (
                                        <button
                                            onClick={async () => { await clearAllWhatsAppNotifications(); }}
                                            className="text-xs text-green-700 hover:text-red-600 transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-white"
                                            title="Clear all WhatsApp notifications"
                                        >
                                            <CheckCheck size={13} />
                                            Clear all
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setShowWANotifPanel(false)}
                                        className="text-slate-400 hover:text-slate-600 p-1 rounded transition-colors"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            </div>

                            {/* Unread WhatsApp List */}
                            <div className="overflow-y-auto" style={{ maxHeight: 'calc(80vh - 52px)' }}>
                                {unreadWA.length > 0 ? (
                                    <div className="divide-y divide-slate-100">
                                        {unreadWA.map(notif => (
                                            <div
                                                key={notif.id}
                                                className="flex items-start gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors cursor-pointer border-l-4 border-l-green-500"
                                                onClick={() => handleWANotifClick(notif)}
                                            >
                                                {/* WhatsApp Avatar */}
                                                <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 text-green-600">
                                                    <WAIcon size={18} />
                                                </div>

                                                {/* Content */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                                                        <span className="text-sm font-semibold text-slate-800 truncate">
                                                            {notif.studentName}
                                                        </span>
                                                        <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                                                        <span className="text-[11px] text-slate-400 font-mono">
                                                            {notif.ticketDisplayId}
                                                        </span>
                                                    </div>
                                                    {notif.messagePreview && (
                                                        <p className="text-xs text-slate-600 truncate italic mb-1">
                                                            "{notif.messagePreview}"
                                                        </p>
                                                    )}
                                                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                                                        <MessageCircle size={10} />
                                                        <span>{notif.issueType}</span>
                                                        <span>·</span>
                                                        <span>{relTime(notif.timestamp)}</span>
                                                    </div>
                                                </div>

                                                {/* Clear/Dismiss item */}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        clearWhatsAppNotification(notif.id);
                                                    }}
                                                    className="flex-shrink-0 text-slate-300 hover:text-red-500 transition-colors p-1 rounded"
                                                    title="Clear notification"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="px-4 py-8 text-center">
                                        <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-2 text-green-500">
                                            <WAIcon size={20} />
                                        </div>
                                        <p className="text-sm font-medium text-slate-700">No new WhatsApp messages</p>
                                        <p className="text-xs text-slate-400 mt-1">All student replies have been seen</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── 2. ORIGINAL PO & SYSTEM NOTIFICATION BELL (UNCHANGED) ────── */}
                <Link
                    to="/notifications"
                    className="relative text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-50 transition-colors"
                    title="System & PO Notifications"
                >
                    <Bell size={20} />
                    {notificationCount > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold text-white px-1">
                            {notificationCount > 9 ? '9+' : notificationCount}
                        </span>
                    )}
                </Link>

                {/* ── 3. USER MENU ──────────────────────────────────────────────── */}
                <div ref={menuRef} className="relative">
                    <button
                        onClick={() => setShowUserMenu(!showUserMenu)}
                        className="flex items-center gap-3 pl-4 border-l border-slate-200 cursor-pointer hover:bg-slate-50 px-3 py-2 rounded-lg transition-colors"
                    >
                        <div className="w-9 h-9 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 font-bold text-sm">
                            {user?.fullName?.charAt(0).toUpperCase() || 'AU'}
                        </div>
                        <div className="hidden md:block">
                            <div className="text-sm font-medium text-slate-700">{user?.fullName || 'Admin User'}</div>
                        </div>
                        <ChevronDown size={16} className={`text-slate-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
                    </button>

                    {showUserMenu && (
                        <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-200 z-50">
                            <div className="p-4 border-b border-slate-100">
                                <p className="text-sm font-medium text-slate-700">{user?.fullName || 'Admin User'}</p>
                                <p className="text-xs text-slate-500 mt-1">{user?.email}</p>
                            </div>
                            {user?.role === 'admin' && (
                                <div className="p-2">
                                    <Link
                                        to="/users"
                                        onClick={() => setShowUserMenu(false)}
                                        className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-md flex items-center gap-2 transition-colors"
                                    >
                                        <User size={16} />
                                        User Management
                                    </Link>
                                </div>
                            )}
                            <div className="p-2">
                                <button
                                    onClick={() => { setShowChangePasswordModal(true); setShowUserMenu(false); }}
                                    className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-md flex items-center gap-2 transition-colors"
                                >
                                    <Lock size={16} />
                                    Change Password
                                </button>
                            </div>
                            <div className="border-t border-slate-100 p-2">
                                <button
                                    onClick={() => { setShowUserMenu(false); handleLogout(); }}
                                    className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md flex items-center gap-2 transition-colors"
                                >
                                    <LogOut size={16} />
                                    Logout
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {showChangePasswordModal && (
                <ChangePasswordModal onClose={() => setShowChangePasswordModal(false)} />
            )}

            {/* Toast stack */}
            <div className="fixed top-6 right-6 z-50 flex flex-col gap-3">
                {toasts.map(t => (
                    <div
                        key={t.id}
                        onClick={() => handleToastClick(t)}
                        className={`cursor-pointer w-80 max-w-full p-3 rounded-lg shadow-lg border flex items-start gap-3 ${t.severity === 'critical' ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'}`}
                    >
                        <div className="flex-1">
                            <div className="text-sm font-semibold text-slate-800">{t.title}</div>
                            <div className="text-xs text-slate-600 mt-1">{t.message}</div>
                        </div>
                        <div className="text-xs text-slate-400">Open</div>
                    </div>
                ))}
            </div>
        </header>
    );
};
export default Header;
