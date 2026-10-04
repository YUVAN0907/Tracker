import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useData } from '../context/DataContext';
import { DeliveryRecordingForm } from './Inventory';

const RecordDeliveryPage = () => {
    const { state: poData } = useLocation();
    const navigate = useNavigate();
    const { products, vendors, warehouses, recordDelivery, refreshData, fetchVendorPurchases } = useData();
    const [saving, setSaving] = React.useState(false);

    if (!poData?.po_id) {
        return (
            <div className="min-h-full p-6 md:p-10">
                <button type="button" onClick={() => navigate('/inventory')} className="flex items-center gap-2 text-sm text-slate-600 hover:text-orange-600">
                    <ArrowLeft size={18} /> Back to Inventory
                </button>
                <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
                    Select a purchase order from Inventory to record its delivery.
                </div>
            </div>
        );
    }

    const handleSave = async (deliveryData) => {
        setSaving(true);
        try {
            const result = await recordDelivery(deliveryData);
            if (!result.success) throw new Error(result.error || 'Failed to record delivery');

            let successMessage = 'Delivery Recorded Successfully!\n\n';
            if (result.message) successMessage += `${result.message}\n`;
            if (result.details) successMessage += result.details;
            alert(successMessage);
            if (refreshData) refreshData();
            fetchVendorPurchases();
            navigate('/inventory');
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-h-full bg-slate-50 p-4 md:p-8">
            <div className="mx-auto max-w-7xl">
                <button type="button" onClick={() => navigate('/inventory')} className="mb-5 flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-orange-600">
                    <ArrowLeft size={18} /> Back to Inventory
                </button>
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-8">
                    <div className="mb-6 border-b border-slate-200 pb-5">
                        <h1 className="text-2xl font-semibold text-slate-800">Record Vendor Delivery</h1>
                        <p className="mt-1 text-sm text-slate-500">Review the uploaded bill and enter received stock for PO {poData.po_id}.</p>
                    </div>
                    <DeliveryRecordingForm
                        poData={poData}
                        products={products}
                        vendors={vendors}
                        warehouses={warehouses}
                        onSave={handleSave}
                        onCancel={() => navigate('/inventory')}
                        saving={saving}
                    />
                </div>
            </div>
        </div>
    );
};

export default RecordDeliveryPage;
