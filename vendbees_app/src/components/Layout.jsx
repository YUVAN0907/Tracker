import React from 'react';
import Sidebar from './Sidebar';
import { Outlet } from 'react-router-dom';

const Layout = () => {
    return (
        <div className="min-h-screen bg-slate-50 flex">
            <Sidebar />
            <main className="flex-1 ml-64 min-h-screen flex flex-col">
                <Outlet />
            </main>
        </div>
    );
};

export default Layout;
