import fs from "fs";

const BASE = "https://erpbackend.canaanglobalinternational.com";

// 1. Create a dummy driver to get an ID
const resCreate = await fetch(`${BASE}/drivers`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    driver_id: "TEST-FRONTEND-" + Math.floor(Math.random() * 10000),
    name: "Test Frontend",
    email: `testfrontend_${Math.floor(Math.random() * 10000)}@example.com`,
    username: `testfrontend_${Math.floor(Math.random() * 10000)}`,
    password: "pwd"
  })
});
const driver = await resCreate.json();
console.log("Created driver:", driver.id);

// 2. Upload file using FormData (Node.js 18+ has native fetch and FormData)
const form = new FormData();
const fileContent = new Blob(["PDF CONTENT"], { type: "application/pdf" });
// Mock a File object
form.append("file", fileContent, "test.pdf");

const resUpload = await fetch(`${BASE}/files/drivers/${driver.id}/aadhaar`, {
  method: "POST",
  body: form
});

console.log("Upload status:", resUpload.status);
if (!resUpload.ok) {
    console.log("Upload error:", await resUpload.text());
} else {
    console.log("Upload successful!");
}
