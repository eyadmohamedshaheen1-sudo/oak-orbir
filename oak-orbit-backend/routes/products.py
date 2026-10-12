from flask import Blueprint, request, jsonify, g

from db import query_all, query_one, execute
from models import product_dict, get_product, CATEGORIES, log_activity
from auth_utils import seller_required

products_bp = Blueprint("products", __name__, url_prefix="/api/products")


@products_bp.get("")
def list_products():
    search = (request.args.get("q") or "").strip().lower()
    category = (request.args.get("category") or "").strip()
    sort = (request.args.get("sort") or "").strip()

    sql = "SELECT * FROM products WHERE hidden = 0"
    params = []
    if category and category != "All":
        sql += " AND category = ?"
        params.append(category)
    rows = query_all(sql, tuple(params))

    items = [product_dict(r) for r in rows]

    if search:
        items = [
            p for p in items
            if search in p["n"].lower() or search in (p["d"] or "").lower() or search in p["c"].lower()
        ]

    if sort == "a":
        items.sort(key=lambda p: p["p"])
    elif sort == "d":
        items.sort(key=lambda p: -p["p"])
    elif sort == "r":
        items.sort(key=lambda p: -p["rating"])

    return jsonify({"products": items, "categories": CATEGORIES})


@products_bp.get("/<int:pid>")
def get_one(pid):
    row = get_product(pid)
    if not row:
        return jsonify({"error": "Not found"}), 404
    return jsonify({"product": product_dict(row)})


def _validate_payload(data):
    import json
    name = (data.get("n") or "").strip()
    category = (data.get("c") or "").strip()
    try:
        price = float(data.get("p"))
    except (TypeError, ValueError):
        price = None
    old_price = data.get("o")
    try:
        old_price = float(old_price) if old_price not in (None, "") else None
    except (TypeError, ValueError):
        old_price = None
    try:
        stock = int(data.get("stock", 10))
    except (TypeError, ValueError):
        stock = 10
    description = (data.get("d") or "").strip()[:600]
    images = data.get("imgs") or []
    if not isinstance(images, list):
        images = []
    images = [str(i) for i in images][:5]

    errors = []
    if len(name) < 2:
        errors.append("Enter a product name.")
    if category not in CATEGORIES:
        errors.append("Choose a valid category.")
    if price is None or price < 0.5:
        errors.append("Enter a valid price.")
    if stock < 0:
        errors.append("Stock can't be negative.")

    clean = {
        "name": name, "category": category, "price": price, "old_price": old_price,
        "stock": stock, "description": description, "images_json": json.dumps(images),
    }
    return errors, clean


@products_bp.post("")
@seller_required
def create_product():
    data = request.get_json(silent=True) or {}
    errors, c = _validate_payload(data)
    if errors:
        return jsonify({"error": " ".join(errors)}), 400

    seller_id = g.user["id"]
    if g.user["role"] == "admin" and data.get("asStore"):
        seller_id = None

    pid = execute(
        "INSERT INTO products (name, category, price, old_price, stock, description, images_json, seller_id) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (c["name"], c["category"], c["price"], c["old_price"], c["stock"], c["description"], c["images_json"], seller_id),
    )
    log_activity(g.user["email"], f"Product created: {c['name']}")
    return jsonify({"product": product_dict(get_product(pid))}), 201


def _can_edit(row):
    u = g.user
    return u["role"] == "admin" or row["seller_id"] == u["id"]


@products_bp.put("/<int:pid>")
@seller_required
def update_product(pid):
    row = get_product(pid)
    if not row:
        return jsonify({"error": "Not found"}), 404
    if not _can_edit(row):
        return jsonify({"error": "You can't edit this product."}), 403

    data = request.get_json(silent=True) or {}
    errors, c = _validate_payload(data)
    if errors:
        return jsonify({"error": " ".join(errors)}), 400

    hidden = row["hidden"]
    if g.user["role"] == "admin" and "hidden" in data:
        hidden = 1 if data.get("hidden") else 0

    execute(
        "UPDATE products SET name=?, category=?, price=?, old_price=?, stock=?, description=?, images_json=?, hidden=? "
        "WHERE id = ?",
        (c["name"], c["category"], c["price"], c["old_price"], c["stock"], c["description"], c["images_json"], hidden, pid),
    )
    log_activity(g.user["email"], f"Product updated: {c['name']}")
    return jsonify({"product": product_dict(get_product(pid))})


@products_bp.delete("/<int:pid>")
@seller_required
def delete_product(pid):
    row = get_product(pid)
    if not row:
        return jsonify({"error": "Not found"}), 404
    if not _can_edit(row):
        return jsonify({"error": "You can't delete this product."}), 403
    execute("DELETE FROM products WHERE id = ?", (pid,))
    log_activity(g.user["email"], f"Product deleted: {row['name']}")
    return jsonify({"ok": True})
