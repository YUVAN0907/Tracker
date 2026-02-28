#!/usr/bin/env python3
"""
Stock Management System - Quick Verification Script
This script helps verify that the Stock Management System is working correctly
Run this after starting the backend server
"""

import requests
import json
from datetime import datetime

API_URL = "http://localhost:3001/api"
MACHINES = ["VM001", "VM002", "VM003", "VM004"]

def print_header(title):
    print("\n" + "="*60)
    print(f"  {title}")
    print("="*60)

def test_create_batch():
    print_header("TEST 1: Create a Batch")
    
    payload = {
        "batch_number": f"Batch-Test-{datetime.now().strftime('%H%M%S')}",
        "machine_ids": MACHINES,
        "created_date": datetime.now().strftime("%Y-%m-%d")
    }
    
    print(f"\nPayload:\n{json.dumps(payload, indent=2)}")
    
    try:
        response = requests.post(f"{API_URL}/stocks/create-batch", json=payload)
        result = response.json()
        print(f"\nResponse Status: {response.status_code}")
        print(f"Response:\n{json.dumps(result, indent=2)}")
        
        if result.get('success'):
            print("\n✓ Batch created successfully!")
            return result.get('created_stocks', [])[0] if result.get('created_stocks') else None
        else:
            print(f"\n✗ Error: {result.get('error')}")
            return None
    except Exception as e:
        print(f"\n✗ Request failed: {str(e)}")
        return None

def test_add_cover(stock_id):
    print_header("TEST 2: Add Cover to Stock")
    
    if not stock_id:
        print("✗ No stock ID available, skipping test")
        return False
    
    payload = {
        "stock_id": stock_id,
        "cover_name": "C1"
    }
    
    print(f"\nPayload:\n{json.dumps(payload, indent=2)}")
    
    try:
        response = requests.post(f"{API_URL}/stocks/add-cover", json=payload)
        result = response.json()
        print(f"\nResponse Status: {response.status_code}")
        print(f"Response:\n{json.dumps(result, indent=2)}")
        
        if result.get('success'):
            print("\n✓ Cover added successfully!")
            return True
        else:
            print(f"\n✗ Error: {result.get('error')}")
            return False
    except Exception as e:
        print(f"\n✗ Request failed: {str(e)}")
        return False

def test_add_product(stock_id):
    print_header("TEST 3: Add Product to Cover")
    
    if not stock_id:
        print("✗ No stock ID available, skipping test")
        return False
    
    payload = {
        "stock_id": stock_id,
        "cover_name": "C1",
        "product_id": "P001",
        "product_name": "LAYS CLASSIC SALT",
        "units": 50
    }
    
    print(f"\nPayload:\n{json.dumps(payload, indent=2)}")
    
    try:
        response = requests.post(f"{API_URL}/stocks/add-product", json=payload)
        result = response.json()
        print(f"\nResponse Status: {response.status_code}")
        print(f"Response:\n{json.dumps(result, indent=2)}")
        
        if result.get('success'):
            print("\n✓ Product added successfully!")
            return True
        else:
            print(f"\n✗ Error: {result.get('error')}")
            return False
    except Exception as e:
        print(f"\n✗ Request failed: {str(e)}")
        return False

def test_get_covers(stock_id):
    print_header("TEST 4: Get Stock Covers")
    
    if not stock_id:
        print("✗ No stock ID available, skipping test")
        return False
    
    print(f"\nGetting covers for: {stock_id}")
    
    try:
        response = requests.get(f"{API_URL}/stocks/get-covers/{stock_id}")
        result = response.json()
        print(f"\nResponse Status: {response.status_code}")
        print(f"Response:\n{json.dumps(result, indent=2)}")
        
        if 'covers' in result:
            print(f"\n✓ Retrieved {len(result['covers'])} cover(s)")
            return True
        else:
            print(f"\n✗ Error: {result.get('error')}")
            return False
    except Exception as e:
        print(f"\n✗ Request failed: {str(e)}")
        return False

def test_get_batches():
    print_header("TEST 5: Get All Batches")
    
    print("\nFetching all batches...")
    
    try:
        response = requests.get(f"{API_URL}/stocks/get-batches")
        result = response.json()
        print(f"\nResponse Status: {response.status_code}")
        print(f"Response:\n{json.dumps(result, indent=2)}")
        
        if 'batches' in result:
            print(f"\n✓ Retrieved {len(result['batches'])} batch(es)")
            return result.get('batches', [])[0] if result['batches'] else None
        else:
            print(f"\n✗ Error: {result.get('error')}")
            return None
    except Exception as e:
        print(f"\n✗ Request failed: {str(e)}")
        return None

def test_get_batch_details(batch_number):
    print_header("TEST 6: Get Batch Details")
    
    if not batch_number:
        print("✗ No batch number available, skipping test")
        return False
    
    print(f"\nGetting details for batch: {batch_number}")
    
    try:
        response = requests.get(f"{API_URL}/stocks/get-batch-details/{batch_number}")
        result = response.json()
        print(f"\nResponse Status: {response.status_code}")
        print(f"Response:\n{json.dumps(result, indent=2)}")
        
        if 'stocks' in result:
            print(f"\n✓ Retrieved {len(result['stocks'])} stock(s)")
            return True
        else:
            print(f"\n✗ Error: {result.get('error')}")
            return False
    except Exception as e:
        print(f"\n✗ Request failed: {str(e)}")
        return False

def main():
    print("\n" + "="*60)
    print("  STOCK MANAGEMENT SYSTEM - VERIFICATION SUITE")
    print("  " + datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    print("="*60)
    
    # Test 1: Create Batch
    stock_id = test_create_batch()
    
    if stock_id:
        # Test 2: Add Cover
        test_add_cover(stock_id)
        
        # Test 3: Add Product
        test_add_product(stock_id)
        
        # Test 4: Get Covers
        test_get_covers(stock_id)
    
    # Test 5: Get Batches
    batch_number = test_get_batches()
    
    # Test 6: Get Batch Details
    if batch_number:
        test_get_batch_details(batch_number)
    
    print("\n" + "="*60)
    print("  VERIFICATION COMPLETE")
    print("="*60 + "\n")

if __name__ == "__main__":
    main()
