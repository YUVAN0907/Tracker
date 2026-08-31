import unittest
from unittest.mock import patch

import sys
sys.path.insert(0, '.')

from routes_bills import parse_bill_with_product_matches


class BillParseFallbackTests(unittest.TestCase):
    @patch('routes_bills.parse_bill_text_to_items')
    @patch('parse_and_match_bill.extract_structured_items', return_value=[])
    @patch('parse_and_match_bill.fetch_products', return_value=[{
        'productId': 'P-1001',
        'productName': 'COOKIES CASHEW 75G',
        'aliasName': 'COOKIES CASHEW',
        'secondAliasName': 'CASHEW COOKIES'
    }])
    @patch('parse_and_match_bill.match_product', return_value=('P-1001', 1.0, 'COOKIES CASHEW'))
    def test_falls_back_to_legacy_bill_line_parsing(self, mock_match_product, mock_fetch_products, mock_extract_structured_items, mock_legacy_items):
        mock_legacy_items.return_value = [{
            'product_name': 'COOKIES CASHEW 75G',
            'quantity': 22,
            'serial': 1,
            'amount': 5068.80
        }]

        text = 'S.No Particulars\n1 COOKIES CASHEW 75G RS 25 190590 22.00 288 16.76 5% 241.37 17.60 5068.80\n'
        result = parse_bill_with_product_matches(text)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['productId'], 'P-1001')
        self.assertEqual(result[0]['particulars'], 'COOKIES CASHEW 75G')
        self.assertEqual(result[0]['caseNo'], 22)
        self.assertEqual(result[0]['amount'], 5068.80)


if __name__ == '__main__':
    unittest.main()
