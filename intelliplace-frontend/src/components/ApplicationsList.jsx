import { useState, useEffect } from 'react';
import { FileCheck, Download, Mail, Phone, ChevronDown, ChevronUp, User, FileDown, Sparkles, XCircle } from 'lucide-react';
import * as XLSX from 'xlsx';

const ApplicationsList = ({ jobId, onClose, initialJobStatus }) => {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch applications for a job
  const fetchApplications = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`http://localhost:5000/api/jobs/${jobId}/applicants`, {
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

  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);
  const [jobStatus, setJobStatus] = useState(initialJobStatus || 'OPEN');
  const [confirming, setConfirming] = useState(false);

  const [previewCV, setPreviewCV] = useState(null);
  const [expandedApp, setExpandedApp] = useState(null);
  const [atsLoading, setAtsLoading] = useState(false);
  const [atsProgress, setAtsProgress] = useState(null);
  const [closeLoading, setCloseLoading] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  
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
        name: `${application.student.name}'s CV`,
        studentName: application.student.name,
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
      const displayCgpa = app.cgpa || app.student.cgpa || 'N/A';
      const displayBacklog = app.backlog !== null ? app.backlog : (app.student.backlog !== null ? app.student.backlog : 'N/A');
      
      return {
        'S.No': index + 1,
        'Name': app.student.name || 'N/A',
        'Roll Number': app.student.rollNumber || 'N/A',
        'Email': app.student.email || 'N/A',
        'Phone': app.student.phone || 'N/A',
        'CGPA': app.cgpa || 'N/A',
       // 'CGPA (Profile)': app.student.cgpa || 'N/A',
         'Backlog (Application)': app.backlog !== null ? app.backlog : 'N/A',
         'Backlog (Profile)': app.student.backlog !== null ? app.student.backlog : 'N/A',
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
    if (!window.confirm('Are you sure you want to close applications for this job? This will prevent new applications.')) {
      setConfirmClose(false);
      return;
    }

    setCloseLoading(true);
    setActionMessage(null);
    
    try {
      const res = await fetch(
        `http://localhost:5000/api/jobs/${jobId}/close`,
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
          text: json.message || 'Applications closed successfully',
        });
        setJobStatus('CLOSED');
        await fetchApplications();
      } else {
        setActionMessage({
          type: 'error',
          text: json.message || 'Failed to close applications',
        });
      }
    } catch (err) {
      setActionMessage({ 
        type: 'error', 
        text: `Error: ${err.message}` 
      });
    } finally {
      setCloseLoading(false);
      setConfirmClose(false);
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
        `http://localhost:5000/api/jobs/${jobId}/shortlist-ats`,
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

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b">
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
                      onClick={() => setConfirmClose(true)}
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
              {confirmClose && jobStatus === 'OPEN' && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-700">Close applications?</span>
                  <button
                    onClick={handleCloseApplication}
                    className="btn btn-primary"
                    disabled={closeLoading}
                  >
                    {closeLoading ? 'Closing...' : 'Confirm'}
                  </button>
                  <button
                    onClick={() => setConfirmClose(false)}
                    className="btn btn-ghost"
                    disabled={closeLoading}
                  >
                    Cancel
                  </button>
                </div>
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
                          `http://localhost:5000/api/jobs/${jobId}/shortlist`,
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
              <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                ×
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
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
            <div className="text-center py-12">
              <p className="text-gray-600">Loading applications...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-600">{error}</p>
            </div>
          ) : applications.length === 0 ? (
            <div className="text-center py-12">
              <FileCheck className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No applications yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {applications.map((app, index) => {
                const isExpanded = expandedApp === app.id;
                const displayCgpa = app.cgpa || app.student.cgpa || 'N/A';
                const displayBacklog = app.backlog !== null ? app.backlog : (app.student.backlog !== null ? app.student.backlog : 'N/A');
                
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
                              <p className="font-semibold text-gray-800">{app.student.name}</p>
                              {app.student.rollNumber && (
                                <p className="text-xs text-gray-500">Roll: {app.student.rollNumber}</p>
                              )}
                            </div>
                          </div>
                          <div className="hidden md:block">
                            <p className="text-xs text-gray-500">Email</p>
                            <p className="text-sm text-gray-700 truncate">{app.student.email}</p>
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
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                                app.status === 'PENDING'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : app.status === 'REVIEWING'
                                  ? 'bg-blue-100 text-blue-800'
                                  : app.status === 'SHORTLISTED'
                                  ? 'bg-green-100 text-green-800'
                                  : app.status === 'REJECTED'
                                  ? 'bg-red-100 text-red-800'
                                  : app.status === 'HIRED'
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}
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
                            href={`mailto:${app.student.email}`}
                            className="hover:text-red-600"
                          >
                            {app.student.email}
                          </a>
                        </p>
                        {app.student.phone && (
                          <p className="text-sm text-gray-600 flex items-center gap-2">
                            <Phone className="w-4 h-4" />
                            <a
                              href={`tel:${app.student.phone}`}
                              className="hover:text-red-600"
                            >
                              {app.student.phone}
                            </a>
                          </p>
                        )}
                              {app.student.rollNumber && (
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
                            {app.cgpa !== app.student.cgpa && app.student.cgpa && (
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
                            {app.backlog !== app.student.backlog &&
                              app.student.backlog !== null && (
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
          )}
        </div>
      </div>

      
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
};

export default ApplicationsList;
