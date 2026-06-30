import requests
import json

payload = {
  "driver_id": "DRV-TEST1",
  "name": "Test Driver",
  "aadhaar_number": None,
  "aadhaar_file_name": None,
  "date_of_birth": None,
  "date_of_joining": None,
  "email": None,
  "contact_number": None,
  "address": None,
  "branch": None,
  "license_number": None,
  "license_expiry_date": None,
  "license_file_name": None,
  "form_11": None,
  "esi_number": None,
  "pan_number": None,
  "agreement_signed": None,
  "bank_name": None,
  "bank_branch_name": None,
  "account_number": None,
  "ifsc_code": None,
  "photo_url": None,
  "username": None,
  "password": "password123"
}

try:
    # Test on production
    res = requests.post("https://erpbackend.canaanglobalinternational.com/drivers", json=payload)
    print("Status:", res.status_code)
    print("Response:", res.text)
except Exception as e:
    print("Error:", e)
