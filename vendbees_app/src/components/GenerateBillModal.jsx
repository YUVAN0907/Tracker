import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Download } from 'lucide-react';
import clsx from 'clsx';
import { generateInvoicePDF } from '../utils/invoiceUtils';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';

const GenerateBillModal = ({ isOpen, onClose, onSuccess }) => {
    const { token } = useAuth();
    // Get Firebase data directly from context
    const { purchased_product_cases: purchased_products, products } = useData();
    const [billItems, setBillItems] = useState([]);
    const [selectedProductId, setSelectedProductId] = useState('');
    const [selectedQuantity, setSelectedQuantity] = useState('');
    const [selectedCases, setSelectedCases] = useState('');
    const [selectedHSNCode, setSelectedHSNCode] = useState('');
    const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
    const [generating, setGenerating] = useState(false);
    const [productSource, setProductSource] = useState('purchased'); // 'purchased' or 'custom'
    const [searchTerm, setSearchTerm] = useState('');
    const [showProductSuggestions, setShowProductSuggestions] = useState(false);

    // Close suggestions when clicking outside
    useEffect(() => {
        const handleClickOutside = () => {
            setShowProductSuggestions(false);
        };
        
        if (showProductSuggestions) {
            document.addEventListener('click', handleClickOutside);
            return () => {
                document.removeEventListener('click', handleClickOutside);
            };
        }
    }, [showProductSuggestions]);

    // Group purchased products by Product_ID and combine units from different cases/POs
    const groupedPurchasedProducts = (() => {
        if (!purchased_products || !Array.isArray(purchased_products)) return {};
        
        const grouped = {};
        purchased_products.forEach(item => {
            // Handle both UPPERCASE and camelCase field names
            const productId = item.Product_ID || item.productId || item.id;
            if (!productId) return;
            
            if (!grouped[productId]) {
                grouped[productId] = {
                    Product_ID: productId,
                    Product_Name: item.Product_Name || item.productName || '',
                    Total_Available_Units: 0,
                    Units_Per_Case: item.Units_Per_Case || item.unitsPerCase || 1,
                    po_ids: [], // Track which POs have this product
                    cases: [] // Track individual cases for reference
                };
            }
            
            // Handle both UPPERCASE and camelCase field names for available units
            const availableUnits = item.Available_Units || item.availableUnits || 0;
            grouped[productId].Total_Available_Units += availableUnits;
            
            // Handle both UPPERCASE and camelCase field names for PO ID
            const poId = item.PO_ID || item.poId || 'Unknown';
            if (!grouped[productId].po_ids.includes(poId)) {
                grouped[productId].po_ids.push(poId);
            }
            grouped[productId].cases.push({
                poId,
                availableUnits: availableUnits,
                batch: item.Batch || item.batch || '',
                expd: item.expd || item.EXPD || ''
            });
        });
        
        return grouped;
    })();

    // Get available products for search (filtered by total available units > 0)
    const availablePurchasedProducts = Object.values(groupedPurchasedProducts)
        .filter(p => p.Total_Available_Units > 0)
        .sort((a, b) => (b.Total_Available_Units) - (a.Total_Available_Units));
    
    // Filter based on search term for purchased products
    const filteredPurchasedProducts = searchTerm.trim()
        ? availablePurchasedProducts.filter(p => 
            (p.Product_Name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (p.Product_ID || '').toLowerCase().includes(searchTerm.toLowerCase())
          )
        : [];
    
    // Filter custom products based on search term
    const filteredCustomProducts = searchTerm.trim() && products && Array.isArray(products)
        ? products.filter(p => {
            const name = (p.Product_Name || p.Name || p.name || p.productName || '').toLowerCase();
            const id = (p.Product_ID || p.id || p.ID || '').toLowerCase();
            const search = searchTerm.toLowerCase();
            return name.includes(search) || id.includes(search);
          })
        : [];

    // Get MRP for a product from products list
    const getMRP = (productId) => {
        if (!products || !Array.isArray(products)) return 0;
        const product = products.find(p => p && (p.Product_ID === productId || p.id === productId || p.ID === productId));
        return (product?.MRP || product?.mrp || product?.price || 0);
    };

    // Get GST rate for a product from products list
    const getGST = (productId) => {
        if (!products || !Array.isArray(products)) return 0.18;
        const product = products.find(p => p && (p.Product_ID === productId || p.id === productId || p.ID === productId));
        if (!product) return 0.18; // Default fallback to 18%
        let gstRate = (product.GST || product.gst || product.tax || 0);
        // If GST > 1, it's stored as percentage (18), convert to decimal (0.18)
        if (gstRate > 1) gstRate = gstRate / 100;
        return gstRate;
    };

    // Calculate cases: round up any partial case
    const calculateCases = (units, unitsPerCase) => {
        if (units <= 0) return 0;
        return Math.ceil(units / unitsPerCase);
    };

    // Get product name
    const getProductName = (productId) => {
        const groupedProduct = groupedPurchasedProducts[productId];
        if (groupedProduct) return groupedProduct.Product_Name;
        if (!purchased_products || !Array.isArray(purchased_products)) return productId;
        const product = purchased_products.find(p => p && p.Product_ID === productId);
        return (product?.Product_Name || product?.name || product?.productName || productId);
    };

    // Get product name from all products
    const getProductNameFromAll = (productId) => {
        if (!products || !Array.isArray(products)) return productId;
        const product = products.find(p => p && (p.Product_ID === productId || p.id === productId || p.ID === productId));
        return (product?.Product_Name || product?.Name || product?.name || product?.productName || productId);
    };

    // Get units per case
    const getUnitsPerCase = (productId) => {
        const groupedProduct = groupedPurchasedProducts[productId];
        if (groupedProduct) return groupedProduct.Units_Per_Case;
        if (!purchased_products || !Array.isArray(purchased_products)) return 1;
        const product = purchased_products.find(p => p && p.Product_ID === productId);
        return product?.Units_Per_Case || 1;
    };

    // Get units per case from all products
    const getUnitsPerCaseFromAll = (productId) => {
        if (!products || !Array.isArray(products)) return 1;
        const product = products.find(p => p && (p.Product_ID === productId || p.id === productId || p.ID === productId));
        return (product?.Units_Per_Case || product?.unitsPerCase || product?.units_per_case || 1);
    };

    // Get total available units from grouped data
    const getTotalAvailableUnits = (productId) => {
        const groupedProduct = groupedPurchasedProducts[productId];
        if (groupedProduct) return groupedProduct.Total_Available_Units;
        return 0;
    };

    // Add item to bill
    const handleAddItem = () => {
        if (!selectedProductId || (!selectedQuantity && !selectedCases)) {
            alert('Please select a product and enter quantity or cases');
            return;
        }

        let totalUnits = parseInt(selectedQuantity) || 0;
        let unitsPerCase = 1;
        let productName = '';
        let mrp = 0;
        let gst = 0;

        if (productSource === 'purchased') {
            const groupedProduct = groupedPurchasedProducts[selectedProductId];
            if (!groupedProduct) {
                alert('Product not found');
                return;
            }

            unitsPerCase = groupedProduct.Units_Per_Case;
            
            if (selectedCases) {
                totalUnits = (parseInt(selectedCases) || 0) * unitsPerCase;
            }

            if (totalUnits > groupedProduct.Total_Available_Units) {
                alert(`Cannot add more than ${groupedProduct.Total_Available_Units} available units (Grouped from ${groupedProduct.po_ids.length} PO${groupedProduct.po_ids.length > 1 ? 's' : ''}: ${groupedProduct.po_ids.join(', ')})`);
                return;
            }

            productName = groupedProduct.Product_Name;
        } else {
            const customProduct = products && Array.isArray(products) 
                ? products.find(p => p && (p.Product_ID === selectedProductId || p.id === selectedProductId || p.ID === selectedProductId))
                : null;
            if (!customProduct) {
                alert('Product not found');
                return;
            }

            unitsPerCase = getUnitsPerCaseFromAll(selectedProductId);
            
            if (selectedCases) {
                totalUnits = (parseInt(selectedCases) || 0) * unitsPerCase;
            }

            productName = getProductNameFromAll(selectedProductId);
        }

        if (totalUnits <= 0) {
            alert('Quantity must be greater than 0');
            return;
        }

        mrp = getMRP(selectedProductId);
        gst = getGST(selectedProductId);
        const amount = totalUnits * mrp;
        const cases = calculateCases(totalUnits, unitsPerCase);

        // Check if product already exists in bill
        const existingIndex = billItems.findIndex(item => item.Product_ID === selectedProductId);
        
        if (existingIndex >= 0) {
            const newQuantity = billItems[existingIndex].Quantity + totalUnits;
            const updatedItems = [...billItems];
            updatedItems[existingIndex] = {
                ...updatedItems[existingIndex],
                Quantity: newQuantity,
                Total_Amount: newQuantity * mrp
            };
            setBillItems(updatedItems);
        } else {
            setBillItems([
                ...billItems,
                {
                    Product_ID: selectedProductId,
                    Product_Name: productName,
                    Units_Per_Case: unitsPerCase,
                    Quantity: totalUnits,
                    Cases: cases,
                    MRP: mrp,
                    GST: gst,
                    Total_Amount: amount,
                    HSN_Code: selectedHSNCode,
                    Source: productSource
                }
            ]);
        }

        // Reset inputs
        setSelectedProductId('');
        setSelectedQuantity('');
        setSelectedCases('');
        setSelectedHSNCode('');
        setSearchTerm('');
        setShowProductSuggestions(false);
    };

    // Remove item from bill
    const handleRemoveItem = (index) => {
        setBillItems(billItems.filter((_, i) => i !== index));
    };

    // Clear all bill items
    const handleClearBill = () => {
        if (billItems.length === 0) {
            alert('No items to clear');
            return;
        }
        if (window.confirm('Are you sure you want to clear all items?')) {
            setBillItems([]);
            setSelectedProductId('');
            setSelectedQuantity('');
            setSelectedCases('');
            setSearchTerm('');
            setShowProductSuggestions(false);
        }
    };

    // Generate and download bill
    const handleGenerateBill = async () => {
        if (billItems.length === 0) {
            alert('Please add at least one item to the bill');
            return;
        }

        setGenerating(true);
        try {
            // Generate PDF
            await generateInvoicePDF(billItems, billDate);
            
            // Generate bill number to save to database
            const invoiceDate = new Date(billDate);
            const billNumber = `INV-${invoiceDate.getFullYear()}-${String(invoiceDate.getMonth() + 1).padStart(2, '0')}-${String(invoiceDate.getDate()).padStart(2, '0')}-${Date.now().toString().slice(-4)}`;
            
            // Calculate totals
            const totalAmount = billItems.reduce((sum, item) => sum + item.Total_Amount, 0);
            const totalProducts = billItems.length; // Unique line items
            const totalItems = billItems.reduce((sum, item) => sum + item.Quantity, 0);
            
            // Prepare bill data as stringified JSON
            const billData = JSON.stringify({
                billNumber,
                billDate,
                items: billItems,
                totalAmount,
                totalProducts,
                totalItems,
                gst: billItems.reduce((sum, item) => sum + (item.Total_Amount * item.GST), 0),
                grandTotal: totalAmount + billItems.reduce((sum, item) => sum + (item.Total_Amount * item.GST), 0)
            });
            
            // Save bill to database via API
            const response = await fetch('http://localhost:3002/api/bills/', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    billNumber,
                    totalAmount,
                    totalProducts,
                    totalItems,
                    billData
                })
            });
            
            if (response.ok) {
                // Clear bill items and trigger history refresh
                setBillItems([]);
                setSelectedProductId('');
                setSelectedQuantity('');
                setSelectedCases('');
                setSearchTerm('');
                
                // Call parent callback to refresh bill history
                if (onSuccess) {
                    onSuccess();
                }
                
                alert('Bill generated and saved successfully!');
            } else {
                const errorData = await response.json();
                console.error('Error saving bill:', errorData);
                alert('Bill generated but failed to save to history. Please try again.');
            }
        } catch (error) {
            console.error('Error generating bill:', error);
            alert('Failed to generate bill. Please try again.');
        } finally {
            setGenerating(false);
        }
    };

    const totalAmount = billItems.reduce((sum, item) => sum + item.Total_Amount, 0);
    const totalUnits = billItems.reduce((sum, item) => sum + item.Quantity, 0);
    const totalCases = billItems.reduce((sum, item) => sum + item.Cases, 0);
    // Calculate GST based on per-product GST rates
    const gstAmount = billItems.reduce((sum, item) => sum + (item.Total_Amount * item.GST), 0);
    const grandTotal = totalAmount + gstAmount;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2">
            <div className="bg-white rounded-xl shadow-2xl max-w-7xl w-full h-[95vh] overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-gradient-to-r from-orange-500 to-orange-600 text-white p-6 flex justify-between items-center border-b border-orange-400">
                    <div>
                        <h2 className="text-2xl font-bold">Generate Invoice</h2>
                        <p className="text-orange-100 text-sm">Create and download bill from purchased products</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-orange-700 rounded-lg transition"
                    >
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Date Input */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">
                                Invoice Date
                            </label>
                            <input
                                type="date"
                                value={billDate}
                                onChange={(e) => setBillDate(e.target.value)}
                                className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:outline-none focus:border-orange-500"
                            />
                        </div>
                    </div>

                    {/* Add Item Section */}
                    <div className="bg-slate-50 p-6 rounded-lg border-2 border-slate-200">
                        <h3 className="font-semibold text-lg text-slate-800 mb-4">Add Products to Invoice</h3>
                        
                        {/* Product Source Toggle */}
                        <div className="flex gap-2 mb-4">
                            <button
                                onClick={() => {
                                    setProductSource('purchased');
                                    setSelectedProductId('');
                                    setSearchTerm('');
                                    setShowProductSuggestions(false);
                                }}
                                className={clsx(
                                    'px-4 py-2 rounded-lg font-medium transition',
                                    productSource === 'purchased'
                                        ? 'bg-orange-500 text-white'
                                        : 'bg-white text-slate-700 border-2 border-slate-300 hover:border-orange-500'
                                )}
                            >
                                Purchased Products
                            </button>
                            <button
                                onClick={() => {
                                    setProductSource('custom');
                                    setSelectedProductId('');
                                    setSearchTerm('');
                                    setShowProductSuggestions(false);
                                }}
                                className={clsx(
                                    'px-4 py-2 rounded-lg font-medium transition',
                                    productSource === 'custom'
                                        ? 'bg-orange-500 text-white'
                                        : 'bg-white text-slate-700 border-2 border-slate-300 hover:border-orange-500'
                                )}
                            >
                                Custom Products
                            </button>
                        </div>
                        
                        <div className="grid grid-cols-1 lg:grid-cols-8 gap-4 mb-4">
                            {/* Product Selection - Search with filter for both */}
                            <div className="lg:col-span-2 relative">
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Search Product
                                </label>
                                
                                <input
                                    type="text"
                                    placeholder={productSource === 'purchased' ? "Search by name or ID..." : "Type product name..."}
                                    value={searchTerm}
                                    onChange={(e) => {
                                        setSearchTerm(e.target.value);
                                        setShowProductSuggestions(true);
                                    }}
                                    onFocus={() => searchTerm && setShowProductSuggestions(true)}
                                    className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg focus:outline-none focus:border-orange-500 text-sm"
                                />
                                
                                {/* Product Suggestions Dropdown */}
                                {showProductSuggestions && searchTerm && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border-2 border-slate-300 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
                                        {productSource === 'purchased' ? (
                                            // Grouped purchased products
                                            filteredPurchasedProducts.length === 0 ? (
                                                <div className="px-3 py-2 text-sm text-slate-600 text-center">
                                                    No products found
                                                </div>
                                            ) : (
                                                filteredPurchasedProducts.map((product) => (
                                                    <div
                                                        key={product.Product_ID}
                                                        onClick={() => {
                                                            setSelectedProductId(product.Product_ID);
                                                            setSearchTerm('');
                                                            setShowProductSuggestions(false);
                                                            setSelectedQuantity('');
                                                            setSelectedCases('');
                                                        }}
                                                        className="px-3 py-2 cursor-pointer hover:bg-orange-50 border-b border-slate-100 last:border-b-0 text-sm transition"
                                                    >
                                                        <div className="font-semibold text-slate-800">{product.Product_Name}</div>
                                                        <div className="text-xs text-slate-600 mt-1">
                                                            <div>ID: {product.Product_ID}</div>
                                                            <div className="font-medium text-green-700">Total Available: {product.Total_Available_Units} units</div>
                                                            <div className="text-slate-500">From {product.po_ids.length} PO{product.po_ids.length > 1 ? 's' : ''}: {product.po_ids.join(', ')}</div>
                                                        </div>
                                                    </div>
                                                ))
                                            )
                                        ) : (
                                            // Custom products
                                            filteredCustomProducts.length === 0 ? (
                                                <div className="px-3 py-2 text-sm text-slate-600 text-center">
                                                    No products found
                                                </div>
                                            ) : (
                                                filteredCustomProducts.map((product) => {
                                                    const productName = product.Product_Name || product.Name || product.name || product.productName || 'Unknown';
                                                    const productId = product.Product_ID || product.id || product.ID;
                                                    
                                                    return (
                                                        <div
                                                            key={productId}
                                                            onClick={() => {
                                                                setSelectedProductId(productId);
                                                                setSearchTerm('');
                                                                setShowProductSuggestions(false);
                                                                setSelectedQuantity('');
                                                                setSelectedCases('');
                                                            }}
                                                            className="px-3 py-2 cursor-pointer hover:bg-blue-50 border-b border-slate-100 last:border-b-0 text-sm transition"
                                                        >
                                                            <div className="font-semibold text-slate-800">{productName}</div>
                                                            <div className="text-xs text-slate-600">
                                                                ID: {productId}
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            )
                                        )}
                                    </div>
                                )}

                                {/* Selected Product Info */}
                                {selectedProductId && (
                                    <div className="mt-1 text-xs text-green-700 bg-green-50 p-2 rounded border border-green-200">
                                        ✓ Selected: {productSource === 'purchased' 
                                            ? groupedPurchasedProducts[selectedProductId]?.Product_Name 
                                            : getProductNameFromAll(selectedProductId)}
                                    </div>
                                )}
                            </div>

                            {/* Units Input */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Units
                                </label>
                                <input
                                    type="number"
                                    value={selectedQuantity}
                                    onChange={(e) => {
                                        const units = parseInt(e.target.value) || 0;
                                        setSelectedQuantity(e.target.value);
                                        // Auto-calculate cases
                                        const unitsPerCase = selectedProductId ? 
                                            (productSource === 'custom' ? getUnitsPerCaseFromAll(selectedProductId) : getUnitsPerCase(selectedProductId)) 
                                            : 1;
                                        if (units > 0) {
                                            const calculatedCases = Math.floor(units / unitsPerCase);
                                            setSelectedCases(calculatedCases.toString());
                                        } else {
                                            setSelectedCases('');
                                        }
                                    }}
                                    placeholder="0"
                                    className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg focus:outline-none focus:border-orange-500 text-sm"
                                    min="0"
                                />
                            </div>

                            {/* Cases Input */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Cases
                                </label>
                                <input
                                    type="number"
                                    value={selectedCases}
                                    onChange={(e) => {
                                        const cases = parseInt(e.target.value) || 0;
                                        setSelectedCases(e.target.value);
                                        // Auto-calculate units
                                        const unitsPerCase = selectedProductId ? 
                                            (productSource === 'custom' ? getUnitsPerCaseFromAll(selectedProductId) : getUnitsPerCase(selectedProductId)) 
                                            : 1;
                                        if (cases > 0) {
                                            const calculatedUnits = cases * unitsPerCase;
                                            setSelectedQuantity(calculatedUnits.toString());
                                        } else {
                                            setSelectedQuantity('');
                                        }
                                    }}
                                    placeholder="0"
                                    className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg focus:outline-none focus:border-orange-500 text-sm"
                                    min="0"
                                />
                            </div>

                            {/* HSN Code Input */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    HSN Code
                                </label>
                                <input
                                    type="text"
                                    value={selectedHSNCode}
                                    onChange={(e) => setSelectedHSNCode(e.target.value)}
                                    placeholder="Enter HSN code"
                                    className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg focus:outline-none focus:border-orange-500 text-sm"
                                />
                            </div>

                            {/* Add Button */}
                            <div className="flex items-end">
                                <button
                                    onClick={handleAddItem}
                                    className="w-full px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition"
                                >
                                    <Plus size={16} /> Add
                                </button>
                            </div>
                        </div>

                        {selectedProductId && (
                            <div className="text-xs text-slate-600 bg-orange-50 p-3 rounded border border-orange-200">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <span className="font-semibold text-slate-700">Product ID:</span> {selectedProductId}
                                    </div>
                                    <div>
                                        <span className="font-semibold text-slate-700">MRP:</span> ₹{getMRP(selectedProductId).toFixed(2)}
                                    </div>
                                    <div>
                                        <span className="font-semibold text-slate-700">GST %:</span> {(getGST(selectedProductId) * 100).toFixed(0)}%
                                    </div>
                                    <div>
                                        <span className="font-semibold text-slate-700">Units/Case:</span> {productSource === 'custom' ? getUnitsPerCaseFromAll(selectedProductId) : getUnitsPerCase(selectedProductId)}
                                    </div>
                                    <div className="col-span-2">
                                        <span className="font-semibold text-slate-700">Source:</span> {productSource === 'custom' ? 'Custom Products' : 'Purchased Products'}
                                    </div>
                                    {productSource === 'purchased' && groupedPurchasedProducts[selectedProductId] && (
                                        <>
                                            <div className="col-span-2 border-t pt-2 mt-2">
                                                <span className="font-semibold text-green-700">Total Available:</span> {groupedPurchasedProducts[selectedProductId].Total_Available_Units} units
                                            </div>
                                            <div className="col-span-2 text-xs text-slate-600">
                                                From {groupedPurchasedProducts[selectedProductId].po_ids.length} PO{groupedPurchasedProducts[selectedProductId].po_ids.length > 1 ? 's' : ''}: {groupedPurchasedProducts[selectedProductId].po_ids.join(', ')}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Bill Items */}
                    {billItems.length > 0 ? (
                        <div className="border-2 border-slate-200 rounded-lg overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 border-b-2 border-slate-200">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-semibold text-slate-700 border-r-2 border-slate-300">HSN Code</th>
                                            <th className="px-4 py-3 text-left font-semibold text-slate-700 border-r-2 border-slate-300">Product ID</th>
                                            <th className="px-4 py-3 text-left font-semibold text-slate-700 border-r-2 border-slate-300">Product Name</th>
                                            <th className="px-4 py-3 text-right font-semibold text-slate-700 border-r-2 border-slate-300">Units</th>
                                            <th className="px-4 py-3 text-right font-semibold text-slate-700 border-r-2 border-slate-300">Cases</th>
                                            <th className="px-4 py-3 text-right font-semibold text-slate-700 border-r-2 border-slate-300">MRP</th>
                                            <th className="px-4 py-3 text-right font-semibold text-slate-700 border-r-2 border-slate-300">MRP with GST</th>
                                            <th className="px-4 py-3 text-right font-semibold text-slate-700 border-r-2 border-slate-300">GST %</th>
                                            <th className="px-4 py-3 text-right font-semibold text-slate-700 border-r-2 border-slate-300">Total</th>
                                            <th className="px-4 py-3 text-center font-semibold text-slate-700 border-r-2 border-slate-300">Source</th>
                                            <th className="px-4 py-3 text-center font-semibold text-slate-700">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {billItems.map((item, index) => (
                                            <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
                                                <td className="px-4 py-3 font-semibold text-slate-800 border-r-2 border-slate-300">{item.HSN_Code || '-'}</td>
                                                <td className="px-4 py-3 font-bold text-slate-800 border-r-2 border-slate-300">{item.Product_ID}</td>
                                                <td className="px-4 py-3 font-medium text-slate-800 border-r-2 border-slate-300">{item.Product_Name}</td>
                                                <td className="px-4 py-3 text-right text-slate-700 border-r-2 border-slate-300">{item.Quantity}</td>
                                                <td className="px-4 py-3 text-right text-blue-600 font-semibold border-r-2 border-slate-300">{item.Cases}</td>
                                                <td className="px-4 py-3 text-right text-slate-700 border-r-2 border-slate-300">₹{item.MRP.toFixed(2)}</td>
                                                <td className="px-4 py-3 text-right text-slate-700 border-r-2 border-slate-300">₹{(item.MRP * (1 + item.GST)).toFixed(2)}</td>
                                                <td className="px-4 py-3 text-right text-slate-700 border-r-2 border-slate-300">{(item.GST * 100).toFixed(0)}%</td>
                                                <td className="px-4 py-3 text-right font-bold text-orange-600 border-r-2 border-slate-300">
                                                    ₹{item.Total_Amount.toFixed(2)}
                                                </td>
                                                <td className="px-4 py-3 text-center text-xs font-semibold border-r-2 border-slate-300">
                                                    <span className={clsx(
                                                        'px-2 py-1 rounded',
                                                        item.Source === 'custom' 
                                                            ? 'bg-blue-100 text-blue-700' 
                                                            : 'bg-green-100 text-green-700'
                                                    )}>
                                                        {item.Source === 'custom' ? 'Custom' : 'Purchased'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <button
                                                        onClick={() => handleRemoveItem(index)}
                                                        className="p-1 hover:bg-red-100 text-red-600 rounded transition"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Summary */}
                            <div className="bg-orange-50 border-t-2 border-slate-200 px-4 py-4">
                                <div className="grid grid-cols-2 gap-4 mb-3 pb-3 border-b border-orange-200">
                                    <div className="flex justify-between">
                                        <span className="font-semibold text-slate-700">Total Units:</span>
                                        <span className="font-bold text-slate-800">{totalUnits}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="font-semibold text-slate-700">Total Cases:</span>
                                        <span className="font-bold text-blue-600">{totalCases}</span>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center mb-2">
                                    <span className="font-medium text-slate-700">Subtotal:</span>
                                    <span className="text-base font-semibold text-slate-800">₹{totalAmount.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center mb-3 pb-3 border-b border-orange-200">
                                    <span className="font-medium text-slate-700">GST (per product):</span>
                                    <span className="text-base font-semibold text-orange-600">₹{gstAmount.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center bg-orange-500 text-white rounded-lg px-4 py-3">
                                    <span className="font-bold text-lg">GRAND TOTAL:</span>
                                    <span className="text-2xl font-bold">₹{grandTotal.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center text-slate-500">
                            <p className="font-medium">No items added yet</p>
                            <p className="text-xs mt-1">Add products using the form above</p>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-3 pt-4 border-t border-slate-200">
                        <button
                            onClick={onClose}
                            className="px-6 py-3 border-2 border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg font-medium transition"
                        >
                            Cancel
                        </button>
                        {billItems.length > 0 && (
                            <button
                                onClick={handleClearBill}
                                className="px-6 py-3 border-2 border-red-300 text-red-700 hover:bg-red-50 rounded-lg font-medium transition"
                            >
                                Clear All
                            </button>
                        )}
                        <button
                            onClick={handleGenerateBill}
                            disabled={billItems.length === 0 || generating}
                            className={clsx(
                                "flex-1 px-6 py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition",
                                billItems.length === 0 || generating
                                    ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                                    : "bg-orange-500 hover:bg-orange-600 text-white"
                            )}
                        >
                            {generating ? (
                                <>Generating...</>
                            ) : (
                                <>
                                    <Download size={18} /> Generate & Download
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GenerateBillModal;