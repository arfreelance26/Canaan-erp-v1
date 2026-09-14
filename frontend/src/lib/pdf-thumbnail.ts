// Renders page 1 of a PDF (given its raw bytes) to a PNG data URL — used for
// the WhatsApp-style document preview card in chat (thumbnail + page count).
// Fully client-side: pdf.js's worker is loaded as a bundled asset, not fetched
// from a CDN, so this works the same in the static-exported build.
import * as pdfjsLib from "pdfjs-dist";

let workerConfigured = false;
function ensureWorker() {
  if (workerConfigured) return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
  workerConfigured = true;
}

export async function renderPdfThumbnail(
  bytes: ArrayBuffer,
  maxWidth = 320
): Promise<{ dataUrl: string; numPages: number }> {
  ensureWorker();
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  try {
    const doc = await loadingTask.promise;
    const page = await doc.getPage(1);
    const unscaled = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: maxWidth / unscaled.width });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);

    await page.render({ canvas, viewport }).promise;
    return { dataUrl: canvas.toDataURL("image/png"), numPages: doc.numPages };
  } finally {
    await loadingTask.destroy();
  }
}
