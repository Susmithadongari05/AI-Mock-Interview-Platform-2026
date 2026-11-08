// ============================================
// AuthContext.jsx - Authentication State
// ============================================
// Manages user login state across the app.
// Reference: createContext, useState, useEffect - reference-react.md
// ============================================

import { createContext, useState, useEffect } from 'react';
import { getMe } from '../services/authService.js';

const AuthContext = createContext(null);

function AuthProvider({ children }) {
  // State: current user data and loading status
  // Reference: useState hook - reference-react.md
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount: check if user is already logged in via stored token
  // Reference: useEffect hook - reference-react.md
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const userData = await getMe();
        setUser(userData);
      } catch (error) {
        // Only an authentication failure invalidates the stored session. A network error or
        // a temporarily unavailable server must not silently log the user out.
        if (error.response?.status === 401) {
          localStorage.removeItem('token');
        } else {
          console.error('Could not verify the session:', error.message);
        }
      }
      setLoading(false);
    };

    checkAuth();
  }, []);

  // Login: save token and set user
  const login = (token, userData) => {
    localStorage.setItem('token', token);
    setUser(userData);
  };

  // Logout: remove token and clear user
  const logoutUser = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout: logoutUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export { AuthContext, AuthProvider };
