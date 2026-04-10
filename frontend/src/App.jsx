import { useState, useEffect } from "react";
import axios from "axios";
import "./index.css";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import Login from "./Login";
import Register from "./Register";

const API_KEY = import.meta.env.VITE_WEATHER_API_KEY;

const getWeatherIcon = (condition = "") => {
  const c = condition.toLowerCase();
  if (c.includes("thunder")) return "⛈️";
  if (c.includes("rain") || c.includes("drizzle")) return "🌧️";
  if (c.includes("cloud")) return "☁️";
  if (c.includes("clear")) return "☀️";
  if (c.includes("snow")) return "❄️";
  if (c.includes("mist") || c.includes("fog")) return "🌫️";
  return "🌤️";
};

export default function App() {
  const { token, username, logout } = useAuth();

  const [city, setCity]                   = useState("");
  const [weather, setWeather]             = useState(null);
  const [forecast, setForecast]           = useState([]);
  const [locationError, setLocationError] = useState(false);
  const [weatherError, setWeatherError]   = useState(false);
  const [manualCity, setManualCity]       = useState("");
  const [loading, setLoading]             = useState(true);

  const fetchAll = async (lat, lon, cityName = null) => {
    setLoading(true);
    setWeatherError(false);
    try {
      const [weatherRes, forecastRes] = await Promise.all([
        cityName
          ? axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${cityName}&appid=${API_KEY}&units=metric`)
          : axios.get(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`),
        cityName
          ? axios.get(`https://api.openweathermap.org/data/2.5/forecast?q=${cityName}&appid=${API_KEY}&units=metric`)
          : axios.get(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`),
      ]);

      setWeather(weatherRes.data);
      setCity(weatherRes.data.name);

      const days = {};
      forecastRes.data.list.forEach((item) => {
        const date = item.dt_txt.split(" ")[0];
        if (!days[date]) days[date] = { temps: [], humidities: [], winds: [], rains: [], conditions: [] };
        days[date].temps.push(item.main.temp);
        days[date].humidities.push(item.main.humidity);
        days[date].winds.push(item.wind.speed * 3.6);
        days[date].rains.push((item.pop || 0) * 100);
        days[date].conditions.push(item.weather[0].description);
      });

      const today = new Date().toISOString().split("T")[0];
      const dailySummaries = Object.entries(days)
        .filter(([date]) => date !== today)
        .slice(0, 5)
        .map(([date, d]) => {
          const avg       = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
          const temp      = Math.round(avg(d.temps));
          const humidity  = Math.round(avg(d.humidities));
          const wind      = Math.round(avg(d.winds));
          const rainProb  = Math.round(avg(d.rains));
          const condition = d.conditions[Math.floor(d.conditions.length / 2)];
          const dayName   = new Date(date + "T12:00:00").toLocaleDateString("en-PH", { weekday: "short" });
          const dateLabel = new Date(date + "T12:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric" });
          return { date, dayName, dateLabel, temp, humidity, wind, rainProb, condition };
        });

      setForecast(dailySummaries);
    } catch {
      setWeatherError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => fetchAll(coords.latitude, coords.longitude),
      () => { setLocationError(true); setLoading(false); }
    );
  }, [token]);

  // ── AUTH GUARD ──────────────────────────────────────────────────────────────
  if (!token) {
    return (
      <Routes>
        <Route path="/login"    element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="*"         element={<Navigate to="/login" />} />
      </Routes>
    );
  }

  // ── MAIN APP ────────────────────────────────────────────────────────────────
  return (
    <div className="app">

      {/* Header */}
      <div className="header">
        <div className="header-title">
          <h1>☀️ SunWise</h1>
          <span className="header-subtitle">Weather-Aware Tourist Destination Recommender</span>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>👤 {username}</span>
          <button
            onClick={logout}
            style={{
              padding: "6px 14px",
              background: "transparent",
              border: "1px solid #334155",
              borderRadius: "8px",
              color: "#94a3b8",
              cursor: "pointer",
              fontSize: "0.85rem",
              fontFamily: "Outfit, Arial, sans-serif",
            }}
          >
            Log Out
          </button>
        </div>
      </div>

      {/* Manual city input */}
      {locationError && (
        <div className="manual-input">
          <p>📍 Location access denied. Enter your city:</p>
          <div className="input-row">
            <input
              value={manualCity}
              onChange={(e) => setManualCity(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchAll(null, null, manualCity)}
              placeholder="e.g. Caloocan"
            />
            <button onClick={() => fetchAll(null, null, manualCity)}>Go</button>
          </div>
        </div>
      )}

      {loading && <p className="loading">⏳ Detecting your location...</p>}
      {weatherError && (
        <p className="error">Could not fetch weather. Check your city name and try again.</p>
      )}

      {!loading && weather && (
        <div className="layout">

          {/* Weather Card */}
          <div className="weather-card">
            <div className="weather-city">📍 {city}</div>
            <div className="weather-icon">{getWeatherIcon(weather.weather[0].description)}</div>
            <div className="weather-temp">{Math.round(weather.main.temp)}°C</div>
            <div className="weather-desc">{weather.weather[0].description}</div>
            <div className="weather-stats">
              {[
                { icon: "💧", label: "Humidity",   value: `${weather.main.humidity}%` },
                { icon: "💨", label: "Wind Speed", value: `${Math.round(weather.wind.speed * 3.6)} km/h` },
                { icon: "🌧️", label: "Rain (1h)",  value: weather.rain ? `${weather.rain["1h"] || 0} mm` : "None" },
                { icon: "🌡️", label: "Feels Like", value: `${Math.round(weather.main.feels_like)}°C` },
              ].map((item) => (
                <div key={item.label} className="stat-card">
                  <div className="stat-icon">{item.icon}</div>
                  <div className="stat-label">{item.label}</div>
                  <div className="stat-value">{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 5-Day Forecast — placeholder until Gemini scores in Sprint 3 */}
          <div className="forecast-section">
            <div className="section-title">📅 5-Day Forecast</div>
            <div className="forecast-scroll">
              {forecast.map((day) => (
                <div key={day.date} className="forecast-card">
                  <div className="forecast-day">{day.dayName}</div>
                  <div className="forecast-date">{day.dateLabel}</div>
                  <div className="forecast-icon">{getWeatherIcon(day.condition)}</div>
                  <div className="forecast-temp">{day.temp}°C</div>
                  <div className="forecast-detail">💧 {day.humidity}%</div>
                  <div className="forecast-detail">🌧️ {day.rainProb}%</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}