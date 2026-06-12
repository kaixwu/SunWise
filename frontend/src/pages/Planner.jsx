import { useState, useRef } from "react";
import axios from "axios";
import { useAuth } from "../AuthContext";
import { useData } from "../DataContext";
import { CalendarCheck, Zap, Trash2, ListTodo, Sparkles, Send, MapPin, Clock, Car, Download, Star, MessageSquare, CheckCircle, X } from "lucide-react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import FluidGradient from "../components/FluidGradient";
import PlaceModal from "../components/PlaceModal";

const getGroupedPlans = (itineraries) => {
  const groups = {};
  
  itineraries.forEach((it) => {
    const d = it.date_str;
    if (!groups[d]) {
      groups[d] = {
        date_str: d,
        items: []
      };
    }
    
    if (it.schedule) {
      // Itinerary has a schedule
      it.schedule.forEach((schItem) => {
        // Try to find matching full place object
        const fullPlace = it.places?.find(p => p.name === schItem.place) || { name: schItem.place, category: "Destination" };
        groups[d].items.push({
          id: `${it.id}_sch_${schItem.place}`,
          itineraryId: it.id,
          place: fullPlace,
          name: schItem.place,
          time_display: `${schItem.arrival_time} - ${schItem.departure_time}`,
          activity_suggestion: schItem.activity_suggestion,
          isSchedule: true
        });
      });
    } else {
      // Manually added places
      it.places?.forEach((p) => {
        groups[d].items.push({
          id: `${it.id}_place_${p.name}`,
          itineraryId: it.id,
          place: p,
          name: p.name,
          time_display: it.time_str ? `at ${it.time_str}` : "",
          isSchedule: false
        });
      });
    }
  });

  // Sort dates
  const sortedDates = Object.keys(groups).sort();
  return sortedDates.map(d => groups[d]);
};

export default function Planner() {
  const { token } = useAuth();
  const {
    allItineraries, refreshItineraries, weather, currentCoords, places, todayPlan
  } = useData();

  const [activeTab, setActiveTab] = useState("today");
  const [genLoading, setGenLoading] = useState(false);
  const [generatedPlan, setGeneratedPlan] = useState(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [searchLocation, setSearchLocation] = useState("");
  const [aiSuggestionLoading, setAiSuggestionLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const exportRef = useRef(null);

  // Place Detail Modal (same as Destinations page)
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailPlace, setDetailPlace] = useState(null);

  const openDetail = (place) => {
    setDetailPlace(place);
    setDetailOpen(true);
  };
  const closeDetail = () => {
    setDetailOpen(false);
    setDetailPlace(null);
  };

  const handleExportPDF = async () => {
    if (!exportRef.current) return;
    try {
      const canvas = await html2canvas(exportRef.current, { scale: 2, backgroundColor: '#071428' });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`SunWise_Itinerary_${getLocalDateString()}.pdf`);
    } catch (err) {
      console.error(err);
      alert("Failed to export PDF.");
    }
  };

  const deleteItinerary = async (id) => {
    try {
      await axios.delete(`/api/itineraries/${id}`);
      refreshItineraries();
    } catch (err) {
      console.error(err);
      alert("Failed to delete itinerary.");
    }
  };

  const saveSuggestionToToday = async (stops, schedule) => {
    try {
      const todayStr = new Date().toISOString().split("T")[0];
      await axios.post("/api/itineraries", {
        date_str: todayStr,
        time_str: "",
        places: stops,
        schedule: schedule || null,
      });
      refreshItineraries();
      alert("Plan saved for today!");
      setAiSuggestion(null);
      setGeneratedPlan(null);
    } catch (err) {
      console.error(err);
      alert("Failed to save plan.");
    }
  };

  const handleGenerateItinerary = async () => {
    setGenLoading(true);
    try {
      const todayStr = new Date().toISOString().split("T")[0];
      const todaysPlans = allItineraries.filter((it) => it.date_str === todayStr);
      let allPlaces = todaysPlans.flatMap((it) => it.places);

      // Fallback to merged todayPlan from context
      if (allPlaces.length === 0 && todayPlan?.places) {
        allPlaces = todayPlan.places;
      }

      if (allPlaces.length === 0) {
        alert("No places in today's plan. Add some first from Destinations.");
        setGenLoading(false);
        return;
      }

      const weatherData = weather
        ? {
            temp: weather.main.temp,
            rain_prob: weather.rain ? 100 : 0,
            condition: weather.weather[0].description,
            wind_speed: weather.wind.speed * 3.6,
          }
        : { temp: 30, rain_prob: 0, condition: "Clear" };

      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();
      const ampm = hours >= 12 ? "PM" : "AM";
      const displayHours = hours % 12 || 12;
      const startTime = `${displayHours}:${String(minutes).padStart(2, "0")} ${ampm}`;

      const res = await axios.post("/api/generate-itinerary", {
        places: allPlaces,
        weather: weatherData,
        start_time: startTime,
        preferences: { tripType: "Any", vibe: "Any" },
      });

      setGeneratedPlan(res.data);
    } catch (err) {
      console.error(err);
      alert("Failed to generate itinerary.");
    } finally {
      setGenLoading(false);
    }
  };

  const handleTextPrompt = async () => {
    if (!aiPrompt.trim()) return;
    setAiSuggestionLoading(true);
    try {
      const weatherData = weather
        ? {
            temp: weather.main.temp,
            rain_prob: weather.rain ? 100 : 0,
            condition: weather.weather[0].description,
            wind_speed: weather.wind.speed * 3.6,
          }
        : { temp: 30, rain_prob: 0, condition: "Clear" };

      let locationToSend = searchLocation.trim();

      const res = await axios.post("/api/generate-itinerary-text", {
        prompt: aiPrompt,
        lat: currentCoords?.lat,
        lon: currentCoords?.lon,
        search_location: locationToSend,
        weather: weatherData,
      });

      setAiSuggestion(res.data);
    } catch (err) {
      console.error(err);
      alert("AI request failed. Try again later.");
    } finally {
      setAiSuggestionLoading(false);
    }
  };

  const getLocalDateString = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const todayItins = allItineraries.filter((it) => it.date_str === getLocalDateString());
  const upcomingItins = allItineraries.filter((it) => it.date_str > getLocalDateString());
  const groupedToday = getGroupedPlans(todayItins);
  const groupedUpcoming = getGroupedPlans(upcomingItins);

  return (
    <div style={{ maxWidth: "1600px", margin: "0 auto", padding: "88px 24px 40px" }}>
      <div className="fluid-background-container" style={{ position: "fixed" }}>
        <FluidGradient 
          color1="#3b0764" 
          color2="#86198f" 
          color3="#be185d" 
          color4="#c026d3"
          opacity={0.6}
          colorIntensity={0.5}
        />
        <div className="fluid-overlay" style={{ background: "rgba(4, 9, 20, 0.6)" }}></div>
      </div>

      {/* ------ Header ------ */}
      <div style={{ marginBottom: "32px", display: "flex", alignItems: "center", gap: "12px" }}>
        <CalendarCheck size={32} color="var(--accent-blue)" />
        <h1 className="font-heading" style={{ color: "var(--accent-blue)", fontSize: "2rem", margin: 0 }}>
          Your Planner
        </h1>
      </div>

      {/* ------ Segmented Tabs ------ */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "40px" }}>
        <div className="segmented-control glass-card" style={{ width: "100%", maxWidth: "480px", padding: "8px", display: "flex", gap: "8px", border: "1px solid var(--glass-border)" }}>
          <button
            onClick={() => setActiveTab("today")}
            className={`segmented-btn ${activeTab === "today" ? "active" : ""}`}
          >
            Today
            {todayItins.length > 0 && (
              <span style={{ background: activeTab === "today" ? "var(--accent-teal)" : "rgba(255,255,255,0.1)", color: activeTab === "today" ? "#000" : "#fff", padding: "2px 8px", borderRadius: "20px", fontSize: "0.75rem", marginLeft: "6px" }}>
                {todayItins.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("upcoming")}
            className={`segmented-btn ${activeTab === "upcoming" ? "active" : ""}`}
          >
            Upcoming
            {upcomingItins.length > 0 && (
              <span style={{ background: activeTab === "upcoming" ? "var(--accent-teal)" : "rgba(255,255,255,0.1)", color: activeTab === "upcoming" ? "#000" : "#fff", padding: "2px 8px", borderRadius: "20px", fontSize: "0.75rem", marginLeft: "6px" }}>
                {upcomingItins.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ------ Today’s Plan Section ------ */}
      {activeTab === "today" && (
        <div>
          {/* AI Generate Button */}
          {todayItins.length > 0 && (
            <>
              <div style={{ marginBottom: "20px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <button
                  onClick={handleGenerateItinerary}
                  disabled={genLoading}
                  style={{
                    padding: "12px 24px", background: "linear-gradient(135deg, var(--accent-blue), var(--accent-teal))",
                    border: "none", borderRadius: "12px", color: "#fff", fontWeight: "700",
                    fontSize: "1rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px",
                  }}
                >
                  <Sparkles size={20} /> {genLoading ? "Generating..." : "Generate Smart Itinerary"}
                </button>

                <button
                  onClick={handleExportPDF}
                  style={{
                    padding: "12px 24px", background: "rgba(56,189,248,0.1)", border: "1px solid var(--accent-blue)",
                    borderRadius: "12px", color: "var(--accent-blue)", fontWeight: "700",
                    fontSize: "1rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px",
                  }}
                >
                  <Download size={20} /> Export to PDF
                </button>
              </div>

              {genLoading && <div className="skeleton" style={{ height: "80px", marginTop: "24px" }} />}

              {generatedPlan && (
                <div className="glass-card" style={{ marginTop: "24px", padding: "28px" }}>
                  <h4 style={{ margin: "0 0 16px", color: "var(--accent-teal)" }}>✨ AI‑optimized Route</h4>
                  <p style={{ color: "#e2e8f0", fontSize: "0.9rem", marginBottom: "12px" }}>
                    {generatedPlan.explanation}
                    {generatedPlan.best_start_time && <> Suggested start: <strong>{generatedPlan.best_start_time}</strong></>}
                  </p>

                  {/* Schedule display */}
                  {generatedPlan.schedule && generatedPlan.schedule.length > 0 ? (
                    <div className="timeline-container" style={{ marginBottom: "16px" }}>
                      {generatedPlan.schedule.map((item, idx) => (
                        <div key={idx} className="timeline-item">
                          <div className="timeline-dot" />
                          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                            <div style={{ fontWeight: "700", width: "100px", flexShrink: 0, color: "var(--accent-teal)" }}>
                              {item.arrival_time}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: "700", fontSize: "1.05rem" }}>{item.place}</div>
                              {item.activity_suggestion && <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "4px" }}>{item.activity_suggestion}</div>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="timeline-container" style={{ marginBottom: "16px" }}>
                      {generatedPlan.stops?.map((stop, idx) => (
                        <div key={idx} className="timeline-item">
                          <div className="timeline-dot" />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: "700", fontSize: "1.05rem" }}>{stop.name}</div>
                            <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "4px" }}>{stop.category} · {stop.distance} km · {stop.travelMins} min</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {generatedPlan.total_travel_mins && (
                    <div style={{ marginTop: "12px", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                      Total travel time ~{generatedPlan.total_travel_mins} min
                    </div>
                  )}
                  <div style={{ marginTop: "16px", display: "flex", gap: "12px" }}>
                    <button
                      onClick={() => saveSuggestionToToday(generatedPlan.stops, generatedPlan.schedule)}
                      style={{ flex: 1, padding: "10px", background: "var(--accent-blue)", border: "none", borderRadius: "8px", color: "#fff", fontWeight: "600", cursor: "pointer" }}
                    >
                      Save to Today
                    </button>
                    <button
                      onClick={() => setGeneratedPlan(null)}
                      style={{ flex: 1, padding: "10px", background: "transparent", border: "1px solid var(--glass-border)", color: "#fff", borderRadius: "8px", cursor: "pointer" }}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {todayItins.length === 0 && !generatedPlan ? (
            <div className="glass-card" style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
              No plan scheduled for today. Use Destinations or ask AI below!
            </div>
          ) : (
            <div ref={exportRef} className="glass-card" style={{ display: "flex", flexDirection: "column", gap: "24px", padding: "32px", marginTop: "32px" }}>
              <h2 style={{ color: "var(--accent-blue)", margin: "0 0 8px", fontFamily: "var(--font-heading)" }}>
                SunWise Itinerary - {getLocalDateString()}
              </h2>
              {groupedToday.length === 0 ? (
                <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "20px" }}>
                  No plans saved for today yet.
                </div>
              ) : (
                groupedToday.map((group) => (
                  <div key={group.date_str} style={{ width: "100%" }}>
                    <div className="timeline-container">
                      {group.items.map((item) => {
                        const p = item.place;
                        const photoUrl = p.photoUrl || p.photoUrlSecondary || (p.photoUrls && p.photoUrls[0]) || "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=500&auto=format&fit=crop&q=60";
                        return (
                          <div 
                            key={item.id} 
                            className="timeline-item"
                            style={{ 
                              display: "flex", 
                              alignItems: "center", 
                              justifyContent: "space-between", 
                              gap: "16px",
                              cursor: "pointer",
                              padding: "12px 16px",
                              background: "rgba(255,255,255,0.03)",
                              border: "1px solid rgba(255,255,255,0.06)",
                              borderRadius: "14px",
                              transition: "all 0.3s ease"
                            }}
                            onClick={() => openDetail(p)}
                          >
                            <div className="timeline-dot" style={{ top: "50%", transform: "translateY(-50%)" }} />
                            
                            <div style={{ display: "flex", alignItems: "center", gap: "16px", flex: 1 }}>
                              <img 
                                src={photoUrl} 
                                alt={item.name} 
                                style={{ 
                                  width: "110px", 
                                  height: "75px", 
                                  borderRadius: "10px", 
                                  objectFit: "cover",
                                  border: "1px solid rgba(255,255,255,0.1)"
                                }} 
                                onError={(e) => { e.target.src = "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=500&auto=format&fit=crop&q=60"; }}
                              />
                              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                <div style={{ fontWeight: "700", fontSize: "1.05rem", color: "#f8fafc" }}>
                                  {item.name}
                                </div>
                                <div style={{ fontSize: "0.82rem", color: "var(--accent-teal)", fontWeight: "600" }}>
                                  {p.category} {item.time_display && `· ${item.time_display}`}
                                </div>
                                {item.activity_suggestion && (
                                  <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "2px", fontStyle: "italic" }}>
                                    {item.activity_suggestion}
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteItinerary(item.itineraryId);
                              }}
                              style={{
                                background: "rgba(239, 68, 68, 0.1)",
                                border: "1px solid rgba(239, 68, 68, 0.2)",
                                color: "var(--danger)",
                                borderRadius: "50%",
                                width: "36px",
                                height: "36px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "pointer",
                                transition: "all 0.2s ease"
                              }}
                              title="Remove from Planner"
                              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(239, 68, 68, 0.25)"}
                              onMouseLeave={(e) => e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)"}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Static AI Input removed in favor of global Chatbot */}
        </div>
      )}

      {/* ── Place Detail Modal (same as Destinations page) ─────────────── */}
      {detailOpen && detailPlace && (
        <PlaceModal
          place={detailPlace}
          onClose={closeDetail}
        />
      )}

      {/* Upcoming Tab */}
      {activeTab === "upcoming" && (
        <div>
          {upcomingItins.length === 0 ? (
            <div className="glass-card" style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>No upcoming plans yet.</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "24px", alignItems: "flex-start" }}>
              {groupedUpcoming.map((group) => (
                <div key={group.date_str} className="glass-card" style={{ flex: "1 1 350px", padding: "24px", minWidth: "300px" }}>
                  <div style={{ fontWeight: "700", fontSize: "1.2rem", marginBottom: "20px", color: "var(--accent-blue)" }}>
                    {group.date_str}
                  </div>
                  <div className="timeline-container">
                    {group.items.map((item) => {
                      const p = item.place;
                      const photoUrl = p.photoUrl || p.photoUrlSecondary || (p.photoUrls && p.photoUrls[0]) || "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=500&auto=format&fit=crop&q=60";
                      return (
                        <div 
                          key={item.id} 
                          className="timeline-item"
                          style={{ 
                            display: "flex", 
                            alignItems: "center", 
                            justifyContent: "space-between", 
                            gap: "16px",
                            cursor: "pointer",
                            padding: "12px 16px",
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.06)",
                            borderRadius: "14px",
                            transition: "all 0.3s ease"
                          }}
                          onClick={() => openDetail(p)}
                        >
                          <div className="timeline-dot" style={{ top: "50%", transform: "translateY(-50%)" }} />
                          
                          <div style={{ display: "flex", alignItems: "center", gap: "16px", flex: 1 }}>
                            <img 
                              src={photoUrl} 
                              alt={item.name} 
                              style={{ 
                                width: "110px", 
                                height: "75px", 
                                borderRadius: "10px", 
                                objectFit: "cover",
                                border: "1px solid rgba(255,255,255,0.1)"
                              }} 
                              onError={(e) => { e.target.src = "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=500&auto=format&fit=crop&q=60"; }}
                            />
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                              <div style={{ fontWeight: "700", fontSize: "1.05rem", color: "#f8fafc" }}>
                                {item.name}
                              </div>
                              <div style={{ fontSize: "0.82rem", color: "var(--accent-teal)", fontWeight: "600" }}>
                                {p.category} {item.time_display && `· ${item.time_display}`}
                              </div>
                              {item.activity_suggestion && (
                                <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "2px", fontStyle: "italic" }}>
                                  {item.activity_suggestion}
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteItinerary(item.itineraryId);
                            }}
                            style={{
                              background: "rgba(239, 68, 68, 0.1)",
                              border: "1px solid rgba(239, 68, 68, 0.2)",
                              color: "var(--danger)",
                              borderRadius: "50%",
                              width: "36px",
                              height: "36px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                              transition: "all 0.2s ease"
                            }}
                            title="Remove from Planner"
                            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(239, 68, 68, 0.25)"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)"}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}