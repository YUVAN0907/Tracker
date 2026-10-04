import React from 'react';

const KPI = ({ title, value, icon: Icon, colorClass }) => {
    return (
        <div className={`${colorClass} p-6 rounded-lg shadow-sm border border-gray-200`}>
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm font-medium opacity-75">{title}</p>
                    <p className="text-3xl font-bold mt-2">{value}</p>
                </div>
                {Icon && (
                    <div className="text-4xl opacity-20">
                        <Icon size={40} />
                    </div>
                )}
            </div>
        </div>
    );
};

export default KPI;
