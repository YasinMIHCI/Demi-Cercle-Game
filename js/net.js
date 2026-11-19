/* CRAZY GAMES — couche réseau commune (PeerJS / WebRTC, topologie en étoile).

   L'hôte possède la salle (son identifiant PeerJS = préfixe + code) et
   fait autorité sur l'état de la partie. Chaque invité ouvre une seule
   connexion vers l'hôte et occupe une "place" (seat) numérotée à partir
   de 1 ; l'hôte est toujours la place 0.

   Ce que ce module gère pour tous les jeux :
   - création / connexion à une salle, avec délais d'expiration clairs ;
   - demande d'entrée (join_request) renvoyée jusqu'à réponse de l'hôte,
     et traitée de façon idempotente côté hôte ;
   - battements de cœur (_ping/_pong) pour détecter les joueurs fantômes
     dont l'événement 'close' n'arrive jamais ;
   - reconnexion automatique d'un invité (même identifiant client, donc
     il récupère sa place) ;
   - reconnexion de l'hôte au serveur de signalisation PeerJS ;
   - migration de l'hôte : l'hôte envoie régulièrement la liste des places
     (_roster : identifiant client de chaque place). S'il disparaît sans
     fermer la salle (onglet fermé, téléphone éteint...), le premier invité de
     la liste reprend le même code de salle et devient l'hôte (cfg.onPromote) ;
     les autres continuent leurs tentatives de reconnexion et le rejoignent
     tout seuls, avec le même identifiant client, donc la même place.

   Le jeu fournit des callbacks (voir createRoomNet) et garde toute la
   logique de places / d'état. */
(function(){
  'use strict';
  var CG = window.CG = window.CG || {};

  var ROOM_WORDS = ['CRAZY','PARTY','ARCADE','COMBO','RIOT','REBEL','CHAOS','ROYAL','WILDCARD','BONUS'];

  /* Plusieurs serveurs STUN + le relais TURN public de PeerJS : sans relais,
     deux joueurs derrière des box/4G restrictives ne peuvent pas se joindre. */
  var ICE_SERVERS = [
    {urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302','stun:stun2.l.google.com:19302']},
    {urls:'stun:stun.cloudflare.com:3478'},
    {urls:['turn:eu-0.turn.peerjs.com:3478','turn:us-0.turn.peerjs.com:3478'], username:'peerjs', credential:'peerjsp'}
  ];
  /* NOTE: {secure:true} est forcé. Sinon PeerJS choisit ws:// quand la page
     est ouverte en file:// et la connexion au serveur est refusée. */
  var PEER_OPTS = {secure:true, debug:0, config:{iceServers:ICE_SERVERS}};

  /* Relais perso (Cloudflare) : accès temporaires donnés par la fonction Supabase
     « turn-credentials » (la clé reste côté serveur). Gardés en mémoire jusqu'à
     leur expiration ; sans réponse en 3 s, ou si le relais n'est pas configuré,
     on garde la liste ci-dessus. Les relais perso passent en premier, le relais
     public de PeerJS reste en secours. */
  var TURN_URL='https://pjcmpgqektxaidjkjylp.supabase.co/functions/v1/turn-credentials';
  var ICE_KEY='cg_ice', ICE_WAIT_KEY='cg_ice_wait', ICE_WAIT=3000;
  var ice={own:false, exp:0, pending:null};
  function validIce(list){
    return Array.isArray(list) && list.length<10 && list.every(function(x){
      var u=x && (Array.isArray(x.urls)?x.urls:[x.urls]);
      return u && u.length && u.every(function(v){ return typeof v==='string' && /^(stun|turns?):[^\s]{3,200}$/.test(v); });
    });
  }
  function applyIce(list, exp){
    PEER_OPTS.config={iceServers:list.concat(ICE_SERVERS)};
    ice.own=true; ice.exp=exp;
  }
  (function(){
    try{
      var c=JSON.parse(localStorage.getItem(ICE_KEY)||'null');
      if(c && validIce(c.list) && c.exp>Date.now()) applyIce(c.list, c.exp);
    }catch(e){}
  })();
  /* promesse toujours tenue (jamais d'erreur) : on peut ouvrir le Peer après */
  function iceReady(){
    if(window.CG_PEER_OVERRIDE) return Promise.resolve();
    if(ice.own && ice.exp-Date.now()>30*60000) return Promise.resolve();   /* encore valable au moins 30 min */
    if(ice.own && ice.exp<=Date.now()){ PEER_OPTS.config={iceServers:ICE_SERVERS}; ice.own=false; }  /* accès expirés : relais public */
    if(ice.pending) return ice.pending;
    /* refusé récemment (limite, plafond du mois, relais coupé) : on ne redemande pas avant l'heure,
       pour ne pas se faire bloquer à force de réessayer */
    var wait=0; try{ wait=+localStorage.getItem(ICE_WAIT_KEY)||0; }catch(e){}
    if(wait>Date.now()) return Promise.resolve();
    var timer, fetched=new Promise(function(res){
      if(typeof fetch!=='function') return res();
      fetch(TURN_URL, {cache:'no-store'}).then(function(r){
        if(r.ok) return r.json();
        if(r.status===429 || r.status===403 || r.status===503){
          var sec=Math.min(Math.max(parseInt(r.headers.get('Retry-After'),10)||3600, 300), 86400);
          try{ localStorage.setItem(ICE_WAIT_KEY, String(Date.now()+sec*1000)); }catch(e){}
        }
        return null;
      }).then(function(d){
        if(d && validIce(d.iceServers)){
          var exp=Date.now()+Math.min(+d.ttl||3600, 12*3600)*1000-5*60000;
          applyIce(d.iceServers, exp);
          try{ localStorage.setItem(ICE_KEY, JSON.stringify({list:d.iceServers, exp:exp})); }catch(e){}
        }
        res();
      }, function(){ res(); });
    });
    ice.pending=Promise.race([fetched, new Promise(function(res){ timer=setTimeout(res, ICE_WAIT); })])
      .then(function(){ clearTimeout(timer); ice.pending=null; });
    return ice.pending;
  }
  iceReady();   /* on s'y prend dès l'ouverture du site */
  CG.iceReady=iceReady;
  /* Permet de pointer vers son propre PeerServer (tests en local, ou si le
     serveur public est saturé) : window.CG_PEER_OVERRIDE = {host, port, path, secure} */
  if(window.CG_PEER_OVERRIDE){
    for(var k in window.CG_PEER_OVERRIDE){ PEER_OPTS[k]=window.CG_PEER_OVERRIDE[k]; }
  }

  var PING_EVERY = 2500;        /* hôte -> invités */
  var PEER_TIMEOUT = 12000;     /* silence toléré avant de considérer un lien mort */
  var SERVER_TIMEOUT = 10000;   /* ouverture du Peer (serveur de signalisation) */
  var OPEN_TIMEOUT = 15000;     /* ouverture de la connexion directe vers l'hôte */
  var JOIN_RETRY = 1500;        /* renvoi de join_request tant que l'hôte ne répond pas */
  var JOIN_MAX_TRIES = 8;
  var RECONNECT_DELAYS = [1000,2000,3000,4000,6000,8000,10000];
  var ROSTER_EVERY = 4;         /* liste des places renvoyée tous les 4 battements */
  var PROMOTE_STEP = 10000;     /* l'invité n°k de la liste attend k × 10 s avant de reprendre la salle */
  var MIGRATE_MAX = 90000;      /* au-delà, on abandonne (la salle est perdue) */
  var MIGRATE_RETRY = 4000;

  function randomRoomCode(){
    var w = ROOM_WORDS[Math.floor(Math.random()*ROOM_WORDS.length)];
    var n = Math.floor(1000+Math.random()*9000);
    return w+'-'+n;
  }
  /* Code de salle choisi par les joueurs : majuscules sans accents, espaces
     changés en tirets, seulement A-Z 0-9 et « - » (contrainte des identifiants
     PeerJS), 3 à 20 caractères. Le même nettoyage sert pour créer et rejoindre. */
  var CODE_MIN=3, CODE_MAX=20, LAST_CODE_KEY='cg_last_room_code';
  function cleanRoomCode(s){
    s=String(s||'').toUpperCase().replace(/Œ/g,'OE').replace(/Æ/g,'AE');
    if(s.normalize) s=s.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    s=s.replace(/[\s_]+/g,'-').replace(/[^A-Z0-9-]/g,'').replace(/-+/g,'-').replace(/^-+/,'');
    return s.slice(0,CODE_MAX).replace(/-+$/,'');
  }
  /* lit le champ « code de la salle » d'un écran de création ; '' si invalide */
  function readRoomCode(inputId){
    var el=document.getElementById(inputId);
    var code=cleanRoomCode(el && el.value);
    if(el) el.value=code;
    if(code.length<CODE_MIN){
      if(el){ if(CG.shake) CG.shake(el); try{ el.focus(); }catch(e){} }
      return '';
    }
    try{ localStorage.setItem(LAST_CODE_KEY, code); }catch(e){}
    return code;
  }
  /* pré-remplit les champs de création avec le dernier code utilisé */
  function prefillRoomCodes(){
    var last=''; try{ last=localStorage.getItem(LAST_CODE_KEY)||''; }catch(e){}
    var els=document.querySelectorAll('input[data-room-code]');
    for(var i=0;i<els.length;i++){
      if(last && !els[i].value) els[i].value=last;
      (function(el){
        el.addEventListener('blur', function(){ el.value=cleanRoomCode(el.value); });
        el.addEventListener('keydown', function(e){
          var btn=document.getElementById(el.getAttribute('data-room-code'));
          if(e.key==='Enter' && btn){ e.preventDefault(); btn.click(); }
        });
      })(els[i]);
    }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', prefillRoomCodes);
  else prefillRoomCodes();
  CG.cleanRoomCode=cleanRoomCode;
  CG.readRoomCode=readRoomCode;

  /* ===================== RELAIS PAR SUPABASE (secours) =====================
     Quand la connexion directe entre téléphones échoue (4G des deux côtés,
     réseau d'université, partage de connexion…), les messages du jeu passent
     par Supabase Realtime : une connexion web ordinaire (port 443) qui passe
     partout. Client minimal du protocole Phoenix, sans librairie.
     - « cg:<préfixe><code> » (salle) : l'hôte écoute les « _hello » des invités
       et y envoie ce qui va à tout le monde (avec la liste des destinataires) ;
     - « cg:<préfixe><code>:<jeton> » (un par invité, jeton au hasard) : messages
       privés dans les deux sens (rôles secrets…).
     Les messages sont regroupés toutes les 80 ms (quota de messages Supabase). */
  var SB_URL='https://pjcmpgqektxaidjkjylp.supabase.co';
  var SB_KEY='sb_publishable_FhjSCVlZUKrsh3KX231q3w_vj5PGQN5';   /* clé publique */
  var RT_FLUSH=80, RT_HEARTBEAT=25000;
  var rt={ws:null, open:false, ref:0, topics:{}, hb:null, backoff:1000, retry:null, idle:null};
  function rtUrl(){
    return window.CG_RT_URL || (SB_URL.replace(/^http/,'ws')+'/realtime/v1/websocket?apikey='+encodeURIComponent(SB_KEY)+'&vsn=1.0.0');
  }
  function rtRaw(frame){
    if(!rt.ws || !rt.open) return false;
    try{ rt.ws.send(JSON.stringify(frame)); return true; }catch(e){ return false; }
  }
  function rtJoinFrame(name, t){
    t.joinRef=String(++rt.ref); t.joined=false;
    rtRaw({topic:'realtime:'+name, event:'phx_join', ref:t.joinRef, join_ref:t.joinRef,
      payload:{config:{broadcast:{ack:false, self:false}, presence:{key:''}, private:false}}});
  }
  function rtConnect(){
    clearTimeout(rt.idle); rt.idle=null;
    if(rt.ws || typeof WebSocket!=='function') return;
    var ws;
    try{ ws=rt.ws=new WebSocket(rtUrl()); }catch(e){ rt.ws=null; return rtScheduleRetry(); }
    ws.onopen=function(){
      if(rt.ws!==ws) return;
      rt.open=true; rt.backoff=1000;
      clearInterval(rt.hb);
      rt.hb=setInterval(function(){ rtPing(10000); }, RT_HEARTBEAT);
      Object.keys(rt.topics).forEach(function(n){ rtJoinFrame(n, rt.topics[n]); });
    };
    ws.onmessage=function(ev){
      var f; try{ f=JSON.parse(ev.data); }catch(e){ return; }
      if(f && f.topic==='phoenix'){ if(f.event==='phx_reply' && f.ref===rt.hbPending) rt.hbPending=null; return; }
      if(!f || typeof f.topic!=='string' || f.topic.indexOf('realtime:')!==0) return;
      var t=rt.topics[f.topic.slice(9)]; if(!t) return;
      if(f.event==='phx_reply' && f.ref===t.joinRef){
        if(f.payload && f.payload.status==='ok'){ t.joined=true; rtFlush(t); t.onJoin.forEach(function(fn){ try{ fn(); }catch(e){} }); }
        return;
      }
      if(f.event==='phx_error' || f.event==='phx_close'){
        t.joined=false;
        var name=f.topic.slice(9);
        setTimeout(function(){ if(rt.topics[name]===t && rt.open && !t.joined) rtJoinFrame(name, t); }, 1000);
        return;
      }
      if(f.event==='broadcast' && f.payload && f.payload.event==='m'){
        var p=f.payload.payload;
        if(!p || !Array.isArray(p.b)) return;
        t.handlers.slice().forEach(function(fn){ try{ fn(p); }catch(e){ if(window.console) console.error(e); } });
      }
    };
    ws.onclose=ws.onerror=function(){
      if(rt.ws!==ws) return;
      rt.ws=null; rt.open=false; clearInterval(rt.hb);
      Object.keys(rt.topics).forEach(function(n){ rt.topics[n].joined=false; });
      if(Object.keys(rt.topics).length) rtScheduleRetry();
    };
  }
  /* battement : sans réponse à temps, la connexion est morte (téléphone en veille, changement
     de réseau…) même si le navigateur ne l'a pas encore remarqué : on la refait aussitôt */
  function rtPing(wait){
    if(!rt.open) return;
    var ref=String(++rt.ref);
    rt.hbPending=ref;
    rtRaw({topic:'phoenix', event:'heartbeat', payload:{}, ref:ref});
    setTimeout(function(){ if(rt.hbPending===ref) rtReset(); }, wait);
  }
  function rtReset(){
    var w=rt.ws;
    rt.ws=null; rt.open=false; rt.hbPending=null; clearInterval(rt.hb);
    Object.keys(rt.topics).forEach(function(n){ rt.topics[n].joined=false; });
    if(w){ w.onclose=w.onerror=w.onmessage=null; try{ w.close(); }catch(e){} }
    clearTimeout(rt.retry); rt.retry=null; rt.backoff=1000;
    if(Object.keys(rt.topics).length) rtConnect();
  }
  /* retour dans l'app ou retour du réseau : on vérifie la connexion tout de suite */
  function rtWake(){
    if(!Object.keys(rt.topics).length) return;
    if(!rt.ws){ clearTimeout(rt.retry); rt.retry=null; rt.backoff=1000; rtConnect(); }
    else if(rt.open) rtPing(4000);
  }
  document.addEventListener('visibilitychange', function(){ if(document.visibilityState==='visible') rtWake(); });
  window.addEventListener('online', rtWake);
  function rtScheduleRetry(){
    if(rt.retry) return;
    rt.retry=setTimeout(function(){ rt.retry=null; if(Object.keys(rt.topics).length) rtConnect(); }, rt.backoff);
    rt.backoff=Math.min(rt.backoff*2, 10000);
  }
  /* envoi groupé : un message par sujet et par sens toutes les 80 ms */
  function rtFlush(t){
    clearTimeout(t.timer); t.timer=null;
    if(!t.joined || !t.out.length) return;
    ['h','g'].forEach(function(d){
      var list=t.out.filter(function(o){ return o.d===d; });
      if(!list.length) return;
      var groups=[], byKey={};
      list.forEach(function(o){
        var k=o.s;
        if(o.to===null){ groups.push({t:null, m:o.m}); return; }
        if(byKey[k] && byKey[k].t){ byKey[k].t.push(o.to); return; }
        byKey[k]={t:[o.to], m:o.m}; groups.push(byKey[k]);
      });
      /* les gros messages (dessins) partent seuls, sous la limite de taille de Supabase */
      var batch=[], size=0;
      function send(){ if(batch.length) rtRaw({topic:'realtime:'+t.name, event:'broadcast', ref:String(++rt.ref), join_ref:t.joinRef,
        payload:{type:'broadcast', event:'m', payload:{d:d, b:batch}}}); batch=[]; size=0; }
      groups.forEach(function(g){
        var s=JSON.stringify(g.m).length;
        if(size+s>120000) send();
        batch.push(g); size+=s;
      });
      send();
    });
    t.out=[];
  }
  function rtJoin(name, onMsg, onJoin){
    var t=rt.topics[name];
    if(!t){
      t=rt.topics[name]={name:name, handlers:[], onJoin:[], out:[], joined:false, joinRef:null, timer:null};
      if(rt.open) rtJoinFrame(name, t);
    }
    t.handlers.push(onMsg);
    if(onJoin){ t.onJoin.push(onJoin); if(t.joined) setTimeout(onJoin, 0); }
    rtConnect();
    var left=false;
    return {
      /* d : 'h' (de l'hôte) ou 'g' (d'un invité) ; to : identifiant du destinataire, ou null = tous */
      send:function(d, m, to){
        if(left) return;
        if(t.out.length>500) t.out.shift();   /* lien coupé : on ne garde que les derniers */
        t.out.push({d:d, m:m, to:(to===undefined?null:to), s:JSON.stringify(m)});
        if(!t.timer) t.timer=setTimeout(function(){ rtFlush(t); }, RT_FLUSH);
      },
      joined:function(){ return t.joined; },
      leave:function(){
        if(left) return; left=true;
        rtFlush(t);
        t.handlers=t.handlers.filter(function(f){ return f!==onMsg; });
        if(onJoin) t.onJoin=t.onJoin.filter(function(f){ return f!==onJoin; });
        if(!t.handlers.length && rt.topics[name]===t){
          delete rt.topics[name];
          if(t.joined) rtRaw({topic:'realtime:'+name, event:'phx_leave', payload:{}, ref:String(++rt.ref), join_ref:t.joinRef});
          /* plus aucun sujet : on ferme la connexion un peu plus tard */
          if(!Object.keys(rt.topics).length){
            clearTimeout(rt.idle);
            rt.idle=setTimeout(function(){
              if(Object.keys(rt.topics).length || !rt.ws) return;
              var w=rt.ws; rt.ws=null; rt.open=false; clearInterval(rt.hb);
              try{ w.close(); }catch(e){}
            }, 5000);
          }
        }
      }
    };
  }
  /* Ce réseau a-t-il eu besoin du relais récemment ? (par type de réseau quand le
     navigateur le dit : wifi, 4G…). Gardé 6 h, sur cet appareil seulement. */
  var HINT_KEY='cg_net_hint', HINT_TTL=6*3600000;
  function netKind(){ var c=navigator.connection; return (c && (c.type || c.effectiveType)) || 'inconnu'; }
  function netHint(){
    try{
      var h=JSON.parse(localStorage.getItem(HINT_KEY)||'null');
      if(h && h.kind===netKind() && Date.now()-h.at<HINT_TTL) return h;
    }catch(e){}
    return {};
  }
  function setHint(k, v){
    try{
      var h=netHint(); h[k]=v; h.kind=netKind(); h.at=Date.now();
      localStorage.setItem(HINT_KEY, JSON.stringify(h));
    }catch(e){}
  }
  function roomTopic(prefix, code){ return 'cg:'+prefix+String(code).toLowerCase(); }
  function randToken(){
    var a=new Uint8Array(12);
    if(window.crypto && crypto.getRandomValues) crypto.getRandomValues(a); else for(var i=0;i<a.length;i++) a[i]=Math.random()*256|0;
    return Array.prototype.map.call(a, function(x){ return ('0'+x.toString(16)).slice(-2); }).join('');
  }
  var TOKEN_RE=/^[0-9a-f]{24}$/;

  /* Connexion qui imite une DataConnection de PeerJS (open, send, close, on) */
  function RelayConn(){ this.open=false; this.relay=true; this._h={}; this._closed=false; }
  RelayConn.prototype.on=function(ev, fn){ (this._h[ev]=this._h[ev]||[]).push(fn); return this; };
  RelayConn.prototype._emit=function(ev, a){
    (this._h[ev]||[]).slice().forEach(function(fn){ try{ fn(a); }catch(e){ if(window.console) console.error(e); } });
  };
  RelayConn.prototype.send=function(m){ if(this.open && this._send) this._send(m); };
  RelayConn.prototype.close=function(){
    if(this._closed) return;
    var was=this.open;
    this._closed=true; this.open=false;
    if(this._cleanup) this._cleanup(was);
    this._emit('close');
  };

  /* invité : ouvre une connexion vers l'hôte par le relais */
  function relayConnect(prefix, code){
    var c=new RelayConn(), token=randToken(), hello=null;
    var room=rtJoin(roomTopic(prefix, code), function(p){
      if(p.d!=='h') return;
      p.b.forEach(function(e){
        if(e.t && e.t.indexOf(token)===-1) return;
        deliver(e.m);
      });
    });
    var priv=rtJoin(roomTopic(prefix, code)+':'+token, function(p){
      if(p.d!=='h') return;
      p.b.forEach(function(e){ deliver(e.m); });
    });
    function deliver(m){
      if(!m || c._closed) return;
      if(m.type==='_welcome'){ if(!c.open){ c.open=true; clearInterval(hello); c._emit('open'); } return; }
      if(c.open) c._emit('data', m);
    }
    function sayHello(){ room.send('g', {type:'_hello', token:token}); }
    sayHello(); hello=setInterval(sayHello, 1500);
    c._send=function(m){ priv.send('g', m); };
    c._reached=function(){ return room.joined(); };   /* relais joint (mais l'hôte n'a peut-être pas répondu) */
    c._cleanup=function(wasOpen){
      clearInterval(hello);
      if(wasOpen) priv.send('g', {type:'_bye'});   /* l'hôte libère la place tout de suite */
      room.leave(); priv.leave();
    };
    return c;
  }
  /* hôte : écoute les invités qui arrivent par le relais. onConn(conn) pour chaque nouvel invité.
     Renvoie {stop(), sendAll(msg, conns)} : envoi groupé à plusieurs invités du relais. */
  function relayHost(prefix, code, onConn){
    var guests={};
    var room=rtJoin(roomTopic(prefix, code), function(p){
      if(p.d!=='g') return;
      p.b.forEach(function(e){
        var m=e.m;
        if(!m) return;
        if(m.type==='_probe' && typeof m.token==='string' && TOKEN_RE.test(m.token)){ room.send('h', {type:'_here'}, m.token); return; }
        if(m.type!=='_hello' || typeof m.token!=='string' || !TOKEN_RE.test(m.token)) return;
        var g=guests[m.token];
        if(g && !g.conn._closed){ g.priv.send('h', {type:'_welcome'}); return; }
        if(Object.keys(guests).length>=40) return;
        var conn=new RelayConn(), token=m.token;
        var priv=rtJoin(roomTopic(prefix, code)+':'+token, function(q){
          if(q.d!=='g') return;
          q.b.forEach(function(x){
            if(!x.m || !conn.open) return;
            if(x.m.type==='_bye'){ conn.close(); return; }
            conn._emit('data', x.m);
          });
        }, function(){ priv.send('h', {type:'_welcome'}); });
        conn._token=token;
        conn._send=function(msg){ priv.send('h', msg); };
        conn._cleanup=function(){ priv.leave(); delete guests[token]; };
        guests[token]={conn:conn, priv:priv};
        conn.open=true;
        onConn(conn);
        conn._emit('open');
      });
    });
    return {
      stop:function(){ Object.keys(guests).forEach(function(k){ guests[k].conn.close(); }); room.leave(); },
      /* même message à plusieurs invités du relais : un seul envoi dans la salle */
      sendAll:function(msg, conns){
        if(!conns.length) return;
        if(conns.length===1){ conns[0].send(msg); return; }
        conns.forEach(function(c){ room.send('h', msg, c._token); });
      }
    };
  }
  /* y a-t-il déjà un hôte sur ce code ? cb(true/false/null = relais injoignable) */
  function relayProbe(prefix, code, wait, cb){
    var token=randToken(), done=false, timer=null;
    var room=rtJoin(roomTopic(prefix, code), function(p){
      if(p.d!=='h') return;
      p.b.forEach(function(e){ if(e.m && e.m.type==='_here' && e.t && e.t.indexOf(token)!==-1) end(true); });
    }, function(){
      room.send('g', {type:'_probe', token:token});
      clearTimeout(timer); timer=setTimeout(function(){ end(false); }, wait);
    });
    timer=setTimeout(function(){ end(null); }, wait+5000);
    function end(v){ if(done) return; done=true; clearTimeout(timer); room.leave(); cb(v); }
    return {cancel:function(){ if(!done){ done=true; clearTimeout(timer); room.leave(); } }};
  }
  CG.relayStatus=function(){ return {open:rt.open, topics:Object.keys(rt.topics).length}; };


  /* Retrouve à quel jeu appartient un code de salle (bouton « Rejoindre » du hub) :
     on tente une connexion vers chaque jeu à la fois ; la première salle qui répond
     gagne, les autres renvoient « peer-unavailable ». La connexion d'essai ne demande
     pas de place : l'hôte l'oublie tout seul. cb(route) ou cb(null, message). */
  function findRoom(code, prefixes, cb){
    var routes=Object.keys(prefixes), left=routes.length, relayLeft=routes.length, done=false, conns=[], probes=[], peer=null, timer=null;
    var peerDone=false, peerErr=null;
    function finish(route, err){
      if(done) return; done=true;
      clearTimeout(timer);
      conns.forEach(function(c){ try{ c.close(); }catch(e){} });
      probes.forEach(function(pr){ pr.cancel(); });
      setTimeout(function(){ try{ if(peer) peer.destroy(); }catch(e){} }, 300);
      cb(route, err);
    }
    /* échec seulement quand les deux recherches (directe et relais) n'ont rien trouvé */
    function maybeFail(){
      if(!peerDone || relayLeft>0) return;
      finish(null, peerErr || 'Aucune salle trouvée avec ce code. Vérifie-le auprès de l’hôte.');
    }
    timer=setTimeout(function(){ finish(null, 'Aucune salle trouvée avec ce code.'); }, 12000);
    /* par le relais : on demande « qui est là ? » dans la salle de chaque jeu */
    routes.forEach(function(route){
      probes.push(relayProbe(prefixes[route], code, 2500, function(found){
        if(found) return finish(route);
        relayLeft--; maybeFail();
      }));
    });
    /* en direct (PeerJS) */
    if(typeof window.Peer!=='function'){ peerDone=true; return; }
    iceReady().then(function(){ if(!done) start(); });
    function start(){
    try{ peer=new Peer(PEER_OPTS); }catch(e){ peerDone=true; return maybeFail(); }
    peer.on('open', function(){
      routes.forEach(function(route){
        var c=peer.connect(prefixes[route]+code.toLowerCase(), {reliable:true});
        conns.push(c);
        c.on('open', function(){ finish(route); });
      });
    });
    peer.on('error', function(err){
      if(err && err.type==='peer-unavailable'){
        left--;
        if(left<=0){ peerDone=true; maybeFail(); }
        return;
      }
      peerDone=true;
      maybeFail();
    });
    }
  }
  CG.findRoom=findRoom;

  function peerErrorMessage(err){
    var t = err && err.type;
    if(t==='unavailable-id') return 'CE CODE EST DÉJÀ PRIS — CHOISIS-EN UN AUTRE';
    if(t==='peer-unavailable') return 'SALLE INTROUVABLE (vérifie le code)';
    if(t==='network'||t==='server-error'||t==='socket-error'||t==='socket-closed') return 'RÉSEAU INDISPONIBLE, VÉRIFIE TA CONNEXION';
    if(t==='browser-incompatible') return 'NAVIGATEUR NON COMPATIBLE (essaie Chrome ou Firefox à jour)';
    return 'ERREUR DE CONNEXION';
  }
  /* Identifiant stable pour l'onglet : permet de retrouver sa place après
     une coupure ou un rechargement de la page. */
  function getClientId(ns){
    var key='cg_client_'+ns, id=null;
    try{ id=sessionStorage.getItem(key); }catch(e){}
    if(!id){
      id=Math.random().toString(36).slice(2)+Date.now().toString(36);
      try{ sessionStorage.setItem(key,id); }catch(e){}
    }
    return id;
  }

  /* cfg :
     - prefix                 préfixe des identifiants PeerJS du jeu
     - onStatus(cls,label)    affichage de l'état réseau
     -- côté hôte --
     - onJoinRequest(msg)     -> numéro de place (>=1) ou chaîne = motif du refus
     - onSeatJoined(seat,msg,isRepeat)  la place est attribuée : envoyer seat_assigned
     - onGuestMessage(seat,msg)
     - onSeatLost(seat)       la connexion de cette place est morte
     -- côté invité --
     - onHostMessage(msg)
     - onReconnecting()       lien perdu, tentatives automatiques en cours
     - onReconnected()        place récupérée (seat_assigned reçu à nouveau)
     - onLost(reason)         abandon définitif
     - onPromote(info)        (facultatif) l'hôte a disparu et c'est toi qui le
                              remplaces : la salle est rouverte avec le même code,
                              tu es la place 0. info = {oldSeat, ids} où ids[place]
                              = identifiant client de chaque place (ancienne numérotation).
                              Voir CG.promoteSeats (common.js) pour renuméroter. */
  function createRoomNet(cfg){
    var net = {role:null, code:'', mySeat:0, conns:[]};
    var clientId = getClientId(cfg.prefix);
    var peer=null, conn=null;
    var intentional=false, joined=false, joinPayload=null;
    var serverTimer=null, heartbeatTimer=null, reconnectTimer=null, signalTimer=null;
    var reconnectAttempt=0, hostLastSeen=0, hostIdRetries=0;
    var roster=null, rosterLive=null, lostAt=0, promoting=false, beats=0;
    var seatIds=[];               /* hôte : identifiant client de chaque place (même déconnectée) */
    var openGen=0;                /* ignore une ouverture en attente des relais si on a changé d'avis entre-temps */

    function status(cls,label){ if(cfg.onStatus) cfg.onStatus(cls,label); }
    function call(name){
      var fn=cfg[name]; if(!fn) return undefined;
      return fn.apply(null, Array.prototype.slice.call(arguments,1));
    }
    function clearTimer(t){ if(t){ clearTimeout(t); clearInterval(t); } return null; }
    function safeSend(c,msg){
      if(c && c.open){ try{ c.send(msg); return true; }catch(e){} }
      return false;
    }
    /* L'événement 'close' de PeerJS n'arrive souvent pas quand l'autre
       navigateur disparaît (onglet fermé, téléphone en veille). On surveille
       aussi l'état de la connexion WebRTC sous-jacente. */
    function watchLink(c, onDown){
      var pc=c.peerConnection;
      if(!pc || !pc.addEventListener) return;
      pc.addEventListener('connectionstatechange', function(){
        if(pc.connectionState==='failed' || pc.connectionState==='closed') onDown();
      });
    }
    function destroyPeer(){
      if(peer){ var p=peer; peer=null; try{ p.destroy(); }catch(e){} }
    }

    /* Reconnexion au serveur de signalisation (le lien direct entre
       navigateurs, lui, survit en général à cette coupure). */
    function handleSignalLost(p){
      if(p!==peer || intentional) return;
      if(net.role==='host') status('error','SERVEUR PERDU — RECONNEXION...');
      var delay=1000;
      (function retry(){
        signalTimer=null;
        if(p!==peer || p.destroyed || !p.disconnected) return;
        try{ p.reconnect(); }catch(e){}
        delay=Math.min(delay*2,15000);
        signalTimer=setTimeout(retry, delay);
      })();
    }

    /* ===================== HÔTE ===================== */
    /* code : celui choisi par l'hôte (sinon un code au hasard) */
    var wantedCode='', hostRelay=null;
    var RELAY_HOST_DELAY=5000;    /* serveur PeerJS muet au bout de 5 s : la salle s'ouvre sur le relais seul */
    net.host = function(onReady, code){
      net.close();
      intentional=false;
      hostIdRetries=0;
      wantedCode=cleanRoomCode(code);
      status('connecting','CRÉATION DE LA SALLE...');
      var gen=++openGen;
      iceReady().then(function(){ if(gen===openGen && !intentional) openHostPeer(onReady); });
    };
    /* la salle est à nous : on écoute aussi les invités qui passent par le relais */
    function becomeHost(code, onReady, viaRelayOnly){
      if(net.role==='host') return;
      promoting=false;
      net.role='host'; net.code=code; net.mySeat=0; net.conns=[]; seatIds=[];
      heartbeatTimer=clearTimer(heartbeatTimer);
      heartbeatTimer=setInterval(hostHeartbeat, PING_EVERY);
      if(hostRelay) hostRelay.stop();
      hostRelay=relayHost(cfg.prefix, code, hostAccept);
      status('connected', viaRelayOnly ? 'SALLE CRÉÉE (PAR LE RELAIS)' : 'SALLE CRÉÉE');
      onReady(code);
    }
    /* le code est déjà pris par une autre salle */
    function codeTaken(onReady){
      serverTimer=clearTimer(serverTimer); destroyPeer();
      if(promoting){
        /* reprise de la salle : un autre invité a été plus rapide -> on redevient invité */
        promoting=false;
        net.role='guest'; net.mySeat=promoteInfo.oldSeat;
        scheduleRetry(MIGRATE_RETRY);
        return;
      }
      if(hostIdRetries<3){
        /* code choisi : la salle qu'on vient de fermer peut occuper encore
           l'identifiant quelques secondes, on réessaie un peu avant d'abandonner */
        hostIdRetries++;
        if(wantedCode){
          status('connecting','CODE OCCUPÉ, NOUVEL ESSAI...');
          signalTimer=setTimeout(function(){ signalTimer=null; if(!intentional && !peer && net.role!=='host') openHostPeer(onReady); }, 1500);
        } else openHostPeer(onReady);
        return;
      }
      status('error', peerErrorMessage({type:'unavailable-id'}));
    }
    function openHostPeer(onReady){
      status('connecting','CRÉATION DE LA SALLE...');
      var code=wantedCode||randomRoomCode(), gen=openGen, relayTried=false, probe=null;
      /* serveur PeerJS injoignable la dernière fois sur ce réseau : on n'attend que 1,5 s */
      var p=null, relayTimer=setTimeout(function(){ setHint('noServer', true); tryRelay(); }, netHint().noServer ? 1500 : RELAY_HOST_DELAY);
      function stale(){ return gen!==openGen || intentional || net.role==='host'; }
      /* PeerJS injoignable (réseau d'université…) : salle ouverte sur le relais seul,
         après avoir vérifié que personne n'y a déjà ce code */
      function tryRelay(){
        clearTimeout(relayTimer);
        if(relayTried || stale()) return;
        relayTried=true;
        status('connecting','SERVEUR INJOIGNABLE — OUVERTURE PAR LE RELAIS...');
        probe=relayProbe(cfg.prefix, code, 1500, function(taken){
          probe=null;
          if(stale()) return;
          if(taken===true){ codeTaken(onReady); return; }
          if(taken===null){ status('error','IMPOSSIBLE DE JOINDRE LE SERVEUR — RÉESSAIE'); return; }
          becomeHost(code, onReady, true);
        });
      }
      if(typeof Peer!=='function'){ tryRelay(); return; }
      try{ p=peer=new Peer(cfg.prefix+code.toLowerCase(), PEER_OPTS); }catch(e){ tryRelay(); return; }
      p.on('open',function(){
        if(p!==peer) return;
        serverTimer=clearTimer(serverTimer);
        if(net.role==='host'){ status('connected','SALLE EN LIGNE'); return; } /* ré-ouverture après coupure, ou PeerJS plus lent que le relais */
        if(stale()) return;
        clearTimeout(relayTimer); if(probe){ probe.cancel(); probe=null; }
        setHint('noServer', false);
        becomeHost(code, onReady, false);
      });
      p.on('connection', hostAccept);
      p.on('disconnected', function(){ handleSignalLost(p); });
      p.on('error',function(err){
        if(p!==peer) return;
        if(net.role==='host' && relayTried) return;   /* la salle vit sur le relais */
        if(err && err.type==='unavailable-id' && !net.role || (promoting && err && err.type==='unavailable-id')){
          clearTimeout(relayTimer); if(probe){ probe.cancel(); probe=null; }
          codeTaken(onReady);
          return;
        }
        if(err && err.type==='peer-unavailable') return;
        /* serveur PeerJS injoignable : on n'attend pas, on passe par le relais */
        if(!net.role && err && /network|server-error|socket-error|socket-closed|browser-incompatible/.test(err.type||'')){ setHint('noServer', true); tryRelay(); return; }
        serverTimer=clearTimer(serverTimer);
        if(!net.role || !p.open) status('error', peerErrorMessage(err));
      });
    }
    function hostAccept(c){
      c._seat=null; c._dead=false; c._lastSeen=Date.now(); c._clientId=null;
      c.on('data', function(msg){ c._lastSeen=Date.now(); hostData(c,msg); });
      c.on('close', function(){ hostConnDown(c); });
      c.on('error', function(){ hostConnDown(c); });
      watchLink(c, function(){ hostConnDown(c); });
      /* une connexion qui ne demande jamais de place est abandonnée */
      setTimeout(function(){ if(c._seat===null && !c._dead){ c._dead=true; try{ c.close(); }catch(e){} } }, 30000);
    }
    function hostData(c,msg){
      if(!msg || !msg.type || c._dead) return;
      if(msg.type==='_pong' || msg.type==='_ping') return;
      if(msg.type==='join_request'){
        /* tout ce qu'envoie un invité est nettoyé ici, avant d'arriver dans les jeux */
        msg.name = typeof msg.name==='string' ? msg.name.replace(/[\u0000-\u001f\u007f]/g,'').replace(/\s+/g,' ').trim().slice(0,18) : '';
        msg.clientId = typeof msg.clientId==='string' ? msg.clientId.slice(0,64) : null;
        if(msg.color!==undefined && !(typeof msg.color==='string' && /^#[0-9a-fA-F]{3,8}$/.test(msg.color))) delete msg.color;
        if(c._seat!==null){ call('onSeatJoined', c._seat, msg, true); return; } /* renvoi : l'invité n'a pas reçu la réponse */
        var seat=call('onJoinRequest', msg);
        if(typeof seat!=='number' || seat<1){
          safeSend(c,{type:'room_full', reason:(typeof seat==='string'?seat:'SALLE COMPLÈTE')});
          setTimeout(function(){ c._dead=true; try{ c.close(); }catch(e){} }, 600);
          return;
        }
        var old=net.conns[seat];
        if(old && old!==c){ old._dead=true; try{ old.close(); }catch(e){} }
        c._seat=seat; c._clientId=msg.clientId||null; seatIds[seat]=c._clientId;
        net.conns[seat]=c;
        call('onSeatJoined', seat, msg, false);
        sendRoster();
        return;
      }
      if(c._seat===null || net.conns[c._seat]!==c) return;
      if(msg.type==='_chat'){ relayChat(msg, c._seat); return; }
      call('onGuestMessage', c._seat, msg);
    }
    function hostConnDown(c){
      if(c._dead && net.conns[c._seat]!==c) return;
      c._dead=true;
      var s=c._seat;
      if(s===null || net.conns[s]!==c) return;
      net.conns[s]=null;
      call('onSeatLost', s);
      sendRoster();
    }
    /* liste des places (identifiant client de chacune) : sert à choisir qui
       reprend la salle si l'hôte disparaît */
    function sendRoster(){
      if(net.role!=='host') return;
      var ids=[clientId], live=[true];
      for(var s=1;s<Math.max(net.conns.length, seatIds.length);s++){
        var c=net.conns[s];
        ids[s]=seatIds[s]||null; live[s]=!!(c && !c._dead);
      }
      net.sendToAll({type:'_roster', ids:ids, live:live});
    }
    function hostHeartbeat(){
      var now=Date.now();
      if(++beats%ROSTER_EVERY===0) sendRoster();
      for(var s=1;s<net.conns.length;s++){
        var c=net.conns[s];
        if(!c) continue;
        if(now-c._lastSeen>PEER_TIMEOUT){
          try{ c.close(); }catch(e){}
          hostConnDown(c);
        } else {
          safeSend(c,{type:'_ping'});
        }
      }
    }

    /* ===================== INVITÉ ===================== */
    var RELAY_DELAY=3500;         /* connexion directe pas ouverte au bout de 3,5 s : on tente aussi le relais */
    var RELAY_OPEN_TIMEOUT=6000;
    var attemptGen=0, cands=[], relayTimer=null, preJoinTries=0, PREJOIN_MAX=3;
    net.join = function(code, payload){
      net.close();
      intentional=false;
      net.role='guest'; net.code=code; net.mySeat=0;
      joinPayload=payload||{}; joined=false; reconnectAttempt=0; preJoinTries=0;
      heartbeatTimer=setInterval(guestWatchdog, 2000);
      status('connecting','CONNEXION EN COURS...');
      var gen=++openGen;
      iceReady().then(function(){ if(gen===openGen && !intentional) connectToHost(false); });
    };
    function dropCands(except){
      cands.forEach(function(c){ if(c!==except){ c._lost=true; try{ c.close(); }catch(e){} } });
      cands=except ? [except] : [];
    }
    /* Une tentative = connexion directe (PeerJS) et, si elle tarde ou échoue, le relais.
       La première qui s'ouvre gagne ; l'échec n'est annoncé que si les deux ont échoué. */
    function connectToHost(isRetry){
      if(intentional) return;
      if(!isRetry) status('connecting','CONNEXION EN COURS...');
      else if(joined) status('connecting','RECONNEXION ('+reconnectAttempt+'/'+RECONNECT_DELAYS.length+')...');
      dropCands(); relayTimer=clearTimer(relayTimer); serverTimer=clearTimer(serverTimer);
      var gen=++attemptGen, relayTried=false, directDone=false, lastErr=null, lastReason='CONNEXION IMPOSSIBLE';
      function live(){ return gen===attemptGen && !intentional && net.role==='guest'; }
      function failed(reason, err, isRelay){
        if(!live() || (conn && conn.open)) return;
        if(reason) lastReason=reason;
        if(err) lastErr=err;
        if(!isRelay) directDone=true;
        if(!relayTried){ tryRelay(); return; }
        if(!directDone || cands.some(function(c){ return !c._failed && !c._lost; })) return;   /* l'autre voie est encore en cours */
        relayTimer=clearTimer(relayTimer);
        /* plus personne ne porte le code de la salle, ni en direct ni par le relais : l'hôte est parti */
        if(lastErr && lastErr.type==='peer-unavailable' && tryPromote()) return;
        /* introuvable en direct comme par le relais : la salle n'existe pas (ou plus) */
        guestFailure(lastErr && lastErr.type==='peer-unavailable' && !joined ? 'SALLE INTROUVABLE (vérifie le code)' : lastReason,
          !!(lastErr && lastErr.type==='peer-unavailable'));
      }
      function tryRelay(){
        relayTimer=clearTimer(relayTimer);
        if(relayTried || !live() || (conn && conn.open)) return;
        relayTried=true;
        status('connecting','CONNEXION PAR LE RELAIS...');
        attach(relayConnect(cfg.prefix, net.code), gen, failed);
      }
      /* le relais a été nécessaire sur ce réseau : on le tente presque tout de suite */
      relayTimer=setTimeout(tryRelay, netHint().relay ? 800 : RELAY_DELAY);
      if(typeof Peer!=='function'){ failed('PEERJS INDISPONIBLE', null, false); return; }
      if(peer && peer.open && !peer.disconnected && !peer.destroyed){ attach(peer.connect(cfg.prefix+net.code.toLowerCase(), {reliable:true}), gen, failed); return; }
      destroyPeer();
      var p;
      try{ p=peer=new Peer(PEER_OPTS); }catch(e){ failed('PEERJS INDISPONIBLE', null, false); return; }
      serverTimer=setTimeout(function(){
        if(p!==peer || p.open) return;
        failed('IMPOSSIBLE DE JOINDRE LE SERVEUR — RÉESSAIE', null, false);
      }, SERVER_TIMEOUT);
      p.on('open',function(){
        if(p!==peer) return;
        serverTimer=clearTimer(serverTimer);
        if(live() && !(conn && conn.open)) attach(p.connect(cfg.prefix+net.code.toLowerCase(), {reliable:true}), gen, failed);
      });
      p.on('disconnected', function(){ handleSignalLost(p); });
      p.on('error',function(err){
        if(p!==peer) return;
        serverTimer=clearTimer(serverTimer);
        if(conn && conn.open) return; /* le lien (direct ou relais) fonctionne encore */
        cands.forEach(function(c){ if(!c.relay && !c._failed){ c._failed=true; try{ c.close(); }catch(e){} } });
        failed(peerErrorMessage(err), err, false);
      });
    }
    /* suit une connexion candidate jusqu'à son ouverture (ou son échec) */
    function attach(c, gen, failed){
      cands.push(c);
      var openTimer=setTimeout(function(){
        if(c.open || c._failed || c._lost) return;
        var reached=c.relay && c._reached && c._reached();
        c._failed=true; try{ c.close(); }catch(e){}
        failed(!c.relay ? 'CONNEXION DIRECTE IMPOSSIBLE — TESTE TA CONNEXION (⚙️ RÉGLAGES)'
          : reached ? 'SALLE INTROUVABLE — VÉRIFIE LE CODE (OU L’HÔTE A QUITTÉ L’APP)'
          : 'RELAIS INJOIGNABLE — TESTE TA CONNEXION (⚙️ RÉGLAGES)', null, !!c.relay);
      }, c.relay ? RELAY_OPEN_TIMEOUT : OPEN_TIMEOUT);
      c.on('open', function(){
        clearTimeout(openTimer);
        if(c._lost || c._failed) return;
        if(gen!==attemptGen || intentional || (conn && conn.open)){ c._lost=true; try{ c.close(); }catch(e){} return; }
        relayTimer=clearTimer(relayTimer);
        dropCands(c);
        adopt(c);
      });
      function gone(){
        clearTimeout(openTimer);
        if(c._adopted || c._lost || c._failed) return;
        c._failed=true;
        failed(c.relay ? 'RELAIS INJOIGNABLE — RÉESSAIE' : 'CONNEXION PERDUE', null, !!c.relay);
      }
      c.on('close', gone);
      c.on('error', gone);
    }
    /* la connexion est ouverte : demande d'une place, puis messages de l'hôte */
    function adopt(c){
      c._adopted=true;
      setHint('relay', !!c.relay);
      conn=c;
      var joinTries=0, joinTimer=null, seatedHere=false;
      hostLastSeen=Date.now();
      status('connecting', c.relay ? 'CONNECTÉ PAR LE RELAIS, ENTRÉE DANS LA SALLE...' : 'CONNECTÉ, ENTRÉE DANS LA SALLE...');
      function sendJoin(){
        joinTimer=null;
        if(conn!==c || seatedHere) return;
        if(joinTries>=JOIN_MAX_TRIES){
          conn=null; try{ c.close(); }catch(e){}
          guestFailure("L'HÔTE NE RÉPOND PAS");
          return;
        }
        joinTries++;
        var msg={type:'join_request', clientId:clientId};
        for(var k in joinPayload){ if(joinPayload.hasOwnProperty(k)) msg[k]=joinPayload[k]; }
        safeSend(c,msg);
        joinTimer=setTimeout(sendJoin, JOIN_RETRY);
      }
      c.on('data',function(msg){
        if(conn!==c || !msg || !msg.type) return;
        hostLastSeen=Date.now();
        if(msg.type==='_ping'){ safeSend(c,{type:'_pong'}); return; }
        if(msg.type==='_chat'){ emitChat(msg); return; }
        if(msg.type==='_roster'){ if(Array.isArray(msg.ids)){ roster=msg.ids.slice(); rosterLive=(msg.live||[]).slice(); } return; }
        if(msg.type==='room_full'){
          joinTimer=clearTimer(joinTimer);
          intentional=true;
          status('error', msg.reason||'SALLE COMPLÈTE');
          call('onHostMessage', msg);
          return;
        }
        if(msg.type==='seat_assigned'){
          joinTimer=clearTimer(joinTimer);
          seatedHere=true;
          var wasJoined=joined;
          joined=true; reconnectAttempt=0; lostAt=0;
          reconnectTimer=clearTimer(reconnectTimer);
          net.mySeat=msg.seat;
          status('connected', (wasJoined?'RECONNECTÉ':'CONNEXION ÉTABLIE')+(c.relay?' (RELAIS)':''));
          call('onHostMessage', msg);
          if(wasJoined) call('onReconnected');
          return;
        }
        call('onHostMessage', msg);
      });
      function down(){
        joinTimer=clearTimer(joinTimer);
        if(conn!==c) return;
        conn=null;
        guestFailure('CONNEXION PERDUE');
      }
      c.on('close', down);
      c.on('error', down);
      watchLink(c, down);
      sendJoin();
    }
    /* Échec côté invité : avant d'avoir été placé, on affiche l'erreur ;
       une fois en jeu, on retente automatiquement de récupérer sa place. */
    function guestFailure(reason, noRoom){
      if(intentional || net.role!=='guest') return;
      if(!joined){
        /* pas encore entré : l'hôte a peut-être quitté l'app un instant (pour envoyer le
           code par message…) ; on réessaie un peu avant d'afficher l'erreur */
        if(!noRoom && preJoinTries<PREJOIN_MAX){
          preJoinTries++;
          status('connecting','EN ATTENTE DE L’HÔTE ('+preJoinTries+'/'+PREJOIN_MAX+')...');
          reconnectTimer=clearTimer(reconnectTimer);
          reconnectTimer=setTimeout(function(){ reconnectTimer=null; connectToHost(true); }, 2500);
          return;
        }
        status('error', reason); return;
      }
      if(reconnectTimer) return;
      if(!lostAt) lostAt=Date.now();
      /* une reprise de la salle reste possible : on continue d'essayer plus longtemps */
      if(reconnectAttempt>=RECONNECT_DELAYS.length && canMigrate() && Date.now()-lostAt<MIGRATE_MAX){
        status('error','HÔTE PERDU — RECHERCHE D’UN NOUVEL HÔTE...');
        scheduleRetry(MIGRATE_RETRY);
        return;
      }
      if(reconnectAttempt>=RECONNECT_DELAYS.length){
        status('offline','DÉCONNECTÉ');
        var r=reason; net.close(); call('onLost', r);
        return;
      }
      if(reconnectAttempt===0) call('onReconnecting');
      status('error','CONNEXION PERDUE — NOUVELLE TENTATIVE...');
      var delay=RECONNECT_DELAYS[reconnectAttempt];
      /* une reprise de salle est possible : on réessaie vite, pour la voir tôt */
      if(canMigrate()) delay=Math.min(delay, 2000);
      reconnectAttempt++;
      /* au-delà de la 2e tentative, on repart d'un Peer neuf */
      if(reconnectAttempt>2) destroyPeer();
      reconnectTimer=setTimeout(function(){ reconnectTimer=null; connectToHost(true); }, delay);
    }
    function scheduleRetry(delay){
      reconnectTimer=clearTimer(reconnectTimer);
      reconnectTimer=setTimeout(function(){ reconnectTimer=null; connectToHost(true); }, delay);
    }
    function canMigrate(){ return !!(cfg.onPromote && roster && joined); }
    /* rang dans la liste de succession : 0 = premier invité encore là au dernier envoi */
    function successorRank(){
      var rank=0;
      for(var s=1;s<roster.length;s++){
        if(!roster[s] || rosterLive[s]===false) continue;
        if(roster[s]===clientId) return rank;
        rank++;
      }
      return -1;
    }
    var promoteInfo=null;
    function tryPromote(){
      if(!canMigrate() || promoting || net.role!=='guest') return false;
      if(!lostAt) lostAt=Date.now();
      var rank=successorRank();
      if(rank<0 || Date.now()-lostAt < rank*PROMOTE_STEP) return false;
      promoting=true;
      promoteInfo={oldSeat:net.mySeat, ids:roster.slice()};
      reconnectTimer=clearTimer(reconnectTimer); relayTimer=clearTimer(relayTimer);
      attemptGen++; dropCands(); conn=null;
      destroyPeer();
      status('connecting','L’HÔTE EST PARTI — TU DEVIENS L’HÔTE...');
      net.role=null; hostIdRetries=3; wantedCode=net.code;
      openHostPeer(function(){
        var info=promoteInfo;
        joined=false; lostAt=0; reconnectAttempt=0;
        status('connected','TU ES LE NOUVEL HÔTE');
        call('onPromote', info);
      });
      return true;
    }
    function guestWatchdog(){
      if(net.role!=='guest' || !joined || !conn || !conn.open) return;
      if(Date.now()-hostLastSeen>PEER_TIMEOUT){
        var c=conn; conn=null; try{ c.close(); }catch(e){}
        guestFailure("L'HÔTE NE RÉPOND PLUS");
      }
    }
    document.addEventListener('visibilitychange', function(){
      if(document.visibilityState==='visible') guestWatchdog();
    });
    /* onglet fermé ou page quittée : par le relais, on prévient l'hôte tout de suite
       (sinon il attend 12 s de silence avant de libérer la place) */
    window.addEventListener('pagehide', function(){
      if(net.role==='guest' && conn && conn.relay && conn.open){ try{ conn.close(); }catch(e){} }
    });
    /* le réseau revient (wifi -> 4G, sortie d'un tunnel…) : on réessaie tout de suite
       au lieu d'attendre le prochain essai programmé */
    window.addEventListener('online', function(){
      if(intentional) return;
      if(peer && peer.disconnected && !peer.destroyed){ try{ peer.reconnect(); }catch(e){} }
      if(net.role==='guest' && joined && reconnectTimer && !(conn && conn.open)){
        reconnectTimer=clearTimer(reconnectTimer);
        destroyPeer();
        connectToHost(true);
      }
    });

    /* ===================== ENVOI ===================== */
    net.sendTo = function(seat,msg){
      if(net.role==='host') return safeSend(net.conns[seat],msg);
      return false;
    };
    /* même message à plusieurs invités : un envoi par invité direct, un seul pour tous ceux du relais */
    function sendGroup(msg, exceptSeat){
      var relays=[];
      for(var s=1;s<net.conns.length;s++){
        var c=net.conns[s];
        if(!c || s===exceptSeat) continue;
        if(c.relay){ if(c.open) relays.push(c); }
        else safeSend(c,msg);
      }
      if(relays.length && hostRelay){ try{ hostRelay.sendAll(msg, relays); }catch(e){} }
    }
    net.sendToAll = function(msg){ sendGroup(msg, -1); };
    /* hôte : à tout le monde, lui compris. L'hôte traite une copie : son
       affichage ne doit jamais modifier l'état qui fait foi. */
    function selfCopy(msg){ call('onHostMessage', JSON.parse(JSON.stringify(msg))); }
    net.broadcast = function(msg){ selfCopy(msg); net.sendToAll(msg); };
    net.sendToSeat = function(seat, msg){ if(seat===0) selfCopy(msg); else net.sendTo(seat, msg); };
    net.sendToAllExcept = function(msg, exceptSeat){ sendGroup(msg, exceptSeat); };
    /* invité -> hôte ; hôte -> tout le monde */
    net.send = function(msg){
      if(net.role==='host'){ net.sendToAll(msg); return true; }
      return safeSend(conn,msg);
    };
    net.isSeatConnected = function(seat){
      if(net.role!=='host') return false;
      if(seat===0) return true;
      var c=net.conns[seat]; return !!(c && c.open && !c._dead);
    };
    /* farewell : message envoyé à tous les invités avant de fermer (hôte).
       Les connexions sont fermées un peu plus tard pour qu'il parte bien. */
    net.close = function(farewell){
      intentional=true; openGen++; attemptGen++;
      serverTimer=clearTimer(serverTimer);
      relayTimer=clearTimer(relayTimer);
      dropCands();
      heartbeatTimer=clearTimer(heartbeatTimer);
      reconnectTimer=clearTimer(reconnectTimer);
      signalTimer=clearTimer(signalTimer);
      var oldConn=conn, oldConns=net.conns, oldPeer=peer, oldRelay=hostRelay;
      conn=null; net.conns=[]; peer=null; hostRelay=null;
      for(var s=1;s<oldConns.length;s++){
        if(!oldConns[s]) continue;
        oldConns[s]._dead=true;
        if(farewell) safeSend(oldConns[s], farewell);
      }
      function teardown(){
        if(oldConn){ try{ oldConn.close(); }catch(e){} }
        for(var k=1;k<oldConns.length;k++){ if(oldConns[k]){ try{ oldConns[k].close(); }catch(e){} } }
        if(oldPeer){ try{ oldPeer.destroy(); }catch(e){} }
        if(oldRelay){ try{ oldRelay.stop(); }catch(e){} }
      }
      if(farewell && oldConns.length) setTimeout(teardown, 400); else teardown();
      net.role=null; net.code=''; net.mySeat=0; joined=false;
      roster=null; lostAt=0; promoting=false;
    };
    /* ----- petit chat de salle (réactions, messages courts), commun à tous les jeux ----- */
    var chatListeners=[];
    function cleanChat(m, seat){
      var text=String(m.text||'').replace(/\s+/g,' ').trim().slice(0,80);
      if(!text) return null;
      return {type:'_chat', seat:seat, name:String(m.name||'?').slice(0,18), text:text};
    }
    function emitChat(m){ chatListeners.forEach(function(fn){ try{ fn(m); }catch(e){} }); }
    function relayChat(m, seat){
      var c=cleanChat(m, seat); if(!c) return;
      net.sendToAll(c); emitChat(c);
    }
    net.chat=function(text, name){
      if(net.role==='host') relayChat({text:text, name:name}, 0);
      else if(net.role==='guest') safeSend(conn, {type:'_chat', text:text, name:name});
    };
    net.onChat=function(fn){ chatListeners.push(fn); };
    net.clientId = clientId;
    return net;
  }

  CG.createRoomNet = createRoomNet;

  /* ----- test de connexion (⚙️ Réglages) -----
     1. le serveur de mise en relation PeerJS répond-il ?
     2. quelles routes WebRTC sont possibles : adresse publique (STUN) et relais (TURN) ?
     done({server, direct, relay, own}) : true / false pour chaque étape. */
  function netTest(done){
    var out={server:false, direct:false, relay:false, own:false, backup:false};
    iceReady().then(function(){
      out.own=ice.own;
      var left=3;
      function step(){ if(--left===0) done(out); }
      /* 1. serveur PeerJS */
      var p=null, t1=setTimeout(function(){ end1(); }, 8000);
      function end1(){ clearTimeout(t1); try{ if(p) p.destroy(); }catch(e){} p=null; step(); }
      try{
        p=new Peer(PEER_OPTS);
        p.on('open', function(){ out.server=true; end1(); });
        p.on('error', function(){ end1(); });
      }catch(e){ end1(); }
      /* 3. relais Supabase (secours quand rien d'autre ne passe) */
      var tb=null, t3=setTimeout(function(){ end3(); }, 8000);
      function end3(){ clearTimeout(t3); if(tb){ tb.leave(); tb=null; step(); } }
      tb=rtJoin('cg:test-'+randToken(), function(){}, function(){ out.backup=true; end3(); });
      /* 2. candidats ICE */
      var pc=null, t2=setTimeout(function(){ end2(); }, 7000), ended=false;
      function end2(){ if(ended) return; ended=true; clearTimeout(t2); try{ if(pc) pc.close(); }catch(e){} step(); }
      try{
        pc=new RTCPeerConnection({iceServers:PEER_OPTS.config.iceServers});
        pc.createDataChannel('test');
        pc.onicecandidate=function(e){
          if(!e.candidate){ end2(); return; }
          var c=e.candidate.candidate||'';
          if(/ typ srflx/.test(c)) out.direct=true;
          if(/ typ relay/.test(c)) out.relay=true;
          if(out.direct && out.relay) end2();
        };
        pc.createOffer().then(function(o){ return pc.setLocalDescription(o); })['catch'](end2);
      }catch(e){ end2(); }
    });
  }
  CG.netTest = netTest;
  CG.getClientId = getClientId;
})();
