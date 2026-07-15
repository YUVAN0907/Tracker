import React, { useMemo } from 'react';
import Header from '../components/Header';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { AlertTriangle, Clock, CheckCircle, Package } from 'lucide-react';
import clsx from 'clsx';

const Notifications = () => {
    const { ourPOs, warehouseStocks, stocks, loading } = useData();
    const { user } = useAuth();

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
            </div>
        </div>
    );
};

export default Notifications;
