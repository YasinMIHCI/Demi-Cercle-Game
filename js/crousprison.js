/* Crous ou Prison ? — une photo de chambre, 10 secondes pour deviner :
   chambre étudiante du CROUS… ou cellule de prison ?
   9 photos par partie (1 min 30 au maximum). En solo, ou de 2 à 8 joueurs
   en ligne. Bonne réponse : 100 points + jusqu'à 50 points de rapidité.
   Les photos (et leurs crédits) sont listées dans js/crousprison-photos.js.
   En solo, la même logique « hôte » tourne en local, sans réseau. */
(function(){
  'use strict';
  var CG=window.CG;
  var $=CG.$, escapeHtml=CG.escapeHtml, shuffle=CG.shuffle, shake=CG.shake, openModal=CG.openModal, closeModal=CG.closeModal;
  var sfxToggle=CG.sfxToggle, sfxValidate=CG.sfxValidate, sfxReveal=CG.sfxReveal, copyText=CG.copyText;

  var PHOTOS=CG.COP_PHOTOS||[];
  var ROOM_PREFIX='p5crousprison-';
  var MIN_PLAYERS=2, MAX_PLAYERS=8;
  var PER_GAME=9, PHOTO_MS=10000, REVEAL_MS=2600, COUNT_MS=3000;
  var BASE_PTS=100, SPEED_PTS=50, MIN_EACH=2;
  var BEST_KEY='cop_best_v1', SEEN_KEY='cop_seen_v1', SEEN_KEEP=60;
  var LABEL={c:'CROUS', p:'PRISON'};
  var COLORS=['#E60012','#2E6FF2','#FFE600','#7cff6e','#ff6ec7','#ff9d2f','#00e5ff','#b388ff'];

  /* ---------- tirage des photos ----------
     Les photos déjà vues récemment passent en dernier, et chaque partie a au
     moins MIN_EACH photos de chaque sorte (sinon on devine par élimination). */
  function loadSeen(){
    try{ var a=JSON.parse(localStorage.getItem(SEEN_KEY)||'[]'); if(Array.isArray(a)) return a; }catch(e){}
    return [];
  }
  function pickPhotos(){
    var seen=loadSeen(), byKind={c:[],p:[]};
    shuffle(PHOTOS.map(function(p,i){ return i; })).forEach(function(i){ byKind[PHOTOS[i].a].push(i); });
    ['c','p'].forEach(function(k){
      byKind[k].sort(function(x,y){ return (seen.indexOf(x)!==-1)-(seen.indexOf(y)!==-1); });
    });
    var n=Math.min(PER_GAME, PHOTOS.length);
    var nc=0;
    for(var i=0;i<n;i++) if(Math.random()<0.5) nc++;
    nc=Math.max(Math.min(MIN_EACH,byKind.c.length), Math.min(nc, n-Math.min(MIN_EACH,byKind.p.length)));
    nc=Math.min(nc, byKind.c.length);
    var np=Math.min(n-nc, byKind.p.length);
    nc=Math.min(n-np, byKind.c.length);
    var ids=shuffle(byKind.c.slice(0,nc).concat(byKind.p.slice(0,np)));
    seen=ids.concat(seen.filter(function(i){ return ids.indexOf(i)===-1; })).slice(0,SEEN_KEEP);
    try{ localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); }catch(e){}
    return ids;
  }
  function photoSrc(id){ var p=PHOTOS[id]; return p ? p.f : ''; }
  var preloaded={};
  function preload(ids){
    ids.forEach(function(id){
      if(preloaded[id]) return;
      var im=new Image(); im.decoding='async'; im.src=photoSrc(id); preloaded[id]=im;
    });
  }

  /* hôte (ou partie solo) : état qui fait foi */
  var gs={
    players:[], scores:[], connected:[], clientIds:[],
    phase:'lobby',            /* 'lobby' | 'countdown' | 'photo' | 'reveal' | 'over' */
    seats:[], ids:[], idx:0, answers:{}, picks:{}, good:{}, deadline:0, timer:null, lastMsg:null
  };
  var netRole=null, mySeat=0, myName='', roomCode='';
  var gameLiveForLobby=false;
  var view={ids:[], idx:-1, myPick:null, shownAt:0, answered:[], seats:[], solo:false, score:0, streak:0};
  var bar=CG.timerBar('copTimerFill','copTimerText');
  var countTimer=null;

  /* ===================== RÉSEAU ===================== */
  function setNetStatus(cls,label){
    var el=$('copNetStatus');
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
  function broadcast(msg){ handleMsg(JSON.parse(JSON.stringify(msg))); if(netRole==='host') net.sendToAll(msg); }
  function sendToSeat(seat,msg){ if(seat===0) handleMsg(JSON.parse(JSON.stringify(msg))); else net.sendTo(seat,msg); }
  function isHostLike(){ return netRole==='host' || netRole==='solo'; }

  function stopLocalTimers(){ bar.stop(); clearInterval(countTimer); countTimer=null; }
  function cleanupOnline(){
    if(netRole==='host' || netRole==='guest') net.close(netRole==='host' ? {type:'room_closed'} : null);
    clearTimeout(gs.timer); gs.timer=null;
    stopLocalTimers();
    netRole=null; mySeat=0; roomCode=''; gameLiveForLobby=false;
    gs.players=[]; gs.scores=[]; gs.connected=[]; gs.clientIds=[];
    gs.phase='lobby'; gs.seats=[]; gs.ids=[]; gs.idx=0; gs.answers={}; gs.picks={}; gs.good={}; gs.lastMsg=null;
    hideBanner();
    setNetStatus('offline', 'HORS LIGNE');
  }
  function showBanner(t){ $('copNetBannerText').textContent=t; $('copNetBanner').classList.add('open'); }
  function hideBanner(){ $('copNetBanner').classList.remove('open'); }
  function showLostModal(text){
    hideBanner(); setNetStatus('offline','DÉCONNECTÉ');
    $('copDisconnectModalText').textContent=text;
    openModal('copDisconnectModal');
  }
  $('copDisconnectBackBtn').addEventListener('click',function(){
    closeModal('copDisconnectModal'); cleanupOnline(); gotoScreen('menu');
  });

  function isConnected(seat){ return seat===0 || gs.connected[seat]!==false; }
  function activeCount(){
    var n=0;
    for(var s=0;s<gs.players.length;s++){ if(gs.players[s] && isConnected(s)) n++; }
    return n;
  }
  function isGameLive(){ return gs.phase==='countdown' || gs.phase==='photo' || gs.phase==='reveal'; }
  function pname(seat){ var p=gs.players[seat]; return p?p.name:'?'; }
  function pcolor(seat){ return COLORS[seat%COLORS.length]; }

  /* ----- menu ----- */
  function loadBest(){ var b=0; try{ b=parseInt(localStorage.getItem(BEST_KEY)||'0',10)||0; }catch(e){} return b; }
  function renderMenu(){
    var best=loadBest();
    $('copBest').textContent = best ? 'Ton record : '+best+' pts' : 'Pas encore de record';
    var ok=PHOTOS.length>=PER_GAME;
    $('copPhotoCount').textContent = ok ? PHOTOS.length+' photos dans la banque'
      : 'Banque de photos en cours de constitution — revenez très vite !';
    ['copSoloBtn','copCreateRoomBtn','copJoinRoomBtn'].forEach(function(id){ $(id).disabled=!ok; });
  }
  $('copSoloBtn').addEventListener('click',function(){
    if(PHOTOS.length<PER_GAME) return;
    myName=$('copName').value.trim()||'Toi';
    cleanupOnline();
    netRole='solo'; mySeat=0;
    gs.players=[{name:myName}]; gs.scores=[0]; gs.connected=[true];
    setNetStatus('offline','SOLO');
    sfxValidate();
    hostStartGame();
  });
  $('copCreateRoomBtn').addEventListener('click',function(){
    myName=$('copName').value.trim()||'Joueur';
    cleanupOnline();
    net.host(function(code){
      netRole='host'; mySeat=0; roomCode=code;
      gs.phase='lobby';
      gs.players=[{name:myName}]; gs.scores=[0]; gs.connected=[true]; gs.clientIds=[net.clientId];
      try{ history.replaceState(null,'','#crousprison?room='+code); }catch(e){}
      $('copCodeDisplay').textContent=code;
      renderLobby();
      gotoScreen('lobby');
    });
    sfxToggle();
  });
  $('copJoinCode').addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); $('copJoinRoomBtn').click(); } });
  $('copJoinRoomBtn').addEventListener('click',function(){
    myName=$('copName').value.trim()||'Joueur';
    var code=$('copJoinCode').value.trim().toUpperCase();
    if(!code){ shake($('copJoinCode')); return; }
    cleanupOnline();
    netRole='guest';
    net.join(code, {name:myName});
    sfxToggle();
  });
  $('copCopyCodeBtn').addEventListener('click',function(){ copyText(roomCode, $('copCopyCodeBtn')); });
  $('copCopyLinkBtn').addEventListener('click',function(){ copyText(location.origin+location.pathname+'#crousprison?room='+roomCode, $('copCopyLinkBtn')); });
  $('copBackFromLobby').addEventListener('click',function(){ sfxToggle(); cleanupOnline(); gotoScreen('menu'); });
  $('copHubReturnBtn').addEventListener('click',function(){ sfxToggle(); location.hash='hub'; });
  $('copRulesBtn').addEventListener('click',function(){ openModal('copRulesModal'); sfxToggle(); });
  $('copRulesModalClose').addEventListener('click',function(){ closeModal('copRulesModal'); });
  $('copRulesModal').addEventListener('click',function(e){ if(e.target===this) closeModal('copRulesModal'); });
  function openCredits(){
    var html='';
    PHOTOS.forEach(function(p){
      html+='<li><b>'+LABEL[p.a]+'</b> — '+escapeHtml(p.t||'')+'<br><span class="cop-credit-line">📷 '+escapeHtml(p.by||'?')+' · '+escapeHtml(p.lic||'')+
        (p.url ? ' · <a href="'+escapeHtml(p.url)+'" target="_blank" rel="noopener">source</a>' : '')+'</span></li>';
    });
    $('copCreditsList').innerHTML=html || '<li>Aucune photo pour le moment.</li>';
    openModal('copCreditsModal'); sfxToggle();
  }
  $('copCreditsBtn').addEventListener('click', openCredits);
  $('copOverCreditsBtn').addEventListener('click', openCredits);
  $('copCreditsModalClose').addEventListener('click',function(){ closeModal('copCreditsModal'); });
  $('copCreditsModal').addEventListener('click',function(e){ if(e.target===this) closeModal('copCreditsModal'); });

  /* ===================== HÔTE : PLACES ===================== */
  function hostOnJoinRequest(msg){
    for(var s=1;s<gs.clientIds.length;s++){
      if(msg.clientId && gs.clientIds[s]===msg.clientId && gs.players[s]) return s;
    }
    if(activeCount()>=MAX_PLAYERS) return 'SALLE COMPLÈTE ('+MAX_PLAYERS+'/'+MAX_PLAYERS+')';
    for(s=1;s<gs.players.length;s++){ if(!gs.players[s]) return s; }
    return Math.max(1, gs.players.length);
  }
  function hostOnSeatJoined(seat, msg, isRepeat){
    var p=gs.players[seat];
    if(p){ if(msg.name) p.name=msg.name; }
    else { gs.players[seat]={name:msg.name||'Joueur'}; gs.scores[seat]=0; }
    gs.clientIds[seat]=msg.clientId||null;
    gs.connected[seat]=true;
    net.sendTo(seat, {type:'seat_assigned', seat:seat, players:gs.players.slice(), scores:gs.scores.slice(),
      connected:gs.connected.slice(), inGame:isGameLive()});
    hostResync(seat);
    hostBroadcastLobby();
    if(!isRepeat) sfxValidate();
  }
  /* remet un joueur revenu au bon écran */
  function hostResync(seat){
    var inThis=gs.seats.indexOf(seat)!==-1;
    if(!inThis){ if(gs.phase==='over' && gs.lastMsg) net.sendTo(seat, gs.lastMsg); return; }
    if(gs.phase==='countdown') net.sendTo(seat, startMsg());
    else if(gs.phase==='photo') net.sendTo(seat, photoMsg(seat));
    else if((gs.phase==='reveal' || gs.phase==='over') && gs.lastMsg) net.sendTo(seat, gs.lastMsg);
  }
  function hostOnSeatLost(seat){
    if(!isGameLive() && gs.phase!=='over'){
      gs.players[seat]=null; gs.clientIds[seat]=null;
      hostBroadcastLobby();
      return;
    }
    gs.connected[seat]=false;
    hostBroadcastLobby();
    if(gs.phase==='photo') hostCheckAnswers();
  }
  function hostOnGuestMessage(seat, msg){
    if(msg.type==='answer') hostReceiveAnswer(seat, msg.idx, msg.choice, msg.ms);
  }
  function hostBroadcastLobby(){
    if(netRole!=='host') return;
    broadcast({type:'lobby_update', players:gs.players.slice(), scores:gs.scores.slice(),
      connected:gs.connected.slice(), inGame:isGameLive()});
  }
  function left(){ return Math.max(0, gs.deadline-Date.now()); }
  function setPhaseTimer(ms, fn){
    clearTimeout(gs.timer);
    gs.deadline=Date.now()+ms;
    gs.timer=setTimeout(fn, ms);
  }

  /* ===================== HÔTE : PARTIE ===================== */
  function startMsg(){
    return {type:'game_start', ids:gs.ids.slice(), seats:gs.seats.slice(), players:gs.players.slice(), ms:left(), solo:netRole==='solo'};
  }
  function photoMsg(seat){
    return {type:'photo', idx:gs.idx, count:gs.ids.length, id:gs.ids[gs.idx], ids:gs.ids.slice(), seats:gs.seats.slice(),
      ms:left(), total:PHOTO_MS, answered:Object.keys(gs.answers).map(Number),
      mine: gs.answers.hasOwnProperty(seat) ? gs.answers[seat].c : null, scores:gs.scores.slice()};
  }
  $('copStartBtn').addEventListener('click',function(){ sfxValidate(); hostStartGame(); });
  $('copReplayBtn').addEventListener('click',function(){
    if(netRole==='solo'){ sfxValidate(); gs.scores=[0]; hostStartGame(); return; }
    if(netRole!=='host' || gs.phase!=='over') return;
    sfxValidate(); hostStartGame();
  });
  $('copLobbyBtn').addEventListener('click',function(){
    if(netRole==='solo'){ sfxToggle(); cleanupOnline(); renderMenu(); gotoScreen('menu'); return; }
    if(netRole!=='host') return;
    sfxToggle();
    for(var s=1;s<gs.players.length;s++){ if(gs.players[s] && !isConnected(s)){ gs.players[s]=null; gs.clientIds[s]=null; } }
    gs.phase='lobby'; gs.lastMsg=null;
    broadcast({type:'back_to_lobby'});
    hostBroadcastLobby();
  });
  function hostStartGame(){
    var seats=[];
    for(var i=0;i<gs.players.length;i++){ if(gs.players[i] && isConnected(i)) seats.push(i); }
    if(netRole==='host' && seats.length<MIN_PLAYERS){
      renderLobby(); gotoScreen('lobby');
      setNetStatus('error', MIN_PLAYERS+' JOUEURS CONNECTÉS MINIMUM');
      return;
    }
    if(netRole==='host'){
      setNetStatus('connected','PARTIE EN COURS');
      for(var s=1;s<gs.players.length;s++){ if(gs.players[s] && !isConnected(s)){ gs.players[s]=null; gs.clientIds[s]=null; } }
    }
    gs.seats=seats;
    gs.scores=gs.players.map(function(){ return 0; });
    gs.ids=pickPhotos();
    gs.idx=0; gs.answers={}; gs.picks={}; gs.good={}; gs.lastMsg=null;
    seats.forEach(function(s){ gs.picks[s]=[]; gs.good[s]=0; });
    gs.phase='countdown';
    setPhaseTimer(COUNT_MS, hostShowPhoto);
    broadcast(startMsg());
    hostBroadcastLobby();
  }
  function hostShowPhoto(){
    if(!isHostLike()) return;
    gs.phase='photo'; gs.answers={};
    setPhaseTimer(PHOTO_MS, hostReveal);
    gs.seats.forEach(function(s){ sendToSeat(s, photoMsg(s)); });
  }
  function hostReceiveAnswer(seat, idx, choice, ms){
    if(gs.phase!=='photo' || idx!==gs.idx || gs.seats.indexOf(seat)===-1 || gs.answers.hasOwnProperty(seat)) return;
    if(choice!=='c' && choice!=='p') return;
    /* temps de réponse mesuré par le joueur (depuis l'affichage de SA photo),
       borné par l'horloge de l'hôte */
    var spent=PHOTO_MS-left();
    ms=Math.max(0, Math.min(Number(ms)||spent, PHOTO_MS));
    gs.answers[seat]={c:choice, ms:ms};
    if(netRole==='host') broadcast({type:'answer_status', idx:gs.idx, answered:Object.keys(gs.answers).map(Number)});
    hostCheckAnswers();
  }
  function hostCheckAnswers(){
    if(gs.phase!=='photo') return;
    var pending=gs.seats.filter(function(s){ return isConnected(s) && !gs.answers.hasOwnProperty(s); });
    if(!pending.length){ clearTimeout(gs.timer); gs.timer=setTimeout(hostReveal, netRole==='solo' ? 120 : 350); }
  }
  function hostReveal(){
    if(gs.phase!=='photo') return;
    clearTimeout(gs.timer); gs.timer=null;
    var id=gs.ids[gs.idx], truth=PHOTOS[id].a, pts={}, picks={};
    gs.seats.forEach(function(s){
      var a=gs.answers[s];
      picks[s]=a ? a.c : null;
      gs.picks[s][gs.idx]=picks[s];
      if(a && a.c===truth){
        pts[s]=BASE_PTS+Math.round(SPEED_PTS*(1-a.ms/PHOTO_MS));
        gs.scores[s]=(gs.scores[s]||0)+pts[s];
        gs.good[s]++;
      }
    });
    gs.phase='reveal';
    var last=gs.idx>=gs.ids.length-1;
    gs.lastMsg={type:'reveal', idx:gs.idx, count:gs.ids.length, id:id, ids:gs.ids.slice(), seats:gs.seats.slice(), truth:truth,
      picks:picks, pts:pts, scores:gs.scores.slice(), last:last};
    broadcast(gs.lastMsg);
    setPhaseTimer(REVEAL_MS, function(){
      if(gs.phase!=='reveal') return;
      if(last) hostGameOver();
      else { gs.idx++; hostShowPhoto(); }
    });
  }
  function hostGameOver(){
    clearTimeout(gs.timer); gs.timer=null;
    gs.phase='over';
    gs.lastMsg={type:'game_over', ids:gs.ids.slice(), seats:gs.seats.slice(), players:gs.players.slice(),
      scores:gs.scores.slice(), picks:gs.picks, good:gs.good, solo:netRole==='solo'};
    broadcast(gs.lastMsg);
    hostBroadcastLobby();
    if(netRole==='host') setNetStatus('connected','SALLE EN LIGNE');
  }

  /* ===================== MESSAGES ===================== */
  function handleMsg(msg){
    if(!msg || !msg.type) return;
    switch(msg.type){
      case 'room_full': setNetStatus('error', msg.reason||'SALLE COMPLÈTE'); break;
      case 'seat_assigned':
        mySeat=msg.seat; roomCode=net.code;
        gs.players=msg.players.slice(); gs.scores=(msg.scores||[]).slice(); gs.connected=(msg.connected||[]).slice();
        gameLiveForLobby=!!msg.inGame;
        $('copCodeDisplay').textContent=roomCode;
        renderLobby(); gotoScreen('lobby');
        break;
      case 'lobby_update':
        gs.players=msg.players.slice(); if(msg.connected) gs.connected=msg.connected.slice();
        if(!isHostLike() && msg.scores) gs.scores=msg.scores.slice();
        gameLiveForLobby=!!msg.inGame;
        renderLobby(); refreshBanner();
        break;
      case 'game_start': onGameStart(msg); break;
      case 'photo': onPhoto(msg); break;
      case 'answer_status': if(msg.idx===view.idx){ view.answered=msg.answered; renderAnswerStatus(); } break;
      case 'reveal': onReveal(msg); break;
      case 'game_over': onGameOver(msg); break;
      case 'back_to_lobby':
        stopLocalTimers(); view.idx=-1;
        renderLobby(); gotoScreen('lobby');
        break;
      case 'room_closed':
        net.close(); showLostModal("L'hôte a fermé la salle.");
        break;
    }
  }

  /* ===================== AFFICHAGE ===================== */
  function gotoScreen(name){
    var all=document.querySelectorAll('.cop-screen');
    for(var i=0;i<all.length;i++) all[i].classList.remove('active');
    $('cop-screen-'+name).classList.add('active');
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function refreshBanner(){
    if(netRole!=='host' && netRole!=='guest'){ hideBanner(); return; }
    if(view.idx<0){ hideBanner(); return; }
    var missing=view.seats.filter(function(s){ return gs.players[s] && !isConnected(s); }).map(pname);
    if(missing.length) showBanner('⚠ '+missing.join(', ')+(missing.length>1?' se sont déconnectés':" s'est déconnecté(e)")+' — la partie continue sans eux.');
    else hideBanner();
  }
  function dot(s){ return '<span class="cham-player-dot" style="background:'+pcolor(s)+';"></span>'; }
  function playerRow(s, extra){
    var p=gs.players[s]||{name:'?'}, off=!isConnected(s);
    return '<div class="cham-player-row filled'+(off?' offline':'')+'">'+dot(s)+
      '<span class="cham-player-name">'+escapeHtml(p.name)+(s===mySeat?' (toi)':'')+(off?'<span class="imp-tag">déconnecté(e)</span>':'')+'</span>'+(extra||'')+'</div>';
  }
  function renderLobby(){
    var html='';
    for(var s=0;s<gs.players.length;s++){
      if(!gs.players[s]) continue;
      html+=playerRow(s);
    }
    $('copPlayerList').innerHTML=html;
    var count=activeCount();
    var live = netRole==='host' ? isGameLive() : gameLiveForLobby;
    var st=$('copLobbyStatus');
    if(live) st.textContent='Une partie est en cours — tu joueras à la prochaine.';
    else if(count<MIN_PLAYERS) st.textContent=count+' joueur connecté — '+MIN_PLAYERS+' minimum (sinon, joue en solo !).';
    else st.textContent = netRole==='host' ? (count+' joueurs prêts. Tu peux lancer la partie !') : (count+" joueurs prêts. En attente que l'hôte lance la partie...");
    $('copStartBtn').style.display = (netRole==='host' && count>=MIN_PLAYERS && !live) ? 'inline-block' : 'none';
  }

  /* ----- photo ----- */
  function setPhoto(id){
    var src=photoSrc(id), img=$('copImg');
    var p=PHOTOS[id]||{};
    $('copBg').style.backgroundImage='url("'+src+'")';
    img.classList.remove('ready');
    img.onload=function(){
      img.classList.add('ready');
      if(view.shownAt<0) view.shownAt=Date.now();
    };
    img.src=src;
    if(img.complete && img.naturalWidth){ img.classList.add('ready'); }
    $('copCaption').textContent='';
    $('copCredit').textContent='📷 '+(p.by||'?')+' · '+(p.lic||'');
  }
  function setHud(idx, count){
    $('copProgress').textContent='PHOTO '+(idx+1)+' / '+count;
    $('copScore').textContent=(gs.scores[mySeat]||0)+' PTS';
    $('copStreak').textContent = view.streak>=2 ? '🔥 ×'+view.streak : '';
  }
  function setChoices(enabled, pick){
    ['c','p'].forEach(function(k){
      var b=$(k==='c'?'copCrousBtn':'copPrisonBtn');
      b.disabled=!enabled;
      b.classList.toggle('picked', pick===k);
      b.classList.toggle('dim', pick!==null && pick!==undefined && pick!==k);
    });
  }
  function clearStamp(){
    var st=$('copStamp'); st.className='cop-stamp'; st.textContent='';
    $('copFrame').classList.remove('good','bad');
    $('copResult').textContent=''; $('copResult').className='cop-result';
    $('copPicks').innerHTML='';
  }
  function onGameStart(msg){
    stopLocalTimers();
    view.solo=!!msg.solo; view.ids=msg.ids.slice(); view.seats=msg.seats.slice(); view.idx=-1;
    view.myPick=null; view.streak=0; view.answered=[];
    if(msg.players) gs.players=msg.players.slice();
    if(!isHostLike()) gs.scores=gs.players.map(function(){ return 0; });
    preload(view.ids);
    clearStamp();
    setHud(0, view.ids.length);
    $('copImg').classList.remove('ready'); $('copImg').removeAttribute('src');
    $('copBg').style.backgroundImage='none';
    $('copCredit').textContent='';
    setChoices(false, null);
    $('copAnswerStatus').textContent='';
    bar.start(PHOTO_MS, PHOTO_MS); bar.stop();
    gotoScreen('play');
    /* compte à rebours 3, 2, 1 */
    var cd=$('copCount'), endAt=Date.now()+Math.max(0,msg.ms);
    function tick(){
      var s=Math.ceil((endAt-Date.now())/1000);
      if(s<=0){ clearInterval(countTimer); countTimer=null; cd.className='cop-count'; return; }
      if(cd.textContent!==String(s)){
        cd.textContent=String(s);
        cd.className='cop-count'; void cd.offsetWidth; cd.className='cop-count on';
        sfxToggle();
      }
    }
    cd.textContent='';
    countTimer=setInterval(tick, 80); tick();
    refreshBanner();
  }
  function onPhoto(msg){
    stopLocalTimers();
    $('copCount').className='cop-count';
    if(view.idx===-1 || msg.idx!==view.idx){ /* nouvelle photo (ou retour après coupure) */ }
    view.ids=msg.ids.slice(); view.seats=msg.seats.slice(); view.idx=msg.idx;
    if(msg.scores && !isHostLike()) gs.scores=msg.scores.slice();
    view.myPick=msg.mine; view.answered=msg.answered||[];
    preload(view.ids);
    clearStamp();
    view.shownAt=-1;
    setPhoto(msg.id);
    if($('copImg').classList.contains('ready')) view.shownAt=Date.now();
    setHud(msg.idx, msg.count);
    setChoices(view.myPick===null, view.myPick);
    renderAnswerStatus();
    bar.start(msg.ms, msg.total);
    gotoScreen('play');
    refreshBanner();
    CG.sfxWhoosh();
  }
  function pick(k){
    if(view.idx<0 || view.myPick!==null || $('copCrousBtn').disabled) return;
    if(!$('cop-screen-play').classList.contains('active')) return;
    view.myPick=k;
    setChoices(false, k);
    sfxValidate();
    var ms = view.shownAt>0 ? Date.now()-view.shownAt : PHOTO_MS;
    if(isHostLike()) hostReceiveAnswer(0, view.idx, k, ms);
    else net.send({type:'answer', idx:view.idx, choice:k, ms:ms});
    renderAnswerStatus();
  }
  $('copCrousBtn').addEventListener('click',function(){ pick('c'); });
  $('copPrisonBtn').addEventListener('click',function(){ pick('p'); });
  document.addEventListener('keydown',function(e){
    if(!$('view-crousprison').classList.contains('active') || e.ctrlKey || e.metaKey || e.altKey) return;
    var t=e.target && e.target.tagName;
    if(t==='INPUT' || t==='TEXTAREA') return;
    var k=e.key.toLowerCase();
    if(k==='arrowleft' || k==='c'){ pick('c'); }
    else if(k==='arrowright' || k==='p'){ pick('p'); }
  });
  function renderAnswerStatus(){
    var el=$('copAnswerStatus');
    if(view.solo){ el.textContent = view.myPick===null ? '← CROUS  ·  PRISON →' : ''; return; }
    el.textContent=(view.myPick!==null?'Réponse envoyée. ':'')+view.answered.length+' / '+view.seats.length+' réponses';
  }
  function onReveal(msg){
    stopLocalTimers();
    $('copCount').className='cop-count';
    var fresh=msg.idx!==view.idx || $('copImg').getAttribute('src')!==photoSrc(msg.id);
    view.ids=msg.ids.slice(); view.seats=msg.seats.slice(); view.idx=msg.idx;
    if(fresh){ clearStamp(); setPhoto(msg.id); }
    gs.scores=msg.scores.slice();
    var mine=msg.picks[mySeat], inGame=msg.seats.indexOf(mySeat)!==-1;
    var ok=mine===msg.truth;
    if(inGame){ view.streak = ok ? view.streak+1 : 0; }
    view.myPick = mine===undefined ? null : mine;
    setChoices(false, view.myPick);
    $(msg.truth==='c'?'copCrousBtn':'copPrisonBtn').classList.add('truth');
    var st=$('copStamp');
    st.textContent=LABEL[msg.truth];
    st.className='cop-stamp '+(msg.truth==='c'?'crous':'prison');
    void st.offsetWidth; st.classList.add('on');
    var p=PHOTOS[msg.id]||{};
    $('copCaption').textContent=p.t||'';
    $('copFrame').classList.add(ok?'good':'bad');
    var res=$('copResult');
    if(!inGame) res.textContent='👀 Tu regardes cette partie';
    else if(mine===null || mine===undefined){ res.textContent='⌛ Trop tard ! C’était '+(msg.truth==='c'?'une chambre du CROUS.':'une prison.'); res.className='cop-result bad'; }
    else if(ok){ res.textContent='✔ BIEN VU ! +'+(msg.pts[mySeat]||0); res.className='cop-result good'; }
    else { res.textContent='✘ RATÉ ! C’était '+(msg.truth==='c'?'une chambre du CROUS.':'une prison.'); res.className='cop-result bad'; }
    if(!view.solo){
      var html='';
      msg.seats.forEach(function(s){
        if(!gs.players[s]) return;
        var c=msg.picks[s], good=c===msg.truth;
        html+='<span class="cop-pick '+(c?(good?'good':'bad'):'none')+'">'+dot(s)+escapeHtml(pname(s))+
          ' <b>'+(c?LABEL[c]:'—')+'</b>'+(good?' +'+msg.pts[s]:'')+'</span>';
      });
      $('copPicks').innerHTML=html;
      $('copAnswerStatus').textContent='';
    } else $('copAnswerStatus').textContent='';
    setHud(msg.idx, msg.count);
    gotoScreen('play');
    stampSound(ok && inGame);
    if(inGame) sfxReveal(ok ? 100 : 0);
  }
  /* coup de tampon (bruit sourd) */
  function stampSound(){
    var AU=window.CGAudio, actx=AU && AU.ctx;
    if(!actx || actx.state!=='running' || AU.isMuted()) return;
    var t=actx.currentTime, o=actx.createOscillator(), g=actx.createGain();
    o.type='sine'; o.frequency.setValueAtTime(150,t); o.frequency.exponentialRampToValueAtTime(45,t+0.18);
    g.gain.setValueAtTime(0.5,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.22);
    o.connect(g); g.connect(AU.sfx); o.start(t); o.stop(t+0.25);
  }

  /* ----- fin de partie ----- */
  function titleFor(good, n){
    var r=n ? good/n : 0;
    if(r>=1) return '👁️ ŒIL DE LYNX — tu sens le 9 m² à des kilomètres';
    if(r>=0.75) return '🏠 AGENT IMMOBILIER DE L’EXTRÊME';
    if(r>=0.5) return '🎓 ÉTUDIANT MOYEN, DÉTENU MOYEN';
    if(r>=0.25) return '🔒 TU AS SIGNÉ UN BAIL… ET C’ÉTAIT UNE CELLULE';
    return '⛓️ TU AS VÉCU DANS LES DEUX, AVOUE';
  }
  function onGameOver(msg){
    stopLocalTimers(); hideBanner();
    view.idx=-1;
    gs.scores=msg.scores.slice();
    var inGame=msg.seats.indexOf(mySeat)!==-1;
    var my=gs.scores[mySeat]||0, good=(msg.good&&msg.good[mySeat])||0, n=msg.ids.length;
    $('copFinalScore').textContent = inGame ? my+' PTS' : '';
    $('copFinalGood').textContent = inGame ? good+' / '+n+' bonnes réponses' : '';
    $('copTitle').textContent = inGame ? titleFor(good, n) : '';
    if(msg.solo){
      var best=loadBest();
      if(my>best){ try{ localStorage.setItem(BEST_KEY, String(my)); }catch(e){} }
      $('copWinnerText').textContent = my>best && best ? '🏆 NOUVEAU RECORD !' : (best ? 'Record : '+Math.max(best,my)+' pts' : '');
      $('copFinalList').innerHTML='';
    } else {
      var order=msg.seats.filter(function(s){ return msg.players[s]; });
      order.sort(function(a,b){ return (msg.scores[b]||0)-(msg.scores[a]||0); });
      var top=order.length ? msg.scores[order[0]]||0 : 0;
      var winners=order.filter(function(s){ return (msg.scores[s]||0)===top; });
      $('copWinnerText').textContent=winners.map(function(s){ return msg.players[s].name; }).join(' & ')+(winners.length>1?' L’EMPORTENT !':' L’EMPORTE !');
      var html='';
      order.forEach(function(s,i){
        html+='<div class="cls-podium-row'+(i===0?' first':'')+(s===mySeat?' me':'')+'"><span class="cls-pos">'+(winners.indexOf(s)!==-1?'👑':(i+1))+'</span>'+dot(s)+
          '<span class="cls-slot-name">'+escapeHtml(msg.players[s].name)+(s===mySeat?' (toi)':'')+'</span>'+
          '<span class="cham-vote-count">'+((msg.good&&msg.good[s])||0)+'/'+n+' · '+(msg.scores[s]||0)+' pts</span></div>';
      });
      $('copFinalList').innerHTML=html;
    }
    var picks=(msg.picks && msg.picks[mySeat]) || [], rec='';
    msg.ids.forEach(function(id,i){
      var p=PHOTOS[id]||{}, c=picks[i], okk=c===p.a;
      rec+='<figure class="cop-thumb '+(p.a==='c'?'crous':'prison')+'">'+
        '<img src="'+escapeHtml(photoSrc(id))+'" alt="" loading="lazy">'+
        '<figcaption><b>'+LABEL[p.a]+'</b>'+(inGame?'<span class="'+(okk?'qae-ok':'qae-ko')+'">'+(okk?'✔':(c?'✘':'⌛'))+'</span>':'')+'</figcaption></figure>';
    });
    $('copRecap').innerHTML=rec;
    var host=isHostLike();
    $('copReplayBtn').style.display=host?'inline-block':'none';
    $('copLobbyBtn').style.display=host?'inline-block':'none';
    $('copLobbyBtn').querySelector('span').textContent = netRole==='solo' ? '◀ Menu' : '◀ Retour au lobby';
    $('copOverWait').style.display=host?'none':'inline-block';
    gotoScreen('over');
    sfxReveal(inGame && good>=Math.ceil(n*0.75) ? 100 : 50);
  }

  /* ---------- API pour le hub ---------- */
  CG.crousprison={
    reset:function(){
      cleanupOnline();
      closeModal('copDisconnectModal');
      renderMenu();
      gotoScreen('menu');
    },
    enterJoinFlow:function(code){
      gotoScreen('menu');
      $('copJoinCode').value=decodeURIComponent(code).toUpperCase();
    }
  };
  renderMenu();
})();
