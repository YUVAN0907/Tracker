import requests

r = requests.get('http://127.0.0.1:3001/api/dashboard')
d = r.json()

# Create PO and MRP lookup
prods = {}
mrps = {}
for p in d['products']:
    pid = p.get('PRODUCT_ID')
    if pid:
        po = p.get('PO', 0)
        mrp = p.get('MRP', 0)
        try:
            po = float(po) if po else 0
        except:
            po = 0
        try:
            mrp = float(mrp) if mrp else 0
        except:
            mrp = 0
        prods[pid] = po
        mrps[pid] = mrp

# Filter VM001 stock
stock = [s for s in d['stock'] if s.get('Machine_ID') == 'VM001']
print(f"VM001 has {len(stock)} stock items")

# Calculate stock value
total = 0
print("\nVM001 Stock breakdown:")
for s in stock:
    pid = s.get('Product_ID')
    qty = float(s.get('Current_Stock', 0) or 0)
    po = prods.get(pid, 0)
    val = qty * po
    total += val
    if qty > 0:
        print(f"  {pid}: qty={qty}, PO={po}, value={val}")

# Calculate with MRP too
total_mrp = sum((float(s.get('Current_Stock', 0) or 0)) * mrps.get(s.get('Product_ID'), 0) for s in stock)

print(f"\n==> VM001 Total Stock Value (PO): {total:,.2f}")
print(f"==> VM001 Total Stock Value (MRP): {total_mrp:,.2f}")

# Calculate for ALL machines
print("\n\n=== All Machines Stock Value ===")
machines = ['VM001', 'VM002', 'VM003', 'VM004']
for machine_id in machines:
    m_stock = [s for s in d['stock'] if s.get('Machine_ID') == machine_id]
    m_total_po = 0
    m_total_mrp = 0
    for s in m_stock:
        pid = s.get('Product_ID')
        qty = float(s.get('Current_Stock', 0) or 0)
        po = prods.get(pid, 0)
        mrp = mrps.get(pid, 0)
        m_total_po += qty * po
        m_total_mrp += qty * mrp
    print(f"{machine_id}: PO={m_total_po:,.2f}, MRP={m_total_mrp:,.2f}")
