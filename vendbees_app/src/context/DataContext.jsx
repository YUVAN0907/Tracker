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
            const res = await fetch(`${API_URL}/dashboard`);
            if (!res.ok) throw new Error('Failed to connect to backend');
            const json = await res.json();

            // 1. Products Mapping
            const products = (json.products || []).map(p => {
                const pid = String(p.PRODUCT_ID || p.Product_ID || '').trim();
                const name = p.PRODUCT_NAME || p.Product_Name || p.Name || 'Unknown';
                const category = p.CATEGORY || p.Category || 'Others';
                const unit_cost = parseFloat(p.PO || p.Unit_Cost || 0) || 0;

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
                    Reorder_Level: parseFloat(p.Reorder_Level || 20) || 20,
                    MRP: parseFloat(p.MRP || 0) || 0
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
                Current_Stock: parseFloat(s.Current_Stock || 0) || 0
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
                Qty: parseFloat(r.Qty || 0) || 0
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

            setData({
                products,
                machines,
                stock,
                purchases,
                sales,
                refills,
                vendors,
                stats: json.metrics || {}
            });
            setError(null);
            setLoading(false);

        } catch (err) {
            console.error("Failed to fetch data:", err);
            // Show the actual error message to help debug (e.g. "Failed to fetch" vs "Cannot read property...")
            setError(`Connection Error: ${err.message}`);
            setLoading(false);
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

    const refillProduct = async (machineId, productId, qty) => {
        try {
            await fetch(`${API_URL}/refill`, {
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

    return (
        <DataContext.Provider value={{ ...data, loading, error, sellProduct, refillProduct }}>
            {children}
        </DataContext.Provider>
    );
};
