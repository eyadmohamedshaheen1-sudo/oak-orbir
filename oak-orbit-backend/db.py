"""
Thin data-access layer over Python's built-in sqlite3 module.

Security note: every function here takes `params` as a separate tuple and
passes it to sqlite3's `?` placeholders. Values are NEVER glued into the SQL
string with f-strings/%/.format(). That parameter binding is what actually
prevents SQL injection -- the database driver sends the query text and the
values on separate channels, so a value like `' OR '1'='1` is just a literal
string to compare, never executable SQL. Keep that pattern everywhere this
file is extended.
"""
import os
import sqlite3
import time

from flask import g

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DB_PATH = os.path.join(BASE_DIR, "instance", "oakorbit.db")
SCHEMA_PATH = os.path.join(BASE_DIR, "schema.sql")


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def close_db(_exc=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        conn.executescript(f.read())
    conn.commit()
    conn.close()


def query_all(sql, params=()):
    return get_db().execute(sql, params).fetchall()


def query_one(sql, params=()):
    return get_db().execute(sql, params).fetchone()


def execute(sql, params=()):
    """INSERT/UPDATE/DELETE. Commits and returns the last inserted row id."""
    db = get_db()
    cur = db.execute(sql, params)
    db.commit()
    return cur.lastrowid


def now_ms():
    return int(time.time() * 1000)
