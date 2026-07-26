import React from 'react';
import { LayoutDashboard, Monitor, Package, Archive, Box, Warehouse, Bell, LogOut, Users, FileText } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';


const Sidebar = () => {
    const navigate = useNavigate();
    const { user, logout } = useAuth();


    const navItems = [
        { name: 'Dashboard', icon: LayoutDashboard, path: '/' },
        { name: 'Machines', icon: Monitor, path: '/machines' },
        { name: 'Restock', icon: Box, path: '/restock' },
        { name: 'Machine Out', icon: Package, path: '/machine-out' },
        { name: 'Inventory', icon: Archive, path: '/inventory' },
        { name: 'Warehouse', icon: Warehouse, path: '/warehouse' },
        { name: 'Complaints', icon: Monitor, path: '/complaints' },
        { name: 'Generate Bill', icon: FileText, path: '/generate-bill' },
        { name: 'Notifications', icon: Bell, path: '/notifications' },
    ];
    const managerItems = [
        { name: 'PO Verification', icon: Package, path: '/po-approval' }
    ];

    const adminItems = user?.role === 'admin' ? [
        { name: 'User Management', icon: Users, path: '/users' },
    ] : [];

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    return (
        <div className="w-64 h-screen bg-white border-r border-slate-200 flex flex-col fixed left-0 top-0 z-10">
            <div className="p-6 flex items-center gap-3">
                <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white font-bold">V</div>
                <div className="flex flex-col">
                    <span className="text-xl font-bold text-slate-800 leading-none">Vendbees</span>
                    <span className="text-[10px] text-slate-400 font-semibold tracking-wider mt-1">INVENTORY & RESTOCK</span>
                </div>
            </div>

            <nav className="flex-1 px-4 space-y-1 mt-6">
                {navItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                            `flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${isActive
                                ? 'bg-orange-50 text-orange-600 font-medium'
                                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                            }`
                        }
                    >
                        <item.icon size={20} className="stroke-[1.5]" />
                        <span className="flex-1">{item.name}</span>
                    </NavLink>
                ))}

                {/* Manager Section */}
                {user?.role === 'manager' && managerItems.length > 0 && (
                    <>
                        <div className="my-4 pt-4 border-t border-slate-200">
                            <p className="text-xs font-semibold text-slate-400 uppercase px-3 mb-2">Manager</p>
                            {managerItems.map((item) => (
                                <NavLink
                                    key={item.path}
                                    to={item.path}
                                    className={({ isActive }) =>
                                        `flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${isActive
                                            ? 'bg-orange-50 text-orange-600 font-medium'
                                            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                                        }`
                                    }
                                >
                                    <item.icon size={20} className="stroke-[1.5]" />
                                    {item.name}
                                </NavLink>
                            ))}
                        </div>
                    </>
                )}

                {/* Admin Section */}
                {adminItems.length > 0 && (
                    <>
                        <div className="my-4 pt-4 border-t border-slate-200">
                            <p className="text-xs font-semibold text-slate-400 uppercase px-3 mb-2">Admin</p>
                            {adminItems.map((item) => (
                                <NavLink
                                    key={item.path}
                                    to={item.path}
                                    className={({ isActive }) =>
                                        `flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${isActive
                                            ? 'bg-orange-50 text-orange-600 font-medium'
                                            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                                        }`
                                    }
                                >
                                    <item.icon size={20} className="stroke-[1.5]" />
                                    {item.name}
                                </NavLink>
                            ))}
                        </div>
                    </>
                )}
            </nav>

            {/* User Info & Logout */}
            <div className="p-4 border-t border-slate-200">
                <div className="mb-4 p-3 bg-slate-50 rounded-lg">
                    <p className="text-xs text-slate-500 uppercase font-semibold">Logged in as</p>
                    <p className="text-sm font-semibold text-slate-800 mt-1">{user?.fullName || user?.email}</p>
                    <p className="text-xs text-slate-400 mt-1">{user?.email}</p>
                    <span className={`inline-block text-xs font-semibold mt-2 px-2 py-1 rounded ${
                        user?.role === 'admin' 
                            ? 'bg-red-100 text-red-700' 
                            : 'bg-blue-100 text-blue-700'
                    }`}>
                        {user?.role?.toUpperCase()}
                    </span>
                </div>
                <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors font-medium"
                >
                    <LogOut size={20} className="stroke-[1.5]" />
                    Logout
                </button>
            </div>
        </div>
    );
};
export default Sidebar;
