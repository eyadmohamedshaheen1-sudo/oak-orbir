# Oak & Orbit — full-stack edition

The original front-end-only demo (everything lived in the browser's
`localStorage`) now has a real **Flask + SQLite** backend. The frontend was
rewired to call a JSON API instead of reading/writing local storage.

## Run it

```bash
cd oak-orbit-backend
pip install -r requirements.txt      # Flask + Werkzeug only — no extra DB driver needed
python seed.py                       # creates instance/oakorbit.db and seeds starter data
python app.py                        # http://127.0.0.1:5000
```

Admin login after seeding: **admin@oakorbit.com / Admin@123** (change this
before showing the project to anyone else — see Security notes below).

Open `http://127.0.0.1:5000/` for the store, or `http://127.0.0.1:5000/admin.html`
for the admin console directly. Both pages talk to the same API and the same
database.

## What changed vs. the original

| Before | Now |
|---|---|
| Products hardcoded in `products.js` | `products` table, served via `/api/products` |
| Users/sessions in `localStorage` | `users` table + server-side session cookie, passwords hashed with `werkzeug.security` |
| Orders/cart totals computed and trusted client-side | Checkout re-prices everything from the database server-side; the client's numbers are never trusted |
| Reviews, wishlist, promo codes, settings, activity log all in `localStorage` | Each has its own table and REST endpoints under `/api/...` |
| Admin panel read/wrote `localStorage` directly | Admin panel calls `/api/admin/...`, gated by a real server-side role check |

## Project layout

```
app.py              Flask app factory, routing, security headers
config.py            App configuration
db.py                 sqlite3 connection + query helpers (parameterized only)
models.py            Row -> dict helpers, shared business logic
schema.sql            Table definitions
seed.py                Creates the DB and seeds the starter catalog + admin user
auth_utils.py       Session loading + role-gate decorators
routes/
  auth.py            register / login / logout / me / forgot / reset password
  products.py       public catalog + seller/admin product CRUD
  reviews.py         product reviews
  wishlist.py        saved items
  orders.py           checkout + order history
  seller.py            seller dashboard (products, sales, stats)
  admin.py             admin console (dashboard, orders, products, users,
                       sellers, reviews, promos, settings, activity log)
  misc.py               public settings + promo code lookup
static/
  index.html, admin.html, css/, js/     the frontend (same look, now calls the API)
```

## Why SQLite via the stdlib `sqlite3` module, not an ORM

There's no outbound internet access in the environment this was built in, so
`pip install` couldn't reach PyPI for SQLAlchemy. Python's built-in `sqlite3`
module needs nothing beyond Flask itself, which makes the project easier for
you to run too. All queries use `?` placeholders with values passed
separately (see the comment at the top of `db.py`) — that parameter binding
is what actually prevents SQL injection, regardless of whether an ORM sits on
top of it.

## Security notes (read this before you show this to anyone)

This is a learning project, not a production store. A few things to know:

- **Change the admin password** (`seed.py`, `ADMIN_PASSWORD`) and the Flask
  `SECRET_KEY` (`config.py`) before deploying anywhere reachable by others.
- **Password reset codes** are demo-only: `/api/auth/forgot` returns the code
  directly in the API response instead of emailing it, because this project
  has no mail server. Replace `_reset_codes` in `routes/auth.py` with a real
  mailer + short-lived token table for anything real.
- **Payments aren't real.** Checkout only validates the card number's length
  and format; no payment processor is involved.
- **CSRF**: because the frontend and API share an origin and the API only
  accepts `application/json` bodies (not HTML form posts), classic CSRF is
  largely mitigated, but a dedicated CSRF token is still what you'd want for
  a production deployment with cookie-based sessions.
- Run behind a real WSGI server (gunicorn/uwsgi) and HTTPS in anything beyond
  local development — `app.run(debug=True)` is dev-only and was intentionally
  left debug-off for anything other than local testing.

## What I didn't build in

You asked earlier about adding a deliberate SQL-injection and XSS
vulnerability so you could practice exploiting them. I didn't add those —
see my earlier messages for why, and for pointers to DVWA / OWASP WebGoat if
you want a safe, purpose-built place to practice that.
