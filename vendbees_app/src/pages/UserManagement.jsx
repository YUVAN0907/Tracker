import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import ResetPasswordModal from '../components/ResetPasswordModal';
import './UserManagement.css';

const permissionModules = [
  {
    key: 'inventory',
    label: 'Inventory',
    groups: [
      {
        key: 'purchase-order',
        label: 'Purchase Order',
        features: [
          { key: 'create_po', label: 'Create PO' },
          { key: 'record_delivery', label: 'Record Delivery' }
        ]
      },
      {
        key: 'product-master',
        label: 'Product Master',
        features: [
          { key: 'add_product', label: 'Add Product' },
          { key: 'edit_product', label: 'Edit Product' },
          { key: 'delete_product', label: 'Delete Product' }
        ]
      },
      {
        key: 'vendor-master',
        label: 'Vendor Master',
        features: [
          { key: 'add_vendor', label: 'Add Vendor' },
          { key: 'edit_vendor', label: 'Edit Vendor' },
          { key: 'delete_vendor', label: 'Delete Vendor' }
        ]
      }
    ]
  },
  {
    key: 'restock',
    label: 'Restock',
    groups: [
      {
        key: 'batch',
        label: 'Batch',
        features: [
          { key: 'create_batch', label: 'Create Batch' }
        ]
      }
    ]
  }
];

export default function UserManagement() {
  const { token, user: currentUser, updateUserInfo } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Form states
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [selectedUserForReset, setSelectedUserForReset] = useState(null);
  const [expandedFormModules, setExpandedFormModules] = useState({ inventory: true, restock: false });
  const [expandedUserModules, setExpandedUserModules] = useState({});
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
    role: 'user',
    status: 'active',
    permissions: []
  });

  // Fetch users on mount
  useEffect(() => {
    fetchUsers();
  }, []);

  const normalizePermissions = (permissions) => {
    if (Array.isArray(permissions)) {
      return permissions.filter((p) => typeof p === 'string' && p.trim());
    }

    if (typeof permissions === 'string') {
      const trimmed = permissions.trim();
      if (!trimmed) return [];
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.filter((p) => typeof p === 'string' && p.trim());
        }
      } catch (e) {
        // Not JSON, fall back to comma-separated values
      }
      return trimmed.split(',').map((p) => p.trim()).filter((p) => p);
    }

    return [];
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const API_URL = import.meta.env.VITE_API_URL || 'https://vendbees-inventory-backend-333114755202.asia-south1.run.app/api';
      const response = await fetch(`${API_URL}/auth/users`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('Fetch response status:', response.status);
      const data = await response.json();
      console.log('Fetch response data:', data);

      if (response.ok) {
        const serverUsers = data.users || [];
        const merged = serverUsers.map((u) => {
          const normalized = normalizePermissions(u.permissions);
          return { ...u, permissions: normalized };
        });
        
        setUsers(merged);
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
      const API_URL = import.meta.env.VITE_API_URL || 'https://vendbees-inventory-backend-333114755202.asia-south1.run.app/api';
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          fullName: formData.fullName,
          role: formData.role,
          permissions: formData.permissions
        })
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('User added successfully');
        setFormData({ email: '', password: '', fullName: '', role: 'user', status: 'active', permissions: [] });
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
      const API_URL = import.meta.env.VITE_API_URL || 'https://vendbees-inventory-backend-333114755202.asia-south1.run.app/api';
      const response = await fetch(`${API_URL}/auth/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fullName: formData.fullName,
          role: formData.role,
          status: formData.status,
          permissions: formData.permissions
        })
      });

      if (response.ok) {
        setUsers((prevUsers) => prevUsers.map((item) => item.userId === userId ? { ...item, permissions: Array.isArray(formData.permissions) ? formData.permissions : [] } : item));
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

  const toggleFormModule = (moduleKey) => {
    setExpandedFormModules((prev) => ({ ...prev, [moduleKey]: !prev[moduleKey] }));
  };

  const toggleUserModule = (userId, moduleKey) => {
    setExpandedUserModules((prev) => ({
      ...prev,
      [userId]: {
        ...(prev[userId] || { inventory: true, restock: false }),
        [moduleKey]: !(prev[userId]?.[moduleKey] ?? true)
      }
    }));
  };

  const getActivePermissions = (user) => {
    if (editingId === user.userId && Array.isArray(formData.permissions)) {
      return formData.permissions;
    }

    return Array.isArray(user.permissions) ? user.permissions : [];
  };

  const renderPermissionModuleList = (permissions, onToggle, expandedState, onToggleModule) => (
    <div className="permission-module-list custom-scrollbar">
      {permissionModules.map((module) => {
        const isExpanded = expandedState[module.key] ?? true;

        return (
          <div key={module.key} className="permission-module-card">
            <button
              type="button"
              className="permission-module-header"
              onClick={() => onToggleModule(module.key)}
            >
              <span>{module.label}</span>
              <span className="permission-module-caret">{isExpanded ? '▾' : '▸'}</span>
            </button>

            {isExpanded && (
              <div className="permission-module-body">
                {module.groups.map((group) => (
                  <div key={group.key} className="permission-group-card">
                    <div className="permission-group-title">{group.label}</div>
                    <div className="permission-group-items">
                      {group.features.map((feature) => {
                        const granted = Array.isArray(permissions) ? permissions.includes(feature.key) : false;

                        return (
                          <div key={feature.key} className="permission-feature-row">
                            <span className="permission-feature-label">{feature.label}</span>
                            <button
                              type="button"
                              className={`permission-toggle ${granted ? 'revoke' : 'grant'}`}
                              onClick={() => onToggle(feature.key)}
                            >
                              {granted ? 'Revoke' : 'Grant'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const togglePermission = (userId, permission) => {
    const targetUser = users.find((item) => item.userId === userId);
    if (!targetUser) return;

    const currentPermissions = editingId === userId
      ? (Array.isArray(formData.permissions) ? formData.permissions : [])
      : (Array.isArray(targetUser.permissions) ? targetUser.permissions : []);
    const hasPermission = currentPermissions.includes(permission);
    const updatedPermissions = hasPermission
      ? currentPermissions.filter((item) => item !== permission)
      : [...currentPermissions, permission];

    setUsers((prevUsers) => prevUsers.map((item) => item.userId === userId ? { ...item, permissions: updatedPermissions } : item));

    if (editingId === userId) {
      setFormData((prevFormData) => ({ ...prevFormData, permissions: updatedPermissions }));
      return;
    }

    updateUserPermissions(userId, updatedPermissions);
  };

  const updateUserPermissions = async (userId, permissions) => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'https://vendbees-inventory-backend-333114755202.asia-south1.run.app/api';
      const response = await fetch(`${API_URL}/auth/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ permissions })
      });

      const data = await response.json();
      if (!response.ok) {
        console.error('Permissions update failed:', data);
        setError('Failed to persist permissions: ' + (data.message || response.statusText));
        fetchUsers();
        return;
      }

      if (data.errors) {
        console.error('GraphQL permissions update errors:', data.errors);
        setError('Failed to persist permissions: ' + (data.message || 'GraphQL update error'));
        fetchUsers();
        return;
      }

      if (currentUser?.userId === userId) {
        updateUserInfo({ ...currentUser, permissions });
      }

      setSuccess('Permissions updated successfully');
    } catch (err) {
      console.error('Permissions update error:', err);
      setError(err.message || 'Failed to update permissions');
      fetchUsers();
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) {
      return;
    }

    setError('');
    setSuccess('');

    try {
      const API_URL = import.meta.env.VITE_API_URL || 'https://vendbees-inventory-backend-333114755202.asia-south1.run.app/api';
      const response = await fetch(`${API_URL}/auth/users/${userId}`, {
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
            <div className="form-group">
              <label>Role</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              >
                <option value="user">User</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="form-group">
              <label>FEATURE ACCESS</label>
              {renderPermissionModuleList(
                formData.permissions,
                (permission) => {
                  const nextPermissions = formData.permissions.includes(permission)
                    ? formData.permissions.filter((item) => item !== permission)
                    : [...formData.permissions, permission];

                  setFormData((prevFormData) => ({ ...prevFormData, permissions: nextPermissions }));
                },
                expandedFormModules,
                toggleFormModule
              )}
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
              <th>FEATURE ACCESS</th>
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
                      <option value="manager">Manager</option>
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
                <td>
                  <div className="permissions-list hierarchical">
                    {renderPermissionModuleList(
                      getActivePermissions(user),
                      (permission) => togglePermission(user.userId, permission),
                      expandedUserModules[user.userId] || { inventory: true, restock: false },
                      (moduleKey) => toggleUserModule(user.userId, moduleKey)
                    )}
                  </div>
                </td>
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
                            password: '',
                            permissions: Array.isArray(user.permissions) ? user.permissions : []
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
