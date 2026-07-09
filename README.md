# VendBees Inventory Management System

## Project Overview

VendBees is a full-stack inventory management platform built to manage product catalogs, warehouse stock, vending machine inventories, purchase orders, billing, and QR-enabled machine tracking.

The system combines a React + Vite front-end with a Python Flask backend powered by Firebase Data Connect / GraphQL and Firestore. It supports real-time dashboards, intelligent warehouse allocation, vendor purchase workflows, machine refill analytics, invoice generation, and QR code document generation.

## Resume-ready Description

Developed a comprehensive inventory management system using React/Vite, Firebase Data Connect GraphQL, Firestore, and Python Flask. Implemented unified inventory visibility across products, warehouses, vending machines, and vendor purchase orders. Designed intelligent stock normalization, KPI dashboards, QR-based machine identification, and invoice generation to improve operational reliability and supply-chain transparency.

## Architecture

- Front-end: `vendbees_app` with React, Vite, and Lucide icons
- Backend: `backend/firebase` Python Flask API serving GraphQL data from Firebase Data Connect
- Data store: Firebase Firestore / Data Connect schema with normalized purchase, warehouse, machine, and billing entities
- Auxiliary sync: `server.py` for SharePoint / Excel ingestion and synchronization

## Key Features

- Product lifecycle management: add, update, delete products and maintain landed cost
- Machine inventory monitoring: track fill levels, stock value, and machine status
- Warehouse stock control: manage warehouse entries, case-level stock, expiry tracking, and PO allocation
- Purchase order management: create and view purchase orders, vendor deliveries, and stock cases
- Billing and invoice generation: generate bill history, PDF-ready invoices, and download counts
- QR code support: generate machine QR PDFs and maintain QR history records
- Data normalization: reconcile varied dataset formats from spreadsheets, GraphQL responses, and Firestore
- Dashboard analytics: KPI cards, stock charts, and machine-specific inventory tables

## Data Schema Structure

### `products`
- `productId`: String
- `productName`: String
- `category`: String
- `vendorId`: String
- `mrp`: Float
- `gst`: Float
- `quantity` / `units`: Int
- `unitCost`: Float
- `landedCost`: Float
- `eanNo`: String
- `selfLife`: Int (days)
- `vendor`: { `vendorId`, `vendorName` }

### `machines`
- `machineId`: String
- `location`: String
- `status`: String

### `machineInventories`
- `machineId`: String
- `productId`: String
- `currentStock`: Int

### `sales`
- `saleId`: String
- `machineId`: String
- `productId`: String
- `quantitySold`: Int
- `mrp`: Float
- `status`: String
- `transactionAt`: Timestamp

### `refillLogs`
- `refillId`: String
- `date`: Date
- `refillerId`: String
- `machineId`: String
- `productId`: String
- `coverCount`: Int
- `quantity`: Int

### `vendors`
- `vendorId`: String
- `vendorName`: String
- `mobileNumber`: String
- `email`: String

### `warehouses`
- `warehouseId`: String
- `name`: String
- `location`: String
- `address`: String
- `notes`: String
- `createdAt`: Timestamp
- `updatedAt`: Timestamp

### `warehouseStocks`
- `stockId`: String
- `warehouseId`: String
- `poId`: String
- `productId`: String
- `batch`: String
- `unitsPerCase`: Int
- `caseLabel`: String
- `availableUnits`: Int
- `mfd`: Date
- `expd`: Date
- `receivedDate`: Date
- `notes`: String
- `warehouse`: { `warehouseId`, `name`, `location` }
- `product`: { `productName` }

### `vendorPurchaseOrders` / `purchaseOrderHeaders`
- `purchaseOrderId` / `poId`: String
- `vendorId`: String
- `createdDate`: Date
- `totalAmount`: Float
- `status`: String
- `paymentMode`: String
- `paymentStatus`: String
- `gstFiled`: Boolean

### `vendorPurchaseItems` / `purchaseOrderLines`
- `itemId` / `lineId`: String
- `purchaseOrderId` / `poId`: String
- `productId`: String
- `batch`: String
- `unitsPerCase`: Int
- `caseCount`: Int
- `totalUnits`: Int
- `mrp`: Float
- `poPrice`: Float
- `lineTotal`: Float
- `product`: { `productName` }

### `billHistories`
- `billId`: String
- `userId`: String
- `billNumber`: String
- `billDate`: Timestamp
- `totalAmount`: Float
- `totalProducts`: Int
- `totalItems`: Int
- `billData`: String
- `downloadedAt`: Timestamp
- `downloadCount`: Int
- `status`: String
- `createdAt`: Timestamp
- `updatedAt`: Timestamp

### Batch / Stock Assignment Tables
- `batchAssignments`: { `batch`, `assignedDate`, `status` }
- `stockCoverAssignments`: { `batch`, `machineId`, `stockLabel`, `coverLabel`, `assignedDate` }
- `stockCoverProductAssignments`: { `stockCoverAssignmentId`, `productId`, `quantity`, `batch` }

## Folder Structure

- `vendbees_app/`: React front-end UI and dashboards
- `backend/firebase/`: Flask backend routes, GraphQL integration, authentication, QR, billing, warehouse, and stock operations
- `server.py`: auxiliary data-sync service for SharePoint / Excel ingestion

## Running Locally

1. Install backend dependencies:
   ```bash
   pip install -r backend/firebase/requirements_firebase.txt
   ```

2. Configure environment variables in `backend/firebase/.env` or root `.env` for:
   - `SP_TENANT_ID`
   - `SP_CLIENT_ID`
   - `SP_CLIENT_SECRET`
   - `SP_SITE_ID`
   - `DRIVE_ID`
   - `FILE_ID`

3. Start Flask backend:
   ```bash
   python backend/firebase/firebase_server.py
   ```

4. Start React front-end:
   ```bash
   cd vendbees_app
   npm install
   npm run dev
   ```

5. Access the app in your browser at `http://localhost:5173` (or as configured by Vite).

## Notes

- The backend uses Firebase Data Connect GraphQL queries to fetch normalized inventory and transaction data.
- The front-end normalizes inconsistent field names from spreadsheets and API responses to render a unified dashboard.
- QR and billing workflows are implemented as separate API endpoints for audit and traceability.
