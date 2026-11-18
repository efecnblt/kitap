// Upstash Redis (REST) yardımcıları ve sohbet sabitleri
export const TTL_MS = 24 * 60 * 60 * 1000;
export const KEY = "sohbet:mesajlar";
export const TYPING = "sohbet:yaziyor";

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

export async function pipeline(cmds) {
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

export const clean = (s, n) => String(s || "").replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").trim().slice(0, n);

// Mesajı kaydet, 24 saatten eskileri temizle
export async function saveMessage(msg) {
  await pipeline([
    ["ZADD", KEY, String(msg.ts), JSON.stringify(msg)],
    ["ZREMRANGEBYSCORE", KEY, "-inf", String(msg.ts - TTL_MS)],
    ["PEXPIRE", KEY, String(TTL_MS)],
    ["HDEL", TYPING, msg.cid],
  ]);
}

// 24 saatten eski sohbet medyasını (ses, fotoğraf, video) Blob'dan sil (en fazla saatte bir çalışır)
export async function cleanupMedia({ list, del, opts }) {
  try {
    const [got] = await pipeline([["SET", "sohbet:medya-temizlik", "1", "NX", "EX", "3600"]]);
    if (got !== "OK") return;
    const limit = Date.now() - TTL_MS;
    let cursor;
    do {
      const page = await list({ prefix: "media/", cursor, limit: 1000, ...opts });
      const old = page.blobs.filter((b) => new Date(b.uploadedAt).getTime() < limit).map((b) => b.url);
      if (old.length) await del(old, opts);
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
  } catch (e) {
    console.error("medya temizliği", e);
  }
}
