"""
Seed Data Script — populate Firebase Data Connect (PostgreSQL) with example data.
Run: python seed_dataconnect.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from dataconnect_db import execute_graphql

def seed():
    print("Seeding Vendors...")
    vendors = [
        {"id": "V001", "name": "Coca-Cola India"},
        {"id": "V002", "name": "PepsiCo India"}
    ]
    vq = "mutation M($id: String!, $name: String) { vendor_upsert(data: {vendorId: $id, vendorName: $name}) }"
    for v in vendors: execute_graphql(vq, v)

    print("Seeding Products...")
    products = [
        {"id": "P001", "name": "Coca-Cola 250ml", "vid": "V001", "mrp": 30.0, "units": 500},
        {"id": "P002", "name": "Pepsi 250ml", "vid": "V002", "mrp": 30.0, "units": 400}
    ]
    pq = "mutation M($id: String!, $name: String, $vid: String!, $mrp: Float, $units: Int) { product_upsert(data: {productId: $id, productName: $name, vendorId: $vid, mrp: $mrp, units: $units}) }"
    for p in products: execute_graphql(pq, p)

    print("Seeding Machines & Inventory...")
    machines = [{"id": "M001", "loc": "Block A"}, {"id": "M002", "loc": "Block B"}]
    mq = "mutation M($id: String!, $loc: String) { machine_upsert(data: {machineId: $id, location: $loc}) }"
    for m in machines: execute_graphql(mq, m)

    invs = [{"mid": "M001", "pid": "P001", "s": 25}, {"mid": "M002", "pid": "P002", "s": 20}]
    iq = "mutation M($mid: String!, $pid: String!, $s: Int!) { machineInventory_upsert(data: {machineId: $mid, productId: $pid, currentStock: $s}) }"
    for i in invs: execute_graphql(iq, i)

    print("✅ Seed complete!")

if __name__ == "__main__":
    seed()
