export type CABData = {
  customerName: string;
  vehicleNo: string;
  tripId: string;
  bookingDate: string;   // YYYY-MM-DD
  voucherNo: string;
  refNo: string;         // invoice number
  amount: string;        // raw numeric string e.g. "21078"
  paymentType: string;   // "Cash" or "Credit"
  logoSrc: string;
};

function esc(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function toDataUrl(url: string): Promise<string> {
  try {
    const r = await fetch(url);
    const b = await r.blob();
    return await new Promise<string>((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result as string);
      reader.onerror = rej;
      reader.readAsDataURL(b);
    });
  } catch {
    return url;
  }
}

function fmtDate(d: string): string {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}-${m}-${y}`;
}

function fmtAmt(val: string): string {
  const n = parseFloat(val) || 0;
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function numberToWords(amount: number): string {
  if (!amount || isNaN(amount)) return "Rupees Zero Only";
  const ones = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten",
    "Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const tens = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  function inWords(n: number): string {
    if (n === 0) return "";
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + inWords(n % 100) : "");
  }
  const intPart  = Math.floor(amount);
  const paise    = Math.round((amount - intPart) * 100);
  const crore    = Math.floor(intPart / 10000000);
  const lakh     = Math.floor((intPart % 10000000) / 100000);
  const thousand = Math.floor((intPart % 100000) / 1000);
  const rest     = intPart % 1000;
  const parts: string[] = [];
  if (crore)    parts.push(inWords(crore)    + " Crore");
  if (lakh)     parts.push(inWords(lakh)     + " Lakh");
  if (thousand) parts.push(inWords(thousand) + " Thousand");
  if (rest)     parts.push(inWords(rest));
  let result = "Rupees " + (parts.join(" ") || "Zero");
  if (paise) result += " and " + inWords(paise) + " Paise";
  return result + " Only";
}

export function buildCABHtml(data: CABData): string {
  const amtNum       = parseFloat(data.amount) || 0;
  const amtDisplay   = fmtAmt(data.amount);
  const amtInWords   = numberToWords(amtNum);
  const dateDisplay  = fmtDate(data.bookingDate);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Customer Advance Voucher - Canaan Global International</title>
<style>
:root{--primary-navy:#1b365d;--border-color:#d8d8d8;--text-dark:#111111;--text-muted:#666666;--bg-light:#f8f9fa;}
*{box-sizing:border-box;font-family:'Segoe UI',Arial,Helvetica,sans-serif;}
body{background-color:#f4f4f4;margin:0;padding:30px;display:flex;justify-content:center;}
.voucher-card{width:880px;background:#ffffff;padding:30px;border:1px solid var(--border-color);box-shadow:0 4px 15px rgba(0,0,0,0.05);}
.bold{font-weight:700;}.text-right{text-align:right;}.text-center{text-align:center;}.text-left{text-align:left;}
.text-navy{color:var(--primary-navy);}.mb-10{margin-bottom:10px;}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:15px;}
.company-title{font-size:26px;font-weight:900;color:var(--text-dark);letter-spacing:0.5px;margin:0;}
.tagline{color:#c09228;font-size:10px;font-weight:bold;letter-spacing:2px;margin:4px 0 8px 0;}
.company-details{font-size:11px;color:var(--text-dark);line-height:1.4;}
.gst-pan{font-size:11px;font-weight:bold;margin-top:6px;color:#000;}
.logo-container img{max-height:85px;width:auto;}
.voucher-banner{background-color:var(--primary-navy);color:#ffffff;text-align:center;font-weight:700;font-size:16px;letter-spacing:1.5px;padding:10px 0;border-radius:2px;margin-bottom:15px;}
.meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:15px;border:1px solid var(--border-color);padding:12px 15px;background-color:var(--bg-light);margin-bottom:15px;border-radius:2px;}
.meta-col{display:flex;flex-direction:column;gap:6px;font-size:12px;}
.info-row{display:flex;}
.info-label{width:110px;color:var(--text-muted);font-weight:600;}
.info-val{color:var(--text-dark);font-weight:700;}
.data-table{width:100%;border-collapse:collapse;margin-bottom:15px;}
.data-table th{background-color:var(--primary-navy);color:#ffffff;padding:9px 12px;font-size:12px;font-weight:600;letter-spacing:0.5px;}
.data-table td{border:1px solid var(--border-color);padding:12px;font-size:13px;}
.particulars-cell{height:80px;vertical-align:top;line-height:1.5;}
.bottom-section{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-top:10px;}
.left-details{flex:1;}
.structured-box{border:1px solid var(--border-color);background-color:var(--bg-light);padding:10px 12px;margin-bottom:10px;border-radius:2px;}
.box-title{font-size:10px;font-weight:bold;color:var(--text-muted);letter-spacing:0.5px;margin-bottom:6px;}
.box-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px;}
.amount-words-box{border:1px solid var(--border-color);padding:10px 12px;font-size:11px;border-radius:2px;}
.right-summary{width:320px;display:flex;flex-direction:column;align-items:flex-end;}
.signature-box{text-align:center;width:220px;margin-bottom:18px;}
.signature-line{border-bottom:1px solid #777777;margin-bottom:6px;height:25px;}
.signature-label{font-size:11px;font-weight:600;color:var(--text-dark);}
.signature-subtext{font-size:9px;color:var(--text-muted);margin-top:3px;line-height:1.3;}
.grand-total-card{width:100%;background-color:var(--primary-navy);color:#ffffff;padding:12px 16px;border-radius:2px;display:flex;justify-content:space-between;align-items:center;}
.grand-total-label{font-size:11px;font-weight:bold;letter-spacing:1px;}
.grand-total-value{font-size:22px;font-weight:bold;}
.footer-note{margin-top:25px;padding-top:12px;border-top:1px dashed var(--border-color);text-align:center;font-size:7px;font-weight:600;color:var(--text-muted);letter-spacing:0.3px;}
.text-muted{color:var(--text-muted);}
</style>
</head>
<body>
<div class="voucher-card">

  <div class="header">
    <div class="company-info">
      <h1 class="company-title">CANAAN GLOBAL INTERNATIONAL</h1>
      <div class="tagline">COMMIT &nbsp;·&nbsp; ENDURE &nbsp;·&nbsp; ACHIEVE &nbsp;·&nbsp; SATISFY</div>
      <div class="company-details">
        3/802-124, 2nd Floor, Emmanuel Belivers Church, Zion Nagar, Theri Road, Puthukottai, Tuticorin - 628103. Tamil Nadu, Code: 33<br>
        Tel: 0461 2900886 &nbsp;&nbsp; Email: canaanglobal@canaanglobal.com
      </div>
      <div class="gst-pan">GSTIN: 33AAJFC9781F1Z8 &nbsp;&nbsp; PAN No: AAJFC9781F</div>
    </div>
    <div class="logo-container">
      <img src="${esc(data.logoSrc)}" alt="Canaan Global Logo">
    </div>
  </div>

  <div class="voucher-banner">CUSTOMER ADVANCE VOUCHER</div>

  <div class="meta-grid">
    <div class="meta-col">
      <div class="info-row"><span class="info-label">Customer:</span><span class="info-val">${esc(data.customerName)}</span></div>
      <div class="info-row"><span class="info-label">Vehicle No:</span><span class="info-val">${esc(data.vehicleNo)}</span></div>
      <div class="info-row"><span class="info-label">Trip No:</span><span class="info-val">${esc(data.tripId)}</span></div>
    </div>
    <div class="meta-col">
      <div class="info-row"><span class="info-label">Date:</span><span class="info-val">${esc(dateDisplay)}</span></div>
      <div class="info-row"><span class="info-label">Voucher No:</span><span class="info-val">${esc(data.voucherNo)}</span></div>
      <div class="info-row"><span class="info-label">Ref. No:</span><span class="info-val">${esc(data.refNo)}</span></div>
    </div>
  </div>

  <table class="data-table">
    <thead>
      <tr>
        <th style="width:75%;" class="text-left">DESCRIPTION</th>
        <th style="width:25%;" class="text-right">AMOUNT (INR)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="particulars-cell text-left">
          <div class="bold">Customer Advance</div>
          <div style="font-size:11px;color:#555;margin-top:4px;">
            Customer advance paid against Trip Ref: ${esc(data.refNo || data.tripId)}
          </div>
        </td>
        <td class="particulars-cell text-right bold">&#8377; ${esc(amtDisplay)}</td>
      </tr>
    </tbody>
  </table>

  <div class="bottom-section">
    <div class="left-details">
      <div class="structured-box">
        <div class="box-title">TRANSACTION BREAKDOWN</div>
        <div class="box-grid">
          <div><span class="text-muted">Vehicle No:</span> <span class="bold">${esc(data.vehicleNo)}</span></div>
          <div><span class="text-muted">Trip No:</span> <span class="bold">${esc(data.tripId)}</span></div>
          <div><span class="text-muted">Payment Type:</span> <span class="bold">${esc(data.paymentType)}</span></div>
          <div><span class="text-muted">Amount:</span> <span class="bold">&#8377;${esc(amtDisplay)}</span></div>
        </div>
      </div>
      <div class="amount-words-box">
        <div class="bold text-muted mb-10" style="font-size:10px;">AMOUNT IN WORDS:</div>
        <div class="bold text-navy" style="font-size:12px;">${esc(amtInWords)}</div>
      </div>
    </div>

    <div class="right-summary">
      <div class="signature-box">
        <div class="signature-line"></div>
        <div class="signature-label">Authorised Signatory</div>
        <div class="signature-subtext">This is a computer generated voucher.<br>No signature required.</div>
      </div>
      <div class="grand-total-card">
        <span class="grand-total-label">TOTAL AMOUNT</span>
        <span class="grand-total-value">&#8377; ${esc(amtDisplay)}</span>
      </div>
    </div>
  </div>

  <div class="footer-note">
    Serving you is our privilege Thank You - Canaan Global International
  </div>

</div>
</body>
</html>`;
}

export async function generateCABPdf(data: Omit<CABData, "logoSrc">, tripId: string): Promise<void> {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const logoSrc     = await toDataUrl(`${window.location.origin}/companylogo.png`);
  const htmlContent = buildCABHtml({ ...data, logoSrc });

  const blobURL = URL.createObjectURL(new Blob([htmlContent], { type: "text/html" }));
  const iframe  = document.createElement("iframe");
  iframe.style.cssText =
    "position:fixed;top:-9999px;left:-9999px;width:960px;height:1400px;border:none;visibility:hidden;";
  document.body.appendChild(iframe);

  try {
    await new Promise<void>((resolve, reject) => {
      iframe.onload  = () => resolve();
      iframe.onerror = () => reject(new Error("iframe failed to load"));
      iframe.src = blobURL;
    });

    await new Promise((r) => setTimeout(r, 1200));

    const iframeDoc = iframe.contentDocument!;
    const targetEl  = iframeDoc.querySelector(".voucher-card") as HTMLElement;

    const canvas = await html2canvas(targetEl, {
      scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff",
    });

    const pdf   = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgH  = (canvas.height * pageW) / canvas.width;

    if (imgH <= pageH) {
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, pageW, imgH);
    } else {
      const sliceHPx = Math.round((pageH * canvas.width) / pageW);
      let srcY = 0;
      while (srcY < canvas.height) {
        const h     = Math.min(sliceHPx, canvas.height - srcY);
        const slice = document.createElement("canvas");
        slice.width  = canvas.width;
        slice.height = sliceHPx;
        const ctx = slice.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, slice.width, slice.height);
        ctx.drawImage(canvas, 0, srcY, canvas.width, h, 0, 0, canvas.width, h);
        pdf.addImage(slice.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, pageW, pageH);
        srcY += sliceHPx;
        if (srcY < canvas.height) pdf.addPage();
      }
    }

    pdf.save(`CAB-${tripId}.pdf`);
  } finally {
    document.body.removeChild(iframe);
    URL.revokeObjectURL(blobURL);
  }
}
