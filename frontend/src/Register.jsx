import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import axios from "axios"

const API = import.meta.env.VITE_API_URL || API

const API = API

export default function Register() {
  const [form, setForm]       = useState({ username: "", email: "", password: "", confirm: "" })
  const [error, setError]     = useState("")
  const [success, setSuccess] = useState("")
  const [loading, setLoading] = useState(false)
  const navigate              = useNavigate()

  const update = (field, val) => setForm(f => ({ ...f, [field]: val }))

  const handleRegister = async () => {
    setError(""); setSuccess("")

    if (!form.username || !form.email || !form.password || !form.confirm) {
      setError("All fields are required."); return
    }
    if (form.password !== form.confirm) {
      setError("Passwords do not match."); return
    }

    setLoading(true)
    try {
      await axios.post(`${API}/register`, {
        username: form.username,
        email:    form.email,
        password: form.password
      })
      setSuccess("Registration successful! Redirecting to login...")
      setTimeout(() => navigate("/login"), 1500)
    } catch (err) {
      if (err.response?.status === 429) {
          setError("Too many registration attempts. Please wait.")
      } else {
          setError(err.response?.data?.error || "Registration failed. Please try again.")
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
        
        <h2 className="font-heading" style={{ color: "var(--text-main)", marginBottom: "24px", fontSize: "1.5rem" }}>Create Account</h2>

        {error   && <div style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid var(--danger)", color: "var(--danger)", padding: "10px", borderRadius: "8px", marginBottom: "16px", fontSize: "0.85rem" }}>{error}</div>}
        {success && <div style={{ background: "rgba(34, 197, 94, 0.1)", border: "1px solid var(--success)", color: "var(--success)", padding: "10px", borderRadius: "8px", marginBottom: "16px", fontSize: "0.85rem" }}>{success}</div>}

        {[
          { field: "username", placeholder: "Username",        type: "text" },
          { field: "email",    placeholder: "Email address",   type: "email" },
          { field: "password", placeholder: "Password",        type: "password" },
          { field: "confirm",  placeholder: "Confirm password",type: "password" },
        ].map(({ field, placeholder, type }) => (
          <input
            key={field}
            className="input-field"
            type={type}
            placeholder={placeholder}
            value={form[field]}
            onChange={e => update(field, e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleRegister()}
          />
        ))}

        <p style={{ color: "var(--text-muted)", fontSize: "0.78rem", marginBottom: "14px", lineHeight: "1.5", textAlign: "left" }}>
          Password must be 8 to 32 characters and include an uppercase letter, a number, and a special character.
        </p>

        <button
          className="btn-primary"
          onClick={handleRegister}
          disabled={loading}
          style={{ opacity: loading ? 0.7 : 1 }}
        >
          {loading ? "Registering..." : "Register"}
        </button>

        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: "24px" }}>
          Already have an account? <Link to="/login" style={{ color: "var(--accent-teal)", textDecoration: "none", fontWeight: "600" }}>Log in here</Link>
        </p>
      </div>
    </div>
  )
}