import React, { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import Header from '../components/Header';
import { CheckCircle, X, AlertTriangle } from 'lucide-react';

const POApproval = () => {
  const { user, token } = useAuth();
  const { ourPOs, refreshData } = useData();
  const [actionLoading, setActionLoading] = useState({});

  const groupedPOs = useMemo(() => {
    const groups = {};
    (ourPOs || []).forEach(item => {
      if (!item.PO_ID) return;
      if (!groups[item.PO_ID]) {
        groups[item.PO_ID] = {
          PO_ID: item.PO_ID,
          Vendor_ID: item.Vendor_ID,
          Created_Date: item.Created_Date,
          Status: item.Status,
          Rejection_Reason: item.Rejection_Reason || '',
          Created_By: item.Created_By || '',
          Total_Amount: item.Total_Amount,
          lineCount: 0,
          products: []
        };
      }
      groups[item.PO_ID].lineCount += 1;
      groups[item.PO_ID].products.push(item);
    });
    return Object.values(groups).sort((a, b) => new Date(b.Created_Date || 0) - new Date(a.Created_Date || 0));
  }, [ourPOs]);

  const waitingPOs = useMemo(() => groupedPOs.filter(po => po.Status === 'Waiting for Approval' || po.Status === 'Rejected'), [groupedPOs]);

  const apiBase = typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'https://vendbees-inventory-backend-333114755202.asia-south1.run.app/api'
    : 'https://vendbees-inventory-backend-333114755202.asia-south1.run.app/api';

  const handleAction = async (poId, action, reason = '') => {
    if (!token) {
      alert('You must be logged in to perform this action.');
      return;
    }

    const isReject = action === 'reject';
    const endpoint = isReject ? 'reject-po' : 'approve-po';
    const body = isReject ? JSON.stringify({ reason }) : null;

    setActionLoading(prev => ({ ...prev, [poId]: true }));
    try {
      const response = await fetch(`${apiBase}/${endpoint}/${encodeURIComponent(poId)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};

      if (!response.ok) {
        const message = data.error || data.message || text || `${response.status} ${response.statusText}`;
        alert(`Action failed: ${message}`);
      } else {
        alert(data.message || `PO ${poId} ${isReject ? 'rejected' : 'approved'} successfully.`);
        if (refreshData) refreshData();
      }
    } catch (err) {
      console.error('PO approval action error', err);
      alert(`Error: ${err?.message || err}`);
    } finally {
      setActionLoading(prev => ({ ...prev, [poId]: false }));
    }
  };

  const handleApprove = (poId, createdBy) => {
    if (createdBy === user?.userId) {
      alert('You cannot approve your own PO.');
      return;
    }
    handleAction(poId, 'approve');
  };

  const handleReject = (poId, createdBy) => {
    if (createdBy === user?.userId) {
      alert('You cannot reject your own PO.');
      return;
    }

    const reason = window.prompt(`Enter rejection reason for PO ${poId}:`);
    if (!reason || !reason.trim()) {
      return;
    }
    handleAction(poId, 'reject', reason.trim());
  };

  return (
    <div className="flex-1 overflow-auto bg-slate-50">
      <Header title="PO Verification" subtitle="Manager review and approval for pending purchase orders" />
      <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm">
            <div className="text-sm text-slate-500 font-medium">Pending Verification</div>
            <div className="text-3xl font-bold text-slate-800 mt-3">{waitingPOs.filter(po => po.Status === 'Waiting for Approval').length}</div>
          </div>
          <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm">
            <div className="text-sm text-slate-500 font-medium">Rejected PO Count</div>
            <div className="text-3xl font-bold text-slate-800 mt-3">{waitingPOs.filter(po => po.Status === 'Rejected').length}</div>
          </div>
          <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm">
            <div className="text-sm text-slate-500 font-medium">Total POs</div>
            <div className="text-3xl font-bold text-slate-800 mt-3">{groupedPOs.length}</div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800">POs Awaiting Approval or Rejected</h3>
            <p className="text-sm text-slate-500 mt-1">Only managers and admins can approve or reject purchase orders created by other users.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-left">
              <thead className="bg-slate-100 text-slate-500 uppercase text-xs tracking-wide">
                <tr>
                  <th className="px-4 py-3">PO ID</th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Created Date</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Products</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created By</th>
                  <th className="px-4 py-3">Lines</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {waitingPOs.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="px-4 py-8 text-center text-slate-400">
                      No pending or rejected POs available for approval.
                    </td>
                  </tr>
                ) : waitingPOs.map(po => (
                  <tr key={po.PO_ID} className="hover:bg-slate-50">
                    <td className="px-4 py-4 font-medium text-slate-800">{po.PO_ID}</td>
                    <td className="px-4 py-4 text-slate-600">{po.Vendor_ID}</td>
                    <td className="px-4 py-4 text-slate-600">{po.Created_Date ? new Date(po.Created_Date).toLocaleDateString() : '-'}</td>
                    <td className="px-4 py-4 text-right font-semibold text-slate-800">{po.Total_Amount ? `₹${Number(po.Total_Amount).toLocaleString()}` : '-'}</td>
                    <td className="px-4 py-4 text-slate-600 max-w-md">
                      {po.products && po.products.length > 0 ? (
                        po.products.map((prod, idx) => {
                          const pid = prod.Product_ID || prod.productId || prod.product_id || prod.ProductId || prod.product_id || '';
                          const pname = prod.Product_Name || prod.productName || prod.Name || prod.Product_Name || '';
                          return (
                            <div key={pid || idx} className="text-xs text-slate-700 truncate">
                              <span className="font-medium">{pid || 'N/A'}</span>
                              {pname ? <span className="text-slate-500"> — {pname}</span> : null}
                            </div>
                          );
                        })
                      ) : (
                        <span className="text-xs text-slate-500">No products</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <span className={po.Status === 'Waiting for Approval' ? 'bg-yellow-100 text-yellow-700' : po.Status === 'Rejected' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700' + ' px-2 py-1 rounded text-xs font-semibold'}>{po.Status}</span>
                      {po.Status === 'Rejected' && po.Rejection_Reason && (
                        <div className="text-xs text-red-600 mt-1 max-w-sm truncate" title={po.Rejection_Reason}>{po.Rejection_Reason}</div>
                      )}
                    </td>
                    <td className="px-4 py-4 text-slate-600">{po.Created_By || '-'}</td>
                    <td className="px-4 py-4 text-slate-600">{po.lineCount}</td>
                    <td className="px-4 py-4 space-x-2">
                      {po.Status === 'Waiting for Approval' && (
                        <>
                          <button
                            className="text-blue-600 hover:text-blue-800 text-xs font-semibold px-3 py-1 rounded bg-blue-50"
                            disabled={actionLoading[po.PO_ID]}
                            onClick={() => handleApprove(po.PO_ID, po.Created_By)}
                          >
                            {actionLoading[po.PO_ID] ? 'Approving...' : 'Approve'}
                          </button>
                          <button
                            className="text-red-600 hover:text-red-800 text-xs font-semibold px-3 py-1 rounded bg-red-50"
                            disabled={actionLoading[po.PO_ID]}
                            onClick={() => handleReject(po.PO_ID, po.Created_By)}
                          >
                            {actionLoading[po.PO_ID] ? 'Rejecting...' : 'Reject'}
                          </button>
                        </>
                      )}
                      {po.Status === 'Rejected' && (
                        <span className="inline-flex items-center gap-1 text-red-700 text-xs font-semibold">
                          <X size={14} /> Rejected
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default POApproval;
