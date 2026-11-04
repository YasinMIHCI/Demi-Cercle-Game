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
    var wantedCode='';
    net.host = function(onReady, code){
      net.close();
      intentional=false;
      if(typeof Peer==='undefined'){ status('error','PEERJS INDISPONIBLE (vérifie ta connexion internet)'); return; }
      hostIdRetries=0;
      wantedCode=cleanRoomCode(code);
      openHostPeer(onReady);
    };
    function openHostPeer(onReady){
      status('connecting','CRÉATION DE LA SALLE...');
      var code=wantedCode||randomRoomCode();
      var p=peer=new Peer(cfg.prefix+code.toLowerCase(), PEER_OPTS);
      serverTimer=setTimeout(function(){
        if(p===peer && !p.open) status('error','IMPOSSIBLE DE JOINDRE LE SERVEUR — RÉESSAIE');
      }, SERVER_TIMEOUT);
      p.on('open',function(){
        if(p!==peer) return;
        serverTimer=clearTimer(serverTimer);
        if(net.role==='host'){ status('connected','SALLE EN LIGNE'); return; } /* ré-ouverture après coupure */
        promoting=false;
        net.role='host'; net.code=code; net.mySeat=0; net.conns=[]; seatIds=[];
        heartbeatTimer=clearTimer(heartbeatTimer);
        heartbeatTimer=setInterval(hostHeartbeat, PING_EVERY);
        status('connected','SALLE CRÉÉE');
        onReady(code);
      });
      p.on('connection', hostAccept);
      p.on('disconnected', function(){ handleSignalLost(p); });
      p.on('error',function(err){
        if(p!==peer) return;
        /* reprise de la salle : le code est encore pris (ancien hôte pas encore
           oublié par le serveur, ou un autre invité a été plus rapide) -> on
           redevient invité et on continue d'essayer de se connecter */
        if(promoting && err && err.type==='unavailable-id'){
          promoting=false; serverTimer=clearTimer(serverTimer); destroyPeer();
          net.role='guest'; net.mySeat=promoteInfo.oldSeat;
          scheduleRetry(MIGRATE_RETRY);
          return;
        }
        if(err && err.type==='unavailable-id' && !net.role && hostIdRetries<3){
          /* code choisi : la salle qu'on vient de fermer peut occuper encore
             l'identifiant quelques secondes, on réessaie un peu avant d'abandonner */
          hostIdRetries++; serverTimer=clearTimer(serverTimer); destroyPeer();
          if(wantedCode){
            status('connecting','CODE OCCUPÉ, NOUVEL ESSAI...');
            signalTimer=setTimeout(function(){ signalTimer=null; if(!intentional && !peer) openHostPeer(onReady); }, 1500);
          } else openHostPeer(onReady);
          return;
        }
        if(err && err.type==='peer-unavailable') return;
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
    net.join = function(code, payload){
      net.close();
      intentional=false;
      if(typeof Peer==='undefined'){ status('error','PEERJS INDISPONIBLE (vérifie ta connexion internet)'); return; }
      net.role='guest'; net.code=code; net.mySeat=0;
      joinPayload=payload||{}; joined=false; reconnectAttempt=0;
      heartbeatTimer=setInterval(guestWatchdog, 2000);
      connectToHost(false);
    };
    function connectToHost(isRetry){
      if(intentional) return;
      status('connecting', isRetry ? 'RECONNEXION ('+reconnectAttempt+'/'+RECONNECT_DELAYS.length+')...' : 'CONNEXION EN COURS...');
      if(peer && peer.open && !peer.disconnected && !peer.destroyed){ openConn(); return; }
      destroyPeer();
      var p=peer=new Peer(PEER_OPTS);
      serverTimer=clearTimer(serverTimer);
      serverTimer=setTimeout(function(){
        if(p!==peer || p.open) return;
        guestFailure('IMPOSSIBLE DE JOINDRE LE SERVEUR — RÉESSAIE');
      }, SERVER_TIMEOUT);
      p.on('open',function(){
        if(p!==peer) return;
        serverTimer=clearTimer(serverTimer);
        if(!conn) openConn();
      });
      p.on('disconnected', function(){ handleSignalLost(p); });
      p.on('error',function(err){
        if(p!==peer) return;
        serverTimer=clearTimer(serverTimer);
        if(conn && conn.open) return; /* le lien direct fonctionne encore */
        if(conn){ var c=conn; conn=null; try{ c.close(); }catch(e){} }
        /* plus personne ne porte le code de la salle : l'hôte est parti */
        if(err && err.type==='peer-unavailable' && tryPromote()) return;
        guestFailure(peerErrorMessage(err));
      });
    }
    function openConn(){
      var c=conn=peer.connect(cfg.prefix+net.code.toLowerCase(), {reliable:true});
      var joinTries=0, joinTimer=null, seatedHere=false;
      var openTimer=setTimeout(function(){
        if(conn!==c || c.open) return;
        conn=null; try{ c.close(); }catch(e){}
        guestFailure('CONNEXION DIRECTE IMPOSSIBLE (réseau/pare-feu ?)');
      }, OPEN_TIMEOUT);
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
      c.on('open',function(){
        if(conn!==c) return;
        clearTimeout(openTimer);
        hostLastSeen=Date.now();
        status('connecting','CONNECTÉ, ENTRÉE DANS LA SALLE...');
        sendJoin();
      });
      c.on('data',function(msg){
        if(conn!==c || !msg || !msg.type) return;
        hostLastSeen=Date.now();
        if(msg.type==='_ping'){ safeSend(c,{type:'_pong'}); return; }
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
          status('connected', wasJoined?'RECONNECTÉ':'CONNEXION ÉTABLIE');
          call('onHostMessage', msg);
          if(wasJoined) call('onReconnected');
          return;
        }
        call('onHostMessage', msg);
      });
      function down(){
        clearTimeout(openTimer); joinTimer=clearTimer(joinTimer);
        if(conn!==c) return;
        conn=null;
        guestFailure('CONNEXION PERDUE');
      }
      c.on('close', down);
      c.on('error', down);
      watchLink(c, down);
    }
    /* Échec côté invité : avant d'avoir été placé, on affiche l'erreur ;
       une fois en jeu, on retente automatiquement de récupérer sa place. */
    function guestFailure(reason){
      if(intentional || net.role!=='guest') return;
      if(!joined){ status('error', reason); return; }
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
      reconnectTimer=clearTimer(reconnectTimer);
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

    /* ===================== ENVOI ===================== */
    net.sendTo = function(seat,msg){
      if(net.role==='host') return safeSend(net.conns[seat],msg);
      return false;
    };
    net.sendToAll = function(msg){
      for(var s=1;s<net.conns.length;s++) safeSend(net.conns[s],msg);
    };
    /* hôte : à tout le monde, lui compris. L'hôte traite une copie : son
       affichage ne doit jamais modifier l'état qui fait foi. */
    function selfCopy(msg){ call('onHostMessage', JSON.parse(JSON.stringify(msg))); }
    net.broadcast = function(msg){ selfCopy(msg); net.sendToAll(msg); };
    net.sendToSeat = function(seat, msg){ if(seat===0) selfCopy(msg); else net.sendTo(seat, msg); };
    net.sendToAllExcept = function(msg, exceptSeat){
      for(var s=1;s<net.conns.length;s++){ if(s!==exceptSeat) safeSend(net.conns[s],msg); }
    };
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
      intentional=true;
      serverTimer=clearTimer(serverTimer);
      heartbeatTimer=clearTimer(heartbeatTimer);
      reconnectTimer=clearTimer(reconnectTimer);
      signalTimer=clearTimer(signalTimer);
      var oldConn=conn, oldConns=net.conns, oldPeer=peer;
      conn=null; net.conns=[]; peer=null;
      for(var s=1;s<oldConns.length;s++){
        if(!oldConns[s]) continue;
        oldConns[s]._dead=true;
        if(farewell) safeSend(oldConns[s], farewell);
      }
      function teardown(){
        if(oldConn){ try{ oldConn.close(); }catch(e){} }
        for(var k=1;k<oldConns.length;k++){ if(oldConns[k]){ try{ oldConns[k].close(); }catch(e){} } }
        if(oldPeer){ try{ oldPeer.destroy(); }catch(e){} }
      }
      if(farewell && oldConns.length) setTimeout(teardown, 400); else teardown();
      net.role=null; net.code=''; net.mySeat=0; joined=false;
      roster=null; lostAt=0; promoting=false;
    };
    net.clientId = clientId;
    return net;
  }

  CG.createRoomNet = createRoomNet;
  CG.getClientId = getClientId;
})();
