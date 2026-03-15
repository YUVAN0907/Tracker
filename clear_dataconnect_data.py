"""
Custom Script: clear_dataconnect_data.py
Deletes all data from DataConnect using GraphQL mutations defined in migrate_excel_to_dataconnect.py.
"""

import sys
import os

# Ensure the backend/firebase directory is in the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend', 'firebase'))

from migrate_excel_to_dataconnect import clear_all_data

if __name__ == "__main__":
    print("Starting DataConnect data deletion...")
    clear_all_data(dry_run=False)
    print("All DataConnect data deleted.")
