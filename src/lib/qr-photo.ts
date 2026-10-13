/**
 * Photo-based QR decoding — the no-WebRTC fallback for both Sonafi scanners.
 *
 * Some phones / in-app browsers block getUserMedia entirely (camera API),
 * which makes the live scanner unusable. This helper takes a *photo file*
 * (native camera app or gallery, via <input type="file" accept="image/*">)
 * and decodes the QR code in pure JS with jsQR — no special permissions
 * required, works everywhere the file picker works.
 */

/** Longest canvas edge for the first decode attempt (fast, plenty for badges). */
const SCALE_FAST = 1400;

/** Second attempt at higher resolution for dense / distant shots. */
const SCALE_FINE = 2400;

async function decodeAtScale(
  source: ImageBitmap | HTMLImageElement,
  width: number,
  height: number,
  maxEdge: number,
): Promise<string | null> {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const cw = Math.max(1, Math.round(width * scale));
  const ch = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(source, 0, 0, cw, ch);
  const frame = ctx.getImageData(0, 0, cw, ch);

  // Lazy-loaded so the ~80 KB decoder stays out of the initial bundle.
  const { default: jsQR } = await import("jsqr");
  const code = jsQR(frame.data, cw, ch);
  return code?.data ?? null;
}

/**
 * Decode the first QR code found in an image file.
 * Returns the decoded string, or null when no QR is detected.
 */
export async function decodeQrFromFile(file: File): Promise<string | null> {
  let bitmap: ImageBitmap | HTMLImageElement | null = null;
  let objectUrl: string | null = null;

  try {
    if (typeof createImageBitmap === "function") {
      bitmap = await createImageBitmap(file).catch(() => null);
    }
    if (!bitmap) {
      // Fallback for older Safari: HTMLImageElement + object URL.
      objectUrl = URL.createObjectURL(file);
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("image-load-failed"));
        img.src = objectUrl as string;
      });
      bitmap = img;
    }

    const w = bitmap.width;
    const h = bitmap.height;
    if (!w || !h) return null;

    // Two passes: fast first, high-resolution retry if nothing was found.
    return (
      (await decodeAtScale(bitmap, w, h, SCALE_FAST)) ??
      (await decodeAtScale(bitmap, w, h, SCALE_FINE))
    );
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    if (bitmap && "close" in bitmap) bitmap.close();
  }
}
