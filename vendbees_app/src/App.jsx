import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Machines from "./pages/Machines";
import Restock from "./pages/Restock";
import CreateBatchPage from "./pages/CreateBatchPage";
import MachineOut from "./pages/MachineOut";
import Inventory from "./pages/Inventory";
import RecordDeliveryPage from "./pages/RecordDeliveryPage";
import Warehouse from "./pages/Warehouse";
import Notifications from "./pages/Notifications";
import POApproval from "./pages/POApproval";
import LoginPage from "./pages/LoginPage";
import UserManagement from "./pages/UserManagement";
import Complaints from "./pages/Complaints";
import GenerateBill from "./pages/GenerateBill";
import { DataProvider } from "./context/DataContext";
import { AuthProvider } from "./context/AuthContext";
import { WhatsAppNotificationProvider } from "./context/WhatsAppNotificationContext";
import ProtectedRoute from "./components/ProtectedRoute";

function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <WhatsAppNotificationProvider>
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
                <Route path="machine-out" element={<MachineOut />} />
                <Route path="inventory" element={<Inventory />} />
                <Route path="inventory/record-delivery" element={<RecordDeliveryPage />} />
                <Route path="warehouse" element={<Warehouse />} />
                <Route path="complaints" element={<Complaints />} />
                <Route path="generate-bill" element={<GenerateBill />} />
                <Route path="notifications" element={<Notifications />} />
                <Route element={<ProtectedRoute allowedRoles={["manager"]} />}>
                  <Route path="po-approval" element={<POApproval />} />
                </Route>
                <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
                  <Route path="users" element={<UserManagement />} />
                </Route>
              </Route>
            </Route>
          </Routes>
        </Router>
        </WhatsAppNotificationProvider>
      </DataProvider>
    </AuthProvider>
  );
}

export default App;
