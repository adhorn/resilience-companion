import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { ORRList } from "./pages/ORRList";
import { NewORR } from "./pages/NewORR";
import { ORRView } from "./pages/ORRView";
import { Learn } from "./pages/Learn";
import { Flags } from "./pages/Flags";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/orrs" element={<ORRList />} />
          <Route path="/orrs/new" element={<NewORR />} />
          <Route path="/flags" element={<Flags />} />
          <Route path="/learn" element={<Learn />} />
        </Route>
        {/* ORRView is full-screen — no app sidebar */}
        <Route path="/orrs/:id" element={<ORRView />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
