/* Les Loups-Garous — le jeu de rôle caché classique (5 à 12 joueurs en ligne).
   Pas besoin de meneur : l'hôte de la salle fait le narrateur automatique.
   Rôles : Loups-Garous, Voyante, Sorcière (option), Chasseur (option), Villageois.
   Nuit : les loups choisissent une victime pendant que la Voyante sonde un
   joueur ; puis la Sorcière peut sauver la victime et/ou empoisonner quelqu'un.
   Jour : on annonce les morts (rôle révélé), on débat à voix haute, on vote.
   Le Chasseur qui meurt tire une dernière balle.
   L'hôte fait autorité : chaque joueur reçoit une vue de la partie limitée à
   ce qu'il a le droit de savoir (son rôle, sa meute, ce qu'a vu la Voyante…). */
(function(){
  'use strict';
  var CG=window.CG;
  var $=CG.$, escapeHtml=CG.escapeHtml, shuffle=CG.shuffle, shake=CG.shake, closeModal=CG.closeModal;
  var sfxToggle=CG.sfxToggle, sfxValidate=CG.sfxValidate, sfxReveal=CG.sfxReveal;

  var ROOM_PREFIX='cggarou-';
  var MIN_PLAYERS=5, MAX_PLAYERS=12;
  var NIGHT_MS=45000, WITCH_MS=30000, HUNTER_MS=25000, DAY_END_DELAY=4000;
  var COLORS=['#E60012','#2E6FF2','#FFE600','#7cff6e','#ff6ec7','#ff9d2f','#00e5ff','#b388ff','#ffffff','#c49a6c','#ff5577','#8fd3ff'];

  var ROLES={
    loup:{ico:'🐺', name:'LOUP-GAROU', camp:'loups', desc:'Chaque nuit, avec ta meute, choisis un villageois à dévorer. Le jour, fais-toi passer pour un innocent.'},
    voyante:{ico:'🔮', name:'VOYANTE', camp:'village', desc:'Chaque nuit, découvre le vrai rôle d’un joueur. Guide le village sans te faire repérer par les loups.'},
    sorciere:{ico:'🧪', name:'SORCIÈRE', camp:'village', desc:'Une potion de vie pour sauver la victime des loups, une potion de mort pour éliminer quelqu’un. Une seule fois chacune dans la partie.'},
    chasseur:{ico:'🏹', name:'CHASSEUR', camp:'village', desc:'Si tu meurs, de nuit comme de jour, tu tires une dernière balle : le joueur de ton choix meurt avec toi.'},
    villageois:{ico:'🧑‍🌾', name:'VILLAGEOIS', camp:'village', desc:'Pas de pouvoir, mais ta voix compte : écoute, démasque les loups et vote juste.'}
  };
  function roleLabel(r){ var R=ROLES[r]; return R ? R.ico+' '+R.name : '?'; }
  function wolfCount(n){ return n>=11 ? 3 : n>=7 ? 2 : 1; }

  /* ===================== ÉTAT (côté hôte) ===================== */
  var gs={
    players:[], scores:[], connected:[], clientIds:[],
    opts:{day:180, witch:true, hunter:true},
    phase:'lobby', gameSeats:[], roles:{}, alive:{}, dayNum:1,
    wolfPicks:{}, seerDone:false, seerSeen:{}, potions:{life:true, death:true},
    victim:-1, witchSave:false, witchKill:-1, witchReal:false,
    votes:{}, hunterSeat:-1, hunterUsed:false, afterHunter:'day',
    news:[], log:[], winner:null, deadline:0, total:1, timer:null, dayEndTimer:null
  };
  var netRole=null, mySeat=0, myName='', roomCode='', gameStarted=false;
  var v=null;            /* dernière vue reçue (côté joueur) */
  var lastActionKey='';  /* pour ne sonner « à toi » qu'une fois par action */

  /* ===================== RÉSEAU ===================== */
  var ui=CG.roomUI('garou', {route:'garou', code:function(){ return roomCode; },
    onLostBack:function(){ cleanupOnline(); gotoScreen('online'); }});
  var setNetStatus=ui.setStatus, showBanner=ui.showBanner, hideBanner=ui.hideBanner, showLostModal=ui.showLost, gotoScreen=ui.goto;
  var seats=CG.seatTools(gs), isConnected=seats.isConnected, activeCount=seats.activeCount;
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
    onLost: function(){ showLostModal("Impossible de rétablir la connexion avec l'hôte."); },
    onPromote: onPromote
  });
  /* l'hôte a disparu : la partie en cours est perdue (les rôles n'étaient connus que de lui),
     on reprend la salle et on revient au lobby avec les scores */
  function onPromote(info){
    netRole='host'; mySeat=0; roomCode=net.code;
    CG.promoteSeats(gs, info);
    clearTimers();
    gameStarted=true; gs.phase='lobby_wait'; gs.gameSeats=[];
    $('garouCodeDisplay').textContent=roomCode;
    hideBanner();
    hostPush();
    $('garouLobbyStatus').textContent=CG.PROMOTED_TEXT+' (la partie en cours est annulée.)';
  }
  function clearTimers(){
    clearTimeout(gs.timer); gs.timer=null;
    clearTimeout(gs.dayEndTimer); gs.dayEndTimer=null;
  }
  function cleanupOnline(){
    net.close(netRole==='host' ? {type:'room_closed'} : null);
    clearTimers();
    netRole=null; mySeat=0; roomCode=''; gameStarted=false; v=null; lastActionKey='';
    gs.players=[]; gs.scores=[]; gs.connected=[]; gs.clientIds=[];
    gs.phase='lobby'; gs.gameSeats=[]; gs.roles={}; gs.alive={};
    $('garouDayBadge').style.display='none';
    clearInterval(tick);
    hideBanner();
    setNetStatus('offline','HORS LIGNE');
  }
  function pname(s){ var p=gs.players[s]; return p ? p.name : '?'; }
  function pcolor(s){ return COLORS[s%COLORS.length]; }
  function inGamePhase(){ return ['night','witch','hunter','day'].indexOf(gs.phase)!==-1; }

  /* ----- création / connexion ----- */
  $('garouCreateRoomBtn').addEventListener('click',function(){
    var wantedCode=CG.readRoomCode('garouHostCode');
    if(!wantedCode){ sfxToggle(); return; }
    myName=$('garouName').value.trim()||'Joueur';
    cleanupOnline();
    net.host(function(code){
      netRole='host'; mySeat=0; roomCode=code;
      gs.phase='lobby';
      gs.players=[{name:myName}]; gs.scores=[0]; gs.connected=[true]; gs.clientIds=[net.clientId];
      try{ history.replaceState(null,'','#garou?room='+code); }catch(e){}
      $('garouCodeDisplay').textContent=code;
      hostPush();
    }, wantedCode);
    sfxToggle();
  });
  $('garouJoinRoomBtn').addEventListener('click',function(){
    myName=$('garouName').value.trim()||'Joueur';
    var code=CG.cleanRoomCode($('garouJoinCode').value);
    if(!code){ shake($('garouJoinCode')); return; }
    cleanupOnline();
    netRole='guest';
    net.join(code, {name:myName});
    sfxToggle();
  });
  $('garouBackFromLobby').addEventListener('click',function(){ sfxToggle(); cleanupOnline(); gotoScreen('online'); });
  $('garouHubReturnBtn').addEventListener('click',function(){ sfxToggle(); location.hash='hub'; });
  CG.wireModal('garouRulesModal', 'garouRulesBtn');
  /* réglages de l'hôte (lobby) */
  ['garouDaySel','garouWitchChk','garouHunterChk'].forEach(function(id){
    $(id).addEventListener('change',function(){
      if(netRole!=='host') return;
      gs.opts={day:parseInt($('garouDaySel').value,10)||180, witch:$('garouWitchChk').checked, hunter:$('garouHunterChk').checked};
      sfxToggle(); hostPush();
    });
  });

  /* ===================== HÔTE : PLACES ===================== */
  function hostOnJoinRequest(msg){
    var back=seats.returningSeat(msg); if(back) return back;
    if(activeCount()>=MAX_PLAYERS) return 'SALLE COMPLÈTE ('+MAX_PLAYERS+'/'+MAX_PLAYERS+')';
    return Math.max(1, gs.players.length);
  }
  function hostOnSeatJoined(seat, msg, isRepeat){
    var p=gs.players[seat];
    if(p){ if(msg.name) p.name=msg.name; }
    else { gs.players[seat]={name:msg.name||'Joueur'}; gs.scores[seat]=0; }
    gs.clientIds[seat]=msg.clientId||null;
    gs.connected[seat]=true;
    net.sendTo(seat, {type:'seat_assigned', seat:seat});
    hostPush();
    if(!isRepeat) sfxValidate();
  }
  function hostOnSeatLost(seat){
    if(!gameStarted){
      gs.players[seat]=null; gs.clientIds[seat]=null;
      hostPush(); return;
    }
    gs.connected[seat]=false;
    hostPush();
    /* un absent ne bloque pas la partie : on vérifie si tout le monde a agi */
    if(gs.phase==='night') hostNightCheck();
    else if(gs.phase==='witch' && gs.witchReal && gs.roles[seat]==='sorciere') hostDawn();
    else if(gs.phase==='hunter' && seat===gs.hunterSeat){ clearTimeout(gs.timer); gs.timer=setTimeout(hostHunterTimeout, 1500); }
    else if(gs.phase==='day') hostDayCheck();
  }
  function hostOnGuestMessage(seat, msg){
    if(msg && msg.type==='g_act') hostAct(seat, msg);
  }

  /* ===================== HÔTE : VUE DE CHAQUE JOUEUR ===================== */
  function viewFor(seat){
    var mine=gs.gameSeats.indexOf(seat)!==-1, role=mine ? gs.roles[seat] : null, alive=!!gs.alive[seat];
    var over=gs.phase==='over';
    /* les morts voient tout (ils n'ont plus le droit de parler) ; les vivants ne voient
       que leur rôle, leur meute, les morts et ce qu'a sondé la Voyante */
    var seeAll=over || (mine && !alive);
    var roles={};
    gs.gameSeats.forEach(function(s){
      var r=gs.roles[s];
      if(seeAll || !gs.alive[s] || s===seat || (role==='loup' && r==='loup') || (role==='voyante' && gs.seerSeen.hasOwnProperty(s))) roles[s]=r;
    });
    var out={type:'g_state', phase:gs.phase, day:gs.dayNum, ms:Math.max(0, gs.deadline-Date.now()), total:gs.total,
      players:gs.players.slice(), connected:gs.connected.slice(), scores:gs.scores.slice(), opts:gs.opts,
      gameSeats:gs.gameSeats.slice(), alive:gs.alive, roles:roles,
      me:{role:role, alive:alive, inGame:mine}, news:gs.news.slice(), log:gs.log.slice(),
      votes: gs.phase==='day' ? gs.votes : null,
      hunter: gs.phase==='hunter' ? gs.hunterSeat : -1,
      winner:gs.winner};
    if(role==='loup' && alive) out.wolfPicks = gs.phase==='night' ? gs.wolfPicks : {};
    if(role==='voyante'){ out.seerDone=gs.seerDone; out.seerSeen=gs.seerSeen; }
    if(role==='sorciere'){
      out.potions=gs.potions;
      if(alive && gs.phase==='witch' && gs.witchReal) out.witch={victim:gs.victim, saved:gs.witchSave, kill:gs.witchKill};
    }
    return out;
  }
  function hostPush(){
    for(var s=0;s<gs.players.length;s++){
      if(!gs.players[s]) continue;
      if(s===0 || isConnected(s)) net.sendToSeat(s, viewFor(s));
    }
  }
  function setDeadline(ms, fn){
    clearTimeout(gs.timer);
    gs.deadline=Date.now()+ms; gs.total=ms;
    gs.timer=setTimeout(fn, ms+300);
  }
  function aliveSeats(){ return gs.gameSeats.filter(function(s){ return gs.alive[s]; }); }
  function aliveWith(role){ return aliveSeats().filter(function(s){ return gs.roles[s]===role; }); }
  function deathText(s){ return pname(s)+' ('+roleLabel(gs.roles[s])+')'; }

  /* ===================== HÔTE : DÉROULEMENT ===================== */
  $('garouStartBtn').addEventListener('click',function(){ sfxValidate(); hostStartGame(); });
  $('garouNewGameBtn').addEventListener('click',function(){ sfxToggle(); hostStartGame(); });
  function hostStartGame(){
    var list=[];
    for(var i=0;i<gs.players.length;i++){ if(gs.players[i] && isConnected(i)) list.push(i); }
    if(list.length<MIN_PLAYERS){
      gs.phase='lobby_wait'; hostPush();
      setNetStatus('error', MIN_PLAYERS+' JOUEURS CONNECTÉS MINIMUM');
      return;
    }
    setNetStatus('connected','PARTIE EN COURS');
    clearTimers();
    gameStarted=true;
    gs.gameSeats=list;
    var n=list.length, deck=[], w=wolfCount(n);
    for(var k=0;k<w;k++) deck.push('loup');
    deck.push('voyante');
    if(gs.opts.witch) deck.push('sorciere');
    if(gs.opts.hunter && n>=6) deck.push('chasseur');
    while(deck.length<n) deck.push('villageois');
    deck=shuffle(deck).slice(0,n);
    gs.roles={}; gs.alive={};
    shuffle(list.slice()).forEach(function(s,i){ gs.roles[s]=deck[i]; gs.alive[s]=true; });
    gs.dayNum=1; gs.seerSeen={}; gs.potions={life:true, death:true}; gs.hunterUsed=false; gs.winner=null;
    gs.log=['🌕 La partie commence : '+n+' joueurs, dont '+w+' loup'+(w>1?'s':'')+'-garou'+(w>1?'s':'')+'.'];
    gs.news=[];
    hostStartNight();
  }
  function hostStartNight(){
    gs.phase='night';
    gs.wolfPicks={}; gs.seerDone=false; gs.victim=-1; gs.witchSave=false; gs.witchKill=-1; gs.witchReal=false;
    gs.news=['🌙 Nuit '+gs.dayNum+' : le village s’endort…'];
    setDeadline(NIGHT_MS, hostEndNight);
    hostPush();
    hostNightCheck();
  }
  function hostNightCheck(){
    if(gs.phase!=='night') return;
    var wolves=aliveWith('loup').filter(isConnected);
    var wolvesDone=wolves.every(function(s){ return gs.wolfPicks.hasOwnProperty(s); });
    var seer=aliveWith('voyante').filter(isConnected);
    if(wolvesDone && (!seer.length || gs.seerDone)){ clearTimeout(gs.timer); gs.timer=setTimeout(hostEndNight, 1200); }
  }
  function plurality(map){
    var tally={}, max=0, leaders=[];
    Object.keys(map).forEach(function(k){ var t=map[k]; tally[t]=(tally[t]||0)+1; });
    Object.keys(tally).forEach(function(t){
      t=Number(t);
      if(tally[t]>max){ max=tally[t]; leaders=[t]; } else if(tally[t]===max) leaders.push(t);
    });
    return {tally:tally, max:max, leaders:leaders};
  }
  function hostEndNight(){
    if(gs.phase!=='night') return;
    var p=plurality(gs.wolfPicks);
    /* égalité entre les loups : le sort tranche */
    gs.victim = p.leaders.length ? p.leaders[Math.floor(Math.random()*p.leaders.length)] : -1;
    var witch=aliveWith('sorciere');
    gs.phase='witch';
    if(witch.length && isConnected(witch[0]) && (gs.potions.life || gs.potions.death)){
      gs.witchReal=true;
      setDeadline(WITCH_MS, hostDawn);
    } else {
      /* la Sorcière est morte, absente ou sans potion : on attend quand même un peu
         pour que la durée de la nuit ne trahisse rien */
      gs.witchReal=false;
      setDeadline(gs.opts.witch ? 5000+Math.floor(Math.random()*5000) : 1500, hostDawn);
    }
    hostPush();
  }
  function hostDawn(){
    if(gs.phase!=='witch') return;
    clearTimeout(gs.timer);
    var deaths=[];
    if(gs.victim>=0 && !gs.witchSave) deaths.push(gs.victim);
    if(gs.witchKill>=0 && deaths.indexOf(gs.witchKill)===-1) deaths.push(gs.witchKill);
    deaths.forEach(function(s){ gs.alive[s]=false; });
    var head='☀️ Jour '+gs.dayNum+' : ';
    gs.news = deaths.length
      ? deaths.map(function(s){ return head+deathText(s)+' a été retrouvé(e) mort(e) ce matin.'; })
      : [head+'personne n’est mort cette nuit !'];
    gs.log=gs.log.concat(gs.news);
    hostAfterDeaths(deaths, 'day');
  }
  /* après des morts : le Chasseur tire s'il en fait partie, puis on vérifie la victoire */
  function hostAfterDeaths(deaths, next){
    var hunter=deaths.filter(function(s){ return gs.roles[s]==='chasseur'; })[0];
    if(hunter!==undefined && !gs.hunterUsed && isConnected(hunter)){
      gs.hunterUsed=true;
      gs.phase='hunter'; gs.hunterSeat=hunter; gs.afterHunter=next;
      setDeadline(HUNTER_MS, hostHunterTimeout);
      hostPush();
      return;
    }
    hostContinue(next);
  }
  function hostHunterTimeout(){
    if(gs.phase!=='hunter') return;
    var t='🏹 '+pname(gs.hunterSeat)+' n’a pas tiré.';
    gs.news.push(t); gs.log.push(t);
    hostContinue(gs.afterHunter);
  }
  function checkWin(){
    var wolves=aliveWith('loup').length, others=aliveSeats().length-wolves;
    if(!wolves) return 'village';
    if(wolves>=others) return 'loups';
    return null;
  }
  function hostContinue(next){
    var w=checkWin();
    if(w) return hostEndGame(w);
    if(next==='day') hostStartDay();
    else { gs.dayNum++; hostStartNight(); }
  }
  function hostStartDay(){
    gs.phase='day'; gs.votes={};
    clearTimeout(gs.dayEndTimer); gs.dayEndTimer=null;
    setDeadline(gs.opts.day*1000, hostEndDay);
    hostPush();
  }
  function hostDayCheck(){
    if(gs.phase!=='day') return;
    var voters=aliveSeats().filter(isConnected);
    var all=voters.length && voters.every(function(s){ return gs.votes.hasOwnProperty(s); });
    clearTimeout(gs.dayEndTimer); gs.dayEndTimer=null;
    /* tout le monde a voté : petit délai pour qu'on puisse encore changer d'avis */
    if(all) gs.dayEndTimer=setTimeout(hostEndDay, DAY_END_DELAY);
  }
  function hostEndDay(){
    if(gs.phase!=='day') return;
    clearTimeout(gs.timer); clearTimeout(gs.dayEndTimer); gs.dayEndTimer=null;
    var p=plurality(gs.votes), head='⚖️ Vote du jour '+gs.dayNum+' : ';
    if(p.leaders.length===1){
      var out=p.leaders[0];
      gs.alive[out]=false;
      gs.news=[head+'le village élimine '+deathText(out)+' — '+p.max+' voix.'];
      gs.log=gs.log.concat(gs.news);
      hostAfterDeaths([out], 'night');
    } else {
      gs.news=[head+(p.leaders.length ? 'égalité, personne n’est éliminé.' : 'personne n’a voté.')];
      gs.log=gs.log.concat(gs.news);
      hostContinue('night');
    }
  }
  function hostEndGame(w){
    clearTimers();
    gs.phase='over'; gs.winner=w;
    gs.gameSeats.forEach(function(s){ if(ROLES[gs.roles[s]].camp===w) gs.scores[s]=(gs.scores[s]||0)+1; });
    var t = w==='village' ? '🏆 Tous les loups-garous sont morts : le village gagne !' : '🏆 Les loups-garous sont aussi nombreux que les villageois : les loups gagnent !';
    gs.news=gs.news.concat([t]); gs.log.push(t);
    setNetStatus('connected','PARTIE TERMINÉE');
    hostPush();
  }
  /* actions des joueurs (hôte compris, en place 0) */
  function hostAct(seat, msg){
    var role=gs.roles[seat], alive=!!gs.alive[seat], t=parseInt(msg.target,10);
    var tAlive = gs.gameSeats.indexOf(t)!==-1 && gs.alive[t];
    if(gs.gameSeats.indexOf(seat)===-1) return;
    /* seul le Chasseur agit une fois mort */
    if(!alive && !(msg.kind==='hunt' && seat===gs.hunterSeat)) return;
    switch(msg.kind){
      case 'wolf':
        if(gs.phase!=='night' || role!=='loup' || !tAlive || gs.roles[t]==='loup') return;
        gs.wolfPicks[seat]=t; hostPush(); hostNightCheck(); break;
      case 'seer':
        if(gs.phase!=='night' || role!=='voyante' || gs.seerDone || !tAlive || t===seat) return;
        gs.seerSeen[t]=gs.roles[t]; gs.seerDone=true; hostPush(); hostNightCheck(); break;
      case 'witch_save':
        if(gs.phase!=='witch' || !gs.witchReal || role!=='sorciere' || !gs.potions.life || gs.victim<0) return;
        gs.potions.life=false; gs.witchSave=true; hostWitchMaybeDone(); break;
      case 'witch_kill':
        if(gs.phase!=='witch' || !gs.witchReal || role!=='sorciere' || !gs.potions.death || !tAlive || t===seat) return;
        gs.potions.death=false; gs.witchKill=t; hostWitchMaybeDone(); break;
      case 'witch_done':
        if(gs.phase!=='witch' || !gs.witchReal || role!=='sorciere') return;
        hostDawn(); break;
      case 'hunt':
        if(gs.phase!=='hunter' || seat!==gs.hunterSeat || !tAlive || t===seat) return;
        clearTimeout(gs.timer);
        gs.alive[t]=false;
        var txt='🏹 Dans un dernier souffle, '+pname(seat)+' abat '+deathText(t)+' !';
        gs.news.push(txt); gs.log.push(txt);
        hostAfterDeaths([t], gs.afterHunter); break;
      case 'vote':
        if(gs.phase!=='day' || !tAlive || t===seat) return;
        gs.votes[seat]=t; hostPush(); hostDayCheck(); break;
    }
  }
  function hostWitchMaybeDone(){
    var canSave=gs.potions.life && gs.victim>=0;
    if(!canSave && !gs.potions.death) hostDawn(); else hostPush();
  }
  function act(kind, target){
    sfxValidate();
    var msg={type:'g_act', kind:kind, target:target};
    if(netRole==='host') hostAct(0, msg); else net.send(msg);
  }

  /* ===================== MESSAGES (côté joueur) ===================== */
  function handleMsg(msg){
    if(!msg || !msg.type) return;
    switch(msg.type){
      case 'room_full': setNetStatus('error', msg.reason||'SALLE COMPLÈTE'); break;
      case 'seat_assigned':
        mySeat=msg.seat; roomCode=net.code;
        $('garouCodeDisplay').textContent=roomCode;
        break;
      case 'g_state': render(msg); break;
      case 'room_closed': net.close(); showLostModal("L'hôte a fermé la salle."); break;
    }
  }

  /* ===================== AFFICHAGE ===================== */
  var tick=null, endsAt=0;
  function isOn(s){ return s===0 || v.connected[s]!==false; }
  function row(s, extra, cls){
    var p=v.players[s]||{name:'?'};
    return '<div class="cham-player-row filled garou-row'+(cls?' '+cls:'')+(isOn(s)?'':' offline')+'">'+CG.playerDot(pcolor(s))+
      '<span class="cham-player-name">'+escapeHtml(p.name)+(s===mySeat?' (toi)':'')+(isOn(s)?'':'<span class="imp-tag">déconnecté(e)</span>')+'</span>'+(extra||'')+'</div>';
  }
  function render(msg){
    var prev=v; v=msg;
    gs.players=v.players; gs.connected=v.connected;
    if(v.phase==='lobby' || v.phase==='lobby_wait') return renderLobby();
    if(v.phase==='over') return renderOver(prev);
    renderGame(prev);
  }
  function renderLobby(){
    var html='', n=0;
    for(var s=0;s<v.players.length;s++){
      if(!v.players[s]) continue;
      if(isOn(s)) n++;
      html+=row(s, '<span class="cham-vote-count">'+(v.scores[s]||0)+' pts</span>');
    }
    $('garouPlayerList').innerHTML=html;
    var host=netRole==='host';
    $('garouHostOpts').hidden=!host;
    if(host){
      $('garouDaySel').value=String(v.opts.day); $('garouWitchChk').checked=v.opts.witch; $('garouHunterChk').checked=v.opts.hunter;
    }
    var st=$('garouLobbyStatus');
    if(n<MIN_PLAYERS) st.textContent=n+' joueur(s) connecté(s) — '+MIN_PLAYERS+' minimum pour lancer la partie.';
    else st.textContent = (host ? n+' joueurs prêts. Tu peux lancer la partie !' : n+" joueurs prêts. En attente que l'hôte lance la partie...")+
      ' Avec '+n+' joueurs : '+deckText(n, v.opts)+'.';
    $('garouStartBtn').style.display = (host && n>=MIN_PLAYERS) ? 'inline-block' : 'none';
    $('garouDayBadge').style.display='none';
    clearInterval(tick);
    hideBanner();
    gotoScreen('lobby');
  }
  function deckText(n, o){
    var w=wolfCount(n), parts=[w+' loup'+(w>1?'s':''), 'la Voyante'];
    if(o.witch) parts.push('la Sorcière');
    if(o.hunter && n>=6) parts.push('le Chasseur');
    var rest=n-w-1-(o.witch?1:0)-(o.hunter && n>=6?1:0);
    if(rest>0) parts.push(rest+' villageois');
    return parts.join(', ');
  }
  function startTick(){
    endsAt=Date.now()+v.ms;
    clearInterval(tick);
    function up(){
      var left=Math.max(0,endsAt-Date.now());
      $('garouTimerFill').style.width=(left/(v.total||1)*100)+'%';
      var m=Math.floor(left/60000), sec=Math.floor(left/1000)%60;
      $('garouTimerText').textContent='⏳ '+(m?m+':'+(sec<10?'0':''):'')+sec+(m?'':' s');
      if(!left) clearInterval(tick);
    }
    tick=setInterval(up, 250); up();
  }
  function renderGame(prev){
    var me=v.me, night = v.phase==='night' || v.phase==='witch';
    document.getElementById('view-garou').classList.toggle('garou-night', night);
    $('garouDayBadge').textContent = night ? '🌙 NUIT '+v.day : '☀️ JOUR '+v.day;
    $('garouDayBadge').style.display='inline-block';
    /* carte de rôle */
    var card=$('garouRoleCard');
    if(me.inGame){
      var R=ROLES[me.role]||ROLES.villageois, extra='';
      if(me.role==='loup'){
        var pack=v.gameSeats.filter(function(s){ return s!==mySeat && v.roles[s]==='loup'; });
        extra = pack.length ? '<p>🐺 Ta meute : '+pack.map(function(s){ return '<b>'+escapeHtml(v.players[s].name)+'</b>'+(v.alive[s]?'':' (mort)'); }).join(', ')+'</p>' : '<p>🐺 Tu es le seul loup.</p>';
      }
      if(me.role==='sorciere' && v.potions) extra='<p>Potions : '+(v.potions.life?'💚 vie':'<s>vie</s>')+' · '+(v.potions.death?'☠️ mort':'<s>mort</s>')+'</p>';
      card.className='garou-role '+(me.role||'')+(me.alive?'':' dead');
      card.innerHTML='<span class="ico">'+R.ico+'</span><div><b>'+(me.alive?'':'💀 ')+R.name+'</b><small>'+(me.alive?R.desc:'Tu es mort(e) : tu vois tous les rôles, mais tu ne dois plus rien dire 🤫')+'</small>'+extra+'</div>';
      card.hidden=false;
    } else {
      card.className='garou-role'; card.hidden=false;
      card.innerHTML='<span class="ico">👀</span><div><b>SPECTATEUR</b><small>Une partie est en cours : tu joueras à la prochaine.</small></div>';
    }
    /* annonces */
    $('garouNews').innerHTML=v.news.map(function(t){ return '<p>'+escapeHtml(t)+'</p>'; }).join('');
    $('garouLog').innerHTML=v.log.map(function(t){ return '<li>'+escapeHtml(t)+'</li>'; }).join('');
    renderAction(prev);
    startTick();
    refreshBanner();
    gotoScreenOnce('game', prev);
  }
  function gotoScreenOnce(name, prev){
    if(!document.getElementById('garou-screen-'+name).classList.contains('active')) gotoScreen(name);
  }
  function refreshBanner(){
    var missing=v.gameSeats.filter(function(s){ return v.alive[s] && !isOn(s); }).map(function(s){ return v.players[s] ? v.players[s].name : '?'; });
    if(missing.length) showBanner(CG.missingText(missing, 'la partie'));
    else hideBanner();
  }
  /* bouton de cible dans la liste des joueurs */
  function targetBtn(kind, s, label, on){
    return '<button class="cham-vote-btn'+(on?' voted':'')+'" data-kind="'+kind+'" data-seat="'+s+'"><span>'+label+'</span></button>';
  }
  function renderAction(prev){
    var me=v.me, title='', hint='', listHtml='', key='', mine=me.inGame && me.alive;
    var aliveList=v.gameSeats.filter(function(s){ return v.alive[s]; });
    var deadList=v.gameSeats.filter(function(s){ return !v.alive[s]; });
    function roleTag(s){
      var r=v.roles[s];
      if(!r) return '';
      var seen = me.role==='voyante' && v.seerSeen && v.seerSeen.hasOwnProperty(s) && v.alive[s];
      return '<span class="imp-tag">'+(seen?'🔮 ':'')+roleLabel(r)+'</span>';
    }
    if(v.phase==='night' && mine && me.role==='loup'){
      var picks=v.wolfPicks||{}, myPick=picks.hasOwnProperty(mySeat) ? Number(picks[mySeat]) : -1;
      title='🐺 Choisissez votre victime';
      hint='Mettez-vous d’accord avec la meute : la cible la plus choisie sera dévorée (au hasard en cas d’égalité). Tu peux changer d’avis jusqu’à la fin de la nuit.';
      key='wolf'+v.day;
      aliveList.forEach(function(s){
        var who=Object.keys(picks).filter(function(w){ return Number(picks[w])===s; }).map(function(w){ return v.players[w].name; });
        var tag = who.length ? '<span class="imp-tag">🐺 '+escapeHtml(who.join(', '))+'</span>' : '';
        listHtml+=row(s, roleTag(s)+tag+(v.roles[s]==='loup' ? '' : targetBtn('wolf', s, myPick===s?'✔ Cible':'Dévorer', myPick===s)));
      });
    } else if(v.phase==='night' && mine && me.role==='voyante' && !v.seerDone){
      title='🔮 Qui veux-tu sonder ?'; hint='Tu découvriras son vrai rôle. Personne ne saura qui tu as regardé.'; key='seer'+v.day;
      aliveList.forEach(function(s){ listHtml+=row(s, roleTag(s)+(s===mySeat?'':targetBtn('seer', s, 'Voir son rôle'))); });
    } else if(v.phase==='witch' && mine && me.role==='sorciere' && v.witch){
      var w=v.witch, P=v.potions;
      title='🧪 À toi, Sorcière'; key='witch'+v.day;
      if(w.victim>=0) hint='Cette nuit, les loups ont attaqué <b>'+escapeHtml(v.players[w.victim].name)+'</b>'+(w.victim===mySeat?' (toi !)':'')+'.'+(w.saved?' 💚 Tu l’as sauvé(e).':'');
      else hint='Les loups n’ont attaqué personne cette nuit.';
      hint+='<div class="btn-row">'+(P.life && w.victim>=0 && !w.saved ? '<button class="btn yellow small" id="garouSaveBtn"><span>💚 Sauver avec la potion de vie</span></button>' : '')+
        '<button class="btn ghost small" id="garouWitchDoneBtn"><span>😴 Terminer ma nuit</span></button></div>';
      if(P.death && w.kill<0) hint+='<p class="theme-count" style="margin:8px 0 0;">☠️ Potion de mort : choisis quelqu’un ci-dessous (facultatif).</p>';
      aliveList.forEach(function(s){
        var killBtn = P.death && w.kill<0 && s!==mySeat ? targetBtn('witch_kill', s, '☠️ Empoisonner') : (w.kill===s ? '<span class="imp-tag">☠️ empoisonné(e)</span>' : '');
        listHtml+=row(s, roleTag(s)+killBtn);
      });
    } else if(v.phase==='hunter' && v.hunter===mySeat){
      title='🏹 Ta dernière balle !'; hint='Tu viens de mourir. Choisis qui tu emportes avec toi.'; key='hunt'+v.day+v.news.length;
      aliveList.forEach(function(s){ listHtml+=row(s, roleTag(s)+(s===mySeat?'':targetBtn('hunt', s, '🏹 Tirer'))); });
    } else if(v.phase==='day'){
      var votes=v.votes||{}, myVote=votes.hasOwnProperty(mySeat) ? Number(votes[mySeat]) : -1;
      title='☀️ Débat et vote'; key= mine ? 'vote'+v.day : '';
      hint = mine ? 'Discutez à voix haute, puis votez pour éliminer un suspect. Tu peux changer ton vote tant que tout le monde n’a pas voté. En cas d’égalité, personne n’est éliminé.'
                  : (me.inGame ? 'Tu es mort(e) : regarde le village débattre… en silence 🤫' : 'Le village débat et vote.');
      var nVoted=Object.keys(votes).length;
      hint+='<p class="theme-count" style="margin:8px 0 0;">'+nVoted+' / '+aliveList.length+' vote(s)</p>';
      aliveList.forEach(function(s){
        var who=Object.keys(votes).filter(function(x){ return Number(votes[x])===s; }).map(function(x){ return v.players[x].name; });
        var tag = who.length ? '<span class="imp-tag">🗳 '+who.length+' : '+escapeHtml(who.join(', '))+'</span>' : '';
        listHtml+=row(s, roleTag(s)+tag+(mine && s!==mySeat ? targetBtn('vote', s, myVote===s?'✔ Mon vote':'Voter', myVote===s) : ''));
      });
    } else {
      /* rien à faire : la nuit ne dit pas qui agit */
      if(v.phase==='hunter'){ title='🏹 Le Chasseur riposte…'; hint=escapeHtml(v.players[v.hunter] ? v.players[v.hunter].name : '?')+' choisit qui il emporte avec lui.'; }
      else if(me.role==='voyante' && v.seerDone && v.phase==='night'){ title='🔮 Vision reçue'; hint='Le rôle sondé apparaît dans la liste (🔮). Rendors-toi…'; }
      else { title='🌙 Le village dort'; hint = me.inGame && me.alive ? 'Ferme les yeux… Les rôles de la nuit agissent en secret.' : 'Les rôles de la nuit agissent…'; }
      aliveList.forEach(function(s){ listHtml+=row(s, roleTag(s)); });
    }
    if(deadList.length){
      listHtml+='<h3 class="rules-subhead garou-dead-title">💀 MORTS</h3>';
      deadList.forEach(function(s){ listHtml+=row(s, '<span class="imp-tag">'+roleLabel(v.roles[s])+'</span>', 'dead'); });
    }
    $('garouActionTitle').textContent=title;
    $('garouActionHint').innerHTML=hint;
    $('garouPlayers').innerHTML=listHtml;
    if(key && key!==lastActionKey){ lastActionKey=key; CG.yourTurn(); }
    var save=$('garouSaveBtn'); if(save) save.addEventListener('click',function(){ act('witch_save'); });
    var done=$('garouWitchDoneBtn'); if(done) done.addEventListener('click',function(){ act('witch_done'); });
  }
  $('garouPlayers').addEventListener('click',function(e){
    var b=e.target.closest ? e.target.closest('.cham-vote-btn') : null;
    if(!b || b.disabled) return;
    var kind=b.getAttribute('data-kind'), s=parseInt(b.getAttribute('data-seat'),10);
    if(kind==='witch_kill' && !confirm('Empoisonner '+v.players[s].name+' ? (une seule fois dans la partie)')) return;
    if(kind==='hunt' && !confirm('Tirer sur '+v.players[s].name+' ?')) return;
    act(kind, s);
  });
  function renderOver(prev){
    clearInterval(tick);
    document.getElementById('view-garou').classList.remove('garou-night');
    $('garouDayBadge').style.display='none';
    var me=v.me, won = me.inGame && ROLES[me.role] && ROLES[me.role].camp===v.winner;
    var b=$('garouWinBanner');
    b.textContent = v.winner==='village' ? '🧑‍🌾 LE VILLAGE GAGNE !' : '🐺 LES LOUPS-GAROUS GAGNENT !';
    b.className='cham-result-banner '+(v.winner==='village'?'b-perfect':'b-fail');
    var html='';
    v.gameSeats.forEach(function(s){
      var r=ROLES[v.roles[s]], win=r && r.camp===v.winner;
      html+=row(s, '<span class="imp-tag">'+roleLabel(v.roles[s])+(v.alive[s]?'':' 💀')+'</span><span class="cham-vote-count">'+(v.scores[s]||0)+' pts'+(win?' +1':'')+'</span>');
    });
    $('garouFinalList').innerHTML=html;
    $('garouFinalLog').innerHTML=v.log.map(function(t){ return '<li>'+escapeHtml(t)+'</li>'; }).join('');
    var host=netRole==='host';
    $('garouNewGameBtn').style.display=host?'inline-block':'none';
    $('garouOverWait').style.display=host?'none':'inline-block';
    hideBanner();
    if(!prev || prev.phase!=='over'){
      sfxReveal(me.inGame ? (won?100:0) : 50);
      if(me.inGame && CG.account) CG.account.record('garou', 0, won);
      if(me.inGame && won && me.role==='loup' && CG.achieve) CG.achieve('garou_wolf');
    }
    gotoScreen('over');
  }

  /* ---------- API pour le hub ---------- */
  CG.garou={
    reset:function(){
      if(netRole) cleanupOnline();
      closeModal('garouDisconnectModal');
      document.getElementById('view-garou').classList.remove('garou-night');
      gotoScreen('online');
    },
    enterJoinFlow:function(code){
      gotoScreen('online');
      $('garouJoinCode').value=CG.cleanRoomCode(decodeURIComponent(code));
    }
  };
  CG.lobbyChat(net, $('garouPlayerList'), 'garouName');
})();
