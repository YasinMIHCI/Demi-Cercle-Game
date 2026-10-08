/* L'Imposteur des chiffres — bluff et déduction (3 à 8 joueurs en ligne).
   Tout le monde répond par un nombre à la même question, sauf l'imposteur
   qui a reçu une autre question sans le savoir. L'hôte fait autorité :
   il tire l'imposteur, collecte les réponses et les votes, compte les points. */
(function(){
  'use strict';
  var CG=window.CG;
  var $=CG.$, escapeHtml=CG.escapeHtml, shuffle=CG.shuffle, shake=CG.shake, openModal=CG.openModal, closeModal=CG.closeModal;
  var sfxToggle=CG.sfxToggle, sfxValidate=CG.sfxValidate, sfxReveal=CG.sfxReveal, copyText=CG.copyText;

  var IMP_ROOM_PREFIX = 'p5imposteur-';
  var IMP_PALETTE = ['#E60012','#ffffff','#FFE600','#00e5ff','#ff6ec7','#ff9d2f','#7cff6e','#b388ff'];
  var IMP_BANK_KEY = 'imp_questions_v1';
  /* [question de tout le monde, question de l'imposteur] : des réponses du
     même ordre de grandeur, pour que l'imposteur puisse se fondre dans la masse */
  var IMP_DEFAULT_BANK = [
    ["Combien de cafés bois-tu par semaine ?", "Combien de fois par semaine fais-tu du sport ?"],
    ["Combien de fois es-tu allé(e) au cinéma cette année ?", "Combien de livres as-tu lus cette année ?"],
    ["Sur 10, quel est ton niveau en cuisine ?", "Sur 10, quel est ton sens de l'orientation ?"],
    ["Combien de pays as-tu visités ?", "Combien de fois as-tu déménagé ?"],
    ["Combien d'amis proches as-tu ?", "Combien de groupes de discussion as-tu sur ton téléphone ?"],
    ["Combien de minutes mets-tu pour te préparer le matin ?", "Combien de minutes dure ta douche ?"],
    ["Combien d'euros dépenses-tu pour un cadeau d'anniversaire ?", "Combien d'euros dépenses-tu pour un repas au restaurant ?"],
    ["Combien de jeux vidéo possèdes-tu ?", "Combien de paires de chaussures possèdes-tu ?"],
    ["Sur 10, à quel point aimes-tu les films d'horreur ?", "Sur 10, à quel point as-tu peur du noir ?"],
    ["Combien de minutes dure ton trajet quotidien ?", "Combien de minutes peux-tu tenir sans regarder ton téléphone ?"],
    ["Combien de fois par mois manges-tu au fast-food ?", "Combien de fois par mois appelles-tu ta famille ?"],
    ["Sur 10, à quel point es-tu mauvais(e) perdant(e) ?", "Sur 10, à quel point es-tu bavard(e) ?"],
    ["Combien de séries regardes-tu en ce moment ?", "Combien de podcasts ou chaînes suis-tu régulièrement ?"],
    ["Combien de verres d'eau bois-tu par jour ?", "Combien de fois par jour te laves-tu les mains ?"],
    ["Combien d'heures as-tu joué aux jeux vidéo cette semaine ?", "Combien d'heures as-tu passées dehors cette semaine ?"],
    ["Combien de pompes peux-tu faire d'affilée ?", "Combien de mots connais-tu en japonais ?"],
    ["Sur 10, quelle est ta résistance au piment ?", "Sur 10, quel est ton niveau en danse ?"],
    ["Combien de personnes étaient à ton dernier anniversaire ?", "Combien de personnes as-tu dans ta famille proche ?"],
    ["Combien de fois par an vas-tu chez le coiffeur ?", "Combien de fois par an prends-tu le train ?"],
    ["Quel âge aimerais-tu avoir pour toujours ?", "À quel âge penses-tu être devenu(e) adulte ?"],
    ["Combien de fois appuies-tu sur « snooze » le matin ?", "Combien de fois par jour ouvres-tu le frigo ?"],
    ["Combien d'euros paierais-tu pour un bon concert ?", "Combien d'euros paierais-tu pour un jeu vidéo neuf ?"],
    ["Combien de minutes peux-tu attendre dans une file avant de partir ?", "Combien de minutes de retard tolères-tu chez un ami ?"],
    ["Sur 10, à quel point es-tu organisé(e) ?", "Sur 10, à quel point es-tu ponctuel(le) ?"],
    ["Combien de parts de pizza peux-tu manger en une soirée ?", "Combien de parts de gâteau peux-tu manger d'affilée ?"],
    ["Combien de kilomètres peux-tu courir sans t'arrêter ?", "Combien de kilomètres marches-tu par jour ?"],
    ["Combien d'applis as-tu sur la première page de ton téléphone ?", "Combien d'onglets as-tu ouverts sur ton navigateur ?"],
    ["Combien d'heures dors-tu par nuit ?", "Combien d'heures passes-tu sur ton téléphone par jour ?"],
    ["Sur 10, à quel point es-tu fan de Persona ?", "Sur 10, à quel point aimes-tu les animes ?"],
    ["Combien de fois as-tu pleuré devant un film ?", "Combien de fois as-tu ri aux éclats cette semaine ?"]
  ];
  function impLoadBank(){
    try{
      var raw=localStorage.getItem(IMP_BANK_KEY);
      if(raw){ var arr=JSON.parse(raw); if(Array.isArray(arr)&&arr.length) return arr; }
    }catch(e){}
    return IMP_DEFAULT_BANK.slice();
  }
  function impSaveBank(){
    try{ localStorage.setItem(IMP_BANK_KEY, JSON.stringify(impState.bank)); }catch(e){}
  }

  var impState = {
    players:[], scores:[], connected:[],
    bank: impLoadBank(), pool:[],
    round:0, roundSeats:[],
    myQuestion:'', answers:{}, votes:{},
    /* host only */
    phase:'lobby',               /* 'lobby' | 'answering' | 'voting' | 'result' | 'lobby_wait' */
    question:'', imposterQuestion:'', imposterSeat:-1,
    clientIds:[], lastPhaseMsg:null
  };
  var impNetRole=null, impMySeat=0, impMyName='', impCurrentRoomCode='';
  var impGameStarted=false;     /* host: au moins une manche lancée */
  var impInRound=false;         /* ce joueur participe à la manche en cours */
  var impRoundLiveForLobby=false;
  var impMyVoteTarget=null;
  var impImposterTimer=null;
  var IMP_IMPOSTER_GRACE=30000;  /* délai laissé à l'imposteur déconnecté pour revenir */
  /* sans limite de temps, un joueur inactif bloquait la manche pour tout le monde */
  var IMP_ANSWER_MS=90000, IMP_VOTE_MS=60000;
  var impPhaseTimer=null, impDeadline=0;
  var impAnswerBar=CG.timerBar('impAnswerTimerFill','impAnswerTimerText');
  var impVoteBar=CG.timerBar('impVoteTimerFill','impVoteTimerText');
  function impLeft(){ return Math.max(0, impDeadline-Date.now()); }

  /* ----- screens ----- */
  function impGoto_(name){
    var all=document.querySelectorAll('.imp-screen');
    for(var i=0;i<all.length;i++){ all[i].classList.remove('active'); }
    $('imp-screen-'+name).classList.add('active');
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function impSetNetStatus(cls,label){
    var el=$('impNetStatus');
    el.className='net-status '+cls;
    el.querySelector('.net-label').textContent=label;
  }
  function impRenderBankCount(){
    $('impBankCount').textContent=impState.bank.length+' paires de questions';
  }

  $('impRulesBtn').addEventListener('click',function(){ openModal('impRulesModal'); sfxToggle(); });
  $('impRulesModalClose').addEventListener('click',function(){ closeModal('impRulesModal'); });
  $('impRulesModal').addEventListener('click',function(e){ if(e.target===this) closeModal('impRulesModal'); });
  $('impHubReturnBtn').addEventListener('click',function(){ sfxToggle(); location.hash='hub'; });
  $('impBackFromLobby').addEventListener('click',function(){ sfxToggle(); impCleanupOnline(); impGoto_('online'); });

  $('impAddQBtn').addEventListener('click',function(){
    var q=$('impCustomQ').value.trim(), qi=$('impCustomQImp').value.trim();
    if(!q||!qi){ shake($('impCustomQ')); return; }
    impState.bank.unshift([q,qi]);
    impSaveBank();
    $('impCustomQ').value=''; $('impCustomQImp').value='';
    impRenderBankCount();
    sfxToggle();
  });

  /* ================= RÉSEAU ================= */
  var net = CG.createRoomNet({
    prefix: IMP_ROOM_PREFIX,
    onStatus: impSetNetStatus,
    onJoinRequest: impHostOnJoinRequest,
    onSeatJoined: impHostOnSeatJoined,
    onGuestMessage: impHostOnGuestMessage,
    onSeatLost: impHostOnSeatLost,
    onHostMessage: impHandleNetMessage,
    onReconnecting: function(){ impShowBanner('📡 Connexion perdue — reconnexion en cours...'); },
    onReconnected: function(){ impHideBanner(); },
    onLost: function(){ impShowLostModal("Impossible de rétablir la connexion avec l'hôte."); }
  });
  /* l'hôte traite une copie : l'affichage ne doit pas toucher l'état qui fait foi */
  function impBroadcast(msg){ impHandleNetMessage(JSON.parse(JSON.stringify(msg))); net.sendToAll(msg); }

  function impCleanupOnline(){
    net.close(impNetRole==='host' ? {type:'room_closed'} : null);
    impNetRole=null; impMySeat=0; impCurrentRoomCode='';
    impGameStarted=false; impInRound=false; impRoundLiveForLobby=false;
    impState.players=[]; impState.scores=[]; impState.connected=[]; impState.clientIds=[];
    impState.answers={}; impState.votes={}; impState.roundSeats=[]; impState.round=0;
    impState.phase='lobby'; impState.lastPhaseMsg=null;
    if(impImposterTimer){ clearTimeout(impImposterTimer); impImposterTimer=null; }
    clearTimeout(impPhaseTimer); impPhaseTimer=null;
    impAnswerBar.stop(); impVoteBar.stop();
    $('impRoundBadge').style.display='none';
    impHideBanner();
    impSetNetStatus('offline','HORS LIGNE');
  }

  function impShowBanner(text){
    $('impNetBannerText').textContent=text;
    $('impNetBanner').classList.add('open');
  }
  function impHideBanner(){ $('impNetBanner').classList.remove('open'); }
  function impRefreshBanner(){
    if(!impNetRole || !impInRound){ impHideBanner(); return; }
    var missing=[];
    impState.roundSeats.forEach(function(s){
      if(impState.players[s] && impState.connected[s]===false) missing.push(impState.players[s].name);
    });
    var live=$('imp-screen-answer').classList.contains('active') || $('imp-screen-vote').classList.contains('active');
    if(missing.length && live){
      impShowBanner('⚠ '+missing.join(', ')+(missing.length>1?' se sont déconnectés':" s'est déconnecté(e)")+' — la manche continue sans eux.');
    } else {
      impHideBanner();
    }
  }
  function impShowLostModal(text){
    impHideBanner();
    impSetNetStatus('offline','DÉCONNECTÉ');
    $('impDisconnectModalText').textContent=text;
    openModal('impDisconnectModal');
  }
  $('impDisconnectBackBtn').addEventListener('click',function(){
    closeModal('impDisconnectModal');
    impCleanupOnline();
    impGoto_('online');
  });

  function impIsConnected(seat){ return seat===0 || impState.connected[seat]!==false; }
  function impActiveCount(){
    var n=0;
    for(var s=0;s<impState.players.length;s++){ if(impState.players[s] && impIsConnected(s)) n++; }
    return n;
  }
  function impIsRoundLive(){ return impState.phase==='answering' || impState.phase==='voting'; }
  function impPickColor(){
    var used=impState.players.map(function(p){ return p?p.color:null; });
    for(var i=0;i<IMP_PALETTE.length;i++){ if(used.indexOf(IMP_PALETTE[i])===-1) return IMP_PALETTE[i]; }
    return IMP_PALETTE[Math.floor(Math.random()*IMP_PALETTE.length)];
  }

  /* ----- room creation (host) ----- */
  $('impCreateRoomBtn').addEventListener('click',function(){
    impMyName=$('impName').value.trim()||'Joueur';
    impCleanupOnline();
    net.host(function(code){
      impNetRole='host'; impMySeat=0;
      impCurrentRoomCode=code;
      impState.players=[{name:impMyName, color:IMP_PALETTE[0]}];
      impState.scores=[0];
      impState.connected=[true];
      impState.clientIds=[net.clientId];
      impState.phase='lobby';
      impState.pool=shuffle(impState.bank.slice());
      try{ history.replaceState(null,'','#imposteur?room='+code); }catch(e){}
      $('impCodeDisplay').textContent=code;
      impRenderLobby();
      impGoto_('lobby');
    });
    sfxToggle();
  });

  /* ----- host: seats ----- */
  function impHostOnJoinRequest(msg){
    for(var s=1;s<impState.clientIds.length;s++){
      if(msg.clientId && impState.clientIds[s]===msg.clientId && impState.players[s]) return s;
    }
    if(impActiveCount()>=8) return 'SALLE COMPLÈTE (8/8)';
    return Math.max(1, impState.players.length);
  }
  function impHostOnSeatJoined(seat, msg, isRepeat){
    var p=impState.players[seat];
    if(p){ if(msg.name) p.name=msg.name; }
    else {
      impState.players[seat]={name:msg.name||'Joueur', color:impPickColor()};
      impState.scores[seat]=0;
    }
    impState.clientIds[seat]=msg.clientId||null;
    impState.connected[seat]=true;
    net.sendTo(seat, {type:'seat_assigned', seat:seat, players:impState.players.slice(),
      scores:impState.scores.slice(), connected:impState.connected.slice(), inRound:impIsRoundLive()});
    if(impIsRoundLive() && impState.roundSeats.indexOf(seat)!==-1) impHostSendResync(seat);
    else if(impState.phase==='result' && impState.lastPhaseMsg) net.sendTo(seat, impState.lastPhaseMsg);
    impBroadcastLobby();
    if(!isRepeat) sfxValidate();
  }
  function impHostOnSeatLost(seat){
    if(!impGameStarted){
      impState.players[seat]=null;
      impState.clientIds[seat]=null;
      impBroadcastLobby();
      return;
    }
    impState.connected[seat]=false;
    impBroadcastLobby();
    if(!impIsRoundLive() || impState.roundSeats.indexOf(seat)===-1) return;
    if(impState.roundSeats.filter(impIsConnected).length<2){
      impBroadcast({type:'round_aborted', reason:'Trop de joueurs se sont déconnectés.'});
      return;
    }
    /* l'imposteur parti : on l'attend un peu, puis la manche est annulée
       (sinon il gagnerait des points sans être là) */
    if(seat===impState.imposterSeat){
      if(impImposterTimer) clearTimeout(impImposterTimer);
      impImposterTimer=setTimeout(function(){
        impImposterTimer=null;
        if(impIsRoundLive() && !impIsConnected(impState.imposterSeat)){
          impBroadcast({type:'round_aborted', reason:"l'imposteur a quitté la partie (aucun point attribué)."});
        }
      }, IMP_IMPOSTER_GRACE);
      return;
    }
    /* on n'attend pas les autres absents */
    if(impState.phase==='answering') impHostCheckAnswers();
    else if(impState.phase==='voting') impHostCheckVotes();
  }
  function impHostOnGuestMessage(seat, msg){
    if(msg.type==='answer_submit') impHostReceiveAnswer(seat, msg.value);
    else if(msg.type==='vote_cast') impHostReceiveVote(seat, msg.target);
  }
  function impBroadcastLobby(){
    net.sendToAll({type:'lobby_update', players:impState.players.slice(), scores:impState.scores.slice(),
      connected:impState.connected.slice(), inRound:impIsRoundLive()});
    impRenderLobby();
    impRefreshBanner();
  }
  /* Remet au bon écran un joueur revenu en cours de manche. */
  function impHostSendResync(seat){
    net.sendTo(seat, impRoundStartMsg(seat));
    if(impState.phase==='answering'){
      net.sendTo(seat, {type:'answer_status', answered:Object.keys(impState.answers).map(Number),
        mine: impState.answers.hasOwnProperty(seat) ? impState.answers[seat] : null});
    } else if(impState.phase==='voting'){
      var m=impState.lastPhaseMsg, copy={};
      for(var k in m) copy[k]=m[k];
      copy.ms=impLeft();
      copy.alreadyVoted=impState.votes.hasOwnProperty(seat);
      net.sendTo(seat, copy);
      net.sendTo(seat, {type:'vote_status', voted:Object.keys(impState.votes).map(Number)});
    }
  }

  /* ----- join (guest) ----- */
  $('impJoinCode').addEventListener('keydown',function(e){
    if(e.key==='Enter'){ e.preventDefault(); $('impJoinRoomBtn').click(); }
  });
  $('impJoinRoomBtn').addEventListener('click',function(){
    impMyName=$('impName').value.trim()||'Joueur';
    var code=$('impJoinCode').value.trim().toUpperCase();
    if(!code){ shake($('impJoinCode')); return; }
    impCleanupOnline();
    impNetRole='guest';
    net.join(code, {name:impMyName});
    sfxToggle();
  });
  $('impCopyCodeBtn').addEventListener('click',function(){ copyText(impCurrentRoomCode, $('impCopyCodeBtn')); });
  $('impCopyLinkBtn').addEventListener('click',function(){
    copyText(location.origin+location.pathname+'#imposteur?room='+impCurrentRoomCode, $('impCopyLinkBtn'));
  });

  /* ----- lobby ----- */
  function impPlayerRow(i, extra){
    var p=impState.players[i];
    var off=!impIsConnected(i);
    return '<div class="cham-player-row filled'+(off?' offline':'')+'"><span class="cham-player-dot" style="background:'+p.color+';"></span>'+
      '<span class="cham-player-name">'+escapeHtml(p.name)+(i===impMySeat?' (toi)':'')+(off?'<span class="imp-tag">déconnecté(e)</span>':'')+'</span>'+(extra||'')+'</div>';
  }
  function impRenderLobby(){
    var html='';
    for(var i=0;i<impState.players.length;i++){
      if(!impState.players[i]) continue;
      html+=impPlayerRow(i, '<span class="cham-vote-count">'+(impState.scores[i]||0)+' pts</span>');
    }
    $('impPlayerList').innerHTML=html;
    var count=impActiveCount();
    var live = impNetRole==='host' ? impIsRoundLive() : impRoundLiveForLobby;
    var statusEl=$('impLobbyStatus');
    if(live){
      statusEl.textContent='Une manche est en cours — tu joueras dès la prochaine.';
    } else if(count<3){
      statusEl.textContent=count+' joueur(s) connecté(s) — 3 minimum pour lancer la partie.';
    } else {
      statusEl.textContent = impNetRole==='host' ? (count+' joueurs prêts. Tu peux lancer la partie !') : (count+" joueurs prêts. En attente que l'hôte lance la partie...");
    }
    $('impStartBtn').style.display = (impNetRole==='host' && count>=3 && !live) ? 'inline-block' : 'none';
  }
  $('impStartBtn').addEventListener('click',function(){ sfxValidate(); impHostStartRound(); });
  $('impNextRoundBtn').addEventListener('click',function(){ sfxToggle(); impHostStartRound(); });

  /* ----- round flow (host authoritative) ----- */
  function impRoundStartMsg(seat){
    return {type:'round_start', round:impState.round, roundSeats:impState.roundSeats.slice(),
      question: seat===impState.imposterSeat ? impState.imposterQuestion : impState.question,
      ms: impState.phase==='answering' ? impLeft() : 0, total:IMP_ANSWER_MS};
  }
  function impHostStartRound(){
    var seats=[];
    for(var i=0;i<impState.players.length;i++){ if(impState.players[i] && impIsConnected(i)) seats.push(i); }
    if(seats.length<3){
      impState.phase='lobby_wait';
      if(impGameStarted) impBroadcast({type:'round_aborted', reason:'il faut 3 joueurs connectés pour continuer.'});
      else { impRenderLobby(); impGoto_('lobby'); }
      impSetNetStatus('error','3 JOUEURS CONNECTÉS MINIMUM');
      return;
    }
    impSetNetStatus('connected','PARTIE EN COURS');
    impGameStarted=true;
    if(impState.pool.length===0) impState.pool=shuffle(impState.bank.slice());
    var pair=impState.pool.pop();
    /* une fois sur deux on inverse la paire : impossible de deviner son rôle à la question */
    var flip=Math.random()<0.5;
    impState.question=flip?pair[1]:pair[0];
    impState.imposterQuestion=flip?pair[0]:pair[1];
    impState.imposterSeat=seats[Math.floor(Math.random()*seats.length)];
    impState.roundSeats=seats;
    impState.answers={}; impState.votes={};
    impState.round++;
    impState.lastPhaseMsg=null;
    impState.phase='answering';
    if(impImposterTimer){ clearTimeout(impImposterTimer); impImposterTimer=null; }
    impDeadline=Date.now()+IMP_ANSWER_MS;
    clearTimeout(impPhaseTimer);
    impPhaseTimer=setTimeout(function(){ if(impState.phase==='answering') impHostRevealAnswers(); }, IMP_ANSWER_MS+300);
    seats.forEach(function(s){
      var m=impRoundStartMsg(s);
      if(s===0) impHandleNetMessage(m); else net.sendTo(s, m);
    });
    impBroadcastLobby();
  }
  function impHostReceiveAnswer(seat, value){
    if(impState.phase!=='answering' || impState.roundSeats.indexOf(seat)===-1) return;
    if(impState.answers.hasOwnProperty(seat)) return;
    var v=parseFloat(value);
    if(!isFinite(v)) return;
    impState.answers[seat]=Math.round(v*100)/100;
    impBroadcast({type:'answer_status', answered:Object.keys(impState.answers).map(Number)});
    impHostCheckAnswers();
  }
  function impHostCheckAnswers(){
    if(impState.phase!=='answering') return;
    var pending=impState.roundSeats.filter(function(s){ return (impIsConnected(s) || s===impState.imposterSeat) && !impState.answers.hasOwnProperty(s); });
    if(pending.length) return;
    impHostRevealAnswers();
  }
  /* tout le monde a répondu, ou le temps est écoulé (réponses manquantes : —) */
  function impHostRevealAnswers(){
    impState.phase='voting';
    impDeadline=Date.now()+IMP_VOTE_MS;
    clearTimeout(impPhaseTimer);
    impPhaseTimer=setTimeout(function(){ if(impState.phase==='voting') impHostFinishRound(); }, IMP_VOTE_MS+300);
    var msg={type:'reveal_answers', question:impState.question, answers:impState.answers, roundSeats:impState.roundSeats.slice(),
      ms:IMP_VOTE_MS, total:IMP_VOTE_MS};
    impState.lastPhaseMsg=msg;
    impBroadcast(msg);
  }
  function impHostReceiveVote(seat, target){
    var rs=impState.roundSeats;
    if(impState.phase!=='voting' || rs.indexOf(seat)===-1 || rs.indexOf(target)===-1 || seat===target) return;
    if(impState.votes.hasOwnProperty(seat)) return;
    impState.votes[seat]=target;
    impBroadcast({type:'vote_status', voted:Object.keys(impState.votes).map(Number)});
    impHostCheckVotes();
  }
  function impHostCheckVotes(){
    if(impState.phase!=='voting') return;
    var pending=impState.roundSeats.filter(function(s){ return (impIsConnected(s) || s===impState.imposterSeat) && !impState.votes.hasOwnProperty(s); });
    if(pending.length) return;
    impHostFinishRound();
  }
  function impHostFinishRound(){
    clearTimeout(impPhaseTimer); impPhaseTimer=null;
    var tally={};
    impState.roundSeats.forEach(function(s){ tally[s]=0; });
    Object.keys(impState.votes).forEach(function(v){ var t=impState.votes[v]; if(tally.hasOwnProperty(t)) tally[t]++; });
    var max=-1, leaders=[];
    impState.roundSeats.forEach(function(s){
      if(tally[s]>max){ max=tally[s]; leaders=[s]; }
      else if(tally[s]===max){ leaders.push(s); }
    });
    /* démasqué seulement s'il est seul en tête des votes */
    var caught = leaders.length===1 && leaders[0]===impState.imposterSeat;
    var winners=[];
    if(caught){
      Object.keys(impState.votes).forEach(function(v){
        if(impState.votes[v]===impState.imposterSeat){ v=Number(v); winners.push(v); impState.scores[v]=(impState.scores[v]||0)+1; }
      });
    } else {
      winners.push(impState.imposterSeat);
      impState.scores[impState.imposterSeat]=(impState.scores[impState.imposterSeat]||0)+2;
    }
    impState.phase='result';
    var msg={type:'round_result', caught:caught, imposterSeat:impState.imposterSeat,
      question:impState.question, imposterQuestion:impState.imposterQuestion,
      answers:impState.answers, tally:tally, votes:impState.votes, winners:winners,
      leaders:leaders, scores:impState.scores.slice(), roundSeats:impState.roundSeats.slice()};
    impState.lastPhaseMsg=msg;
    impBroadcast(msg);
    impBroadcastLobby();
  }

  /* ----- incoming message dispatcher ----- */
  function impHandleNetMessage(msg){
    if(!msg || !msg.type) return;
    switch(msg.type){
      case 'room_full':
        impSetNetStatus('error', msg.reason||'SALLE COMPLÈTE (8/8)');
        break;
      case 'seat_assigned':
        impMySeat=msg.seat;
        impCurrentRoomCode=net.code;
        impState.players=msg.players.slice();
        impState.scores=(msg.scores||[]).slice();
        impState.connected=(msg.connected||[]).slice();
        impRoundLiveForLobby=!!msg.inRound;
        impInRound=false;
        $('impCodeDisplay').textContent=impCurrentRoomCode;
        impRenderLobby();
        impGoto_('lobby');
        break;
      case 'lobby_update':
        impState.players=msg.players.slice();
        if(msg.scores) impState.scores=msg.scores.slice();
        if(msg.connected) impState.connected=msg.connected.slice();
        impRoundLiveForLobby=!!msg.inRound;
        impRenderLobby();
        impRefreshBanner();
        break;
      case 'round_start':
        impInRound=true;
        impState.round=msg.round;
        impState.roundSeats=msg.roundSeats.slice();
        impState.myQuestion=msg.question;
        impState.answers={}; impState.votes={};
        impShowAnswerScreen(null);
        impAnswerBar.start(msg.ms||IMP_ANSWER_MS, msg.total||IMP_ANSWER_MS);
        break;
      case 'answer_status':
        if(!impInRound) break;
        if(msg.mine!==undefined && msg.mine!==null) impMarkAnswered(msg.mine);
        impRenderAnswerStatus(msg.answered);
        break;
      case 'reveal_answers':
        if(!impInRound) break;
        impState.answers=msg.answers;
        impAnswerBar.stop();
        impShowVoteScreen(msg, !!msg.alreadyVoted);
        impVoteBar.start(msg.ms||IMP_VOTE_MS, msg.total||IMP_VOTE_MS);
        break;
      case 'vote_status':
        if(!impInRound) break;
        impRenderVoteStatus(msg.voted);
        break;
      case 'round_result':
        if(msg.scores) impState.scores=msg.scores.slice();
        impShowResult(msg);
        break;
      case 'round_aborted':
        impInRound=false; impRoundLiveForLobby=false;
        impAnswerBar.stop(); impVoteBar.stop();
        if(impNetRole==='host'){ impState.phase='lobby_wait'; clearTimeout(impPhaseTimer); impPhaseTimer=null; }
        impRenderLobby();
        impGoto_('lobby');
        $('impLobbyStatus').textContent='⚠ Manche annulée : '+msg.reason;
        impHideBanner();
        break;
      case 'room_closed':
        net.close();
        impShowLostModal("L'hôte a fermé la salle.");
        break;
    }
  }

  /* ----- answer phase ----- */
  function impShowAnswerScreen(){
    $('impRoundBadge').textContent='MANCHE N°'+impState.round;
    $('impRoundBadge').style.display='inline-block';
    $('impMyQuestion').textContent=impState.myQuestion;
    $('impAnswerInput').value='';
    $('impAnswerInput').disabled=false;
    $('impAnswerBtn').disabled=false;
    $('impAnswerBox').style.display='block';
    impRenderAnswerStatus([]);
    impGoto_('answer');
    impRefreshBanner();
    setTimeout(function(){ try{ $('impAnswerInput').focus(); }catch(e){} }, 350);
  }
  function impMarkAnswered(value){
    $('impAnswerInput').value=value;
    $('impAnswerInput').disabled=true;
    $('impAnswerBtn').disabled=true;
    $('impAnswerBox').style.display='none';
  }
  function impRenderAnswerStatus(answered){
    var html='', n=0;
    impState.roundSeats.forEach(function(s){
      if(!impState.players[s]) return;
      var done=answered.indexOf(s)!==-1;
      if(done) n++;
      html+=impPlayerRow(s, '<span class="cham-vote-count">'+(done?'✅':'⏳')+'</span>');
    });
    $('impAnswerList').innerHTML=html;
    var mine=$('impAnswerBox').style.display==='none';
    $('impAnswerStatus').textContent=(mine?'Réponse envoyée. ':'')+n+' / '+impState.roundSeats.length+' réponses reçues';
  }
  $('impAnswerInput').addEventListener('keydown',function(e){
    if(e.key==='Enter'){ e.preventDefault(); $('impAnswerBtn').click(); }
  });
  $('impAnswerBtn').addEventListener('click',function(){
    var raw=$('impAnswerInput').value.replace(',','.').trim();
    var v=parseFloat(raw);
    if(raw==='' || !isFinite(v)){ shake($('impAnswerInput')); return; }
    sfxValidate();
    impMarkAnswered(v);
    if(impNetRole==='host') impHostReceiveAnswer(0, v);
    else net.send({type:'answer_submit', value:v});
    $('impAnswerStatus').textContent='Réponse envoyée. En attente des autres...';
  });

  /* ----- reveal & vote ----- */
  function impFormat(v){ return String(v).replace('.',','); }
  /* Ligne graduée : les réponses placées entre la plus petite et la plus grande. */
  function impRenderLine(el, answers, seats, highlightSeat){
    var vals=seats.filter(function(s){ return answers.hasOwnProperty(s); });
    if(!vals.length){ el.innerHTML=''; return; }
    var min=Infinity, max=-Infinity;
    vals.forEach(function(s){ min=Math.min(min,answers[s]); max=Math.max(max,answers[s]); });
    var span=(max-min)||1;
    vals.sort(function(a,b){ return answers[a]-answers[b]; });
    var html='';
    vals.forEach(function(s,i){
      var p=impState.players[s]||{name:'?',color:'#888'};
      var left=(max===min)?50:((answers[s]-min)/span*100);
      html+='<div class="imp-line-dot" style="left:'+left+'%;background:'+p.color+';'+(s===highlightSeat?'box-shadow:0 0 0 3px var(--red-bright);':'')+'"></div>';
      /* seulement la valeur : la liste en dessous associe couleur, nom et réponse */
      html+='<div class="imp-line-label'+(i%2?' low':'')+'" style="left:'+left+'%;color:'+p.color+';" title="'+escapeHtml(p.name)+'">'+impFormat(answers[s])+'</div>';
    });
    el.innerHTML=html;
  }
  function impShowVoteScreen(msg, alreadyVoted){
    $('impRealQuestion').textContent=msg.question;
    impRenderLine($('impVoteLine'), msg.answers, msg.roundSeats, -1);
    impMyVoteTarget = alreadyVoted ? -1 : null;
    var seats=msg.roundSeats.slice().sort(function(a,b){
      var va=msg.answers.hasOwnProperty(a)?msg.answers[a]:Infinity, vb=msg.answers.hasOwnProperty(b)?msg.answers[b]:Infinity;
      return va-vb;
    });
    var html='';
    seats.forEach(function(s){
      if(!impState.players[s]) return;
      var val=msg.answers.hasOwnProperty(s)?impFormat(msg.answers[s]):'—';
      var btn = s===impMySeat ? '<span class="imp-tag">toi</span>' : '<button class="cham-vote-btn" data-seat="'+s+'"'+(alreadyVoted?' disabled':'')+'><span>Accuser</span></button>';
      html+=impPlayerRow(s, '<span class="imp-answer-value">'+val+'</span>'+btn);
    });
    $('impVoteList').innerHTML=html;
    var btns=$('impVoteList').querySelectorAll('.cham-vote-btn');
    for(var k=0;k<btns.length;k++){
      btns[k].addEventListener('click', function(){
        if(impMyVoteTarget!==null) return;
        impMyVoteTarget=parseInt(this.getAttribute('data-seat'),10);
        this.classList.add('voted');
        for(var j=0;j<btns.length;j++) btns[j].disabled=true;
        if(impNetRole==='host') impHostReceiveVote(0, impMyVoteTarget);
        else net.send({type:'vote_cast', target:impMyVoteTarget});
        sfxValidate();
      });
    }
    impRenderVoteStatus([]);
    impGoto_('vote');
    impRefreshBanner();
  }
  function impRenderVoteStatus(voted){
    var n=voted.length, total=impState.roundSeats.length;
    var mine = impMyVoteTarget!==null;
    $('impVoteStatus').textContent=(mine?'Vote envoyé. ':'')+n+' / '+total+' votes';
  }

  /* ----- result ----- */
  function impShowResult(msg){
    impInRound=false;
    impAnswerBar.stop(); impVoteBar.stop();
    var imp=impState.players[msg.imposterSeat]||{name:'?'};
    var banner=$('impResultBanner');
    banner.textContent = msg.caught ? '🎯 IMPOSTEUR DÉMASQUÉ !' : "🕵️ L'IMPOSTEUR S'ÉCHAPPE !";
    banner.className='cham-result-banner '+(msg.caught?'b-perfect':'b-fail');
    var who = msg.imposterSeat===impMySeat ? 'C’était <b>toi</b> !' : 'C’était <b>'+escapeHtml(imp.name)+'</b>.';
    $('impResultText').innerHTML = who+'<br>Question de tous : « '+escapeHtml(msg.question)+' »<br>'+
      'Question de l’imposteur : « '+escapeHtml(msg.imposterQuestion)+' » — réponse : <b>'+
      (msg.answers.hasOwnProperty(msg.imposterSeat)?impFormat(msg.answers[msg.imposterSeat]):'—')+'</b>';
    impRenderLine($('impResultLine'), msg.answers, msg.roundSeats, msg.imposterSeat);

    var html='';
    for(var i=0;i<impState.players.length;i++){
      if(!impState.players[i]) continue;
      var gained=msg.winners.indexOf(i)!==-1 ? (i===msg.imposterSeat?' +2':' +1') : '';
      var votes=msg.tally.hasOwnProperty(i) ? (msg.tally[i]+' vote(s)') : '';
      html+=impPlayerRow(i, '<span class="imp-tag">'+(i===msg.imposterSeat?'🕵️ ':'')+votes+'</span><span class="cham-vote-count">'+(impState.scores[i]||0)+' pts'+gained+'</span>');
    }
    $('impScoreList').innerHTML=html;

    if(impNetRole==='host'){
      $('impNextRoundBtn').style.display='inline-block';
      $('impWaitingHostLabel').style.display='none';
    } else {
      $('impNextRoundBtn').style.display='none';
      $('impWaitingHostLabel').style.display='inline-block';
      $('impWaitingHostLabel').textContent="⏳ En attente que l'hôte lance une nouvelle manche...";
    }
    var iWon=msg.winners.indexOf(impMySeat)!==-1;
    sfxReveal(iWon?100:0);
    impHideBanner();
    impGoto_('result');
  }

  /* ---------- API pour le hub ---------- */
  CG.imposteur = {
    reset: function(){
      if(impNetRole) impCleanupOnline();
      closeModal('impDisconnectModal');
      impGoto_('online');
    },
    enterJoinFlow: function(code){
      impGoto_('online');
      $('impJoinCode').value = decodeURIComponent(code).toUpperCase();
    }
  };

  impRenderBankCount();
})();
