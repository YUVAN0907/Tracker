from dataconnect_db import execute_graphql

GET_ALL_WAREHOUSE_STOCKS = '''query GetAllWarehouseStocks {
  warehouseStocks(limit: 10000) {
    stockId
    poId
    warehouseId
    productId
    caseLabel
    availableUnits
  }
}'''

DELETE_WAREHOUSE_STOCK_MUTATION = '''mutation DeleteWarehouseStock($stockId: String!) {
  warehouseStock_delete(key: { stockId: $stockId })
}'''

if __name__ == '__main__':
    print('Querying warehouseStocks...')
    res = execute_graphql(GET_ALL_WAREHOUSE_STOCKS)
    stocks = res.get('warehouseStocks', []) if isinstance(res, dict) else []
    print(f'Fetched {len(stocks)} warehouseStocks')
    targets = [s for s in stocks if s.get('poId') in (None, '', 'NO_PO')]
    print(f'Found {len(targets)} records with poId None/empty/NO_PO')
    if not targets:
        print('No deletion needed.')
    else:
        deleted = 0
        for s in targets:
            stock_id = s.get('stockId')
            if not stock_id:
                continue
            print(f"Deleting stockId={stock_id}, poId={s.get('poId')}, productId={s.get('productId')}, caseLabel={s.get('caseLabel')}")
            result = execute_graphql(DELETE_WAREHOUSE_STOCK_MUTATION, {'stockId': stock_id})
            print('  ->', result)
            deleted += 1
        print(f'Deleted {deleted} records.')
