import json

from flask import Blueprint, request, jsonify, g

from db import query_all, query_one, execute
from models import review_dict, get_product, log_activity
from auth_utils import login_required

reviews_bp = Blueprint("reviews", __name__, url_prefix="/api")


@reviews_bp.get("/products/<int:pid>/reviews")
def list_reviews(pid):
    if not get_product(pid):
        return jsonify({"error": "Not found"}), 404
    rows = query_all("SELECT * FROM reviews WHERE product_id = ? ORDER BY created_at DESC", (pid,))
    return jsonify({"reviews": [review_dict(r) for r in rows]})


@reviews_bp.post("/products/<int:pid>/reviews")
@login_required
def add_review(pid):
    product = get_product(pid)
    if not product:
        return jsonify({"error": "Not found"}), 404
    if product["seller_id"] == g.user["id"]:
        return jsonify({"error": "You cannot review your own product."}), 400

    data = request.get_json(silent=True) or {}
    try:
        stars = int(data.get("stars"))
    except (TypeError, ValueError):
        stars = 0
    if stars < 1 or stars > 5:
        return jsonify({"error": "Choose a star rating from 1 to 5."}), 400

    text = (data.get("text") or "").strip()[:1000]
    images = data.get("imgs") or []
    if not isinstance(images, list):
        images = []
    images = [str(i) for i in images][:4]
    images_json = json.dumps(images)

    existing = query_one(
        "SELECT * FROM reviews WHERE product_id = ? AND user_id = ?", (pid, g.user["id"])
    )
    import time
    if existing:
        execute(
            "UPDATE reviews SET stars=?, text=?, images_json=? WHERE id = ?",
            (stars, text, images_json, existing["id"]),
        )
        rid = existing["id"]
    else:
        rid = execute(
            "INSERT INTO reviews (product_id, user_id, stars, text, images_json, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (pid, g.user["id"], stars, text, images_json, int(time.time() * 1000)),
        )

    log_activity(g.user["email"], f"Review posted on product #{pid}")
    return jsonify({"review": review_dict(query_one("SELECT * FROM reviews WHERE id = ?", (rid,)))}), 201


@reviews_bp.delete("/reviews/<int:rid>")
@login_required
def delete_review(rid):
    row = query_one("SELECT * FROM reviews WHERE id = ?", (rid,))
    if not row:
        return jsonify({"error": "Not found"}), 404
    if g.user["role"] != "admin" and row["user_id"] != g.user["id"]:
        return jsonify({"error": "You can't delete this review."}), 403
    execute("DELETE FROM reviews WHERE id = ?", (rid,))
    log_activity(g.user["email"], f"Review deleted (#{rid})")
    return jsonify({"ok": True})
