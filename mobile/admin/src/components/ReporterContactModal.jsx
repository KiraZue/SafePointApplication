import React, { useState } from 'react';

const ReporterContactModal = ({ isOpen, onClose, reporter, loading }) => {
    const [activeTab, setActiveTab] = useState('personal'); // 'personal' or 'emergency'

    if (!isOpen) return null;

    const renderContent = () => {
        if (loading) {
            return (
                <div className="flex flex-col items-center justify-center p-12">
                    <div className="w-8 h-8 border-4 border-[#2f4863] border-t-transparent rounded-full animate-spin mb-4"></div>
                    <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Fetching reporter details...</p>
                </div>
            );
        }

        if (!reporter) return (
            <div className="p-8 text-center text-gray-400 italic">No reporter data available.</div>
        );

        if (activeTab === 'personal') {
            const pinfo = reporter.personalInfo || {};
            return (
                <div className="space-y-4 animate-in fade-in duration-300">
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Full Name</label>
                        <p className="text-gray-800 font-black text-lg">{reporter.firstName} {reporter.lastName}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Role</label>
                            <p className="text-gray-700 font-bold">{reporter.role}</p>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Phone Number</label>
                            <p className="text-gray-700 font-bold">{pinfo.contactNumber || 'N/A'}</p>
                        </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Academic Info</label>
                        <div className="flex flex-wrap gap-2 mt-1">
                            {pinfo.levelGroup && <span className="px-2 py-1 bg-white rounded-lg border border-gray-200 text-[10px] font-bold text-gray-600 uppercase">{pinfo.levelGroup}</span>}
                            {pinfo.gradeLevel && <span className="px-2 py-1 bg-white rounded-lg border border-gray-200 text-[10px] font-bold text-gray-600 uppercase">{pinfo.gradeLevel}</span>}
                            {pinfo.strandCourse && <span className="px-2 py-1 bg-white rounded-lg border border-gray-200 text-[10px] font-bold text-gray-600 uppercase">{pinfo.strandCourse}</span>}
                            {!pinfo.levelGroup && !pinfo.gradeLevel && !pinfo.strandCourse && <span className="text-gray-400 italic text-xs">No academic data</span>}
                        </div>
                    </div>
                </div>
            );
        } else {
            const econtact = reporter.emergencyContact || {};
            return (
                <div className="space-y-4 animate-in fade-in duration-300">
                    <div className="bg-red-50 p-4 rounded-2xl border border-red-100">
                        <label className="block text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Contact Person</label>
                        <p className="text-red-900 font-black text-lg">{econtact.name || 'N/A'}</p>
                        <p className="text-red-600 text-[10px] font-bold uppercase tracking-widest">{econtact.relation || 'Emergency Contact'}</p>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Phone Number</label>
                        <div className="flex items-center justify-between">
                            <p className="text-gray-700 font-black text-xl tracking-wider">{econtact.number || 'N/A'}</p>
                            {econtact.number && (
                                <a href={`tel:${econtact.number}`} className="bg-[#2f4863] text-white p-2 rounded-full hover:bg-lime-500 transition-colors">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>
                                </a>
                            )}
                        </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Home Address</label>
                        <p className="text-gray-700 font-medium text-sm leading-relaxed">{econtact.address || 'No address provided'}</p>
                    </div>
                </div>
            );
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-black text-gray-900 tracking-tight">REPORTER INFO</h2>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">SafePoint Identity System</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>

                {!loading && reporter && (
                    <div className="flex p-2 bg-gray-50 mx-6 mt-4 rounded-2xl">
                        <button
                            onClick={() => setActiveTab('personal')}
                            className={`flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === 'personal' ? 'bg-white text-[#2f4863] shadow-md' : 'text-gray-400'}`}
                        >
                            Personal
                        </button>
                        <button
                            onClick={() => setActiveTab('emergency')}
                            className={`flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === 'emergency' ? 'bg-white text-red-500 shadow-md' : 'text-gray-400'}`}
                        >
                            Emergency
                        </button>
                    </div>
                )}

                <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
                    {renderContent()}
                </div>

                <div className="p-6 bg-gray-50 flex gap-3">
                    <button
                        onClick={onClose}
                        className="w-full py-4 bg-[#2f4863] text-white font-black uppercase tracking-[0.2em] text-xs rounded-2xl hover:bg-lime-500 hover:text-black transition-all active:scale-95 shadow-lg shadow-[#2f4863]/20"
                    >
                        Close Portal
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ReporterContactModal;
