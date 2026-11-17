import { timingSafeEqual } from "node:crypto";

// Galeri şifresini kontrol eder (GALERI_SIFRE ortam değişkeni)
export function checkPassword(request) {
  const expected = process.env.GALERI_SIFRE || "";
  const given = request.headers.get("x-galeri-sifre") || "";
  if (!expected) return { ok: false, status: 500, error: "GALERI_SIFRE tanımlı değil" };
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  return ok ? { ok: true } : { ok: false, status: 401, error: "Şifre yanlış" };
}

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

// Blob deposuna erişim: Vercel depoyu bağlarken bir önek seçtiyse (ör. GALERI_SIFRE_STORE_ID) onu da tanı
export function blobOpts() {
  const env = process.env;
  const token = env.GALERI_SIFRE_READ_WRITE_TOKEN || env.BLOB_READ_WRITE_TOKEN;
  if (token) return { token };
  const storeId = env.GALERI_SIFRE_STORE_ID || env.BLOB_STORE_ID;
  return storeId ? { storeId } : {};
}
