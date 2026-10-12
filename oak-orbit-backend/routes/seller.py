from flask import Blueprint, jsonify, g

from db import query_all
from models import product_dict
from auth_utils import seller_required

seller_bp = Blueprint("seller", __name__, url_prefix="/api/seller")


@seller_bp.get("/products")
@seller_required
def my_products():
    rows = query_all("SELECT * FROM products WHERE seller_id = ?", (g.user["id"],))
    return jsonify({"products": [product_dict(r) for r in rows]})


@seller_bp.get("/sales")
@seller_required
def my_sales():
    rows = query_all(
        "SELECT ol.*, o.order_number, o.created_at AS order_ts, o.status AS order_status "
        "FROM order_lines ol JOIN orders o ON ol.order_id = o.id "
        "WHERE ol.seller_email = ? ORDER BY o.created_at DESC",
        (g.user["email"],),
    )
    sales = [
        {
            "id": r["product_id"],
            "n": r["product_name"],
            "q": r["qty"],
            "p": r["price"],
            "orderId": r["order_number"],
            "ts": r["order_ts"],
            "status": r["order_status"],
        }
        for r in rows
    ]
    return jsonify({"sales": sales})


@seller_bp.get("/stats")
@seller_required
def my_stats():
    products = query_all("SELECT * FROM products WHERE seller_id = ?", (g.user["id"],))
    lines = query_all("SELECT * FROM order_lines WHERE seller_email = ?", (g.user["email"],))
    revenue = sum(l["price"] * l["qty"] for l in lines)
    units = sum(l["qty"] for l in lines)
    return jsonify({
        "productCount": len(products),
        "revenue": round(revenue, 2),
        "unitsSold": units,
        "lowStock": sum(1 for p in products if p["stock"] <= 3),
    })
