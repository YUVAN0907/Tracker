import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Download, Filter, ArrowUpDown, Eye, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { generateInvoicePDF } from '../utils/invoiceUtils';
import './BillHistory.css';

export default function BillHistory() {
  const { token } = useAuth();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filter and Sort states
  const [filterDate, setFilterDate] = useState('');
  const [sortBy, setSortBy] = useState('date-desc'); // date-asc, date-desc, amount-asc, amount-desc, products-asc, products-desc
  const [searchTerm, setSearchTerm] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Fetch bills
  useEffect(() => {
    fetchBills();
  }, []);

  const fetchBills = async () => {
    try {
      setLoading(true);
      const response = await fetch('https://vendbees-inventory-backend-333114755202.asia-south1.run.app/api/bills/history', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setBills(data.bills || []);
        setError('');
      } else {
        setError('Failed to load bill history');
      }
    } catch (err) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Filter and Sort
  const filteredAndSortedBills = useMemo(() => {
    let result = [...bills];

    // Filter by date
    if (filterDate) {
      result = result.filter(bill => {
        const billDate = new Date(bill.billDate).toISOString().split('T')[0];
        return billDate === filterDate;
      });
    }

    // Filter by search term
    if (searchTerm) {
      result = result.filter(bill =>
        bill.billNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        bill.billId.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Sort
    result.sort((a, b) => {
      const dateA = new Date(a.billDate);
      const dateB = new Date(b.billDate);

      switch (sortBy) {
        case 'date-asc':
          return dateA - dateB;
        case 'date-desc':
          return dateB - dateA;
        case 'amount-asc':
          return a.totalAmount - b.totalAmount;
        case 'amount-desc':
          return b.totalAmount - a.totalAmount;
        case 'products-asc':
          return a.totalProducts - b.totalProducts;
        case 'products-desc':
          return b.totalProducts - a.totalProducts;
        default:
          return dateB - dateA;
      }
    });

    return result;
  }, [bills, filterDate, sortBy, searchTerm]);

  // Pagination
  const totalPages = Math.ceil(filteredAndSortedBills.length / itemsPerPage);
  const paginatedBills = filteredAndSortedBills.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleDownload = async (bill) => {
    try {
      console.log('[Download] Bill object:', bill);
      console.log('[Download] billData field:', bill.billData);
      
      // Handle billData - it might be already an object or a string
      let billDataObj;
      if (typeof bill.billData === 'string') {
        // Try to parse the string
        if (bill.billData.trim() === '' || bill.billData === 'null' || bill.billData === null) {
          console.warn('[Download] billData is empty or null');
          billDataObj = null;
        } else {
          billDataObj = JSON.parse(bill.billData);
        }
      } else {
        billDataObj = bill.billData;
      }
      
      console.log('[Download] Parsed billData:', billDataObj);
      
      // If billData is missing or invalid, reconstruct items from available fields
      if (!billDataObj || !billDataObj.items) {
        console.warn('[Download] billData missing items, attempting to create minimal PDF');
        
        // Create a minimal bill representation without items
        alert(`Cannot download: Bill data is incomplete. Bill Number: ${bill.billNumber}`);
        return;
      }
      
      if (billDataObj.items.length === 0) {
        alert('No bill items found in this bill');
        return;
      }
      
      // Use stored billDate or fallback to today
      const billDate = (billDataObj.billDate || billDataObj.createdAt || new Date().toISOString().split('T')[0]);
      
      console.log('[Download] Generating PDF with', billDataObj.items.length, 'items');
      
      // Generate PDF from the stored bill items
      await generateInvoicePDF(billDataObj.items, billDate);
      
      console.log('[Download] PDF generated successfully');
      
      // Update download count on server
      const response = await fetch(`https://vendbees-inventory-backend-333114755202.asia-south1.run.app/api/bills/${bill.billId}/download`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        console.log('[Download] Download count updated');
        // Refresh the bills to show updated download count
        fetchBills();
      } else {
        console.warn('[Download] Failed to update download count on server');
      }
    } catch (err) {
      console.error('[Download] Error downloading bill:', err);
      console.error('[Download] Bill data:', bill);
      alert('Error: ' + err.message);
    }
  };

  const handleDeleteBill = async (billId) => {
    if (!window.confirm('Are you sure you want to delete this bill?')) {
      return;
    }

    try {
      const response = await fetch(`https://vendbees-inventory-backend-333114755202.asia-south1.run.app/api/bills/${billId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        fetchBills();
      } else {
        setError('Failed to delete bill');
      }
    } catch (err) {
      setError(err.message || 'An error occurred');
    }
  };

  if (loading) {
    return (
      <div className="bill-history">
        <div className="loading">
          <p>Loading bill history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bill-history">
      <div className="bill-history-header">
        <h2>Bill History</h2>
        <p>View, sort, and filter all generated bills</p>
      </div>

      {error && (
        <div className="alert alert-error">{error}</div>
      )}

      {/* Filters and Sort */}
      <div className="filters-section">
        <div className="filter-group">
          <label htmlFor="search">
            🔍 Search
          </label>
          <input
            type="text"
            id="search"
            placeholder="Search by bill number or ID"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="filter-input"
          />
        </div>

        <div className="filter-group">
          <label htmlFor="filterDate">
            <Calendar size={16} /> Filter by Date
          </label>
          <input
            type="date"
            id="filterDate"
            value={filterDate}
            onChange={(e) => {
              setFilterDate(e.target.value);
              setCurrentPage(1);
            }}
            className="filter-input"
          />
          {filterDate && (
            <button
              onClick={() => {
                setFilterDate('');
                setCurrentPage(1);
              }}
              className="clear-filter"
            >
              Clear
            </button>
          )}
        </div>

        <div className="filter-group">
          <label htmlFor="sortBy">
            <ArrowUpDown size={16} /> Sort By
          </label>
          <select
            id="sortBy"
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setCurrentPage(1);
            }}
            className="filter-input"
          >
            <option value="date-desc">📅 Date (Newest)</option>
            <option value="date-asc">📅 Date (Oldest)</option>
            <option value="amount-desc">💰 Total Amount (High to Low)</option>
            <option value="amount-asc">💰 Total Amount (Low to High)</option>
            <option value="products-desc">📦 Products (Most)</option>
            <option value="products-asc">📦 Products (Least)</option>
          </select>
        </div>
      </div>

      {/* Bills Table */}
      <div className="bills-table-container">
        {paginatedBills.length > 0 ? (
          <table className="bills-table">
            <thead>
              <tr>
                <th>Bill Number</th>
                <th>Date</th>
                <th>Total Amount</th>
                <th>Products</th>
                <th>Items</th>
                <th>Downloads</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedBills.map((bill) => (
                <tr key={bill.billId}>
                  <td className="bill-number">{bill.billNumber}</td>
                  <td>{new Date(bill.billDate).toLocaleDateString()}</td>
                  <td className="amount">₹{bill.totalAmount.toFixed(2)}</td>
                  <td>{bill.totalProducts}</td>
                  <td>{bill.totalItems}</td>
                  <td>{bill.downloadCount}</td>
                  <td>
                    <span className={`status-badge status-${bill.status}`}>
                      {bill.status}
                    </span>
                  </td>
                  <td className="actions">
                    <button
                      onClick={() => handleDownload(bill)}
                      className="btn-action btn-download"
                      title="Download"
                    >
                      <Download size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteBill(bill.billId)}
                      className="btn-action btn-delete"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <p>No bills found</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className="pagination-btn"
          >
            ← Previous
          </button>
          <span className="pagination-info">
            Page {currentPage} of {totalPages} ({filteredAndSortedBills.length} bills)
          </span>
          <button
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            className="pagination-btn"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
