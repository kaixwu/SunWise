import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { Home, CloudRain, Map, Calendar, ShieldCheck, LogOut, User } from "lucide-react";
const API = import.meta.env.VITE_API_URL || API

export default function Navbar() {
  const { username, role, logout } = useAuth();
  const location = useLocation();

  const navItems = [
    { name: "Home", path: "/home", icon: <Home size={18} /> },
    { name: "Weather", path: "/weather", icon: <CloudRain size={18} /> },
    { name: "Destinations", path: "/destinations", icon: <Map size={18} /> },
    { name: "Planner", path: "/planner", icon: <Calendar size={18} /> },
  ];

  if (role === "admin") {
    navItems.push({ name: "Admin Dashboard", path: "/admin", icon: <ShieldCheck size={18} /> });
  }

  return (
    <nav style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "16px 32px", background: "var(--glass-bg)",
      backdropFilter: "blur(12px)", borderBottom: "1px solid var(--glass-border)",
      marginBottom: "24px", position: "sticky", top: 0, zIndex: 1000
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "32px" }}>
        <Link to="/home" style={{ textDecoration: "none" }}>
          <h1 className="font-heading" style={{ color: "var(--accent-blue)", fontSize: "1.5rem", margin: 0 }}>SunWise</h1>
        </Link>
        <div style={{ display: "flex", gap: "16px" }}>
          {navItems.map(item => (
            <Link key={item.name} to={item.path} style={{
              textDecoration: "none",
              color: location.pathname === item.path ? "var(--accent-blue)" : "var(--text-muted)",
              fontWeight: location.pathname === item.path ? "700" : "500",
              padding: "8px 12px",
              borderRadius: "8px",
              background: location.pathname === item.path ? "rgba(56, 189, 248, 0.1)" : "transparent",
              transition: "all 0.2s",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}>
              {item.icon} {item.name}
            </Link>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <span style={{ color: "var(--text-muted)", fontSize: "0.9rem", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}>
          <User size={16} /> {username}
        </span>
        <button onClick={logout} className="btn-chip" style={{ border: "1px solid var(--danger)", color: "var(--danger)", padding: "8px 16px", display: "flex", alignItems: "center", gap: "6px" }}>
          <LogOut size={16} /> Log Out
        </button>
      </div>
    </nav>
  );
}
