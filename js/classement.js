/* Le Classement — « Qui est le plus... ? » (3 à 8 joueurs en ligne).
   Chaque manche, une question sur le groupe (« Qui est le plus fort au bras
   de fer ? ») : chacun classe en secret tous les joueurs, lui compris. On
   révèle le podium du groupe (la moyenne des classements), chacun marque
   selon sa proximité avec le groupe, et deux titres tombent : l'Ego (se
   classe bien plus haut que le groupe ne le fait) et le Rebelle (le moins
   d'accord avec tout le monde). L'hôte fait autorité sur tout. */
(function(){
  'use strict';
  var CG=window.CG;
  var $=CG.$, escapeHtml=CG.escapeHtml, shuffle=CG.shuffle, shake=CG.shake, openModal=CG.openModal, closeModal=CG.closeModal;
  var sfxToggle=CG.sfxToggle, sfxValidate=CG.sfxValidate, sfxReveal=CG.sfxReveal, copyText=CG.copyText;

  var ROOM_PREFIX='p5classement-';
  var MIN_PLAYERS=3, MAX_PLAYERS=8;
  var RANK_MS=75000;
  var REVEAL_STEP=700;             /* délai entre deux places révélées */
  var COLORS=['#E60012','#2E6FF2','#FFE600','#7cff6e','#ff6ec7','#ff9d2f','#00e5ff','#b388ff'];
  var CUSTOM_KEY='cls_custom_v1';

  /* « Qui est le plus... » : 1er = le plus, dernier = le moins */
  var DEFAULT_QUESTIONS=[
    /* physique */
    "Qui est le plus fort au bras de fer ?","Qui court le plus vite ?","Qui tiendrait le plus longtemps en apnée ?",
    "Qui gagnerait un combat de sumo ?","Qui est le plus souple ?","Qui survivrait le plus longtemps dans la jungle ?",
    "Qui est le plus endurant ?","Qui a la plus grosse descente (à table) ?","Qui mange le plus épicé ?",
    "Qui est le plus maladroit ?","Qui danse le mieux ?","Qui chante le mieux ?",
    /* caractère */
    "Qui est le plus drôle ?","Qui est le plus râleur ?","Qui est le plus mauvais perdant ?","Qui est le plus têtu ?",
    "Qui est le plus patient ?","Qui est le plus généreux ?","Qui est le plus radin ?","Qui est le plus jaloux ?",
    "Qui est le plus rancunier ?","Qui est le plus naïf ?","Qui est le plus courageux ?","Qui est le plus froussard ?",
    "Qui est le plus dramatique ?","Qui est le plus calme sous la pression ?","Qui est le plus susceptible ?",
    "Qui est le plus bavard ?","Qui garde le mieux un secret ?","Qui ment le mieux ?","Qui est le plus de mauvaise foi ?",
    "Qui est le plus romantique ?","Qui est le plus nostalgique ?","Qui est le plus optimiste ?","Qui est le plus curieux ?",
    "Qui a le plus d'ego ?","Qui est le plus compétitif ?","Qui est le plus sociable ?","Qui est le plus timide ?",
    /* habitudes */
    "Qui est le plus souvent en retard ?","Qui est le plus tête en l'air ?","Qui passe le plus de temps sur son téléphone ?",
    "Qui dort le plus ?","Qui est le plus du matin ?","Qui est le plus bordélique ?","Qui est le plus maniaque ?",
    "Qui est le plus gourmand ?","Qui dépense le plus d'argent ?","Qui fait le plus de sport ?","Qui joue le plus aux jeux vidéo ?",
    "Qui regarde le plus de séries ?","Qui lit le plus ?","Qui envoie le plus de vocaux ?","Qui répond le plus lentement aux messages ?",
    "Qui prend le plus de selfies ?","Qui cuisine le mieux ?","Qui fait le plus de fautes d'orthographe ?","Qui s'habille le mieux ?",
    "Qui a les goûts musicaux les plus douteux ?","Qui raconte les pires blagues ?","Qui rit le plus fort ?",
    /* et si... */
    "Qui deviendrait le plus probablement célèbre ?","Qui finirait le plus probablement en prison ?","Qui deviendrait millionnaire ?",
    "Qui survivrait le plus longtemps à une apocalypse zombie ?","Qui mourrait en premier dans un film d'horreur ?",
    "Qui serait le meilleur président ?","Qui serait le pire colocataire ?","Qui serait le meilleur parent ?",
    "Qui gagnerait à Koh-Lanta ?","Qui se ferait éliminer en premier à Koh-Lanta ?","Qui ferait le meilleur espion ?",
    "Qui se perdrait le plus vite dans une ville inconnue ?","Qui pleurerait le plus devant un film triste ?",
    "Qui oublierait le plus vite ton anniversaire ?","Qui appellerais-tu en premier en cas de problème ?",
    "Qui aurait le plus de chances de gagner au Loto… et de tout dépenser en un mois ?","Qui serait le meilleur prof ?",
    "Qui se marierait en premier ?","Qui aurait le plus d'enfants ?","Qui partirait vivre à l'autre bout du monde ?",
    "Qui deviendrait le plus vite influenceur ?","Qui gagnerait un débat contre n'importe qui ?","Qui ferait le meilleur méchant de film ?",
    "Qui tiendrait le plus longtemps sans téléphone ?","Qui craquerait en premier dans un escape game ?","Qui adopterait le plus d'animaux ?",
    /* entre nous */
    "Qui connaît le mieux les autres joueurs ?","Qui est le plus fiable ?","Qui donne les meilleurs conseils ?",
    "Qui met le plus l'ambiance en soirée ?","Qui part le plus tôt des soirées ?","Qui fait les meilleurs cadeaux ?",
    "Qui est le plus fort à ce genre de jeux ?","Qui triche le plus aux jeux de société ?","Qui a le plus changé depuis qu'on le connaît ?",
    "Qui a le meilleur style ?","Qui a le plus de chances de lire ce message en retard ?","Qui est le plus fan de Persona ?"
  ];
  function loadCustom(){
    try{ var arr=JSON.parse(localStorage.getItem(CUSTOM_KEY)||'[]'); if(Array.isArray(arr)) return arr.filter(function(q){ return typeof q==='string' && q; }); }catch(e){}
    return [];
  }
  var custom=loadCustom();
  function bank(){ return custom.concat(DEFAULT_QUESTIONS); }

  /* hôte : état qui fait foi */
  var cs={
    players:[], scores:[], connected:[], clientIds:[],
    phase:'lobby',                 /* 'lobby' | 'ranking' | 'result' | 'over' | 'lobby_wait' */
    round:0, roundSeats:[], question:'', rankings:{}, pool:[],
    deadline:0, timer:null, lastResult:null, started:false
  };
  var netRole=null, mySeat=0, myName='', roomCode='';
  var inRound=false, roundLiveForLobby=false;
  /* vue du joueur */
  var view={roundSeats:[], question:'', order:[], sent:false, ranked:[]};
  var rankBar=CG.timerBar('clsTimerFill','clsTimerText');
  var revealTimers=[];

  /* ===================== RÉSEAU ===================== */
  function setNetStatus(cls,label){
    var el=$('clsNetStatus');
    el.className='net-status '+cls;
    el.querySelector('.net-label').textContent=label;
  }
  var net=CG.createRoomNet({
    prefix: ROOM_PREFIX,
    onStatus: setNetStatus,
    onJoinRequest: hostOnJoinRequest,
    onSeatJoined: hostOnSeatJoined,
    onGuestMessage: hostOnGuestMessage,
    onSeatLost: hostOnSeatLost,
    onHostMessage: handleMsg,
    onReconnecting: function(){ showBanner('📡 Connexion perdue — reconnexion en cours...'); },
    onReconnected: function(){ hideBanner(); },
    onLost: function(){ showLostModal("Impossible de rétablir la connexion avec l'hôte."); }
  });
  /* l'hôte traite une copie : l'affichage ne doit pas toucher l'état qui fait foi */
  function broadcast(msg){ handleMsg(JSON.parse(JSON.stringify(msg))); net.sendToAll(msg); }
  function sendToSeat(seat,msg){ if(seat===0) handleMsg(JSON.parse(JSON.stringify(msg))); else net.sendTo(seat,msg); }

  function stopReveal(){ revealTimers.forEach(clearTimeout); revealTimers=[]; }
  function cleanupOnline(){
    net.close(netRole==='host' ? {type:'room_closed'} : null);
    clearTimeout(cs.timer); cs.timer=null;
    rankBar.stop(); stopReveal();
    netRole=null; mySeat=0; roomCode='';
    inRound=false; roundLiveForLobby=false;
    cs.players=[]; cs.scores=[]; cs.connected=[]; cs.clientIds=[];
    cs.phase='lobby'; cs.round=0; cs.roundSeats=[]; cs.rankings={}; cs.lastResult=null; cs.started=false;
    $('clsRoundBadge').style.display='none';
    hideBanner();
    setNetStatus('offline','HORS LIGNE');
  }
  function showBanner(t){ $('clsNetBannerText').textContent=t; $('clsNetBanner').classList.add('open'); }
  function hideBanner(){ $('clsNetBanner').classList.remove('open'); }
  function showLostModal(text){
    hideBanner(); setNetStatus('offline','DÉCONNECTÉ');
    $('clsDisconnectModalText').textContent=text;
    openModal('clsDisconnectModal');
  }
  $('clsDisconnectBackBtn').addEventListener('click',function(){
    closeModal('clsDisconnectModal'); cleanupOnline(); gotoScreen('online');
  });

  function isConnected(seat){ return seat===0 || cs.connected[seat]!==false; }
  function activeCount(){
    var n=0;
    for(var s=0;s<cs.players.length;s++){ if(cs.players[s] && isConnected(s)) n++; }
    return n;
  }
  function pname(seat){ var p=cs.players[seat]; return p?p.name:'?'; }
  function pcolor(seat){ return COLORS[seat%COLORS.length]; }

  /* ----- création / connexion ----- */
  function renderBankCount(){ $('clsBankCount').textContent=bank().length+' questions'; }
  $('clsAddQBtn').addEventListener('click',function(){
    var q=$('clsCustomQ').value.trim();
    if(!q){ shake($('clsCustomQ')); return; }
    if(!/\?\s*$/.test(q)) q+=' ?';
    custom.unshift(q);
    try{ localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom)); }catch(e){}
    $('clsCustomQ').value='';
    renderBankCount(); sfxToggle();
  });
  $('clsCreateRoomBtn').addEventListener('click',function(){
    myName=$('clsName').value.trim()||'Joueur';
    cleanupOnline();
    net.host(function(code){
      netRole='host'; mySeat=0; roomCode=code;
      cs.phase='lobby'; cs.pool=shuffle(bank());
      cs.players=[{name:myName}]; cs.scores=[0]; cs.connected=[true]; cs.clientIds=[net.clientId];
      try{ history.replaceState(null,'','#classement?room='+code); }catch(e){}
      $('clsCodeDisplay').textContent=code;
      renderLobby();
      gotoScreen('lobby');
    });
    sfxToggle();
  });
  $('clsJoinCode').addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); $('clsJoinRoomBtn').click(); } });
  $('clsJoinRoomBtn').addEventListener('click',function(){
    myName=$('clsName').value.trim()||'Joueur';
    var code=$('clsJoinCode').value.trim().toUpperCase();
    if(!code){ shake($('clsJoinCode')); return; }
    cleanupOnline();
    netRole='guest';
    net.join(code, {name:myName});
    sfxToggle();
  });
  $('clsCopyCodeBtn').addEventListener('click',function(){ copyText(roomCode, $('clsCopyCodeBtn')); });
  $('clsCopyLinkBtn').addEventListener('click',function(){ copyText(location.origin+location.pathname+'#classement?room='+roomCode, $('clsCopyLinkBtn')); });
  $('clsBackFromLobby').addEventListener('click',function(){ sfxToggle(); cleanupOnline(); gotoScreen('online'); });
  $('clsHubReturnBtn').addEventListener('click',function(){ sfxToggle(); location.hash='hub'; });
  $('clsRulesBtn').addEventListener('click',function(){ openModal('clsRulesModal'); sfxToggle(); });
  $('clsRulesModalClose').addEventListener('click',function(){ closeModal('clsRulesModal'); });
  $('clsRulesModal').addEventListener('click',function(e){ if(e.target===this) closeModal('clsRulesModal'); });

  /* ===================== HÔTE : PLACES ===================== */
  function hostOnJoinRequest(msg){
    for(var s=1;s<cs.clientIds.length;s++){
      if(msg.clientId && cs.clientIds[s]===msg.clientId && cs.players[s]) return s;
    }
    if(activeCount()>=MAX_PLAYERS) return 'SALLE COMPLÈTE ('+MAX_PLAYERS+'/'+MAX_PLAYERS+')';
    return Math.max(1, cs.players.length);
  }
  function hostOnSeatJoined(seat, msg, isRepeat){
    var p=cs.players[seat];
    if(p){ if(msg.name) p.name=msg.name; }
    else { cs.players[seat]={name:msg.name||'Joueur'}; cs.scores[seat]=0; }
    cs.clientIds[seat]=msg.clientId||null;
    cs.connected[seat]=true;
    net.sendTo(seat, {type:'seat_assigned', seat:seat, players:cs.players.slice(), scores:cs.scores.slice(),
      connected:cs.connected.slice(), inRound:cs.phase==='ranking'});
    if(cs.phase==='ranking' && cs.roundSeats.indexOf(seat)!==-1) net.sendTo(seat, roundMsg(seat));
    else if((cs.phase==='result' || cs.phase==='over') && cs.lastResult) net.sendTo(seat, cs.lastResult);
    hostBroadcastLobby();
    if(!isRepeat) sfxValidate();
  }
  function hostOnSeatLost(seat){
    if(!cs.started){
      cs.players[seat]=null; cs.clientIds[seat]=null;
      hostBroadcastLobby();
      return;
    }
    cs.connected[seat]=false;
    hostBroadcastLobby();
    if(cs.phase!=='ranking' || cs.roundSeats.indexOf(seat)===-1) return;
    if(cs.roundSeats.filter(isConnected).length<2){
      hostAbort('trop de joueurs se sont déconnectés.');
      return;
    }
    hostCheckAll();   /* on n'attend pas les absents */
  }
  function hostOnGuestMessage(seat, msg){
    if(msg.type==='rank_submit') hostReceiveRanking(seat, msg.order);
  }
  function hostBroadcastLobby(){
    broadcast({type:'lobby_update', players:cs.players.slice(), scores:cs.scores.slice(),
      connected:cs.connected.slice(), inRound:cs.phase==='ranking'});
  }

  /* ===================== HÔTE : MANCHE ===================== */
  function roundMsg(seat){
    return {type:'round_start', round:cs.round, question:cs.question, roundSeats:cs.roundSeats.slice(),
      ms:Math.max(0, cs.deadline-Date.now()), total:RANK_MS,
      mine: cs.rankings.hasOwnProperty(seat) ? cs.rankings[seat].slice() : null,
      ranked:Object.keys(cs.rankings).map(Number)};
  }
  $('clsStartBtn').addEventListener('click',function(){ sfxValidate(); hostStartRound(); });
  $('clsNextRoundBtn').addEventListener('click',function(){ sfxToggle(); hostStartRound(); });
  function hostStartRound(){
    var seats=[];
    for(var i=0;i<cs.players.length;i++){ if(cs.players[i] && isConnected(i)) seats.push(i); }
    if(seats.length<MIN_PLAYERS){
      cs.phase='lobby_wait';
      if(cs.started) broadcast({type:'round_aborted', reason:'il faut '+MIN_PLAYERS+' joueurs connectés pour continuer.'});
      else { renderLobby(); gotoScreen('lobby'); }
      setNetStatus('error', MIN_PLAYERS+' JOUEURS CONNECTÉS MINIMUM');
      return;
    }
    setNetStatus('connected','PARTIE EN COURS');
    cs.started=true;
    if(!cs.pool.length) cs.pool=shuffle(bank());
    cs.question=cs.pool.pop();
    cs.round++;
    cs.roundSeats=seats;
    cs.rankings={};
    cs.lastResult=null;
    cs.phase='ranking';
    cs.deadline=Date.now()+RANK_MS;
    clearTimeout(cs.timer);
    cs.timer=setTimeout(function(){ if(cs.phase==='ranking') hostResolve(); }, RANK_MS+300);
    seats.forEach(function(s){ sendToSeat(s, roundMsg(s)); });
    hostBroadcastLobby();
  }
  function hostReceiveRanking(seat, order){
    if(cs.phase!=='ranking' || cs.roundSeats.indexOf(seat)===-1 || cs.rankings.hasOwnProperty(seat)) return;
    /* un classement complet : chaque joueur de la manche exactement une fois */
    if(!Array.isArray(order) || order.length!==cs.roundSeats.length) return;
    var seen={};
    for(var i=0;i<order.length;i++){
      var s=order[i];
      if(cs.roundSeats.indexOf(s)===-1 || seen[s]) return;
      seen[s]=true;
    }
    cs.rankings[seat]=order.slice();
    broadcast({type:'rank_status', ranked:Object.keys(cs.rankings).map(Number)});
    hostCheckAll();
  }
  function hostCheckAll(){
    if(cs.phase!=='ranking') return;
    var pending=cs.roundSeats.filter(function(s){ return isConnected(s) && !cs.rankings.hasOwnProperty(s); });
    if(!pending.length){ clearTimeout(cs.timer); cs.timer=setTimeout(hostResolve, 500); }
  }
  /* Le cœur du jeu : moyenne des places, points de proximité, titres. */
  function hostResolve(){
    if(cs.phase!=='ranking') return;
    clearTimeout(cs.timer); cs.timer=null;
    var seats=cs.roundSeats, n=seats.length;
    var rankers=Object.keys(cs.rankings).map(Number);
    var avg={}, firsts={};
    seats.forEach(function(t){ avg[t]=0; firsts[t]=0; });
    rankers.forEach(function(r){
      cs.rankings[r].forEach(function(t,i){ avg[t]+=i+1; if(i===0) firsts[t]++; });
    });
    seats.forEach(function(t){ avg[t]= rankers.length ? avg[t]/rankers.length : 0; });
    /* égalité de moyenne : celui qui a été mis 1er le plus souvent passe devant */
    var group=seats.slice().sort(function(a,b){ return (avg[a]-avg[b]) || (firsts[b]-firsts[a]) || (a-b); });
    var gpos={}; group.forEach(function(t,i){ gpos[t]=i+1; });
    var maxDist=Math.floor(n*n/2), dist={}, pts={};
    rankers.forEach(function(r){
      var d=0;
      cs.rankings[r].forEach(function(t,i){ d+=Math.abs((i+1)-gpos[t]); });
      dist[r]=d;
      /* à un seul classement, il n'y a pas de « groupe » : pas de points */
      pts[r]= rankers.length>=2 ? Math.round(10*(1-d/maxDist)) : 0;
      cs.scores[r]=(cs.scores[r]||0)+pts[r];
    });
    /* titres */
    var self={}, ego=null, modest=null, rebel=null;
    rankers.forEach(function(r){
      self[r]=cs.rankings[r].indexOf(r)+1;
      var gap=gpos[r]-self[r];               /* >0 : se voit plus haut que le groupe ne le voit */
      /* à écart égal, celui qui s'est placé le plus haut (« je suis 1er ! ») */
      if(gap>=1 && (!ego || gap>ego.gap || (gap===ego.gap && self[r]<ego.self))) ego={seat:r, gap:gap, self:self[r], group:gpos[r]};
      if(gap<=-2 && (!modest || gap<modest.gap)) modest={seat:r, gap:gap, self:self[r], group:gpos[r]};
    });
    if(rankers.length>=3){
      rankers.forEach(function(r){ if(dist[r]>0 && (!rebel || dist[r]>rebel.dist)) rebel={seat:r, dist:dist[r]}; });
    }
    var best=rankers.length ? Math.max.apply(null, rankers.map(function(r){ return pts[r]; })) : 0;
    var closest= rankers.length>=2 ? rankers.filter(function(r){ return pts[r]===best; }) : [];
    cs.phase='result';
    var msg={type:'round_result', round:cs.round, question:cs.question, roundSeats:seats.slice(),
      group:group, avg:avg, rankings:cs.rankings, pts:pts, self:self,
      ego:ego, modest:modest, rebel:rebel, closest:closest, scores:cs.scores.slice()};
    cs.lastResult=msg;
    broadcast(msg);
    hostBroadcastLobby();
  }
  function hostAbort(reason){
    clearTimeout(cs.timer); cs.timer=null;
    cs.phase='lobby_wait';
    broadcast({type:'round_aborted', reason:reason});
    hostBroadcastLobby();
  }
  $('clsEndGameBtn').addEventListener('click',function(){
    if(netRole!=='host' || cs.phase!=='result') return;
    sfxValidate();
    cs.phase='over';
    cs.lastResult={type:'game_over', scores:cs.scores.slice(), players:cs.players.slice()};
    broadcast(cs.lastResult);
  });
  $('clsNewGameBtn').addEventListener('click',function(){
    if(netRole!=='host') return;
    sfxToggle();
    /* nouvelle partie : scores à zéro, les absents libèrent leur place */
    for(var s=1;s<cs.players.length;s++){ if(cs.players[s] && !isConnected(s)){ cs.players[s]=null; cs.clientIds[s]=null; } }
    for(s=0;s<cs.players.length;s++) cs.scores[s]=0;
    cs.phase='lobby'; cs.round=0; cs.lastResult=null; cs.started=false;
    broadcast({type:'back_to_lobby'});
    hostBroadcastLobby();
  });

  /* ===================== MESSAGES ===================== */
  function handleMsg(msg){
    if(!msg || !msg.type) return;
    switch(msg.type){
      case 'room_full': setNetStatus('error', msg.reason||'SALLE COMPLÈTE'); break;
      case 'seat_assigned':
        mySeat=msg.seat; roomCode=net.code;
        cs.players=msg.players.slice(); cs.scores=(msg.scores||[]).slice(); cs.connected=(msg.connected||[]).slice();
        roundLiveForLobby=!!msg.inRound; inRound=false;
        $('clsCodeDisplay').textContent=roomCode;
        renderLobby(); gotoScreen('lobby');
        break;
      case 'lobby_update':
        cs.players=msg.players.slice(); if(msg.scores) cs.scores=msg.scores.slice(); if(msg.connected) cs.connected=msg.connected.slice();
        roundLiveForLobby=!!msg.inRound;
        renderLobby(); refreshBanner();
        if(inRound) renderRankStatus();
        break;
      case 'round_start': onRoundStart(msg); break;
      case 'rank_status':
        if(!inRound) break;
        view.ranked=msg.ranked; renderRankStatus();
        break;
      case 'round_result': showResult(msg); break;
      case 'game_over': showGameOver(msg); break;
      case 'back_to_lobby':
        inRound=false; stopReveal();
        if(netRole!=='host') cs.scores=cs.scores.map(function(){ return 0; });
        renderLobby(); gotoScreen('lobby');
        break;
      case 'round_aborted':
        inRound=false; roundLiveForLobby=false; rankBar.stop();
        renderLobby(); gotoScreen('lobby');
        $('clsLobbyStatus').textContent='⚠ Manche annulée : '+msg.reason;
        hideBanner();
        break;
      case 'room_closed':
        net.close(); showLostModal("L'hôte a fermé la salle.");
        break;
    }
  }

  /* ===================== AFFICHAGE ===================== */
  function gotoScreen(name){
    var all=document.querySelectorAll('.cls-screen');
    for(var i=0;i<all.length;i++) all[i].classList.remove('active');
    $('cls-screen-'+name).classList.add('active');
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function refreshBanner(){
    if(!netRole || !inRound){ hideBanner(); return; }
    var missing=view.roundSeats.filter(function(s){ return cs.players[s] && !isConnected(s); }).map(pname);
    if(missing.length) showBanner('⚠ '+missing.join(', ')+(missing.length>1?' se sont déconnectés':" s'est déconnecté(e)")+' — la manche continue sans eux.');
    else hideBanner();
  }
  function dot(s){ return '<span class="cham-player-dot" style="background:'+pcolor(s)+';"></span>'; }
  function playerRow(s, extra){
    var p=cs.players[s]||{name:'?'}, off=!isConnected(s);
    return '<div class="cham-player-row filled'+(off?' offline':'')+'">'+dot(s)+
      '<span class="cham-player-name">'+escapeHtml(p.name)+(s===mySeat?' (toi)':'')+(off?'<span class="imp-tag">déconnecté(e)</span>':'')+'</span>'+(extra||'')+'</div>';
  }
  function renderLobby(){
    var html='';
    for(var s=0;s<cs.players.length;s++){
      if(!cs.players[s]) continue;
      html+=playerRow(s, '<span class="cham-vote-count">'+(cs.scores[s]||0)+' pts</span>');
    }
    $('clsPlayerList').innerHTML=html;
    var count=activeCount();
    var live = netRole==='host' ? cs.phase==='ranking' : roundLiveForLobby;
    var st=$('clsLobbyStatus');
    if(live) st.textContent='Une manche est en cours — tu joueras dès la prochaine.';
    else if(count<MIN_PLAYERS) st.textContent=count+' joueur(s) connecté(s) — '+MIN_PLAYERS+' minimum pour lancer la partie.';
    else st.textContent = netRole==='host' ? (count+' joueurs prêts. Tu peux lancer la partie !') : (count+" joueurs prêts. En attente que l'hôte lance la partie...");
    $('clsStartBtn').style.display = (netRole==='host' && count>=MIN_PLAYERS && !live) ? 'inline-block' : 'none';
  }

  /* ----- classement : on touche les joueurs dans l'ordre, du 1er au dernier ----- */
  function onRoundStart(msg){
    stopReveal();
    inRound=true;
    view.roundSeats=msg.roundSeats.slice(); view.question=msg.question;
    view.order= msg.mine ? msg.mine.slice() : [];
    view.sent=!!msg.mine;
    view.ranked=msg.ranked||[];
    $('clsRoundBadge').textContent='MANCHE N°'+msg.round;
    $('clsRoundBadge').style.display='inline-block';
    $('clsQuestion').textContent=msg.question;
    renderRanker();
    renderRankStatus();
    rankBar.start(msg.ms, msg.total);
    gotoScreen('rank');
    refreshBanner();
    sfxToggle();
  }
  function renderRanker(){
    var n=view.roundSeats.length, html='';
    for(var i=0;i<n;i++){
      var s=view.order[i];
      if(s===undefined){ html+='<div class="cls-slot empty"><span class="cls-pos">'+(i+1)+'</span><span class="cls-slot-name">…</span></div>'; continue; }
      html+='<button class="cls-slot" data-seat="'+s+'"'+(view.sent?' disabled':'')+'><span class="cls-pos">'+(i+1)+'</span>'+dot(s)+
        '<span class="cls-slot-name">'+escapeHtml(pname(s))+(s===mySeat?' (toi)':'')+'</span>'+(view.sent?'':'<span class="cls-x">✕</span>')+'</button>';
    }
    $('clsSlots').innerHTML=html;
    var pool='';
    view.roundSeats.forEach(function(s){
      if(view.order.indexOf(s)!==-1) return;
      pool+='<button class="cls-chip" data-seat="'+s+'">'+dot(s)+escapeHtml(pname(s))+(s===mySeat?' (toi)':'')+'</button>';
    });
    $('clsPool').innerHTML=pool;
    $('clsPool').style.display = view.sent || !pool ? 'none' : 'flex';
    $('clsPoolHint').style.display = view.sent || !pool ? 'none' : 'block';
    $('clsPoolHint').textContent = view.order.length ? 'Puis la place n°'+(view.order.length+1)+'…' : 'Touche les joueurs dans l’ordre : d’abord celui qui l’est LE PLUS.';
    $('clsSubmitBtn').style.display = view.sent ? 'none' : 'inline-block';
    $('clsSubmitBtn').disabled = view.order.length!==n;
    $('clsResetBtn').style.display = view.sent || !view.order.length ? 'none' : 'inline-block';
    var chips=$('clsPool').querySelectorAll('.cls-chip');
    for(var k=0;k<chips.length;k++) chips[k].addEventListener('click', function(){
      if(view.sent) return;
      view.order.push(parseInt(this.getAttribute('data-seat'),10));
      sfxToggle(); renderRanker();
    });
    var slots=$('clsSlots').querySelectorAll('button.cls-slot');
    for(k=0;k<slots.length;k++) slots[k].addEventListener('click', function(){
      if(view.sent) return;
      var s=parseInt(this.getAttribute('data-seat'),10);
      view.order.splice(view.order.indexOf(s),1);
      sfxToggle(); renderRanker();
    });
  }
  $('clsResetBtn').addEventListener('click',function(){ if(view.sent) return; view.order=[]; sfxToggle(); renderRanker(); });
  $('clsSubmitBtn').addEventListener('click',function(){
    if(view.sent || view.order.length!==view.roundSeats.length) return;
    view.sent=true;
    sfxValidate();
    var order=view.order.slice();
    if(netRole==='host') hostReceiveRanking(0, order); else net.send({type:'rank_submit', order:order});
    renderRanker(); renderRankStatus();
  });
  function renderRankStatus(){
    var html='';
    view.roundSeats.forEach(function(s){
      if(!cs.players[s]) return;
      html+=playerRow(s, '<span class="cham-vote-count">'+(view.ranked.indexOf(s)!==-1?'✅':'⏳')+'</span>');
    });
    $('clsRankList').innerHTML=html;
    $('clsRankStatus').textContent=(view.sent?'Classement envoyé. ':'')+view.ranked.length+' / '+view.roundSeats.length+' classements reçus';
  }

  /* ----- révélation : le podium du groupe, du dernier au premier ----- */
  function fmt(x){ return (Math.round(x*10)/10).toString().replace('.',','); }
  function showResult(msg){
    inRound=false; rankBar.stop(); stopReveal(); hideBanner();
    if(msg.scores) cs.scores=msg.scores.slice();
    $('clsResultQuestion').textContent=msg.question;
    var mine=msg.rankings[mySeat]||null, n=msg.group.length;
    var list=$('clsPodium'); list.innerHTML='';
    $('clsTitles').innerHTML=''; $('clsTitles').style.display='none';
    $('clsResultScores').style.display='none';
    $('clsResultBtns').style.display='none';
    /* une place toutes les REVEAL_STEP ms, en partant de la dernière */
    for(var i=n-1;i>=0;i--){
      (function(i, delay){
        revealTimers.push(setTimeout(function(){
          var t=msg.group[i], first=i===0;
          var row=document.createElement('div');
          row.className='cls-podium-row'+(first?' first':'')+(t===mySeat?' me':'');
          row.innerHTML='<span class="cls-pos">'+(first?'👑':(i+1))+'</span>'+dot(t)+
            '<span class="cls-slot-name">'+escapeHtml(pname(t))+(t===mySeat?' (toi)':'')+'</span>'+
            '<span class="imp-tag">moy. '+fmt(msg.avg[t])+(mine?' · toi : '+(mine.indexOf(t)+1)+'e':'')+'</span>';
          list.insertBefore(row, list.firstChild);
          if(first) sfxReveal(100); else sfxToggle();
        }, delay));
      })(i, (n-1-i)*REVEAL_STEP+300);
    }
    revealTimers.push(setTimeout(function(){ showResultTail(msg); }, n*REVEAL_STEP+700));
    gotoScreen('result');
  }
  function showResultTail(msg){
    var titles='';
    if(msg.ego) titles+='<div class="cls-title-card"><b>🪞 L’EGO</b><span><b>'+escapeHtml(pname(msg.ego.seat))+'</b> se met '+ordinal(msg.ego.self)+'… le groupe le met '+ordinal(msg.ego.group)+' !</span></div>';
    if(msg.modest) titles+='<div class="cls-title-card"><b>🙈 LE MODESTE</b><span><b>'+escapeHtml(pname(msg.modest.seat))+'</b> se met '+ordinal(msg.modest.self)+', le groupe le voit '+ordinal(msg.modest.group)+'.</span></div>';
    if(msg.rebel) titles+='<div class="cls-title-card"><b>🤘 LE REBELLE</b><span><b>'+escapeHtml(pname(msg.rebel.seat))+'</b> est le moins d’accord avec le groupe.</span></div>';
    if(msg.closest.length) titles+='<div class="cls-title-card"><b>🎯 DANS LA TÊTE DU GROUPE</b><span>'+msg.closest.map(function(s){ return '<b>'+escapeHtml(pname(s))+'</b>'; }).join(', ')+' (+'+msg.pts[msg.closest[0]]+')</span></div>';
    if(!msg.ego && !msg.modest && !msg.rebel) titles+='<div class="cls-title-card"><b>🤝 UNANIMITÉ</b><span>Tout le monde est d’accord, ou presque.</span></div>';
    $('clsTitles').innerHTML=titles; $('clsTitles').style.display='grid';
    var order=[];
    for(var s=0;s<cs.players.length;s++) if(cs.players[s]) order.push(s);
    order.sort(function(a,b){ return (cs.scores[b]||0)-(cs.scores[a]||0); });
    var html='';
    order.forEach(function(s){
      var g=msg.pts.hasOwnProperty(s) ? ' +'+msg.pts[s] : (msg.roundSeats.indexOf(s)!==-1 ? ' (pas classé)' : '');
      html+=playerRow(s, '<span class="cham-vote-count">'+(cs.scores[s]||0)+' pts'+g+'</span>');
    });
    $('clsScoreList').innerHTML=html;
    $('clsResultScores').style.display='block';
    var host=netRole==='host';
    $('clsResultBtns').style.display='flex';
    $('clsNextRoundBtn').style.display=host?'inline-block':'none';
    $('clsEndGameBtn').style.display=host?'inline-block':'none';
    $('clsWaitingHostLabel').style.display=host?'none':'inline-block';
    $('clsWaitingHostLabel').textContent="⏳ En attente que l'hôte lance une nouvelle manche...";
  }
  function ordinal(k){ return k===1 ? '1er' : k+'e'; }
  function showGameOver(msg){
    inRound=false; stopReveal(); rankBar.stop(); hideBanner();
    cs.scores=msg.scores.slice();
    var order=[];
    for(var s=0;s<msg.players.length;s++) if(msg.players[s]) order.push(s);
    order.sort(function(a,b){ return (msg.scores[b]||0)-(msg.scores[a]||0); });
    var top=order.length ? msg.scores[order[0]]||0 : 0;
    var winners=order.filter(function(s){ return (msg.scores[s]||0)===top; });
    $('clsWinnerText').textContent=winners.map(function(s){ return (msg.players[s]||{}).name||'?'; }).join(' & ')+(winners.length>1?' L’EMPORTENT !':' L’EMPORTE !');
    var html='';
    order.forEach(function(s,i){
      html+='<div class="cls-podium-row'+(i===0?' first':'')+(s===mySeat?' me':'')+'"><span class="cls-pos">'+(winners.indexOf(s)!==-1?'👑':(i+1))+'</span>'+dot(s)+
        '<span class="cls-slot-name">'+escapeHtml((msg.players[s]||{}).name||'?')+(s===mySeat?' (toi)':'')+'</span><span class="cham-vote-count">'+(msg.scores[s]||0)+' pts</span></div>';
    });
    $('clsFinalList').innerHTML=html;
    $('clsNewGameBtn').style.display = netRole==='host' ? 'inline-block' : 'none';
    $('clsOverWaitLabel').style.display = netRole==='host' ? 'none' : 'inline-block';
    sfxReveal(winners.indexOf(mySeat)!==-1 ? 100 : 50);
    gotoScreen('over');
  }

  /* ---------- API pour le hub ---------- */
  CG.classement={
    reset:function(){
      if(netRole) cleanupOnline();
      closeModal('clsDisconnectModal');
      gotoScreen('online');
    },
    enterJoinFlow:function(code){
      gotoScreen('online');
      $('clsJoinCode').value=decodeURIComponent(code).toUpperCase();
    }
  };
  renderBankCount();
})();
