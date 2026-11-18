import { randomUUID } from "node:crypto";
import { list, del } from "@vercel/blob";
import { checkPassword, json, blobOpts } from "./_auth.js";
import { TTL_MS, KEY, TYPING, pipeline, clean, saveMessage, cleanupMedia } from "./_redis.js";

// Mesajlar Upstash Redis'te tek bir sıralı kümede (score = gönderilme zamanı) tutulur.
// Her okuma/yazmada 24 saatten eski mesajlar silinir; sohbet 24 saat boş kalırsa anahtar da kendiliğinden düşer.

export async function GET(request) {
  const auth = checkPassword(request, "SOHBET_SIFRE", "x-sohbet-sifre");
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const q = new URL(request.url).searchParams;
  const since = Math.max(0, Number(q.get("since")) || 0);
  const cid = clean(q.get("cid"), 40);
  const now = Date.now();
  try {
    const [, msgs, typing] = await pipeline([
      ["ZREMRANGEBYSCORE", KEY, "-inf", String(now - TTL_MS)],
      ["ZRANGEBYSCORE", KEY, "(" + since, "+inf"],
      ["HGETALL", TYPING],
    ]);
    const messages = (msgs || []).map((m) => { try { return JSON.parse(m); } catch { return null; } }).filter(Boolean);
    const who = [];
    for (let i = 0; i < (typing || []).length; i += 2) {
      const [id, val] = [typing[i], typing[i + 1]];
      const [ts, nick] = String(val).split("|");
      if (id !== cid && now - Number(ts) < 5000) who.push(nick || "Biri");
    }
    // Eski ses dosyalarını arka planda temizle (saatte bir)
    if (!since) await cleanupMedia({ list, del, opts: blobOpts() });
    return json({ now, ttl: TTL_MS, messages, typing: who });
  } catch (e) {
    console.error(e);
    return json({ error: e.message === "Redis bağlı değil" ? e.message : "Sohbet şu an açılamıyor" }, 500);
  }
}

export async function POST(request) {
  const auth = checkPassword(request, "SOHBET_SIFRE", "x-sohbet-sifre");
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  let body;
  try { body = await request.json(); } catch { return json({ error: "Geçersiz istek" }, 400); }
  const cid = clean(body.cid, 40);
  const nick = clean(body.nick, 24) || "Anonim";
  const now = Date.now();

  try {
    if (body.typing) {
      await pipeline([
        ["HSET", TYPING, cid, `${now}|${nick}`],
        ["EXPIRE", TYPING, "60"],
      ]);
      return json({ ok: true });
    }

    const text = clean(body.text, 1000);
    if (!text) return json({ error: "Boş mesaj" }, 400);
    const msg = { id: randomUUID(), ts: now, cid, nick, text };
    await saveMessage(msg);
    return json({ ok: true, message: msg });
  } catch (e) {
    console.error(e);
    return json({ error: e.message === "Redis bağlı değil" ? e.message : "Mesaj gönderilemedi" }, 500);
  }
}
