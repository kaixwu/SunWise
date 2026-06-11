import React, { useState } from 'react';
import { MapPin, Star, Car, Clock, CheckCircle, MessageSquare, Zap, CalendarCheck } from 'lucide-react';
import axios from 'axios';
import PlaceImageCarousel from './PlaceImageCarousel';

export default function PlaceModal({ place, onClose, onGoToday, onSchedule }) {
  const [aiSummary, setAiSummary] = useState(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [directoryStores, setDirectoryStores] = useState([]);
  const [fetchingDirectory, setFetchingDirectory] = useState(false);

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

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 9999 }}>
      <div className="modal-panel" onClick={e => e.stopPropagation()}>
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
                  <Star size={13} fill="currentColor" /> {place.rating} ({place.ratingCount || 0} reviews)
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

        {/* Scrollable body */}
        {place.reviews && place.reviews.length > 0 ? (
          <div className="modal-body modal-body-grid">
            {/* Left Column: Details & Actions */}
            <div className="modal-col-left" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Actions */}
              {(onGoToday || onSchedule) && (
                <div className="modal-action-row" style={{ display: 'flex', gap: '12px' }}>
                  {onGoToday && (
                    <button
                      className="modal-action-btn"
                      style={{ background: 'var(--accent-blue)', color: '#07111f', flex: 1 }}
                      onClick={onGoToday}
                    >
                      <Zap size={16} fill="currentColor" /> Go Today
                    </button>
                  )}
                  {onSchedule && (
                    <button
                      className="modal-action-btn"
                      style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', color: 'var(--accent-blue)', flex: 1 }}
                      onClick={onSchedule}
                    >
                      <CalendarCheck size={16} /> Schedule
                    </button>
                  )}
                </div>
              )}

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
            {/* Actions */}
            {(onGoToday || onSchedule) && (
              <div className="modal-action-row" style={{ display: 'flex', gap: '12px' }}>
                {onGoToday && (
                  <button
                    className="modal-action-btn"
                    style={{ background: 'var(--accent-blue)', color: '#07111f', flex: 1 }}
                    onClick={onGoToday}
                  >
                    <Zap size={16} fill="currentColor" /> Go Today
                  </button>
                )}
                {onSchedule && (
                  <button
                    className="modal-action-btn"
                    style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', color: 'var(--accent-blue)', flex: 1 }}
                    onClick={onSchedule}
                  >
                    <CalendarCheck size={16} /> Schedule
                  </button>
                )}
              </div>
            )}

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
