/* CRAZY GAMES — service worker de l'app installable (PWA).

   - La page (index.html) : réseau d'abord, copie en cache pour ouvrir l'app
     sans connexion. C'est elle qui donne les numéros ?v= à jour : dès qu'on
     ouvre l'app avec internet, la nouvelle version est prise.
   - Les fichiers versionnés (?v=N), PeerJS (version fixe) et les icônes : cache
     d'abord (un même ?v= ne change jamais de contenu).
   - Les polices Google : cache, mises à jour en arrière-plan.
   Ce fichier n'a pas besoin d'être modifié à chaque mise à jour du site. */
'use strict';
var CACHE = 'cg-app-v1';

function isPage(req){ return req.mode === 'navigate'; }

/* liste des fichiers référencés par une version de index.html */
function assetsOf(html){
  var out = [], re = /(?:src|href)="([^"#]+\?v=\d+)"/g, m;
  while((m = re.exec(html))) out.push(new URL(m[1], self.registration.scope).href);
  return out;
}
/* met en cache la page et ses fichiers, puis efface les anciennes versions */
function refresh(html){
  var keep = assetsOf(html);
  return caches.open(CACHE).then(function(c){
    return Promise.all(keep.map(function(u){
      return c.match(u).then(function(hit){ return hit || c.add(u).catch(function(){}); });
    })).then(function(){
      return c.keys().then(function(reqs){
        return Promise.all(reqs.map(function(r){
          var u = new URL(r.url);
          if(u.origin === self.location.origin && /[?&]v=\d+/.test(u.search) && keep.indexOf(r.url) === -1) return c.delete(r);
        }));
      });
    });
  });
}

self.addEventListener('install', function(e){
  var scope = self.registration.scope;
  e.waitUntil(
    fetch(scope, {cache: 'no-cache'}).then(function(res){
      var copy = res.clone();
      return caches.open(CACHE).then(function(c){ return c.put(scope, copy); })
        .then(function(){ return res.text(); })
        .then(refresh)
        .then(function(){
          return caches.open(CACHE).then(function(c){
            return c.addAll(['manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png']).catch(function(){});
          });
        });
    }).catch(function(){}).then(function(){ return self.skipWaiting(); })
  );
});
self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.map(function(k){ if(k !== CACHE) return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;
  var url = new URL(req.url);

  if(isPage(req)){
    var scope = self.registration.scope;
    e.respondWith(
      fetch(req).then(function(res){
        if(res.ok && url.origin === self.location.origin){
          var copy = res.clone(), copy2 = res.clone();
          caches.open(CACHE).then(function(c){ c.put(scope, copy); });
          copy2.text().then(refresh);
        }
        return res;
      }).catch(function(){
        return caches.match(scope).then(function(hit){ return hit || caches.match(req); });
      })
    );
    return;
  }

  var versioned = url.origin === self.location.origin && /[?&]v=\d+/.test(url.search);
  var pinned = url.hostname === 'unpkg.com' || (url.origin === self.location.origin && /\/icons\/|manifest\.webmanifest$/.test(url.pathname));
  if(versioned || pinned){
    e.respondWith(caches.match(req).then(function(hit){
      return hit || fetch(req).then(function(res){
        if(res.ok || res.type === 'opaque'){ var copy = res.clone(); caches.open(CACHE).then(function(c){ c.put(req, copy); }); }
        return res;
      });
    }));
    return;
  }
  if(url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'){
    e.respondWith(caches.open(CACHE).then(function(c){
      return c.match(req).then(function(hit){
        var net = fetch(req).then(function(res){ if(res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(function(){ return hit; });
        return hit || net;
      });
    }));
  }
  /* le reste (serveur PeerJS, photos...) passe directement par le réseau */
});

/* ----- notifications push (invitations d'amis, voir supabase/functions/invite-push) ----- */
self.addEventListener('push', function(e){
  var d = {};
  try{ d = e.data ? e.data.json() : {}; }catch(err){ d = {title:'CRAZY GAMES', body: e.data ? e.data.text() : ''}; }
  e.waitUntil(self.registration.showNotification(d.title || 'CRAZY GAMES', {
    body: d.body || '', tag: d.tag || 'cg', renotify: true,
    icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
    data: {url: new URL(d.url || './', self.registration.scope).href}
  }));
});
self.addEventListener('notificationclick', function(e){
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(self.clients.matchAll({type:'window', includeUncontrolled:true}).then(function(list){
    for(var i=0;i<list.length;i++){
      var c = list[i];
      if(c.url.indexOf(self.registration.scope) === 0 && 'navigate' in c){
        return c.navigate(url).then(function(w){ return (w || c).focus(); });
      }
    }
    return self.clients.openWindow(url);
  }));
});
