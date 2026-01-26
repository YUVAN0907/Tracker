import React from 'react';
import { LayoutDashboard, Monitor, Package, Archive, Box } from 'lucide-react';
import { NavLink } from 'react-router-dom';

const Sidebar = () => {
    const navItems = [
        { name: 'Dashboard', icon: LayoutDashboard, path: '/' },
        { name: 'Machines', icon: Monitor, path: '/machines' },
        { name: 'Restock', icon: Box, path: '/restock' },
        { name: 'Inventory', icon: Archive, path: '/inventory' },
    ];

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
                        {item.name}
                    </NavLink>
                ))}
            </nav>
        </div>
    );
};
export default Sidebar;
