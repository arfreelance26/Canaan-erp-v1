import requests

# 1. Create a dummy driver to get an ID
print("Creating driver...")
driver_payload = {
  "driver_id": "TEST-UPLOAD-1",
  "name": "Test Upload",
  "email": "testupload@example.com",
  "username": "testupload",
  "password": "pwd"
}
res = requests.post("https://erpbackend.canaanglobalinternational.com/drivers", json=driver_payload)
if res.status_code != 201:
    print("Failed to create driver:", res.text)
    exit(1)

driver_id = res.json()["id"]
print("Created driver with ID:", driver_id)

# 2. Upload a file
print("Uploading file...")
files = {'file': ('test.txt', b'Hello world', 'text/plain')}
res = requests.post(f"https://erpbackend.canaanglobalinternational.com/files/drivers/{driver_id}/photo", files=files)
print("Upload status:", res.status_code)
if res.status_code != 204:
    print("Upload error:", res.text)
else:
    print("Upload successful!")

# 3. Download the file
print("Downloading file...")
res = requests.get(f"https://erpbackend.canaanglobalinternational.com/files/drivers/{driver_id}/photo")
print("Download status:", res.status_code)
if res.status_code == 200:
    print("Content:", res.text)
else:
    print("Download error:", res.text)
