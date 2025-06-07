import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './components/Auth/AuthContext';
import PrivateRoute from './components/Auth/PrivateRoute';
import Home from './pages/Home';
import Meeting from './pages/Meeting';
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import { User } from './types';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    // Check for stored auth data
    const storedUser = localStorage.getItem('user');
    const storedToken = localStorage.getItem('token');

    if (storedUser && storedToken) {
      setUser(JSON.parse(storedUser));
      setToken(storedToken);
    }
  }, []);

  const handleLogin = (user: User, token: string) => {
    setUser(user);
    setToken(token);
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('token', token);
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
  };

  return (
    <AuthProvider value={{ user, token }}>
      <Routes>
        <Route path="/login" element={
          user ? <Navigate to="/" /> : <Login onLogin={handleLogin} />
        } />
        <Route path="/register" element={
          user ? <Navigate to="/" /> : <Register onLogin={handleLogin} />
        } />
        <Route path="/" element={
          <PrivateRoute>
            <Home user={user!} token={token!} onLogout={handleLogout} />
          </PrivateRoute>
        } />
        <Route path="/meeting/:meetingId" element={
          <PrivateRoute>
            <Meeting user={user!} token={token!} />
          </PrivateRoute>
        } />
      </Routes>
    </AuthProvider>
  );
};

export default App;