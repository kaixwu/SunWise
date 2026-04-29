import { useState, useEffect } from "react";
import axios from "axios";
import { useData } from "../DataContext";
import { useAuth } from "../AuthContext";
import {
  MapContainer, TileLayer, Marker, Popup, useMap, Polyline
} from 'react-leaflet';
import {
  Search, MapPin, Navigation, AlertCircle,
  Wind, Droplets, Sunrise, ChevronDown, Zap, Map as MapIcon
} from "lucide-react";
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import publicAxios from "../publicAxios";

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
    city, weather, currentCoords, loading, locationError, setLocationError,
    fetcheverything, places, todayPlan, radius,
    userCity, setUserCity
  } = useData();

  const [manualCity, setManualCity] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [routePolyline, setRoutePolyline] = useState([]);
  const [routingLoading, setRoutingLoading] = useState(false);
  const [routeInfo, setRouteInfo] = useState(null);
  const [routeDest, setRouteDest] = useState(null);
  const [heroImgUrl, setHeroImgUrl] = useState('');

  const displayCity = (userCity || city || '').toUpperCase();

  // ── Hero image effect (uses Unsplash via backend proxy) ─────────────────
  useEffect(() => {
    const name = userCity || city;
    if (!name) {
      setHeroImgUrl('');
      return;
    }

    const queryMap = {
      manila: 'manila philippines city skyline',
      makati: 'makati skyline',
      taguig: 'bgc taguig cityscape',
      bgc: 'bonifacio global city philippines',
      quezon: 'quezon city philippines',
      cebu: 'cebu city philippines cityscape',
      baguio: 'baguio pine mountains fog',
      davao: 'davao city philippines',
      palawan: 'palawan beach turquoise',
      'puerto princesa': 'puerto princesa philippines',
      boracay: 'boracay beach white sand',
      tagaytay: 'tagaytay volcano lake',
      batangas: 'batangas philippines beach',
      iloilo: 'iloilo heritage philippines',
      bohol: 'bohol chocolate hills',
      zamboanga: 'zamboanga philippines',
      bacolod: 'bacolod philippines',
      cagayan: 'cagayan philippines landscape',
      vigan: 'vigan heritage philippines',
      siargao: 'siargao surfing tropical',
      coron: 'coron lagoon philippines'
    };

    const lower = name.toLowerCase();
    let query = 'philippines tropical landscape sunset';
    for (const [cityName, q] of Object.entries(queryMap)) {
      if (lower.includes(cityName)) {
        query = q;
        break;
      }
    }

    axios.post('/api/hero-image', { query })
      .then(res => {
        if (res.data.url) setHeroImgUrl(res.data.url);
        else setHeroImgUrl('');
      })
      .catch(() => setHeroImgUrl(''));
  }, [city, userCity]);

  const handleTyping = async (e) => {
    const val = e.target.value;
    setManualCity(val);
    if (val.length > 2) {
      setShowSuggestions(true);
      try {
        const res = await axios.get(
          `/api/autocomplete?text=${val}&lat=${currentCoords?.lat}&lon=${currentCoords?.lon}`
        );
        setSuggestions(res.data.suggestions || []);
      } catch (e) { console.error(e); }
    } else {
      setShowSuggestions(false);
      setSuggestions([]);
    }
  };

  const selectSuggestion = async (sug) => {
    setManualCity(sug.formatted);
    setShowSuggestions(false);
    setUserCity(sug.formatted);
    if (sug.place_id) {
      try {
        const res = await axios.post("/api/place-details", { place_id: sug.place_id });
        const { lat, lon } = res.data;
        fetcheverything(lat, lon, radius);
      } catch (err) {
        console.error("Place details failed, falling back to Nominatim:", err);
        geocodeWithNominatim(sug.formatted);
      }
    } else {
      geocodeWithNominatim(sug.formatted);
    }
  };

  const geocodeWithNominatim = (address) => {
    publicAxios
      .get(`https://nominatim.openstreetmap.org/search?q=${address}&format=json&limit=1`)
      .then(geoRes => {
        if (geoRes.data.length > 0) {
          const lat = parseFloat(geoRes.data[0].lat);
          const lon = parseFloat(geoRes.data[0].lon);
          fetcheverything(lat, lon, radius);
        } else {
          alert("Location not found.");
        }
      })
      .catch(() => alert("Failed to search location."));
  };

  const handleManualSearch = () => {
    if (!manualCity) return;
    setLocationError(false);
    setUserCity(manualCity);
    geocodeWithNominatim(manualCity);
  };

  const drawRoute = async (place) => {
    if (!currentCoords) return;
    setRoutingLoading(true);
    setRouteDest(place);
    try {
      const res = await axios.post("/api/route", {
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
  const getCityFontSize = (text) => {
    const len = text.length;
    if (len <= 12) return 'clamp(4.5rem, 11vw, 9rem)';
    if (len <= 20) return 'clamp(3.5rem, 8vw,  7rem)';
    if (len <= 30) return 'clamp(2.5rem, 6vw,  5rem)';
    if (len <= 45) return 'clamp(1.8rem, 4vw,  3.5rem)';
    return 'clamp(1.4rem, 3vw,  2.8rem)';
  };
  // ── HERO SECTION ─────────────────────────────────────────────────────────
  const renderHero = () => (
    <div className="hero-section">
      {/* Background image */}
      {heroImgUrl && (
        <img
          className="hero-bg-img"
          style={{ zIndex: 1 }}
          src={heroImgUrl}
          alt={displayCity || 'Philippines'}
          onError={e => { e.target.style.display = 'none'; }}
        />
      )}
      {/* Static gradient fallback bg */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(135deg, #0d2240 0%, #071428 50%, #030b1a 100%)',
        zIndex: 0,
      }} />
      {/* Gradient overlays */}
      <div className="hero-gradient" style={{ zIndex: 2 }} />

      {/* Decorative indicators (right side) */}
      <div className="hero-indicators">
        {['01', '02', '03', '04', '05'].map((n, i) => (
          <div key={n} className={`hero-indicator-num ${i === 2 ? 'active' : ''}`}>{n}</div>
        ))}
        <div className="hero-indicator-line" />
      </div>

      {/* Content overlay */}
      {locationError ? (
        /* No location: show search UI */
        <div className="hero-search-overlay" style={{ zIndex: 10 }}>
          <div className="hero-eyebrow">Location Required</div>
          <h1 className="hero-city-name" style={{ fontSize: 'clamp(3rem, 8vw, 6rem)' }}>
            Where are<br />you going?
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', marginBottom: '28px', fontSize: '0.95rem' }}>
            Enable location services or enter your city to get started.
          </p>
          <div style={{ position: 'relative', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
              <input
                className="input-field"
                style={{ marginBottom: 0, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', fontSize: '1rem' }}
                placeholder="e.g. Quezon City, BGC…"
                value={manualCity}
                onChange={handleTyping}
                onKeyDown={e => e.key === 'Enter' && handleManualSearch()}
              />
              {showSuggestions && suggestions.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, width: '100%',
                  background: 'rgba(10, 20, 44, 0.97)', border: '1px solid rgba(56,189,248,0.2)',
                  borderRadius: '12px', marginTop: '6px', zIndex: 100,
                  maxHeight: '220px', overflowY: 'auto', backdropFilter: 'blur(20px)',
                  boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                }}>
                  {suggestions.map((s, i) => (
                    <div key={i} onClick={() => selectSuggestion(s)} style={{
                      padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)',
                      cursor: 'pointer', color: '#e2e8f0', fontSize: '0.9rem',
                      transition: 'background 0.15s',
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(56,189,248,0.08)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >{s.formatted}</div>
                  ))}
                </div>
              )}
            </div>
            <button
              className="hero-btn"
              style={{ background: 'var(--accent-blue)', color: '#07111f', display: 'flex', alignItems: 'center', gap: '8px', padding: '13px 24px' }}
              onClick={handleManualSearch}
            >
              <Search size={16} /> Search
            </button>
          </div>
        </div>
      ) : loading ? (
        /* Loading: skeleton in hero */
        <div className="hero-content" style={{ zIndex: 10 }}>
          <div style={{ height: '20px', width: '120px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', marginBottom: '16px' }} />
          <div style={{ height: '80px', width: '400px', maxWidth: '80vw', background: 'rgba(255,255,255,0.08)', borderRadius: '8px', marginBottom: '20px' }} />
          <div style={{ height: '20px', width: '200px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px' }} />
        </div>
      ) : weather && currentCoords ? (
        /* Has data: full hero */
        <div className="hero-content" style={{ zIndex: 10 }}>
          <div className="hero-eyebrow">
            <MapPin size={12} /> Discover Philippines
          </div>
          <div
            className="hero-city-name"
            style={{ fontSize: getCityFontSize(displayCity || 'YOUR CITY') }}
          >
            {displayCity || 'YOUR CITY'}
          </div>
          <div className="hero-weather-row">
            <span className="hero-temp">{Math.round(weather.main.temp)}°C</span>
            <span style={{ width: '1px', height: '28px', background: 'rgba(255,255,255,0.15)' }} />
            <span className="hero-weather-desc">{weather.weather[0].description}</span>
            <span className="hero-weather-stat">
              <Wind size={13} /> {Math.round(weather.wind.speed * 3.6)} km/h
            </span>
            <span className="hero-weather-stat">
              <Droplets size={13} /> {weather.main.humidity}%
            </span>
          </div>
          <div className="hero-actions">
            <button
              className="hero-btn hero-btn-outline"
              onClick={() => {
                setUserCity(null);
                setLocationError(true);
              }}
            >
              <MapPin size={13} style={{ marginRight: 4 }} /> Change Area
            </button>
            <button
              className="hero-btn"
              style={{ background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-teal))', color: '#07111f' }}
              onClick={() => document.getElementById('home-content')?.scrollIntoView({ behavior: 'smooth' })}
            >
              Explore ↓
            </button>
          </div>
        </div>
      ) : null}

      {/* Scroll hint */}
      {!locationError && !loading && weather && (
        <div className="hero-scroll-hint">
          <ChevronDown size={16} />
          scroll
        </div>
      )}
    </div>
  );

  // ── MAIN RENDER ─────────────────────────────────────────────────────────
  return (
    <div>
      {renderHero()}

      {!locationError && !loading && weather && currentCoords && (
        <div id="home-content" className="home-content-section">
          {/* Left sidebar */}
          <div className="home-sidebar">
            {/* Today's Plan */}
            <div className="glass-card" style={{ padding: '24px', borderTop: '3px solid var(--accent-blue)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
                <Navigation size={18} color="var(--accent-blue)" />
                <div>
                  <div className="section-label">Your schedule</div>
                  <h3 className="font-heading" style={{ margin: 0, fontSize: '1.3rem', letterSpacing: '0.05em' }}>
                    Today's Plan
                  </h3>
                </div>
              </div>
              {!todayPlan ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem', textAlign: 'center', padding: '24px 0', lineHeight: 1.6 }}>
                  No plan scheduled for today.
                  <br />
                  <span style={{ color: 'var(--accent-teal)' }}>Go to Planner to build one!</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {todayPlan.places.map((p, index) => (
                    <div
                      key={index}
                      className="plan-stop"
                      onClick={() => drawRoute(p)}
                    >
                      <div className="plan-stop-num">{index + 1}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.92rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {p.name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {p.category}
                        </div>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--accent-blue)', fontWeight: 700, flexShrink: 0 }}>
                        {routingLoading && routeDest?.name === p.name ? '...' : 'Route →'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Weather summary card */}
            <div className="glass-card" style={{ padding: '22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <Sunrise size={18} color="var(--accent-gold)" />
                <div>
                  <div className="section-label">Current Conditions</div>
                  <h3 className="font-heading" style={{ margin: 0, fontSize: '1.15rem' }}>Weather</h3>
                </div>
              </div>
              <div className="weather-stat-grid">
                <div className="weather-stat-item">
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Temperature</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', color: 'var(--accent-blue)' }}>
                    {Math.round(weather.main.temp)}°C
                  </div>
                </div>
                <div className="weather-stat-item">
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Feels Like</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', color: 'var(--accent-teal)' }}>
                    {Math.round(weather.main.feels_like)}°C
                  </div>
                </div>
                <div className="weather-stat-item">
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Humidity</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                    <Droplets size={18} color="var(--accent-blue)" />
                    <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{weather.main.humidity}%</span>
                  </div>
                </div>
                <div className="weather-stat-item">
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Wind</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                    <Wind size={18} color="var(--accent-teal)" />
                    <span style={{ fontWeight: 700, fontSize: '1rem' }}>{Math.round(weather.wind.speed * 3.6)} km/h</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Map */}
          <div className="home-map-container">
            <MapContainer
              center={[currentCoords.lat, currentCoords.lon]}
              zoom={13}
              style={{ height: '100%', width: '100%' }}
            >
              <MapFlyTo center={[currentCoords.lat, currentCoords.lon]} />
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>'
              />
              <TileLayer
                url={`https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=hLvRIfmyuzqpTNvtrZ3Y0gV1HAA3eLFj`}
                attribution='&copy; <a href="https://www.tomtom.com/">TomTom</a>'
                opacity={0.7}
              />
              <Marker position={[currentCoords.lat, currentCoords.lon]}>
                <Popup><strong>You are here</strong></Popup>
              </Marker>
              {(routePolyline.length > 0 ? [routeDest] : places.slice(0, 10)).map((p, i) =>
                p && (
                  <Marker key={i} position={[p.lat, p.lon]}>
                    <Popup>
                      <strong>{p.name}</strong><br />{p.category}<br />
                      {routePolyline.length === 0 && (
                        <button
                          onClick={() => drawRoute(p)}
                          style={{
                            marginTop: '8px', padding: '4px 10px',
                            background: 'var(--accent-blue)', border: 'none',
                            borderRadius: '4px', color: '#fff', cursor: 'pointer', fontSize: '0.8rem'
                          }}
                        >Show Route</button>
                      )}
                    </Popup>
                  </Marker>
                )
              )}
              {routePolyline.length > 0 && (
                <Polyline positions={routePolyline} color="var(--accent-blue)" weight={5} opacity={0.85} />
              )}
            </MapContainer>

            {/* Route info overlay */}
            {routeInfo && !routingLoading && (
              <div className="route-info-overlay">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ margin: '0 0 6px', color: 'var(--accent-teal)', fontFamily: 'var(--font-display)', letterSpacing: '0.05em', fontSize: '1.1rem' }}>
                      Route → {routeDest?.name}
                    </h4>
                    <div style={{ display: 'flex', gap: '20px', color: '#e2e8f0', fontSize: '0.85rem' }}>
                      <span><strong>{(routeInfo.lengthInMeters / 1000).toFixed(1)} km</strong></span>
                      <span><strong>{Math.round(routeInfo.travelTimeInSeconds / 60)} min</strong></span>
                      {routeInfo.trafficDelayInSeconds > 0 && (
                        <span style={{ color: 'var(--danger)' }}>
                          +{Math.round(routeInfo.trafficDelayInSeconds / 60)} min delay
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => { setRoutePolyline([]); setRouteInfo(null); setRouteDest(null); }}
                    style={{
                      padding: '6px 14px', background: 'transparent',
                      border: '1px solid var(--glass-border)', color: '#e2e8f0',
                      borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem'
                    }}
                  >Clear</button>
                </div>
              </div>
            )}

            {/* Routing loading */}
            {routingLoading && (
              <div style={{
                position: 'absolute', top: '16px', right: '16px',
                background: 'rgba(10, 18, 38, 0.9)', backdropFilter: 'blur(12px)',
                padding: '8px 18px', borderRadius: '24px',
                border: '1px solid var(--glass-border)', zIndex: 1000,
                color: '#fff', fontWeight: 600, fontSize: '0.82rem',
                display: 'flex', alignItems: 'center', gap: '10px'
              }}>
                <span className="spinner" /> Calculating Route…
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}