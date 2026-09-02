import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { AlertTriangle, Package, CheckCircle, Search, Plus, X, Box, Trash2, QrCode, Download, History } from 'lucide-react';
import { createRoot } from 'react-dom/client';
import QRCode from 'react-qr-code';
import clsx from 'clsx';
import html2pdf from 'html2pdf.js';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import KPI from '../components/KPI';

const Restock = () => {
    const navigate = useNavigate();
    const { products, machines, stock, vendors, warehouseStocks = [], stocks = [], stock_assignments = [], loading, refreshData } = useData();
    const { user } = useAuth();
    const hasPermission = (permission) => user?.role === 'admin' || (Array.isArray(user?.permissions) && user.permissions.includes(permission));
    const [filter, setFilter] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('alerts');
    const [notification, setNotification] = useState(null);
    
    // QR Code history state (auto-generated on batch creation)
    const [qrHistory, setQrHistory] = useState([]);
    
    // ✅ NEW: Filter state for Stock Batches tab
    const [batchFilter, setBatchFilter] = useState('');
    const [dateFilter, setDateFilter] = useState('');
    const [productFilter, setProductFilter] = useState('');
    const [stockAnalyzeProductCount, setStockAnalyzeProductCount] = useState('');
    const [stockAnalyzePiecesPerCover, setStockAnalyzePiecesPerCover] = useState(5);
    const [stockAnalyzeCategoryInput, setStockAnalyzeCategoryInput] = useState('');
    const [stockAnalyzeSuggestedProducts, setStockAnalyzeSuggestedProducts] = useState([]);
    const [showStockAnalyzeForm, setShowStockAnalyzeForm] = useState(false);
    const [stockAnalyzePatterns, setStockAnalyzePatterns] = useState([]);
    
    // Build batch status summary for Restock counts
    const batchStatusMap = stocks.reduce((map, s) => {
        const batchKey = (s.batch || s.Batch || '').toString().trim();
        const statusValue = (s.status || s.Status || '').toString().trim();
        if (!batchKey) return map;
        if (!map[batchKey] && statusValue) {
            map[batchKey] = statusValue;
        }
        return map;
    }, {});

    const activeBatchCount = Object.values(batchStatusMap).filter(status => status === 'Active').length;
    const inactiveBatchCount = Object.values(batchStatusMap).filter(status => status === 'Inactive').length;

    // Use same API URL logic as DataContext for consistency
    const isLocalhost = typeof window !== 'undefined' && (
        window.location.hostname === 'localhost' || 
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.startsWith('192.168')
    );
    const API_URL = isLocalhost 
        ? 'https://vendbees-inventory-backend-333114755202.asia-south1.run.app/api'
        : (import.meta.env.VITE_API_URL || 'https://vendbees-inventory-backend-333114755202.asia-south1.run.app/api');

    const parseQrHistoryPayload = (item) => {
        if (!item) return { batch: null, createdAt: null, machines: [] };

        if (typeof item.qrData === 'string') {
            try {
                return JSON.parse(item.qrData);
            } catch (error) {
                console.warn('Failed to parse QR history payload:', error);
                return {};
            }
        }

        return item.qrData || {};
    };

    const getQrHistoryLabel = (item) => {
        const payload = parseQrHistoryPayload(item);
        const batchValue = payload.batch ?? null;
        const batchDateKey = item?.batchDateKey || null;
        const createdAt = payload.createdAt || item?.createdAt;

        let batchLabel = 'QR Set';
        if (typeof batchValue === 'number') {
            batchLabel = `Batch ${batchValue}`;
        } else if (typeof batchValue === 'string' && batchValue.trim()) {
            batchLabel = batchValue.trim();
        } else if (typeof batchDateKey === 'string' && batchDateKey.includes('BATCH:')) {
            const match = batchDateKey.match(/BATCH:(\d+)/);
            if (match) {
                batchLabel = `Batch ${match[1]}`;
            } else {
                batchLabel = batchDateKey;
            }
        }

        if (createdAt) {
            const dateLabel = new Date(createdAt).toLocaleString();
            return `${batchLabel} • ${dateLabel}`;
        }

        return batchLabel;
    };

    // Log when stocks data changes
    useEffect(() => {
        if (stocks && stocks.length > 0) {
            console.log('✔ Restock.jsx: Stocks data updated:', stocks.length, 'rows');
            stocks.forEach((s, idx) => {
                if (idx < 3) console.log(`  - Batch: ${s.batch || s.Batch_Number}, Stock: ${s.stockLabel || s.Stock}, Cover: ${s.coverLabel || s.cover}, Product: ${s.productId || s.product_id}`);
            });
        } else {
            console.log('⚠️ Restock.jsx: No stocks data loaded');
        }
        
        // Debug stock_assignments (new Firebase data)
        if (stock_assignments && Array.isArray(stock_assignments)) {
            console.log('✔ Restock.jsx: Stock Assignments loaded:', stock_assignments.length);
        } else {
            console.log('⚠️ Restock.jsx: Stock Assignments not available');
        }
    }, [stocks, stock_assignments]);

    // Download all QR codes as PNG images (zipped)
    const downloadQrPngZip = async (qrItem) => {
        try {
            const QRCodeLib = await import('qrcode');
            const zip = new JSZip();

            const payload = parseQrHistoryPayload(qrItem);

            // Determine machine records
            const machineRecords = payload.machines?.length
                ? payload.machines
                : (qrItem.machineIds || []).map(id => ({ machineId: id, location: '' }));

            if (machineRecords.length === 0) {
                alert('No machine data available for this QR code set.');
                return;
            }

            for (const machine of machineRecords) {
                const machineId = machine.machineId || machine.machine || '';
                const machineLocation = machine.location || machine.Location || '';
                const payload = parseQrHistoryPayload(qrItem);
                const createdDate = payload.createdAt || qrItem.createdAt || '';
                const createdDatePart = createdDate ? createdDate.split('T')[0] : '';
                const qrData = machine.qrCode || machine.qrData || (
                    payload.batch || qrItem.batchDateKey
                        ? `BATCH:${payload.batch || qrItem.batchDateKey || ''}|${createdDatePart}|MACHINE:${machineId}`
                        : `${machineId}|${machineLocation}`
                );
                
                const pngDataUrl = await QRCodeLib.toDataURL(qrData, {
                    width: 400,
                    margin: 2,
                    color: { dark: '#000000', light: '#ffffff' }
                });
                // Convert dataURL to blob
                const res = await fetch(pngDataUrl);
                const blob = await res.blob();
                zip.file(`${machineId}.png`, blob);
            }

            const zipBlob = await zip.generateAsync({ type: 'blob' });
            saveAs(zipBlob, `machine-qr-codes-${qrItem.qrId.slice(-8)}.zip`);
        } catch (err) {
            alert('Failed to generate PNG zip: ' + err.message);
            console.error('PNG zip error:', err);
        }
    };

    if (loading) return null;

    const formatExpiryDate = (value) => {
        if (!value) return null;

        let v = typeof value === 'string' ? value.trim() : '';

        // Direct date pattern: yyyy-mm-dd
        const isoDate = v.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (isoDate) {
            return `${isoDate[3]}-${isoDate[2]}-${isoDate[1]}`;
        }

        // If value is Date object
        if (value instanceof Date && !Number.isNaN(value.getTime())) {
            const d = String(value.getDate()).padStart(2, '0');
            const m = String(value.getMonth() + 1).padStart(2, '0');
            const y = value.getFullYear();
            return `${d}-${m}-${y}`;
        }

        // Attempt parsing with new Date fallback
        const parsed = new Date(v);
        if (!Number.isNaN(parsed.getTime())) {
            const d = String(parsed.getDate()).padStart(2, '0');
            const m = String(parsed.getMonth() + 1).padStart(2, '0');
            const y = parsed.getFullYear();
            return `${d}-${m}-${y}`;
        }

        return null;
    };

    // Process alerts
    let alerts = [];
    let criticalCount = 0;
    let lowCount = 0;
    let safeCount = 0;

    stock.forEach(s => {
        const prod = products.find(p => p.Product_ID === s.Product_ID);
        const machine = machines.find(m => m.Machine_ID === s.Machine_ID);
        if (!prod || !machine) return;

        let status = 'Safe';
        if (s.Current_Stock < 10) status = 'Critical';
        else if (s.Current_Stock < prod.Reorder_Level) status = 'Low Stock';

        if (status === 'Critical') criticalCount++;
        if (status === 'Low Stock') lowCount++;
        if (status === 'Safe') safeCount++;

        if (status !== 'Safe') {
            const vendor = vendors.find(v => v.Product_ID === prod.Product_ID || v.Product_Name === prod.Name)?.Name || 'Contact Admin';
            alerts.push({
                Machine: machine,
                Product: prod,
                Stock: s.Current_Stock,
                Reorder: prod.Reorder_Level,
                Status: status,
                Vendor: vendor
            });
        }
    });

    let filteredAlerts = filter === 'All' ? alerts :
        filter === 'Critical' ? alerts.filter(a => a.Status === 'Critical') :
            filter === 'Low' ? alerts.filter(a => a.Status === 'Low Stock') : alerts;

    if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        filteredAlerts = filteredAlerts.filter(a =>
            a.Machine.Machine_ID.toLowerCase().includes(query) ||
            a.Machine.Location.toLowerCase().includes(query) ||
            a.Product.Name.toLowerCase().includes(query) ||
            a.Product.Product_ID.toLowerCase().includes(query)
        );
    }

    const stockAnalyzeList = Object.values(
        warehouseStocks.reduce((acc, item) => {
            const productId = String(item?.productId ?? item?.Product_ID ?? '').trim();
            if (!productId) return acc;

            const productLookup = products.reduce((map, product) => {
                const id = String(product?.Product_ID ?? product?.productId ?? '').trim();
                if (id) map[id] = product;
                return map;
            }, {});

            const existing = acc[productId] || {
                productId,
                productName: productLookup[productId]?.Name || productLookup[productId]?.Product_Name || item?.productName || item?.Product_Name || 'Unknown Product',
                totalUnits: 0,
            };

            const availableUnits = Number(item?.availableUnits ?? item?.Available_Units ?? item?.units ?? item?.Units ?? 0);
            existing.totalUnits += Number.isFinite(availableUnits) ? availableUnits : 0;
            acc[productId] = existing;
            return acc;
        }, {})
    )
        .map((row) => ({
            ...row,
            fivePiecesCover: Math.floor(row.totalUnits / 5),
            sixPiecesCover: Math.floor(row.totalUnits / 6),
        }))
        .sort((a, b) => b.totalUnits - a.totalUnits);

    const stockAnalyzeTotalUnits = stockAnalyzeList.reduce((sum, row) => sum + Number(row.totalUnits || 0), 0);
    const normalizedProductCount = Number(stockAnalyzeProductCount) || 0;
    const normalizedCoverSize = Number(stockAnalyzePiecesPerCover) || 0;
    const stockAnalyzeIsValidInput = stockAnalyzeProductCount !== '' && normalizedProductCount > 0 && (normalizedCoverSize === 5 || normalizedCoverSize === 6);
    const stockAnalyzeProductAvailabilityMessage = stockAnalyzeIsValidInput && stockAnalyzeList.length < normalizedProductCount
        ? `Not enough products in warehouse stock. Available products: ${stockAnalyzeList.length}. Required: ${normalizedProductCount}.`
        : null;
    const stockAnalyzeMaxCover = stockAnalyzeIsValidInput && stockAnalyzeList.length >= normalizedProductCount
        ? Math.floor(stockAnalyzeTotalUnits / (normalizedProductCount * normalizedCoverSize))
        : 0;

    const getPatternRemainingUnits = (patternIndex) => stockAnalyzeTotalUnits - stockAnalyzePatterns
        .slice(0, patternIndex)
        .reduce((total, pattern) => {
            const flavours = Number(pattern.flavours) || 0;
            const piecesPerCover = Number(pattern.piecesPerCover) || 0;
            const coversToUse = Number(pattern.coversToUse) || 0;
            return total + (flavours * piecesPerCover * coversToUse);
        }, 0);

    const getPatternMaxCovers = (pattern, patternIndex) => {
        const flavours = Number(pattern.flavours) || 0;
        const piecesPerCover = Number(pattern.piecesPerCover) || 0;
        if (flavours <= 0 || ![5, 6].includes(piecesPerCover)) return 0;
        return Math.floor(Math.max(0, getPatternRemainingUnits(patternIndex)) / (flavours * piecesPerCover));
    };

    const addStockAnalyzePattern = () => {
        setStockAnalyzePatterns((patterns) => [
            ...patterns,
            { flavours: '', piecesPerCover: 5, maxCovers: null, coversToUse: '', reserved: false },
        ]);
    };

    const updateStockAnalyzePattern = (patternIndex, field, value) => {
        setStockAnalyzePatterns((patterns) => patterns.map((pattern, index) => (
            index === patternIndex
                ? { ...pattern, [field]: value, ...(field !== 'coversToUse' ? { maxCovers: null } : {}) }
                : pattern
        )));
    };

    const reserveStockAnalyzePattern = (patternIndex) => {
        setStockAnalyzePatterns((patterns) => patterns.map((pattern, index) => (
            index === patternIndex
                ? { ...pattern, reserved: true }
                : pattern
        )));
    };

    const calculateStockAnalyzePatternMax = (patternIndex) => {
        setStockAnalyzePatterns((patterns) => patterns.map((pattern, index) => (
            index === patternIndex
                ? { ...pattern, maxCovers: getPatternMaxCovers(pattern, patternIndex) }
                : pattern
        )));
    };

    const canAddStockAnalyzePattern = stockAnalyzePatterns.length > 0 && stockAnalyzePatterns.every((pattern, index) => {
        if (!pattern.reserved) return false;
        const maxCovers = pattern.maxCovers ?? getPatternMaxCovers(pattern, index);
        const coversToUse = Number(pattern.coversToUse);
        return maxCovers > 0 && Number.isInteger(coversToUse) && coversToUse > 0 && coversToUse <= maxCovers;
    });

    const getProductCategory = (productId) => {
        const product = products.find(item => String(item?.Product_ID ?? item?.productId ?? '').trim() === String(productId).trim());
        return product?.Category || product?.category || product?.Product_Category || 'Uncategorized';
    };

    const generateStockAnalyzeSuggestions = () => {
        if (!stockAnalyzeIsValidInput) return;

        const selectedCategories = stockAnalyzeCategoryInput
            .split(',')
            .map(value => value.trim().toLowerCase())
            .filter(Boolean);

        const matchingProducts = stockAnalyzeList.filter((item) => {
            if (selectedCategories.length === 0) return true;
            const productCategory = String(getProductCategory(item.productId) || '').trim().toLowerCase();
            return selectedCategories.includes(productCategory);
        });

        const suggested = matchingProducts
            .slice(0, normalizedProductCount)
            .map((item) => ({
                ...item,
                category: getProductCategory(item.productId),
            }));

        setStockAnalyzeSuggestedProducts(suggested);
    };

    const removeSuggestedProduct = (productId) => {
        setStockAnalyzeSuggestedProducts(prev => prev.filter(item => item.productId !== productId));
    };

    const handleCreateBatch = async (data) => {
        // Batch creation is now handled in CreateBatchPage
        // This function is kept for backward compatibility but no longer used
    };

    // QR Code functions
    // Manual QR generation removed — QR codes are generated automatically on batch creation

    const loadQrHistory = async () => {
        try {
            const userId = user?.userId || user?.user_id || '';
            const url = userId ? `${API_URL}/qr/history?userId=${encodeURIComponent(userId)}` : `${API_URL}/qr/history`;
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.ok) {
                const data = await response.json();
                setQrHistory(data.history || []);
            } else {
                console.error('Failed to load QR history');
            }
        } catch (error) {
            console.error('Error loading QR history:', error);
        }
    };

    const handleDownloadPdf = async (qrId) => {
        try {
            // Update download count
            await fetch(`${API_URL}/qr/download/${qrId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            // Get QR data from history
            const qrItem = qrHistory.find(item => item.qrId === qrId);
            if (!qrItem) {
                setNotification({ type: 'error', message: 'QR data not found' });
                return;
            }

            // Generate PNG ZIP with QR codes
            await downloadQrPngZip(qrItem);
            
            setNotification({ type: 'success', message: 'PNG ZIP downloaded successfully' });
        } catch (error) {
            console.error('Error downloading PDF:', error);
            setNotification({ type: 'error', message: 'Failed to download PDF' });
        }
    };

    const handleDeleteQr = async (qrId) => {
        try {
            const response = await fetch(`${API_URL}/qr/delete/${qrId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.ok) {
                setNotification({ type: 'success', message: 'QR history deleted successfully' });
                loadQrHistory();
            } else {
                const error = await response.json();
                console.error('Failed to delete QR history:', error);
                setNotification({ type: 'error', message: `Failed to delete QR history: ${error.message || 'Unknown error'}` });
            }
        } catch (error) {
            console.error('Error deleting QR history:', error);
            setNotification({ type: 'error', message: 'Failed to delete QR history' });
        }
    };

    // ✅ NEW: Delete batch handler
    const handleDeleteBatch = async (batchNumber) => {
        if (!batchNumber) {
            setNotification({ type: 'error', message: 'Batch number is required' });
            return;
        }

        // Confirm deletion
        if (!window.confirm(`Are you sure you want to delete batch ${batchNumber}? This action cannot be undone.`)) {
            return;
        }

        try {
            const response = await fetch(`${API_URL}/stocks/delete-batch/${batchNumber}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.ok) {
                const result = await response.json();
                setNotification({ 
                    type: 'success', 
                    message: `Batch ${batchNumber} deleted successfully. Removed ${result.deleted.stock_cover_assignments} stock-covers and ${result.deleted.stock_cover_product_assignments} products.` 
                });
                // Refresh data to reflect deletion
                refreshData();
            } else {
                const error = await response.json();
                console.error('Failed to delete batch:', error);
                setNotification({ type: 'error', message: `Failed to delete batch: ${error.error || error.message || 'Unknown error'}` });
            }
        } catch (error) {
            console.error('Error deleting batch:', error);
            setNotification({ type: 'error', message: `Error deleting batch: ${error.message}` });
        }
    };

    // Generate QR PDF for a qr history item
    const generateQrPdf = async (qrItem) => {
        const gridContainer = document.createElement('div');
        gridContainer.style.display = 'grid';
        gridContainer.style.gridTemplateColumns = 'repeat(2, 1fr)';
        gridContainer.style.gap = '20px';
        gridContainer.style.marginTop = '20px';
        gridContainer.style.display = 'grid';
        gridContainer.style.gridTemplateColumns = 'repeat(2, 1fr)';
        gridContainer.style.gap = '20px';
        gridContainer.style.marginTop = '20px';

        const qrRoots = [];
        const qrCanvases = [];
        const machineRecords = qrItem.qrData?.machines?.length
            ? qrItem.qrData.machines
            : (qrItem.machineIds || []).map(id => ({ machineId: id, location: '' }));

        if (machineRecords.length === 0) {
            const emptyMessage = document.createElement('p');
            emptyMessage.textContent = 'No machine data available for this QR code set.';
            emptyMessage.style.color = '#444';
            emptyMessage.style.fontSize = '14px';
            emptyMessage.style.margin = '20px 0';
            pdfContainer.appendChild(emptyMessage);
        }

        // Generate QR codes for each machine
        for (const machine of machineRecords) {
            const machineTitleText = machine.machineId || machine.machineId || '';
            const machineLocationText = machine.location || machine.Location || '';

            const qrCard = document.createElement('div');
            qrCard.style.border = '1px solid #ddd';
            qrCard.style.borderRadius = '8px';
            qrCard.style.padding = '15px';
            qrCard.style.textAlign = 'center';
            qrCard.style.backgroundColor = '#f9f9f9';

            // Machine info
            const machineTitle = document.createElement('h3');
            machineTitle.textContent = machineTitleText;
            machineTitle.style.color = '#333';
            machineTitle.style.fontSize = '16px';
            machineTitle.style.margin = '0 0 5px 0';
            machineTitle.style.fontWeight = 'bold';

            const machineLocation = document.createElement('p');
            machineLocation.textContent = machineLocationText;
            machineLocation.style.color = '#666';
            machineLocation.style.fontSize = '12px';
            machineLocation.style.margin = '0 0 15px 0';

            // QR Code container
            const qrContainer = document.createElement('div');
            qrContainer.style.display = 'inline-flex';
            qrContainer.style.backgroundColor = 'white';
            qrContainer.style.padding = '10px';
            qrContainer.style.borderRadius = '4px';
            qrContainer.style.border = '1px solid #ccc';
            qrContainer.style.textAlign = 'center';
            qrContainer.style.width = '150px';
            qrContainer.style.height = '150px';
            qrContainer.style.alignItems = 'center';
            qrContainer.style.justifyContent = 'center';

            const qrRoot = createRoot(qrContainer);
            qrRoot.render(
                <QRCode
                    value={machineTitleText}
                    size={130}
                    bgColor="#ffffff"
                    fgColor="#000000"
                    level="H"
                />
            );

            qrRoots.push(qrRoot);

            // QR code label
            const qrLabel = document.createElement('p');
            qrLabel.textContent = 'Scan to view machine details';
            qrLabel.style.color = '#666';
            qrLabel.style.fontSize = '10px';
            qrLabel.style.margin = '5px 0 0 0';

            qrCard.appendChild(machineTitle);
            qrCard.appendChild(machineLocation);
            qrCard.appendChild(qrContainer);
            qrCard.appendChild(qrLabel);

            gridContainer.appendChild(qrCard);
        }

        pdfContainer.appendChild(gridContainer);

        // Add notes if present
        if (qrItem.notes) {
            const notesSection = document.createElement('div');
            notesSection.style.marginTop = '30px';
            notesSection.style.padding = '15px';
            notesSection.style.backgroundColor = '#f0f0f0';
            notesSection.style.borderRadius = '4px';

            const notesTitle = document.createElement('h4');
            notesTitle.textContent = 'Notes:';
            notesTitle.style.color = '#333';
            notesTitle.style.fontSize = '14px';
            notesTitle.style.margin = '0 0 5px 0';
            notesTitle.style.fontWeight = 'bold';

            const notesText = document.createElement('p');
            notesText.textContent = qrItem.notes;
            notesText.style.color = '#666';
            notesText.style.fontSize = '12px';
            notesText.style.margin = '0';
            notesText.style.lineHeight = '1.4';

            notesSection.appendChild(notesTitle);
            notesSection.appendChild(notesText);
            pdfContainer.appendChild(notesSection);
        }

        // Add to DOM temporarily for PDF generation
        document.body.appendChild(pdfContainer);
        pdfContainer.style.position = 'absolute';
        pdfContainer.style.top = '0';
        pdfContainer.style.left = '-9999px';
        pdfContainer.style.pointerEvents = 'none';
        pdfContainer.style.zIndex = '-1000';

        // Wait for the QR components to render into the DOM
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => setTimeout(resolve, 50));

        // Generate PDF
        const opt = {
            margin: 0.5,
            filename: `machine-qr-codes-${qrItem.qrId.slice(-8)}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
        };

        await html2pdf().set(opt).from(pdfContainer).save();

        // Clean up
        qrRoots.forEach((root) => root.unmount());
        qrCanvases.length = 0; // Clear the array
        document.body.removeChild(pdfContainer);
    };

    // Load QR history when QR tab is active
    useEffect(() => {
        if (activeTab === 'qr') {
            loadQrHistory();
        }
    }, [activeTab, user]);

    return (
        <div className="space-y-6 pb-10">
            <Header title="Restock & Stock Management" subtitle="Monitor stock levels and create batches for distribution" />

            <div className="px-8 space-y-6">
<div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                        <KPI title="Critical Items" value={criticalCount} icon={AlertTriangle} colorClass="bg-red-50 text-red-600" />
                        <KPI title="Low Stock" value={lowCount} icon={Package} colorClass="bg-yellow-50 text-yellow-600" />
                        <KPI title="Safe Stock" value={safeCount} icon={CheckCircle} colorClass="bg-green-50 text-green-600" />
                        <KPI title={activeTab === 'batches' ? 'Active Batches' : 'Active Stocks'} 
                            value={activeTab === 'batches' ? activeBatchCount : (stocks && Array.isArray(stocks) ? stocks.length : 0)} 
                            icon={Box} 
                            colorClass="bg-blue-50 text-blue-600" 
                        />
                        <KPI title="Inactive Batches" value={inactiveBatchCount} icon={Trash2} colorClass="bg-red-50 text-red-700" />
                </div>

                {/* Notification */}
                {notification && (
                    <div className={clsx("p-4 rounded-lg text-sm flex justify-between items-center", 
                        notification.type === 'success' 
                            ? "bg-green-50 text-green-800 border border-green-200" 
                            : "bg-red-50 text-red-800 border border-red-200")}>
                        <div>{notification.message}</div>
                        {notification.type === 'success' && (
                            <button
                                onClick={() => refreshData()}
                                className="text-xs font-medium px-3 py-1 bg-green-200 text-green-700 rounded hover:bg-green-300 ml-4"
                            >
                                Refresh Data
                            </button>
                        )}
                    </div>
                )}


                {/* Tabs */}
                <div className="flex gap-4 border-b border-slate-200">
                    <button
                        onClick={() => setActiveTab('alerts')}
                        className={clsx("px-4 py-3 font-medium border-b-2 transition-colors", activeTab === 'alerts' ? "border-orange-500 text-orange-600" : "border-transparent text-slate-600 hover:text-slate-800")}
                    >
                        Restock Alerts
                    </button>

                    <button
                        onClick={() => setActiveTab('stock-analyze')}
                        className={clsx("px-4 py-3 font-medium border-b-2 transition-colors", activeTab === 'stock-analyze' ? "border-orange-500 text-orange-600" : "border-transparent text-slate-600 hover:text-slate-800")}
                    >
                        Cover Pattern Analysis ({stockAnalyzeList.length})
                    </button>

                    <button
                        onClick={() => setActiveTab('batches')}
                        className={clsx("px-4 py-3 font-medium border-b-2 transition-colors", activeTab === 'batches' ? "border-orange-500 text-orange-600" : "border-transparent text-slate-600 hover:text-slate-800")}
                    >
                        Stock Batches ({stocks && Array.isArray(stocks) ? new Set(stocks.map(s => s.batch || s.Batch).filter(b => b)).size : 0})
                    </button>

                    <button
                        onClick={() => setActiveTab('qr')}
                        className={clsx("px-4 py-3 font-medium border-b-2 transition-colors", activeTab === 'qr' ? "border-orange-500 text-orange-600" : "border-transparent text-slate-600 hover:text-slate-800")}
                    >
                        QR Codes
                    </button>
                </div>

                {/* Restock Alerts Tab */}
                {activeTab === 'alerts' && (
                    <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                            <div className="flex gap-2">
                                {['All', 'Critical', 'Low'].map(f => (
                                    <button
                                        key={f}
                                        onClick={() => setFilter(f)}
                                        className={clsx("px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                                            filter === f ? "bg-orange-500 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50")}
                                    >
                                        {f === 'All' ? 'All Machines' : f === 'Critical' ? 'Critical Only' : 'Low Stock'}
                                    </button>
                                ))}
                            </div>
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search machine or product..."
                                    className="pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-sm w-full sm:w-64 focus:outline-none focus:border-orange-500"
                                />
                            </div>
                        </div>

                        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                            <div className="p-6 border-b border-slate-50">
                                <h3 className="font-semibold text-slate-800">Restock Alert Feed</h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                                        <tr>
                                            <th className="px-6 py-4 font-medium">Machine ID</th>
                                            <th className="px-6 py-4 font-medium">Location</th>
                                            <th className="px-6 py-4 font-medium">Product</th>
                                            <th className="px-6 py-4 font-medium">Current Stock</th>
                                            <th className="px-6 py-4 font-medium">Reorder Level</th>
                                            <th className="px-6 py-4 font-medium">Vendor</th>
                                            <th className="px-6 py-4 font-medium">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredAlerts.map((alert, idx) => (
                                            <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/50">
                                                <td className="px-6 py-4 font-bold text-slate-700">{alert.Machine.Machine_ID}</td>
                                                <td className="px-6 py-4 text-slate-500">{alert.Machine.Location}</td>
                                                <td className="px-6 py-4 font-medium text-slate-700">
                                                    {alert.Product.Name}
                                                    <div className="text-[10px] text-slate-400">{alert.Product.Category}</div>
                                                </td>
                                                <td className={clsx("px-6 py-4 font-bold", alert.Stock < 10 ? "text-red-600" : "text-yellow-600")}>
                                                    {alert.Stock} units
                                                </td>
                                                <td className="px-6 py-4 text-slate-500">{alert.Reorder} units</td>
                                                <td className="px-6 py-4 text-slate-500">{alert.Vendor}</td>
                                                <td className="px-6 py-4">
                                                    <span className={clsx("px-3 py-1 rounded-full text-xs font-bold uppercase",
                                                        alert.Status === 'Critical' ? "bg-red-100 text-red-600" : "bg-yellow-100 text-yellow-600")}>
                                                        {alert.Status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}



                {/* Cover Pattern Analysis Tab */}
                {activeTab === 'stock-analyze' && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-semibold text-slate-800">Cover Pattern Analysis</h3>
                            <button
                                onClick={() => setShowStockAnalyzeForm(true)}
                                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium"
                            >
                                Cover Pattern Calculator
                            </button>
                        </div>

                        {showStockAnalyzeForm && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
                                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-slate-200 max-h-[90vh] overflow-hidden flex flex-col">
                                    <div className="flex justify-between items-center border-b border-slate-200 px-5 py-4 shrink-0">
                                        <h4 className="text-lg font-semibold text-slate-800">Cover Pattern Calculator</h4>
                                        <button
                                            onClick={() => setShowStockAnalyzeForm(false)}
                                            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
                                            aria-label="Close form"
                                        >
                                            <X size={18} />
                                        </button>
                                    </div>

                                    <div className="p-5 space-y-4 overflow-y-auto flex-1">
                                        <div className="rounded-lg border border-orange-100 bg-orange-50 px-4 py-3">
                                            <div className="text-[10px] uppercase tracking-wide text-orange-600 font-semibold">Total Warehouse Units</div>
                                            <div className="text-xl font-bold text-slate-800 mt-1">{stockAnalyzeTotalUnits}</div>
                                        </div>

                                        {/* Pattern Builder */}
                                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
                                                <div className="flex justify-between items-center">
                                                    <label className="text-sm font-semibold text-slate-700">Add Pattern</label>
                                                    <button
                                                        type="button"
                                                        onClick={addStockAnalyzePattern}
                                                        className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
                                                    >
                                                        + Add Pattern
                                                    </button>
                                                </div>

                                                {stockAnalyzePatterns.length === 0 ? (
                                                    <p className="text-xs text-slate-600">Click "Add Pattern" to create a pattern with specific flavours and pieces per cover.</p>
                                                ) : (
                                                    <div className="space-y-3">
                                                        {stockAnalyzePatterns.map((pattern, idx) => {
                                                            const maxCovers = pattern.maxCovers ?? getPatternMaxCovers(pattern, idx);
                                                            const remainingUnits = getPatternRemainingUnits(idx);
                                                            return (
                                                                <div
                                                                    key={idx}
                                                                    className="rounded-lg border border-slate-200 bg-white p-4 space-y-3"
                                                                >
                                                                    <div className="text-sm font-semibold text-slate-700">Pattern {idx + 1}</div>

                                                                    <div className="grid grid-cols-2 gap-3">
                                                                        <div>
                                                                            <label className="block text-xs font-medium text-slate-600 mb-1">
                                                                                No of Flavours
                                                                            </label>
                                                                            <input
                                                                                type="number"
                                                                                min="1"
                                                                                value={pattern.flavours}
                                                                                onChange={(e) =>
                                                                                    updateStockAnalyzePattern(idx, 'flavours', e.target.value)
                                                                                }
                                                                                placeholder="Enter flavours"
                                                                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                                                                            />
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-xs font-medium text-slate-600 mb-1">
                                                                                Pieces per Cover
                                                                            </label>
                                                                            <select
                                                                                value={pattern.piecesPerCover}
                                                                                onChange={(e) =>
                                                                                    updateStockAnalyzePattern(idx, 'piecesPerCover', Number(e.target.value))
                                                                                }
                                                                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                                                                            >
                                                                                <option value={5}>5</option>
                                                                                <option value={6}>6</option>
                                                                            </select>
                                                                        </div>
                                                                    </div>

                                                                    {maxCovers > 0 && (
                                                                        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm">
                                                                            <div className="text-[10px] uppercase tracking-wide text-green-600 font-semibold">
                                                                                Max Covers Possible
                                                                            </div>
                                                                            <div className="text-lg font-bold text-green-700 mt-1">{maxCovers}</div>
                                                                            <div className="text-[10px] text-green-600 mt-2">
                                                                                Available Units: {remainingUnits}
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {maxCovers > 0 && (
                                                                        <div>
                                                                            <label className="block text-xs font-medium text-slate-600 mb-1">
                                                                                No of Covers to Use (max {maxCovers})
                                                                            </label>
                                                                            <input
                                                                                type="number"
                                                                                min="1"
                                                                                max={maxCovers}
                                                                                value={pattern.coversToUse}
                                                                                onChange={(e) =>
                                                                                    updateStockAnalyzePattern(idx, 'coversToUse', e.target.value)
                                                                                }
                                                                                placeholder={`Enter covers (1-${maxCovers})`}
                                                                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                                                                            />
                                                                        </div>
                                                                    )}

                                                                    {maxCovers > 0 && pattern.coversToUse && (
                                                                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
                                                                            <div className="text-[10px] uppercase tracking-wide text-blue-600 font-semibold">
                                                                                Units Reserved
                                                                            </div>
                                                                            <div className="text-lg font-bold text-blue-700 mt-1">
                                                                                {Number(pattern.coversToUse) * Number(pattern.flavours) * Number(pattern.piecesPerCover)} units
                                                                            </div>
                                                                            <div className="text-[10px] text-blue-600 mt-2">
                                                                                Remaining for next pattern: {remainingUnits - (Number(pattern.coversToUse) * Number(pattern.flavours) * Number(pattern.piecesPerCover))}
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {!pattern.reserved && maxCovers > 0 && pattern.coversToUse && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => reserveStockAnalyzePattern(idx)}
                                                                            className="w-full px-3 py-2 text-xs bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium"
                                                                        >
                                                                            Reserve Pattern
                                                                        </button>
                                                                    )}

                                                                    {pattern.reserved && (
                                                                        <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-center">
                                                                            <div className="text-xs font-semibold text-green-700">✓ Pattern Reserved</div>
                                                                        </div>
                                                                    )}

                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            setStockAnalyzePatterns((patterns) =>
                                                                                patterns.filter((_, i) => i !== idx)
                                                                            )
                                                                        }
                                                                        className="w-full px-3 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-600 rounded-lg font-medium"
                                                                    >
                                                                        Remove Pattern
                                                                    </button>
                                                                </div>
                                                            );
                                                        })}

                                                        {canAddStockAnalyzePattern && (
                                                            <button
                                                                type="button"
                                                                onClick={addStockAnalyzePattern}
                                                                className="w-full px-3 py-2 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
                                                            >
                                                                + Add Another Pattern
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                        <div className="flex justify-end gap-2 pt-4">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowStockAnalyzeForm(false);
                                                    setStockAnalyzeSuggestedProducts([]);
                                                    setStockAnalyzeCategoryInput('');
                                                }}
                                                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50"
                                            >
                                                Close
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                                        <tr>
                                            <th className="px-6 py-4 font-medium">Product ID</th>
                                            <th className="px-6 py-4 font-medium">Product Name</th>
                                            <th className="px-6 py-4 font-medium">Total Units</th>
                                            <th className="px-6 py-4 font-medium">5 Pieces Cover</th>
                                            <th className="px-6 py-4 font-medium">6 Pieces Cover</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stockAnalyzeList.length === 0 ? (
                                            <tr>
                                                <td colSpan="5" className="px-6 py-8 text-center text-slate-500">
                                                    No products available in warehouse stock.
                                                </td>
                                            </tr>
                                        ) : (
                                            stockAnalyzeList.map((row) => (
                                                <tr key={row.productId} className="border-b border-slate-50 hover:bg-slate-50/50">
                                                    <td className="px-6 py-4 font-mono text-xs text-slate-700">{row.productId}</td>
                                                    <td className="px-6 py-4 font-medium text-slate-700">{row.productName}</td>
                                                    <td className="px-6 py-4 font-bold text-slate-800">{row.totalUnits}</td>
                                                    <td className="px-6 py-4 font-bold text-blue-700">{row.fivePiecesCover}</td>
                                                    <td className="px-6 py-4 font-bold text-purple-700">{row.sixPiecesCover}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* Stock Batches Tab */}
                {activeTab === 'batches' && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-semibold text-slate-800">Stock Batches Management</h3>
                            <div className="flex gap-2">
                            <button
                                    onClick={() => {
                                        console.log('Manual refresh triggered');
                                        refreshData();
                                    }}
                                    className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-medium flex items-center gap-2"
                                >
                                    🔄 Refresh
                                </button>
                                {hasPermission('create_batch') && (
                                    <button
                                        onClick={() => navigate('/restock/create-batch')}
                                        className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                                    >
                                        <Plus size={16} /> Create Batch
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* ✅ NEW: Filters for Stock Batches */}
                        <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
                            <h4 className="text-sm font-semibold text-slate-700">🔍 Filter Stock Batches</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Batch Number</label>
                                    <input
                                        type="text"
                                        value={batchFilter}
                                        onChange={(e) => setBatchFilter(e.target.value)}
                                        placeholder="Enter batch number..."
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Date (YYYY-MM-DD)</label>
                                    <input
                                        type="text"
                                        value={dateFilter}
                                        onChange={(e) => setDateFilter(e.target.value)}
                                        placeholder="YYYY-MM-DD"
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Product Name/ID</label>
                                    <input
                                        type="text"
                                        value={productFilter}
                                        onChange={(e) => setProductFilter(e.target.value)}
                                        placeholder="Search product..."
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                                    />
                                </div>
                            </div>
                            {(batchFilter || dateFilter || productFilter) && (
                                <button
                                    onClick={() => {
                                        setBatchFilter('');
                                        setDateFilter('');
                                        setProductFilter('');
                                    }}
                                    className="text-xs text-slate-600 hover:text-slate-800 font-medium underline"
                                >
                                    Clear Filters
                                </button>
                            )}
                        </div>

                        {stocks && stocks.length === 0 ? (
                            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-12 text-center">
                                <Package size={40} className="mx-auto text-slate-300 mb-3" />
                                <p className="text-slate-600 font-medium">No stock batches found</p>
                                <p className="text-sm text-slate-500 mt-2">Create your first batch to get started</p>
                            </div>
                        ) : (
                            <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                                <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-orange-50 to-white">
                                    <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                                        <Box size={18} className="text-orange-600" />
                                        Stock Batches ({stocks && Array.isArray(stocks) ? [...new Set(stocks.map(s => s.batch || s.Batch))].filter(b => b).length : 0} batches)
                                    </h3>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-50 sticky top-0">
                                            <tr>
                                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Batch</th>
                                                <th className="px-6 py-4 text-center text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Date</th>
                                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Machine</th>
                                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Stock</th>
                                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Cover</th>
                                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Cover Status</th>
                                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Product ID</th>
                                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Product Name</th>
                                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Case Label</th>
                                                <th className="px-6 py-4 text-center text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Units</th>
                                                <th className="px-6 py-4 text-center text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Status</th>
                                                <th className="px-6 py-4 text-center text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {(() => {
                                                const rows = [];
                                                
                                                if (stocks && Array.isArray(stocks) && stocks.length > 0) {
                                                    // Group by Batch
                                                    const groupedByBatch = {};
                                                    
                                                    stocks.forEach(stockItem => {
                                                        const batch = stockItem.batch || stockItem.Batch_Number || 'No Batch';
                                                        const date = stockItem.assignedDate || stockItem.Date;
                                                        
                                                        if (!groupedByBatch[batch]) {
                                                            groupedByBatch[batch] = {
                                                                batch,
                                                                date,
                                                                items: []
                                                            };
                                                        }
                                                        
                                                        groupedByBatch[batch].items.push({
                                                            id: stockItem.id,
                                                            machine: stockItem.machineId || stockItem.Machine || 'N/A',
                                                            stock: stockItem.stockLabel || stockItem.Stock,
                                                            cover: stockItem.coverLabel || stockItem.cover,
                                                            coverStatus: stockItem.coverStatus || stockItem.cover_status,
                                                            productId: stockItem.productId || stockItem.product_id,
                                                            productName: stockItem.product?.productName || stockItem.product_name,
                                                            units: stockItem.units || stockItem.Units,
                                                            status: stockItem.status || stockItem.Status,
                                                            caseLabel: stockItem.caseLabel || stockItem.case_label
                                                        });
                                                    });
                                                    
                                                    // ✅ Apply filters to batches
                                                    const filteredBatches = Object.values(groupedByBatch).filter(batchGroup => {
                                                        // Filter by batch number
                                                        if (batchFilter && !batchGroup.batch.toString().toLowerCase().includes(batchFilter.toLowerCase())) {
                                                            return false;
                                                        }
                                                        
                                                        // Filter by date
                                                        if (dateFilter && batchGroup.date) {
                                                            const batchDate = new Date(batchGroup.date).toISOString().split('T')[0];
                                                            if (batchDate !== dateFilter) {
                                                                return false;
                                                            }
                                                        }
                                                        
                                                        // Filter by product name/id
                                                        if (productFilter) {
                                                            const hasProduct = batchGroup.items.some(item =>
                                                                (item.productName && item.productName.toLowerCase().includes(productFilter.toLowerCase())) ||
                                                                (item.productId && item.productId.toString().toLowerCase().includes(productFilter.toLowerCase()))
                                                            );
                                                            if (!hasProduct) {
                                                                return false;
                                                            }
                                                        }
                                                        
                                                        return true;
                                                    });
                                                    
                                                    // Process each filtered batch and group by machine/stock/cover
                                                    filteredBatches.forEach(batchGroup => {
                                                        // Group by machine
                                                        const groupedByMachine = {};
                                                        batchGroup.items.forEach((item) => {
                                                            if (!groupedByMachine[item.machine]) {
                                                                groupedByMachine[item.machine] = [];
                                                            }
                                                            groupedByMachine[item.machine].push(item);
                                                        });

                                                        // Process each machine
                                                        Object.entries(groupedByMachine).forEach(([machine, machineItems]) => {
                                                            // Group by stock within machine
                                                            const groupedByStock = {};
                                                            machineItems.forEach((item) => {
                                                                if (!groupedByStock[item.stock]) {
                                                                    groupedByStock[item.stock] = [];
                                                                }
                                                                groupedByStock[item.stock].push(item);
                                                            });

                                                            // Process each stock
                                                            Object.entries(groupedByStock).forEach(([stock, stockItems]) => {
                                                                // Group by cover within stock
                                                                const groupedByCover = {};
                                                                stockItems.forEach((item) => {
                                                                    const coverKey = item.cover;
                                                                    if (!groupedByCover[coverKey]) {
                                                                        groupedByCover[coverKey] = [];
                                                                    }
                                                                    groupedByCover[coverKey].push(item);
                                                                });

                                                                // Process each cover
                                                                Object.entries(groupedByCover).forEach(([cover, coverItems]) => {
                                                                    // Group by product within cover
                                                                    const groupedByProduct = {};
                                                                    coverItems.forEach((item) => {
                                                                        const productKey = item.productId;
                                                                        if (!groupedByProduct[productKey]) {
                                                                            groupedByProduct[productKey] = [];
                                                                        }
                                                                        groupedByProduct[productKey].push(item);
                                                                    });

                                                                    // Create rows for each product group
                                                                    Object.entries(groupedByProduct).forEach(([productId, productItems]) => {
                                                                        productItems.forEach((item) => {
                                                                            rows.push({
                                                                                batch: batchGroup.batch,
                                                                                date: batchGroup.date,
                                                                                machine,
                                                                                stock,
                                                                                cover,
                                                                                coverStatus: item.coverStatus,
                                                                                productId: item.productId,
                                                                                productName: item.productName,
                                                                                caseLabel: item.caseLabel,
                                                                                units: item.units,
                                                                                status: item.status
                                                                            });
                                                                        });
                                                                    });
                                                                });
                                                            });
                                                        });
                                                    });
                                                }

                                                let prevBatch = null;
                                                let prevMachine = null;
                                                let prevStock = null;
                                                let prevCover = null;
                                                let prevProductId = null;
                                                let prevProductName = null;

                                                return rows.length > 0 ? rows.map((row, idx) => {
                                                    const showBatch = row.batch !== prevBatch;
                                                    const showMachine = showBatch || row.machine !== prevMachine;
                                                    const showStock = showMachine || row.stock !== prevStock;
                                                    const showCover = showStock || row.cover !== prevCover;
                                                    const showCoverStatus = showCover;
                                                    const showProductId = showCover || row.productId !== prevProductId;
                                                    const showProductName = showProductId || row.productName !== prevProductName;
                                                    const showDate = showBatch;
                                                    const showStatus = showBatch;

                                                    prevBatch = row.batch || prevBatch;
                                                    prevMachine = row.machine || prevMachine;
                                                    prevStock = row.stock || prevStock;
                                                    prevCover = row.cover || prevCover;
                                                    prevProductId = row.productId || prevProductId;
                                                    prevProductName = row.productName || prevProductName;

                                                    return (
                                                        <tr key={idx} className="hover:bg-slate-50 transition-colors border-b border-slate-100">
                                                            <td className="px-6 py-4 font-bold text-orange-600">{showBatch ? row.batch : ''}</td>
                                                            <td className="px-6 py-4 text-center text-slate-600 whitespace-nowrap">{showDate && row.date ? new Date(row.date).toLocaleDateString() : ''}</td>
                                                            <td className="px-6 py-4 font-mono text-xs text-slate-600">{showMachine ? row.machine : ''}</td>
                                                            <td className="px-6 py-4 font-medium text-slate-800">{showStock ? row.stock : ''}</td>
                                                            <td className="px-6 py-4 text-slate-700">{showCover ? row.cover : ''}</td>
                                                            <td className="px-6 py-4 text-slate-600">
                                                                {showCoverStatus && row.coverStatus && (
                                                                    <span className="inline-block px-2 py-1 bg-green-100 text-green-700 text-xs rounded">{row.coverStatus}</span>
                                                                )}
                                                            </td>
                                                            <td className="px-6 py-4 font-mono text-xs text-slate-600">{showProductId ? row.productId : ''}</td>
                                                            <td className="px-6 py-4 font-medium text-slate-800">{showProductName ? row.productName : ''}</td>
                                                            <td className="px-6 py-4 text-slate-700 text-xs">{row.caseLabel || '-'}</td>
                                                            <td className="px-6 py-4 text-center">
                                                                <span className={clsx("px-2 py-1 rounded text-sm font-bold inline-block", 
                                                                    (row.units || 0) > 0 
                                                                        ? "bg-blue-100 text-blue-700" 
                                                                        : "bg-gray-100 text-gray-600")}>
                                                                    {row.units || 0}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4 text-center">
                                                                {showStatus && row.status ? (
                                                                    <span className={clsx(
                                                                        "px-2 py-1 rounded text-xs font-bold inline-block",
                                                                        row.status === 'Active' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                                                                    )}>
                                                                        {row.status}
                                                                    </span>
                                                                ) : (
                                                                    ''
                                                                )}
                                                            </td>
                                                            {/* ✅ NEW: Delete action button */}
                                                            <td className="px-6 py-4 text-center">
                                                                {showBatch && (
                                                                    <button
                                                                        onClick={() => handleDeleteBatch(row.batch)}
                                                                        className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-xs font-medium transition-colors flex items-center gap-1 mx-auto"
                                                                        title={`Delete batch ${row.batch}`}
                                                                    >
                                                                        <Trash2 size={14} />
                                                                        Delete
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                }) : (
                                                    <tr>
                                                        <td colSpan="12" className="px-6 py-8 text-center text-slate-500">
                                                            No batches to display
                                                        </td>
                                                    </tr>
                                                );
                                            })()}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* QR Code Generation Tab */}
                {activeTab === 'qr' && (
                    <div className="space-y-6">
                        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <QrCode size={20} className="text-blue-600" />
                                <h3 className="text-sm font-semibold text-slate-800">QR Codes</h3>
                            </div>
                            <p className="text-sm text-slate-600">QR codes are now generated automatically when batches are created. Each batch entry will appear here with its machines for download.</p>
                        </div>

                        {/* QR Code History Section */}
                        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
                            <div className="flex items-center gap-3 mb-6">
                                <History size={24} className="text-green-600" />
                                <h3 className="text-lg font-semibold text-slate-800">QR Code Generation History</h3>
                            </div>

                            {qrHistory.length === 0 ? (
                                <div className="text-center py-12 text-slate-500">
                                    <QrCode size={48} className="mx-auto mb-4 text-slate-300" />
                                    <p className="font-medium">No QR codes generated yet</p>
                                    <p className="text-sm mt-1">Create a batch from the Restock page and it will appear here automatically.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {qrHistory.map((item, idx) => {
                                        const payload = parseQrHistoryPayload(item);
                                        const machineRecords = payload.machines?.length
                                            ? payload.machines
                                            : (item.machineIds || []).map(machineId => ({ machineId }));

                                        return (
                                            <div key={item.qrId || idx} className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors">
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <div className="font-medium text-slate-800">
                                                            {getQrHistoryLabel(item)}
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-sm font-medium text-slate-700">{machineRecords.length} machines</div>
                                                        <div className="text-xs text-slate-500">Downloaded {item.pdfDownloadCount || 0} times</div>
                                                    </div>
                                                </div>
                                                
                                                {item.notes && (
                                                    <div className="text-sm text-slate-600 mb-3 bg-slate-50 p-2 rounded">
                                                        {item.notes}
                                                    </div>
                                                )}
                                                
                                                <div className="flex flex-wrap gap-1 mb-3">
                                                    {machineRecords.map((machine, machineIndex) => {
                                                        const machineId = machine.machineId || machine.machine || '';
                                                        if (!machineId) return null;

                                                        return (
                                                            <span key={`${machineId}-${machineIndex}`} className="inline-block px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                                                                {machineId}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                                
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        onClick={() => handleDeleteQr(item.qrId)}
                                                        className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors"
                                                    >
                                                        Delete
                                                    </button>
                                                    <button
                                                        onClick={() => downloadQrPngZip(item)}
                                                        className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                                                    >
                                                        <Download size={14} />
                                                        Download PNG ZIP
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

        </div>
    );
};

export default Restock;