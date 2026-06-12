import React, { useState, useEffect } from "react";
import axios from "axios";
import { useAuth } from "../AuthContext";
import { useData } from "../DataContext";
import { X, Utensils, ShoppingBag, Trees, Compass, Flame, Sparkles } from "lucide-react";

export default function PreferencesModal() {
  const { token, showPreferences, setShowPreferences } = useAuth();
  const { setSuggestRefreshTrigger } = useData();
  
  const [activities, setActivities] = useState([]);
  const [budget, setBudget] = useState("moderate");
  const [pace, setPace] = useState("moderate");
  const [vibe, setVibe] = useState("");
  const [saving, setSaving] = useState(false);
  const [isOnboarding, setIsOnboarding] = useState(false);

  useEffect(() => {
    if (token) {
      axios.get("/api/preferences")
        .then(res => {
          const data = res.data;
          setActivities(data.preferred_activities || []);
          setBudget(data.budget_level || "moderate");
          setPace(data.travel_pace || "moderate");
          setVibe(data.vibe_description || "");
          
          const hasSaved = localStorage.getItem("sunwise_preferences_saved");
          if (!hasSaved) {
            setIsOnboarding(true);
            setShowPreferences(true);
          }
        })
        .catch(err => {
          console.error("Failed to fetch preferences", err);
        });
    }
  }, [token, setShowPreferences]);

  if (!showPreferences) return null;

  const activityOptions = [
    { id: "Food & Dining", name: "Food & Dining", icon: Utensils, desc: "Cafes, restaurants, & local eats" },
    { id: "Shopping", name: "Shopping", icon: ShoppingBag, desc: "Malls, boutiques, & markets" },
    { id: "Outdoor & Nature", name: "Outdoor & Nature", icon: Trees, desc: "Parks, nature, & outdoor breeze" },
    { id: "Historical & Cultural", name: "Historical & Cultural", icon: Compass, desc: "Museums, heritage, & culture" },
    { id: "Theme Parks & Adventure", name: "Theme Parks & Adventure", icon: Flame, desc: "Attractions, theme parks, & thrills" }
  ];

  const budgetOptions = [
    { id: "budget", name: "Budget", desc: "Free & cheap entries" },
    { id: "moderate", name: "Moderate", desc: "Mid-range pricing" },
    { id: "luxury", name: "Luxury", desc: "Premium experiences" }
  ];

  const paceOptions = [
    { id: "relaxed", name: "Relaxed", desc: "2-3 stops, slow & steady" },
    { id: "moderate", name: "Moderate", desc: "3-4 stops, standard pace" },
    { id: "active", name: "Active", desc: "4-6 stops, fully packed day" }
  ];

  const toggleActivity = (id) => {
    if (activities.includes(id)) {
      setActivities(activities.filter(a => a !== id));
    } else {
      setActivities([...activities, id]);
    }
  };

  const handleSave = () => {
    setSaving(true);
    axios.post("/api/preferences", {
      preferred_activities: activities,
      budget_level: budget,
      travel_pace: pace,
      vibe_description: vibe.trim()
    })
    .then(res => {
      localStorage.setItem("sunwise_preferences_saved", "true");
      setShowPreferences(false);
      setIsOnboarding(false);
      if (typeof setSuggestRefreshTrigger === "function") {
        setSuggestRefreshTrigger(prev => prev + 1);
      }
    })
    .catch(err => {
      console.error("Failed to save preferences", err);
    })
    .finally(() => {
      setSaving(false);
    });
  };

  return (
    <div className="pref-modal-overlay">
      <style>{`
        .pref-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(10, 15, 30, 0.7);
          backdrop-filter: blur(25px);
          -webkit-backdrop-filter: blur(25px);
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          animation: pref-fade-in 0.4s ease-out;
        }

        .pref-modal-card {
          width: 100%;
          max-width: 650px;
          max-height: 90vh;
          background: rgba(20, 25, 45, 0.8);
          border: 1px solid rgba(20, 184, 166, 0.2);
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4), 
                      0 0 40px rgba(20, 184, 166, 0.05);
          border-radius: 24px;
          overflow-y: auto;
          position: relative;
          display: flex;
          flex-direction: column;
          color: #f1f5f9;
        }

        .pref-modal-header {
          padding: 28px 32px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          position: relative;
        }

        .pref-modal-title {
          font-size: 1.6rem;
          font-weight: 700;
          letter-spacing: -0.5px;
          background: linear-gradient(135deg, #2dd4bf 0%, #3b82f6 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .pref-modal-subtitle {
          color: #94a3b8;
          font-size: 0.95rem;
          line-height: 1.4;
        }

        .pref-modal-close-btn {
          position: absolute;
          top: 24px;
          right: 28px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #94a3b8;
          border-radius: 50%;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .pref-modal-close-btn:hover {
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
          border-color: rgba(239, 68, 68, 0.2);
        }

        .pref-modal-body {
          padding: 24px 32px 32px;
          display: flex;
          flex-direction: column;
          gap: 28px;
        }

        .pref-section-title {
          font-size: 1.05rem;
          font-weight: 600;
          color: #f8fafc;
          margin-bottom: 12px;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }

        /* Activities Section Grid */
        .pref-activities-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 12px;
        }

        .pref-activity-card {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 16px 20px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 16px;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .pref-activity-card:hover {
          background: rgba(20, 184, 166, 0.04);
          border-color: rgba(20, 184, 166, 0.25);
          transform: translateY(-2px);
        }

        .pref-activity-card.selected {
          background: rgba(20, 184, 166, 0.1);
          border-color: rgba(20, 184, 166, 0.6);
          box-shadow: 0 0 15px rgba(20, 184, 166, 0.15);
        }

        .pref-activity-icon-box {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.04);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #94a3b8;
          transition: all 0.25s ease;
        }

        .pref-activity-card.selected .pref-activity-icon-box {
          background: rgba(20, 184, 166, 0.2);
          color: #2dd4bf;
        }

        .pref-activity-info {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .pref-activity-name {
          font-size: 0.95rem;
          font-weight: 600;
          color: #f1f5f9;
        }

        .pref-activity-desc {
          font-size: 0.78rem;
          color: #64748b;
        }

        /* Budget & Pace Selection Row */
        .pref-options-row {
          display: grid;
          grid-template-columns: 1fr;
          gap: 24px;
        }

        @media (min-width: 550px) {
          .pref-options-row {
            grid-template-columns: 1fr 1fr;
          }
        }

        .pref-chip-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .pref-chip {
          display: flex;
          flex-direction: column;
          padding: 12px 18px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 14px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .pref-chip:hover {
          background: rgba(59, 130, 246, 0.04);
          border-color: rgba(59, 130, 246, 0.25);
        }

        .pref-chip.selected {
          background: rgba(59, 130, 246, 0.1);
          border-color: rgba(59, 130, 246, 0.6);
          box-shadow: 0 0 15px rgba(59, 130, 246, 0.1);
        }

        .pref-chip-label {
          font-size: 0.9rem;
          font-weight: 600;
          color: #f1f5f9;
        }

        .pref-chip-desc {
          font-size: 0.75rem;
          color: #64748b;
          margin-top: 2px;
        }

        /* Save Button styling */
        .pref-save-btn {
          margin-top: 8px;
          background: linear-gradient(135deg, #2dd4bf 0%, #0d9488 100%);
          border: none;
          outline: none;
          color: #fff;
          font-weight: 600;
          font-size: 1rem;
          padding: 16px;
          border-radius: 16px;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          box-shadow: 0 4px 20px rgba(13, 148, 136, 0.2);
        }

        .pref-save-btn:hover {
          box-shadow: 0 6px 25px rgba(13, 148, 136, 0.4);
          transform: translateY(-1px);
        }

        .pref-save-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        @keyframes pref-fade-in {
          from {
            opacity: 0;
            backdrop-filter: blur(0px);
          }
          to {
            opacity: 1;
            backdrop-filter: blur(25px);
          }
        }
      `}</style>

      <div className="pref-modal-card">
        <div className="pref-modal-header">
          <h2 className="pref-modal-title">
            <Sparkles size={24} style={{ color: "#2dd4bf" }} />
            {isOnboarding ? "Personalize Your SunWise Journey" : "Travel Preferences"}
          </h2>
          <p className="pref-modal-subtitle">
            {isOnboarding 
              ? "Tell us what you enjoy, your budget, and travel speed. We will score and recommend places tailored uniquely to your style."
              : "Update your travel style preferences below to automatically boost matching scores & personalized AI suggestions."}
          </p>
          {!isOnboarding && (
            <button className="pref-modal-close-btn" onClick={() => setShowPreferences(false)}>
              <X size={18} />
            </button>
          )}
        </div>

        <div className="pref-modal-body">
          {/* BUDGET & PACE OPTIONS */}
          <div className="pref-options-row">
            {/* BUDGET */}
            <div className="pref-chip-group">
              <h3 className="pref-section-title">Budget Style</h3>
              {budgetOptions.map(opt => {
                const isSelected = budget === opt.id;
                return (
                  <div 
                    key={opt.id}
                    className={`pref-chip ${isSelected ? "selected" : ""}`}
                    onClick={() => setBudget(opt.id)}
                  >
                    <span className="pref-chip-label">{opt.name}</span>
                    <span className="pref-chip-desc">{opt.desc}</span>
                  </div>
                );
              })}
            </div>

            {/* PACING */}
            <div className="pref-chip-group">
              <h3 className="pref-section-title">Itinerary Pace</h3>
              {paceOptions.map(opt => {
                const isSelected = pace === opt.id;
                return (
                  <div 
                    key={opt.id}
                    className={`pref-chip ${isSelected ? "selected" : ""}`}
                    onClick={() => setPace(opt.id)}
                  >
                    <span className="pref-chip-label">{opt.name}</span>
                    <span className="pref-chip-desc">{opt.desc}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SAVE BUTTON */}
          <button className="pref-save-btn" onClick={handleSave} disabled={saving}>
            {saving ? "Saving Preferences..." : "Save Preferences"}
          </button>
        </div>
      </div>
    </div>
  );
}
