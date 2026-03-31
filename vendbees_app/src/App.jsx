import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Machines from "./pages/Machines";
import Restock from "./pages/Restock";
import CreateBatchPage from "./pages/CreateBatchPage";
import Inventory from "./pages/Inventory";
import Warehouse from "./pages/Warehouse";
import Notifications from "./pages/Notifications";
import LoginPage from "./pages/LoginPage";
import UserManagement from "./pages/UserManagement";
import { DataProvider } from "./context/DataContext";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";

function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <Router>
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<LoginPage />} />
            
            {/* Protected Routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="machines" element={<Machines />} />
                <Route path="restock" element={<Restock />} />
                <Route path="restock/create-batch" element={<CreateBatchPage />} />
                <Route path="inventory" element={<Inventory />} />
                <Route path="warehouse" element={<Warehouse />} />
                <Route path="notifications" element={<Notifications />} />
              </Route>
            </Route>

            {/* Admin Only Routes */}
            <Route element={<ProtectedRoute requiredRole="admin" />}>
              <Route path="/users" element={<UserManagement />} />
            </Route>

            {/* Catch all - redirect to login */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </Router>
      </DataProvider>
    </AuthProvider>
  );
}

export default App;
