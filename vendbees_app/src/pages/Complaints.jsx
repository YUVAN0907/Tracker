import React, { useState, useEffect, useMemo } from 'react';
import Header from '../components/Header';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { 
    MessageSquare, 
    Clock, 
    CheckCircle2, 
    AlertCircle, 
    Search, 
    Filter, 
    Download, 
    ExternalLink, 
    User, 
    Phone, 
    Hash,
    Calendar,
    ChevronRight,
    X,
    Image as ImageIcon
} from 'lucide-react';
import clsx from 'clsx';

const STATUS_COLORS = {
    'Submitted': 'bg-blue-50 text-blue-600 border-blue-100',
    'In Review': 'bg-orange-50 text-orange-600 border-orange-100',
    'Resolved': 'bg-green-50 text-green-600 border-green-100',
    'Refunded': 'bg-purple-50 text-purple-600 border-purple-100',
};

const TYPE_COLORS = {
    'Machine Down': 'bg-red-50 text-red-600 border-red-100',
    'Payment Issue': 'bg-amber-50 text-amber-600 border-amber-100',
    'Product Issue': 'bg-sky-50 text-sky-600 border-sky-100',
    'Suggestion': 'bg-emerald-50 text-emerald-600 border-emerald-100',
};

const ComplaintCard = ({ complaint, onClick }) => {
    const isFeedback = complaint.type === 'Suggestion';
    
    return (
        <div 
            onClick={() => onClick(complaint)}
            className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-all cursor-pointer group"
        >
            <div className="flex justify-between items-start mb-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    {complaint.ticket_id || complaint.feedback_id}
                </span>
                <span className={clsx(
                    "px-2 py-1 rounded-full text-[10px] font-bold border",
                    isFeedback ? TYPE_COLORS['Suggestion'] : STATUS_COLORS[complaint.status] || 'bg-slate-50 text-slate-600'
                )}>
                    {isFeedback ? 'Suggestion' : complaint.status}
                </span>
            </div>
            
            <h3 className="font-bold text-slate-800 mb-1 group-hover:text-orange-600 transition-colors">
                {isFeedback ? 'User Suggestion' : complaint.machine_name}
            </h3>
            
            <div className="flex items-center gap-2 mb-3">
                <span className={clsx(
                    "px-2 py-0.5 rounded text-[10px] font-medium border",
                    TYPE_COLORS[complaint.issue_type] || TYPE_COLORS['Suggestion']
                )}>
                    {complaint.issue_type || 'Suggestion'}
                </span>
                <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Clock size={10} />
                    {new Date(complaint.created_at).toLocaleDateString()}
                </span>
            </div>

            {complaint.attachments && complaint.attachments.length > 0 && (
                <div className="relative h-24 mb-3 rounded-lg overflow-hidden bg-slate-100">
                    <img 
                        src={complaint.attachments[0]} 
                        alt="Proof" 
                        className="w-full h-full object-cover"
                        loading="lazy"
                    />
                    {complaint.attachments.length > 1 && (
                        <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-md backdrop-blur-sm">
                            +{complaint.attachments.length - 1} more
                        </div>
                    )}
                </div>
            )}

            {!complaint.attachments && isFeedback && (
                <div className="h-24 mb-3 rounded-lg bg-emerald-50/50 flex items-center justify-center p-3 text-xs text-emerald-600 italic line-clamp-4">
                    "{complaint.message}"
                </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center">
                        <User size={10} />
                    </div>
                    {complaint.student?.name || 'Anonymous'}
                </div>
                <ChevronRight size={14} className="text-slate-300 group-hover:text-orange-500 transition-colors" />
            </div>
        </div>
    );
};

const Complaints = () => {
    const [tickets, setTickets] = useState([]);
    const [feedbacks, setFeedbacks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedComplaint, setSelectedComplaint] = useState(null);
    const [filterStatus, setFilterStatus] = useState('All');
    const [filterType, setFilterType] = useState('All');
    const [filterDate, setFilterDate] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        const qTickets = query(collection(db, "tickets"), orderBy("created_at", "desc"));
        const qFeedbacks = query(collection(db, "feedbacks"), orderBy("created_at", "desc"));

        const unsubTickets = onSnapshot(qTickets, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, type: 'Ticket' }));
            setTickets(data);
            setLoading(false);
        });

        const unsubFeedbacks = onSnapshot(qFeedbacks, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, type: 'Suggestion', issue_type: 'Suggestion' }));
            setFeedbacks(data);
        });

        return () => {
            unsubTickets();
            unsubFeedbacks();
        };
    }, []);

    const allComplaints = useMemo(() => {
        const combined = [...tickets, ...feedbacks];
        combined.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        return combined;
    }, [tickets, feedbacks]);

    const filteredComplaints = useMemo(() => {
        return allComplaints.filter(c => {
            const matchesStatus = filterStatus === 'All' || c.status === filterStatus || (c.type === 'Suggestion' && filterStatus === 'Resolved');
            const matchesType = filterType === 'All' || c.issue_type === filterType;
            
            const date = new Date(c.created_at);
            const today = new Date();
            const last7Days = new Date(today.getTime() - (7 * 24 * 60 * 60 * 1000));
            const last30Days = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));
            
            let matchesDate = true;
            if (filterDate === 'Today') matchesDate = date.toDateString() === today.toDateString();
            else if (filterDate === 'Last 7 days') matchesDate = date >= last7Days;
            else if (filterDate === 'Last 30 days') matchesDate = date >= last30Days;

            const matchesSearch = !searchQuery || 
                (c.ticket_id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                (c.machine_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                (c.student?.name || '').toLowerCase().includes(searchQuery.toLowerCase());

            return matchesStatus && matchesType && matchesDate && matchesSearch;
        });
    }, [allComplaints, filterStatus, filterType, filterDate, searchQuery]);

    const stats = useMemo(() => ({
        total: allComplaints.length,
        submitted: tickets.filter(t => t.status === 'Submitted').length,
        inReview: tickets.filter(t => t.status === 'In Review').length,
        resolved: tickets.filter(t => t.status === 'Resolved').length + feedbacks.length
    }), [allComplaints, tickets, feedbacks]);

    const handleStatusUpdate = async (ticketId, newStatus) => {
        if (!ticketId) return;
        try {
            const ticketRef = doc(db, "tickets", ticketId);
            await updateDoc(ticketRef, { status: newStatus });
            
            if (selectedComplaint && selectedComplaint.ticket_id === ticketId) {
                setSelectedComplaint(prev => ({ ...prev, status: newStatus }));
            }
        } catch (error) {
            console.error("Error updating status:", error);
        }
    };

    const downloadImage = (url, name) => {
        fetch(url)
            .then(resp => resp.blob())
            .then(blob => {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = name;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
            })
            .catch(() => window.open(url, '_blank'));
    };

    return (
        <div className="space-y-6 pb-10 min-h-screen bg-slate-50/50">
            <Header title="Complaints Management" subtitle="Track and resolve student issues in real-time" />
            
            <div className="px-8 space-y-6">
                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {[
                        { label: 'Total Complaints', value: stats.total, icon: MessageSquare, color: 'text-slate-600', bg: 'bg-slate-100' },
                        { label: 'Submitted', value: stats.submitted, icon: AlertCircle, color: 'text-blue-600', bg: 'bg-blue-100' },
                        { label: 'In Review', value: stats.inReview, icon: Clock, color: 'text-orange-600', bg: 'bg-orange-100' },
                        { label: 'Resolved', value: stats.resolved, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-100' },
                    ].map((stat, i) => (
                        <div key={i} className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
                            <div className="flex justify-between items-start">
                                <div className={clsx("p-2 rounded-lg", stat.bg, stat.color)}>
                                    <stat.icon size={20} />
                                </div>
                            </div>
                            <div className="mt-4">
                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{stat.label}</div>
                                <div className="text-2xl font-bold text-slate-800">{stat.value}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Filters */}
                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-wrap items-center gap-4">
                    <div className="relative flex-1 min-w-[240px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input 
                            type="text" 
                            placeholder="Search by ID, Machine, or Student..."
                            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-orange-500 transition-all font-medium"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <select 
                            className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-orange-500"
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                        >
                            <option value="All">All Statuses</option>
                            <option value="Submitted">Submitted</option>
                            <option value="In Review">In Review</option>
                            <option value="Resolved">Resolved</option>
                            <option value="Refunded">Refunded</option>
                        </select>
                        
                        <select 
                            className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-orange-500"
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value)}
                        >
                            <option value="All">All Types</option>
                            <option value="Machine Down">Machine Down</option>
                            <option value="Product Issue">Product Issue</option>
                            <option value="Payment Issue">Payment Issue</option>
                            <option value="Suggestion">Suggestion</option>
                        </select>

                        <select 
                            className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-orange-500"
                            value={filterDate}
                            onChange={(e) => setFilterDate(e.target.value)}
                        >
                            <option value="All">All Time</option>
                            <option value="Today">Today</option>
                            <option value="Last 7 days">Last 7 days</option>
                            <option value="Last 30 days">Last 30 days</option>
                        </select>
                    </div>
                </div>

                {/* List */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-slate-100 border-dashed">
                        <div className="w-10 h-10 border-4 border-slate-200 border-t-orange-500 rounded-full animate-spin"></div>
                        <p className="mt-4 text-slate-500 font-medium">Loading complaints...</p>
                    </div>
                ) : filteredComplaints.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-slate-100 border-dashed">
                        <div className="p-4 bg-slate-50 rounded-full text-slate-400 mb-4">
                            <Filter size={32} />
                        </div>
                        <h3 className="font-bold text-slate-800">No complaints found</h3>
                        <p className="text-slate-500 text-sm mt-1">Try adjusting your filters or search terms</p>
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

            {/* Detail Modal */}
            {selectedComplaint && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-4 duration-300">
                        {/* Modal Header */}
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                            <div>
                                <div className="flex items-center gap-3 mb-1">
                                    <h2 className="text-xl font-bold text-slate-800">
                                        {selectedComplaint.ticket_id || selectedComplaint.feedback_id}
                                    </h2>
                                    <span className={clsx(
                                        "px-2.5 py-1 rounded-full text-[10px] font-bold border",
                                        selectedComplaint.type === 'Suggestion' ? TYPE_COLORS['Suggestion'] : STATUS_COLORS[selectedComplaint.status]
                                    )}>
                                        {selectedComplaint.type === 'Suggestion' ? 'Suggestion' : selectedComplaint.status}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500 font-medium">{selectedComplaint.type === 'Suggestion' ? 'User Suggestion' : selectedComplaint.machine_name}</p>
                            </div>
                            <button 
                                onClick={() => setSelectedComplaint(null)}
                                className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* Details Column */}
                                <div className="space-y-6">
                                    <section>
                                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Complaint Information</h4>
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
                                                    <AlertCircle size={16} />
                                                </div>
                                                <div>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase">Issue Type</p>
                                                    <p className="text-sm font-bold text-slate-800">{selectedComplaint.issue_type || 'General Suggestion'}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                                                    <Calendar size={16} />
                                                </div>
                                                <div>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase">Timestamp</p>
                                                    <p className="text-sm font-bold text-slate-800">{new Date(selectedComplaint.created_at).toLocaleString()}</p>
                                                </div>
                                            </div>
                                            {selectedComplaint.type === 'Ticket' && (
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                                                        <ImageIcon size={16} />
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] text-slate-400 font-bold uppercase">Machine ID</p>
                                                        <p className="text-sm font-bold text-slate-800">{selectedComplaint.machine_id}</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </section>

                                    <section>
                                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Description</h4>
                                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-sm text-slate-700 leading-relaxed font-medium">
                                            {selectedComplaint.issue_detail || selectedComplaint.message}
                                        </div>
                                    </section>

                                    <section>
                                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Student Context</h4>
                                        <div className="bg-white p-4 rounded-xl border border-slate-100 space-y-3">
                                            <div className="flex items-center gap-3">
                                                <User size={14} className="text-slate-400" />
                                                <span className="text-sm font-bold text-slate-700">{selectedComplaint.student?.name || 'Unknown Student'}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <Phone size={14} className="text-slate-400" />
                                                <span className="text-sm font-medium text-slate-600">{selectedComplaint.student?.phone || 'No phone'}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <Hash size={14} className="text-slate-400" />
                                                <span className="text-sm font-medium text-slate-600">{selectedComplaint.student?.reg_no || 'No Reg No'}</span>
                                            </div>
                                        </div>
                                    </section>
                                </div>

                                {/* Attachments Column */}
                                <div className="space-y-6">
                                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Attachments</h4>
                                    {selectedComplaint.attachments && selectedComplaint.attachments.length > 0 ? (
                                        <div className="grid grid-cols-1 gap-4">
                                            {selectedComplaint.attachments.map((url, i) => (
                                                <div key={i} className="relative group rounded-xl overflow-hidden border border-slate-100 shadow-sm bg-slate-50">
                                                    <img src={url} alt={`Attachment ${i+1}`} className="w-full h-auto object-cover max-h-48" />
                                                    <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                                                        <button 
                                                            onClick={() => window.open(url, '_blank')}
                                                            className="p-2 bg-white/20 hover:bg-white/40 rounded-full text-white backdrop-blur-md transition-all"
                                                            title="View Large"
                                                        >
                                                            <ExternalLink size={20} />
                                                        </button>
                                                        <button 
                                                            onClick={() => downloadImage(url, `complaint_${selectedComplaint.ticket_id}_${i+1}.jpg`)}
                                                            className="p-2 bg-white/20 hover:bg-white/40 rounded-full text-white backdrop-blur-md transition-all"
                                                            title="Download"
                                                        >
                                                            <Download size={20} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="h-40 bg-slate-50 rounded-xl border border-slate-100 border-dashed flex flex-col items-center justify-center text-slate-400 gap-2">
                                            <ImageIcon size={24} />
                                            <span className="text-xs font-medium">No image proof attached</span>
                                        </div>
                                    )}

                                    {selectedComplaint.type === 'Ticket' && (
                                        <section className="pt-6 border-t border-slate-100">
                                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Update Status</h4>
                                            <div className="grid grid-cols-2 gap-2">
                                                {(selectedComplaint.issue_type === 'Payment Issue' ? ['Submitted', 'In Review', 'Refunded'] : ['Submitted', 'In Review', 'Resolved']).map((status) => (
                                                    <button
                                                        key={status}
                                                        onClick={() => handleStatusUpdate(selectedComplaint.ticket_id, status)}
                                                        className={clsx(
                                                            "py-2 rounded-lg text-[10px] font-bold border transition-all",
                                                            selectedComplaint.status === status
                                                                ? STATUS_COLORS[status] + " ring-2 ring-offset-1 ring-orange-100"
                                                                : "bg-white text-slate-500 border-slate-100 hover:border-slate-300"
                                                        )}
                                                    >
                                                        {status}
                                                    </button>
                                                ))}
                                            </div>
                                        </section>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 sticky bottom-0">
                            <button 
                                onClick={() => setSelectedComplaint(null)}
                                className="px-6 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-white hover:shadow-sm border border-transparent transition-all"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Complaints;
