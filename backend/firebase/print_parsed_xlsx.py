"""
print_parsed_xlsx.py
====================
Pretty-prints a previously generated *_parsed.xlsx file in the terminal.

Usage:
    python print_parsed_xlsx.py <pdf_filename_or_xlsx_path>
    python print_parsed_xlsx.py --all          # prints ALL *_parsed.xlsx in APRIL BILLS

Options:
    --all     Iterate every *_parsed.xlsx in the APRIL BILLS folder and print each.
"""

import sys
from pathlib import Path
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
PDF_FOLDER = REPO_ROOT / 'APRIL BILLS' / 'APRIL BILLS'

# ─────────────────────────────────────────────
# Match quality label
# ─────────────────────────────────────────────

def quality_label(score, matched_id=None):
    # Multi-product match (ALL FLAVOURS) — comma-separated ids
    if matched_id and isinstance(matched_id, str) and ',' in matched_id:
        return '[ ALL]'
    if score is None or (isinstance(score, float) and pd.isna(score)):
        return '[MISS]'
    try:
        s = float(score)
    except Exception:
        return '[MISS]'
    if s >= 0.75:
        return '[ OK ]'
    if s >= 0.50:
        return '[WARN]'
    return '[MISS]'


# ─────────────────────────────────────────────
# Print one xlsx
# ─────────────────────────────────────────────

def print_xlsx(xlsx_path: Path):
    if not xlsx_path.exists():
        print(f'  [ERROR] File not found: {xlsx_path}')
        return

    try:
        df = pd.read_excel(xlsx_path)
    except PermissionError:
        print(f'  [SKIP] File is open/locked (close it in Excel): {xlsx_path.name}')
        return
    except Exception as e:
        print(f'  [ERROR] Could not read {xlsx_path.name}: {e}')
        return

    total = len(df)

    matched = 0
    unmatched = 0
    if 'MatchedProductId' in df.columns:
        # Count rows with any non-null/non-empty value as matched
        matched = df['MatchedProductId'].apply(
            lambda v: bool(v and str(v).strip() not in ('', 'nan', 'None'))
        ).sum()
        unmatched = total - matched
    elif 'MatchScore' in df.columns:
        matched = (df['MatchScore'].fillna(0) >= 0.50).sum()
        unmatched = total - matched

    print(f"\n{'='*70}")
    print(f"  FILE : {xlsx_path.name}")
    print(f"  ROWS : {total}   MATCHED: {matched}   UNMATCHED: {unmatched}")
    print(f"{'='*70}")

    col_widths = {
        'S.no': 5,
        'Particulars': 38,
        'Case No': 8,
        'Amount': 12,
        'MatchedProductId': 40,   # wider: multi-id strings can be long
        'MatchScore': 10,
    }

    # Header row
    has_score = 'MatchScore' in df.columns
    header_parts = [
        f"{'Q':7}",
        f"{'Sno':5}",
        f"{'Particulars':<38}",
        f"{'Cases':>8}",
        f"{'Amount':>12}",
    ]
    if has_score:
        header_parts.append(f"{'Score':>8}")
    if 'MatchedProductId' in df.columns:
        header_parts.append(f"{'MatchedId':<40}")

    print('  ' + '  '.join(header_parts))
    print('  ' + '-' * 115)

    for _, row in df.iterrows():
        score = row.get('MatchScore', None)
        pid_val = str(row.get('MatchedProductId', '') or '').strip()
        ql = quality_label(score, pid_val) if has_score else '      '

        sno = str(row.get('S.no', '')).strip()
        particulars = str(row.get('Particulars', '')).strip()
        if len(particulars) > 38:
            particulars = particulars[:35] + '...'
        case_no = str(row.get('Case No', '')).strip()
        amount = row.get('Amount', '')
        try:
            amount_str = f"{float(str(amount).replace(',', '')):>12,.2f}" if amount != '' else f"{'':>12}"
        except Exception:
            amount_str = f"{str(amount):>12}"

        parts = [
            f"{ql:7}",
            f"{sno:5}",
            f"{particulars:<38}",
            f"{case_no:>8}",
            amount_str,
        ]
        if has_score:
            score_str = f"{float(score):>8.3f}" if score is not None and not (isinstance(score, float) and pd.isna(score)) else f"{'N/A':>8}"
            parts.append(score_str)
        if 'MatchedProductId' in df.columns:
            # For multi-id (ALL FLAVOURS), show count summary + truncated list
            if ',' in pid_val:
                ids = pid_val.split(',')
                display = f"[{len(ids)} ids] {','.join(ids[:3])}{'...' if len(ids) > 3 else ''}"
            else:
                display = pid_val
            display = display[:40] if len(display) > 40 else display
            parts.append(f"{display:<40}")

        print('  ' + '  '.join(parts))

    print()
    print(f"  Legend:  [ OK ] score >= 0.75   [WARN] score 0.50-0.75   [MISS] unmatched   [ ALL] all-flavours multi-match")
    print()


# ─────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────

def resolve_xlsx(arg: str) -> Path:
    """Resolve an argument (pdf name or xlsx path) to a *_parsed.xlsx Path."""
    p = Path(arg)
    if p.suffix.lower() == '.xlsx':
        if not p.is_absolute():
            p = PDF_FOLDER / p
        return p
    # Treat as PDF name
    if not p.is_absolute():
        p = PDF_FOLDER / p
    return p.parent / (p.stem + '_parsed.xlsx')


if __name__ == '__main__':
    args = sys.argv[1:]

    if not args:
        print('Usage:')
        print('  python print_parsed_xlsx.py <pdf_or_xlsx_filename>')
        print('  python print_parsed_xlsx.py --all')
        sys.exit(1)

    if '--all' in args:
        xlsx_files = sorted(PDF_FOLDER.glob('*_parsed.xlsx'))
        if not xlsx_files:
            print(f'No *_parsed.xlsx files found in {PDF_FOLDER}')
            print('Run parse_and_match_bill.py first to generate them.')
            sys.exit(1)
        print(f'\nFound {len(xlsx_files)} parsed file(s) in {PDF_FOLDER}')
        for f in xlsx_files:
            print_xlsx(f)
    else:
        xlsx = resolve_xlsx(args[0])
        print_xlsx(xlsx)
