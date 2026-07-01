import fs from "fs";
import { Blob } from "buffer";

const BASE = "https://erpbackend.canaanglobalinternational.com";

// 1. Create a dummy driver to get an ID
const resCreate = await fetch(`${BASE}/drivers`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    driver_id: "TEST-SAMPLE-" + Math.floor(Math.random() * 10000),
    name: "Test Sample PDF",
    email: `testsample_${Math.floor(Math.random() * 10000)}@example.com`,
    username: `testsample_${Math.floor(Math.random() * 10000)}`,
    password: "pwd"
  })
});
const driver = await resCreate.json();
console.log("Created driver:", driver.id);

// 2. Read the sample.pdf
const filePath = "/Users/alanjoshua/Documents/Canaan-erp-v1/backend/sample.pdf";
const fileBuffer = fs.readFileSync(filePath);

// Node.js fetch FormData requires Blob (or fetch-blob if older node, but node 18+ has Blob)
const form = new FormData();
const fileContent = new Blob([fileBuffer], { type: "application/pdf" });
form.append("file", fileContent, "sample.pdf");

console.log("Uploading sample.pdf (size:", fileBuffer.length, "bytes)...");

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
