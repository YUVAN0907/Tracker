import React from 'react';
import { Bell, User, ChevronDown } from 'lucide-react';

const Header = ({ title, subtitle }) => {
    return (
        <header className="h-20 bg-white border-b border-slate-100 px-8 flex items-center justify-between sticky top-0 z-10">
            <div>
                <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
                {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-6">
                <button className="relative text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-50 transition-colors">
                    <Bell size={20} />
                    <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
                </button>
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
