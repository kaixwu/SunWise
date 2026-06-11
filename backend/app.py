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
print(f"Loaded TomTom Key: {os.getenv('TOMTOM_API_KEY', '')[:8]}...")
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
tomtom_key = os.getenv("TOMTOM_API_KEY")
google_places_key = os.getenv("GOOGLE_PLACES_API_KEY")

def generate_gemini_content(contents):
    """
    Unified helper to make Gemini API calls with robust model failover.
    Tries 'gemini-3.1-flash-lite' (500 RPD) first,
    fails over to 'gemini-2.5-flash' (20 RPD) second,
    and 'gemini-2.5-flash-lite' as a third backup!
    """
    models = ["gemini-3.1-flash-lite", "gemini-2.5-flash", "gemini-2.5-flash-lite"]
    last_err = None
    
    for model in models:
        try:
            resp = gemini_client.models.generate_content(
                model=model,
                contents=contents
            )
            print(f"[Gemini API Helper] Success using model: '{model}'")
            return resp
        except Exception as e:
            print(f"[Gemini API Helper] Warning: model '{model}' failed or rate-limited: {e}")
            last_err = e
            
    raise last_err

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
    schedule_json = db.Column(db.Text, nullable=True)   
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

# ── HELPERS (unchanged) ─────────────────────────────────────────────────────
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

# ── CORE FEATURES (unchanged) ───────────────────────────────────────────────
import xml.etree.ElementTree as ET

@app.route("/api/disasters", methods=["GET"])
@jwt_required()
def get_disasters():
    lat_str = request.args.get("lat")
    lon_str = request.args.get("lon")
    try:
        r = requests.get("https://www.gdacs.org/xml/rss.xml", timeout=10)
        r.raise_for_status()
        root = ET.fromstring(r.content)
        disasters = []
        for item in root.findall(".//item"):
            title = item.findtext("title", "")
            desc = item.findtext("description", "")
            
            # Find geo:Point if available
            geo_lat, geo_lon = None, None
            for child in item:
                if 'Point' in child.tag:
                    for coord in child:
                        if 'lat' in coord.tag: geo_lat = float(coord.text)
                        if 'long' in coord.tag: geo_lon = float(coord.text)

            is_relevant = False
            
            # If user provided coords and disaster has coords, check distance (e.g., within 1000km)
            if lat_str and lon_str and geo_lat is not None and geo_lon is not None:
                dist = haversine(float(lat_str), float(lon_str), geo_lat, geo_lon)
                if dist <= 300:
                    is_relevant = True
            else:
                # Fallback if no coords: we just return nothing or global alerts. 
                # Since we want local alerts, we skip global ones without coords.
                pass

            if is_relevant:
                # Get specific city/province via Nominatim for the disaster
                disaster_location = ""
                try:
                    nom_resp = requests.get(
                        "https://nominatim.openstreetmap.org/reverse",
                        params={"lat": geo_lat, "lon": geo_lon, "format": "json"},
                        headers={"User-Agent": "SunWise-App/1.0"},
                        timeout=5
                    )
                    if nom_resp.status_code == 200:
                        addr = nom_resp.json().get("address", {})
                        loc_name = addr.get("city") or addr.get("town") or addr.get("county") or addr.get("state")
                        if loc_name:
                            disaster_location = f" (Near {loc_name})"
                except:
                    pass
                    
                disasters.append({"title": f"{title}{disaster_location}", "description": desc})
                
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
    body = {"input": text}
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

@app.route("/api/hero-image", methods=["POST"])
def hero_image():
    data = request.get_json()
    query = data.get("query", "beautiful landscape travel")
    lat = data.get("lat")
    lon = data.get("lon")
    google_key = os.getenv("GOOGLE_PLACES_API_KEY")
    unsplash_key = os.getenv("UNSPLASH_ACCESS_KEY")

    def fetch_places_hero_items():
        if not google_key: return []
        
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": google_key,
            "X-Goog-FieldMask": "places.displayName,places.photos,places.types"
        }
        
        if lat and lon:
            url = "https://places.googleapis.com/v1/places:searchNearby"
            body = {
                "includedTypes": ["tourist_attraction", "park", "museum", "historical_landmark", "church", "restaurant", "shopping_mall"],
                "maxResultCount": 20,
                "locationRestriction": {
                    "circle": {
                        "center": {"latitude": float(lat), "longitude": float(lon)},
                        "radius": 10000.0
                    }
                }
            }
        else:
            url = "https://places.googleapis.com/v1/places:searchText"
            body = {
                "textQuery": f"best tourist attractions in {query}", 
                "maxResultCount": 15
            }
            
        try:
            resp = requests.post(url, headers=headers, json=body, timeout=8)
            if resp.status_code == 200:
                data = resp.json()
                hero_items = []
                mall_count = 0
                resto_count = 0
                
                for place in data.get("places", []):
                    types = place.get("types", [])
                    
                    if "shopping_mall" in types:
                        if mall_count >= 2: continue
                        mall_count += 1
                        
                    if "restaurant" in types and "shopping_mall" not in types:
                        if resto_count >= 2: continue
                        resto_count += 1
                        
                    title = place.get("displayName", {}).get("text", "Beautiful Destination")
                    photos = place.get("photos", [])
                    
                    # Filter for landscape HD photos
                    good_photos = [
                        p for p in photos
                        if p.get("widthPx", 0) > p.get("heightPx", 0) and p.get("widthPx", 0) >= 1280
                    ]
                    
                    if good_photos:
                        # Sort by total resolution (width * height) descending
                        good_photos.sort(key=lambda p: p.get("widthPx", 0) * p.get("heightPx", 0), reverse=True)
                        best_photo = good_photos[0]
                        url = f"https://places.googleapis.com/v1/{best_photo['name']}/media?maxHeightPx=1080&maxWidthPx=1920&key={google_key}"
                        
                        hero_items.append({
                            "title": title,
                            "url": url
                        })
                        
                        # Stop if we have 10 images
                        if len(hero_items) >= 10:
                            break
                            
                return hero_items
        except Exception as e:
            print(f"Google Places photo error: {e}")
        return []

    # Fallback to Unsplash
    def fetch_unsplash_hero_items(search_query):
        if not unsplash_key: return []
        url = "https://api.unsplash.com/search/photos"
        headers = {"Authorization": f"Client-ID {unsplash_key}"}
        params = {
            "query": search_query,
            "orientation": "landscape",
            "per_page": 5,
            "order_by": "relevant"
        }
        try:
            resp = requests.get(url, headers=headers, params=params, timeout=8)
            if resp.status_code == 200:
                results = resp.json().get("results", [])
                items = []
                for p in results:
                    desc = p.get("description") or p.get("alt_description") or "Beautiful Landscape"
                    # clean up unsplash descriptions
                    desc_clean = desc.title()
                    if len(desc_clean) > 40:
                        desc_clean = desc_clean[:37] + "..."
                    items.append({
                        "title": desc_clean,
                        "url": p["urls"]["raw"] + "&w=1920&q=85&fit=crop"
                    })
                return items
        except Exception as e:
            print(f"[Unsplash] Exception: {e}")
        return []

    hero_items = fetch_places_hero_items()
    
    if not hero_items:
        hero_items = fetch_unsplash_hero_items(f"{query} landscape")
        
    if not hero_items:
        hero_items = fetch_unsplash_hero_items("beautiful nature landscape")
        
    urls_only = [item["url"] for item in hero_items]
    return jsonify({"hero_items": hero_items, "urls": urls_only, "url": urls_only[0] if urls_only else None}), 200



@app.route("/api/reverse-geocode", methods=["GET"])
def reverse_geocode():
    lat = request.args.get("lat")
    lon = request.args.get("lon")
    if not lat or not lon:
        return jsonify({"error": "Missing lat/lon"}), 400
    try:
        resp = requests.get(
            "https://nominatim.openstreetmap.org/reverse",
            params={"lat": lat, "lon": lon, "format": "json"},
            headers={"User-Agent": "SunWise-App/1.0"},
            timeout=5
        )
        if resp.status_code == 200:
            data = resp.json()
            address = data.get("address", {})
            # Priority: state (province) > county > city > town > country
            province = (
                address.get("state") or
                address.get("county") or
                address.get("city") or
                address.get("town") or
                address.get("village") or
                address.get("country") or
                "Unknown Location"
            )
            # Clean up "Province of X" format
            if province.lower().startswith("province of "):
                province = province[12:]
            return jsonify({"province": province}), 200
        return jsonify({"province": "Unknown Location"}), 200
    except Exception as e:
        print(f"[ReverseGeocode] Error: {e}")
        return jsonify({"province": "Unknown Location"}), 200

@app.route("/api/place-details", methods=["POST"])
def place_details():
    data = request.get_json()
    place_id = data.get("place_id")
    if not place_id or not google_places_key:
        return jsonify({"error": "Missing place_id"}), 400

    url = f"https://places.googleapis.com/v1/places/{place_id}"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": google_places_key,
        "X-Goog-FieldMask": "location"
    }
    try:
        resp = requests.get(url, headers=headers, timeout=5)
        if resp.status_code == 200:
            loc = resp.json().get("location", {})
            return jsonify({"lat": loc["latitude"], "lon": loc["longitude"]}), 200
        return jsonify({"error": "Place not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── GOOGLE PLACES TEXT SEARCH (keyword-based, used by text-prompt itinerary) ─
def fetch_google_places_text_search(lat, lon, radius, keyword):
    """Uses Google Places Text Search API to find places matching a keyword near coordinates."""
    if not google_places_key:
        return []
    url = "https://places.googleapis.com/v1/places:searchText"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": google_places_key,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location,places.primaryType,places.types,places.regularOpeningHours,places.currentOpeningHours,places.rating,places.userRatingCount,places.photos,places.reviews"
    }
    body = {
        "textQuery": keyword,
        "locationBias": {
            "circle": {
                "center": {"latitude": lat, "longitude": lon},
                "radius": float(radius)
            }
        },
        "maxResultCount": 20
    }
    try:
        resp = requests.post(url, headers=headers, json=body, timeout=10)
        if resp.status_code != 200:
            print(f"[TextSearch] Error {resp.status_code}: {resp.text[:200]}")
            return []
        data = resp.json()
        results = []
        for place in data.get("places", []):
            name = place.get("displayName", {}).get("text", "")
            if not name:
                continue
            loc = place.get("location", {})
            d_lat = loc.get("latitude")
            d_lon = loc.get("longitude")
            if not d_lat or not d_lon:
                continue
            dist = round(haversine(lat, lon, d_lat, d_lon), 1)
            primary_type = place.get("primaryType", "")
            category_mapped = "Restaurant"
            dest_type = "Indoor"
            if "cafe" in primary_type:
                category_mapped = "Cafe"
            elif "park" in primary_type:
                category_mapped = "Park"; dest_type = "Outdoor"
            elif "museum" in primary_type:
                category_mapped = "Museum"
            elif "tourist_attraction" in primary_type:
                category_mapped = "Attraction"; dest_type = "Outdoor"
            elif "shopping" in primary_type:
                category_mapped = "Shopping"
            # Opening hours
            is_open = None
            oh = place.get("currentOpeningHours") or place.get("regularOpeningHours")
            if oh:
                is_open = oh.get("openNow")
            # Photo
            photo_url = None
            photos = place.get("photos", [])
            if photos:
                photo_ref = photos[0].get("name", "")
                if photo_ref:
                    photo_url = f"https://places.googleapis.com/v1/{photo_ref}/media?maxWidthPx=800&key={google_places_key}"
            # Opening hours display text
            hours_display = None
            if oh and oh.get("weekdayDescriptions"):
                hours_display = "; ".join(oh["weekdayDescriptions"][:3])
            # Reviews
            reviews_list = []
            for rev in place.get("reviews", [])[:5]:
                author = rev.get("authorAttribution", {}).get("displayName", "Anonymous")
                text   = rev.get("text", {}).get("text", "")
                rtime  = rev.get("relativePublishTimeDescription", "")
                if text:
                    reviews_list.append({"author": author, "text": text, "time": rtime})
            results.append({
                "name": name,
                "address": place.get("formattedAddress", ""),
                "lat": d_lat,
                "lon": d_lon,
                "distance": dist,
                "category": category_mapped,
                "envType": dest_type,
                "rating": place.get("rating"),
                "ratingCount": place.get("userRatingCount", 0),
                "isOpen": is_open,
                "hoursDisplay": hours_display,
                "photoUrl": photo_url,
                "reviews": reviews_list,
                "travelMins": 0,
                "score": 0,
                "matchReasons": []
            })
        print(f"[TextSearch] '{keyword}' near ({lat},{lon}) -> {len(results)} results")
        return results
    except Exception as e:
        print(f"[TextSearch] Exception: {e}")
        return []

# ── GOOGLE PLACES FETCH (unchanged) ─────────────────────────────────────────
def fetch_google_places(lat, lon, radius, category="Any", keyword=None):
    if not google_places_key:
        return []

    # If a keyword is provided (from text-prompt), use Text Search instead of Nearby Search
    # This lets users search for specific things like "chicken restaurant" or "coffee shop"
    if keyword and keyword.strip():
        return fetch_google_places_text_search(lat, lon, radius, keyword.strip())

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
    from concurrent.futures import ThreadPoolExecutor

    def fetch_type(ptype):
        body = {
            "includedTypes": [ptype],
            "maxResultCount": 20,
            "locationRestriction": {
                "circle": {"center": {"latitude": lat, "longitude": lon}, "radius": float(radius)}
            }
        }
        try:
            resp = requests.post(url, headers=headers, json=body, timeout=10)
            if resp.status_code == 200:
                return resp.json().get("places", [])
        except Exception as e:
            print(f"[Google] Error fetching {ptype}: {e}")
        return []

    # Run in parallel to drastically improve response times (up to 6x faster for 'Any' category)
    with ThreadPoolExecutor(max_workers=len(place_types)) as executor:
        results = executor.map(fetch_type, place_types)

    for places_list in results:
        for place in places_list:
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
            photo_url = None
            if photos:
                # Choose the photo with the largest area among the first 5
                best_photo = max(photos[:5], key=lambda p: (p.get("widthPx", 0) or 0) * (p.get("heightPx", 0) or 0), default=photos[0])
                photo_name = best_photo["name"]
                photo_url = f"https://places.googleapis.com/v1/{photo_name}/media?maxHeightPx=800&maxWidthPx=800&key={google_places_key}"
            
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
                "google_place_id": place.get("id"),
                "travelMins": 0,
                "score": 0,
                "matchReasons": []
            })
    # Deduplicate
    # Deduplicate strictly by name or place ID
    seen = set()
    unique = []
    for p in all_places:
        key = p["name"].lower().strip()
        if key in seen:
            continue
        seen.add(key)
        unique.append(p)
    return unique

# ── TOMTOM MATRIX (unchanged) ───────────────────────────────────────────────
def get_tomtom_travel_times(origin_lat, origin_lon, destinations):
    if not tomtom_key or not destinations:
        return
    origins = f"{origin_lat},{origin_lon}"
    dests = "|".join([f"{d['lat']},{d['lon']}" for d in destinations])
    url = f"https://api.tomtom.com/routing/1/matrix/sync/{origins}:{dests}/json"
    params = {"key": tomtom_key, "routeType": "fastest", "traffic": "true", "travelMode": "car"}
    try:
        resp = requests.get(url, params=params, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            matrix = data.get("matrix", [[]])
            if matrix and matrix[0]:
                times = matrix[0]
                for i, d in enumerate(destinations):
                    if i < len(times) and "travelTimeInSeconds" in times[i]:
                        d["travelMins"] = round(times[i]["travelTimeInSeconds"] / 60)
                    else:
                        d["travelMins"] = round(d["distance"] * 4)
        else:
            for d in destinations:
                d["travelMins"] = round(d["distance"] * 4)
    except:
        for d in destinations:
            d["travelMins"] = round(d["distance"] * 4)

# ── LOCAL SCORING (unchanged) ───────────────────────────────────────────────
def calculate_local_scores(places, weather, preferred_category, env_type):
    if not places:
        return []
    max_dist = max(p["distance"] for p in places)
    max_travel = max(p.get("travelMins", 30) for p in places)
    max_rating_count = max((p.get("userRatingCount") or 1) for p in places)
    for p in places:
        # Distance score (20%)
        dist_score = 1 - (p["distance"] / max_dist) if max_dist > 0 else 1
        # Travel time score (20%)
        travel = p.get("travelMins", 30)
        travel_score = 1 - (travel / max_travel) if max_travel > 0 else 1
        # Rating score (20%)
        rating = p.get("rating")
        rating_score = (rating / 5.0) if rating else 0.6
        # Popularity score (20%)
        count = p.get("userRatingCount") or 1
        pop_score = math.log(count + 1) / math.log(max_rating_count + 1) if max_rating_count > 0 else 0.5
        # Weather match (10%)
        temp = weather.get("temp", 30)
        rain = weather.get("rain_prob", 0)
        if p["type"] == "Outdoor":
            if rain > 50 or temp > 33:
                weather_score = 0.2
            elif rain > 20:
                weather_score = 0.4
            else:
                weather_score = 0.8
        else:
            weather_score = 0.9 if (rain > 50 or temp > 33) else 0.7
        # Category match (10%)
        cat_score = 1.0 if (p["category"] == preferred_category or preferred_category == "Any") else 0.5
        # Environment filter
        if env_type != "Any" and p["type"] != env_type:
            p["score"] = 0
            continue
        # Open status (10%)
        reasons = []
        if p.get("isOpen") is True:
            open_score = 1.0
            reasons.append("Currently Open")
        elif p.get("isOpen") is False:
            open_score = 0.0  # Heavy penalty for closed places
            reasons.append("Currently Closed")
        else:
            open_score = 0.6  # Unknown, neutral
        
        total = (dist_score * 0.15 + travel_score * 0.15 + rating_score * 0.20 +
                 pop_score * 0.20 + weather_score * 0.10 + cat_score * 0.10 + open_score * 0.10) * 100
        
        if dist_score > 0.7: reasons.append("Nearby Location")
        if travel_score > 0.7: reasons.append("Short Travel Time")
        if rating_score >= 0.8: reasons.append("Highly Rated")
        if weather_score >= 0.8: reasons.append("Ideal for Current Weather")
        if cat_score == 1.0 and preferred_category != "Any": reasons.append("Matches Category Preference")

        p["score"] = round(total)
        p["matchReasons"] = reasons
    return places

def generate_fallback_reason(place, category):
    reasons = []
    
    # Rating-based
    rating = place.get("rating")
    if rating and rating >= 4.5:
        reasons.append("boasts an exceptional rating with glowing visitor feedback")
    elif rating and rating >= 4.0:
        reasons.append("is highly recommended by locals for its top-tier quality")
        
    # Distance-based
    dist = place.get("distance", 0)
    if dist <= 2.0:
        reasons.append("is situated just a short walk or drive away from your coordinates")
    elif dist <= 5.0:
        reasons.append("is located incredibly close by, minimizing your transit time")
        
    # Indoors/Outdoors setting
    if place.get("type") == "Outdoor":
        reasons.append("offers a beautiful outdoor breeze perfect for a refreshing visit")
    else:
        reasons.append("provides a fully air-conditioned, comfortable indoor space to unwind")
        
    if not reasons:
        return f"A highly-rated local {category.lower() if category and category != 'Any' else 'spot'} that matches your search preferences perfectly."
        
    if len(reasons) >= 2:
        sentence = f"{place['name']} {reasons[0]} and {reasons[1]}."
    else:
        sentence = f"{place['name']} {reasons[0]}."
        
    # Capitalize only the first letter
    return sentence[0].upper() + sentence[1:] if len(sentence) > 1 else sentence

# ── PLACES ENDPOINT (unchanged) ─────────────────────────────────────────────
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
    get_tomtom_travel_times(lat, lon, places)
    scored = calculate_local_scores(places, weather, category, env_type)
    scored = [p for p in scored if p.get("score", 0) > 0]
    scored.sort(key=lambda x: x["score"], reverse=True)
    return jsonify({"places": scored[:20]}), 200

# ── NEW: GENERATE SMART ITINERARY FROM TODAY’S PLAN ─────────────────────────
@app.route("/api/generate-itinerary", methods=["POST"])
@jwt_required()
def generate_itinerary():
    data = request.get_json()
    places = data.get("places", [])
    weather = data.get("weather", {})
    start_time = data.get("start_time", datetime.now().strftime("%I:%M %p"))

    if not places:
        return jsonify({"error": "No places provided"}), 400

    # Build rich summaries with opening hours
    place_summaries = []
    for p in places:
        place_summaries.append({
            "name": p["name"],
            "category": p.get("category", "Attraction"),
            "distance_km": round(p.get("distance", 0), 1),
            "travel_mins": p.get("travelMins", 0),
            "is_open": p.get("isOpen"),
            "hours": p.get("hoursDisplay", "")
        })

    prompt = f"""
You are a smart travel planner. Given the user's saved destinations for today, create an optimal itinerary starting at {start_time} (current local time).

Weather: {weather.get('temp', 30)}°C, rain {weather.get('rain_prob', 0)}%, {weather.get('condition', 'Clear')}.

Available places with opening hours and travel times:
{json.dumps(place_summaries, indent=2)}

Consider:
- Weather (indoor vs outdoor)
- Current time and closing times (if no hours listed, assume closes at 9:00 PM)
- Logical sequence that minimises travel
- What activities to do at each place (briefly)
- Realistic durations (e.g., 1-2 hours for a restaurant, 1-3 hours for a museum)
- The user must be able to visit all stops before they close

Return ONLY a valid JSON object with the following structure:
{{
  "stops": ["Place A", "Place B", ...],
  "explanation": "A detailed, friendly paragraph that explains why this order is best. Mention specific times when the user should be at each place, how long to stay, and why the first stop makes sense (e.g., because it's the closest, or because it closes earlier). Reference weather if it influenced the decision.",
  "total_travel_mins": total estimated drive time in minutes,
  "best_start_time": "HH:MM AM/PM",
  "schedule": [
    {{
      "place": "Place A",
      "arrival_time": "11:00 AM",
      "departure_time": "12:30 PM",
      "activity_suggestion": "Enjoy a hearty breakfast and coffee"
    }},
    ...
  ]
}}

Only use the exact place names from the list above. For the schedule, use the place name exactly as given.
"""
    try:
        resp = generate_gemini_content(contents=prompt)
        text = resp.text.strip()
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0]
        elif "```" in text:
            text = text.split("```")[1].split("```")[0]
        result = json.loads(text)

        # Attach full place info to each stop name
        full_stops = []
        for stop_name in result.get("stops", []):
            match = next((p for p in places if p["name"] == stop_name), None)
            full_stops.append(match if match else {"name": stop_name})

        result["stops"] = full_stops
        # Keep schedule as list of objects
        return jsonify(result), 200

    except Exception as e:
        print(f"Gemini itinerary error: {e}")
        return jsonify({
            "stops": places[:2],
            "explanation": "Top two picks based on your preferences.",
            "total_travel_mins": 0,
            "best_start_time": start_time,
            "schedule": []
        }), 200

# ── NEW: TEXT‑PROMPT ITINERARY GENERATION ───────────────────────────────────
@app.route("/api/generate-itinerary-text", methods=["POST"])
@jwt_required()
def generate_itinerary_text():
    data = request.get_json()
    prompt_text = data.get("prompt", "")
    lat = data.get("lat")
    lon = data.get("lon")
    search_location = data.get("search_location", "").strip()
    weather = data.get("weather", {})

    if not prompt_text:
        return jsonify({"error": "Missing prompt"}), 400

    # 1. Determine target coordinates
    target_lat, target_lon = lat, lon

    if search_location:
        target_lat, target_lon = None, None

        # ---- Try Google Geocoding ----
        try:
            geocode_url = "https://maps.googleapis.com/maps/api/geocode/json"
            geocode_params = {"address": search_location, "key": google_places_key}
            geo_resp = requests.get(geocode_url, params=geocode_params, timeout=5)
            geo_data = geo_resp.json()
            if geo_data.get("status") == "OK" and geo_data.get("results"):
                location = geo_data["results"][0]["geometry"]["location"]
                target_lat = location["lat"]
                target_lon = location["lng"]
                print(f"[Geocode Google] {search_location} -> ({target_lat}, {target_lon})")
        except Exception as e:
            print(f"[Geocode Google] Error: {e}")

        # ---- Fallback to Nominatim (OpenStreetMap) ----
        if target_lat is None or target_lon is None:
            try:
                nominatim_url = "https://nominatim.openstreetmap.org/search"
                nominatim_params = {"q": search_location, "format": "json", "limit": 1}
                headers = {"User-Agent": "SunWise/1.0"}
                nom_resp = requests.get(nominatim_url, params=nominatim_params, headers=headers, timeout=5)
                nom_data = nom_resp.json()
                if nom_data:
                    target_lat = float(nom_data[0]["lat"])
                    target_lon = float(nom_data[0]["lon"])
                    print(f"[Geocode Nominatim] {search_location} -> ({target_lat}, {target_lon})")
            except Exception as e:
                print(f"[Geocode Nominatim] Error: {e}")

        # If still no coordinates, fall back to user's current location
        if target_lat is None or target_lon is None:
            target_lat, target_lon = lat, lon
            print("[Geocode] All failed – using current location")

    if not target_lat or not target_lon:
        return jsonify({"error": "No location available"}), 400

    # 2. Fetch nearby places using the user's prompt as a keyword
    #    This ensures "chicken restaurant" finds actual restaurants, not parks
    top_places = fetch_google_places(target_lat, target_lon, 10000, "Any", keyword=prompt_text)
    if not top_places:
        # Fallback: search without keyword if no results found
        top_places = fetch_google_places(target_lat, target_lon, 10000, "Any")
    if not top_places:
        return jsonify({"error": "No places found nearby"}), 404

    # 3. Get live travel times from the target location
    get_tomtom_travel_times(target_lat, target_lon, top_places)

    # 4. Build summary for Gemini
    place_summaries = []
    for p in top_places[:10]:
        place_summaries.append({
            "name": p["name"],
            "category": p.get("category", "Attraction"),
            "distance_km": p.get("distance", 0),
            "travel_mins": p.get("travelMins", 0),
            "is_open": p.get("isOpen")
        })

    final_prompt = f"""
You are a travel concierge. A user described their desired outing: "{prompt_text}".

Current weather: {weather.get('temp', 30)}°C, rain {weather.get('rain_prob', 0)}%, {weather.get('condition', 'Clear')}.

Top nearby places (with live travel times):
{json.dumps(place_summaries, indent=2)}

Choose 2-3 places that best match the user's request. Return ONLY a valid JSON object with:
{{
    "stops": ["Place Name 1", "Place Name 2", ...],
    "explanation": "A short, friendly explanation of why you chose these places.",
    "total_travel_mins": estimated total drive time
}}

Only use exact place names from the list above.
"""
    try:
        resp = generate_gemini_content(contents=final_prompt)
        text = resp.text.strip()
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0]
        elif "```" in text:
            text = text.split("```")[1].split("```")[0]
        result = json.loads(text)

        # Attach full place details to each stop name
        full_stops = []
        for stop_name in result.get("stops", []):
            match = next((p for p in top_places if p["name"] == stop_name), None)
            if match:
                full_stops.append(match)
            else:
                full_stops.append({"name": stop_name})
        result["stops"] = full_stops
        return jsonify(result), 200

    except Exception as e:
        print(f"Gemini text itinerary error: {e}")
        return jsonify({"stops": top_places[:2], "explanation": "Here are two top picks nearby.", "total_travel_mins": 0}), 200

# ── REMAINING ENDPOINTS (unchanged) ─────────────────────────────────────────
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
            user_id=user_id, name=data.get("name"), address=data.get("address"),
            lat=data.get("lat"), lon=data.get("lon"), category=data.get("category"),
            image_url=data.get("photoUrl"), rating=data.get("rating")
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
        resp = generate_gemini_content(contents=prompt)
        text = resp.text.strip()
        return jsonify({"summary": text}), 200
    except Exception as e:
        print(f"Gemini Summary Error: {e}")
        return jsonify({"summary": "Could not generate AI summary at this time."}), 200

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
        resp = generate_gemini_content(contents=prompt)
        text = resp.text.strip()
        return jsonify({"validation": text}), 200
    except Exception as e:
        print(f"Gemini Validation Error: {e}")
        return jsonify({"validation": "Could not validate schedule at this time."}), 200

@app.route("/api/directory", methods=["POST"])
@jwt_required()
def get_directory():
    data = request.get_json()
    lat = data.get("lat")
    lon = data.get("lon")
    if not lat or not lon or not google_places_key:
        return jsonify({"stores": []}), 200
    url = "https://places.googleapis.com/v1/places:searchNearby"
    headers = {"Content-Type": "application/json", "X-Goog-Api-Key": google_places_key, "X-Goog-FieldMask": "places.displayName,places.primaryType"}
    body = {"includedTypes": ["store", "restaurant", "cafe", "clothing_store", "shoe_store", "electronics_store"], "maxResultCount": 20, "locationRestriction": {"circle": {"center": {"latitude": lat, "longitude": lon}, "radius": 200.0}}}
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
    if not tomtom_key or not start or not end:
        return jsonify({"error": "Missing parameters"}), 400
    url = f"https://api.tomtom.com/routing/1/calculateRoute/{start['lat']},{start['lon']}:{end['lat']},{end['lon']}/json"
    params = {"key": tomtom_key, "routeType": "fastest", "traffic": "true", "travelMode": "car"}
    try:
        resp = requests.get(url, params=params, timeout=10)
        if resp.status_code == 200:
            return jsonify(resp.json()), 200
        return jsonify({"error": "Failed to fetch route"}), 400
    except Exception as e:
        import traceback
        print("❌ Route error:")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

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
            places_json=json.dumps(data.get("places", [])),
            schedule_json=json.dumps(data.get("schedule", None))   # new
        )
        db.session.add(new_itin)
        db.session.commit()
        return jsonify({"message": "Schedule confirmed!"}), 201

    # GET method – also return schedule if present
    itins = Itinerary.query.filter_by(user_id=user_id).order_by(Itinerary.created_at.desc()).all()
    results = []
    for it in itins:
        results.append({
            "id": it.id,
            "date_str": it.date_str,
            "time_str": it.time_str,
            "places": json.loads(it.places_json),
            "schedule": json.loads(it.schedule_json) if it.schedule_json else None,
            "created_at": it.created_at.isoformat()
        })
    return jsonify(results), 200
    
@app.route("/api/itineraries/<int:itinerary_id>", methods=["DELETE"])
@jwt_required()
def delete_itinerary(itinerary_id):
    user_id = get_jwt_identity()
    itin = Itinerary.query.filter_by(id=itinerary_id, user_id=user_id).first()
    if not itin:
        return jsonify({"error": "Itinerary not found"}), 404
    db.session.delete(itin)
    db.session.commit()
    return jsonify({"message": "Itinerary deleted"}), 200

@app.route("/api/suggest-places", methods=["POST"])
def suggest_places():
    data = request.get_json()
    lat = data.get("lat")
    lon = data.get("lon")
    category = data.get("category", "")
    radius = data.get("radius", 10000)
    weather = data.get("weather", {})
    env_type = "Any"
    
    if not lat or not lon or not category:
        return jsonify({"error": "Missing location or category"}), 400
        
    try:
        # Use exact same robust search as destinations page
        places = fetch_google_places(lat, lon, radius, category)
        if not places:
            return jsonify([]), 200
            
        get_tomtom_travel_times(lat, lon, places)
        scored = calculate_local_scores(places, weather, category, env_type)
        
        # Filter and sort (strictly exclude currently closed places, and only keep scored > 0)
        scored = [p for p in scored if p.get("isOpen") is not False and p.get("score", 0) > 0]
        scored.sort(key=lambda x: x["score"], reverse=True)
        
        results = scored[:3]
        
        # Populate our beautiful, responsive rule-based reasons (highly accurate, zero token cost!)
        for r in results:
            r["whySuggested"] = generate_fallback_reason(r, category)
            
        return jsonify(results), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/ai-chat", methods=["POST"])
def ai_chat():
    data = request.get_json()
    user_message = data.get("message")
    history = data.get("history", [])
    location = data.get("location", "Philippines")
    weather = data.get("weather", {})
    lat = data.get("lat")
    lon = data.get("lon")
    
    if not user_message:
        return jsonify({"error": "Message is required"}), 400
        
    system_instruction = f"""
You are SunWise AI, a premium, intelligent, highly-capable travel companion and smart concierge.
The user is currently at location: {location}.
Current local weather conditions: {json.dumps(weather) if weather else "Unknown"}.

Response Formatting & Readability Rules:
1. **Be extremely concise and direct**: Avoid long conversational fillers, intros, or wordy pleasantries. Keep intros and outros under 1-2 short sentences.
2. **Compact Listings (Max 3 spots)**: If recommending places, limit to the **Top 3 spots**.
3. **Structured formatting (Single-level bullets only)**: Format each recommended spot exactly like this (bold spot names, clean emojis, no nested sub-bullets):
   * **1. Spot Name**
   * ⭐ [Rating]/5 ([Review Count] reviews) | [status_emoji] (Open Now or Closed)
   * 📍 Address: [Address]
   * 🕒 Hours: [Hours]
   * 💬 Insight: [1-sentence insight why they should visit]
4. **Short Dynamic Advice**: Keep weather guides, safety tips, or travel insights under **2 short bullet points** total. Always prefix this section with the exact title "**Travel Tips**" on a new line!
5. **Contextual Suggested Quick Replies**: At the very end of your response (after all content), you MUST generate exactly 3 highly relevant suggested follow-up queries that the user might want to click next.
   - **CRITICAL RESTRICTION**: NEVER suggest queries about opening Google Maps, redirecting to navigation, opening external links, showing/viewing photos, viewing images, or starting driving routes (since you cannot do these in a text chatbot).
   - ONLY suggest text-based actions: e.g. finding alternative spots, detailing menu highlights in text, planning travel itineraries, weather packing checklists, or safety warnings.
   - You MUST format it exactly like this at the very end:
[SUGGESTIONS]
* Emoji Suggestion Option 1
* Emoji Suggestion Option 2
* Emoji Suggestion Option 3
"""

    query_str = None
    realtime_places = []
    
    # 1. High-Performance Local Travel Intent Classifier (zero token cost, saving 50% API calls!)
    msg_lower = user_message.lower()
    recommend_triggers = [
        "recommend", "suggest", "find", "search", "show me", "top 5", "top 10", "best", "where to eat", "good spots",
        "cafe", "restaurant", "samgyupsal", "food", "places", "spots", "eat", "visit", "tourist", "bar", "park", "hotel", "outing"
    ]
    
    is_recommend_query = False
    for trigger in recommend_triggers:
        pattern = r'\b' + re.escape(trigger) + r'\b'
        if re.search(pattern, msg_lower):
            is_recommend_query = True
            break
            
    if is_recommend_query:
        # Extract location indicator "in [place]", "near [place]", "at [place]", "around [place]"
        loc_match = re.search(r'(?:in|near|at|around)\s+([a-zA-Z\s,]+)', user_message, re.IGNORECASE)
        search_loc = None
        if loc_match:
            search_loc = loc_match.group(1).strip()
            # Clean up trailing punctuation
            search_loc = re.sub(r'[^\w\s]', '', search_loc).strip()
        else:
            search_loc = "current location"
            
        # Clean up keyword search term by stripping stops
        keyword = user_message
        stops = [
            "recommend", "suggest", "find", "search", "show me", "show", "me", "top 5", "top 10", "best", 
            "where to eat", "good spots", "some", "a", "the"
        ]
        # First remove action stops
        for stop in stops:
            keyword = re.sub(r'\b' + re.escape(stop) + r'\b', '', keyword, flags=re.IGNORECASE)
            
        # Then remove location suffix if present
        if search_loc and search_loc.lower() != "current location":
            keyword = re.sub(r'\b(?:in|near|at|around)\s+' + re.escape(search_loc) + r'\b', '', keyword, flags=re.IGNORECASE)
            
        keyword = keyword.strip()
        keyword = re.sub(r'[^\w\s]', '', keyword).strip() # clean symbols
        
        if keyword:
            query_str = keyword
            if search_loc and search_loc.lower() != "current location":
                query_str = f"{keyword} in {search_loc}"
            
            # Fetch real-time places from Google Places API
            search_lat = lat or 14.5995
            search_lon = lon or 120.9842
            try:
                realtime_places = fetch_google_places_text_search(search_lat, search_lon, 20000, query_str)
                print(f"[AIChat Local Classifier] Query: '{query_str}' -> Found {len(realtime_places)} places")
            except Exception as fe:
                print(f"[AIChat Local Classifier] Fetch error: {fe}")
            
    # 3. Add Google Places to prompt context if available
    if realtime_places:
        places_summary = []
        for p in realtime_places[:5]: # Top 5
            places_summary.append({
                "name": p["name"],
                "address": p.get("address"),
                "rating": p.get("rating"),
                "ratingCount": p.get("ratingCount"),
                "isOpen": p.get("isOpen"),
                "hours": p.get("hoursDisplay")
            })
        
        system_instruction += f"\n\nReal-time Places Data found via Google Places API for query '{query_str}':\n{json.dumps(places_summary, indent=2)}\n\nIMPORTANT: You MUST base your recommendations strictly on these real-time Google Places API results! Follow these formatting rules strictly to keep the response compact and beautiful:\n1. Recommend ONLY the top 3 spots.\n2. Format each spot exactly like this (single-level bullets, no nested sub-bullets):\n* **1. Spot Name**\n* ⭐ [Rating]/5 ([Review Count] reviews) | [status_emoji] (Open Now or Closed)\n* 📍 [Address]\n* 🕒 [Hours]\n* 💬 [1-sentence insight why they should visit]\n3. Do not include nested bullets or long paragraphs."
    
    # 4. Generate final chat response
    try:
        prompt_parts = [system_instruction, "\nConversation History:\n"]
        for msg in history:
            role_label = "User" if msg.get("role") == "user" else "SunWise AI"
            prompt_parts.append(f"{role_label}: {msg.get('text')}")
            
        prompt_parts.append(f"User: {user_message}")
        prompt_parts.append("SunWise AI:")
        
        full_prompt = "\n".join(prompt_parts)
        
        if os.getenv("GEMINI_API_KEY"):
            try:
                response = generate_gemini_content(contents=full_prompt)
                response_text = response.text
            except Exception as gem_err:
                print(f"[AIChat] Gemini Generation Error (using fallback): {gem_err}")
                if "RESOURCE_EXHAUSTED" in str(gem_err) or "quota" in str(gem_err).lower() or "limit" in str(gem_err).lower():
                    if realtime_places:
                        response_text = f"I am currently experiencing high demand on my AI servers, but I successfully retrieved verified local listings near you via the **Google Places API**! 🌟\n\nHere are the top matches for **{query_str or user_message}**:\n\n"
                        for idx, p in enumerate(realtime_places[:5], 1):
                            status_emoji = "🟢 Open Now" if p.get("isOpen") else "🔴 Closed"
                            rating_str = f"⭐ {p.get('rating')} ({p.get('ratingCount')} reviews)" if p.get("rating") else "No reviews yet"
                            response_text += f"{idx}. **{p['name']}**\n"
                            response_text += f"   - {rating_str} | {status_emoji}\n"
                            if p.get("address"):
                                response_text += f"   - 📍 Address: {p['address']}\n"
                            if p.get("hoursDisplay"):
                                response_text += f"   - 🕒 Hours: {p['hoursDisplay']}\n"
                            response_text += "\n"
                        response_text += "Feel free to check them out! Apologies for the temporary AI response delay. Let me know if you need anything else!"
                    else:
                        response_text = "I'm sorry, I am currently experiencing extremely high traffic on my AI thinking engines. Please try asking me again in a few moments! ☕"
                else:
                    raise gem_err
        else:
            response_text = "I'm sorry, my AI backend is offline. Please configure a valid GEMINI_API_KEY."
            
        # Update history
        updated_history = list(history)
        updated_history.append({"role": "user", "text": user_message})
        updated_history.append({"role": "model", "text": response_text})

        # 1. Parse dynamic AI suggested replies if present in the response
        ai_suggestions = []
        if "[SUGGESTIONS]" in response_text:
            parts = response_text.split("[SUGGESTIONS]")
            response_text = parts[0].strip()
            sug_block = parts[1].strip()
            for line in sug_block.split("\n"):
                cleaned = line.replace("*", "").replace("-", "").strip()
                if cleaned:
                    ai_suggestions.append(cleaned)

        # Determine separate bubbles by split markers
        bubbles = []
        lower_text = response_text.lower()
        split_marker = None
        for marker in ["**travel tips**", "### travel tips", "**weather tips**", "travel tips"]:
            if marker in lower_text:
                idx = lower_text.find(marker)
                split_marker = response_text[idx:idx+len(marker)]
                break
                
        if split_marker:
            parts = response_text.split(split_marker, 1)
            bubble_1 = parts[0].strip()
            bubble_2 = f"**Travel Tips**\n{parts[1].strip()}"
            if bubble_1:
                bubbles.append(bubble_1)
            if bubble_2:
                bubbles.append(bubble_2)
        else:
            bubbles.append(response_text)

        # Generate local fallback/backup suggestions in case the AI didn't provide enough
        backup_suggestions = []
        msg_lower = user_message.lower()
        
        if realtime_places:
            has_closed = any(p.get("isOpen") is False for p in realtime_places[:3])
            if has_closed:
                backup_suggestions.append("🔓 Show me places open now")
            
            if any(w in msg_lower for w in ["samgyupsal", "korean", "grill", "samgyup"]):
                backup_suggestions.append("🥩 Other samgyupsal nearby")
                backup_suggestions.append("🍜 Best Korean alternatives")
            elif any(w in msg_lower for w in ["cafe", "coffee", "brew", "starbucks"]):
                backup_suggestions.append("☕ Cozy quiet cafes")
                backup_suggestions.append("🍰 Cafes with desserts")
            elif any(w in msg_lower for w in ["restaurant", "food", "eat", "dinner", "lunch"]):
                backup_suggestions.append("🍔 Fast food spots")
                backup_suggestions.append("🍕 Top-rated diners")
            else:
                backup_suggestions.append("✨ Show other top spots")
                
            rain_prob = weather.get("rain_prob", 0) if isinstance(weather, dict) else 0
            temp = weather.get("temp", 30) if isinstance(weather, dict) else 30
            if isinstance(rain_prob, (int, float)) and rain_prob > 50:
                backup_suggestions.append("🏛️ Cozy indoor spots")
            elif isinstance(temp, (int, float)) and temp > 34:
                backup_suggestions.append("❄️ Air-conditioned places")
        elif "weather" in msg_lower:
            backup_suggestions.append("👕 What should I wear today?")
            backup_suggestions.append("🎒 Best outdoor activities")
            backup_suggestions.append("☕ Nearby cafes to chill")
        else:
            backup_suggestions.append("🗺️ Plan a 1-day itinerary")
            backup_suggestions.append("☕ Best cafes nearby")
            backup_suggestions.append("🏛️ Top tourist spots")
            
        # Merge AI suggestions and local backup suggestions
        suggestions = []
        for s in ai_suggestions:
            if s not in suggestions:
                suggestions.append(s)
        for s in backup_suggestions:
            if len(suggestions) >= 3:
                break
            if s not in suggestions:
                suggestions.append(s)
                
        suggestions = suggestions[:3]
        if not suggestions:
            suggestions = ["🗺️ Plan a 1-day itinerary", "☕ Best cafes nearby", "🏛️ Top tourist spots"]
        
        return jsonify({
            "text": response_text,
            "bubbles": bubbles,
            "suggestions": suggestions,
            "history": updated_history
        }), 200
    except Exception as e:
        print(f"[AIChat] Generation Error: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True, port=5000)