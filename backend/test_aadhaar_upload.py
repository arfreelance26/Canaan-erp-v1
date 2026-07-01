import requests

files = {'file': ('test.pdf', b'PDF CONTENT', 'application/pdf')}
res = requests.post("https://erpbackend.canaanglobalinternational.com/files/drivers/9/aadhaar", files=files)
print("Upload status:", res.status_code)
if res.status_code != 204:
    print("Upload error:", res.text)
else:
    print("Upload successful!")

# Download
res = requests.get("https://erpbackend.canaanglobalinternational.com/files/drivers/9/aadhaar")
print("Download status:", res.status_code)
if res.status_code == 200:
    print("Content:", res.text)
else:
    print("Download error:", res.text)
