import React, { useMemo } from 'react';
import Header from '../components/Header';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useWhatsAppNotifications } from '../context/WhatsAppNotificationContext';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, CheckCircle, Package, X, Trash2 } from 'lucide-react';
import clsx from 'clsx';

// ── Relative time helper ─────────────────────────────────────────────────────
function relativeTime(date) {
    if (!date) return '';
    const diffMs = Date.now() - new Date(date).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? 's' : ''} ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
}

// ── WhatsApp icon (SVG) ──────────────────────────────────────────────────────
const WhatsAppIcon = ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
);

// ─────────────────────────────────────────────────────────────────────────────

const Notifications = () => {
    const { ourPOs, warehouseStocks, stocks, loading } = useData();
    const { user } = useAuth();
    const navigate = useNavigate();
    const {
        whatsappNotifications,
        unreadWhatsAppCount,
        clearWhatsAppNotification,
        clearAllWhatsAppNotifications,
        markTicketRead,
    } = useWhatsAppNotifications();

    // Calculate overdue POs (more than 5 days old and not delivered), plus approval and rejection alerts
    const notifications = useMemo(() => {
        if (!ourPOs || ourPOs.length === 0) return [];

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Group POs by PO_ID to get unique POs
        const groupedPOs = {};
        ourPOs.forEach(po => {
            if (!groupedPOs[po.PO_ID]) {
                groupedPOs[po.PO_ID] = {
                    PO_ID: po.PO_ID,
                    Vendor_ID: po.Vendor_ID,
                    Created_Date: po.Created_Date,
                    Status: po.Status,
                    Items: []
                };
            }
            groupedPOs[po.PO_ID].Items.push(po);
            // Update status to worst case (Pending > Partial > Completed)
            if (po.Status === 'Pending') {
                groupedPOs[po.PO_ID].Status = 'Pending';
            } else if (po.Status === 'Partial' && groupedPOs[po.PO_ID].Status !== 'Pending') {
                groupedPOs[po.PO_ID].Status = 'Partial';
            }
        });

        const alerts = [];
        
        Object.values(groupedPOs).forEach(po => {
            // Skip completed POs for overdue alerts
            if (po.Status !== 'Completed') {
                const createdDate = new Date(po.Created_Date);
                if (!isNaN(createdDate.getTime())) {
                    createdDate.setHours(0, 0, 0, 0);
                    const daysDiff = Math.floor((today - createdDate) / (1000 * 60 * 60 * 24));
                    if (daysDiff > 5) {
                        alerts.push({
                            id: `overdue-${po.PO_ID}`,
                            type: 'overdue',
                            severity: daysDiff > 10 ? 'critical' : 'warning',
                            title: `PO ${po.PO_ID} is overdue`,
                            message: `This purchase order from ${po.Vendor_ID} was created ${daysDiff} days ago and has not been delivered yet.`,
                            vendor: po.Vendor_ID,
                            daysOverdue: daysDiff - 5,
                            totalDays: daysDiff,
                            status: po.Status,
                            itemCount: po.Items.length,
                            createdDate: po.Created_Date
                        });
                    }
                }
            }
        });

        // Add waiting approval and rejection alerts for managers/admins
        if (user?.role === 'manager' || user?.role === 'admin') {
            Object.values(groupedPOs).forEach(po => {
                if (po.Status === 'Waiting for Approval') {
                    alerts.push({
                        id: `awaiting-${po.PO_ID}`,
                        type: 'approval',
                        severity: 'warning',
                        title: `PO ${po.PO_ID} waiting for approval`,
                        message: `Purchase order ${po.PO_ID} from ${po.Vendor_ID} is awaiting verification by a manager.`,
                        poId: po.PO_ID,
                        vendor: po.Vendor_ID,
                        status: po.Status,
                        itemCount: po.Items.length,
                        createdDate: po.Created_Date
                    });
                }
                if (po.Status === 'Rejected') {
                    const reason = po.Items[0]?.Rejection_Reason || po.Rejection_Reason || '';
                    alerts.push({
                        id: `rejected-${po.PO_ID}`,
                        type: 'rejected',
                        severity: 'critical',
                        title: `PO ${po.PO_ID} rejected`,
                        message: `PO ${po.PO_ID} has been rejected.${reason ? ` Reason: ${reason}` : ''}`,
                        poId: po.PO_ID,
                        vendor: po.Vendor_ID,
                        status: po.Status,
                        itemCount: po.Items.length,
                        createdDate: po.Created_Date,
                        reason
                    });
                }
            });
        }

        // Create a map of caseLabel to expiry dates from warehouseStocks for quick lookup
        const expiryMap = {};
        if (warehouseStocks && warehouseStocks.length > 0) {
            warehouseStocks.forEach(item => {
                const caseLabel = item.caseLabel || item.Case_Label;
                if (caseLabel) {
                    expiryMap[caseLabel] = {
                        expd: item.EXPD || item.expd || item.Expiry || item.expiry,
                        mfd: item.MFD || item.mfd,
                        warehouseStockId: item.id || item.stockId,
                        availableUnits: item.availableUnits || item.Available_Units || 0
                    };
                }
            });
        }

        // Add expiry alerts from warehouseStocks directly
        if (warehouseStocks && warehouseStocks.length > 0) {
            const processedCaseLabels = new Set();
            
            warehouseStocks.forEach(caseItem => {
                const caseLabel = caseItem.caseLabel || caseItem.Case_Label;
                if (!caseLabel || processedCaseLabels.has(caseLabel)) return; // Skip if already processed
                processedCaseLabels.add(caseLabel);
                
                const expiryDate = caseItem.EXPD || caseItem.expd || caseItem.Expiry || caseItem.expiry;
                if (!expiryDate) return;

                const expDate = new Date(expiryDate);
                if (isNaN(expDate.getTime())) return;

                expDate.setHours(0, 0, 0, 0);
                const daysUntilExpiry = Math.floor((expDate - today) / (1000 * 60 * 60 * 24));

                if (daysUntilExpiry <= 10 && daysUntilExpiry >= 0) {
                    alerts.push({
                        id: `exp-${caseLabel}-warehouse`,
                        type: 'expiry',
                        severity: daysUntilExpiry <= 3 ? 'critical' : 'warning',
                        title: `Product expiring soon (Warehouse)`,
                        message: `${caseItem.productName || caseItem.Product_Name || 'Unknown Product'} - Case ${caseLabel} (${caseItem.availableUnits || caseItem.Available_Units || 0} units) expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}.`,
                        poId: caseItem.poId || caseItem.PO_ID,
                        productName: caseItem.productName || caseItem.Product_Name,
                        caseLabel: caseLabel,
                        availableUnits: caseItem.availableUnits || caseItem.Available_Units || 0,
                        expiryDate: expiryDate,
                        daysUntilExpiry: daysUntilExpiry,
                        source: 'warehouse'
                    });
                }
            });
        }

        // Add expiry alerts from stock batches (through caseLabel tracking)
        if (stocks && stocks.length > 0 && expiryMap) {
            const processedStockCases = new Set();
            
            stocks.forEach(stockItem => {
                const caseLabel = stockItem.caseLabel || stockItem.Case_Label;
                if (!caseLabel || processedStockCases.has(caseLabel)) return;
                processedStockCases.add(caseLabel);
                
                // Lookup expiry date from warehouse stocks via caseLabel
                const expiryInfo = expiryMap[caseLabel];
                if (!expiryInfo || !expiryInfo.expd) return;

                const expiryDate = expiryInfo.expd;
                const expDate = new Date(expiryDate);
                if (isNaN(expDate.getTime())) return;

                expDate.setHours(0, 0, 0, 0);
                const daysUntilExpiry = Math.floor((expDate - today) / (1000 * 60 * 60 * 24));

                if (daysUntilExpiry <= 10 && daysUntilExpiry >= 0) {
                    alerts.push({
                        id: `exp-${caseLabel}-batch`,
                        type: 'expiry',
                        severity: daysUntilExpiry <= 3 ? 'critical' : 'warning',
                        title: `Product expiring soon (Batch)`,
                        message: `${stockItem.product_name || 'Unknown Product'} - Case ${caseLabel} assigned to ${stockItem.Machine || 'Unknown'} (${expiryInfo.availableUnits || 0} units) expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}.`,
                        poId: stockItem.poId,
                        productName: stockItem.product_name,
                        caseLabel: caseLabel,
                        availableUnits: expiryInfo.availableUnits || 0,
                        expiryDate: expiryDate,
                        daysUntilExpiry: daysUntilExpiry,
                        batch: stockItem.Batch,
                        machine: stockItem.Machine,
                        source: 'batch'
                    });
                }
            });
        }

        // Add waiting approval alerts for managers/admins
        if (user?.role === 'manager' || user?.role === 'admin') {
            Object.values(groupedPOs).forEach(po => {
                if (po.Status === 'Waiting for Approval') {
                    alerts.push({
                        id: `awaiting-${po.PO_ID}`,
                        type: 'approval',
                        severity: 'warning',
                        title: `PO ${po.PO_ID} waiting for approval`,
                        message: `Purchase order ${po.PO_ID} from ${po.Vendor_ID} is awaiting verification by a manager.`,
                        poId: po.PO_ID,
                        vendor: po.Vendor_ID,
                        status: po.Status,
                        itemCount: po.Items.length,
                        createdDate: po.Created_Date
                    });
                }
                if (po.Status === 'Rejected') {
                    const reason = po.Items[0]?.Rejection_Reason || po.Rejection_Reason || '';
                    alerts.push({
                        id: `rejected-${po.PO_ID}`,
                        type: 'rejected',
                        severity: 'critical',
                        title: `PO ${po.PO_ID} rejected`,
                        message: `PO ${po.PO_ID} has been rejected.${reason ? ` Reason: ${reason}` : ''}`,
                        poId: po.PO_ID,
                        vendor: po.Vendor_ID,
                        status: po.Status,
                        itemCount: po.Items.length,
                        createdDate: po.Created_Date,
                        reason
                    });
                }
            });
        }

        // Sort by severity (critical first) then by days
        return alerts.sort((a, b) => {
            if (a.severity === 'critical' && b.severity !== 'critical') return -1;
            if (b.severity === 'critical' && a.severity !== 'critical') return 1;
            if (a.type === 'expiry' && b.type === 'overdue') return -1;
            if (b.type === 'expiry' && a.type === 'overdue') return 1;
            return (b.daysUntilExpiry || b.totalDays) - (a.daysUntilExpiry || a.totalDays);
        });
    }, [ourPOs, warehouseStocks, stocks]);

    // ── Click handler: navigate to Complaints and open chat drawer ───────────
    const handleWhatsAppNotifClick = async (notif) => {
        await markTicketRead(notif.ticketId);
        navigate('/complaints', {
            state: { openTicket: notif.ticketId, openChat: true },
        });
    };

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-auto bg-slate-50">
            <Header title="Notifications" subtitle="Alerts and important updates" />
            
            <div className="p-8">
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                                <AlertTriangle className="text-red-600" size={24} />
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-slate-800">
                                    {notifications.filter(n => n.severity === 'critical').length}
                                </div>
                                <div className="text-sm text-slate-500">Critical Alerts</div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center">
                                <Clock className="text-yellow-600" size={24} />
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-slate-800">
                                    {notifications.filter(n => n.severity === 'warning').length}
                                </div>
                                <div className="text-sm text-slate-500">Warnings</div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                                <Package className="text-purple-600" size={24} />
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-slate-800">
                                    {notifications.filter(n => n.type === 'expiry').length}
                                </div>
                                <div className="text-sm text-slate-500">Expiry Alerts</div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                                <Package className="text-orange-600" size={24} />
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-slate-800">{notifications.filter(n => n.type === 'overdue').length}</div>
                                <div className="text-sm text-slate-500">Overdue POs</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Notifications List */}
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-50">
                        <h3 className="font-semibold text-slate-800">All Notifications</h3>
                        <p className="text-sm text-slate-500 mt-1">Overdue POs and expiring products</p>
                    </div>
                    
                    {notifications.length === 0 ? (
                        <div className="px-6 py-12 text-center">
                            <CheckCircle className="mx-auto text-green-500 mb-4" size={48} />
                            <div className="text-lg font-medium text-slate-700">All caught up!</div>
                            <div className="text-sm text-slate-500 mt-1">No notifications at the moment</div>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {notifications.map((notification) => (
                                <div 
                                    key={notification.id} 
                                    className={clsx(
                                        "p-6 hover:bg-slate-50 transition-colors",
                                        notification.severity === 'critical' && "border-l-4 border-l-red-500",
                                        notification.severity === 'warning' && "border-l-4 border-l-yellow-500"
                                    )}
                                >
                                    <div className="flex items-start gap-4">
                                        <div className={clsx(
                                            "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                                            notification.severity === 'critical' ? "bg-red-100" : "bg-yellow-100"
                                        )}>
                                            {notification.type === 'expiry' ? (
                                                <Package 
                                                    size={20} 
                                                    className={notification.severity === 'critical' ? "text-red-600" : "text-yellow-600"} 
                                                />
                                            ) : (
                                                <AlertTriangle 
                                                    size={20} 
                                                    className={notification.severity === 'critical' ? "text-red-600" : "text-yellow-600"} 
                                                />
                                            )}
                                        </div>
                                        
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 mb-1">
                                                <span className="font-semibold text-slate-800">{notification.title}</span>
                                                <span className={clsx(
                                                    "px-2 py-0.5 rounded text-xs font-medium",
                                                    notification.severity === 'critical' 
                                                        ? "bg-red-100 text-red-700" 
                                                        : "bg-yellow-100 text-yellow-700"
                                                )}>
                                                    {notification.severity === 'critical' ? 'Critical' : 'Warning'}
                                                </span>
                                                {notification.type === 'overdue' && (
                                                    <span className={clsx(
                                                        "px-2 py-0.5 rounded text-xs font-medium",
                                                        notification.status === 'Partial' 
                                                            ? "bg-blue-100 text-blue-700" 
                                                            : "bg-orange-100 text-orange-700"
                                                    )}>
                                                        {notification.status}
                                                    </span>
                                                )}
                                                {notification.type === 'expiry' && notification.source && (
                                                    <span className={clsx(
                                                        "px-2 py-0.5 rounded text-xs font-medium",
                                                        notification.source === 'warehouse'
                                                            ? "bg-purple-100 text-purple-700"
                                                            : "bg-cyan-100 text-cyan-700"
                                                    )}>
                                                        {notification.source === 'warehouse' ? '📦 Warehouse' : '🎯 Batch'}
                                                    </span>
                                                )}
                                            </div>
                                            
                                            <p className="text-sm text-slate-600 mb-3">{notification.message}</p>
                                            
                                            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                                                {notification.type === 'overdue' ? (
                                                    <>
                                                        <span className="flex items-center gap-1">
                                                            <Package size={14} />
                                                            {notification.itemCount} item{notification.itemCount !== 1 ? 's' : ''}
                                                        </span>
                                                        <span className="flex items-center gap-1">
                                                            <Clock size={14} />
                                                            Created: {new Date(notification.createdDate).toLocaleDateString()}
                                                        </span>
                                                        <span className={clsx(
                                                            "font-medium",
                                                            notification.severity === 'critical' ? "text-red-600" : "text-yellow-600"
                                                        )}>
                                                            {notification.daysOverdue} day{notification.daysOverdue !== 1 ? 's' : ''} overdue
                                                        </span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span className="flex items-center gap-1">
                                                            <Package size={14} />
                                                            PO: {notification.poId || 'N/A'}
                                                        </span>
                                                        <span className="flex items-center gap-1">
                                                            <Clock size={14} />
                                                            Expires: {new Date(notification.expiryDate).toLocaleDateString()}
                                                        </span>
                                                        {notification.batch && (
                                                            <span className="flex items-center gap-1">
                                                                🎯 Batch: {notification.batch}
                                                            </span>
                                                        )}
                                                        {notification.machine && (
                                                            <span className="flex items-center gap-1">
                                                                🔧 Machine: {notification.machine}
                                                            </span>
                                                        )}
                                                        <span className={clsx(
                                                            "font-medium",
                                                            notification.severity === 'critical' ? "text-red-600" : "text-yellow-600"
                                                        )}>
                                                            {notification.daysUntilExpiry} day{notification.daysUntilExpiry !== 1 ? 's' : ''} left
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── WhatsApp Notifications Section ───────────────────────────── */}
                {whatsappNotifications.length > 0 && (
                    <div className="mt-8 bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-slate-50 flex items-center justify-between">
                            <div>
                                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                                    <span className="text-green-600"><WhatsAppIcon size={18} /></span>
                                    WhatsApp Messages
                                    {unreadWhatsAppCount > 0 && (
                                        <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-600">
                                            {unreadWhatsAppCount} unread
                                        </span>
                                    )}
                                </h3>
                                <p className="text-sm text-slate-500 mt-1">Incoming student WhatsApp messages</p>
                            </div>
                            <button
                                onClick={clearAllWhatsAppNotifications}
                                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-500 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50"
                                title="Clear all WhatsApp notifications"
                            >
                                <Trash2 size={13} />
                                Clear All
                            </button>
                        </div>

                        <div className="divide-y divide-slate-100">
                            {whatsappNotifications.map((notif) => (
                                <div
                                    key={notif.id}
                                    className={clsx(
                                        "p-5 hover:bg-slate-50 transition-colors cursor-pointer border-l-4",
                                        notif.read ? "border-l-transparent" : "border-l-green-500"
                                    )}
                                    onClick={() => handleWhatsAppNotifClick(notif)}
                                >
                                    <div className="flex items-start gap-4">
                                        {/* WhatsApp icon */}
                                        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 text-green-600">
                                            <WhatsAppIcon size={20} />
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                <span className="font-semibold text-slate-800">{notif.studentName}</span>
                                                {!notif.read && (
                                                    <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                                                )}
                                                <span className="text-xs text-slate-400 font-mono">{notif.ticketDisplayId}</span>
                                                <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                                                    {notif.issueType}
                                                </span>
                                                <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                                                    {notif.complaintStatus}
                                                </span>
                                            </div>

                                            {notif.messagePreview && (
                                                <p className="text-sm text-slate-600 mb-2 italic">
                                                    "{notif.messagePreview}"
                                                </p>
                                            )}

                                            <div className="flex items-center gap-3 text-xs text-slate-400">
                                                <span className="flex items-center gap-1">
                                                    <Clock size={12} />
                                                    {relativeTime(notif.timestamp)}
                                                </span>
                                                {notif.whatsappNumber && notif.whatsappNumber !== notif.mobileNumber && (
                                                    <span>WA: {notif.whatsappNumber}</span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Clear button */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                clearWhatsAppNotification(notif.id);
                                            }}
                                            className="flex-shrink-0 text-slate-300 hover:text-red-400 transition-colors p-1 rounded"
                                            title="Dismiss notification"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Notifications;
