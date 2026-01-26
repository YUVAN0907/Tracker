import React from 'react';
import Header from '../components/Header';
import { useData } from '../context/DataContext';
import { ResponsiveContainer, XAxis, YAxis, CartesianGrid, BarChart, Bar, Tooltip } from 'recharts';
import { MapPin, IndianRupee, Box } from 'lucide-react';
import clsx from 'clsx';

const MachineCard = ({ machine, stockValue }) => (
    <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex justify-between items-start mb-4">
            <h3 className="font-bold text-slate-800">{machine.Machine_ID}</h3>
            <div className={clsx("w-2 h-2 rounded-full",
                machine.Status === 'Active' ? "bg-green-500" :
                    machine.Status === 'Critical' ? "bg-red-500" : "bg-yellow-500")}
            />
        </div>
        <div className="flex items-center gap-1 text-slate-500 text-xs mb-4">
            <MapPin size={12} />
            {machine.Location}
        </div>
        <div className="flex justify-between items-center mb-1 text-sm">
            <span className="text-slate-500 flex items-center gap-1"><IndianRupee size={12} /> Stock Value</span>
            <span className="font-semibold text-slate-800">₹{stockValue.toLocaleString()}</span>
        </div>
        <div className="flex justify-between items-center mb-3 text-sm">
            <span className="text-slate-500 flex items-center gap-1"><Box size={12} /> Fill Level</span>
            <span className="font-semibold text-slate-800">{machine.Fill_Level}%</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div className={clsx("h-full rounded-full",
                machine.Fill_Level > 70 ? "bg-green-500" :
                    machine.Fill_Level < 30 ? "bg-red-500" : "bg-yellow-500")}
                style={{ width: `${machine.Fill_Level}%` }}
            ></div>
        </div>
    </div>
);

const Machines = () => {
    const { products, machines, stock, loading, sellProduct } = useData();

    if (loading) return null;

    // Calculate value per machine
    const machineValues = machines.map(m => {
        const value = stock
            .filter(s => s.Machine_ID === m.Machine_ID)
            .reduce((acc, s) => {
                const prod = products.find(p => p.Product_ID === s.Product_ID);
                return acc + (s.Current_Stock * (prod?.Landed_Cost || 0));
            }, 0);
        return { name: m.Machine_ID, value: Math.round(value), location: m.Location, fullMachine: m };
    }).sort((a, b) => b.value - a.value);

    // Get Stock for specific machine (VB-101 for demo table)
    const selectedMachine = machines[0];
    const machineStock = stock.filter(s => s.Machine_ID === selectedMachine?.Machine_ID);

    return (
        <div className="space-y-6 pb-10">
            <Header title="Machine Stock & Value Dashboard" subtitle="Monitor stock levels and inventory value across all machines" />

            <div className="px-8 space-y-6">
                {/* Chart Section */}
                <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
                    <h3 className="text-sm font-semibold text-slate-700 mb-6">Machine-wise Stock Value Comparison</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart layout="vertical" data={machineValues} margin={{ top: 0, right: 30, left: 40, bottom: 0 }}>
                                <CartesianGrid horizontal={false} stroke="#f1f5f9" />
                                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }} width={80} />
                                <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                <Bar dataKey="value" fill="#f97316" radius={[0, 4, 4, 0]} barSize={24} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Machine Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {machineValues.map((m, idx) => (
                        <MachineCard key={idx} machine={m.fullMachine} stockValue={m.value} />
                    ))}
                </div>

                {/* Inventory Table */}
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-50">
                        <h3 className="text-sm font-semibold text-slate-800">Machine {selectedMachine?.Machine_ID} - Inventory Details</h3>
                        <p className="text-xs text-slate-500 mt-1">{selectedMachine?.Location}</p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                                <tr>
                                    <th className="px-6 py-4 font-medium">Product</th>
                                    <th className="px-6 py-4 font-medium">Current Stock</th>
                                    <th className="px-6 py-4 font-medium">Unit Price</th>
                                    <th className="px-6 py-4 font-medium">Total Value</th>
                                    <th className="px-6 py-4 font-medium">Status</th>
                                    <th className="px-6 py-4 font-medium">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {machineStock.map((s, idx) => {
                                    const prod = products.find(p => p.Product_ID === s.Product_ID);
                                    if (!prod) return null;
                                    const value = s.Current_Stock * prod.Landed_Cost;
                                    const status = s.Current_Stock < 10 ? 'Critical' : s.Current_Stock < 20 ? 'Low' : 'Safe';
                                    const statusColor = status === 'Critical' ? 'bg-red-50 text-red-600' : status === 'Low' ? 'bg-yellow-50 text-yellow-600' : 'bg-green-50 text-green-600';

                                    return (
                                        <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/50">
                                            <td className="px-6 py-4 font-medium text-slate-700">{prod.Name}</td>
                                            <td className="px-6 py-4 text-slate-600">{s.Current_Stock}</td>
                                            <td className="px-6 py-4 text-slate-600">₹{prod.Unit_Cost}</td>
                                            <td className="px-6 py-4 font-semibold text-slate-800">₹{value.toFixed(2)}</td>
                                            <td className="px-6 py-4">
                                                <span className={clsx("px-2 py-1 rounded-full text-xs font-medium", statusColor)}>
                                                    {status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <button
                                                    onClick={() => sellProduct(s.Machine_ID, s.Product_ID, 1, prod.MRP || 40)}
                                                    className="text-xs bg-red-100 text-red-600 hover:bg-red-200 px-3 py-1 rounded transition-colors font-semibold"
                                                >
                                                    Sell 1
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};
export default Machines;
