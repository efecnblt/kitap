import { randomUUID } from "node:crypto";
import { put, get, list, del } from "@vercel/blob";
import { checkPassword, json, blobOpts } from "./_auth.js";
import { TTL_MS, clean, saveMessage, cleanupMedia } from "./_redis.js";

// Sohbet medyası (ses, fotoğraf, video). Büyük dosyalar tarayıcıda 3,5 MB'lık parçalara bölünüp
// tek tek yüklenir (Vercel fonksiyonları ~4,5 MB'tan büyük istek kabul etmiyor).
// Blob yolu: media/<id>/<parça no>, id = "<zaman damgası>-<rastgele>"
const PART_MAX = 4 * 1024 * 1024;
const MAX_PARTS = 20; // ~70 MB
const ID_RE = /^(\d{13})-([a-z0-9]{8,16})$/;
const KINDS = {
  audio: /^audio\/(webm|mp4|ogg|mpeg|aac|x-m4a)$/,
  image: /^image\/(jpeg|png|webp|gif)$/,
  video: /^video\/(mp4|webm|quicktime|3gpp)$/,
};

function parseId(id) {
  const m = ID_RE.exec(id || "");
  return m ? Number(m[1]) : null;
}

export async function POST(request) {
  const auth = checkPassword(request, "SOHBET_SIFRE", "x-sohbet-sifre");
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const q = new URL(request.url).searchParams;
  const id = q.get("id");
  const ts = parseId(id);
  // Yükleme kimliği yakın bir zamana ait olmalı (eski/uydurma kimlikleri reddet)
  if (!ts || Math.abs(Date.now() - ts) > 30 * 60 * 1000) return json({ error: "Geçersiz yükleme" }, 400);
  const opts = blobOpts();

  try {
    if (q.get("step") === "part") {
      const n = Number(q.get("n"));
      if (!Number.isInteger(n) || n < 0 || n >= MAX_PARTS) return json({ error: "Geçersiz parça" }, 400);
      if (Number(request.headers.get("content-length") || 0) > PART_MAX) return json({ error: "Parça çok büyük" }, 413);
      const buf = Buffer.from(await request.arrayBuffer());
      if (!buf.length || buf.length > PART_MAX) return json({ error: "Geçersiz parça" }, 400);
      await put(`media/${id}/${n}`, buf, {
        access: "private", contentType: "application/octet-stream", addRandomSuffix: false, allowOverwrite: true, ...opts,
      });
      return json({ ok: true });
    }

    if (q.get("step") === "done") {
      let b;
      try { b = await request.json(); } catch { return json({ error: "Geçersiz istek" }, 400); }
      const kind = b.kind;
      const type = String(b.type || "").toLowerCase().split(";")[0];
      if (!KINDS[kind] || !KINDS[kind].test(type)) return json({ error: "Desteklenmeyen dosya türü" }, 415);
      const parts = Number(b.parts);
      if (!Number.isInteger(parts) || parts < 1 || parts > MAX_PARTS) return json({ error: "Geçersiz dosya" }, 400);
      // Bütün parçalar gerçekten yüklenmiş mi?
      const found = await list({ prefix: `media/${id}/`, limit: 100, ...opts });
      if (found.blobs.length < parts) return json({ error: "Dosya eksik yüklendi, tekrar dene" }, 409);

      const media = {
        id, kind, type, parts,
        size: Math.max(0, Number(b.size) || 0),
        dur: Math.max(0, Math.min(36000, Number(b.dur) || 0)),
        w: Math.max(0, Number(b.w) || 0), h: Math.max(0, Number(b.h) || 0),
      };
      const msg = { id: randomUUID(), ts: Date.now(), cid: clean(b.cid, 40), nick: clean(b.nick, 24) || "Anonim", media };
      await saveMessage(msg);
      await cleanupMedia({ list, del, opts });
      return json({ ok: true, message: msg });
    }
    return json({ error: "Geçersiz istek" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: e.message === "Redis bağlı değil" ? e.message : "Dosya gönderilemedi" }, 500);
  }
}

// GET /api/media?id=...&n=... -> bir parçayı indir (24 saatten eski dosyalar açılmaz)
export async function GET(request) {
  const auth = checkPassword(request, "SOHBET_SIFRE", "x-sohbet-sifre");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const q = new URL(request.url).searchParams;
  const id = q.get("id");
  const ts = parseId(id);
  const n = Number(q.get("n"));
  if (!ts || !Number.isInteger(n) || n < 0 || n >= MAX_PARTS) return json({ error: "Geçersiz" }, 400);
  if (Date.now() - ts > TTL_MS) return json({ error: "Bu dosyanın süresi doldu" }, 410);
  try {
    const r = await get(`media/${id}/${n}`, { access: "private", ...blobOpts() });
    if (!r || r.statusCode !== 200) return json({ error: "Bulunamadı" }, 404);
    return new Response(r.stream, { headers: { "content-type": "application/octet-stream", "cache-control": "private, no-store" } });
  } catch (e) {
    console.error(e);
    return json({ error: "Dosya açılamadı" }, 500);
  }
}
