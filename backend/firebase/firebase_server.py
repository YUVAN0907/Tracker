import os
import sys
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv

# Ensure we connect to Data Connect
import dataconnect_config

load_dotenv()

# Use Google Cloud Run PORT environment variable, fallback to 3002 for local dev
PORT = int(os.environ.get('PORT', 3002))

# ── CORS origins ──────────────────────────────────────────────────────────────
# Set CORS_ORIGINS in .env for production (comma-separated list of allowed origins).
# For local dev, falls back to the Vite dev server.
_cors_env = os.environ.get('CORS_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000')
_ALLOWED_ORIGINS = [o.strip() for o in _cors_env.split(',') if o.strip()]

# --------------------------------------------------
# FLASK APP
# --------------------------------------------------
app = Flask(__name__)

# Production-ready CORS: specific origins only (not wildcard).
# Webhook endpoint is excluded from CORS — it receives only Meta server traffic.
CORS(app,
     resources={r"/api/*": {
         "origins": _ALLOWED_ORIGINS,
         "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
         "allow_headers": ["Content-Type", "Authorization"],
         "supports_credentials": False
     }}
)

# --------------------------------------------------
# IMPORT ROUTE MODULES
# --------------------------------------------------
from routes_auth import auth_bp
from routes_dashboard import dashboard_bp
from routes_products import products_bp
from routes_po import po_bp
from routes_purchases import purchases_bp
from routes_stock_ops import stock_ops_bp
from routes_warehouse import warehouse_bp
from routes_batch_creation import batch_creation_bp
from routes_batch_query_normalized import batch_assignment_query_bp
from routes_stocks_batch import stocks_batch_bp
from routes_stock_batch_update import stock_batch_update_bp
from routes_bills import bills_bp
from routes_qr import qr_bp
from routes_update_machine_location import machine_location_bp
from routes_vendors import vendors_bp
from routes_whatsapp import whatsapp_bp
from routes_machine_ops import machine_ops_bp

# --------------------------------------------------
# REGISTER BLUEPRINTS
# --------------------------------------------------
app.register_blueprint(auth_bp)
app.register_blueprint(dashboard_bp)
app.register_blueprint(products_bp)
app.register_blueprint(po_bp)
app.register_blueprint(purchases_bp)
app.register_blueprint(stock_ops_bp)
app.register_blueprint(warehouse_bp)
app.register_blueprint(batch_creation_bp)
app.register_blueprint(batch_assignment_query_bp)
app.register_blueprint(stocks_batch_bp)
app.register_blueprint(stock_batch_update_bp)
app.register_blueprint(bills_bp)
app.register_blueprint(qr_bp)
app.register_blueprint(machine_location_bp)
app.register_blueprint(vendors_bp)
app.register_blueprint(whatsapp_bp)
app.register_blueprint(machine_ops_bp)

# Health Check
@app.route('/api/health')
def health():
    return jsonify({
        "status": "ok", 
        "database": "Firebase Data Connect (PostgreSQL)", 
        "port": PORT
    })

# ── Minimal safe request logger ──────────────────────────────────────────────
# SECURITY: Only logs method + path. Never logs headers, bodies, or query params
# to prevent leaking WhatsApp message content, phone numbers, or auth tokens.
@app.before_request
def log_request():
    # Skip noisy health-check logs
    if request.path != '/api/health':
        print(f"[FLASK] {request.method} {request.path}", file=sys.stderr, flush=True)


# ── Global error handler ──────────────────────────────────────────────────────
@app.errorhandler(Exception)
def handle_error(e):
    import traceback
    # Log full traceback server-side only — never expose internals to clients.
    print(f"[FLASK ERROR] {type(e).__name__}: {e}", file=sys.stderr, flush=True)
    traceback.print_exc(file=sys.stderr)
    return jsonify({'error': 'An internal server error occurred.'}), 500


# ── CORS safeguard: apply to all responses ───────────────────────────────────
# Uses the first allowed origin header that matches the request; falls back to
# the first configured origin (for non-browser traffic like Meta webhooks).
@app.after_request
def add_cors_headers(response):
    origin = request.headers.get('Origin', '')
    if origin in _ALLOWED_ORIGINS:
        response.headers['Access-Control-Allow-Origin'] = origin
    elif _ALLOWED_ORIGINS:
        response.headers['Access-Control-Allow-Origin'] = _ALLOWED_ORIGINS[0]
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response

# --------------------------------------------------
# RUN SERVER
# --------------------------------------------------
if __name__ == "__main__":
    print(f"[STARTUP] Firebase Data Connect backend starting on port {PORT}")
    # threaded=True: each HTTP request gets its own thread.
    # This prevents a slow Meta API call in /api/whatsapp/send from blocking
    # every other request (health checks, new messages, etc.).
    app.run(host="0.0.0.0", port=PORT, debug=False, threaded=True)
