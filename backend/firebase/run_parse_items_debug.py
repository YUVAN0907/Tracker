from pathlib import Path
import sys
from routes_bills import extract_text_from_pdf_bytes, parse_bill_text_to_items

REPO_ROOT = Path(__file__).resolve().parents[2]
PDF_FOLDER = REPO_ROOT / 'APRIL BILLS' / 'APRIL BILLS'

if len(sys.argv) > 1:
    pdf = Path(sys.argv[1])
    if not pdf.is_absolute():
        pdf = PDF_FOLDER / pdf
else:
    print('Usage: python run_parse_items_debug.py <pdf_filename>')
    sys.exit(1)

print('PDF:', pdf)
with open(pdf, 'rb') as f:
    data = f.read()
text = extract_text_from_pdf_bytes(data)
print('Total text length:', len(text))
items = parse_bill_text_to_items(text)
print('Parsed items count:', len(items))
for i, it in enumerate(items, start=1):
    print(i, it)
