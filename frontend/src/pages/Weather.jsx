import { useState } from "react";
import { useData } from "../DataContext";
import { CloudLightning, CloudRain, Cloud, Sun, Snowflake, CloudFog, CloudDrizzle, Droplets, Wind, Sunrise, Sunset, AlertTriangle, CalendarDays, Clock, Map as MapIcon, Layers } from "lucide-react";
import FluidGradient from "../components/FluidGradient";
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

function MapFlyTo({ center }) {
  const map = useMap();
  map.flyTo(center, 10, { duration: 1.5 });
  return null;
}


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
  const { weather: contextWeather, city: contextCity, forecast: contextForecast, fullForecast: contextFullForecast, disasters, locationError, loading, userCity } = useData();
  const [selectedDate, setSelectedDate] = useState(null);
  const [activeLayer, setActiveLayer] = useState('precipitation_new');
  
  // Local state for searched weather
  const [searchCity, setSearchCity] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [localWeather, setLocalWeather] = useState(null);
  const [localForecast, setLocalForecast] = useState(null);
  const [localFullForecast, setLocalFullForecast] = useState(null);
  const [searchError, setSearchError] = useState("");

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchCity.trim()) return;
    setSearchLoading(true);
    setSearchError("");
    try {
      const API_KEY = import.meta.env.VITE_WEATHER_API_KEY;
      const wRes = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${searchCity}&appid=${API_KEY}&units=metric`);
      if (!wRes.ok) throw new Error("City not found");
      const wData = await wRes.json();
      setLocalWeather(wData);

      const fRes = await fetch(`https://api.openweathermap.org/data/2.5/forecast?q=${searchCity}&appid=${API_KEY}&units=metric`);
      const fData = await fRes.json();
      
      const uniqueDays = [];
      const dailyData = [];
      fData.list.forEach(item => {
        const d = item.dt_txt.split(" ")[0];
        if (!uniqueDays.includes(d)) {
          uniqueDays.push(d);
          dailyData.push(item);
        }
      });
      
      setLocalForecast(dailyData.slice(0, 5));
      setLocalFullForecast(fData.list);
      setSelectedDate(null);
    } catch (err) {
      console.error(err);
      setSearchError("Could not find weather for that location.");
    } finally {
      setSearchLoading(false);
    }
  };

  if (loading) {
    return <div className="skeleton" style={{ height: "300px", maxWidth: "1600px", margin: "0 auto" }}></div>;
  }

  const displayWeather = localWeather || contextWeather;
  const displayCity = localWeather ? localWeather.name : (userCity || contextCity);
  const displayForecast = localForecast || contextForecast;
  const displayFullForecast = localFullForecast || contextFullForecast;

  if (locationError || !displayWeather || !displayForecast || displayForecast.length === 0) {
    return (
      <div style={{ maxWidth: "1600px", margin: "0 auto", padding: "0 24px 24px", textAlign: "center" }}>
        <p style={{ color: "var(--text-muted)" }}>Please set your location on the Home page first.</p>
      </div>
    );
  }

  const selectedDayForecast = selectedDate ? displayFullForecast.filter(f => f.dt_txt.startsWith(selectedDate)) : [];

  return (
    <>
      <div className="fluid-background-container" style={{ position: "fixed" }}>
        <FluidGradient 
          color1="#1e293b" 
          color2="#0f172a" 
          color3="#334155" 
          color4="#0ea5e9"
          opacity={0.7}
          colorIntensity={0.5}
        />
        <div className="fluid-overlay" style={{ background: "rgba(4, 9, 20, 0.6)" }}></div>
      </div>
    <div style={{ maxWidth: "1600px", margin: "0 auto", padding: "0 24px 24px", position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "16px" }}>
        <h2 className="font-heading" style={{ margin: 0 }}>Weather Hub</h2>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: "8px" }}>
          <input 
            type="text" 
            placeholder="Check weather in..." 
            value={searchCity} 
            onChange={(e) => setSearchCity(e.target.value)} 
            className="input-field" 
            style={{ marginBottom: 0, padding: "8px 16px", borderRadius: "20px", minWidth: "250px" }} 
          />
          <button type="submit" disabled={searchLoading} className="btn-primary" style={{ padding: "8px 20px", borderRadius: "20px", width: "auto" }}>
            {searchLoading ? "..." : "Search"}
          </button>
        </form>
      </div>
      
      {searchError && <div style={{ color: "var(--danger)", marginBottom: "16px" }}>{searchError}</div>}

      <div className="glass-card" style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", marginBottom: "32px", padding: "32px", borderTop: "4px solid var(--accent-blue)" }}>
        <div>
          <div style={{ color: "var(--text-muted)", fontWeight: "600", fontSize: "1.1rem", marginBottom: "8px" }}>
            {displayCity}
          </div>
          <div style={{ fontSize: "3.5rem", fontWeight: "300", fontFamily: "var(--font-heading)", display: "flex", alignItems: "center", gap: "16px" }}>
            {getWeatherIcon(displayWeather.weather[0].description, 56)}
            {Math.round(displayWeather.main.temp)}°C
          </div>
          <div style={{ color: "var(--accent-teal)", textTransform: "capitalize", fontWeight: "600", fontSize: "1.2rem", marginTop: "8px" }}>{displayWeather.weather[0].description}</div>
        </div>
        <div style={{ display: "flex", gap: "32px", textAlign: "center", flexWrap: "wrap", justifyContent: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
            <Droplets size={28} color="#38bdf8" />
            <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Humidity</div>
            <div style={{ fontWeight: "600", fontSize: "1.1rem" }}>{displayWeather.main.humidity}%</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
            <Wind size={28} color="#94a3b8" />
            <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Wind</div>
            <div style={{ fontWeight: "600", fontSize: "1.1rem" }}>{Math.round(displayWeather.wind.speed * 3.6)} km/h</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
            <Sunrise size={28} color="#fbbf24" />
            <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Sunrise</div>
            <div style={{ fontWeight: "600", fontSize: "1.1rem" }}>{new Date(displayWeather.sys.sunrise * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
            <Sunset size={28} color="#f87171" />
            <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Sunset</div>
            <div style={{ fontWeight: "600", fontSize: "1.1rem" }}>{new Date(displayWeather.sys.sunset * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
          </div>
        </div>
      </div>

      {disasters.length > 0 && (
        <div className="glass-card" style={{ marginBottom: "32px", borderLeft: "4px solid var(--danger)", background: "rgba(239, 68, 68, 0.05)", padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
            <AlertTriangle size={24} color="var(--danger)" />
            <h3 className="font-heading" style={{ fontSize: "1.15rem", margin: 0, color: "var(--danger)" }}>GDACS Disaster Advisory</h3>
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
        {displayForecast.map((f, i) => {
          const dateKey = f.dt_txt.split(" ")[0];
          const isSelected = selectedDate === dateKey;
          return (
            <div key={i} onClick={() => setSelectedDate(isSelected ? null : dateKey)} className={`glass-card tilt-card ${isSelected ? 'active-forecast' : ''}`} style={{ flex: "1", minWidth: "130px", textAlign: "center", padding: "20px 16px", cursor: "pointer", border: isSelected ? "2px solid var(--accent-blue)" : "1px solid var(--glass-border)" }}>
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

      {/* Interactive Weather Map Section */}
      <div className="glass-card" style={{ padding: "24px", marginBottom: "32px", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
          <MapIcon size={24} color="var(--accent-blue)" />
          <h3 className="font-heading" style={{ margin: 0, fontSize: "1.4rem" }}>Interactive Weather Map</h3>
        </div>
        
        {/* Animated Map Controls */}
        <div style={{ display: "flex", gap: "12px", marginBottom: "20px", overflowX: "auto", paddingBottom: "8px", msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
          <button 
            onClick={() => setActiveLayer('none')}
            style={{ 
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)", 
              padding: "10px 18px", 
              borderRadius: "30px", 
              display: "flex", 
              alignItems: "center", 
              gap: "8px", 
              whiteSpace: "nowrap",
              cursor: "pointer",
              background: activeLayer === 'none' ? "rgba(56, 189, 248, 0.15)" : "rgba(255, 255, 255, 0.05)",
              border: activeLayer === 'none' ? "1px solid var(--accent-blue)" : "1px solid rgba(255,255,255,0.1)",
              color: activeLayer === 'none' ? "var(--accent-blue)" : "#e2e8f0",
              fontWeight: activeLayer === 'none' ? "600" : "400",
              transform: activeLayer === 'none' ? "scale(1.05)" : "scale(1)"
            }}
          >
            <MapIcon size={16} /> Default Map
          </button>
          <button 
            onClick={() => setActiveLayer('precipitation_new')}
            style={{ 
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)", 
              padding: "10px 18px", 
              borderRadius: "30px", 
              display: "flex", 
              alignItems: "center", 
              gap: "8px", 
              whiteSpace: "nowrap",
              cursor: "pointer",
              background: activeLayer === 'precipitation_new' ? "rgba(96, 165, 250, 0.15)" : "rgba(255, 255, 255, 0.05)",
              border: activeLayer === 'precipitation_new' ? "1px solid #60a5fa" : "1px solid rgba(255,255,255,0.1)",
              color: activeLayer === 'precipitation_new' ? "#60a5fa" : "#e2e8f0",
              fontWeight: activeLayer === 'precipitation_new' ? "600" : "400",
              transform: activeLayer === 'precipitation_new' ? "scale(1.05)" : "scale(1)"
            }}
          >
            <CloudRain size={16} /> Rain Radar
          </button>
          <button 
            onClick={() => setActiveLayer('temp_new')}
            style={{ 
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)", 
              padding: "10px 18px", 
              borderRadius: "30px", 
              display: "flex", 
              alignItems: "center", 
              gap: "8px", 
              whiteSpace: "nowrap",
              cursor: "pointer",
              background: activeLayer === 'temp_new' ? "rgba(248, 113, 113, 0.15)" : "rgba(255, 255, 255, 0.05)",
              border: activeLayer === 'temp_new' ? "1px solid #f87171" : "1px solid rgba(255,255,255,0.1)",
              color: activeLayer === 'temp_new' ? "#f87171" : "#e2e8f0",
              fontWeight: activeLayer === 'temp_new' ? "600" : "400",
              transform: activeLayer === 'temp_new' ? "scale(1.05)" : "scale(1)"
            }}
          >
            <Sun size={16} /> Temperature Heatmap
          </button>
          <button 
            onClick={() => setActiveLayer('wind_new')}
            style={{ 
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)", 
              padding: "10px 18px", 
              borderRadius: "30px", 
              display: "flex", 
              alignItems: "center", 
              gap: "8px", 
              whiteSpace: "nowrap",
              cursor: "pointer",
              background: activeLayer === 'wind_new' ? "rgba(148, 163, 184, 0.15)" : "rgba(255, 255, 255, 0.05)",
              border: activeLayer === 'wind_new' ? "1px solid #94a3b8" : "1px solid rgba(255,255,255,0.1)",
              color: activeLayer === 'wind_new' ? "#94a3b8" : "#e2e8f0",
              fontWeight: activeLayer === 'wind_new' ? "600" : "400",
              transform: activeLayer === 'wind_new' ? "scale(1.05)" : "scale(1)"
            }}
          >
            <Wind size={16} /> Wind Speed
          </button>
        </div>

        {/* Map Container */}
        <div style={{ height: "450px", width: "100%", borderRadius: "12px", overflow: "hidden", position: "relative", border: "1px solid rgba(255,255,255,0.1)" }}>
          {displayWeather?.coord ? (
            <MapContainer
              center={[displayWeather.coord.lat, displayWeather.coord.lon]}
              zoom={10}
              style={{ height: '100%', width: '100%', zIndex: 1 }}
              zoomControl={false}
            >
              <MapFlyTo center={[displayWeather.coord.lat, displayWeather.coord.lon]} />
              
              {/* Base Map (Dark theme CartoDB) */}
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
              />
              
              {/* OWM Weather Overlays */}
              {activeLayer !== 'none' && (
                <TileLayer
                  key={activeLayer}
                  url={`https://tile.openweathermap.org/map/${activeLayer}/{z}/{x}/{y}.png?appid=${import.meta.env.VITE_WEATHER_API_KEY}`}
                  opacity={0.65}
                  attribution='&copy; OpenWeatherMap'
                />
              )}

              <Marker position={[displayWeather.coord.lat, displayWeather.coord.lon]}>
                <Popup>
                  <strong style={{ color: "#0f172a" }}>{displayWeather.name}</strong><br/>
                  <span style={{ color: "#475569" }}>{Math.round(displayWeather.main.temp)}°C, {displayWeather.weather[0].description}</span>
                </Popup>
              </Marker>
            </MapContainer>
          ) : (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
              Location data not available
            </div>
          )}
        </div>
      </div>

    </div>
    </>
  );
}