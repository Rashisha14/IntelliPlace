import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User, Key, Save, Lock } from 'lucide-react';
import { API_BASE_URL } from '../config.js';
import { getCurrentUser } from '../utils/auth.js';

const ProfileModal = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' or 'password'
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  
  const [profileData, setProfileData] = useState({});
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const user = getCurrentUser();

  useEffect(() => {
    if (isOpen && user) {
      fetchProfile();
      setMessage(null);
      setActiveTab('profile');
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    }
  }, [isOpen]);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/auth/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      if (res.ok) {
        setProfileData(json.user);
      } else {
        setMessage({ type: 'error', text: json.message || 'Failed to fetch profile' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error fetching profile' });
    } finally {
      setLoading(false);
    }
  };

  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setProfileData(prev => ({ ...prev, [name]: value }));
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordData(prev => ({ ...prev, [name]: value }));
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/auth/profile`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(profileData)
      });
      const json = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: 'Profile updated successfully' });
        // Update local storage user data to reflect changes in UI
        const currentUserStr = localStorage.getItem('user');
        if (currentUserStr) {
          const currentUser = JSON.parse(currentUserStr);
          const updatedUser = { ...currentUser, ...json.user };
          localStorage.setItem('user', JSON.stringify(updatedUser));
        }
      } else {
        setMessage({ type: 'error', text: json.message || 'Failed to update profile' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error updating profile' });
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/auth/password`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword
        })
      });
      const json = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: 'Password updated successfully' });
        setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        setMessage({ type: 'error', text: json.message || 'Failed to update password' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error updating password' });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
          <h2 className="text-xl font-semibold text-slate-800">My Profile</h2>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 shrink-0">
          <button
            onClick={() => { setActiveTab('profile'); setMessage(null); }}
            className={`flex-1 py-3 px-4 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2
              ${activeTab === 'profile' ? 'border-indigo-600 text-indigo-600 bg-indigo-50/30' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
          >
            <User className="w-4 h-4" />
            Details
          </button>
          <button
            onClick={() => { setActiveTab('password'); setMessage(null); }}
            className={`flex-1 py-3 px-4 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2
              ${activeTab === 'password' ? 'border-indigo-600 text-indigo-600 bg-indigo-50/30' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
          >
            <Key className="w-4 h-4" />
            Password
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto">
          {message && (
            <div className={`p-3 rounded-lg text-sm mb-6 flex items-start gap-2 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
              <span className="shrink-0 mt-0.5">{message.type === 'success' ? '✓' : '⚠️'}</span>
              <span>{message.text}</span>
            </div>
          )}

          {loading && activeTab === 'profile' ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {activeTab === 'profile' && (
                <motion.form 
                  key="profile-form"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  onSubmit={saveProfile} 
                  className="space-y-4"
                >
                  {user?.userType === 'student' ? (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                        <input type="text" name="name" value={profileData.name || ''} onChange={handleProfileChange} className="input w-full" required />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Email <span className="text-slate-400 font-normal">(Cannot be changed)</span></label>
                        <input type="email" value={profileData.email || ''} className="input w-full bg-slate-50 text-slate-500" disabled />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                          <input type="text" name="phone" value={profileData.phone || ''} onChange={handleProfileChange} className="input w-full" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Roll Number</label>
                          <input type="text" name="rollNumber" value={profileData.rollNumber || ''} onChange={handleProfileChange} className="input w-full" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">CGPA</label>
                          <input type="text" value={profileData.cgpa || 'N/A'} className="input w-full bg-slate-50 text-slate-500" disabled title="Contact admin to update academic details" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Backlog</label>
                          <input type="text" value={profileData.backlog !== null ? profileData.backlog : 'N/A'} className="input w-full bg-slate-50 text-slate-500" disabled title="Contact admin to update academic details" />
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Company Name</label>
                        <input type="text" name="companyName" value={profileData.companyName || ''} onChange={handleProfileChange} className="input w-full" required />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Email <span className="text-slate-400 font-normal">(Cannot be changed)</span></label>
                        <input type="email" value={profileData.email || ''} className="input w-full bg-slate-50 text-slate-500" disabled />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Industry</label>
                        <input type="text" name="industry" value={profileData.industry || ''} onChange={handleProfileChange} className="input w-full" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                          <input type="text" name="phone" value={profileData.phone || ''} onChange={handleProfileChange} className="input w-full" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Website</label>
                          <input type="text" name="website" value={profileData.website || ''} onChange={handleProfileChange} className="input w-full" />
                        </div>
                      </div>
                    </>
                  )}
                  
                  <div className="pt-4 mt-6 border-t border-slate-100 flex justify-end">
                    <button 
                      type="submit" 
                      disabled={saving}
                      className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium transition-colors disabled:opacity-70"
                    >
                      {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Save className="w-4 h-4" />}
                      Save Details
                    </button>
                  </div>
                </motion.form>
              )}

              {activeTab === 'password' && (
                <motion.form 
                  key="password-form"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  onSubmit={savePassword} 
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Current Password</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input 
                        type="password" 
                        name="currentPassword" 
                        value={passwordData.currentPassword} 
                        onChange={handlePasswordChange} 
                        className="input w-full pl-10" 
                        required 
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1 mt-6">New Password</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Key className="w-4 h-4" />
                      </div>
                      <input 
                        type="password" 
                        name="newPassword" 
                        value={passwordData.newPassword} 
                        onChange={handlePasswordChange} 
                        className="input w-full pl-10" 
                        required 
                        minLength={6}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Confirm New Password</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Key className="w-4 h-4" />
                      </div>
                      <input 
                        type="password" 
                        name="confirmPassword" 
                        value={passwordData.confirmPassword} 
                        onChange={handlePasswordChange} 
                        className="input w-full pl-10" 
                        required 
                        minLength={6}
                      />
                    </div>
                  </div>
                  
                  <div className="pt-4 mt-6 border-t border-slate-100 flex justify-end">
                    <button 
                      type="submit" 
                      disabled={saving}
                      className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium transition-colors disabled:opacity-70"
                    >
                      {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Save className="w-4 h-4" />}
                      Update Password
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default ProfileModal;
