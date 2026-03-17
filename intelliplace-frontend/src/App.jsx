import { Component } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

// Pages
import LandingPage from './pages/LandingPage';
import StudentLogin from './pages/Student/StudentLogin';
import StudentRegister from './pages/Student/StudentRegister';
import StudentDashboard from './pages/Student/StudentDashboard';
import Notifications from './pages/Student/Notifications';
import MyApplications from './pages/Student/MyApplications';
import CompanyLogin from './pages/Company/CompanyLogin';
import CompanyRegister from './pages/Company/CompanyRegister';
import CompanyDashboard from './pages/Company/CompanyDashboard';
import RecruitmentProcess from './pages/Company/RecruitmentProcess';
import AdminDashboard from './pages/Admin/AdminDashboard';
import { GlowingEffectDemo } from "./components/GlowingEffectDemo";

class ErrorBoundary extends Component {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error) {
    console.error('Route error:', error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-8">
          <div className="bg-white rounded-lg shadow-lg p-8 max-w-md">
            <h2 className="text-xl font-semibold text-red-600 mb-2">Something went wrong</h2>
            <p className="text-gray-600 mb-4">{this.state.error?.message || 'An error occurred'}</p>
            <button
              onClick={() => window.location.href = '/company/dashboard'}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/glow-demo" element={<div className="min-h-screen bg-[#030712] text-white p-10"><h1 className="text-3xl font-bold mb-8 text-center">Glowing Effect Demo</h1><GlowingEffectDemo /></div>} />

        {/* Student Routes */}
        <Route path="/student/login" element={<StudentLogin />} />
        <Route path="/student/register" element={<StudentRegister />} />
        <Route path="/student/dashboard" element={<StudentDashboard />} />
        <Route path="/student/notifications" element={<Notifications />} />
        <Route path="/student/applications" element={<MyApplications />} />

        {/* Company Routes */}
        <Route path="/company/login" element={<CompanyLogin />} />
        <Route path="/company/register" element={<CompanyRegister />} />
        <Route path="/company/dashboard" element={<CompanyDashboard />} />
        <Route path="/company/recruitment/:jobId" element={<ErrorBoundary><RecruitmentProcess /></ErrorBoundary>} />

        {/* Admin Routes */}
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
      </Routes>
    </Router>
  );
}

export default App;
