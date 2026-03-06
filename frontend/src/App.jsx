import { useState, useEffect } from "react"
import axios from "axios"

function App() {
  const [city, setCity] = useState("")
  const [weather, setWeather] = useState(null)
  const [locationError, setLocationError] = useState(false)
  const [manualCity, setManualCity] = useState("")
  const [weatherError, setWeatherError] = useState(false)

  const apiKey = import.meta.env.VITE_WEATHER_API_KEY

  const fetchWeatherByCoords = async (lat, lon) => {
    try {
      const res = await axios.get(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`
      )
      setWeather(res.data)
      setCity(res.data.name)
    } catch {
      setWeatherError(true)
    }
  }

  const fetchWeatherByCity = async (cityName) => {
    try {
      const res = await axios.get(
        `https://api.openweathermap.org/data/2.5/weather?q=${cityName}&appid=${apiKey}&units=metric`
      )
      setWeather(res.data)
      setCity(res.data.name)
    } catch {
      setWeatherError(true)
    }
  }

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        fetchWeatherByCoords(latitude, longitude)
      },
      () => setLocationError(true)
    )
  }, [])

  const getWeatherIcon = (condition) => {
    if (!condition) return "🌤️"
    const c = condition.toLowerCase()
    if (c.includes("rain") || c.includes("drizzle")) return "🌧️"
    if (c.includes("thunder")) return "⛈️"
    if (c.includes("cloud")) return "☁️"
    if (c.includes("clear")) return "☀️"
    if (c.includes("snow")) return "❄️"
    if (c.includes("mist") || c.includes("fog")) return "🌫️"
    return "🌤️"
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0f172a",
      color: "white",
      fontFamily: "Arial, sans-serif",
      padding: "30px",
      maxWidth: "420px",
      margin: "0 auto"
    }}>

      {/* Header */}
      <h1 style={{ fontSize: "2rem", marginBottom: "4px" }}>☀️ SunWise</h1>
      <p style={{ color: "#64748b", fontSize: "0.9rem", marginBottom: "24px" }}>
        Smart Laundry Drying Advisor
      </p>

      {/* Location denied */}
      {locationError && (
        <div style={{ marginBottom: "20px" }}>
          <p style={{ marginBottom: "8px" }}>
            📍 Location access denied. Enter your city:
          </p>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              value={manualCity}
              onChange={(e) => setManualCity(e.target.value)}
              placeholder="e.g. Caloocan"
              style={{
                flex: 1, padding: "8px 12px",
                borderRadius: "8px", border: "none", color: "black"
              }}
            />
            <button
              onClick={() => fetchWeatherByCity(manualCity)}
              style={{
                padding: "8px 16px", borderRadius: "8px",
                background: "#f59e0b", color: "white",
                border: "none", cursor: "pointer", fontWeight: "bold"
              }}
            >
              Go
            </button>
          </div>
        </div>
      )}

      {/* Weather Card */}
      {weather ? (
        <div style={{
          background: "#1e293b",
          borderRadius: "16px",
          padding: "24px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.3)"
        }}>
          <div style={{ fontSize: "0.9rem", color: "#94a3b8", marginBottom: "4px" }}>
            📍 {city}
          </div>
          <div style={{ fontSize: "3.5rem", margin: "8px 0" }}>
            {getWeatherIcon(weather.weather[0].description)}
          </div>
          <div style={{ fontSize: "3rem", fontWeight: "bold", marginBottom: "4px" }}>
            {Math.round(weather.main.temp)}°C
          </div>
          <div style={{
            color: "#94a3b8",
            textTransform: "capitalize",
            marginBottom: "20px"
          }}>
            {weather.weather[0].description}
          </div>

          {/* Weather Stats Grid */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px"
          }}>
            {[
              { label: "Humidity", value: `${weather.main.humidity}%`, icon: "💧" },
              { label: "Wind Speed", value: `${Math.round(weather.wind.speed * 3.6)} km/h`, icon: "💨" },
              { label: "Rain (1h)", value: weather.rain ? `${weather.rain["1h"] || 0} mm` : "None", icon: "🌧️" },
              { label: "Feels Like", value: `${Math.round(weather.main.feels_like)}°C`, icon: "🌡️" },
            ].map((item) => (
              <div key={item.label} style={{
                background: "#0f172a",
                borderRadius: "10px",
                padding: "12px",
                textAlign: "center"
              }}>
                <div style={{ fontSize: "1.2rem", marginBottom: "4px" }}>{item.icon}</div>
                <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "2px" }}>
                  {item.label}
                </div>
                <div style={{ fontSize: "1.1rem", fontWeight: "bold" }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>

      ) : !locationError && !weatherError ? (
        <p style={{ color: "#64748b" }}>⏳ Detecting your location...</p>
      ) : weatherError ? (
        <p style={{ color: "#f87171" }}>
          Could not fetch weather. Check your city name and try again.
        </p>
      ) : null}

    </div>
  )
}

export default App