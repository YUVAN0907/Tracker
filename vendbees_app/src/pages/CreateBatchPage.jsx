import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { useData } from '../context/DataContext';
import { Plus, X, ChevronDown, ArrowLeft, Trash2 } from 'lucide-react';
import clsx from 'clsx';

const CreateBatchPage = () => {
    const navigate = useNavigate();
    const { machines = [], products = [], purchased_products = [], stocks = [], warehouse = [], warehouseStocks = [], refreshData } = useData();
    
    // Dynamically initialize based on machine count (7 machines)
    const numMachines = machines && machines.length > 0 ? machines.length : 7;
    
    // Initialize selectedMachines dynamically
    const [selectedMachines, setSelectedMachines] = useState(() => {
        // Start with array of empty strings, length = number of machines
        return Array(numMachines).fill('');
    });
    
    const [batchNumber, setBatchNumber] = useState('');
    const [createdDate, setCreatedDate] = useState(new Date().toISOString().split('T')[0]);
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
    const [detailedSuggestions, setDetailedSuggestions] = useState(null); // {warehouse_options: [], previous_batches: []}
    const [suggestionTab, setSuggestionTab] = useState('warehouse'); // 'batches', 'warehouse'
    const [selectedWarehouse, setSelectedWarehouse] = useState(null); // Track selected warehouse for case selection
    const [warehouseUnitsInput, setWarehouseUnitsInput] = useState(''); // Track units input for warehouse
    const [selectedCaseLabel, setSelectedCaseLabel] = useState(null); // Track selected case label
    const [selectedSourceUnits, setSelectedSourceUnits] = useState({}); // Track selected units for each source
    const [pendingSources, setPendingSources] = useState([]); // Track what will be decreased when batch is created
    const [loadingSuggestions, setLoadingSuggestions] = useState(false); // Loading state for suggestions
    const [suggestionError, setSuggestionError] = useState(null); // Error message from suggestions
    
    // ✅ NEW: Track source allocations at Stock-Cover-Product level
    // Structure: { "S1": { "C": { "P1": [{ source_type, case_id, units, warehouse_id, ... }] } } }
    // Prevents ambiguity: S1-C-P1 gets exactly 30 from L001 and 20 from L002
    const [stockSourceAllocation, setStockSourceAllocation] = useState({});
    
    // Initialize stocks dynamically (S1-S7 or more based on machine count)
    const [stocksData, setStocksData] = useState(() => {
        const stocks = {};
        for (let i = 1; i <= numMachines; i++) {
            stocks[`S${i}`] = { machine: '', covers: {} };
        }
        return stocks;
    });
    
    const API_URL = typeof window !== 'undefined' && window.location.hostname === 'localhost'
        ? 'http://localhost:3002/api'
        : 'https://vendbees-inventory-backend-333114755202.asia-south1.run.app/api'; // Use local backend for development, production backend otherwise

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

    // Helper function to dynamically check remaining units globally across all blocks
    const getRemainingUnits = (productId) => {
        // Find warehouse units
        const whItem = warehouse.find(w => w.Product_ID === productId);
        let total = whItem ? parseInt(whItem.Available_Units || 0) : 0;
        
        // Find purchased products units (which aren't mathematically in the warehouse yet)
        const purchasedItems = purchased_products.filter(p => p.Product_ID === productId);
        purchasedItems.forEach(p => {
            total += parseInt(p.Available_Units || 0);
        });
        
        // Let's add a concept of "allow override". If we have literally 0 tracked in the backend,
        // we might still allow them to enter it if they are doing a manual physical add.
        // We'll return unbounded total if they've completely overridden tracking, 
        // but for now let's just make the limit equal to what we accurately aggregated.
        
        // Subtract amounts already entered in the UI
        let used = 0;
        Object.values(stocksData).forEach(stock => {
            Object.values(stock.covers || {}).forEach(products => {
                products.forEach(p => {
                    if (p.product_id === productId || p.Product_ID === productId) {
                        used += parseInt(p.units || 0);
                    }
                });
            });
        });
        
        return { total, used, remaining: Math.max(0, total - used) };
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
        // Dynamically bind machines to stocks S1-Sn
        for (let i = 0; i < selectedMachines.length; i++) {
            const stock = `S${i + 1}`;
            if (newStocks[stock]) {
                newStocks[stock].machine = selectedMachines[i];
            }
        }
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
            setDetailedSuggestions({ warehouse_options: [], previous_batches: [] });
            setSelectedWarehouse(null);
            setSelectedCaseLabel(null);

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

                // Check if we have warehouse stock
                const hasWarehouse = suggestions.warehouse_options && suggestions.warehouse_options.length > 0;

                if (hasWarehouse) {
                    // Use warehouse options directly - add original_units_available to each case
                    // AND apply local allocations from pendingSources
                    const warehouseOptionsWithOriginal = suggestions.warehouse_options.map(wh => ({
                        ...wh,
                        cases: wh.cases.map(c => {
                            // Get original units from backend
                            const originalUnits = c.original_units_available || c.units_available;
                            
                            // Calculate how many units are already reserved in pendingSources for this case
                            const reservedUnits = pendingSources
                                .filter(source => source.case_id === c.case_id && source.product_id === productId)
                                .reduce((sum, source) => sum + source.units, 0);
                            
                            // Current available = original - reserved
                            const currentAvailable = Math.max(0, originalUnits - reservedUnits);
                            
                            if (reservedUnits > 0) {
                                console.log(`📦 Case ${c.case_label}: Original ${originalUnits} - Reserved ${reservedUnits} = Currently ${currentAvailable} units`);
                            }
                            
                            return {
                                ...c,
                                original_units_available: originalUnits,
                                units_available: currentAvailable // Override with current available after local reservations
                            };
                        })
                    }));

                    const availableSources = {
                        warehouse_options: warehouseOptionsWithOriginal
                    };

                    console.log('🎯 Showing suggestion dialog with warehouse sources');
                    setDetailedSuggestions(availableSources);
                    setSuggestionTab('warehouse'); // Default to warehouse tab
                    // Set first warehouse as default if available
                    if (availableSources.warehouse_options.length > 0) {
                        setSelectedWarehouse(availableSources.warehouse_options[0].warehouse_id);
                    }
                    setSelectedSourceUnits({});
                    setLoadingSuggestions(false);
                    setSuggestionError(null);
                    return;
                } else {
                    // No warehouse stock available - show error
                    setLoadingSuggestions(false);
                    setSuggestionError(`No warehouse stock found for ${product.Product_Name}. Please add inventory to warehouse first.`);
                    // Keep dialog open with error message for user review
                }
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

            // ✅ NEW: Record allocation at Stock-Cover-Product level
            recordSourceAllocation(pendingProduct.stock, pendingProduct.cover, pendingProduct.product.Product_ID, {
                source_type: 'previous_batch',
                batch_number: batch.batch_number,
                source_stock: batch.stock_name,
                source_cover: batch.cover_name,
                units: unitsNum
            });

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

    // Handle use from warehouse (from tab) - now with case selection
    const handleUseWarehouseProduct = (unitsToUse, caseLabel) => {
        try {
            if (!pendingProduct || !selectedWarehouse || !detailedSuggestions?.warehouse_options || unitsToUse <= 0) {
                alert('Please select a warehouse, case, and enter units > 0');
                return;
            }

            // Find the selected warehouse in the options
            const warehouse = detailedSuggestions.warehouse_options.find(w => w.warehouse_id === selectedWarehouse);
            if (!warehouse) {
                alert('Selected warehouse not found');
                return;
            }

            const unitsNum = parseInt(unitsToUse);
            
            // Find the selected case within the warehouse
            let selectedCase = null;
            if (caseLabel) {
                selectedCase = warehouse.cases.find(c => c.case_label === caseLabel);
            } else if (warehouse.cases.length > 0) {
                selectedCase = warehouse.cases[0]; // Use first (soonest expiry) if no explicit selection
            }

            if (!selectedCase) {
                alert('Case not found in selected warehouse');
                return;
            }

            const maxUnits = selectedCase.units_available;

            if (unitsNum > maxUnits) {
                alert(`Cannot use more units than available (${maxUnits})`);
                return;
            }

            console.log(`📌 Recording source: Warehouse ${warehouse.warehouse_name} - Case ${selectedCase.case_label} (${selectedCase.expiry_date}) - ${unitsNum} units`);

            const newPendingSource = {
                type: 'warehouse',
                warehouse_id: warehouse.warehouse_id,
                warehouse_name: warehouse.warehouse_name,
                case_id: selectedCase.case_id,
                case_label: selectedCase.case_label,
                product_id: pendingProduct.product.Product_ID,
                units: unitsNum
            };

            setPendingSources([...pendingSources, newPendingSource]);

            // ✅ NEW: Record allocation at Stock-Cover-Product level
            recordSourceAllocation(pendingProduct.stock, pendingProduct.cover, pendingProduct.product.Product_ID, {
                source_type: 'warehouse',
                warehouse_id: warehouse.warehouse_id,
                warehouse_name: warehouse.warehouse_name,
                case_id: selectedCase.case_id,
                case_label: selectedCase.case_label,
                expiry_date: selectedCase.expiry_date,
                units: unitsNum
            });

            // Add product with case label
            addProductWithUnits(unitsNum, selectedCase.case_label);
            setPendingProduct(null);
            setDetailedSuggestions(null);
            setSelectedSourceUnits({});
            setSelectedWarehouse(null);
            setSelectedCaseLabel(null);
        } catch (error) {
            console.error('Error using warehouse product:', error);
            alert(`Error: ${error.message}`);
        }
    };

    // Handle warehouse product with case splitting (NEW: units first, auto-split across cases)
    const handleUseWarehouseProductWithSplit = (casesUsed, totalUnitsRequested) => {
        try {
            if (!pendingProduct || !selectedWarehouse || !casesUsed || casesUsed.length === 0) {
                alert('Invalid warehouse selection or case configuration');
                return;
            }

            if (totalUnitsRequested <= 0) {
                alert('Units must be greater than 0');
                return;
            }

            // Find the selected warehouse in the options
            const warehouse = detailedSuggestions.warehouse_options.find(w => w.warehouse_id === selectedWarehouse);
            if (!warehouse) {
                alert('Selected warehouse not found');
                return;
            }

            console.log(`📌 Recording warehouse sources with case splitting: ${totalUnitsRequested} units across ${casesUsed.length} cases`);

            // Create a pending source for EACH case being used
            const newPendingSources = casesUsed
                .filter(caseUsed => caseUsed.units_to_use > 0)  // ✅ Only include cases with units > 0
                .map(caseUsed => ({
                type: 'warehouse',
                warehouse_id: warehouse.warehouse_id,
                warehouse_name: warehouse.warehouse_name,
                case_id: caseUsed.case_id,
                case_label: caseUsed.case_label,
                product_id: pendingProduct.product.Product_ID,
                units: caseUsed.units_to_use,
                expiry_date: caseUsed.expiry_date
            }));

            console.log('Cases to add (filtered - only > 0 units):', newPendingSources);
            console.log(`🔄 Locally decreasing units from cases to prevent re-allocation...`);

            // LOCALLY DECREASE UNITS from the selected cases to prevent re-allocation
            // This updates the UI but does NOT touch the database yet
            const updatedSuggestions = {
                ...detailedSuggestions,
                warehouse_options: detailedSuggestions.warehouse_options.map(wh => {
                    if (wh.warehouse_id === selectedWarehouse) {
                        return {
                            ...wh,
                            cases: wh.cases.map(caseItem => {
                                // Find if this case is being used
                                const usedCase = casesUsed.find(c => c.case_id === caseItem.case_id);
                                if (usedCase) {
                                    // Decrease units locally (but preserve original_units_available)
                                    const newUnitsAvailable = caseItem.units_available - usedCase.units_to_use;
                                    console.log(`  📦 Case ${caseItem.case_label}: ${caseItem.units_available} → ${newUnitsAvailable} units (Original: ${caseItem.original_units_available || caseItem.units_available})`);
                                    return {
                                        ...caseItem,
                                        units_available: Math.max(0, newUnitsAvailable),
                                        original_units_available: caseItem.original_units_available || caseItem.units_available // Preserve original
                                    };
                                }
                                return caseItem;
                            })
                        };
                    }
                    return wh;
                })
            };

            console.log('✅ Local state updated. Units reserved (not yet reflected in database)');

            // Update the state with decreased units (LOCAL ONLY)
            setDetailedSuggestions(updatedSuggestions);

            // Add to pending sources (will be applied when batch is created)
            setPendingSources([...pendingSources, ...newPendingSources]);

            // Add EACH case as a separate product entry (maintaining case label for expiry tracking)
            casesUsed.forEach(caseUsed => {
                // ✅ ONLY add if units_to_use > 0 (skip empty allocations)
                if (caseUsed.units_to_use > 0) {
                    // ✅ NEW: Record allocation at Stock-Cover-Product level
                    recordSourceAllocation(pendingProduct.stock, pendingProduct.cover, pendingProduct.product.Product_ID, {
                        source_type: 'warehouse',
                        warehouse_id: warehouse.warehouse_id,
                        warehouse_name: warehouse.warehouse_name,
                        case_id: caseUsed.case_id,
                        case_label: caseUsed.case_label,
                        expiry_date: caseUsed.expiry_date,
                        units: caseUsed.units_to_use
                    });
                    
                    addProductWithUnits(caseUsed.units_to_use, caseUsed.case_label);
                }
            });

            // Reset form state but KEEP the suggestion dialog open so admin can see updated units
            setSelectedSourceUnits({});
            setSelectedWarehouse(null);
            setWarehouseUnitsInput('');
            
            // Auto-close after 1.5 seconds to show the update
            setTimeout(() => {
                setPendingProduct(null);
                setDetailedSuggestions(null);
            }, 1500);
        } catch (error) {
            console.error('Error using warehouse product with split:', error);
            alert(`Error: ${error.message}`);
        }
    };

    // Handle use from purchased products (from tab)
    // (Deprecated - purchased_products no longer supported, only warehouse)
    const handleUsePurchasedProduct = (purchasedItem, unitsToUse) => {
        console.warn('⚠️ handleUsePurchasedProduct called but purchased products are deprecated. Use warehouse instead.');
        setPendingProduct(null);
        setDetailedSuggestions(null);
    };

    // Helper function to add product with units after source selection
    // ✅ FIX: Store multiple case labels in array instead of overwriting single value
    const addProductWithUnits = (units, caseLabel = null) => {
        const updatedStocks = { ...stocksData };
        const existingProduct = updatedStocks[pendingProduct.stock].covers[pendingProduct.cover].find(
            p => p.product_id === pendingProduct.product.Product_ID
        );

        if (existingProduct) {
            existingProduct.units = (existingProduct.units || 0) + units;
            // ✅ FIX: Store case labels in array to track all sources
            if (caseLabel) {
                if (!existingProduct.caseLabels) {
                    // Migrate single caseLabel to array if exists
                    existingProduct.caseLabels = existingProduct.caseLabel ? [existingProduct.caseLabel] : [];
                }
                if (!existingProduct.caseLabels.includes(caseLabel)) {
                    existingProduct.caseLabels.push(caseLabel);
                }
                // Keep backward compatibility
                existingProduct.caseLabel = caseLabel;
            }
        } else {
            updatedStocks[pendingProduct.stock].covers[pendingProduct.cover].push({
                product_id: pendingProduct.product.Product_ID,
                product_name: pendingProduct.product.Product_Name,
                units: units,
                caseLabel: caseLabel || null,
                caseLabels: caseLabel ? [caseLabel] : []  // ✅ FIX: Array for multiple cases
            });
        }

        setStocksData(updatedStocks);
        console.log(`✅ Added ${units} units from ${pendingProduct.stock}-${pendingProduct.cover}`);
    };

    // ✅ NEW: Record source allocation for Stock-Cover-Product
    // This tracks exactly which case/batch/purchased source was used for this specific Stock-Cover-Product
    // Prevents ambiguity: S1-C-P1 will have [{ case_id: 'L001', units: 30 }, { case_id: 'L002', units: 20 }]
    const recordSourceAllocation = (stock, cover, productId, sourceData) => {
        const updatedAllocation = { ...stockSourceAllocation };
        
        // Initialize nested structure if not exists
        if (!updatedAllocation[stock]) {
            updatedAllocation[stock] = {};
        }
        if (!updatedAllocation[stock][cover]) {
            updatedAllocation[stock][cover] = {};
        }
        if (!updatedAllocation[stock][cover][productId]) {
            updatedAllocation[stock][cover][productId] = [];
        }
        
        // Add this source to the list
        updatedAllocation[stock][cover][productId].push(sourceData);
        setStockSourceAllocation(updatedAllocation);
        
        console.log(`📌 Allocated ${sourceData.units} units for ${stock}-${cover}-${productId} from:`, sourceData);
    };

    // Helper: Get all source allocations for a Stock-Cover-Product
    const getSourceAllocations = (stock, cover, productId) => {
        return stockSourceAllocation[stock]?.[cover]?.[productId] || [];
    };

    // Helper: Calculate total allocated units for Stock-Cover-Product
    const getTotalAllocatedUnits = (stock, cover, productId) => {
        const allocations = getSourceAllocations(stock, cover, productId);
        return allocations.reduce((sum, src) => sum + (src.units || 0), 0);
    };
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
        const parsedUnits = parseInt(units) || 0;
        
        // Dynamic warehouse limit check
        const { total, used } = getRemainingUnits(productId);
        
        const updatedStocks = { ...stocksData };
        const product = updatedStocks[stock].covers[cover].find(p => p.product_id === productId);
        
        if (product) {
            // How much previous value was consuming?
            const previousUnits = product.units || 0;
            // The NEW requested difference
            const diff = parsedUnits - previousUnits;
            
            // Only enforce strict global limits if the system actually has inventory tracked (total > 0)
            // If total is 0, they are forcing a manual entry, so let them type what they physically have.
            if (total > 0 && diff > 0 && diff > (Math.max(0, total - Math.max(0, used - previousUnits)))) {
                const absoluteMax = Math.max(0, total - Math.max(0, used - previousUnits));
                alert(`⚠️ Only ${absoluteMax} units available globally for this product across warehouse and purchases.`);
                product.units = absoluteMax;
            } else {
                product.units = parsedUnits;
            }
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

    // Get available products from warehouse (only products with current stock)
    const availableWarehouseProducts = (() => {
        // Create a map of unique products from warehouse with their total available units
        const productMap = new Map();
        
        // Use warehouseStocks which has detailed info including warehouse name and location
        warehouseStocks.forEach(item => {
            if (item.Product_ID && item.Available_Units > 0) {
                if (!productMap.has(item.Product_ID)) {
                    productMap.set(item.Product_ID, {
                        Product_ID: item.Product_ID,
                        Name: item.Product_Name || item.Product_ID,
                        Total_Stock: item.Available_Units,
                        Warehouse_Name: item.Warehouse_Name,
                        Location: item.Location
                    });
                } else {
                    // Sum up units if product already exists in multiple warehouse locations
                    const existing = productMap.get(item.Product_ID);
                    existing.Total_Stock += item.Available_Units;
                }
            }
        });
        
        return Array.from(productMap.values());
    })();

    // Filter warehouse products by search query
    const filteredProducts = availableWarehouseProducts.filter(p =>
        p.Name?.toLowerCase().includes(filterQuery.toLowerCase()) ||
        p.Product_ID?.toLowerCase().includes(filterQuery.toLowerCase())
    );

    // ✅ NEW: Validate that batch units match source units for consistency
    const validateBatchSourcesMatch = () => {
        console.log('🔍 Validating batch units against pending sources...');
        
        // Calculate total units per product in batch
        const batchUnits = {};
        Object.entries(stocksData).forEach(([stockName, stockData]) => {
            Object.entries(stockData.covers || {}).forEach(([coverName, products]) => {
                if (Array.isArray(products)) {
                    products.forEach(product => {
                        const productId = product.product_id;
                        const units = parseInt(product.units || 0);
                        if (units > 0) {
                            batchUnits[productId] = (batchUnits[productId] || 0) + units;
                        }
                    });
                }
            });
        });
        
        // Calculate total units per product in sources
        const sourceUnits = {};
        pendingSources.forEach(source => {
            const productId = source.product_id;
            const units = parseInt(source.units || 0);
            if (units > 0) {
                sourceUnits[productId] = (sourceUnits[productId] || 0) + units;
            }
        });
        
        // Check for mismatches
        const allProductIds = new Set([...Object.keys(batchUnits), ...Object.keys(sourceUnits)]);
        const mismatches = [];
        
        allProductIds.forEach(productId => {
            const batchAmount = batchUnits[productId] || 0;
            const sourceAmount = sourceUnits[productId] || 0;
            
            if (batchAmount !== sourceAmount) {
                mismatches.push({
                    productId,
                    batchUnits: batchAmount,
                    sourceUnits: sourceAmount,
                    difference: batchAmount - sourceAmount
                });
            }
        });
        
        if (mismatches.length > 0) {
            console.warn('⚠️ Unit mismatch detected:', mismatches);
            const mismatchDetails = mismatches
                .map(m => `  • Product ${m.productId}: Batch has ${m.batchUnits} units but sources have ${m.sourceUnits} (Δ ${m.difference > 0 ? '+' : ''}${m.difference})`)
                .join('\n');
            
            const userChoice = window.confirm(
                `⚠️ UNIT MISMATCH DETECTED!\n\n${mismatchDetails}\n\nThis may indicate:\n• Units added without selecting a source\n• Units manually entered that differ from sources\n\nProceed anyway? (Not recommended)`
            );
            
            return userChoice;  // Return true if user wants to proceed anyway
        }
        
        console.log('✅ Batch units match pending sources perfectly');
        return true;  // Validation passed
    };

    // ✅ NEW: Validate Stock-Cover-Product source allocations to prevent ambiguity
    const validateStockCoverProductAllocations = () => {
        console.log('🔍 Validating Stock-Cover-Product source allocations...');
        
        const ambiguities = [];
        
        // Check each product in each Stock-Cover
        Object.entries(stocksData).forEach(([stock, stockData]) => {
            Object.entries(stockData.covers || {}).forEach(([cover, products]) => {
                if (Array.isArray(products)) {
                    products.forEach(product => {
                        const productId = product.product_id;
                        const batchUnits = parseInt(product.units || 0);
                        const allocations = getSourceAllocations(stock, cover, productId);
                        const allocatedUnits = getTotalAllocatedUnits(stock, cover, productId);
                        
                        if (batchUnits > 0 && allocatedUnits > 0) {
                            // Check if allocated units match batch units
                            if (allocatedUnits !== batchUnits) {
                                ambiguities.push({
                                    stock,
                                    cover,
                                    productId,
                                    product_name: product.product_name,
                                    batchUnits,
                                    allocatedUnits,
                                    allocations
                                });
                            }
                            
                            // Log the clear allocation for transparency
                            console.log(
                                `✅ ${stock}-${cover}-${productId}: ${batchUnits} units from ${allocations.length} source(s)`,
                                allocations.map(a => `${a.case_label || a.case_id || 'batch'} (${a.units}u)`).join(' + ')
                            );
                        }
                    });
                }
            });
        });
        
        if (ambiguities.length > 0) {
            console.warn('⚠️ Source allocation ambiguity detected:', ambiguities);
            const details = ambiguities
                .map(a => `\n  • ${a.stock}-${a.cover}-${a.product_name}:\n    Batch units: ${a.batchUnits} | Allocated: ${a.allocatedUnits}\n    Sources: ${a.allocations.map(src => `${src.case_label || src.case_id} (${src.units}u)`).join(', ')}`)
                .join('\n');
            
            const userChoice = window.confirm(
                `⚠️ SOURCE ALLOCATION MISMATCH!\n${details}\n\nEnsure all units are properly allocated from specific cases/batches before proceeding.`
            );
            
            return userChoice;
        }
        
        console.log('✅ All Stock-Cover-Products have clear source allocations - no ambiguity!');
        return true;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!batchNumber.trim()) {
            alert('Batch number is required');
            return;
        }

        if (selectedMachines.some(m => !m)) {
            alert(`All ${numMachines} machines must be selected`);
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

        // ✅ NEW: Validate Stock-Cover-Product allocations first (prevents ambiguity)
        if (!validateStockCoverProductAllocations()) {
            console.log('ℹ️ User cancelled batch creation due to allocation mismatch');
            return;
        }

        // ✅ NEW: Validate batch units match sources before submission
        if (!validateBatchSourcesMatch()) {
            console.log('ℹ️ User cancelled batch creation due to unit mismatch');
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

            if (response.ok) {
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
                setStockSourceAllocation({}); // ✅ NEW: Clear source allocations
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
                                    <strong>📌 How it works:</strong> Select a warehouse source with available stock. Cases are sorted by expiry date (soonest first).
                                    When you create the batch, units will be decreased from the selected source to maintain consistency.
                                </div>

                                {/* Tabs - Only show for available sources */}
                                <div className="flex gap-2 border-b border-slate-200 mb-6">
                                    {/* Warehouse Stock Tab - Only if available */}
                                    {detailedSuggestions.warehouse_options && detailedSuggestions.warehouse_options.length > 0 && (
                                        <button
                                            onClick={() => setSuggestionTab('warehouse')}
                                            className={clsx(
                                                "px-4 py-2 font-medium border-b-2 transition-colors",
                                                suggestionTab === 'warehouse'
                                                    ? "border-green-500 text-green-600"
                                                    : "border-transparent text-slate-600 hover:text-slate-800"
                                            )}
                                        >
                                            🏭 Warehouse Stock ({detailedSuggestions.warehouse_options.length})
                                        </button>
                                    )}

                                    {/* Tabs Header - Only Warehouse tab now */}
                                </div>

                                {/* Tab Content - Warehouse only */}
                                <div className="mb-6">
                                    {/* Warehouse Tab */}
                                    {suggestionTab === 'warehouse' && (
                                        <div className="flex gap-4">
                                            {/* Left side - Warehouse stock selection with units input and case breakdown */}
                                            <div className="flex-1">
                                                {!detailedSuggestions.warehouse_options || detailedSuggestions.warehouse_options.length === 0 ? (
                                                    <div className="p-6 border-2 border-slate-200 rounded-lg bg-slate-50 text-center text-slate-600 text-sm">
                                                        No warehouse stock available for this product
                                                    </div>
                                                ) : (
                                                    <div className="space-y-4">
                                                        {/* Warehouse Selection Dropdown */}
                                                        {detailedSuggestions.warehouse_options.length > 1 && (
                                                            <div className="p-4 border-2 border-blue-200 rounded-lg bg-blue-50">
                                                                <label className="block text-sm font-semibold text-slate-700 mb-2">
                                                                    📍 Select Warehouse
                                                                </label>
                                                                <select
                                                                    value={selectedWarehouse || ''}
                                                                    onChange={(e) => {
                                                                        setSelectedWarehouse(e.target.value);
                                                                        setWarehouseUnitsInput('');
                                                                    }}
                                                                    className="w-full px-3 py-2 border-2 border-blue-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                                                                >
                                                                    <option value="">-- Select Warehouse --</option>
                                                                    {detailedSuggestions.warehouse_options.map((wh) => (
                                                                        <option key={wh.warehouse_id} value={wh.warehouse_id}>
                                                                            {wh.warehouse_name} ({wh.warehouse_location})
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        )}

                                                        {/* If only 1 warehouse, auto-select it */}
                                                        {detailedSuggestions.warehouse_options.length === 1 && !selectedWarehouse && (
                                                            (() => {
                                                                setSelectedWarehouse(detailedSuggestions.warehouse_options[0].warehouse_id);
                                                                return null;
                                                            })()
                                                        )}

                                                        {/* Units Input - show when warehouse is selected */}
                                                        {selectedWarehouse && (
                                                            <div className="p-4 border-2 border-green-200 rounded-lg bg-green-50">
                                                                {(() => {
                                                                    const warehouse = detailedSuggestions.warehouse_options.find(w => w.warehouse_id === selectedWarehouse);
                                                                    if (!warehouse) return null;

                                                                    const totalAvailable = warehouse.cases.reduce((sum, c) => sum + c.units_available, 0);
                                                                    const totalOriginal = warehouse.cases.reduce((sum, c) => sum + (c.original_units_available || c.units_available), 0);

                                                                    return (
                                                                        <div>
                                                                            <div className="mb-3">
                                                                                <h4 className="font-bold text-green-900 mb-1">{warehouse.warehouse_name}</h4>
                                                                                <p className="text-xs text-green-600">📍 {warehouse.warehouse_location}</p>
                                                                                {totalOriginal !== totalAvailable && (
                                                                                    <div className="mt-2 space-y-1 text-xs">
                                                                                        <p className="text-blue-800"><strong>📊 Originally in database:</strong> {totalOriginal} units</p>
                                                                                        <p className="text-green-700"><strong>✅ Currently available:</strong> {totalAvailable} units <span className="text-green-600">(after your selections)</span></p>
                                                                                    </div>
                                                                                )}
                                                                                {totalOriginal === totalAvailable && (
                                                                                    <p className="text-xs text-green-700 mt-1"><strong>📊 Available:</strong> {totalAvailable} units</p>
                                                                                )}
                                                                            </div>
                                                                            <label className="block text-sm font-semibold text-slate-700 mb-2">
                                                                                🔢 How many units do you need?
                                                                            </label>
                                                                            <input
                                                                                type="number"
                                                                                min="1"
                                                                                max={totalAvailable}
                                                                                value={warehouseUnitsInput}
                                                                                onChange={(e) => {
                                                                                    const val = parseInt(e.target.value) || 0;
                                                                                    if (val <= totalAvailable) {
                                                                                        setWarehouseUnitsInput(e.target.value);
                                                                                    }
                                                                                }}
                                                                                className="w-full px-3 py-2 border-2 border-green-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-green-400 mb-3"
                                                                                placeholder={`Enter units (max: ${totalAvailable})`}
                                                                            />
                                                                        </div>
                                                                    );
                                                                })()}
                                                            </div>
                                                        )}

                                                        {/* Case Breakdown - show which cases will be used */}
                                                        {selectedWarehouse && warehouseUnitsInput && (
                                                            <div className="p-4 border-2 border-green-200 rounded-lg bg-green-50">
                                                                {(() => {
                                                                    const warehouse = detailedSuggestions.warehouse_options.find(w => w.warehouse_id === selectedWarehouse);
                                                                    if (!warehouse) return null;

                                                                    const unitsNeeded = parseInt(warehouseUnitsInput) || 0;
                                                                    if (unitsNeeded <= 0) return null;

                                                                    // Calculate which cases will be used (sorted by expiry date - soonest first)
                                                                    const sortedCases = [...warehouse.cases].sort((a, b) => 
                                                                        new Date(a.expiry_date) - new Date(b.expiry_date)
                                                                    );

                                                                    const casesUsed = [];
                                                                    let remainingUnits = unitsNeeded;

                                                                    for (const caseItem of sortedCases) {
                                                                        if (remainingUnits <= 0) break;

                                                                        const unitsFromThisCase = Math.min(remainingUnits, caseItem.units_available);
                                                                        casesUsed.push({
                                                                            ...caseItem,
                                                                            units_to_use: unitsFromThisCase
                                                                        });
                                                                        remainingUnits -= unitsFromThisCase;
                                                                    }

                                                                    if (remainingUnits > 0) {
                                                                        return (
                                                                            <div className="p-3 bg-red-100 border-2 border-red-300 rounded text-red-700 text-sm">
                                                                                ❌ Not enough stock! Need {unitsNeeded} units but only {unitsNeeded - remainingUnits} available.
                                                                            </div>
                                                                        );
                                                                    }

                                                                    return (
                                                                        <div>
                                                                            <h4 className="font-bold text-green-900 mb-3">📦 Cases to be reserved (by expiry date):</h4>
                                                                            <div className="space-y-2 mb-3">
                                                                                {casesUsed.map((caseItem, idx) => {
                                                                                    const originalUnitsInDb = caseItem.original_units_available || caseItem.units_available;
                                                                                    const currentlyAvailable = caseItem.units_available;
                                                                                    const remainingAfter = caseItem.units_available - caseItem.units_to_use;
                                                                                    return (
                                                                                        <div key={idx} className="p-3 bg-white border-2 border-green-300 rounded">
                                                                                            <div className="flex justify-between items-start mb-2">
                                                                                                <div className="flex-1">
                                                                                                    <div className="font-semibold text-sm text-slate-800">{caseItem.case_label}</div>
                                                                                                    <div className="text-xs text-slate-600">📅 Expires: {caseItem.expiry_date}</div>
                                                                                                </div>
                                                                                            </div>
                                                                                            {originalUnitsInDb !== currentlyAvailable && (
                                                                                                <div className="flex justify-between items-center mb-2 px-2 py-1 bg-blue-50 rounded border border-blue-200">
                                                                                                    <span className="text-xs text-slate-700">Originally in DB:</span>
                                                                                                    <span className="font-semibold text-sm text-slate-800">{originalUnitsInDb} units</span>
                                                                                                </div>
                                                                                            )}
                                                                                            <div className="flex justify-between items-center mb-2 px-2 py-1 bg-blue-50 rounded border border-blue-200">
                                                                                                <span className="text-xs text-slate-700">Currently available:</span>
                                                                                                <span className="font-semibold text-sm text-slate-800">{currentlyAvailable} units</span>
                                                                                            </div>
                                                                                            <div className="flex justify-between items-center px-2 py-1 bg-yellow-50 rounded border border-yellow-200">
                                                                                                <span className="text-xs text-slate-700">🔖 Reserving now:</span>
                                                                                                <span className="font-bold text-sm text-yellow-700">{caseItem.units_to_use} units</span>
                                                                                            </div>
                                                                                            {remainingAfter > 0 && (
                                                                                                <div className="flex justify-between items-center mt-2 px-2 py-1 bg-green-50 rounded border border-green-200">
                                                                                                    <span className="text-xs text-slate-700">Remaining after:</span>
                                                                                                    <span className="font-semibold text-sm text-green-700">{remainingAfter} units</span>
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                            <div className="p-3 bg-blue-50 border border-blue-200 rounded mb-3">
                                                                                <p className="text-xs text-blue-800">
                                                                                    <strong>ℹ️ Info:</strong> Units are reserved locally in the UI. They will be deducted from the warehouse database only when you create the batch.
                                                                                </p>
                                                                            </div>
                                                                            <button
                                                                                onClick={() => {
                                                                                    const unitsNum = parseInt(warehouseUnitsInput) || 0;
                                                                                    if (unitsNum > 0) {
                                                                                        handleUseWarehouseProductWithSplit(casesUsed, unitsNum);
                                                                                    }
                                                                                }}
                                                                                className="w-full px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded font-medium text-sm transition-colors"
                                                                            >
                                                                                ✅ Reserve {warehouseUnitsInput} Units from {casesUsed.length} {casesUsed.length === 1 ? 'Case' : 'Cases'}
                                                                            </button>
                                                                        </div>
                                                                    );
                                                                })()}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Right side - Previous batches for this Stock-Cover-Product */}
                                            <div className="w-64 pl-4 border-l border-slate-200">
                                                <h4 className="font-bold text-slate-800 mb-3 text-sm">📦 Previous Batches</h4>
                                                {(() => {
                                                    if (!detailedSuggestions.previous_batches || detailedSuggestions.previous_batches.length === 0) {
                                                        return (
                                                            <div className="p-3 bg-slate-100 rounded text-slate-600 text-xs text-center">
                                                                No previous batches for {pendingProduct?.stock}-{pendingProduct?.cover}
                                                            </div>
                                                        );
                                                    }

                                                    return (
                                                        <div className="space-y-2 max-h-96 overflow-y-auto">
                                                            {detailedSuggestions.previous_batches.map((batch, idx) => (
                                                                <div key={idx} className="p-3 bg-blue-50 border border-blue-200 rounded text-xs">
                                                                    <div className="font-semibold text-blue-900">Batch {batch.batch_number}</div>
                                                                    <div className="text-blue-700 mt-1">
                                                                        <div>📦 {batch.units} units</div>
                                                                        <div>⏰ {batch.expiry_date || 'N/A'}</div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    )}

                                </div>

                                <div className="border-t border-slate-200 pt-4 space-y-3">
                                    <p className="text-sm text-slate-600 text-center mb-3">
                                        Select a warehouse source above and click "Use" to add units from that source
                                    </p>
                                    <button
                                        onClick={() => {
                                            setPendingProduct(null);
                                            setDetailedSuggestions(null);
                                            setSelectedSourceUnits({});
                                            setSelectedWarehouse(null);
                                            setSelectedCaseLabel(null);
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
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h2 className="text-lg font-semibold text-slate-800">
                                    Select Machines ({selectedMachines.filter(m => m).length}/{numMachines} Selected)
                                </h2>
                                <p className="text-xs text-slate-500 mt-1">📌 Assign a machine to each stock position</p>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            {Array.from({ length: numMachines }, (_, idx) => `S${idx + 1}`).map((stock, idx) => {
                                const machineId = selectedMachines[idx];
                                const machine = machines.find(m => m.Machine_ID === machineId);
                                return (
                                    <div 
                                        key={stock} 
                                        className={clsx(
                                            "p-3 rounded-lg border-2 transition-all",
                                            machineId 
                                                ? "bg-green-50 border-green-300 shadow-sm" 
                                                : "bg-slate-50 border-slate-200"
                                        )}
                                    >
                                        <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wide">{stock}</label>
                                        <select
                                            value={machineId}
                                            onChange={e => handleMachineChange(idx, e.target.value)}
                                            className={clsx(
                                                "w-full px-2 py-1.5 border rounded text-xs focus:outline-none focus:ring-1 bg-white transition-colors",
                                                machineId
                                                    ? "border-green-300 focus:border-green-400 focus:ring-green-200"
                                                    : "border-slate-200 focus:border-orange-500 focus:ring-orange-200"
                                            )}
                                        >
                                            <option value="">Select Machine...</option>
                                            {machines.map(m => (
                                                <option key={m.Machine_ID} value={m.Machine_ID}>
                                                    {m.Machine_ID} - {m.Location}
                                                </option>
                                            ))}
                                        </select>
                                        {machine && (
                                            <div className="mt-2 text-xs text-green-700 font-semibold">
                                                ✓ {machine.Machine_ID}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        
                        {/* Summary of unique machines */}
                        {selectedMachines.some(m => m) && (
                            <div className="mt-4 pt-4 border-t border-slate-200">
                                <p className="text-xs text-slate-600 mb-2">
                                    <strong>📊 Assignment Summary:</strong>
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {[...new Set(selectedMachines.filter(m => m))].map((machineId, idx) => {
                                        const count = selectedMachines.filter(m => m === machineId).length;
                                        const machine = machines.find(m => m.Machine_ID === machineId);
                                        return (
                                            <div key={idx} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                                                {machineId} ({count}x) - {machine?.Location}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                    
                    {/* ✅ NEW: Batch Summary Card - Quick Overview */}
                    {batchNumber && (
                        <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-xl border-2 border-orange-200 p-5 shadow-sm">
                            <h3 className="text-sm font-bold text-orange-900 mb-4">📊 Batch Progress</h3>
                            <div className="grid grid-cols-4 gap-4">
                                <div className="text-center">
                                    <p className="text-2xl font-bold text-orange-600">{batchNumber}</p>
                                    <p className="text-xs text-slate-600 mt-1">Batch ID</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-2xl font-bold text-blue-600">{selectedMachines.filter(m => m).length}/7</p>
                                    <p className="text-xs text-slate-600 mt-1">Machines</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-2xl font-bold text-green-600">
                                        {Object.values(stocksData).reduce((sum, stock) => 
                                            sum + Object.values(stock.covers || {}).reduce((cs, ps) => 
                                                cs + (Array.isArray(ps) ? ps.length : 0), 0), 0)}
                                    </p>
                                    <p className="text-xs text-slate-600 mt-1">Products</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-2xl font-bold text-purple-600">
                                        {Object.values(stocksData).reduce((sum, stock) => 
                                            sum + Object.values(stock.covers || {}).reduce((cs, ps) => 
                                                cs + (Array.isArray(ps) ? ps.reduce((us, p) => us + (p.units || 0), 0) : 0), 0), 0)}
                                    </p>
                                    <p className="text-xs text-slate-600 mt-1">Total Units</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Stocks Management */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
                        <h2 className="text-lg font-semibold text-slate-800 mb-4">Manage Stocks & Covers</h2>

                        {/* Stock Tabs */}
                        <div className="flex gap-2 border-b border-slate-200 mb-6 overflow-x-auto">
                            {Array.from({ length: numMachines }, (_, idx) => `S${idx + 1}`).map(stock => (
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
                                                    {products.map(product => {
                                                        const allocations = getSourceAllocations(activeStock, cover, product.product_id);
                                                        return (
                                                            <div key={product.product_id} className="bg-white p-3 rounded border border-slate-200">
                                                                <div className="flex items-center gap-2 mb-2">
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
                                                                
                                                                {/* ✅ NEW: Display source allocations */}
                                                                {allocations.length > 0 && (
                                                                    <div className="text-xs text-slate-600 bg-blue-50 p-2 rounded border border-blue-100 mt-2">
                                                                        <p className="font-semibold text-blue-700 mb-1">📌 Source Allocation:</p>
                                                                        <div className="space-y-1">
                                                                            {allocations.map((alloc, idx) => (
                                                                                <div key={idx} className="flex justify-between">
                                                                                    <span>
                                                                                        {alloc.case_label || alloc.case_id ? `Case: ${alloc.case_label || alloc.case_id}` : `Batch: ${alloc.batch_number}`}
                                                                                        {alloc.warehouse_name && ` (${alloc.warehouse_name})`}
                                                                                    </span>
                                                                                    <span className="font-semibold text-blue-700">{alloc.units}u</span>
                                                                                </div>
                                                                            ))}
                                                                            <div className="pt-1 border-t border-blue-100 flex justify-between font-semibold">
                                                                                <span>Total Allocated:</span>
                                                                                <span className="text-blue-700">{getTotalAllocatedUnits(activeStock, cover, product.product_id)}u</span>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
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
                                                                            onClick={() => {
                                                                                handleAddProduct(activeStock, cover, { Product_ID: product.Product_ID, Product_Name: product.Name });
                                                                                setShowProductDropdown(null);
                                                                            }}
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
