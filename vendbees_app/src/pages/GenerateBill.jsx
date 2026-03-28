import React, { useState } from 'react';
import Header from '../components/Header';
import GenerateBillModal from '../components/GenerateBillModal';

const GenerateBill = () => {
    // Modal is always "open" since this is the dedicated page
    const [isModalOpen] = useState(true);

    return (
        <div className="space-y-6 pb-10">
            <Header 
                title="Generate Invoice" 
                subtitle="Create and download invoices from purchased products in Firebase storage"
            />

            {/* Generate Bill Modal - Always Open */}
            <GenerateBillModal
                isOpen={isModalOpen}
                onClose={() => {
                    // Optional: redirect or action when user closes
                    // For now, we can just reset or keep it as is
                }}
            />
        </div>
    );
};

export default GenerateBill;
