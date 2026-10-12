import datetime

from flask import Blueprint, request, jsonify, g
from werkzeug.security import generate_password_hash

from db import query_all, query_one, execute
from models import (
    product_dict, user_admin, order_dict, review_dict, promo_dict,
    settings_dict, get_settings, log_activity, log_dict, get_product,
)
from auth_utils import admin_required

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")


# ---------- dashboard ----------
@admin_bp.get("/dashboard")
@admin_required
def dashboard():
    orders = query_all("SELECT * FROM orders")
    live = [o for o in orders if o["status"] != "Cancelled"]
    revenue = sum(o["total"] for o in live)
    user_count = query_one("SELECT COUNT(*) AS n FROM users")["n"]
    product_count = query_one("SELECT COUNT(*) AS n FROM products")["n"]

    status_counts = {}
    for o in orders:
        status_counts[o["status"]] = status_counts.get(o["status"], 0) + 1

    now = datetime.datetime.now()
    series = []
    for i in range(13, -1, -1):
        day = (now - datetime.timedelta(days=i)).date()
        day_total = sum(
            o["total"] for o in live
            if datetime.datetime.fromtimestamp(o["created_at"] / 1000).date() == day
        )
        series.append({"label": day.strftime("%b %d"), "value": round(day_total, 2)})

    recent = sorted(orders, key=lambda o: o["created_at"], reverse=True)[:6]
    logs = query_all("SELECT * FROM activity_log ORDER BY ts DESC LIMIT 8")

    return jsonify({
        "kpis": {
            "revenue": round(revenue, 2),
            "orders": len(orders),
            "pendingOrders": status_counts.get("Processing", 0),
            "avgOrderValue": round(revenue / len(live), 2) if live else 0,
            "users": user_count,
            "products": product_count,
        },
        "statusCounts": status_counts,
        "revenueSeries": series,
        "recentOrders": [order_dict(o) for o in recent],
        "recentActivity": [log_dict(l) for l in logs],
    })


# ---------- orders ----------
@admin_bp.get("/orders")
@admin_required
def list_orders():
    q = (request.args.get("q") or "").lower()
    status = request.args.get("status") or ""
    rows = query_all("SELECT * FROM orders ORDER BY created_at DESC")
    out = []
    for o in rows:
        if status and o["status"] != status:
            continue
        buyer = query_one("SELECT * FROM users WHERE id = ?", (o["user_id"],))
        buyer_name = buyer["name"] if buyer else ""
        buyer_email = buyer["email"] if buyer else ""
        hay = f"{o['order_number']} {buyer_email} {buyer_name}".lower()
        if q and q not in hay:
            continue
        d = order_dict(o)
        d["buyerName"] = buyer_name
        out.append(d)
    return jsonify({"orders": out})


@admin_bp.put("/orders/<order_number>")
@admin_required
def update_order(order_number):
    order = query_one("SELECT * FROM orders WHERE order_number = ?", (order_number,))
    if not order:
        return jsonify({"error": "Not found"}), 404
    data = request.get_json(silent=True) or {}
    new_status = data.get("status")
    if new_status not in ("Processing", "Shipped", "Delivered", "Cancelled"):
        return jsonify({"error": "Invalid status."}), 400
    if new_status != order["status"]:
        log_activity(g.user["email"], f"Order {order['order_number']} status: {order['status']} -> {new_status}")
        execute("UPDATE orders SET status = ? WHERE id = ?", (new_status, order["id"]))
    order = query_one("SELECT * FROM orders WHERE id = ?", (order["id"],))
    return jsonify({"order": order_dict(order)})


# ---------- products ----------
@admin_bp.get("/products")
@admin_required
def list_products():
    q = (request.args.get("q") or "").lower()
    category = request.args.get("category") or ""
    seller = request.args.get("seller") or ""
    rows = query_all("SELECT * FROM products")
    out = []
    for p in rows:
        if q and q not in (p["name"] + " " + p["category"]).lower():
            continue
        if category and p["category"] != category:
            continue
        seller_key = "store"
        if p["seller_id"]:
            srow = query_one("SELECT email FROM users WHERE id = ?", (p["seller_id"],))
            seller_key = srow["email"] if srow else "store"
        if seller and seller_key != seller:
            continue
        out.append(product_dict(p))
    return jsonify({"products": out})


@admin_bp.put("/products/<int:pid>/hide")
@admin_required
def toggle_hide(pid):
    row = get_product(pid)
    if not row:
        return jsonify({"error": "Not found"}), 404
    data = request.get_json(silent=True) or {}
    new_hidden = 1 if data.get("hidden", not row["hidden"]) else 0
    execute("UPDATE products SET hidden = ? WHERE id = ?", (new_hidden, pid))
    log_activity(g.user["email"], f"Product {'hidden' if new_hidden else 'unhidden'}: {row['name']}")
    return jsonify({"product": product_dict(get_product(pid))})


@admin_bp.delete("/products/<int:pid>")
@admin_required
def delete_product(pid):
    row = get_product(pid)
    if not row:
        return jsonify({"error": "Not found"}), 404
    execute("DELETE FROM products WHERE id = ?", (pid,))
    log_activity(g.user["email"], f"Product deleted by admin: {row['name']}")
    return jsonify({"ok": True})


# ---------- users ----------
@admin_bp.get("/users")
@admin_required
def list_users():
    q = (request.args.get("q") or "").lower()
    role = request.args.get("role") or ""
    rows = query_all("SELECT * FROM users ORDER BY created_at DESC")
    out = []
    for u in rows:
        if q and q not in (u["name"] + " " + u["email"]).lower():
            continue
        if role and u["role"] != role:
            continue
        out.append(user_admin(u))
    return jsonify({"users": out})


@admin_bp.put("/users/<int:uid>")
@admin_required
def update_user(uid):
    u = query_one("SELECT * FROM users WHERE id = ?", (uid,))
    if not u:
        return jsonify({"error": "Not found"}), 404
    data = request.get_json(silent=True) or {}

    if "status" in data and data["status"] in ("active", "suspended"):
        if u["id"] == g.user["id"] and data["status"] == "suspended":
            return jsonify({"error": "You can't suspend your own account."}), 400
        execute("UPDATE users SET status = ? WHERE id = ?", (data["status"], uid))
        log_activity(g.user["email"], f"User {u['email']} set to {data['status']}")

    if "role" in data and data["role"] in ("buyer", "seller", "admin"):
        if u["id"] == g.user["id"] and data["role"] != "admin":
            return jsonify({"error": "You can't remove your own admin role."}), 400
        execute("UPDATE users SET role = ? WHERE id = ?", (data["role"], uid))
        log_activity(g.user["email"], f"User {u['email']} role set to {data['role']}")

    if "password" in data and data["password"]:
        if len(data["password"]) < 8:
            return jsonify({"error": "Password must be at least 8 characters."}), 400
        execute("UPDATE users SET password_hash = ? WHERE id = ?", (generate_password_hash(data["password"]), uid))
        log_activity(g.user["email"], f"Password reset by admin for {u['email']}")

    return jsonify({"user": user_admin(query_one("SELECT * FROM users WHERE id = ?", (uid,)))})


# ---------- sellers ----------
@admin_bp.get("/sellers")
@admin_required
def list_sellers():
    sellers = query_all("SELECT * FROM users WHERE role = 'seller'")
    out = []
    for s in sellers:
        products = query_all("SELECT * FROM products WHERE seller_id = ?", (s["id"],))
        lines = query_all("SELECT * FROM order_lines WHERE seller_email = ?", (s["email"],))
        units = sum(l["qty"] for l in lines)
        revenue = sum(l["price"] * l["qty"] for l in lines)
        out.append({
            **user_admin(s),
            "productCount": len(products),
            "unitsSold": units,
            "revenue": round(revenue, 2),
        })
    return jsonify({"sellers": out})


# ---------- reviews ----------
@admin_bp.get("/reviews")
@admin_required
def list_reviews():
    rows = query_all("SELECT * FROM reviews ORDER BY created_at DESC")
    out = []
    for r in rows:
        d = review_dict(r)
        prod = get_product(r["product_id"])
        d["productName"] = prod["name"] if prod else ""
        out.append(d)
    return jsonify({"reviews": out})


@admin_bp.delete("/reviews/<int:rid>")
@admin_required
def delete_review(rid):
    row = query_one("SELECT * FROM reviews WHERE id = ?", (rid,))
    if not row:
        return jsonify({"error": "Not found"}), 404
    execute("DELETE FROM reviews WHERE id = ?", (rid,))
    log_activity(g.user["email"], f"Review deleted by admin (#{rid})")
    return jsonify({"ok": True})


# ---------- promos ----------
@admin_bp.get("/promos")
@admin_required
def list_promos():
    rows = query_all("SELECT * FROM promo_codes")
    return jsonify({"promos": [promo_dict(p) for p in rows]})


@admin_bp.post("/promos")
@admin_required
def create_promo():
    data = request.get_json(silent=True) or {}
    code = (data.get("code") or "").strip().upper()
    try:
        pct = int(data.get("pct"))
    except (TypeError, ValueError):
        pct = None
    if len(code) < 3:
        return jsonify({"error": "Enter a promo code (min 3 characters)."}), 400
    if pct is None or pct < 1 or pct > 90:
        return jsonify({"error": "Enter a discount percent between 1 and 90."}), 400
    if query_one("SELECT 1 FROM promo_codes WHERE code = ?", (code,)):
        return jsonify({"error": "That code already exists."}), 409

    pid = execute("INSERT INTO promo_codes (code, pct, active) VALUES (?, ?, 1)", (code, pct))
    log_activity(g.user["email"], f"Promo created: {code} ({pct}%)")
    return jsonify({"promo": promo_dict(query_one("SELECT * FROM promo_codes WHERE id = ?", (pid,)))}), 201


@admin_bp.put("/promos/<int:promo_id>")
@admin_required
def update_promo(promo_id):
    promo = query_one("SELECT * FROM promo_codes WHERE id = ?", (promo_id,))
    if not promo:
        return jsonify({"error": "Not found"}), 404
    data = request.get_json(silent=True) or {}
    active = 1 if data.get("active", promo["active"]) else 0
    execute("UPDATE promo_codes SET active = ? WHERE id = ?", (active, promo_id))
    log_activity(g.user["email"], f"Promo {promo['code']} {'enabled' if active else 'disabled'}")
    return jsonify({"promo": promo_dict(query_one("SELECT * FROM promo_codes WHERE id = ?", (promo_id,)))})


@admin_bp.delete("/promos/<int:promo_id>")
@admin_required
def delete_promo(promo_id):
    promo = query_one("SELECT * FROM promo_codes WHERE id = ?", (promo_id,))
    if not promo:
        return jsonify({"error": "Not found"}), 404
    execute("DELETE FROM promo_codes WHERE id = ?", (promo_id,))
    log_activity(g.user["email"], f"Promo deleted: {promo['code']}")
    return jsonify({"ok": True})


# ---------- settings ----------
@admin_bp.put("/settings")
@admin_required
def update_settings():
    s = get_settings()
    data = request.get_json(silent=True) or {}
    ship = s["ship"]; express = s["express"]; free_over = s["free_over"]; commission = s["commission"]
    ann = s["announcement"]; email = s["support_email"]

    for field, var in (("ship", "ship"), ("express", "express"), ("free", "free_over"), ("commission", "commission")):
        if field in data:
            try:
                val = float(data[field])
                if var == "ship":
                    ship = val
                elif var == "express":
                    express = val
                elif var == "free_over":
                    free_over = val
                elif var == "commission":
                    commission = val
            except (TypeError, ValueError):
                pass
    if "ann" in data:
        ann = str(data["ann"])[:300]
    if "email" in data:
        email = str(data["email"])[:190]

    execute(
        "UPDATE settings SET ship=?, express=?, free_over=?, commission=?, announcement=?, support_email=? WHERE id = 1",
        (ship, express, free_over, commission, ann, email),
    )
    log_activity(g.user["email"], "Settings updated")
    return jsonify({"settings": settings_dict(get_settings())})


# ---------- activity log ----------
@admin_bp.get("/log")
@admin_required
def activity_log():
    rows = query_all("SELECT * FROM activity_log ORDER BY ts DESC LIMIT 300")
    return jsonify({"log": [log_dict(r) for r in rows]})
