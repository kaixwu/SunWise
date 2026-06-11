import { useState, useEffect } from "react";
import axios from "axios";
import { useData } from "../DataContext";
import { useAuth } from "../AuthContext";
import {
  MapContainer, TileLayer, Marker, Popup, useMap, Polyline
} from 'react-leaflet';
import {
  Search, MapPin, Navigation, AlertCircle,
  Wind, Droplets, Sunrise, ChevronDown, Zap, Map as MapIcon,
  Sparkles, Compass
} from "lucide-react";
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import publicAxios from "../publicAxios";
import PlaceModal from "../components/PlaceModal";
import FluidGradient from "../components/FluidGradient";
import HeroCarousel from "../components/HeroCarousel";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

const getLocalDateString = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

function MapFlyTo({ center }) {
  const map = useMap();
  map.flyTo(center, 13, { duration: 1 });
  return null;
}

export default function Home() {
  const { token } = useAuth();
  const [selectedPlace, setSelectedPlace] = useState(null);
  const {
    city, weather, currentCoords, loading, locationError, setLocationError,
    fetcheverything, places, todayPlan, radius,
    userCity, setUserCity, refreshItineraries, resetToGPS
  } = useData();

  const [manualCity, setManualCity] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [routePolyline, setRoutePolyline] = useState([]);
  const [routingLoading, setRoutingLoading] = useState(false);
  const [routeInfo, setRouteInfo] = useState(null);
  const [routeDest, setRouteDest] = useState(null);
  const [heroImgUrls, setHeroImgUrls] = useState([]);
  const [currentImgIndex, setCurrentImgIndex] = useState(0);

  // AI Discovery States
  const [activeTab, setActiveTab] = useState("suggest"); 
  const [suggestCategory, setSuggestCategory] = useState("Cafe");
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestResults, setSuggestResults] = useState(() => {
    const saved = localStorage.getItem("suggestResults");
    try {
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [itinLoading, setItinLoading] = useState(false);
  const [itinResults, setItinResults] = useState(null);

  // Scheduling States (identical to Destinations)
  const [modalOpen, setModalOpen] = useState(false);
  const [modalPlace, setModalPlace] = useState(null);
  const [modalMode, setModalMode] = useState('today');
  const [modalDate, setModalDate] = useState("");
  const [modalTime, setModalTime] = useState("");

  const openModal = (place, mode) => {
    setModalPlace(place);
    setModalMode(mode);
    setModalDate(mode === 'today' ? getLocalDateString() : "");
    setModalTime("");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setModalPlace(null);
  };

  const handleConfirmSchedule = async () => {
    if (!modalPlace) return;
    const finalDate = modalMode === 'today' ? getLocalDateString() : modalDate;
    if (!finalDate) { alert("Please select a date."); return; }
    try {
      await axios.post("/api/itineraries", {
        date_str: finalDate,
        time_str: modalTime,
        places: [modalPlace]
      });
      refreshItineraries();
      alert(`Plan confirmed for ${finalDate}!`);
      closeModal();
    } catch (err) {
      console.error(err);
      alert("Failed to save.");
    }
  };

  const handleSuggestPlaces = async () => {
    if (!currentCoords) return;
    setSuggestLoading(true);
    try {
      const weatherData = weather ? {
        temp: weather.main.temp,
        rain_prob: weather.rain ? 100 : 0,
        condition: weather.weather[0].description,
        wind_speed: weather.wind.speed * 3.6
      } : {};

      const res = await axios.post("/api/suggest-places", {
        lat: currentCoords.lat,
        lon: currentCoords.lon,
        category: suggestCategory,
        radius: radius,
        weather: weatherData
      });
      setSuggestResults(res.data);
      localStorage.setItem("suggestResults", JSON.stringify(res.data));
    } catch (err) {
      console.error(err);
    } finally {
      setSuggestLoading(false);
    }
  };

  const handleGenerateItinerary = async () => {
    if (!currentCoords || !city) return;
    setItinLoading(true);
    try {
      const res = await axios.post(
        "/api/generate-itinerary-text",
        {
          prompt: "Create a short 3-stop itinerary around my current location.",
          lat: currentCoords.lat,
          lon: currentCoords.lon,
          search_location: city
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setItinResults(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setItinLoading(false);
    }
  };

  // Clear old AI Discovery results whenever location coordinates change
  useEffect(() => {
    setSuggestResults([]);
    localStorage.removeItem("suggestResults");
    setItinResults(null);
  }, [currentCoords]);

  // Show real name only if user manually searched, else "Current Location"
  const displayCity = userCity ? userCity.toUpperCase() : (city ? "CURRENT LOCATION" : '');

  // ── Hero image effect (uses Unsplash via backend proxy) ─────────────────
  useEffect(() => {
    const fetchHeroImages = async () => {
      let query;

      if (userCity) {
        // User manually searched — extract city/province level from the address string
        const parts = userCity.split(',').map(p => p.trim());
        let cleanName = parts[0];
        if (parts.length >= 3) {
          cleanName = parts[parts.length - 2];
        } else if (parts.length === 2) {
          cleanName = parts[0];
        }
        query = `${cleanName}`;
      } else if (city && currentCoords) {
        // Auto-detected GPS — reverse geocode to get province, not exact city
        try {
          const geoRes = await axios.get(`/api/reverse-geocode?lat=${currentCoords.lat}&lon=${currentCoords.lon}`);
          const province = geoRes.data.province || "Unknown Location";
          query = `${province}`;
        } catch {
          query = "beautiful landscape travel";
        }
      } else {
        return;
      }

      axios.post('/api/hero-image', { 
        query, 
        lat: currentCoords?.lat, 
        lon: currentCoords?.lon 
      })
        .then(res => {
          if (res.data.hero_items && res.data.hero_items.length > 0) {
            setHeroImgUrls(res.data.hero_items);
            setCurrentImgIndex(0);
          } else if (res.data.urls && res.data.urls.length > 0) {
            // Map plain urls to objects for backwards compatibility
            setHeroImgUrls(res.data.urls.map(u => ({ url: u, title: 'Beautiful Destination' })));
            setCurrentImgIndex(0);
          } else if (res.data.url) {
            setHeroImgUrls([{ url: res.data.url, title: 'Beautiful Destination' }]);
            setCurrentImgIndex(0);
          } else {
            setHeroImgUrls([]);
          }
        })
        .catch(() => setHeroImgUrls([]));
    };

    fetchHeroImages();
  }, [city, userCity, currentCoords]);

  // Auto slide effect
  useEffect(() => {
    if (heroImgUrls.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentImgIndex(prev => (prev + 1) % heroImgUrls.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [heroImgUrls]);

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
      {/* Top Left Controls: Change Area & Location Name */}
      {weather && currentCoords && !locationError && (
        <div style={{
          position: "fixed",
          top: "1.5rem",
          left: "12rem",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          gap: "1.5rem",
          pointerEvents: "none"
        }}>
          <button
            className="hero-btn hero-btn-outline"
            style={{
              padding: "8px 16px",
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              backdropFilter: "blur(10px)",
              pointerEvents: "auto",
              transition: "background 0.3s"
            }}
            onClick={() => {
              setUserCity(null);
              setLocationError(true);
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
          >
            <MapPin size={13} style={{ marginRight: 6 }} /> Change Area
          </button>
          
          <div style={{
            fontSize: "0.95rem",
            fontWeight: "600",
            letterSpacing: "0.15em",
            color: "rgba(255,255,255,0.9)",
            textTransform: "uppercase"
          }}>
            {displayCity || 'YOUR CITY'}
          </div>
        </div>
      )}
      {/* Background Carousel */}
      {heroImgUrls.length > 0 && !locationError && (
        <HeroCarousel items={heroImgUrls} currentIndex={currentImgIndex} />
      )}
      {/* Static gradient fallback bg */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(135deg, #0d2240 0%, #071428 50%, #030b1a 100%)',
        zIndex: 0,
      }} />
      {/* No extra gradient overlays or indicators here */}
      
      {/* Content overlay */}
      {locationError ? (
        /* No location: show search UI */
        <div className="hero-search-overlay" style={{ zIndex: 10 }}>
          <div className="hero-eyebrow">Location Required</div>
          <h1 className="hero-city-name" style={{ fontSize: 'clamp(2.2rem, 5vw, 4rem)', whiteSpace: 'nowrap', marginBottom: '14px' }}>
            Where are you going?
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
            <button
              className="hero-btn"
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '13px 24px'
              }}
              onClick={() => {
                resetToGPS();
              }}
            >
              <Compass size={16} /> Use Current Location
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
      <div className="fluid-background-container" style={{ position: "fixed" }}>
        <FluidGradient 
          color1="#0f172a" 
          color2="#1e3a8a" 
          color3="#0369a1" 
          color4="#06b6d4"
          opacity={0.8}
          colorIntensity={0.6}
        />
        <div className="fluid-overlay" style={{ background: "rgba(4, 9, 20, 0.5)" }}></div>
      </div>
      {renderHero()}

      {/* ── AI Discovery Section ─────────────────────────────────────────────────── */}
      {!loading && !locationError && currentCoords && (
        <div style={{ maxWidth: "1600px", margin: "0 auto", padding: "40px 24px" }}>
          <div style={{ textAlign: "center", marginBottom: "32px" }}>
            <h2 className="font-heading" style={{ fontSize: "2.5rem", margin: "0 0 12px" }}>
              <span className="text-gradient-blue">AI Discovery</span>
            </h2>
            <p style={{ color: "var(--text-muted)", maxWidth: "500px", margin: "0 auto" }}>
              Let SunWise recommend the best places based on your location and preferences.
            </p>
          </div>

            <div className="glass-card" style={{ padding: "32px", display: "grid", gridTemplateColumns: "340px 1fr", gap: "32px", alignItems: "start" }}>
              
              {/* Left Column: Categories */}
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <h3 style={{ margin: 0, fontSize: "1.1rem", color: "var(--accent-teal)" }}>Categories</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  {["Any", "Cafe", "Restaurant", "Museum", "Park", "Shopping", "Nature", "Entertainment", "Heritage"].map(cat => (
                    <button
                      key={cat}
                      onClick={() => setSuggestCategory(cat)}
                      className={`segmented-btn ${suggestCategory === cat ? "active" : ""}`}
                      style={{ 
                        whiteSpace: "nowrap", padding: "12px 14px", borderRadius: "30px", 
                        fontSize: "0.85rem", justifyContent: "center", 
                        border: suggestCategory === cat ? "1px solid var(--accent-teal)" : "1px solid rgba(255,255,255,0.1)"
                      }}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <button 
                  onClick={handleSuggestPlaces}
                  disabled={suggestLoading}
                  style={{ 
                    marginTop: "12px", padding: "16px 24px", 
                    background: "linear-gradient(135deg, var(--accent-blue), var(--accent-teal))", 
                    border: "none", borderRadius: "30px", color: "#fff", 
                    fontWeight: "700", cursor: "pointer", display: "flex", 
                    alignItems: "center", justifyContent: "center", gap: "8px", width: "100%" 
                  }}
                >
                  {suggestLoading ? <span className="spinner" style={{ width: "18px", height: "18px" }} /> : <Sparkles size={18} />} 
                  Find Top 3
                </button>
              </div>

              {/* Right Column: Results */}
              <div style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: 0 }}>
                {suggestResults.length > 0 ? (
                  suggestResults.map((p, i) => (
                    <div 
                      key={i} 
                      className="glass-card shimmer-glass suggest-card" 
                      style={{ overflow: "hidden", padding: 0, cursor: "pointer", transition: "transform 0.2s", display: "flex", flexDirection: "row", height: "135px" }}
                      onClick={() => setSelectedPlace(p)}
                    >
                      <div style={{ width: "140px", background: "#111", position: "relative", flexShrink: 0 }}>
                        {p.photoUrl ? (
                          <img src={p.photoUrl} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
                        ) : (
                          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <MapPin size={32} color="rgba(255,255,255,0.2)" />
                          </div>
                        )}
                        <div style={{ position: "absolute", top: "8px", left: "8px", background: "rgba(0,0,0,0.6)", padding: "4px 8px", borderRadius: "8px", fontSize: "0.7rem", fontWeight: "700", color: "#fff", backdropFilter: "blur(4px)" }}>
                          Top {i + 1}
                        </div>
                      </div>
                      <div style={{ padding: "12px 16px", flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px" }}>
                          <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: "700", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</h3>
                          <div style={{ fontSize: "0.7rem", color: "var(--accent-teal)", fontWeight: "700", textTransform: "uppercase", flexShrink: 0, marginLeft: "12px" }}>{p.category}</div>
                        </div>
                        <p style={{ margin: "0 0 6px", fontSize: "0.8rem", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.address}</p>
                        {p.rating && (
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", marginBottom: "8px" }}>
                            <span style={{ color: "var(--accent-gold)" }}>★</span> {p.rating} ({p.ratingCount} reviews)
                          </div>
                        )}
                        
                        <div style={{ marginTop: "auto", fontSize: "0.8rem", color: "#cbd5e1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          <strong style={{ color: "var(--accent-teal)", marginRight: "6px" }}>Why Suggested?</strong>
                          {p.whySuggested || (p.matchReasons && p.matchReasons.length > 0 ? p.matchReasons[0] : `A highly-rated ${p.category || 'destination'} nearby.`)}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ textAlign: "center", padding: "48px 20px", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: "16px", background: "rgba(0,0,0,0.2)", height: "100%", minHeight: "300px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
                    <Compass size={48} color="var(--accent-blue)" style={{ opacity: 0.5, marginBottom: "16px" }} />
                    <h3 style={{ margin: "0 0 8px", color: "#e2e8f0", fontSize: "1.2rem" }}>Ready to Explore?</h3>
                    <p style={{ color: "var(--text-muted)", maxWidth: "400px", margin: "0 auto", fontSize: "0.95rem" }}>
                      Select a category and tap <strong>Find Top 3</strong>. Our AI will analyze your location and find the best hidden gems near you.
                    </p>
                  </div>
                )}
              </div>
            </div>


        </div>
      )}

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
          <div className="home-map-container map-breathe">
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


      {selectedPlace && (
        <PlaceModal 
          place={selectedPlace} 
          onClose={() => setSelectedPlace(null)} 
          onGoToday={() => { openModal(selectedPlace, 'today'); }}
          onSchedule={() => { openModal(selectedPlace, 'schedule'); }}
        />
      )}

      {/* ── Scheduling Modal (identical to Destinations) ───────────────────────────── */}
      {modalOpen && modalPlace && (
        <div className="sched-modal-backdrop" onClick={closeModal} style={{ zIndex: 10000 }}>
          <div className="sched-modal-panel" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <div className="section-label" style={{ marginBottom: '4px' }}>
                  {modalMode === 'today' ? '⚡ Go Today' : '📅 Schedule'}
                </div>
                <h3 className="font-heading" style={{ margin: 0, fontSize: '1.4rem', letterSpacing: '0.04em' }}>
                  {modalPlace.name}
                </h3>
              </div>
              <button
                onClick={closeModal}
                style={{
                  background: 'transparent', border: 'none', color: 'var(--text-muted)',
                  cursor: 'pointer', padding: '4px', borderRadius: '6px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {modalMode === 'schedule' && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  Date
                </label>
                <input
                  type="date"
                  min={getLocalDateString()}
                  value={modalDate}
                  onChange={e => setModalDate(e.target.value)}
                  className="input-field"
                  style={{ width: '100%', marginBottom: 0 }}
                />
              </div>
            )}

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Time (optional)
              </label>
              <input
                type="time"
                value={modalTime}
                onChange={e => setModalTime(e.target.value)}
                className="input-field"
                style={{ width: '100%', marginBottom: 0 }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={closeModal}
                style={{
                  flex: 1, padding: '11px', background: 'transparent',
                  border: '1px solid var(--glass-border)', color: '#e2e8f0',
                  borderRadius: '10px', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 600
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSchedule}
                disabled={modalMode === 'schedule' && !modalDate}
                style={{
                  flex: 1, padding: '11px',
                  background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-teal))',
                  border: 'none', color: '#07111f', borderRadius: '10px',
                  cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: '1rem',
                  letterSpacing: '0.05em', opacity: (modalMode === 'schedule' && !modalDate) ? 0.5 : 1
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}