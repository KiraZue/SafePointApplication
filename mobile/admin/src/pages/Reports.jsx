import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Layout from '../components/Layout';
import ReporterContactModal from '../components/ReporterContactModal';

const StatusModal = ({ isOpen, onClose, title, history }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="bg-[#2f4863] p-6 text-white flex justify-between items-center">
          <h3 className="text-xl font-black uppercase tracking-widest">{title} History</h3>
          <button onClick={onClose} className="hover:rotate-90 transition-transform">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {history && history.length > 0 ? (
            <div className="space-y-4">
              {history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).map((h, i) => (
                <div key={i} className="flex gap-4 items-start border-l-2 border-gray-100 pl-4 py-1">
                  <div className="flex-1">
                    <p className="text-sm font-black text-gray-800">
                      {h.updatedBy ? `${h.updatedBy.firstName} ${h.updatedBy.lastName}` : 'System'}
                      <span className="ml-2 text-[10px] text-[#2f4863] bg-blue-50 px-2 py-0.5 rounded-full uppercase">{h.updatedBy?.role}</span>
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 italic">Approved status to {h.status}</p>
                    <p className="text-[10px] text-gray-400 mt-2 font-bold uppercase tracking-tighter">
                      {new Date(h.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-gray-400 italic py-8 uppercase text-xs font-black">No history found for this status</p>
          )}
        </div>
        <div className="p-4 bg-gray-50 border-t border-gray-100 text-center">
          <button onClick={onClose} className="bg-[#2f4863] text-white px-8 py-2 rounded-full text-xs font-black uppercase tracking-widest shadow-lg hover:brightness-110">Close</button>
        </div>
      </div>
    </div>
  );
};

const Reports = () => {
  const [reports, setReports] = useState([]);
  const [modalDetails, setModalDetails] = useState({ isOpen: false, title: '', history: [] });
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState({
    year: '',
    month: '',
    day: ''
  });
  const [contactModal, setContactModal] = useState({ isOpen: false, reporterId: null, reporterData: null, loading: false });
  const [lastSeenReport, setLastSeenReport] = useState(null);

  useEffect(() => {
    const userInfo = JSON.parse(localStorage.getItem('userInfo'));
    if (userInfo?.lastSeenReport) {
      setLastSeenReport(userInfo.lastSeenReport);
    }
  }, []);

  const updateLastSeen = useCallback(async (latestReportDate) => {
    try {
      const userInfo = JSON.parse(localStorage.getItem('userInfo'));
      if (!userInfo || !latestReportDate) return;

      // Only update if the latest report is actually newer than what we've seen
      if (userInfo.lastSeenReport && new Date(latestReportDate) <= new Date(userInfo.lastSeenReport)) return;

      const config = {
        headers: { Authorization: `Bearer ${userInfo.token}` },
      };

      await axios.put('http://localhost:5000/api/users/profile', {
        lastSeenReport: latestReportDate
      }, config);

      // Update local storage so badges disappear on next refresh/fetch
      userInfo.lastSeenReport = latestReportDate;
      localStorage.setItem('userInfo', JSON.stringify(userInfo));
    } catch (error) {
      console.error('Error updating last seen report:', error);
    }
  }, []);

  const fetchReports = useCallback(async () => {
    try {
      const userInfo = JSON.parse(localStorage.getItem('userInfo'));
      const config = {
        headers: { Authorization: `Bearer ${userInfo.token}` },
      };
      const { data } = await axios.get('http://localhost:5000/api/reports', config);
      setReports(data);

      if (data && Array.isArray(data) && data.length > 0) {
        const newest = data.reduce((prev, current) =>
          (new Date(prev.createdAt) > new Date(current.createdAt)) ? prev : current
        );
        updateLastSeen(newest.createdAt);
      }
    } catch (error) {
      console.error(error);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(fetchReports, 0);
    const interval = setInterval(fetchReports, 5000);
    return () => {
      clearTimeout(t);
      clearInterval(interval);
    };
  }, [fetchReports]);

  const updateStatus = async (id, status) => {
    try {
      const userInfo = JSON.parse(localStorage.getItem('userInfo'));
      const config = {
        headers: { Authorization: `Bearer ${userInfo.token}` },
      };
      await axios.put(
        `http://localhost:5000/api/reports/${id}/status`,
        { status },
        config
      );
      fetchReports();
    } catch {
      alert('Error updating status');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'REPORTED': return 'bg-red-600 text-white';
      case 'ACKNOWLEDGED': return 'bg-yellow-500 text-white';
      case 'RESPONDING': return 'bg-blue-700 text-white';
      case 'RESOLVED': return 'bg-lime-600 text-white';
      default: return 'bg-gray-600 text-white';
    }
  };

  const handleResolve = (id) => {
    if (window.confirm('Are you sure you want to resolve this report?')) {
      updateStatus(id, 'RESOLVED');
    }
  };

  const openContactModal = async (reporterId) => {
    setContactModal({ isOpen: true, reporterId, reporterData: null, loading: true });
    try {
      const userInfo = JSON.parse(localStorage.getItem('userInfo'));
      const config = {
        headers: { Authorization: `Bearer ${userInfo.token}` },
      };
      const { data } = await axios.get(`http://localhost:5000/api/users/profile/${reporterId}`, config);
      setContactModal(prev => ({ ...prev, reporterData: data, loading: false }));
    } catch (error) {
      console.error('Error fetching reporter details:', error);
      setContactModal(prev => ({ ...prev, loading: false }));
    }
  };

  const getTypeColorClass = (type) => {
    switch (type) {
      case 'Medical': return 'text-green-600';
      case 'Fire': return 'text-red-600';
      case 'Earthquake': return 'text-[#795548]';
      case 'Security': return 'text-yellow-600';
      case 'Accident': return 'text-orange-600';
      default: return 'text-gray-600';
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const options = { month: 'long', day: 'numeric' };
    if (date.getFullYear() !== now.getFullYear()) {
      options.year = 'numeric';
    }
    return date.toLocaleDateString('en-US', options).replace(/,/g, '');
  };

  const handleExtract = async (report) => {
    try {
      const userInfo = JSON.parse(localStorage.getItem('userInfo'));
      const response = await axios.get(
        `http://localhost:5000/api/reports/${report._id}/extract`,
        {
          headers: { Authorization: `Bearer ${userInfo.token}` },
          responseType: 'blob'
        }
      );

      const reporterName = report.user ? `${report.user.firstName} ${report.user.lastName}` : 'Unknown Reporter';
      const dateReported = new Date(report.createdAt).toLocaleDateString().replace(/\//g, '-');
      const filename = `${reporterName}-${dateReported} Reports.docx`;

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      if (error.response && error.response.status === 404) {
        alert('Template not found! Please ensure template.docx is in the backend/templates folder.');
      } else {
        alert('Error extracting report. Please try again.');
      }
    }
  };

  const handleExtractBulk = async (filteredResults) => {
    if (filteredResults.length === 0) {
      alert('No reports found to extract.');
      return;
    }

    try {
      // Generate descriptive filename based on filters
      let filterDesc = '';
      if (advancedFilters.month && advancedFilters.day && advancedFilters.year) {
        const monthName = months.find(m => m.val === advancedFilters.month)?.name;
        filterDesc = `${monthName}-${advancedFilters.day}-${advancedFilters.year}`;
      } else if (advancedFilters.month && advancedFilters.year) {
        const monthName = months.find(m => m.val === advancedFilters.month)?.name;
        filterDesc = `${monthName}-${advancedFilters.year}`;
      } else if (advancedFilters.year) {
        filterDesc = `${advancedFilters.year}`;
      } else {
        filterDesc = 'All';
      }

      const filename = `${filterDesc} Reports`;

      const userInfo = JSON.parse(localStorage.getItem('userInfo'));
      const response = await axios.post(
        `http://localhost:5000/api/reports/bulk-extract`,
        {
          ids: filteredResults.map(r => r._id),
          filename: filename
        },
        {
          headers: { Authorization: `Bearer ${userInfo.token}` },
          responseType: 'blob'
        }
      );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${filename}.docx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      alert(`Successfully extracted ${filteredResults.length} reports!`);
    } catch (error) {
      alert('Error extracting reports. Please try again.');
    }
  };

  const generateReportText = (report) => {
    const historyRows = (report.statusHistory || [])
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .map(h => {
        const updater = h.updatedBy ? `${h.updatedBy.firstName} ${h.updatedBy.lastName}` : 'System';
        return `| ${h.status.padEnd(12)} | ${updater.padEnd(20)} | ${new Date(h.timestamp).toLocaleString().padEnd(22)} |`;
      })
      .join('\n');

    const statusLogTable = historyRows
      ? `| Status       | Updated By           | Date & Time            |\n| ------------ | -------------------- | ---------------------- |\n${historyRows}`
      : 'No status history recorded.';

    return `

          SAFEPOINT INCIDENT REPORT
          (Official Documentation)

SafePoint Emergency Monitoring System
Saint Gabriel College


INCIDENT INFORMATION 

Report ID: ${report._id.toUpperCase()}
Date & Time Reported: ${new Date(report.createdAt).toLocaleString()}
Report Type: ${report.type}
Current Status: ${report.status}

--- REPORTER DETAILS ---

Name: ${report.user?.lastName || 'N/A'}, ${report.user?.firstName || 'Unknown'}
Role/Position: ${report.user?.role || 'N/A'}
Location of Incident: ${report.location?.description || 'N/A'}

--- INCIDENT DESCRIPTION ---

A ${report.type.toLowerCase()}-related report was submitted through the SafePoint system.
Initial message provided by the reporter:

> "${report.message || 'No message provided'}"

The report was received and processed by the SafePoint Admin Panel. Appropriate status updates were recorded as part of the emergency response workflow.

--- FINAL RESOLUTION ---

The reported incident has been ${report.status === 'RESOLVED' ? '**successfully resolved**' : 'marked as **' + report.status + '**'}.
All actions taken were logged within the SafePoint system for accountability and record-keeping.

--- STATUS HISTORY / RESPONSE LOG ---

${statusLogTable}

--- DOCUMENT AUTHENTICATION ---

This document was automatically generated by the SafePoint Admin Panel and serves as an official record of the reported incident and response timeline.

Generated On: ${new Date().toLocaleDateString()}
System: SafePoint Emergency Monitoring System

Authorized by:
SafePoint Administration Office

(Signature Line) __________________________
(Date)           __________________________
**************************************************
    `.trim();
  };

  const copyReportToClipboard = (report) => {
    const text = generateReportText(report);
    navigator.clipboard.writeText(text);
    alert('Professional incident report copied to clipboard!');
  };

  const copyAllReportsToClipboard = (filteredResults) => {
    if (filteredResults.length === 0) {
      alert('No reports found to copy.');
      return;
    }

    const compiledText = filteredResults.map(report => generateReportText(report)).join('\n\n\n\n');

    const finalOutput = `
==================================================
        SAFEPOINT BULK REPORTS EXPORT
==================================================
Filter: ${advancedFilters.year || 'Any'}/${advancedFilters.month || 'Any'}/${advancedFilters.day || 'Any'}
Total Reports: ${filteredResults.length}
Generated: ${new Date().toLocaleString()}

${compiledText}

==================================================
          END OF DOCUMENTATION
==================================================
    `.trim();

    navigator.clipboard.writeText(finalOutput);
    alert(`Successfully copied ${filteredResults.length} professional reports to clipboard!`);
  };

  const finalFilteredReports = reports.filter(report => {
    const reportDate = new Date(report.createdAt);
    const rYear = reportDate.getFullYear().toString();
    const rMonth = (reportDate.getMonth() + 1).toString();
    const rDay = reportDate.getDate().toString();

    const matchesYear = !advancedFilters.year || rYear === advancedFilters.year;
    const matchesMonth = !advancedFilters.month || rMonth === advancedFilters.month;
    const matchesDay = !advancedFilters.day || rDay === advancedFilters.day;

    if (!matchesYear || !matchesMonth || !matchesDay) return false;

    const query = searchQuery.toLowerCase();
    const user = report.user || {};
    const fullName = `${user.firstName} ${user.lastName}`.toLowerCase();
    const reverseName = `${user.lastName} ${user.firstName}`.toLowerCase();
    const userCode = (user.userCode || '').toLowerCase();
    const type = (report.type || '').toLowerCase();

    return fullName.includes(query) ||
      reverseName.includes(query) ||
      userCode.includes(query) ||
      type.includes(query);
  });

  const availableYears = [...new Set(reports.map(r => new Date(r.createdAt).getFullYear()))].sort((a, b) => b - a);
  const months = [
    { name: 'January', val: '1' }, { name: 'February', val: '2' }, { name: 'March', val: '3' },
    { name: 'April', val: '4' }, { name: 'May', val: '5' }, { name: 'June', val: '6' },
    { name: 'July', val: '7' }, { name: 'August', val: '8' }, { name: 'September', val: '9' },
    { name: 'October', val: '10' }, { name: 'November', val: '11' }, { name: 'December', val: '12' }
  ];

  return (
    <Layout>
      <h1 className="text-3xl font-extrabold tracking-wide text-gray-900 text-center mb-6">EMERGENCY REPORT</h1>

      <div className="mb-8 max-w-2xl mx-auto flex flex-col gap-4 relative">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Smart Search: Filter by Reporter Name or Code..."
              className="w-full px-6 py-3 rounded-full bg-white shadow-md border border-gray-100 focus:outline-none focus:ring-2 focus:ring-[#2f4863]/30 transition-all pl-12"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>

          <button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className={`p-3 rounded-full shadow-md border transition-all ${isFilterOpen ? 'bg-[#2f4863] text-white border-[#2f4863]' : 'bg-white text-gray-500 border-gray-100 hover:border-gray-300'}`}
            title="Advanced Filters"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
          </button>

          <button
            onClick={() => handleExtractBulk(finalFilteredReports)}
            className="flex items-center gap-2 bg-lime-600 text-white px-5 py-3 rounded-full text-xs font-black uppercase tracking-widest shadow-md hover:brightness-110 active:scale-95 transition-all"
            title="Export all reports currently shown as Word"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            Extract Filtered
          </button>
        </div>

        {isFilterOpen && (
          <div className="absolute top-16 left-0 right-0 bg-white rounded-3xl shadow-2xl border border-gray-100 p-6 animate-in fade-in zoom-in-95 duration-200 z-50">
            <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-50">
              <h4 className="text-xs font-black text-[#2f4863] uppercase tracking-widest">Filter by Period</h4>
              <button
                onClick={() => setAdvancedFilters({ year: '', month: '', day: '' })}
                className="text-[10px] font-black text-red-500 uppercase hover:underline"
              >
                Clear All
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-tighter ml-1">Year</label>
                <select
                  className="w-full bg-gray-50 border-0 rounded-xl px-4 py-2 text-sm font-bold text-gray-700 outline-none ring-1 ring-gray-100 focus:ring-2 focus:ring-[#2f4863]/20"
                  value={advancedFilters.year}
                  onChange={(e) => setAdvancedFilters({ ...advancedFilters, year: e.target.value })}
                >
                  <option value="">Any Year</option>
                  {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-tighter ml-1">Month</label>
                <select
                  className="w-full bg-gray-50 border-0 rounded-xl px-4 py-2 text-sm font-bold text-gray-700 outline-none ring-1 ring-gray-100 focus:ring-2 focus:ring-[#2f4863]/20"
                  value={advancedFilters.month}
                  onChange={(e) => setAdvancedFilters({ ...advancedFilters, month: e.target.value })}
                >
                  <option value="">Any Month</option>
                  {months.map(m => <option key={m.val} value={m.val}>{m.name}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-tighter ml-1">Day</label>
                <select
                  className="w-full bg-gray-50 border-0 rounded-xl px-4 py-2 text-sm font-bold text-gray-700 outline-none ring-1 ring-gray-100 focus:ring-2 focus:ring-[#2f4863]/20"
                  value={advancedFilters.day}
                  onChange={(e) => setAdvancedFilters({ ...advancedFilters, day: e.target.value })}
                >
                  <option value="">Any Day</option>
                  {[...Array(31)].map((_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="max-h-[calc(100vh-14rem)] overflow-y-auto pr-4 custom-scrollbar scroll-smooth">
        <div className="space-y-6 pb-8">
          {finalFilteredReports
            .map((report) => (
              <div key={report._id} className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
                <div className="h-10 bg-[#2f4863] flex items-center justify-between px-6">
                  <span className="text-white/80 text-xs font-bold uppercase tracking-widest">
                    {formatDate(report.createdAt)}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tighter ${getStatusColor(report.status)}`}>
                      {report.status}
                    </span>
                    <button
                      onClick={() => handleExtract(report)}
                      className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white/90 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border border-white/20"
                      title="Extract Professional Word Report"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                      Extract Report
                    </button>
                  </div>
                </div>

                <div className="p-8">
                  <div className="flex justify-between items-start border-b border-gray-50 pb-6 mb-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h2 className={`text-2xl font-black tracking-tight ${getTypeColorClass(report.type)}`}>
                          {report.type.toUpperCase()}
                        </h2>
                        <div className="h-1 w-1 rounded-full bg-gray-300"></div>
                        <p className="text-sm font-bold text-gray-400">#{report._id.slice(-6).toUpperCase()}</p>
                        {lastSeenReport && new Date(report.createdAt) > new Date(lastSeenReport) && (
                          <span className="bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-pulse ml-2 tracking-widest">NEW</span>
                        )}
                      </div>

                      <button
                        onClick={() => report.user?._id && openContactModal(report.user._id)}
                        className="text-gray-800 flex items-center gap-2 hover:bg-gray-50 p-2 -ml-2 rounded-xl transition-all group disabled:cursor-default disabled:hover:bg-transparent"
                        title={report.user ? "View Reporter Contact Details" : "User Not Found"}
                        disabled={!report.user}
                      >
                        <span className="bg-[#2f4863] p-1 rounded-full text-white group-hover:bg-lime-500 transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                        </span>
                        <span className="font-bold group-hover:text-[#2f4863]">
                          {report.user ? `${report.user.lastName}, ${report.user.firstName}` : 'Unknown Reporter'}
                        </span>
                        {report.user?.role && (
                          <span className="text-xs px-2 py-0.5 bg-lime-100 text-lime-700 rounded-full font-bold uppercase">{report.user.role}</span>
                        )}
                      </button>

                      <p className="text-gray-600 mt-2 flex items-center gap-2">
                        <span className="bg-gray-100 p-1 rounded">
                          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                        </span>
                        <span className="text-sm font-medium">{report.location?.description || 'Location not provided'}</span>
                      </p>
                    </div>

                    {report.message && (
                      <div className="flex-1 flex flex-col items-center justify-center px-4 group transition-colors">
                        <span className="text-[9px] font-black text-gray-300 uppercase tracking-[0.2em] mb-1 group-hover:text-lime-400">Message</span>
                        <p className="text-sm text-center font-bold italic text-gray-800 leading-snug max-w-[250px]">
                          "{report.message}"
                        </p>
                      </div>
                    )}

                    <div className="flex flex-col items-end gap-3">
                      <div className="flex gap-2">
                        {report.status === 'REPORTED' && (
                          <button onClick={() => updateStatus(report._id, 'ACKNOWLEDGED')} className="bg-[#2f4863] text-white px-6 py-2 rounded-xl text-sm font-bold shadow-md hover:brightness-125 transition-all active:scale-95">Acknowledge</button>
                        )}
                        {report.status === 'ACKNOWLEDGED' && (
                          <button onClick={() => updateStatus(report._id, 'RESPONDING')} className="bg-[#2f4863] text-white px-6 py-2 rounded-xl text-sm font-bold shadow-md hover:brightness-125 transition-all active:scale-95">Set Responding</button>
                        )}
                        {report.status === 'RESPONDING' && (
                          <button onClick={() => handleResolve(report._id)} className="bg-lime-600 text-white px-6 py-2 rounded-xl text-sm font-bold shadow-md hover:brightness-110 transition-all active:scale-95">Mark Resolved</button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {['ACKNOWLEDGED', 'RESPONDING', 'RESOLVED'].map((status) => {
                      const history = report.statusHistory?.filter(h => h.status === status) || [];
                      const historyCount = history.length;
                      const lastUpdater = historyCount > 0 ? history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0].updatedBy : null;

                      return (
                        <div key={status} className="relative">
                          <button
                            className="w-full flex items-center justify-between px-4 py-3 rounded-xl border bg-white border-gray-100 hover:border-gray-300 transition-all hover:shadow-sm"
                            onClick={() => setModalDetails({ isOpen: true, title: status, history: history })}
                          >
                            <div className="flex-1 text-left">
                              <div className="flex items-center gap-3 mb-1">
                                <span className={`w-2 h-2 rounded-full ${status === 'ACKNOWLEDGED' ? 'bg-yellow-400' :
                                  status === 'RESPONDING' ? 'bg-blue-500' : 'bg-lime-500'
                                  }`}></span>
                                <span className="text-xs font-black text-gray-500 uppercase tracking-tighter">{status}</span>
                              </div>

                              {status === 'RESOLVED' && lastUpdater ? (
                                <p className="text-[10px] font-bold text-lime-600 tracking-tight pl-5">
                                  Resolved by {lastUpdater.firstName} {lastUpdater.lastName}
                                </p>
                              ) : historyCount > 0 ? (
                                <p className="text-[9px] text-gray-400 font-medium pl-5 tracking-tight">View {historyCount} update{historyCount > 1 ? 's' : ''}</p>
                              ) : (
                                <p className="text-[9px] text-gray-300 italic pl-5 tracking-tight">No activity</p>
                              )}
                            </div>

                            {historyCount > 0 && (
                              <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7"></path></svg>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          {finalFilteredReports.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 bg-white/50 rounded-3xl border-2 border-dashed border-gray-200">
              <div className="bg-gray-100 p-4 rounded-full mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 9.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              </div>
              <h3 className="text-gray-900 font-black uppercase tracking-widest text-sm mb-1">No Reports Found</h3>
              <p className="text-gray-500 text-xs font-bold uppercase tracking-tighter">Adjust your filters or search query</p>
            </div>
          )}
        </div>
      </div>

      <StatusModal
        isOpen={modalDetails.isOpen}
        onClose={() => setModalDetails({ ...modalDetails, isOpen: false })}
        title={modalDetails.title}
        history={modalDetails.history}
      />

      <ReporterContactModal
        isOpen={contactModal.isOpen}
        onClose={() => setContactModal({ ...contactModal, isOpen: false })}
        reporter={contactModal.reporterData}
        loading={contactModal.loading}
      />
    </Layout>
  );
};

export default Reports;
