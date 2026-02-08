import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Layout from '../components/Layout';

const Reports = () => {
  const [reports, setReports] = useState([]);
  const [openGroups, setOpenGroups] = useState({});

  const fetchReports = useCallback(async () => {
    try {
      const userInfo = JSON.parse(localStorage.getItem('userInfo'));
      const config = {
        headers: { Authorization: `Bearer ${userInfo.token}` },
      };
      const { data } = await axios.get('http://localhost:5000/api/reports', config);
      setReports(data);
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

  const getTypeColorClass = (type) => {
    switch (type) {
      case 'Medical': return 'text-green-600';
      case 'Fire': return 'text-red-600';
      case 'Earthquake': return 'text-brown-600'; // Tailwind may not have brown; fallback below
      case 'Security': return 'text-yellow-600';
      case 'Accident': return 'text-orange-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <Layout>
      <h1 className="text-3xl font-extrabold tracking-wide text-gray-900 text-center mb-6">EMERGENCY REPORT</h1>
      <div className="space-y-6">
        {reports.map((report) => (
          <div key={report._id} className="bg-white rounded-xl shadow-md transition-transform duration-200 hover:shadow-lg hover:scale-[1.01]">
            <div className="h-8 bg-[#2f4863] rounded-t-xl"></div>
            <div className="p-6 flex justify-between items-start">
              <div>
                <h2 className={`text-2xl font-extrabold mb-2 ${
                  report.type === 'Earthquake' ? 'text-[#795548]' : getTypeColorClass(report.type)
                }`}>
                  {report.type} REPORT
                </h2>
                <p className="text-gray-700">
                  <span className="font-semibold">Reporter:</span>{' '}
                  {report.user.lastName}, {report.user.firstName} ({report.user.role})
                </p>
                <p className="text-gray-700">
                    <span className="font-semibold">Location:</span>{' '}
                    {report.location?.description || 'No description'}
                    {report.location?.latitude && ` (${report.location.latitude}, ${report.location.longitude})`}
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  Reported at: {new Date(report.createdAt).toLocaleString()}
                </p>
                {report.statusHistory && report.statusHistory.length > 0 && (
                  <div className="mt-4">
                    <div className="flex space-x-2">
                      <button
                        className="px-3 py-1 rounded bg-yellow-100 text-yellow-800 text-sm"
                        onClick={() => setOpenGroups({ ...openGroups, [report._id]: openGroups[report._id] === 'ACKNOWLEDGED' ? null : 'ACKNOWLEDGED' })}
                      >
                        Acknowledged
                      </button>
                      <button
                        className="px-3 py-1 rounded bg-blue-100 text-blue-800 text-sm"
                        onClick={() => setOpenGroups({ ...openGroups, [report._id]: openGroups[report._id] === 'RESPONDING' ? null : 'RESPONDING' })}
                      >
                        Responding
                      </button>
                      <button
                        className="px-3 py-1 rounded bg-green-100 text-green-800 text-sm"
                        onClick={() => setOpenGroups({ ...openGroups, [report._id]: openGroups[report._id] === 'RESOLVED' ? null : 'RESOLVED' })}
                      >
                        Resolved
                      </button>
                    </div>
                    {openGroups[report._id] && (
                      <ul className="list-disc list-inside text-sm text-gray-600 mt-2">
                        {report.statusHistory
                          .filter((h) => h.status === openGroups[report._id])
                          .map((history, index) => (
                            <li key={index}>
                              <span className="font-bold">{history.status}</span> by{' '}
                              {history.updatedBy ? `${history.updatedBy.firstName} ${history.updatedBy.lastName} (${history.updatedBy.role})` : 'Unknown'}{' '}
                              at {new Date(history.timestamp).toLocaleString()}
                            </li>
                          ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end space-y-2">
                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(report.status)}`}>
                  {report.status}
                </span>
                <div className="flex space-x-2 mt-2">
                  {report.status === 'REPORTED' && (
                    <button
                      onClick={() => updateStatus(report._id, 'ACKNOWLEDGED')}
                      className="bg-[#2f4863] text-white px-4 py-2 rounded-full text-sm transition-all duration-200 hover:brightness-110 hover:scale-[1.03]"
                    >
                      Acknowledge
                    </button>
                  )}
                  {report.status === 'ACKNOWLEDGED' && (
                    <button
                      onClick={() => updateStatus(report._id, 'RESPONDING')}
                      className="bg-[#2f4863] text-white px-4 py-2 rounded-full text-sm transition-all duration-200 hover:brightness-110 hover:scale-[1.03]"
                    >
                      Responding
                    </button>
                  )}
                  {report.status === 'RESPONDING' && (
                    <button
                      onClick={() => handleResolve(report._id)}
                      className="bg-lime-600 text-white px-4 py-2 rounded-full text-sm transition-all duration-200 hover:brightness-110 hover:scale-[1.03]"
                    >
                      Resolve
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
        {reports.length === 0 && (
          <p className="text-gray-500 text-center">No active emergency reports.</p>
        )}
      </div>
    </Layout>
  );
};

export default Reports;
