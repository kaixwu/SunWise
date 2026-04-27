import { createContext, useContext, useState, useEffect, useRef } from "react";
import axios from "axios";
import { useAuth } from "./AuthContext";
import publicAxios from './publicAxios';



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

  // Filters state
  const [envType, setEnvType] = useState("Any");
  const [prefType, setPrefType] = useState("Any");
  const [radius, setRadius] = useState(10000);
  const [aqi, setAqi] = useState(null);
const [pollen, setPollen] = useState(null);

  const isInitialFetchDone = useRef(false);

  const fetchEnvironment = async (lat, lon) => {
  try {
    const [aqiRes, pollenRes] = await Promise.all([
      axios.post('/api/air-quality', { lat, lon }),
      axios.post('/api/pollen', { lat, lon })
    ]);
    const aqiData = aqiRes.data;
    const pollenData = pollenRes.data;
    // AQI: get the universal AQI value
    const aqiValue = aqiData?.indexes?.[0]?.aqi;
    // Pollen: get the highest pollen index among grass/tree/weed for today
    let pollenLevel = 0;
    const dailyInfo = pollenData?.dailyInfo?.[0];
    if (dailyInfo?.pollenTypeInfo) {
      pollenLevel = Math.max(...dailyInfo.pollenTypeInfo.map(t => t.indexInfo?.value || 0));
    }
    setAqi(aqiValue);
    setPollen(pollenLevel);
  } catch (err) {
    console.error('Environment fetch error:', err);
  }
};

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
      fetchEnvironment(lat, lon);
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
    
    // Fetch today's plan
    axios.get(`/api/itineraries`)
      .then(res => {
        const todayStr = new Date().toISOString().split("T")[0];
        const todaysItin = res.data.find(it => it.date_str === todayStr);
        setTodayPlan(todaysItin || null);
      }).catch(err => console.error(err));

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => fetcheverything(coords.latitude, coords.longitude, radius),
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
    todayPlan, setTodayPlan, aqi, pollen
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};
