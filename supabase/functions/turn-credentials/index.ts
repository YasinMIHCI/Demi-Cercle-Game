// CRAZY GAMES — accès temporaires au relais TURN (Cloudflare) pour le jeu en ligne.
// Sans relais, deux joueurs derrière une box ou une 4G restrictive ne peuvent pas se joindre.
// Le site appelle cette fonction avant d'ouvrir une salle ; la clé Cloudflare reste ici, côté serveur,
// et chaque joueur reçoit des identifiants qui expirent au bout de quelques heures.
//
// Secrets à définir dans Supabase (Edge Functions → Secrets) :
//   TURN_KEY_ID, TURN_KEY_API_TOKEN   (Cloudflare → Realtime → TURN Server → Create)
//   ALLOWED_ORIGINS (facultatif)      ex : https://yasinmihci.github.io,http://localhost:8000
// Déploiement (appelable sans compte, comme le jeu en ligne) :
//   supabase functions deploy turn-credentials --no-verify-jwt
const TTL = 4 * 3600; // 4 h : une soirée de jeu

function corsFor(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const ok = !allowed.length || allowed.includes(origin);
  return {
    ok,
    headers: {
      "Access-Control-Allow-Origin": ok && origin ? origin : (allowed[0] ?? "*"),
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Vary": "Origin",
    },
  };
}

type Ice = { urls: string | string[]; username?: string; credential?: string };

Deno.serve(async (req) => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors.headers });
  const json = (b: unknown, s = 200, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors.headers, "Content-Type": "application/json", ...extra } });
  if (req.method !== "GET") return json({ error: "GET" }, 405);
  if (!cors.ok) return json({ error: "origine" }, 403);

  const id = Deno.env.get("TURN_KEY_ID"), token = Deno.env.get("TURN_KEY_API_TOKEN");
  if (!id || !token) return json({ error: "relais non configuré" }, 503);

  const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate-ice-servers`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ttl: TTL }),
  });
  if (!r.ok) return json({ error: "cloudflare " + r.status }, 502);
  const data = await r.json();
  // réponse Cloudflare : { iceServers: [...] } (ou un seul objet selon l'ancienne API)
  const list: Ice[] = Array.isArray(data.iceServers) ? data.iceServers : [data.iceServers];
  // on garde les adresses en 3478 / 443 (UDP, TCP, TLS) : la 53 est souvent bloquée par les navigateurs
  const iceServers = list.filter(Boolean).map((s) => {
    const urls = (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => !/:53(\?|$)/.test(u));
    return { ...s, urls };
  }).filter((s) => s.urls.length);
  return json({ iceServers, ttl: TTL }, 200, { "Cache-Control": "private, max-age=600" });
});
