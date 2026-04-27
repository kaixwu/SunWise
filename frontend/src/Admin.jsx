import { useState, useEffect } from "react";
import axios from "axios";
import { useAuth } from "./AuthContext";
import { Link } from "react-router-dom";

const API = import.meta.env.VITE_API_URL || API

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function Admin() {
  const { token, role, logout } = useAuth();
  const [tab, setTab] = useState("users");
  
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  
  const [destForm, setDestForm] = useState({ name: "", lat: "", lon: "", type: "Outdoor", category: "Landmark" });
  const [destMsg, setDestMsg] = useState("");

  useEffect(() => {
    if (role !== "admin") return;
    if (tab === "users") fetchUsers();
    if (tab === "logs") fetchLogs();
  }, [tab, role]);

  const fetchUsers = async () => {
    try {
      const res = await axios.get(`${API}/admin/users`);
      setUsers(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await axios.get(`${API}/admin/logs`);
      setLogs(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const toggleBan = async (id) => {
    try {
      await axios.post(`${API}/admin/users/${id}/ban`, {});
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.error || "Error banning user");
    }
  };

  const addDestination = async () => {
    setDestMsg("");
    try {
      await axios.post(`${API}/admin/destinations`, destForm);
      setDestMsg("Destination added successfully!");
      setDestForm({ name: "", lat: "", lon: "", type: "Outdoor", category: "Landmark" });
    } catch (err) {
      setDestMsg("Error adding destination.");
    }
  };

  if (role !== "admin") {
    return (
      <div className="auth-container">
        <div className="glass-card" style={{ textAlign: "center" }}>
          <h2>Access Denied</h2>
          <p>You do not have permission to view the Command Center.</p>
          <Link to="/" className="btn-primary" style={{ display: "inline-block", marginTop: "20px", textDecoration: "none" }}>Go Back</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "40px", maxWidth: "1200px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
        <h1 className="font-heading" style={{ color: "var(--accent-blue)" }}>🛡️ IAS Command Center</h1>
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
          <button onClick={logout} style={{ padding: "6px 12px", background: "transparent", border: "1px solid var(--danger)", color: "var(--danger)", borderRadius: "6px", cursor: "pointer" }}>Log Out</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: "16px", marginBottom: "24px" }}>
        <button className={`btn-chip ${tab === "users" ? "active" : ""}`} onClick={() => setTab("users")}>Users Management</button>
        <button className={`btn-chip ${tab === "logs" ? "active" : ""}`} onClick={() => setTab("logs")}>Security Audit Logs</button>
        <button className={`btn-chip ${tab === "add" ? "active" : ""}`} onClick={() => setTab("add")}>Add Destinations</button>
      </div>

      {tab === "users" && (
        <div className="glass-card">
          <h2 className="font-heading" style={{ marginBottom: "16px" }}>Manage Users</h2>
          <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--glass-border)" }}>
                <th style={{ padding: "12px" }}>ID</th>
                <th style={{ padding: "12px" }}>Username</th>
                <th style={{ padding: "12px" }}>Email</th>
                <th style={{ padding: "12px" }}>Role</th>
                <th style={{ padding: "12px" }}>Status</th>
                <th style={{ padding: "12px" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <td style={{ padding: "12px" }}>{u.id}</td>
                  <td style={{ padding: "12px" }}>{u.username}</td>
                  <td style={{ padding: "12px" }}>{u.email}</td>
                  <td style={{ padding: "12px" }}>{u.role}</td>
                  <td style={{ padding: "12px" }}>
                    <span style={{ color: u.is_banned ? "var(--danger)" : "var(--success)" }}>
                      {u.is_banned ? "Banned" : "Active"}
                    </span>
                  </td>
                  <td style={{ padding: "12px" }}>
                    {u.role !== 'admin' && (
                      <button 
                        onClick={() => toggleBan(u.id)}
                        style={{ padding: "6px 12px", background: u.is_banned ? "var(--success)" : "var(--danger)", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer" }}
                      >
                        {u.is_banned ? "Unban" : "Ban"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "logs" && (
        <div className="glass-card">
          <h2 className="font-heading" style={{ marginBottom: "16px" }}>Brute-Force & Security Logs</h2>
          <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--glass-border)" }}>
                <th style={{ padding: "12px" }}>Time</th>
                <th style={{ padding: "12px" }}>IP Address</th>
                <th style={{ padding: "12px" }}>Email Attempted</th>
                <th style={{ padding: "12px" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", color: l.status.includes("FAIL") ? "var(--danger)" : "var(--text-main)" }}>
                  <td style={{ padding: "12px" }}>{l.time}</td>
                  <td style={{ padding: "12px", fontFamily: "monospace" }}>{l.ip}</td>
                  <td style={{ padding: "12px" }}>{l.email}</td>
                  <td style={{ padding: "12px", fontWeight: "600" }}>{l.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "add" && (
        <div className="glass-card" style={{ maxWidth: "500px" }}>
          <h2 className="font-heading" style={{ marginBottom: "8px" }}>Curate Destination</h2>
          
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "16px" }}>
            Tip: Go to <a href="https://www.google.com/maps" target="_blank" rel="noreferrer" style={{ color: "var(--accent-blue)", textDecoration: "none" }}>Google Maps🗺️</a> and right-click on any place to copy its exact Latitude and Longitude!
          </p>

          {destMsg && <p style={{ color: destMsg.includes("Error") ? "var(--danger)" : "var(--success)", marginBottom: "16px" }}>{destMsg}</p>}
          
          <input className="input-field" placeholder="Target Name (e.g. Rizal Park)" value={destForm.name} onChange={e => setDestForm({...destForm, name: e.target.value})} />
          <div style={{ display: "flex", gap: "12px" }}>
            <input className="input-field" placeholder="Latitude" type="number" value={destForm.lat} onChange={e => setDestForm({...destForm, lat: e.target.value})} />
            <input className="input-field" placeholder="Longitude" type="number" value={destForm.lon} onChange={e => setDestForm({...destForm, lon: e.target.value})} />
          </div>
          
          <select className="input-field" value={destForm.type} onChange={e => setDestForm({...destForm, type: e.target.value})}>
            <option value="Outdoor">Outdoor</option>
            <option value="Indoor">Indoor</option>
          </select>
          
          <select className="input-field" value={destForm.category} onChange={e => setDestForm({...destForm, category: e.target.value})}>
            <option value="Landmark">Landmark</option>
            <option value="Nature">Nature</option>
            <option value="Museum">Museum</option>
            <option value="Heritage">Heritage</option>
            <option value="Park">Park</option>
            <option value="Beach">Beach</option>
          </select>

          <button className="btn-primary" onClick={addDestination}>Save Destination to Database</button>
        </div>
      )}
    </div>
  );
}
