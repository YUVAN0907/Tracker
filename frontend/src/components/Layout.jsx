import React from 'react';
import Sidebar from './Sidebar';
import { Outlet } from 'react-router-dom';
import { useData } from '../context/DataContext';

const mainStyle = {
    position: 'fixed',
    top: 0,
    left: '256px', // 64 * 4 = 256px (w-64)
    right: 0,
    bottom: 0,
    overflowY: 'scroll',
    overflowX: 'hidden',
    backgroundColor: '#f8fafc',
};

const Layout = () => {
    const { loading, error } = useData() || {};

    if (loading) {
        return (
            <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
                <Sidebar />
                <main style={mainStyle} className="custom-scrollbar">
                    <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: '100%' }}>
                        <div style={{ textAlign: 'center' }}>
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500" style={{ display: 'inline-block' }}></div>
                            <p style={{ marginTop: '1rem', color: '#475569', fontWeight: 500 }}>Loading...</p>
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
                <Sidebar />
                <main style={mainStyle} className="custom-scrollbar">
                    <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', padding: '2rem', minHeight: '100%' }}>
                        <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid #fecaca', textAlign: 'center', maxWidth: '28rem' }}>
                            <h3 style={{ fontWeight: 700, fontSize: '1.125rem', marginBottom: '0.5rem' }}>Connection Error</h3>
                            <p style={{ fontSize: '0.875rem' }}>{error}</p>
                            <p style={{ fontSize: '0.75rem', marginTop: '0.75rem', color: '#dc2626' }}>Make sure the backend server is running on Port 3001.</p>
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
            <Sidebar />
            <main style={mainStyle} className="custom-scrollbar">
                <Outlet />
            </main>
        </div>
    );
};

export default Layout;
