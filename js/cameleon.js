/* Le Caméléon — dessin partagé + déduction sociale (3 à 8 joueurs en ligne). */
(function(){
  'use strict';
  var CG=window.CG;
  var $=CG.$, escapeHtml=CG.escapeHtml, shuffle=CG.shuffle, shake=CG.shake, openModal=CG.openModal, closeModal=CG.closeModal;
  var sfxToggle=CG.sfxToggle, sfxValidate=CG.sfxValidate, sfxReveal=CG.sfxReveal, copyText=CG.copyText;
  var CHAM_ROOM_PREFIX = 'cgcameleon-';
  /* couleurs bien lisibles sur la toile crème (le blanc et le jaune ne se voyaient presque pas) */
  var CHAM_PALETTE = ['#E60012','#111111','#2E6FF2','#1f9e3a','#8e44ec','#ff7a00','#e0389b','#0aa3b5'];
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
  var chamTurnDone=false;       /* j'ai terminé mon tour (bouton, encre vide ou chrono) */
  var chamPointerId=null;       /* un seul doigt dessine : les autres contacts sont ignorés */
  /* Plusieurs traits par tour, limités par une jauge d'encre (longueur totale
     dans le repère 800x500). chamInk = encre du tour en cours, telle que la voit
     tout le monde ; chamMyInk = compteur local du joueur qui dessine. */
  var CHAM_INK=1100, CHAM_DOT_INK=10, CHAM_INK_EPS=8;
  var chamInk={seat:-1, used:0}, chamMyInk=0;
  var chamInRound=false;        /* ce joueur participe à la manche en cours */
  var chamMyVoteTarget=null;
  var chamGuessTimer=null;
  var CHAM_GUESS_GRACE=30000;   /* délai laissé au Caméléon démasqué pour revenir */
  /* limites de temps : sans elles, un joueur inactif bloquait toute la manche */
  var CHAM_TURN_MS=35000, CHAM_VOTE_MS=60000, CHAM_GUESS_MS=45000;
  var chamPhaseTimer=null, chamDeadline=0;
  /* repli si un ancien common.js est encore en cache : le jeu doit se charger quand même */
  var timerBar=CG.timerBar||function(){ return {start:function(){}, stop:function(){}}; };
  var chamTurnBar=timerBar('chamTurnTimerFill','chamTurnTimerText');
  var chamVoteBar=timerBar('chamVoteTimerFill','chamVoteTimerText');
  var chamGuessBar=timerBar('chamGuessTimerFill','chamGuessTimerText');
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
    var wantedCode=CG.readRoomCode('chamHostCode');
    if(!wantedCode){ sfxToggle(); return; }
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
    }, wantedCode);
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
      case 'turn_done':
        chamHostOnStrokeMsg(seat, msg);
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
      chamHostEndTurn(seat);
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
        ms:chamLeft(), total:CHAM_TURN_MS, ink:CHAM_INK, used:chamInk.used});
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
    var code=CG.cleanRoomCode($('chamJoinCode').value);
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
      ms:CHAM_TURN_MS, total:CHAM_TURN_MS, ink:CHAM_INK, used:0});
  }
  /* temps écoulé : on garde ce qui a déjà été tracé et on passe au suivant */
  function chamHostTurnTimeout(seat, ptr){
    if(chamState.phase!=='drawing' || chamState.turnPointer!==ptr) return;
    if(seat===chamMySeat && chamDrawing) chamEndMyStroke();
    chamHostEndTurn(seat);
  }
  /* fin du tour de « seat » : on valide le trait en cours puis on passe au suivant */
  function chamHostEndTurn(seat){
    if(chamState.phase!=='drawing' || chamState.turnQueue[chamState.turnPointer]!==seat) return;
    if(chamLiveStrokes[seat]) chamHostCommitStroke(seat);
    chamState.turnPointer++;
    chamHostSendTurn();
  }
  /* Tous les messages de dessin (ceux des invités ET ceux de l'hôte) passent
     par ici. L'hôte fait foi : il réécrit place et couleur, compte l'encre,
     puis renvoie à tout le monde la liste complète des traits validés. */
  function chamHostOnStrokeMsg(seat, msg){
    if(chamState.phase!=='drawing' || seat!==chamState.currentTurnSeat) return;
    if(msg.type==='turn_done'){ chamHostEndTurn(seat); return; }
    if(msg.type==='stroke_start'){
      if(chamLiveStrokes[seat]) chamHostCommitStroke(seat);    /* fin de trait perdue */
      if(chamInk.used>=CHAM_INK-CHAM_INK_EPS) return;
      msg={type:'stroke_start', seat:seat, color:chamState.players[seat].color};
    } else if(msg.type==='stroke_points'){
      if(!chamLiveStrokes[seat] || !Array.isArray(msg.points)) return;
      var pts=[];
      for(var i=0;i<msg.points.length && i<400;i++){
        var q=msg.points[i];
        if(!q) continue;
        pts.push({x:Math.max(0,Math.min(CHAM_W,Math.round(+q.x||0))), y:Math.max(0,Math.min(CHAM_H,Math.round(+q.y||0)))});
      }
      msg={type:'stroke_points', seat:seat, points:pts};
    } else if(msg.type==='stroke_end'){
      if(!chamLiveStrokes[seat]) return;
      chamHostCommitStroke(seat);
      if(chamInk.used>=CHAM_INK-CHAM_INK_EPS) chamHostEndTurn(seat);
      return;
    } else return;
    chamHandleNetMessage(msg);          /* l'hôte suit le trait (et l'affiche si ce n'est pas le sien) */
    net.sendToAllExcept(msg, seat);
  }
  function chamHostCommitStroke(seat){
    var live=chamLiveStrokes[seat];
    delete chamLiveStrokes[seat];
    if(live && live.allPoints.length){
      if(live.allPoints.length===1) chamInk.used=Math.min(CHAM_INK, chamInk.used+CHAM_DOT_INK);
      chamState.strokes.push({seat:seat, color:live.color, points:live.allPoints});
    }
    chamBroadcast({type:'sync_strokes', strokes:chamState.strokes, inkSeat:seat, inkUsed:chamInk.used, committed:true});
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
        chamDrawing=false; chamPointerId=null;
        chamTurnDone=false;
        chamInk={seat:-1, used:0}; chamMyInk=0;
        chamState.currentTurnSeat=-1;
        chamRenderRoleCard();
        chamPrepareCanvas();
        chamGoto_('canvas');
        chamRefreshBanner();
        break;
      case 'sync_strokes':
        if(!chamInRound) break;
        if(chamNetRole!=='host') chamState.strokes=msg.strokes.slice();
        if(msg.committed && msg.inkSeat!==chamMySeat) delete chamLiveStrokes[msg.inkSeat];
        if(msg.inkSeat===chamInk.seat && typeof msg.inkUsed==='number'){
          chamInk.used=msg.inkUsed;
          if(msg.inkSeat===chamMySeat && !chamDrawing) chamMyInk=Math.max(chamMyInk, msg.inkUsed);
        }
        chamRedrawCanvas();
        chamRenderInk();
        break;
      case 'turn_start':
        if(!chamInRound) break;
        /* tour coupé par le chrono pendant qu'on dessinait : l'hôte a déjà clos le trait */
        if(chamDrawing && msg.seat!==chamMySeat){ chamDrawing=false; chamPointerId=null; chamCurrentPoints=[]; chamRedrawCanvas(); }
        chamState.currentTurnSeat=msg.seat;
        chamTurnDone=false;
        if(msg.ink) CHAM_INK=msg.ink;
        chamInk={seat:msg.seat, used:msg.used||0};
        chamMyInk = msg.seat===chamMySeat ? (msg.used||0) : 0;
        chamUpdateTurnUI(msg.turnIndex, msg.totalTurns);
        chamTurnBar.start(msg.ms||CHAM_TURN_MS, msg.total||CHAM_TURN_MS);
        break;
      case 'stroke_start': if(chamInRound) chamHandleStrokeStart(msg); break;
      case 'stroke_points': if(chamInRound) chamHandleStrokePoints(msg); break;
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
    $('chamDoneBtn').style.display='none';
    $('chamInkWrap').style.visibility='hidden';
  }
  function chamIsMyTurn(){ return chamGameStarted && chamState.currentTurnSeat===chamMySeat && !chamTurnDone; }
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
    banner.textContent = mine ? '✏️ À TOI ! AUTANT DE TRAITS QUE TU VEUX… TANT QU’IL RESTE DE L’ENCRE' : ('AU TOUR DE '+(p?p.name:'?')+' DE DESSINER');
    $('chamProgress').textContent='Tour '+(turnIndex+1)+' / '+totalTurns;
    chamRenderMyTurnControls();
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
    chamRenderInk();
  }
  function chamRenderMyTurnControls(){
    var active=chamIsMyTurn();
    if(chamCanvasEl) chamCanvasEl.classList.toggle('readonly', !active);
    $('chamDoneBtn').style.display = active ? 'inline-block' : 'none';
  }
  /* jauge d'encre du joueur qui dessine (visible par tous) */
  function chamRenderInk(){
    var seat=chamInk.seat, wrap=$('chamInkWrap');
    if(seat<0 || chamState.currentTurnSeat!==seat){ wrap.style.visibility='hidden'; return; }
    wrap.style.visibility='visible';
    var used = seat===chamMySeat ? Math.max(chamMyInk, chamInk.used) : chamInk.used;
    var left=Math.max(0, 1-used/CHAM_INK);
    $('chamInkFill').style.width=(left*100)+'%';
    $('chamInkFill').style.background=chamState.players[seat] ? chamState.players[seat].color : '#fff';
    $('chamInkText').textContent='🖋️ ENCRE '+Math.round(left*100)+' %';
  }
  function chamMyInkLeft(){ return CHAM_INK-Math.max(chamMyInk, chamInk.used); }
  function chamDist(a,b){ var dx=a.x-b.x, dy=a.y-b.y; return Math.sqrt(dx*dx+dy*dy); }
  /* Redessine la toile en direct : traits validés par l'hôte + traits en cours
     (le mien et celui reçu en direct), pour que rien ne clignote. */
  function chamRedrawCanvas(){
    if(!chamCtx) return;
    chamRedrawAll(chamCtx);
    for(var k in chamLiveStrokes){
      if(+k===chamMySeat) continue;
      var l=chamLiveStrokes[k];
      chamDrawStroke(chamCtx, {color:l.color, points:l.allPoints});
    }
    if(chamDrawing) chamDrawStroke(chamCtx, {color:chamMyDrawColor(), points:chamCurrentPoints});
  }

  /* ----- drawing (pointer events) ----- */
  function chamWireCanvasEvents(){
    chamCanvasEl.addEventListener('pointerdown', chamPointerDown);
    chamCanvasEl.addEventListener('pointermove', chamPointerMove);
    chamCanvasEl.addEventListener('pointerup', chamPointerUp);
    chamCanvasEl.addEventListener('pointercancel', chamPointerUp);
    chamCanvasEl.addEventListener('lostpointercapture', function(evt){ if(chamDrawing && evt.pointerId===chamPointerId) chamPointerUp(evt); });
  }
  /* messages de dessin : l'hôte se les traite lui-même, les invités les envoient */
  function chamSendStroke(msg){
    if(chamNetRole==='host') chamHostOnStrokeMsg(chamMySeat, msg);
    else net.send(msg);
  }
  function chamPointerDown(evt){
    if(!chamIsMyTurn() || chamDrawing || chamMyInkLeft()<=CHAM_INK_EPS) return;
    if(evt.button!==undefined && evt.button>0) return;
    if(evt.isPrimary===false) return;
    chamDrawing=true;
    chamPointerId=evt.pointerId;
    var p=chamGetCanvasPoint(evt, chamCanvasEl);
    chamCurrentPoints=[p];
    chamLastSentIdx=0;
    chamLastSendTime=0;
    try{ chamCanvasEl.setPointerCapture(evt.pointerId); }catch(e){}
    chamSendStroke({type:'stroke_start'});
    chamDrawSegment(chamCtx, p, p, chamMyDrawColor());
    chamFlushStrokePoints();
    evt.preventDefault();
  }
  function chamPointerMove(evt){
    if(!chamDrawing || evt.pointerId!==chamPointerId) return;
    /* Les événements fusionnés donnent un trait plus fidèle, mais certains
       navigateurs mobiles les renvoient avec de mauvaises coordonnées : on ne
       les garde que s'ils restent à côté de l'événement principal. */
    var main=chamGetCanvasPoint(evt, chamCanvasEl), pts=[main];
    var co=(evt.getCoalescedEvents && evt.getCoalescedEvents()) || [];
    if(co.length>1){
      var ok=[], prev0=chamCurrentPoints[chamCurrentPoints.length-1];
      for(var i=0;i<co.length;i++){
        var c=chamGetCanvasPoint(co[i], chamCanvasEl);
        if(chamDist(c, main)>chamDist(prev0, main)+40){ ok=null; break; }
        ok.push(c);
      }
      if(ok && ok.length) pts=ok;
    }
    for(var j=0;j<pts.length && chamDrawing;j++){
      var p=pts[j];
      var prev=chamCurrentPoints[chamCurrentPoints.length-1];
      if(prev.x===p.x && prev.y===p.y) continue;
      var d=chamDist(prev,p), left=chamMyInkLeft();
      if(d>=left){
        /* plus d'encre : le trait s'arrête pile au bout de la jauge */
        var t=left/d;
        p={x:Math.round(prev.x+(p.x-prev.x)*t), y:Math.round(prev.y+(p.y-prev.y)*t)};
        chamMyInk=CHAM_INK;
        if(p.x!==prev.x || p.y!==prev.y){ chamCurrentPoints.push(p); chamDrawSegment(chamCtx, prev, p, chamMyDrawColor()); }
        chamEndMyStroke();
        chamFinishMyTurn();
        break;
      }
      chamMyInk+=d;
      chamCurrentPoints.push(p);
      chamDrawSegment(chamCtx, prev, p, chamMyDrawColor());
    }
    if(chamDrawing && Date.now()-chamLastSendTime>50){ chamFlushStrokePoints(); }
    chamRenderInk();
    evt.preventDefault();
  }
  function chamPointerUp(evt){
    if(!chamDrawing || (evt && evt.pointerId!==undefined && evt.pointerId!==chamPointerId)) return;
    try{ chamCanvasEl.releasePointerCapture(evt.pointerId); }catch(e){}
    chamEndMyStroke();
    if(chamMyInkLeft()<=CHAM_INK_EPS) chamFinishMyTurn();
  }
  /* fin d'un trait (le tour continue tant qu'il reste de l'encre) */
  function chamEndMyStroke(){
    if(!chamDrawing) return;
    chamDrawing=false; chamPointerId=null;
    if(chamCurrentPoints.length===1) chamMyInk=Math.min(CHAM_INK, chamMyInk+CHAM_DOT_INK);
    chamFlushStrokePoints();
    chamSendStroke({type:'stroke_end'});
    chamCurrentPoints=[];
    chamRenderInk();
  }
  /* « J'ai fini », ou encre épuisée */
  function chamFinishMyTurn(){
    if(chamTurnDone || chamState.currentTurnSeat!==chamMySeat) return;
    chamEndMyStroke();
    chamTurnDone=true;
    chamRenderMyTurnControls();
    chamSendStroke({type:'turn_done'});
  }
  $('chamDoneBtn').addEventListener('click',function(){ sfxValidate(); chamFinishMyTurn(); });
  function chamFlushStrokePoints(){
    if(chamLastSentIdx<chamCurrentPoints.length){
      var pts=chamCurrentPoints.slice(chamLastSentIdx);
      chamSendStroke({type:'stroke_points', points:pts});
      chamLastSentIdx=chamCurrentPoints.length;
      chamLastSendTime=Date.now();
    }
  }
  /* Traits en cours, reçus en direct (l'hôte suit aussi les siens pour compter
     l'encre, sans les redessiner). La version qui fait foi arrive ensuite avec
     sync_strokes, identique pour tout le monde. */
  function chamHandleStrokeStart(msg){
    chamLiveStrokes[msg.seat]={color:msg.color, lastPoint:null, allPoints:[]};
  }
  function chamHandleStrokePoints(msg){
    var live=chamLiveStrokes[msg.seat];
    if(!live) return;
    var mine=msg.seat===chamMySeat, host=chamNetRole==='host';
    for(var i=0;i<msg.points.length;i++){
      var p=msg.points[i];
      if(live.lastPoint){
        var d=chamDist(live.lastPoint,p);
        /* l'hôte coupe ce qui dépasse la jauge (petite marge pour les arrondis) */
        if(host && chamInk.used+d>CHAM_INK+CHAM_INK_EPS) break;
        if(msg.seat===chamInk.seat) chamInk.used=Math.min(CHAM_INK, chamInk.used+d);
      }
      if(!mine) chamDrawSegment(chamCtx, live.lastPoint||p, p, live.color);
      live.lastPoint=p;
      live.allPoints.push(p);
    }
    if(!mine) chamRenderInk();
  }

  /* ----- voting ----- */
  function chamShowVoting(alreadyVoted){
    if(chamDrawing){ chamDrawing=false; chamPointerId=null; chamCurrentPoints=[]; }
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
      $('chamJoinCode').value = CG.cleanRoomCode(decodeURIComponent(code));
    }
  };

  chamRenderColorPicker();
})();
