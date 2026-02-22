import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Machines from "./pages/Machines";
import Restock from "./pages/Restock";
import Inventory from "./pages/Inventory";
import Warehouse from "./pages/Warehouse";
import Notifications from "./pages/Notifications";
import { DataProvider } from "./context/DataContext";

function App() {
  return (
    <DataProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="machines" element={<Machines />} />
            <Route path="restock" element={<Restock />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="warehouse" element={<Warehouse />} />
            <Route path="notifications" element={<Notifications />} />
          </Route>
        </Routes>
      </Router>
    </DataProvider>
  );
}

export default App;
