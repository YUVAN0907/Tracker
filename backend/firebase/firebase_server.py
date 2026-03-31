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
print("[DEBUG] Importing routes...")
try:
    from routes_auth import auth_bp
    print("[DEBUG] ✅ auth_bp imported successfully")
except Exception as e:
    print(f"[DEBUG] ❌ Failed to import auth_bp: {e}")
    auth_bp = None

try:
    from routes_dashboard import dashboard_bp
    print("[DEBUG] ✅ dashboard_bp imported successfully")
except Exception as e:
    print(f"[DEBUG] ❌ Failed to import dashboard_bp: {e}")

try:
    from routes_products import products_bp
    print("[DEBUG] ✅ products_bp imported successfully")
except Exception as e:
    print(f"[DEBUG] ❌ Failed to import products_bp: {e}")

try:
    from routes_po import po_bp
    print("[DEBUG] ✅ po_bp imported successfully")
except Exception as e:
    print(f"[DEBUG] ❌ Failed to import po_bp: {e}")

try:
    from routes_purchases import purchases_bp
    print("[DEBUG] ✅ purchases_bp imported successfully")
except Exception as e:
    print(f"[DEBUG] ❌ Failed to import purchases_bp: {e}")

try:
    from routes_stock_ops import stock_ops_bp
    print("[DEBUG] ✅ stock_ops_bp imported successfully")
except Exception as e:
    print(f"[DEBUG] ❌ Failed to import stock_ops_bp: {e}")

try:
    from routes_warehouse import warehouse_bp
    print("[DEBUG] ✅ warehouse_bp imported successfully")
except Exception as e:
    print(f"[DEBUG] ❌ Failed to import warehouse_bp: {e}")

try:
    from routes_stocks_batch import stocks_batch_bp
    print("[DEBUG] ✅ stocks_batch_bp imported successfully")
except Exception as e:
    print(f"[DEBUG] ❌ Failed to import stocks_batch_bp: {e}")

print("[DEBUG] All imports completed")

# --------------------------------------------------
# REGISTER BLUEPRINTS
# --------------------------------------------------
print("[DEBUG] Registering blueprints...")
if auth_bp:
    app.register_blueprint(auth_bp)
    print("[DEBUG] ✅ auth_bp registered")
else:
    print("[DEBUG] ❌ auth_bp is None, skipping registration")

app.register_blueprint(dashboard_bp)
print("[DEBUG] ✅ dashboard_bp registered")

app.register_blueprint(products_bp)
print("[DEBUG] ✅ products_bp registered")

app.register_blueprint(po_bp)
print("[DEBUG] ✅ po_bp registered")

app.register_blueprint(purchases_bp)
print("[DEBUG] ✅ purchases_bp registered")

app.register_blueprint(stock_ops_bp)
print("[DEBUG] ✅ stock_ops_bp registered")

app.register_blueprint(warehouse_bp)
print("[DEBUG] ✅ warehouse_bp registered")

app.register_blueprint(stocks_batch_bp)
print("[DEBUG] ✅ stocks_batch_bp registered")

print("[DEBUG] All blueprints registered")

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

# --------------------------------------------------
# RUN SERVER
# --------------------------------------------------
if __name__ == "__main__":
    print(f"🚀 Firebase Data Connect backend starting on port {PORT}")
    
    # List all registered routes
    print(f"\n📋 Registered routes:")
    for rule in sorted(app.url_map.iter_rules(), key=lambda r: str(r)):
        if not rule.rule.startswith('/static'):
            methods = ','.join(sorted(rule.methods - {'HEAD', 'OPTIONS'}))
            print(f"  {rule.rule:40} [{methods}]")
    print()
    
    app.run(host="0.0.0.0", port=PORT, debug=False)
