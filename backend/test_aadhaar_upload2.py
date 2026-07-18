import requests
import uuid

# 1. Create a dummy driver to get an ID
driver_payload = {
  "driver_id": f"TEST-{uuid.uuid4().hex[:6]}",
  "name": "Test Upload",
  "email": f"test_{uuid.uuid4().hex[:6]}@example.com",
  "username": f"test_{uuid.uuid4().hex[:6]}",
  "password": "pwd"
}
res = requests.post("https://erpbackend.canaanglobalinternational.com/drivers", json=driver_payload)
driver_id = res.json()["id"]

# 2. Upload
files = {'file': ('test.pdf', b'PDF CONTENT', 'application/pdf')}
res = requests.post(f"https://erpbackend.canaanglobalinternational.com/files/drivers/{driver_id}/aadhaar", files=files)
print("Upload status:", res.status_code)
if res.status_code != 204:
    print("Upload error:", res.text)
else:
    print("Upload successful!")

# 3. Download
res = requests.get(f"https://erpbackend.canaanglobalinternational.com/files/drivers/{driver_id}/aadhaar")
print("Download status:", res.status_code)
if res.status_code == 200:
    print("Content:", res.text)
else:
    print("Download error:", res.text)
