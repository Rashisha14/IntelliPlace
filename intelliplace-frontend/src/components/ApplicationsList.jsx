import { useState, useEffect } from 'react';
import { FileCheck, Download, Mail, Phone, ChevronDown, ChevronUp, User, FileDown, Sparkles, XCircle, Code, ClipboardList } from 'lucide-react';
import * as XLSX from 'xlsx';
import Swal from 'sweetalert2';
import { API_BASE_URL } from '../config.js';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend
} from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

const ApplicationsList = ({ jobId, onClose, initialJobStatus }) => {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);
  const [jobStatus, setJobStatus] = useState(initialJobStatus || 'OPEN');
  const [confirming, setConfirming] = useState(false);
  const [previewCV, setPreviewCV] = useState(null);
  const [expandedApp, setExpandedApp] = useState(null);
  const [codingSubmissions, setCodingSubmissions] = useState({});
  const [aptitudeSubmissions, setAptitudeSubmissions] = useState({});
  const [viewingCodeFor, setViewingCodeFor] = useState(null);
  const [atsLoading, setAtsLoading] = useState(false);
  const [atsProgress, setAtsProgress] = useState(null);
  const [closeLoading, setCloseLoading] = useState(false);
  const [shortlistAllLoading, setShortlistAllLoading] = useState(false);

  // Fetch applications for a job
  const fetchApplications = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/jobs/${jobId}/applicants`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      const json = await res.json();
      if (res.ok) {
        setApplications(json.data.applications || []);
      } else {
        setError(json.message || 'Failed to fetch applications');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (jobId) fetchApplications();
  }, [jobId]);

  // Auto-fetch submissions when user expands an application
  useEffect(() => {
    if (!expandedApp || !jobId || applications.length === 0) return;
    const app = applications.find(a => a.id === expandedApp);
    if (app?.student?.id) {
      fetchCodingSubmissions(app);
      fetchAptitudeSubmissions(app);
    }
  }, [expandedApp, jobId, applications]);

  const fetchAptitudeSubmissions = async (app) => {
    if (!app?.student?.id) return;
    if (aptitudeSubmissions[app.id]?.fetched) return;
    setAptitudeSubmissions(prev => ({ ...prev, [app.id]: { loading: true } }));
    try {
      const res = await fetch(
        `${API_BASE_URL}/jobs/${jobId}/aptitude-test/submissions/${app.student.id}`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      const json = await res.json();
      if (res.ok && json.success) {
        setAptitudeSubmissions(prev => ({
          ...prev,
          [app.id]: { fetched: true, loading: false, submission: json.data?.submission || null }
        }));
      } else {
        setAptitudeSubmissions(prev => ({
          ...prev,
          [app.id]: { fetched: true, loading: false, submission: null, error: json.message || 'Failed to load' }
        }));
      }
    } catch (err) {
      console.error('Failed to fetch aptitude submission:', err);
      setAptitudeSubmissions(prev => ({
        ...prev,
        [app.id]: { fetched: true, loading: false, submission: null, error: err.message }
      }));
    }
  };

  const fetchCodingSubmissions = async (app) => {
    if (!app?.student?.id) return;
    if (codingSubmissions[app.id]?.submissions) return;
    setCodingSubmissions(prev => ({ ...prev, [app.id]: { ...prev[app.id], loading: true } }));
    try {
      const res = await fetch(
        `${API_BASE_URL}/jobs/${jobId}/coding-test/submissions/${app.student.id}`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      const json = await res.json();
      if (res.ok && json.success) {
        setCodingSubmissions(prev => ({
          ...prev,
          [app.id]: { loading: false, submissions: json.data?.submissions || [] }
        }));
      } else {
        setCodingSubmissions(prev => ({
          ...prev,
          [app.id]: { loading: false, submissions: [], error: json.message || 'Failed to load' }
        }));
      }
    } catch (err) {
      console.error('Failed to fetch coding submissions:', err);
      setCodingSubmissions(prev => ({
        ...prev,
        [app.id]: { loading: false, submissions: [], error: err.message }
      }));
    }
  };

  const downloadCV = (application) => {
    if (!application.cvUrl) {
      alert('No CV available for this applicant');
      return;
    }

    const cvUrl = application.cvUrl;
    const lower = cvUrl.toLowerCase();
    const isPDF = lower.includes('.pdf') || lower.startsWith('https://') || lower.startsWith('http://');

    
    if (isPDF) {
      setPreviewCV({
        url: cvUrl,
        name: `${application.student?.name || 'Applicant'}'s CV`,
        studentName: application.student?.name || 'Applicant',
      });
    } else {

      window.open(cvUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const exportToExcel = () => {
    if (applications.length === 0) {
      alert('No applications to export');
      return;
    }

    const exportData = applications.map((app, index) => {
      return {
        'S.No': index + 1,
        'Name': app.student?.name || 'N/A',
        'Roll Number': app.student?.rollNumber || 'N/A',
        'Email': app.student?.email || 'N/A',
        'Phone': app.student?.phone || 'N/A',
        'CGPA': app.cgpa || 'N/A',
       // 'CGPA (Profile)': app.student?.cgpa || 'N/A',
         'Backlog (Application)': app.backlog !== null ? app.backlog : 'N/A',
         'Backlog (Profile)': app.student?.backlog != null ? app.student.backlog : 'N/A',
         //'Status': app.status || 'N/A',
         'Applied Date': new Date(app.createdAt).toLocaleString(),
         'CV Available': app.cvUrl ? 'Yes' : 'No',
       };
     });

     const worksheet = XLSX.utils.json_to_sheet(exportData);
     const workbook = XLSX.utils.book_new();
     XLSX.utils.book_append_sheet(workbook, worksheet, 'Applications');

     const fileName = `Applications_${new Date().toISOString().split('T')[0]}.xlsx`;
     XLSX.writeFile(workbook, fileName);
   };

  const handleCloseApplication = async () => {
    // Show confirmation dialog
    const result = await Swal.fire({
      title: 'Close Applications?',
      html: `
        <div class="text-left">
          <p class="mb-3">You are about to close applications for this job.</p>
          <p class="text-sm text-gray-600 mb-2">This will:</p>
          <ul class="text-sm text-gray-600 list-disc list-inside space-y-1 mb-3">
            <li>Prevent new applications from being submitted</li>
            <li>Keep existing applications unchanged</li>
          </ul>
          <p class="text-sm font-semibold text-gray-800">You can still manage existing applications.</p>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, Close Applications',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280',
      reverseButtons: true,
      focusConfirm: false,
      allowOutsideClick: false,
    });

    if (!result.isConfirmed) return;

    setCloseLoading(true);
    setActionMessage(null);
    
    // Show loading state
    Swal.fire({
      title: 'Closing...',
      text: 'Please wait',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });
    
    try {
      const res = await fetch(
        `${API_BASE_URL}/jobs/${jobId}/close`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );
      
      const json = await res.json();
      if (res.ok) {
        setJobStatus('CLOSED');
        await fetchApplications();
        
        Swal.fire({
          icon: 'success',
          title: 'Applications Closed',
          text: json.message || 'Applications have been closed successfully',
          confirmButtonColor: '#2563eb',
        });
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Failed to Close',
          text: json.message || 'Failed to close applications',
          confirmButtonColor: '#2563eb',
        });
      }
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message || 'An error occurred',
        confirmButtonColor: '#2563eb',
      });
    } finally {
      setCloseLoading(false);
      setConfirmClose(false);
    }
  };

  const handleShortlistAll = async () => {
    // Show confirmation dialog
    const result = await Swal.fire({
      title: 'Shortlist All Applicants?',
      html: `
        <div class="text-left">
          <p class="mb-3">You are about to shortlist <strong>all ${applications.length} applicants</strong> for this job.</p>
          <p class="text-sm text-gray-600 mb-2">This will:</p>
          <ul class="text-sm text-gray-600 list-disc list-inside space-y-1 mb-3">
            <li>Mark all applicants as <strong>SHORTLISTED</strong></li>
            <li>Close the job for new applications</li>
            <li>Send notifications to all shortlisted students</li>
          </ul>
          <p class="text-sm font-semibold text-gray-800">This action cannot be undone.</p>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, Shortlist All',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#2563eb',
      cancelButtonColor: '#6b7280',
      reverseButtons: true,
      focusConfirm: false,
      allowOutsideClick: false,
    });

    if (!result.isConfirmed) {
      return;
    }

    setShortlistAllLoading(true);
    setActionMessage(null);
    
    // Show loading state
    Swal.fire({
      title: 'Shortlisting...',
      text: `Processing ${applications.length} applicants`,
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    try {
      const res = await fetch(`${API_BASE_URL}/jobs/${jobId}/shortlist-all`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      const json = await res.json();
      
      if (res.ok) {
        await fetchApplications();
        setJobStatus('CLOSED');
        setConfirmShortlistAll(false);
        
        Swal.fire({
          icon: 'success',
          title: 'Shortlisting Complete!',
          html: `
            <p class="mb-2">Successfully shortlisted <strong>${json.data?.shortlisted || 0} applicants</strong>.</p>
            <p class="text-sm text-gray-600">All students have been notified and can proceed to the next round.</p>
          `,
          confirmButtonColor: '#2563eb',
        });
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Shortlisting Failed',
          text: json.message || 'Failed to shortlist all applicants',
          confirmButtonColor: '#2563eb',
        });
      }
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message || 'An error occurred while shortlisting',
        confirmButtonColor: '#2563eb',
      });
    } finally {
      setShortlistAllLoading(false);
    }
  };

  const handleAtsShortlist = async () => {
    if (applications.length === 0) {
      alert('No applications to shortlist');
      return;
    }

    if (!window.confirm(`This will evaluate all ${applications.length} applications using AI resume analysis. Continue?`)) {
      return;
    }

    setAtsLoading(true);
    setActionMessage(null);
    setAtsProgress('Initializing AI shortlisting...');
    
    console.log('🚀 Starting ATS shortlisting for', applications.length, 'applications');
    
    try {
      const startTime = Date.now();
      setAtsProgress(`Connecting to AI service...`);
      
      const res = await fetch(
        `${API_BASE_URL}/jobs/${jobId}/shortlist-ats`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      const json = await res.json();
      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
      
      if (res.ok) {
        console.log('✅ ATS shortlisting completed:', json.data);
        setAtsProgress(null);
        
        const { processed, shortlisted, review, rejected } = json.data || {};
        let message = json.message || 'AI shortlisting complete';
        
        if (processed === 0 && review > 0) {
          message += '\n⚠️ No applications were processed by AI. Check backend console for details.';
          message += '\nCommon issues: CV not available, CV download failed, or CV format not supported.';
        }
        
        setActionMessage({
          type: processed > 0 ? 'success' : 'error',
          text: `${message} (Completed in ${elapsedTime}s)`,
        });
        await fetchApplications();
        setJobStatus('CLOSED');
      } else {
        console.error('❌ ATS shortlisting failed:', json);
        setAtsProgress(null);
        setActionMessage({
          type: 'error',
          text: json.message || 'AI shortlisting failed. Check console for details.',
        });
      }
    } catch (err) {
      console.error('❌ Error during ATS shortlisting:', err);
      setAtsProgress(null);
      setActionMessage({ 
        type: 'error', 
        text: `Connection error: ${err.message}. Make sure the ATS service is running on http://localhost:8000` 
      });
    } finally {
      setAtsLoading(false);
    }
  };

  const totalApplicants = applications.length;
  const statusCounts = applications.reduce((acc, app) => {
    const status = app.status ? app.status.toUpperCase() : 'UNKNOWN';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  const getStatusColor = (status) => {
    const s = status ? status.toUpperCase() : 'UNKNOWN';
    switch (s) {
      case 'PENDING': return '#FACC15'; // yellow-400
      case 'REVIEWING': return '#60A5FA'; // blue-400
      case 'SHORTLISTED': return '#22C55E'; // green-500
      case 'APP PASS':
      case 'PASSED APTITUDE':
      case 'APTITUDE_PASSED': return '#4ADE80'; // green-400 (light green)
      case 'APP FAIL':
      case 'FAILED APTITUDE':
      case 'APTITUDE_FAILED': return '#FCA5A5'; // red-300 (light red)
      case 'CODE PASS':
      case 'PASSED CODING':
      case 'CODING_PASSED': return '#22C55E'; // green-500
      case 'CODE FAIL':
      case 'FAILED CODING':
      case 'CODING_FAILED': return '#EF4444'; // red-500 (medium red)
      case 'INTERVIEW FAIL':
      case 'FAILED INTERVIEW': return '#DC2626'; // red-600
      case 'SELECTED': 
      case 'HIRED': 
      case 'OFFERED': return '#16A34A'; // green-600
      case 'REJECTED': return '#DC2626'; // red-600
      default: return '#9CA3AF'; // gray-400
    }
  };

  const getStatusBadgeClasses = (status) => {
    const s = status ? status.toUpperCase() : 'UNKNOWN';
    switch (s) {
      case 'PENDING': return 'bg-yellow-100 text-yellow-800 border border-yellow-200 bg-opacity-70';
      case 'REVIEWING': return 'bg-blue-100 text-blue-800 border border-blue-200';
      case 'SHORTLISTED': return 'bg-green-100 text-green-800 border border-green-200';
      case 'APP PASS':
      case 'PASSED APTITUDE':
      case 'APTITUDE_PASSED': return 'bg-green-100 text-green-800 border border-green-200';
      case 'APP FAIL':
      case 'FAILED APTITUDE':
      case 'APTITUDE_FAILED': return 'bg-red-50 text-red-600 border border-red-200';
      case 'CODE PASS':
      case 'PASSED CODING':
      case 'CODING_PASSED': return 'bg-green-100 text-green-800 border border-green-200';
      case 'CODE FAIL':
      case 'FAILED CODING':
      case 'CODING_FAILED': return 'bg-red-100 text-red-700 border border-red-300';
      case 'INTERVIEW FAIL':
      case 'FAILED INTERVIEW': return 'bg-red-100 text-red-800 border border-red-400';
      case 'SELECTED': 
      case 'HIRED': 
      case 'OFFERED': return 'bg-green-100 text-green-800 border border-green-200';
      case 'REJECTED': return 'bg-red-100 text-red-800 border border-red-400';
      default: return 'bg-gray-100 text-gray-800 border border-gray-200';
    }
  };

  const chartData = {
    labels: Object.keys(statusCounts),
    datasets: [
      {
        data: Object.values(statusCounts),
        backgroundColor: Object.keys(statusCounts).map(getStatusColor),
        borderWidth: 1,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: { boxWidth: 12, font: { size: 11 } }
      },
    },
  };

  const modalContent = (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4"
      style={{ zIndex: 99999 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-gray-200">
        <div className="p-6 border-b border-gray-200 flex-shrink-0">
          <div className="flex justify-between items-center gap-4">
            <h2 className="text-2xl font-semibold text-gray-800">Applications</h2>
            <div className="ml-auto flex items-center gap-3">
              {applications.length > 0 && (
                <>
                  <button
                    onClick={exportToExcel}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                    title="Export to Excel"
                  >
                    <FileDown className="w-4 h-4" />
                    Export Excel
                  </button>
                  {jobStatus === 'OPEN' && (
                    <button
                      onClick={handleAtsShortlist}
                      disabled={atsLoading}
                      className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Shortlist using AI Resume Analysis"
                    >
                      <Sparkles className="w-4 h-4" />
                      {atsLoading ? (atsProgress || 'Processing...') : 'Shortlist using Resume'}
                    </button>
                  )}
                  {jobStatus === 'OPEN' && (
                    <button
                      onClick={handleShortlistAll}
                      disabled={shortlistAllLoading}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Shortlist All Applicants (No Resume Required)"
                    >
                      <User className="w-4 h-4" />
                      {shortlistAllLoading ? 'Shortlisting...' : 'Shortlist All'}
                    </button>
                  )}
                  {jobStatus === 'OPEN' && (
                <button
                      onClick={handleCloseApplication}
                      disabled={closeLoading}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Manually Close Applications"
                    >
                      <XCircle className="w-4 h-4" />
                      {closeLoading ? 'Closing...' : 'Close Applications'}
                </button>
                  )}
                </>
              )}
              {confirming && jobStatus === 'OPEN' && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-700">Are you sure?</span>
                  <button
                    onClick={async () => {
                      setActionLoading(true);
                      setActionMessage(null);
                      try {
                        const res = await fetch(
                          `${API_BASE_URL}/jobs/${jobId}/shortlist`,
                          {
                            method: 'POST',
                            headers: {
                              Authorization: `Bearer ${localStorage.getItem('token')}`,
                            },
                          }
                        );
                        const json = await res.json();
                        if (res.ok) {
                          setActionMessage({
                            type: 'success',
                            text: json.message || 'Shortlisting complete',
                          });
                          await fetchApplications();
                          setJobStatus('CLOSED');
                        } else {
                          setActionMessage({
                            type: 'error',
                            text: json.message || 'Shortlisting failed',
                          });
                        }
                      } catch (err) {
                        setActionMessage({ type: 'error', text: err.message });
                      } finally {
                        setActionLoading(false);
                        setConfirming(false);
                      }
                    }}
                    className="btn btn-primary"
                    disabled={actionLoading}
                  >
                    {actionLoading ? 'Processing...' : 'Confirm'}
                  </button>
                  <button
                    onClick={() => setConfirming(false)}
                    className="btn btn-ghost"
                    disabled={actionLoading}
                  >
                    Cancel
                  </button>
                </div>
              )}
              <button 
                onClick={onClose} 
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg text-2xl font-bold leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1 min-h-[200px] bg-gray-50">
          {atsProgress && (
            <div className="p-3 mb-4 rounded bg-blue-50 text-blue-800 border border-blue-200">
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-800"></div>
                <span className="font-medium">{atsProgress}</span>
              </div>
              <p className="text-sm mt-1 text-blue-600">This may take a few moments. Check browser console for detailed progress.</p>
            </div>
          )}
          {actionMessage && (
            <div
              className={`p-3 mb-4 rounded ${
                actionMessage.type === 'success'
                  ? 'bg-green-50 text-green-800'
                  : 'bg-red-50 text-red-800'
              }`}
            >
              {actionMessage.text}
            </div>
          )}

          {loading ? (
            <div className="text-center py-16">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4" />
              <p className="text-gray-700 font-medium">Loading applications...</p>
            </div>
          ) : error ? (
            <div className="text-center py-16 bg-red-50 rounded-lg border border-red-200">
              <p className="text-red-700 font-medium">{error}</p>
              <p className="text-sm text-gray-600 mt-2">Check that the backend is running and you are logged in.</p>
            </div>
          ) : applications.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
              <FileCheck className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-700 font-medium">No applications yet</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Analytics Summary */}
              <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm flex flex-col md:flex-row gap-8 items-center justify-between">
                <div className="flex-1 w-full">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-indigo-500" />
                    Application Summary
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 shadow-sm">
                      <p className="text-sm text-indigo-600 font-semibold uppercase tracking-wider">Total Applied</p>
                      <p className="text-3xl font-bold text-indigo-900 mt-1">{totalApplicants}</p>
                    </div>
                    {Object.entries(statusCounts).map(([status, count]) => (
                      <div key={status} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                        <p className="text-sm text-gray-500 font-semibold uppercase tracking-wider">{status}</p>
                        <p className="text-2xl font-bold text-gray-800 mt-1">{count}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="w-48 h-48 flex-shrink-0 relative">
                  <Doughnut data={chartData} options={chartOptions} />
                </div>
              </div>

              <div className="space-y-2">
              {applications.map((app, index) => {
                const isExpanded = expandedApp === app.id;
                const displayCgpa = app.cgpa || app.student?.cgpa || 'N/A';
                const displayBacklog = app.backlog !== null ? app.backlog : (app.student?.backlog != null ? app.student.backlog : 'N/A');
                
                return (
                  <div key={app.id} className="border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                    <div
                      onClick={() => setExpandedApp(isExpanded ? null : app.id)}
                      className="bg-white p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                          <span className="text-red-600 font-semibold text-lg">{index + 1}</span>
                        </div>
                        <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-4 items-center">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-gray-400" />
                            <div>
                              <p className="font-semibold text-gray-800">{app.student?.name || 'Unknown'}</p>
                              {app.student?.rollNumber && (
                                <p className="text-xs text-gray-500">Roll: {app.student.rollNumber}</p>
                              )}
                            </div>
                          </div>
                          <div className="hidden md:block">
                            <p className="text-xs text-gray-500">Email</p>
                            <p className="text-sm text-gray-700 truncate">{app.student?.email || '—'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">CGPA</p>
                            <p className="text-sm font-medium text-gray-800">{displayCgpa}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Backlog</p>
                            <p className="text-sm font-medium text-gray-800">{displayBacklog}</p>
                          </div>
                          <div className="flex items-center justify-between">
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getStatusBadgeClasses(app.status)}`}
                            >
                              {app.status}
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="w-5 h-5 text-gray-400" />
                            ) : (
                              <ChevronDown className="w-5 h-5 text-gray-400" />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t bg-gray-50 p-6">
                        <div className="grid md:grid-cols-2 gap-6">
                    <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-3">Contact Information</h4>
                            <div className="space-y-2">
                        <p className="text-sm text-gray-600 flex items-center gap-2">
                          <Mail className="w-4 h-4" />
                          <a
                            href={`mailto:${app.student?.email || ''}`}
                            className="hover:text-red-600"
                          >
                            {app.student?.email || '—'}
                          </a>
                        </p>
                        {app.student?.phone && (
                          <p className="text-sm text-gray-600 flex items-center gap-2">
                            <Phone className="w-4 h-4" />
                            <a
                              href={`tel:${app.student?.phone}`}
                              className="hover:text-red-600"
                            >
                              {app.student?.phone}
                            </a>
                          </p>
                        )}
                              {app.student?.rollNumber && (
                                <p className="text-sm text-gray-600">
                                  <span className="font-medium">Roll Number:</span> {app.student.rollNumber}
                                </p>
                              )}
                            </div>
                      </div>

                          <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-3">Application Details</h4>
                            <div className="space-y-2">
                        <div>
                                <p className="text-xs text-gray-500">CGPA</p>
                          <div className="flex items-baseline gap-2">
                                  <p className="text-sm font-medium text-gray-800">
                                    {displayCgpa}
                            </p>
                            {app.cgpa !== app.student?.cgpa && app.student?.cgpa && (
                              <span className="text-xs text-gray-500">
                                (Profile: {app.student.cgpa})
                              </span>
                            )}
                          </div>
                        </div>
                        <div>
                                <p className="text-xs text-gray-500">Backlog</p>
                          <div className="flex items-baseline gap-2">
                                  <p className="text-sm font-medium text-gray-800">
                                    {displayBacklog}
                            </p>
                            {app.backlog !== app.student?.backlog &&
                              app.student?.backlog != null && (
                                <span className="text-xs text-gray-500">
                                  (Profile: {app.student.backlog})
                                </span>
                              )}
                          </div>
                        </div>
                              {app.skills && (
                                <div>
                                  <p className="text-xs text-gray-500">Skills</p>
                                  <p className="text-sm text-gray-800">{app.skills}</p>
                      </div>
                              )}
                            <div>
                                <p className="text-xs text-gray-500">Applied On</p>
                                <p className="text-sm text-gray-800">
                                  {new Date(app.createdAt).toLocaleString()}
                              </p>
                            </div>
                            </div>
                            </div>
                          </div>

                          {/* Aptitude Test Submission - for applicants who took the test */}
                          <div className="mt-4 pt-4 border-t">
                            <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                              <ClipboardList className="w-4 h-4" />
                              Aptitude Test Results
                            </h4>
                            {aptitudeSubmissions[app.id]?.loading ? (
                              <p className="text-sm text-gray-500">Loading...</p>
                            ) : aptitudeSubmissions[app.id]?.submission ? (
                              <div className="border rounded-lg p-4 bg-white shadow-sm mt-3">
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <span className="font-semibold text-gray-800">Overall Score</span>
                                  <span className={`text-xs font-bold px-2 py-1 rounded shrink-0 ${
                                    aptitudeSubmissions[app.id].submission.status === 'PASSED' ? 'bg-green-100 text-green-800' : 
                                    aptitudeSubmissions[app.id].submission.status === 'FAILED' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
                                  }`}>
                                    {aptitudeSubmissions[app.id].submission.status || 'SUBMITTED'}
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-4 mt-2">
                                  <div className="text-center">
                                    <div className="text-2xl font-bold text-gray-800">{aptitudeSubmissions[app.id].submission.score ?? '-'}</div>
                                    <div className="text-xs text-gray-500">Score</div>
                                  </div>
                                  <div className="text-center">
                                    <div className="text-2xl font-bold text-gray-800">{aptitudeSubmissions[app.id].submission.percentage?.toFixed(1) ?? '-'}%</div>
                                    <div className="text-xs text-gray-500">Percentage</div>
                                  </div>
                                </div>
                                <div className="mt-4 text-xs text-gray-500">
                                  Submitted: {new Date(aptitudeSubmissions[app.id].submission.submittedAt || aptitudeSubmissions[app.id].submission.createdAt).toLocaleString()}
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm text-gray-500 mt-2">
                                {aptitudeSubmissions[app.id]?.error || 'No aptitude test taken'}
                              </p>
                            )}
                          </div>

                          {/* Coding Test Submissions - for applicants who took the test */}
                          <div className="mt-4 pt-4 border-t">
                              <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                <Code className="w-4 h-4" />
                                Coding Test Submissions
                              </h4>
                              <button
                                onClick={(e) => { e.stopPropagation(); fetchCodingSubmissions(app); }}
                                disabled={codingSubmissions[app.id]?.loading}
                                className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                              >
                                {codingSubmissions[app.id]?.loading ? 'Loading...' : 'View Submitted Code'}
                              </button>
                              {codingSubmissions[app.id]?.submissions && codingSubmissions[app.id].submissions.length > 0 && (
                                <div className="mt-3 space-y-3">
                                  {codingSubmissions[app.id].submissions.map((sub) => {
                                    const passedCount = sub.testCaseResults?.filter(r => r.passed).length ?? 0;
                                    const totalCount = sub.testCaseResults?.length ?? 0;
                                    return (
                                      <div key={sub.id} className="border rounded-lg p-4 bg-white shadow-sm">
                                        <div className="flex items-start justify-between gap-2 mb-2">
                                          <span className="font-semibold text-gray-800">{sub.questionTitle}</span>
                                          <span className={`text-xs px-2 py-1 rounded shrink-0 ${
                                            sub.status === 'ACCEPTED' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                                          }`}>
                                            {totalCount > 0 ? `${passedCount}/${totalCount} passed` : sub.status}
                                          </span>
                                        </div>
                                        <div className="flex flex-wrap gap-3 text-xs text-gray-600 mb-2">
                                          <span>Language: <strong>{sub.languageName || 'N/A'}</strong></span>
                                          {sub.score != null && <span>Score: <strong>{sub.score?.toFixed(1)}{sub.questionPoints != null ? `/${sub.questionPoints}` : ''} pts</strong></span>}
                                          {sub.executionTime != null && <span>Time: <strong>{sub.executionTime?.toFixed(2)}s</strong></span>}
                                          {sub.memoryUsed != null && <span>Memory: <strong>{(sub.memoryUsed / 1024).toFixed(1)} KB</strong></span>}
                                          <span>Submitted: <strong>{new Date(sub.createdAt).toLocaleString()}</strong></span>
                                        </div>
                                        {sub.errorMessage && (
                                          <div className="mb-2 p-2 bg-red-50 text-red-700 text-xs rounded">
                                            Error: {sub.errorMessage}
                                          </div>
                                        )}
                                        {sub.testCaseResults && sub.testCaseResults.length > 0 && (
                                          <div className="mb-2">
                                            <p className="text-xs font-medium text-gray-600 mb-1">Test case results:</p>
                                            <div className="space-y-1 max-h-24 overflow-y-auto">
                                              {sub.testCaseResults.map((tc, i) => (
                                                <div key={i} className={`text-xs p-1.5 rounded flex items-center gap-2 ${tc.passed ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                                                  <span className="font-mono">#{tc.testCase}</span>
                                                  <span>{tc.passed ? '✓ Passed' : `✗ ${tc.status || 'Failed'}`}</span>
                                                  {!tc.passed && tc.expected != null && <span className="truncate">Expected: {String(tc.expected).slice(0, 30)}...</span>}
                                                  {!tc.passed && tc.actual != null && <span className="truncate">Got: {String(tc.actual).slice(0, 30)}...</span>}
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                        <pre className="text-xs font-mono bg-gray-50 p-2 rounded max-h-28 overflow-y-auto whitespace-pre-wrap break-words">{sub.code?.slice(0, 400)}{sub.code?.length > 400 ? '...' : ''}</pre>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setViewingCodeFor({ appId: app.id, submission: sub }); }}
                                          className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium"
                                        >
                                          View full code & details
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                              {codingSubmissions[app.id]?.submissions && codingSubmissions[app.id].submissions.length === 0 && !codingSubmissions[app.id]?.loading && (
                                <p className="text-sm text-gray-500 mt-2">
                                  {codingSubmissions[app.id]?.error || 'No coding submissions yet'}
                                </p>
                              )}
                            </div>

                        <div className="mt-4 pt-4 border-t flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                window.location.href = `mailto:${app.student.email}`;
                              }}
                              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50"
                            >
                              <Mail className="w-4 h-4" />
                              Email
                            </button>
                            {app.student.phone && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.location.href = `tel:${app.student.phone}`;
                                }}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50"
                              >
                                <Phone className="w-4 h-4" />
                                Call
                              </button>
                            )}
                          </div>
                      <button
                            onClick={(e) => {
                              e.stopPropagation();
                              downloadCV(app);
                            }}
                        disabled={!app.cvUrl}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
                          app.cvUrl
                            ? 'bg-red-600 text-white hover:bg-red-700'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        <Download className="w-4 h-4" />
                        {app.cvUrl ? 'View CV' : 'No CV'}
                      </button>
                    </div>
                  </div>
                    )}
                  </div>
                );
              })}
            </div>
            </div>
          )}
        </div>
      </div>

      
      {/* Full code & results view modal */}
      {viewingCodeFor && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex-shrink-0 p-4 border-b">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">
                    {viewingCodeFor.submission.questionTitle}
                  </h3>
                  <div className="flex flex-wrap gap-3 mt-1 text-sm text-gray-600">
                    <span>Language: <strong>{viewingCodeFor.submission.languageName || 'N/A'}</strong></span>
                    <span>Status: <strong className={viewingCodeFor.submission.status === 'ACCEPTED' ? 'text-green-600' : 'text-amber-600'}>{viewingCodeFor.submission.status}</strong></span>
                    {viewingCodeFor.submission.score != null && (
                      <span>Score: <strong>{viewingCodeFor.submission.score?.toFixed(1)}{viewingCodeFor.submission.questionPoints != null ? `/${viewingCodeFor.submission.questionPoints}` : ''} pts</strong></span>
                    )}
                    {viewingCodeFor.submission.executionTime != null && <span>Time: <strong>{viewingCodeFor.submission.executionTime?.toFixed(2)}s</strong></span>}
                    {viewingCodeFor.submission.memoryUsed != null && <span>Memory: <strong>{(viewingCodeFor.submission.memoryUsed / 1024).toFixed(1)} KB</strong></span>}
                    <span>Submitted: <strong>{new Date(viewingCodeFor.submission.createdAt).toLocaleString()}</strong></span>
                  </div>
                  {viewingCodeFor.submission.errorMessage && (
                    <div className="mt-2 p-2 bg-red-50 text-red-700 text-sm rounded">
                      Error: {viewingCodeFor.submission.errorMessage}
                    </div>
                  )}
                </div>
                <button onClick={() => setViewingCodeFor(null)} className="text-gray-500 hover:text-gray-700 text-2xl leading-none shrink-0">
                  ×
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-4">
              {viewingCodeFor.submission.testCaseResults && viewingCodeFor.submission.testCaseResults.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Test Case Results</h4>
                  <div className="space-y-2">
                    {viewingCodeFor.submission.testCaseResults.map((tc, i) => (
                      <div key={i} className={`border rounded-lg p-3 ${tc.passed ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">Test #{tc.testCase}</span>
                          <span className={`text-xs px-2 py-0.5 rounded ${tc.passed ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                            {tc.passed ? 'Passed' : (tc.status || 'Failed')}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs font-mono">
                          <div><span className="text-gray-500">Input:</span><pre className="mt-0.5 bg-white p-1.5 rounded overflow-x-auto">{tc.input || '(empty)'}</pre></div>
                          <div><span className="text-gray-500">Expected:</span><pre className="mt-0.5 bg-white p-1.5 rounded overflow-x-auto">{tc.expected ?? '(empty)'}</pre></div>
                          <div><span className="text-gray-500">Actual:</span><pre className="mt-0.5 bg-white p-1.5 rounded overflow-x-auto">{tc.actual ?? '(empty)'}</pre></div>
                        </div>
                        {tc.error && !tc.passed && <p className="text-xs text-red-600 mt-1">Error: {tc.error}</p>}
                        {(tc.executionTime != null || tc.memoryUsed != null) && (
                          <p className="text-xs text-gray-500 mt-1">
                            {tc.executionTime != null && `Time: ${tc.executionTime}s`}
                            {tc.executionTime != null && tc.memoryUsed != null && ' • '}
                            {tc.memoryUsed != null && `Memory: ${(tc.memoryUsed / 1024).toFixed(1)} KB`}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Submitted Code</h4>
                <pre className="text-sm font-mono bg-gray-50 p-4 rounded-lg whitespace-pre-wrap break-words overflow-x-auto">
                  {viewingCodeFor.submission.code}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {previewCV && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-gray-800">
                {previewCV.name}
              </h3>
              <div className="space-x-2">
                <a
                  href={previewCV.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-white bg-red-600 hover:bg-red-700"
                >
                  <Download className="w-4 h-4" />
                  Open / Download
                </a>
                <button
                  onClick={() => setPreviewCV(null)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 bg-gray-100 rounded-lg relative overflow-hidden">
              <iframe
                src={previewCV.url}
                className="w-full h-full rounded-lg"
                title="CV Preview"
                onError={(e) => {
                  console.error('Failed to load PDF preview:', e);
                  window.open(previewCV.url, '_blank', 'noopener,noreferrer');
                  setPreviewCV(null);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return modalContent;
};

export default ApplicationsList;
