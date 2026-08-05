import { createContext, useContext, useEffect, useState } from 'react';

export const AuthContext = createContext();
const API_BASE_URL = (import.meta.env.VITE_API_URL || 'https://vendbees-inventory-backend-333114755202.asia-south1.run.app/api');

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

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
      } catch (error) {
        // fall back to comma-separated values
      }
      return trimmed.split(',').map((p) => p.trim()).filter((p) => p);
    }

    return [];
  };

  const normalizeUser = (rawUser) => {
    if (!rawUser) return null;
    return {
      ...rawUser,
      permissions: normalizePermissions(rawUser.permissions)
    };
  };

  const setNormalizedUser = (rawUser) => {
    const normalizedUser = normalizeUser(rawUser);
    setUser(normalizedUser);
    if (normalizedUser) {
      localStorage.setItem('authUser', JSON.stringify(normalizedUser));
    } else {
      localStorage.removeItem('authUser');
    }
  };

  // Initialize auth state from localStorage
  useEffect(() => {
    const storedToken = localStorage.getItem('authToken');
    const storedUser = localStorage.getItem('authUser');

    if (storedToken) {
      setToken(storedToken);
      if (storedUser) {
        try {
          setUser(normalizeUser(JSON.parse(storedUser)));
        } catch (error) {
          console.error('Stored authUser parse error:', error);
        }
      }
      verifyToken(storedToken);
    } else {
      setIsLoading(false);
    }
  }, []);

  const verifyToken = async (tokenToVerify) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/verify-token`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${tokenToVerify}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const payload = await response.json();
        const normalizedUser = normalizeUser(payload?.user || null);
        setIsAuthenticated(true);
        if (normalizedUser) {
          setNormalizedUser(normalizedUser);
        }
      } else {
        // Token invalid, clear storage
        localStorage.removeItem('authToken');
        localStorage.removeItem('authUser');
        setToken(null);
        setUser(null);
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error('Token verification error:', error);
      localStorage.removeItem('authToken');
      localStorage.removeItem('authUser');
      setToken(null);
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (data.success) {
        const { token: newToken, user: userData } = data;
        const normalizedUser = normalizeUser(userData);
        
        // Store in localStorage
        localStorage.setItem('authToken', newToken);
        localStorage.setItem('authUser', JSON.stringify(normalizedUser));
        
        // Update state
        setToken(newToken);
        setUser(normalizedUser);
        setIsAuthenticated(true);
        
        return { success: true, message: 'Login successful' };
      } else {
        return {
          success: false,
          message: data.message || 'Login failed'
        };
      }
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        message: error.message || 'An error occurred during login'
      };
    }
  };

  const logout = async () => {
    try {
      if (token) {
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear localStorage and state
      localStorage.removeItem('authToken');
      localStorage.removeItem('authUser');
      setToken(null);
      setUser(null);
      setIsAuthenticated(false);
    }
  };

  const updateUserInfo = (updatedUser) => {
    setNormalizedUser(updatedUser);
  };

  const hasPermission = (permission) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (!Array.isArray(user.permissions)) return false;
    return user.permissions.includes(permission);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated,
        isLoading,
        login,
        logout,
        updateUserInfo,
        hasPermission
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
