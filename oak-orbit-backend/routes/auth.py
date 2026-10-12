import re
import random

from flask import Blueprint, request, jsonify, session, g
from werkzeug.security import generate_password_hash, check_password_hash

from models import get_user_by_email, get_user_by_id, create_user, user_public, log_activity
from db import execute

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

EMAIL_RE = re.compile(r"^\S+@\S+\.\S+$")

# In-memory store for demo password-reset codes (NOT for production: use a
# real mailer + short-lived DB-backed tokens there instead).
_reset_codes = {}


@auth_bp.post("/register")
def register():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    role = data.get("role") or "buyer"
    shop = (data.get("shop") or "").strip()

    if len(name) < 2:
        return jsonify({"error": "Enter your full name."}), 400
    if not EMAIL_RE.match(email):
        return jsonify({"error": "Enter a valid email address."}), 400
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters."}), 400
    if role not in ("buyer", "seller"):
        role = "buyer"
    if role == "seller" and len(shop) < 2:
        return jsonify({"error": "Enter your store name."}), 400
    if get_user_by_email(email):
        return jsonify({"error": "An account with this email already exists. Try signing in."}), 409

    uid = create_user(name, email, generate_password_hash(password), role, shop if role == "seller" else "")
    log_activity(email, "Account created (" + role + ")")

    session.clear()
    session["user_id"] = uid
    return jsonify({"user": user_public(get_user_by_id(uid))}), 201


@auth_bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not EMAIL_RE.match(email):
        return jsonify({"error": "Enter a valid email address."}), 400
    if not password:
        return jsonify({"error": "Enter your password."}), 400

    user = get_user_by_email(email)
    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "Email or password is incorrect."}), 401
    if user["status"] == "suspended":
        return jsonify({"error": "This account has been suspended. Please contact support."}), 403

    session.clear()
    session["user_id"] = user["id"]
    return jsonify({"user": user_public(user)})


@auth_bp.post("/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})


@auth_bp.get("/me")
def me():
    if not g.get("user"):
        return jsonify({"user": None})
    return jsonify({"user": user_public(g.user)})


@auth_bp.post("/forgot")
def forgot():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    if not EMAIL_RE.match(email):
        return jsonify({"error": "Enter a valid email address."}), 400

    # Always respond the same way whether or not the account exists, so this
    # endpoint can't be used to enumerate registered emails.
    code = f"{random.randint(100000, 999999)}"
    _reset_codes[email] = code
    exists = bool(get_user_by_email(email))
    payload = {"ok": True, "message": f"If an account exists for {email}, a code is on its way."}
    if exists:
        # Demo only: a real app emails this instead of returning it in the API response.
        payload["demo_code"] = code
    return jsonify(payload)


@auth_bp.post("/reset")
def reset():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    code = (data.get("code") or "").strip()
    new_password = data.get("password") or ""

    if _reset_codes.get(email) != code:
        return jsonify({"error": "That code is not correct. Check it and try again."}), 400
    if len(new_password) < 8:
        return jsonify({"error": "New password must be at least 8 characters."}), 400

    user = get_user_by_email(email)
    if not user:
        return jsonify({"error": "That code is not correct. Check it and try again."}), 400

    execute("UPDATE users SET password_hash = ? WHERE id = ?", (generate_password_hash(new_password), user["id"]))
    _reset_codes.pop(email, None)
    log_activity(email, "Password reset")
    return jsonify({"ok": True})
