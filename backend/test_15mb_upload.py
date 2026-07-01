import requests
import uuid

driver_payload = {
  "driver_id": f"TEST-{uuid.uuid4().hex[:6]}",
  "name": "Test 15MB",
  "email": f"test_{uuid.uuid4().hex[:6]}@example.com",
  "username": f"test_{uuid.uuid4().hex[:6]}",
  "password": "pwd"
}
res = requests.post("https://erpbackend.canaanglobalinternational.com/drivers", json=driver_payload)
driver_id = res.json()["id"]

data = b"0" * (15 * 1024 * 1024)
files = {'file': ('large.pdf', data, 'application/pdf')}
res = requests.post(f"https://erpbackend.canaanglobalinternational.com/files/drivers/{driver_id}/aadhaar", files=files)
print("15MB Upload status:", res.status_code)
print("Response:", res.text)
