import React, { useState } from 'react';
import Header from '../components/Header';
import { useData } from '../context/DataContext';
import { Package, Truck, IndianRupee, Filter, Plus, Pencil, Trash2, Eye } from 'lucide-react';
import clsx from 'clsx';

const KPI = ({ title, value, subtext }) => (
    <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
        <div className="text-sm text-slate-500 font-medium">{title}</div>
        <div className="text-3xl font-bold text-slate-800 mt-2">{value}</div>
        {subtext && <div className="text-xs text-slate-400 mt-1">{subtext}</div>}
    </div>
);

const Inventory = () => {
    const { products, purchases, loading } = useData();
    const [activeTab, setActiveTab] = useState('Product Master');

    if (loading) return null;

    const totalValue = products.reduce((acc, p) => acc + (p.Landed_Cost * 50), 0); // Mock value calculation based on assumed stock
    // Or use the context stats if available. Let's stick to simple.

    return (
        <div className="space-y-6 pb-10">
            <Header title="Product & Procurement" subtitle="Manage product catalog and purchase orders" />

            <div className="px-8 space-y-6">
                {/* Tabs */}
                <div className="flex border-b border-slate-200">
                    {['Product Master', 'Purchase Orders'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={clsx("px-6 py-3 text-sm font-medium border-b-2 transition-colors",
                                activeTab === tab ? "border-orange-500 text-orange-600" : "border-transparent text-slate-500 hover:text-slate-700")}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {/* Toolbar */}
                <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                    <div className="flex gap-4 flex-1">
                        <input
                            type="text"
                            placeholder={activeTab === 'Product Master' ? "Search products or vendors..." : "Search PO number or vendor..."}
                            className="px-4 py-2 rounded-lg border border-slate-200 text-sm w-full max-w-md focus:outline-none focus:border-orange-500 bg-slate-50"
                        />
                        <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium">
                            <Filter size={16} /> Filters
                        </button>
                    </div>
                    <button className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm">
                        <Plus size={16} /> {activeTab === 'Product Master' ? 'Add Product' : 'Create PO'}
                    </button>
                </div>

                {/* KPIs */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <KPI title="Total SKUs" value={products.length} />
                    <KPI title="Pending POs" value={purchases.filter(p => p.Status === 'Pending' || p.Status === 'In Transit').length} />
                    <KPI title="Total Value" value="₹14.2L" />
                </div>

                {/* Content */}
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-50">
                        <h3 className="font-semibold text-slate-800">{activeTab === 'Product Master' ? 'Active Inventory' : 'Recent Purchase Orders'}</h3>
                    </div>

                    <div className="overflow-x-auto">
                        {activeTab === 'Product Master' ? (
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                                    <tr>
                                        <th className="px-6 py-4 font-medium">Product</th>
                                        <th className="px-6 py-4 font-medium">Category</th>
                                        <th className="px-6 py-4 font-medium">Case Size</th>
                                        <th className="px-6 py-4 font-medium">Unit Cost</th>
                                        <th className="px-6 py-4 font-medium">GST %</th>
                                        <th className="px-6 py-4 font-medium">Landed Cost</th>
                                        <th className="px-6 py-4 font-medium">Reorder Level</th>
                                        <th className="px-6 py-4 font-medium">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {products.map((p, idx) => (
                                        <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/50">
                                            <td className="px-6 py-4 font-medium text-slate-700">
                                                {p.Name}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="bg-blue-50 text-blue-600 px-2 py-1 rounded text-xs font-medium">{p.Category}</span>
                                            </td>
                                            <td className="px-6 py-4 text-slate-600">{p.Case_Size} Units</td>
                                            <td className="px-6 py-4 text-slate-600">₹{p.Unit_Cost}</td>
                                            <td className="px-6 py-4 text-slate-600">{(p.GST * 100).toFixed(0)}%</td>
                                            <td className="px-6 py-4 font-semibold text-slate-800">₹{p.Landed_Cost}</td>
                                            <td className="px-6 py-4 text-slate-600">{p.Reorder_Level} units</td>
                                            <td className="px-6 py-4">
                                                <div className="flex gap-3">
                                                    <button className="text-blue-500 hover:text-blue-700"><Pencil size={16} /></button>
                                                    <button className="text-red-500 hover:text-red-700"><Trash2 size={16} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                                    <tr>
                                        <th className="px-6 py-4 font-medium">Date</th>
                                        <th className="px-6 py-4 font-medium">PO Number</th>
                                        <th className="px-6 py-4 font-medium">Vendor</th>
                                        <th className="px-6 py-4 font-medium">Product</th>
                                        <th className="px-6 py-4 font-medium">Cases Ordered</th>
                                        <th className="px-6 py-4 font-medium">Total Cost</th>
                                        <th className="px-6 py-4 font-medium">Status</th>
                                        <th className="px-6 py-4 font-medium">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {purchases.map((po, idx) => (
                                        <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/50">
                                            <td className="px-6 py-4 text-slate-600">{po.Date}</td>
                                            <td className="px-6 py-4 font-semibold text-slate-800">{po.PO_Number}</td>
                                            <td className="px-6 py-4 text-slate-600">{po.Vendor}</td>
                                            <td className="px-6 py-4 text-slate-600">{po.Product}</td>
                                            <td className="px-6 py-4 text-slate-600">{po.Cases} cases</td>
                                            <td className="px-6 py-4 font-bold text-slate-800">₹{po.Total.toLocaleString()}</td>
                                            <td className="px-6 py-4">
                                                <span className={clsx("px-2 py-1 rounded text-xs font-medium",
                                                    po.Status === 'Delivered' ? "bg-green-100 text-green-700" :
                                                        po.Status === 'Pending' ? "bg-yellow-100 text-yellow-700" : "bg-blue-100 text-blue-700")}>
                                                    {po.Status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <button className="text-orange-500 hover:text-orange-700 font-medium text-xs">View Details</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
export default Inventory;
