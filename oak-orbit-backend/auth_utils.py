from functools import wraps

from flask import session, jsonify, g

from models import get_user_by_id


def load_current_user():
    """Populate g.user from the session cookie, if any. Called via before_request."""
    g.user = None
    uid = session.get("user_id")
    if uid:
        user = get_user_by_id(uid)
        if user and user["status"] != "suspended":
            g.user = user
        else:
            session.clear()


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not g.get("user"):
            return jsonify({"error": "Sign in required"}), 401
        return fn(*args, **kwargs)
    return wrapper


def seller_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        u = g.get("user")
        if not u or u["role"] not in ("seller", "admin"):
            return jsonify({"error": "Seller access required"}), 403
        return fn(*args, **kwargs)
    return wrapper


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        u = g.get("user")
        if not u or u["role"] != "admin":
            return jsonify({"error": "Admin access required"}), 403
        return fn(*args, **kwargs)
    return wrapper
