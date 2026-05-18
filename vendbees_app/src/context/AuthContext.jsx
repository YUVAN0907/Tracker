import { createContext, useContext, useEffect, useState } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize auth state from localStorage
  useEffect(() => {
    const storedToken = localStorage.getItem('authToken');
    const storedUser = localStorage.getItem('authUser');

    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
      
      // Verify token with backend
      verifyToken(storedToken);
    } else {
      setIsLoading(false);
    }
  }, []);

  const verifyToken = async (tokenToVerify) => {
    try {
      const response = await fetch('https://vendbees-inventory-backend-333114755202.asia-south1.run.app/api/auth/verify-token', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${tokenToVerify}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        setIsAuthenticated(true);
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
      const response = await fetch('https://vendbees-inventory-backend-333114755202.asia-south1.run.app/api/auth/login', {
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
        
        // Store in localStorage
        localStorage.setItem('authToken', newToken);
        localStorage.setItem('authUser', JSON.stringify(userData));
        
        // Update state
        setToken(newToken);
        setUser(userData);
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
        await fetch('https://vendbees-inventory-backend-333114755202.asia-south1.run.app/api/auth/logout', {
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
    setUser(updatedUser);
    localStorage.setItem('authUser', JSON.stringify(updatedUser));
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
        updateUserInfo
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
