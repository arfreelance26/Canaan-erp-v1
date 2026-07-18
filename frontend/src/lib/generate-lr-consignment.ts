export type LRConsignmentData = {
  no: string;
  date: string;
  source: string;
  destination: string;
  truckNo: string;
  consignor: string;
  consignee: string;
  refNo: string;
  descriptionOfGoods: string;
  invoiceNo: string;
  sbBeNo: string;
  containerNo: string;
  sealNoOfPackages: string;
  tare: string;
  weight: string;
  value: string;
  toPay: boolean;
  toBeBilled: boolean;
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

function checkBox(checked: boolean): string {
  const bg = checked ? "background:#2c4179;" : "";
  const mark = checked
    ? `<span style="color:#fff;font-size:10px;font-weight:900;line-height:1;">&#10003;</span>`
    : "";
  return `<span style="display:inline-flex;align-items:center;justify-content:center;width:13px;height:13px;border:1.5px solid #2c4179;border-radius:2px;margin-right:6px;flex-shrink:0;${bg}">${mark}</span>`;
}

export async function generateLRConsignment(data: LRConsignmentData, tripId: string): Promise<void> {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const logoSrc = await toDataUrl(`${window.location.origin}/companylogo.png`);

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Consignment Note</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{--form-blue:#2c4179;--border-style:1.5px solid var(--form-blue);}
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Inter',system-ui,-apple-system,sans-serif;font-size:11px;font-weight:400;color:var(--form-blue);background:#fff;padding:0;margin:0;letter-spacing:-0.01em;}
.form-container{width:900px;background:#fff;border:2px solid var(--form-blue);}
.header-row{display:flex;border-bottom:var(--border-style);}
.header-col{padding:10px;border-right:var(--border-style);}
.header-col:last-child{border-right:none;}
.col-logo{width:32%;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;}
.company-logo-img{max-width:75px;height:auto;margin-bottom:6px;}
.company-name{font-size:13px;font-weight:700;letter-spacing:0.02em;line-height:1.3;}
.col-wheels{width:14%;font-weight:600;line-height:1.6;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;}
.col-address{width:24%;line-height:1.5;display:flex;flex-direction:column;justify-content:center;}
.col-contact{width:30%;display:flex;flex-direction:column;justify-content:center;gap:6px;}
.row-2{display:flex;border-bottom:var(--border-style);}
.col-sidebar{width:32%;border-right:var(--border-style);display:flex;flex-direction:column;}
.caution-box,.notice-box{padding:8px;text-align:justify;line-height:1.4;}
.caution-box{border-bottom:var(--border-style);}
.caution-box strong,.notice-box strong{display:block;text-align:center;margin-bottom:4px;font-size:11px;font-weight:700;letter-spacing:0.05em;}
.col-main-info{width:68%;display:flex;flex-direction:column;}
.info-top{display:flex;flex:1;border-bottom:var(--border-style);}
.cn-col{width:45%;border-right:var(--border-style);display:flex;flex-direction:column;}
.cn-top-cell{padding:8px;flex:3;border-bottom:var(--border-style);}
.cn-top-cell strong{display:block;text-align:center;font-size:13px;font-weight:700;margin-bottom:6px;letter-spacing:0.02em;}
.cn-bottom-cell{padding:8px;flex:2;display:flex;align-items:center;}
.copy-col{width:22%;border-right:var(--border-style);display:flex;align-items:center;justify-content:center;text-align:center;font-weight:700;font-size:12px;letter-spacing:0.02em;line-height:1.3;}
.routing-col{width:33%;display:flex;flex-direction:column;}
.route-cell{padding:6px 8px;flex:1;border-bottom:var(--border-style);display:flex;align-items:center;}
.route-cell:last-child{border-bottom:none;}
.route-label{width:70px;display:inline-block;font-weight:500;}
.info-bottom{display:flex;flex:1;}
.consignor-box,.consignee-box{width:50%;padding:8px;display:flex;flex-direction:column;gap:10px;}
.consignor-box{border-right:var(--border-style);}
.consignor-box strong,.consignee-box strong{display:block;text-align:center;font-size:11px;font-weight:700;letter-spacing:0.02em;}
.dot-line-row{display:flex;align-items:flex-end;width:100%;}
.dot-line-fill{flex-grow:1;border-bottom:1px dotted var(--form-blue);margin-left:4px;height:12px;}
.empty-dot-row{border-bottom:1px dotted var(--form-blue);width:100%;height:14px;margin-top:2px;}
.row-3{display:flex;border-bottom:var(--border-style);text-align:center;font-weight:600;background-color:#fafdff;letter-spacing:0.01em;}
.col-ref{width:15%;padding:6px;border-right:var(--border-style);}
.col-desc{width:70%;padding:6px;border-right:var(--border-style);}
.col-freight{width:15%;padding:6px;}
.row-4{display:flex;min-height:250px;border-bottom:var(--border-style);}
.body-ref{width:15%;border-right:var(--border-style);}
.body-desc{width:70%;border-right:var(--border-style);padding:10px;display:flex;flex-direction:column;justify-content:flex-end;}
.desc-footer{display:flex;justify-content:space-between;gap:24px;width:100%;}
.desc-left-details{width:55%;}
.desc-right-details{width:35%;}
.detail-item{display:flex;align-items:flex-end;margin-bottom:8px;width:100%;}
.detail-label{flex-shrink:0;font-weight:500;}
.desc-left-details .detail-label{width:105px;}
.desc-right-details .detail-label{width:45px;}
.detail-value{flex-grow:1;border-bottom:1px dotted var(--form-blue);margin-left:4px;min-height:12px;height:auto;font-weight:700;padding-bottom:1px;}
.body-freight{width:15%;padding:12px 8px;display:flex;flex-direction:column;gap:12px;}
.checkbox-item{display:flex;align-items:center;font-weight:600;}
.footer-row{display:flex;justify-content:space-between;align-items:center;padding:10px;font-weight:600;background-color:#fafdff;}
</style>
</head>
<body>
<div class="form-container">
  <div class="header-row">
    <div class="header-col col-logo">
      <img src="${logoSrc}" alt="Canaan Global Logo" class="company-logo-img">
      <div class="company-name">CANAAN GLOBAL INTERNATIONAL</div>
    </div>
    <div class="header-col col-wheels">
      <div>10 WHEELS</div><div>12 WHEELS</div><div>14 WHEELS</div>
      <div>20 FT. TRAILER</div><div>40 FT. TRAILER</div>
    </div>
    <div class="header-col col-address">
      3/602-124, Zion Nagar,<br>
      Opp. Emmanuel Deliver Church,<br>
      Theri Road, Pudukkottai,<br>
      Thoothukudi-628 103.
    </div>
    <div class="header-col col-contact">
      <div><strong>Tel.:</strong> 0461 2900881</div>
      <div><strong>E-mail:</strong><br>canaanglobal@canaanglobal.com</div>
    </div>
  </div>

  <div class="row-2">
    <div class="col-sidebar">
      <div class="caution-box">
        <strong>CAUTION</strong>
        This Consignment will not be detained diverted re-counted or re book without Consignee Bank's Written permission.
      </div>
      <div class="notice-box">
        <strong>NOTICE</strong>
        This Consignment covered by this set of Special Lorry Receipt from shall be stored at the destination under the control at the Transport Operator and shall be delivered to the order of the consignee bank whose name is mentioned in the Lorry Receipt it will under nor circumstance be delivered to any one without the written authority from the consignee Bank or its order endorsed on the Consignee Copy or on separate letter or Authority.
      </div>
    </div>
    <div class="col-main-info">
      <div class="info-top">
        <div class="cn-col">
          <div class="cn-top-cell">
            <strong>CONSIGNMENT NOTE</strong>
            <div class="dot-line-row">No.&nbsp;<span style="font-weight:700;">${esc(data.no)}</span><span class="dot-line-fill"></span></div>
          </div>
          <div class="cn-bottom-cell">
            <div class="dot-line-row">Date:&nbsp;<span style="font-weight:700;">${esc(data.date)}</span><span class="dot-line-fill"></span></div>
          </div>
        </div>
        <div class="copy-col">CONSIGNEE<br>COPY</div>
        <div class="routing-col">
          <div class="route-cell"><span class="route-label">Source</span>:&nbsp;<span style="font-weight:700;">${esc(data.source)}</span></div>
          <div class="route-cell"><span class="route-label">Destination</span>:&nbsp;<span style="font-weight:700;">${esc(data.destination)}</span></div>
          <div class="route-cell"><span class="route-label">Truck No.</span>:&nbsp;<span style="font-weight:700;">${esc(data.truckNo)}</span></div>
        </div>
      </div>
      <div class="info-bottom">
        <div class="consignor-box">
          <strong>CONSIGNOR</strong>
          <div class="dot-line-row">M/s.&nbsp;<span style="font-weight:700;">${esc(data.consignor)}</span><span class="dot-line-fill"></span></div>
          <div class="empty-dot-row"></div>
          <div class="empty-dot-row"></div>
        </div>
        <div class="consignee-box">
          <strong>CONSIGNEE</strong>
          <div class="dot-line-row">M/s.&nbsp;<span style="font-weight:700;">${esc(data.consignee)}</span><span class="dot-line-fill"></span></div>
          <div class="empty-dot-row"></div>
          <div class="empty-dot-row"></div>
        </div>
      </div>
    </div>
  </div>

  <div class="row-3">
    <div class="col-ref">Ref. No.</div>
    <div class="col-desc">Description of Goods (Said to Contain)</div>
    <div class="col-freight">FREIGHT (INR)</div>
  </div>

  <div class="row-4">
    <div class="body-ref" style="padding:10px;font-size:12px;font-weight:700;">${esc(data.refNo)}</div>
    <div class="body-desc">
      <div style="flex:1;padding-bottom:8px;font-weight:500;">${esc(data.descriptionOfGoods)}</div>
      <div class="desc-footer">
        <div class="desc-left-details">
          <div class="detail-item">
            <span class="detail-label">Invoice No.</span>:
            <span class="detail-value">&nbsp;${esc(data.invoiceNo)}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">S.B. / B.E. No.</span>:
            <span class="detail-value">&nbsp;${esc(data.sbBeNo)}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Container No.</span>:
            <span class="detail-value">&nbsp;${esc(data.containerNo)}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Seal No. of Packages</span>:
            <span class="detail-value">&nbsp;${esc(data.sealNoOfPackages)}</span>
          </div>
        </div>
        <div class="desc-right-details">
          <div class="detail-item">
            <span class="detail-label">Tare</span>:
            <span class="detail-value">&nbsp;${esc(data.tare)}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Weight</span>:
            <span class="detail-value">&nbsp;${esc(data.weight)}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Value</span>:
            <span class="detail-value">&nbsp;${esc(data.value)}</span>
          </div>
        </div>
      </div>
    </div>
    <div class="body-freight">
      <label class="checkbox-item">${checkBox(data.toPay)} To Pay</label>
      <label class="checkbox-item">${checkBox(data.toBeBilled)} To be billed</label>
    </div>
  </div>

  <div class="footer-row">
    <div>Goods are booked at Owner's Risk &amp; Responsibility</div>
    <div>For CANAAN GLOBAL INTERNATIONAL</div>
  </div>
</div>
</body>
</html>`;

  const blobURL = URL.createObjectURL(new Blob([htmlContent], { type: "text/html" }));
  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:fixed;top:-9999px;left:-9999px;width:960px;height:1600px;border:none;visibility:hidden;";
  document.body.appendChild(iframe);

  try {
    await new Promise<void>((resolve, reject) => {
      iframe.onload = () => resolve();
      iframe.onerror = () => reject(new Error("iframe failed to load"));
      iframe.src = blobURL;
    });

    // Wait for fonts
    await new Promise((r) => setTimeout(r, 1200));

    const iframeDoc = iframe.contentDocument!;
    const targetEl = iframeDoc.querySelector(".form-container") as HTMLElement;

    const canvas = await html2canvas(targetEl, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
    });

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgH = (canvas.height * pageW) / canvas.width;

    if (imgH <= pageH) {
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, pageW, imgH);
    } else {
      const sliceHPx = Math.round((pageH * canvas.width) / pageW);
      let srcY = 0;
      while (srcY < canvas.height) {
        const h = Math.min(sliceHPx, canvas.height - srcY);
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
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

    pdf.save(`LR-${tripId}.pdf`);
  } finally {
    iframe.remove();
    URL.revokeObjectURL(blobURL);
  }
}
