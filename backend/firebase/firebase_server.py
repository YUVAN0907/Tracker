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

# --------------------------------------------------
# FLASK APP
# --------------------------------------------------
app = Flask(__name__)

# Configure CORS for development
CORS(app, 
     resources={r"/api/*": {
         "origins": "*",
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
app.register_blueprint(stocks_batch_bp)
app.register_blueprint(stock_batch_update_bp)
app.register_blueprint(bills_bp)
app.register_blueprint(qr_bp)
app.register_blueprint(machine_location_bp)
app.register_blueprint(vendors_bp)

# Health Check
@app.route('/api/health')
def health():
    return jsonify({
        "status": "ok", 
        "database": "Firebase Data Connect (PostgreSQL)", 
        "port": PORT
    })

# Request logging middleware
@app.before_request
def log_request():
    import sys
    print(f"\n{'='*60}", file=sys.stderr, flush=True)
    print(f"[FLASK] Incoming {request.method} {request.path}", file=sys.stderr, flush=True)
    print(f"[FLASK] Headers: {dict(request.headers)}", file=sys.stderr, flush=True)
    if request.method in ['POST', 'PUT']:
        try:
            print(f"[FLASK] Body: {request.get_json()}", file=sys.stderr, flush=True)
        except:
            print(f"[FLASK] Body: <unable to parse JSON>", file=sys.stderr, flush=True)
    print(f"{'='*60}\n", file=sys.stderr, flush=True)

# Global error handler
@app.errorhandler(Exception)
def handle_error(e):
    import sys
    import traceback
    print(f"\n[FLASK ERROR] {type(e).__name__}: {str(e)}", file=sys.stderr, flush=True)
    traceback.print_exc(file=sys.stderr)
    print(f"\n", file=sys.stderr, flush=True)
    return jsonify({'error': str(e)}), 500


# Ensure CORS headers are always present (safeguard for browser preflight failures)
@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response

# --------------------------------------------------
# RUN SERVER
# --------------------------------------------------
if __name__ == "__main__":
    print(f"[STARTUP] Firebase Data Connect backend starting on port {PORT}")
    app.run(host="0.0.0.0", port=PORT, debug=False)
