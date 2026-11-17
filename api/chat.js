import { randomUUID } from "node:crypto";
import { checkPassword, json } from "./_auth.js";

// Mesajlar Upstash Redis'te tek bir sıralı kümede (score = gönderilme zamanı) tutulur.
// Her okuma/yazmada 24 saatten eski mesajlar silinir; sohbet 24 saat boş kalırsa anahtar da kendiliğinden düşer.
const TTL_MS = 24 * 60 * 60 * 1000;
const KEY = "sohbet:mesajlar";
const TYPING = "sohbet:yaziyor";

function redisConfig() {
  const env = process.env;
  const find = (suffixes) => {
    for (const s of suffixes) if (env[s]) return env[s];
    const k = Object.keys(env).find((n) => suffixes.some((s) => n.endsWith("_" + s)));
    return k ? env[k] : "";
  };
  return {
    url: find(["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL"]),
    token: find(["UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_TOKEN"]),
  };
}

async function pipeline(cmds) {
  const { url, token } = redisConfig();
  if (!url || !token) throw new Error("Redis bağlı değil");
  const r = await fetch(url.replace(/\/$/, "") + "/pipeline", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error("Redis hatası " + r.status);
  const out = await r.json();
  return out.map((x) => {
    if (x.error) throw new Error(x.error);
    return x.result;
  });
}

const clean = (s, n) => String(s || "").replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").trim().slice(0, n);

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
    await pipeline([
      ["ZADD", KEY, String(now), JSON.stringify(msg)],
      ["ZREMRANGEBYSCORE", KEY, "-inf", String(now - TTL_MS)],
      ["PEXPIRE", KEY, String(TTL_MS)],
      ["HDEL", TYPING, cid],
    ]);
    return json({ ok: true, message: msg });
  } catch (e) {
    console.error(e);
    return json({ error: e.message === "Redis bağlı değil" ? e.message : "Mesaj gönderilemedi" }, 500);
  }
}
