// CRAZY GAMES — accès temporaires au relais TURN (Cloudflare) pour le jeu en ligne.
// Sans relais, deux joueurs derrière une box ou une 4G restrictive ne peuvent pas se joindre.
// Le site appelle cette fonction avant d'ouvrir une salle ; la clé Cloudflare reste ici, côté serveur,
// et chaque joueur reçoit des identifiants qui expirent au bout de quelques heures.
//
// Protections contre la facture (voir README, « Relais réseau ») :
//  1. limites par adresse IP (par heure, par jour) et pour tout le site ;
//  2. blocage automatique de 7 jours d'une adresse qui insiste, et ses accès sont révoqués ;
//  3. plafond mensuel (100 Go par défaut, Cloudflare en offre 1 000) : la consommation réelle est
//     relevée chez Cloudflare au moins toutes les 10 min ; au-delà, plus aucun accès n'est donné
//     et tous les accès encore valables sont révoqués, jusqu'au mois suivant.
//     Si la consommation ne peut pas être relevée, le relais est coupé (par prudence) :
//     le site retombe alors sur le relais public de PeerJS, comme avant.
//
// Secrets à définir dans Supabase (Edge Functions → Secrets) :
//   TURN_KEY_ID, TURN_KEY_API_TOKEN    Cloudflare → Realtime → TURN Server → Create
//   CF_ACCOUNT_ID, CF_ANALYTICS_TOKEN  identifiant du compte Cloudflare + jeton « Account Analytics : Read »
//   TURN_CRON_SECRET                   mot de passe au hasard, pour le relevé programmé (?check)
//   ALLOWED_ORIGINS (conseillé)        ex : https://yasinmihci.github.io
//   TURN_MONTHLY_GB (facultatif)       plafond mensuel en Go, 100 par défaut
// Déploiement (appelable sans compte, comme le jeu en ligne) :
//   supabase functions deploy turn-credentials --no-verify-jwt
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const TTL = 4 * 3600;            // durée de vie d'un accès : une soirée de jeu
const IP_PER_HOUR = 30;          // une soirée à 10 sur le même wifi : ~10 demandes
const IP_PER_DAY = 100;
const BAN_AFTER = 300;           // demandes dans la journée : au-delà, c'est un robot
const BAN_DAYS = 7;
const SITE_PER_HOUR = 300;       // accès donnés, pour tout le site
const SITE_PER_DAY = 2000;
const CHECK_EVERY = 10 * 60_000; // relevé de consommation
const MONTHLY_GB = Number(Deno.env.get("TURN_MONTHLY_GB") ?? "100") || 100;

type Ice = { urls: string | string[]; username?: string; credential?: string };

function corsFor(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const ok = !allowed.length || allowed.includes(origin);
  return {
    ok,
    headers: {
      "Access-Control-Allow-Origin": ok && origin ? origin : (allowed[0] ?? "*"),
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Expose-Headers": "Retry-After",
      "Vary": "Origin",
    },
  };
}

/* adresse du joueur : Cloudflare (devant Supabase) écrit cf-connecting-ip, que le joueur ne peut pas imiter */
function clientIp(req: Request) {
  const h = req.headers;
  return (h.get("cf-connecting-ip") ?? h.get("x-real-ip") ?? (h.get("x-forwarded-for") ?? "").split(",")[0] ?? "")
    .trim().slice(0, 64) || "inconnue";
}

const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const monthOf = (d: Date) => d.toISOString().slice(0, 7);

/* annule des accès déjà donnés (ils cessent de marcher tout de suite) */
async function revoke(usernames: string[]) {
  const id = Deno.env.get("TURN_KEY_ID"), token = Deno.env.get("TURN_KEY_API_TOKEN");
  await Promise.all(usernames.map((u) =>
    fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/${encodeURIComponent(u)}/revoke`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null)
  ));
}
async function liveUsernames(db: ReturnType<typeof admin>, ip?: string) {
  let q = db.from("turn_requests").select("username").not("username", "is", null).gt("at", ago(TTL * 1000));
  if (ip) q = q.eq("ip", ip);
  const { data } = await q.limit(5000);
  return (data ?? []).map((r) => r.username as string);
}

/* consommation du mois chez Cloudflare (Go envoyés + reçus par la clé TURN) */
async function monthUsage(): Promise<number> {
  const account = Deno.env.get("CF_ACCOUNT_ID"), token = Deno.env.get("CF_ANALYTICS_TOKEN");
  if (!account || !token) throw new Error("CF_ACCOUNT_ID / CF_ANALYTICS_TOKEN manquants");
  const now = new Date();
  const start = monthOf(now) + "-01", end = now.toISOString().slice(0, 10);
  const query = `query($a:String!,$k:String!,$s:Date!,$e:Date!){viewer{accounts(filter:{accountTag:$a}){
    callsTurnUsageAdaptiveGroups(limit:10000,filter:{keyId:$k,date_geq:$s,date_leq:$e}){sum{egressBytes ingressBytes}}}}}`;
  const r = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { a: account, k: Deno.env.get("TURN_KEY_ID"), s: start, e: end } }),
  });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d || d.errors?.length) throw new Error("relevé Cloudflare : " + (d?.errors?.[0]?.message ?? r.status));
  const rows = d.data?.viewer?.accounts?.[0]?.callsTurnUsageAdaptiveGroups;
  if (!Array.isArray(rows)) throw new Error("relevé Cloudflare : réponse inattendue");
  return rows.reduce((t: number, x: { sum?: { egressBytes?: number; ingressBytes?: number } }) =>
    t + (x.sum?.egressBytes ?? 0) + (x.sum?.ingressBytes ?? 0), 0);
}

/* relève la consommation, coupe le relais au-delà du plafond ; renvoie l'état */
async function check(db: ReturnType<typeof admin>, force = false) {
  const { data: st } = await db.from("turn_state").select("*").eq("id", 1).single();
  const state = st ?? { month: "", used_bytes: 0, blocked: false, checked_at: null, last_error: null };
  const month = monthOf(new Date());
  if (state.month !== month) Object.assign(state, { month, used_bytes: 0, blocked: false }); // nouveau mois
  const fresh = state.checked_at && Date.now() - new Date(state.checked_at).getTime() < CHECK_EVERY && !state.last_error;
  if (!force && fresh) return state;
  try {
    const used = await monthUsage();
    const over = used >= MONTHLY_GB * 1e9;
    if (over && !state.blocked) await revoke(await liveUsernames(db));
    Object.assign(state, { used_bytes: used, blocked: state.blocked || over, last_error: null });
  } catch (e) {
    state.last_error = String((e as Error).message ?? e).slice(0, 300);
  }
  state.checked_at = new Date().toISOString();
  await db.from("turn_state").upsert({ id: 1, ...state });
  return state;
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors.headers });
  const json = (b: unknown, s = 200, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors.headers, "Content-Type": "application/json", ...extra } });
  if (req.method !== "GET") return json({ error: "GET" }, 405);

  const id = Deno.env.get("TURN_KEY_ID"), token = Deno.env.get("TURN_KEY_API_TOKEN");
  if (!id || !token) return json({ error: "relais non configuré" }, 503);
  const db = admin();
  const url = new URL(req.url);

  /* relevé programmé (pg_cron) et état, protégés par TURN_CRON_SECRET */
  if (url.searchParams.has("check")) {
    const secret = Deno.env.get("TURN_CRON_SECRET");
    if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "interdit" }, 403);
    const st = await check(db, true);
    await db.from("turn_requests").delete().lt("at", ago(3 * 86400_000)); // ménage
    const { count: lastHour } = await db.from("turn_requests").select("id", { count: "exact", head: true })
      .not("username", "is", null).gt("at", ago(3600_000));
    return json({ ...st, used_gb: +(st.used_bytes / 1e9).toFixed(3), limit_gb: MONTHLY_GB, given_last_hour: lastHour ?? 0 });
  }

  if (!cors.ok) return json({ error: "origine" }, 403);
  const ip = clientIp(req);

  /* adresse bloquée */
  const { data: ban } = await db.from("turn_bans").select("until").eq("ip", ip).gt("until", new Date().toISOString()).maybeSingle();
  if (ban) return json({ error: "bloqué" }, 403, { "Retry-After": String(86400) });

  /* plafond du mois (et relevé de sécurité : sans relevé possible, pas de relais) */
  const st = await check(db);
  if (st.blocked) return json({ error: "plafond du mois atteint" }, 503, { "Retry-After": String(6 * 3600) });
  if (st.last_error) return json({ error: "surveillance indisponible" }, 503, { "Retry-After": "900" });

  /* chaque demande compte, même refusée : c'est ce qui permet de repérer un robot */
  const { data: row } = await db.from("turn_requests").insert({ ip }).select("id").single();
  const count = async (since: number, onlyGiven: boolean, byIp: boolean) => {
    let q = db.from("turn_requests").select("id", { count: "exact", head: true }).gt("at", ago(since));
    if (byIp) q = q.eq("ip", ip);
    if (onlyGiven) q = q.not("username", "is", null);
    return (await q).count ?? 0;
  };
  const [ipHour, ipDay, siteHour, siteDay] = await Promise.all([
    count(3600_000, false, true), count(86400_000, false, true), count(3600_000, true, false), count(86400_000, true, false),
  ]);
  if (ipDay > BAN_AFTER) {
    await db.from("turn_bans").upsert({ ip, until: new Date(Date.now() + BAN_DAYS * 86400_000).toISOString(), reason: "trop de demandes" });
    await revoke(await liveUsernames(db, ip));
    return json({ error: "bloqué" }, 403, { "Retry-After": String(86400) });
  }
  if (ipHour > IP_PER_HOUR || ipDay > IP_PER_DAY) return json({ error: "trop de demandes" }, 429, { "Retry-After": "3600" });
  if (siteHour >= SITE_PER_HOUR || siteDay >= SITE_PER_DAY) return json({ error: "relais saturé" }, 503, { "Retry-After": "3600" });

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
  const username = iceServers.find((s) => s.username)?.username ?? null;
  if (row && username) await db.from("turn_requests").update({ username }).eq("id", row.id);
  return json({ iceServers, ttl: TTL }, 200, { "Cache-Control": "private, max-age=600" });
});
