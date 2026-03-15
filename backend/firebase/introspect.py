"""Quick test to discover the correct Data Connect query field names."""
import os, sys, json
sys.path.insert(0, os.path.dirname(__file__))
from dataconnect_db import execute_graphql

# Test 1: Try listing vendors with the plural name
tests = [
    ("vendors", "query { vendors { vendorId vendorName } }"),
    ("vendor_list", "query { vendor_list { vendorId vendorName } }"),
    ("Vendor_list", "query { Vendor_list { vendorId vendorName } }"),
]

for name, q in tests:
    try:
        res = execute_graphql(q)
        print(f"✅ '{name}' worked! Result: {json.dumps(res, indent=2)[:500]}")
        break
    except Exception as e:
        print(f"❌ '{name}' failed: {e}")

# Test 2: Try introspection to list all query fields
print("\n--- Introspecting available query fields ---")
try:
    intro = execute_graphql("""
    query {
      __schema {
        queryType {
          fields {
            name
          }
        }
        mutationType {
          fields {
            name
          }
        }
      }
    }
    """)
    
    query_fields = [f["name"] for f in intro.get("__schema", {}).get("queryType", {}).get("fields", [])]
    mutation_fields = [f["name"] for f in intro.get("__schema", {}).get("mutationType", {}).get("fields", [])]
    
    print("Available QUERIES:")
    for f in query_fields:
        print(f"  - {f}")
    print("\nAvailable MUTATIONS:")
    for f in mutation_fields:
        print(f"  - {f}")
except Exception as e:
    print(f"Introspection failed: {e}")
