import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { useData } from '../context/DataContext';
import { AlertTriangle, Package, CheckCircle, Search, Plus, X, Box, Trash2, Save } from 'lucide-react';
import clsx from 'clsx';

const KPI = ({ title, value, icon: Icon, colorClass }) => (
    <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
        <div className={clsx("p-3 rounded-lg", colorClass)}>
            <Icon size={24} />
        </div>
        <div className="text-right">
            <div className="text-sm text-slate-500 font-medium">{title}</div>
            <div className="text-3xl font-bold text-slate-800 mt-1">{value}</div>
        </div>
    </div>
);

const MachineOut = () => {
    const navigate = useNavigate();
    const { stocks = [], loading, refreshData } = useData();
    const [notification, setNotification] = useState(null);
    const [editingCells, setEditingCells] = useState({}); // Track which cells are being edited
    const [changedData, setChangedData] = useState({}); // Track changed values
    const [saving, setSaving] = useState(false);
    
    // ✅ NEW: Filter state for Machine Out table
    const [batchFilterMO, setBatchFilterMO] = useState('');
    const [dateFilterMO, setDateFilterMO] = useState('');
    const [productFilterMO, setProductFilterMO] = useState('');
    
    // Use same API URL logic as DataContext for consistency
    const isLocalhost = typeof window !== 'undefined' && (
        window.location.hostname === 'localhost' || 
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.startsWith('192.168')
    );
    const API_URL = isLocalhost 
        ? 'http://localhost:3002/api'
        : (import.meta.env.VITE_API_URL || 'https://vendbees-inventory-backend-333114755202.asia-south1.run.app/api');

    if (loading) return null;

    // Calculate KPIs
    const totalBatches = stocks && Array.isArray(stocks) ? new Set(stocks.map(s => (s.batch || s.Batch || '').toString().trim()).filter(b => b)).size : 0;
    const activeBatches = stocks && Array.isArray(stocks) ? new Set(stocks.filter(s => (s.Status || s.status) === 'Active' && (s.Batch || s.batch)).map(s => (s.Batch || s.batch))).size : 0;
    const inactiveBatches = stocks && Array.isArray(stocks) ? new Set(stocks.filter(s => (s.Status || s.status) === 'Inactive' && (s.Batch || s.batch)).map(s => (s.Batch || s.batch))).size : 0;
    const totalProducts = stocks && Array.isArray(stocks) ? stocks.length : 0;
    const totalUnits = stocks && Array.isArray(stocks) ? stocks.reduce((sum, s) => sum + (parseInt(s.units || 0) || 0), 0) : 0;

    // Handle cell edit
    const handleCellChange = (recordId, newValue) => {
        const numValue = parseInt(newValue) || 0;
        setChangedData(prev => ({
            ...prev,
            [recordId]: numValue
        }));
        setEditingCells(prev => ({
            ...prev,
            [recordId]: newValue
        }));
    };

    // Handle save for a single record
    const handleSaveRecord = async (recordKey) => {
        const newUnits = changedData[recordKey];
        if (newUnits === undefined) {
            setNotification({ type: 'info', message: 'No changes to save' });
            return;
        }

        setSaving(true);
        try {
            const response = await fetch(`${API_URL}/stock-batch/update-units`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: recordKey,
                    newUnits: newUnits
                })
            });

            if (response.ok) {
                setNotification({ type: 'success', message: 'Record updated successfully' });
                setEditingCells(prev => {
                    const newEditingCells = { ...prev };
                    delete newEditingCells[recordKey];
                    return newEditingCells;
                });
                setChangedData(prev => {
                    const newChangedData = { ...prev };
                    delete newChangedData[recordKey];
                    return newChangedData;
                });
                
                // Refresh data after a short delay
                setTimeout(() => {
                    refreshData();
                }, 500);
            } else {
                const data = await response.json();
                setNotification({ type: 'error', message: `Failed to update: ${data.message || 'Unknown error'}` });
            }
        } catch (error) {
            console.error('Error saving:', error);
            setNotification({ type: 'error', message: `Error: ${error.message}` });
        } finally {
            setSaving(false);
        }
    };

    // Handle cancel editing for a single record
    const handleCancelRecord = (recordKey) => {
        setEditingCells(prev => {
            const newEditingCells = { ...prev };
            delete newEditingCells[recordKey];
            return newEditingCells;
        });
        setChangedData(prev => {
            const newChangedData = { ...prev };
            delete newChangedData[recordKey];
            return newChangedData;
        });
    };

    return (
        <div className="space-y-6 pb-10">
            <Header title="Machine Out & Stock Adjustment" subtitle="Edit and manage stock units directly from batches" />

            <div className="px-8 space-y-6">
<div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                        <KPI title="Total Batches" value={totalBatches} icon={Box} colorClass="bg-blue-50 text-blue-600" />
                        <KPI title="Active Batches" value={activeBatches} icon={CheckCircle} colorClass="bg-green-50 text-green-600" />
                        <KPI title="Inactive Batches" value={inactiveBatches} icon={Trash2} colorClass="bg-slate-50 text-slate-700" />
                    <KPI title="Total Products" value={totalProducts} icon={Package} colorClass="bg-orange-50 text-orange-600" />
                    <KPI title="Total Units" value={totalUnits} icon={AlertTriangle} colorClass="bg-purple-50 text-purple-600" />
                </div>

                {/* Notification */}
                {notification && (
                    <div className={clsx("p-4 rounded-lg text-sm flex justify-between items-center", 
                        notification.type === 'success' 
                            ? "bg-green-50 text-green-800 border border-green-200" 
                            : notification.type === 'error'
                            ? "bg-red-50 text-red-800 border border-red-200"
                            : "bg-blue-50 text-blue-800 border border-blue-200")}>
                        <div>{notification.message}</div>
                    </div>
                )}

                {/* ✅ NEW: Filters for Machine Out */}
                {stocks && stocks.length > 0 && (
                    <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
                        <h4 className="text-sm font-semibold text-slate-700">🔍 Filter Stock Batches</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Batch Number</label>
                                <input
                                    type="text"
                                    value={batchFilterMO}
                                    onChange={(e) => setBatchFilterMO(e.target.value)}
                                    placeholder="Enter batch number..."
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Date (YYYY-MM-DD)</label>
                                <input
                                    type="text"
                                    value={dateFilterMO}
                                    onChange={(e) => setDateFilterMO(e.target.value)}
                                    placeholder="YYYY-MM-DD"
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Product Name/ID</label>
                                <input
                                    type="text"
                                    value={productFilterMO}
                                    onChange={(e) => setProductFilterMO(e.target.value)}
                                    placeholder="Search product..."
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                                />
                            </div>
                        </div>
                        {(batchFilterMO || dateFilterMO || productFilterMO) && (
                            <button
                                onClick={() => {
                                    setBatchFilterMO('');
                                    setDateFilterMO('');
                                    setProductFilterMO('');
                                }}
                                className="text-xs text-slate-600 hover:text-slate-800 font-medium underline"
                            >
                                Clear Filters
                            </button>
                        )}
                    </div>
                )}

                {/* Stock Batches with Editable Units */}
                {stocks && stocks.length === 0 ? (
                    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-12 text-center">
                        <Package size={40} className="mx-auto text-slate-300 mb-3" />
                        <p className="text-slate-600 font-medium">No stock batches found</p>
                        <p className="text-sm text-slate-500 mt-2">Create batches in Restock page to manage them here</p>
                    </div>
                ) : (
                    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-white">
                            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                                <Box size={18} className="text-blue-600" />
                                Stock Batches - Editable Units ({stocks && Array.isArray(stocks) ? stocks.length : 0} records)
                            </h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 sticky top-0">
                                    <tr>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Batch</th>
                                        <th className="px-6 py-4 text-center text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Date</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Machine</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Stock</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Cover</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Cover Status</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Product ID</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Product Name</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Case Label</th>
                                        <th className="px-6 py-4 text-center text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Units</th>
                                        <th className="px-6 py-4 text-center text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {(() => {
                                        const rows = [];
                                        
                                        if (stocks && Array.isArray(stocks) && stocks.length > 0) {
                                            // Group by Batch
                                            const groupedByBatch = {};
                                            
                                            stocks.forEach(stockItem => {
                                                const batch = stockItem.batch || stockItem.Batch_Number || 'No Batch';
                                                const date = stockItem.assignedDate || stockItem.Date;
                                                
                                                if (!groupedByBatch[batch]) {
                                                    groupedByBatch[batch] = {
                                                        batch,
                                                        date,
                                                        items: []
                                                    };
                                                }
                                                
                                                groupedByBatch[batch].items.push({
                                                    id: stockItem.id,  // StockCoverProductAssignment ID from new Firebase schema
                                                    machine: stockItem.machineId || stockItem.Machine || 'N/A',
                                                    stock: stockItem.stockLabel || stockItem.Stock,
                                                    cover: stockItem.coverLabel || stockItem.cover,
                                                    coverStatus: stockItem.coverStatus || stockItem.cover_status,
                                                    productId: stockItem.productId || stockItem.product_id,
                                                    productName: stockItem.product?.productName || stockItem.product_name,
                                                    units: stockItem.units || stockItem.Units,
                                                    status: stockItem.status || stockItem.Status,
                                                    caseLabel: stockItem.caseLabel || stockItem.case_label
                                                });
                                            });
                                            
                                            // ✅ Apply filters to batches
                                            const filteredBatchesMO = Object.values(groupedByBatch).filter(batchGroup => {
                                                // Filter by batch number
                                                if (batchFilterMO && !batchGroup.batch.toString().toLowerCase().includes(batchFilterMO.toLowerCase())) {
                                                    return false;
                                                }
                                                
                                                // Filter by date
                                                if (dateFilterMO && batchGroup.date) {
                                                    const batchDate = new Date(batchGroup.date).toISOString().split('T')[0];
                                                    if (batchDate !== dateFilterMO) {
                                                        return false;
                                                    }
                                                }
                                                
                                                // Filter by product name/id
                                                if (productFilterMO) {
                                                    const hasProduct = batchGroup.items.some(item =>
                                                        (item.productName && item.productName.toLowerCase().includes(productFilterMO.toLowerCase())) ||
                                                        (item.productId && item.productId.toString().toLowerCase().includes(productFilterMO.toLowerCase()))
                                                    );
                                                    if (!hasProduct) {
                                                        return false;
                                                    }
                                                }
                                                
                                                return true;
                                            });
                                            
                                            // Process each filtered batch and group by machine/stock/cover
                                            filteredBatchesMO.forEach(batchGroup => {
                                                // Group by machine
                                                const groupedByMachine = {};
                                                batchGroup.items.forEach((item) => {
                                                    if (!groupedByMachine[item.machine]) {
                                                        groupedByMachine[item.machine] = [];
                                                    }
                                                    groupedByMachine[item.machine].push(item);
                                                });

                                                // Process each machine
                                                Object.entries(groupedByMachine).forEach(([machine, machineItems]) => {
                                                    // Group by stock within machine
                                                    const groupedByStock = {};
                                                    machineItems.forEach((item) => {
                                                        if (!groupedByStock[item.stock]) {
                                                            groupedByStock[item.stock] = [];
                                                        }
                                                        groupedByStock[item.stock].push(item);
                                                    });

                                                    // Process each stock
                                                    Object.entries(groupedByStock).forEach(([stock, stockItems]) => {
                                                        // Group by cover within stock
                                                        const groupedByCover = {};
                                                        stockItems.forEach((item) => {
                                                            const coverKey = item.cover;
                                                            if (!groupedByCover[coverKey]) {
                                                                groupedByCover[coverKey] = [];
                                                            }
                                                            groupedByCover[coverKey].push(item);
                                                        });

                                                        // Process each cover
                                                        Object.entries(groupedByCover).forEach(([cover, coverItems]) => {
                                                            // Group by product within cover
                                                            const groupedByProduct = {};
                                                            coverItems.forEach((item) => {
                                                                const productKey = item.productId;
                                                                if (!groupedByProduct[productKey]) {
                                                                    groupedByProduct[productKey] = [];
                                                                }
                                                                groupedByProduct[productKey].push(item);
                                                            });

                                                            // Create rows for each product group
                                                            Object.entries(groupedByProduct).forEach(([productId, productItems]) => {
                                                                productItems.forEach((item) => {
                                                                    rows.push({
                                                                        batch: batchGroup.batch,
                                                                        date: batchGroup.date,
                                                                        machine,
                                                                        stock,
                                                                        cover,
                                                                        coverStatus: item.coverStatus,
                                                                        productId: item.productId,
                                                                        productName: item.productName,
                                                                        caseLabel: item.caseLabel,
                                                                        units: item.units,
                                                                        status: item.status,
                                                                        id: item.id
                                                                    });
                                                                });
                                                            });
                                                        });
                                                    });
                                                });
                                            });
                                        }

                                        let prevBatch = null;
                                        let prevMachine = null;
                                        let prevStock = null;
                                        let prevCover = null;
                                        let prevProductId = null;
                                        let prevProductName = null;

                                        return rows.length > 0 ? rows.map((row, idx) => {
                                            const showBatch = row.batch !== prevBatch;
                                            const showMachine = showBatch || row.machine !== prevMachine;
                                            const showStock = showMachine || row.stock !== prevStock;
                                            const showCover = showStock || row.cover !== prevCover;
                                            const showCoverStatus = showCover;
                                            const showProductId = showCover || row.productId !== prevProductId;
                                            const showProductName = showProductId || row.productName !== prevProductName;
                                            const showDate = showBatch;
                                            const showStatus = showBatch;

                                            prevBatch = row.batch || prevBatch;
                                            prevMachine = row.machine || prevMachine;
                                            prevStock = row.stock || prevStock;
                                            prevCover = row.cover || prevCover;
                                            prevProductId = row.productId || prevProductId;
                                            prevProductName = row.productName || prevProductName;

                                            const recordKey = row.id || `fallback_${row.batch}_${idx}`;
                                            const isEditing = recordKey in editingCells;
                                            const currentValue = isEditing ? editingCells[recordKey] : row.units;

                                            return (
                                                <tr key={recordKey} className={clsx("hover:bg-slate-50 transition-colors border-b border-slate-100", isEditing && "bg-blue-50")}>
                                                    <td className="px-6 py-4 font-bold text-orange-600">{showBatch ? row.batch : ''}</td>
                                                    <td className="px-6 py-4 text-center text-slate-600 whitespace-nowrap">{showDate && row.date ? new Date(row.date).toLocaleDateString() : ''}</td>
                                                    <td className="px-6 py-4 font-mono text-xs text-slate-600">{showMachine ? row.machine : ''}</td>
                                                    <td className="px-6 py-4 font-medium text-slate-800">{showStock ? row.stock : ''}</td>
                                                    <td className="px-6 py-4 text-slate-700">{showCover ? row.cover : ''}</td>
                                                    <td className="px-6 py-4 text-slate-600">
                                                        {showCoverStatus && row.coverStatus && (
                                                            <span className="inline-block px-2 py-1 bg-green-100 text-green-700 text-xs rounded">{row.coverStatus}</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 font-mono text-xs text-slate-600">{showProductId ? row.productId : ''}</td>
                                                    <td className="px-6 py-4 font-medium text-slate-800">{showProductName ? row.productName : ''}</td>
                                                    <td className="px-6 py-4 text-slate-700 text-xs">{row.caseLabel || '-'}</td>
                                                    <td className="px-6 py-4 text-center font-semibold text-slate-800">{currentValue ?? 0}</td>
                                                    <td className="px-6 py-4 text-center">
                                                        {isEditing ? (
                                                            <div className="flex gap-1 justify-center">
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    value={currentValue}
                                                                    onChange={(e) => handleCellChange(recordKey, e.target.value)}
                                                                    className="w-16 px-2 py-1 border border-blue-400 rounded text-center font-bold text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                                    autoFocus
                                                                />
                                                                <button
                                                                    onClick={() => handleSaveRecord(recordKey)}
                                                                    disabled={saving}
                                                                    className="px-2 py-1 bg-green-500 hover:bg-green-600 text-white rounded text-xs font-medium flex items-center gap-1 disabled:opacity-50"
                                                                >
                                                                    <Save size={14} />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleCancelRecord(recordKey)}
                                                                    disabled={saving}
                                                                    className="px-2 py-1 bg-slate-400 hover:bg-slate-500 text-white rounded text-xs font-medium flex items-center gap-1 disabled:opacity-50"
                                                                >
                                                                    <X size={14} />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                onClick={() => {
                                                                    setEditingCells(prev => ({ ...prev, [recordKey]: row.units }));
                                                                }}
                                                                className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-xs font-medium cursor-pointer"
                                                            >
                                                                Edit
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        }) : (
                                            <tr>
                                                <td colSpan="11" className="px-6 py-8 text-center text-slate-500">
                                                    No batches to display
                                                </td>
                                            </tr>
                                        );
                                    })()}
                                </tbody>
                            </table>
                        </div>

                        {/* Summary Footer */}
                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 text-xs text-slate-600 flex justify-between">
                            <span>Total Records: <strong>{stocks?.length || 0}</strong></span>
                            <span>Total Units: <strong>{totalUnits}</strong></span>
                            <span>Changed: <strong className="text-blue-600">{Object.keys(changedData).length}</strong></span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MachineOut;
