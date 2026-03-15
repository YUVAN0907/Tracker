"""
Seed Data Script — populate Firestore with example data for testing.
Run: python seed_data.py
"""
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(__file__))
from firebase_config import db
from firebase_db import add_doc, set_doc, delete_collection

COLLECTIONS = [
    "Vendors", "Products", "Machines", "Stock", "Sales",
    "Purchases", "Refills", "Warehouse", "Purchased_Products",
    "Stocks", "Stock_Products", "Stock_Assignments", "OUR_PO"
]


def clear_all():
    """Clear all collections before seeding."""
    print("🗑️  Clearing existing data...")
    for c in COLLECTIONS:
        delete_collection(c)
    print("   Done.\n")


def seed():
    """Seed example data."""
    today = datetime.now().strftime("%Y-%m-%d")

    # Vendors
    vendors = [
        {"Vendor_ID": "V001", "Name": "Coca-Cola India", "Contact": "9876543210", "GST": "29AAGCC2436G1ZZ", "Status": "Active"},
        {"Vendor_ID": "V002", "Name": "PepsiCo India", "Contact": "9876543211", "GST": "27AACFW8893A1Z0", "Status": "Active"},
        {"Vendor_ID": "V003", "Name": "Parle Agro", "Contact": "9876543212", "GST": "27AAACW3459A1ZB", "Status": "Active"},
    ]
    for v in vendors:
        set_doc("Vendors", v["Vendor_ID"], v)

    # Products
    products = [
        {"PRODUCT_ID": "P001", "PRODUCT_NAME": "Coca-Cola 250ml", "CATEGORY": "Beverages", "PO": 18.0, "GST": 12.0, "MRP": 30.0, "QUANTITY": 500},
        {"PRODUCT_ID": "P002", "PRODUCT_NAME": "Sprite 250ml", "CATEGORY": "Beverages", "PO": 17.0, "GST": 12.0, "MRP": 30.0, "QUANTITY": 400},
        {"PRODUCT_ID": "P003", "PRODUCT_NAME": "Lays Classic 20g", "CATEGORY": "Snacks", "PO": 7.0, "GST": 12.0, "MRP": 10.0, "QUANTITY": 600},
        {"PRODUCT_ID": "P004", "PRODUCT_NAME": "Pepsi 250ml", "CATEGORY": "Beverages", "PO": 18.0, "GST": 12.0, "MRP": 30.0, "QUANTITY": 350},
        {"PRODUCT_ID": "P005", "PRODUCT_NAME": "KitKat 2F", "CATEGORY": "Chocolates", "PO": 15.0, "GST": 18.0, "MRP": 25.0, "QUANTITY": 200},
    ]
    for p in products:
        set_doc("Products", p["PRODUCT_ID"], p)

    # Machines
    machines = [
        {"Machine_ID": "M001", "Name": "VB Machine Alpha", "Location": "Block A, Floor 1", "Status": "Active"},
        {"Machine_ID": "M002", "Name": "VB Machine Beta", "Location": "Block B, Floor 2", "Status": "Active"},
        {"Machine_ID": "M003", "Name": "VB Machine Gamma", "Location": "Block C, Floor 1", "Status": "Active"},
        {"Machine_ID": "M004", "Name": "VB Machine Delta", "Location": "Block D, Floor 3", "Status": "Inactive"},
    ]
    for m in machines:
        set_doc("Machines", m["Machine_ID"], m)

    # Current Stock
    stock_entries = [
        {"Machine_ID": "M001", "Product_ID": "P001", "Current_Stock": 25},
        {"Machine_ID": "M001", "Product_ID": "P003", "Current_Stock": 30},
        {"Machine_ID": "M002", "Product_ID": "P002", "Current_Stock": 20},
        {"Machine_ID": "M002", "Product_ID": "P005", "Current_Stock": 15},
        {"Machine_ID": "M003", "Product_ID": "P004", "Current_Stock": 0},
    ]
    for s in stock_entries:
        add_doc("Stock", s)

    # Warehouse
    warehouse = [
        {"Product_ID": "P001", "Product_Name": "Coca-Cola 250ml", "Available_Units": 100, "Units_Per_Case": 24, "Last_Received_Date": today, "Notes": ""},
        {"Product_ID": "P002", "Product_Name": "Sprite 250ml", "Available_Units": 80, "Units_Per_Case": 24, "Last_Received_Date": today, "Notes": ""},
        {"Product_ID": "P003", "Product_Name": "Lays Classic 20g", "Available_Units": 150, "Units_Per_Case": 48, "Last_Received_Date": today, "Notes": ""},
        {"Product_ID": "P004", "Product_Name": "Pepsi 250ml", "Available_Units": 60, "Units_Per_Case": 24, "Last_Received_Date": today, "Notes": ""},
        {"Product_ID": "P005", "Product_Name": "KitKat 2F", "Available_Units": 40, "Units_Per_Case": 36, "Last_Received_Date": today, "Notes": ""},
    ]
    for w in warehouse:
        set_doc("Warehouse", w["Product_ID"], w)

    # Sales
    sales = [
        {"Date": today, "Machine_ID": "M001", "Product_ID": "P001", "Qty Sold": 3, "Selling_Price": 30},
        {"Date": today, "Machine_ID": "M002", "Product_ID": "P002", "Qty Sold": 2, "Selling_Price": 30},
    ]
    for s in sales:
        add_doc("Sales", s)

    # Refills
    refills = [
        {"Date": today, "Refiller_ID": "R001", "Machine_ID": "M001", "Product_ID": "P001", "Qty": 10},
    ]
    for r in refills:
        add_doc("Refills", r)

    print(f"✅ Seeded {sum(len(x) for x in [vendors, products, machines, stock_entries, warehouse, sales, refills])} documents across 7 collections")


if __name__ == "__main__":
    if "--clear" in sys.argv:
        clear_all()
    seed()
    print("🎉 Done!")
