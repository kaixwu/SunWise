import React, { useState, useEffect } from 'react';
import { MapPin, Star, Car, Clock, CheckCircle, MessageSquare, Zap, CalendarCheck, Navigation, X } from 'lucide-react';
import axios from 'axios';
import PlaceImageCarousel from './PlaceImageCarousel';
import { useData } from '../DataContext';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Fix Leaflet marker icon rendering bugs in Webpack/Vite bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

// Teal Pulsing User Location Icon matching SunWise's branding
const userLocationTealIcon = L.divIcon({
  className: "custom-user-marker-teal",
  html: `
    <div class="user-marker-container">
      <div class="user-marker-teal-pulse"></div>
      <div class="user-marker-teal-dot"></div>
    </div>
  `,
  iconSize: [30, 30],
  iconAnchor: [15, 15]
});

// Listening to zoom level changes and propagating to parent component
function MapZoomListener({ onChange }) {
  const map = useMap();
  useEffect(() => {
    const handleZoom = () => {
      onChange(map.getZoom());
    };
    map.on('zoomend', handleZoom);
    // Initial call
    handleZoom();
    return () => {
      map.off('zoomend', handleZoom);
    };
  }, [map, onChange]);
  return null;
}

// Helper component to smoothly center/fly the Leaflet map on coordinate changes
function MapFlyTo({ center }) {
  const map = useMap();
  const lat = center ? center[0] : null;
  const lon = center ? center[1] : null;

  useEffect(() => {
    if (lat && lon) {
      map.flyTo([lat, lon], 16, { duration: 1 });
    }
  }, [lat, lon, map]);
  return null;
}

export default function PlaceModal({ place, onClose, onGoToday, onSchedule }) {
  const { currentCoords } = useData();
  const [aiSummary, setAiSummary] = useState(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [directoryStores, setDirectoryStores] = useState([]);
  const [fetchingDirectory, setFetchingDirectory] = useState(false);

  // Map Overlay Internal States
  const [showMap, setShowMap] = useState(false);
  const [routePolyline, setRoutePolyline] = useState([]);
  const [routeInfo, setRouteInfo] = useState(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(13);

  const fetchDirectory = async () => {
    setFetchingDirectory(true);
    setDirectoryStores([]);
    try {
      const res = await axios.post("/api/directory", { lat: place.lat, lon: place.lon });
      setDirectoryStores(res.data.stores);
    } catch (err) {
      console.error(err);
    } finally {
      setFetchingDirectory(false);
    }
  };

  const generateReviewSummary = async () => {
    if (!place.reviews || place.reviews.length === 0) return;
    setAiSummaryLoading(true);
    try {
      const reviewTexts = place.reviews.map(r => typeof r === 'object' ? r.text : r);
      const res = await axios.post('/api/place-summary', { name: place.name, reviews: reviewTexts });
      setAiSummary(res.data.summary);
    } catch (err) {
      console.error(err);
      setAiSummary("Failed to generate summary.");
    } finally {
      setAiSummaryLoading(false);
    }
  };

  // Local route fetch handler (caches results locally in the state to optimize API calls)
  const handleViewRouteInternal = async () => {
    if (!currentCoords) {
      alert("GPS coordinates are not available yet. Please enable location services.");
      return;
    }
    setShowMap(true);
    
    // Use cached route if already fetched
    if (routePolyline.length > 0) return;

    setMapLoading(true);
    try {
      const res = await axios.post("/api/route", {
        start: currentCoords,
        end: { lat: place.lat, lon: place.lon }
      });
      if (res.data.routes && res.data.routes.length > 0) {
        const points = res.data.routes[0].legs[0].points.map(p => [p.latitude, p.longitude]);
        setRoutePolyline(points);
        setRouteInfo(res.data.routes[0].summary);
      } else {
        alert("Could not find a valid route between your location and the destination.");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to calculate route. Please try again later.");
      setShowMap(false);
    } finally {
      setMapLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 9999 }}>
      <div className="modal-panel" onClick={e => e.stopPropagation()}>
        
        {/* Interactive Map Overlay (Covers the whole panel absolutely when showMap is active) */}
        {showMap && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(7, 17, 31, 0.96)', zIndex: 100,
            borderRadius: '24px', display: 'flex', flexDirection: 'column',
            overflow: 'hidden', border: '1px solid var(--glass-border)',
            backdropFilter: 'blur(20px)'
          }}>
            {/* Map Header */}
            <div style={{
              padding: '16px 24px', borderBottom: '1px solid var(--glass-border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: 'rgba(10, 25, 47, 0.5)'
            }}>
              <div>
                <h3 className="font-heading" style={{ margin: 0, fontSize: '1.2rem', color: '#fff' }}>
                  Route to {place.name}
                </h3>
                {routeInfo && (
                  <div style={{ display: 'flex', gap: '16px', fontSize: '0.82rem', color: '#94a3b8', marginTop: '4px' }}>
                    <span>Distance: <strong style={{ color: 'var(--accent-teal)' }}>{(routeInfo.lengthInMeters / 1000).toFixed(1)} km</strong></span>
                    <span>Travel Time: <strong style={{ color: 'var(--accent-blue)' }}>{Math.round(routeInfo.travelTimeInSeconds / 60)} mins</strong></span>
                  </div>
                )}
              </div>
              <button
                onClick={() => { setShowMap(false); }}
                style={{
                  background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)',
                  color: '#fff', padding: '8px 16px', borderRadius: '10px', cursor: 'pointer',
                  fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
              >
                <X size={14} /> Close Map
              </button>
            </div>

            {/* Map Canvas */}
            <div style={{ flex: 1, position: 'relative', background: '#0a1226' }}>
              {mapLoading ? (
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(7,17,31,0.85)', zIndex: 10, color: '#fff', gap: '12px'
                }}>
                  <span className="spinner" style={{ width: '32px', height: '32px' }} />
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, letterSpacing: '0.05em' }}>Calculating tom-tom route...</span>
                </div>
              ) : (
                currentCoords && (
                  <MapContainer
                    center={[currentCoords.lat, currentCoords.lon]}
                    zoom={16}
                    style={{ height: '100%', width: '100%', zIndex: 1 }}
                  >
                    <MapZoomListener onChange={setZoomLevel} />
                    <MapFlyTo center={[currentCoords.lat, currentCoords.lon]} />
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>'
                    />
                    <Marker 
                      position={[currentCoords.lat, currentCoords.lon]}
                      icon={userLocationTealIcon}
                    >
                      <Tooltip 
                        permanent 
                        direction="top" 
                        offset={[0, -10]}
                        className="custom-map-tooltip"
                        style={{
                          fontSize: `${Math.max(8, Math.min(15, zoomLevel * 0.8))}px`
                        }}
                      >
                        You are here
                      </Tooltip>
                    </Marker>
                    <Marker position={[place.lat, place.lon]}>
                      <Popup><strong>{place.name}</strong></Popup>
                    </Marker>
                    {routePolyline.length > 0 && (
                      <Polyline positions={routePolyline} color="var(--accent-blue)" weight={5} opacity={0.85} />
                    )}
                  </MapContainer>
                )
              )}
            </div>
          </div>
        )}

        {/* Hero image */}
        <div className="modal-hero">
          {place.photoUrls && place.photoUrls.length > 0 ? (
            <PlaceImageCarousel photos={place.photoUrls} />
          ) : place.photoUrl ? (
            <img className="modal-hero-img" src={place.photoUrl} alt={place.name} loading="lazy" />
          ) : (
            <div style={{
              width: '100%', height: '100%',
              background: 'linear-gradient(135deg, #0d2240, #071428)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <MapPin size={48} color="var(--text-muted)" />
            </div>
          )}
          <div className="modal-hero-gradient" style={{ zIndex: 2 }} />
          <div className="modal-hero-info" style={{ zIndex: 3 }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
              {place.score > 0 && (
                <span className="dest-card-badge dest-card-badge-score">{place.score}% Match</span>
              )}
              {place.isOpen === true && <span className="dest-card-badge dest-card-badge-open">Open Now</span>}
              {place.isOpen === false && <span className="dest-card-badge dest-card-badge-closed">Closed</span>}
              <span style={{
                padding: '5px 10px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 700,
                background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff'
              }}>{place.category || 'Attraction'}</span>
            </div>
            <h2 className="font-heading" style={{ fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', margin: '0 0 8px', lineHeight: 1.1 }}>
              {place.name}
            </h2>
            <div style={{ display: 'flex', gap: '16px', fontSize: '0.82rem', color: 'rgba(255,255,255,0.6)', flexWrap: 'wrap' }}>
              {place.rating && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent-gold)' }}>
                  <Star size={13} fill="currentColor" /> {place.rating} ({place.ratingCount || place.userRatingCount || 0} reviews)
                </span>
              )}
              {place.distance && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <MapPin size={13} /> {place.distance} km
                </span>
              )}
              {place.travelMins && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Car size={13} /> ~{place.travelMins} min
                </span>
              )}
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} style={{ zIndex: 10 }}>×</button>
        </div>

        {/* Scrollable body layout */}
        {place.reviews && place.reviews.length > 0 ? (
          <div className="modal-body modal-body-grid">
            
            {/* Left Column: Details & Actions */}
            <div className="modal-col-left" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Actions row */}
              <div className="modal-action-row" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {onGoToday && (
                  <button
                    className="modal-action-btn"
                    style={{ background: 'var(--accent-blue)', color: '#07111f', flex: '1 1 0px', minWidth: '100px' }}
                    onClick={onGoToday}
                  >
                    <Zap size={16} fill="currentColor" /> Go Today
                  </button>
                )}
                {onSchedule && (
                  <button
                    className="modal-action-btn"
                    style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', color: 'var(--accent-blue)', flex: '1 1 0px', minWidth: '100px' }}
                    onClick={onSchedule}
                  >
                    <CalendarCheck size={16} /> Schedule
                  </button>
                )}
                <button
                  className="modal-action-btn"
                  style={{ background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-teal))', color: '#07111f', flex: '1 1 0px', minWidth: '100px' }}
                  onClick={handleViewRouteInternal}
                >
                  <Navigation size={16} fill="currentColor" /> View Route
                </button>
              </div>

              {/* Why recommended */}
              {place.matchReasons && place.matchReasons.length > 0 && (
                <div className="modal-section" style={{ margin: 0 }}>
                  <div className="modal-section-title">Why recommended</div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {place.matchReasons.map((r, i) => (
                      <span key={i} className="match-reason-tag">
                        <CheckCircle size={10} /> {r}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Details */}
              <div className="modal-section" style={{ margin: 0 }}>
                <div className="modal-section-title">Details</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {place.address && (
                    <div style={{ display: 'flex', gap: '10px', fontSize: '0.88rem', color: 'var(--text-muted)', alignItems: 'flex-start' }}>
                      <MapPin size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
                      <span>{place.address}</span>
                    </div>
                  )}
                  {place.hoursDisplay && (
                    <div style={{ display: 'flex', gap: '10px', fontSize: '0.88rem', color: 'var(--text-muted)', alignItems: 'flex-start' }}>
                      <Clock size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
                      <span>{place.hoursDisplay}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Mall Directory */}
              {place.category === 'Shopping' && (
                <div className="modal-section" style={{ margin: 0 }}>
                  <div className="modal-section-title">Mall Directory</div>
                  {directoryStores.length === 0 ? (
                    <button
                      onClick={fetchDirectory}
                      disabled={fetchingDirectory}
                      style={{
                        padding: '8px 20px', background: 'rgba(56,189,248,0.1)',
                        border: '1px solid rgba(56,189,248,0.25)', borderRadius: '20px',
                        color: 'var(--accent-blue)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700
                      }}
                    >
                      {fetchingDirectory ? 'Loading…' : 'View Directory'}
                    </button>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {directoryStores.map((store, idx) => (
                        <span key={idx} style={{
                          padding: '5px 12px', borderRadius: '6px', fontSize: '0.78rem',
                          background: 'rgba(255,255,255,0.04)', border: '1px solid var(--glass-border)', color: '#e2e8f0'
                        }}>
                          {store.name} <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>({store.type})</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* AI Review Summary */}
              <div className="modal-section" style={{ margin: 0 }}>
                <div className="modal-section-title">
                  <MessageSquare size={12} /> AI Review Summary
                </div>
                {aiSummary ? (
                  <p style={{ fontSize: '0.9rem', color: 'var(--accent-teal)', fontStyle: 'italic', lineHeight: 1.65, margin: 0 }}>
                    "{aiSummary}"
                  </p>
                ) : (
                  <button
                    onClick={generateReviewSummary}
                    disabled={aiSummaryLoading}
                    style={{
                      padding: '9px 20px', background: 'linear-gradient(135deg, rgba(56,189,248,0.15), rgba(45,212,191,0.15))',
                      border: '1px solid rgba(56,189,248,0.25)', borderRadius: '20px',
                      color: 'var(--accent-blue)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700,
                      width: '100%',
                    }}
                  >
                    {aiSummaryLoading ? 'Generating…' : '✨ Generate AI Summary'}
                  </button>
                )}
              </div>
            </div>

            {/* Right Column: Reviews */}
            <div className="modal-col-right" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="modal-section" style={{ height: '100%', display: 'flex', flexDirection: 'column', margin: 0 }}>
                <div className="modal-section-title">Recent Reviews</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px', flex: 1 }}>
                  {place.reviews.map((rev, idx) => (
                    <div key={idx} className="review-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#e2e8f0' }}>
                          {typeof rev === 'object' ? rev.author : 'Anonymous'}
                        </span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          {typeof rev === 'object' ? rev.time : ''}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                        {typeof rev === 'object' ? rev.text : rev}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Actions row */}
            <div className="modal-action-row" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
              {onGoToday && (
                <button
                  className="modal-action-btn"
                  style={{ background: 'var(--accent-blue)', color: '#07111f', flex: '1 1 0px', minWidth: '100px' }}
                  onClick={onGoToday}
                >
                  <Zap size={16} fill="currentColor" /> Go Today
                </button>
              )}
              {onSchedule && (
                <button
                  className="modal-action-btn"
                  style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', color: 'var(--accent-blue)', flex: '1 1 0px', minWidth: '100px' }}
                  onClick={onSchedule}
                >
                  <CalendarCheck size={16} /> Schedule
                </button>
              )}
              <button
                className="modal-action-btn"
                style={{ background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-teal))', color: '#07111f', flex: '1 1 0px', minWidth: '100px' }}
                onClick={handleViewRouteInternal}
              >
                <Navigation size={16} fill="currentColor" /> View Route
              </button>
            </div>

            {/* Why recommended */}
            {place.matchReasons && place.matchReasons.length > 0 && (
              <div className="modal-section" style={{ margin: 0 }}>
                <div className="modal-section-title">Why recommended</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {place.matchReasons.map((r, i) => (
                    <span key={i} className="match-reason-tag">
                      <CheckCircle size={10} /> {r}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Details */}
            <div className="modal-section" style={{ margin: 0 }}>
              <div className="modal-section-title">Details</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {place.address && (
                  <div style={{ display: 'flex', gap: '10px', fontSize: '0.88rem', color: 'var(--text-muted)', alignItems: 'flex-start' }}>
                    <MapPin size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span>{place.address}</span>
                  </div>
                )}
                {place.hoursDisplay && (
                  <div style={{ display: 'flex', gap: '10px', fontSize: '0.88rem', color: 'var(--text-muted)', alignItems: 'flex-start' }}>
                    <Clock size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span>{place.hoursDisplay}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Mall Directory */}
            {place.category === 'Shopping' && (
              <div className="modal-section" style={{ margin: 0 }}>
                <div className="modal-section-title">Mall Directory</div>
                {directoryStores.length === 0 ? (
                  <button
                    onClick={fetchDirectory}
                    disabled={fetchingDirectory}
                    style={{
                      padding: '8px 20px', background: 'rgba(56,189,248,0.1)',
                      border: '1px solid rgba(56,189,248,0.25)', borderRadius: '20px',
                      color: 'var(--accent-blue)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700
                    }}
                  >
                    {fetchingDirectory ? 'Loading…' : 'View Directory'}
                  </button>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {directoryStores.map((store, idx) => (
                      <span key={idx} style={{
                        padding: '5px 12px', borderRadius: '6px', fontSize: '0.78rem',
                        background: 'rgba(255,255,255,0.04)', border: '1px solid var(--glass-border)', color: '#e2e8f0'
                      }}>
                        {store.name} <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>({store.type})</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
