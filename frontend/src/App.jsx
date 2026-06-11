import React, { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { DataProvider } from "./DataContext";
import Navbar from "./components/Navbar";
import AIChatbot from "./components/AIChatbot";

const Login = lazy(() => import("./Login"));
const Register = lazy(() => import("./Register"));
const Admin = lazy(() => import("./Admin"));
const Home = lazy(() => import("./pages/Home"));
const Weather = lazy(() => import("./pages/Weather"));
const Destinations = lazy(() => import("./pages/Destinations"));
const Planner = lazy(() => import("./pages/Planner"));


const PageLoader = () => (
  <div style={{ height: "80vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", color: "var(--text-muted)" }}>
    <span className="spinner" style={{ width: "32px", height: "32px" }}></span>
    <span style={{ fontSize: "0.9rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>Loading page...</span>
  </div>
);

export default function App() {
  const { token, role } = useAuth();

  if (!token) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <DataProvider>
      <Navbar />
      <AIChatbot />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/home" element={<Home />} />
          <Route path="/weather" element={<Weather />} />
          <Route path="/destinations" element={<Destinations />} />
          <Route path="/planner" element={<Planner />} />
          {role === "admin" && <Route path="/admin" element={<Admin />} />}
          
          {/* Default route redirect */}
          <Route path="*" element={<Navigate to={role === "admin" ? "/admin" : "/home"} />} />
        </Routes>
      </Suspense>
    </DataProvider>
  );
}