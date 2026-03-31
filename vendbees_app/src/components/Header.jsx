import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Bell, User, ChevronDown, LogOut, Lock } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import ChangePasswordModal from './ChangePasswordModal';

const Header = ({ title, subtitle }) => {
    const { ourPOs } = useData();
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
    const menuRef = useRef(null);

    const notificationCount = useMemo(() => {
        if (!ourPOs || ourPOs.length === 0) return 0;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Get unique PO IDs that are overdue
        const overduePOIds = new Set();
        
        ourPOs.forEach(po => {
            if (po.Status === 'Completed') return;
            
            const createdDate = new Date(po.Created_Date);
            if (isNaN(createdDate.getTime())) return;
            
            createdDate.setHours(0, 0, 0, 0);
            const daysDiff = Math.floor((today - createdDate) / (1000 * 60 * 60 * 24));
            
            if (daysDiff > 5) {
                overduePOIds.add(po.PO_ID);
            }
        });

        return overduePOIds.size;
    }, [ourPOs]);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setShowUserMenu(false);
            }
        };

        if (showUserMenu) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showUserMenu]);

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    return (
        <header className="h-20 bg-white border-b border-slate-100 px-8 flex items-center justify-between sticky top-0 z-10">
            <div>
                <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
                {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-6">
                <Link to="/notifications" className="relative text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-50 transition-colors">
                    <Bell size={20} />
                    {notificationCount > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold text-white px-1">
                            {notificationCount > 9 ? '9+' : notificationCount}
                        </span>
                    )}
                </Link>
                <div ref={menuRef} className="relative">
                    <button 
                        onClick={() => setShowUserMenu(!showUserMenu)}
                        className="flex items-center gap-3 pl-6 border-l border-slate-200 cursor-pointer hover:bg-slate-50 px-3 py-2 rounded-lg transition-colors"
                    >
                        <div className="w-9 h-9 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 font-bold text-sm">
                            {user?.fullName?.charAt(0).toUpperCase() || 'AU'}
                        </div>
                        <div className="hidden md:block">
                            <div className="text-sm font-medium text-slate-700">{user?.fullName || 'Admin User'}</div>
                        </div>
                        <ChevronDown size={16} className={`text-slate-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {/* User Menu Dropdown */}
                    {showUserMenu && (
                        <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-200 z-50">
                            <div className="p-4 border-b border-slate-100">
                                <p className="text-sm font-medium text-slate-700">{user?.fullName || 'Admin User'}</p>
                                <p className="text-xs text-slate-500 mt-1">{user?.email}</p>
                            </div>
                            {user?.role === 'admin' && (
                                <div className="p-2">
                                    <Link 
                                        to="/users"
                                        onClick={() => setShowUserMenu(false)}
                                        className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-md flex items-center gap-2 transition-colors"
                                    >
                                        <User size={16} />
                                        User Management
                                    </Link>
                                </div>
                            )}
                            <div className="p-2">
                                <button
                                    onClick={() => {
                                        setShowChangePasswordModal(true);
                                        setShowUserMenu(false);
                                    }}
                                    className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-md flex items-center gap-2 transition-colors"
                                >
                                    <Lock size={16} />
                                    Change Password
                                </button>
                            </div>
                            <div className="border-t border-slate-100 p-2">
                                <button
                                    onClick={() => {
                                        setShowUserMenu(false);
                                        handleLogout();
                                    }}
                                    className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md flex items-center gap-2 transition-colors"
                                >
                                    <LogOut size={16} />
                                    Logout
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {showChangePasswordModal && (
                <ChangePasswordModal onClose={() => setShowChangePasswordModal(false)} />
            )}
        </header>
    );
};
export default Header;
