import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { useData } from '../context/DataContext';
import { AlertTriangle, Package, CheckCircle, Search, Plus, X, Box, Trash2, ChevronDown, FileText } from 'lucide-react';
import clsx from 'clsx';
import GenerateBillModal from '../components/GenerateBillModal';

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

const Restock = () => {
    const navigate = useNavigate();
    const { products, machines, stock, vendors, purchased_products = [], stocks = [], stock_assignments = [], loading, refreshData } = useData();
    const [filter, setFilter] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('alerts');
    const [notification, setNotification] = useState(null);
    const [showBillModal, setShowBillModal] = useState(false);
    const API_URL = 'http://127.0.0.1:3001/api';

    // Log when stocks data changes
    useEffect(() => {
        if (stocks && stocks.length > 0) {
            console.log('✔ Restock.jsx: Stocks data updated:', stocks.length, 'batches');
            stocks.forEach(s => console.log(`  - ${s.Stock_ID}: ${s.Batch_Number || 'N/A'} (${s.Total_Units} units)`));
        } else {
            console.log('⚠️ Restock.jsx: No stocks data loaded');
        }
        
        // Debug products data
        if (products && Array.isArray(products)) {
            console.log('✔ Restock.jsx: Products loaded:', products.length);
            console.log('  Product names:', products.map(p => p.Product_Name || p.name || p.productName).slice(0, 5));
        } else {
            console.log('⚠️ Restock.jsx: Products not loaded or not array:', typeof products);
        }
    }, [stocks, products]);

    if (loading) return null;

    // Process alerts
    let alerts = [];
    let criticalCount = 0;
    let lowCount = 0;
    let safeCount = 0;

    stock.forEach(s => {
        const prod = products.find(p => p.Product_ID === s.Product_ID);
        const machine = machines.find(m => m.Machine_ID === s.Machine_ID);
        if (!prod || !machine) return;

        let status = 'Safe';
        if (s.Current_Stock < 10) status = 'Critical';
        else if (s.Current_Stock < prod.Reorder_Level) status = 'Low Stock';

        if (status === 'Critical') criticalCount++;
        if (status === 'Low Stock') lowCount++;
        if (status === 'Safe') safeCount++;

        if (status !== 'Safe') {
            const vendor = vendors.find(v => v.Product_ID === prod.Product_ID || v.Product_Name === prod.Name)?.Name || 'Contact Admin';
            alerts.push({
                Machine: machine,
                Product: prod,
                Stock: s.Current_Stock,
                Reorder: prod.Reorder_Level,
                Status: status,
                Vendor: vendor
            });
        }
    });

    let filteredAlerts = filter === 'All' ? alerts :
        filter === 'Critical' ? alerts.filter(a => a.Status === 'Critical') :
            filter === 'Low' ? alerts.filter(a => a.Status === 'Low Stock') : alerts;

    if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        filteredAlerts = filteredAlerts.filter(a =>
            a.Machine.Machine_ID.toLowerCase().includes(query) ||
            a.Machine.Location.toLowerCase().includes(query) ||
            a.Product.Name.toLowerCase().includes(query) ||
            a.Product.Product_ID.toLowerCase().includes(query)
        );
    }

    const handleCreateBatch = async (data) => {
        // Batch creation is now handled in CreateBatchPage
        // This function is kept for backward compatibility but no longer used
    };

    return (
        <div className="space-y-6 pb-10">
            <Header title="Restock & Stock Management" subtitle="Monitor stock levels and create batches for distribution" />

            <div className="px-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <KPI title="Critical Items" value={criticalCount} icon={AlertTriangle} colorClass="bg-red-50 text-red-600" />
                    <KPI title="Low Stock" value={lowCount} icon={Package} colorClass="bg-yellow-50 text-yellow-600" />
                    <KPI title="Safe Stock" value={safeCount} icon={CheckCircle} colorClass="bg-green-50 text-green-600" />
                    <KPI title={activeTab === 'batches' ? 'Active Batches' : 'Active Stocks'} 
                        value={activeTab === 'batches' ? (new Set(stocks.filter(s => s.Status === 'Active' && s.Batch).map(s => s.Batch)).size || 0) : stocks.length} 
                        icon={Box} 
                        colorClass="bg-blue-50 text-blue-600" 
                    />
                </div>

                {/* Notification */}
                {notification && (
                    <div className={clsx("p-4 rounded-lg text-sm flex justify-between items-center", 
                        notification.type === 'success' 
                            ? "bg-green-50 text-green-800 border border-green-200" 
                            : "bg-red-50 text-red-800 border border-red-200")}>
                        <div>{notification.message}</div>
                        {notification.type === 'success' && (
                            <button
                                onClick={() => refreshData()}
                                className="text-xs font-medium px-3 py-1 bg-green-200 text-green-700 rounded hover:bg-green-300 ml-4"
                            >
                                Refresh Data
                            </button>
                        )}
                    </div>
                )}

                {/* Tabs */}
                <div className="flex gap-4 border-b border-slate-200">
                    <button
                        onClick={() => setActiveTab('alerts')}
                        className={clsx("px-4 py-3 font-medium border-b-2 transition-colors", activeTab === 'alerts' ? "border-orange-500 text-orange-600" : "border-transparent text-slate-600 hover:text-slate-800")}
                    >
                        Restock Alerts
                    </button>
                    <button
                        onClick={() => setActiveTab('purchased')}
                        className={clsx("px-4 py-3 font-medium border-b-2 transition-colors", activeTab === 'purchased' ? "border-orange-500 text-orange-600" : "border-transparent text-slate-600 hover:text-slate-800")}
                    >
                        Purchased Products ({purchased_products.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('batches')}
                        className={clsx("px-4 py-3 font-medium border-b-2 transition-colors", activeTab === 'batches' ? "border-orange-500 text-orange-600" : "border-transparent text-slate-600 hover:text-slate-800")}
                    >
                        Stock Batches ({stocks ? new Set(stocks.filter(s => s.Batch).map(s => s.Batch)).size : 0})
                    </button>
                </div>

                {/* Restock Alerts Tab */}
                {activeTab === 'alerts' && (
                    <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                            <div className="flex gap-2">
                                {['All', 'Critical', 'Low'].map(f => (
                                    <button
                                        key={f}
                                        onClick={() => setFilter(f)}
                                        className={clsx("px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                                            filter === f ? "bg-orange-500 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50")}
                                    >
                                        {f === 'All' ? 'All Machines' : f === 'Critical' ? 'Critical Only' : 'Low Stock'}
                                    </button>
                                ))}
                            </div>
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search machine or product..."
                                    className="pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-sm w-full sm:w-64 focus:outline-none focus:border-orange-500"
                                />
                            </div>
                        </div>

                        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                            <div className="p-6 border-b border-slate-50">
                                <h3 className="font-semibold text-slate-800">Restock Alert Feed</h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                                        <tr>
                                            <th className="px-6 py-4 font-medium">Machine ID</th>
                                            <th className="px-6 py-4 font-medium">Location</th>
                                            <th className="px-6 py-4 font-medium">Product</th>
                                            <th className="px-6 py-4 font-medium">Current Stock</th>
                                            <th className="px-6 py-4 font-medium">Reorder Level</th>
                                            <th className="px-6 py-4 font-medium">Vendor</th>
                                            <th className="px-6 py-4 font-medium">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredAlerts.map((alert, idx) => (
                                            <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/50">
                                                <td className="px-6 py-4 font-bold text-slate-700">{alert.Machine.Machine_ID}</td>
                                                <td className="px-6 py-4 text-slate-500">{alert.Machine.Location}</td>
                                                <td className="px-6 py-4 font-medium text-slate-700">
                                                    {alert.Product.Name}
                                                    <div className="text-[10px] text-slate-400">{alert.Product.Category}</div>
                                                </td>
                                                <td className={clsx("px-6 py-4 font-bold", alert.Stock < 10 ? "text-red-600" : "text-yellow-600")}>
                                                    {alert.Stock} units
                                                </td>
                                                <td className="px-6 py-4 text-slate-500">{alert.Reorder} units</td>
                                                <td className="px-6 py-4 text-slate-500">{alert.Vendor}</td>
                                                <td className="px-6 py-4">
                                                    <span className={clsx("px-3 py-1 rounded-full text-xs font-bold uppercase",
                                                        alert.Status === 'Critical' ? "bg-red-100 text-red-600" : "bg-yellow-100 text-yellow-600")}>
                                                        {alert.Status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* Purchased Products Tab */}
                {activeTab === 'purchased' && (
                    <div className="space-y-4">
                        {purchased_products.length === 0 ? (
                            <div className="bg-slate-50 rounded-xl p-8 text-center">
                                <Package size={32} className="mx-auto text-slate-400 mb-2" />
                                <p className="text-slate-600">No purchased products yet. Record deliveries to view them here.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="font-semibold text-slate-800">Purchased Products Inventory</h3>
                                    <button
                                        onClick={() => setShowBillModal(true)}
                                        className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition"
                                    >
                                        <FileText size={16} /> Generate Bill
                                    </button>
                                </div>
                                <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-left">
                                            <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                                                <tr>
                                                    <th className="px-6 py-4 font-medium">PO ID</th>
                                                    <th className="px-6 py-4 font-medium">EXP ID</th>
                                                    <th className="px-6 py-4 font-medium">Product ID</th>
                                                    <th className="px-6 py-4 font-medium">Product Name</th>
                                                    <th className="px-6 py-4 font-medium">Available Units</th>
                                                    <th className="px-6 py-4 font-medium">Units Per Case</th>
                                                    <th className="px-6 py-4 font-medium">Batch</th>
                                                    <th className="px-6 py-4 font-medium">Received Date</th>
                                                    <th className="px-6 py-4 font-medium">Notes</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {purchased_products.map((product, idx) => (
                                                    <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/50">
                                                        <td className="px-6 py-4 font-medium text-slate-700">{product.PO_ID || ''}</td>
                                                        <td className="px-6 py-4 text-blue-600 font-medium">{product.EXP_Id || ''}</td>
                                                        <td className="px-6 py-4 font-bold text-slate-800">{product.Product_ID}</td>
                                                        <td className="px-6 py-4 text-slate-700">{product.Product_Name}</td>
                                                        <td className="px-6 py-4">
                                                            <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-sm font-medium">
                                                                {product.Available_Units} units
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 text-slate-600">{product.Units_Per_Case || 1}</td>
                                                        <td className="px-6 py-4 text-slate-600">{product.Batch || ''}</td>
                                                        <td className="px-6 py-4 text-slate-600">{product.Received_Date}</td>
                                                        <td className="px-6 py-4 text-slate-500 text-xs">{product.Notes}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Stock Batches Tab */}
                {activeTab === 'batches' && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-semibold text-slate-800">Stock Batches Management</h3>
                            <div className="flex gap-2">
                            <button
                                    onClick={() => {
                                        console.log('Manual refresh triggered');
                                        refreshData();
                                    }}
                                    className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-medium flex items-center gap-2"
                                >
                                    🔄 Refresh
                                </button>
                                <button
                                    onClick={() => navigate('/restock/create-batch')}
                                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                            >
                                <Plus size={16} /> Create Batch
                            </button>
                            </div>
                        </div>

                        {stocks && stocks.length === 0 ? (
                            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-12 text-center">
                                <Package size={40} className="mx-auto text-slate-300 mb-3" />
                                <p className="text-slate-600 font-medium">No stock batches found</p>
                                <p className="text-sm text-slate-500 mt-2">Create your first batch to get started, or check if data exists in the Stocks sheet</p>
                            </div>
                        ) : (
                            <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                                <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-orange-50 to-white">
                                    <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                                        <Box size={18} className="text-orange-600" />
                                        All Stock Batches ({stocks ? new Set(stocks.filter(s => s.Batch).map(s => s.Batch)).size : 0} batches)
                                    </h3>
                                            </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-100 sticky top-0">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Batch</th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Date</th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Machine</th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Stock</th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Cover</th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Cover Status</th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Product ID</th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Product Name</th>
                                                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Units</th>
                                                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {stocks && stocks.length > 0 ? (
                                                stocks.map((row, idx) => (
                                                    <tr key={`batch-${idx}`} className="hover:bg-slate-50 transition-colors">
                                                        <td className="px-4 py-3 font-bold text-orange-600">{row.Batch || ''}</td>
                                                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                                                            {row.Date ? new Date(row.Date).toLocaleDateString() : ''}
                                                        </td>
                                                        <td className="px-4 py-3 font-medium text-slate-700">{row.Machine || ''}</td>
                                                        <td className="px-4 py-3 text-slate-700 font-semibold">{row.Stock || ''}</td>
                                                        <td className="px-4 py-3 text-slate-700 font-medium">{row.cover || ''}</td>
                                                        <td className="px-4 py-3 text-center">
                                                            {row.cover_status ? (
                                            <span className={clsx("px-2 py-1 rounded text-xs font-medium", 
                                                                    row.cover_status === 'covered' 
                                                                        ? "bg-green-100 text-green-700" 
                                                                        : "bg-slate-100 text-slate-600")}>
                                                                    {row.cover_status}
                                            </span>
                                                            ) : (
                                                                <span className="text-slate-400">-</span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 text-slate-600 font-mono text-xs">{row.product_id || ''}</td>
                                                        <td className="px-4 py-3 text-slate-800 font-medium max-w-[200px] truncate" title={row.product_name}>
                                                            {row.product_name || ''}
                                                        </td>
                                                        <td className="px-4 py-3 text-right">
                                                            <span className={clsx("px-2 py-1 rounded text-sm font-bold inline-block", 
                                                                row.units > 0 
                                                                    ? "bg-blue-100 text-blue-700" 
                                                                    : "bg-gray-100 text-gray-600")}>
                                                                {row.units || 0}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            {row.Status ? (
                                                                <span className={clsx("px-3 py-1 rounded-full text-xs font-bold uppercase inline-block", 
                                                                    row.Status === 'Active' 
                                                                        ? "bg-green-100 text-green-700" 
                                                                        : row.Status === 'Inactive'
                                                                        ? "bg-slate-100 text-slate-600"
                                                                        : "bg-blue-100 text-blue-700")}>
                                                                    {row.Status}
                                                                </span>
                                                            ) : (
                                                                <span className="text-slate-400">-</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan="10" className="px-4 py-8 text-center text-slate-500">
                                                        No batches to display
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                    </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Generate Bill Modal */}
            <GenerateBillModal
                isOpen={showBillModal}
                onClose={() => setShowBillModal(false)}
                purchased_products={purchased_products}
                products={products}
            />
        </div>
    );
};

export default Restock;
