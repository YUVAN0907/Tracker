"""
Bill History Routes
Endpoints for managing bill history, filtering, sorting
"""

from flask import Blueprint, request, jsonify
from datetime import datetime
import uuid
import os
import re
import io
import tempfile
from auth_middleware import token_required, admin_required
import dataconnect_config

try:
    from PyPDF2 import PdfReader
except Exception:
    PdfReader = None

try:
    import pytesseract
except Exception:
    pytesseract = None

try:
    from pdf2image import convert_from_bytes
except Exception:
    convert_from_bytes = None

try:
    from PIL import Image
except Exception:
    Image = None

# Configure OCR / poppler executable paths from environment when available
try:
    # If pytesseract is present and a TESSERACT env points to the folder, set the full exe path
    if pytesseract is not None:
        tesseract_env = os.environ.get('TESSERACT')
        if tesseract_env:
            tpath = os.path.join(tesseract_env, 'tesseract.exe')
            if os.path.exists(tpath):
                pytesseract.pytesseract.tesseract_cmd = tpath
except Exception:
    pass

# Detect poppler bin folder from POPPLER env var (used by pdf2image)
poppler_bin_path = None
try:
    poppler_env = os.environ.get('POPPLER')
    if poppler_env and os.path.exists(poppler_env):
        poppler_bin_path = poppler_env
    else:
        # common install location fallback
        fallback = r'C:\Program Files\poppler-windows-26.02.0-0\bin'
        if os.path.exists(fallback):
            poppler_bin_path = fallback
except Exception:
    poppler_bin_path = None

bills_bp = Blueprint('bills', __name__, url_prefix='/api/bills')

FIELD_ALIASES = {
    'sno': {'sno', 's no', 's.no', 'sl', 'serial', '#'},
    'particulars': {'particulars', 'item name', 'product desc', 'product description', 'description of goods', 'description', 'item description', 'commodity', 'goods'},
    'case': {'case no', 'case', 'qty', 'quantity', 'cases', 'pcs', 'pack', 'packet', 'packs', 'ctn', 'carton'},
    'amount': {'amount', 'total', 'net amt', 'net amount', 'amount total', 'total amount'}
}


def normalize_field_label(label):
    if not label:
        return ''
    s = re.sub(r'[^a-z0-9]+', ' ', str(label).lower())
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def matches_field_alias(label, field_name):
    norm = normalize_field_label(label)
    if not norm:
        return False
    aliases = FIELD_ALIASES.get(field_name, set())
    return norm in aliases or any(norm.startswith(a) or norm.endswith(a) for a in aliases)


def is_header_line(line):
    norm = normalize_field_label(line)
    if not norm:
        return False
    return any(matches_field_alias(norm, field_name) for field_name in ('sno', 'particulars', 'case', 'amount'))


def extract_text_from_pdf_bytes(file_bytes):
    text_parts = []

    # Try text extraction first (native PDF text)
    if PdfReader is not None:
        try:
            reader = PdfReader(io.BytesIO(file_bytes))
            for page in reader.pages:
                try:
                    page_text = page.extract_text() or ''
                except Exception:
                    page_text = ''
                text_parts.append(page_text)
            combined = '\n'.join(text_parts).strip()
            if combined:
                return combined
        except Exception as e:
            print(f"[extract_text_from_pdf_bytes] PdfReader extraction failed: {e}")

    # Fallback: use OCR if available
    if pytesseract is None or convert_from_bytes is None or Image is None:
        raise RuntimeError('OCR dependencies missing. Install pytesseract, pdf2image and Pillow, and ensure poppler is available on PATH.')

    # If poppler binary path was detected, pass it to pdf2image to avoid relying on PATH
    convert_kwargs = {}
    if poppler_bin_path:
        convert_kwargs['poppler_path'] = poppler_bin_path
    images = convert_from_bytes(file_bytes, **convert_kwargs)
    ocr_text_parts = []
    for img in images:
        try:
            text = pytesseract.image_to_string(img, lang='eng')
        except Exception as e:
            print(f"[extract_text_from_pdf_bytes] pytesseract failed for a page: {e}")
            text = ''
        ocr_text_parts.append(text)
    return '\n'.join(ocr_text_parts)


def parse_bill_text_to_items(text):
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    parsed_items = []

    for line in lines:
        normalized = re.sub(r'[\t\u00A0]+', ' ', line)
        normalized = re.sub(r'\s{2,}', ' ', normalized).strip()

        # Ignore header rows
        if is_header_line(normalized) and len(normalized.split()) <= 12:
            continue

        if re.search(r'(?i)^(?:s\.?no|sno|particulars|item\s+name|description|product|hsn|qty|case|amount|total)', normalized) and len(normalized.split()) <= 10:
            continue

        # Structured invoice lines like:
        # '1 COOKIES CASHEW 75G RS 25 190590 22.00 288 16.76 5% 241.37 17.60 5068.80'
        # Serial is the leading token; Qty is the integer token occurring after HSN and before final amount.
        m_serial = re.match(r'^(?P<sno>\d+)\s+(?P<rest>.+)$', normalized)
        if m_serial:
            sno = m_serial.group('sno')
            rest = m_serial.group('rest')
            tokens = rest.split()
            hsn_idx = next((i for i, t in enumerate(tokens) if re.fullmatch(r'\d{6,}', t)), None)
            if hsn_idx is not None:
                product_tokens = tokens[:hsn_idx]
                trail_tokens = tokens[hsn_idx + 1:]

                qty = None
                qty_candidates = []
                for tok in trail_tokens:
                    if re.fullmatch(r'\d+', tok):
                        val = int(tok)
                        if 1 <= val <= 5000:
                            qty_candidates.append(val)
                if qty_candidates:
                    qty = max(qty_candidates)

                amount = None
                for tok in reversed(trail_tokens):
                    if re.fullmatch(r'\d+\.\d+', tok):
                        amount = float(tok)
                        break
                if amount is None:
                    for tok in reversed(trail_tokens):
                        if re.fullmatch(r'\d+', tok):
                            amount = float(tok)
                            break

                if qty is not None:
                    name = ' '.join(product_tokens).strip()
                    name = re.sub(r'\s+\d+(?:\.\d+)?\s*$', '', name).strip()
                    parsed_items.append({
                        'product_name': name,
                        'quantity': int(qty),
                        'serial': int(sno) if sno and sno.isdigit() else None,
                        'unit_price': None,
                        'amount': amount
                    })
                    continue

        # Generic HSN-based fallback
        m_hsn = re.search(r'^(?P<name>.+?)\s+(?P<sno>\d+)\s+(?P<hsn>\d{6})\s+(?P<after>.+)$', normalized)
        if m_hsn:
            name = m_hsn.group('name').strip()
            sno = m_hsn.group('sno')
            after = m_hsn.group('after')
            m_qty = re.search(r'(\d+\s*/\s*\d+)', after)
            if not m_qty:
                m_qty = re.search(r'(?i)(?:case|qty|quantity|cases|pcs|pack|packet|packs|ctn|carton)[^\d]*(\d+(?:\s*/\s*\d+)?)', after)
            m_total_before_qty = None
            if m_qty:
                qty = m_qty.group(1).replace(' ', '') if isinstance(m_qty.group(1), str) else m_qty.group(1)
                pre_qty = after[:m_qty.start()]
                m_total_before_qty = re.search(r'([\d,]+\.\d{2})\s*$', pre_qty)
            else:
                qty = None
            m_taxes = re.findall(r'([\d,]+\.\d{2})', after)
            amt = None
            if m_total_before_qty:
                amt = m_total_before_qty.group(1).replace(',', '')
            elif m_taxes:
                chosen = None
                for t in reversed(m_taxes):
                    if ',' in t:
                        chosen = t
                        break
                if chosen is None:
                    chosen = m_taxes[-1]
                try:
                    amt = chosen.replace(',', '')
                except Exception:
                    amt = None
            parsed_items.append({
                'product_name': name,
                'quantity': qty,
                'serial': int(sno) if sno and sno.isdigit() else None,
                'unit_price': None,
                'amount': float(amt) if amt else None
            })
            continue

        match = re.search(r'^(?P<name>.+?)\s+(?P<qty>\d+)\s+(?P<rate>\d+(?:\.\d+)?)\s+(?P<amount>\d+(?:\.\d+)?)$', normalized)
        if match:
            parsed_items.append({
                'product_name': match.group('name').strip(),
                'quantity': int(match.group('qty')),
                'unit_price': float(match.group('rate')),
                'amount': float(match.group('amount'))
            })
            continue

        match = re.search(r'^(?P<name>.+?)\s+(?P<qty>\d+)\s+(?P<unit>pcs|cases|nos)\s+(?P<rate>\d+(?:\.\d+)?)$', normalized, re.IGNORECASE)
        if match:
            parsed_items.append({
                'product_name': match.group('name').strip(),
                'quantity': int(match.group('qty')),
                'quantity_unit': match.group('unit').lower(),
                'unit_price': float(match.group('rate'))
            })
            continue

        match = re.search(r'^(?P<name>.+?)\s+(?P<qty>\d+)\s+(?P<rate>\d+(?:\.\d+)?)$', normalized)
        if match and len(normalized.split(' ')) > 2:
            parsed_items.append({
                'product_name': match.group('name').strip(),
                'quantity': int(match.group('qty')),
                'unit_price': float(match.group('rate'))
            })
            continue

    return parsed_items


def parse_bill_with_product_matches(text):
    """Extract bill rows with the same product matching used by the Excel tool."""
    from parse_and_match_bill import (
        extract_case_number,
        extract_structured_items,
        fetch_products,
        is_all_flavours,
        match_all_flavours,
        match_product,
    )

    products = fetch_products()
    rows = extract_structured_items(text)

    if not rows:
        legacy_rows = []
        for idx, item in enumerate(parse_bill_text_to_items(text), start=1):
            particulars = (item.get('product_name') or item.get('particulars') or '').strip()
            if not particulars:
                continue
            qty = item.get('quantity')
            case_no = item.get('caseNo')
            if case_no is None:
                case_no = extract_case_number(qty) if qty is not None else ''
            amount = item.get('amount') if item.get('amount') is not None else (item.get('unit_price') or '')
            legacy_rows.append({
                'S.no': item.get('serial') if isinstance(item.get('serial'), int) else idx,
                'Particulars': particulars,
                'Case No': case_no,
                'Amount': amount,
            })
        rows = legacy_rows

    matched_items = []
    for row in rows:
        particulars = (row.get('Particulars') or '').strip()
        if not particulars:
            continue

        if is_all_flavours(particulars):
            matched_value, score, _ = match_all_flavours(particulars, products)
        else:
            matched_value, score, _ = match_product(particulars, products)

        product_ids = [value.strip() for value in (matched_value or '').split(',') if value.strip()]
        if not product_ids:
            product_ids = ['']

        for product_id in product_ids:
            product = next((item for item in products if item.get('productId') == product_id), {})
            matched_items.append({
                'serial': row.get('S.no'),
                'particulars': particulars,
                'productId': product_id,
                'productName': product.get('productName') or '',
                'unitsPerCase': product.get('unitsPerCase') or product.get('units') or 1,
                'caseNo': row.get('Case No') if row.get('Case No') is not None else '',
                'amount': row.get('Amount') if row.get('Amount') is not None else '',
                'matchScore': round(score, 3) if product_id else None,
            })

    return matched_items


@bills_bp.route('/parse', methods=['POST'])
@token_required
def parse_bill():
    if 'bill' not in request.files:
        return jsonify({'error': 'Missing bill file. Use field name "bill".'}), 400

    bill_file = request.files['bill']
    if not bill_file or bill_file.filename == '':
        return jsonify({'error': 'Bill file cannot be empty.'}), 400

    filename = bill_file.filename
    ext = os.path.splitext(filename)[1].lower()

    try:
        # Read bytes once
        file_bytes = bill_file.read()

        if ext == '.pdf':
            try:
                text = extract_text_from_pdf_bytes(file_bytes)
            except Exception as e:
                print(f"[parse_bill] OCR/Text extraction failed: {e}")
                return jsonify({'error': f'Cannot extract text from PDF: {str(e)}'}), 400
        else:
            # Treat as image
            if pytesseract is None or Image is None:
                return jsonify({'error': 'OCR dependencies missing for image parsing.'}), 400
            try:
                img = Image.open(io.BytesIO(file_bytes))
                text = pytesseract.image_to_string(img, lang='eng')
            except Exception as e:
                print(f"[parse_bill] Image OCR failed: {e}")
                return jsonify({'error': f'Cannot extract text from image: {str(e)}'}), 400

        if not text or not text.strip():
            return jsonify({'error': 'No text could be extracted from the file.'}), 400

        parsed_items = parse_bill_with_product_matches(text)
        return jsonify({
            'message': 'Bill parsed successfully.',
            'parsedItems': parsed_items,
            'billText': '\n'.join(text.splitlines()[:50])
        }), 200

    except Exception as e:
        print(f"[parse_bill] Unexpected error: {e}")
        return jsonify({'error': f'Failed to parse bill: {str(e)}'}), 500


@bills_bp.route('/history', methods=['GET'])
@token_required
def get_bill_history():
    """
    Get user's bill history
    Query params: sortBy, filterDate, limit, offset
    """
    try:
        session = dataconnect_config.get_session()
        
        query = """
        query {
          billHistories {
            billId
            userId
            billNumber
            billDate
            totalAmount
            totalProducts
            totalItems
            billData
            downloadedAt
            downloadCount
            status
            createdAt
            updatedAt
          }
        }
        """
        
        response = session.execute_graphql(query)
        all_bills = response.get('data', {}).get('billHistories', [])
        
        # Filter by current user (security)
        # Only return bills created by the current user
        user_bills = [b for b in all_bills if b.get('userId') == request.user_id]
        
        # Debug logging
        print(f"[DEBUG] Retrieved {len(all_bills)} total bills, {len(user_bills)} for user {request.user_id}")
        for bill in user_bills[:1]:  # Log first bill
            bill_data = bill.get('billData', '')
            print(f"[DEBUG] Sample bill billData length: {len(bill_data) if bill_data else 0}")
            print(f"[DEBUG] Sample bill billData: {bill_data[:100] if bill_data else 'EMPTY'}")
        
        return jsonify({
            'message': 'Bill history retrieved successfully',
            'bills': user_bills,
            'count': len(user_bills)
        }), 200
    
    except Exception as e:
        print(f"Get bill history error: {str(e)}")
        return jsonify({'message': f'Failed to get bill history: {str(e)}'}), 500


@bills_bp.route('/', methods=['POST'])
@token_required
def create_bill():
    """
    Create a new bill record
    Body: {billNumber, totalAmount, totalProducts, totalItems, billData}
    """
    try:
        data = request.json
        
        if not data:
            return jsonify({'message': 'Request body is empty'}), 400
        
        bill_number = data.get('billNumber', '')
        total_amount = data.get('totalAmount', 0)
        total_products = data.get('totalProducts', 0)
        total_items = data.get('totalItems', 0)
        bill_data = data.get('billData', '')
        
        print(f"[DEBUG] Creating bill: {bill_number}")
        print(f"[DEBUG] billData length: {len(bill_data) if bill_data else 0}")
        print(f"[DEBUG] billData first 100 chars: {bill_data[:100] if bill_data else 'EMPTY'}")
        
        if not bill_number or total_amount <= 0:
            return jsonify({'message': 'Invalid bill data'}), 400
        
        session = dataconnect_config.get_session()
        
        # Create bill
        create_mutation = """
        mutation createBill(
          $billId: String!,
          $userId: String!,
          $billNumber: String!,
          $billDate: Timestamp!,
          $totalAmount: Float!,
          $totalProducts: Int!,
          $totalItems: Int!,
          $billData: String,
          $status: String!,
          $createdAt: Timestamp!,
          $updatedAt: Timestamp!
        ) {
          billHistory_insert(data: {
            billId: $billId,
            userId: $userId,
            billNumber: $billNumber,
            billDate: $billDate,
            totalAmount: $totalAmount,
            totalProducts: $totalProducts,
            totalItems: $totalItems,
            billData: $billData,
            downloadCount: 0,
            status: $status,
            createdAt: $createdAt,
            updatedAt: $updatedAt
          })
        }
        """
        
        bill_id = f"BILL_{uuid.uuid4().hex[:12].upper()}"
        now = datetime.now().isoformat() + "Z"
        
        variables = {
            "billId": bill_id,
            "userId": request.user_id,
            "billNumber": bill_number,
            "billDate": now,
            "totalAmount": float(total_amount),
            "totalProducts": int(total_products),
            "totalItems": int(total_items),
            "billData": bill_data,
            "status": "generated",
            "createdAt": now,
            "updatedAt": now
        }
        
        session.execute_graphql(create_mutation, variables)
        
        return jsonify({
            'message': 'Bill created successfully',
            'billId': bill_id,
            'billNumber': bill_number
        }), 201
    
    except Exception as e:
        print(f"Create bill error: {str(e)}")
        return jsonify({'message': f'Failed to create bill: {str(e)}'}), 500


@bills_bp.route('/<bill_id>/download', methods=['PUT'])
@token_required
def update_bill_download(bill_id):
    """
    Update bill download count and timestamp
    """
    try:
        session = dataconnect_config.get_session()
        
        # First, fetch the current download count
        query = """
        query {
          billHistories {
            billId
            downloadCount
            userId
          }
        }
        """
        
        response = session.execute_graphql(query)
        all_bills = response.get('data', {}).get('billHistories', [])
        bill = next((b for b in all_bills if b.get('billId') == bill_id), None)
        
        if not bill:
            return jsonify({'message': 'Bill not found'}), 404
        
        # Verify ownership
        if bill.get('userId') != request.user_id:
            return jsonify({'message': 'Unauthorized'}), 403
        
        current_count = bill.get('downloadCount', 0)
        new_count = current_count + 1
        now = datetime.now().isoformat() + "Z"
        
        # Update bill
        update_mutation = """
        mutation updateBillDownload(
          $billId: String!,
          $downloadedAt: Timestamp!,
          $downloadCount: Int!,
          $status: String!,
          $updatedAt: Timestamp!
        ) {
          billHistory_update(
            key: {billId: $billId},
            data: {
              downloadedAt: $downloadedAt,
              downloadCount: $downloadCount,
              status: $status,
              updatedAt: $updatedAt
            }
          )
        }
        """
        
        variables = {
            "billId": bill_id,
            "downloadedAt": now,
            "downloadCount": new_count,
            "status": "downloaded",
            "updatedAt": now
        }
        
        session.execute_graphql(update_mutation, variables)
        
        return jsonify({
            'message': 'Bill download recorded successfully',
            'downloadCount': new_count
        }), 200
    
    except Exception as e:
        print(f"Update bill download error: {str(e)}")
        return jsonify({'message': f'Failed to update bill: {str(e)}'}), 500


@bills_bp.route('/<bill_id>', methods=['DELETE'])
@token_required
def delete_bill(bill_id):
    """
    Delete a bill (only owner can delete)
    """
    try:
        session = dataconnect_config.get_session()
        
        # Verify ownership first
        query = """
        query {
          billHistories {
            billId
            userId
          }
        }
        """
        
        response = session.execute_graphql(query)
        all_bills = response.get('data', {}).get('billHistories', [])
        bill = next((b for b in all_bills if b.get('billId') == bill_id), None)
        
        if not bill:
            return jsonify({'message': 'Bill not found'}), 404
        
        if bill.get('userId') != request.user_id:
            return jsonify({'message': 'Unauthorized'}), 403
        
        # Delete bill
        delete_mutation = """
        mutation deleteBill($billId: String!) {
          billHistory_delete(key: {billId: $billId})
        }
        """
        
        variables = {"billId": bill_id}
        session.execute_graphql(delete_mutation, variables)
        
        return jsonify({
            'message': 'Bill deleted successfully'
        }), 200
    
    except Exception as e:
        print(f"Delete bill error: {str(e)}")
        return jsonify({'message': f'Failed to delete bill: {str(e)}'}), 500
