import os

from flask import Flask, send_from_directory, request, jsonify

from config import Config
from db import close_db, init_db
from auth_utils import load_current_user


def create_app():
    app = Flask(__name__, static_folder="static", static_url_path="")
    app.config.from_object(Config)

    os.makedirs(os.path.join(os.path.dirname(__file__), "instance"), exist_ok=True)
    app.teardown_appcontext(close_db)

    from routes.auth import auth_bp
    from routes.products import products_bp
    from routes.reviews import reviews_bp
    from routes.wishlist import wishlist_bp
    from routes.orders import orders_bp
    from routes.seller import seller_bp
    from routes.admin import admin_bp
    from routes.misc import misc_bp

    for bp in (auth_bp, products_bp, reviews_bp, wishlist_bp, orders_bp, seller_bp, admin_bp, misc_bp):
        app.register_blueprint(bp)

    @app.before_request
    def _attach_user():
        load_current_user()

    # Security headers on every response: a defense-in-depth layer against
    # XSS and content-sniffing attacks, on top of output escaping on the
    # frontend and the fact that the API only ever returns JSON (never HTML
    # built from user input).
    @app.after_request
    def _security_headers(resp):
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["X-Frame-Options"] = "DENY"
        resp.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src https://fonts.gstatic.com; "
            "img-src 'self' data: blob:; "
            "script-src 'self'"
        )
        return resp

    @app.route("/")
    def index():
        return send_from_directory(app.static_folder, "index.html")

    @app.route("/admin.html")
    def admin_page():
        return send_from_directory(app.static_folder, "admin.html")

    @app.errorhandler(404)
    def not_found(e):
        if request.path.startswith("/api/"):
            return jsonify({"error": "Not found"}), 404
        return send_from_directory(app.static_folder, "index.html")

    return app


app = create_app()

if __name__ == "__main__":
    init_db()
    app.run(debug=True, port=5000)
