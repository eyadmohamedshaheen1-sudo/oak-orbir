from flask import Blueprint, request, jsonify, g

from db import query_all, query_one, execute, now_ms
from models import get_product, order_dict, gen_order_id, get_settings, settings_dict, log_activity
from auth_utils import login_required

orders_bp = Blueprint("orders", __name__, url_prefix="/api/orders")


@orders_bp.post("")
@login_required
def checkout():
    data = request.get_json(silent=True) or {}
    cart = data.get("cart") or []  # [{id, qty}]
    full_name = (data.get("name") or "").strip()
    address = (data.get("address") or "").strip()
    city = (data.get("city") or "").strip()
    postal = (data.get("zip") or "").strip()
    delivery = data.get("delivery") if data.get("delivery") in ("s", "x") else "s"
    card = (data.get("card") or "").replace(" ", "")
    expiry = data.get("expiry") or ""
    cvc = data.get("cvc") or ""
    promo_code = (data.get("promo") or "").strip().upper()

    if not cart:
        return jsonify({"error": "Your cart is empty"}), 400
    if len(full_name) < 2 or len(address) < 5 or not city or len(postal) < 3:
        return jsonify({"error": "Complete your shipping details."}), 400
    if len(card) < 13 or not card.isdigit():
        return jsonify({"error": "Enter a valid card number."}), 400
    if len(expiry) != 5 or expiry[2] != "/" or len(cvc) < 3:
        return jsonify({"error": "Check the expiry (MM/YY) and CVC."}), 400

    # Re-price everything from the database -- never trust client-sent prices.
    lines = []
    subtotal = 0.0
    for item in cart:
        try:
            pid = int(item.get("id"))
            qty = max(1, min(10, int(item.get("qty", 1))))
        except (TypeError, ValueError, AttributeError):
            continue
        product = get_product(pid)
        if not product or product["hidden"]:
            continue
        if product["stock"] < qty:
            return jsonify({"error": f'Not enough stock for "{product["name"]}".'}), 400
        subtotal += product["price"] * qty
        lines.append((product, qty))

    if not lines:
        return jsonify({"error": "Your cart is empty"}), 400

    discount = 0.0
    applied_code = ""
    if promo_code:
        promo = query_one("SELECT * FROM promo_codes WHERE code = ? AND active = 1", (promo_code,))
        if promo:
            discount = subtotal * promo["pct"] / 100
            applied_code = promo["code"]

    s = settings_dict(get_settings())
    shipping = s["express"] if delivery == "x" else (0 if subtotal >= s["free"] else s["ship"])
    total = round(subtotal - discount + shipping, 2)

    order_number = gen_order_id()
    order_id = execute(
        "INSERT INTO orders (order_number, user_id, full_name, address, city, postal_code, delivery, "
        "subtotal, discount, shipping, total, promo_code, status, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Processing', ?)",
        (order_number, g.user["id"], full_name, address, city, postal, delivery,
         round(subtotal, 2), round(discount, 2), round(shipping, 2), total, applied_code, now_ms()),
    )

    for product, qty in lines:
        execute("UPDATE products SET stock = stock - ? WHERE id = ?", (qty, product["id"]))
        seller_email = "store"
        if product["seller_id"]:
            seller_row = query_one("SELECT email FROM users WHERE id = ?", (product["seller_id"],))
            seller_email = seller_row["email"] if seller_row else "store"
        execute(
            "INSERT INTO order_lines (order_id, product_id, product_name, qty, price, seller_email) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (order_id, product["id"], product["name"], qty, product["price"], seller_email),
        )

    log_activity(g.user["email"], f"Order placed: {order_number} ({total:.2f})")
    order_row = query_one("SELECT * FROM orders WHERE id = ?", (order_id,))
    return jsonify({"order": order_dict(order_row)}), 201


@orders_bp.get("")
@login_required
def my_orders():
    rows = query_all("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC", (g.user["id"],))
    return jsonify({"orders": [order_dict(o) for o in rows]})


@orders_bp.get("/<order_number>")
@login_required
def get_order(order_number):
    row = query_one("SELECT * FROM orders WHERE order_number = ?", (order_number,))
    if not row:
        return jsonify({"error": "Not found"}), 404
    if row["user_id"] != g.user["id"] and g.user["role"] != "admin":
        return jsonify({"error": "Not found"}), 404
    return jsonify({"order": order_dict(row)})
