import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Header from '../components/Header';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { 
    MessageSquare, Clock, CheckCircle2, AlertCircle, Search, Filter, 
    Download, ExternalLink, User, Phone, Hash, Calendar, ChevronRight, X, 
    Image as ImageIcon, ZoomIn, FileSpreadsheet, MessageCircle, Lightbulb
} from 'lucide-react';
import clsx from 'clsx';
import * as XLSX from 'xlsx';
import html2pdf from 'html2pdf.js';
import { normalizeTicket, normalizeFeedback, toSafeDate, buildExportData, generateCSV, generatePDFHtml } from '../utils/complaintHelpers';

const STATUS_COLORS = {
    'Submitted': 'bg-orange-50 text-orange-600 border-orange-200',
    'Reviewing': 'bg-blue-50 text-blue-600 border-blue-200',
    'Resolved': 'bg-green-50 text-green-600 border-green-200',
    'Pending': 'bg-yellow-50 text-yellow-600 border-yellow-200',
    'Refunded': 'bg-purple-50 text-purple-600 border-purple-200',
    'In Review': 'bg-blue-50 text-blue-600 border-blue-200', 
};

const STATUS_DOT_COLORS = {
    'Submitted': 'bg-orange-500',
    'Reviewing': 'bg-blue-500',
    'Resolved': 'bg-green-500',
    'Pending': 'bg-yellow-500',
    'Refunded': 'bg-purple-500',
    'In Review': 'bg-blue-500',
};

const TYPE_COLORS = {
    'Machine Down': 'bg-red-50 text-red-700 border-red-200',
    'Payment Issue': 'bg-amber-50 text-amber-700 border-amber-200',
    'Product Issue': 'bg-blue-50 text-blue-700 border-blue-200',
    'Refund Issue': 'bg-purple-50 text-purple-700 border-purple-200',
    'Suggestion': 'bg-emerald-50 text-emerald-700 border-emerald-200',
    'Feedback': 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const TYPE_ICON_COLORS = {
    'Machine Down': 'bg-red-100 text-red-600',
    'Payment Issue': 'bg-amber-100 text-amber-600',
    'Product Issue': 'bg-blue-100 text-blue-600',
    'Refund Issue': 'bg-purple-100 text-purple-600',
    'Suggestion': 'bg-emerald-100 text-emerald-600',
    'Feedback': 'bg-emerald-100 text-emerald-600',
};

// --- COMPLAINT CARD ---
const ComplaintCard = React.memo(({ complaint, onClick }) => {
    const isFeedback = complaint.type === 'Suggestion' || complaint.issue_type === 'Feedback';
    const isRecent = (new Date() - toSafeDate(complaint.created_at)) < 24 * 60 * 60 * 1000;

    if (isFeedback) {
        return (
            <div 
                onClick={() => onClick(complaint)}
                className="bg-gradient-to-br from-emerald-50/50 to-white p-5 rounded-2xl border border-emerald-100 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all cursor-pointer group flex flex-col h-full"
            >
                <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-emerald-100/80 rounded-xl text-emerald-600 group-hover:scale-110 transition-transform">
                            <Lightbulb size={20} />
                        </div>
                        <div>
                            <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest block mb-0.5">
                                #{complaint.ticket_id || complaint.feedback_id || 'SUG-X'}
                            </span>
                            <span className="text-sm font-bold text-slate-800">User Suggestion</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={clsx(
                            "px-2 py-0.5 rounded-md text-[10px] font-bold border",
                            complaint.status === 'Approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                            : complaint.status === 'Reviewing' ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                        )}>
                            {complaint.status === 'Approved' ? '✓ Approved' : complaint.status || 'Pending'}
                        </span>
                        {isRecent && <span className="flex h-2.5 w-2.5 relative" title="Recent Update">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                        </span>}
                    </div>
                </div>
                
                <div className="flex-1 bg-white/80 p-3.5 rounded-xl border border-emerald-50 mb-4 text-sm text-slate-600 italic line-clamp-3 shadow-inner">
                    "{complaint.message || complaint.issue_detail}"
                </div>

                <div className="mt-auto flex items-center justify-between pt-3 border-t border-emerald-100/50">
                    <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                        <div className="w-5 h-5 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-700">
                            <User size={10} />
                        </div>
                        <span className="truncate max-w-[120px]">{complaint.student?.name || 'Anonymous'}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 flex items-center gap-1 font-bold uppercase tracking-wider">
                        <Clock size={12} /> {toSafeDate(complaint.created_at).toLocaleDateString()}
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div 
            onClick={() => onClick(complaint)}
            className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all cursor-pointer group flex flex-col h-full relative overflow-hidden"
        >
            <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-slate-400 uppercase tracking-wider block">
                        #{complaint.ticket_id || 'TICKET-X'}
                    </span>
                    <span className={clsx(
                        "px-2.5 py-1 rounded-md text-[10px] font-bold border inline-flex items-center gap-1.5",
                        STATUS_COLORS[complaint.status] || 'bg-slate-50 text-slate-600 border-slate-200'
                    )}>
                        <span className={clsx("w-1.5 h-1.5 rounded-full", STATUS_DOT_COLORS[complaint.status] || "bg-slate-400", ["Submitted", "Reviewing", "In Review"].includes(complaint.status) && "animate-pulse")}></span>
                        {complaint.status || 'Submitted'}
                    </span>
                </div>
                {isRecent && <span className="flex h-2.5 w-2.5 relative" title="Recent Update">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500"></span>
                </span>}
            </div>
            
            <h3 className="font-black text-slate-800 mb-2 group-hover:text-slate-900 transition-colors text-lg truncate flex items-center gap-2">
                {complaint.machine_id || complaint.machine_name || 'Unknown Machine'}
            </h3>
            
            <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className={clsx(
                    "px-2.5 py-1 rounded-md text-[10px] font-bold border",
                    TYPE_COLORS[complaint.issue_type] || 'bg-slate-50 text-slate-600 border-slate-200'
                )}>
                    {complaint.issue_type || 'General Issue'}
                </span>
                <span className="text-[10px] text-slate-500 flex items-center gap-1 font-bold bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100 uppercase tracking-wider">
                    <Clock size={12} />
                    {toSafeDate(complaint.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
            </div>

            <div className="text-sm text-slate-600 line-clamp-2 mb-5 flex-1 font-medium bg-slate-50 p-3 rounded-xl border border-slate-100">
                {complaint.issue_detail || complaint.message || 'No description provided.'}
            </div>

            <div className="flex flex-col gap-2 mb-4 text-xs font-semibold text-slate-500">
                <div className="flex items-center gap-2 truncate" title={complaint.student?.name}>
                    <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                        <User size={12} className="text-slate-400" />
                    </div>
                    <span className="truncate text-slate-700">{complaint.student?.name || 'Anonymous'}</span>
                    {complaint.student?.reg_no && <span className="text-[10px] text-slate-400 ml-auto border border-slate-200 px-1.5 py-0.5 rounded">{complaint.student.reg_no}</span>}
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                        <Phone size={12} className="text-slate-400" /> 
                    </div>
                    <span className="text-slate-600">{complaint.student?.phone || 'N/A'}</span>
                </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-auto">
                <div className="flex items-center gap-2">
                    {complaint.attachments && complaint.attachments.length > 0 ? (
                        <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200 group-hover:bg-slate-200 transition-colors">
                            <ImageIcon size={14} className="text-slate-500" /> {complaint.attachments.length} Proof{complaint.attachments.length > 1 ? 's' : ''}
                        </span>
                    ) : (
                        <span className="text-[11px] text-slate-400 font-medium">No proofs attached</span>
                    )}
                </div>
                <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-slate-800 group-hover:text-white transition-all">
                    <ChevronRight size={16} className="text-slate-400 group-hover:text-white transition-colors" />
                </div>
            </div>
        </div>
    );
});

// --- TIMELINE COMPONENT ---
const Timeline = ({ complaint }) => {
    const createdDate = toSafeDate(complaint.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    const isReviewing = ['Reviewing', 'In Review', 'Resolved', 'Refunded'].includes(complaint.status);
    const isResolved = ['Resolved', 'Refunded'].includes(complaint.status);
    
    const steps = [
        { label: 'Ticket Submitted', time: createdDate, active: true, icon: AlertCircle, color: 'text-orange-600', bg: 'bg-orange-100' },
        { label: 'Under Review', time: isReviewing ? 'Updated status' : 'Pending review', active: isReviewing, icon: Clock, color: 'text-blue-600', bg: 'bg-blue-100' },
        { label: complaint.status === 'Refunded' ? 'Refund Processed' : 'Issue Resolved', time: isResolved ? 'Completed' : 'Awaiting resolution', active: isResolved, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-100' }
    ];

    return (
        <div className="space-y-6">
            {steps.map((step, i) => (
                <div key={i} className="flex gap-4 relative">
                    {i !== steps.length - 1 && (
                        <div className={clsx("absolute left-5 top-10 bottom-[-1.5rem] w-0.5 -ml-px rounded-full", step.active && steps[i+1]?.active ? "bg-slate-300" : "bg-slate-100 border-dashed border-l-2")}></div>
                    )}
                    <div className={clsx("w-10 h-10 rounded-xl flex items-center justify-center relative z-10 shrink-0 shadow-sm border border-white", step.active ? step.bg + ' ' + step.color : 'bg-slate-50 text-slate-300 border-slate-200')}>
                        <step.icon size={20} />
                    </div>
                    <div className="pt-2 pb-2">
                        <h4 className={clsx("text-sm font-black tracking-wide", step.active ? "text-slate-800" : "text-slate-400")}>{step.label}</h4>
                        <p className="text-xs font-semibold text-slate-400 mt-1 uppercase tracking-wider">{step.time}</p>
                    </div>
                </div>
            ))}
        </div>
    );
};

// --- MAIN PAGE ---
const Complaints = () => {
    const [tickets, setTickets] = useState([]);
    const [feedbacks, setFeedbacks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedComplaint, setSelectedComplaint] = useState(null);
    const [previewImage, setPreviewImage] = useState(null);
    const [exporting, setExporting] = useState(false);
    
    // Filters
    const [filterStatus, setFilterStatus] = useState('Unsolved');
    const [filterType, setFilterType] = useState('All');
    const [filterDate, setFilterDate] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [customDateStart, setCustomDateStart] = useState('');
    const [customDateEnd, setCustomDateEnd] = useState('');
    const [showExportMenu, setShowExportMenu] = useState(false);
    const exportMenuRef = useRef(null);

    useEffect(() => {
        let unsubTickets = () => {};
        let unsubFeedbacks = () => {};

        // Try createdAt (VendyBot convention) first, fallback to created_at, then no ordering
        const trySubscribeTickets = (fieldName) => {
            const q = fieldName
                ? query(collection(db, "tickets"), orderBy(fieldName, "desc"))
                : query(collection(db, "tickets"));
            return onSnapshot(q, (snapshot) => {
                const data = snapshot.docs.map(d => normalizeTicket(d.data(), d.id));
                setTickets(data);
                setLoading(false);
            }, (error) => {
                if (fieldName === "createdAt") {
                    console.warn("tickets orderBy createdAt failed, trying created_at...");
                    unsubTickets = trySubscribeTickets("created_at");
                } else if (fieldName === "created_at") {
                    console.warn("tickets orderBy created_at failed, fetching unordered...");
                    unsubTickets = trySubscribeTickets(null);
                } else {
                    console.error("Error fetching tickets:", error);
                    setLoading(false);
                }
            });
        };

        const trySubscribeFeedbacks = (fieldName) => {
            const q = fieldName
                ? query(collection(db, "feedbacks"), orderBy(fieldName, "desc"))
                : query(collection(db, "feedbacks"));
            return onSnapshot(q, (snapshot) => {
                const data = snapshot.docs.map(d => normalizeFeedback(d.data(), d.id));
                setFeedbacks(data);
            }, (error) => {
                if (fieldName === "createdAt") {
                    console.warn("feedbacks orderBy createdAt failed, trying created_at...");
                    unsubFeedbacks = trySubscribeFeedbacks("created_at");
                } else if (fieldName === "created_at") {
                    console.warn("feedbacks orderBy created_at failed, fetching unordered...");
                    unsubFeedbacks = trySubscribeFeedbacks(null);
                } else {
                    console.error("Error fetching feedbacks:", error);
                }
            });
        };

        unsubTickets = trySubscribeTickets("createdAt");
        unsubFeedbacks = trySubscribeFeedbacks("createdAt");

        return () => {
            unsubTickets();
            unsubFeedbacks();
        };
    }, []);

    const allComplaints = useMemo(() => {
        const combined = [...tickets, ...feedbacks];
        combined.sort((a, b) => toSafeDate(b.created_at) - toSafeDate(a.created_at));
        return combined;
    }, [tickets, feedbacks]);

    const filteredComplaints = useMemo(() => {
        return allComplaints.filter(c => {
            let matchesStatus = false;
            if (filterStatus === 'All') {
                matchesStatus = true;
            } else if (filterStatus === 'Unsolved') {
                matchesStatus = ['Submitted', 'In Review', 'Reviewing', 'Pending'].includes(c.status) && c.status !== 'Approved';
            } else if (filterStatus === 'Resolved') {
                matchesStatus = ['Resolved', 'Refunded', 'Approved'].includes(c.status);
            } else {
                matchesStatus = c.status === filterStatus
                    || (filterStatus === 'In Review' && c.status === 'Reviewing')
                    || (filterStatus === 'Reviewing' && c.status === 'In Review');
            }
            const matchesType = filterType === 'All' || c.issue_type === filterType || (c.type === 'Suggestion' && filterType === 'Feedback');
            
            const date = toSafeDate(c.created_at);
            const today = new Date();
            const last7Days = new Date(today.getTime() - (7 * 24 * 60 * 60 * 1000));
            const last30Days = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));
            const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            const startOfYear = new Date(today.getFullYear(), 0, 1);
            
            let matchesDate = true;
            if (filterDate === 'Today') matchesDate = date.toDateString() === today.toDateString();
            else if (filterDate === 'Last 7 Days') matchesDate = date >= last7Days;
            else if (filterDate === 'Last 30 Days') matchesDate = date >= last30Days;
            else if (filterDate === 'This Month') matchesDate = date >= startOfMonth;
            else if (filterDate === 'This Year') matchesDate = date >= startOfYear;
            else if (filterDate === 'Custom Range') {
                if (customDateStart) matchesDate = matchesDate && date >= new Date(customDateStart);
                if (customDateEnd) {
                    const end = new Date(customDateEnd);
                    end.setHours(23, 59, 59, 999);
                    matchesDate = matchesDate && date <= end;
                }
            }

            const searchLower = searchQuery.toLowerCase();
            const matchesSearch = !searchQuery || 
                (c.ticket_id || '').toLowerCase().includes(searchLower) ||
                (c.machine_id || c.machine_name || '').toLowerCase().includes(searchLower) ||
                (c.student?.name || '').toLowerCase().includes(searchLower) ||
                (c.student?.phone || '').toLowerCase().includes(searchLower) ||
                (c.student?.reg_no || '').toLowerCase().includes(searchLower);

            return matchesStatus && matchesType && matchesDate && matchesSearch;
        });
    }, [allComplaints, filterStatus, filterType, filterDate, searchQuery, customDateStart, customDateEnd]);

    const stats = useMemo(() => ({
        total: filteredComplaints.length,
        submitted: filteredComplaints.filter(t => t.status === 'Submitted').length,
        reviewing: filteredComplaints.filter(t => t.status === 'Reviewing' || t.status === 'In Review').length,
        resolved: filteredComplaints.filter(t => ['Resolved', 'Refunded', 'Approved'].includes(t.status)).length
    }), [filteredComplaints]);

    // Keep selectedComplaint in sync with live Firestore data
    useEffect(() => {
        if (!selectedComplaint) return;
        const liveItem = allComplaints.find(c => c.id === selectedComplaint.id);
        if (liveItem) {
            const changed = liveItem.status !== selectedComplaint.status;
            if (changed) setSelectedComplaint(liveItem);
        }
    }, [allComplaints, selectedComplaint]);

    // Close export menu on outside click
    useEffect(() => {
        const handler = (e) => {
            if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) setShowExportMenu(false);
        };
        if (showExportMenu) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showExportMenu]);

    const handleStatusUpdate = async (ticketId, newStatus) => {
        if (!ticketId || selectedComplaint?.type === 'Suggestion') return;
        try {
            const ticketRef = doc(db, "tickets", ticketId);
            await updateDoc(ticketRef, { status: newStatus });
        } catch (error) {
            console.error("Error updating status:", error);
            alert("Failed to update status. Please try again.");
        }
    };

    const handleFeedbackStatusUpdate = async (feedbackDocId, newStatus) => {
        if (!feedbackDocId) return;
        try {
            const feedbackRef = doc(db, "feedbacks", feedbackDocId);
            await updateDoc(feedbackRef, { status: newStatus });
        } catch (error) {
            console.error("Error updating feedback status:", error);
            alert("Failed to update feedback status. Please try again.");
        }
    };

    // --- EXPORT LOGIC ---
    const getExportData = useCallback(() => buildExportData(filteredComplaints), [filteredComplaints]);

    const handleExportExcel = () => {
        setExporting(true);
        setShowExportMenu(false);
        try {
            const data = getExportData();
            if (!data.length) { alert("No data to export."); setExporting(false); return; }
            const ws = XLSX.utils.json_to_sheet(data);
            const colWidths = [];
            data.forEach(row => {
                Object.keys(row).forEach((key, i) => {
                    const value = row[key] ? row[key].toString() : '';
                    colWidths[i] = Math.max(colWidths[i] || 0, value.length, key.length);
                });
            });
            ws['!cols'] = colWidths.map(w => ({ wch: w + 2 }));
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Complaints Data");
            XLSX.writeFile(wb, `Complaints_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
        } catch (error) {
            console.error("Export failed:", error);
            alert("Failed to export data.");
        } finally {
            setExporting(false);
        }
    };

    const handleExportCSV = () => {
        setExporting(true);
        setShowExportMenu(false);
        try {
            const data = getExportData();
            if (!data.length) { alert("No data to export."); setExporting(false); return; }
            const csv = generateCSV(data);
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Complaints_Export_${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("CSV export failed:", error);
            alert("Failed to export CSV.");
        } finally {
            setExporting(false);
        }
    };

    const handleExportPDF = async () => {
        setExporting(true);
        setShowExportMenu(false);
        try {
            const data = getExportData();
            if (!data.length) { alert("No data to export."); setExporting(false); return; }
            const htmlStr = generatePDFHtml(data);
            const container = document.createElement('div');
            container.innerHTML = htmlStr;
            document.body.appendChild(container);
            await html2pdf().set({
                margin: [10, 10, 10, 10],
                filename: `Complaints_Report_${new Date().toISOString().split('T')[0]}.pdf`,
                html2canvas: { scale: 2 },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
            }).from(container).save();
            document.body.removeChild(container);
        } catch (error) {
            console.error("PDF export failed:", error);
            alert("Failed to export PDF.");
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="space-y-6 pb-10 min-h-screen bg-slate-50/50">
            <Header title="Complaints Management" subtitle="Real-time issue tracking and resolution operations" />
            
            <div className="px-4 md:px-8 space-y-8">
                {/* --- STATS ROW --- */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {[
                        { label: 'Total Records', value: stats.total, icon: MessageSquare, color: 'text-slate-700', bg: 'bg-white', border: 'border-slate-200', iconBg: 'bg-slate-100' },
                        { label: 'New Submitted', value: stats.submitted, icon: AlertCircle, color: 'text-orange-600', bg: 'bg-white', border: 'border-orange-200', iconBg: 'bg-orange-50' },
                        { label: 'In Review', value: stats.reviewing, icon: Clock, color: 'text-blue-600', bg: 'bg-white', border: 'border-blue-200', iconBg: 'bg-blue-50' },
                        { label: 'Resolved', value: stats.resolved, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-white', border: 'border-green-200', iconBg: 'bg-green-50' },
                    ].map((stat, i) => (
                        <div key={i} className={`${stat.bg} p-6 rounded-3xl border ${stat.border} shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow`}>
                            <div className="flex justify-between items-start mb-4">
                                <div className={clsx("p-3 rounded-2xl", stat.iconBg, stat.color)}>
                                    <stat.icon size={24} strokeWidth={2.5} />
                                </div>
                            </div>
                            <div>
                                <div className="text-4xl font-black text-slate-800 tracking-tight">{stat.value}</div>
                                <div className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-2">{stat.label}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* --- FILTERS & EXPORT ROW --- */}
                <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col xl:flex-row gap-4 items-center justify-between">
                    <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
                        <div className="relative flex-1 min-w-[200px] xl:min-w-[280px]">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input 
                                type="text" 
                                placeholder="Search ID, Machine, Student..."
                                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800/20 focus:border-slate-800 transition-all font-semibold text-slate-700 placeholder:text-slate-400"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        
                        <div className="flex items-center gap-2 overflow-x-auto pb-1 xl:pb-0 custom-scrollbar">
                            <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-200">
                                <select 
                                    className="bg-transparent pl-3 pr-8 py-1.5 text-sm font-bold text-slate-700 focus:outline-none cursor-pointer appearance-none"
                                    value={filterStatus}
                                    onChange={(e) => setFilterStatus(e.target.value)}
                                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.2em 1.2em' }}
                                >
                                    <option value="Unsolved">Unsolved</option>
                                    <option value="All">All Statuses</option>
                                    <option value="Submitted">Submitted</option>
                                    <option value="In Review">In Review</option>
                                    <option value="Pending">Pending</option>
                                    <option value="Resolved">Resolved</option>
                                    <option value="Refunded">Refunded</option>
                                </select>
                            </div>

                            <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-200">
                                <select 
                                    className="bg-transparent pl-3 pr-8 py-1.5 text-sm font-bold text-slate-700 focus:outline-none cursor-pointer appearance-none"
                                    value={filterType}
                                    onChange={(e) => setFilterType(e.target.value)}
                                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.2em 1.2em' }}
                                >
                                    <option value="All">All Types</option>
                                    <option value="Machine Down">Machine Down</option>
                                    <option value="Product Issue">Product Issue</option>
                                    <option value="Payment Issue">Payment Issue</option>
                                    <option value="Feedback">Suggestions</option>
                                </select>
                            </div>

                            <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-200">
                                <select 
                                    className="bg-transparent pl-3 pr-8 py-1.5 text-sm font-bold text-slate-700 focus:outline-none cursor-pointer appearance-none"
                                    value={filterDate}
                                    onChange={(e) => setFilterDate(e.target.value)}
                                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.2em 1.2em' }}
                                >
                                    <option value="All">All Time</option>
                                    <option value="Today">Today</option>
                                    <option value="Last 7 Days">Last 7 Days</option>
                                    <option value="Last 30 Days">Last 30 Days</option>
                                    <option value="This Month">This Month</option>
                                    <option value="This Year">This Year</option>
                                    <option value="Custom Range">Custom Range</option>
                                </select>
                            </div>
                        </div>

                        {filterDate === 'Custom Range' && (
                            <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-200">
                                <input 
                                    type="date" 
                                    value={customDateStart}
                                    onChange={(e) => setCustomDateStart(e.target.value)}
                                    className="bg-transparent text-sm font-bold outline-none px-2 text-slate-700 cursor-pointer"
                                />
                                <span className="text-slate-300 font-bold">-</span>
                                <input 
                                    type="date" 
                                    value={customDateEnd}
                                    onChange={(e) => setCustomDateEnd(e.target.value)}
                                    className="bg-transparent text-sm font-bold outline-none px-2 text-slate-700 cursor-pointer"
                                />
                            </div>
                        )}
                    </div>

                    <div className="w-full xl:w-auto relative" ref={exportMenuRef}>
                        <button 
                            onClick={() => setShowExportMenu(prev => !prev)}
                            disabled={exporting}
                            className="w-full xl:w-auto flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-6 py-3 rounded-2xl text-sm font-bold transition-all shadow-sm hover:shadow-md disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {exporting ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            ) : (
                                <Download size={18} />
                            )}
                            {exporting ? 'Exporting...' : 'Download Complaints'}
                        </button>
                        {showExportMenu && (
                            <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                <div className="p-2 space-y-1">
                                    <button onClick={handleExportCSV} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 rounded-xl transition-colors">
                                        <FileSpreadsheet size={18} className="text-green-600" /> Export as CSV
                                    </button>
                                    <button onClick={handleExportExcel} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 rounded-xl transition-colors">
                                        <FileSpreadsheet size={18} className="text-blue-600" /> Export as Excel
                                    </button>
                                    <button onClick={handleExportPDF} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 rounded-xl transition-colors">
                                        <FileSpreadsheet size={18} className="text-red-600" /> Export as PDF
                                    </button>
                                </div>
                                <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{filteredComplaints.length} records • Filters applied</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* --- GRID / EMPTY STATES --- */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-32 bg-white rounded-3xl border border-slate-200 border-dashed">
                        <div className="w-12 h-12 border-4 border-slate-100 border-t-slate-800 rounded-full animate-spin"></div>
                        <p className="mt-6 text-slate-800 font-bold tracking-wide">Loading Real-Time Data...</p>
                        <p className="mt-2 text-slate-500 text-sm font-medium">Fetching complaints and suggestions securely</p>
                    </div>
                ) : filteredComplaints.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-32 bg-white rounded-3xl border border-slate-200 shadow-sm">
                        <div className="p-6 bg-slate-50 rounded-full text-slate-300 mb-6">
                            <CheckCircle2 size={56} strokeWidth={1.5} />
                        </div>
                        <h3 className="text-2xl font-black text-slate-800">No complaints found</h3>
                        <p className="text-slate-500 font-medium mt-3 max-w-sm text-center">There are no complaints matching your current filters. Adjust your search parameters or enjoy the zero-inbox!</p>
                        {(searchQuery || (filterStatus !== 'Unsolved' && filterStatus !== 'All') || filterType !== 'All' || filterDate !== 'All') && (
                            <button 
                                onClick={() => { setSearchQuery(''); setFilterStatus('Unsolved'); setFilterType('All'); setFilterDate('All'); }}
                                className="mt-8 px-8 py-3 bg-slate-800 text-white font-bold rounded-2xl hover:bg-slate-900 transition-colors shadow-sm"
                            >
                                Clear All Filters
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {filteredComplaints.map((c) => (
                            <ComplaintCard 
                                key={c.id} 
                                complaint={c} 
                                onClick={setSelectedComplaint}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* --- COMPLAINT DETAIL MODAL --- */}
            {selectedComplaint && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-slate-50 w-full max-w-6xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[95vh] animate-in zoom-in-95 duration-300 border border-slate-200">
                        
                        {/* Header */}
                        <div className="px-8 py-6 border-b border-slate-200 flex justify-between items-center bg-white sticky top-0 z-20 shadow-sm">
                            <div>
                                <div className="flex items-center gap-4 mb-2">
                                    <h2 className="text-3xl font-black text-slate-800 tracking-tight">
                                        #{selectedComplaint.ticket_id || selectedComplaint.feedback_id || 'Detail View'}
                                    </h2>
                                    <span className={clsx(
                                        "px-3.5 py-1.5 rounded-xl text-xs font-bold border uppercase tracking-wider",
                                        selectedComplaint.type === 'Suggestion' ? TYPE_COLORS['Suggestion'] : STATUS_COLORS[selectedComplaint.status] || 'bg-slate-100 text-slate-600'
                                    )}>
                                        {selectedComplaint.type === 'Suggestion' ? 'Suggestion' : selectedComplaint.status}
                                    </span>
                                </div>
                                <p className="text-sm text-slate-500 font-bold flex items-center gap-2">
                                    <Calendar size={14} className="text-slate-400" />
                                    {toSafeDate(selectedComplaint.created_at).toLocaleString([], { dateStyle: 'full', timeStyle: 'medium' })}
                                </p>
                            </div>
                            <button 
                                onClick={() => setSelectedComplaint(null)}
                                className="p-3 bg-slate-50 hover:bg-slate-200 rounded-full text-slate-500 transition-colors border border-slate-200"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6 sm:p-8 custom-scrollbar">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                                
                                {/* Left Column: Info & Description */}
                                <div className="lg:col-span-2 space-y-8">
                                    
                                    {/* Info Cards */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-5 hover:shadow-md transition-shadow">
                                            <div className={clsx("w-14 h-14 rounded-2xl flex items-center justify-center shrink-0", TYPE_ICON_COLORS[selectedComplaint.issue_type] || 'bg-orange-50 text-orange-600')}>
                                                <AlertCircle size={28} />
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Issue Type</p>
                                                <p className="text-lg font-black text-slate-800">{selectedComplaint.issue_type || 'Feedback'}</p>
                                            </div>
                                        </div>
                                        {selectedComplaint.type !== 'Suggestion' && (
                                            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-5 hover:shadow-md transition-shadow">
                                                <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                                                    <Hash size={28} />
                                                </div>
                                                <div>
                                                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Machine ID</p>
                                                    <p className="text-lg font-black text-slate-800 truncate">{selectedComplaint.machine_id || selectedComplaint.machine_name || 'N/A'}</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* User Details */}
                                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                                        <div className="px-8 py-5 border-b border-slate-100 bg-slate-50/80">
                                            <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                                <User size={14} /> Contact Information
                                            </h4>
                                        </div>
                                        <div className="p-8 grid grid-cols-1 sm:grid-cols-3 gap-8">
                                            <div>
                                                <p className="text-[10px] text-slate-400 font-black tracking-widest mb-2 uppercase">Full Name</p>
                                                <p className="text-base font-bold text-slate-800">{selectedComplaint.student?.name || 'Anonymous'}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-slate-400 font-black tracking-widest mb-2 uppercase">Mobile Number</p>
                                                <p className="text-base font-bold text-slate-800">{selectedComplaint.student?.phone || 'N/A'}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-slate-400 font-black tracking-widest mb-2 uppercase">Register Number</p>
                                                <p className="text-base font-bold text-slate-800">{selectedComplaint.student?.reg_no || 'N/A'}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Description */}
                                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                                        <div className="px-8 py-5 border-b border-slate-100 bg-slate-50/80">
                                            <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                                <FileSpreadsheet size={14} /> Description
                                            </h4>
                                        </div>
                                        <div className="p-8">
                                            <p className="text-base text-slate-700 leading-relaxed font-medium whitespace-pre-wrap bg-slate-50 p-6 rounded-2xl border border-slate-100">
                                                {selectedComplaint.issue_detail || selectedComplaint.message || 'No specific details provided.'}
                                            </p>
                                            
                                            {selectedComplaint.chat_history && selectedComplaint.chat_history.length > 0 && (
                                                <div className="mt-8 pt-8 border-t border-slate-100">
                                                    <h5 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-5 flex items-center gap-2">
                                                        <MessageCircle size={16} /> Bot Chat History
                                                    </h5>
                                                    <div className="bg-slate-50/50 rounded-2xl p-6 border border-slate-100 space-y-4 max-h-80 overflow-y-auto custom-scrollbar">
                                                        {selectedComplaint.chat_history.map((msg, idx) => (
                                                            <div key={idx} className={clsx(
                                                                "p-4 rounded-2xl text-sm max-w-[85%]", 
                                                                msg.role === 'user' 
                                                                    ? "bg-white border border-slate-200 ml-auto rounded-tr-sm shadow-sm" 
                                                                    : "bg-blue-50 text-blue-900 mr-auto rounded-tl-sm border border-blue-100"
                                                            )}>
                                                                <span className="font-bold text-[10px] uppercase block mb-1.5 opacity-50 tracking-wider">
                                                                    {msg.role === 'user' ? 'User' : 'VendyBot'}
                                                                </span>
                                                                <p className="font-medium leading-relaxed">{msg.content}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Image Gallery */}
                                    {selectedComplaint.attachments && selectedComplaint.attachments.length > 0 && (
                                        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                                            <div className="px-8 py-5 border-b border-slate-100 bg-slate-50/80 flex justify-between items-center">
                                                <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                                    <ImageIcon size={14} /> Proof Images
                                                </h4>
                                                <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded text-xs font-bold">{selectedComplaint.attachments.length}</span>
                                            </div>
                                            <div className="p-8 grid grid-cols-2 sm:grid-cols-3 gap-6">
                                                {selectedComplaint.attachments.map((url, i) => (
                                                    <div 
                                                        key={i} 
                                                        onClick={() => setPreviewImage(url)}
                                                        className="relative group rounded-2xl overflow-hidden border-2 border-slate-100 shadow-sm bg-slate-50 aspect-square cursor-zoom-in hover:border-slate-300 transition-colors"
                                                    >
                                                        <img src={url} alt={`Proof ${i+1}`} loading="lazy" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                                        <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                                                            <ZoomIn className="text-white drop-shadow-md" size={36} strokeWidth={2} />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Right Column: Sidebar (Timeline & Actions) */}
                                <div className="lg:sticky lg:top-0 space-y-8">
                                    
                                    {/* Action Status Update */}
                                    {selectedComplaint.type !== 'Suggestion' && (
                                        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                                            <div className="px-8 py-5 border-b border-slate-100 bg-slate-50/80">
                                                <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">Update Operations Status</h4>
                                            </div>
                                            <div className="p-8 flex flex-col gap-3">
                                                {['Submitted', 'In Review', 'Pending', 'Resolved', 'Refunded'].map((status) => {
                                                    // Hide Refunded for non-payment issues unless it's already refunded
                                                    if (status === 'Refunded' && selectedComplaint.issue_type !== 'Payment Issue' && selectedComplaint.status !== 'Refunded') return null;
                                                    
                                                    const isActive = selectedComplaint.status === status || (selectedComplaint.status === 'Reviewing' && status === 'In Review');
                                                    
                                                    return (
                                                        <button
                                                            key={status}
                                                            onClick={() => handleStatusUpdate(selectedComplaint.id, status)}
                                                            className={clsx(
                                                                "py-4 px-5 rounded-2xl text-sm font-bold border transition-all flex items-center justify-between group",
                                                                isActive
                                                                    ? STATUS_COLORS[status] + " ring-2 ring-offset-2 ring-" + STATUS_COLORS[status].split('-')[1] + "-200 shadow-sm scale-[1.02]"
                                                                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                                                            )}
                                                        >
                                                            <span className="flex items-center gap-3">
                                                                <span className={clsx("w-2 h-2 rounded-full", isActive ? STATUS_DOT_COLORS[status] : "bg-slate-300 group-hover:bg-slate-400 transition-colors")}></span>
                                                                {status}
                                                            </span>
                                                            {isActive && <CheckCircle2 size={20} />}
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Timeline — only for tickets, not feedbacks */}
                                    {selectedComplaint.type !== 'Suggestion' && (
                                        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                                            <div className="px-8 py-5 border-b border-slate-100 bg-slate-50/80">
                                                <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">Activity Timeline</h4>
                                            </div>
                                            <div className="p-8">
                                                <Timeline complaint={selectedComplaint} />
                                            </div>
                                        </div>
                                    )}

                                    {/* Feedback status management */}
                                    {selectedComplaint.type === 'Suggestion' && (
                                        <div className="bg-white rounded-3xl border border-emerald-200 shadow-sm overflow-hidden">
                                            <div className="px-8 py-5 border-b border-emerald-100 bg-emerald-50/80">
                                                <h4 className="text-xs font-black text-emerald-600 uppercase tracking-widest">Update Suggestion Status</h4>
                                            </div>
                                            <div className="p-6 flex flex-col gap-3">
                                                {['Pending', 'Reviewing', 'Approved'].map((status) => {
                                                    const isActive = selectedComplaint.status === status;
                                                    const statusStyles = {
                                                        'Pending': { bg: 'bg-yellow-50 text-yellow-700 border-yellow-200', dot: 'bg-yellow-500' },
                                                        'Reviewing': { bg: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
                                                        'Approved': { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
                                                    };
                                                    const s = statusStyles[status];
                                                    return (
                                                        <button
                                                            key={status}
                                                            onClick={() => handleFeedbackStatusUpdate(selectedComplaint.id, status)}
                                                            className={clsx(
                                                                "py-4 px-5 rounded-2xl text-sm font-bold border transition-all flex items-center justify-between group",
                                                                isActive
                                                                    ? s.bg + " ring-2 ring-offset-2 shadow-sm scale-[1.02]"
                                                                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                                                            )}
                                                        >
                                                            <span className="flex items-center gap-3">
                                                                <span className={clsx("w-2 h-2 rounded-full", isActive ? s.dot : "bg-slate-300 group-hover:bg-slate-400 transition-colors")}></span>
                                                                {status === 'Approved' ? '✓ Approved' : status}
                                                            </span>
                                                            {isActive && <CheckCircle2 size={20} />}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            {selectedComplaint.status === 'Approved' && (
                                                <div className="px-6 pb-5">
                                                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-xs font-semibold text-emerald-700 flex items-center gap-2">
                                                        <CheckCircle2 size={14} /> Student awarded +20 reward points
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* --- FULLSCREEN IMAGE PREVIEW --- */}
            {previewImage && (
                <div 
                    className="fixed inset-0 z-[60] bg-slate-900/95 backdrop-blur-xl flex items-center justify-center p-4 sm:p-10 cursor-zoom-out animate-in fade-in duration-200"
                    onClick={() => setPreviewImage(null)}
                >
                    <button 
                        className="absolute top-6 right-6 p-4 bg-white/10 hover:bg-white/20 rounded-2xl text-white backdrop-blur-md transition-all shadow-lg hover:scale-105"
                        onClick={() => setPreviewImage(null)}
                    >
                        <X size={28} />
                    </button>
                    <img 
                        src={previewImage} 
                        alt="Full Preview" 
                        className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl animate-in zoom-in-95 duration-300 border border-white/10"
                        onClick={(e) => e.stopPropagation()}
                    />
                    <div className="absolute bottom-10 flex gap-4">
                        <button 
                            onClick={(e) => { e.stopPropagation(); window.open(previewImage, '_blank'); }}
                            className="px-8 py-4 bg-white/10 hover:bg-white/20 text-white rounded-2xl backdrop-blur-md font-bold flex items-center gap-3 transition-all border border-white/10 hover:scale-105 shadow-xl"
                        >
                            <ExternalLink size={20} /> Open Original in New Tab
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Complaints;
