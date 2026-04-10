import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { useAuth } from "./AuthContext"
import axios from "axios"

const API = "http://localhost:5000"

export default function Login() {
  const [email, setEmail]       = useState("")
  const [password, setPassword] = useState("")
  const [error, setError]       = useState("")
  const [loading, setLoading]   = useState(false)
  const { login }               = useAuth()
  const navigate                = useNavigate()

  const handleLogin = async () => {
    setError("")
    if (!email || !password) {
      setError("All fields are required.")
      return
    }
    setLoading(true)
    try {
      const res = await axios.post(`${API}/login`, { email, password })
      login(res.data.token, res.data.username)
      navigate("/")
    } catch (err) {
      setError(err.response?.data?.error || "Login failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.logo}>☀️ SunWise</h1>
        <p style={styles.sub}>Weather-Aware Tourist Destination Recommender</p>
        <h2 style={styles.heading}>Log In</h2>

        {error && <p style={styles.error}>{error}</p>}

        <input
          style={styles.input}
          type="email"
          placeholder="Email address"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleLogin()}
        />
        <input
          style={styles.input}
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleLogin()}
        />

        <button
          style={{ ...styles.btn, opacity: loading ? 0.7 : 1 }}
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? "Logging in..." : "Log In"}
        </button>

        <p style={styles.footer}>
          No account yet?{" "}
          <Link to="/register" style={styles.link}>Register here</Link>
        </p>
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: "100vh", background: "#0b1120",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: "20px", fontFamily: "Outfit, Arial, sans-serif"
  },
  card: {
    background: "#161f35", borderRadius: "16px",
    padding: "40px 32px", width: "100%", maxWidth: "400px",
    border: "1px solid #1e2d4a"
  },
  logo: { color: "#f59e0b", fontSize: "1.8rem", margin: "0 0 4px" },
  sub:  { color: "#64748b", fontSize: "0.85rem", margin: "0 0 28px" },
  heading: { color: "#f0f4ff", fontSize: "1.3rem", margin: "0 0 20px" },
  input: {
    width: "100%", padding: "11px 14px", marginBottom: "12px",
    background: "#1c2a45", border: "1px solid #2a3a5c",
    borderRadius: "10px", color: "#f0f4ff", fontSize: "0.95rem",
    fontFamily: "Outfit, Arial, sans-serif", boxSizing: "border-box", outline: "none"
  },
  btn: {
    width: "100%", padding: "13px", background: "#f59e0b",
    color: "#0b1120", border: "none", borderRadius: "10px",
    fontWeight: "700", fontSize: "1rem", cursor: "pointer",
    fontFamily: "Outfit, Arial, sans-serif", marginTop: "4px"
  },
  error:  { color: "#f87171", fontSize: "0.85rem", marginBottom: "12px" },
  footer: { color: "#64748b", fontSize: "0.85rem", marginTop: "20px", textAlign: "center" },
  link:   { color: "#f59e0b", textDecoration: "none" }
}