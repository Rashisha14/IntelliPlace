import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

// Pages
import ModernLandingPage from './pages/ModernLandingPage';
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

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<ModernLandingPage />} />
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
        <Route path="/company/recruitment/:jobId" element={<RecruitmentProcess />} />

        {/* Admin Routes */}
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
      </Routes>
    </Router>
  );
}

export default App;
