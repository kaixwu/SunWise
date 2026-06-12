import { useState } from "react";
import axios from "axios";
import { useData } from "../DataContext";
import { useAuth } from "../AuthContext";
import {
  MapPin, Clock, Star, Car, Compass, MessageSquare,
  Zap, CalendarCheck, X, ChevronDown, CheckCircle, Map
} from "lucide-react";
import PlaceModal from "../components/PlaceModal";
import FluidGradient from "../components/FluidGradient";

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
    // Strictly hide currently closed establishments
    return p.isOpen !== false;
  });

  const displayedPlaces = showMore ? filteredPlaces : filteredPlaces.slice(0, 9);

  // ── RENDER ───────────────────────────────────────────
  return (
    <div className="dest-page">
      <div className="fluid-background-container" style={{ position: "fixed" }}>
        <FluidGradient 
          color1="#4c1d95" 
          color2="#be123c" 
          color3="#ea580c" 
          color4="#f59e0b"
          opacity={0.6}
          colorIntensity={0.5}
        />
        <div className="fluid-overlay" style={{ background: "rgba(4, 9, 20, 0.6)" }}></div>
      </div>

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
      <div className="glass-card" style={{ marginBottom: '32px', padding: '24px' }}>
        
        <div style={{ marginBottom: '16px' }}>
          <div className="section-label" style={{ marginBottom: '10px' }}>Category</div>
          <div className="filter-scroll-container">
            {["Any", "Cafe", "Restaurant", "Museum", "Park", "Shopping", "Nature", "Entertainment", "Heritage"].map(p => (
              <button key={p} className={`glass-pill ${prefType === p ? "active" : ""}`} onClick={() => setPrefType(p)}>
                {p}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px' }}>
          <div style={{ flex: '1 1 200px' }}>
            <div className="section-label" style={{ marginBottom: '10px' }}>Environment</div>
            <div className="filter-scroll-container">
              {["Any", "Indoor", "Outdoor"].map(e => (
                <button key={e} className={`glass-pill ${envType === e ? "active" : ""}`} onClick={() => setEnvType(e)}>
                  {e}
                </button>
              ))}
            </div>
          </div>



          <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div className="section-label" style={{ marginBottom: '10px' }}>Search Radius</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '0 8px' }}>
              <input
                type="range" min="2000" max="20000" step="2000"
                value={radius}
                onChange={e => setRadius(parseInt(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--accent-teal)' }}
              />
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--accent-teal)', minWidth: '60px' }}>
                {radius / 1000} km
              </span>
            </div>
          </div>
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
        <PlaceModal
          place={detailPlace}
          onClose={closeDetail}
          onGoToday={() => { closeDetail(); openModal(detailPlace, 'today'); }}
          onSchedule={() => { closeDetail(); openModal(detailPlace, 'schedule'); }}
        />
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
        <>
          <img className="dest-card-img primary-img" src={place.photoUrl} alt={place.name} loading="lazy" />
          {place.photoUrlSecondary && (
            <img className="dest-card-img secondary-img" src={place.photoUrlSecondary} alt={place.name} loading="lazy" />
          )}
        </>
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