import { list, get, del } from "@vercel/blob";
import { checkPassword, json, blobOpts } from "./_auth.js";

// GET /api/photos            -> fotoğraf listesi
// GET /api/photos?p=PATHNAME -> tek fotoğrafın kendisi
export async function GET(request) {
  const auth = checkPassword(request);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const p = new URL(request.url).searchParams.get("p");
  if (p) {
    if (!p.startsWith("uploads/")) return json({ error: "Geçersiz" }, 400);
    const r = await get(p, { access: "private", ...blobOpts() });
    if (!r || r.statusCode !== 200) return json({ error: "Bulunamadı" }, 404);
    return new Response(r.stream, {
      headers: { "content-type": r.blob.contentType, "cache-control": "private, no-store" },
    });
  }

  const items = [];
  let cursor;
  do {
    const page = await list({ prefix: "uploads/", cursor, limit: 1000, ...blobOpts() });
    items.push(...page.blobs.map((b) => ({ pathname: b.pathname, size: b.size, uploadedAt: b.uploadedAt })));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  items.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  return json({ photos: items });
}

// DELETE /api/photos?p=PATHNAME -> fotoğrafı sil
export async function DELETE(request) {
  const auth = checkPassword(request);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const p = new URL(request.url).searchParams.get("p");
  if (!p || !p.startsWith("uploads/")) return json({ error: "Geçersiz" }, 400);
  await del(p, blobOpts());
  return json({ ok: true });
}
