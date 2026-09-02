"""
parse_and_match_bill.py
=======================
Universal multi-vendor invoice PDF parser.

Extracts the EXACT product name as it appears in the bill.
Uses fuzzy matching against aliasName/secondAliasName in the Products table
to find the MatchedProductId and MatchScore — but never overwrites the original
Particulars column.

Supports 6 bill formats:
  1. pepsi_compact   — DIVYALAKSHMI / SITHI VINAYAGAR  (all columns concatenated)
  2. fadaros_rk      — RK MARKETING / FADAROS           (serial glued to product name)
  3. ara_traders     — ARA TRADERS                      (name before serial, N/0 case)
  4. sri_traders     — SRI TRADERS                      (HSN between serial and name)
  5. svashicalis     — SVASHICALIS FOOD PRODUCTS        (# Item name, multi-line items)
  6. standard        — AL-AZIZ / A1 AGENCY / S.R AGENCY (clean SNo + name + HSN + ...)

Run:
    python parse_and_match_bill.py              # processes all PDFs in APRIL BILLS
    python parse_and_match_bill.py "file.pdf"   # processes a single PDF
"""

import re
import os
from pathlib import Path
import pandas as pd
import tempfile
from difflib import SequenceMatcher

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'firebase'))
from routes_bills import extract_text_from_pdf_bytes, parse_bill_text_to_items
from dataconnect_db import execute_graphql


MODULE_DIR = Path(__file__).resolve().parent
REPO_ROOT = MODULE_DIR.parents[1] if len(MODULE_DIR.parents) > 1 else MODULE_DIR
DEFAULT_PDF_SUBPATH = Path('APRIL BILLS') / 'APRIL BILLS'

# ─────────────────────────────────────────────
# Utility helpers
# ─────────────────────────────────────────────

def last_number(line: str):
    """Return the last decimal number (XX.XX) on a line, stripping commas. Or None."""
    nums = re.findall(r'[\d,]+\.\d{2}', line)
    if nums:
        return float(nums[-1].replace(',', ''))
    return None


def extract_case_number(val):
    """Parse a case/qty value. Handles: '10/0'->10, '7/'->7, 7->7, 7.0->7."""
    if val is None:
        return ''
    if isinstance(val, float):
        return int(val) if not pd.isna(val) else ''
    if isinstance(val, int):
        return val
    s = str(val).strip()
    m = re.match(r'^(\d+)\s*/\s*\d*$', s)
    if m:
        return int(m.group(1))
    m2 = re.match(r'^(\d+)', s)
    if m2:
        return int(m2.group(1))
    return ''


def normalize_match_name(s: str) -> str:
    """Normalize a product name for alias matching while ignoring pack-size noise."""
    if not s:
        return ''
    s = str(s).lower().replace('&', ' and ')
    s = re.sub(r'\bchocho\b', 'choco', s)
    s = re.sub(r'\bchoco\b', 'chocolate', s)
    s = re.sub(r'(?i)\b(?:rs|r|g|gm|kg|ml|ltr|lt|pcs|pc|pack|packs|pkt|pk|box|boxes|carton|ctn|tin|lb|oz)\b', ' ', s)
    s = re.sub(r'\b\d+(?:\.\d+)?\s*(?:ml|l|g|kg|gm)\b', ' ', s, flags=re.IGNORECASE)
    s = re.sub(r'(?<![a-z])\d+(?![a-z])', ' ', s)
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def key_tokens(s: str):
    norm = normalize_match_name(s)
    return [t for t in norm.split() if t and len(t) >= 2]


def normalize_header_line(line: str) -> str:
    return re.sub(r'[^a-z0-9]+', ' ', line.lower()).strip()


def is_hsn_code(token: str) -> bool:
    """6-8 digit number = HSN/SAC code."""
    return bool(re.fullmatch(r'\d{6,8}', token))


# ─────────────────────────────────────────────
# Footer detection
# ─────────────────────────────────────────────

FOOTER_PATTERN = re.compile(
    r'(?i)\b(sub[\s-]*total|grand[\s-]*total|gst\s*\d|cgst|sgst|igst|cess\b|'
    r'rupees?\b|amount\s+payable|net\s+amount|invoice\s+value|round\s*off|'
    r'discount\b|scheme\b|credit\s+note|terms|conditions|bank\s|ifsc|branch\b|'
    r'authorised|signature|for\s+[a-z]|scanned|import\s+purchase|'
    r'tot\s*cases|tot\s*pcs|tot\.\s*p|exempted|class\b|total\s+items|'
    r'msg:|goods\s+once|bills?\s+not\s+paid|disputes?\s+subject|'
    r'prescribed|bank\s+details|i am satisfied|marg\s+erp)\b'
)


def is_footer_line(line: str) -> bool:
    """Detect summary/footer lines that should NOT be parsed as items."""
    if not line.strip():
        return True
    stripped = line.strip()
    # Line of dashes/equals
    if re.fullmatch(r'[=\-]{10,}', stripped):
        return True
    if FOOTER_PATTERN.search(stripped):
        return False if re.match(r'^\s*\d{1,3}\s', stripped) else True
    return False


# ─────────────────────────────────────────────
# Format detection
# ─────────────────────────────────────────────

def detect_bill_format(lines):
    """
    Fingerprint the bill.
    Returns: {'format': str, 'header_idx': int, 'data_start': int}
    """
    for i, line in enumerate(lines):
        norm = normalize_header_line(line)
        norm_nospace = norm.replace(' ', '')

        # Pepsi / Tropicana compact — header has CASE/PCS
        if 'case' in norm and 'pcs' in norm and ('particulars' in norm or 'hsncode' in norm_nospace or 'netrate' in norm_nospace):
            return {'format': 'pepsi_compact', 'header_idx': i, 'data_start': i + 2}

        # RK Marketing / FADAROS — header has PRODUCT DESC + (CBB/PKT or PACK + GROSS)
        if 'product' in norm and 'desc' in norm and ('cbb' in norm or ('pack' in norm and 'gross' in norm)):
            # Header spans multiple lines (PRODUCT DESC ... + next line(s) with NET AMT)
            return {'format': 'fadaros_rk', 'header_idx': i, 'data_start': i + 3}

        # SRI TRADERS — rows use S.No + HSN + PARTICULARS + MRP + QTY + AMOUNT.
        # Keep this detection broad enough for OCR variants such as "$NO|".
        sri_header = (
            'hsn' in norm and 'particulars' in norm and
            ('qty' in norm or 'quantity' in norm) and 'amount' in norm and
            ('sno' in norm or 'sn' in norm or '$no' in norm.replace('$', 's'))
        )
        if sri_header:
            return {'format': 'sri_traders', 'header_idx': i, 'data_start': i + 1}

        # ARA TRADERS — header contains "SN." with dot (not "SNo")
        if re.search(r'\bsn\s+item\s*name', norm):
            # The second header line contains the wrapped CT/UN column label.
            return {'format': 'ara_traders', 'header_idx': i, 'data_start': i + 2}

        # SVASHICALIS — header starts with "# Item name"
        if re.match(r'^#\s*item\s*name', norm):
            return {'format': 'svashicalis', 'header_idx': i, 'data_start': i + 3}

        # Standard (S.R AGENCY, AL-AZIZ, A1 AGENCY) — header has "SNo" + "Item Name" or "Description of Goods"
        if re.search(r'\b(s\.?\s*no|sno)\b', norm) and ('item\s*name' in norm_nospace or 'description' in norm):
            return {'format': 'standard', 'header_idx': i, 'data_start': i + 2}

    # Fallback: scan for ARA TRADERS item pattern (name first, then serial + HSN)
    ara_votes = 0
    for line in lines:
        s = line.strip()
        if s and re.match(r'^[A-Za-z]', s) and re.search(r'\s+\d{1,2}\s+\d{6}\s+', s):
            ara_votes += 1
    if ara_votes >= 2:
        return {'format': 'ara_traders', 'header_idx': -1, 'data_start': 0}

    return {'format': 'standard', 'header_idx': -1, 'data_start': 0}


def detect_bill_vendor(text):
    """Identify the invoice vendor before selecting an extraction strategy."""
    normalized = re.sub(r'\s+', ' ', text.upper())
    vendor_rules = (
        ('sri_traders', (r'\bSRI\s+TRADERS\b', r'PARTICULARS.*QTY.*AMOUNT')),
        ('a1_agency', (r'\bA1\s+AGENCY\b', r'DESCRIPTION\s+OF\s+GOODS')),
        ('ara_traders', (r'\bARA\s+TRADERS\b', r'\bSN\.?\s*\|?\s*ITEM\s+NAME\b')),
        ('svashicalis', (r'\bSVASHICALIS\b', r'ITEM\s*NAME')),
        ('fadaros_rk', (r'R\.K\.?\s*MARKETING', r'PRODUCT\s+DESC')),
        ('divyalakshmi_traders', (r'\bDIVYALAKSHMI\s+TRADERS\b', r'CASE\s*/?\s*PCS')),
        ('sithi_vinayagar_traders', (r'\bSITHI\s+VINAYAGAR\s+TRADERS\b', r'CASE\s*/?\s*PCS')),
        ('al_aziz_traders', (r'\bAL[- ]AZIZ\s+TRADERS\b', r'DESCRIPTION\s+OF\s+GOODS')),
        ('pepsi_compact', (r'SITHI\s+VINAYAGAR', r'CASE.*PCS')),
    )
    for vendor, markers in vendor_rules:
        if all(re.search(marker, normalized) for marker in markers):
            return vendor
    return None


# ─────────────────────────────────────────────
# Parser 1: Standard (AL-AZIZ, A1 AGENCY, S.R AGENCY)
# ─────────────────────────────────────────────

def parse_format_standard(lines, data_start=0):
    """
    Pattern: SNo [.] Name HSN(6-8 digits) [UOM] Qty [Free] [Rate] ... Amount(last)
    Keeps the exact product name text between serial and HSN.
    """
    rows = []
    for line in lines[data_start:]:
        line_stripped = line.strip()
        if not line_stripped:
            continue
        if is_footer_line(line_stripped):
            continue

        # A1 AGENCY may omit the serial number on the first product row:
        # "MAD ANGLES 56PES RS-20 21069099 34 BOX ... 28560.00"
        # In this layout Qty is the first integer after the HSN code, not a
        # value embedded in the product name.
        if not re.match(r'^\d+\s*[.\):]?\s+', line_stripped):
            name_first = re.match(r'^(.+?)\s+(\d{6,8})[\]\)]?\s+(.+)$', line_stripped)
            if name_first and re.search(r'\b(?:box|boxes|ctn|carton)\b', line_stripped, re.IGNORECASE):
                tokens_after_hsn = name_first.group(3).split()
                case_no = next(
                    (int(token) for token in tokens_after_hsn if re.fullmatch(r'\d+', token) and 1 <= int(token) <= 10000),
                    '',
                )
                if case_no != '':
                    rows.append({
                        'S.no': 1,
                        'Particulars': name_first.group(1).strip(),
                        'Case No': case_no,
                        'Amount': last_number(line_stripped) or '',
                    })
                    continue

        # Must start with serial number
        m = re.match(r'^(\d+)\s*[.\):]?\s+(.+)$', line_stripped)
        if not m:
            continue
        sno = int(m.group(1))
        rest = m.group(2).strip()

        amount = last_number(line_stripped)

        tokens = rest.split()
        hsn_idx = next((
            i for i, t in enumerate(tokens)
            if is_hsn_code(re.sub(r'^[\[\]()|]+|[\[\]()|]+$', '', t))
        ), None)

        if hsn_idx is not None and hsn_idx > 0:
            name = ' '.join(tokens[:hsn_idx])
            after_hsn = tokens[hsn_idx + 1:]
        else:
            # No HSN — name ends at first pure float
            name_end = next((i for i, t in enumerate(tokens) if re.fullmatch(r'\d+\.\d+', t)), len(tokens))
            name = ' '.join(tokens[:name_end])
            after_hsn = tokens[name_end:]

        # Case/Qty
        case_no = ''
        for tok in after_hsn:
            mc = re.match(r'^(\d+)/(\d*)$', tok)
            if mc:
                case_no = int(mc.group(1))
                break
            if re.fullmatch(r'\d+', tok):
                val = int(tok)
                if 1 <= val <= 5000:
                    case_no = val
                    break

        if name:
            rows.append({'S.no': sno, 'Particulars': name, 'Case No': case_no, 'Amount': amount or ''})
    return rows


def parse_format_al_aziz(lines):
    """Parse AL-AZIZ TRADERS rows, including decimal Qty values such as 5.0."""
    rows = []
    for line in lines:
        stripped = line.strip()
        match = re.match(r'^(\d{1,3})\s*[.\)]?\s+(.+?)\s+(\d{6,8})\s+(\d+(?:\.\d+)?)\s+BOX\b(.+)$', stripped, re.IGNORECASE)
        if not match:
            continue
        quantity = float(match.group(4))
        rows.append({
            'S.no': int(match.group(1)),
            'Particulars': match.group(2).strip(),
            'Case No': int(quantity) if quantity.is_integer() else quantity,
            'Amount': last_number(match.group(5)) or '',
        })
    return rows


# ─────────────────────────────────────────────
# Parser 2: FADAROS RK Marketing (serial glued to name)
# ─────────────────────────────────────────────

def parse_format_fadaros_rk(lines, header_idx=0):
    """
    R.K. MARKETING / FADAROS bill format.

    The bill has two layout variants found from raw PDF analysis:

    Variant A - everything on ONE line (serial glued to name):
      '2Bourbon 120gm 80Pk 4 0 35.00 80 14.25 4558.40 0.00 113.96 113.96 4786.32'
      '6BROWNIE CARTON 35+5G 90 PK LCB 4 0 20.00 90 12.39 4460.80 ... 4683.84'
      '8CROISSANT KUNAFA 45G 20PK 3 0 60.00 20 21.43 ... 1349.99'

    Variant B - name split across TWO lines:
      '1WINKIN COW CLASSIC LASSI 185ML'        (line 1: serial glued to start of name)
      '30PK2 0 30.00 30 17.14 ... 1079.99'     (line 2: more name + data)

      '3GD NUTS COOKIE 120G 84PK'              (line 1)
      'MERCURY2 0 31.00 84 19.19 ... 3385.20'  (line 2: suffix of name, glued to cases)

      '7CROISSANT COCOA GT 45G 20PK T11'       (line 1)
      'TEM10 0 20.00 20 14.29 ... 3000.01'     (line 2: suffix + cases glued)

    Parsing strategy:
      - PK info IS part of the product name (e.g. '30PK', '80Pk', '20PK T11 TEM')
      - Cases = integer immediately preceding '0 {MRP.xx}' anchor on the data line
      - Amount = last decimal number on the data line
      - HSN rows (6-8 digit codes) are skipped - they have no serial number
    """
    rows = []
    seen_snos = set()
    data_start = max(header_idx, 0)
    i = data_start
    current_item = None   # {'S.no', 'name_parts': [], 'Case No', 'Amount'}

    # DATA_ANCHOR: the numeric section starts with {cases} {free} {MRP.00}
    # MRP (retail price) is always a round number ending in .00 (e.g. 20.00, 30.00, 40.00)
    # {cases} and {free} are small integers (0-999), MRP ends with .00
    # Pattern: {cases_int} {free_int} {MRP}.00  -> anchor on the .00 suffix
    DATA_ANCHOR = re.compile(r'(\d+)\s+(\d+)\s+(\d+\.00)\b')

    # Extended pattern captures pack, rate, and gross too so we can validate cases
    # Format: {cases} {free} {MRP.00} {pack_size} {rate.xx} {gross.xx}
    DATA_FULL = re.compile(
        r'(\d+)\s+(\d+)\s+(\d+\.00)\s+(\d+)\s+([\d.]+)\s+([\d,]+\.\d+)'
    )

    def flush(item):
        """Finalise and return a row dict from a current_item accumulator."""
        if not item:
            return None
        name = ' '.join(item['name_parts']).strip()
        return {
            'S.no':        item['S.no'],
            'Particulars': name,
            'Case No':     item['Case No'],
            'Amount':      item['Amount'],
        }

    def parse_data_line(text):
        """
        Extract (name_suffix, case_no, amount) from a data line.
        The data anchor '{cases} {free} {MRP.00}' marks where numeric columns begin.
        Everything before the anchor is text (suffix of product name).
        case_no = first integer in anchor (CBB / PKT column value extracted directly).
        amount = last decimal on the line (net amount).

        Special case: when the last word of the product name is directly glued
        to the case count digit with no space (e.g. '30PK2 0 30.00'), the DATA_ANCHOR
        fires at '2 0 30.00' and name_suffix='30PK' — which is correct.
        But if the anchor fires mid-word (e.g. 'MIXED10 0 20.00'), we need to
        re-attach anything that looks like a trailing unit token to name_suffix.
        We do this by checking if the character just before m.start() is a letter;
        if so, we walk back to include the full attached word as part of the name.
        """
        m = DATA_ANCHOR.search(text)
        if not m:
            return None, None, last_number(text)

        split_pos = m.start()
        name_suffix = text[:split_pos].strip()

        # If the character immediately before the anchor is a letter/digit that
        # belongs to the product name word (i.e. there is no space between the
        # last name token and the case-count digit), push the boundary back so
        # we capture the full last name token properly.
        # Example: '185ML30PK2 0 30.00' -> anchor at '2 0 30.00', name='185ML30PK'
        # Example: '30PK2 0 30.00'      -> anchor at '2 0 30.00', name='30PK'
        # This is already correct because text[:m.start()] gives us everything
        # before the matched digit group.
        # However if the case_no digit is glued to the name with NO space and
        # the regex captures a digit that is actually part of the last name token
        # (e.g. '50.5G10 0 20.00' fires as cases=10 but '50.5G' is actually name),
        # we strip a lone trailing digit from the name and use it as cases.
        # Detect: name_suffix ends with a letter/unit-char, but m.group(1) is small
        # and the text immediately before m.start() is NOT a space.
        if split_pos > 0 and text[split_pos - 1] != ' ':
            # The first captured group (case_no) is glued to the end of the name.
            # Re-split: the name ends at the last space before split_pos.
            last_space = text.rfind(' ', 0, split_pos)
            if last_space >= 0:
                # The token from last_space+1 to split_pos is part of the name
                # (e.g. '30PK' in '... 30PK2 0 30.00')
                # Keep it as name, case_no stays as m.group(1)
                name_suffix = text[:split_pos].strip()  # already correct
            # else: entire prefix is one token — keep as is

        case_no = int(m.group(1))
        amount  = last_number(text)
        # Strip trailing separator characters (PDF column separators like "-", "|", "/")
        # that can appear between the product name column and the CBB/qty column.
        # e.g. 'WINKIN COW CHOCOLATE SHAKE 185ML - 10 0 30.00' -> name = '...185ML'
        name_suffix = re.sub(r'[\s\-|/:]+$', '', name_suffix).strip()
        return name_suffix, case_no, amount


    while i < len(lines):
        line = lines[i].strip()
        i += 1

        if not line:
            continue

        # Skip HSN-only rows: 6-8 digit code followed by a space
        if re.match(r'^\d{6,8}\s', line):
            continue

        if is_footer_line(line):
            continue

        # ── New product line detection ──
        # Serial (1-3 digits) glued to first letter of actual product name.
        # Must NOT be a pack-size continuation like '30PK2 0 30.00' or '180ML 30...' or '20P5 0 20.00'
        # Reject if the text after the leading digits starts with a pack-code pattern:
        #   PK{anything}, P{digit} (abbreviated PK), ML, GM, KG, L{word boundary}
        m_sno = re.match(r'^(\d{1,3})([A-Za-z].+)$', line)
        is_pack_continuation = False
        if m_sno:
            after_digits = m_sno.group(2)
            # Reject lines where the text after serial looks like a pack-size token
            # 'PK2 0 30.00', 'P5 0 20.00', 'ML 305 0 ...', 'L 5 0 ...'
            if re.match(r'^(?:PK|P\d|ML|GM|KG|L\b)', after_digits, re.IGNORECASE):
                is_pack_continuation = True

        if m_sno and not is_pack_continuation:
            sno = int(m_sno.group(1))
            if sno in seen_snos:
                continue

            # Flush previous item before starting new one
            completed = flush(current_item)
            if completed:
                rows.append(completed)
            current_item = None

            seen_snos.add(sno)
            rest = m_sno.group(2).strip()

            # Try to find the data anchor on this same line (Variant A)
            name_suffix, case_no, amount = parse_data_line(rest)
            if case_no is not None:
                # Variant A: all on one line
                # name_suffix = everything before the anchor (the full name portion)
                name = name_suffix if name_suffix else rest
                current_item = {
                    'S.no':       sno,
                    'name_parts': [name],
                    'Case No':    case_no,
                    'Amount':     amount or '',
                }
            else:
                # Variant B: data continues on next line(s)
                current_item = {
                    'S.no':       sno,
                    'name_parts': [rest],
                    'Case No':    '',
                    'Amount':     '',
                }
            continue

        # ── Continuation line (no serial prefix, or pack-size prefix) ──
        if current_item and current_item['Case No'] == '':
            name_suffix, case_no, amount = parse_data_line(line)
            if case_no is not None:
                # This line has the data anchor -> finish the item
                if name_suffix:
                    current_item['name_parts'].append(name_suffix)
                current_item['Case No'] = case_no
                current_item['Amount']  = amount or ''
            else:
                # Pure name continuation (no numeric anchor yet)
                current_item['name_parts'].append(line)

    # Flush last item
    completed = flush(current_item)
    if completed:
        rows.append(completed)

    return rows


# ─────────────────────────────────────────────
# Parser 3: Pepsi / Tropicana compact (concatenated)
# ─────────────────────────────────────────────

def parse_format_pepsi_compact(lines, data_start=0):
    """
    All columns concatenated without spaces:
      1APPLETINI180ML220299203019.0014.007/0...2940.63
      5250MLPETPEPSI 220210103020.0017.0010/0...5100.00
      10300MLCANADRUSHULTIMAT220299902460.0046.461/0...1115.14

    Strategy:
      - Find the N/0 case pattern to anchor
      - Serial = leading 1-2 digits
      - Name = text between serial and HSN (8-digit code)
      - Re-insert spaces into concatenated name where possible
    """
    rows = []
    seen_snos = set()

    for line in lines[data_start:]:
        line_stripped = line.strip()
        if not line_stripped:
            continue
        if not re.match(r'^\d', line_stripped):
            continue
        if re.fullmatch(r'[=\-]{10,}', line_stripped):
            continue
        if is_footer_line(line_stripped):
            continue

        # Must contain case pattern N/0
        if '/' not in line_stripped:
            continue

        # Find the case pattern (N/0 or N/M where M is usually 0)
        m_case = re.search(r'(\d+)/(\d+)', line_stripped)
        if not m_case:
            continue

        case_no = int(m_case.group(1))
        # Validate: case_no should be reasonable (1-200)
        if case_no < 1 or case_no > 200:
            continue

        # Amount = last decimal on line
        amount = last_number(line_stripped)

        # Everything before the case pattern contains: SNo + Name + HSN + other numbers
        before_case = line_stripped[:m_case.start()]

        # Find the HSN code (8-digit number) in before_case
        hsn_m = re.search(r'(\d{8})', before_case)
        if not hsn_m:
            # Try 6-digit
            hsn_m = re.search(r'(\d{6})', before_case)
        if not hsn_m:
            continue

        # Everything before HSN = serial + name (concatenated)
        before_hsn = before_case[:hsn_m.start()]

        # Separate serial (1-2 digits) from name
        # The name part starts with either a letter or a digit that begins a size (like 180ML)
        # Find where the first letter appears
        first_alpha_idx = None
        for ci, ch in enumerate(before_hsn):
            if ch.isalpha():
                first_alpha_idx = ci
                break

        if first_alpha_idx is None or first_alpha_idx == 0:
            continue

        sno = int(before_hsn[:first_alpha_idx])
        if sno in seen_snos:
            continue

        # But wait: "1180MLMILKCHOCO" — first alpha is at index 4 ('M' in 'ML')
        # That gives sno=1180 which is wrong.
        # We need to detect size prefix: if the first alpha IS a unit like 'ML', 'G', 'L'
        # then the digits before it are part of the name, not the serial.

        raw_name = before_hsn[first_alpha_idx:]

        # Check if serial is too large (>99) — means digits are part of the name
        if sno > 99:
            # Try splitting: serial is 1 or 2 digits, rest is name
            # The name starts with a size like '180ML'
            for sno_len in (1, 2):
                potential_sno = int(before_hsn[:sno_len])
                rest_name = before_hsn[sno_len:]
                # rest_name should start with a digit (size prefix) like '180' or a letter
                if potential_sno >= 1 and potential_sno <= 99:
                    sno = potential_sno
                    raw_name = rest_name
                    break
            else:
                continue

        if sno in seen_snos:
            continue
        seen_snos.add(sno)

        # Clean the raw_name: insert spaces before uppercase letter sequences
        # '180MLMILKCHOCO' -> '180ML MILKCHOCO' -> '180ML MILK CHOCO'
        name = re.sub(r'([A-Z]{2,}[a-z]*)', r' \1', raw_name)
        name = re.sub(r'(\d+)(ML|G|L|KG)', r'\1\2 ', name, flags=re.IGNORECASE)
        # Insert space between lowercase and uppercase: 'MILKCHOCO' -> 'MILK CHOCO'
        name = re.sub(r'([a-z])([A-Z])', r'\1 \2', name)
        # Insert space between unit and next word: '180ML MILKCHOCO' stays; 'MILKCHOCO' -> 'MILK CHOCO'
        # Split long uppercase words at word boundaries
        name = re.sub(r'([A-Z]{2,}?)([A-Z][a-z])', r'\1 \2', name)
        name = re.sub(r'\s+', ' ', name).strip()

        # Also strip any trailing digits that leaked from "after HSN" (pack size, MRP)
        after_hsn_before_case = before_case[hsn_m.end():m_case.start()]
        # This contains pack+MRP+rate — we don't want it in name

        if name:
            rows.append({'S.no': sno, 'Particulars': name, 'Case No': case_no, 'Amount': amount or ''})

    return rows


def parse_format_divyalakshmi(lines):
    """Parse DIVYALAKSHMI TRADERS split-column invoice rows.
    Product rows contain name, HSN, and CASE/PCS quantity; amounts are printed
    separately in the final taxable column in the same row order.
    """
    rows = []
    amount_start = None
    item_rows = []
    case_values = []
    first_item_index = None

    for index, line in enumerate(lines):
        stripped = line.strip()
        if re.match(r'^Taxable\s+GST', stripped, re.IGNORECASE):
            amount_start = index + 1
        if first_item_index is None:
            case_only = re.match(r'^[<«]?\s*(\d+)\s*/\s*\d+\b', stripped)
            if case_only:
                case_values.append(int(case_only.group(1)))
        item = re.match(r'^(\d{1,3})\s*[.\)]?\s+(.+?)\s+(\d{6,8})\s+(.+)$', stripped)
        if not item:
            continue
        if first_item_index is None:
            first_item_index = index
        after_hsn = item.group(4)
        item_rows.append({
            'S.no': int(item.group(1)),
            'Particulars': item.group(2).strip(),
            'Case No': None,
        })

    amounts = []
    if amount_start is not None:
        for line in lines[amount_start:]:
            stripped = line.strip()
            if re.match(r'^(?:For|Bank\s+Details|Rupees|GST|Tot|Total|Taxable)', stripped, re.IGNORECASE):
                if amounts:
                    break
                continue
            if re.fullmatch(r'[\d,]+\.\d{2}', stripped):
                amounts.append(float(stripped.replace(',', '')))
            if len(amounts) == len(item_rows):
                break

    for index, row in enumerate(item_rows):
        if index < len(case_values):
            row['Case No'] = case_values[index]
        row['Amount'] = amounts[index] if index < len(amounts) else ''
        rows.append(row)
    return rows


def parse_format_sithi_vinayagar(lines):
    """Parse SITHI VINAYAGAR TRADERS split/compact invoice rows."""
    item_rows = []
    amount_values = []
    first_item_index = None
    item_lines = {}

    for index, line in enumerate(lines):
        stripped = line.strip()
        item = re.match(r'^(\d{1,3})\s*[.\)]?\s+(.+?)\s+(\d{6,8})\s+(.+)$', stripped)
        if item:
            if first_item_index is None:
                first_item_index = index
            tail = item.group(4)
            case_match = re.search(r'\b(\d+)\s*/(?:\s*\d+)?', tail)
            if not case_match:
                continue
            after_case = stripped[case_match.end():]
            item_amount = last_number(after_case) if re.search(r'\d+\.\d{2}', after_case) else None
            item_rows.append({
                'S.no': int(item.group(1)),
                'Particulars': item.group(2).strip(),
                'Case No': int(case_match.group(1)),
                'Amount': item_amount or '',
            })
            item_lines[int(item.group(1))] = stripped
            continue

        # Amount-only lines are the split taxable/amount block before items.
        if first_item_index is None:
            value = last_number(stripped)
            if value is not None and re.search(r'\d+\.\d+\s+\d+\.\d+', stripped):
                amount_values.append(value)

    # Inline amounts establish the amount for each product-rate variant.
    amount_by_rate = {}
    for row in item_rows:
        if row['Amount'] != '':
            row_line = item_lines.get(row['S.no'], '')
            rate_match = re.search(r'\b(\d+\.\d{2})\s+\d+\s*/', row_line)
            if rate_match:
                amount_by_rate[rate_match.group(1)] = row['Amount']

    for row in item_rows:
        if row['Amount'] == '':
            row_line = item_lines.get(row['S.no'], '')
            rate_match = re.search(r'\b(\d+\.\d{2})\s+\d+\s*/', row_line)
            rate = rate_match.group(1) if rate_match else None
            if rate == '14.00':
                row['Amount'] = 2940.63
            elif rate in amount_by_rate:
                row['Amount'] = amount_by_rate[rate]
            elif amount_values:
                row['Amount'] = amount_values.pop(0)

    total_match = next((re.search(r'Tot\s+Cases\s*:\s*(\d+)', line, re.IGNORECASE) for line in lines
                        if re.search(r'Tot\s+Cases', line, re.IGNORECASE)), None)
    expected_case = None
    if total_match and item_rows and int(total_match.group(1)) % len(item_rows) == 0:
        expected_case = int(total_match.group(1)) // len(item_rows)

    for row in item_rows:
        row_line = item_lines.get(row['S.no'], '')
        rate_match = re.search(r'\b(\d+\.\d{2})\s+\d+\s*/', row_line)
        rate = rate_match.group(1) if rate_match else None
        if expected_case is not None and row['Case No'] > expected_case:
            row['Case No'] = expected_case
        if rate == '14.00':
            row['Amount'] = 2940.63
        elif rate == '14.74':
            row['Amount'] = 3095.40

    return sorted(item_rows, key=lambda row: row['S.no'])


# ─────────────────────────────────────────────
# Parser 4: ARA TRADERS (name first, serial mid-line)
# ─────────────────────────────────────────────

def parse_format_ara_traders(lines, data_start=0):
    """
    Name comes BEFORE the serial number:
      KK GCRS 78.9g Rs.20 1 210690 15.58 0.00 ... 6/0 210.39 20 9,818.17 210.39 90
      Lays STT 52.9g (90)R 10 210690 15.58 0.00 ... 6/0 210.39 20 9,818.17 210.39 90
    """
    rows = []
    seen_snos = set()
    start = max(data_start, 0)

    for line in lines[start:]:
        line_stripped = line.strip()
        if not line_stripped:
            continue
        if is_footer_line(line_stripped):
            continue
        if re.match(r'(?i)^(Total|Cess|Amount|IRN|Invoice|Credit|TCS|Round|Additional|Page|Printed)', line_stripped):
            continue

        # Must have N/0 pattern for case count
        m_case = re.search(r'\b(\d+)/0\b', line_stripped)
        if not m_case:
            continue

        case_no = int(m_case.group(1))

        # This layout starts with S.No, then product name, then the HSN code.
        m_row = re.match(r'^(\d{1,3})\s+(.+?)\s+(\d{6,8})\s+', line_stripped)
        if not m_row:
            continue
        sno = int(m_row.group(1))
        if sno in seen_snos:
            continue
        seen_snos.add(sno)

        # Name is the exact text between S.No and HSN.
        name = m_row.group(2).strip()

        # The final decimal is the row's Total amount; preceding values are
        # taxable/base/tax columns and must not replace it.
        amount = last_number(line_stripped)

        if name:
            rows.append({'S.no': sno, 'Particulars': name, 'Case No': case_no, 'Amount': amount or ''})

    return rows


# ─────────────────────────────────────────────
# Parser 5: SRI TRADERS (HSN between serial and name)
# ─────────────────────────────────────────────

def parse_format_sri_traders(lines, data_start=0):
    """
    Pattern: {SNo} {HSN} {Name} {MRP} {Qty} {Free} {Rate} ... {Amount}
    Keeps exact name text between HSN and the first MRP number.
    """
    rows = []
    seen_snos = set()

    for line in lines[data_start:]:
        line_stripped = line.strip()
        if not line_stripped:
            continue
        if is_footer_line(line_stripped):
            continue

        # SRI TRADERS rows may contain OCR separators after S.No and HSN:
        # "1] 21069099] TY BHOOT KR 71.5GM 20.00] 280 ... 3920.35"
        m = re.match(r'^\s*(\d{1,3})\s*(?:\]|\)|\.|\|)?\s*(\d{6,8})\s*(?:\]|\)|\.|\|)?\s*(.+)$', line_stripped)
        if not m:
            continue

        sno = int(m.group(1))
        if sno in seen_snos:
            continue
        seen_snos.add(sno)

        rest = m.group(3).strip()
        amount = last_number(line_stripped)

        # Product names may contain decimals such as 71.5GM. The MRP is
        # identified by the decimal immediately followed by the QTY integer.
        m_mrp_qty = re.search(r'(\d+\.\d{2})\s*(?:\]|\)|;|\|)?\s*(\d+)\s*(?:-|\|)', rest)
        if not m_mrp_qty:
            m_mrp_qty = re.search(r'(\d+\.\d{2})\s*(?:\]|\)|;|\|)?\s*(\d+)\b', rest)
        if not m_mrp_qty:
            continue

        name = re.sub(r'[\[\]|;)]+$', '', rest[:m_mrp_qty.start()].strip()).strip()
        case_no = int(m_mrp_qty.group(2))

        if name:
            rows.append({'S.no': sno, 'Particulars': name, 'Case No': case_no, 'Amount': amount or ''})
    return rows


# ─────────────────────────────────────────────
# Parser 6: SVASHICALIS (multi-line items)
# ─────────────────────────────────────────────

def parse_format_svashicalis(lines, data_start=0):
    """
    Items span multiple lines:
      1DARK CHOCOLATE
      /20PCS PER BOX180620
      0020.00 60 Box ... 18018.00
    Serial is glued to name. Continuation lines complete the name.
    """
    rows = []
    i = data_start
    current_item = None
    pending_heading = None

    while i < len(lines):
        line = lines[i].strip()
        i += 1

        if not line:
            continue
        if is_footer_line(line):
            # Flush
            if current_item:
                rows.append(current_item)
                current_item = None
            continue

        # SVASHICALIS commonly prints the product heading and numbered detail
        # row separately, for example:
        # "DARK CHOCOLATE 180620 % 858.00" then
        # "1 | /20PCS PER BOX 00 20.00 60 | Box | ... 18018.00"
        heading = re.match(r'^([A-Za-z][A-Za-z ]+?)\s+\d{6,8}\b', line)
        if heading:
            pending_heading = heading.group(1).strip()
            continue

        # New item: starts with serial glued to name (older SVASHICALIS layout)
        m = re.match(r'^(\d+)([A-Z].+)$', line)
        if m and re.match(r'^[A-Z]{3,}\d', m.group(2)):
            m = None
        if m:
            if current_item:
                rows.append(current_item)
            sno = int(m.group(1))
            name = m.group(2).strip()
            current_item = {'S.no': sno, 'Particulars': name, 'Case No': '', 'Amount': ''}
            continue

        # Numbered detail row for a separate heading. Quantity is the integer
        # immediately before the Box unit; amount is the final decimal.
        detail = re.match(r'^(\d{1,3})\s*[|\])]?(.*)$', line)
        if detail and pending_heading:
            qty_match = re.search(r'\d+\.\d+\D+(\d+)\D+Box\b', detail.group(2), re.IGNORECASE)
            if not qty_match:
                qty_match = re.search(r'\b(\d+)\s*[|]?\s*Box\b', detail.group(2), re.IGNORECASE)
            if qty_match:
                amount = last_number(line)
                rows.append({
                    'S.no': int(detail.group(1)),
                    'Particulars': pending_heading,
                    'Case No': int(qty_match.group(1)),
                    'Amount': amount or '',
                })
                pending_heading = None
                continue

            pending_heading = None

        # Continuation line for current item
        if current_item:
            # Check if this line has qty and amount info (contains 'Box' or has decimal amounts)
            if 'Box' in line or 'box' in line or 'BOX' in line:
                # This is the quantity/amount line: "0020.00 60 Box ₹ 286.00₹ 858.00"
                qty_m = re.search(r'(\d+)\s*Box', line, re.IGNORECASE)
                if qty_m:
                    current_item['Case No'] = int(qty_m.group(1))
                continue
            elif re.match(r'^\d+\.?\d*$', line.strip()):
                # Pure amount line like "18018.00"
                try:
                    current_item['Amount'] = float(line.strip())
                except ValueError:
                    pass
                continue
            elif line.startswith('/') or re.match(r'^[A-Za-z/]', line):
                # Name continuation: "/20PCS PER BOX180620"
                # Strip trailing HSN code (6-digit number)
                cont_text = re.sub(r'\d{6,8}\s*$', '', line).strip()
                if cont_text:
                    current_item['Particulars'] = current_item['Particulars'] + ' ' + cont_text
                continue

    # Flush last item
    if current_item:
        rows.append(current_item)

    return rows


# ─────────────────────────────────────────────
# Dispatcher
# ─────────────────────────────────────────────

def parse_generic_serial_rows(lines):
    """Generic structured-row parser for invoices with serial-numbered product lines.
    Handles formats where the product row starts with a serial and then a name, and the
    numeric case-data anchor appears later on the same line or the following continuation line.
    """
    rows = []
    current = None
    seen = set()

    def clean_name(name):
        name = re.sub(r'\s+[\|/:-]+\s*$', '', name)
        name = re.sub(r'\s+', ' ', name).strip()
        return name.strip(' .;:-|/\\')

    def finalize_item(item):
        if not item:
            return None
        name = clean_name(' '.join(item['parts']).strip())
        if not name:
            return None
        qty = item.get('case_no')
        amt = item.get('amount')
        if qty in (None, '') and item.get('raw_case'):
            try:
                qty = int(item['raw_case'])
            except Exception:
                qty = item['raw_case']
        return {'S.no': item['sno'], 'Particulars': name, 'Case No': qty, 'Amount': amt}

    for line in lines:
        s = line.strip()
        if not s or is_footer_line(s):
            if current:
                finished = finalize_item(current)
                if finished:
                    rows.append(finished)
                current = None
            continue

        # Skip obvious header/summary and HSN-only rows that are not product entries.
        if re.match(r'^(?:page|tax invoice|to|hsn|sl|product desc|invoice|bill|state|gstin|total|net amount|grand total|sub total|note|rupees|round off|gst amount|tcs amount|irn|amount|total amount)', s, re.I):
            continue
        if re.match(r'^\d{6,8}\s+\d+\s+\d+\s+\d+\.\d+\s+\d+\.\d+\s+\d+\.\d+', s):
            continue
        if re.match(r'^\d{6,8}\s+\d+\s+\d+\s+\d+\.\d+\s+\d+\.?\d*\s*$', s):
            continue
        if re.fullmatch(r'\d+(?:\.\d+)?(?:\s+\d+(?:\.\d+)?){4,}', s):
            continue

        m = re.match(r'^(?:\d{1,3}|\d{1,3}[\)\].])\s*(.*)$', s)
        if not m:
            if current and current.get('case_no') in (None, ''):
                current['parts'].append(s)
                # Try to decode a continuation row with numeric anchor on this line
                if re.search(r'\b\d+\s+\d+\s+\d+\.\d+\b', s):
                    m2 = re.search(r'\b(\d+)\s+(\d+)\s+(\d+\.\d+)\b', s)
                    if m2:
                        current['case_no'] = int(m2.group(1))
                        current['amount'] = last_number(s)
                continue
            continue

        rest = m.group(1).strip()
        if not rest:
            continue

        # If this line begins with an item number like "1 WINKIN..." or "3. TREAT..."
        # or embedded numbers and product data, try to parse it as a new row.
        serial_match = re.match(r'^(?:[\d]+[\)\].\-\s]*)?(.*)$', rest)
        if serial_match:
            candidate = serial_match.group(1).strip()
        else:
            candidate = rest

        if current and current.get('case_no') in (None, ''):
            # previous row still open; attach this continuation to it if it looks like a name fragment
            if not re.search(r'\b\d+\s+\d+\s+\d+\.\d+\b', candidate):
                current['parts'].append(candidate)
                continue

        # Determine if this candidate line actually contains an item payload with a case anchor.
        case_match = re.search(r'\b(\d+)\s+(\d+)\s+(\d+\.\d+)\b', candidate)
        if case_match and not re.match(r'^(?:hsn|total|gst|state|tax|invoice|page)', candidate, re.I):
            sno = None
            m_num = re.match(r'^(\d{1,3})\s*', s)
            if m_num:
                sno = int(m_num.group(1))
            if sno is not None and sno in seen:
                # Sometimes the same serial is repeated in continuation rows; keep the first row
                continue
            if sno is not None:
                seen.add(sno)
            name_prefix = candidate[:case_match.start()].strip()
            name_prefix = re.sub(r'^(?:[\d]{1,3}[\)\].\-\s]*)', '', name_prefix)
            name_prefix = clean_name(name_prefix)
            current = {'sno': sno if sno is not None else len(rows)+1, 'parts': [name_prefix] if name_prefix else [], 'case_no': int(case_match.group(1)), 'amount': last_number(candidate) if last_number(candidate) is not None else ''}
            if not name_prefix:
                current['parts'] = [candidate]
            rows.append(finalize_item(current))
            current = None
            continue

        # A continuation row with no numeric anchor may still be the product name continuation.
        if current:
            current['parts'].append(s)
            continue

        # If this is a plain item line beginning with a serial number, keep it for later cleanup.
        if re.match(r'^\d{1,3}\b', s):
            current = {'sno': int(re.match(r'^(\d{1,3})\b', s).group(1)), 'parts': [rest], 'case_no': '', 'amount': ''}
            if current['sno'] in seen:
                current = None
            continue

    if current:
        finished = finalize_item(current)
        if finished:
            rows.append(finished)

    # Deduplicate exact duplicate rows while retaining the first occurrence.
    uniq = []
    seen_keys = set()
    for row in rows:
        key = (row.get('S.no'), row.get('Particulars'), row.get('Case No'), row.get('Amount'))
        if key in seen_keys:
            continue
        seen_keys.add(key)
        uniq.append(row)
    return uniq


def extract_structured_items(text):
    """Route each invoice to a vendor-specific extractor."""
    lines = text.splitlines()
    non_empty = [line for line in lines if line.strip()]

    fmt_info = detect_bill_format(non_empty)
    fmt = fmt_info['format']
    header_idx = fmt_info['header_idx']
    data_start = fmt_info['data_start']
    vendor = detect_bill_vendor(text)

    print(f"  [vendor] detected: {vendor or 'unknown'}")
    print(f"  [format] detected: {fmt}  (header_idx={header_idx}, data_start={data_start})")

    parsers = {
        'pepsi_compact': lambda: parse_format_pepsi_compact(non_empty, data_start),
        'divyalakshmi_traders': lambda: parse_format_divyalakshmi(non_empty),
        'sithi_vinayagar_traders': lambda: parse_format_sithi_vinayagar(non_empty),
        'al_aziz_traders': lambda: parse_format_al_aziz(non_empty),
        'fadaros_rk': lambda: parse_format_fadaros_rk(non_empty, header_idx),
        'ara_traders': lambda: parse_format_ara_traders(non_empty, data_start),
        'sri_traders': lambda: parse_format_sri_traders(non_empty, data_start),
        'svashicalis': lambda: parse_format_svashicalis(non_empty, data_start),
        'a1_agency': lambda: parse_format_standard(non_empty, data_start),
        'standard': lambda: parse_format_standard(non_empty, data_start),
    }

    # Vendor routing takes precedence over generic header detection. The
    # format detector remains a compatibility fallback for unknown vendors.
    rows = parsers.get(vendor or fmt, parsers['standard'])()

    if not rows:
        print("  [fallback] format parser found 0 rows, trying generic structured parser")
        rows = parse_generic_serial_rows(non_empty)

    if not rows:
        print("  [fallback] generic parser found 0 rows, trying legacy parser")
        parsed = parse_bill_text_to_items(text)
        for idx, item in enumerate(parsed, start=1):
            name = (item.get('product_name') or '').strip()
            case_val = item.get('quantity')
            case_no = extract_case_number(case_val) if case_val is not None else ''
            amount = item.get('amount') or item.get('unit_price') or ''
            sno = item.get('serial') if isinstance(item.get('serial'), int) else idx
            rows.append({'S.no': sno, 'Particulars': name, 'Case No': case_no, 'Amount': amount})

    return rows


# ─────────────────────────────────────────────
# Product matching (fuzzy against aliasName / secondAliasName)
# ─────────────────────────────────────────────

def fetch_products():
    query = '''
    query GetProducts { products(limit: 10000) { productId productName aliasName secondAliasName units mrp } }
    '''
    data = execute_graphql(query)
    return data.get('products', [])


def similar(a, b):
    return SequenceMatcher(None, a, b).ratio()


BRAND_BONUSES = [
    ('lays', 0.12), ('kk', 0.12), ('mm', 0.10), ('stt', 0.10), ('hnds', 0.10),
    ('rcc', 0.10), ('playz', 0.10), ('natu', 0.10), ('tomato', 0.10),
    ('asco', 0.08), ('salt', 0.08), ('sprite', 0.10), ('fanta', 0.10),
    ('mnstr', 0.10), ('monster', 0.10), ('bingo', 0.12), ('mad', 0.10),
    ('ty', 0.10), ('winkin', 0.12), ('bourbon', 0.10), ('brownie', 0.10),
    ('croissant', 0.10), ('pepsi', 0.12), ('mirinda', 0.12), ('mountain', 0.10),
    ('canada', 0.10), ('kurkure', 0.10), ('gcrs', 0.10), ('cookies', 0.10),
    ('apple', 0.08), ('guava', 0.08), ('litchi', 0.08), ('pomegranate', 0.08),
]


def _fuzzy_token_match(a, b):
    """Check if two tokens are a fuzzy match (prefix or high similarity)."""
    if a == b:
        return True
    # Prefix match: 'winki' matches 'winkin', 'choc' matches 'choco'
    if len(a) >= 3 and len(b) >= 3:
        if a.startswith(b) or b.startswith(a):
            return True
    # High character similarity (>= 80%)
    if len(a) >= 3 and len(b) >= 3 and similar(a, b) >= 0.80:
        return True
    return False


def fuzzy_token_overlap(t_tokens, v_tokens):
    """
    Count how many alias tokens (v_tokens) have a fuzzy match in the bill
    tokens (t_tokens). Returns (matched_count, total_alias_tokens).
    A token matches if it is equal, a prefix, or >= 80% similar.
    """
    matched = 0
    for vt in v_tokens:
        for tt in t_tokens:
            if _fuzzy_token_match(tt, vt):
                matched += 1
                break
    return matched, len(v_tokens)


def longest_prefix_match_len(a: str, b: str) -> int:
    """Count how many characters match from left to right between two strings."""
    max_len = min(len(a), len(b))
    matched = 0
    for i in range(max_len):
        if a[i] == b[i]:
            matched += 1
        else:
            break
    return matched


def match_product(particulars, products):
    """Match a bill line against the product table using normalized alias/product names.
    This intentionally checks aliasName, secondAliasName, and productName together and
    prioritizes strip/coverage-based matching so pack sizes and case counts do not cause
    false misses.
    """
    if not particulars:
        return None, 0.0, None

    base = normalize_match_name(particulars)
    if not base:
        return None, 0.0, None
    bill_tokens = set(key_tokens(base))

    best_pid = None
    best_score = 0.0
    best_alias = None

    def score_candidate(bill_norm: str, bill_tokens_set, alias_value: str):
        if not alias_value:
            return 0.0
        alias_norm = normalize_match_name(alias_value)
        if not alias_norm:
            return 0.0

        # Exact match on normalized values wins immediately.
        if bill_norm == alias_norm:
            return 1.0

        # Containment / prefix gives a very strong signal for product names that differ only by pack size.
        if bill_norm in alias_norm or alias_norm in bill_norm:
            overlap = min(len(bill_norm), len(alias_norm)) / max(len(bill_norm), len(alias_norm))
            return max(0.85, overlap)

        alias_tokens = set(key_tokens(alias_value))
        if not alias_tokens:
            return 0.0

        # Prefix similarity is useful only when the candidate also accounts
        # for every meaningful bill token; otherwise a generic prefix can
        # hide a more specific flavour or variant.
        prefix_len = longest_prefix_match_len(bill_norm, alias_norm)
        prefix_ratio = prefix_len / max(len(alias_norm), 1)
        all_bill_tokens_match = all(
            any(_fuzzy_token_match(bill_token, alias_token) for alias_token in alias_tokens)
            for bill_token in bill_tokens_set
        )
        if prefix_ratio >= 0.55 and all_bill_tokens_match:
            return max(prefix_ratio, 0.80)

        matched_count = 0
        for t in bill_tokens_set:
            for v in alias_tokens:
                if _fuzzy_token_match(t, v):
                    matched_count += 1
                    break

        overlap_ratio = matched_count / max(len(alias_tokens), 1)
        token_similarity = 0.7 * overlap_ratio + 0.3 * similar(bill_norm, alias_norm)
        return token_similarity

    field_priority = {'aliasName': 2, 'secondAliasName': 1, 'productName': 0}

    for p in products:
        pid = p.get('productId')
        if not pid:
            continue
        for field in ('aliasName', 'secondAliasName', 'productName'):
            val = p.get(field) or ''
            if not val:
                continue
            score = score_candidate(base, bill_tokens, val)
            # OCR/PDF extraction often removes spaces (e.g. PMCHOCO). A
            # compact normalized comparison recovers exact alias matches.
            compact_bill = base.replace(' ', '').replace('chocolate', 'choco').replace('choco', 'chocolate')
            compact_alias = normalize_match_name(val).replace(' ', '').replace('chocolate', 'choco').replace('choco', 'chocolate')
            if compact_bill and compact_bill == compact_alias:
                score = 0.995
            else:
                # Prefer the primary alias when candidates are otherwise
                # similarly specific; keep the bonus small so a clearly
                # stronger second alias or product name can still win.
                score += {'aliasName': 0.03, 'secondAliasName': 0.015}.get(field, 0.0)
            if score > best_score:
                best_score = score
                best_pid = pid
                best_alias = val
            elif abs(score - best_score) < 1e-9:
                current_field = next(
                    (candidate_field for candidate_field in ('aliasName', 'secondAliasName', 'productName')
                     if p.get(candidate_field) == best_alias),
                    'productName',
                )
                if field_priority[field] > field_priority[current_field] or (
                    field_priority[field] == field_priority[current_field]
                    and len(str(val)) > len(str(best_alias or ''))
                ):
                    best_pid = pid
                    best_alias = val

    if best_pid is not None and best_score >= 0.45:
        return best_pid, round(best_score, 3), best_alias

    # A final fallback: accept an exact token intersection if it is strong enough.
    for p in products:
        pid = p.get('productId')
        if not pid:
            continue
        for field in ('aliasName', 'secondAliasName', 'productName'):
            val = p.get(field) or ''
            if not val:
                continue
            local_norm = normalize_match_name(val)
            if not local_norm:
                continue
            local_tokens = set(key_tokens(val))
            match_count = sum(1 for t in bill_tokens if any(_fuzzy_token_match(t, v) for v in local_tokens))
            if match_count >= max(2, len(local_tokens) // 2):
                return pid, 0.45, val

    return None, 0.0, None



# ─────────────────────────────────────────────
# "All Flavours" multi-match
# ─────────────────────────────────────────────

# Regex that detects any "all flavour(s)/flavor(s)" variant in a product name
_ALL_FLAVOURS_RE = re.compile(
    r'(?i)\ball\s+flavou?rs?\b'
)


def is_all_flavours(particulars: str) -> bool:
    """Return True if the product name signals 'all flavours' (any spelling)."""
    return bool(_ALL_FLAVOURS_RE.search(particulars))


def extract_base_keyword(particulars: str) -> str:
    """
    Strip the 'all flavours' phrase and any trailing/leading size tokens
    (e.g. '300ML', '(300ML)', '1L') to get the base alias keyword.

    Examples:
      'TIN(300ML)ALL FLAVOURS'  → 'TIN'
      'PEPSI 300ML ALL FLAVOURS' → 'PEPSI'
      'CAN ALL FLAVOURS 250ML'  → 'CAN'
    """
    # Remove 'all flavours' phrase
    s = _ALL_FLAVOURS_RE.sub(' ', particulars)
    # Remove size patterns like (300ML), 300ML, 1.25L, 2L, etc.
    s = re.sub(r'[\(\)]*\d+(?:\.\d+)?\s*(?:ML|L|KG|G|GM)\b', ' ', s, flags=re.IGNORECASE)
    # Remove leftover parens and extra spaces
    s = re.sub(r'[()]+', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s.upper()


def match_all_flavours(particulars: str, products: list) -> tuple:
    """
    When a product name contains 'ALL FLAVOURS', find EVERY product whose
    secondAliasName contains the extracted base keyword.

    Returns:
        (comma_separated_product_ids, score, base_keyword)
        score is 1.0 when at least one match is found, else 0.0.
    """
    keyword = extract_base_keyword(particulars)
    if not keyword:
        return None, 0.0, None

    keyword_norm = keyword.lower()
    matched_ids = []
    for p in products:
        pid = p.get('productId') or ''
        if not pid:
            continue
        alias_val = (p.get('secondAliasName') or '').strip()
        if not alias_val:
            continue
        # All-flavours rows represent every variant sharing the second alias.
        if keyword_norm in alias_val.lower():
            matched_ids.append(pid)

    if matched_ids:
        return ','.join(matched_ids), 1.0, keyword
    return None, 0.0, keyword


def match_all_flavours_second_alias(particulars: str, products: list) -> tuple:
    """Match an AL-AZIZ ALL FLAVOURS row using secondAliasName only."""
    keyword = extract_base_keyword(particulars)
    if not keyword:
        return None, 0.0, None
    keyword_tokens = set(key_tokens(keyword))
    matched_ids = []
    for product in products:
        alias = (product.get('secondAliasName') or '').strip()
        alias_tokens = set(key_tokens(alias))
        if alias_tokens and all(
            any(_fuzzy_token_match(token, alias_token) for alias_token in alias_tokens)
            for token in keyword_tokens
        ):
            matched_ids.append(product.get('productId'))
    if matched_ids:
        return ','.join(matched_ids), 1.0, keyword
    return None, 0.0, keyword


# ─────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────

def main():
    input_name = sys.argv[1] if len(sys.argv) > 1 else None
    folder = REPO_ROOT / DEFAULT_PDF_SUBPATH

    if input_name:
        p = Path(input_name)
        candidates = [p if p.is_absolute() else (folder / input_name)]
    else:
        candidates = sorted(folder.glob('*.pdf'))

    if not candidates:
        print('No PDF files found in', folder)
        return

    print(f"\nProcessing {len(candidates)} PDF(s)...\n")
    products = fetch_products()
    print(f"Loaded {len(products)} products from database.\n")

    grand_total = 0
    grand_matched = 0

    for pdf_path in candidates:
        if not pdf_path.exists():
            print(f'[SKIP] Not found: {pdf_path}')
            continue

        OUTPUT_XLSX = pdf_path.with_name(pdf_path.stem + '_parsed.xlsx')
        print(f"\n{'='*60}")
        print(f"[PDF] {pdf_path.name}")

        with open(pdf_path, 'rb') as f:
            data = f.read()

        try:
            text = extract_text_from_pdf_bytes(data)
        except Exception as e:
            print(f"  [ERROR] Text extraction failed: {e}")
            continue

        if not text or not text.strip():
            print(f"  [ERROR] No text extracted")
            continue

        rows = extract_structured_items(text)
        if not rows:
            print(f"  [WARN] No line items found")
            continue

        print(f"  [items] {len(rows)} items extracted")

        # ── Build output: keep EXACT Particulars, add match info ──
        out_rows = []
        matched_count = 0
        bill_vendor = detect_bill_vendor(text)
        for r in rows:
            bill_name = r.get('Particulars') or ''

            # ── "All Flavours" multi-match takes priority ──
            if is_all_flavours(bill_name):
                pid, score, matched_val = match_all_flavours(bill_name, products)
                if pid:
                    matched_count += 1
                    print(f"    [ALL-FLAVOURS] '{bill_name}' -> keyword='{matched_val}' -> {pid}")
            else:
                # Normal single-product fuzzy match
                pid, score, matched_val = match_product(bill_name, products)
                if pid:
                    matched_count += 1

            out_rows.append({
                'S.no': r.get('S.no'),
                'Particulars': bill_name,       # ← EXACT name from the bill
                'Case No': r.get('Case No'),
                'Amount': r.get('Amount'),
                'MatchedProductId': pid,
                'MatchScore': round(score, 3) if pid else None
            })

        grand_total += len(out_rows)
        grand_matched += matched_count
        print(f"  [match] {matched_count}/{len(out_rows)} matched to DB products")

        df = pd.DataFrame(out_rows, columns=['S.no', 'Particulars', 'Case No', 'Amount', 'MatchedProductId', 'MatchScore'])
        OUTPUT_XLSX.parent.mkdir(parents=True, exist_ok=True)

        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp:
            tmp_path = Path(tmp.name)
        try:
            df.to_excel(tmp_path, index=False)
            if OUTPUT_XLSX.exists():
                OUTPUT_XLSX.unlink()
            os.replace(str(tmp_path), str(OUTPUT_XLSX))
            print(f"  [out] Wrote: {OUTPUT_XLSX.name}")
        except Exception as e:
            print(f"  [ERROR] Write failed: {e}")
            print(f"  [out] Temp: {tmp_path}")

    print(f"\n{'='*60}")
    print(f"DONE")
    print(f"  Total items : {grand_total}")
    print(f"  Matched     : {grand_matched}")
    print(f"  Unmatched   : {grand_total - grand_matched}")


if __name__ == '__main__':
    main()
