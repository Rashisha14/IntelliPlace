import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import { getCurrentUser } from '../../utils/auth';

const ApplicationDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = getCurrentUser();
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.userType !== 'student') {
      navigate('/student/login');
      return;
    }

    const fetchApplication = async () => {
      setLoading(true);
      try {
        const res = await fetch(`http://localhost:5000/api/applications/${id}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || 'Failed to fetch application');
        setApplication(json.data.application || null);
      } catch (err) {
        console.error(err);
      } finally { setLoading(false); }
    };

    fetchApplication();
  }, [id, navigate]);

  const viewCV = async (cvUrl) => {
    if (!cvUrl) return;
    const parts = cvUrl.split('/');
    const filename = parts[parts.length - 1];

    try {
      const res = await fetch(`http://localhost:5000/api/jobs/cv/${filename}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) {
        const json = await res.json();
        alert(json.message || 'Failed to fetch CV');
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err) {
      console.error('Error fetching CV', err);
      alert('Failed to open CV');
    }
  };

  if (!user || user.userType !== 'student') return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-2xl font-bold mb-4">Application Details</h1>

        {loading ? (
          <div className="py-8 text-center">Loading...</div>
        ) : !application ? (
          <div className="p-6 bg-white rounded-lg shadow border">Application not found.</div>
        ) : (
          <div className="bg-white rounded-lg shadow p-6 border">
            <div className="mb-4">
              <h2 className="text-xl font-semibold">{application.job?.title}</h2>
              <div className="text-sm text-gray-600">{application.job?.company?.companyName}</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <div className="text-sm text-gray-600">Status</div>
                  <div>
                    <span className={`inline-flex items-center px-3 py-1 rounded-md text-sm font-medium ${
                      application.status && application.status.toLowerCase().includes('reject') ? 'bg-red-100 text-red-800 border border-red-200' :
                      application.status && (application.status.toLowerCase().includes('shortlist') || application.status.toLowerCase().includes('hire') || application.status.toLowerCase().includes('accept')) ? 'bg-green-100 text-green-800 border border-green-200' :
                      'bg-gray-100 text-gray-800'
                    }`}>{application.status}</span>
                  </div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Applied At</div>
                <div className="font-medium">{new Date(application.createdAt).toLocaleString()}</div>
              </div>
            </div>

            {application.decisionReason && (
              <div className="mb-4">
                <div className="text-sm text-gray-600">Decision Reason</div>
                <div className="text-sm italic text-gray-700 mt-1">{application.decisionReason}</div>
              </div>
            )}

            <div className="flex items-center gap-3">
              {application.cvUrl ? (
                <button onClick={() => viewCV(application.cvUrl)} className="px-3 py-1 bg-red-600 text-white rounded-md text-sm">View CV</button>
              ) : (
                <div className="text-xs text-gray-500">No CV uploaded</div>
              )}
              <button onClick={() => navigate(`/jobs/${application.jobId}`)} className="px-3 py-1 border rounded-md text-sm">Open Job</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ApplicationDetail;
