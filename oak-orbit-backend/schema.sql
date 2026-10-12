PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'buyer',
    shop TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price REAL NOT NULL,
    old_price REAL,
    stock INTEGER NOT NULL DEFAULT 10,
    description TEXT DEFAULT '',
    emoji TEXT DEFAULT '',
    bg TEXT DEFAULT '',
    images_json TEXT DEFAULT '[]',
    hidden INTEGER NOT NULL DEFAULT 0,
    seller_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    base_rating REAL
);

CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stars INTEGER NOT NULL,
    text TEXT DEFAULT '',
    images_json TEXT DEFAULT '[]',
    created_at INTEGER NOT NULL,
    UNIQUE(product_id, user_id)
);

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name TEXT,
    address TEXT,
    city TEXT,
    postal_code TEXT,
    delivery TEXT DEFAULT 's',
    subtotal REAL DEFAULT 0,
    discount REAL DEFAULT 0,
    shipping REAL DEFAULT 0,
    total REAL DEFAULT 0,
    promo_code TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Processing',
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS order_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT,
    qty INTEGER NOT NULL DEFAULT 1,
    price REAL NOT NULL DEFAULT 0,
    seller_email TEXT DEFAULT 'store'
);

CREATE TABLE IF NOT EXISTS wishlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE(user_id, product_id)
);

CREATE TABLE IF NOT EXISTS promo_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    pct INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    ship REAL DEFAULT 5,
    express REAL DEFAULT 15,
    free_over REAL DEFAULT 50,
    commission REAL DEFAULT 10,
    announcement TEXT DEFAULT 'Free shipping over $50. Use code WELCOME10 for 10% off your order.',
    support_email TEXT DEFAULT 'support@oakorbit.com'
);

CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    actor_email TEXT DEFAULT 'system',
    message TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_seller ON products(seller_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_order_lines_order ON order_lines(order_id);
CREATE INDEX IF NOT EXISTS idx_order_lines_seller ON order_lines(seller_email);
