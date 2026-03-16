import React from 'react';
import Sidebar from './Sidebar';
import { Outlet } from 'react-router-dom';
import { useData } from '../context/DataContext';

const Layout = () => {
    const { loading, error } = useData() || {};

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex">
                <Sidebar />
                <main className="flex-1 ml-64 min-h-screen flex items-center justify-center">
                    <div className="text-center">
                        <div className="inline-block">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
                        </div>
                        <p className="mt-4 text-slate-600 font-medium">Loading...</p>
                    </div>
                </main>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-slate-50 flex">
                <Sidebar />
                <main className="flex-1 ml-64 min-h-screen flex items-center justify-center p-8">
                    <div className="bg-red-50 text-red-700 p-6 rounded-xl border border-red-200 text-center max-w-md">
                        <h3 className="font-bold text-lg mb-2">Connection Error</h3>
                        <p className="text-sm">{error}</p>
                        <p className="text-xs mt-3 text-red-600">Make sure the backend server is running on Port 3001.</p>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 flex">
            <Sidebar />
            <main className="flex-1 ml-64 min-h-screen flex flex-col min-w-0 overflow-x-hidden">
                <Outlet />
            </main>
        </div>
    );
};

export default Layout;
