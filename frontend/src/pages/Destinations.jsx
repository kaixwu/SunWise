import { useState } from "react";
import axios from "axios";
import { useData } from "../DataContext";
import { useAuth } from "../AuthContext";
import {
  MapPin, Clock, Star, Car, Compass, MessageSquare,
  Zap, CalendarCheck, X, ChevronDown, CheckCircle, Map
} from "lucide-react";

const getLocalDateString = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export default function Destinations() {
  const { token } = useAuth();
  const {
    places, placesLoading, locationError,
    envType, setEnvType, prefType, setPrefType, radius, setRadius,
    weather, refreshItineraries
  } = useData();

  const [openFilter, setOpenFilter] = useState("Any");
  const [showMore, setShowMore] = useState(false);

  // Detail modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailPlace, setDetailPlace] = useState(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState(null);
  const [directoryStores, setDirectoryStores] = useState([]);
  const [fetchingDirectory, setFetchingDirectory] = useState(false);

  // Scheduling modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalPlace, setModalPlace] = useState(null);
  const [modalMode, setModalMode] = useState('today');
  const [modalDate, setModalDate] = useState("");
  const [modalTime, setModalTime] = useState("");

  // ── Detail modal open/close ──────────────────────────
  const openDetail = (place) => {
    setDetailPlace(place);
    setAiSummary(null);
    setDirectoryStores([]);
    setDetailOpen(true);
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setDetailPlace(null);
    setAiSummary(null);
    setDirectoryStores([]);
  };

  // ── Scheduling modal ─────────────────────────────────
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

  // ── AI Review Summary ────────────────────────────────
  const generateReviewSummary = async (place) => {
    setAiSummaryLoading(true);
    setAiSummary(null);
    try {
      const reviewTexts = place.reviews
        ? place.reviews.map(r => typeof r === 'object' ? r.text : r)
        : [];
      const res = await axios.post("/api/place-summary", {
        name: place.name,
        reviews: reviewTexts
      });
      setAiSummary(res.data.summary);
    } catch (err) {
      console.error(err);
      setAiSummary("Failed to generate summary.");
    } finally {
      setAiSummaryLoading(false);
    }
  };

  // ── Mall Directory ───────────────────────────────────
  const fetchDirectory = async (place) => {
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

  // ── Filter logic ─────────────────────────────────────
  const filteredPlaces = places.filter(p => {
    if (openFilter === "Open" && p.isOpen !== true) return false;
    if (openFilter === "Closed" && p.isOpen !== false) return false;
    return true;
  });

  const displayedPlaces = showMore ? filteredPlaces : filteredPlaces.slice(0, 9);

  // ── RENDER ───────────────────────────────────────────
  return (
    <div className="dest-page">
      {/* Page Header */}
      <div style={{ marginBottom: '32px', paddingTop: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Compass size={28} color="var(--accent-blue)" />
          <div>
            <div className="section-label">What's nearby</div>
            <h2 className="font-heading" style={{ margin: 0, fontSize: '2.2rem', letterSpacing: '0.04em' }}>
              Top Destinations
            </h2>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-card" style={{ marginBottom: '28px' }}>
        <div className="filter-row">
          <span className="filter-label">Environment</span>
          {["Any", "Indoor", "Outdoor"].map(e => (
            <button key={e} className={`btn-chip ${envType === e ? "active" : ""}`} onClick={() => setEnvType(e)}>{e}</button>
          ))}
        </div>
        <div className="filter-row">
          <span className="filter-label">Category</span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {["Any", "Cafe", "Restaurant", "Museum", "Park", "Shopping", "Nature", "Entertainment", "Heritage"].map(p => (
              <button key={p} className={`btn-chip ${prefType === p ? "active" : ""}`} onClick={() => setPrefType(p)}>{p}</button>
            ))}
          </div>
        </div>
        <div className="filter-row">
          <span className="filter-label">Status</span>
          {["Any", "Open", "Closed"].map(o => (
            <button key={o} className={`btn-chip ${openFilter === o ? "active" : ""}`} onClick={() => setOpenFilter(o)}>
              {o === "Open" ? "Open Now" : o === "Closed" ? "Closed" : o}
            </button>
          ))}
        </div>
        <div className="filter-row">
          <span className="filter-label">Radius</span>
          <input
            type="range" min="5000" max="50000" step="5000"
            value={radius}
            onChange={e => setRadius(parseInt(e.target.value))}
            style={{ flex: 1, maxWidth: '280px', accentColor: 'var(--accent-blue)' }}
          />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--accent-blue)', minWidth: '52px' }}>
            {radius / 1000} km
          </span>
        </div>
      </div>

      {/* Location error */}
      {locationError && (
        <div className="glass-card" style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
          <MapPin size={40} color="var(--accent-blue)" style={{ marginBottom: '16px' }} />
          <p>Please set your location on the Home page first.</p>
        </div>
      )}

      {/* Loading skeleton */}
      {placesLoading && (
        <div className="dest-grid">
          {Array(6).fill(0).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: '380px', borderRadius: '20px', animationDelay: `${i * 0.08}s` }} />
          ))}
        </div>
      )}

      {/* Cards Grid */}
      {!placesLoading && !locationError && (
        <>
          {filteredPlaces.length === 0 ? (
            <div className="glass-card" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No places match your filters. Try adjusting them!
            </div>
          ) : (
            <div className="dest-grid">
              {displayedPlaces.map((p, i) => (
                <DestCard
                  key={i}
                  place={p}
                  index={i}
                  onOpen={() => openDetail(p)}
                  onGoToday={e => { e.stopPropagation(); openModal(p, 'today'); }}
                  onSchedule={e => { e.stopPropagation(); openModal(p, 'schedule'); }}
                />
              ))}
            </div>
          )}

          {filteredPlaces.length > 9 && (
            <div style={{ textAlign: 'center', marginTop: '36px' }}>
              <button
                onClick={() => setShowMore(!showMore)}
                className="btn-chip"
                style={{ padding: '12px 32px', fontSize: '0.85rem' }}
              >
                {showMore ? 'Show Less' : `Show All ${filteredPlaces.length} Destinations`}
                <ChevronDown size={14} style={{ marginLeft: 6, transform: showMore ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Place Detail Modal ─────────────────────────── */}
      {detailOpen && detailPlace && (
        <div className="modal-backdrop" onClick={closeDetail}>
          <div className="modal-panel" onClick={e => e.stopPropagation()}>
            {/* Hero image */}
            <div className="modal-hero">
              {detailPlace.photoUrl ? (
                <img className="modal-hero-img" src={detailPlace.photoUrl} alt={detailPlace.name} />
              ) : (
                <div style={{
                  width: '100%', height: '100%',
                  background: 'linear-gradient(135deg, #0d2240, #071428)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <MapPin size={48} color="var(--text-muted)" />
                </div>
              )}
              <div className="modal-hero-gradient" />
              <div className="modal-hero-info">
                {/* Badges */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                  {detailPlace.score > 0 && (
                    <span className="dest-card-badge dest-card-badge-score">{detailPlace.score}% Match</span>
                  )}
                  {detailPlace.isOpen === true && <span className="dest-card-badge dest-card-badge-open">Open Now</span>}
                  {detailPlace.isOpen === false && <span className="dest-card-badge dest-card-badge-closed">Closed</span>}
                  <span style={{
                    padding: '5px 10px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 700,
                    background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff'
                  }}>{detailPlace.category}</span>
                </div>
                <h2 className="font-heading" style={{ fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', margin: '0 0 8px', lineHeight: 1.1 }}>
                  {detailPlace.name}
                </h2>
                <div style={{ display: 'flex', gap: '16px', fontSize: '0.82rem', color: 'rgba(255,255,255,0.6)', flexWrap: 'wrap' }}>
                  {detailPlace.rating && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent-gold)' }}>
                      <Star size={13} fill="currentColor" /> {detailPlace.rating.toFixed(1)}
                    </span>
                  )}
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <MapPin size={13} /> {detailPlace.distance} km
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Car size={13} /> ~{detailPlace.travelMins} min
                  </span>
                </div>
              </div>
              <button className="modal-close-btn" onClick={closeDetail}>×</button>
            </div>

            {/* Scrollable body */}
            <div className="modal-body">
              {/* Actions */}
              <div className="modal-action-row" style={{ marginBottom: '24px' }}>
                <button
                  className="modal-action-btn"
                  style={{ background: 'var(--accent-blue)', color: '#07111f' }}
                  onClick={() => openModal(detailPlace, 'today')}
                >
                  <Zap size={16} fill="currentColor" /> Go Today
                </button>
                <button
                  className="modal-action-btn"
                  style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', color: 'var(--accent-blue)' }}
                  onClick={() => openModal(detailPlace, 'schedule')}
                >
                  <CalendarCheck size={16} /> Schedule
                </button>
              </div>

              {/* Why recommended */}
              {detailPlace.matchReasons && detailPlace.matchReasons.length > 0 && (
                <div className="modal-section">
                  <div className="modal-section-title">Why recommended</div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {detailPlace.matchReasons.map((r, i) => (
                      <span key={i} className="match-reason-tag">
                        <CheckCircle size={10} /> {r}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Details */}
              <div className="modal-section">
                <div className="modal-section-title">Details</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {detailPlace.address && (
                    <div style={{ display: 'flex', gap: '10px', fontSize: '0.88rem', color: 'var(--text-muted)', alignItems: 'flex-start' }}>
                      <MapPin size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
                      <span>{detailPlace.address}</span>
                    </div>
                  )}
                  {detailPlace.hoursDisplay && (
                    <div style={{ display: 'flex', gap: '10px', fontSize: '0.88rem', color: 'var(--text-muted)', alignItems: 'flex-start' }}>
                      <Clock size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
                      <span>{detailPlace.hoursDisplay}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Mall Directory */}
              {detailPlace.category === 'Shopping' && (
                <div className="modal-section">
                  <div className="modal-section-title">Mall Directory</div>
                  {directoryStores.length === 0 ? (
                    <button
                      onClick={() => fetchDirectory(detailPlace)}
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
              <div className="modal-section">
                <div className="modal-section-title">
                  <MessageSquare size={12} /> AI Review Summary
                </div>
                {aiSummary ? (
                  <p style={{ fontSize: '0.9rem', color: 'var(--accent-teal)', fontStyle: 'italic', lineHeight: 1.65, margin: 0 }}>
                    "{aiSummary}"
                  </p>
                ) : (
                  <button
                    onClick={() => generateReviewSummary(detailPlace)}
                    disabled={aiSummaryLoading || !detailPlace.reviews || detailPlace.reviews.length === 0}
                    style={{
                      padding: '9px 20px', background: 'linear-gradient(135deg, rgba(56,189,248,0.15), rgba(45,212,191,0.15))',
                      border: '1px solid rgba(56,189,248,0.25)', borderRadius: '20px',
                      color: 'var(--accent-blue)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700,
                      width: '100%',
                    }}
                  >
                    {aiSummaryLoading ? 'Generating…'
                      : detailPlace.reviews && detailPlace.reviews.length > 0
                        ? '✨ Generate AI Summary'
                        : 'No reviews available'}
                  </button>
                )}
              </div>

              {/* Reviews */}
              {detailPlace.reviews && detailPlace.reviews.length > 0 && (
                <div className="modal-section">
                  <div className="modal-section-title">Recent Reviews</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '240px', overflowY: 'auto', paddingRight: '4px' }}>
                    {detailPlace.reviews.map((rev, idx) => (
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
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Scheduling Modal ───────────────────────────── */}
      {modalOpen && modalPlace && (
        <div className="sched-modal-backdrop" onClick={closeModal}>
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

// ── Destination Card Component ─────────────────────────────
function DestCard({ place, index, onOpen, onGoToday, onSchedule }) {
  const hasPhoto = !!place.photoUrl;

  return (
    <div
      className="dest-card"
      style={{ animationDelay: `${Math.min(index, 8) * 0.06}s` }}
      onClick={onOpen}
    >
      {/* Image */}
      {hasPhoto ? (
        <img className="dest-card-img" src={place.photoUrl} alt={place.name} />
      ) : (
        <div className="dest-card-img-placeholder">
          <MapPin size={40} />
        </div>
      )}

      {/* Gradient */}
      <div className="dest-card-gradient" />

      {/* Top badges */}
      <div className="dest-card-top-badges">
        {place.score > 0 && (
          <span className="dest-card-badge dest-card-badge-score">{place.score}%</span>
        )}
        {place.isOpen === true && <span className="dest-card-badge dest-card-badge-open">Open</span>}
        {place.isOpen === false && <span className="dest-card-badge dest-card-badge-closed">Closed</span>}
      </div>

      {/* Bottom info */}
      <div className="dest-card-bottom">
        <div className="dest-card-name">{place.name}</div>
        <div className="dest-card-meta">
          <span>{place.category}</span>
          {place.rating && (
            <>
              <span className="dest-card-meta-sep" />
              <span className="dest-card-rating">
                <Star size={11} fill="currentColor" /> {place.rating.toFixed(1)}
              </span>
            </>
          )}
          <span className="dest-card-meta-sep" />
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <MapPin size={11} /> {place.distance} km
          </span>
          <span className="dest-card-meta-sep" />
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <Car size={11} /> {place.travelMins} min
          </span>
        </div>
      </div>

      {/* Hover action buttons */}
      <div className="dest-card-actions">
        <button className="dest-card-action-btn dest-card-action-primary" onClick={onGoToday}>
          <Zap size={13} fill="currentColor" /> Go Today
        </button>
        <button className="dest-card-action-btn dest-card-action-secondary" onClick={onSchedule}>
          <CalendarCheck size={13} /> Schedule
        </button>
      </div>
    </div>
  );
}