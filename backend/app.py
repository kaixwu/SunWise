from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_jwt_extended import (
    JWTManager, create_access_token,
    jwt_required, get_jwt_identity,
    set_access_cookies, unset_jwt_cookies
)
from flask_sqlalchemy import SQLAlchemy
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import bcrypt
import os
import math
import requests
import re
import json
import hashlib
import time
from datetime import datetime
from dotenv import load_dotenv
from google import genai as google_genai
from functools import wraps

load_dotenv(override=True)
print(f"Loaded Gemini Key: {os.getenv('GEMINI_API_KEY', '')[:5]}...")
print(f"Loaded Google Places Key: {os.getenv('GOOGLE_PLACES_API_KEY', '')[:8]}...")

app = Flask(__name__)
frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
CORS(app, supports_credentials=True, origins=[
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    frontend_url
])

app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "fallback-secret")
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = 86400
app.config["JWT_TOKEN_LOCATION"] = ["cookies"]
is_production = os.getenv("FLASK_ENV") == "production"
app.config["JWT_COOKIE_SECURE"] = is_production
app.config["JWT_COOKIE_SAMESITE"] = "None" if is_production else "Lax"
app.config["JWT_COOKIE_CSRF_PROTECT"] = True

db_url = os.getenv("DATABASE_URL")
if db_url and db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)
if not db_url:
    db_url = "sqlite:///sunwise.db"

import sqlalchemy

app.config["SQLALCHEMY_DATABASE_URI"] = db_url
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
    "poolclass": sqlalchemy.pool.NullPool
}

db = SQLAlchemy(app)
jwt = JWTManager(app)

limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["500 per day", "100 per hour"],
    storage_uri="memory://"
)

gemini_client = google_genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
google_places_key = os.getenv("GOOGLE_PLACES_API_KEY")

# ── MODELS (unchanged) ──────────────────────────────────────────────────────
class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), default='user')
    is_banned = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, server_default=db.func.now())

class Preference(db.Model):
    __tablename__ = 'preferences'
    user_id = db.Column(db.Integer, primary_key=True)
    trip_type = db.Column(db.String(50), default='any')
    max_distance = db.Column(db.Integer, default=10)

class SecurityLog(db.Model):
    __tablename__ = 'security_logs'
    id = db.Column(db.Integer, primary_key=True)
    ip_address = db.Column(db.String(50), nullable=False)
    email_attempted = db.Column(db.String(120), nullable=False)
    status = db.Column(db.String(50), nullable=False)
    timestamp = db.Column(db.DateTime, server_default=db.func.now())

class SavedPlace(db.Model):
    __tablename__ = 'saved_places'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=False)
    name = db.Column(db.String(200), nullable=False)
    address = db.Column(db.String(300))
    lat = db.Column(db.Float)
    lon = db.Column(db.Float)
    category = db.Column(db.String(50))
    image_url = db.Column(db.String(500))
    rating = db.Column(db.Float)
    saved_at = db.Column(db.DateTime, server_default=db.func.now())

class Itinerary(db.Model):
    __tablename__ = 'itineraries'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=False)
    date_str = db.Column(db.String(50), nullable=False)
    time_str = db.Column(db.String(50))
    places_json = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, server_default=db.func.now())

with app.app_context():
    try:
        db.create_all()
        if not User.query.filter_by(role='admin').first():
            hashed = bcrypt.hashpw("Admin@123".encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
            admin = User(username='Admin', email='admin@sunwise.com', password=hashed, role='admin')
            db.session.add(admin)
            db.session.commit()
            print("Admin user created (admin@sunwise.com / Admin@123)")
    except Exception as e:
        print(f"Failed to initialize database: {e}")

# ── HELPERS ──────────────────────────────────────────────────────────────────
def is_valid_email(email): return bool(re.match(r"^[\w\.-]+@[\w\.-]+\.\w{2,}$", email))
def is_strong_password(password):
    if len(password) < 8 or len(password) > 32: return False
    if not re.search(r"[A-Z]", password): return False
    if not re.search(r"[0-9]", password): return False
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password): return False
    return True
def admin_required(fn):
    @wraps(fn)
    @jwt_required()
    def wrapper(*args, **kwargs):
        user_id = get_jwt_identity()
        user = db.session.get(User, user_id)
        if not user or user.role != 'admin': return jsonify({"error": "Admin access required."}), 403
        return fn(*args, **kwargs)
    return wrapper
def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.asin(math.sqrt(a))
def log_security_event(ip, email, status):
    log = SecurityLog(ip_address=ip, email_attempted=email, status=status)
    db.session.add(log)
    db.session.commit()

# ── AUTH ROUTES (unchanged) ─────────────────────────────────────────────────
# (All auth routes remain identical – register, login, me, check-auth, logout, admin)

@app.route("/register", methods=["POST"])
@limiter.limit("5 per minute")
def register():
    data = request.get_json()
    username = (data.get("username") or "").strip()
    email    = (data.get("email") or "").strip().lower()
    password = (data.get("password") or "").strip()
    if not username or not email or not password: return jsonify({"error": "All fields are required."}), 400
    if not is_valid_email(email): return jsonify({"error": "Invalid email format."}), 400
    if not is_strong_password(password): return jsonify({"error": "Password must be 8-32 chars, with upper, number, and special char."}), 400
    if User.query.filter_by(email=email).first(): return jsonify({"error": "Email is already registered."}), 409
    hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    new_user = User(username=username, email=email, password=hashed)
    db.session.add(new_user)
    db.session.commit()
    pref = Preference(user_id=new_user.id)
    db.session.add(pref)
    db.session.commit()
    log_security_event(request.remote_addr, email, "REGISTERED")
    return jsonify({"message": "Registration successful."}), 201

@app.route("/login", methods=["POST"])
@limiter.limit("10 per minute")
def login():
    data = request.get_json()
    email    = (data.get("email") or "").strip().lower()
    password = (data.get("password") or "").strip()
    if not email or not password: return jsonify({"error": "All fields are required."}), 400
    user = User.query.filter_by(email=email).first()
    if not user or not bcrypt.checkpw(password.encode("utf-8"), user.password.encode("utf-8")):
        log_security_event(request.remote_addr, email, "FAILED_LOGIN")
        return jsonify({"error": "Invalid email or password."}), 401
    if user.is_banned:
        log_security_event(request.remote_addr, email, "BANNED_LOGIN_ATTEMPT")
        return jsonify({"error": "This account has been banned."}), 403
    log_security_event(request.remote_addr, email, "SUCCESS_LOGIN")
    token = create_access_token(identity=str(user.id))
    resp = jsonify({"user_id": user.id, "username": user.username, "role": user.role})
    set_access_cookies(resp, token)
    return resp, 200

@app.route("/me", methods=["GET"])
@jwt_required()
def me():
    user = db.session.get(User, get_jwt_identity())
    if not user: return jsonify({"error": "User not found."}), 404
    return jsonify({"id": user.id, "username": user.username, "email": user.email, "role": user.role}), 200

@app.route("/api/check-auth", methods=["GET"])
@jwt_required()
def check_auth():
    user = db.session.get(User, get_jwt_identity())
    if not user: return jsonify({"error": "User not found."}), 404
    return jsonify({"user_id": user.id, "username": user.username, "role": user.role}), 200

@app.route("/logout", methods=["POST"])
def logout():
    resp = jsonify({"message": "Successfully logged out."})
    unset_jwt_cookies(resp)
    return resp, 200

@app.route("/admin/users", methods=["GET"])
@admin_required
def get_users():
    users = User.query.all()
    return jsonify([{"id": u.id, "username": u.username, "email": u.email, "role": u.role, "is_banned": u.is_banned} for u in users]), 200

@app.route("/admin/users/<int:user_id>/ban", methods=["POST"])
@admin_required
def toggle_ban(user_id):
    user = db.session.get(User, user_id)
    if not user: return jsonify({"error": "User not found"}), 404
    if user.role == 'admin': return jsonify({"error": "Cannot ban admin"}), 400
    user.is_banned = not user.is_banned
    db.session.commit()
    return jsonify({"message": f"User {'banned' if user.is_banned else 'unbanned'}"}), 200

@app.route("/admin/logs", methods=["GET"])
@admin_required
def get_logs():
    logs = SecurityLog.query.order_by(SecurityLog.timestamp.desc()).limit(100).all()
    return jsonify([{"id": l.id, "ip": l.ip_address, "email": l.email_attempted, "status": l.status, "time": str(l.timestamp)} for l in logs]), 200

# ── CORE FEATURES ────────────────────────────────────────────────────────────
import xml.etree.ElementTree as ET

@app.route("/api/disasters", methods=["GET"])
@jwt_required()
def get_disasters():
    try:
        r = requests.get("https://www.gdacs.org/xml/rss.xml", timeout=10)
        r.raise_for_status()
        root = ET.fromstring(r.content)
        disasters = []
        for item in root.findall(".//item"):
            title = item.findtext("title", "")
            desc = item.findtext("description", "")
            if "Philippines" in title or "Philippines" in desc:
                disasters.append({"title": title, "description": desc})
        return jsonify({"disasters": disasters}), 200
    except Exception as e:
        print(f"Error fetching GDACS: {e}")
        return jsonify({"disasters": []}), 200

@app.route('/api/autocomplete', methods=['GET'])
def autocomplete():
    text = request.args.get('text', '')
    lat = request.args.get('lat', type=float)
    lon = request.args.get('lon', type=float)
    if len(text) < 3:
        return jsonify({"suggestions": []}), 200
    if not google_places_key:
        return jsonify({"suggestions": []}), 200
    url = "https://places.googleapis.com/v1/places:autocomplete"
    headers = {"Content-Type": "application/json", "X-Goog-Api-Key": google_places_key}
    body = {"input": text, "includedRegionCodes": ["PH"]}
    if lat and lon:
        body["locationBias"] = {"circle": {"center": {"latitude": lat, "longitude": lon}, "radius": 50000.0}}
    try:
        resp = requests.post(url, headers=headers, json=body, timeout=5)
        if resp.status_code != 200:
            return jsonify({"suggestions": []}), 200
        data = resp.json()
        suggestions = []
        for s in data.get("suggestions", []):
            pred = s.get("placePrediction", {})
            text_formatted = pred.get("text", {}).get("text", "")
            if text_formatted:
                suggestions.append({"formatted": text_formatted, "place_id": pred.get("placeId")})
        return jsonify({"suggestions": suggestions}), 200
    except Exception as e:
        print(f"[Autocomplete] Error: {e}")
        return jsonify({"suggestions": []}), 200

# ── GOOGLE PLACES FETCH (with ratings, popularity, and editorial summary) ───
def fetch_google_places(lat, lon, radius, category="Any"):
    if not google_places_key:
        return []
    type_mapping = {
        "Cafe": ["cafe"],
        "Restaurant": ["restaurant"],
        "Museum": ["museum"],
        "Park": ["park"],
        "Shopping": ["shopping_mall"],
        "Nature": ["park", "tourist_attraction"],
        "Entertainment": ["movie_theater", "tourist_attraction"],
        "Heritage": ["tourist_attraction", "museum"],
        "Any": ["tourist_attraction", "shopping_mall", "museum", "park", "restaurant", "cafe"]
    }
    place_types = type_mapping.get(category, type_mapping["Any"])
    url = "https://places.googleapis.com/v1/places:searchNearby"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": google_places_key,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location,places.primaryType,places.types,places.regularOpeningHours,places.currentOpeningHours,places.rating,places.userRatingCount,places.photos,places.reviews"
    }
    all_places = []
    for ptype in place_types:
        body = {
            "includedTypes": [ptype],
            "maxResultCount": 20,
            "locationRestriction": {
                "circle": {"center": {"latitude": lat, "longitude": lon}, "radius": float(radius)}
            }
        }
        try:
            resp = requests.post(url, headers=headers, json=body, timeout=10)
            if resp.status_code != 200:
                continue
            data = resp.json()
            for place in data.get("places", []):
                name = place.get("displayName", {}).get("text", "")
                if not name: continue
                loc = place.get("location", {})
                d_lat = loc.get("latitude")
                d_lon = loc.get("longitude")
                if not d_lat or not d_lon: continue
                dist = round(haversine(lat, lon, d_lat, d_lon), 1)
                if dist > radius / 1000: continue
                primary_type = place.get("primaryType", "")
                category_mapped = "Attraction"
                dest_type = "Outdoor"
                if "restaurant" in primary_type or "cafe" in primary_type:
                    category_mapped = "Cafe" if "cafe" in primary_type else "Restaurant"
                    dest_type = "Indoor"
                elif "museum" in primary_type:
                    category_mapped = "Museum"; dest_type = "Indoor"
                elif "shopping_mall" in primary_type:
                    category_mapped = "Shopping"; dest_type = "Indoor"
                elif "park" in primary_type:
                    category_mapped = "Park"; dest_type = "Outdoor"
                hours = place.get("currentOpeningHours") or place.get("regularOpeningHours", {})
                is_open = hours.get("openNow", None)
                hours_display = "; ".join(hours.get("weekdayDescriptions", [])[:3])
                rating = place.get("rating")
                user_rating_count = place.get("userRatingCount", 0)
                
                photos = place.get("photos", [])
                photo_url = f"https://places.googleapis.com/v1/{photos[0]['name']}/media?maxHeightPx=400&maxWidthPx=400&key={google_places_key}" if photos else None
                
                reviews = []
                for r in place.get("reviews", [])[:5]:
                    text = r.get("text", {}).get("text", "")
                    author = r.get("authorAttribution", {}).get("displayName", "Anonymous")
                    relative_time = r.get("relativePublishTimeDescription", "")
                    if text: reviews.append({"text": text, "author": author, "time": relative_time})

                all_places.append({
                    "name": name,
                    "lat": d_lat,
                    "lon": d_lon,
                    "type": dest_type,
                    "category": category_mapped,
                    "distance": dist,
                    "isOpen": is_open,
                    "hoursDisplay": hours_display,
                    "address": place.get("formattedAddress", ""),
                    "rating": rating,
                    "userRatingCount": user_rating_count,
                    "photoUrl": photo_url,
                    "reviews": reviews,
                    "google_place_id": place.get("id")
                })
        except Exception as e:
            print(f"[Google] Error: {e}")
    # Deduplicate
    seen = {}
    unique = []
    for p in all_places:
        key = p["name"].lower()
        if key in seen:
            prev_lat, prev_lon = seen[key]
            if haversine(p["lat"], p["lon"], prev_lat, prev_lon) < 0.3:
                continue
        seen[key] = (p["lat"], p["lon"])
        unique.append(p)
    return unique

# ── GOOGLE ROUTES API ───────────────────────────────────────────────────────────
def get_google_travel_times(origin_lat, origin_lon, destinations):
    if not google_places_key or not destinations:
        return

    url = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": google_places_key,
        "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,status"
    }

    body = {
        "origins": [{"waypoint": {"location": {"latLng": {"latitude": origin_lat, "longitude": origin_lon}}}}],
        "destinations": [{"waypoint": {"location": {"latLng": {"latitude": d["lat"], "longitude": d["lon"]}}}} for d in destinations],
        "travelMode": "DRIVE",
        "routingPreference": "TRAFFIC_AWARE"
    }

    try:
        resp = requests.post(url, headers=headers, json=body, timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            for d in destinations:
                d["travelMins"] = round(d["distance"] * 4)  # default
            for entry in data:
                i = entry.get("destinationIndex")
                if i is not None and i < len(destinations):
                    duration_str = entry.get("duration")
                    if duration_str:
                        destinations[i]["travelMins"] = round(int(duration_str.strip("s")) / 60)
        else:
            for d in destinations:
                d["travelMins"] = round(d["distance"] * 4)
    except Exception as e:
        print(f"[Google Routes] Matrix error: {e}")
        for d in destinations:
            d["travelMins"] = round(d["distance"] * 4)

# ── ENVIRONMENTAL DATA HELPERS ───────────────────────────────────────────────
def fetch_aqi(lat, lon):
    try:
        url = "https://airquality.googleapis.com/v1/currentConditions:lookup"
        headers = {"Content-Type": "application/json"}
        body = {"location": {"latitude": lat, "longitude": lon}}
        resp = requests.post(url, headers=headers, json=body, params={"key": google_places_key}, timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            return data.get("indexes", [{}])[0].get("aqi", None)
    except Exception as e:
        print(f"AQI fetch error: {e}")
    return None

def fetch_pollen_level(lat, lon):
    try:
        url = "https://pollen.googleapis.com/v1/forecast:lookup"
        params = {
            "location.latitude": lat,
            "location.longitude": lon,
            "days": 1,
            "plants": ["GRASS", "TREE", "WEED"],
            "key": google_places_key
        }
        resp = requests.get(url, params=params, timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            daily_info = data.get("dailyInfo", [{}])
            if daily_info:
                types = daily_info[0].get("pollenTypeInfo", [])
                if types:
                    return max(t.get("indexInfo", {}).get("value", 0) for t in types)
    except Exception as e:
        print(f"Pollen fetch error: {e}")
    return None

# ── LOCAL SCORING ALGORITHM ─────────────────────────────────────────────────
def calculate_local_scores(places, weather, preferred_category, env_type, aqi=None, pollen_level=None):
    if not places:
        return []
    max_dist = max(p["distance"] for p in places)
    max_travel = max(p.get("travelMins", 30) for p in places)
    max_rating_count = max((p.get("userRatingCount") or 1) for p in places)

    for p in places:
        # Distance score (15%)
        dist_score = 1 - (p["distance"] / max_dist) if max_dist > 0 else 1
        # Travel time score (15%)
        travel = p.get("travelMins", 30)
        travel_score = 1 - (travel / max_travel) if max_travel > 0 else 1
        # Rating score (20%)
        rating = p.get("rating")
        rating_score = (rating / 5.0) if rating else 0.6
        # Popularity score (20%)
        count = p.get("userRatingCount") or 1
        pop_score = math.log(count + 1) / math.log(max_rating_count + 1) if max_rating_count > 0 else 0.5

        # Environmental / Health score (15% total, incorporating weather + AQI + pollen)
        temp = weather.get("temp", 30)
        rain = weather.get("rain_prob", 0)
        health_score = 0.7  # base

        # Weather fit
        if p["type"] == "Outdoor":
            if rain > 50 or temp > 33:
                weather_fit = 0.2
            elif rain > 20:
                weather_fit = 0.5
            else:
                weather_fit = 0.8
        else:
            weather_fit = 0.9 if (rain > 50 or temp > 33) else 0.7

        # Air quality penalty
        if aqi is not None:
            if aqi > 200:    # very unhealthy
                health_score -= 0.3
            elif aqi > 150:  # unhealthy
                health_score -= 0.2
            elif aqi > 100:  # moderate
                health_score -= 0.1

        # Pollen penalty (if pollen_level > 3 for grass/tree/weed)
        if pollen_level is not None and pollen_level > 3:
            health_score -= 0.2

        health_score = max(0.1, health_score)

        # Combine weather fit and health score (weighted)
        environment_score = 0.5 * weather_fit + 0.5 * health_score

        # Category match (10%)
        cat_score = 1.0 if (p["category"] == preferred_category or preferred_category == "Any") else 0.5

        # Environment filter (hard filter)
        if env_type != "Any" and p["type"] != env_type:
            p["score"] = 0
            continue

        # Open status (10%)
        reasons = []
        if p.get("isOpen") is True:
            open_score = 1.0
            reasons.append("Currently Open")
        elif p.get("isOpen") is False:
            open_score = 0.0
            reasons.append("Currently Closed")
        else:
            open_score = 0.6

        # Combine all (weights sum to 1.0)
        total = (dist_score * 0.15 + travel_score * 0.15 +
                 rating_score * 0.20 + pop_score * 0.20 +
                 environment_score * 0.15 + cat_score * 0.10 +
                 open_score * 0.05) * 100

        # Build reasons
        if dist_score > 0.7: reasons.append("Nearby Location")
        if travel_score > 0.7: reasons.append("Short Travel Time")
        if rating_score >= 0.8: reasons.append("Highly Rated")
        if weather_fit >= 0.8: reasons.append("Ideal for Current Weather")
        if cat_score == 1.0 and preferred_category != "Any": reasons.append("Matches Category Preference")
        if aqi is not None and aqi <= 50: reasons.append("Excellent Air Quality")
        if pollen_level is not None and pollen_level <= 1: reasons.append("Low Pollen Levels")

        p["score"] = round(total)
        p["matchReasons"] = reasons
    return places

# ── PLACES ENDPOINT (now with environmental data) ─────────────────────────────
@app.route("/api/places", methods=["POST"])
@jwt_required()
def get_places():
    data = request.get_json()
    lat = data.get("lat")
    lon = data.get("lon")
    radius = data.get("radius", 10000)
    category = data.get("category", "Any")
    env_type = data.get("envType", "Any")
    weather = data.get("weather", {})
    if not lat or not lon:
        return jsonify({"error": "Location required"}), 400
    places = fetch_google_places(lat, lon, radius, category)
    if not places:
        return jsonify({"places": []}), 200
    get_google_travel_times(lat, lon, places)

    # Fetch environmental data
    aqi = fetch_aqi(lat, lon)
    pollen = fetch_pollen_level(lat, lon)

    scored = calculate_local_scores(places, weather, category, env_type, aqi=aqi, pollen_level=pollen)
    scored = [p for p in scored if p.get("score", 0) > 0]
    scored.sort(key=lambda x: x["score"], reverse=True)
    return jsonify({"places": scored[:20]}), 200

# ── GEMINI ITINERARY GENERATOR (for future use) ─────────────────────────────
@app.route("/api/generate-itinerary", methods=["POST"])
@jwt_required()
def generate_itinerary():
    data = request.get_json()
    places = data.get("places", [])
    weather = data.get("weather", {})
    preferences = data.get("preferences", {})
    if not places:
        return jsonify({"error": "No places provided"}), 400
    try:
        place_names = [p["name"] for p in places[:10]]
        prompt = f"""
Create a short 2-3 stop itinerary from these places: {', '.join(place_names)}.
Weather: {weather.get('temp')}°C, rain {weather.get('rain_prob')}%.
Return JSON: {{"stops": ["Place A", "Place B"], "explanation": "..."}}
"""
        resp = gemini_client.models.generate_content(model="gemini-2.5-flash-lite", contents=prompt)
        text = resp.text.strip()
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0]
        elif "```" in text:
            text = text.split("```")[1].split("```")[0]
        result = json.loads(text)
        return jsonify(result), 200
    except Exception as e:
        return jsonify({"stops": place_names[:2], "explanation": "Top two picks based on your preferences."}), 200

# ── SAVED PLACES & AI SUMMARY (unchanged) ────────────────────────────────────
@app.route("/api/saved-places", methods=["GET", "POST"])
@jwt_required()
def handle_saved_places():
    user_id = get_jwt_identity()
    if request.method == "POST":
        data = request.get_json()
        existing = SavedPlace.query.filter_by(user_id=user_id, name=data.get("name")).first()
        if existing:
            return jsonify({"message": "Already saved", "id": existing.id}), 200
        new_place = SavedPlace(
            user_id=user_id,
            name=data.get("name"),
            address=data.get("address"),
            lat=data.get("lat"),
            lon=data.get("lon"),
            category=data.get("category"),
            image_url=data.get("photoUrl"),
            rating=data.get("rating")
        )
        db.session.add(new_place)
        db.session.commit()
        return jsonify({"message": "Place saved successfully", "id": new_place.id}), 201
    else:
        places = SavedPlace.query.filter_by(user_id=user_id).order_by(SavedPlace.saved_at.desc()).all()
        return jsonify([{
            "id": p.id, "name": p.name, "address": p.address,
            "lat": p.lat, "lon": p.lon, "category": p.category,
            "photoUrl": p.image_url, "rating": p.rating, "saved_at": p.saved_at
        } for p in places]), 200

@app.route("/api/saved-places/<int:place_id>", methods=["DELETE"])
@jwt_required()
def delete_saved_place(place_id):
    user_id = get_jwt_identity()
    place = SavedPlace.query.filter_by(id=place_id, user_id=user_id).first()
    if not place:
        return jsonify({"error": "Place not found"}), 404
    db.session.delete(place)
    db.session.commit()
    return jsonify({"message": "Place deleted"}), 200

@app.route("/api/place-summary", methods=["POST"])
@jwt_required()
def place_summary():
    data = request.get_json()
    place_name = data.get("name", "this place")
    reviews = data.get("reviews", [])
    if not reviews:
        return jsonify({"summary": "Not enough reviews available to generate a summary."}), 200
    prompt = f"Summarize the following user reviews for {place_name} into 2 to 3 short sentences. Highlight the best things people love and one thing to watch out for if mentioned. Make it sound helpful and friendly.\n\nReviews:\n"
    for idx, r in enumerate(reviews):
        prompt += f"- {r}\n"
    try:
        resp = gemini_client.models.generate_content(model="gemini-2.5-flash-lite", contents=prompt)
        text = resp.text.strip()
        return jsonify({"summary": text}), 200
    except Exception as e:
        print(f"Gemini Summary Error: {e}")
        return jsonify({"summary": "Could not generate AI summary at this time."}), 200

# ── ADDITIONAL ENDPOINTS (directory, route, itineraries, environmental) ──────
@app.route("/api/directory", methods=["POST"])
@jwt_required()
def get_directory():
    data = request.get_json()
    lat = data.get("lat")
    lon = data.get("lon")
    if not lat or not lon or not google_places_key:
        return jsonify({"stores": []}), 200
    url = "https://places.googleapis.com/v1/places:searchNearby"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": google_places_key,
        "X-Goog-FieldMask": "places.displayName,places.primaryType"
    }
    body = {
        "includedTypes": ["store", "restaurant", "cafe", "clothing_store", "shoe_store", "electronics_store"],
        "maxResultCount": 20,
        "locationRestriction": {
            "circle": {"center": {"latitude": lat, "longitude": lon}, "radius": 200.0}
        }
    }
    try:
        resp = requests.post(url, headers=headers, json=body, timeout=10)
        if resp.status_code == 200:
            stores = []
            for p in resp.json().get("places", []):
                name = p.get("displayName", {}).get("text", "")
                ptype = p.get("primaryType", "Store").replace("_", " ").title()
                if name: stores.append({"name": name, "type": ptype})
            return jsonify({"stores": stores}), 200
    except Exception as e:
        print(f"[Directory] Error: {e}")
    return jsonify({"stores": []}), 200

@app.route("/api/route", methods=["POST"])
@jwt_required()
def get_route():
    data = request.get_json()
    start = data.get("start")
    end = data.get("end")
    if not google_places_key or not start or not end:
        return jsonify({"error": "Missing parameters"}), 400

    url = "https://routes.googleapis.com/directions/v2:computeRoutes"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": google_places_key,
        # Request only the fields we actually need
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline"
    }

    body = {
        "origin": {"location": {"latLng": {"latitude": start["lat"], "longitude": start["lon"]}}},
        "destination": {"location": {"latLng": {"latitude": end["lat"], "longitude": end["lon"]}}},
        "travelMode": "DRIVE",
        "routingPreference": "TRAFFIC_AWARE",
        "polylineQuality": "HIGH_QUALITY"
    }

    try:
        resp = requests.post(url, headers=headers, json=body, timeout=15)
        if resp.status_code == 200:
            google_data = resp.json()
            route = google_data.get("routes", [{}])[0]
            encoded_polyline = route.get("polyline", {}).get("encodedPolyline", "")

            # Convert encoded polyline to list of {lat, lng} points
            points = []
            if encoded_polyline:
                # Use Google's own polyline decoder (we can use a simple library or built-in)
                try:
                    from polyline import decode      # use pip install polyline
                    decoded = decode(encoded_polyline)
                    # polyline library returns list of (lat, lng) tuples
                    points = [{"latitude": coord[0], "longitude": coord[1]} for coord in decoded]
                except ImportError:
                    # fallback if polyline library not installed: return a straight line
                    points = [
                        {"latitude": start["lat"], "longitude": start["lon"]},
                        {"latitude": end["lat"], "longitude": end["lon"]}
                    ]

            # Build a response that matches the TomTom format your frontend expects
            duration_seconds = int(route.get("duration", "0s").strip("s")) if route.get("duration") else 0
            distance_meters = int(route.get("distanceMeters", 0))

            result = {
                "routes": [{
                    "summary": {
                        "lengthInMeters": distance_meters,
                        "travelTimeInSeconds": duration_seconds,
                        "trafficDelayInSeconds": 0,           # optional, not always available
                        "departureTime": datetime.utcnow().isoformat() + 'Z'
                    },
                    "legs": [{
                        "points": points
                    }]
                }]
            }
            return jsonify(result), 200

        # If Google returns an error, show the details in the backend terminal
        print(f"❌ Routes API error: {resp.status_code}, {resp.text}")
        return jsonify({"error": f"Routes API error: {resp.status_code}", "details": resp.text}), 400

    except Exception as e:
        print(f"❌ Route exception: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/validate-schedule", methods=["POST"])
@jwt_required()
def validate_schedule():
    data = request.get_json()
    places = data.get("places", [])
    weather = data.get("weather", {})
    date_str = data.get("date_str", "unknown date")
    time_str = data.get("time_str", "unknown time")
    now_str = datetime.now().strftime("%Y-%m-%d %I:%M %p")
    
    if not places:
        return jsonify({"validation": "No places selected."}), 400
        
    place_details = []
    for p in places:
        hours_info = p.get('hoursDisplay', '')
        is_open = p.get('isOpen')
        open_status = "currently open" if is_open is True else ("currently CLOSED" if is_open is False else "open status unknown")
        detail = f"{p['name']} ({p.get('category', 'Place')}, {open_status})"
        if hours_info:
            detail += f" - Hours: {hours_info}"
        place_details.append(detail)
    
    prompt = f"""
Current date and time is: {now_str}.
The user wants to schedule an itinerary on {date_str} at {time_str}.
Places in order: {', '.join(place_details)}.
Current weather: {weather.get('temp', 'unknown')}°C with {weather.get('rain_prob', 0)}% chance of rain.
Analyze if this schedule is logical. Explicitly check if the date is in the past, or if the time is absurd (like 12 AM for a mall or cafe).
IMPORTANT: You must start your response EXACTLY with either [APPROVED] if the plan is logical and safe, or [WARNING] if there are issues (like bad weather, past dates, or closed stores).
Then provide your explanation in under 3 sentences.
"""
    try:
        resp = gemini_client.models.generate_content(model="gemini-2.5-flash-lite", contents=prompt)
        text = resp.text.strip()
        return jsonify({"validation": text}), 200
    except Exception as e:
        print(f"Gemini Validation Error: {e}")
        return jsonify({"validation": "Could not validate schedule at this time."}), 200

@app.route("/api/itineraries", methods=["GET", "POST"])
@jwt_required()
def handle_itineraries():
    user_id = get_jwt_identity()
    if request.method == "POST":
        data = request.get_json()
        new_itin = Itinerary(
            user_id=user_id,
            date_str=data.get("date_str", ""),
            time_str=data.get("time_str", ""),
            places_json=json.dumps(data.get("places", []))
        )
        db.session.add(new_itin)
        db.session.commit()
        return jsonify({"message": "Schedule confirmed!"}), 201
    # GET method
    itins = Itinerary.query.filter_by(user_id=user_id).order_by(Itinerary.created_at.desc()).all()
    results = []
    for it in itins:
        results.append({
            "id": it.id,
            "date_str": it.date_str,
            "time_str": it.time_str,
            "places": json.loads(it.places_json),
            "created_at": it.created_at.isoformat()
        })
    return jsonify(results), 200

@app.route("/api/air-quality", methods=["POST"])
@jwt_required()
def get_air_quality():
    data = request.get_json()
    lat = data.get("lat")
    lon = data.get("lon")
    if not google_places_key or not lat or not lon:
        return jsonify({"error": "Missing coordinates"}), 400

    url = "https://airquality.googleapis.com/v1/currentConditions:lookup"
    headers = {"Content-Type": "application/json"}
    body = {
        "location": {"latitude": lat, "longitude": lon},
        "extraComputations": ["HEALTH_RECOMMENDATIONS", "POLLUTANT_CONCENTRATION"]
    }
    try:
        resp = requests.post(url, headers=headers, json=body, params={"key": google_places_key}, timeout=10)
        if resp.status_code == 200:
            return jsonify(resp.json()), 200
        # Debug output
        print(f"❌ Air Quality API error: {resp.status_code}")
        print(resp.text)
        return jsonify({"error": "Air quality data unavailable", "details": resp.text}), 400
    except Exception as e:
        print(f"❌ Air Quality exception: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/pollen", methods=["POST"])
@jwt_required()
def get_pollen():
    data = request.get_json()
    lat = data.get("lat")
    lon = data.get("lon")
    if not google_places_key or not lat or not lon:
        return jsonify({"error": "Missing coordinates"}), 400

    url = "https://pollen.googleapis.com/v1/forecast:lookup"
    try:
        resp = requests.get(url, params={
            "location.latitude": lat,
            "location.longitude": lon,
            "days": 1,
            "plants": ["GRASS", "TREE", "WEED"],
            "key": google_places_key
        }, timeout=10)
        if resp.status_code == 200:
            return jsonify(resp.json()), 200
        # Debug output
        print(f"❌ Pollen API error: {resp.status_code}")
        print(resp.text)
        return jsonify({"error": "Pollen data unavailable", "details": resp.text}), 400
    except Exception as e:
        print(f"❌ Pollen exception: {e}")
        return jsonify({"error": str(e)}), 500
        
@app.route("/api/solar", methods=["POST"])
@jwt_required()
def get_solar():
    data = request.get_json()
    lat = data.get("lat")
    lon = data.get("lon")
    if not google_places_key or not lat or not lon:
        return jsonify({"error": "Missing coordinates"}), 400

    url = "https://solar.googleapis.com/v1/buildingInsights:findClosest"
    try:
        resp = requests.get(url, params={
            "location.latitude": lat,
            "location.longitude": lon,
            "requiredQuality": "HIGH",
            "key": google_places_key
        }, timeout=10)
        if resp.status_code == 200:
            return jsonify(resp.json()), 200
        return jsonify({"error": "Solar data unavailable"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/timezone", methods=["POST"])
@jwt_required()
def get_timezone():
    data = request.get_json()
    lat = data.get("lat")
    lon = data.get("lon")
    timestamp = int(datetime.utcnow().timestamp())
    if not google_places_key or not lat or not lon:
        return jsonify({"error": "Missing coordinates"}), 400

    url = "https://maps.googleapis.com/maps/api/timezone/json"
    try:
        resp = requests.get(url, params={
            "location": f"{lat},{lon}",
            "timestamp": timestamp,
            "key": google_places_key
        }, timeout=10)
        if resp.status_code == 200:
            return jsonify(resp.json()), 200
        return jsonify({"error": "Timezone data unavailable"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/aerial-view", methods=["POST"])
@jwt_required()
def get_aerial_view():
    data = request.get_json()
    lat = data.get("lat")
    lon = data.get("lon")
    if not google_places_key or not lat or not lon:
        return jsonify({"error": "Missing coordinates"}), 400

    url = "https://aerialview.googleapis.com/v1/video:lookupVideo"
    try:
        resp = requests.post(url, params={"key": google_places_key},
            json={"location": {"latitude": lat, "longitude": lon}},
            timeout=10)
        if resp.status_code == 200:
            return jsonify(resp.json()), 200
        return jsonify({"error": "Aerial view unavailable"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True, port=5000)