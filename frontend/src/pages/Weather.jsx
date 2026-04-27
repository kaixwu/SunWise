import { useState } from "react";
import { useData } from "../DataContext";
import { CloudLightning, CloudRain, Cloud, Sun, Snowflake, CloudFog, CloudDrizzle, Droplets, Wind, Sunrise, Sunset, AlertTriangle, CalendarDays, Clock } from "lucide-react";
const API = import.meta.env.VITE_API_URL || API

const getWeatherIcon = (condition = "", size = 48) => {
  const c = condition.toLowerCase();
  if (c.includes("thunder")) return <CloudLightning size={size} color="#fbbf24" />;
  if (c.includes("rain") || c.includes("drizzle")) return <CloudRain size={size} color="#60a5fa" />;
  if (c.includes("cloud")) return <Cloud size={size} color="#94a3b8" />;
  if (c.includes("clear")) return <Sun size={size} color="#fbbf24" />;
  if (c.includes("snow")) return <Snowflake size={size} color="#e2e8f0" />;
  if (c.includes("mist") || c.includes("fog")) return <CloudFog size={size} color="#cbd5e1" />;
  return <Sun size={size} color="#fbbf24" />;
};

export default function Weather() {
  const { weather, city, forecast, fullForecast, disasters, locationError, loading } = useData();
  const [selectedDate, setSelectedDate] = useState(null);

  if (loading) {
    return <div className="skeleton" style={{ height: "300px", maxWidth: "1200px", margin: "0 auto" }}></div>;
  }

  if (locationError || !weather || forecast.length === 0) {
    return (
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 24px 24px", textAlign: "center" }}>
        <p style={{ color: "var(--text-muted)" }}>Please set your location on the Home page first.</p>
      </div>
    );
  }

  const selectedDayForecast = selectedDate ? fullForecast.filter(f => f.dt_txt.startsWith(selectedDate)) : [];

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 24px 24px" }}>
      <h2 className="font-heading" style={{ marginBottom: "24px" }}>Weather Hub</h2>

      <div className="glass-card" style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", marginBottom: "32px", padding: "32px", borderTop: "4px solid var(--accent-blue)" }}>
        <div>
          <div style={{ color: "var(--text-muted)", fontWeight: "600", fontSize: "1.1rem", marginBottom: "8px" }}>{city}</div>
          <div style={{ fontSize: "3.5rem", fontWeight: "300", fontFamily: "var(--font-heading)", display: "flex", alignItems: "center", gap: "16px" }}>
            {getWeatherIcon(weather.weather[0].description, 56)}
            {Math.round(weather.main.temp)}°C
          </div>
          <div style={{ color: "var(--accent-teal)", textTransform: "capitalize", fontWeight: "600", fontSize: "1.2rem", marginTop: "8px" }}>{weather.weather[0].description}</div>
        </div>
        <div style={{ display: "flex", gap: "32px", textAlign: "center", flexWrap: "wrap", justifyContent: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
            <Droplets size={28} color="#38bdf8" />
            <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Humidity</div>
            <div style={{ fontWeight: "600", fontSize: "1.1rem" }}>{weather.main.humidity}%</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
            <Wind size={28} color="#94a3b8" />
            <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Wind</div>
            <div style={{ fontWeight: "600", fontSize: "1.1rem" }}>{Math.round(weather.wind.speed * 3.6)} km/h</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
            <Sunrise size={28} color="#fbbf24" />
            <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Sunrise</div>
            <div style={{ fontWeight: "600", fontSize: "1.1rem" }}>{new Date(weather.sys.sunrise * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
            <Sunset size={28} color="#f87171" />
            <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Sunset</div>
            <div style={{ fontWeight: "600", fontSize: "1.1rem" }}>{new Date(weather.sys.sunset * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
          </div>
        </div>
      </div>

      {disasters.length > 0 && (
        <div className="glass-card" style={{ marginBottom: "32px", borderLeft: "4px solid var(--danger)", background: "rgba(239, 68, 68, 0.05)", padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
            <AlertTriangle size={24} color="var(--danger)" />
            <h3 className="font-heading" style={{ fontSize: "1.15rem", margin: 0, color: "var(--danger)" }}>GDACS Disaster Advisory (Philippines)</h3>
          </div>
          {disasters.map((d, i) => (
            <div key={i} style={{ padding: "12px", background: "rgba(0,0,0,0.2)", borderRadius: "8px", marginBottom: "8px" }}>
              <div style={{ fontWeight: "700", color: "#fff" }}>{d.title}</div>
              <div style={{ fontSize: "0.85rem", color: "#cbd5e1" }}>{d.description}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
        <CalendarDays size={20} color="var(--text-muted)" />
        <h3 className="font-heading" style={{ margin: 0, color: "var(--text-muted)", fontSize: "1.1rem" }}>5-Day Forecast</h3>
      </div>
      <div style={{ display: "flex", gap: "16px", overflowX: "auto", paddingBottom: "16px", marginBottom: selectedDate ? "16px" : "32px" }}>
        {forecast.map((f, i) => {
          const dateKey = f.dt_txt.split(" ")[0];
          const isSelected = selectedDate === dateKey;
          return (
            <div key={i} onClick={() => setSelectedDate(isSelected ? null : dateKey)} className="glass-card" style={{ flex: "1", minWidth: "130px", textAlign: "center", padding: "20px 16px", cursor: "pointer", border: isSelected ? "2px solid var(--accent-blue)" : "1px solid var(--glass-border)", transition: "all 0.2s" }}>
              <div style={{ fontSize: "1rem", color: "var(--text-main)", fontWeight: "600" }}>{new Date(f.dt_txt).toLocaleDateString('en-US', { weekday: 'long' })}</div>
              <div style={{ display: "flex", justifyContent: "center", margin: "16px 0" }}>{getWeatherIcon(f.weather[0].description, 40)}</div>
              <div style={{ fontWeight: "700", fontSize: "1.2rem", color: "var(--accent-teal)" }}>{Math.round(f.main.temp)}°C</div>
              <div style={{ textTransform: "capitalize", fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "4px" }}>{f.weather[0].description}</div>
            </div>
          );
        })}
      </div>
      
      {selectedDate && selectedDayForecast.length > 0 && (
        <div className="glass-card" style={{ marginBottom: "32px", padding: "24px", background: "rgba(15, 23, 42, 0.5)", border: "1px solid var(--accent-teal)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
            <Clock size={18} color="var(--accent-teal)" />
            <h4 style={{ margin: 0, color: "var(--accent-teal)", fontSize: "1rem" }}>3-Hour Interval Forecast for {new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</h4>
          </div>
          <div style={{ display: "flex", gap: "16px", overflowX: "auto", paddingBottom: "8px" }}>
            {selectedDayForecast.map((f, i) => (
              <div key={i} style={{ minWidth: "80px", textAlign: "center", padding: "12px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "8px" }}>{new Date(f.dt_txt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                <div style={{ display: "flex", justifyContent: "center", margin: "8px 0" }}>{getWeatherIcon(f.weather[0].description, 28)}</div>
                <div style={{ fontWeight: "600", fontSize: "1.1rem" }}>{Math.round(f.main.temp)}°C</div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
