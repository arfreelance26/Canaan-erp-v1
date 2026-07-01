import requests
import os

# Create a 2MB dummy file
data = b"0" * (2 * 1024 * 1024)

files = {'file': ('large.jpg', data, 'image/jpeg')}
res = requests.post("https://erpbackend.canaanglobalinternational.com/files/drivers/9/photo", files=files)
print("Upload status for 2MB file:", res.status_code)
print("Response:", res.text)
