import { useState } from "react";
import axios from "axios";
import { useData } from "../DataContext";
import { useAuth } from "../AuthContext";
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import { Search, MapPin, Map as MapIcon, CloudSun, AlertCircle, Navigation } from "lucide-react";
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const API = import.meta.env.VITE_API_URL || API

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

function MapFlyTo({ center }) {
  const map = useMap();
  map.flyTo(center, 13, { duration: 1 });
  return null;
}

export default function Home() {
  const { token } = useAuth();
  const { 
    city, weather, currentCoords, loading, locationError, setLocationError, fetcheverything, places, todayPlan
  } = useData();

  const [manualCity, setManualCity] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [routePolyline, setRoutePolyline] = useState([]);
  const [routingLoading, setRoutingLoading] = useState(false);
  const [routeInfo, setRouteInfo] = useState(null);
  const [routeDest, setRouteDest] = useState(null);

  const handleTyping = async (e) => {
    const val = e.target.value;
    setManualCity(val);
    if (val.length > 2) {
      setShowSuggestions(true);
      try {
        const res = await axios.get(`${API}/api/autocomplete?text=${val}&lat=${currentCoords?.lat}&lon=${currentCoords?.lon}`);
        setSuggestions(res.data.suggestions || []);
      } catch (e) { console.error(e); }
    } else {
      setShowSuggestions(false);
      setSuggestions([]);
    }
  };

  const selectSuggestion = (sug) => {
    setManualCity(sug.formatted);
    setShowSuggestions(false);
    axios.get(`https://nominatim.openstreetmap.org/search?q=${sug.formatted}&format=json&limit=1`)
      .then(geoRes => {
        if (geoRes.data.length > 0) {
          const lat = parseFloat(geoRes.data[0].lat);
          const lon = parseFloat(geoRes.data[0].lon);
          fetcheverything(lat, lon);
        }
      });
  };

  const handleManualSearch = async () => {
    if (!manualCity) return;
    try {
      const geoRes = await axios.get(`https://nominatim.openstreetmap.org/search?q=${manualCity}&format=json&limit=1`);
      if (geoRes.data.length === 0) {
        alert("Location not found.");
        setLocationError(true);
        return;
      }
      const lat = parseFloat(geoRes.data[0].lat);
      const lon = parseFloat(geoRes.data[0].lon);
      fetcheverything(lat, lon);
    } catch (err) {
      alert("Failed to search location.");
      setLocationError(true);
    }
  };

  const drawRoute = async (place) => {
    if (!currentCoords) return;
    setRoutingLoading(true);
    setRouteDest(place);
    try {
      const res = await axios.post("http://localhost:5000/api/route", {
        start: currentCoords,
        end: { lat: place.lat, lon: place.lon }
      });
      const points = res.data.routes[0].legs[0].points.map(p => [p.latitude, p.longitude]);
      setRoutePolyline(points);
      setRouteInfo(res.data.routes[0].summary);
    } catch (err) {
      console.error(err);
      alert("Failed to calculate route.");
    } finally {
      setRoutingLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 24px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
        <MapIcon size={32} color="var(--accent-blue)" />
        <h2 className="font-heading" style={{ margin: 0 }}>Overview</h2>
      </div>
      
      {locationError ? (
        <div className="glass-card" style={{ textAlign: "center", padding: "40px" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}><AlertCircle size={48} color="var(--accent-blue)" /></div>
          <h2 className="font-heading" style={{ marginBottom: "16px" }}>Location Required</h2>
          <p style={{ color: "var(--text-muted)", marginBottom: "24px" }}>Please enable location services or enter your city manually.</p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center", maxWidth: "400px", margin: "0 auto", position: "relative" }}>
            <div style={{ flex: 1, position: "relative" }}>
              <input className="input-field" style={{ marginBottom: 0, width: "100%" }} placeholder="e.g. Quezon City" value={manualCity} onChange={handleTyping} onKeyDown={e => e.key === "Enter" && handleManualSearch()} />
              {showSuggestions && suggestions.length > 0 && (
                <div style={{ position: "absolute", top: "100%", left: 0, width: "100%", background: "var(--glass-bg)", border: "1px solid var(--glass-border)", borderRadius: "8px", marginTop: "4px", zIndex: 50, maxHeight: "200px", overflowY: "auto", backdropFilter: "blur(10px)", textAlign: "left" }}>
                  {suggestions.map((s, i) => (
                    <div key={i} onClick={() => selectSuggestion(s)} style={{ padding: "12px", borderBottom: "1px solid rgba(255,255,255,0.05)", cursor: "pointer", color: "#e2e8f0", fontSize: "0.9rem" }}>{s.formatted}</div>
                  ))}
                </div>
              )}
            </div>
            <button className="btn-primary" style={{ width: "auto", padding: "0 24px", height: "46px", display: "flex", alignItems: "center", gap: "8px" }} onClick={handleManualSearch}>
              <Search size={18} /> Search
            </button>
          </div>
        </div>
      ) : loading ? (
        <div className="skeleton" style={{ height: "300px", marginBottom: "32px" }}></div>
      ) : weather && currentCoords ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "24px", alignItems: "flex-start" }}>
          
          <div style={{ flex: "1 1 300px", display: "flex", flexDirection: "column", gap: "24px" }}>
            <div className="glass-card" style={{ display: "flex", flexDirection: "column", padding: "32px", borderTop: "4px solid var(--accent-blue)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                <MapPin size={20} color="var(--text-muted)" />
                <div style={{ color: "var(--text-muted)", fontWeight: "600", fontSize: "1.1rem" }}>{city}</div>
                <button onClick={() => { setLocationError(true); }} style={{ background: "rgba(56, 189, 248, 0.1)", border: "1px solid var(--accent-blue)", color: "var(--accent-blue)", padding: "4px 10px", borderRadius: "20px", fontSize: "0.75rem", cursor: "pointer", fontWeight: "600", marginLeft: "auto" }}>Change Area</button>
              </div>
              <div style={{ fontSize: "3rem", fontWeight: "300", fontFamily: "var(--font-heading)" }}>{Math.round(weather.main.temp)}°C</div>
              <div style={{ color: "var(--accent-teal)", textTransform: "capitalize", fontWeight: "600" }}>{weather.weather[0].description}</div>
            </div>

            {/* Today's Plan */}
            <div className="glass-card" style={{ padding: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                <Navigation size={20} color="var(--accent-blue)" />
                <h3 className="font-heading" style={{ margin: 0, fontSize: "1.2rem" }}>Today's Plan</h3>
              </div>
              
              {!todayPlan ? (
                <div style={{ color: "var(--text-muted)", fontSize: "0.9rem", textAlign: "center", padding: "20px 0" }}>
                  No plan scheduled for today. Go to the Planner to build one!
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {todayPlan.places.map((p, index) => (
                    <div key={index} style={{ padding: "12px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)", cursor: "pointer", transition: "all 0.2s" }} onClick={() => drawRoute(p)}>
                      <div style={{ fontWeight: "700", fontSize: "1rem" }}>{index + 1}. {p.name}</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
                        <span>{p.category}</span>
                        <span style={{ color: "var(--accent-blue)", fontWeight: "600" }}>{routingLoading && routeDest?.name === p.name ? "..." : "View Route"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
          
          <div style={{ flex: "1 1 600px", borderRadius: "16px", overflow: "hidden", border: "1px solid var(--glass-border)", height: "600px", position: "relative" }}>
            <MapContainer center={[currentCoords.lat, currentCoords.lon]} zoom={13} style={{ height: "100%", width: "100%" }}>
              <MapFlyTo center={[currentCoords.lat, currentCoords.lon]} />
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>' />
              <TileLayer url="https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=hLvRIfmyuzqpTNvtrZ3Y0gV1HAA3eLFj" attribution='&copy; <a href="https://www.tomtom.com/">TomTom Live Traffic</a>' opacity={0.7} />
              
              {/* User Location Marker */}
              <Marker position={[currentCoords.lat, currentCoords.lon]}>
                <Popup><strong>You are here</strong></Popup>
              </Marker>

              {(routePolyline.length > 0 ? [routeDest] : places.slice(0, 10)).map((p, i) => p && (
                <Marker key={i} position={[p.lat, p.lon]}>
                  <Popup>
                    <strong>{p.name}</strong><br/>{p.category}<br/>
                    {routePolyline.length === 0 && (
                      <button onClick={() => drawRoute(p)} style={{ marginTop: "8px", padding: "4px 8px", background: "var(--accent-blue)", border: "none", borderRadius: "4px", color: "#fff", cursor: "pointer", fontSize: "0.8rem" }}>Show Route</button>
                    )}
                  </Popup>
                </Marker>
              ))}

              {routePolyline.length > 0 && (
                <Polyline positions={routePolyline} color="var(--accent-blue)" weight={6} opacity={0.8} />
              )}
            </MapContainer>
            
            {routeInfo && !routingLoading && (
              <div className="glass-card" style={{ position: "absolute", bottom: "24px", left: "24px", right: "24px", zIndex: 1000, padding: "16px", background: "rgba(15, 23, 42, 0.85)", border: "1px solid var(--accent-blue)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h4 style={{ margin: "0 0 4px 0", color: "var(--accent-teal)" }}>Route to {routeDest?.name}</h4>
                    <div style={{ display: "flex", gap: "16px", color: "#e2e8f0", fontSize: "0.9rem" }}>
                      <span><strong>Distance:</strong> {(routeInfo.lengthInMeters / 1000).toFixed(1)} km</span>
                      <span><strong>Travel Time:</strong> {Math.round(routeInfo.travelTimeInSeconds / 60)} mins</span>
                      {routeInfo.trafficDelayInSeconds > 0 && (
                        <span style={{ color: "var(--danger)" }}><strong>Traffic Delay:</strong> +{Math.round(routeInfo.trafficDelayInSeconds / 60)} mins</span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => { setRoutePolyline([]); setRouteInfo(null); setRouteDest(null); }} style={{ padding: "6px 12px", background: "transparent", border: "1px solid var(--glass-border)", color: "#e2e8f0", borderRadius: "6px", cursor: "pointer", fontSize: "0.8rem" }}>
                    Clear
                  </button>
                </div>
              </div>
            )}

            {routingLoading && (
              <div style={{ position: "absolute", top: "16px", right: "16px", background: "var(--glass-bg)", backdropFilter: "blur(10px)", padding: "8px 16px", borderRadius: "20px", border: "1px solid var(--glass-border)", zIndex: 1000, color: "#fff", fontWeight: "600", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "8px" }}>
                <span className="spinner"></span> Calculating Route...
              </div>
            )}
          </div>

        </div>
      ) : null}
    </div>
  );
}
