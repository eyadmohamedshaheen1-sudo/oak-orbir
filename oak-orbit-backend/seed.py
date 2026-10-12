"""Run once to create the SQLite schema and seed starter data:

    python seed.py

Safe to re-run: it skips anything that already exists.
"""
import os
import sqlite3
import time

from werkzeug.security import generate_password_hash

from db import DB_PATH, init_db

CATALOG = [
    dict(name='Studio Headphones', category='Tech', price=129, emoji='🎧', bg='#f6d98a', description='Wireless, 40h battery', base_rating=4.5),
    dict(name='Trail Runner Shoes', category='Style', price=89, emoji='👟', bg='#e6d3c1', description='Light and grippy', base_rating=4.4),
    dict(name='Ceramic Plant Pot', category='Home', price=24, emoji='🪴', bg='#bfd8c6', description='Hand-glazed, 20 cm', base_rating=4.3),
    dict(name='Pour-Over Coffee Set', category='Home', price=58, emoji='☕', bg='#d9cdbd', description='Dripper, carafe and filters', base_rating=4.6),
    dict(name='Smart Watch', category='Tech', price=179, emoji='⌚', bg='#c7d5e8', description='Heart rate and GPS', base_rating=4.5),
    dict(name='Canvas Backpack', category='Style', price=74, emoji='🎒', bg='#f2c6b4', description='Fits a 15" laptop', base_rating=4.4),
    dict(name='Desk Lamp', category='Home', price=42, emoji='💡', bg='#f6e7a8', description='Dimmable warm light', base_rating=4.2),
    dict(name='Sunglasses', category='Style', price=49, emoji='🕶️', bg='#cfc3e3', description='Polarized, UV400', base_rating=4.3),
    dict(name='Bluetooth Speaker', category='Tech', price=64, emoji='🔊', bg='#bcd3e6', description='Waterproof, 12h playtime', base_rating=4.6),
    dict(name='Soy Candle', category='Home', price=18, emoji='🕯️', bg='#f3dcc4', description='Cedar and amber, 40h burn', base_rating=4.8),
    dict(name='Leather Wallet', category='Style', price=39, emoji='👛', bg='#d8c3b0', description='Slim, holds 8 cards', base_rating=4.4),
    dict(name='Mechanical Keyboard', category='Tech', price=99, emoji='⌨️', bg='#d3d9c4', description='Hot-swappable switches', base_rating=4.9),
    dict(name='Power Bank 20,000 mAh', category='Tech', price=29, emoji='🔋', bg='', description='Fast charging, two USB ports', base_rating=4.5),
    dict(name='Gaming Mouse', category='Tech', price=45, emoji='🖱️', bg='', description='Lightweight with 12,000 DPI', base_rating=4.6),
    dict(name='Adjustable Tablet Stand', category='Tech', price=22, emoji='📱', bg='', description='Aluminium, folds flat', base_rating=4.3),
    dict(name='Action Camera 4K', category='Tech', price=149, emoji='📷', bg='', description='Waterproof to 30 m', base_rating=4.7),
    dict(name='Knit Throw Blanket', category='Home', price=48, emoji='🛋️', bg='', description='Soft cotton, 130 x 170 cm', base_rating=4.8),
    dict(name='Minimal Wall Clock', category='Home', price=33, emoji='🕰️', bg='', description='Silent movement, 30 cm', base_rating=4.4),
    dict(name='Vanity Mirror', category='Home', price=36, emoji='🪞', bg='', description='LED ring light, touch dimmer', base_rating=4.5),
    dict(name='Denim Jacket', category='Style', price=95, emoji='🧥', bg='', description='Washed cotton, relaxed fit', base_rating=4.6),
    dict(name='Wool Scarf', category='Style', price=28, emoji='🧣', bg='', description='Warm, soft and lightweight', base_rating=4.7),
    dict(name='Everyday Cap', category='Style', price=21, emoji='🧢', bg='', description='Adjustable strap, breathable', base_rating=4.3),
    dict(name='Silk Tie', category='Style', price=26, emoji='👔', bg='', description='Hand-finished, 7 cm width', base_rating=4.4),
    dict(name='Hydrating Serum', category='Beauty', price=32, emoji='🧴', bg='', description='Hyaluronic acid, 30 ml', base_rating=4.7),
    dict(name='Matte Lipstick', category='Beauty', price=19, emoji='💄', bg='', description='Long-wear, 12 shades', base_rating=4.5),
    dict(name='Floral Perfume', category='Beauty', price=78, emoji='🌸', bg='', description='Eau de parfum, 50 ml', base_rating=4.8),
    dict(name='Ionic Hair Dryer', category='Beauty', price=55, emoji='💨', bg='', description='1800W with 3 heat settings', base_rating=4.4),
    dict(name='Non-Slip Yoga Mat', category='Sports', price=35, emoji='🧘', bg='', description='6 mm cushioning, carry strap', base_rating=4.6),
    dict(name='Adjustable Dumbbell Set', category='Sports', price=69, emoji='🏋️', bg='', description='2 to 12 kg per hand', base_rating=4.7),
    dict(name='Match Football', category='Sports', price=25, emoji='⚽', bg='', description='Size 5, durable stitching', base_rating=4.5),
    dict(name='Insulated Water Bottle', category='Sports', price=17, emoji='🥤', bg='', description='Keeps drinks cold for 24h', base_rating=4.8),
    dict(name='Cycling Helmet', category='Sports', price=59, emoji='🚴', bg='', description='Lightweight with rear light', base_rating=4.6),
    dict(name='Chef Knife', category='Kitchen', price=54, emoji='🔪', bg='', description='Stainless steel, 20 cm blade', base_rating=4.9),
    dict(name='Countertop Blender', category='Kitchen', price=79, emoji='🍹', bg='', description='1000W with two jars', base_rating=4.5),
    dict(name='Air Fryer 5L', category='Kitchen', price=119, emoji='🍟', bg='', description='Digital presets, easy clean', base_rating=4.7),
    dict(name='Cast Iron Pan', category='Kitchen', price=44, emoji='🍳', bg='', description='Pre-seasoned, 26 cm', base_rating=4.6),
    dict(name='Glass Tea Kettle', category='Kitchen', price=38, emoji='🫖', bg='', description='1.7 L with auto shut-off', base_rating=4.4),
]

ADMIN_EMAIL = "admin@oakorbit.com"
ADMIN_PASSWORD = "Admin@123"  # demo credentials -- change this before any real deployment


def run():
    init_db()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute("SELECT 1 FROM settings WHERE id = 1")
    if not cur.fetchone():
        cur.execute(
            "INSERT INTO settings (id, ship, express, free_over, commission, announcement, support_email) "
            "VALUES (1, 5, 15, 50, 10, "
            "'Free shipping over $50. Use code WELCOME10 for 10% off your order.', 'support@oakorbit.com')"
        )

    cur.execute("SELECT 1 FROM promo_codes WHERE code = 'WELCOME10'")
    if not cur.fetchone():
        cur.execute("INSERT INTO promo_codes (code, pct, active) VALUES ('WELCOME10', 10, 1)")

    cur.execute("SELECT 1 FROM users WHERE email = ?", (ADMIN_EMAIL,))
    if not cur.fetchone():
        cur.execute(
            "INSERT INTO users (name, email, password_hash, role, shop, status, created_at) "
            "VALUES (?, ?, ?, 'admin', '', 'active', ?)",
            ("Store Admin", ADMIN_EMAIL, generate_password_hash(ADMIN_PASSWORD), int(time.time() * 1000)),
        )

    cur.execute("SELECT COUNT(*) AS n FROM products")
    if cur.fetchone()["n"] == 0:
        for item in CATALOG:
            cur.execute(
                "INSERT INTO products (name, category, price, stock, description, emoji, bg, base_rating, images_json, hidden) "
                "VALUES (?, ?, ?, 25, ?, ?, ?, ?, '[]', 0)",
                (item["name"], item["category"], item["price"], item["description"],
                 item["emoji"], item.get("bg", ""), item["base_rating"]),
            )

    conn.commit()
    conn.close()
    print(f"Seed complete. Admin login: {ADMIN_EMAIL} / {ADMIN_PASSWORD}")


if __name__ == "__main__":
    run()
