import React, { useState, useMemo, useEffect } from 'react';
import Header from '../components/Header';
import { useData } from '../context/DataContext';
import { Warehouse as WarehouseIcon, Package, X, Search, AlertCircle, CheckCircle, Calendar, TrendingUp } from 'lucide-react';
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
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
                const response = await fetch('https://vendbees-inventory-backend-333114755202.asia-south1.run.app/api/warehouse/purchase-products');
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

const Warehouse = () => {
    const { products, warehouse_entries, warehouses, loading, refreshData } = useData();
    const [searchQuery, setSearchQuery] = useState('');
    const [detailSearchQuery, setDetailSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('name_asc');
    const [selectedWarehouseId, setSelectedWarehouseId] = useState(null);
    const [notification, setNotification] = useState(null);

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

    // Warehouse summary grouped by warehouse
    const warehouseSummary = useMemo(() => {
        const summary = {};

        // Ensure every warehouse is represented, even if it has no products yet.
        (warehouses || []).forEach(warehouse => {
            const warehouseId = warehouse.Warehouse_ID || warehouse.warehouseId || '';
            if (!warehouseId) return;
            summary[warehouseId] = {
                warehouseId,
                warehouseName: warehouse.Warehouse_Name || warehouse.warehouseName || warehouseId,
                location: warehouse.Location || warehouse.location || '',
                totalUnits: 0,
                casesCount: 0,
                productMap: {},
                entries: []
            };
        });

        (warehouse_entries || []).forEach(entry => {
            const warehouseId = entry.warehouseId || entry.Warehouse_ID || '';
            if (!warehouseId) return;
            if (!summary[warehouseId]) {
                summary[warehouseId] = {
                    warehouseId,
                    warehouseName: warehouseId,
                    location: '',
                    totalUnits: 0,
                    casesCount: 0,
                    productMap: {},
                    entries: []
                };
            }
            const group = summary[warehouseId];
            group.totalUnits += entry.availableUnits || 0;
            group.casesCount += 1;
            group.entries.push(entry);

            const productId = entry.productId || entry.Product_ID || '';
            if (!productId) return;
            if (!group.productMap[productId]) {
                const productInfo = (products || []).find(p => (p.Product_ID || p.productId) === productId);
                group.productMap[productId] = {
                    productId,
                    productName: productInfo?.Name || productInfo?.productName || productId,
                    totalUnits: 0,
                    cases: []
                };
            }
            const productGroup = group.productMap[productId];
            productGroup.totalUnits += entry.availableUnits || 0;
            productGroup.cases.push(entry);
        });

        return Object.values(summary).map(group => ({
            warehouseId: group.warehouseId,
            warehouseName: group.warehouseName,
            location: group.location,
            totalUnits: group.totalUnits,
            casesCount: group.casesCount,
            products: Object.values(group.productMap),
            entries: group.entries
        }));
    }, [warehouse_entries, warehouses, products]);

    const filteredWarehouseSummary = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return warehouseSummary;

        return warehouseSummary.filter(warehouse => {
            if (warehouse.warehouseId.toLowerCase().includes(q) ||
                warehouse.warehouseName.toLowerCase().includes(q) ||
                warehouse.location.toLowerCase().includes(q)) {
                return true;
            }

            if (warehouse.products.some(product =>
                (product.productId || '').toLowerCase().includes(q) ||
                (product.productName || '').toLowerCase().includes(q)
            )) {
                return true;
            }

            return warehouse.entries.some(entry =>
                (entry.productId || '').toLowerCase().includes(q) ||
                (entry.productName || '').toLowerCase().includes(q) ||
                (entry.caseLabel || '').toLowerCase().includes(q) ||
                (entry.poId || '').toLowerCase().includes(q)
            );
        });
    }, [searchQuery, warehouseSummary]);

    const selectedWarehouseGroups = useMemo(() => {
        if (!selectedWarehouseId) return [];
        const group = warehouseSummary.find(w => w.warehouseId === selectedWarehouseId);
        if (!group) return [];

        const entries = group.entries.map(entry => {
            const productInfo = products.find(p => (p.Product_ID || p.productId) === (entry.productId || entry.Product_ID));
            return {
                ...entry,
                productName: productInfo?.Name || productInfo?.productName || entry.productName || entry.Product_Name || '',
                poId: entry.poId || entry.PO_ID || ''
            };
        });

        const q = detailSearchQuery.trim().toLowerCase();
        const filtered = q ? entries.filter(e =>
            (e.productId || '').toLowerCase().includes(q) ||
            (e.productName || '').toLowerCase().includes(q) ||
            (e.caseLabel || '').toLowerCase().includes(q) ||
            (e.poId || '').toLowerCase().includes(q)
        ) : entries;

        // Group by PO_ID first, then by Product within each PO
        const grouped = filtered.reduce((acc, entry) => {
            const poId = entry.poId || 'NO_PO';
            const addedDate = entry.addedDate;
            const poKey = `PO::${poId}||${addedDate}`;
            
            if (!acc[poKey]) {
                acc[poKey] = {
                    poId: poId,
                    addedDate: addedDate,
                    products: {}, // Will contain products grouped under this PO
                    totalRows: 0
                };
            }
            
            // Group products within this PO
            const productKey = entry.productId || 'UNKNOWN';
            if (!acc[poKey].products[productKey]) {
                acc[poKey].products[productKey] = {
                    productId: entry.productId,
                    productName: entry.productName || '',
                    rows: []
                };
            }
            
            acc[poKey].products[productKey].rows.push(entry);
            acc[poKey].totalRows += 1;
            return acc;
        }, {});

        // Convert the nested structure to an array of PO groups
        return Object.values(grouped).sort((a, b) => {
            // Sort by PO ID
            return (a.poId || '').localeCompare(b.poId || '');
        });
    }, [selectedWarehouseId, warehouseSummary, products, detailSearchQuery]);

    const showNotification = (message, type = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 3000);
    };







    if (loading) return null;

    return (
        <div className="space-y-6 pb-10">
            <Header title="Warehouse (Godown)" subtitle="Browse warehouse stock by location and product" />

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
                            </div>
                </div>

                {/* Warehouse Inventory List */}
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-50">
                        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                            <WarehouseIcon size={20} className="text-orange-500" />
                            Warehouse Inventory
                        </h3>
                        <p className="text-sm text-slate-500 mt-2">Choose a warehouse card to view products stored there.</p>
                    </div>

                    <div className="p-6 space-y-6">
                        {filteredWarehouseSummary.length === 0 ? (
                            <div className="text-center text-slate-400 py-12">
                                No warehouse matches your search. Clear the search or try another filter.
                            </div>
                        ) : (
                            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                {filteredWarehouseSummary.map((warehouseItem) => {
                                    const earliestExpiry = warehouseItem.entries
                                        .map(e => new Date(e.expd))
                                        .filter(d => !Number.isNaN(d.getTime()))
                                        .sort((a, b) => a - b)[0];
                                    const isExpired = earliestExpiry && earliestExpiry < new Date();
                                    const isExpiringSoon = earliestExpiry &&
                                        (earliestExpiry.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24) < 30;

                                    return (
                                        <button
                                            key={warehouseItem.warehouseId}
                                            type="button"
                                            onClick={() => setSelectedWarehouseId(warehouseItem.warehouseId)}
                                            className={clsx(
                                                "text-left border rounded-2xl p-5 bg-slate-50 shadow-sm transition hover:shadow-md",
                                                selectedWarehouseId === warehouseItem.warehouseId ? 'border-orange-400 bg-orange-50' : 'border-slate-200'
                                            )}
                                        >
                                            <div className="flex items-start justify-between gap-4">
                                                <div>
                                                    <div className="font-semibold text-slate-800 text-lg">{warehouseItem.warehouseName}</div>
                                                    <div className="text-xs text-slate-500 mt-1">{warehouseItem.location || warehouseItem.warehouseId}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-2xl font-bold text-slate-800">{warehouseItem.totalUnits}</div>
                                                    <div className="text-xs text-slate-500">Units</div>
                                                </div>
                                            </div>

                                            <div className="mt-4 space-y-2 text-sm text-slate-600">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="font-medium">Products</span>
                                                    <span>{warehouseItem.products.length}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="font-medium">Cases tracked</span>
                                                    <span>{warehouseItem.casesCount}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="font-medium">Earliest expiry</span>
                                                    <span className={clsx(
                                                        isExpired ? 'text-red-600' : isExpiringSoon ? 'text-orange-600' : 'text-slate-600'
                                                    )}>
                                                        {earliestExpiry ? earliestExpiry.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}
                                                    </span>
                                                </div>
                                                {isExpired && <div className="text-xs text-red-500 font-semibold">Expired stock present</div>}
                                                {isExpiringSoon && !isExpired && <div className="text-xs text-orange-500 font-semibold">Expiring soon</div>}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {selectedWarehouseId && (
                            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                                    <div>
                                        <h4 className="font-semibold text-slate-800">{warehouseSummary.find(w => w.warehouseId === selectedWarehouseId)?.warehouseName}</h4>
                                        <div className="text-sm text-slate-500">{warehouseSummary.find(w => w.warehouseId === selectedWarehouseId)?.location || selectedWarehouseId}</div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedWarehouseId(null)}
                                        className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-slate-700 bg-white hover:bg-slate-100 text-sm"
                                    >
                                        Back to Warehouses
                                    </button>
                                </div>

                                <div className="mb-6">
                    <div className="relative max-w-md">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={detailSearchQuery}
                            onChange={e => setDetailSearchQuery(e.target.value)}
                            placeholder="Filter products, PO ID or case label within this warehouse..."
                            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500 bg-white"
                        />
                    </div>
                </div>
                {selectedWarehouseGroups.length === 0 ? (
                                    <div className="text-center text-slate-500 py-12">No products found in this warehouse.</div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full text-left text-sm divide-y divide-slate-200">
                                            <thead className="bg-slate-100 text-slate-700">
                                                <tr>
                                                    <th className="px-4 py-3 font-semibold">PO ID</th>
                                                    <th className="px-4 py-3 font-semibold">Received Date</th>
                                                    <th className="px-4 py-3 font-semibold">Product ID</th>
                                                    <th className="px-4 py-3 font-semibold">Product Name</th>
                                                    <th className="px-4 py-3 font-semibold">Case Label</th>
                                                    <th className="px-4 py-3 font-semibold">Available Units</th>
                                                    <th className="px-4 py-3 font-semibold">Expiry Date</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-slate-200">
                                                {selectedWarehouseGroups.map((poGroup) => {
                                                    const allProducts = Object.values(poGroup.products);
                                                    return allProducts.map((product, productIndex) => (
                                                        product.rows.map((entry, caseIndex) => {
                                                            // Show PO ID and Received Date only for first product's first case
                                                            const isFirstRow = productIndex === 0 && caseIndex === 0;
                                                            // Show Product ID and Name only for first case of this product
                                                            const isFirstProductCase = caseIndex === 0;
                                                            
                                                            return (
                                                                <tr key={`${poGroup.poId}-${product.productId}-${caseIndex}`} className="hover:bg-slate-50">
                                                                    {isFirstRow && (
                                                                        <>
                                                                            <td rowSpan={poGroup.totalRows} className="px-4 py-4 text-slate-700 font-medium align-top">{poGroup.poId || '-'}</td>
                                                                            <td rowSpan={poGroup.totalRows} className="px-4 py-4 text-slate-500 align-top">{poGroup.addedDate ? new Date(poGroup.addedDate).toLocaleDateString() : '-'}</td>
                                                                        </>
                                                                    )}
                                                                    {isFirstProductCase && (
                                                                        <>
                                                                            <td rowSpan={product.rows.length} className="px-4 py-4 text-slate-700 font-medium align-top">{product.productId}</td>
                                                                            <td rowSpan={product.rows.length} className="px-4 py-4 text-slate-700 align-top">{product.productName || '-'}</td>
                                                                        </>
                                                                    )}
                                                                    <td className="px-4 py-4 text-slate-700">{entry.caseLabel || '-'}</td>
                                                                    <td className="px-4 py-4 text-slate-700">{entry.availableUnits ?? 0}</td>
                                                                    <td className={clsx("px-4 py-4 font-medium", entry.expd && new Date(entry.expd) < new Date() ? 'text-red-600' : 'text-slate-700')}>
                                                                        {entry.expd ? new Date(entry.expd).toLocaleDateString() : '-'}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })
                                                    ));
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Info Card */}
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-6">
                    <h4 className="font-semibold text-blue-800 mb-2">Smart Warehouse Management</h4>
                    <ul className="text-sm text-blue-700 space-y-1">
                        <li>• <strong>Case-Level Tracking</strong>: Track expiry dates from purchased products at case level</li>
                        <li>• <strong>Smart Allocation</strong>: When adding to warehouse, automatically takes from cases expiring soonest first</li>
                        <li>• <strong>Maintain Expiry Awareness</strong>: All warehouse entries include MFD/EXP dates for monitoring</li>
                        <li>• <strong>Consolidated Product View</strong>: Inspect inventory per warehouse and product without direct transfer actions</li>
                        <li>• <strong>Risk Tracking</strong>: Easily identify expiring or expired stock</li>
                        <li>• <strong>Historical Records</strong>: View case labels and accumulation history</li>
                    </ul>
                </div>
            </div>

        </div>
    );
};

export default Warehouse;

