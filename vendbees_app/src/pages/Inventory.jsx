import React, { useState, useMemo, useEffect } from 'react';
import Header from '../components/Header';
import { useData } from '../context/DataContext';
import { Package, Truck, IndianRupee, Filter, Plus, Pencil, Trash2, Eye, X, Search, Warehouse, AlertCircle, Info, ChevronDown, ChevronRight, CheckCircle } from 'lucide-react';
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
        // Format for API - include vendor_id in each item
        const validItems = items.filter(item =>
            item.product_id && item.no_of_cases && item.units_per_case
        ).map(item => {
            return {
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

    // poData contains: { po_id, vendor_id, po_date, items: [{Product_ID, Product_Name, No_of_Cases, Units_Per_Case, PO_Price}] }
    const [purchaseDate, setPurchaseDate] = useState(today);
    const [paymentMode, setPaymentMode] = useState('');
    const [paymentStatus, setPaymentStatus] = useState('Completed');
    const [gstFiled, setGstFiled] = useState('No');

    // Initialize product details from PO items
    const [productDetails, setProductDetails] = useState(() => {
        return (poData?.items || []).map(item => ({
            product_id: item.Product_ID || '',
            product_name: item.Product_Name || '',
            ordered_cases: item.No_of_Cases || 0,
            batch: '',
            units_per_case: item.Units_Per_Case || 1,
            case_count: '', // Empty = not delivered yet, 0 = explicitly not delivered
            mrp: '',
            po_price: item.PO_Price || '',
            is_custom: false
        }));
    });

    // Custom products added by admin (for vendor substitutions)
    const [customProducts, setCustomProducts] = useState([]);
    const [showCustomProductForm, setShowCustomProductForm] = useState(false);
    const [newCustomProduct, setNewCustomProduct] = useState({
        product_id: '',
        product_name: '',
        quantity: '',
        units_per_case: 1,
        batch: '',
        mrp: '',
        po_price: ''
    });

    // Get vendor products for dropdown - show all products that could be supplied by this vendor
    const vendorId = poData?.vendor_id || '';
    const vendorProducts = vendorId && products ? products.filter(p => p && p.Product_ID) : [];

    // Handle product selection for custom product
    const handleSelectProduct = (productId) => {
        const selected = products.find(p => p.Product_ID === productId);
        if (selected) {
            setNewCustomProduct(prev => ({
                ...prev,
                product_id: selected.Product_ID,
                product_name: selected.Name || '',
                units_per_case: selected.Units_Per_Case || 1,
                mrp: selected.MRP || '',
                po_price: selected.Unit_Cost || ''
            }));
        }
    };

    // Update a specific product's field
    const updateProduct = (index, field, value) => {
        setProductDetails(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: value };
            return updated;
        });
    };

    // Add custom product (vendor substitution)
    const handleAddCustomProduct = () => {
        if (!newCustomProduct.product_name.trim()) {
            alert('Product Name is required');
            return;
        }
        if (!newCustomProduct.product_id.trim()) {
            alert('Product ID is required');
            return;
        }
        const quantity = parseInt(newCustomProduct.quantity) || 0;
        if (quantity <= 0) {
            alert('Quantity must be greater than 0');
            return;
        }

        setCustomProducts([...customProducts, {
            product_id: newCustomProduct.product_id.trim(),
            product_name: newCustomProduct.product_name.trim(),
            quantity: quantity,
            units_per_case: parseInt(newCustomProduct.units_per_case) || 1,
            batch: newCustomProduct.batch.trim(),
            mrp: parseFloat(newCustomProduct.mrp) || 0,
            po_price: parseFloat(newCustomProduct.po_price) || 0
        }]);

        // Reset form
        setNewCustomProduct({
            product_id: '',
            product_name: '',
            quantity: '',
            units_per_case: 1,
            batch: '',
            mrp: '',
            po_price: ''
        });
        setShowCustomProductForm(false);
    };

    const handleRemoveCustomProduct = (index) => {
        setCustomProducts(customProducts.filter((_, i) => i !== index));
    };

    // Calculate quantity for a product
    const getQuantity = (product) => {
        const cases = parseInt(product.case_count) || 0;
        const units = parseInt(product.units_per_case) || 1;
        return cases * units;
    };

    // Count products being delivered
    const productsToDeliver = productDetails.filter(p => parseInt(p.case_count) > 0);
    const totalCases = productsToDeliver.reduce((sum, p) => sum + (parseInt(p.case_count) || 0), 0);
    const totalUnits = productsToDeliver.reduce((sum, p) => sum + getQuantity(p), 0);
    const totalCustomUnits = customProducts.reduce((sum, p) => sum + p.quantity, 0);

    const handleSubmit = (e) => {
        e.preventDefault();

        if (!purchaseDate) {
            alert('Please enter Purchase Date');
            return;
        }

        if (productsToDeliver.length === 0 && customProducts.length === 0) {
            alert('Please enter case count for at least one PO product or add a custom product');
            return;
        }

        // Prepare PO products array - only products with case_count > 0
        const products = productsToDeliver.map(p => ({
            product_id: p.product_id,
            product_name: p.product_name,
            batch: p.batch,
            units_per_case: parseInt(p.units_per_case) || 1,
            case_count: parseInt(p.case_count) || 0,
            mrp: parseFloat(p.mrp) || 0,
            po_price: parseFloat(p.po_price) || 0,
            payment_mode: paymentMode,
            payment_status: paymentStatus,
            gst_filed: gstFiled
        }));

        onSave({
            po_id: poData.po_id,
            vendor_id: poData.vendor_id,
            po_date: poData.po_date,
            purchase_date: purchaseDate,
            po_products: products,
            custom_products: customProducts.map(cp => ({
                product_id: cp.product_id,
                product_name: cp.product_name,
                quantity: cp.quantity,
                units_per_case: cp.units_per_case,
                batch: cp.batch,
                mrp: cp.mrp,
                po_price: cp.po_price
            }))
        });
    };

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
                        <div className="text-green-600">To Deliver: <strong>{productsToDeliver.length}</strong></div>
                    </div>
                </div>
            </div>

            {/* Purchase Date (Manual Entry) */}
            <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                <label className="block text-sm font-medium text-slate-700 mb-2">Purchase Date (Actual Delivery Date) *</label>
                <input
                    type="date"
                    value={purchaseDate}
                    onChange={e => setPurchaseDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                    required
                />
                <div className="text-xs text-slate-500 mt-1">Enter the actual date when goods were received from vendor</div>
            </div>

            {/* Common Payment & GST Fields */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div className="text-sm font-medium text-slate-700 mb-3">Payment Details (Applied to all products)</div>
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Payment Mode</label>
                        <select
                            value={paymentMode}
                            onChange={e => setPaymentMode(e.target.value)}
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
                        <label className="block text-xs font-medium text-slate-600 mb-1">Payment Status</label>
                        <select
                            value={paymentStatus}
                            onChange={e => setPaymentStatus(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                        >
                            <option value="Completed">Completed</option>
                            <option value="Not Completed">Not Completed</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">GST Filed</label>
                        <select
                            value={gstFiled}
                            onChange={e => setGstFiled(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                        >
                            <option value="No">No</option>
                            <option value="Yes">Yes</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Products List */}
            <div className="space-y-3">
                <div className="text-sm font-medium text-slate-700">Products in this PO ({productDetails.length} items)</div>
                <div className="text-xs text-slate-500">Enter details for delivered products. Leave Case Count empty or 0 for items not delivered.</div>

                {productDetails.map((product, index) => (
                    <div key={index} className={clsx(
                        "p-4 rounded-lg border",
                        parseInt(product.case_count) > 0 ? "bg-green-50 border-green-200" : "bg-white border-slate-200"
                    )}>
                        {/* Product Header */}
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <div className="font-medium text-slate-800">{product.product_name}</div>
                                <div className="text-xs text-slate-500">{product.product_id}</div>
                            </div>
                            <div className="text-right">
                                <div className="text-sm text-slate-600">Ordered: <strong>{product.ordered_cases}</strong> cases</div>
                                {parseInt(product.case_count) > 0 && (
                                    <div className="text-sm text-green-600">
                                        Delivering: <strong>{product.case_count}</strong> cases ({getQuantity(product)} units)
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Product Fields */}
                        <div className="grid grid-cols-6 gap-2">
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
                                <label className="block text-xs text-slate-500 mb-1">Quantity</label>
                                <input
                                    type="number"
                                    value={getQuantity(product)}
                                    className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm bg-slate-100 text-slate-600"
                                    disabled
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
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Quantity *</label>
                                    <input
                                        type="number"
                                        value={newCustomProduct.quantity}
                                        onChange={(e) => setNewCustomProduct({ ...newCustomProduct, quantity: e.target.value })}
                                        className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-orange-500"
                                        placeholder="Units"
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
                                    <div className="text-xs text-slate-600">ID: {product.product_id} | Qty: {product.quantity} units | Batch: {product.batch || '-'}</div>
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

    // Fetch PO items for delivery recording
    const fetchPOItems = async (poId) => {
        setLoadingPOItems(true);
        try {
            const response = await fetch(`${API_URL}/po-items/${encodeURIComponent(poId)}`);
            const data = await response.json();
            if (data.success) {
                setPoDataForDelivery({
                    po_id: poId,
                    vendor_id: data.vendor_id,
                    po_date: data.po_date,
                    items: data.items
                });
                setShowDeliveryModal(true);
            } else {
                alert(`Failed to fetch PO items: ${data.error}`);
            }
        } catch (err) {
            console.error('Error fetching PO items:', err);
            alert('Error fetching PO items');
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

        return [...list].sort((a, b) => {
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
                                                <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Purchase Date</th>
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
                                                    <td className="px-3 py-3 font-semibold text-orange-600">{vp.PO_ID || '-'}</td>
                                                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{vp.Date ? new Date(vp.Date).toLocaleDateString() : '-'}</td>
                                                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{vp.Purchase_Date ? new Date(vp.Purchase_Date).toLocaleDateString() : '-'}</td>
                                                    <td className="px-3 py-3 font-medium text-slate-700">{vp.Vendor_ID || '-'}</td>
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
                                const response = await fetch(`${API_URL}/record-delivery`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(deliveryData)
                                });
                                const result = await response.json();
                                if (!result.success) {
                                    throw new Error(result.error);
                                }

                                // Build success message with details
                                const { po_products_recorded, custom_products_recorded, po_products_skipped, both_sheets_updated } = result;
                                let successMessage = `✅ Delivery Recorded Successfully!\n\n`;
                                successMessage += `PO Products: ${po_products_recorded} recorded`;
                                if (po_products_skipped > 0) {
                                    successMessage += `, ${po_products_skipped} skipped`;
                                }
                                successMessage += `\n`;
                                if (custom_products_recorded > 0) {
                                    successMessage += `Custom Products: ${custom_products_recorded} recorded\n`;
                                }

                                if (both_sheets_updated) {
                                    successMessage += `\n✓ Data inserted in both sheets\n✓ Status updated to "Completed"`;
                                } else {
                                    successMessage += `\n⚠ Partial update - Status remains "Pending"`;
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
