// CRAZY GAMES — notification push d'une invitation dans une salle.
// Appelée par le site juste après invite_friend (avec la session du joueur qui invite).
// Vérifie que les deux sont amis et qu'une invitation vient d'être créée, puis envoie
// une notification à tous les appareils abonnés de l'ami.
// Secrets à définir dans Supabase (Edge Functions → Secrets) :
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ex : mailto:toi@exemple.fr)
// SUPABASE_URL, SUPABASE_ANON_KEY et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const LABELS: Record<string, string> = {
  demicercle: "Le Demi-Cercle", cameleon: "Le Caméléon", imposteur: "L'Imposteur", loup: "Le Loup des mots",
  classement: "Le Classement", quiaecrit: "Qui a écrit ça ?", crousprison: "Crous ou Prison ?",
  bots: "Battle Bots", soiree: "Soirée All in",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  // qui appelle ? (jeton de session du site)
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "non connecté" }, 401);
  let body: { friend?: string; route?: string; code?: string } = {};
  try { body = await req.json(); } catch { /* corps vide */ }
  const { friend, route, code } = body;
  if (!friend || !route || !LABELS[route] || !code || !/^[A-Z0-9-]{3,20}$/.test(code)) return json({ error: "paramètres" }, 400);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // l'invitation doit exister (créée par invite_friend, qui vérifie déjà l'amitié) et être récente
  const since = new Date(Date.now() - 60_000).toISOString();
  const { data: inv } = await admin.from("room_invites").select("id, from_name")
    .eq("from_id", user.id).eq("to_id", friend).eq("route", route).eq("code", code)
    .gt("created_at", since).limit(1);
  if (!inv || !inv.length) return json({ error: "pas d'invitation" }, 403);

  const { data: subs } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", friend);
  if (!subs || !subs.length) return json({ sent: 0 });
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com",
    Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);
  const payload = JSON.stringify({
    title: "🎮 " + inv[0].from_name + " t'invite !",
    body: LABELS[route] + " — salle " + code + ". Touche pour rejoindre.",
    url: "./?from=invite#" + route + "?room=" + code,   // la requête force un vrai chargement (le code de salle est alors pré-rempli)
    tag: "invite-" + code,
  });
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 600 });
      sent++;
    } catch (e) {
      // abonnement expiré (appli désinstallée, notifications coupées) : on l'oublie
      const st = (e as { statusCode?: number }).statusCode;
      if (st === 404 || st === 410) await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
    }
  }));
  return json({ sent });
});
