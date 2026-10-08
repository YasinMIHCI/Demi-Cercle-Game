/* Le Caméléon — dessin partagé + déduction sociale (3 à 8 joueurs en ligne). */
(function(){
  'use strict';
  var CG=window.CG;
  var $=CG.$, escapeHtml=CG.escapeHtml, shuffle=CG.shuffle, shake=CG.shake, openModal=CG.openModal, closeModal=CG.closeModal;
  var sfxToggle=CG.sfxToggle, sfxValidate=CG.sfxValidate, sfxReveal=CG.sfxReveal, copyText=CG.copyText;
  var CHAM_ROOM_PREFIX = 'p5cameleon-';
  var CHAM_PALETTE = ['#E60012','#ffffff','#FFE600','#cccccc','#00e5ff','#ff6ec7','#ff9d2f','#7cff6e'];
  var CHAM_WORDBANK_KEY = 'cham_wordbank_v1';
  var CHAM_DEFAULT_WORDBANK = [
    {theme:"Animaux", words:["Éléphant","Girafe","Pingouin","Lion","Dauphin"]},
    {theme:"Nourriture", words:["Pizza","Sushi","Tacos","Burger","Ramen"]},
    {theme:"Métiers", words:["Pompier","Médecin","Boulanger","Pilote","Professeur"]},
    {theme:"Sports", words:["Football","Tennis","Natation","Boxe","Escalade"]},
    {theme:"Films", words:["Titanic","Avatar","Matrix","Shrek","Jaws"]},
    {theme:"Pays", words:["France","Japon","Brésil","Égypte","Canada"]},
    {theme:"Objets du quotidien", words:["Parapluie","Brosse à dents","Téléphone","Chaise","Miroir"]},
    {theme:"Super-héros", words:["Batman","Superman","Spider-Man","Hulk","Flash"]},
    {theme:"Instruments de musique", words:["Guitare","Piano","Violon","Batterie","Trompette"]},
    {theme:"Véhicules", words:["Voiture","Avion","Bateau","Vélo","Train"]},
    {theme:"Vêtements", words:["Chapeau","Chaussures","Écharpe","Gants","Robe"]},
    {theme:"Lieux", words:["Plage","Montagne","Forêt","Désert","Bibliothèque"]},
    {theme:"Fruits", words:["Banane","Fraise","Ananas","Kiwi","Pastèque"]},
    {theme:"Boissons", words:["Café","Thé","Jus d'orange","Soda","Vin"]},
    {theme:"Créatures fantastiques", words:["Dragon","Licorne","Vampire","Zombie","Fantôme"]},
    {theme:"École", words:["Tableau","Cahier","Stylo","Cartable","Récréation"]},
    {theme:"Corps humain", words:["Main","Œil","Cœur","Cerveau","Genou"]},
    {theme:"Météo", words:["Pluie","Neige","Orage","Arc-en-ciel","Soleil"]},
    {theme:"Jeux vidéo", words:["Mario","Pac-Man","Tetris","Minecraft","Zelda"]},
    {theme:"Fêtes", words:["Noël","Halloween","Anniversaire","Pâques","Nouvel An"]},
    {theme:"Émotions", words:["Joie","Colère","Peur","Tristesse","Surprise"]},
    {theme:"Technologie", words:["Ordinateur","Smartphone","Robot","Drone","Casque VR"]}
  ];
  function chamLoadWordBank(){
    try{
      var raw=localStorage.getItem(CHAM_WORDBANK_KEY);
      if(raw){ var arr=JSON.parse(raw); if(Array.isArray(arr)&&arr.length) return arr; }
    }catch(e){}
    return CHAM_DEFAULT_WORDBANK.slice();
  }
  function chamSaveWordBank(){
    try{ localStorage.setItem(CHAM_WORDBANK_KEY, JSON.stringify(chamState.wordBank)); }catch(e){}
  }


  var chamState = {
    players:[], scores:[], connected:[],
    wordBank: chamLoadWordBank(), pool:[],
    theme:null, word:null, myWord:null, amChameleon:false,
    chameleonSeat:-1, roundSeats:[], turnQueue:[], turnPointer:0, currentTurnSeat:-1,
    strokes:[], votes:{},
    /* host only */
    phase:'lobby',             /* 'lobby' | 'drawing' | 'voting' | 'guess' | 'result' */
    clientIds:[], lastPhaseMsg:null
  };
  var chamNetRole=null, chamMySeat=0;
  var chamGameStarted=false, chamCurrentRoomCode='', chamMyName='';
  var chamMyColor=CHAM_PALETTE[0], chamSelectedColor=CHAM_PALETTE[0];
  var chamCanvasEl=null, chamCtx=null;
  var chamLiveStrokes={};
  var chamDrawing=false, chamCurrentPoints=[], chamLastSentIdx=0, chamLastSendTime=0;
  var chamHasDrawnThisTurn=false;
  var chamInRound=false;        /* ce joueur participe à la manche en cours */
  var chamMyVoteTarget=null;
  var chamGuessTimer=null;
  var CHAM_GUESS_GRACE=30000;   /* délai laissé au Caméléon démasqué pour revenir */
  /* limites de temps : sans elles, un joueur inactif bloquait toute la manche */
  var CHAM_TURN_MS=45000, CHAM_VOTE_MS=60000, CHAM_GUESS_MS=45000;
  var chamPhaseTimer=null, chamDeadline=0;
  var chamTurnBar=CG.timerBar('chamTurnTimerFill','chamTurnTimerText');
  var chamVoteBar=CG.timerBar('chamVoteTimerFill','chamVoteTimerText');
  var chamGuessBar=CG.timerBar('chamGuessTimerFill','chamGuessTimerText');
  function chamLeft(){ return Math.max(0, chamDeadline-Date.now()); }
  function chamSetPhaseTimer(ms, fn){
    clearTimeout(chamPhaseTimer);
    chamDeadline=Date.now()+ms;
    chamPhaseTimer=setTimeout(fn, ms+300);
  }
  function chamStopBars(){ chamTurnBar.stop(); chamVoteBar.stop(); chamGuessBar.stop(); }

  function chamRenderColorPicker(){
    var wrap=$('chamColorPicker');
    wrap.innerHTML='';
    CHAM_PALETTE.forEach(function(c){
      var dot=document.createElement('div');
      dot.className='cham-color-dot'+(c===chamSelectedColor?' selected':'');
      dot.style.background=c;
      dot.addEventListener('click',function(){ chamSelectedColor=c; chamRenderColorPicker(); sfxToggle(); });
      wrap.appendChild(dot);
    });
  }

  $('chamAddWordBtn').addEventListener('click',function(){
    var t=$('chamCustomTheme').value.trim();
    var w=$('chamCustomWord').value.trim();
    if(!t||!w){ shake($('chamCustomTheme')); return; }
    chamState.wordBank.unshift({theme:t, words:[w]});
    chamSaveWordBank();
    $('chamCustomTheme').value=''; $('chamCustomWord').value='';
    sfxToggle();
  });

  /* ----- screen management ----- */
  function chamGoto_(name){
    var all=document.querySelectorAll('.cham-screen');
    for(var i=0;i<all.length;i++){ all[i].classList.remove('active'); }
    $('cham-screen-'+name).classList.add('active');
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function chamSetNetStatus(cls,label){
    var el=$('chamNetStatus');
    el.className='net-status '+cls;
    el.querySelector('.net-label').textContent=label;
  }

  $('chamRulesBtn').addEventListener('click',function(){ openModal('chamRulesModal'); sfxToggle(); });
  $('chamRulesModalClose').addEventListener('click',function(){ closeModal('chamRulesModal'); });
  $('chamRulesModal').addEventListener('click',function(e){ if(e.target===this) closeModal('chamRulesModal'); });
  $('chamHubReturnBtn').addEventListener('click',function(){ sfxToggle(); location.hash='hub'; });
  $('chamBackFromLobby').addEventListener('click',function(){ sfxToggle(); chamCleanupOnline(); chamGoto_('online'); });

  /* ----- canvas helpers ----- */
  var CHAM_W=800, CHAM_H=500;
  /* Coordonnées dans le repère interne 800x500 (indépendant de la taille
     d'affichage), arrondies pour alléger les messages réseau. */
  function chamGetCanvasPoint(evt, canvasEl){
    var rect=canvasEl.getBoundingClientRect();
    var scaleX=canvasEl.width/rect.width, scaleY=canvasEl.height/rect.height;
    return {x:Math.round((evt.clientX-rect.left)*scaleX), y:Math.round((evt.clientY-rect.top)*scaleY)};
  }
  function chamDrawSegment(ctx, p1, p2, color){
    ctx.strokeStyle=color; ctx.lineWidth=6; ctx.lineCap='round'; ctx.lineJoin='round';
    ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.stroke();
    if(p1.x===p2.x && p1.y===p2.y){
      ctx.beginPath(); ctx.arc(p1.x,p1.y,3,0,Math.PI*2); ctx.fillStyle=color; ctx.fill();
    }
  }
  function chamDrawStroke(ctx, s){
    if(!s.points.length) return;
    if(s.points.length===1){ chamDrawSegment(ctx, s.points[0], s.points[0], s.color); return; }
    for(var i=1;i<s.points.length;i++){ chamDrawSegment(ctx, s.points[i-1], s.points[i], s.color); }
  }
  function chamRedrawAll(ctx){
    ctx.clearRect(0,0,CHAM_W,CHAM_H);
    chamState.strokes.forEach(function(s){ chamDrawStroke(ctx, s); });
  }

  /* ================= RÉSEAU ================= */
  var net = CG.createRoomNet({
    prefix: CHAM_ROOM_PREFIX,
    onStatus: chamSetNetStatus,
    onJoinRequest: chamHostOnJoinRequest,
    onSeatJoined: chamHostOnSeatJoined,
    onGuestMessage: chamHostOnGuestMessage,
    onSeatLost: chamHostOnSeatLost,
    onHostMessage: chamHandleNetMessage,
    onReconnecting: function(){ chamShowBanner('📡 Connexion perdue — reconnexion en cours...'); },
    onReconnected: function(){ chamHideBanner(); },
    onLost: function(){ chamShowLostModal("Impossible de rétablir la connexion avec l'hôte."); }
  });

  function chamSend(msg){ net.send(msg); }
  function chamBroadcast(msg){ chamHandleNetMessage(msg); net.sendToAll(msg); }

  function chamCleanupOnline(){
    net.close(chamNetRole==='host' ? {type:'room_closed'} : null);
    if(chamGuessTimer){ clearTimeout(chamGuessTimer); chamGuessTimer=null; }
    clearTimeout(chamPhaseTimer); chamPhaseTimer=null; chamStopBars();
    chamNetRole=null; chamMySeat=0; chamGameStarted=false; chamCurrentRoomCode='';
    chamState.players=[]; chamState.scores=[]; chamState.connected=[]; chamState.clientIds=[];
    chamState.strokes=[]; chamState.votes={}; chamState.roundSeats=[];
    chamState.phase='lobby'; chamState.lastPhaseMsg=null; chamState.round=0;
    chamLiveStrokes={}; chamDrawing=false; chamInRound=false;
    chamHideBanner();
    chamSetNetStatus('offline','HORS LIGNE');
  }

  function chamShowBanner(text){
    $('chamNetBannerText').textContent=text;
    $('chamNetBanner').classList.add('open');
  }
  function chamHideBanner(){ $('chamNetBanner').classList.remove('open'); }
  function chamRefreshBanner(){
    if(!chamNetRole){ chamHideBanner(); return; }
    var missing=[];
    chamState.roundSeats.forEach(function(s){
      if(chamState.players[s] && chamState.connected[s]===false) missing.push(chamState.players[s].name);
    });
    var inRound=['cham-screen-canvas','cham-screen-voting','cham-screen-guess'].some(function(id){ return $(id).classList.contains('active'); });
    if(missing.length && inRound){
      chamShowBanner('⚠ '+missing.join(', ')+(missing.length>1?' se sont déconnectés':" s'est déconnecté(e)")+' — la manche continue sans eux.');
    } else {
      chamHideBanner();
    }
  }
  function chamShowLostModal(text){
    chamHideBanner();
    chamSetNetStatus('offline','DÉCONNECTÉ');
    $('chamDisconnectModalText').textContent=text;
    openModal('chamDisconnectModal');
  }
  $('chamDisconnectBackBtn').addEventListener('click',function(){
    closeModal('chamDisconnectModal');
    chamCleanupOnline();
    chamGoto_('online');
  });

  function chamIsConnected(seat){ return seat===0 || chamState.connected[seat]!==false; }
  function chamActiveCount(){
    var n=0;
    for(var s=0;s<chamState.players.length;s++){ if(chamState.players[s] && chamIsConnected(s)) n++; }
    return n;
  }

  /* ----- room creation (host) ----- */
  $('chamCreateRoomBtn').addEventListener('click',function(){
    chamMyName=$('chamName').value.trim()||'Joueur';
    chamMyColor=chamSelectedColor;
    chamCleanupOnline();
    net.host(function(code){
      chamNetRole='host'; chamMySeat=0;
      chamCurrentRoomCode=code;
      chamState.players=[{name:chamMyName,color:chamMyColor}];
      chamState.scores=[0];
      chamState.connected=[true];
      chamState.clientIds=[net.clientId];
      chamState.phase='lobby';
      chamGameStarted=false;
      try{ history.replaceState(null,'','#cameleon?room='+code); }catch(e){}
      $('chamCodeDisplay').textContent=code;
      chamRenderLobby();
      chamGoto_('lobby');
    });
    sfxToggle();
  });

  function chamPickAvailableColor(preferred, exceptSeat){
    var used=chamState.players.map(function(p,i){ return (p && i!==exceptSeat)?p.color:null; });
    if(preferred && used.indexOf(preferred)===-1) return preferred;
    for(var i=0;i<CHAM_PALETTE.length;i++){ if(used.indexOf(CHAM_PALETTE[i])===-1) return CHAM_PALETTE[i]; }
    return CHAM_PALETTE[Math.floor(Math.random()*CHAM_PALETTE.length)];
  }

  /* ----- host: seats ----- */
  function chamHostOnJoinRequest(msg){
    for(var s=1;s<chamState.clientIds.length;s++){
      if(msg.clientId && chamState.clientIds[s]===msg.clientId && chamState.players[s]) return s;
    }
    if(chamActiveCount()>=8) return 'SALLE COMPLÈTE (8/8)';
    return Math.max(1, chamState.players.length);
  }
  function chamHostOnSeatJoined(seat, msg, isRepeat){
    var p=chamState.players[seat];
    if(p){
      if(msg.name) p.name=msg.name;
    } else {
      p=chamState.players[seat]={name:msg.name||'Joueur', color:chamPickAvailableColor(msg.color, seat)};
      chamState.scores[seat]=0;
    }
    chamState.clientIds[seat]=msg.clientId||null;
    chamState.connected[seat]=true;
    net.sendTo(seat, {type:'seat_assigned', seat:seat, color:p.color,
      players:chamState.players.slice(), scores:chamState.scores.slice(), connected:chamState.connected.slice(),
      inRound: chamIsRoundLive()});
    if(chamIsRoundLive() && chamState.roundSeats.indexOf(seat)!==-1) chamHostSendResync(seat);
    else if(chamState.phase==='result' && chamState.lastPhaseMsg) net.sendTo(seat, chamState.lastPhaseMsg);
    chamBroadcastLobby();
    if(!isRepeat) sfxValidate();
  }
  function chamHostOnSeatLost(seat){
    if(!chamGameStarted){
      /* avant la première manche, la place est simplement libérée */
      chamState.players[seat]=null;
      chamState.clientIds[seat]=null;
      chamBroadcastLobby();
      return;
    }
    chamState.connected[seat]=false;
    chamBroadcastLobby();
    chamHostHandleRoundDeparture(seat);
  }
  function chamHostOnGuestMessage(seat, msg){
    switch(msg.type){
      case 'stroke_start':
      case 'stroke_points':
      case 'stroke_end':
        /* seul le joueur dont c'est le tour peut dessiner, et l'hôte
           réécrit la place/couleur plutôt que de faire confiance au message */
        if(chamState.phase!=='drawing' || seat!==chamState.currentTurnSeat) return;
        if(msg.type!=='stroke_start' && !chamLiveStrokes[seat]) return;
        msg.seat=seat;
        if(msg.type==='stroke_start') msg.color=chamState.players[seat].color;
        chamHandleNetMessage(msg);
        net.sendToAllExcept(msg, seat);
        return;
      case 'vote_cast':
        msg.voter=seat;
        chamHandleVoteCast(msg);
        return;
      case 'chameleon_guess_submit':
        if(chamState.phase==='guess' && seat===chamState.chameleonSeat) chamHostResolveGuess(msg.text);
        return;
    }
  }
  function chamBroadcastLobby(){
    net.sendToAll({type:'lobby_update', players:chamState.players.slice(), scores:chamState.scores.slice(), connected:chamState.connected.slice(), inRound:chamIsRoundLive()});
    chamRenderLobby();
    chamRefreshBanner();
  }
  function chamIsRoundLive(){
    return chamState.phase==='drawing' || chamState.phase==='voting' || chamState.phase==='guess';
  }

  /* Un joueur de la manche est parti : la manche continue si possible. */
  function chamHostHandleRoundDeparture(seat){
    if(!chamIsRoundLive() || chamState.roundSeats.indexOf(seat)===-1) return;
    /* la manche continue tant qu'au moins 2 joueurs sont là (le joueur
       parti peut revenir : il retrouve sa place et son rôle) */
    var still=chamState.roundSeats.filter(chamIsConnected).length;
    if(still<2){
      chamBroadcast({type:'round_aborted', reason:'Trop de joueurs se sont déconnectés.'});
      return;
    }
    if(chamState.phase==='drawing' && chamState.currentTurnSeat===seat){
      /* on garde la partie du trait déjà reçue, puis on passe au suivant */
      if(chamLiveStrokes[seat]){ chamBroadcast({type:'stroke_end', seat:seat}); }
      else { chamHostAdvanceTurn(seat); }
    } else if(chamState.phase==='voting'){
      chamHostCheckVotes();
    } else if(chamState.phase==='guess' && seat===chamState.chameleonSeat){
      if(chamGuessTimer) clearTimeout(chamGuessTimer);
      chamGuessTimer=setTimeout(function(){
        chamGuessTimer=null;
        if(chamState.phase==='guess' && !chamIsConnected(chamState.chameleonSeat)) chamHostResolveGuess('');
      }, CHAM_GUESS_GRACE);
    }
  }
  /* Remet un joueur revenu en cours de manche au bon écran. */
  function chamHostSendResync(seat){
    var isCham=seat===chamState.chameleonSeat;
    net.sendTo(seat, {type:'role_info', theme:chamState.theme, word:isCham?null:chamState.word, isChameleon:isCham, roundSeats:chamState.roundSeats.slice()});
    net.sendTo(seat, {type:'sync_strokes', strokes:chamState.strokes});
    if(chamState.phase==='drawing'){
      net.sendTo(seat, {type:'turn_start', seat:chamState.currentTurnSeat, turnIndex:chamState.turnPointer, totalTurns:chamState.turnQueue.length,
        ms:chamLeft(), total:CHAM_TURN_MS});
    } else if(chamState.lastPhaseMsg){
      var m=chamState.lastPhaseMsg, copy={};
      for(var k in m) copy[k]=m[k];
      copy.ms=chamLeft();
      if(m.type==='vote_phase_start'){
        copy.alreadyVoted=chamState.votes.hasOwnProperty(seat);
        copy.voted=Object.keys(chamState.votes).map(Number);
      }
      net.sendTo(seat, copy);
    }
  }

  /* ----- join (guest) ----- */
  $('chamJoinCode').addEventListener('keydown',function(e){
    if(e.key==='Enter'){ e.preventDefault(); $('chamJoinRoomBtn').click(); }
  });
  $('chamJoinRoomBtn').addEventListener('click',function(){
    chamMyName=$('chamName').value.trim()||'Joueur';
    chamMyColor=chamSelectedColor;
    var code=$('chamJoinCode').value.trim().toUpperCase();
    if(!code){ shake($('chamJoinCode')); return; }
    chamCleanupOnline();
    chamNetRole='guest';
    net.join(code, {name:chamMyName, color:chamMyColor});
    sfxToggle();
  });

  $('chamCopyCodeBtn').addEventListener('click',function(){ copyText(chamCurrentRoomCode, $('chamCopyCodeBtn')); });
  $('chamCopyLinkBtn').addEventListener('click',function(){
    var url=location.origin+location.pathname+'#cameleon?room='+chamCurrentRoomCode;
    copyText(url, $('chamCopyLinkBtn'));
  });

  /* ----- lobby ----- */
  var chamRoundLiveForLobby=false;
  function chamRenderLobby(){
    var list=$('chamPlayerList');
    var html='';
    for(var i=0;i<chamState.players.length;i++){
      var p=chamState.players[i];
      if(!p) continue;
      var off=!chamIsConnected(i);
      html+='<div class="cham-player-row filled'+(off?' offline':'')+'"><span class="cham-player-dot" style="background:'+p.color+';"></span><span class="cham-player-name">'+escapeHtml(p.name)+(i===chamMySeat?' (toi)':'')+(off?' — déconnecté(e)':'')+'</span><span class="cham-vote-count">'+(chamState.scores[i]||0)+' pts</span></div>';
    }
    list.innerHTML=html;
    var count=chamActiveCount();
    var statusEl=$('chamLobbyStatus');
    var live = chamNetRole==='host' ? chamIsRoundLive() : chamRoundLiveForLobby;
    if(live){
      statusEl.textContent="Une manche est en cours — tu joueras dès la prochaine.";
    } else if(count<3){
      statusEl.textContent=count+' joueur(s) connecté(s) — 3 minimum pour lancer la partie.';
    } else {
      statusEl.textContent = chamNetRole==='host' ? (count+' joueurs prêts. Tu peux lancer la partie !') : (count+" joueurs prêts. En attente que l'hôte lance la partie...");
    }
    $('chamStartBtn').style.display = (chamNetRole==='host' && count>=3 && !live) ? 'inline-block' : 'none';
  }
  $('chamStartBtn').addEventListener('click',function(){
    sfxValidate();
    if(!chamGameStarted){ chamState.pool=shuffle(chamState.wordBank.slice()); }
    chamGameStarted=true;
    chamHostStartRound();
  });

  /* ----- round flow (host authoritative) ----- */
  function chamHostStartRound(){
    var activeSeats=[];
    for(var i=0;i<chamState.players.length;i++){ if(chamState.players[i] && chamIsConnected(i)) activeSeats.push(i); }
    if(activeSeats.length<3){
      chamState.phase='lobby_wait';
      if(chamState.round) chamBroadcast({type:'round_aborted', reason:'il faut 3 joueurs connectés pour continuer.'});
      else { chamRenderLobby(); chamGoto_('lobby'); }
      chamSetNetStatus('error','3 JOUEURS CONNECTÉS MINIMUM');
      return;
    }
    chamSetNetStatus('connected','PARTIE EN COURS');
    if(chamState.pool.length===0){ chamState.pool=shuffle(chamState.wordBank.slice()); }
    var entry=chamState.pool.pop();
    var word=entry.words[Math.floor(Math.random()*entry.words.length)];
    if(chamGuessTimer){ clearTimeout(chamGuessTimer); chamGuessTimer=null; }
    chamState.theme=entry.theme;
    chamState.word=word;
    chamState.chameleonSeat=activeSeats[Math.floor(Math.random()*activeSeats.length)];
    chamState.roundSeats=activeSeats.slice();
    chamState.strokes=[];
    chamState.votes={};
    chamState.lastPhaseMsg=null;
    chamLiveStrokes={};
    chamState.turnQueue=activeSeats.slice().concat(activeSeats.slice());
    chamState.turnPointer=0;
    chamState.phase='drawing';
    chamState.round=(chamState.round||0)+1;

    activeSeats.forEach(function(s){
      var isCham=s===chamState.chameleonSeat;
      var payload={type:'role_info', theme:chamState.theme, word:isCham?null:chamState.word, isChameleon:isCham, roundSeats:activeSeats.slice()};
      if(s===0){ chamHandleNetMessage(payload); }
      else { net.sendTo(s, payload); }
    });
    /* les joueurs arrivés en cours de partie restent au lobby jusqu'à la manche suivante */
    chamBroadcastLobby();
    chamHostSendTurn();
  }
  function chamHostSendTurn(){
    /* on saute les joueurs déconnectés */
    while(chamState.turnPointer<chamState.turnQueue.length && !chamIsConnected(chamState.turnQueue[chamState.turnPointer])){
      chamState.turnPointer++;
    }
    if(chamState.turnPointer>=chamState.turnQueue.length){ chamHostStartVoting(); return; }
    var seat=chamState.turnQueue[chamState.turnPointer], ptr=chamState.turnPointer;
    chamSetPhaseTimer(CHAM_TURN_MS, function(){ chamHostTurnTimeout(seat, ptr); });
    chamBroadcast({type:'turn_start', seat:seat, turnIndex:chamState.turnPointer, totalTurns:chamState.turnQueue.length,
      ms:CHAM_TURN_MS, total:CHAM_TURN_MS});
  }
  /* temps écoulé : on garde ce qui a déjà été tracé et on passe au suivant */
  function chamHostTurnTimeout(seat, ptr){
    if(chamState.phase!=='drawing' || chamState.turnPointer!==ptr) return;
    if(seat===chamMySeat && chamDrawing) chamFinishMyStroke();
    else if(chamLiveStrokes[seat]) chamBroadcast({type:'stroke_end', seat:seat});
    else chamHostAdvanceTurn(seat);
  }
  function chamHostAdvanceTurn(finishedSeat){
    if(chamState.phase!=='drawing' || chamState.turnQueue[chamState.turnPointer]!==finishedSeat) return;
    chamState.turnPointer++;
    chamHostSendTurn();
  }
  function chamHostStartVoting(){
    chamState.phase='voting';
    /* la liste de traits de l'hôte fait foi : tout le monde vote sur le même dessin */
    chamSetPhaseTimer(CHAM_VOTE_MS, function(){ if(chamState.phase==='voting') chamHostResolveVotes(); });
    var msg={type:'vote_phase_start', strokes:chamState.strokes, ms:CHAM_VOTE_MS, total:CHAM_VOTE_MS};
    chamState.lastPhaseMsg=msg;
    chamBroadcast(msg);
  }

  /* ----- incoming message dispatcher ----- */
  function chamHandleNetMessage(msg){
    if(!msg || !msg.type) return;
    switch(msg.type){
      case 'room_full':
        chamSetNetStatus('error', msg.reason||'SALLE COMPLÈTE (8/8)');
        break;
      case 'seat_assigned':
        chamMySeat=msg.seat;
        chamCurrentRoomCode=net.code;
        chamState.players=msg.players.slice();
        chamState.scores=(msg.scores||[]).slice();
        chamState.connected=(msg.connected||[]).slice();
        chamMyColor=msg.color;
        chamRoundLiveForLobby=!!msg.inRound;
        chamGameStarted=false;
        chamInRound=false;
        $('chamCodeDisplay').textContent=chamCurrentRoomCode;
        chamRenderLobby();
        chamGoto_('lobby');
        break;
      case 'lobby_update':
        chamState.players=msg.players.slice();
        if(msg.scores) chamState.scores=msg.scores.slice();
        if(msg.connected) chamState.connected=msg.connected.slice();
        chamRoundLiveForLobby=!!msg.inRound;
        chamRenderLobby();
        chamRefreshBanner();
        break;
      case 'role_info':
        chamGameStarted=true;
        chamInRound=true;
        chamState.theme=msg.theme;
        chamState.myWord=msg.word;
        chamState.amChameleon=msg.isChameleon;
        chamState.roundSeats=(msg.roundSeats||[]).slice();
        /* nouvelle manche : on repart d'une toile vide (avant, les invités
           gardaient les traits des manches précédentes) */
        if(chamNetRole!=='host'){ chamState.strokes=[]; chamState.votes={}; }
        chamLiveStrokes={};
        chamDrawing=false;
        chamHasDrawnThisTurn=false;
        chamState.currentTurnSeat=-1;
        chamRenderRoleCard();
        chamPrepareCanvas();
        chamGoto_('canvas');
        chamRefreshBanner();
        break;
      case 'sync_strokes':
        if(!chamInRound) break;
        chamState.strokes=msg.strokes.slice();
        if(chamCtx) chamRedrawAll(chamCtx);
        break;
      case 'turn_start':
        if(!chamInRound) break;
        /* tour coupé par le chrono pendant qu'on dessinait : l'hôte a déjà clos le trait */
        if(chamDrawing && msg.seat!==chamMySeat){ chamDrawing=false; chamCurrentPoints=[]; }
        chamState.currentTurnSeat=msg.seat;
        chamHasDrawnThisTurn=false;
        chamUpdateTurnUI(msg.turnIndex, msg.totalTurns);
        chamTurnBar.start(msg.ms||CHAM_TURN_MS, msg.total||CHAM_TURN_MS);
        break;
      case 'stroke_start': if(chamInRound) chamHandleStrokeStart(msg); break;
      case 'stroke_points': if(chamInRound) chamHandleStrokePoints(msg); break;
      case 'stroke_end': if(chamInRound) chamHandleStrokeEnd(msg); break;
      case 'vote_phase_start':
        if(!chamInRound) break;
        if(msg.strokes) chamState.strokes=msg.strokes.slice();
        chamTurnBar.stop();
        chamShowVoting(!!msg.alreadyVoted);
        chamRenderVoteCount(msg.voted||[]);
        chamVoteBar.start(msg.ms||CHAM_VOTE_MS, msg.total||CHAM_VOTE_MS);
        break;
      case 'vote_status': if(chamInRound) chamRenderVoteCount(msg.voted); break;
      case 'vote_result':
        if(!chamInRound) break;
        chamVoteBar.stop();
        chamShowVoteResult(msg);
        chamGuessBar.start(msg.ms||CHAM_GUESS_MS, msg.total||CHAM_GUESS_MS);
        break;
      case 'game_result':
        if(msg.scores) chamState.scores=msg.scores.slice();
        chamShowResult(msg);
        break;
      case 'round_aborted':
        chamRoundLiveForLobby=false;
        chamInRound=false;
        chamDrawing=false;
        chamStopBars();
        if(chamNetRole==='host'){ chamState.phase='lobby_wait'; clearTimeout(chamPhaseTimer); chamPhaseTimer=null; }
        chamRenderLobby();
        chamGoto_('lobby');
        $('chamLobbyStatus').textContent='⚠ Manche annulée : '+msg.reason;
        chamHideBanner();
        break;
      case 'room_closed':
        net.close();
        chamShowLostModal("L'hôte a fermé la salle.");
        break;
    }
  }

  /* ----- role & canvas ----- */
  function chamRenderRoleCard(){
    var card=$('chamRoleCard');
    if(chamState.amChameleon){
      card.className='cham-role-card chameleon';
      $('chamRoleTheme').textContent='THÈME : '+chamState.theme;
      $('chamRoleWord').innerHTML='<span class="cham-role-chameleon-text">🦎 TU ES LE CAMÉLÉON</span>';
    } else {
      card.className='cham-role-card';
      $('chamRoleTheme').textContent='THÈME : '+chamState.theme;
      $('chamRoleWord').textContent=chamState.myWord;
    }
  }
  function chamPrepareCanvas(){
    if(!chamCanvasEl){
      chamCanvasEl=$('chamCanvas');
      chamCtx=chamCanvasEl.getContext('2d');
      chamWireCanvasEvents();
    }
    chamCtx.clearRect(0,0,CHAM_W,CHAM_H);
    $('chamActivePalette').style.display='none';
    $('chamTurnBanner').textContent='PRÉPARATION...';
    $('chamTurnBanner').className='cham-turn-banner';
    $('chamProgress').textContent='';
  }
  function chamIsMyTurn(){ return chamGameStarted && chamState.currentTurnSeat===chamMySeat && !chamHasDrawnThisTurn; }
  function chamMyDrawColor(){
    var me=chamState.players[chamMySeat];
    return me?me.color:chamMyColor;
  }
  function chamUpdateTurnUI(turnIndex, totalTurns){
    var seat=chamState.currentTurnSeat;
    var p=chamState.players[seat];
    var banner=$('chamTurnBanner');
    var mine=seat===chamMySeat;
    banner.className='cham-turn-banner'+(mine?' mine':'');
    banner.textContent = mine ? '✏️ À TOI DE DESSINER !' : ('AU TOUR DE '+(p?p.name:'?')+' DE DESSINER');
    $('chamProgress').textContent='Trait '+(turnIndex+1)+' / '+totalTurns;
    if(chamCanvasEl) chamCanvasEl.classList.toggle('readonly', !mine);
    $('chamActivePalette').style.display = mine ? 'flex' : 'none';
    if(mine){
      var wrap=$('chamActivePalette');
      wrap.innerHTML='';
      var dot=document.createElement('div');
      dot.className='cham-color-dot selected';
      dot.style.background=chamMyDrawColor();
      dot.title='Ta couleur';
      wrap.appendChild(dot);
    }
  }

  /* ----- drawing (pointer events) ----- */
  function chamWireCanvasEvents(){
    chamCanvasEl.addEventListener('pointerdown', chamPointerDown);
    chamCanvasEl.addEventListener('pointermove', chamPointerMove);
    chamCanvasEl.addEventListener('pointerup', chamPointerUp);
    chamCanvasEl.addEventListener('pointercancel', chamPointerUp);
    chamCanvasEl.addEventListener('lostpointercapture', function(evt){ if(chamDrawing) chamPointerUp(evt); });
  }
  function chamPointerDown(evt){
    if(!chamIsMyTurn() || chamDrawing) return;
    if(evt.button!==undefined && evt.button>0) return;
    chamDrawing=true;
    var p=chamGetCanvasPoint(evt, chamCanvasEl);
    chamCurrentPoints=[p];
    chamLastSentIdx=0;
    chamLastSendTime=0;
    try{ chamCanvasEl.setPointerCapture(evt.pointerId); }catch(e){}
    chamSend({type:'stroke_start', seat:chamMySeat, color:chamMyDrawColor()});
    chamDrawSegment(chamCtx, p, p, chamMyDrawColor());
    chamFlushStrokePoints();
    evt.preventDefault();
  }
  function chamPointerMove(evt){
    if(!chamDrawing) return;
    /* les événements fusionnés par le navigateur donnent un trait plus fidèle */
    var evts=(evt.getCoalescedEvents && evt.getCoalescedEvents().length) ? evt.getCoalescedEvents() : [evt];
    for(var i=0;i<evts.length;i++){
      var p=chamGetCanvasPoint(evts[i], chamCanvasEl);
      var prev=chamCurrentPoints[chamCurrentPoints.length-1];
      if(prev && prev.x===p.x && prev.y===p.y) continue;
      chamCurrentPoints.push(p);
      chamDrawSegment(chamCtx, prev, p, chamMyDrawColor());
    }
    if(Date.now()-chamLastSendTime>50){ chamFlushStrokePoints(); }
    evt.preventDefault();
  }
  function chamPointerUp(evt){
    if(!chamDrawing) return;
    try{ chamCanvasEl.releasePointerCapture(evt.pointerId); }catch(e){}
    chamFinishMyStroke();
  }
  function chamFinishMyStroke(){
    chamDrawing=false;
    chamHasDrawnThisTurn=true;
    chamFlushStrokePoints();
    chamSend({type:'stroke_end', seat:chamMySeat});
    if(chamNetRole==='host'){
      chamState.strokes.push({seat:chamMySeat, color:chamMyDrawColor(), points:chamCurrentPoints.slice()});
      chamRedrawAll(chamCtx);
      chamHostAdvanceTurn(chamMySeat);
    }
    chamCurrentPoints=[];
  }
  function chamFlushStrokePoints(){
    if(chamLastSentIdx<chamCurrentPoints.length){
      var pts=chamCurrentPoints.slice(chamLastSentIdx);
      chamSend({type:'stroke_points', seat:chamMySeat, points:pts});
      chamLastSentIdx=chamCurrentPoints.length;
      chamLastSendTime=Date.now();
    }
  }
  /* Traits des autres joueurs, reçus en direct. Le trait de l'invité qui
     dessine lui revient aussi via l'hôte (stroke_end) pour que chacun ait
     exactement la même liste. */
  function chamHandleStrokeStart(msg){
    chamLiveStrokes[msg.seat]={color:msg.color, lastPoint:null, allPoints:[]};
  }
  function chamHandleStrokePoints(msg){
    var live=chamLiveStrokes[msg.seat];
    if(!live) return;
    for(var i=0;i<msg.points.length;i++){
      var p=msg.points[i];
      chamDrawSegment(chamCtx, live.lastPoint||p, p, live.color);
      live.lastPoint=p;
      live.allPoints.push(p);
    }
  }
  function chamHandleStrokeEnd(msg){
    var live=chamLiveStrokes[msg.seat];
    if(live && live.allPoints.length){
      chamState.strokes.push({seat:msg.seat, color:live.color, points:live.allPoints});
    }
    delete chamLiveStrokes[msg.seat];
    /* on redessine depuis la liste : toutes les toiles restent identiques */
    if(chamCtx) chamRedrawAll(chamCtx);
    if(chamNetRole==='host'){
      /* l'invité qui a dessiné ne reçoit pas son propre stroke_end :
         on lui renvoie la version reçue par l'hôte */
      if(live && msg.seat!==0) net.sendTo(msg.seat, {type:'sync_strokes', strokes:chamState.strokes});
      chamHostAdvanceTurn(msg.seat);
    }
  }

  /* ----- voting ----- */
  function chamShowVoting(alreadyVoted){
    if(chamDrawing){ chamDrawing=false; chamCurrentPoints=[]; }
    var canvas=$('chamVoteCanvas');
    chamRedrawAll(canvas.getContext('2d'));
    chamRenderVoteList();
    $('chamVoteStatus').textContent= alreadyVoted ? 'Vote déjà envoyé. En attente des autres joueurs...' : 'En attente des votes...';
    if(alreadyVoted){
      var btns=$('chamVoteList').querySelectorAll('.cham-vote-btn');
      for(var i=0;i<btns.length;i++) btns[i].disabled=true;
      chamMyVoteTarget=-1;
    }
    if(chamState.roundSeats.indexOf(chamMySeat)===-1){
      $('chamVoteList').innerHTML='';
      $('chamVoteStatus').textContent='Tu observes cette manche.';
    }
    chamGoto_('voting');
    chamRefreshBanner();
  }
  function chamRenderVoteList(){
    chamMyVoteTarget=null;
    var list=$('chamVoteList');
    var html='';
    chamState.roundSeats.forEach(function(i){
      var p=chamState.players[i];
      if(!p || i===chamMySeat) return;
      html+='<div class="cham-player-row filled"><span class="cham-player-dot" style="background:'+p.color+';"></span><span class="cham-player-name">'+escapeHtml(p.name)+'</span><button class="cham-vote-btn" data-seat="'+i+'"><span>Accuser</span></button></div>';
    });
    list.innerHTML=html;
    var btns=list.querySelectorAll('.cham-vote-btn');
    for(var k=0;k<btns.length;k++){
      btns[k].addEventListener('click', function(){
        if(chamMyVoteTarget!==null) return;
        chamMyVoteTarget=parseInt(this.getAttribute('data-seat'),10);
        for(var j=0;j<btns.length;j++){ btns[j].classList.remove('voted'); }
        this.classList.add('voted');
        chamCastVote(chamMyVoteTarget);
        chamRenderVoteCount(chamVotedSeats);
        sfxValidate();
      });
    }
  }
  var chamVotedSeats=[];
  function chamRenderVoteCount(voted){
    chamVotedSeats=voted||[];
    if(chamState.roundSeats.indexOf(chamMySeat)===-1) return;
    $('chamVoteStatus').textContent=(chamMyVoteTarget!==null?'Vote envoyé. ':'')+chamVotedSeats.length+' / '+chamState.roundSeats.length+' vote(s)';
  }
  function chamCastVote(target){
    var msg={type:'vote_cast', voter:chamMySeat, target:target};
    if(chamNetRole==='host'){ chamHandleVoteCast(msg); }
    else { chamSend(msg); }
  }
  function chamHandleVoteCast(msg){
    if(chamNetRole!=='host' || chamState.phase!=='voting') return;
    var rs=chamState.roundSeats;
    if(rs.indexOf(msg.voter)===-1 || rs.indexOf(msg.target)===-1 || msg.voter===msg.target) return;
    if(chamState.votes.hasOwnProperty(msg.voter)) return;
    chamState.votes[msg.voter]=msg.target;
    chamBroadcast({type:'vote_status', voted:Object.keys(chamState.votes).map(Number)});
    chamHostCheckVotes();
  }
  /* tous les joueurs encore connectés de la manche ont voté ? */
  function chamHostCheckVotes(){
    if(chamState.phase!=='voting') return;
    var pending=chamState.roundSeats.filter(function(s){
      return chamIsConnected(s) && !chamState.votes.hasOwnProperty(s);
    });
    if(pending.length===0) chamHostResolveVotes();
  }
  function chamHostResolveVotes(){
    clearTimeout(chamPhaseTimer); chamPhaseTimer=null;
    var activeSeats=chamState.roundSeats.slice();
    var tally={};
    activeSeats.forEach(function(s){ tally[s]=0; });
    Object.keys(chamState.votes).forEach(function(voterSeat){
      var target=chamState.votes[voterSeat];
      if(tally.hasOwnProperty(target)){ tally[target]++; }
    });
    var maxVotes=-1, leaders=[];
    activeSeats.forEach(function(s){
      if(tally[s]>maxVotes){ maxVotes=tally[s]; leaders=[s]; }
      else if(tally[s]===maxVotes){ leaders.push(s); }
    });
    var accusedSeat=leaders[Math.floor(Math.random()*leaders.length)];
    var wasChameleon=accusedSeat===chamState.chameleonSeat;
    if(!wasChameleon){
      chamHostFinishRound('chameleon', null, accusedSeat, tally);
      return;
    }
    chamState.phase='guess';
    chamSetPhaseTimer(CHAM_GUESS_MS, function(){ if(chamState.phase==='guess') chamHostResolveGuess(''); });
    var msg={type:'vote_result', tally:tally, accusedSeat:accusedSeat, wasChameleon:true, ms:CHAM_GUESS_MS, total:CHAM_GUESS_MS};
    chamState.lastPhaseMsg=msg;
    chamBroadcast(msg);
    /* démasqué alors qu'il est déjà parti : on lui laisse le temps de revenir */
    if(!chamIsConnected(accusedSeat)) chamHostHandleRoundDeparture(accusedSeat);
  }
  function chamShowVoteResult(msg){
    if(msg.wasChameleon){
      var accusedName=(chamState.players[msg.accusedSeat]||{}).name||'?';
      $('chamGuessSubtitle').textContent=accusedName+' est démasqué(e) ! Dernière chance : deviner le mot secret.';
      var amAccused=msg.accusedSeat===chamMySeat;
      $('chamGuessSelfBox').style.display=amAccused?'block':'none';
      $('chamGuessWaitBox').style.display=amAccused?'none':'block';
      $('chamGuessInput').value='';
      $('chamGuessSubmitBtn').disabled=false;
      chamGoto_('guess');
      chamRefreshBanner();
    }
  }

  /* ----- chameleon's final guess ----- */
  $('chamGuessInput').addEventListener('keydown',function(e){
    if(e.key==='Enter'){ e.preventDefault(); $('chamGuessSubmitBtn').click(); }
  });
  $('chamGuessSubmitBtn').addEventListener('click',function(){
    var guess=$('chamGuessInput').value.trim();
    if(!guess){ shake($('chamGuessInput')); return; }
    this.disabled=true;
    sfxValidate();
    if(chamNetRole==='host'){ chamHostResolveGuess(guess); }
    else { chamSend({type:'chameleon_guess_submit', text:guess}); }
  });
  function chamHostResolveGuess(guessText){
    if(chamState.phase!=='guess') return;
    if(chamGuessTimer){ clearTimeout(chamGuessTimer); chamGuessTimer=null; }
    /* insensible à la casse, aux accents et à la ponctuation */
    var correct = !!guessText && CG.normalizeWord(guessText)===CG.normalizeWord(chamState.word);
    chamHostFinishRound(correct ? 'chameleon' : 'innocents', guessText, chamState.chameleonSeat, null);
  }

  /* ----- result & scoring (calculés par l'hôte uniquement) ----- */
  function chamHostFinishRound(winner, guessText, accusedSeat, tally){
    clearTimeout(chamPhaseTimer); chamPhaseTimer=null;
    chamState.roundSeats.forEach(function(s){
      if(!chamState.players[s]) return;
      if(winner==='chameleon'){
        if(s===chamState.chameleonSeat) chamState.scores[s]=(chamState.scores[s]||0)+2;
      } else {
        if(s!==chamState.chameleonSeat) chamState.scores[s]=(chamState.scores[s]||0)+1;
      }
    });
    chamState.phase='result';
    var result={type:'game_result', winner:winner, word:chamState.word, theme:chamState.theme,
      chameleonSeat:chamState.chameleonSeat, chameleonName:(chamState.players[chamState.chameleonSeat]||{}).name,
      guessText:guessText, accusedSeat:accusedSeat, tally:tally,
      scores:chamState.scores.slice(), strokes:chamState.strokes};
    chamState.lastPhaseMsg=result;
    chamBroadcast(result);
    chamBroadcastLobby();
  }
  function chamShowResult(msg){
    chamStopBars();
    if(msg.strokes) chamState.strokes=msg.strokes.slice();
    var canvas=$('chamResultCanvas');
    chamRedrawAll(canvas.getContext('2d'));

    var chamWon = msg.winner==='chameleon';
    var bannerEl=$('chamResultBanner');
    bannerEl.textContent = chamWon ? '🦎 LE CAMÉLÉON GAGNE !' : '🎉 LES INNOCENTS GAGNENT !';
    bannerEl.className='cham-result-banner '+(chamWon?'b-fail':'b-perfect');

    var detail;
    if(msg.guessText){
      detail=escapeHtml(msg.chameleonName||'?')+' a tenté « '+escapeHtml(msg.guessText)+' » — '+(chamWon?'bonne réponse !':'mauvaise réponse.');
    } else if(msg.accusedSeat===msg.chameleonSeat){
      detail=escapeHtml(msg.chameleonName||'?')+" a été démasqué(e) mais n'a pas proposé de mot.";
    } else {
      detail=escapeHtml(msg.chameleonName||'?')+" n'a pas été démasqué(e), ou la mauvaise personne a été accusée.";
    }
    $('chamWordReveal').innerHTML='Thème <b>'+escapeHtml(msg.theme)+'</b> — le mot était <b>'+escapeHtml(msg.word)+'</b><br>'+detail;

    var html='';
    for(var i=0;i<chamState.players.length;i++){
      var p=chamState.players[i];
      if(!p) continue;
      html+='<div class="cham-player-row filled'+(chamIsConnected(i)?'':' offline')+'"><span class="cham-player-dot" style="background:'+p.color+';"></span><span class="cham-player-name">'+escapeHtml(p.name)+(i===msg.chameleonSeat?' 🦎':'')+'</span><span class="cham-vote-count">'+(chamState.scores[i]||0)+' pts</span></div>';
    }
    $('chamScoreList').innerHTML=html;

    var nextBtn=$('chamNextRoundBtn');
    var waitLabel=$('chamWaitingHostLabel');
    if(chamNetRole==='host'){
      nextBtn.style.display='inline-block';
      waitLabel.style.display='none';
      nextBtn.onclick=function(){ sfxToggle(); chamHostStartRound(); };
    } else {
      nextBtn.style.display='none';
      waitLabel.style.display='inline-block';
      waitLabel.textContent="⏳ En attente que l'hôte lance une nouvelle manche...";
    }

    sfxReveal(chamWon?0:100);
    chamHideBanner();
    chamGoto_('result');
  }

  /* ---------- API pour le hub ---------- */
  CG.cameleon = {
    reset: function(){
      if(chamNetRole) chamCleanupOnline();
      closeModal('chamDisconnectModal');
      chamGoto_('online');
    },
    enterJoinFlow: function(code){
      chamGoto_('online');
      $('chamJoinCode').value = decodeURIComponent(code).toUpperCase();
    }
  };

  chamRenderColorPicker();
})();
