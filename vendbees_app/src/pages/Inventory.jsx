import React, { useState, useMemo, useEffect } from 'react';
import Header from '../components/Header';
import { useData } from '../context/DataContext';
import { Package, Truck, IndianRupee, Filter, Plus, Pencil, Trash2, Eye, X, Search, Warehouse, AlertCircle, Info, ChevronDown, ChevronRight, CheckCircle, Download } from 'lucide-react';
import clsx from 'clsx';

const KPI = ({ title, value, subtext }) => (
    <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
        <div className="text-sm text-slate-500 font-medium">{title}</div>
        <div className="text-3xl font-bold text-slate-800 mt-2">{value}</div>
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
            <div className={`bg-white rounded-xl shadow-xl w-full ${sizeClasses[size]} mx-4 max-h-[90vh] overflow-hidden flex flex-col`} onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-6 border-b border-slate-100 shrink-0">
                    <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                </div>
                <div className="p-6 overflow-y-auto overflow-x-auto">{children}</div>
            </div>
        </div>
    );
};

// Product Form Component
const ProductForm = ({ product, onSave, onCancel, categories, saving }) => {
    const [form, setForm] = useState(product || {
        Product_ID: '',
        Name: '',
        Category: categories[0] || 'CHIPS',
        Unit_Cost: '',
        GST: 0.05,
        MRP: '',
        Quantity: 0
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({
            ...form,
            Unit_Cost: parseFloat(form.Unit_Cost) || 0,
            GST: parseFloat(form.GST) || 0,
            MRP: parseFloat(form.MRP) || 0,
            Quantity: parseInt(form.Quantity) || 0,
            Landed_Cost: (parseFloat(form.Unit_Cost) || 0) * (1 + (parseFloat(form.GST) || 0))
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Product ID *</label>
                    <input
                        type="text"
                        value={form.Product_ID}
                        onChange={e => setForm({ ...form, Product_ID: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                        placeholder="e.g., LSWPW001"
                        required
                        disabled={!!product}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                    <select
                        value={form.Category}
                        onChange={e => setForm({ ...form, Category: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                    >
                        {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                </div>
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Product Name *</label>
                <input
                    type="text"
                    value={form.Name}
                    onChange={e => setForm({ ...form, Name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                    placeholder="e.g., LAYS SALT WITH PEPPER WAFER CHIPS"
                    required
                />
            </div>
            <div className="grid grid-cols-3 gap-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">PO Price (₹) *</label>
                    <input
                        type="number"
                        step="0.01"
                        value={form.Unit_Cost}
                        onChange={e => setForm({ ...form, Unit_Cost: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                        placeholder="0.00"
                        required
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">GST Rate</label>
                    <select
                        value={form.GST}
                        onChange={e => setForm({ ...form, GST: parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                    >
                        <option value={0}>0%</option>
                        <option value={0.05}>5%</option>
                        <option value={0.12}>12%</option>
                        <option value={0.18}>18%</option>
                        <option value={0.28}>28%</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">MRP (₹) *</label>
                    <input
                        type="number"
                        step="0.01"
                        value={form.MRP}
                        onChange={e => setForm({ ...form, MRP: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                        placeholder="0.00"
                        required
                    />
                </div>
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Initial Quantity</label>
                <input
                    type="number"
                    value={form.Quantity}
                    onChange={e => setForm({ ...form, Quantity: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                    placeholder="0"
                />
            </div>
            <div className="bg-slate-50 p-3 rounded-lg text-sm">
                <span className="text-slate-500">Landed Cost (PO + GST): </span>
                <span className="font-bold text-slate-800">
                    ₹{((parseFloat(form.Unit_Cost) || 0) * (1 + (parseFloat(form.GST) || 0))).toFixed(2)}
                </span>
            </div>
            <div className="flex gap-3 pt-4">
                <button type="button" onClick={onCancel} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 text-sm font-medium" disabled={saving}>
                    Cancel
                </button>
                <button type="submit" className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium disabled:opacity-50" disabled={saving}>
                    {saving ? 'Saving...' : (product ? 'Update Product' : 'Add Product')}
                </button>
            </div>
        </form>
    );
};

// PO Creation Form with Warehouse Recommendations
const POForm = ({ products, vendors, warehouse, onSave, onCancel, saving }) => {
    const [form, setForm] = useState({
        product_id: '',
        vendor_id: '',
        cases: '',
        units_per_case: '',
        po_price: '',
        notes: ''
    });

    const selectedProduct = products.find(p => p.Product_ID === form.product_id);
    const warehouseStock = warehouse.find(w => w.Product_ID === form.product_id);

    // Get vendor for selected product based on product name pattern
    const suggestedVendor = useMemo(() => {
        if (!selectedProduct) return null;
        const productName = selectedProduct.Name?.toUpperCase() || '';
        return vendors.find(v => {
            const vendorProduct = (v.Product_Name || '').toUpperCase();
            return productName.startsWith(vendorProduct);
        });
    }, [selectedProduct, vendors]);

    const handleProductSelect = (productId) => {
        setForm({
            ...form,
            product_id: productId,
            vendor_id: suggestedVendor?.Vendor_ID || ''
        });
    };

    // Calculate total units needed
    const totalUnitsOrdered = (parseInt(form.cases) || 0) * (parseInt(form.units_per_case) || 0);
    const warehouseAvailable = warehouseStock?.Available_Units || 0;
    const recommendation = warehouseAvailable > 0 ? Math.ceil(warehouseAvailable / (parseInt(form.units_per_case) || 1)) : 0;

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({
            ...form,
            product_name: selectedProduct?.Name,
            total_units: totalUnitsOrdered,
            warehouse_available: warehouseAvailable
        });
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

            {/* Warehouse Recommendation */}
            {form.product_id && (
                <div className={clsx("p-4 rounded-lg border",
                    warehouseAvailable > 0 ? "bg-green-50 border-green-200" : "bg-slate-50 border-slate-200")}>
                    <div className="flex items-start gap-3">
                        <Warehouse size={20} className={warehouseAvailable > 0 ? "text-green-600" : "text-slate-400"} />
                        <div>
                            <div className="font-medium text-slate-800">Warehouse Stock Available</div>
                            {warehouseAvailable > 0 ? (
                                <>
                                    <div className="text-sm text-green-700 mt-1">
                                        <strong>{warehouseAvailable}</strong> units available in warehouse
                                        {warehouseStock?.Units_Per_Case && (
                                            <span> ({Math.floor(warehouseAvailable / warehouseStock.Units_Per_Case)} cases + {warehouseAvailable % warehouseStock.Units_Per_Case} loose)</span>
                                        )}
                                    </div>
                                    <div className="text-xs text-green-600 mt-1 flex items-center gap-1">
                                        <Info size={12} />
                                        Consider using warehouse stock before ordering new cases
                                    </div>
                                </>
                            ) : (
                                <div className="text-sm text-slate-500 mt-1">No stock in warehouse for this product</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Vendor *</label>
                <select
                    value={form.vendor_id}
                    onChange={e => setForm({ ...form, vendor_id: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                    required
                >
                    <option value="">-- Select vendor --</option>
                    {vendors.filter(v => v.Vendor_ID).map(v => (
                        <option key={v.Vendor_ID} value={v.Vendor_ID}>{v.Name} ({v.Vendor_ID})</option>
                    ))}
                </select>
                {suggestedVendor && form.vendor_id !== suggestedVendor.Vendor_ID && (
                    <div className="text-xs text-orange-500 mt-1">
                        Suggested: {suggestedVendor.Name} ({suggestedVendor.Vendor_ID})
                    </div>
                )}
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Number of Cases *</label>
                    <input
                        type="number"
                        min="1"
                        value={form.cases}
                        onChange={e => setForm({ ...form, cases: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                        placeholder="e.g., 2"
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

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">PO Price (Total) *</label>
                <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₹</span>
                    <input
                        type="number"
                        step="0.01"
                        value={form.po_price}
                        onChange={e => setForm({ ...form, po_price: e.target.value })}
                        className="w-full pl-8 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                        placeholder="0.00"
                        required
                    />
                </div>
            </div>

            {totalUnitsOrdered > 0 && (
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <div className="text-sm text-blue-800">
                        <strong>Order Summary:</strong> {form.cases} case(s) × {form.units_per_case} units = <strong>{totalUnitsOrdered} total units</strong>
                    </div>
                    {warehouseAvailable > 0 && (
                        <div className="text-xs text-blue-600 mt-1">
                            + {warehouseAvailable} from warehouse = {totalUnitsOrdered + warehouseAvailable} units available for distribution
                        </div>
                    )}
                </div>
            )}

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <input
                    type="text"
                    value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                    placeholder="Optional notes for this PO"
                />
            </div>

            <div className="flex gap-3 pt-4">
                <button type="button" onClick={onCancel} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 text-sm font-medium" disabled={saving}>
                    Cancel
                </button>
                <button type="submit" className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium disabled:opacity-50" disabled={saving}>
                    {saving ? 'Creating...' : 'Create PO'}
                </button>
            </div>
        </form>
    );
};

// Multi-Product PO Form - Groups products by vendor, creates separate PO per vendor
const MultiPOForm = ({ products, vendors, warehouse, onSave, onCancel, saving }) => {
    // Global vendor selection - filter products by this vendor
    const [selectedVendor, setSelectedVendor] = useState('');

    const [items, setItems] = useState([{
        id: 1,
        product_id: '',
        product_name: '',
        no_of_cases: '',
        units_per_case: '',
        po_price_per_unit: ''
    }]);

    // Filter products by selected vendor (using Vendor_ID column in Product_Master)
    const filteredProducts = useMemo(() => {
        if (!selectedVendor) return [];
        return products.filter(p => p.Vendor_ID === selectedVendor);
    }, [products, selectedVendor]);

    // Get unique vendors (only those with valid Vendor_ID)
    const uniqueVendors = useMemo(() => {
        return vendors.filter(v => v.Vendor_ID);
    }, [vendors]);

    // Add a new product row
    const addProductRow = () => {
        setItems([...items, {
            id: Date.now(),
            product_id: '',
            product_name: '',
            no_of_cases: '',
            units_per_case: '',
            po_price_per_unit: ''
        }]);
    };

    // Remove a product row
    const removeProductRow = (id) => {
        if (items.length > 1) {
            setItems(items.filter(item => item.id !== id));
        }
    };

    // Reset items when vendor changes
    const handleVendorChange = (vendorId) => {
        setSelectedVendor(vendorId);
        setItems([{
            id: Date.now(),
            product_id: '',
            product_name: '',
            no_of_cases: '',
            units_per_case: '',
            po_price_per_unit: ''
        }]);
    };

    // Update a specific item
    const updateItem = (id, field, value) => {
        setItems(items.map(item => {
            if (item.id === id) {
                const updated = { ...item, [field]: value };
                // Auto-fill product details when product is selected
                if (field === 'product_id') {
                    const product = products.find(p => p.Product_ID === value);
                    if (product) {
                        updated.product_name = product.Name || '';
                        // Auto-fill Units Per Case from Product_Master
                        updated.units_per_case = product.Units_Per_Case || '';
                        // Auto-fill PO Price (price per unit) from Product_Master
                        updated.po_price_per_unit = product.Unit_Cost || '';
                    }
                }
                return updated;
            }
            return item;
        }));
    };

    // Calculate totals for preview
    const poSummary = useMemo(() => {
        let totalUnits = 0;
        let grandTotal = 0;
        const validItems = [];

        items.forEach(item => {
            if (item.product_id && item.no_of_cases && item.units_per_case) {
                const lineUnits = (parseInt(item.no_of_cases) || 0) * (parseInt(item.units_per_case) || 0);
                const lineTotal = lineUnits * (parseFloat(item.po_price_per_unit) || 0);
                totalUnits += lineUnits;
                grandTotal += lineTotal;
                validItems.push({
                    ...item,
                    total_units: lineUnits,
                    line_total: lineTotal
                });
            }
        });

        return { totalUnits, grandTotal, validItems, vendorName: vendors.find(v => v.Vendor_ID === selectedVendor)?.Name || '' };
    }, [items, selectedVendor, vendors]);

    const handleSubmit = (e) => {
        e.preventDefault();
        
        // Generate PO_ID: VP-YYYYMMDDHHMMSS-VendorID
        const now = new Date();
        const timeStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
        const generatedPoId = `VP-${timeStr}-${selectedVendor || 'UNKNOWN'}`;
        
        // Format for API - include vendor_id and po_id in each item
        const validItems = items.filter(item =>
            item.product_id && item.no_of_cases && item.units_per_case
        ).map(item => {
            return {
                po_id: generatedPoId,  // All items in this batch share the same PO_ID
                product_id: item.product_id,
                product_name: item.product_name,
                vendor_id: selectedVendor,
                no_of_cases: parseInt(item.no_of_cases),
                units_per_case: parseInt(item.units_per_case),
                po_price: parseFloat(item.po_price_per_unit) || 0  // price per single unit
            };
        });

        if (validItems.length === 0) {
            alert('Please add at least one product with all required fields');
            return;
        }

        onSave(validItems);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {/* Vendor Selection - FIRST */}
            <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                <label className="block text-sm font-semibold text-orange-800 mb-2">Step 1: Select Vendor *</label>
                <select
                    value={selectedVendor}
                    onChange={e => handleVendorChange(e.target.value)}
                    className="w-full px-3 py-2 border border-orange-300 rounded-lg text-sm focus:outline-none focus:border-orange-500 bg-white"
                    required
                >
                    <option value="">-- Select a Vendor --</option>
                    {uniqueVendors.map(v => (
                        <option key={v.Vendor_ID} value={v.Vendor_ID}>
                            {v.Name} ({v.Vendor_ID})
                        </option>
                    ))}
                </select>
                {selectedVendor && (
                    <div className="text-xs text-orange-600 mt-2">
                        {filteredProducts.length} product(s) available from this vendor
                    </div>
                )}
            </div>

            {/* Product Items - only show if vendor selected */}
            {selectedVendor && (
                <>
                    <div className="space-y-3 max-h-[35vh] overflow-y-auto pr-2">
                        {items.map((item, index) => (
                            <div key={item.id} className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-medium text-slate-600">Product #{index + 1}</span>
                                    {items.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removeProductRow(item.id)}
                                            className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded"
                                            title="Remove"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Product *</label>
                                    <select
                                        value={item.product_id}
                                        onChange={e => updateItem(item.id, 'product_id', e.target.value)}
                                        className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-orange-500"
                                        required
                                    >
                                        <option value="">-- Select Product --</option>
                                        {filteredProducts.map(p => (
                                            <option key={p.Product_ID} value={p.Product_ID}>
                                                {p.Name} ({p.Product_ID})
                                            </option>
                                        ))}
                                    </select>
                                    {filteredProducts.length === 0 && (
                                        <div className="text-xs text-red-500 mt-1">
                                            No products mapped to this vendor
                                        </div>
                                    )}
                                    {/* Warehouse Stock Info */}
                                    {item.product_id && (() => {
                                        const whStock = warehouse.find(w => w.Product_ID === item.product_id);
                                        if (whStock && whStock.Available_Units > 0) {
                                            return (
                                                <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs">
                                                    <span className="text-amber-700 font-medium">
                                                        ⚠️ {whStock.Available_Units} units already available in warehouse
                                                    </span>
                                                </div>
                                            );
                                        }
                                        return null;
                                    })()}
                                </div>

                                <div className="grid grid-cols-3 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">No. of Cases *</label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={item.no_of_cases}
                                            onChange={e => updateItem(item.id, 'no_of_cases', e.target.value)}
                                            className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-orange-500"
                                            placeholder="e.g., 2"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">Units/Case *</label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={item.units_per_case}
                                            onChange={e => updateItem(item.id, 'units_per_case', e.target.value)}
                                            className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-orange-500"
                                            placeholder="e.g., 90"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">Price/Unit (₹)</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={item.po_price_per_unit}
                                            onChange={e => updateItem(item.id, 'po_price_per_unit', e.target.value)}
                                            className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-orange-500"
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>

                                {/* Line total preview */}
                                {item.no_of_cases && item.units_per_case && (
                                    <div className="text-xs text-slate-500 bg-white p-2 rounded flex justify-between">
                                        <span>Total: {(parseInt(item.no_of_cases) || 0) * (parseInt(item.units_per_case) || 0)} units</span>
                                        {item.po_price_per_unit && (
                                            <span className="font-medium text-slate-700">
                                                Line Total: ₹{((parseInt(item.no_of_cases) || 0) * (parseInt(item.units_per_case) || 0) * (parseFloat(item.po_price_per_unit) || 0)).toFixed(2)}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Add Product Button */}
                    <button
                        type="button"
                        onClick={addProductRow}
                        className="w-full py-2 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-orange-400 hover:text-orange-500 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                    >
                        <Plus size={16} /> Add Another Product
                    </button>
                </>
            )}

            {/* PO Summary */}
            {selectedVendor && poSummary.validItems.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                    <h4 className="font-semibold text-blue-800 text-sm">PO Summary</h4>
                    <div className="bg-white rounded p-3 border border-blue-100">
                        <div className="flex justify-between items-center">
                            <span className="font-medium text-slate-700">{poSummary.vendorName}</span>
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                                1 PO will be created
                            </span>
                        </div>
                        <div className="text-sm text-slate-600 mt-2 space-y-1">
                            <div>{poSummary.validItems.length} product(s)</div>
                            <div>Total Units: <strong>{poSummary.totalUnits}</strong></div>
                            <div className="text-lg font-bold text-blue-800">
                                Grand Total: ₹{poSummary.grandTotal.toFixed(2)}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex gap-3 pt-4">
                <button type="button" onClick={onCancel} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 text-sm font-medium" disabled={saving}>
                    Cancel
                </button>
                <button type="submit" className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium disabled:opacity-50" disabled={saving || !selectedVendor || poSummary.validItems.length === 0}>
                    {saving ? 'Creating...' : 'Create PO'}
                </button>
            </div>
        </form>
    );
};

// Comprehensive Delivery Recording Form (for recording stock-in from vendor) - All products in PO + Custom products
const DeliveryRecordingForm = ({ poData, onSave, onCancel, saving, products = [], vendors = [] }) => {
    const today = new Date().toISOString().split('T')[0];
    // Use local backend for normalized delivery recording (falls back to production if not available)
    const API_URL = typeof window !== 'undefined' && window.location.hostname === 'localhost' 
        ? 'http://localhost:3002/api'
        : 'https://vendbees-inventory-backend-333114755202.asia-south1.run.app/api';

    // poData contains: { po_id, vendor_id, po_date, items: [{Product_ID, Product_Name, No_of_Cases, Units_Per_Case, PO_Price}] }
    const [purchaseDate, setPurchaseDate] = useState(today);
    const [paymentMode, setPaymentMode] = useState('Cash');
    const [paymentStatus, setPaymentStatus] = useState('Pending');
    const [gstFiled, setGstFiled] = useState('No');

    // Map of productId -> {productName, selfLife}
    const [productsMap, setProductsMap] = useState({});
    const [showCustomProductForm, setShowCustomProductForm] = useState(false);
    const [customProducts, setCustomProducts] = useState([]);
    const [newCustomProduct, setNewCustomProduct] = useState({
        product_id: '',
        product_name: '',
        case_count: 0,
        units_per_case: 1,
        po_price: '',
        batch: 1,
        mrp: '',
        cases: [] // Array of case objects for custom products
    });
    const [selectedItems, setSelectedItems] = useState({});

    // Extract vendor ID from PO data
    const vendorId = poData?.vendor_id;

    // Filter products by vendor
    const vendorProducts = useMemo(() => {
        if (!vendorId) return [];
        return products.filter(p => p.Vendor_ID === vendorId);
    }, [products, vendorId]);

    // Handle product selection for custom products
    const handleSelectProduct = (productId) => {
        if (!productId) {
            setNewCustomProduct({
                product_id: '',
                product_name: '',
                case_count: 0,
                units_per_case: 1,
                po_price: '',
                batch: 1,
                mrp: '',
                cases: []
            });
            return;
        }

        const selectedProduct = vendorProducts.find(p => p.Product_ID === productId);
        if (selectedProduct) {
            setNewCustomProduct({
                product_id: selectedProduct.Product_ID,
                product_name: selectedProduct.Name || selectedProduct.Product_Name || '',
                case_count: 0,
                units_per_case: selectedProduct.Units_Per_Case || 1,
                po_price: selectedProduct.PO_Price || selectedProduct.MRP || '',
                batch: 1,
                mrp: selectedProduct.MRP || '',
                cases: []
            });
        }
    };

    // Handle case count change for custom products
    const handleCustomProductCaseCountChange = (value) => {
        const caseCount = parseInt(value) || 0;
        const currentCases = (newCustomProduct.cases || []).length;
        
        let updatedCases = [...(newCustomProduct.cases || [])];
        
        if (caseCount > currentCases) {
            // Add new cases
            for (let i = currentCases; i < caseCount; i++) {
                const caseNumber = i + 1;
                const caseLabel = `Custom_${newCustomProduct.product_id}_c${caseNumber}`;
                updatedCases.push({
                    caseNumber: caseNumber,
                    unitsPerCase: newCustomProduct.units_per_case,
                    mfd: purchaseDate,
                    expd: '',
                    caseLabel: caseLabel
                });
            }
        } else if (caseCount < currentCases) {
            // Remove excess cases
            updatedCases = updatedCases.slice(0, caseCount);
        }
        
        setNewCustomProduct({
            ...newCustomProduct,
            case_count: caseCount,
            cases: updatedCases
        });
    };

    // Handle case field updates for custom products
    const updateCustomProductCase = (caseIndex, field, value) => {
        const updatedCases = [...(newCustomProduct.cases || [])];
        const caseData = updatedCases[caseIndex];
        
        // Sanitize date fields - ensure YYYY-MM-DD format or empty
        if ((field === 'mfd' || field === 'expd') && value) {
            const dateMatch = value.match(/^\d{4}-\d{2}-\d{2}/);
            caseData[field] = dateMatch ? dateMatch[0] : '';
        } else {
            caseData[field] = value;
        }
        
        // Auto-calculate expiry if mfd changed
        if (field === 'mfd' && caseData[field]) {
            const selfLifeDays = getSelfLife(newCustomProduct.product_id);
            caseData.expd = calculateExpiry(caseData[field], selfLifeDays);
        }
        
        setNewCustomProduct({
            ...newCustomProduct,
            cases: updatedCases
        });
    };

    // Initialize product structure with cases array
    const [productDetails, setProductDetails] = useState(() => {
        return (poData?.items || []).map(item => {
            // Find product in products array to get MRP
            const productInfo = products.find(p => p.Product_ID === item.Product_ID);
            return {
                product_id: item.Product_ID || '',
                product_name: item.Product_Name || '',
                ordered_cases: item.No_of_Cases || 0,
                units_per_case: item.Units_Per_Case || 1,
                po_price: item.PO_Price || '',
                mrp: productInfo?.MRP || '',
                batch: 1, // Default batch number
                case_count: 0, // Track how many cases to generate (for quantity calculation)
                cases: [] // Array of case objects: {caseNumber, unitsPerCase, mfd, expd, caseLabel}
            };
        });
    });

    // Convert shelf life from months to days if needed
    // If value < 50, treat as months and convert to days (multiply by 30)
    const convertToDays = (value) => {
        const num = parseInt(value) || 0;
        if (num === 0) return 0;
        // If value is less than 50, assume it's in months, convert to days
        if (num < 50) {
            return num * 30;
        }
        // Otherwise assume it's already in days
        return num;
    };

    // Map product IDs/names to default shelf life in days
    const getDefaultSelfLife = (productId, productName) => {
        const nameUpper = (productName || productId).toUpperCase();
        
        // Product-specific mappings based on popular FMCG brands
        const productMappings = {
            'BINGO': 180,           // ~6 months
            'LAYS': 180,            // ~6 months  
            'BRITANNIA': 365,       // ~12 months (biscuits)
            'PARLE': 365,           // ~12 months (biscuits)
            'DARK': 180,            // ~6 months
            'ELITE': 365,           // ~12 months (chocolate)
            'NABA': 180,            // ~6 months
            'RAAJ': 180,            // ~6 months
            'BAUL': 180,            // ~6 months
            'GAIA': 180,            // ~6 months
            'SUN': 180,             // ~6 months
            'LAVAZZA': 90,          // ~3 months (coffee)
            'DM': 90,               // ~3 months
            'KITK': 365,            // ~12 months (chocolate)
            'UNI': 365,             // ~12 months (biscuits)
            'FAB': 180,             // ~6 months
            'MOM': 365,             // ~12 months
            'CHAI': 90,             // ~3 months
            '7UP': 180,             // ~6 months (beverage)
            'SPRITE': 180,          // ~6 months
            'COKE': 180,            // ~6 months
            'PEPSI': 180,           // ~6 months
        };
        
        // Check for matching products
        for (const [pattern, days] of Object.entries(productMappings)) {
            if (nameUpper.includes(pattern)) {
                return days;
            }
        }
        
        // Default based on product category hints
        if (nameUpper.includes('CHIPS') || nameUpper.includes('SNACK') || nameUpper.includes('WAFER')) {
            return 180;  // 6 months
        } else if (nameUpper.includes('BISCUIT') || nameUpper.includes('COOKIE')) {
            return 365;  // 12 months
        } else if (nameUpper.includes('CHOCOLATE')) {
            return 365;  // 12 months
        } else if (nameUpper.includes('COFFEE') || nameUpper.includes('TEA')) {
            return 90;   // 3 months
        } else if (nameUpper.includes('DRINK') || nameUpper.includes('BEVERAGE') || nameUpper.includes('SODA')) {
            return 180;  // 6 months
        }
        
        // Default fallback
        return 90;  // 3 months
    };

    // Get product quantity from products table
    const getProductQuantity = (productId) => {
        const product = products?.find(p => p.Product_ID === productId);
        return product?.Quantity || 0;
    };

    // Fetch products with selfLife when component mounts or when products change
    useEffect(() => {
        try {
            const productIds = [...new Set((poData?.items || []).map(item => item.Product_ID))];
            console.log('DeliveryForm: PO Product IDs:', productIds);
            console.log('DeliveryForm: Products array length:', products?.length);
            if (productIds.length === 0 || !products || products.length === 0) return;

            // Get from dashboard products which have selfLife
            const pMap = {};
            
            // First, try to get from products array passed down (Product_Master data from Inventory page)
            products.forEach(p => {
                // Try multiple possible field names for product ID
                const productId = p.Product_ID || p.productId || p.PRODUCT_ID;
                // Get selfLife directly - convert months to days if needed
                let selfLife = convertToDays(p.selfLife || p.Self_Life || p.SELF_LIFE || 0);
                
                // If selfLife is still 0, use intelligent defaults
                if (selfLife === 0) {
                    const productName = p.Name || p.productName || p.PRODUCT_NAME || '';
                    selfLife = getDefaultSelfLife(productId, productName);
                    console.log(`DeliveryForm: Using default selfLife for ${productId}: ${selfLife} days`);
                } else {
                    console.log(`DeliveryForm: Found selfLife for ${productId}: ${selfLife} days (converted)`);
                }
                
                if (productIds.includes(productId)) {
                    pMap[productId] = {
                        productName: p.Name || p.productName || p.PRODUCT_NAME || '',
                        selfLife: selfLife  // Use as-is, already in days, or intelligent default
                    };
                    console.log(`DeliveryForm: Mapped ${productId} -> selfLife: ${selfLife}`);
                }
            });
            
            console.log('DeliveryForm: ProductsMap after processing:', pMap);
            
            // Fallback: If we couldn't find any products, use intelligent defaults for all
            if (Object.keys(pMap).length === 0) {
                console.warn('DeliveryForm: No products found in productsMap, using intelligent defaults');
                productIds.forEach(pid => {
                    const defaultLife = getDefaultSelfLife(pid, '');
                    pMap[pid] = {
                        productName: '',
                        selfLife: defaultLife
                    };
                });
            }
            
            if (Object.keys(pMap).length > 0) {
                setProductsMap(pMap);
            }
        } catch (err) {
            console.error('Error fetching products:', err);
        }
    }, [poData, products]);

    // Calculate expiry date from manufacture date and selfLife
    const calculateExpiry = (mfdString, selfLifeDays) => {
        try {
            if (!mfdString || typeof mfdString !== 'string') return '';
            // Ensure it's in YYYY-MM-DD format
            const validDateMatch = mfdString.match(/^\d{4}-\d{2}-\d{2}/);
            if (!validDateMatch) return '';
            
            // Parse YYYY-MM-DD as local date (not UTC)
            const [year, month, day] = mfdString.split('-').map(Number);
            const mfd = new Date(year, month - 1, day);  // Month is 0-indexed
            
            if (isNaN(mfd.getTime())) return '';
            
            // Add selfLifeDays to the local date
            const expd = new Date(year, month - 1, day + selfLifeDays);
            
            // Format back to YYYY-MM-DD without timezone conversion
            const expYear = expd.getFullYear();
            const expMonth = String(expd.getMonth() + 1).padStart(2, '0');
            const expDay = String(expd.getDate()).padStart(2, '0');
            const result = `${expYear}-${expMonth}-${expDay}`;
            
            console.log(`[calculateExpiry] mfd='${mfdString}', selfLifeDays=${selfLifeDays}, calculated expd='${result}'`);
            return result;
        } catch (err) {
            console.log(`[calculateExpiry] ERROR calculating expiry for mfd='${mfdString}', selfLifeDays=${selfLifeDays}:`, err);
            return '';
        }
    };

    // Remove a product from the delivery
    const removeProduct = (productIndex) => {
        setProductDetails(prev => prev.filter((_, i) => i !== productIndex));
    };

    // Remove a case from a product
    const removeCaseFromProduct = (productIndex, caseIndex) => {
        setProductDetails(prev => {
            const updated = [...prev];
            updated[productIndex].cases = updated[productIndex].cases.filter((_, i) => i !== caseIndex);
            return updated;
        });
    };

    // Update a product field (batch, units_per_case, case_count, etc.)
    const updateProduct = (productIndex, field, value) => {
        setProductDetails(prev => {
            const updated = [...prev];
            const product = updated[productIndex];
            
            if (field === 'case_count') {
                // When case count changes, auto-generate case blocks
                const caseCount = parseInt(value) || 0;
                const currentCases = product.cases.length;
                
                if (caseCount > currentCases) {
                    // Add new cases
                    for (let i = currentCases; i < caseCount; i++) {
                        const caseNumber = i + 1;
                        const caseLabel = `${poData.po_id}_${product.product_id}_c${caseNumber}`;
                        product.cases.push({
                            caseNumber: caseNumber,
                            unitsPerCase: product.units_per_case,
                            mfd: '',
                            expd: '',
                            caseLabel: caseLabel
                        });
                    }
                } else if (caseCount < currentCases) {
                    // Remove excess cases
                    product.cases = product.cases.slice(0, caseCount);
                }
                // Update the case_count field
                product.case_count = caseCount;
            } else {
                product[field] = value;
            }
            
            return updated;
        });
    };

    // Update a case field
    const updateCase = (productIndex, caseIndex, field, value) => {
        setProductDetails(prev => {
            const updated = [...prev];
            const caseData = updated[productIndex].cases[caseIndex];
            const productId = updated[productIndex].product_id;
            
            // Sanitize date fields - ensure YYYY-MM-DD format or empty
            if ((field === 'mfd' || field === 'expd') && value) {
                const dateMatch = value.match(/^\d{4}-\d{2}-\d{2}/);
                caseData[field] = dateMatch ? dateMatch[0] : '';
            } else {
                caseData[field] = value;
            }

            // Auto-calculate expiry if mfd changed
            if (field === 'mfd' && caseData[field]) {
                const selfLifeDays = productsMap[productId]?.selfLife || 0;
                caseData.expd = calculateExpiry(caseData[field], selfLifeDays);
            }

            return updated;
        });
    };

    // Get total units across all cases for a product
    const getTotalUnitsForProduct = (product) => {
        return product.cases.reduce((sum, c) => sum + (parseInt(c.unitsPerCase) || 0), 0);
    };

    // Calculate quantity for a product (case_count * units_per_case)
    const getQuantity = (product) => {
        const caseCount = parseInt(product.case_count) || 0;
        const unitsPerCase = parseInt(product.units_per_case) || 1;
        return caseCount * unitsPerCase;
    };

    // Prepare data for submission
    const handleSubmit = (e) => {
        e.preventDefault();

        if (!purchaseDate) {
            alert('Please enter Purchase Date');
            return;
        }

        if (!paymentMode) {
            alert('Please select Payment Mode');
            return;
        }

        if (!paymentStatus) {
            alert('Please select Payment Status');
            return;
        }

        if (!gstFiled) {
            alert('Please select GST Filed');
            return;
        }

        // Find products that have at least one case
        const productsWithCases = productDetails.filter(p => p.cases.length > 0);

        if (productsWithCases.length === 0 && customProducts.length === 0) {
            alert('Please add at least one case for at least one product or add custom products');
            return;
        }

        // Validate all cases have manufacture date and expiry date
        for (const product of productsWithCases) {
            for (const caseData of product.cases) {
                if (!caseData.mfd) {
                    alert(`Please enter Manufacture Date for ${product.product_name} - ${caseData.caseLabel}`);
                    return;
                }
                if (!caseData.expd) {
                    alert(`Please enter or verify Expiry Date for ${product.product_name} - ${caseData.caseLabel}`);
                    return;
                }
            }
        }

        // Validate custom product cases
        for (const customProduct of customProducts) {
            for (const caseData of customProduct.cases) {
                if (!caseData.mfd) {
                    alert(`Please enter Manufacture Date for ${customProduct.product_name} - ${caseData.caseLabel}`);
                    return;
                }
                if (!caseData.expd) {
                    alert(`Please enter or verify Expiry Date for ${customProduct.product_name} - ${caseData.caseLabel}`);
                    return;
                }
            }
        }

        // Build delivery data in the new format
        const items = productsWithCases.map(product => ({
            product_id: product.product_id,
            product_name: product.product_name,
            batch: product.batch,
            units_per_case: product.units_per_case,
            po_price: parseFloat(product.po_price) || 0,
            mrp: parseFloat(product.mrp) || parseFloat(product.MRP) || 0,
            cases: product.cases.map(c => {
                console.log(`[DeliveryForm] Case ${c.caseLabel}: mfd='${c.mfd}', expd='${c.expd}', unitsPerCase='${c.unitsPerCase}'`);
                return {
                    case_number: c.caseNumber,
                    case_label: c.caseLabel,
                    units_per_case: parseInt(c.unitsPerCase) || 1,
                    units_received: parseInt(c.unitsPerCase) || 1,
                    mfd: c.mfd,  // Manufacture date
                    expd: c.expd   // Expiry date
                };
            })
        }));

        // Add custom products to items
        const customItems = customProducts.map(product => ({
            product_id: product.product_id,
            product_name: product.product_name,
            batch: product.batch,
            units_per_case: product.units_per_case,
            po_price: parseFloat(product.po_price) || 0,
            mrp: parseFloat(product.mrp) || parseFloat(product.MRP) || 0,
            cases: product.cases.map(c => {
                console.log(`[DeliveryForm] CUSTOM PRODUCT Case ${c.caseLabel}: mfd='${c.mfd}', expd='${c.expd}', unitsPerCase='${c.unitsPerCase}'`);
                return {
                    case_number: c.caseNumber,
                    case_label: c.caseLabel,
                    units_per_case: parseInt(c.unitsPerCase) || 1,
                    units_received: parseInt(c.unitsPerCase) || 1,
                    mfd: c.mfd,
                    expd: c.expd
                };
            })
        }));

        const allItems = [...items, ...customItems];
        console.log('[DeliveryForm] Final data to submit:', JSON.stringify({
            po_id: poData.po_id,
            vendor_id: poData.vendor_id,
            payment_mode: paymentMode,
            payment_status: paymentStatus,
            gst_filed: gstFiled,
            items: allItems
        }, null, 2));
        
        onSave({
            po_id: poData.po_id,
            vendor_id: poData.vendor_id,
            payment_mode: paymentMode,
            payment_status: paymentStatus,
            gst_filed: gstFiled,
            items: allItems
        });
    };

    const getSelfLife = (productId) => {
        let selfLife = 0;
        
        // First try to get from productsMap
        if (productsMap[productId]?.selfLife) {
            selfLife = productsMap[productId].selfLife;
            console.log(`getSelfLife: Found in productsMap for ${productId}: ${selfLife}`);
            // If it's 0, still try defaults
            if (selfLife > 0) {
                return selfLife;
            }
        }
        
        // Fallback: Try to get directly from products array
        const product = products?.find(p => {
            const pid = p.Product_ID || p.productId;
            return pid === productId;
        });
        
        if (product) {
            selfLife = convertToDays(product.selfLife || product.Self_Life || product.SELF_LIFE || 0);
            if (selfLife > 0) {
                console.log(`getSelfLife fallback for ${productId}: found product, selfLife=${selfLife} days (converted)`);
                return selfLife;
            }
            console.log(`getSelfLife: Product found but selfLife is 0, using intelligent defaults`);
        }
        
        // Use intelligent defaults based on product name/ID patterns
        const productName = product?.Name || '';
        const defaultSelfLife = getDefaultSelfLife(productId, productName);
        console.log(`getSelfLife: Using default for ${productId}: ${defaultSelfLife} days`);
        return defaultSelfLife;
    };

    // Validate and format date for input display (yyyy-MM-dd only)
    const getValidDate = (dateValue) => {
        if (!dateValue) return '';

        let dateString = '';
        if (typeof dateValue === 'string') {
            // Accept raw YYYY-MM-DD
            const dateOnly = dateValue.match(/^\d{4}-\d{2}-\d{2}/);
            if (dateOnly) {
                return dateOnly[0];
            }

            // Normalize ISO timestamp with microseconds (e.g. 2026-09-22T00:00:00.000000Z)
            const normalized = dateValue
                .replace(/\.(\d{3})\d*Z$/, '.$1Z')
                .replace(/\.(\d{1,2})Z$/, '.$1Z');

            const parsed = new Date(normalized);
            if (!Number.isNaN(parsed.getTime())) {
                const y = parsed.getFullYear();
                const m = String(parsed.getMonth() + 1).padStart(2, '0');
                const d = String(parsed.getDate()).padStart(2, '0');
                return `${y}-${m}-${d}`;
            }

            return '';
        }

        if (dateValue instanceof Date && !Number.isNaN(dateValue.getTime())) {
            const y = dateValue.getFullYear();
            const m = String(dateValue.getMonth() + 1).padStart(2, '0');
            const d = String(dateValue.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        }

        return '';
    };

    const handleAddCustomProduct = (e) => {
        e.preventDefault();
        if (!newCustomProduct.product_id || !newCustomProduct.product_name || newCustomProduct.case_count <= 0) {
            alert('Please fill in all required fields');
            return;
        }
        setCustomProducts([...customProducts, { ...newCustomProduct, id: Date.now() }]);
        setNewCustomProduct({
            product_id: '',
            product_name: '',
            case_count: 0,
            units_per_case: 1,
            po_price: '',
            batch: 1,
            mrp: '',
            cases: []
        });
        setShowCustomProductForm(false);
    };

    const handleRemoveCustomProduct = (id) => {
        setCustomProducts(customProducts.filter(cp => cp.id !== id));
    };

    const productsToDeliver = (poData?.items || []).filter(item => !selectedItems[item.product_id]);

    const totalCustomUnits = customProducts.reduce((sum, product) => sum + ((parseInt(product.case_count) || 0) * (parseInt(product.units_per_case) || 1)), 0);

    const totalCases = productDetails.reduce((sum, product) => sum + product.cases.length, 0);

    const totalUnits = productDetails.reduce((sum, product) => {
        return sum + product.cases.reduce((caseSum, c) => caseSum + (parseInt(c.unitsPerCase) || 0), 0);
    }, 0);

    return (
        <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto">
            {/* PO Info Header */}
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 sticky top-0 z-10">
                <div className="flex justify-between items-start">
                    <div>
                        <div className="font-semibold text-slate-800">Recording Delivery for PO: <span className="text-orange-600">{poData?.po_id}</span></div>
                        <div className="text-sm text-slate-600 mt-1">Vendor: <strong>{poData?.vendor_id}</strong></div>
                        <div className="text-xs text-slate-400">PO Date: {poData?.po_date || '-'}</div>
                    </div>
                    <div className="text-right text-sm">
                        <div>Products: <strong>{poData?.items?.length || 0}</strong></div>
                        <div className="text-green-600">Cases Added: <strong>{productDetails.reduce((sum, p) => sum + p.cases.length, 0)}</strong></div>
                    </div>
                </div>
            </div>

            {/* Purchase Date */}
            <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                <label className="block text-sm font-medium text-slate-700 mb-2">Delivery Date *</label>
                <input
                    type="date"
                    value={purchaseDate}
                    onChange={e => setPurchaseDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                    required
                />
            </div>

            {/* Payment Info */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Payment Mode *</label>
                        <select
                            value={paymentMode}
                            onChange={e => setPaymentMode(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                            required
                        >
                            <option value="Cash">Cash</option>
                            <option value="UPI">UPI</option>
                            <option value="NEFT">NEFT</option>
                            <option value="Bank Transfer">Bank Transfer</option>
                            <option value="Cheque">Cheque</option>
                            <option value="Credit">Credit</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Payment Status *</label>
                        <select
                            value={paymentStatus}
                            onChange={e => setPaymentStatus(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                            required
                        >
                            <option value="Pending">Pending</option>
                            <option value="Completed">Completed</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">GST Filed *</label>
                        <select
                            value={gstFiled}
                            onChange={e => setGstFiled(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                            required
                        >
                            <option value="Yes">Yes</option>
                            <option value="No">No</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Products with Cases */}
            <div className="space-y-4">
                <div className="text-sm font-medium text-slate-700">Products ({productDetails.length})</div>
                <div className="text-xs text-slate-500">Enter case count for each product to automatically generate case details below.</div>
            </div>

            {/* PO Products with Inline Case Details */}
            <div className="space-y-6">
                {productDetails.map((product, index) => (
                    <div key={index} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                        {/* Product Input Row */}
                        <div className="p-4 border-b border-slate-200">
                            <div className="flex justify-between items-start mb-3">
                                <div className="flex-1">
                                    <div className="font-medium text-slate-800">{product.product_name}</div>
                                    <div className="text-xs text-slate-500">{product.product_id} • Self Life: {getSelfLife(product.product_id)} days • Stock: {getProductQuantity(product.product_id)} units • Ordered: {product.ordered_cases} cases</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => removeProduct(index)}
                                    className="ml-4 p-1 text-red-600 hover:bg-red-100 rounded"
                                    title="Remove this product"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="grid grid-cols-5 gap-2">
                                <div>
                                    <label className="block text-xs text-slate-500 mb-1">Batch</label>
                                    <input
                                        type="text"
                                        value={product.batch}
                                        onChange={e => updateProduct(index, 'batch', e.target.value)}
                                        className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-orange-500"
                                        placeholder="Batch"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-500 mb-1">Unit/Case *</label>
                                    <input
                                        type="number"
                                        value={product.units_per_case}
                                        onChange={e => updateProduct(index, 'units_per_case', e.target.value)}
                                        className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-orange-500"
                                        min="1"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-500 mb-1">Case Count *</label>
                                    <input
                                        type="number"
                                        value={product.case_count}
                                        onChange={e => updateProduct(index, 'case_count', e.target.value)}
                                        className={clsx(
                                            "w-full px-2 py-1.5 border rounded text-sm focus:outline-none focus:border-orange-500",
                                            parseInt(product.case_count) > 0 ? "border-green-400 bg-green-100" : "border-slate-200"
                                        )}
                                        placeholder="0"
                                        min="0"
                                        max={product.ordered_cases}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-500 mb-1">MRP (₹)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={product.mrp}
                                        onChange={e => updateProduct(index, 'mrp', e.target.value)}
                                        className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-orange-500"
                                        placeholder="0.00"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-500 mb-1">PO Price (₹) *</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={product.po_price}
                                        onChange={e => updateProduct(index, 'po_price', e.target.value)}
                                        className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-orange-500"
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Case Details - Shows directly below product if cases exist */}
                        {product.cases.length > 0 && (
                            <div className="p-4 bg-orange-50">
                                <div className="text-xs font-semibold text-orange-800 mb-3">Case Details - Enter Manufacture & Expiry Date</div>
                                <div className="space-y-3">
                                    {product.cases.map((caseData, caseIndex) => (
                                        <div key={caseIndex} className="p-3 bg-white rounded-lg border border-slate-200">
                                            <div className="flex justify-between items-start mb-3">
                                                <div className="text-sm font-medium text-slate-700">{caseData.caseLabel}</div>
                                                <button
                                                    type="button"
                                                    onClick={() => removeCaseFromProduct(index, caseIndex)}
                                                    className="text-red-500 hover:text-red-700 text-xs"
                                                >
                                                    Remove
                                                </button>
                                            </div>

                                            <div className="grid grid-cols-5 gap-2">
                                                {/* Units Per Case */}
                                                <div>
                                                    <label className="block text-xs text-slate-600 mb-1">Units/Case</label>
                                                    <input
                                                        type="number"
                                                        value={caseData.unitsPerCase}
                                                        onChange={e => updateCase(index, caseIndex, 'unitsPerCase', e.target.value)}
                                                        className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-orange-500"
                                                        min="1"
                                                    />
                                                </div>

                                                {/* Manufacture Date (Admin Input) */}
                                                <div>
                                                    <label className="block text-xs text-slate-600 mb-1">Manufacture Date *</label>
                                                    <input
                                                        type="date"
                                                        value={getValidDate(caseData.mfd)}
                                                        onChange={e => updateCase(index, caseIndex, 'mfd', e.target.value)}
                                                        className={clsx(
                                                            "w-full px-2 py-1.5 border rounded text-sm focus:outline-none focus:border-orange-500",
                                                            caseData.mfd ? "border-green-400 bg-green-50" : "border-slate-200"
                                                        )}
                                                    />
                                                </div>

                                                {/* Expiry Date (Auto-calculated) */}
                                                <div>
                                                    <label className="block text-xs text-slate-600 mb-1">Expiry Date (Auto)</label>
                                                    <input
                                                        type="date"
                                                        value={getValidDate(caseData.expd)}
                                                        disabled
                                                        className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm bg-slate-100 text-slate-600 cursor-not-allowed"
                                                    />
                                                </div>

                                                {/* Self Life Info */}
                                                <div>
                                                    <label className="block text-xs text-slate-600 mb-1">Self Life</label>
                                                    <div className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm bg-slate-100 text-slate-700 font-medium">
                                                        {getSelfLife(product.product_id)} days
                                                    </div>
                                                </div>

                                                {/* Case Label */}
                                                <div>
                                                    <label className="block text-xs text-slate-600 mb-1">Case Label</label>
                                                    <input
                                                        type="text"
                                                        value={caseData.caseLabel}
                                                        onChange={e => updateCase(index, caseIndex, 'caseLabel', e.target.value)}
                                                        className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-orange-500"
                                                        placeholder="e.g., Case 1"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Custom Products Section */}
            <div className="space-y-3">
                <div className="flex justify-between items-center">
                    <div>
                        <div className="text-sm font-medium text-slate-700">Vendor Substitutions / Custom Products</div>
                        <div className="text-xs text-slate-500">Add products that vendor sent instead of ordered items</div>
                    </div>
                    {!showCustomProductForm && (
                        <button
                            type="button"
                            onClick={() => setShowCustomProductForm(true)}
                            className="px-3 py-1.5 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-lg text-sm font-medium flex items-center gap-1"
                        >
                            <Plus size={16} /> Add Custom Product
                        </button>
                    )}
                </div>

                {/* Custom Product Form */}
                {showCustomProductForm && (
                    <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Select Product from Vendor *</label>
                                <select
                                    value={newCustomProduct.product_id}
                                    onChange={(e) => handleSelectProduct(e.target.value)}
                                    className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-orange-500"
                                >
                                    <option value="">Choose a product...</option>
                                    {vendorProducts.length > 0 ? (
                                        vendorProducts.map(p => (
                                            <option key={p.Product_ID} value={p.Product_ID}>
                                                {p.Product_ID} - {p.Name}
                                            </option>
                                        ))
                                    ) : (
                                        <option disabled>No products available for this vendor</option>
                                    )}
                                </select>
                                {!vendorId && <p className="text-xs text-orange-600 mt-1">No vendor selected in PO</p>}
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Case Count *</label>
                                    <input
                                        type="number"
                                        value={newCustomProduct.case_count}
                                        onChange={(e) => handleCustomProductCaseCountChange(e.target.value)}
                                        className={clsx(
                                            "w-full px-2 py-1.5 border rounded text-sm focus:outline-none focus:border-orange-500",
                                            parseInt(newCustomProduct.case_count) > 0 ? "border-green-400 bg-green-100" : "border-slate-200"
                                        )}
                                        placeholder="0"
                                        min="1"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Units/Case</label>
                                    <input
                                        type="number"
                                        value={newCustomProduct.units_per_case}
                                        onChange={(e) => setNewCustomProduct({ ...newCustomProduct, units_per_case: e.target.value })}
                                        className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-orange-500"
                                        min="1"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Batch</label>
                                    <input
                                        type="text"
                                        value={newCustomProduct.batch}
                                        onChange={(e) => setNewCustomProduct({ ...newCustomProduct, batch: e.target.value })}
                                        className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-orange-500"
                                        placeholder="Batch"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">MRP (₹) - Auto-filled</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={newCustomProduct.mrp}
                                        onChange={(e) => setNewCustomProduct({ ...newCustomProduct, mrp: e.target.value })}
                                        className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-orange-500 bg-slate-50"
                                        placeholder="0.00"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Price (₹) - Auto-filled</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={newCustomProduct.po_price}
                                        onChange={(e) => setNewCustomProduct({ ...newCustomProduct, po_price: e.target.value })}
                                        className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-orange-500 bg-slate-50"
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>

                            {/* Case Details for Custom Product - Same structure as PO products */}
                            {(newCustomProduct.cases && newCustomProduct.cases.length > 0) && (
                                <div className="p-4 bg-orange-50">
                                    <div className="text-xs font-semibold text-orange-800 mb-3">Case Details - Enter Manufacture & Expiry Date</div>
                                    <div className="space-y-3">
                                        {newCustomProduct.cases.map((caseData, caseIndex) => (
                                            <div key={caseIndex} className="p-3 bg-white rounded-lg border border-slate-200">
                                                <div className="flex justify-between items-start mb-3">
                                                    <div className="text-sm font-medium text-slate-700">{caseData.caseLabel}</div>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const updatedCases = newCustomProduct.cases.filter((_, idx) => idx !== caseIndex);
                                                            setNewCustomProduct({ ...newCustomProduct, cases: updatedCases, case_count: updatedCases.length });
                                                        }}
                                                        className="text-red-500 hover:text-red-700 text-xs"
                                                    >
                                                        Remove
                                                    </button>
                                                </div>

                                                <div className="grid grid-cols-5 gap-2">
                                                    {/* Units Per Case */}
                                                    <div>
                                                        <label className="block text-xs text-slate-600 mb-1">Units/Case</label>
                                                        <input
                                                            type="number"
                                                            value={caseData.unitsPerCase}
                                                            onChange={(e) => updateCustomProductCase(caseIndex, 'unitsPerCase', e.target.value)}
                                                            className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-orange-500"
                                                            min="1"
                                                        />
                                                    </div>

                                                    {/* Manufacture Date */}
                                                    <div>
                                                        <label className="block text-xs text-slate-600 mb-1">Manufacture Date *</label>
                                                        <input
                                                            type="date"
                                                            value={getValidDate(caseData.mfd)}
                                                            onChange={(e) => updateCustomProductCase(caseIndex, 'mfd', e.target.value)}
                                                            className={clsx(
                                                                "w-full px-2 py-1.5 border rounded text-sm focus:outline-none focus:border-orange-500",
                                                                caseData.mfd ? "border-green-400 bg-green-50" : "border-slate-200"
                                                            )}
                                                            required
                                                        />
                                                    </div>

                                                    {/* Expiry Date (Auto-calculated) */}
                                                    <div>
                                                        <label className="block text-xs text-slate-600 mb-1">Expiry Date (Auto)</label>
                                                        <input
                                                            type="date"
                                                            value={getValidDate(caseData.expd)}
                                                            disabled
                                                            className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm bg-slate-100 text-slate-600 cursor-not-allowed"
                                                        />
                                                    </div>

                                                    {/* Self Life Info */}
                                                    <div>
                                                        <label className="block text-xs text-slate-600 mb-1">Self Life</label>
                                                        <div className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm bg-slate-100 text-slate-700 font-medium">
                                                            {getSelfLife(newCustomProduct.product_id)} days
                                                        </div>
                                                    </div>

                                                    {/* Case Label */}
                                                    <div>
                                                        <label className="block text-xs text-slate-600 mb-1">Case Label</label>
                                                        <input
                                                            type="text"
                                                            value={caseData.caseLabel}
                                                            onChange={(e) => updateCustomProductCase(caseIndex, 'caseLabel', e.target.value)}
                                                            className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-orange-500"
                                                            placeholder="e.g., Case 1"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={handleAddCustomProduct}
                                    className="flex-1 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium"
                                >
                                    Add Product
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowCustomProductForm(false)}
                                    className="flex-1 px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-medium"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Custom Products List */}
                {customProducts.length > 0 && (
                    <div className="space-y-2">
                        {customProducts.map((product, index) => (
                            <div key={index} className="p-3 bg-orange-100 rounded-lg border border-orange-300 flex justify-between items-start">
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-slate-800">{product.product_name}</div>
                                    <div className="text-xs text-slate-600">ID: {product.product_id} | Cases: {product.case_count} | Units/Case: {product.units_per_case} | Batch: {product.batch || '-'}</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleRemoveCustomProduct(index)}
                                    className="ml-2 p-1 text-red-600 hover:bg-red-100 rounded"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Summary */}
            {(productsToDeliver.length > 0 || customProducts.length > 0) && (
                <div className="bg-green-50 p-4 rounded-lg border border-green-200 sticky bottom-0">
                    <div className="text-sm font-medium text-green-800">
                        Delivery Summary: <strong>{productsToDeliver.length + customProducts.length}</strong> products
                    </div>
                    {productsToDeliver.length > 0 && (
                        <div className="text-xs text-green-600 mt-1">
                            From PO: {productsToDeliver.length} products, {totalCases} cases ({totalUnits} units)
                        </div>
                    )}
                    {customProducts.length > 0 && (
                        <div className="text-xs text-orange-600 mt-1">
                            Custom: {customProducts.length} products, {totalCustomUnits} units
                        </div>
                    )}
                </div>
            )}

            <div className="flex gap-3 pt-4 sticky bottom-0 bg-white pb-2">
                <button type="button" onClick={onCancel} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 text-sm font-medium" disabled={saving}>
                    Cancel
                </button>
                <button type="submit" className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50" disabled={saving || (productsToDeliver.length === 0 && customProducts.length === 0)}>
                    {saving ? 'Recording...' : `Record Delivery (${productsToDeliver.length + customProducts.length} products)`}
                </button>
            </div>
        </form>
    );
};

// New Vendor Purchase Form - For creating fresh vendor purchases (stock-in)
const NewVendorPurchaseForm = ({ products, vendors, onSave, onCancel, saving }) => {
    const today = new Date().toISOString().split('T')[0];
    const [form, setForm] = useState({
        date: today,
        purchase_date: today,
        vendor_id: '',
        batch: '',
        payment_mode: '',
        payment_status: 'Pending',
        gst_filed: 'No'
    });
    const [items, setItems] = useState([{ product_id: '', product_name: '', units_per_case: 1, case_count: '', mrp: '', po_price: '' }]);

    const addItem = () => {
        setItems([...items, { product_id: '', product_name: '', units_per_case: 1, case_count: '', mrp: '', po_price: '' }]);
    };

    const removeItem = (idx) => {
        if (items.length > 1) {
            setItems(items.filter((_, i) => i !== idx));
        }
    };

    const updateItem = (idx, field, value) => {
        const newItems = [...items];
        newItems[idx][field] = value;

        // Auto-fill product details when product is selected
        if (field === 'product_id' && value) {
            const product = products.find(p => p.Product_ID === value);
            if (product) {
                newItems[idx].product_name = product.Name;
                newItems[idx].mrp = product.MRP || '';
                newItems[idx].po_price = product.Unit_Cost || '';
            }
        }
        setItems(newItems);
    };

    const totalCases = items.reduce((sum, i) => sum + (parseInt(i.case_count) || 0), 0);
    const totalQty = items.reduce((sum, i) => sum + ((parseInt(i.case_count) || 0) * (parseInt(i.units_per_case) || 1)), 0);
    const totalValue = items.reduce((sum, i) => sum + ((parseInt(i.case_count) || 0) * (parseFloat(i.po_price) || 0)), 0);

    const handleSubmit = (e) => {
        e.preventDefault();
        const validItems = items.filter(i => i.product_id && parseInt(i.case_count) > 0);
        if (validItems.length === 0) {
            alert('Please add at least one product with cases');
            return;
        }
        if (!form.vendor_id) {
            alert('Please select a vendor');
            return;
        }
        onSave({
            ...form,
            items: validItems
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* PO Header Fields */}
            <div className="bg-slate-50 p-4 rounded-lg space-y-4">
                <h4 className="font-semibold text-slate-700 flex items-center gap-2">
                    <Info size={16} className="text-orange-500" /> Purchase Order Details
                </h4>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Date *</label>
                        <input
                            type="date"
                            value={form.date}
                            onChange={e => setForm({ ...form, date: e.target.value })}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Purchase Date</label>
                        <input
                            type="date"
                            value={form.purchase_date}
                            onChange={e => setForm({ ...form, purchase_date: e.target.value })}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                        />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Vendor *</label>
                        <select
                            value={form.vendor_id}
                            onChange={e => setForm({ ...form, vendor_id: e.target.value })}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                            required
                        >
                            <option value="">Select Vendor...</option>
                            {(vendors || []).map(v => (
                                <option key={v.Vendor_ID} value={v.Vendor_ID}>{v.Vendor_ID} - {v.Vendor_Name || v.Name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Batch</label>
                        <input
                            type="text"
                            value={form.batch}
                            onChange={e => setForm({ ...form, batch: e.target.value })}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                            placeholder="e.g., BATCH-001"
                        />
                    </div>
                </div>
            </div>

            {/* Products Section */}
            <div className="space-y-3">
                <div className="flex justify-between items-center">
                    <h4 className="font-semibold text-slate-700">Products</h4>
                    <button
                        type="button"
                        onClick={addItem}
                        className="text-sm text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1"
                    >
                        <Plus size={14} /> Add Product
                    </button>
                </div>

                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                    {items.map((item, idx) => (
                        <div key={idx} className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-medium text-slate-500">Product #{idx + 1}</span>
                                {items.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => removeItem(idx)}
                                        className="text-red-500 hover:text-red-700 text-xs"
                                    >
                                        Remove
                                    </button>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2">
                                    <label className="block text-xs text-slate-500 mb-1">Product *</label>
                                    <select
                                        value={item.product_id}
                                        onChange={e => updateItem(idx, 'product_id', e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                                        required
                                    >
                                        <option value="">Select Product...</option>
                                        {(products || []).map(p => (
                                            <option key={p.Product_ID} value={p.Product_ID}>{p.Product_ID} - {p.Name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-500 mb-1">Units/Case *</label>
                                    <input
                                        type="number"
                                        value={item.units_per_case}
                                        onChange={e => updateItem(idx, 'units_per_case', e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                                        min="1"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-500 mb-1">Cases *</label>
                                    <input
                                        type="number"
                                        value={item.case_count}
                                        onChange={e => updateItem(idx, 'case_count', e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                                        min="1"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-500 mb-1">MRP</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={item.mrp}
                                        onChange={e => updateItem(idx, 'mrp', e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                                        placeholder="0.00"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-500 mb-1">PO Price *</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={item.po_price}
                                        onChange={e => updateItem(idx, 'po_price', e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                                        placeholder="0.00"
                                        required
                                    />
                                </div>
                            </div>
                            {item.case_count && item.units_per_case && (
                                <div className="text-xs text-slate-500 bg-slate-50 px-2 py-1 rounded">
                                    Quantity: <strong>{(parseInt(item.case_count) || 0) * (parseInt(item.units_per_case) || 1)}</strong> units |
                                    Line Total: <strong>₹{((parseInt(item.case_count) || 0) * (parseFloat(item.po_price) || 0)).toLocaleString()}</strong>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Payment & GST */}
            <div className="grid grid-cols-3 gap-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Payment Mode</label>
                    <select
                        value={form.payment_mode}
                        onChange={e => setForm({ ...form, payment_mode: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                    >
                        <option value="">Select...</option>
                        <option value="Cash">Cash</option>
                        <option value="UPI">UPI</option>
                        <option value="Bank Transfer">Bank Transfer</option>
                        <option value="Cheque">Cheque</option>
                        <option value="Credit">Credit</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Payment Status</label>
                    <select
                        value={form.payment_status}
                        onChange={e => setForm({ ...form, payment_status: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                    >
                        <option value="Pending">Pending</option>
                        <option value="Paid">Paid</option>
                        <option value="Partial">Partial</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">GST Filed</label>
                    <select
                        value={form.gst_filed}
                        onChange={e => setForm({ ...form, gst_filed: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                    >
                        <option value="No">No</option>
                        <option value="Yes">Yes</option>
                    </select>
                </div>
            </div>

            {/* Summary */}
            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                        <div className="text-xs text-green-600">Total Cases</div>
                        <div className="text-xl font-bold text-green-800">{totalCases}</div>
                    </div>
                    <div>
                        <div className="text-xs text-green-600">Total Quantity</div>
                        <div className="text-xl font-bold text-green-800">{totalQty}</div>
                    </div>
                    <div>
                        <div className="text-xs text-green-600">Total Value</div>
                        <div className="text-xl font-bold text-green-800">₹{totalValue.toLocaleString()}</div>
                    </div>
                </div>
                <div className="text-xs text-green-600 mt-2 text-center">
                    PO ID will be auto-generated: VP-{form.date.replace(/-/g, '')}-XXX
                </div>
            </div>

            <div className="flex gap-3 pt-4">
                <button type="button" onClick={onCancel} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 text-sm font-medium" disabled={saving}>
                    Cancel
                </button>
                <button type="submit" className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50" disabled={saving || totalCases === 0}>
                    {saving ? 'Creating...' : 'Create Vendor Purchase'}
                </button>
            </div>
        </form>
    );
};

const Inventory = () => {
    const { products, purchases, vendors, warehouse, ourPOs, vendorDeliveries, vendorPurchasesList, loading, refreshData, addToWarehouse, createMultiPO, recordDelivery, fetchVendorPurchases } = useData();
    const [activeTab, setActiveTab] = useState('Product Master');
    const [poSubTab, setPoSubTab] = useState('Your PO'); // Sub-tab for Purchase Orders
    const [showGenerateBill, setShowGenerateBill] = useState(false); // Modal for generating bills
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('All');
    const [productSortBy, setProductSortBy] = useState('name_asc');
    const [poSortBy, setPoSortBy] = useState('date_desc');
    const [vpSortBy, setVpSortBy] = useState('date_desc');
    const [showFilters, setShowFilters] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showPOModal, setShowPOModal] = useState(false);
    const [showMultiPOModal, setShowMultiPOModal] = useState(false);
    const [showDeliveryModal, setShowDeliveryModal] = useState(false);
    const [selectedPOItem, setSelectedPOItem] = useState(null);
    const [editProduct, setEditProduct] = useState(null);
    const [deleteProduct, setDeleteProduct] = useState(null);
    const [saving, setSaving] = useState(false);
    const [statusFilter, setStatusFilter] = useState('All');
    const [poDataForDelivery, setPoDataForDelivery] = useState(null);
    const [loadingPOItems, setLoadingPOItems] = useState(false);
    const [recentlyDeliveredPOs, setRecentlyDeliveredPOs] = useState(new Set());

    const API_URL = 'https://vendbees-inventory-backend-333114755202.asia-south1.run.app/api';

    // Fetch vendor purchases when tab changes
    useEffect(() => {
        console.log('Tab check - activeTab:', activeTab, 'poSubTab:', poSubTab);
        if (activeTab === 'Purchase Orders' && poSubTab === 'Vendor Purchase') {
            console.log('Calling fetchVendorPurchases...');
            fetchVendorPurchases();
        }
    }, [activeTab, poSubTab]);

    // Log products data structure for debugging
    useEffect(() => {
        if (products && products.length > 0) {
            console.log('Inventory: Products loaded, sample:', products[0]);
            console.log('Inventory: First product selfLife:', products[0].selfLife);
        }
    }, [products]);

    // Fetch PO items for delivery recording
    const fetchPOItems = async (poId) => {
        setLoadingPOItems(true);
        try {
            console.debug('Fetching PO items', { api: API_URL, poId });
            const response = await fetch(`${API_URL}/po-items/${encodeURIComponent(poId)}`);
            const text = await response.text();
            let data = null;
            try { data = text ? JSON.parse(text) : null; } catch(e) { /* non-JSON response */ }

            // Accept responses that either include a success flag OR directly return an items array
            if (response.ok && data && (data.success === true || Array.isArray(data.items))) {
                setPoDataForDelivery({
                    po_id: poId,
                    vendor_id: data.vendor_id,
                    po_date: data.po_date,
                    items: data.items
                });
                setShowDeliveryModal(true);
            } else {
                const errMsg = data && data.error ? data.error : (text ? text : `${response.status} ${response.statusText}`);
                console.error('Failed to fetch PO items', { status: response.status, statusText: response.statusText, body: text, parsed: data });
                alert(`Failed to fetch PO items: ${errMsg}`);
            }
        } catch (err) {
            console.error('Error fetching PO items:', err);
            alert(`Error fetching PO items: ${err?.message || err}`);
        } finally {
            setLoadingPOItems(false);
        }
    };

    // Use server products directly
    const allProducts = products;

    // Get unique categories
    const categories = useMemo(() => {
        const cats = new Set(allProducts.map(p => p.Category).filter(Boolean));
        return ['SNACKS', 'BEVERAGE', ...Array.from(cats)].filter((v, i, a) => a.indexOf(v) === i);
    }, [allProducts]);

    // Filter and sort products
    const filteredProducts = useMemo(() => {
        const filtered = allProducts.filter(p => {
            const matchesSearch = !searchQuery ||
                p.Name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.Product_ID?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.Category?.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesCategory = categoryFilter === 'All' || p.Category === categoryFilter;
            return matchesSearch && matchesCategory;
        });

        return [...filtered].sort((a, b) => {
            if (productSortBy === 'name_asc') return (a.Name || '').localeCompare(b.Name || '');
            if (productSortBy === 'name_desc') return (b.Name || '').localeCompare(a.Name || '');
            if (productSortBy === 'cost_low') return (parseFloat(a.Unit_Cost) || 0) - (parseFloat(b.Unit_Cost) || 0);
            if (productSortBy === 'cost_high') return (parseFloat(b.Unit_Cost) || 0) - (parseFloat(a.Unit_Cost) || 0);
            return 0;
        });
    }, [allProducts, searchQuery, categoryFilter, productSortBy]);

    // Filter purchases - Flat rows like Vendor Purchase (common fields only on first row)
    const filteredOurPOs = useMemo(() => {
        // First group by PO_ID to track first row status
        const poGroups = {};
        (ourPOs || []).forEach(item => {
            // Use PO_ID to group - API propagates PO_ID to all rows
            const poId = item.PO_ID;
            if (!poId) return;
            if (!poGroups[poId]) {
                poGroups[poId] = {
                    items: [],
                    status: item.Status || 'Pending',
                    vendor_id: item.Vendor_ID,
                    created_date: item.Created_Date,
                    total_amount: item.Total_Amount || 0
                };
            }
            poGroups[poId].items.push(item);
        });

        // Sort PO groups
        const sortedPoIds = Object.keys(poGroups).sort((a, b) => {
            if (poSortBy === 'date_desc') {
                return new Date(poGroups[b].created_date || 0) - new Date(poGroups[a].created_date || 0);
            }
            if (poSortBy === 'date_asc') {
                return new Date(poGroups[a].created_date || 0) - new Date(poGroups[b].created_date || 0);
            }
            if (poSortBy === 'amount_high') {
                return (parseFloat(poGroups[b].total_amount) || 0) - (parseFloat(poGroups[a].total_amount) || 0);
            }
            if (poSortBy === 'amount_low') {
                return (parseFloat(poGroups[a].total_amount) || 0) - (parseFloat(poGroups[b].total_amount) || 0);
            }
            return 0;
        });

        // Now create flat list with common fields only on first row, keeping PO groups together
        let flatRows = [];
        sortedPoIds.forEach(poId => {
            const group = poGroups[poId];
            group.items.forEach((item, idx) => {
                const isFirstRow = idx === 0;
                flatRows.push({
                    ...item,
                    PO_ID: isFirstRow ? poId : '',
                    Vendor_ID: isFirstRow ? group.vendor_id : '',
                    Created_Date: isFirstRow ? group.created_date : '',
                    Total_Amount: isFirstRow ? group.total_amount : '',
                    Status: isFirstRow ? group.status : '',
                    _poId: poId, // Internal reference for actions
                    _isFirstRow: isFirstRow,
                    _rowCount: group.items.length
                });
            });
        });

        // Apply status filter
        if (statusFilter !== 'All') {
            const matchingPoIds = new Set();
            flatRows.forEach(row => {
                if (row._isFirstRow && row.Status === statusFilter) {
                    matchingPoIds.add(row._poId);
                }
            });
            flatRows = flatRows.filter(row => matchingPoIds.has(row._poId));
        }

        // Apply search filter
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const matchingPoIds = new Set();
            flatRows.forEach(row => {
                if (row._poId?.toLowerCase().includes(q) ||
                    row.Vendor_ID?.toLowerCase().includes(q) ||
                    row.Product_Name?.toLowerCase().includes(q) ||
                    row.Product_ID?.toLowerCase().includes(q)) {
                    matchingPoIds.add(row._poId);
                }
            });
            flatRows = flatRows.filter(row => matchingPoIds.has(row._poId));
        }

        return flatRows;
    }, [ourPOs, searchQuery, statusFilter, poSortBy]);

    // Filter vendor purchases (for "Vendor Purchase" tab) - flat list from Excel
    const filteredVendorPurchases = useMemo(() => {
        console.log('filteredVendorPurchases - vendorPurchasesList:', vendorPurchasesList);
        let list = vendorPurchasesList || [];

        // Apply search filter
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            list = list.filter(vp =>
                vp.PO_ID?.toLowerCase().includes(q) ||
                vp.Vendor_ID?.toLowerCase().includes(q) ||
                vp.Product_Name?.toLowerCase().includes(q) ||
                vp.Product_ID?.toLowerCase().includes(q)
            );
        }

        let sorted = [...list].sort((a, b) => {
            const dateB = b.Date || b.Purchase_Date || 0;
            const dateA = a.Date || a.Purchase_Date || 0;
            const amountB = (parseFloat(b.PO_Price) || 0) * (parseFloat(b.Quantity) || 0);
            const amountA = (parseFloat(a.PO_Price) || 0) * (parseFloat(a.Quantity) || 0);

            if (vpSortBy === 'date_desc') return new Date(dateB) - new Date(dateA);
            if (vpSortBy === 'date_asc') return new Date(dateA) - new Date(dateB);
            if (vpSortBy === 'amount_high') return amountB - amountA;
            if (vpSortBy === 'amount_low') return amountA - amountB;
            return 0;
        });

        // Collapse repeated PO-level fields to first item row only for readability
        const normalized = [];
        let currentPO = null;

        sorted.forEach(row => {
            const poId = row.PO_ID || currentPO;
            const isNewPO = poId && poId !== currentPO;

            const fillRow = {
                ...row,
                PO_ID: isNewPO ? row.PO_ID : '',
                Date: isNewPO ? row.Date : '',
                Vendor_ID: isNewPO ? row.Vendor_ID : '',
                Payment_Mode: isNewPO ? row.Payment_Mode : '',
                Payment_Status: isNewPO ? row.Payment_Status : '',
                GST_Filed: isNewPO ? row.GST_Filed : ''
            };

            if (isNewPO) currentPO = poId;

            normalized.push(fillRow);
        });

        return normalized;
    }, [vendorPurchasesList, searchQuery, vpSortBy]);

    if (loading) return null;

    const totalValue = allProducts.reduce((acc, p) => acc + (p.Landed_Cost * (p.Total_Stock || 0)), 0);

    const handleAddProduct = async (product) => {
        setSaving(true);
        try {
            // Map frontend state to expected backend keys
            const payload = {
                PRODUCT_ID: product.Product_ID,
                PRODUCT_NAME: product.Name,
                CATEGORY: product.Category,
                "VENDOR ID": product.Vendor_ID || 'UNKNOWN',
                MRP: product.MRP || 0,
                GST: product.GST || 0,
                QUANTITY: product.Quantity || product.Total_Stock || 0,
                PO: product.Unit_Cost || 0
            };
            const res = await fetch(`${API_URL}/add-product`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (res.ok) {
                setShowAddModal(false);
                alert(`Product "${product.Name}" added successfully to Excel!`);
                if (refreshData) refreshData();
            } else {
                alert(`Error: ${data.error || 'Failed to add product'}`);
            }
        } catch (err) {
            alert(`Error: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    const handleEditProduct = async (product) => {
        setSaving(true);
        try {
            const payload = {
                PRODUCT_ID: product.Product_ID,
                PRODUCT_NAME: product.Name,
                CATEGORY: product.Category,
                "VENDOR ID": product.Vendor_ID || 'UNKNOWN',
                MRP: product.MRP || 0,
                PO: product.Unit_Cost || 0
            };
            const res = await fetch(`${API_URL}/update-product`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (res.ok) {
                setEditProduct(null);
                alert(`Product "${product.Name}" updated successfully!`);
                if (refreshData) refreshData();
            } else {
                alert(`Error: ${data.error || 'Failed to update product'}`);
            }
        } catch (err) {
            alert(`Error: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteProduct = async () => {
        if (!deleteProduct) return;
        setSaving(true);
        try {
            const res = await fetch(`${API_URL}/delete-product`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ PRODUCT_ID: deleteProduct.Product_ID })
            });
            const data = await res.json();

            if (res.ok) {
                setDeleteProduct(null);
                alert(`Product deleted successfully!`);
                if (refreshData) refreshData();
            } else {
                alert(`Error: ${data.error || 'Failed to delete product'}`);
            }
        } catch (err) {
            alert(`Error: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    const handleCreatePO = async (poData) => {
        setSaving(true);
        try {
            // Generate ID: VP-YYYYMMDDHHMMSS-VID
            const now = new Date();
            const timeStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
            const generatedPoId = `VP-${timeStr}-${poData.vendor_id || 'UNKNOWN'}`;

            // Create the PO entry in Vendor_Purchase sheet
            const res = await fetch(`${API_URL}/create-po`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    po_id: generatedPoId,
                    product_id: poData.product_id,
                    vendor_id: poData.vendor_id,
                    no_of_cases: poData.cases,
                    units_per_case: poData.units_per_case,
                    po_price: poData.po_price,
                    notes: poData.notes
                })
            });

            const data = await res.json();

            if (res.ok) {
                // Also add the units to warehouse
                if (poData.total_units > 0) {
                    await addToWarehouse(
                        poData.product_id,
                        poData.product_name,
                        poData.total_units,
                        parseInt(poData.units_per_case),
                        `From PO: ${data.po_number || 'New Order'}`
                    );
                }

                setShowPOModal(false);
                alert(`PO created successfully! ${poData.total_units} units added to warehouse.`);
                if (refreshData) refreshData();
            } else {
                alert(`Error: ${data.error || 'Failed to create PO'}`);
            }
        } catch (err) {
            // If backend doesn't have create-po endpoint yet, just add to warehouse
            if (poData.total_units > 0) {
                const result = await addToWarehouse(
                    poData.product_id,
                    poData.product_name,
                    poData.total_units,
                    parseInt(poData.units_per_case),
                    `PO for ${poData.cases} cases`
                );

                if (result.success) {
                    setShowPOModal(false);
                    alert(`PO recorded! ${poData.total_units} units added to warehouse.`);
                    if (refreshData) refreshData();
                } else {
                    alert(`Error: ${result.error}`);
                }
            } else {
                alert(`Error: ${err.message}`);
            }
        } finally {
            setSaving(false);
        }
    };

    const handleCreateMultiPO = async (items) => {
        setSaving(true);
        try {
            const result = await createMultiPO(items);

            if (result.success) {
                // Add units to warehouse for each item
                for (const item of items) {
                    const totalUnits = item.no_of_cases * item.units_per_case;
                    if (totalUnits > 0) {
                        await addToWarehouse(
                            item.product_id,
                            item.product_name,
                            totalUnits,
                            item.units_per_case,
                            `From PO: ${result.po_ids?.join(', ') || 'New Order'}`
                        );
                    }
                }

                setShowMultiPOModal(false);
                alert(`${result.message}\nPO ID(s): ${result.po_ids?.join(', ')}\nTotal items: ${result.total_items}`);
                if (refreshData) refreshData();
            } else {
                alert(`Error: ${result.error || 'Failed to create PO'}`);
            }
        } catch (err) {
            alert(`Error: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6 pb-10">
            <Header title="Product & Procurement" subtitle="Manage product catalog and purchase orders" />

            <div className="px-8 space-y-6">
                {/* Main Tabs */}
                <div className="flex border-b border-slate-200">
                    {['Product Master', 'Purchase Orders'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => { setActiveTab(tab); setSearchQuery(''); }}
                            className={clsx("px-6 py-3 text-sm font-medium border-b-2 transition-colors",
                                activeTab === tab ? "border-orange-500 text-orange-600" : "border-transparent text-slate-500 hover:text-slate-700")}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {/* Sub-Tabs for Purchase Orders */}
                {activeTab === 'Purchase Orders' && (
                    <div className="flex gap-2">
                        {['Your PO', 'Vendor Purchase'].map(subTab => (
                            <button
                                key={subTab}
                                onClick={() => { setPoSubTab(subTab); setSearchQuery(''); }}
                                className={clsx("px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                                    poSubTab === subTab
                                        ? "bg-orange-500 text-white"
                                        : "bg-slate-100 text-slate-600 hover:bg-slate-200")}
                            >
                                {subTab}
                            </button>
                        ))}
                    </div>
                )}

                {/* Toolbar */}
                <div className="flex flex-col gap-4 bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                    <div className="flex justify-between items-center gap-4">
                        <div className="flex gap-3 flex-1">
                            <div className="relative flex-1 max-w-md">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder={
                                        activeTab === 'Product Master' ? "Search products..." :
                                            poSubTab === 'Your PO' ? "Search PO number or vendor..." :
                                                "Search vendor purchases..."
                                    }
                                    className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-orange-500 bg-slate-50"
                                />
                            </div>
                            {activeTab === 'Product Master' && (
                                <>
                                    <select
                                        value={productSortBy}
                                        onChange={e => setProductSortBy(e.target.value)}
                                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500 bg-white"
                                    >
                                        <option value="name_asc">Name (A-Z)</option>
                                        <option value="name_desc">Name (Z-A)</option>
                                        <option value="cost_low">Cost (Lowest)</option>
                                        <option value="cost_high">Cost (Highest)</option>
                                    </select>
                                    <button
                                        onClick={() => setShowFilters(!showFilters)}
                                        className={clsx("flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors",
                                            showFilters ? "border-orange-500 text-orange-600 bg-orange-50" : "border-slate-200 text-slate-600 hover:bg-slate-50")}
                                    >
                                        <Filter size={16} /> Filters
                                    </button>
                                </>
                            )}
                            {activeTab === 'Purchase Orders' && poSubTab === 'Your PO' && (
                                <>
                                    <select
                                        value={poSortBy}
                                        onChange={e => setPoSortBy(e.target.value)}
                                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500 bg-white"
                                    >
                                        <option value="date_desc">Date (Newest)</option>
                                        <option value="date_asc">Date (Oldest)</option>
                                        <option value="amount_high">Amount (Highest)</option>
                                        <option value="amount_low">Amount (Lowest)</option>
                                    </select>
                                    <button
                                        onClick={() => setShowFilters(!showFilters)}
                                        className={clsx("flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors",
                                            showFilters ? "border-orange-500 text-orange-600 bg-orange-50" : "border-slate-200 text-slate-600 hover:bg-slate-50")}
                                    >
                                        <Filter size={16} /> Filters
                                    </button>
                                </>
                            )}
                            {activeTab === 'Purchase Orders' && poSubTab === 'Vendor Purchase' && (
                                <select
                                    value={vpSortBy}
                                    onChange={e => setVpSortBy(e.target.value)}
                                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500 bg-white"
                                >
                                    <option value="date_desc">Date (Newest)</option>
                                    <option value="date_asc">Date (Oldest)</option>
                                    <option value="amount_high">Amount (Highest)</option>
                                    <option value="amount_low">Amount (Lowest)</option>
                                </select>
                            )}
                        </div>
                        {activeTab === 'Product Master' && (
                            <button
                                onClick={() => setShowAddModal(true)}
                                className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
                            >
                                <Plus size={16} /> Add Product
                            </button>
                        )}
                        {activeTab === 'Purchase Orders' && poSubTab === 'Your PO' && (
                            <button
                                onClick={() => setShowMultiPOModal(true)}
                                className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
                            >
                                <Plus size={16} /> Create PO
                            </button>
                        )}
                    </div>

                    {/* Filter Panel - Product Master */}
                    {showFilters && activeTab === 'Product Master' && (
                        <div className="flex flex-wrap gap-3 pt-3 border-t border-slate-100">
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">Category</label>
                                <select
                                    value={categoryFilter}
                                    onChange={e => setCategoryFilter(e.target.value)}
                                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                                >
                                    <option value="All">All Categories</option>
                                    {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                </select>
                            </div>
                            <button
                                onClick={() => { setSearchQuery(''); setCategoryFilter('All'); }}
                                className="self-end px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700"
                            >
                                Clear Filters
                            </button>
                        </div>
                    )}
                    {/* Filter Panel - Your PO */}
                    {showFilters && activeTab === 'Purchase Orders' && poSubTab === 'Your PO' && (
                        <div className="flex flex-wrap gap-3 pt-3 border-t border-slate-100">
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">Status</label>
                                <select
                                    value={statusFilter}
                                    onChange={e => setStatusFilter(e.target.value)}
                                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                                >
                                    <option value="All">All Status</option>
                                    <option value="Pending">Pending</option>

                                    <option value="Delivered">Delivered</option>
                                </select>
                            </div>
                            <button
                                onClick={() => { setSearchQuery(''); setStatusFilter('All'); }}
                                className="self-end px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700"
                            >
                                Clear Filters
                            </button>
                        </div>
                    )}
                </div>

                {/* KPIs */}
                {activeTab === 'Product Master' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <KPI title="Total SKUs" value={allProducts.length} subtext={filteredProducts.length !== allProducts.length ? `Showing ${filteredProducts.length} filtered` : null} />
                        <KPI title="Low Stock Items" value={allProducts.filter(p => (p.Total_Stock || 0) < 20).length} subtext="Below reorder level" />
                        <KPI title="Total Value" value={`₹${(totalValue / 100000).toFixed(1)}L`} subtext={`Exact: ₹${totalValue.toLocaleString()}`} />
                    </div>
                )}
                {activeTab === 'Purchase Orders' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <KPI title="Total POs Created" value={filteredOurPOs.filter(p => p._isFirstRow).length} subtext="In Your PO" />
                        <KPI title="Pending POs" value={filteredOurPOs.filter(p => p._isFirstRow && p.Status === 'Pending').length} subtext="Awaiting delivery" />
                        <KPI title="Vendor Purchases" value={filteredVendorPurchases.length} subtext="Actual deliveries" />
                    </div>
                )}

                {/* Content */}
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-50">
                        <h3 className="font-semibold text-slate-800">
                            {activeTab === 'Product Master' ? 'Active Inventory' :
                                poSubTab === 'Your PO' ? 'Your Purchase Orders' : 'Vendor Purchases (Actual Deliveries)'}
                        </h3>
                    </div>

                    <div>
                        {/* Product Master Table */}
                        {activeTab === 'Product Master' && (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                                    <tr>
                                        <th className="px-6 py-4 font-medium">Product</th>
                                        <th className="px-6 py-4 font-medium">Vendor ID</th>
                                        <th className="px-6 py-4 font-medium">Category</th>
                                        <th className="px-6 py-4 font-medium">Stock</th>
                                        <th className="px-6 py-4 font-medium">Unit Cost</th>
                                        <th className="px-6 py-4 font-medium">GST %</th>
                                        <th className="px-6 py-4 font-medium">Landed Cost</th>
                                        <th className="px-6 py-4 font-medium">Reorder Level</th>
                                        <th className="px-6 py-4 font-medium">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredProducts.length === 0 ? (
                                        <tr>
                                            <td colSpan="9" className="px-6 py-8 text-center text-slate-400">
                                                {searchQuery || categoryFilter !== 'All' ? 'No products match your filters' : 'No products found'}
                                            </td>
                                        </tr>
                                    ) : filteredProducts.map((p, idx) => (
                                        <tr key={p.Product_ID || idx} className="border-b border-slate-50 hover:bg-slate-50/50">
                                            <td className="px-6 py-4 font-medium text-slate-700">
                                                <div>{p.Name}</div>
                                                <div className="text-[10px] text-slate-400">{p.Product_ID}</div>
                                            </td>
                                            <td className="px-6 py-4 text-slate-600">
                                                {p.Vendor_ID || <span className="text-slate-300">-</span>}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="bg-blue-50 text-blue-600 px-2 py-1 rounded text-xs font-medium">{p.Category}</span>
                                            </td>
                                            <td className="px-6 py-4 text-slate-600">{p.Total_Stock || 0} Units</td>
                                            <td className="px-6 py-4 text-slate-600">₹{p.Unit_Cost}</td>
                                            <td className="px-6 py-4 text-slate-600">{((p.GST || 0) * 100).toFixed(0)}%</td>
                                            <td className="px-6 py-4 font-semibold text-slate-800">₹{(p.Landed_Cost || 0).toFixed(2)}</td>
                                            <td className="px-6 py-4 text-slate-600">{p.Reorder_Level || 20} units</td>
                                            <td className="px-6 py-4">
                                                <div className="flex gap-3">
                                                    <button
                                                        onClick={() => setEditProduct(p)}
                                                        className="text-blue-500 hover:text-blue-700 p-1 hover:bg-blue-50 rounded"
                                                        title="Edit"
                                                    >
                                                        <Pencil size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => setDeleteProduct(p)}
                                                        className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded"
                                                        title="Delete"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            </div>
                        )}

                        {/* Your PO Table (OUR_PO sheet) - Same structure as Vendor Purchase */}
                        {activeTab === 'Purchase Orders' && poSubTab === 'Your PO' && (
                            filteredOurPOs.length === 0 ? (
                                <div className="px-6 py-12 text-center text-slate-400">
                                    {searchQuery ? 'No purchase orders match your search' : 'No purchase orders found'}
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-100 sticky top-0">
                                            <tr>
                                                <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">PO ID</th>
                                                <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Vendor ID</th>
                                                <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Created Date</th>
                                                <th className="px-3 py-3 text-right text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Total Amount</th>
                                                <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Product ID</th>
                                                <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Product Name</th>
                                                <th className="px-3 py-3 text-center text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">No of Cases</th>
                                                <th className="px-3 py-3 text-center text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Units/Case</th>
                                                <th className="px-3 py-3 text-right text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">PO Price</th>
                                                <th className="px-3 py-3 text-right text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Line Total</th>
                                                <th className="px-3 py-3 text-center text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Status</th>
                                                <th className="px-3 py-3 text-center text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {filteredOurPOs.map((row, idx) => (
                                                <tr key={`ourpo-${idx}`} className="hover:bg-slate-50">
                                                    <td className="px-3 py-3 font-semibold text-orange-600">{row.PO_ID || ''}</td>
                                                    <td className="px-3 py-3 font-medium text-slate-700">{row.Vendor_ID || ''}</td>
                                                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap">
                                                        {row.Created_Date ? new Date(row.Created_Date).toLocaleDateString() : ''}
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-bold text-slate-800">
                                                        {row.Total_Amount ? `₹${Number(row.Total_Amount).toLocaleString()}` : ''}
                                                    </td>
                                                    <td className="px-3 py-3 text-slate-600 font-mono text-xs">{row.Product_ID || ''}</td>
                                                    <td className="px-3 py-3 text-slate-800 font-medium max-w-[200px] truncate" title={row.Product_Name}>{row.Product_Name || ''}</td>
                                                    <td className="px-3 py-3 text-center font-semibold text-slate-700">{row.No_of_Cases || ''}</td>
                                                    <td className="px-3 py-3 text-center text-slate-600">{row.Units_Per_Case || ''}</td>
                                                    <td className="px-3 py-3 text-right font-medium text-green-600">
                                                        {row.PO_Price ? `₹${Number(row.PO_Price).toFixed(2)}` : ''}
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-semibold text-slate-700">{row.Line_Total || ''}</td>
                                                    <td className="px-3 py-3 text-center">
                                                        {row.Status && (
                                                            <span className={clsx("px-2 py-1 rounded text-xs font-medium",
                                                                row.Status === 'Completed' ? "bg-green-100 text-green-700" :
                                                                    "bg-orange-100 text-orange-700")}>
                                                                {row.Status}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-3 text-center">
                                                        {row._isFirstRow && (
                                                            row.Status === 'Completed' || recentlyDeliveredPOs.has(row._poId) ? (
                                                                <span className="flex items-center justify-center gap-1 text-green-600 font-medium text-xs px-2 py-1 bg-green-50 rounded">
                                                                    <CheckCircle size={14} />
                                                                    Delivered
                                                                </span>
                                                            ) : (
                                                                <button
                                                                    onClick={() => fetchPOItems(row._poId)}
                                                                    disabled={loadingPOItems}
                                                                    className="text-green-600 hover:text-green-800 font-medium text-xs px-2 py-1 bg-green-50 rounded hover:bg-green-100 disabled:opacity-50"
                                                                >
                                                                    {loadingPOItems ? 'Loading...' : 'Record Delivery'}
                                                                </button>
                                                            )
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )
                        )}

                        {/* Vendor Purchase - Table View (Vendor_Purchase sheet - all columns) */}
                        {activeTab === 'Purchase Orders' && poSubTab === 'Vendor Purchase' && (
                            filteredVendorPurchases.length === 0 ? (
                                <div className="px-6 py-12 text-center text-slate-400">
                                    {searchQuery ? 'No vendor purchases match your search' : 'No vendor purchases recorded yet'}
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-100 sticky top-0">
                                            <tr>
                                                <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">PO ID</th>
                                                <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Date</th>
                                                <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Vendor ID</th>
                                                <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Product ID</th>
                                                <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Product Name</th>
                                                <th className="px-3 py-3 text-center text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Batch</th>
                                                <th className="px-3 py-3 text-center text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Unit/Case</th>
                                                <th className="px-3 py-3 text-center text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Case Count</th>
                                                <th className="px-3 py-3 text-center text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Quantity</th>
                                                <th className="px-3 py-3 text-right text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">MRP</th>
                                                <th className="px-3 py-3 text-right text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">PO Price</th>
                                                <th className="px-3 py-3 text-center text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Payment Mode</th>
                                                <th className="px-3 py-3 text-center text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Payment Status</th>
                                                <th className="px-3 py-3 text-center text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">GST Filed</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {filteredVendorPurchases.map((vp, idx) => (
                                                <tr key={`vp-${idx}`} className="hover:bg-slate-50">
                                                    <td className="px-3 py-3 font-semibold text-orange-600">{vp.PO_ID || ''}</td>
                                                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{vp.Date ? new Date(vp.Date).toLocaleDateString() : ''}</td>
                                                    <td className="px-3 py-3 font-medium text-slate-700">{vp.Vendor_ID || ''}</td>
                                                    <td className="px-3 py-3 text-slate-600 font-mono text-xs">{vp.Product_ID || '-'}</td>
                                                    <td className="px-3 py-3 text-slate-800 font-medium max-w-[200px] truncate" title={vp.Product_Name}>{vp.Product_Name || '-'}</td>
                                                    <td className="px-3 py-3 text-center text-slate-600">{vp.Batch || '-'}</td>
                                                    <td className="px-3 py-3 text-center text-slate-600">{vp.Units_Per_Case || '-'}</td>
                                                    <td className="px-3 py-3 text-center font-semibold text-slate-700">{vp.Case_Count || 0}</td>
                                                    <td className="px-3 py-3 text-center font-semibold text-slate-700">{vp.Quantity || 0}</td>
                                                    <td className="px-3 py-3 text-right text-slate-600">₹{(vp.MRP || 0).toFixed(2)}</td>
                                                    <td className="px-3 py-3 text-right font-medium text-green-600">₹{(vp.PO_Price || 0).toFixed(2)}</td>
                                                    <td className="px-3 py-3 text-center text-slate-600">{vp.Payment_Mode || '-'}</td>
                                                    <td className="px-3 py-3 text-center">
                                                        <span className={clsx("px-2 py-1 rounded text-xs font-medium",
                                                            vp.Payment_Status === 'Paid' ? "bg-green-100 text-green-700" :
                                                                vp.Payment_Status === 'Partial' ? "bg-yellow-100 text-yellow-700" :
                                                                    vp.Payment_Status ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-500"
                                                        )}>
                                                            {vp.Payment_Status || '-'}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-3 text-center">
                                                        <span className={clsx("px-2 py-1 rounded text-xs font-medium",
                                                            vp.GST_Filed === 'Yes' ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
                                                        )}>
                                                            {vp.GST_Filed || '-'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )
                        )}
                    </div>
                </div>
            </div>

            {/* Add Product Modal */}
            <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add New Product">
                <ProductForm
                    onSave={handleAddProduct}
                    onCancel={() => setShowAddModal(false)}
                    categories={categories}
                    saving={saving}
                />
            </Modal>

            {/* Edit Product Modal */}
            <Modal isOpen={!!editProduct} onClose={() => setEditProduct(null)} title="Edit Product">
                {editProduct && (
                    <ProductForm
                        product={editProduct}
                        onSave={handleEditProduct}
                        onCancel={() => setEditProduct(null)}
                        categories={categories}
                        saving={saving}
                    />
                )}
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal isOpen={!!deleteProduct} onClose={() => setDeleteProduct(null)} title="Confirm Delete">
                <div className="space-y-4">
                    <p className="text-slate-600">
                        Are you sure you want to delete <span className="font-semibold">"{deleteProduct?.Name}"</span>?
                    </p>
                    <p className="text-sm text-slate-400">This action cannot be undone.</p>
                    <div className="flex gap-3 pt-4">
                        <button
                            onClick={() => setDeleteProduct(null)}
                            className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 text-sm font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleDeleteProduct}
                            className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium"
                        >
                            Delete Product
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Create PO Modal */}
            <Modal isOpen={showPOModal} onClose={() => setShowPOModal(false)} title="Create Purchase Order">
                <POForm
                    products={allProducts}
                    vendors={vendors}
                    warehouse={warehouse}
                    onSave={handleCreatePO}
                    onCancel={() => setShowPOModal(false)}
                    saving={saving}
                />
            </Modal>

            {/* Create Multi-Product PO Modal */}
            <Modal isOpen={showMultiPOModal} onClose={() => setShowMultiPOModal(false)} title="Create Purchase Order (Multi-Product)" size="lg">
                <MultiPOForm
                    products={allProducts}
                    vendors={vendors}
                    warehouse={warehouse}
                    onSave={handleCreateMultiPO}
                    onCancel={() => setShowMultiPOModal(false)}
                    saving={saving}
                />
            </Modal>

            {/* Record Delivery Modal */}
            <Modal isOpen={showDeliveryModal} onClose={() => { setShowDeliveryModal(false); setPoDataForDelivery(null); }} title="Record Vendor Delivery" size="xl">
                {poDataForDelivery && (
                    <DeliveryRecordingForm
                        poData={poDataForDelivery}
                        products={products}
                        vendors={vendors}
                        onSave={async (deliveryData) => {
                            setSaving(true);
                            try {
                                // Use normalized route through DataContext recordDelivery proxy
                                const result = await recordDelivery(deliveryData);
                                if (!result.success) {
                                    throw new Error(result.error || 'Failed to record delivery');
                                }

                                // For normalized route, we have message/details, not sheet counters.
                                let successMessage = '✅ Delivery Recorded Successfully!\n\n';
                                if (result.message) {
                                    successMessage += result.message + '\n';
                                }
                                if (result.details) {
                                    successMessage += result.details;
                                }

                                alert(successMessage);

                                // Track successful delivery for tick indicator
                                setRecentlyDeliveredPOs(prev => new Set([...prev, poDataForDelivery.po_id]));
                                setShowDeliveryModal(false);
                                setPoDataForDelivery(null);
                                // Refresh data to get updated status
                                if (refreshData) refreshData();
                                fetchVendorPurchases();
                            } catch (err) {
                                alert(`Error: ${err.message}`);
                            } finally {
                                setSaving(false);
                            }
                        }}
                        onCancel={() => { setShowDeliveryModal(false); setPoDataForDelivery(null); }}
                        saving={saving}
                    />
                )}
            </Modal>
        </div>
    );
};
export default Inventory;
