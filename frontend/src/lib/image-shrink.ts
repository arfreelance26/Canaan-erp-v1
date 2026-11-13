/**
 * Shrinks a pasted or picked picture before upload: at most `maxSide` pixels
 * on its longer side, re-encoded (WEBP keeps transparency, else JPEG). GIFs
 * are left alone so animations survive. If shrinking doesn't help, or the
 * browser can't decode the file, the original comes back unchanged — the
 * server still checks the real type and size.
 */
export async function shrinkImage(file: File, maxSide = 1600, quality = 0.85): Promise<File> {
  if (file.type === "image/gif" || typeof createImageBitmap !== "function") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    if (scale === 1 && file.size <= 400_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const type = file.type === "image/png" ? "image/webp" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
    if (!blob || blob.size >= file.size) return file;
    const base = (file.name || "image").replace(/\.[a-z0-9]+$/i, "");
    return new File([blob], `${base}.${type === "image/webp" ? "webp" : "jpg"}`, { type });
  } finally {
    bitmap.close();
  }
}
