import React, { useState, useMemo } from 'react';
import Header from '../components/Header';
import { useData } from '../context/DataContext';
import { Warehouse as WarehouseIcon, Package, ArrowRight, Plus, Pencil, Trash2, X, Search, AlertCircle, CheckCircle } from 'lucide-react';
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

// Add Stock Form
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
                <button type="submit" className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium disabled:opacity-50" disabled={saving}>
                    {saving ? 'Adding...' : 'Add to Warehouse'}
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
        units: '',
        cases: ''
    });

    // Calculate units from cases or vice versa
    const handleCasesChange = (casesValue) => {
        const cases = parseInt(casesValue) || 0;
        const units = cases * warehouseItem.Units_Per_Case;
        setForm({ ...form, cases: casesValue, units: units.toString() });
    };

    const handleUnitsChange = (unitsValue) => {
        const units = parseInt(unitsValue) || 0;
        const cases = Math.floor(units / warehouseItem.Units_Per_Case);
        setForm({ ...form, units: unitsValue, cases: cases.toString() });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({
            product_id: warehouseItem.Product_ID,
            refiller_id: form.refiller_id,
            refiller_name: form.refiller_name,
            units: parseInt(form.units)
        });
    };

    const unitsToTransfer = parseInt(form.units) || 0;
    const casesEquivalent = Math.floor(unitsToTransfer / warehouseItem.Units_Per_Case);
    const looseUnits = unitsToTransfer % warehouseItem.Units_Per_Case;

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-slate-50 p-4 rounded-lg">
                <div className="text-sm text-slate-500">Transferring from</div>
                <div className="font-semibold text-slate-800">{warehouseItem.Product_Name}</div>
                <div className="text-xs text-slate-400 mt-1">Available: {warehouseItem.Available_Units} units ({Math.floor(warehouseItem.Available_Units / warehouseItem.Units_Per_Case)} cases + {warehouseItem.Available_Units % warehouseItem.Units_Per_Case} loose)</div>
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

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Cases to Transfer</label>
                    <input
                        type="number"
                        min="0"
                        max={Math.floor(warehouseItem.Available_Units / warehouseItem.Units_Per_Case)}
                        value={form.cases}
                        onChange={e => handleCasesChange(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                        placeholder="e.g., 2"
                    />
                    <div className="text-xs text-slate-400 mt-1">{warehouseItem.Units_Per_Case} units/case</div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Total Units *</label>
                    <input
                        type="number"
                        min="1"
                        max={warehouseItem.Available_Units}
                        value={form.units}
                        onChange={e => handleUnitsChange(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                        placeholder={`Max: ${warehouseItem.Available_Units}`}
                        required
                    />
                </div>
            </div>

            {unitsToTransfer > 0 && (
                <div className="bg-blue-50 p-3 rounded-lg text-sm">
                    <div className="text-blue-800 font-medium">Transfer Summary:</div>
                    <div className="text-blue-600 mt-1">
                        {casesEquivalent > 0 && <span><strong>{casesEquivalent}</strong> case{casesEquivalent > 1 ? 's' : ''}</span>}
                        {casesEquivalent > 0 && looseUnits > 0 && ' + '}
                        {looseUnits > 0 && <span><strong>{looseUnits}</strong> loose unit{looseUnits > 1 ? 's' : ''}</span>}
                        <span className="ml-2">= <strong>{unitsToTransfer}</strong> total units</span>
                    </div>
                </div>
            )}
            {form.units && (
                <div className="bg-green-50 p-3 rounded-lg text-sm">
                    <span className="text-green-600">
                        After transfer: <strong>{warehouseItem.Available_Units - unitsToTransfer}</strong> units remaining in warehouse
                    </span>
                </div>
            )}
            <div className="flex gap-3 pt-4">
                <button type="button" onClick={onCancel} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 text-sm font-medium" disabled={saving}>
                    Cancel
                </button>
                <button type="submit" className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50" disabled={saving || unitsToTransfer > warehouseItem.Available_Units || unitsToTransfer === 0}>
                    {saving ? 'Transferring...' : 'Transfer Stock'}
                </button>
            </div>
        </form>
    );
};

// Edit Form
const EditForm = ({ item, onSave, onCancel, saving }) => {
    const [form, setForm] = useState({
        available_units: item.Available_Units,
        units_per_case: item.Units_Per_Case,
        notes: item.Notes || ''
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(item.Product_ID, form);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-slate-50 p-3 rounded-lg">
                <div className="font-semibold text-slate-800">{item.Product_Name}</div>
                <div className="text-xs text-slate-400">{item.Product_ID}</div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Available Units</label>
                    <input
                        type="number"
                        min="0"
                        value={form.available_units}
                        onChange={e => setForm({ ...form, available_units: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                        required
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Units Per Case</label>
                    <input
                        type="number"
                        min="1"
                        value={form.units_per_case}
                        onChange={e => setForm({ ...form, units_per_case: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                        required
                    />
                </div>
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <input
                    type="text"
                    value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                />
            </div>
            <div className="flex gap-3 pt-4">
                <button type="button" onClick={onCancel} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 text-sm font-medium" disabled={saving}>
                    Cancel
                </button>
                <button type="submit" className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium disabled:opacity-50" disabled={saving}>
                    {saving ? 'Saving...' : 'Update'}
                </button>
            </div>
        </form>
    );
};

// Create Stock for Machine Form
const CreateStockForm = ({ warehouseItems, machines, onSave, onCancel, saving }) => {
    const [form, setForm] = useState({
        stock_name: '',
        machine_id: '',
        products: []
    });

    const [selectedProduct, setSelectedProduct] = useState('');
    const [selectedUnits, setSelectedUnits] = useState('');

    const handleAddProduct = () => {
        if (!selectedProduct || !selectedUnits) return;
        const item = warehouseItems.find(w => w.Product_ID === selectedProduct);
        if (!item) return;

        const exists = form.products.find(p => p.product_id === selectedProduct);
        if (exists) {
            setForm({
                ...form,
                products: form.products.map(p =>
                    p.product_id === selectedProduct
                        ? { ...p, units: parseInt(selectedUnits) }
                        : p
                )
            });
        } else {
            setForm({
                ...form,
                products: [...form.products, {
                    product_id: selectedProduct,
                    product_name: item.Product_Name,
                    units: parseInt(selectedUnits)
                }]
            });
        }
        setSelectedProduct('');
        setSelectedUnits('');
    };

    const handleRemoveProduct = (productId) => {
        setForm({
            ...form,
            products: form.products.filter(p => p.product_id !== productId)
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!form.stock_name || !form.machine_id || form.products.length === 0) return;
        onSave(form);
    };

    const totalUnits = form.products.reduce((sum, p) => sum + p.units, 0);

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Stock Name *</label>
                <input
                    type="text"
                    value={form.stock_name}
                    onChange={e => setForm({ ...form, stock_name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                    placeholder="e.g., Machine VM001 Stock-001"
                    required
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Assign to Machine *</label>
                <select
                    value={form.machine_id}
                    onChange={e => setForm({ ...form, machine_id: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                    required
                >
                    <option value="">-- Select a machine --</option>
                    {machines.map(m => (
                        <option key={m.Machine_ID} value={m.Machine_ID}>
                            {m.Machine_ID} - {m.Location}
                        </option>
                    ))}
                </select>
            </div>

            <div className="border-t border-slate-200 pt-4">
                <h4 className="font-medium text-slate-700 mb-3">Add Products to Stock</h4>
                <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Product</label>
                        <select
                            value={selectedProduct}
                            onChange={e => setSelectedProduct(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                        >
                            <option value="">-- Select --</option>
                            {warehouseItems.map(w => (
                                <option key={w.Product_ID} value={w.Product_ID}>
                                    {w.Product_Name} (Available: {w.Available_Units})
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Units</label>
                        <input
                            type="number"
                            min="1"
                            value={selectedUnits}
                            onChange={e => setSelectedUnits(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                            placeholder="Units"
                        />
                    </div>
                </div>
                <button
                    type="button"
                    onClick={handleAddProduct}
                    disabled={!selectedProduct || !selectedUnits}
                    className="w-full px-3 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-sm font-medium disabled:opacity-50 mb-4"
                >
                    + Add Product
                </button>

                {form.products.length > 0 && (
                    <div className="space-y-2">
                        {form.products.map((p, idx) => (
                            <div key={idx} className="flex justify-between items-center bg-slate-50 p-3 rounded-lg">
                                <div>
                                    <div className="font-medium text-slate-700">{p.product_name}</div>
                                    <div className="text-xs text-slate-500">{p.product_id}</div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="font-semibold text-slate-800">{p.units} units</span>
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveProduct(p.product_id)}
                                        className="text-red-500 hover:text-red-700"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                        <div className="bg-orange-50 p-3 rounded-lg border border-orange-200">
                            <div className="text-sm text-orange-700">
                                <strong>{form.products.length}</strong> product(s) | <strong>{totalUnits}</strong> total units
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex gap-3 pt-4">
                <button type="button" onClick={onCancel} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 text-sm font-medium" disabled={saving}>
                    Cancel
                </button>
                <button type="submit" className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium disabled:opacity-50" disabled={saving || form.products.length === 0}>
                    {saving ? 'Creating...' : 'Create Stock'}
                </button>
            </div>
        </form>
    );
};

const Warehouse = () => {
    const { products, machines, warehouse, refills, loading, refreshData, addToWarehouse, transferFromWarehouse, updateWarehouseItem, deleteWarehouseItem, createStockWithMachine } = useData();
    const [searchQuery, setSearchQuery] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [showCreateStockModal, setShowCreateStockModal] = useState(false);
    const [transferItem, setTransferItem] = useState(null);
    const [editItem, setEditItem] = useState(null);
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

    // Calculate stats
    const stats = useMemo(() => {
        const totalUnits = warehouse.reduce((sum, w) => sum + w.Available_Units, 0);
        const totalItems = warehouse.length;
        const lowStock = warehouse.filter(w => w.Available_Units > 0 && w.Available_Units < w.Units_Per_Case).length;
        const outOfStock = warehouse.filter(w => w.Available_Units === 0).length;
        return { totalUnits, totalItems, lowStock, outOfStock };
    }, [warehouse]);

    // Filter warehouse items
    const filteredWarehouse = useMemo(() => {
        if (!searchQuery) return warehouse;
        const q = searchQuery.toLowerCase();
        return warehouse.filter(w =>
            w.Product_ID?.toLowerCase().includes(q) ||
            w.Product_Name?.toLowerCase().includes(q)
        );
    }, [warehouse, searchQuery]);

    const showNotification = (message, type = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 3000);
    };

    const handleAddStock = async (form) => {
        setSaving(true);
        const result = await addToWarehouse(
            form.product_id,
            form.product_name,
            parseInt(form.units_received),
            parseInt(form.units_per_case),
            form.notes
        );
        setSaving(false);
        if (result.success) {
            setShowAddModal(false);
            showNotification(result.message);
        } else {
            showNotification(result.error, 'error');
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

    const handleCreateStock = async (form) => {
        setSaving(true);
        const result = await createStockWithMachine(form.stock_name, form.machine_id, form.products);
        setSaving(false);
        if (result.success) {
            setShowCreateStockModal(false);
            showNotification(`Created stock ${result.stock_id} for ${form.machine_id}`);
        } else {
            showNotification(result.error, 'error');
        }
    };

    const handleEdit = async (productId, updates) => {
        setSaving(true);
        const result = await updateWarehouseItem(productId, updates);
        setSaving(false);
        if (result.success) {
            setEditItem(null);
            showNotification('Warehouse item updated');
        } else {
            showNotification(result.error, 'error');
        }
    };

    const handleDelete = async () => {
        if (!deleteItem) return;
        setSaving(true);
        const result = await deleteWarehouseItem(deleteItem.Product_ID);
        setSaving(false);
        if (result.success) {
            setDeleteItem(null);
            showNotification('Item removed from warehouse');
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
                <div className="flex justify-between items-center gap-4 bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                    <div className="relative flex-1 max-w-md">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search by product name or ID..."
                            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-orange-500 bg-slate-50"
                        />
                    </div>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
                    >
                        <Plus size={16} /> Add Stock
                    </button>
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
                                    <th className="px-6 py-4 font-medium">Available Units</th>
                                    <th className="px-6 py-4 font-medium">Units/Case</th>
                                    <th className="px-6 py-4 font-medium">Cases Equivalent</th>
                                    <th className="px-6 py-4 font-medium">Last Received</th>
                                    <th className="px-6 py-4 font-medium">Notes</th>
                                    <th className="px-6 py-4 font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredWarehouse.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" className="px-6 py-8 text-center text-slate-400">
                                            {searchQuery ? 'No items match your search' : 'No items in warehouse. Add stock to get started.'}
                                        </td>
                                    </tr>
                                ) : filteredWarehouse.map((item, idx) => {
                                    const fullCases = Math.floor(item.Available_Units / item.Units_Per_Case);
                                    const looseUnits = item.Available_Units % item.Units_Per_Case;
                                    const isLowStock = item.Available_Units > 0 && item.Available_Units < item.Units_Per_Case;
                                    
                                    return (
                                        <tr key={item.Product_ID || idx} className="border-b border-slate-50 hover:bg-slate-50/50">
                                            <td className="px-6 py-4">
                                                <div className="font-medium text-slate-700">{item.Product_Name}</div>
                                                <div className="text-[10px] text-slate-400">{item.Product_ID}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={clsx("font-semibold",
                                                    item.Available_Units === 0 ? "text-red-500" :
                                                    isLowStock ? "text-yellow-600" : "text-slate-800")}>
                                                    {item.Available_Units}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-slate-600">{item.Units_Per_Case}</td>
                                            <td className="px-6 py-4 text-slate-600">
                                                {fullCases > 0 && <span className="font-semibold">{fullCases} case{fullCases > 1 ? 's' : ''}</span>}
                                                {fullCases > 0 && looseUnits > 0 && ' + '}
                                                {looseUnits > 0 && <span className="text-orange-500">{looseUnits} loose</span>}
                                                {item.Available_Units === 0 && <span className="text-red-400">None</span>}
                                            </td>
                                            <td className="px-6 py-4 text-slate-500">{item.Last_Received_Date || '-'}</td>
                                            <td className="px-6 py-4 text-slate-500 max-w-[150px] truncate" title={item.Notes}>{item.Notes || '-'}</td>
                                            <td className="px-6 py-4">
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => setTransferItem(item)}
                                                        disabled={item.Available_Units === 0}
                                                        className={clsx("flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors",
                                                            item.Available_Units === 0 
                                                                ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                                                                : "bg-green-50 text-green-600 hover:bg-green-100")}
                                                        title="Transfer to Machine"
                                                    >
                                                        <ArrowRight size={14} /> Transfer
                                                    </button>
                                                    <button
                                                        onClick={() => setEditItem(item)}
                                                        className="text-blue-500 hover:text-blue-700 p-1 hover:bg-blue-50 rounded"
                                                        title="Edit"
                                                    >
                                                        <Pencil size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => setDeleteItem(item)}
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
                    <h4 className="font-semibold text-blue-800 mb-2">How Warehouse Stock Works</h4>
                    <ul className="text-sm text-blue-700 space-y-1">
                        <li>• When you buy products via PO, add the received units here</li>
                        <li>• Products are stored as loose units (e.g., 1 case of 90 = 90 units)</li>
                        <li>• Transfer units to machines as needed for refilling</li>
                        <li>• Remaining partial case units stay in warehouse for future use</li>
                        <li>• During PO creation, check warehouse first to use existing stock</li>
                    </ul>
                </div>
            </div>

            {/* Add Stock Modal */}
            <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add Stock to Warehouse">
                <AddStockForm
                    products={products}
                    onSave={handleAddStock}
                    onCancel={() => setShowAddModal(false)}
                    saving={saving}
                />
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
            <Modal isOpen={!!editItem} onClose={() => setEditItem(null)} title="Edit Warehouse Item">
                {editItem && (
                    <EditForm
                        item={editItem}
                        onSave={handleEdit}
                        onCancel={() => setEditItem(null)}
                        saving={saving}
                    />
                )}
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal isOpen={!!deleteItem} onClose={() => setDeleteItem(null)} title="Confirm Removal">
                <div className="space-y-4">
                    <p className="text-slate-600">
                        Remove <span className="font-semibold">"{deleteItem?.Product_Name}"</span> from warehouse tracking?
                    </p>
                    <p className="text-sm text-slate-400">This only removes the tracking entry. The physical stock should be accounted for.</p>
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
                            Remove Item
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default Warehouse;
