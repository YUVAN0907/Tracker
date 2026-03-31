import React, { useState, useMemo, useEffect } from 'react';
import Header from '../components/Header';
import { useData } from '../context/DataContext';
import { Warehouse as WarehouseIcon, Package, ArrowRight, Plus, Pencil, Trash2, X, Search, AlertCircle, CheckCircle, Calendar, TrendingUp } from 'lucide-react';
import clsx from 'clsx';

const KPI = ({ title, value, subtext, highlight }) => (
    <div className={clsx("p-6 rounded-xl border shadow-sm", highlight ? "bg-orange-50 border-orange-200" : "bg-white border-slate-100")}>
        <div className="text-sm text-slate-500 font-medium">{title}</div>
        <div className={clsx("text-3xl font-bold mt-2", highlight ? "text-orange-600" : "text-slate-800")}>{value}</div>
        {subtext && <div className="text-xs text-slate-400 mt-1">{subtext}</div>}
    </div>
);

// Modal Component
const Modal = ({ isOpen, onClose, title, children, size = 'md' }) => {
    if (!isOpen) return null;
    const sizeClasses = {
        sm: 'max-w-sm',
        md: 'max-w-lg',
        lg: 'max-w-2xl',
        xl: 'max-w-4xl'
    };
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

// Add from Purchased Products Form (Smart Allocation)
const AddFromPurchaseForm = ({ onSave, onCancel, saving }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProductId, setSelectedProductId] = useState('');
    const [unitsToAdd, setUnitsToAdd] = useState('');
    const [showProductSuggestions, setShowProductSuggestions] = useState(false);
    const [notes, setNotes] = useState('');
    const [purchasedProducts, setPurchasedProducts] = useState([]);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [noProducts, setNoProducts] = useState(false);

    useEffect(() => {
        // Fetch available purchased products from backend
        const fetchProducts = async () => {
            try {
                const response = await fetch('http://localhost:3002/api/warehouse/purchase-products');
                if (response.ok) {
                    const data = await response.json();
                    setPurchasedProducts(data);
                    setNoProducts(data.length === 0);
                } else {
                    setNoProducts(true);
                }
            } catch (error) {
                console.error('Error fetching purchased products:', error);
                setNoProducts(true);
            }
        };
        fetchProducts();
    }, []);

    // Filter purchased products by search term
    const filteredProducts = useMemo(() => {
        if (!searchTerm.trim()) return [];
        return purchasedProducts.filter(p =>
            (p.Product_Name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (p.Product_ID || '').toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [searchTerm, purchasedProducts]);

    useEffect(() => {
        const handleClickOutside = () => setShowProductSuggestions(false);
        if (showProductSuggestions) {
            document.addEventListener('click', handleClickOutside);
            return () => document.removeEventListener('click', handleClickOutside);
        }
    }, [showProductSuggestions]);

    const handleProductSelect = (product) => {
        setSelectedProduct(product);
        setSelectedProductId(product.Product_ID);
        setSearchTerm(product.Product_Name);
        setShowProductSuggestions(false);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!selectedProductId || !unitsToAdd) {
            alert('Please select a product and enter units');
            return;
        }
        onSave({
            product_id: selectedProductId,
            units_to_add: parseInt(unitsToAdd),
            notes: notes
        });
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        try {
            return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
        } catch {
            return dateStr;
        }
    };

    const unitsRequested = parseInt(unitsToAdd) || 0;
    const totalAvailable = selectedProduct?.Total_Available_Units || 0;
    const isValidQuantity = selectedProduct && unitsRequested > 0 && unitsRequested <= totalAvailable;

    // Calculate allocation breakdown
    const allocationBreakdown = useMemo(() => {
        if (!selectedProduct || !unitsToAdd) return [];
        
        const unitsRequested = parseInt(unitsToAdd) || 0;
        const cases = (selectedProduct.cases || []).slice(); // Copy array to avoid mutation
        
        const breakdown = [];
        let unitsRemaining = unitsRequested;
        
        for (const c of cases) {
            if (unitsRemaining <= 0) break;
            
            const availableInCase = c.availableUnits || 0;
            const unitsFromThisCase = Math.min(unitsRemaining, availableInCase);
            
            breakdown.push({
                caseLabel: c.caseLabel,
                availableUnits: availableInCase,
                allocatedUnits: unitsFromThisCase,
                expd: c.expd
            });
            
            unitsRemaining -= unitsFromThisCase;
        }
        
        return breakdown;
    }, [selectedProduct, unitsToAdd]);

    const canFullyAllocate = allocationBreakdown.reduce((sum, b) => sum + b.allocatedUnits, 0) === unitsRequested;

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">Search Purchased Product *</label>
                <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={e => {
                            setSearchTerm(e.target.value);
                            setShowProductSuggestions(true);
                            setSelectedProductId('');
                            setSelectedProduct(null);
                        }}
                        onFocus={() => setShowProductSuggestions(true)}
                        placeholder="Search by product name or ID..."
                        className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                    />
                    {showProductSuggestions && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto">
                            {filteredProducts.length === 0 && searchTerm && (
                                <div className="p-3 text-sm text-slate-500">No products found</div>
                            )}
                            {filteredProducts.map((product) => (
                                <button
                                    key={product.Product_ID}
                                    type="button"
                                    onClick={() => handleProductSelect(product)}
                                    className="w-full px-4 py-3 text-left hover:bg-orange-50 border-b border-slate-50 last:border-0 transition-colors"
                                >
                                    <div className="font-medium text-slate-800">{product.Product_Name} ({product.Product_ID})</div>
                                    <div className="text-xs text-slate-500 mt-1">
                                        Available: {product.Total_Available_Units} units from {product.cases?.length || 0} case(s)
                                        {product.PO_ID && ` | PO: ${product.PO_ID}`}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {selectedProduct && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                    <div className="flex justify-between items-start">
                        <div>
                            <div className="font-semibold text-blue-900">{selectedProduct.Product_Name}</div>
                            <div className="text-sm text-blue-700 mt-1">Total Available: <span className="font-bold">{selectedProduct.Total_Available_Units} units</span></div>
                        </div>
                        <TrendingUp className="text-blue-600" size={20} />
                    </div>
                    
                    {selectedProduct.cases && selectedProduct.cases.length > 0 && (
                        <div className="bg-white rounded p-3 space-y-2 max-h-40 overflow-y-auto">
                            <div className="text-xs font-semibold text-slate-600 uppercase">Available Cases (Sorted by Expiry)</div>
                            {selectedProduct.cases.map((c, idx) => (
                                <div key={idx} className="text-xs flex justify-between items-center bg-slate-50 p-2 rounded">
                                    <span className="text-slate-700">
                                        <span className="font-medium">{c.caseLabel}</span> - {c.availableUnits} units
                                    </span>
                                    <span className="text-slate-500 flex items-center gap-1">
                                        <Calendar size={12} />
                                        {formatDate(c.expd)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Units to Add to Warehouse *</label>
                <input
                    type="number"
                    min="1"
                    max={selectedProduct?.Total_Available_Units || 999999}
                    value={unitsToAdd}
                    onChange={e => setUnitsToAdd(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                    placeholder={selectedProduct ? `Max: ${selectedProduct.Total_Available_Units}` : '0'}
                    disabled={!selectedProduct}
                />
            </div>

            {unitsRequested > 0 && selectedProduct && (
                <div className={clsx("border rounded-lg p-4 space-y-3", 
                    canFullyAllocate ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200")}>
                    <div className={clsx("font-medium", canFullyAllocate ? "text-green-900" : "text-amber-900")}>
                        Case Allocation Breakdown:
                    </div>
                    
                    {allocationBreakdown.length > 0 ? (
                        <div className="space-y-2">
                            {allocationBreakdown.map((allocation, idx) => (
                                <div key={idx} className="bg-white rounded p-3 flex items-center justify-between text-sm border border-slate-100">
                                    <div>
                                        <div className="font-semibold text-slate-700">{allocation.caseLabel}</div>
                                        <div className="text-xs text-slate-500">
                                            Expires: {formatDate(allocation.expd)}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-bold text-green-600">{allocation.allocatedUnits} units</div>
                                        <div className="text-xs text-slate-500">
                                            of {allocation.availableUnits} available
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <div className="bg-slate-100 rounded p-3 flex justify-between items-center font-semibold text-slate-700 border border-slate-200">
                                <span>Total to Add:</span>
                                <span className="text-lg text-green-600">{allocationBreakdown.reduce((sum, b) => sum + b.allocatedUnits, 0)} units</span>
                            </div>
                        </div>
                    ) : (
                        <div className={clsx("text-sm", canFullyAllocate ? "text-green-700" : "text-amber-700")}>
                            Will take <strong>{unitsRequested}</strong> units from available cases
                            (starting with soonest expiry date)
                        </div>
                    )}
                </div>
            )}

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <input
                    type="text"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                    placeholder="e.g., Stock verification or reason for transfer"
                />
            </div>

            <div className="flex gap-3 pt-4">
                <button type="button" onClick={onCancel} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 text-sm font-medium" disabled={saving}>
                    Cancel
                </button>
                <button type="submit" className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium disabled:opacity-50" disabled={saving || !isValidQuantity}>
                    {saving ? 'Adding...' : 'Add to Warehouse'}
                </button>
            </div>

            {noProducts && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700">
                    <AlertCircle className="inline-block mr-2" size={16} />
                    No purchased products available. Please receive products from vendors first.
                </div>
            )}
        </form>
    );
};

// Add Stock Form (Manual/Legacy)
const AddStockForm = ({ products, onSave, onCancel, saving }) => {
    const [form, setForm] = useState({
        product_id: '',
        product_name: '',
        units_received: '',
        units_per_case: '',
        notes: ''
    });

    const handleProductSelect = (productId) => {
        const product = products.find(p => p.Product_ID === productId);
        setForm({
            ...form,
            product_id: productId,
            product_name: product?.Name || ''
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(form);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Select Product *</label>
                <select
                    value={form.product_id}
                    onChange={e => handleProductSelect(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                    required
                >
                    <option value="">-- Select a product --</option>
                    {products.map(p => (
                        <option key={p.Product_ID} value={p.Product_ID}>{p.Name} ({p.Product_ID})</option>
                    ))}
                </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Units Received *</label>
                    <input
                        type="number"
                        min="1"
                        value={form.units_received}
                        onChange={e => setForm({ ...form, units_received: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                        placeholder="e.g., 90"
                        required
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Units Per Case *</label>
                    <input
                        type="number"
                        min="1"
                        value={form.units_per_case}
                        onChange={e => setForm({ ...form, units_per_case: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                        placeholder="e.g., 90"
                        required
                    />
                </div>
            </div>
            {form.units_received && form.units_per_case && (
                <div className="bg-blue-50 p-3 rounded-lg text-sm">
                    <span className="text-blue-600">
                        Receiving <strong>{Math.floor(form.units_received / form.units_per_case)}</strong> full case(s)
                        + <strong>{form.units_received % form.units_per_case}</strong> loose units
                    </span>
                </div>
            )}
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <input
                    type="text"
                    value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                    placeholder="e.g., Partial case from PO-2026-001"
                />
            </div>
            <div className="flex gap-3 pt-4">
                <button type="button" onClick={onCancel} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 text-sm font-medium" disabled={saving}>
                    Cancel
                </button>
                <button type="submit" className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50" disabled={saving}>
                    {saving ? 'Adding...' : 'Add Stock (Manual)'}
                </button>
            </div>
        </form>
    );
};

// Transfer Form
const TransferForm = ({ warehouseItem, machines, refillers, onSave, onCancel, saving }) => {
    const [form, setForm] = useState({
        refiller_id: '',
        refiller_name: '',
        units: ''
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({
            product_id: warehouseItem.productId,
            refiller_id: form.refiller_id,
            refiller_name: form.refiller_name,
            units: parseInt(form.units)
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-slate-50 p-4 rounded-lg">
                <div className="text-sm text-slate-500">Transferring from</div>
                <div className="font-semibold text-slate-800">{warehouseItem.productName}</div>
                <div className="text-xs text-slate-400 mt-1">Available: {warehouseItem.totalUnits} units ({warehouseItem.entries.length} cases tracked)</div>
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Refiller Name *</label>
                <select
                    value={form.refiller_id}
                    onChange={e => {
                        const selected = refillers.find(r => r.id === e.target.value);
                        setForm({ ...form, refiller_id: e.target.value, refiller_name: selected?.name || e.target.value });
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                    required
                >
                    <option value="">-- Select a refiller --</option>
                    {refillers.map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                    <option value="OTHER">Other (Enter manually)</option>
                </select>
                {form.refiller_id === 'OTHER' && (
                    <input
                        type="text"
                        value={form.refiller_name}
                        onChange={e => setForm({ ...form, refiller_name: e.target.value })}
                        className="w-full mt-2 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                        placeholder="Enter refiller name"
                        required
                    />
                )}
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Units to Transfer *</label>
                <input
                    type="number"
                    min="1"
                    max={warehouseItem.totalUnits}
                    value={form.units}
                    onChange={e => setForm({ ...form, units: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                    placeholder="100"
                    required
                />
                <div className="text-xs text-slate-400 mt-1">Max: {warehouseItem.totalUnits} units</div>
            </div>

            <div className="flex gap-3 pt-4">
                <button type="button" onClick={onCancel} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 text-sm font-medium" disabled={saving}>
                    Cancel
                </button>
                <button type="submit" className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50" disabled={saving || !form.units}>
                    {saving ? 'Transferring...' : 'Transfer'}
                </button>
            </div>
        </form>
    );
};

const Warehouse = () => {
    const { products, machines, warehouse_entries, warehouse, refills, loading, refreshData, transferFromWarehouse, deleteWarehouseItem } = useData();
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('name_asc');
    const [showAddModal, setShowAddModal] = useState(false);
    const [transferItem, setTransferItem] = useState(null);
    const [deleteItem, setDeleteItem] = useState(null);
    const [saving, setSaving] = useState(false);
    const [notification, setNotification] = useState(null);

    // Get unique refillers from refill history
    const refillers = useMemo(() => {
        const uniqueRefillers = new Map();
        (refills || []).forEach(r => {
            if (r.Refiller_ID && r.Refiller_ID !== 'WAREHOUSE') {
                uniqueRefillers.set(r.Refiller_ID, { id: r.Refiller_ID, name: r.Refiller_ID });
            }
        });
        return Array.from(uniqueRefillers.values());
    }, [refills]);

    // Calculate stats from warehouse entries (grouped by product)
    const stats = useMemo(() => {
        const productMap = new Map();
        (warehouse_entries || []).forEach(entry => {
            if (!productMap.has(entry.productId)) {
                productMap.set(entry.productId, { units: 0, entries: [] });
            }
            const product = productMap.get(entry.productId);
            product.units += entry.availableUnits || 0;
            product.entries.push(entry);
        });
        const totalUnits = Array.from(productMap.values()).reduce((sum, p) => sum + p.units, 0);
        const totalItems = productMap.size;
        return { totalUnits, totalItems, lowStock: 0, outOfStock: 0 };
    }, [warehouse_entries]);

    // Group warehouse entries by product and filter/sort
    const filteredWarehouse = useMemo(() => {
        const productMap = new Map();
        (warehouse_entries || []).forEach(entry => {
            if (!productMap.has(entry.productId)) {
                // Find product info from products array
                const productInfo = products.find(p => p.productId === entry.productId);
                productMap.set(entry.productId, {
                    productId: entry.productId,
                    productName: productInfo?.productName || entry.productId,
                    totalUnits: 0,
                    entries: []
                });
            }
            const product = productMap.get(entry.productId);
            product.totalUnits += entry.availableUnits || 0;
            product.entries.push(entry);
        });
        
        let filtered = Array.from(productMap.values());
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(p =>
                p.productId?.toLowerCase().includes(q) ||
                p.productName?.toLowerCase().includes(q)
            );
        }
        return filtered.sort((a, b) => {
            if (sortBy === 'name_asc') return (a.productName || '').localeCompare(b.productName || '');
            if (sortBy === 'name_desc') return (b.productName || '').localeCompare(a.productName || '');
            if (sortBy === 'units_high') return (b.totalUnits || 0) - (a.totalUnits || 0);
            if (sortBy === 'units_low') return (a.totalUnits || 0) - (b.totalUnits || 0);
            if (sortBy === 'last_received') return new Date(b.lastReceivedDate || 0) - new Date(a.lastReceivedDate || 0);
            return 0;
        });
    }, [warehouse_entries, searchQuery, sortBy, products]);

    const showNotification = (message, type = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 3000);
    };

    const handleAddFromPurchase = async (form) => {
        setSaving(true);
        try {
            const response = await fetch('http://localhost:3002/api/warehouse/add-from-purchase', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form)
            });
            const data = await response.json();
            setSaving(false);
            if (response.ok) {
                setShowAddModal(false);
                refreshData();
                showNotification(`Added ${form.units_to_add} units from ${data.cases_used.length} case(s) to warehouse`);
            } else {
                showNotification(data.error || 'Error adding to warehouse', 'error');
            }
        } catch (error) {
            setSaving(false);
            showNotification(error.message, 'error');
        }
    };



    const handleTransfer = async (data) => {
        setSaving(true);
        const result = await transferFromWarehouse(data.product_id, data.refiller_id || data.refiller_name, data.units);
        setSaving(false);
        if (result.success) {
            setTransferItem(null);
            showNotification(`Transferred ${data.units} units to ${data.refiller_name}. Remaining: ${result.remaining}`);
        } else {
            showNotification(result.error, 'error');
        }
    };



    const handleDelete = async () => {
        if (!deleteItem) return;
        setSaving(true);
        const result = await deleteWarehouseItem(deleteItem.productId);
        setSaving(false);
        if (result.success) {
            setDeleteItem(null);
            showNotification('Product entries removed from warehouse');
        } else {
            showNotification(result.error, 'error');
        }
    };

    if (loading) return null;

    return (
        <div className="space-y-6 pb-10">
            <Header title="Warehouse (Godown)" subtitle="Manage warehouse stock and machine transfers" />

            {/* Notification */}
            {notification && (
                <div className={clsx("mx-8 p-4 rounded-lg flex items-center gap-3",
                    notification.type === 'success' ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>
                    {notification.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                    {notification.message}
                </div>
            )}

            <div className="px-8 space-y-6">
                {/* KPIs */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <KPI title="Total Units in Warehouse" value={stats.totalUnits.toLocaleString()} highlight />
                    <KPI title="Products Tracked" value={stats.totalItems} />
                    <KPI title="Low Stock Items" value={stats.lowStock} subtext="Less than 1 case remaining" />
                    <KPI title="Out of Stock" value={stats.outOfStock} />
                </div>

                {/* Toolbar */}
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                    <div className="relative flex-1 w-full sm:max-w-md">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search by product name or ID..."
                            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-orange-500 bg-slate-50"
                        />
                    </div>
                    <div className="flex gap-3 w-full sm:w-auto">
                        <select
                            value={sortBy}
                            onChange={e => setSortBy(e.target.value)}
                            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500 bg-white"
                        >
                            <option value="name_asc">Name (A-Z)</option>
                            <option value="name_desc">Name (Z-A)</option>
                            <option value="units_high">Units (Highest)</option>
                            <option value="units_low">Units (Lowest)</option>
                            <option value="last_received">Last Received</option>
                        </select>
                        <button
                            onClick={() => setShowAddModal(true)}
                            className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm whitespace-nowrap"
                        >
                            <Plus size={16} /> Add from Purchase
                        </button>
                    </div>
                </div>

                {/* Warehouse Table */}
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-50">
                        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                            <WarehouseIcon size={20} className="text-orange-500" />
                            Warehouse Inventory
                        </h3>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                                <tr>
                                    <th className="px-6 py-4 font-medium">Product</th>
                                    <th className="px-6 py-4 font-medium">Total Units</th>
                                    <th className="px-6 py-4 font-medium">Cases (Tracking)</th>
                                    <th className="px-6 py-4 font-medium">Earliest Expiry</th>
                                    <th className="px-6 py-4 font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredWarehouse.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="px-6 py-8 text-center text-slate-400">
                                            {searchQuery ? 'No items match your search' : 'No items in warehouse. Add stock from purchased products to get started.'}
                                        </td>
                                    </tr>
                                ) : filteredWarehouse.map((product, idx) => {
                                    const earliestExpiry = product.entries
                                        .map(e => new Date(e.expd))
                                        .sort((a, b) => a - b)[0];
                                    const isExpired = earliestExpiry && earliestExpiry < new Date();
                                    const isExpiringSoon = earliestExpiry && 
                                        (earliestExpiry.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24) < 30;

                                    return (
                                        <tr key={product.productId || idx} className="border-b border-slate-50 hover:bg-slate-50/50">
                                            <td className="px-6 py-4">
                                                <div className="font-medium text-slate-700">{product.productName}</div>
                                                <div className="text-[10px] text-slate-400">{product.productId}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={clsx("font-semibold",
                                                    product.totalUnits === 0 ? "text-red-500" : "text-slate-800")}>
                                                    {product.totalUnits}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-slate-600">
                                                <div className="text-sm">{product.entries.length} case{product.entries.length !== 1 ? 's' : ''}</div>
                                                <div className="text-xs text-slate-400 space-y-1 mt-1">
                                                    {product.entries.slice(0, 2).map((entry, i) => (
                                                        <div key={i} className="truncate">{entry.caseLabel}</div>
                                                    ))}
                                                    {product.entries.length > 2 && <div className="text-slate-400">+{product.entries.length - 2} more</div>}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className={clsx("text-sm font-medium",
                                                    isExpired ? "text-red-600" :
                                                    isExpiringSoon ? "text-orange-600" : "text-slate-600")}>
                                                    {earliestExpiry ? new Date(earliestExpiry).toLocaleDateString(undefined, {
                                                        month: 'short',
                                                        day: 'numeric',
                                                        year: 'numeric'
                                                    }) : '-'}
                                                </div>
                                                {isExpired && <div className="text-xs text-red-500 font-semibold">EXPIRED</div>}
                                                {isExpiringSoon && !isExpired && <div className="text-xs text-orange-500 font-semibold">Expiring Soon</div>}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => setTransferItem(product)}
                                                        disabled={product.totalUnits === 0}
                                                        className={clsx("flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors",
                                                            product.totalUnits === 0
                                                                ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                                                                : "bg-green-50 text-green-600 hover:bg-green-100")}
                                                        title="Transfer to Machine"
                                                    >
                                                        <ArrowRight size={14} /> Transfer
                                                    </button>
                                                    <button
                                                        onClick={() => setDeleteItem(product)}
                                                        className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded"
                                                        title="Remove"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Info Card */}
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-6">
                    <h4 className="font-semibold text-blue-800 mb-2">Smart Warehouse Management</h4>
                    <ul className="text-sm text-blue-700 space-y-1">
                        <li>• <strong>Case-Level Tracking</strong>: Track expiry dates from purchased products at case level</li>
                        <li>• <strong>Smart Allocation</strong>: When adding to warehouse, automatically takes from cases expiring soonest first</li>
                        <li>• <strong>Maintain Expiry Awareness</strong>: All warehouse entries include MFD/EXP dates for monitoring</li>
                        <li>• <strong>Transfer to Machines</strong>: Move units to machines/refillers as needed</li>
                        <li>• <strong>Risk Tracking</strong>: Easily identify expiring or expired stock</li>
                        <li>• <strong>Historical Records</strong>: View case labels and accumulation history</li>
                    </ul>
                </div>
            </div>

            {/* Add Stock Modal */}
            <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add Stock from Purchased Products" size="lg">
                <AddFromPurchaseForm onSave={handleAddFromPurchase} onCancel={() => setShowAddModal(false)} saving={saving} />
            </Modal>

            {/* Transfer Modal */}
            <Modal isOpen={!!transferItem} onClose={() => setTransferItem(null)} title="Transfer to Refiller">
                {transferItem && (
                    <TransferForm
                        warehouseItem={transferItem}
                        machines={machines}
                        refillers={refillers}
                        onSave={handleTransfer}
                        onCancel={() => setTransferItem(null)}
                        saving={saving}
                    />
                )}
            </Modal>

            {/* Edit Modal */}
            
            <Modal isOpen={!!deleteItem} onClose={() => setDeleteItem(null)} title="Confirm Removal">
                <div className="space-y-4">
                    <p className="text-slate-600">
                        Remove all <span className="font-semibold">"{deleteItem?.productName}"</span> entries from warehouse?
                    </p>
                    <p className="text-sm text-slate-400">This will remove all case tracking for this product. The physical stock should be accounted for separately.</p>
                    <div className="flex gap-3 pt-4">
                        <button
                            onClick={() => setDeleteItem(null)}
                            className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 text-sm font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleDelete}
                            className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium"
                        >
                            Remove All Cases
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default Warehouse;

