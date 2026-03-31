import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import ResetPasswordModal from '../components/ResetPasswordModal';
import './UserManagement.css';

export default function UserManagement() {
  const { token } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Form states
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [selectedUserForReset, setSelectedUserForReset] = useState(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
    role: 'user',
    status: 'active'
  });

  // Fetch users on mount
  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:3002/api/auth/users', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('Fetch response status:', response.status);
      const data = await response.json();
      console.log('Fetch response data:', data);

      if (response.ok) {
        setUsers(data.users || []);
        setError('');
      } else {
        setError('Failed to load users: ' + (data.message || 'Unknown error'));
      }
    } catch (err) {
      console.error('Fetch error:', err);
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.email || !formData.password || !formData.fullName) {
      setError('All fields are required');
      return;
    }

    try {
      const response = await fetch('http://localhost:3002/api/auth/register', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          fullName: formData.fullName
        })
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('User added successfully');
        setFormData({ email: '', password: '', fullName: '', role: 'user', status: 'active' });
        setShowAddForm(false);
        fetchUsers();
      } else {
        setError(data.message || 'Failed to add user');
      }
    } catch (err) {
      setError(err.message || 'An error occurred');
    }
  };

  const handleUpdateUser = async (userId) => {
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`http://localhost:3002/api/auth/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fullName: formData.fullName,
          role: formData.role,
          status: formData.status
        })
      });

      if (response.ok) {
        setSuccess('User updated successfully');
        setEditingId(null);
        fetchUsers();
      } else {
        setError('Failed to update user');
      }
    } catch (err) {
      setError(err.message || 'An error occurred');
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) {
      return;
    }

    setError('');
    setSuccess('');

    try {
      const response = await fetch(`http://localhost:3002/api/auth/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        setSuccess('User deleted successfully');
        fetchUsers();
      } else {
        setError('Failed to delete user');
      }
    } catch (err) {
      setError(err.message || 'An error occurred');
    }
  };

  if (loading) {
    return <div className="user-management">Loading...</div>;
  }

  return (
    <div className="user-management">
      <div className="user-management-header">
        <h2>User Management</h2>
        <button 
          className="btn-add" 
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? 'Cancel' : '+ Add User'}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {showAddForm && (
        <div className="add-user-form">
          <h3>Add New User</h3>
          <form onSubmit={handleAddUser}>
            <div className="form-row">
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="user@example.com"
                  required
                />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Min 6 characters"
                  required
                />
              </div>
            </div>
            <div className="form-group">
              <label>Full Name</label>
              <input
                type="text"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                placeholder="John Doe"
                required
              />
            </div>
            <button type="submit" className="btn-submit">Add User</button>
          </form>
        </div>
      )}

      <div className="users-table">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last Login</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.userId} className={editingId === user.userId ? 'editing' : ''}>
                <td>{user.email}</td>
                <td>
                  {editingId === user.userId ? (
                    <input
                      type="text"
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    />
                  ) : (
                    user.fullName || '-'
                  )}
                </td>
                <td>
                  {editingId === user.userId ? (
                    <select
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  ) : (
                    <span className={`badge badge-${user.role}`}>{user.role}</span>
                  )}
                </td>
                <td>
                  {editingId === user.userId ? (
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  ) : (
                    <span className={`badge badge-${user.status}`}>{user.status}</span>
                  )}
                </td>
                <td>{user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}</td>
                <td className="actions">
                  {editingId === user.userId ? (
                    <>
                      <button
                        className="btn-save"
                        onClick={() => handleUpdateUser(user.userId)}
                      >
                        Save
                      </button>
                      <button
                        className="btn-cancel"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="btn-edit"
                        onClick={() => {
                          setEditingId(user.userId);
                          setFormData({
                            fullName: user.fullName,
                            role: user.role,
                            status: user.status,
                            email: '',
                            password: ''
                          });
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="btn-reset"
                        onClick={() => {
                          setSelectedUserForReset(user);
                          setShowResetPasswordModal(true);
                        }}
                      >
                        Reset Password
                      </button>
                      <button
                        className="btn-delete"
                        onClick={() => handleDeleteUser(user.userId)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {users.length === 0 && (
        <div className="empty-state">
          <p>No users found. Create the first user to get started.</p>
        </div>
      )}

      {showResetPasswordModal && selectedUserForReset && (
        <ResetPasswordModal
          user={selectedUserForReset}
          onClose={() => {
            setShowResetPasswordModal(false);
            setSelectedUserForReset(null);
          }}
          onSuccess={() => fetchUsers()}
        />
      )}
    </div>
  );
}
