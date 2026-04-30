import { motion } from 'framer-motion';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import Modal from '../../components/Modal';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
} from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

const UsersTable = ({ type, data, onSearch, loading }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery !== debouncedSearchQuery) {
        setDebouncedSearchQuery(searchQuery);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    onSearch(debouncedSearchQuery);
  }, [debouncedSearchQuery]);

  const handleSearch = (e) => {
    e.preventDefault();
    onSearch(searchQuery);
  };

  // Reset search query when type changes
  useEffect(() => {
    setSearchQuery('');
    setDebouncedSearchQuery('');
  }, [type]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'REVIEWING':
        return 'bg-blue-100 text-blue-800';
      case 'HIRED':
        return 'bg-green-100 text-green-800';
      case 'REJECTED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStudentChartData = (applications) => {
    if (!applications || applications.length === 0) return null;
    
    const counts = { PENDING: 0, REVIEWING: 0, HIRED: 0, REJECTED: 0, OFFERED: 0 };
    applications.forEach(app => {
      if (counts[app.status] !== undefined) counts[app.status]++;
      else counts[app.status] = 1;
    });

    const labels = Object.keys(counts).filter(k => counts[k] > 0);
    const data = labels.map(k => counts[k]);
    
    const colorMap = {
      PENDING: '#FCD34D',
      REVIEWING: '#93C5FD',
      HIRED: '#86EFAC',
      REJECTED: '#FCA5A5',
      OFFERED: '#6EE7B7'
    };

    return {
      labels,
      datasets: [
        {
          data,
          backgroundColor: labels.map(l => colorMap[l] || '#D1D5DB'),
          borderWidth: 1,
        },
      ],
    };
  };

  const getCompanyJobStatusData = (jobs) => {
    if (!jobs || jobs.length === 0) return null;
    
    const counts = { OPEN: 0, CLOSED: 0 };
    jobs.forEach(job => {
      if (counts[job.status] !== undefined) counts[job.status]++;
      else counts[job.status] = 1;
    });

    const labels = Object.keys(counts).filter(k => counts[k] > 0);
    const data = labels.map(k => counts[k]);

    return {
      labels,
      datasets: [
        {
          data,
          backgroundColor: labels.map(l => l === 'OPEN' ? '#86EFAC' : '#FCA5A5'),
          borderWidth: 1,
        },
      ],
    };
  };

  const getCompanyApplicationsData = (jobs) => {
    if (!jobs || jobs.length === 0) return null;
    
    const labels = jobs.map(j => j.title.length > 12 ? j.title.substring(0, 12) + '...' : j.title);
    const data = jobs.map(j => j._count?.applications || 0);

    return {
      labels,
      datasets: [
        {
          label: 'Applications',
          data,
          backgroundColor: '#93C5FD',
        },
      ],
    };
  };

  const renderStudentRow = (student) => (
    <tr key={student.id} className="hover:bg-gray-50">
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{student.name}</td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{student.email}</td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{student.rollNumber || '-'}</td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{student.phone || '-'}</td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{student.cgpa ?? '-'} / {student.backlog ?? '-'} backlog</td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{student.applications.length}</td>
      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
        <button
          className="text-red-600 hover:text-red-900"
          onClick={() => setSelectedUser(student)}
        >
          View Details
        </button>
      </td>
    </tr>
  );

  const renderCompanyRow = (company) => (
    <tr key={company.id} className="hover:bg-gray-50">
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{company.companyName}</td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{company.email}</td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{company.industry || '-'}</td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{company.website || '-'}</td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{company.jobs.length}</td>
      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
        <button
          className="text-red-600 hover:text-red-900"
          onClick={() => setSelectedUser(company)}
        >
          View Details
        </button>
      </td>
    </tr>
  );

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-white shadow-lg rounded-lg overflow-hidden"
      >
      {/* Search Bar */}
      <div className="p-4 border-b border-gray-200">
        <form onSubmit={handleSearch} className="flex gap-4">
          <div className="flex-1 relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${type}...`}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
            <Search className="absolute left-3 top-2.5 text-gray-400 h-5 w-5" />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Search
          </button>
        </form>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {type === 'students' ? (
                <>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Roll Number</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CGPA / Backlog</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Applications</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </>
              ) : (
                <>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Industry</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Website</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Jobs Posted</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan="6" className="px-6 py-4 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : data?.data ? (
              type === 'students' && data.data.students ? (
                data.data.students.map(renderStudentRow)
              ) : type === 'companies' && data.data.companies ? (
                data.data.companies.map(renderCompanyRow)
              ) : (
                <tr>
                  <td colSpan="6" className="px-6 py-4 text-center text-gray-500">
                    No {type} found
                  </td>
                </tr>
              )
            ) : (
              <tr>
                <td colSpan="6" className="px-6 py-4 text-center text-gray-500">
                  No data available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data?.data?.pagination && (
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <p className="text-sm text-gray-700">
            Showing <span className="font-medium">{((data.data.pagination.page - 1) * 10) + 1}</span> to{' '}
            <span className="font-medium">{Math.min(data.data.pagination.page * 10, data.data.pagination.total)}</span> of{' '}
            <span className="font-medium">{data.data.pagination.total}</span> results
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); onSearch(searchQuery, data.data.pagination.page - 1); }}
              disabled={data.data.pagination.page === 1}
              className="px-3 py-1 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); onSearch(searchQuery, data.data.pagination.page + 1); }}
              disabled={data.data.pagination.page === data.data.pagination.pages}
              className="px-3 py-1 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
      </motion.div>

      {/* Details Modal */}
      {selectedUser && (
        <Modal
          open={true}
          title={`Details - ${type === 'students' ? selectedUser.name : selectedUser.companyName}`}
          message={
            <div className="text-sm overflow-auto max-h-[75vh] space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(selectedUser)
                  .filter(([key]) => key !== 'applications' && key !== 'jobs' && key !== 'id')
                  .map(([key, value]) => (
                  <div key={key} className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <div className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1">
                      {key.replace(/([A-Z])/g, ' $1')}
                    </div>
                    <div className="text-gray-900 font-medium break-words">
                      {value === null || value === undefined || value === '' ? '-' : 
                       (key === 'createdAt' || key === 'updatedAt') ? new Date(value).toLocaleString() : 
                       String(value)}
                    </div>
                  </div>
                ))}
              </div>
              
              {selectedUser.applications && (
                <div className="mt-6 border-t pt-4">
                  <h4 className="font-bold text-gray-800 mb-4">Application Status Overview</h4>
                  {selectedUser.applications.length > 0 ? (
                    <div className="h-64 w-full flex justify-center mb-6">
                      <Doughnut data={getStudentChartData(selectedUser.applications)} options={{ maintainAspectRatio: false }} />
                    </div>
                  ) : null}
                  <h4 className="font-bold text-gray-800 mb-3 border-b pb-2">Applications ({selectedUser.applications.length})</h4>
                  {selectedUser.applications.length > 0 ? (
                    <div className="space-y-2">
                      {selectedUser.applications.map(app => (
                        <div key={app.id} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg border border-gray-100">
                          <div>
                            <div className="font-medium text-gray-900">{app.job?.title || `Application #${app.id}`}</div>
                            {app.job?.company?.companyName && (
                              <div className="text-gray-500 text-xs">{app.job.company.companyName}</div>
                            )}
                            <div className="text-gray-400 text-xs mt-1">{new Date(app.createdAt).toLocaleDateString()}</div>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(app.status)}`}>
                            {app.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm italic">No applications found.</p>
                  )}
                </div>
              )}

              {selectedUser.jobs && (
                <div className="mt-6 border-t pt-4">
                  <h4 className="font-bold text-gray-800 mb-4">Jobs & Applications Overview</h4>
                  {selectedUser.jobs.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                      <div className="h-64 w-full flex flex-col items-center">
                        <span className="text-xs font-semibold text-gray-500 mb-2">Job Statuses</span>
                        <Doughnut data={getCompanyJobStatusData(selectedUser.jobs)} options={{ maintainAspectRatio: false }} />
                      </div>
                      <div className="h-64 w-full flex flex-col items-center">
                        <span className="text-xs font-semibold text-gray-500 mb-2">Applications per Job</span>
                        <Bar 
                          data={getCompanyApplicationsData(selectedUser.jobs)} 
                          options={{ 
                            maintainAspectRatio: false,
                            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
                            plugins: { legend: { display: false } }
                          }} 
                        />
                      </div>
                    </div>
                  ) : null}
                  <h4 className="font-bold text-gray-800 mb-3 border-b pb-2">Jobs Posted ({selectedUser.jobs.length})</h4>
                  {selectedUser.jobs.length > 0 ? (
                    <div className="space-y-3">
                      {selectedUser.jobs.map(job => (
                        <div key={job.id} className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                          <div className="flex justify-between items-start mb-2">
                            <span className="font-medium text-gray-900">{job.title}</span>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${job.status === 'OPEN' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                              {job.status}
                            </span>
                          </div>
                          <div className="text-gray-500 text-xs">
                            Posted: {new Date(job.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm italic">No jobs posted.</p>
                  )}
                </div>
              )}
            </div>
          }
          type="info"
          onClose={() => setSelectedUser(null)}
          actions={[{ label: 'Close', onClick: () => setSelectedUser(null) }]}
        />
      )}
    </>
  );
};

export default UsersTable;