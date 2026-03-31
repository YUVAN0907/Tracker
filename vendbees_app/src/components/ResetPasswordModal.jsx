import { useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function ResetPasswordModal({ user, onClose, onSuccess }) {
  const { token } = useAuth();
  const [formData, setFormData] = useState({
    adminPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPasswords, setShowPasswords] = useState({
    admin: false,
    new: false,
    confirm: false
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const togglePasswordVisibility = (field) => {
    setShowPasswords(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validation
    if (!formData.adminPassword || !formData.newPassword || !formData.confirmPassword) {
      setError('All fields are required');
      return;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (formData.newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    try {
      setLoading(true);
      
      // First verify admin's password by attempting a change-password call with same password
      const verifyResponse = await fetch('http://localhost:3002/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentPassword: formData.adminPassword,
          newPassword: formData.adminPassword
        })
      });

      if (!verifyResponse.ok) {
        setError('Admin password is incorrect. Permission denied.');
        setLoading(false);
        return;
      }

      // If verification successful, proceed with resetting user password
      const resetResponse = await fetch(`http://localhost:3002/api/auth/reset-password/${user.userId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          newPassword: formData.newPassword
        })
      });

      const data = await resetResponse.json();

      if (resetResponse.ok) {
        setSuccess('Password reset successfully');
        setFormData({
          adminPassword: '',
          newPassword: '',
          confirmPassword: ''
        });
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1500);
      } else {
        setError(data.message || 'Failed to reset password');
      }
    } catch (err) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-800">Reset User Password</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-600">
            <strong>User:</strong> {user.email} ({user.fullName})
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-600">{success}</p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-xs text-yellow-700">⚠️ <strong>Security:</strong> Enter your admin password to verify and proceed with the password reset.</p>
          </div>

          <div className="mb-4">
            <label htmlFor="adminPassword" className="block text-sm font-medium text-slate-700 mb-1">
              Your Admin Password (Verification)
            </label>
            <div className="relative">
              <input
                type={showPasswords.admin ? 'text' : 'password'}
                id="adminPassword"
                name="adminPassword"
                value={formData.adminPassword}
                onChange={handleChange}
                placeholder="Enter your admin password"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <button
                type="button"
                onClick={() => togglePasswordVisibility('admin')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPasswords.admin ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
          </div>

          <div className="mb-4">
            <label htmlFor="newPassword" className="block text-sm font-medium text-slate-700 mb-1">
              New Password for User
            </label>
            <div className="relative">
              <input
                type={showPasswords.new ? 'text' : 'password'}
                id="newPassword"
                name="newPassword"
                value={formData.newPassword}
                onChange={handleChange}
                placeholder="Enter the new password"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <button
                type="button"
                onClick={() => togglePasswordVisibility('new')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPasswords.new ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
          </div>

          <div className="mb-6">
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 mb-1">
              Confirm New Password
            </label>
            <div className="relative">
              <input
                type={showPasswords.confirm ? 'text' : 'password'}
                id="confirmPassword"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Confirm the new password"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <button
                type="button"
                onClick={() => togglePasswordVisibility('confirm')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPasswords.confirm ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium disabled:bg-orange-300 disabled:cursor-not-allowed"
            >
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
