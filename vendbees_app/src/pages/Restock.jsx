import React, { useState } from 'react';
import Header from '../components/Header';
import { useData } from '../context/DataContext';
import { AlertTriangle, Package, CheckCircle, Search } from 'lucide-react';
import clsx from 'clsx';

const KPI = ({ title, value, icon: Icon, colorClass }) => (
    <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
        <div className={clsx("p-3 rounded-lg", colorClass)}>
            <Icon size={24} />
        </div>
        <div className="text-right">
            <div className="text-sm text-slate-500 font-medium">{title}</div>
            <div className="text-3xl font-bold text-slate-800 mt-1">{value}</div>
        </div>
    </div>
);

const Restock = () => {
    const { products, machines, stock, vendors, loading } = useData();
    const [filter, setFilter] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');

    if (loading) return null;

    // Process alerts
    let alerts = [];
    let criticalCount = 0;
    let lowCount = 0;
    let safeCount = 0;

    stock.forEach(s => {
        const prod = products.find(p => p.Product_ID === s.Product_ID);
        const machine = machines.find(m => m.Machine_ID === s.Machine_ID);
        if (!prod || !machine) return;

        let status = 'Safe';
        if (s.Current_Stock < 10) status = 'Critical';
        else if (s.Current_Stock < prod.Reorder_Level) status = 'Low Stock';

        if (status === 'Critical') criticalCount++;
        if (status === 'Low Stock') lowCount++;
        if (status === 'Safe') safeCount++;

        if (status !== 'Safe') {
            // Find Vendor
            const vendor = vendors.find(v => v.Product_ID === prod.Product_ID || v.Product_Name === prod.Name)?.Name || 'Contact Admin';

            alerts.push({
                Machine: machine,
                Product: prod,
                Stock: s.Current_Stock,
                Reorder: prod.Reorder_Level,
                Status: status,
                Vendor: vendor
            });
        }
    });

    // Filter Logic (status filter)
    let filteredAlerts = filter === 'All' ? alerts :
        filter === 'Critical' ? alerts.filter(a => a.Status === 'Critical') :
            filter === 'Low' ? alerts.filter(a => a.Status === 'Low Stock') : alerts;

    // Search Filter
    if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        filteredAlerts = filteredAlerts.filter(a =>
            a.Machine.Machine_ID.toLowerCase().includes(query) ||
            a.Machine.Location.toLowerCase().includes(query) ||
            a.Product.Name.toLowerCase().includes(query) ||
            a.Product.Product_ID.toLowerCase().includes(query)
        );
    }

    return (
        <div className="space-y-6 pb-10">
            <Header title="Restock & Alert Center" subtitle="Monitor stock levels and manage refill operations" />

            <div className="px-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <KPI title="Critical Items" value={criticalCount} icon={AlertTriangle} colorClass="bg-red-50 text-red-600" />
                    <KPI title="Low Stock" value={lowCount} icon={Package} colorClass="bg-yellow-50 text-yellow-600" />
                    <KPI title="Safe Stock" value={safeCount} icon={CheckCircle} colorClass="bg-green-50 text-green-600" />
                </div>

                {/* Filters */}
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="flex gap-2">
                        {['All', 'Critical', 'Low'].map(f => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={clsx("px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                                    filter === f ? "bg-orange-500 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50")}
                            >
                                {f === 'All' ? 'All Machines' : f === 'Critical' ? 'Critical Only' : 'Low Stock'}
                            </button>
                        ))}
                    </div>
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search machine or product..."
                            className="pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-sm w-full sm:w-64 focus:outline-none focus:border-orange-500"
                        />
                    </div>
                </div>

                {/* Feed Table */}
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-50 flex justify-between items-center">
                        <h3 className="font-semibold text-slate-800">Restock Alert Feed</h3>
                        <button className="text-sm font-medium text-slate-500 hover:text-slate-700 border border-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-2">
                            Export Report
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                                <tr>
                                    <th className="px-6 py-4 font-medium">Machine ID</th>
                                    <th className="px-6 py-4 font-medium">Location</th>
                                    <th className="px-6 py-4 font-medium">Product</th>
                                    <th className="px-6 py-4 font-medium">Current Stock</th>
                                    <th className="px-6 py-4 font-medium">Reorder Level</th>
                                    <th className="px-6 py-4 font-medium">Vendor</th>
                                    <th className="px-6 py-4 font-medium">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredAlerts.map((alert, idx) => (
                                    <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/50">
                                        <td className="px-6 py-4 font-bold text-slate-700">{alert.Machine.Machine_ID}</td>
                                        <td className="px-6 py-4 text-slate-500">{alert.Machine.Location}</td>
                                        <td className="px-6 py-4 font-medium text-slate-700">
                                            {alert.Product.Name}
                                            <div className="text-[10px] text-slate-400">{alert.Product.Category}</div>
                                        </td>
                                        <td className={clsx("px-6 py-4 font-bold", alert.Stock < 10 ? "text-red-600" : "text-yellow-600")}>
                                            {alert.Stock} units
                                        </td>
                                        <td className="px-6 py-4 text-slate-500">{alert.Reorder} units</td>
                                        <td className="px-6 py-4 text-slate-500">{alert.Vendor}</td>
                                        <td className="px-6 py-4">
                                            <span className={clsx("px-3 py-1 rounded-full text-xs font-bold uppercase",
                                                alert.Status === 'Critical' ? "bg-red-100 text-red-600" : "bg-yellow-100 text-yellow-600")}>
                                                {alert.Status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};
export default Restock;
