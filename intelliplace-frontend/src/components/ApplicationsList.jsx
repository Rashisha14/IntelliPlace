import { useState, useEffect } from 'react';
import { FileCheck, Download, Mail, Phone } from 'lucide-react';

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
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
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

  useEffect(() => { if (jobId) fetchApplications(); }, [jobId]);

  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);
  const [jobStatus, setJobStatus] = useState(initialJobStatus || 'OPEN');
  const [confirming, setConfirming] = useState(false);

  const [previewCV, setPreviewCV] = useState(null);
  
  const downloadCV = async (application) => {
    if (!application.cvUrl) {
      alert('No CV available for this applicant');
      return;
    }

    try {
      const cvId = application.cvUrl.split('/').pop();
      console.log('Downloading CV:', cvId);
      
      // Request the CV file from the server
      const response = await fetch(`http://localhost:5000/api/jobs/cv/${cvId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) {
        console.error('Failed to download CV:', await response.text());
        throw new Error('Failed to download CV');
      }
      
      const blob = await response.blob();
      console.log('Received blob:', blob.type, blob.size);
      const url = URL.createObjectURL(blob);

      // If it's a PDF, show preview
      const isPDF = blob.type === 'application/pdf' || cvId.toLowerCase().endsWith('.pdf');
      console.log('File type:', blob.type, 'Is PDF:', isPDF);
      
      if (isPDF) {
        console.log('Setting up PDF preview');
        setPreviewCV({
          url,
          name: `${application.student.name}'s CV`,
          studentName: application.student.name
        });
      } else {
        // For non-PDF files, download directly
        const a = document.createElement('a');
        a.href = url;
        a.download = cvId || `CV_${application.student.name.replace(/\\s+/g, '_')}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Failed to download CV:', err);
      alert('Failed to download CV. Please try again.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b">
            <div className="flex justify-between items-center gap-4">
              <h2 className="text-2xl font-semibold text-gray-800">Applications</h2>
              <div className="ml-auto flex items-center gap-3">
                {jobStatus === 'OPEN' && !confirming && (
                  <button
                    onClick={() => setConfirming(true)}
                    className="btn btn-warning"
                    disabled={actionLoading}
                  >
                    Shortlist & Close
                  </button>
                )}
                {confirming && jobStatus === 'OPEN' && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-700">Are you sure?</span>
                    <button
                      onClick={async () => {
                        setActionLoading(true);
                        setActionMessage(null);
                        try {
                          const res = await fetch(`http://localhost:5000/api/jobs/${jobId}/shortlist`, {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                          });
                          const json = await res.json();
                          if (res.ok) {
                            setActionMessage({ type: 'success', text: json.message || 'Shortlisting complete' });
                            await fetchApplications();
                            setJobStatus('CLOSED');
                          } else {
                            setActionMessage({ type: 'error', text: json.message || 'Shortlisting failed' });
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
                <button onClick={onClose} className="text-gray-500 hover:text-gray-700">×</button>
              </div>
            </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {actionMessage && (
            <div className={`p-3 mb-4 rounded ${actionMessage.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
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
            <div className="space-y-6">
              {applications.map((app) => (
                <div key={app.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800">{app.student.name}</h3>
                      <div className="mt-1 space-y-1">
                        <p className="text-sm text-gray-600 flex items-center gap-2">
                          <Mail className="w-4 h-4" />
                          <a href={`mailto:${app.student.email}`} className="hover:text-red-600">{app.student.email}</a>
                        </p>
                        {app.student.phone && (
                          <p className="text-sm text-gray-600 flex items-center gap-2">
                            <Phone className="w-4 h-4" />
                            <a href={`tel:${app.student.phone}`} className="hover:text-red-600">{app.student.phone}</a>
                          </p>
                        )}
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-gray-600">CGPA</p>
                          <div className="flex items-baseline gap-2">
                            <p className="font-medium text-lg">{app.cgpa || app.student.cgpa || 'Not provided'}</p>
                            {app.cgpa !== app.student.cgpa && app.student.cgpa && (
                              <span className="text-xs text-gray-500">(Profile: {app.student.cgpa})</span>
                            )}
                          </div>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Backlog</p>
                          <div className="flex items-baseline gap-2">
                            <p className="font-medium text-lg">{app.backlog !== null ? app.backlog : (app.student.backlog !== null ? app.student.backlog : 'Not provided')}</p>
                            {app.backlog !== app.student.backlog && app.student.backlog !== null && (
                              <span className="text-xs text-gray-500">(Profile: {app.student.backlog})</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 pt-4 border-t">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div>
                              <p className="text-sm text-gray-600">Applied</p>
                              <p className="font-medium">{new Date(app.createdAt).toLocaleDateString()}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Status</p>
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                app.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                                app.status === 'REVIEWING' ? 'bg-blue-100 text-blue-800' :
                                app.status === 'SHORTLISTED' ? 'bg-green-100 text-green-800' :
                                app.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                                app.status === 'HIRED' ? 'bg-purple-100 text-purple-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {app.status}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-5">
                            
                            <button 
                              onClick={() => window.location.href = `mailto:${app.student.email}`}
                              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50"
                            >
                              <Mail className="w-4 h-4" />
                              Email
                            </button>
                            {app.student.phone && (
                              <button 
                                onClick={() => window.location.href = `tel:${app.student.phone}`}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50"
                              >
                                <Phone className="w-4 h-4" />
                                Call
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div>
                      <button
                        onClick={() => downloadCV(app)}
                        disabled={!app.cvUrl}
                        className={`flex items-center gap-2 px-4 py-2 rounded ${
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
                  <div className="mt-4">
                    <p className="text-sm text-gray-600">Applied {new Date(app.createdAt).toLocaleString()}</p>
                    <p className="text-sm font-medium text-gray-800 mt-1">Status: <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      app.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                      app.status === 'REVIEWING' ? 'bg-blue-100 text-blue-800' :
                      app.status === 'SHORTLISTED' ? 'bg-green-100 text-green-800' :
                      app.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                      app.status === 'HIRED' ? 'bg-purple-100 text-purple-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>{app.status}</span></p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* CV Preview Modal */}
      {previewCV && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-gray-800">{previewCV.name}</h3>
              <div className="space-x-2">
                <a
                  href={previewCV.url}
                  download={`CV_${previewCV.studentName.replace(/\s+/g, '_')}.pdf`}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-white bg-red-600 hover:bg-red-700"
                >
                  <Download className="w-4 h-4" />
                  Download
                </a>
                <button
                  onClick={() => {
                    URL.revokeObjectURL(previewCV.url);
                    setPreviewCV(null);
                  }}
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
                  // Fallback to download if preview fails
                  const a = document.createElement('a');
                  a.href = previewCV.url;
                  a.download = `CV_${previewCV.studentName.replace(/\s+/g, '_')}.pdf`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(previewCV.url);
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