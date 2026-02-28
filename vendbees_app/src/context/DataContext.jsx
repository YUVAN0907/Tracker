import React, { createContext, useContext, useEffect, useState } from 'react';

const DataContext = createContext();

export const useData = () => useContext(DataContext);

export const DataProvider = ({ children }) => {
    const [data, setData] = useState({
        products: [],
        machines: [],
        stock: [],
        purchases: [],
        sales: [],
        refills: [],
        vendors: [],
        warehouse: [],
        purchased_products: [],
        stocks: [],
        stock_assignments: [],
        ourPOs: [],
        vendorDeliveries: [],
        vendorPurchasesList: [],
        stats: {
            totalStockValue: 0,
            totalUnits: 0,
            activeMachines: 0,
            outOfStockMachines: 0
        }
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Use 127.0.0.1 to avoid IPv6/localhost resolution mismatches
    const API_URL = 'http://127.0.0.1:3001/api';

    const fetchData = async () => {
        try {
            console.log('DataContext: Starting fetch from', API_URL);
            const res = await fetch(`${API_URL}/dashboard`);
            console.log('DataContext: Fetch response status:', res.status);
            if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to connect to backend`);
            const json = await res.json();
            console.log('DataContext: Parsed JSON successfully, products:', json.products?.length, 'machines:', json.machines?.length);

            // 1. Products Mapping
            const products = (json.products || []).map(p => {
                const pid = String(p.PRODUCT_ID || p.Product_ID || '').trim();
                const name = p.PRODUCT_NAME || p.Product_Name || p.Name || 'Unknown';
                const category = p.CATEGORY || p.Category || 'Others';
                const unit_cost = parseFloat(p.PO || p.Unit_Cost || 0) || 0;
                const vendorId = p['VENDOR ID'] || p.VENDOR_ID || p.Vendor_ID || null;

                const rawGst = String(p.GST || '0').replace(/[^0-9.]/g, '');
                let gstRate = parseFloat(rawGst) || 0;
                if (gstRate > 1) gstRate = gstRate / 100;

                const landed_cost = unit_cost * (1 + gstRate);

                return {
                    Product_ID: pid,
                    Name: name,
                    Category: category,
                    Total_Stock: parseFloat(p.QUANTITY || 0) || 0,
                    Unit_Cost: unit_cost,
                    Landed_Cost: landed_cost,
                    GST: gstRate,
                    MRP: parseFloat(p.MRP || 0) || 0,
                    Quantity: parseFloat(p.QUANTITY || 0) || 0,
                    Vendor_ID: vendorId,
                    Units_Per_Case: parseInt(p.UNITS || 1) || 1  // Units per case from Product_Master
                };
            }).filter(p => p.Product_ID && p.Product_ID.toLowerCase() !== 'nan');

            // 2. Machines Mapping
            const machines = (json.machines || []).map(m => ({
                Machine_ID: String(m.Machine_ID || '').trim(),
                Location: m.Location || 'Unknown',
                Status: m.Status || 'Inactive',
                Fill_Level: 0
            })).filter(m => m.Machine_ID);

            // 3. Stock Mapping
            const stock = (json.stock || []).map(s => ({
                Machine_ID: String(s.Machine_ID || '').trim(),
                Product_ID: String(s.Product_ID || '').trim(),
                Current_Stock: parseFloat(s.Current_Stock || 0) || 0,
                Batch: s.Batch || s.batch || null,
                Stock_ID: s.Stock_ID || s.StockId || s.stockId || null
            })).filter(s => s.Machine_ID && s.Product_ID);

            // Calculate Fill Levels
            machines.forEach(m => {
                const mStock = stock.filter(s => s.Machine_ID === m.Machine_ID);
                const totalItems = mStock.reduce((sum, s) => sum + s.Current_Stock, 0);
                m.Fill_Level = Math.min(Math.round((totalItems / 300) * 100), 100);
            });

            // 4. Purchases Mapping
            const purchases = (json.purchases || []).map(p => ({
                PO_Number: p['PO Bill'] || p.PO_ID || 'PO-XXX',
                Date: p.Date,
                Vendor: p.Vendor_ID,
                Product: products.find(prod => prod.Product_ID === String(p.Product_ID))?.Name || p.Product_ID,
                Cases: parseFloat(p.Qty || 0) || 0,
                Total: parseFloat(p.PO_Price || p['Actual PO price'] || 0) || 0,
                Status: p['Payment Status '] || 'Delivered'
            }));

            // 5. Sales Mapping
            const sales = (json.sales || []).map(s => {
                const date = s.Date;
                return {
                    Date: (date && typeof date === 'string') ? date.split('T')[0] : date,
                    Machine_ID: String(s.Machine_ID || '').trim(),
                    Product_ID: String(s.Product_ID || '').trim(),
                    Qty: parseFloat(s['Qty Sold '] || s['Qty Sold'] || s.Qty || 0) || 0,
                    Selling_Price: parseFloat(s.Selling_Price || 0) || 0
                };
            }).filter(s => s.Machine_ID);

            // 6. Refills Mapping
            const refills = (json.refills || []).map(r => ({
                Date: (r.Date && typeof r.Date === 'string') ? r.Date.split('T')[0] : r.Date,
                Refiller_ID: r.Refiller_ID,
                Machine_ID: String(r.Machine_ID || '').trim(),
                Product_ID: String(r.Product_ID || '').trim(),
                Qty: parseFloat(r.Qty || 0) || 0,
                Batch: r.Batch || r.batch || null,
                Stock_ID: r.Stock_ID || r.stockId || null
            })).filter(r => r.Machine_ID);

            // 7. Vendors Mapping
            const vendors = (json.vendors || []).map(v => {
                return {
                    Vendor_ID: v.VENDOR_ID || v['VENDOR ID'] || v['Unnamed: 1'],
                    Name: v.VENDOR || v['VENDOR '] || v['Unnamed: 2'] || 'Unknown',
                    Product_ID: v.Product_ID || v['Product ID '] || v['Unnamed: 3'],
                    Product_Name: v.PRODUCT_NAME || v['PRODUCT NAME '] || v['Unnamed: 4']
                };
            }).filter(v => v.Vendor_ID && v.Vendor_ID !== 'VENDOR ID');

            // 8. Warehouse Mapping
            const warehouse = (json.warehouse || []).map(w => ({
                Product_ID: String(w.Product_ID || '').trim(),
                Product_Name: w.Product_Name || '',
                Available_Units: parseInt(w.Available_Units || 0) || 0,
                Units_Per_Case: parseInt(w.Units_Per_Case || 1) || 1,
                Last_Received_Date: w.Last_Received_Date || '',
                Notes: w.Notes || ''
            })).filter(w => w.Product_ID);

            // 8a. Purchased_Products Mapping (items received from vendors, pending warehouse approval)
            const purchased_products = (json.purchased_products || []).map(i => ({
                Product_ID: String(i.Product_ID || '').trim(),
                Product_Name: i.Product_Name || '',
                Available_Units: parseInt(i.Available_Units || 0) || 0,
                Units_Per_Case: parseInt(i.Units_Per_Case || 1) || 1,
                Batch: i.Batch || '',
                Received_Date: i.Received_Date || '',
                Notes: i.Notes || ''
            })).filter(i => i.Product_ID);

            // 8b. Stocks Mapping
            const stocks = (json.stocks || []).map(s => ({
                Stock_ID: s.Stock_ID || '',
                Stock_Name: s.Stock_Name || '',
                Created_Date: s.Created_Date || '',
                Status: s.Status || 'Active',
                Total_Units: parseInt(s.Total_Units || 0) || 0,
                Products_Count: parseInt(s.Products_Count || 0) || 0,
                Products: s.Products || []
            })).filter(s => s.Stock_ID);

            // 8c. Stock Assignments Mapping
            const stock_assignments = (json.stock_assignments || []).map(sa => ({
                Stock_ID: sa.Stock_ID || '',
                Product_ID: String(sa.Product_ID || '').trim(),
                Product_Name: sa.Product_Name || '',
                Units: parseInt(sa.Units || 0) || 0,
                Assignment_Status: sa.Assignment_Status || 'In_Stock',
                Machine_ID: sa.Machine_ID || '',
                Assigned_Date: sa.Assigned_Date || ''
            }));

            // 9. OUR_PO Mapping (with delivery status)
            // Note: PO_ID, Vendor_ID, Created_Date, Total_Amount, Status are only in first row of each PO
            // Subsequent product rows have these fields empty - API propagates them for display
            const ourPOs = (json.our_pos || []).map(po => ({
                PO_ID: po.PO_ID || '',
                Vendor_ID: po.Vendor_ID || '',
                Product_ID: po.Product_ID || '',
                Product_Name: po.Product_Name || '',
                No_of_Cases: parseInt(po.No_of_Cases || 0) || 0,
                Units_Per_Case: parseInt(po.Units_Per_Case || 1) || 1,
                PO_Price: parseFloat(po.PO_Price || 0) || 0,  // Price per unit
                Line_Total: parseFloat(po.Line_Total || 0) || 0,  // Total units (No_of_Cases * Units_Per_Case)
                Total_Amount: parseFloat(po.Total_Amount || 0) || 0,  // sum(Line_Total * PO_Price) for all products
                Created_Date: po.Created_Date || '',
                Status: po.Status || 'Pending'
            })).filter(po => po.Product_ID);  // Keep all rows with Product_ID (not PO_ID)

            // 10. Vendor Purchase (Actual Deliveries) Mapping
            const vendorDeliveries = (json.purchases || []).map(d => ({
                PO_ID: String(d['PO ID'] || d.PO_ID || '').trim(),
                Date: d.DATE || d.Date || '',
                Purchase_Date: d['PURCHASE DATE'] || d.Purchase_Date || '',
                Vendor_ID: String(d['VENDOR ID'] || d.Vendor_ID || '').trim(),
                Product_ID: String(d['PRODUCT ID'] || d.Product_ID || '').trim(),
                Product_Name: d['PRODUCT NAME'] || d.Product_Name || '',
                Batch: d.BATCH || d.Batch || '',
                Units_Per_Case: parseInt(d['UNIT/CASE'] || d.Units_Per_Case || 1) || 1,
                Cases_Received: parseInt(d['CASE COUNT'] || d.Cases_Received || 0) || 0,
                Quantity: parseInt(d.QUANTITY || d.Quantity || 0) || 0,
                MRP: parseFloat(d.MRP || 0) || 0,
                PO_Price: parseFloat(d['PO PRICE'] || d.PO_Price || 0) || 0,
                Payment_Mode: d['PAYMENT MODE'] || d.Payment_Mode || '',
                Payment_Status: d['PAYMENT STATUS'] || d.Payment_Status || '',
                GST_Filed: d['GST FILED'] || d.GST_Filed || ''
            })).filter(d => d.Vendor_ID || d.Product_ID);

            setData(prev => ({
                ...prev,
                products,
                machines,
                stock,
                purchases,
                sales,
                refills,
                vendors,
                warehouse,
                purchased_products,
                stocks,
                stock_assignments,
                ourPOs,
                vendorDeliveries,
                stats: json.metrics || {}
            }));
            setError(null);
            setLoading(false);
            console.log('DataContext: Data loaded successfully, loading set to false');

        } catch (err) {
            console.error("DataContext: Failed to fetch data:", err);
            console.error("DataContext: Error type:", err.constructor.name);
            console.error("DataContext: Error message:", err.message);
            // Show the actual error message to help debug (e.g. "Failed to fetch" vs "Cannot read property...")
            setError(`Connection Error: ${err.message}`);
            setLoading(false);
            console.log('DataContext: Error set, loading set to false');
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, [refreshTrigger]);

    const sellProduct = async (machineId, productId, qty, price) => {
        try {
            await fetch(`${API_URL}/sell`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ machineId, productId, qty, price })
            });
            setRefreshTrigger(prev => prev + 1);
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    };

    const refillProduct = async (machineId, productId, qty, options = {}) => {
        try {
            const payload = { machineId, productId, qty };
            if (options.batch) payload.batch = options.batch;
            if (options.stockId) payload.stockId = options.stockId;
            if (options.refillerId) payload.refillerId = options.refillerId;

            await fetch(`${API_URL}/refill`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            setRefreshTrigger(prev => prev + 1);
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    };

    const updateStock = async (machineId, productId, qty) => {
        try {
            await fetch(`${API_URL}/update-stock`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ machineId, productId, qty })
            });
            setRefreshTrigger(prev => prev + 1);
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    };

    // Warehouse Functions
    const addToWarehouse = async (productId, productName, unitsReceived, unitsPerCase, notes = '') => {
        try {
            const res = await fetch(`${API_URL}/warehouse/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    product_id: productId, 
                    product_name: productName,
                    units_received: unitsReceived,
                    units_per_case: unitsPerCase,
                    notes
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setRefreshTrigger(prev => prev + 1);
            return { success: true, message: data.message };
        } catch (e) {
            console.error(e);
            return { success: false, error: e.message };
        }
    };

    const transferFromWarehouse = async (productId, refillerId, units) => {
        try {
            const res = await fetch(`${API_URL}/warehouse/transfer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ product_id: productId, refiller_id: refillerId, units })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setRefreshTrigger(prev => prev + 1);
            return { success: true, message: data.message, remaining: data.remaining };
        } catch (e) {
            console.error(e);
            return { success: false, error: e.message };
        }
    };

    const updateWarehouseItem = async (productId, updates) => {
        try {
            const res = await fetch(`${API_URL}/warehouse/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ product_id: productId, ...updates })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setRefreshTrigger(prev => prev + 1);
            return { success: true, message: data.message };
        } catch (e) {
            console.error(e);
            return { success: false, error: e.message };
        }
    };

    const deleteWarehouseItem = async (productId) => {
        try {
            const res = await fetch(`${API_URL}/warehouse/delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ product_id: productId })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setRefreshTrigger(prev => prev + 1);
            return { success: true, message: data.message };
        } catch (e) {
            console.error(e);
            return { success: false, error: e.message };
        }
    };

    const getWarehouseStock = (productId) => {
        const item = data.warehouse.find(w => w.Product_ID === productId);
        return item ? item.Available_Units : 0;
    };

    // Create Stock with Machine Assignment
    const createStockWithMachine = async (stockName, machineId, products) => {
        try {
            const res = await fetch(`${API_URL}/stocks/create-from-warehouse`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    stock_name: stockName,
                    machine_id: machineId,
                    products: products
                })
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error);
            setRefreshTrigger(prev => prev + 1);
            return { success: true, stock_id: result.stock_id, message: result.message };
        } catch (e) {
            console.error(e);
            return { success: false, error: e.message };
        }
    };

    // Multi-Product PO Creation
    const createMultiPO = async (items) => {
        try {
            const res = await fetch(`${API_URL}/create-multi-po`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items })
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error);
            setRefreshTrigger(prev => prev + 1);
            return { success: true, ...result };
        } catch (e) {
            console.error(e);
            return { success: false, error: e.message };
        }
    };

    // Record Vendor Delivery (Stock In)
    const recordDelivery = async (deliveryData) => {
        try {
            const res = await fetch(`${API_URL}/record-delivery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(deliveryData)
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error);
            setRefreshTrigger(prev => prev + 1);
            return { success: true, ...result };
        } catch (e) {
            console.error(e);
            return { success: false, error: e.message };
        }
    };

    // Get deliveries for a specific PO
    const getPODeliveries = async (poId) => {
        try {
            const res = await fetch(`${API_URL}/po-deliveries/${encodeURIComponent(poId)}`);
            const result = await res.json();
            if (!res.ok) throw new Error(result.error);
            return { success: true, deliveries: result.deliveries || [] };
        } catch (e) {
            console.error(e);
            return { success: false, error: e.message, deliveries: [] };
        }
    };

    // Fetch all vendor purchases (flat list from Vendor_Purchase sheet)
    const fetchVendorPurchases = async () => {
        try {
            console.log('Fetching vendor purchases...');
            const res = await fetch(`${API_URL}/vendor-purchases`);
            const result = await res.json();
            console.log('Vendor purchases result:', result);
            if (!res.ok) throw new Error(result.error);
            setData(prev => ({ ...prev, vendorPurchasesList: result.purchases || [] }));
            console.log('Set vendorPurchasesList:', result.purchases?.length || 0, 'items');
            return { success: true, data: result.purchases || [] };
        } catch (e) {
            console.error('Error fetching vendor purchases:', e);
            return { success: false, error: e.message };
        }
    };

    // Create new vendor purchase (stock-in from vendor)
    const createVendorPurchase = async (purchaseData) => {
        try {
            const res = await fetch(`${API_URL}/record-vendor-purchase`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(purchaseData)
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error);
            // Refresh purchases
            await fetchVendorPurchases();
            return { success: true, ...result };
        } catch (e) {
            console.error(e);
            return { success: false, error: e.message };
        }
    };

    const refreshData = () => {
        setRefreshTrigger(prev => prev + 1);
    };

    return (
        <DataContext.Provider value={{ 
            ...data, 
            loading, 
            error, 
            sellProduct, 
            refillProduct, 
            updateStock, 
            addToWarehouse,
            transferFromWarehouse,
            updateWarehouseItem,
            deleteWarehouseItem,
            getWarehouseStock,
            createStockWithMachine,
            createMultiPO,
            recordDelivery,
            getPODeliveries,
            fetchVendorPurchases,
            createVendorPurchase,
            refreshData 
        }}>
            {children}
        </DataContext.Provider>
    );
};
