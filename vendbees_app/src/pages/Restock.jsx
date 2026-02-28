import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import { useData } from '../context/DataContext';
import { AlertTriangle, Package, CheckCircle, Search, Plus, X, Box, Trash2, ChevronDown } from 'lucide-react';
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

// Modal Component
const Modal = ({ isOpen, onClose, title, children, size = 'md' }) => {
    if (!isOpen) return null;
    const sizeClasses = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
            <div className={`bg-white rounded-xl shadow-xl w-full ${sizeClasses[size]} mx-4 max-h-[90vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-6 border-b border-slate-100">
                    <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                </div>
                <div className="p-6">{children}</div>
            </div>
        </div>
    );
};

// Create Batch Form Component
const CreateBatchForm = ({ machines, purchasedProducts, onSave, onCancel, saving }) => {
    const [batchNumber, setBatchNumber] = useState('');
    const [createdDate, setCreatedDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedMachines, setSelectedMachines] = useState(['', '', '', '']);
    const [covers, setCovers] = useState({});
    const [stocks, setStocks] = useState({
        'S1': { machine: '', covers: {} },
        'S2': { machine: '', covers: {} },
        'S3': { machine: '', covers: {} },
        'S4': { machine: '', covers: {} }
    });
    const [newCover, setNewCover] = useState({ stock: '', name: '' });
    const [activeStock, setActiveStock] = useState('S1');
    const [filterQuery, setFilterQuery] = useState('');
    const [showProductDropdown, setShowProductDropdown] = useState(null);

    // Update machine selection
    useEffect(() => {
        const newStocks = { ...stocks };
        ['S1', 'S2', 'S3', 'S4'].forEach((stock, idx) => {
            newStocks[stock].machine = selectedMachines[idx];
        });
        setStocks(newStocks);
    }, [selectedMachines]);

    const handleMachineChange = (index, value) => {
        const newMachines = [...selectedMachines];
        newMachines[index] = value;
        setSelectedMachines(newMachines);
    };

    const handleAddCover = (stock) => {
        if (!newCover.name.trim()) return;
        
        const updatedStocks = { ...stocks };
        if (!updatedStocks[stock].covers) {
            updatedStocks[stock].covers = {};
        }
        updatedStocks[stock].covers[newCover.name] = [];
        setStocks(updatedStocks);
        setNewCover({ stock: '', name: '' });
    };

    const handleAddProduct = (stock, cover, product) => {
        const updatedStocks = { ...stocks };
        if (!updatedStocks[stock].covers[cover].find(p => p.product_id === product.Product_ID)) {
            updatedStocks[stock].covers[cover].push({
                product_id: product.Product_ID,
                product_name: product.Product_Name,
                units: 0
            });
            setStocks(updatedStocks);
        }
        setShowProductDropdown(null);
        setFilterQuery('');
    };

    const handleUnitsChange = (stock, cover, productId, units) => {
        const updatedStocks = { ...stocks };
        const product = updatedStocks[stock].covers[cover].find(p => p.product_id === productId);
        if (product) {
            product.units = parseInt(units) || 0;
        }
        setStocks(updatedStocks);
    };

    const handleRemoveProduct = (stock, cover, productId) => {
        const updatedStocks = { ...stocks };
        updatedStocks[stock].covers[cover] = updatedStocks[stock].covers[cover].filter(
            p => p.product_id !== productId
        );
        setStocks(updatedStocks);
    };

    const handleRemoveCover = (stock, cover) => {
        const updatedStocks = { ...stocks };
        delete updatedStocks[stock].covers[cover];
        setStocks(updatedStocks);
    };

    const filteredProducts = purchasedProducts.filter(p =>
        p.Product_Name?.toLowerCase().includes(filterQuery.toLowerCase()) ||
        p.Product_ID?.toLowerCase().includes(filterQuery.toLowerCase())
    );

    const handleSubmit = (e) => {
        e.preventDefault();
        
        if (!batchNumber.trim()) {
            alert('Batch number is required');
            return;
        }

        if (selectedMachines.some(m => !m)) {
            alert('All 4 machines must be selected');
            return;
        }

        let hasProducts = false;
        Object.values(stocks).forEach(stock => {
            Object.values(stock.covers).forEach(products => {
                if (products.some(p => p.units > 0)) {
                    hasProducts = true;
                }
            });
        });

        if (!hasProducts) {
            alert('At least one product with units > 0 must be added');
            return;
        }

        onSave({
            batch_number: batchNumber,
            machines: selectedMachines,
            created_date: createdDate,
            stocks: stocks
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* Batch Header */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Batch Number *</label>
                    <input
                        type="text"
                        value={batchNumber}
                        onChange={e => setBatchNumber(e.target.value)}
                        placeholder="e.g., Batch 1, Batch 2, Batch 3"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Created Date *</label>
                    <input
                        type="date"
                        value={createdDate}
                        onChange={e => setCreatedDate(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                    />
                </div>
            </div>

            {/* Machine Selection */}
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h4 className="font-semibold text-blue-900 mb-3">Select Machines for Each Stock (Rarely Changed)</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {['S1', 'S2', 'S3', 'S4'].map((stock, idx) => (
                        <div key={stock}>
                            <label className="block text-xs font-medium text-slate-600 mb-1">{stock}</label>
                            <select
                                value={selectedMachines[idx]}
                                onChange={e => handleMachineChange(idx, e.target.value)}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                            >
                                <option value="">Select Machine</option>
                                {machines.map(m => (
                                    <option key={m.Machine_ID} value={m.Machine_ID}>
                                        {m.Machine_ID} - {m.Location}
                                    </option>
                                ))}
                            </select>
                        </div>
                    ))}
                </div>
            </div>

            {/* Stocks Management */}
            <div className="space-y-4">
                <h4 className="font-semibold text-slate-800">Manage Stocks & Covers</h4>
                
                {/* Stock Tabs */}
                <div className="flex gap-2 border-b border-slate-200">
                    {['S1', 'S2', 'S3', 'S4'].map(stock => (
                        <button
                            key={stock}
                            type="button"
                            onClick={() => setActiveStock(stock)}
                            className={clsx(
                                "px-4 py-2 font-medium border-b-2 transition-colors",
                                activeStock === stock
                                    ? "border-orange-500 text-orange-600"
                                    : "border-transparent text-slate-600 hover:text-slate-800"
                            )}
                        >
                            {stock} {stocks[stock].machine && `(${stocks[stock].machine})`}
                        </button>
                    ))}
                </div>

                {/* Active Stock Content */}
                <div className="bg-slate-50 p-4 rounded-lg space-y-4">
                    {/* Machine Info */}
                    <div className="bg-white p-3 rounded border border-slate-200">
                        <p className="text-sm text-slate-600">
                            Machine: <span className="font-bold text-slate-800">{stocks[activeStock].machine || 'Not Selected'}</span>
                        </p>
                    </div>

                    {/* Add Cover Section */}
                    <div className="bg-white p-4 rounded border border-slate-200">
                        <h5 className="font-medium text-slate-800 mb-3">Add Cover</h5>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newCover.stock === activeStock ? newCover.name : ''}
                                onChange={e => setNewCover({ stock: activeStock, name: e.target.value })}
                                placeholder="e.g., C1, C2, C3"
                                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                            />
                            <button
                                type="button"
                                onClick={() => handleAddCover(activeStock)}
                                className="px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium"
                            >
                                Add
                            </button>
                        </div>
                    </div>

                    {/* Covers List */}
                    <div className="space-y-3">
                        {Object.keys(stocks[activeStock].covers).length === 0 ? (
                            <p className="text-sm text-slate-500 py-4 text-center">No covers added yet</p>
                        ) : (
                            Object.entries(stocks[activeStock].covers).map(([cover, products]) => (
                                <div key={cover} className="bg-white p-4 rounded border border-slate-200">
                                    <div className="flex justify-between items-center mb-3">
                                        <h6 className="font-semibold text-slate-800">{cover}</h6>
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveCover(activeStock, cover)}
                                            className="text-red-500 hover:text-red-700"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>

                                    {/* Products in Cover */}
                                    <div className="space-y-2 mb-3">
                                        {products.map(product => (
                                            <div key={product.product_id} className="flex items-center gap-2 bg-slate-50 p-2 rounded">
                                                <div className="flex-1">
                                                    <p className="text-sm font-medium text-slate-800">{product.product_name}</p>
                                                    <p className="text-xs text-slate-500">{product.product_id}</p>
                                                </div>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={product.units}
                                                    onChange={e => handleUnitsChange(activeStock, cover, product.product_id, e.target.value)}
                                                    className="w-16 px-2 py-1 border border-slate-200 rounded text-sm"
                                                    placeholder="Units"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveProduct(activeStock, cover, product.product_id)}
                                                    className="text-red-500 hover:text-red-700"
                                                >
                                                    <X size={16} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Add Product Dropdown */}
                                    <div className="relative">
                                        <button
                                            type="button"
                                            onClick={() => setShowProductDropdown(
                                                showProductDropdown === `${activeStock}-${cover}` ? null : `${activeStock}-${cover}`
                                            )}
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-left flex items-center justify-between hover:bg-slate-50"
                                        >
                                            <span className="text-slate-600">Add Product to {cover}</span>
                                            <ChevronDown size={16} className="text-slate-400" />
                                        </button>

                                        {showProductDropdown === `${activeStock}-${cover}` && (
                                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-10">
                                                <input
                                                    type="text"
                                                    placeholder="Search products..."
                                                    value={filterQuery}
                                                    onChange={e => setFilterQuery(e.target.value)}
                                                    className="w-full px-3 py-2 border-b border-slate-200 text-sm focus:outline-none"
                                                />
                                                <div className="max-h-48 overflow-y-auto">
                                                    {filteredProducts.length === 0 ? (
                                                        <p className="px-3 py-2 text-sm text-slate-500">No products found</p>
                                                    ) : (
                                                        filteredProducts.map(product => (
                                                            <button
                                                                key={product.Product_ID}
                                                                type="button"
                                                                onClick={() => handleAddProduct(activeStock, cover, product)}
                                                                className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm border-b border-slate-100"
                                                            >
                                                                <div className="font-medium text-slate-800">{product.Product_Name}</div>
                                                                <div className="text-xs text-slate-500">
                                                                    ID: {product.Product_ID} • Available: {product.Available_Units} units
                                                                </div>
                                                            </button>
                                                        ))
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Form Actions */}
            <div className="flex gap-3 pt-6 border-t border-slate-200">
                <button
                    type="button"
                    onClick={onCancel}
                    className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 text-sm font-medium"
                    disabled={saving}
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                    disabled={saving || !batchNumber.trim() || selectedMachines.some(m => !m)}
                >
                    {saving ? 'Creating Batch...' : 'Create Batch'}
                </button>
            </div>
        </form>
    );
};


const Restock = () => {
    const { products, machines, stock, vendors, purchased_products = [], stocks = [], stock_assignments = [], loading, refreshData } = useData();
    const [filter, setFilter] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('alerts');
    const [showCreateBatchModal, setShowCreateBatchModal] = useState(false);
    const [saving, setSaving] = useState(false);
    const [notification, setNotification] = useState(null);
    const API_URL = 'http://127.0.0.1:3001/api';

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
        setSaving(true);
        try {
            // Transform data for backend
            const batchData = {
                batch_number: data.batch_number,
                machine_ids: data.machines,
                created_date: data.created_date,
                stocks: data.stocks
            };

            const response = await fetch(`${API_URL}/stocks/create-batch-full`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(batchData)
            });

            const result = await response.json();
            if (result.success || response.ok) {
                setNotification({ 
                    type: 'success',
                    message: `Batch ${data.batch_number} created successfully with ${data.machines.length} stocks!`
                });
                setShowCreateBatchModal(false);
                await refreshData();
            } else {
                setNotification({ type: 'error', message: result.error || 'Failed to create batch' });
            }
        } catch (error) {
            setNotification({ type: 'error', message: error.message });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6 pb-10">
            <Header title="Restock & Stock Management" subtitle="Monitor stock levels and create batches for distribution" />

            <div className="px-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <KPI title="Critical Items" value={criticalCount} icon={AlertTriangle} colorClass="bg-red-50 text-red-600" />
                    <KPI title="Low Stock" value={lowCount} icon={Package} colorClass="bg-yellow-50 text-yellow-600" />
                    <KPI title="Safe Stock" value={safeCount} icon={CheckCircle} colorClass="bg-green-50 text-green-600" />
                    <KPI title="Active Stocks" value={stocks.length} icon={Box} colorClass="bg-blue-50 text-blue-600" />
                </div>

                {/* Notification */}
                {notification && (
                    <div className={clsx("p-4 rounded-lg text-sm", notification.type === 'success' ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800")}>
                        {notification.message}
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
                        onClick={() => setActiveTab('batches')}
                        className={clsx("px-4 py-3 font-medium border-b-2 transition-colors", activeTab === 'batches' ? "border-orange-500 text-orange-600" : "border-transparent text-slate-600 hover:text-slate-800")}
                    >
                        Stock Batches ({stocks.length})
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

                {/* Stock Batches Tab */}
                {activeTab === 'batches' && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-semibold text-slate-800">Stock Batches</h3>
                            <button
                                onClick={() => setShowCreateBatchModal(true)}
                                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                            >
                                <Plus size={16} /> Create Batch
                            </button>
                        </div>

                        {stocks.length === 0 ? (
                            <div className="bg-slate-50 rounded-xl p-8 text-center">
                                <Package size={32} className="mx-auto text-slate-400 mb-2" />
                                <p className="text-slate-600">No stock batches yet. Create your first batch to get started.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {stocks.map(s => (
                                    <div key={s.Stock_ID} className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <h4 className="text-lg font-semibold text-slate-800">{s.Stock_Name}</h4>
                                                <p className="text-sm text-slate-500">Batch: {s.Batch_Number} • {s.Products_Count} products</p>
                                            </div>
                                            <span className={clsx("px-2 py-1 rounded text-xs font-medium", 
                                                s.Status === 'Active' ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700")}>
                                                {s.Status}
                                            </span>
                                        </div>

                                        <div className="space-y-2 mb-4 max-h-40 overflow-y-auto">
                                            {s.Products?.map((p, idx) => (
                                                <div key={idx} className="flex justify-between text-sm bg-slate-50 p-2 rounded">
                                                    <span className="text-slate-700">{p.Product_Name}</span>
                                                    <span className="font-medium text-slate-800">{p.Units} units</span>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="border-t border-slate-100 pt-4 grid grid-cols-3 gap-4">
                                            <div>
                                                <p className="text-xs text-slate-500">Total Units</p>
                                                <p className="text-lg font-bold text-slate-800">{s.Total_Units}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-slate-500">Covers</p>
                                                <p className="text-lg font-bold text-slate-800">{s.Cover_List?.split(',').length || 0}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-slate-500">Created</p>
                                                <p className="text-sm font-medium text-slate-800">{s.Created_Date}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Create Batch Modal */}
            <Modal
                isOpen={showCreateBatchModal}
                onClose={() => setShowCreateBatchModal(false)}
                title="Create Stock Batch"
                size="xl"
            >
                <CreateBatchForm
                    machines={machines}
                    purchasedProducts={purchased_products}
                    onSave={handleCreateBatch}
                    onCancel={() => setShowCreateBatchModal(false)}
                    saving={saving}
                />
            </Modal>
        </div>
    );
};

export default Restock;
