import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import axios from "axios"

const API = "http://localhost:5000"

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
      setError(err.response?.data?.error || "Registration failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.logo}>☀️ SunWise</h1>
        <p style={styles.sub}>Weather-Aware Tourist Destination Recommender</p>
        <h2 style={styles.heading}>Create Account</h2>

        {error   && <p style={styles.error}>{error}</p>}
        {success && <p style={styles.success}>{success}</p>}

        {[
          { field: "username", placeholder: "Username",        type: "text" },
          { field: "email",    placeholder: "Email address",   type: "email" },
          { field: "password", placeholder: "Password",        type: "password" },
          { field: "confirm",  placeholder: "Confirm password",type: "password" },
        ].map(({ field, placeholder, type }) => (
          <input
            key={field}
            style={styles.input}
            type={type}
            placeholder={placeholder}
            value={form[field]}
            onChange={e => update(field, e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleRegister()}
          />
        ))}

        <p style={styles.hint}>
          Password must be 8 to 32 characters and include an uppercase letter, a number, and a special character.
        </p>

        <button
          style={{ ...styles.btn, opacity: loading ? 0.7 : 1 }}
          onClick={handleRegister}
          disabled={loading}
        >
          {loading ? "Registering..." : "Register"}
        </button>

        <p style={styles.footer}>
          Already have an account?{" "}
          <Link to="/login" style={styles.link}>Log in here</Link>
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
  logo:    { color: "#f59e0b", fontSize: "1.8rem", margin: "0 0 4px" },
  sub:     { color: "#64748b", fontSize: "0.85rem", margin: "0 0 28px" },
  heading: { color: "#f0f4ff", fontSize: "1.3rem", margin: "0 0 20px" },
  input: {
    width: "100%", padding: "11px 14px", marginBottom: "12px",
    background: "#1c2a45", border: "1px solid #2a3a5c",
    borderRadius: "10px", color: "#f0f4ff", fontSize: "0.95rem",
    fontFamily: "Outfit, Arial, sans-serif", boxSizing: "border-box", outline: "none"
  },
  hint:    { color: "#64748b", fontSize: "0.78rem", marginBottom: "14px", lineHeight: "1.5" },
  btn: {
    width: "100%", padding: "13px", background: "#f59e0b",
    color: "#0b1120", border: "none", borderRadius: "10px",
    fontWeight: "700", fontSize: "1rem", cursor: "pointer",
    fontFamily: "Outfit, Arial, sans-serif", marginTop: "4px"
  },
  error:   { color: "#f87171", fontSize: "0.85rem", marginBottom: "12px" },
  success: { color: "#4ade80", fontSize: "0.85rem", marginBottom: "12px" },
  footer:  { color: "#64748b", fontSize: "0.85rem", marginTop: "20px", textAlign: "center" },
  link:    { color: "#f59e0b", textDecoration: "none" }
}