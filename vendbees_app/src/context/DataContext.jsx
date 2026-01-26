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
        stats: {
            totalStockValue: 0,
            totalUnits: 0,
            activeMachines: 0,
            outOfStockMachines: 0
        }
    });
    const [loading, setLoading] = useState(true);
    const [refreshTrigger, setRefreshTrigger] = useState(0); // To trigger re-fetch

    // Base API URL
    const API_URL = 'http://localhost:3001/api';

    const fetchData = async () => {
        try {
            const res = await fetch(`${API_URL}/dashboard`);
            const json = await res.json();

            // Map Backend Data to Frontend Model
            // Product Mapping
            const products = (json.products || []).map(p => {
                // Handle different possible column names from Excel
                const pid = p.PRODUCT_ID || p.Product_ID;
                const name = p.PRODUCT_NAME || p.Product_Name || p.Name;
                const category = p.CATEGORY || p.Category;
                const unit_cost = p.PO || p.Unit_Cost || 0;

                // GST might be percentage (e.g. 0.18 or 18)
                let gst = p.GST || 0;

                // Calculate Landed Cost
                const landed_cost = unit_cost * (1 + (parseFloat(gst) > 1 ? parseFloat(gst) / 100 : parseFloat(gst)));

                return {
                    Product_ID: pid,
                    Name: name,
                    Category: category,
                    Case_Size: p.QUANTITY || p.Case_Size || 24,
                    Unit_Cost: unit_cost,
                    Landed_Cost: landed_cost,
                    GST: gst,
                    Reorder_Level: p.Reorder_Level || 20,
                    MRP: p.MRP || 0
                };
            }).filter(p => p.Product_ID); // Filter out empty rows

            // Machine Mapping
            const machines = (json.machines || []).map(m => ({
                Machine_ID: m.Machine_ID,
                Location: m.Location,
                Status: m.Status,
                Fill_Level: 0 // Will calculate below
            })).filter(m => m.Machine_ID);

            // Stock Mapping
            const stock = (json.stock || []).map(s => ({
                Machine_ID: s.Machine_ID,
                Product_ID: s.Product_ID,
                Current_Stock: s.Current_Stock
            })).filter(s => s.Machine_ID && s.Product_ID);

            // Calculate Machine Fill Levels
            machines.forEach(m => {
                const mStock = stock.filter(s => s.Machine_ID === m.Machine_ID);
                const totalItems = mStock.reduce((sum, s) => sum + (Number(s.Current_Stock) || 0), 0);
                // Assume max capacity approx 300 for calculation
                m.Fill_Level = Math.min(Math.round((totalItems / 300) * 100), 100);
            });

            // Purchases Mapping
            const purchases = (json.purchases || []).map(p => ({
                PO_Number: p['PO Bill'] || p.PO_ID || 'PO-XXX', // Mapped from 'PO Bill'
                Date: p.Date,
                Vendor: p.Vendor_ID,
                Product: products.find(prod => prod.Product_ID === p.Product_ID)?.Name || p.Product_ID,
                Cases: p.Qty,
                Total: p.PO_Price || p['Actual PO price'] || 0,
                Status: p['Payment Status '] || 'Delivered'
            }));

            // Sales Mapping
            const sales = (json.sales || []).map(s => ({
                Date: s.Date,
                Machine_ID: s.Machine_ID,
                Product_ID: s.Product_ID,
                Qty: s['Qty Sold'] || s.Qty || 0, // Note column name 'Qty Sold'
                Selling_Price: s.Selling_Price
            }));

            // Refills Mapping
            const refills = (json.refills || []).map(r => ({
                Date: r.Date,
                Refiller_ID: r.Refiller_ID,
                Machine_ID: r.Machine_ID,
                Product_ID: r.Product_ID,
                Qty: r.Qty
            }));

            setData({
                products,
                machines,
                stock,
                purchases,
                sales,
                refills,
                stats: json.metrics || {}
            });
            setLoading(false);

        } catch (err) {
            console.error("Failed to fetch data:", err);
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        // Set up polling for real-time updates
        const interval = setInterval(fetchData, 2000); // Poll every 2s
        return () => clearInterval(interval);
    }, [refreshTrigger]);

    // Actions
    const sellProduct = async (machineId, productId, qty, price) => {
        try {
            await fetch(`${API_URL}/sell`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ machineId, productId, qty, price })
            });
            setRefreshTrigger(prev => prev + 1); // Force immediate refresh
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
        <DataContext.Provider value={{ ...data, loading, sellProduct, refillProduct }}>
            {children}
        </DataContext.Provider>
    );
};
