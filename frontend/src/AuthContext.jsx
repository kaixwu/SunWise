import { createContext, useContext, useState, useEffect } from "react"
import axios from "axios"
const API = import.meta.env.VITE_API_URL || API


const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken]       = useState(null)
  const [username, setUsername] = useState(null)
  const [role, setRole]         = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Check if the user has a valid HttpOnly cookie session
    axios.get(`${API}/api/check-auth`)
      .then(res => {
        setToken("cookie_active") // We just need a truthy value for App.jsx
        setUsername(res.data.username)
        setRole(res.data.role)
      })
      .catch(() => {
        setToken(null)
        setUsername(null)
        setRole(null)
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [])

  const login = (tok, user, userRole) => {
    // tok parameter is kept for compatibility, but the real token is in the cookie
    setToken(tok || "cookie_active")
    setUsername(user)
    setRole(userRole)
  }

  const logout = () => {
    axios.post(`${API}/logout`).finally(() => {
      setToken(null)
      setUsername(null)
      setRole(null)
    })
  }

  if (isLoading) {
    return <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-dark)", color: "#fff" }}><span className="spinner"></span> Restoring session...</div>
  }

  return (
    <AuthContext.Provider value={{ token, username, role, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}