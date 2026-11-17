import { put } from "@vercel/blob";
import { json, blobOpts } from "./_auth.js";

const MAX_BYTES = 4 * 1024 * 1024; // tarayıcı fotoğrafı yüklemeden önce küçültüyor
const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function POST(request) {
  const type = (request.headers.get("content-type") || "").split(";")[0].trim();
  if (!TYPES[type]) return json({ error: "Sadece fotoğraf yüklenebilir" }, 415);

  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BYTES) return json({ error: "Fotoğraf çok büyük" }, 413);

  const buf = Buffer.from(await request.arrayBuffer());
  if (!buf.length) return json({ error: "Boş dosya" }, 400);
  if (buf.length > MAX_BYTES) return json({ error: "Fotoğraf çok büyük" }, 413);

  // İsteğe bağlı kısa not (en fazla 140 karakter), dosya adının içine eklenir
  let raw = "";
  try { raw = decodeURIComponent(request.headers.get("x-not") || ""); } catch {}
  const note = raw.replace(/[^\p{L}\p{N} ]/gu, "").trim().replace(/\s+/g, "_").slice(0, 80);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const slug = note ? "__" + note : "";

  let blob;
  try {
    blob = await put(`uploads/${stamp}${slug}.${TYPES[type]}`, buf, {
    access: "private",
    contentType: type,
    addRandomSuffix: true,
    ...blobOpts(),
  });
  } catch (e) {
    console.error(e);
    return json({ error: "Fotoğraf kaydedilemedi" }, 500);
  }
  return json({ ok: true, pathname: blob.pathname });
}
