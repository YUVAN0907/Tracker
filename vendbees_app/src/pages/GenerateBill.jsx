import React, { useState, useEffect } from 'react';
import { FileText, TrendingUp, Download, Plus } from 'lucide-react';
import Header from '../components/Header';
import GenerateBillModal from '../components/GenerateBillModal';
import BillHistory from '../components/BillHistory';
import { useAuth } from '../context/AuthContext';

const GenerateBill = () => {
    const { token } = useAuth();
    const [refreshKey, setRefreshKey] = useState(0);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [billStats, setBillStats] = useState({
        totalBills: 0,
        totalRevenue: 0,
        pendingDownloads: 0
    });
    const [loadingStats, setLoadingStats] = useState(true);

    const handleBillGenerated = () => {
        // Refresh bill history when a new bill is generated
        setRefreshKey(prev => prev + 1);
        setIsModalOpen(false);
    };

    // Fetch bill statistics
    useEffect(() => {
        const fetchStats = async () => {
            if (!token) return;
            
            try {
                setLoadingStats(true);
                const response = await fetch('https://vendbees-inventory-backend-333114755202.asia-south1.run.app/api/bills/history', {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    const bills = data.bills || [];
                    
                    const stats = {
                        totalBills: bills.length,
                        totalRevenue: bills.reduce((sum, bill) => sum + (bill.totalAmount || 0), 0),
                        pendingDownloads: bills.filter(b => b.status !== 'downloaded').length,
                        archivedBills: 0
                    };
                    
                    setBillStats(stats);
                } else {
                    console.error('Failed to fetch bills:', response.status);
                }
            } catch (err) {
                console.error('Error fetching stats:', err);
            } finally {
                setLoadingStats(false);
            }
        };

        if (token) {
            fetchStats();
        }
    }, [refreshKey, token]);

    const StatCard = ({ icon: Icon, label, value, color }) => (
        <div className={`bg-gradient-to-br ${color} rounded-xl p-6 text-white shadow-lg hover:shadow-xl transition transform hover:scale-105`}>
            <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                    <p className="text-sm font-medium opacity-90">{label}</p>
                    <p className="text-3xl font-bold mt-2">
                        {loadingStats ? (
                            <span className="text-lg">Loading...</span>
                        ) : (
                            value
                        )}
                    </p>
                </div>
                <div className="p-3 bg-white/20 rounded-lg flex-shrink-0">
                    <Icon size={24} />
                </div>
            </div>
            <div className="text-xs opacity-75">Last 30 days</div>
        </div>
    );

    return (
        <div className="space-y-8 pb-10">
            <Header 
                title="Generate Invoice" 
                subtitle="Create, manage, and download professional invoices"
            />

            {/* Statistics Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <StatCard 
                    icon={FileText}
                    label="Total Bills"
                    value={billStats.totalBills}
                    color="from-blue-500 to-blue-600"
                />
                <StatCard 
                    icon={TrendingUp}
                    label="Total Revenue"
                    value={`₹${billStats.totalRevenue.toFixed(0)}`}
                    color="from-green-500 to-green-600"
                />
                <StatCard 
                    icon={Download}
                    label="Pending Downloads"
                    value={billStats.pendingDownloads}
                    color="from-orange-500 to-orange-600"
                />
            </div>

            {/* Main Content Area */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column - Actions & Tips */}
                <div className="lg:col-span-1 space-y-6">
                    {/* Create Bill Card */}
                    <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-8 border-2 border-orange-200 shadow-lg">
                        <div className="text-center">
                            <div className="inline-block p-4 bg-orange-500 text-white rounded-full mb-4">
                                <Plus size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-gray-800 mb-2">Create New Invoice</h3>
                            <p className="text-gray-600 text-sm mb-6">
                                Generate professional invoices from your purchased products
                            </p>
                            <button
                                onClick={() => setIsModalOpen(true)}
                                className="w-full px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white font-semibold rounded-lg hover:shadow-lg transition transform hover:scale-105"
                            >
                                + Create Bill
                            </button>
                        </div>
                    </div>

                    {/* Quick Tips */}
                    <div className="bg-blue-50 rounded-xl p-6 border-l-4 border-blue-500">
                        <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                            <FileText size={18} className="text-blue-500" />
                            Quick Tips
                        </h4>
                        <ul className="space-y-2 text-sm text-gray-700">
                            <li className="flex gap-2">
                                <span className="text-blue-500 font-bold">•</span>
                                <span>Add products with specific quantities or cases</span>
                            </li>
                            <li className="flex gap-2">
                                <span className="text-blue-500 font-bold">•</span>
                                <span>Generate PDF instantly when you click "Generate"</span>
                            </li>
                            <li className="flex gap-2">
                                <span className="text-blue-500 font-bold">•</span>
                                <span>Download bills anytime from your history</span>
                            </li>
                            <li className="flex gap-2">
                                <span className="text-blue-500 font-bold">•</span>
                                <span>Track download counts for each invoice</span>
                            </li>
                        </ul>
                    </div>

                    {/* Recent Activity */}
                    <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-6 border border-slate-200">
                        <h4 className="font-bold text-gray-800 mb-4">Your Bill Summary</h4>
                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600">Total Amount Generated:</span>
                                <span className="font-bold text-green-600">₹{billStats.totalRevenue.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600">Average Invoice Value:</span>
                                <span className="font-bold text-blue-600">
                                    ₹{billStats.totalBills > 0 ? (billStats.totalRevenue / billStats.totalBills).toFixed(2) : '0'}
                                </span>
                            </div>
                            <div className="pt-2 border-t border-slate-300 flex justify-between items-center">
                                <span className="text-gray-700 font-medium">Status:</span>
                                <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                                    Active
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column - Bill History & Form */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Generate Bill Modal */}
                    <div>
                        <GenerateBillModal
                            isOpen={isModalOpen}
                            onClose={() => setIsModalOpen(false)}
                            onSuccess={handleBillGenerated}
                        />
                    </div>

                    {/* Bill History Section */}
                    <div>
                        <BillHistory key={refreshKey} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GenerateBill;
