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
   - reconnexion de l'hôte au serveur de signalisation PeerJS.

   Le jeu fournit des callbacks (voir createRoomNet) et garde toute la
   logique de places / d'état. */
(function(){
  'use strict';
  var CG = window.CG = window.CG || {};

  var ROOM_WORDS = ['TAKE','JOKER','PHANTOM','MASQUE','ARSENE','RIOT','REBEL','CHAOS','ROYAL','WILDCARD'];

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

  function randomRoomCode(){
    var w = ROOM_WORDS[Math.floor(Math.random()*ROOM_WORDS.length)];
    var n = Math.floor(1000+Math.random()*9000);
    return w+'-'+n;
  }
  function peerErrorMessage(err){
    var t = err && err.type;
    if(t==='unavailable-id') return 'CE CODE EST DÉJÀ PRIS, RÉESSAIE';
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
     - onLost(reason)         abandon définitif */
  function createRoomNet(cfg){
    var net = {role:null, code:'', mySeat:0, conns:[]};
    var clientId = getClientId(cfg.prefix);
    var peer=null, conn=null;
    var intentional=false, joined=false, joinPayload=null;
    var serverTimer=null, heartbeatTimer=null, reconnectTimer=null, signalTimer=null;
    var reconnectAttempt=0, hostLastSeen=0, hostIdRetries=0;

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
    net.host = function(onReady){
      net.close();
      intentional=false;
      if(typeof Peer==='undefined'){ status('error','PEERJS INDISPONIBLE (vérifie ta connexion internet)'); return; }
      hostIdRetries=0;
      openHostPeer(onReady);
    };
    function openHostPeer(onReady){
      status('connecting','CRÉATION DE LA SALLE...');
      var code=randomRoomCode();
      var p=peer=new Peer(cfg.prefix+code.toLowerCase(), PEER_OPTS);
      serverTimer=setTimeout(function(){
        if(p===peer && !p.open) status('error','IMPOSSIBLE DE JOINDRE LE SERVEUR — RÉESSAIE');
      }, SERVER_TIMEOUT);
      p.on('open',function(){
        if(p!==peer) return;
        serverTimer=clearTimer(serverTimer);
        if(net.role==='host'){ status('connected','SALLE EN LIGNE'); return; } /* ré-ouverture après coupure */
        net.role='host'; net.code=code; net.mySeat=0; net.conns=[];
        heartbeatTimer=setInterval(hostHeartbeat, PING_EVERY);
        status('connected','SALLE CRÉÉE');
        onReady(code);
      });
      p.on('connection', hostAccept);
      p.on('disconnected', function(){ handleSignalLost(p); });
      p.on('error',function(err){
        if(p!==peer) return;
        if(err && err.type==='unavailable-id' && !net.role && hostIdRetries<3){
          hostIdRetries++; serverTimer=clearTimer(serverTimer); destroyPeer(); openHostPeer(onReady); return;
        }
        if(err && err.type==='peer-unavailable') return;
        serverTimer=clearTimer(serverTimer);
        if(!net.role || !p.open) status('error', peerErrorMessage(err));
      });
    }
    function hostAccept(c){
      c._seat=null; c._dead=false; c._lastSeen=Date.now();
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
        c._seat=seat;
        net.conns[seat]=c;
        call('onSeatJoined', seat, msg, false);
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
    }
    function hostHeartbeat(){
      var now=Date.now();
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
          joined=true; reconnectAttempt=0;
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
      if(reconnectAttempt>=RECONNECT_DELAYS.length){
        status('offline','DÉCONNECTÉ');
        var r=reason; net.close(); call('onLost', r);
        return;
      }
      if(reconnectAttempt===0) call('onReconnecting');
      status('error','CONNEXION PERDUE — NOUVELLE TENTATIVE...');
      var delay=RECONNECT_DELAYS[reconnectAttempt];
      reconnectAttempt++;
      /* au-delà de la 2e tentative, on repart d'un Peer neuf */
      if(reconnectAttempt>2) destroyPeer();
      reconnectTimer=setTimeout(function(){ reconnectTimer=null; connectToHost(true); }, delay);
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
    };
    net.clientId = clientId;
    return net;
  }

  CG.createRoomNet = createRoomNet;
  CG.getClientId = getClientId;
})();
