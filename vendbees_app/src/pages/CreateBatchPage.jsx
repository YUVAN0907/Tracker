import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { useData } from '../context/DataContext';
import { Plus, X, ChevronDown, ArrowLeft, Trash2 } from 'lucide-react';
import clsx from 'clsx';

const CreateBatchPage = () => {
    const navigate = useNavigate();
    const { machines, products = [], purchased_products = [], stocks = [], refreshData } = useData();
    const [batchNumber, setBatchNumber] = useState('');
    const [createdDate, setCreatedDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedMachines, setSelectedMachines] = useState(['', '', '', '']);
    const [activeStock, setActiveStock] = useState('S1');
    const [filterQuery, setFilterQuery] = useState('');
    const [showProductDropdown, setShowProductDropdown] = useState(null);
    const [showPatternDropdown, setShowPatternDropdown] = useState(null);
    const [previousPatterns, setPreviousPatterns] = useState([]);
    const [suggestedProducts, setSuggestedProducts] = useState({}); // key: product_id, value: {product_name, warehouse_units, batches: []}
    const [saving, setSaving] = useState(false);
    const [newCover, setNewCover] = useState({ stock: '', name: '' });
    const [pendingProduct, setPendingProduct] = useState(null); // Product being considered for sources
    const [suggestedBatches, setSuggestedBatches] = useState([]); // ALL batches containing this product across all stocks/covers
    const [detailedSuggestions, setDetailedSuggestions] = useState(null); // {previous_batches, warehouse, purchased_products}
    const [suggestionTab, setSuggestionTab] = useState('purchased'); // 'batches', 'warehouse', 'purchased'
    const [selectedSourceUnits, setSelectedSourceUnits] = useState({}); // Track selected units for each source
    const [pendingSources, setPendingSources] = useState([]); // Track what will be decreased when batch is created
    const [loadingSuggestions, setLoadingSuggestions] = useState(false); // Loading state for suggestions
    const [suggestionError, setSuggestionError] = useState(null); // Error message from suggestions
    const [stocksData, setStocksData] = useState({
        'S1': { machine: '', covers: {} },
        'S2': { machine: '', covers: {} },
        'S3': { machine: '', covers: {} },
        'S4': { machine: '', covers: {} }
    });
    const API_URL = 'http://127.0.0.1:3002/api';

    // Load suggestions on mount
    useEffect(() => {
        const loadData = async () => {
            try {
                const [patternsRes, suggestionsRes] = await Promise.all([
                    fetch(`${API_URL}/stocks/get-previous-patterns`),
                    fetch(`${API_URL}/stocks/get-batch-suggestions`)
                ]);

                const patternsData = await patternsRes.json();
                const suggestionsData = await suggestionsRes.json();

                console.log('✅ Loaded suggestions (keyed by stock-cover-productId):', suggestionsData.suggestions);

                setPreviousPatterns(patternsData.patterns || []);
                setSuggestedProducts(suggestionsData.suggestions || {});
            } catch (e) {
                console.error('Error loading data:', e);
            }
        };
        loadData();
    }, []);

    // Get batch grouping info
    const getBatchGroupInfo = () => {
        if (!batchNumber.trim()) return null;

        const batchNum = parseInt(batchNumber.match(/\d+/)?.[0] || 0);
        if (batchNum === 0) return null;

        const isOddBatch = batchNum % 2 === 1;
        const groupLabel = isOddBatch ? 'Odd Batches' : 'Even Batches';

        return { batchNum, isOddBatch, groupLabel };
    };

    // Helper function to get warehouse units for a product across all stock-cover combinations
    const getWarehouseUnitsForProduct = (productId) => {
        // Search through all suggestion keys to find warehouse units for this product
        // Keys are formatted as: ${stock}-${cover}-${productId}
        for (const [key, value] of Object.entries(suggestedProducts)) {
            const parts = key.split('-');
            // Last part should be the product ID
            if (parts.length >= 3) {
                const keyProductId = parts[parts.length - 1];
                if (keyProductId === String(productId) && value.warehouse_units > 0) {
                    return value.warehouse_units;
                }
            }
        }
        return 0;
    };

    // Update machine selection
    useEffect(() => {
        const newStocks = { ...stocksData };
        ['S1', 'S2', 'S3', 'S4'].forEach((stock, idx) => {
            newStocks[stock].machine = selectedMachines[idx];
        });
        setStocksData(newStocks);
    }, [selectedMachines]);

    const handleMachineChange = (index, value) => {
        const newMachines = [...selectedMachines];
        newMachines[index] = value;
        setSelectedMachines(newMachines);
    };

    const getNextCoverName = (stock) => {
        try {
            if (!stocksData[stock]) return 'C';
            const existingCovers = Object.keys(stocksData[stock].covers || {});
            if (existingCovers.length === 0) return 'C';

            const coverNames = ['C'];
            for (let i = 2; i <= 100; i++) {
                coverNames.push(`C${i}`);
            }

            for (let name of coverNames) {
                if (!existingCovers.includes(name)) {
                    return name;
                }
            }
            return `C${existingCovers.length + 1}`;
        } catch (e) {
            console.error('Error in getNextCoverName:', e);
            return 'C';
        }
    };

    const handleAddCover = (stock) => {
        try {
            if (!stocksData[stock]) {
                console.error(`Stock ${stock} not found in stocksData`);
                return;
            }

            const coverName = newCover.stock === stock && newCover.name.trim() ? newCover.name : getNextCoverName(stock);

            if (!coverName.trim()) {
                console.error('Cover name is empty');
                return;
            }

            const updatedStocks = { ...stocksData };
            if (!updatedStocks[stock].covers) {
                updatedStocks[stock].covers = {};
            }
            if (!updatedStocks[stock].covers[coverName]) {
                updatedStocks[stock].covers[coverName] = [];
            }
            setStocksData(updatedStocks);
            setNewCover({ stock: '', name: '' });
        } catch (error) {
            console.error('Error in handleAddCover:', error);
            alert('Error adding cover: ' + error.message);
        }
    };

    const handleAddProduct = async (stock, cover, product) => {
        try {
            const groupInfo = getBatchGroupInfo();
            if (!groupInfo) {
                // No batch number yet, just add the product
                console.log('No batch number, adding product directly');
                alert(`⚠️ Enter a Batch Number first to use suggestions.\\n\\nFor now, adding "${product.Product_Name}" to ${stock}-${cover} without suggestions. You can edit units manually.`);
                addProductDirectly(stock, cover, product);
                return;
            }

            const productId = product.Product_ID;
            console.log(`🔍 Fetching detailed suggestions for ${stock}-${cover}-${productId}`);

            // Show loading state
            setLoadingSuggestions(true);
            setSuggestionError(null);
            setPendingProduct({ stock, cover, product });
            setDetailedSuggestions({ previous_batches: [], warehouse: null, purchased_products: [] });

            // Fetch detailed suggestions from backend
            try {
                console.log(`📡 Calling API: ${API_URL}/stocks/get-suggestions-detailed`);
                const suggestionResponse = await fetch(`${API_URL}/stocks/get-suggestions-detailed`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        stock_name: stock,
                        cover_name: cover,
                        product_id: productId,
                        current_batch_number: batchNumber
                    })
                });

                console.log(`✅ API Response status: ${suggestionResponse.status}`);

                if (!suggestionResponse.ok) {
                    throw new Error(`Server error ${suggestionResponse.status}: ${suggestionResponse.statusText}`);
                }

                const suggestionData = await suggestionResponse.json();
                console.log('📦 API Response:', suggestionData);

                if (suggestionData.error) {
                    throw new Error(`Backend error: ${suggestionData.error}`);
                }

                const suggestions = suggestionData.suggestions;

                console.log('💾 Detailed suggestions:', suggestions);
                console.log('📊 Group Info:', groupInfo);

                // Check if we have any suggestions at all
                const hasBatches = suggestions.previous_batches && suggestions.previous_batches.length > 0;
                const hasWarehouse = suggestions.warehouse && suggestions.warehouse.units_available > 0;
                const hasPurchased = suggestions.purchased_products && suggestions.purchased_products.length > 0;

                if (hasBatches || hasWarehouse || hasPurchased) {
                    // Backend already filters by group and batch number, so just use the results
                    const availableSources = {
                        previous_batches: suggestions.previous_batches || [],
                        warehouse: hasWarehouse ? suggestions.warehouse : null,
                        purchased_products: suggestions.purchased_products || []
                    };

                    // Check if we have at least one source
                    const hasAnySources = availableSources.previous_batches.length > 0 ||
                        availableSources.warehouse !== null ||
                        availableSources.purchased_products.length > 0;

                    if (hasAnySources) {
                        console.log('🎯 Showing suggestion dialog with available sources');
                        setDetailedSuggestions(availableSources);
                        setSuggestionTab('purchased'); // Default to purchased products
                        setSelectedSourceUnits({});
                        setLoadingSuggestions(false);
                        setSuggestionError(null);
                        return;
                    }
                }

                // No sources available - show error
                setLoadingSuggestions(false);
                setSuggestionError(`No sources available for ${product.Product_Name}. 
                
You can:
1. Enter units manually (if needed)
2. Check warehouse has stock
3. Add to purchased products first
(Previous batches must match batch number parity)`);
                // Keep dialog open with error message for user review

            } catch (error) {
                console.error('❌ Error fetching suggestions:', error);
                console.error('Error stack:', error.stack);
                setLoadingSuggestions(false);
                setSuggestionError(error.message || 'Failed to load suggestions. Please try again.');
                // Keep dialog open to show error
            }
        } catch (error) {
            console.error('❌ Error in handleAddProduct:', error);
            setLoadingSuggestions(false);
            setSuggestionError('An unexpected error occurred');
        }
    };

    const addProductDirectly = (stock, cover, product) => {
        try {
            const updatedStocks = { ...stocksData };
            const existingProduct = updatedStocks[stock].covers[cover].find(p => p.product_id === product.Product_ID);

            if (existingProduct) {
                // Product already exists
                console.log(`Product ${product.Product_ID} already exists in ${stock}-${cover}`);
                alert(`ℹ️ "${product.Product_Name}" is already in ${stock}-${cover}. To add more units, open that product row and edit the units field directly.`);
            } else {
                // Add new product with units = 0
                updatedStocks[stock].covers[cover].push({
                    product_id: product.Product_ID,
                    product_name: product.Product_Name,
                    units: 0
                });
                setStocksData(updatedStocks);
            }

            setShowProductDropdown(null);
            setFilterQuery('');
        } catch (error) {
            console.error('Error adding product directly:', error);
            alert(`Error: ${error.message}`);
        }
    };

    // Handle use from previous batch (from tab)
    const handleUsePreviousBatchProduct = (batch, unitsToUse) => {
        try {
            if (!pendingProduct || !batch || unitsToUse <= 0) {
                alert('Please select a batch and enter units');
                return;
            }

            const unitsNum = parseInt(unitsToUse);
            if (unitsNum > batch.units_available) {
                alert(`Cannot use more units than available (${batch.units_available})`);
                return;
            }

            console.log(`📌 Recording source: Previous Batch ${batch.batch_number} (${batch.stock_name}-${batch.cover_name}) - ${unitsNum} units`);

            const newPendingSource = {
                type: 'previous_batch',
                batch_number: batch.batch_number,
                stock_name: batch.stock_name,
                cover_name: batch.cover_name,
                product_id: pendingProduct.product.Product_ID,
                units: unitsNum
            };

            setPendingSources([...pendingSources, newPendingSource]);

            // Add product to batch
            addProductWithUnits(unitsNum);
            setPendingProduct(null);
            setDetailedSuggestions(null);
            setSelectedSourceUnits({});
        } catch (error) {
            console.error('Error using previous batch:', error);
            alert(`Error: ${error.message}`);
        }
    };

    // Handle use from warehouse (from tab)
    const handleUseWarehouseProduct = (unitsToUse) => {
        try {
            if (!pendingProduct || !detailedSuggestions?.warehouse || unitsToUse <= 0) {
                alert('Please enter units > 0');
                return;
            }

            const unitsNum = parseInt(unitsToUse);
            const maxUnits = detailedSuggestions.warehouse.units_available;

            if (unitsNum > maxUnits) {
                alert(`Cannot use more units than available (${maxUnits})`);
                return;
            }

            console.log(`📌 Recording source: Warehouse - ${unitsNum} units`);

            const newPendingSource = {
                type: 'warehouse',
                product_id: pendingProduct.product.Product_ID,
                units: unitsNum
            };

            setPendingSources([...pendingSources, newPendingSource]);

            // Add product to batch
            addProductWithUnits(unitsNum);
            setPendingProduct(null);
            setDetailedSuggestions(null);
            setSelectedSourceUnits({});
        } catch (error) {
            console.error('Error using warehouse:', error);
            alert(`Error: ${error.message}`);
        }
    };

    // Handle use from purchased products (from tab)
    const handleUsePurchasedProduct = (purchasedItem, unitsToUse) => {
        try {
            if (!pendingProduct || !purchasedItem || unitsToUse <= 0) {
                alert('Please select an item and enter units');
                return;
            }

            const unitsNum = parseInt(unitsToUse);
            if (unitsNum > purchasedItem.units_available) {
                alert(`Cannot use more units than available (${purchasedItem.units_available})`);
                return;
            }

            console.log(`📌 Recording source: Purchased Product ${purchasedItem.exp_id} - ${unitsNum} units`);

            const newPendingSource = {
                type: 'purchased_product',
                exp_id: purchasedItem.exp_id,
                product_id: pendingProduct.product.Product_ID,
                units: unitsNum
            };

            setPendingSources([...pendingSources, newPendingSource]);

            // Add product to batch
            addProductWithUnits(unitsNum);
            setPendingProduct(null);
            setDetailedSuggestions(null);
            setSelectedSourceUnits({});
        } catch (error) {
            console.error('Error using purchased product:', error);
            alert(`Error: ${error.message}`);
        }
    };

    // Helper function to add product with units after source selection
    const addProductWithUnits = (units) => {
        const updatedStocks = { ...stocksData };
        const existingProduct = updatedStocks[pendingProduct.stock].covers[pendingProduct.cover].find(
            p => p.product_id === pendingProduct.product.Product_ID
        );

        if (existingProduct) {
            existingProduct.units = (existingProduct.units || 0) + units;
        } else {
            updatedStocks[pendingProduct.stock].covers[pendingProduct.cover].push({
                product_id: pendingProduct.product.Product_ID,
                product_name: pendingProduct.product.Product_Name,
                units: units
            });
        }

        setStocksData(updatedStocks);
        alert(`✅ Added ${units} units from ${pendingProduct.stock}-${pendingProduct.cover}`);
    };

    // New: Add product without any source
    const addProductDirectlyWithoutSource = (stock, cover, product) => {
        try {
            const updatedStocks = { ...stocksData };
            const existingProduct = updatedStocks[stock].covers[cover].find(
                p => p.product_id === product.Product_ID
            );

            if (existingProduct) {
                alert(`ℹ️ "${product.Product_Name}" is already in ${stock}-${cover}. To add more units, open that product row and edit the units field directly.`);
            } else {
                updatedStocks[stock].covers[cover].push({
                    product_id: product.Product_ID,
                    product_name: product.Product_Name,
                    units: 0
                });
                setStocksData(updatedStocks);
                alert(`✅ Added "${product.Product_Name}" to ${stock}-${cover} without any source.`);
            }

            setShowProductDropdown(null);
            setFilterQuery('');
        } catch (error) {
            console.error('Error adding product directly without source:', error);
            alert(`Error: ${error.message}`);
        }
    };

    const handleUnitsChange = (stock, cover, productId, units) => {
        const updatedStocks = { ...stocksData };
        const product = updatedStocks[stock].covers[cover].find(p => p.product_id === productId);
        if (product) {
            product.units = parseInt(units) || 0;
        }
        setStocksData(updatedStocks);
    };

    const handleRemoveProduct = (stock, cover, productId) => {
        const updatedStocks = { ...stocksData };
        updatedStocks[stock].covers[cover] = updatedStocks[stock].covers[cover].filter(
            p => p.product_id !== productId
        );
        setStocksData(updatedStocks);
    };

    const handleRemoveCover = (stock, cover) => {
        const updatedStocks = { ...stocksData };
        delete updatedStocks[stock].covers[cover];
        setStocksData(updatedStocks);
    };



    const filteredProducts = products.filter(p =>
        p.Name?.toLowerCase().includes(filterQuery.toLowerCase()) ||
        p.Product_ID?.toLowerCase().includes(filterQuery.toLowerCase())
    );

    const handleSubmit = async (e) => {
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
        let totalProductCount = 0;
        Object.entries(stocksData).forEach(([stockName, stockData]) => {
            Object.entries(stockData.covers || {}).forEach(([coverName, products]) => {
                if (products && products.some(p => p.units > 0)) {
                    hasProducts = true;
                    totalProductCount += products.filter(p => p.units > 0).length;
                }
            });
        });

        if (!hasProducts) {
            alert('At least one product with units > 0 must be added');
            return;
        }

        setSaving(true);
        try {
            // Step 1: Create the new batch
            const batchData = {
                batch_number: batchNumber,
                machine_ids: selectedMachines,
                created_date: createdDate,
                stocks: stocksData
            };

            const response = await fetch(`${API_URL}/stocks/create-batch-full`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(batchData)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || `Server error: ${response.status}`);
            }

            if (result.success) {
                // Step 2: APPLY all pending sources using unified endpoint
                console.log('📌 Applying pending sources:', pendingSources);

                if (pendingSources.length > 0) {
                    const decreaseResponse = await fetch(`${API_URL}/stocks/decrease-from-sources`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            sources: pendingSources
                        })
                    });

                    const decreaseResult = await decreaseResponse.json();
                    if (!decreaseResponse.ok) {
                        console.error('Warning: Some sources failed to decrease:', decreaseResult);
                        if (decreaseResult.results?.failed.length > 0) {
                            alert(`⚠️ Batch created but some sources failed: ${decreaseResult.message}`);
                        }
                    } else {
                        console.log('✅ All sources decreased successfully:', decreaseResult.results);
                    }
                }

                await refreshData();
                setPendingSources([]); // Clear pending sources after batch creation
                alert('✅ Batch created successfully!');
                navigate('/restock');
            }
        } catch (error) {
            console.error('Error creating batch:', error);
            alert(`Error creating batch: ${error.message}`);
        } finally {
            setSaving(false);
        }
    };

    const groupInfo = getBatchGroupInfo();

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            {/* Suggestion Dialog - 3 Tab System */}
            {pendingProduct && detailedSuggestions !== null && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => {
                    if (!loadingSuggestions && !suggestionError) {
                        setPendingProduct(null);
                        setDetailedSuggestions(null);
                        setSelectedSourceUnits({});
                        setSuggestionError(null);
                    }
                }}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        {loadingSuggestions ? (
                            <div className="flex flex-col items-center justify-center py-12">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mb-4"></div>
                                <p className="text-slate-600 font-medium">Loading suggestions...</p>
                                <p className="text-slate-500 text-sm mt-2">Adding {pendingProduct?.product.Product_Name}</p>
                            </div>
                        ) : suggestionError ? (
                            <div className="flex flex-col items-center justify-center py-12">
                                <div className="text-red-500 text-4xl mb-4">⚠️</div>
                                <h3 className="text-lg font-bold text-slate-800 mb-2">Unable to Load Suggestions</h3>
                                <p className="text-slate-600 mb-6 text-center max-w-md">{suggestionError}</p>
                                <p className="text-sm text-slate-500 mb-6 max-w-md text-center">
                                    Make sure the backend server is running and the database is accessible.
                                </p>
                                <div className="space-y-3 w-full max-w-xs">
                                    <button
                                        onClick={() => {
                                            setLoadingSuggestions(true);
                                            setSuggestionError(null);
                                            handleAddProduct(pendingProduct.stock, pendingProduct.cover, pendingProduct.product);
                                        }}
                                        className="w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
                                    >
                                        🔄 Retry Loading Suggestions
                                    </button>
                                    <button
                                        onClick={() => {
                                            setPendingProduct(null);
                                            setDetailedSuggestions(null);
                                            setSelectedSourceUnits({});
                                            setSuggestionError(null);
                                        }}
                                        className="w-full px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg font-medium transition-colors"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <h3 className="text-lg font-bold text-slate-800 mb-2">
                                    💡 {pendingProduct.product.Product_Name} - Select Source
                                </h3>

                                <p className="text-sm text-slate-700 mb-2">
                                    Adding to <strong>{pendingProduct.stock}-{pendingProduct.cover}</strong> ({groupInfo?.groupLabel})
                                </p>

                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6 text-sm text-blue-800">
                                    <strong>📌 How it works:</strong> Select which source to take units from (Previous Batch, Warehouse, or Purchased Products).
                                    When you create the batch, units will be decreased from the selected source to maintain consistency.
                                </div>

                                {/* Tabs - Only show for available sources */}
                                <div className="flex gap-2 border-b border-slate-200 mb-6">
                                    {/* Purchased Products Tab - Always shown (default source) */}
                                    <button
                                        onClick={() => setSuggestionTab('purchased')}
                                        className={clsx(
                                            "px-4 py-2 font-medium border-b-2 transition-colors",
                                            suggestionTab === 'purchased'
                                                ? "border-orange-500 text-orange-600"
                                                : "border-transparent text-slate-600 hover:text-slate-800"
                                        )}
                                    >
                                        📥 Purchased Products {detailedSuggestions.purchased_products.length > 0 && `(${detailedSuggestions.purchased_products.length})`}
                                    </button>

                                    {/* Warehouse Stock Tab - Only if available */}
                                    {detailedSuggestions.warehouse && detailedSuggestions.warehouse.units_available > 0 && (
                                        <button
                                            onClick={() => setSuggestionTab('warehouse')}
                                            className={clsx(
                                                "px-4 py-2 font-medium border-b-2 transition-colors",
                                                suggestionTab === 'warehouse'
                                                    ? "border-green-500 text-green-600"
                                                    : "border-transparent text-slate-600 hover:text-slate-800"
                                            )}
                                        >
                                            🏭 Warehouse Stock ({detailedSuggestions.warehouse.units_available})
                                        </button>
                                    )}

                                    {/* Previous Batches Tab - Only if available */}
                                    {detailedSuggestions.previous_batches.length > 0 && (
                                        <button
                                            onClick={() => setSuggestionTab('batches')}
                                            className={clsx(
                                                "px-4 py-2 font-medium border-b-2 transition-colors",
                                                suggestionTab === 'batches'
                                                    ? "border-blue-500 text-blue-600"
                                                    : "border-transparent text-slate-600 hover:text-slate-800"
                                            )}
                                        >
                                            📦 Previous Batches (${detailedSuggestions.previous_batches.length})
                                        </button>
                                    )}
                                </div>

                                {/* Tab Content */}
                                <div className="mb-6">
                                    {/* Previous Batches Tab */}
                                    {suggestionTab === 'batches' && (
                                        <div>
                                            {detailedSuggestions.previous_batches.length === 0 ? (
                                                <div className="p-6 border-2 border-slate-200 rounded-lg bg-slate-50 text-center text-slate-600 text-sm">
                                                    No previous {groupInfo?.groupLabel.toLowerCase()} batches with this product
                                                </div>
                                            ) : (
                                                <div className="space-y-3 max-h-96 overflow-y-auto">
                                                    {detailedSuggestions.previous_batches.map((batch, idx) => (
                                                        <div key={idx} className="p-4 border-2 border-blue-200 rounded-lg hover:bg-blue-50 transition">
                                                            <div className="flex justify-between items-start mb-3">
                                                                <div className="flex-1">
                                                                    <div className="font-bold text-blue-900 text-lg">{batch.batch_number}</div>
                                                                    <div className="text-xs text-blue-600 mt-1">Stock: {batch.stock_name} | Cover: {batch.cover_name}</div>
                                                                </div>
                                                                <div className="text-right">
                                                                    <div className="text-lg bg-blue-100 text-blue-800 px-4 py-2 rounded font-bold border-2 border-blue-300">
                                                                        {batch.units_available} units
                                                                    </div>
                                                                    <div className="text-xs text-blue-600 mt-1">Available</div>
                                                                </div>
                                                            </div>
                                                            <div className="mb-2">
                                                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                                                    Units to add (Max: {batch.units_available})
                                                                </label>
                                                                <input
                                                                    type="number"
                                                                    min="1"
                                                                    max={batch.units_available}
                                                                    defaultValue={Math.min(5, batch.units_available)}
                                                                    id={`batch-units-${idx}`}
                                                                    className="w-full px-3 py-2 border-2 border-blue-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                                                                    placeholder="Enter units"
                                                                    onChange={(e) => {
                                                                        const val = parseInt(e.target.value) || 0;
                                                                        if (val > batch.units_available) {
                                                                            e.target.value = batch.units_available;
                                                                        }
                                                                    }}
                                                                />
                                                            </div>
                                                            <button
                                                                onClick={() => {
                                                                    const input = document.getElementById(`batch-units-${idx}`);
                                                                    const units = parseInt(input.value) || 0;
                                                                    if (units > batch.units_available) {
                                                                        alert(`❌ Cannot use more than ${batch.units_available} units from this batch`);
                                                                        input.value = batch.units_available;
                                                                        return;
                                                                    }
                                                                    if (units > 0) {
                                                                        handleUsePreviousBatchProduct(batch, units);
                                                                    }
                                                                }}
                                                                className="w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded font-medium text-sm transition-colors"
                                                            >
                                                                ✅ Use {batch.units_available} Units from Batch {batch.batch_number}
                                                            </button>
                                                        </div>
                                                    ))}

                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Warehouse Tab */}
                                    {suggestionTab === 'warehouse' && (
                                        <div>
                                            {!detailedSuggestions.warehouse || detailedSuggestions.warehouse.units_available <= 0 ? (
                                                <div className="p-6 border-2 border-slate-200 rounded-lg bg-slate-50 text-center text-slate-600 text-sm">
                                                    No warehouse stock available for this product
                                                </div>
                                            ) : (
                                                <div className="p-4 border-2 border-green-200 rounded-lg hover:bg-green-50 transition">
                                                    <div className="flex justify-between items-start mb-3">
                                                        <div className="flex-1">
                                                            <div className="font-bold text-green-900 text-lg">{detailedSuggestions.warehouse.product_name}</div>
                                                            <div className="text-xs text-green-600 mt-1">📦 Warehouse Stock</div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-lg bg-green-100 text-green-800 px-4 py-2 rounded font-bold border-2 border-green-300">
                                                                {detailedSuggestions.warehouse.units_available} units
                                                            </div>
                                                            <div className="text-xs text-green-600 mt-1">Available</div>
                                                        </div>
                                                    </div>
                                                    <div className="mb-2">
                                                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                                                            Units to add (Max: {detailedSuggestions.warehouse.units_available})
                                                        </label>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            max={detailedSuggestions.warehouse.units_available}
                                                            defaultValue={Math.min(5, detailedSuggestions.warehouse.units_available)}
                                                            id="warehouse-units"
                                                            className="w-full px-3 py-2 border-2 border-green-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-green-400"
                                                            placeholder="Enter units"
                                                            onChange={(e) => {
                                                                const val = parseInt(e.target.value) || 0;
                                                                if (val > detailedSuggestions.warehouse.units_available) {
                                                                    e.target.value = detailedSuggestions.warehouse.units_available;
                                                                }
                                                            }}
                                                        />
                                                    </div>
                                                    <button
                                                        onClick={() => {
                                                            const input = document.getElementById('warehouse-units');
                                                            const units = parseInt(input.value) || 0;
                                                            if (units > detailedSuggestions.warehouse.units_available) {
                                                                alert(`❌ Cannot use more than ${detailedSuggestions.warehouse.units_available} units from warehouse`);
                                                                input.value = detailedSuggestions.warehouse.units_available;
                                                                return;
                                                            }
                                                            if (units > 0) {
                                                                handleUseWarehouseProduct(units);
                                                            }
                                                        }}
                                                        className="w-full px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded font-medium text-sm transition-colors"
                                                    >
                                                        ✅ Use {detailedSuggestions.warehouse.units_available} Units from Warehouse
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Purchased Products Tab */}
                                    {suggestionTab === 'purchased' && (
                                        <div>
                                            {detailedSuggestions.purchased_products.length === 0 ? (
                                                <div className="p-6 border-2 border-slate-200 rounded-lg bg-slate-50 text-center text-slate-600 text-sm">
                                                    No purchased products available for this item
                                                </div>
                                            ) : (
                                                <div className="space-y-3 max-h-96 overflow-y-auto">
                                                    {detailedSuggestions.purchased_products.map((item, idx) => (
                                                        <div key={idx} className="p-4 border-2 border-orange-200 rounded-lg hover:bg-orange-50 transition">
                                                            <div className="flex justify-between items-start mb-3">
                                                                <div className="flex-1">
                                                                    <div className="font-bold text-orange-900 text-lg">{item.product_name}</div>
                                                                    <div className="text-xs text-orange-600 mt-1">
                                                                        🏷️ EXP ID: <span className="font-mono font-semibold">{item.exp_id}</span>
                                                                    </div>
                                                                    <div className="text-xs text-orange-600">📅 Received: {item.received_date}</div>
                                                                </div>
                                                                <div className="text-right">
                                                                    <div className="text-lg bg-orange-100 text-orange-800 px-4 py-2 rounded font-bold border-2 border-orange-300">
                                                                        {item.units_available} units
                                                                    </div>
                                                                    <div className="text-xs text-orange-600 mt-1">Available</div>
                                                                </div>
                                                            </div>
                                                            <div className="mb-2">
                                                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                                                    Units to add (Max: {item.units_available})
                                                                </label>
                                                                <input
                                                                    type="number"
                                                                    min="1"
                                                                    max={item.units_available}
                                                                    defaultValue={Math.min(5, item.units_available)}
                                                                    id={`purchased-units-${idx}`}
                                                                    className="w-full px-3 py-2 border-2 border-orange-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
                                                                    placeholder="Enter units"
                                                                    onChange={(e) => {
                                                                        const val = parseInt(e.target.value) || 0;
                                                                        if (val > item.units_available) {
                                                                            e.target.value = item.units_available;
                                                                        }
                                                                    }}
                                                                />
                                                            </div>
                                                            <button
                                                                onClick={() => {
                                                                    const input = document.getElementById(`purchased-units-${idx}`);
                                                                    const units = parseInt(input.value) || 0;
                                                                    if (units > item.units_available) {
                                                                        alert(`❌ Cannot use more than ${item.units_available} units from this item`);
                                                                        input.value = item.units_available;
                                                                        return;
                                                                    }
                                                                    if (units > 0) {
                                                                        handleUsePurchasedProduct(item, units);
                                                                    }
                                                                }}
                                                                className="w-full px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded font-medium text-sm transition-colors"
                                                            >
                                                                ✅ Use {item.units_available} Units from {item.exp_id}
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="border-t border-slate-200 pt-4 space-y-3">
                                    <p className="text-sm text-slate-600 text-center mb-3">
                                        Select a source above and click "Use" to add units from that source
                                    </p>
                                    <button
                                        onClick={() => {
                                            setPendingProduct(null);
                                            setDetailedSuggestions(null);
                                            setSelectedSourceUnits({});
                                        }}
                                        className="w-full px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg font-medium transition-colors"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            <div className="max-w-6xl mx-auto p-6">
                {/* Header with Back Button */}
                <div className="mb-6 flex items-center gap-3">
                    <button
                        onClick={() => navigate('/restock')}
                        className="p-2 hover:bg-white rounded-lg transition-colors"
                    >
                        <ArrowLeft size={24} className="text-slate-600" />
                    </button>
                    <div>
                        <h1 className="text-3xl font-bold text-slate-800">Create Stock Batch</h1>
                        <p className="text-slate-600 mt-1">Manage machine stocks and product distribution</p>
                    </div>
                </div>

                {/* Batch Group Info */}
                {groupInfo && (
                    <div className={clsx(
                        "mb-6 p-4 rounded-lg border-2",
                        groupInfo.isOddBatch
                            ? "bg-purple-50 border-purple-200"
                            : "bg-blue-50 border-blue-200"
                    )}>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className={clsx(
                                    "font-bold text-lg",
                                    groupInfo.isOddBatch ? "text-purple-900" : "text-blue-900"
                                )}>
                                    Batch {groupInfo.batchNum} ({groupInfo.groupLabel})
                                </p>
                                <p className={clsx(
                                    "text-sm mt-1",
                                    groupInfo.isOddBatch ? "text-purple-700" : "text-blue-700"
                                )}>
                                    📌 Products will show suggestions from previous {groupInfo.groupLabel.toLowerCase()} batches for each S-C combination
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Main Form */}
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Batch Header */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
                        <h2 className="text-lg font-semibold text-slate-800 mb-4">Batch Details</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">Batch Number * <span className="text-orange-600">(Required for suggestions)</span></label>
                                <input
                                    type="text"
                                    value={batchNumber}
                                    onChange={e => setBatchNumber(e.target.value)}
                                    placeholder="e.g., Batch 1, Batch 2, Batch 3"
                                    className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-200"
                                />
                                <p className="text-xs text-slate-500 mt-1">💡 Enter batch number to enable product suggestions</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">Created Date *</label>
                                <input
                                    type="date"
                                    value={createdDate}
                                    onChange={e => setCreatedDate(e.target.value)}
                                    className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-200"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Machine Selection */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
                        <h2 className="text-lg font-semibold text-slate-800 mb-4">Select Machines for Each Stock</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {['S1', 'S2', 'S3', 'S4'].map((stock, idx) => (
                                <div key={stock}>
                                    <label className="block text-xs font-semibold text-slate-600 mb-2 uppercase">{stock}</label>
                                    <select
                                        value={selectedMachines[idx]}
                                        onChange={e => handleMachineChange(idx, e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500 bg-white"
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
                    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
                        <h2 className="text-lg font-semibold text-slate-800 mb-4">Manage Stocks & Covers</h2>

                        {/* Stock Tabs */}
                        <div className="flex gap-2 border-b border-slate-200 mb-6">
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
                                    {stock} {stocksData[stock].machine && `(${stocksData[stock].machine})`}
                                </button>
                            ))}
                        </div>

                        {/* Active Stock Content */}
                        <div className="space-y-4">
                            {/* Machine Info */}
                            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                <p className="text-sm text-slate-600">
                                    Machine: <span className="font-bold text-slate-800">{stocksData[activeStock].machine || 'Not Selected'}</span>
                                </p>
                            </div>

                            {/* Add Cover Section */}
                            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                <h5 className="font-medium text-slate-800 mb-3">
                                    Add Cover <span className="text-xs text-slate-500">(Auto-named: C, C2, C3...)</span>
                                </h5>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newCover.stock === activeStock ? newCover.name : ''}
                                        onChange={e => setNewCover({ stock: activeStock, name: e.target.value })}
                                        placeholder="Optional custom name, or press Add for auto name"
                                        className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => handleAddCover(activeStock)}
                                        className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium"
                                    >
                                        Add Cover
                                    </button>
                                </div>
                                <p className="text-xs text-slate-500 mt-2">
                                    💡 Click "Add Cover" to auto-generate the next cover name
                                </p>
                            </div>

                            {/* Covers List */}
                            <div className="space-y-4">
                                {!stocksData[activeStock] || !stocksData[activeStock].covers || Object.keys(stocksData[activeStock].covers).length === 0 ? (
                                    <p className="text-sm text-slate-500 py-8 text-center">No covers added yet</p>
                                ) : (
                                    Object.entries(stocksData[activeStock].covers).map(([cover, products]) => {
                                        return (
                                            <div key={cover} className="bg-slate-50 p-4 rounded-lg border border-slate-200">
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
                                                        <div key={product.product_id} className="flex items-center gap-2 bg-white p-3 rounded border border-slate-200">
                                                            <div className="flex-1">
                                                                <p className="text-sm font-medium text-slate-800">{product.product_name}</p>
                                                                <p className="text-xs text-slate-500">{product.product_id}</p>
                                                            </div>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                value={product.units}
                                                                onChange={e => handleUnitsChange(activeStock, cover, product.product_id, e.target.value)}
                                                                className="w-16 px-2 py-1 border border-slate-200 rounded text-sm focus:outline-none focus:border-orange-500"
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
                                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-left flex items-center justify-between hover:bg-white bg-white"
                                                    >
                                                        <span className="text-slate-600">+ Add Product to {cover}</span>
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
                                                                    filteredProducts.map((product, idx) => (
                                                                        <button
                                                                            key={product.Product_ID}
                                                                            type="button"
                                                                            onClick={() => handleAddProduct(activeStock, cover, { Product_ID: product.Product_ID, Product_Name: product.Name })}
                                                                            className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm border-b border-slate-100 last:border-b-0"
                                                                        >
                                                                            <div className="flex justify-between items-start">
                                                                                <div className="flex-1">
                                                                                    <div className="font-medium text-slate-800">{product.Name}</div>
                                                                                    <div className="text-xs text-slate-500">
                                                                                        ID: {product.Product_ID}
                                                                                    </div>
                                                                                </div>
                                                                                <div className="text-right text-xs">
                                                                                    <div className="font-semibold text-slate-700">{product.Total_Stock || 0} trackable</div>
                                                                                </div>
                                                                            </div>
                                                                        </button>
                                                                    ))
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Form Actions */}
                    <div className="flex gap-3 sticky bottom-0 bg-gradient-to-t from-white to-white/80 p-4 rounded-lg border border-slate-200">
                        <button
                            type="button"
                            onClick={() => navigate('/restock')}
                            className="flex-1 px-4 py-3 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 text-sm font-medium transition-colors"
                            disabled={saving}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex-1 px-4 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                            disabled={saving || !batchNumber.trim() || selectedMachines.some(m => !m)}
                        >
                            {saving ? 'Creating Batch...' : 'Create Batch'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CreateBatchPage;
