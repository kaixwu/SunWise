import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { useAuth } from "./AuthContext"
import axios from "axios"

const API = import.meta.env.VITE_API_URL || API

const API = API

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
      login(res.data.token, res.data.username, res.data.role)
      navigate("/")
    } catch (err) {
      if (err.response?.status === 429) {
          setError("Too many login attempts. Please wait.")
      } else {
          setError(err.response?.data?.error || "Login failed. Please try again.")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-box glass-card" style={{ padding: "40px", textAlign: "center" }}>
        <h1 className="font-heading" style={{ color: "var(--accent-blue)", fontSize: "2.5rem", marginBottom: "8px" }}>☀️ SunWise</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", marginBottom: "32px", fontFamily: "var(--font-heading)" }}>Weather-Aware Tourist Destination Recommender</p>
        
        <h2 className="font-heading" style={{ color: "var(--text-main)", marginBottom: "24px", fontSize: "1.5rem" }}>Welcome Back</h2>

        {error && <div style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid var(--danger)", color: "var(--danger)", padding: "10px", borderRadius: "8px", marginBottom: "16px", fontSize: "0.85rem" }}>{error}</div>}

        <input
          className="input-field"
          type="email"
          placeholder="Email address"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleLogin()}
        />
        <input
          className="input-field"
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleLogin()}
        />

        <button
          className="btn-primary"
          onClick={handleLogin}
          disabled={loading}
          style={{ marginTop: "12px", opacity: loading ? 0.7 : 1 }}
        >
          {loading ? "Authenticating..." : "Log In"}
        </button>

        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: "24px" }}>
          No account yet? <Link to="/register" style={{ color: "var(--accent-teal)", textDecoration: "none", fontWeight: "600" }}>Register here</Link>
        </p>
      </div>
    </div>
  )
}