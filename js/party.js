/* CRAZY GAMES — Soirée « All in » : une seule salle pour toute la soirée.
   L'hôte choisit les jeux et le nombre de manches ; chaque manche lance un jeu
   différent (les jeux choisis tournent dans un ordre mélangé). Un classement
   général cumule des points de placement (10, 7, 5, 4, 3, 2, 1…) pour que tous
   les jeux pèsent pareil, quel que soit leur barème.

   Fonctionnement : la connexion de la soirée (préfixe « cgparty- ») reste
   ouverte toute la soirée. Pour chaque manche, l'appli de l'hôte crée la salle
   du jeu avec un code tiré au hasard, puis les autres la rejoignent toute
   seule : on se sert des écrans normaux de chaque jeu (mêmes boutons créer /
   rejoindre / lancer). À la fin de la manche, le jeu appelle CG.partyEnd() côté
   hôte avec ses scores, et tout le monde revient au classement de la soirée. */
(function(){
  'use strict';
  var CG=window.CG, $=CG.$, escapeHtml=CG.escapeHtml, shuffle=CG.shuffle;
  var sfxToggle=CG.sfxToggle, sfxValidate=CG.sfxValidate, sfxReveal=CG.sfxReveal;

  var GAMES={
    classement:  {p:'cls',  label:'Le Classement',     icon:'🏆', min:3, max:8},
    quiaecrit:   {p:'qae',  label:'Qui a écrit ça ?',  icon:'🎭', min:3, max:8},
    imposteur:   {p:'imp',  label:"L'Imposteur",       icon:'🕵️', min:3, max:8},
    emoji:       {p:'emo',  label:'Emoji Quiz',        icon:'🤔', min:2, max:10},
    loup:        {p:'loup', label:'Le Loup des mots',  icon:'🐺', min:4, max:10},
    cameleon:    {p:'cham', label:'Le Caméléon',       icon:'🦎', min:3, max:8},
    crousprison: {p:'cop',  label:'Crous ou Prison ?', icon:'🛏️', min:2, max:8},
    bots:        {p:'bots', label:'Battle Bots',       icon:'🤖', min:2, max:6}
  };
  var ORDER=Object.keys(GAMES);
  var PLACE_PTS=[10,7,5,4,3,2,1];
  var GAMES_KEY='party_games_v1', ROUNDS_KEY='party_rounds_v1';
  var INTRO_MS=2600, SHOW_RESULT_MS=5000, READY_LIMIT=15000, START_WAIT=20000;

  /* hôte : état qui fait foi */
  var ps={players:[], connected:[], clientIds:[], totals:[], phase:'lobby', plan:[], idx:-1, code:'', waiting:false, lastMsg:null};
  var netRole=null, mySeat=0, myName='', roomCode='', timers=[];
  var view={idx:-1, total:0, game:null, totals:[], inGame:false};

  var ui=CG.roomUI('party', {screens:'party', route:'soiree', code:function(){ return roomCode; },
    onLostBack:function(){ cleanup(); ui.goto('menu'); }});
  var seats=CG.seatTools(ps), isConnected=seats.isConnected;
  var net=CG.createRoomNet({
    prefix:'cgparty-',
    onStatus:ui.setStatus,
    onJoinRequest:hostOnJoinRequest,
    onSeatJoined:hostOnSeatJoined,
    onGuestMessage:function(){},
    onSeatLost:hostOnSeatLost,
    onHostMessage:handleMsg,
    onReconnecting:function(){ ui.showBanner('📡 Connexion à la soirée perdue — reconnexion en cours...'); },
    onReconnected:function(){ ui.hideBanner(); },
    onLost:function(){ leaveGame(); ui.showLost("Impossible de rétablir la connexion avec l'hôte de la soirée."); },
    onPromote:onPromote
  });
  /* L'hôte de la soirée a disparu : tu reprends la soirée (même code, mêmes
     totaux, même programme). La manche en cours est annulée (sa salle de jeu
     était aussi chez l'ancien hôte) et on passe à la suivante. */
  function onPromote(info){
    netRole='host'; mySeat=0; roomCode=net.code;
    CG.promoteSeats(ps, info, ['totals']);
    clearTimers();
    ps.waiting=false;
    $('partyCodeDisplay').textContent=roomCode;
    leaveGame();
    if(ps.phase==='lobby' || !ps.plan.length){
      ps.phase='lobby'; ps.lastMsg=null;
      hostBroadcastState(); ui.goto('lobby');
      $('partyLobbyStatus').textContent=CG.PROMOTED_TEXT;
      return;
    }
    if(ps.phase==='over'){ hostFinish(); return; }
    ps.idx=Math.max(0, view.idx);
    ps.phase='playing';
    hostRoundOver([], 'L’hôte de la soirée est parti : '+myName+' prend le relais. Cette manche ne compte pas.');
    hostBroadcastState();
  }
  function later(fn, ms){ var t=setTimeout(fn, ms); timers.push(t); return t; }
  function clearTimers(){ timers.forEach(clearTimeout); timers=[]; }
  function connectedSeats(){ var a=[]; for(var s=0;s<ps.players.length;s++) if(ps.players[s] && isConnected(s)) a.push(s); return a; }

  function cleanup(){
    net.close(netRole==='host' ? {type:'room_closed'} : null);
    clearTimers();
    netRole=null; mySeat=0; roomCode='';
    ps.players=[]; ps.connected=[]; ps.clientIds=[]; ps.totals=[]; ps.phase='lobby'; ps.plan=[]; ps.idx=-1; ps.lastMsg=null; ps.waiting=false;
    view.idx=-1; view.inGame=false;
    ui.hideBanner(); ui.setStatus('offline','HORS LIGNE');
    renderBar();
  }

  /* ===================== MENU ===================== */
  function loadChoice(){
    var games=ORDER.slice(), rounds=10;
    try{ var g=JSON.parse(localStorage.getItem(GAMES_KEY)||'null'); if(Array.isArray(g) && g.length) games=g.filter(function(k){ return GAMES[k]; }); }catch(e){}
    try{ var r=parseInt(localStorage.getItem(ROUNDS_KEY),10); if(r>0) rounds=r; }catch(e){}
    return {games:games, rounds:rounds};
  }
  function renderGamePicker(){
    var ch=loadChoice(), html='';
    ORDER.forEach(function(k){
      var g=GAMES[k];
      html+='<label class="party-game"><input type="checkbox" value="'+k+'"'+(ch.games.indexOf(k)!==-1?' checked':'')+'>'+
        '<span class="party-game-icon">'+g.icon+'</span><span>'+escapeHtml(g.label)+'<small>'+g.min+' à '+g.max+' joueurs</small></span></label>';
    });
    $('partyGames').innerHTML=html;
    $('partyRounds').value=String(ch.rounds);
    var boxes=$('partyGames').querySelectorAll('input');
    for(var i=0;i<boxes.length;i++) boxes[i].addEventListener('change', saveChoice);
  }
  function chosenGames(){
    var out=[], boxes=$('partyGames').querySelectorAll('input');
    for(var i=0;i<boxes.length;i++) if(boxes[i].checked) out.push(boxes[i].value);
    return out;
  }
  function saveChoice(){
    try{ localStorage.setItem(GAMES_KEY, JSON.stringify(chosenGames())); localStorage.setItem(ROUNDS_KEY, $('partyRounds').value); }catch(e){}
    renderLobby();
  }
  $('partyRounds').addEventListener('change', saveChoice);

  $('partyCreateRoomBtn').addEventListener('click',function(){
    var wanted=CG.readRoomCode('partyHostCode');
    if(!wanted){ sfxToggle(); return; }
    myName=$('partyName').value.trim()||'Joueur';
    cleanup();
    net.host(function(code){
      netRole='host'; mySeat=0; roomCode=code;
      ps.players=[{name:myName}]; ps.connected=[true]; ps.clientIds=[net.clientId]; ps.totals=[0];
      try{ history.replaceState(null,'','#soiree?room='+code); }catch(e){}
      $('partyCodeDisplay').textContent=code;
      renderLobby(); ui.goto('lobby');
    }, wanted);
    sfxToggle();
  });
  $('partyJoinCode').addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); $('partyJoinRoomBtn').click(); } });
  $('partyJoinRoomBtn').addEventListener('click',function(){
    myName=$('partyName').value.trim()||'Joueur';
    var code=CG.cleanRoomCode($('partyJoinCode').value);
    if(!code){ CG.shake($('partyJoinCode')); return; }
    cleanup();
    netRole='guest';
    net.join(code, {name:myName});
    sfxToggle();
  });
  $('partyBackFromLobby').addEventListener('click',function(){ sfxToggle(); cleanup(); ui.goto('menu'); });
  $('partyHubReturnBtn').addEventListener('click',function(){ sfxToggle(); location.hash='hub'; });
  CG.wireModal('partyRulesModal', 'partyRulesBtn');

  /* ===================== HÔTE : PLACES ===================== */
  function hostOnJoinRequest(msg){
    var back=seats.returningSeat(msg); if(back) return back;
    if(seats.activeCount()>=10) return 'SOIRÉE COMPLÈTE (10/10)';
    for(var s=1;s<ps.players.length;s++) if(!ps.players[s]) return s;
    return Math.max(1, ps.players.length);
  }
  /* deux joueurs du même nom : les scores des jeux sont rattachés par le nom */
  function uniqueName(name, seat){
    var base=name||'Joueur', n=base, k=2;
    function taken(x){ return ps.players.some(function(p,s){ return p && s!==seat && p.name===x; }); }
    while(taken(n)) n=base+' '+(k++);
    return n;
  }
  function hostOnSeatJoined(seat, msg){
    var p=ps.players[seat];
    if(!p){ ps.players[seat]={name:uniqueName(msg.name, seat)}; ps.totals[seat]=0; }
    ps.clientIds[seat]=msg.clientId||null;
    ps.connected[seat]=true;
    net.sendTo(seat, {type:'seat_assigned', seat:seat, name:ps.players[seat].name});
    if(ps.lastMsg) net.sendTo(seat, ps.lastMsg);
    hostBroadcastState();
    sfxValidate();
  }
  function hostOnSeatLost(seat){
    if(ps.phase==='lobby'){ ps.players[seat]=null; ps.clientIds[seat]=null; }
    else ps.connected[seat]=false;
    hostBroadcastState();
  }
  function hostBroadcastState(){
    net.broadcast({type:'party_state', players:ps.players.slice(), connected:ps.connected.slice(), totals:ps.totals.slice(), phase:ps.phase,
      plan:ps.plan.slice(), idx:ps.idx});
  }
  function hostSend(msg){ ps.lastMsg=msg; net.broadcast(msg); }

  /* ===================== HÔTE : DÉROULÉ ===================== */
  function playable(k, n){ return n>=GAMES[k].min && n<=GAMES[k].max; }
  /* ordre des manches : chaque jeu choisi passe une fois avant qu'un jeu ne revienne */
  function buildPlan(games, rounds){
    var plan=[], deck=[];
    while(plan.length<rounds){
      if(!deck.length){ deck=shuffle(games.slice()); if(plan.length && deck.length>1 && deck[0]===plan[plan.length-1]) deck.push(deck.shift()); }
      plan.push(deck.shift());
    }
    return plan;
  }
  $('partyStartBtn').addEventListener('click',function(){
    if(netRole!=='host') return;
    var n=connectedSeats().length, games=chosenGames().filter(function(k){ return playable(k,n); });
    if(!games.length){ CG.shake($('partyGames')); return; }
    sfxValidate();
    ps.totals=ps.players.map(function(){ return 0; });
    ps.plan=buildPlan(games, parseInt($('partyRounds').value,10)||10);
    ps.idx=-1;
    hostNextRound();
  });
  $('partyNextBtn').addEventListener('click',function(){ if(netRole==='host'){ sfxToggle(); hostNextRound(); } });
  function hostNextRound(){
    clearTimers();
    ps.idx++;
    if(ps.idx>=ps.plan.length){ hostFinish(); return; }
    var game=ps.plan[ps.idx], n=connectedSeats().length;
    /* trop peu (ou trop) de joueurs pour ce jeu maintenant : on en prend un autre jouable */
    if(!playable(game, n)){
      var alt=ORDER.filter(function(k){ return ps.plan.indexOf(k)!==-1 && playable(k,n); });
      if(!alt.length){ hostFinish(); return; }
      game=ps.plan[ps.idx]=alt[Math.floor(Math.random()*alt.length)];
    }
    ps.phase='intro';
    ps.code='CGS-'+Math.floor(100000+Math.random()*900000);
    hostSend({type:'round_intro', idx:ps.idx, total:ps.plan.length, game:game, totals:ps.totals.slice(), plan:ps.plan.slice()});
    later(hostLaunch, INTRO_MS);
  }
  function hostLaunch(){
    var game=ps.plan[ps.idx], g=GAMES[game], t0=Date.now();
    ps.phase='playing'; ps.waiting=true;
    enterGame(game);
    if(game==='bots') pickBotsMode(connectedSeats().length);
    drive(g, ps.code, myName, true);
    /* salle prête -> les invités la rejoignent ; puis on lance quand tout le monde est là */
    (function waitReady(){
      if(ps.phase!=='playing') return;
      if(($(g.p+'CodeDisplay').textContent||'').trim()===ps.code){
        hostSend({type:'go', idx:ps.idx, total:ps.plan.length, game:game, code:ps.code});
        autoStart(g);
        return;
      }
      if(Date.now()-t0>READY_LIMIT){ hostRoundOver([], 'La salle du jeu n’a pas pu être créée.'); return; }
      later(waitReady, 300);
    })();
  }
  function autoStart(g){
    var t0=Date.now();
    (function poll(){
      if(ps.phase!=='playing') return;
      var list=$(g.p+'PlayerList'), here=list ? list.querySelectorAll('.cham-player-row:not(.offline)').length : 0;
      var want=connectedSeats().length, btn=$(g.p+'StartBtn');
      var ready = here>=want || (Date.now()-t0>START_WAIT && here>=g.min);
      if(ready && btn && btn.style.display!=='none' && !btn.disabled){ btn.click(); return; }
      later(poll, 500);
    })();
  }
  /* Battle Bots : à 2, un duel ; au-delà, chacun pour soi */
  function pickBotsMode(n){
    var b=document.querySelector('#botsModeToggle [data-mode="'+(n<=2?'1v1':'ffa')+'"]');
    if(b) b.click();
  }
  /* appelé par chaque jeu, côté hôte, à la fin d'une manche */
  CG.partyEnd=function(players, scores){
    if(netRole!=='host' || ps.phase!=='playing' || !ps.waiting) return;
    ps.waiting=false;
    var rows=[];
    players.forEach(function(p,s){ if(p) rows.push({name:p.name, raw:scores[s]||0}); });
    later(function(){ hostRoundOver(rows); }, SHOW_RESULT_MS);
  };
  function hostRoundOver(rows, note){
    if(ps.phase!=='playing') return;
    clearTimers();
    ps.phase='standings';
    rows.sort(function(a,b){ return b.raw-a.raw; });
    var place=0, results=[];
    rows.forEach(function(r,i){
      if(i>0 && r.raw<rows[i-1].raw) place=i;
      var seat=-1;
      ps.players.forEach(function(p,s){ if(p && p.name===r.name) seat=s; });
      var pts=PLACE_PTS[Math.min(place, PLACE_PTS.length-1)];
      if(seat>=0) ps.totals[seat]=(ps.totals[seat]||0)+pts;
      results.push({seat:seat, name:r.name, raw:r.raw, place:place+1, pts:pts});
    });
    hostSend({type:'round_over', idx:ps.idx, total:ps.plan.length, game:ps.plan[ps.idx], results:results, totals:ps.totals.slice(),
      players:ps.players.slice(), note:note||'', last:ps.idx>=ps.plan.length-1});
  }
  function hostFinish(){
    clearTimers();
    ps.phase='over';
    hostSend({type:'party_over', totals:ps.totals.slice(), players:ps.players.slice()});
  }
  $('partySkipBtn').addEventListener('click',function(){
    if(netRole!=='host' || ps.phase!=='playing') return;
    sfxToggle(); hostRoundOver([], 'Manche passée par l’hôte.');
  });
  $('partyNewBtn').addEventListener('click',function(){
    if(netRole!=='host') return;
    sfxToggle();
    clearTimers();
    for(var s=1;s<ps.players.length;s++) if(ps.players[s] && !isConnected(s)){ ps.players[s]=null; ps.clientIds[s]=null; }
    ps.phase='lobby'; ps.plan=[]; ps.idx=-1; ps.totals=ps.players.map(function(){ return 0; });
    hostSend({type:'party_lobby'});
    hostBroadcastState();
  });

  /* ===================== ALLER DANS UN JEU / EN REVENIR ===================== */
  /* remplit et clique les boutons du jeu, comme le ferait le joueur */
  function drive(g, code, name, host){
    $(g.p+'Name').value=name;
    if(host){ $(g.p+'HostCode').value=code; $(g.p+'CreateRoomBtn').click(); }
    else { $(g.p+'JoinCode').value=code; $(g.p+'JoinRoomBtn').click(); }
  }
  function enterGame(game){ view.inGame=true; location.hash=game; renderBar(); }
  /* retour à la soirée : le routeur du hub ferme la salle du jeu en cours */
  function leaveGame(){ if(!view.inGame) return; view.inGame=false; location.hash='soiree'; renderBar(); }

  /* ===================== MESSAGES ===================== */
  function handleMsg(msg){
    if(!msg || !msg.type) return;
    switch(msg.type){
      case 'room_full': ui.setStatus('error', msg.reason||'SOIRÉE COMPLÈTE'); break;
      case 'seat_assigned':
        mySeat=msg.seat; roomCode=net.code; myName=msg.name||myName;
        $('partyCodeDisplay').textContent=roomCode;
        renderLobby(); ui.goto('lobby');
        break;
      case 'party_state':
        if(netRole!=='host'){
          ps.players=msg.players; ps.connected=msg.connected; ps.totals=msg.totals;
          /* gardés pour pouvoir reprendre la soirée si l'hôte disparaît */
          ps.phase=msg.phase||ps.phase; if(msg.plan){ ps.plan=msg.plan; ps.idx=msg.idx; }
        }
        renderLobby();
        break;
      case 'round_intro':
        view.idx=msg.idx; view.total=msg.total; view.game=msg.game;
        if(netRole!=='host'){ ps.phase='intro'; ps.idx=msg.idx; if(msg.plan) ps.plan=msg.plan; }
        leaveGame();
        showIntro(msg);
        break;
      case 'go':
        view.idx=msg.idx; view.total=msg.total; view.game=msg.game;
        if(netRole!=='host') ps.phase='playing';
        if(netRole!=='host'){
          enterGame(msg.game);
          /* l'hôte a lancé la salle : on la rejoint après un court délai (le temps qu'elle soit joignable) */
          later(function(){ drive(GAMES[msg.game], msg.code, myName, false); }, 400);
        }
        renderBar();
        break;
      case 'round_over':
        if(netRole!=='host'){ ps.phase='standings'; ps.idx=msg.idx; }
        /* les invités partent d'abord : la salle de l'hôte se ferme juste après */
        if(netRole==='host') later(leaveGame, 1200); else leaveGame();
        showStandings(msg);
        break;
      case 'party_over': if(netRole!=='host') ps.phase='over'; leaveGame(); showFinal(msg); break;
      case 'party_lobby':
        leaveGame(); ps.totals=ps.players.map(function(){ return 0; });
        if(netRole!=='host'){ ps.phase='lobby'; ps.plan=[]; ps.idx=-1; }
        renderLobby(); ui.goto('lobby');
        break;
      case 'room_closed':
        net.close(); leaveGame(); ui.showLost("L'hôte a fermé la soirée.");
        break;
    }
  }

  /* ===================== AFFICHAGE ===================== */
  var COLORS=['#E60012','#2E6FF2','#FFE600','#7cff6e','#ff6ec7','#ff9d2f','#00e5ff','#b388ff','#ffffff','#ff5a5a'];
  function pcolor(s){ return COLORS[s%COLORS.length]; }
  function standingsRows(totals, players){
    var order=[];
    for(var s=0;s<players.length;s++) if(players[s]) order.push(s);
    order.sort(function(a,b){ return (totals[b]||0)-(totals[a]||0); });
    var top=order.length ? totals[order[0]]||0 : 0, html='';
    var rank=0;
    order.forEach(function(s,i){
      if(i>0 && (totals[s]||0)<(totals[order[i-1]]||0)) rank=i;    /* égalité = même place */
      var lead=(totals[s]||0)===top && top>0;
      html+='<div class="cls-podium-row'+(lead?' first':'')+(s===mySeat?' me':'')+'"><span class="cls-pos">'+(lead?'👑':(rank+1))+'</span>'+CG.playerDot(pcolor(s))+
        '<span class="cls-slot-name">'+escapeHtml(players[s].name)+(s===mySeat?' (toi)':'')+'</span><span class="cham-vote-count">'+(totals[s]||0)+' pts</span></div>';
    });
    return {html:html, order:order, top:top};
  }
  function renderLobby(){
    var html='';
    for(var s=0;s<ps.players.length;s++){
      if(!ps.players[s]) continue;
      html+=CG.playerRow({name:ps.players[s].name, color:pcolor(s), me:s===mySeat, off:!isConnected(s),
        extra:(ps.totals[s]?'<span class="cham-vote-count">'+ps.totals[s]+' pts</span>':'')});
    }
    $('partyPlayerList').innerHTML=html;
    var host=netRole==='host', n=connectedSeats().length;
    $('partyHostSettings').hidden=!host;
    if(host){
      var ok=chosenGames().filter(function(k){ return playable(k,n); });
      var labels=ok.map(function(k){ return GAMES[k].icon; }).join(' ');
      $('partyLobbyStatus').textContent = ok.length ? (n+' joueur(s) · '+ok.length+' jeu(x) jouable(s) maintenant '+labels)
        : 'Aucun jeu choisi ne se joue à '+n+' joueur(s) — invite du monde ou coche d’autres jeux.';
      $('partyStartBtn').style.display = ok.length ? 'inline-block' : 'none';
    } else $('partyLobbyStatus').textContent=n+' joueur(s) — l’hôte choisit les jeux et lance la soirée.';
  }
  function showIntro(msg){
    var g=GAMES[msg.game];
    $('partyIntroRound').textContent='MANCHE '+(msg.idx+1)+' / '+msg.total;
    $('partyIntroIcon').textContent=g.icon;
    $('partyIntroGame').textContent=g.label.toUpperCase();
    var st=standingsRows(msg.totals, ps.players);
    $('partyIntroLeader').textContent = st.top>0 ? 'En tête : '+st.order.filter(function(s){ return (msg.totals[s]||0)===st.top; }).map(function(s){ return ps.players[s].name; }).join(' & ')+' ('+st.top+' pts)' : '';
    ui.goto('intro');
    var card=$('partyIntroCard'); card.classList.remove('go'); void card.offsetWidth; card.classList.add('go');
    CG.sfxWhoosh(); CG.buzz(80);
  }
  function showStandings(msg){
    var g=GAMES[msg.game];
    $('partyStandTitle').textContent=g.icon+' '+g.label.toUpperCase()+' — MANCHE '+(msg.idx+1)+' / '+msg.total;
    var html='';
    if(!msg.results.length) html='<p class="lobby-status">'+escapeHtml(msg.note||'Pas de résultat pour cette manche.')+'</p>';
    msg.results.forEach(function(r){
      html+='<div class="cls-podium-row'+(r.place===1?' first':'')+(r.seat===mySeat?' me':'')+'"><span class="cls-pos">'+r.place+'</span>'+CG.playerDot(pcolor(Math.max(0,r.seat)))+
        '<span class="cls-slot-name">'+escapeHtml(r.name)+'</span><span class="imp-tag">score '+r.raw+'</span><span class="cham-vote-count">+'+r.pts+'</span></div>';
    });
    $('partyRoundList').innerHTML=html;
    ps.players=msg.players; ps.totals=msg.totals;
    $('partyTotalList').innerHTML=standingsRows(msg.totals, msg.players).html;
    var host=netRole==='host';
    $('partyNextBtn').style.display=host?'inline-block':'none';
    $('partyNextBtn').querySelector('span').textContent = msg.last ? '🏁 Voir le classement final' : '▶ Manche suivante';
    $('partyWaitLabel').style.display=host?'none':'inline-block';
    ui.goto('standings');
    var mine=msg.results.filter(function(r){ return r.seat===mySeat; })[0];
    sfxReveal(mine && mine.place===1 ? 100 : 50);
  }
  function showFinal(msg){
    var st=standingsRows(msg.totals, msg.players);
    var winners=st.order.filter(function(s){ return (msg.totals[s]||0)===st.top; });
    $('partyWinnerText').textContent = st.top>0 ? winners.map(function(s){ return msg.players[s].name; }).join(' & ')+(winners.length>1?' REMPORTENT':' REMPORTE')+' LA SOIRÉE !' : 'SOIRÉE TERMINÉE';
    $('partyFinalList').innerHTML=st.html;
    $('partyNewBtn').style.display=netRole==='host'?'inline-block':'none';
    $('partyOverWait').style.display=netRole==='host'?'none':'inline-block';
    ui.goto('over');
    sfxReveal(winners.indexOf(mySeat)!==-1 ? 100 : 50);
    if(CG.account) CG.account.recordRanked('soiree', msg.totals, st.order, mySeat);
    if(CG.achieve && st.top>0 && winners.indexOf(mySeat)!==-1) CG.achieve('party_win');
  }
  /* bandeau de la soirée pendant les jeux (manche en cours, bouton « passer » pour l'hôte) */
  function renderBar(){
    var bar=$('partyBar');
    if(!netRole || !view.inGame || view.idx<0){ bar.hidden=true; return; }
    bar.hidden=false;
    $('partyBarText').textContent='🎉 SOIRÉE · MANCHE '+(view.idx+1)+' / '+view.total;
    $('partySkipBtn').hidden = netRole!=='host';
  }

  /* ---------- API pour le hub ---------- */
  CG.party={
    active:function(){ return !!netRole; },
    reset:function(){ cleanup(); CG.closeModal('partyDisconnectModal'); ui.goto('menu'); },
    enterJoinFlow:function(code){ ui.goto('menu'); $('partyJoinCode').value=CG.cleanRoomCode(decodeURIComponent(code)); }
  };
  renderGamePicker();
  /* réactions et petits messages dans le lobby (common.js) */
  CG.lobbyChat(net, $('partyPlayerList'), 'partyName');
})();
