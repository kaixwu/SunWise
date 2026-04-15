from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_jwt_extended import (
    JWTManager, create_access_token,
    jwt_required, get_jwt_identity
)
import bcrypt
import sqlite3
import os
import math
import requests
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app, origins=["http://localhost:5173"])

app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "fallback-secret")
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = 86400  # 24 hours in seconds

jwt = JWTManager(app)
DB_PATH = "sunwise.db"

# ── DATABASE SETUP ────────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            username  TEXT NOT NULL,
            email     TEXT NOT NULL UNIQUE,
            password  TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS preferences (
            user_id      INTEGER PRIMARY KEY,
            trip_type    TEXT DEFAULT 'any',
            max_distance INTEGER DEFAULT 10,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    conn.commit()
    conn.close()

init_db()

# ── HELPERS ───────────────────────────────────────────────────────────────────

def is_valid_email(email):
    import re
    return bool(re.match(r"^[\w\.-]+@[\w\.-]+\.\w{2,}$", email))

def is_strong_password(password):
    import re
    if len(password) < 8 or len(password) > 32:
        return False
    if not re.search(r"[A-Z]", password):
        return False
    if not re.search(r"[0-9]", password):
        return False
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
        return False
    return True

# ── AUTH ROUTES ───────────────────────────────────────────────────────────────

@app.route("/register", methods=["POST"])
def register():
    data = request.get_json()

    username = (data.get("username") or "").strip()
    email    = (data.get("email") or "").strip().lower()
    password = (data.get("password") or "").strip()

    # Validate fields
    if not username or not email or not password:
        return jsonify({"error": "All fields are required."}), 400

    if not is_valid_email(email):
        return jsonify({"error": "Invalid email format."}), 400

    if not is_strong_password(password):
        return jsonify({
            "error": "Password must be 8 to 32 characters and include an uppercase letter, a number, and a special character."
        }), 400

    # Hash password
    hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())

    try:
        conn = get_db()
        conn.execute(
            "INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
            (username, email, hashed.decode("utf-8"))
        )
        conn.commit()
        user_id = conn.execute(
            "SELECT id FROM users WHERE email = ?", (email,)
        ).fetchone()["id"]
        conn.execute(
            "INSERT INTO preferences (user_id) VALUES (?)", (user_id,)
        )
        conn.commit()
        conn.close()
        return jsonify({"message": "Registration successful."}), 201

    except sqlite3.IntegrityError:
        return jsonify({"error": "Email is already registered."}), 409


@app.route("/login", methods=["POST"])
def login():
    data = request.get_json()

    email    = (data.get("email") or "").strip().lower()
    password = (data.get("password") or "").strip()

    if not email or not password:
        return jsonify({"error": "All fields are required."}), 400

    conn  = get_db()
    user  = conn.execute(
        "SELECT * FROM users WHERE email = ?", (email,)
    ).fetchone()
    conn.close()

    if not user:
        return jsonify({"error": "Invalid email or password."}), 401

    password_match = bcrypt.checkpw(
        password.encode("utf-8"),
        user["password"].encode("utf-8")
    )

    if not password_match:
        return jsonify({"error": "Invalid email or password."}), 401

    token = create_access_token(identity=str(user["id"]))

    return jsonify({
        "token":    token,
        "user_id":  user["id"],
        "username": user["username"]
    }), 200


@app.route("/me", methods=["GET"])
@jwt_required()
def me():
    user_id = get_jwt_identity()
    conn    = get_db()
    user    = conn.execute(
        "SELECT id, username, email FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    conn.close()

    if not user:
        return jsonify({"error": "User not found."}), 404

    return jsonify({
        "id":       user["id"],
        "username": user["username"],
        "email":    user["email"]
    }), 200


# ── HEALTH CHECK ──────────────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"}), 200

import math

def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.asin(math.sqrt(a))

@app.route("/destinations", methods=["GET"])
@jwt_required()
def get_destinations():
    lat    = request.args.get("lat", type=float)
    lon    = request.args.get("lon", type=float)
    radius = request.args.get("radius", default=10000, type=int)

    if lat is None or lon is None:
        return jsonify({"error": "lat and lon are required."}), 400

    query = f"""
    [out:json][timeout:25];
    (
      node["tourism"](around:{radius},{lat},{lon});
      way["tourism"](around:{radius},{lat},{lon});
      relation["tourism"](around:{radius},{lat},{lon});
    );
    out center tags;
    """

    try:
        resp = requests.post(
            "https://overpass-api.de/api/interpreter",
            data={"data": query},
            timeout=25
        )
        data = resp.json()
    except Exception as e:
        return jsonify({"error": "Failed to fetch destinations.", "details": str(e)}), 500

    destinations = []
    for el in data.get("elements", []):
        tags = el.get("tags", {})
        name = tags.get("name")
        if not name:
            continue

        # Get coordinates
        if el["type"] == "node":
            dlat, dlon = el.get("lat"), el.get("lon")
        else:
            center = el.get("center", {})
            dlat, dlon = center.get("lat"), center.get("lon")

        if not dlat or not dlon:
            continue

        tourism = tags.get("tourism", "attraction")

        # Map to category
        category_map = {
            "museum":      "Museum",
            "gallery":     "Museum",
            "artwork":     "Heritage",
            "monument":    "Heritage",
            "memorial":    "Heritage",
            "ruins":       "Heritage",
            "viewpoint":   "Nature",
            "picnic_site": "Nature",
            "camp_site":   "Nature",
            "beach":       "Beach",
            "theme_park":  "Park",
            "attraction":  "Landmark",
            "zoo":         "Park",
            "aquarium":    "Museum",
        }
        category = category_map.get(tourism, "Landmark")

        # Indoor or outdoor
        indoor_types = {"museum", "gallery", "aquarium", "artwork"}
        dest_type = "Indoor" if tourism in indoor_types else "Outdoor"

        distance = round(haversine(lat, lon, dlat, dlon), 1)

        destinations.append({
            "name":     name,
            "lat":      dlat,
            "lon":      dlon,
            "type":     dest_type,
            "category": category,
            "tourism":  tourism,
            "distance": distance,
        })

    # Filter out accommodations
    exclude = {"hotel", "hostel", "guest_house", "motel", "apartment"}
    destinations = [d for d in destinations if d["tourism"] not in exclude]
    # Sort by distance
    destinations.sort(key=lambda x: x["distance"])

    return jsonify({"destinations": destinations[:30]}), 200

if __name__ == "__main__":
    app.run(debug=True)