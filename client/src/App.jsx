import { Routes, Route, Navigate } from 'react-router-dom';

import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import InterviewSetupPage from './pages/InterviewSetupPage';
import InterviewPage from './pages/InterviewPage';
import FeedbackPage from './pages/FeedbackPage';
import HistoryPage from './pages/HistoryPage';

import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';

import './App.css';


function App() {
  return (
    <div className="app-shell">

      <Routes>

        {/* ============================= */}
        {/* LOGIN */}
        {/* ============================= */}

        <Route
          path="/login"
          element={<LoginPage />}
        />


        {/* ============================= */}
        {/* HOME */}
        {/* ============================= */}

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <>
                <Navbar />
                <HomePage />
              </>
            </ProtectedRoute>
          }
        />


        {/* ============================= */}
        {/* INTERVIEW SETUP */}
        {/* ============================= */}

        <Route
          path="/setup"
          element={
            <ProtectedRoute>
              <>
                <Navbar />
                <InterviewSetupPage />
              </>
            </ProtectedRoute>
          }
        />


        {/* ============================= */}
        {/* INTERVIEW */}
        {/* ============================= */}

        <Route
          path="/interview/:id"
          element={
            <ProtectedRoute>
              <>
                <Navbar />
                <InterviewPage />
              </>
            </ProtectedRoute>
          }
        />


        {/* ============================= */}
        {/* FEEDBACK */}
        {/* ============================= */}

        <Route
          path="/feedback/:id"
          element={
            <ProtectedRoute>
              <>
                <Navbar />
                <FeedbackPage />
              </>
            </ProtectedRoute>
          }
        />


        {/* ============================= */}
        {/* HISTORY */}
        {/* ============================= */}

        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <>
                <Navbar />
                <HistoryPage />
              </>
            </ProtectedRoute>
          }
        />


        {/* ============================= */}
        {/* UNKNOWN URL */}
        {/* ============================= */}

        <Route
          path="*"
          element={
            <Navigate
              to="/"
              replace
            />
          }
        />

      </Routes>

    </div>
  );
}


export default App;