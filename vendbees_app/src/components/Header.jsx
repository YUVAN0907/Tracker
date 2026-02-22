import React, { useMemo } from 'react';
import { Bell, User, ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext';

const Header = ({ title, subtitle }) => {
    const { ourPOs } = useData();

    // Calculate notification count (overdue POs > 5 days)
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
                <div className="flex items-center gap-3 pl-6 border-l border-slate-200 cursor-pointer">
                    <div className="w-9 h-9 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 font-bold text-sm">
                        AU
                    </div>
                    <div className="hidden md:block">
                        <div className="text-sm font-medium text-slate-700">Admin User</div>
                    </div>
                    <ChevronDown size={16} className="text-slate-400" />
                </div>
            </div>
        </header>
    );
};
export default Header;
