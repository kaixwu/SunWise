import { createContext, useContext, useState, useEffect, useRef } from "react";
import axios from "axios";
import { useAuth } from "./AuthContext";
import publicAxios from './publicAxios';

const getLocalDateString = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const DataContext = createContext();
const API_KEY = import.meta.env.VITE_WEATHER_API_KEY;

export const useData = () => useContext(DataContext);

export const DataProvider = ({ children }) => {
  const { token, role } = useAuth();

  const [city, setCity] = useState("");
  const [weather, setWeather] = useState(null);
  const [forecast, setForecast] = useState([]);
  const [fullForecast, setFullForecast] = useState([]);
  const [disasters, setDisasters] = useState([]);
  const [places, setPlaces] = useState([]);
  const [currentCoords, setCurrentCoords] = useState(null);

  const [loading, setLoading] = useState(false);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [locationError, setLocationError] = useState(false);

  // Planner states
  const [todayPlan, setTodayPlan] = useState(null);
  const [allItineraries, setAllItineraries] = useState([]);

  // Filters state
  const [envType, setEnvType] = useState("Any");
  const [prefType, setPrefType] = useState("Any");
  const [radius, setRadius] = useState(10000);

  // User‑overridden city name (from autocomplete / manual search)
  const [userCity, setUserCity] = useState(null);

  const isInitialFetchDone = useRef(false);

  const fetchPlaces = async (lat, lon, wData, searchRadius, category, env) => {
    if (!wData) return;
    setPlacesLoading(true);
    try {
      const weatherData = {
        temp: wData.main.temp,
        rain_prob: wData.rain ? 100 : 0,
        condition: wData.weather[0].description,
        wind_speed: wData.wind.speed * 3.6
      };
      const res = await axios.post(`/api/places`, {
        lat, lon, radius: searchRadius, category, envType: env, weather: weatherData
      });
      setPlaces(res.data.places || []);
    } catch (err) {
      console.error(err);
      setPlaces([]);
    } finally {
      setPlacesLoading(false);
    }
  };

  const fetchItineraries = () => {
    axios.get(`/api/itineraries`)
      .then(res => {
        setAllItineraries(res.data);
        const todayStr = getLocalDateString();

        // Get all today's itineraries and merge their places into one array
        const todayPlans = res.data.filter(it => it.date_str === todayStr);
        const mergedPlaces = todayPlans.flatMap(it => it.places);   // all places from all today plans

        // Build a single "todayPlan" object for the Home card
        if (mergedPlaces.length > 0) {
          setTodayPlan({ date_str: todayStr, places: mergedPlaces });
        } else {
          setTodayPlan(null);
        }
      })
      .catch(err => console.error("Itinerary fetch error:", err));
  };

  const fetcheverything = async (lat, lon, searchRadius = radius) => {
    setLoading(true);
    setLocationError(false);
    try {
      const wRes = await publicAxios.get(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`);
      setWeather(wRes.data);
      setCity(wRes.data.name);

      const fRes = await publicAxios.get(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`);
      const uniqueDays = [];
      const dailyData = [];
      const todayDate = new Date().toISOString().split("T")[0];
      fRes.data.list.forEach(item => {
        const date = item.dt_txt.split(" ")[0];
        if (date !== todayDate && !uniqueDays.includes(date)) {
          uniqueDays.push(date);
          dailyData.push(item);
        }
      });
      setForecast(dailyData.slice(0, 5));
      setFullForecast(fRes.data.list);

      axios.get(`/api/disasters`)
        .then(res => setDisasters(res.data.disasters || []))
        .catch(err => console.error("GDACS error", err));

      setCurrentCoords({ lat, lon });
      isInitialFetchDone.current = true;

      // Async fetch places in background
      fetchPlaces(lat, lon, wRes.data, searchRadius, prefType, envType);

    } catch (err) {
      console.error(err);
      setLocationError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token || role === "admin" || isInitialFetchDone.current) return;

    fetchItineraries();

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        // Clear any manually‑set city name when using automatic location
        setUserCity(null);
        fetcheverything(coords.latitude, coords.longitude, radius);
      },
      () => { setLoading(false); setLocationError(true); },
      { timeout: 10000, maximumAge: 60000, enableHighAccuracy: false }
    );
  }, [token, role]);

  // Re-fetch places if filters change, only if location is already fetched
  useEffect(() => {
    if (isInitialFetchDone.current && currentCoords && weather) {
      const timer = setTimeout(() => {
        fetchPlaces(currentCoords.lat, currentCoords.lon, weather, radius, prefType, envType);
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [radius, prefType, envType]);

  const value = {
    city, weather, forecast, fullForecast, disasters, places, currentCoords,
    loading, placesLoading, locationError, setLocationError, fetcheverything,
    envType, setEnvType, prefType, setPrefType, radius, setRadius,
    todayPlan, setTodayPlan,
    allItineraries,
    refreshItineraries: fetchItineraries,
    userCity, setUserCity,    // ← new
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};