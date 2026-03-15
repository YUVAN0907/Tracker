import os
import sys
from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

# Ensure we connect to Data Connect
import dataconnect_config

load_dotenv()

PORT = 3002

# --------------------------------------------------
# FLASK APP
# --------------------------------------------------
app = Flask(__name__)
CORS(app)

# --------------------------------------------------
# IMPORT ROUTE MODULES
# --------------------------------------------------
from routes_dashboard import dashboard_bp
from routes_products import products_bp
from routes_po import po_bp
from routes_purchases import purchases_bp
from routes_stock_ops import stock_ops_bp
from routes_warehouse import warehouse_bp
from routes_stocks_batch import stocks_batch_bp

# --------------------------------------------------
# REGISTER BLUEPRINTS
# --------------------------------------------------
app.register_blueprint(dashboard_bp)
app.register_blueprint(products_bp)
app.register_blueprint(po_bp)
app.register_blueprint(purchases_bp)
app.register_blueprint(stock_ops_bp)
app.register_blueprint(warehouse_bp)
app.register_blueprint(stocks_batch_bp)

# Health Check
@app.route('/api/health')
def health():
    return jsonify({
        "status": "ok", 
        "database": "Firebase Data Connect (PostgreSQL)", 
        "port": PORT
    })

# --------------------------------------------------
# RUN SERVER
# --------------------------------------------------
if __name__ == "__main__":
    print(f"🚀 Firebase Data Connect backend starting on port {PORT}")
    app.run(host="0.0.0.0", port=PORT, debug=False)
