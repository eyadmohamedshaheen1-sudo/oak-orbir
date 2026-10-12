import json
import random
import string

from db import query_all, query_one, execute, now_ms

CATEGORIES = ["Tech", "Home", "Style", "Beauty", "Sports", "Kitchen"]


def gen_order_id():
    return "OO-" + "".join(random.choices(string.digits, k=5))


def _loads(txt, default):
    try:
        return json.loads(txt) if txt else default
    except (TypeError, ValueError):
        return default


# ---------------- users ----------------

def get_user_by_id(uid):
    return query_one("SELECT * FROM users WHERE id = ?", (uid,))


def get_user_by_email(email):
    return query_one("SELECT * FROM users WHERE email = ?", (email,))


def create_user(name, email, password_hash, role, shop):
    return execute(
        "INSERT INTO users (name, email, password_hash, role, shop, status, created_at) "
        "VALUES (?, ?, ?, ?, ?, 'active', ?)",
        (name, email, password_hash, role, shop, now_ms()),
    )


def user_public(row):
    if not row:
        return None
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "role": row["role"],
        "shop": row["shop"] or "",
    }


def user_admin(row):
    d = user_public(row)
    d["status"] = row["status"]
    d["created"] = row["created_at"]
    return d


# ---------------- products ----------------

def rating_for_product(pid, base_rating):
    stats = query_one(
        "SELECT COUNT(*) AS n, AVG(stars) AS avg FROM reviews WHERE product_id = ?",
        (pid,),
    )
    if stats and stats["n"]:
        return round(stats["avg"], 1), stats["n"]
    return (base_rating or 0.0), 0


def seller_label(seller_row):
    if not seller_row:
        return "Oak&Orbit"
    return seller_row["shop"] or seller_row["name"]


def product_dict(row):
    seller = get_user_by_id(row["seller_id"]) if row["seller_id"] else None
    avg, count = rating_for_product(row["id"], row["base_rating"])
    return {
        "id": row["id"],
        "n": row["name"],
        "c": row["category"],
        "p": row["price"],
        "o": row["old_price"],
        "stock": row["stock"],
        "d": row["description"],
        "e": row["emoji"],
        "bg": row["bg"],
        "imgs": _loads(row["images_json"], []),
        "hidden": bool(row["hidden"]),
        "seller": seller["email"] if seller else None,
        "shop": seller_label(seller),
        "rating": avg,
        "reviewCount": count,
    }


def get_product(pid):
    return query_one("SELECT * FROM products WHERE id = ?", (pid,))


# ---------------- reviews ----------------

def review_dict(row):
    author = get_user_by_id(row["user_id"])
    return {
        "id": row["id"],
        "productId": row["product_id"],
        "userEmail": author["email"] if author else None,
        "userName": author["name"] if author else "",
        "stars": row["stars"],
        "text": row["text"],
        "imgs": _loads(row["images_json"], []),
        "ts": row["created_at"],
    }


# ---------------- orders ----------------

def order_dict(row):
    lines = query_all("SELECT * FROM order_lines WHERE order_id = ?", (row["id"],))
    buyer = get_user_by_id(row["user_id"])
    return {
        "id": row["order_number"],
        "email": buyer["email"] if buyer else None,
        "ts": row["created_at"],
        "status": row["status"],
        "total": row["total"],
        "subtotal": row["subtotal"],
        "discount": row["discount"],
        "shipping": row["shipping"],
        "promo": row["promo_code"],
        "address": {
            "name": row["full_name"],
            "address": row["address"],
            "city": row["city"],
            "zip": row["postal_code"],
            "delivery": row["delivery"],
        },
        "lines": [order_line_dict(l) for l in lines],
    }


def order_line_dict(row):
    return {
        "id": row["product_id"],
        "n": row["product_name"],
        "q": row["qty"],
        "p": row["price"],
        "seller": row["seller_email"] or "store",
    }


# ---------------- promos / settings ----------------

def promo_dict(row):
    return {"id": row["id"], "code": row["code"], "pct": row["pct"], "active": bool(row["active"])}


def get_settings():
    row = query_one("SELECT * FROM settings WHERE id = 1")
    if not row:
        execute(
            "INSERT INTO settings (id, ship, express, free_over, commission, announcement, support_email) "
            "VALUES (1, 5, 15, 50, 10, "
            "'Free shipping over $50. Use code WELCOME10 for 10% off your order.', 'support@oakorbit.com')"
        )
        row = query_one("SELECT * FROM settings WHERE id = 1")
    return row


def settings_dict(row):
    return {
        "ship": row["ship"],
        "express": row["express"],
        "free": row["free_over"],
        "commission": row["commission"],
        "ann": row["announcement"],
        "email": row["support_email"],
    }


# ---------------- activity log ----------------

def log_activity(actor_email, message):
    execute(
        "INSERT INTO activity_log (ts, actor_email, message) VALUES (?, ?, ?)",
        (now_ms(), actor_email or "system", message),
    )
    count = query_one("SELECT COUNT(*) AS n FROM activity_log")["n"]
    if count > 500:
        execute(
            "DELETE FROM activity_log WHERE id IN ("
            "SELECT id FROM activity_log ORDER BY ts ASC LIMIT ?)",
            (count - 500,),
        )


def log_dict(row):
    return {"t": row["ts"], "w": row["actor_email"], "m": row["message"]}
