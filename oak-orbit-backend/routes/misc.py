from flask import Blueprint, jsonify

from db import query_one
from models import get_settings, settings_dict

misc_bp = Blueprint("misc", __name__, url_prefix="/api")


@misc_bp.get("/settings")
def get_settings_route():
    return jsonify({"settings": settings_dict(get_settings())})


@misc_bp.get("/promo/<code>")
def check_promo(code):
    promo = query_one("SELECT * FROM promo_codes WHERE code = ? AND active = 1", (code.strip().upper(),))
    if not promo:
        return jsonify({"valid": False}), 404
    return jsonify({"valid": True, "promo": {"code": promo["code"], "pct": promo["pct"], "active": bool(promo["active"])}})
