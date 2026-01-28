import React from 'react';
import Header from '../components/Header';
import { useData } from '../context/DataContext';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, AreaChart, Area, XAxis, YAxis, CartesianGrid, BarChart, Bar } from 'recharts';
import { TrendingUp, TrendingDown, IndianRupee, Package, Monitor, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';

const KPICard = ({ title, value, icon: Icon, trend, colorClass, filter }) => (
    <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm flex flex-col justify-between min-h-[9rem] h-auto transition-all hover:shadow-md">
        <div className="flex justify-between items-start">
            <div className={clsx("p-2 rounded-lg", colorClass)}>
                <Icon size={20} />
            </div>
            <div className="flex flex-col items-end gap-2">
                {trend !== undefined && (
                    <div className={clsx("text-xs font-semibold flex items-center gap-1", trend >= 0 ? "text-green-500" : "text-red-500")}>
                        {trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {Math.abs(trend)}%
                    </div>
                )}
                {filter}
            </div>
        </div>
        <div>
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">{title}</div>
            <div className="text-lg font-bold text-slate-800 leading-tight whitespace-pre-line">{value}</div>
        </div>
    </div>
);

const MachineSelect = ({ value, onChange, machines = [], additionalOptions = [], placeholder = "All Machines" }) => (
    <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-[10px] bg-white border border-slate-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer max-w-[80px]"
    >
        <option value="All">{placeholder}</option>
        {additionalOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
        {machines.map(m => (
            <option key={m.Machine_ID} value={m.Machine_ID}>{m.Machine_ID}</option>
        ))}
    </select>
);

const GSTRateSelect = ({ value, onChange, gstRatesMap = {} }) => (
    <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-[10px] bg-white border border-slate-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer ml-1"
    >
        {Object.keys(gstRatesMap).map(rate => (
            <option key={rate} value={rate}>{rate}</option>
        ))}
    </select>
);

const Dashboard = () => {
    const { products = [], machines = [], stock = [], stats = {}, sales = [], refills = [], loading, error } = useData() || {};

    const [filters, setFilters] = React.useState({
        stockValue: 'All',
        units: 'All',
        outOfStock: 'All',
        sales: 'All',
        gstPayable: 'All',
        gstRateValue: 'All',
        categoryMachine: 'All'
    });

    const gstRatesMap = {
        'All': 'All',
        'None': 0,
        'Exempted': 0,
        'GST @ 0%': 0,
        'GST @ 5%': 0.05,
        'GST @ 12%': 0.12,
        'GST @ 18%': 0.18,
        'GST @ 28%': 0.28,
        'GST @ 40%': 0.40
    };

    const getFilteredStats = (machineId, gstRateFilter = 'All') => {
        const stats = { totalUnits: 0, totalStockValue: 0, todaySales: 0, outOfStockCount: 0, gstSum: 0, gstTotal: 0, gstStockValue: 0 };

        const fStock = machineId === 'All' ? (stock || []) : (stock || []).filter(s => s.Machine_ID === machineId);
        const fSales = machineId === 'All' ? (sales || []) : (sales || []).filter(s => s.Machine_ID === machineId);

        (fStock || []).forEach(s => {
            if (!s) return;
            const qty = Number(s.Current_Stock) || 0;
            const prod = products.find(p => p.Product_ID === s.Product_ID);
            const unitCost = Number(prod?.Unit_Cost) || 0;

            const prodGstRate = Number(prod?.GST) || 0;

            if (gstRateFilter === 'All' || (gstRatesMap[gstRateFilter] !== 'All' && Math.abs(prodGstRate - Number(gstRatesMap[gstRateFilter])) < 0.001)) {
                stats.gstStockValue += (qty * unitCost);
            }

            stats.totalUnits += qty;
            stats.totalStockValue += (qty * unitCost);
            if (qty <= 0) stats.outOfStockCount++;
        });

        const todayStr = new Date().toISOString().split('T')[0];
        (fSales || []).forEach(s => {
            if (!s) return;
            const qty = Number(s.Qty) || 0;
            const price = Number(s.Selling_Price) || 0;
            const amount = qty * price;
            if (s.Date === todayStr) stats.todaySales += amount;

            const prod = products.find(p => p.Product_ID === s.Product_ID);
            const prodGstRate = Number(prod?.GST) || 0;
            const gstAmount = amount * prodGstRate;

            if (gstRateFilter === 'All' || (gstRatesMap[gstRateFilter] !== 'All' && Math.abs(prodGstRate - Number(gstRatesMap[gstRateFilter])) < 0.001)) {
                stats.gstSum += gstAmount;
                stats.gstTotal += gstAmount;
            }
        });
        return stats;
    };

    if (loading) return <div className="p-10 text-center text-slate-500 font-medium whitespace-pre-line">Loading Dashboard Data...</div>;

    if (error) return (
        <div className="p-10 text-center">
            <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-200 inline-block font-medium">
                {error}
                <div className="text-sm mt-2 text-red-500">Ensure the backend server is running on Port 3001.</div>
            </div>
        </div>
    );

    const statsStock = getFilteredStats(filters.stockValue);
    const statsUnits = getFilteredStats(filters.units);
    const statsOOS = getFilteredStats(filters.outOfStock);
    const statsSales = getFilteredStats(filters.sales);
    const statsGST = getFilteredStats('All', filters.gstRateValue);

    // --- Dynamic Chart Data Preparation (30 Days) ---
    const last30Days = [];
    for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        last30Days.push(d.toISOString().split('T')[0]);
    }

    // 1. Pie Chart: Stock Value by Category (Machine-wise)
    const categoryMap = {};
    const filteredStockForPie = filters.categoryMachine === 'All' ? stock : stock.filter(s => s.Machine_ID === filters.categoryMachine);

    filteredStockForPie.forEach(s => {
        const prod = products.find(p => p.Product_ID === s.Product_ID);
        if (prod) {
            const cat = prod.Category || 'Others';
            const cost = Number(prod.Unit_Cost) || 0;
            const value = (Number(s.Current_Stock) || 0) * cost;
            categoryMap[cat] = (categoryMap[cat] || 0) + value;
        }
    });

    const COLORS = ['#6366f1', '#f97316', '#a855f7', '#ec4899', '#10b981', '#3b82f6'];
    const dataPie = Object.keys(categoryMap).map((cat, idx) => ({
        name: cat,
        value: Math.round(categoryMap[cat]),
        color: COLORS[idx % COLORS.length]
    })).filter(d => d.value > 0);

    // 2. Line & Bar Chart Data (Daily aggregation)
    const dailyStats = last30Days.reduce((acc, date) => {
        acc[date] = { in: 0, out: 0, salesVal: 0, refillVal: 0 };
        return acc;
    }, {});

    (sales || []).forEach(s => {
        if (dailyStats[s.Date]) {
            const qty = Number(s.Qty) || 0;
            const prod = products.find(p => p.Product_ID === s.Product_ID);
            const cost = Number(prod?.Unit_Cost) || 0;
            dailyStats[s.Date].out += qty;
            dailyStats[s.Date].salesVal += (qty * cost); // Value reduction due to sale
        }
    });

    (refills || []).forEach(r => {
        if (dailyStats[r.Date]) {
            const qty = Number(r.Qty) || 0;
            const prod = products.find(p => p.Product_ID === r.Product_ID);
            const cost = Number(prod?.Unit_Cost) || 0;
            dailyStats[r.Date].in += qty;
            dailyStats[r.Date].refillVal += (qty * cost); // Value addition due to refill
        }
    });

    // Calculate Stock Progression (Historical)
    const todayStockValue = statsStock.totalStockValue;
    const dataLine = [];
    const dataBar = [];

    let rollingValue = todayStockValue;
    // Iterate backwards to calculate historical values
    for (let i = last30Days.length - 1; i >= 0; i--) {
        const date = last30Days[i];
        const dayInVal = dailyStats[date].refillVal;
        const dayOutVal = dailyStats[date].salesVal;

        // Add to result at the start of the array to maintain chronological order
        dataLine.unshift({ name: date.slice(5), value: Math.max(0, Math.round(rollingValue)) });
        dataBar.unshift({ name: date.slice(5), In: dailyStats[date].in, Out: dailyStats[date].out });

        // Go back one step: current = prev + in - out => prev = current - in + out
        rollingValue = rollingValue - dayInVal + dayOutVal;
    }

    // 4. Machine-wise Comparison (Existing logic is fine but reuse common helper)
    const dataMachineCompare = (machines || []).map(m => {
        const val = getFilteredStats(m.Machine_ID).totalStockValue;
        return { name: m.Machine_ID || 'Unknown', value: Math.round(val) };
    });


    // Identify low stock
    const lowStockItems = [];
    stock.forEach(s => {
        const product = products.find(p => p.Product_ID === s.Product_ID);
        if (product && s.Current_Stock < product.Reorder_Level) {
            lowStockItems.push({ ...s, product });
        }
    });

    return (
        <div className="space-y-6 pb-10">
            <Header title="Executive Warehouse Dashboard" subtitle="Real-time inventory and business metrics overview" />

            <div className="px-8 space-y-6">
                {/* KPIs */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                    <KPICard
                        title="Total Stock Value"
                        value={`₹${statsStock.totalStockValue.toLocaleString()}`}
                        icon={IndianRupee}
                        trend={0}
                        colorClass="bg-blue-50 text-blue-600"
                        filter={<MachineSelect value={filters.stockValue} machines={machines} onChange={(v) => setFilters(f => ({ ...f, stockValue: v }))} />}
                    />
                    <KPICard
                        title="Total Units"
                        value={statsUnits.totalUnits.toLocaleString()}
                        icon={Package}
                        trend={0}
                        colorClass="bg-orange-50 text-orange-600"
                        filter={<MachineSelect value={filters.units} machines={machines} onChange={(v) => setFilters(f => ({ ...f, units: v }))} />}
                    />
                    <KPICard
                        title="Active Machines"
                        value={stats.activeMachines || 0}
                        icon={Monitor}
                        colorClass="bg-green-50 text-green-600"
                    />
                    <KPICard
                        title="Out of Stock"
                        value={statsOOS.outOfStockCount.toLocaleString()}
                        icon={AlertTriangle}
                        colorClass="bg-red-50 text-red-600"
                        filter={<MachineSelect value={filters.outOfStock} machines={machines} onChange={(v) => setFilters(f => ({ ...f, outOfStock: v }))} />}
                    />
                    <KPICard
                        title="Total GST Payable"
                        value={`₹${statsGST.gstSum.toLocaleString()}`}
                        icon={IndianRupee}
                        trend={0}
                        colorClass="bg-purple-50 text-purple-600"
                        filter={
                            <GSTRateSelect value={filters.gstRateValue} gstRatesMap={gstRatesMap} onChange={(v) => setFilters(f => ({ ...f, gstRateValue: v }))} />
                        }
                    />
                    <KPICard
                        title="Today's Sales"
                        value={`₹${statsSales.todaySales.toLocaleString()}`}
                        icon={TrendingUp}
                        trend={0}
                        colorClass="bg-emerald-50 text-emerald-600"
                        filter={<MachineSelect value={filters.sales} machines={machines} onChange={(v) => setFilters(f => ({ ...f, sales: v }))} />}
                    />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Pie Chart */}
                    <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-sm font-semibold text-slate-700">Inventory Value by Category</h3>
                            <MachineSelect value={filters.categoryMachine} machines={machines} onChange={(v) => setFilters(f => ({ ...f, categoryMachine: v }))} />
                        </div>
                        <div className="h-48">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={dataPie} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={5} dataKey="value">
                                        {dataPie.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="grid grid-cols-2 gap-4 mt-4 text-xs">
                            {dataPie.map((d, i) => (
                                <div key={i} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }}></div>
                                        <span className="text-slate-600 truncate max-w-[80px]">{d.name}</span>
                                    </div>
                                    <span className="font-semibold text-slate-800">₹{(d.value / 1000).toFixed(1)}k</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Line Chart */}
                    <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                        <h3 className="text-sm font-semibold text-slate-700 mb-6">Total Stock Value Over Time (Last 30 Days)</h3>
                        <div className="overflow-x-auto custom-scrollbar">
                            <div className="h-64 min-w-[1200px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={dataLine} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#f97316" stopOpacity={0.1} />
                                                <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} interval={0} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                                        <CartesianGrid vertical={false} stroke="#f1f5f9" />
                                        <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                        <Area type="monotone" dataKey="value" stroke="#f97316" strokeWidth={2} fillOpacity={1} fill="url(#colorValue)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Bar Chart: Stock In vs Out */}
                    <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                        <h3 className="text-sm font-semibold text-slate-700 mb-6">Stock In vs Stock Out (Last 30 Days)</h3>
                        <div className="overflow-x-auto custom-scrollbar">
                            <div className="h-64 min-w-[1200px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={dataBar} barSize={20}>
                                        <CartesianGrid vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} interval={0} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                                        <Tooltip cursor={{ fill: 'transparent' }} />
                                        <Legend verticalAlign="top" height={36} />
                                        <Bar dataKey="In" name="Stock In" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                        <Bar dataKey="Out" name="Stock Out" fill="#f97316" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* Bar Chart: Machine Comparison */}
                    <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
                        <h3 className="text-sm font-semibold text-slate-700 mb-6">Machine-wise Stock Value Comparison</h3>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={dataMachineCompare} barSize={30} layout="vertical">
                                    <CartesianGrid horizontal={false} stroke="#f1f5f9" />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} width={80} />
                                    <Tooltip cursor={{ fill: 'transparent' }} />
                                    <Bar dataKey="value" name="Total Value (₹)" fill="#10b981" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="p-6 flex justify-between items-center border-b border-slate-50">
                        <h3 className="text-sm font-semibold text-slate-700">Low Stock Products</h3>
                        <button className="text-xs text-orange-600 font-medium hover:text-orange-700">View All</button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                                <tr>
                                    <th className="px-6 py-4 font-medium">Product</th>
                                    <th className="px-6 py-4 font-medium">Available Stock</th>
                                    <th className="px-6 py-4 font-medium">Reorder Level</th>
                                    <th className="px-6 py-4 font-medium">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lowStockItems.slice(0, 5).map((item, idx) => (
                                    <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/50">
                                        <td className="px-6 py-4 text-slate-700 font-medium">{item.product.Name}</td>
                                        <td className="px-6 py-4 text-slate-500">{item.Current_Stock} units</td>
                                        <td className="px-6 py-4 text-slate-500">{item.product.Reorder_Level} units</td>
                                        <td className="px-6 py-4">
                                            <span className={clsx("px-2 py-1 rounded-full text-xs font-medium",
                                                item.Current_Stock < 10 ? "bg-red-50 text-red-600" : "bg-yellow-50 text-yellow-600")}>
                                                {item.Current_Stock < 10 ? 'Critical' : 'Low Stock'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {lowStockItems.length === 0 && (
                                    <tr>
                                        <td colSpan="4" className="px-6 py-8 text-center text-slate-400">All stock levels are healthy</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};
export default Dashboard;
