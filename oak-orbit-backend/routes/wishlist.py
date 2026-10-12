from flask import Blueprint, jsonify, g

from db import query_all, query_one, execute
from auth_utils import login_required

wishlist_bp = Blueprint("wishlist", __name__, url_prefix="/api/wishlist")


@wishlist_bp.get("")
@login_required
def list_wishlist():
    rows = query_all("SELECT product_id FROM wishlist WHERE user_id = ?", (g.user["id"],))
    return jsonify({"productIds": [r["product_id"] for r in rows]})


@wishlist_bp.post("/<int:pid>/toggle")
@login_required
def toggle_wishlist(pid):
    row = query_one(
        "SELECT * FROM wishlist WHERE user_id = ? AND product_id = ?", (g.user["id"], pid)
    )
    if row:
        execute("DELETE FROM wishlist WHERE id = ?", (row["id"],))
        saved = False
    else:
        execute("INSERT INTO wishlist (user_id, product_id) VALUES (?, ?)", (g.user["id"], pid))
        saved = True
    return jsonify({"saved": saved})
