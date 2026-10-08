/* Le Loup des mots — déduction et bluff (4 à 10 joueurs en ligne), dans
   l'esprit de Werewords. Le Maire connaît le mot secret et répond aux
   questions fermées ; un Loup (deux à partir de 7) connaît aussi le mot et
   sabote ; le Voyant le connaît et doit aider sans se faire repérer.
   L'hôte fait autorité : rôles, mot, questions, chrono, votes et points. */
(function(){
  'use strict';
  var CG=window.CG;
  var $=CG.$, escapeHtml=CG.escapeHtml, shuffle=CG.shuffle, shake=CG.shake, openModal=CG.openModal, closeModal=CG.closeModal;
  var sfxToggle=CG.sfxToggle, sfxValidate=CG.sfxValidate, sfxReveal=CG.sfxReveal, copyText=CG.copyText;

  var ROOM_PREFIX='p5loup-';
  var MIN_PLAYERS=4, MAX_PLAYERS=10;
  var CHOOSE_MS=30000, LOUPVOTE_MS=30000, VILLAGEVOTE_MS=60000, MAYOR_GRACE=30000;
  var MAX_PENDING=2;                /* questions sans réponse par joueur */
  var COLORS=['#E60012','#2E6FF2','#FFE600','#7cff6e','#ff6ec7','#ff9d2f','#00e5ff','#b388ff','#ffffff','#c49a6c'];

  var ROLES={
    loup:{ico:'🐺', name:'LOUP', desc:'Tu connais le mot. Sabote discrètement le village… et repère le Voyant si le mot est trouvé.'},
    voyant:{ico:'🔮', name:'VOYANT', desc:'Tu connais le mot. Aide le village à le trouver, sans que les Loups te démasquent.'},
    villageois:{ico:'🧑‍🌾', name:'VILLAGEOIS', desc:'Tu ne connais pas le mot. Pose les bonnes questions et repère le Loup.'}
  };
  var ANSWERS={
    yes:{label:'OUI', cls:'loup-ans-yes'}, no:{label:'NON', cls:'loup-ans-no'},
    maybe:{label:'PEUT-ÊTRE', cls:'loup-ans-maybe'}, hot:{label:'TU CHAUFFES !', cls:'loup-ans-hot'},
    cold:{label:'LOIN !', cls:'loup-ans-cold'}, found:{label:'🎯 TROUVÉ !', cls:'loup-ans-found'}
  };

  var WORDS=['Girafe','Pingouin','Dauphin','Araignée','Kangourou','Requin','Hibou','Escargot','Dragon','Licorne',
    'Pizza','Sushi','Croissant','Fromage','Chocolat','Raclette','Pastèque','Hamburger','Crêpe','Popcorn',
    'Guitare','Piano','Trompette','Batterie','Micro','Violon',
    'Avion','Sous-marin','Fusée','Vélo','Trottinette','Hélicoptère','Montgolfière','Train','Bateau','Moto',
    'Plage','Volcan','Désert','Cinéma','Bibliothèque','Hôpital','Prison','Château','Igloo','Aéroport','Piscine','Musée',
    'Parapluie','Brosse à dents','Miroir','Bougie','Ciseaux','Lunettes','Montre','Oreiller','Valise','Aspirateur','Frigo','Clé',
    'Pompier','Astronaute','Pirate','Vampire','Ninja','Magicien','Chirurgien','Boulanger','Détective','Clown',
    'Football','Tennis','Natation','Boxe','Ski','Bowling','Échecs','Surf','Escalade','Judo',
    'Neige','Orage','Arc-en-ciel','Tornade','Lune','Soleil','Étoile filante','Éclipse',
    'Smartphone','Ordinateur','Robot','Drone','Console','Imprimante','Wi-Fi','Casque audio',
    'Noël','Halloween','Anniversaire','Mariage','Carnaval','Feu d’artifice',
    'Couronne','Épée','Bouclier','Trésor','Carte au trésor','Boussole','Masque','Cape',
    'Café','Thé','Jus d’orange','Limonade','Milkshake','Soupe',
    'Fantôme','Zombie','Sorcière','Momie','Extraterrestre','Sirène',
    'Tour Eiffel','Pyramide','Statue de la Liberté','Muraille de Chine',
    'Arbre','Cactus','Champignon','Tournesol','Rose','Palmier'];

  var ls={
    players:[], scores:[], connected:[], clientIds:[],
    timer:240, phase:'lobby', round:0, roundSeats:[], mayorSeat:-1, mayorTurn:-1,
    roles:{}, word:'', choices:[], questions:[], tokens:{hot:1,cold:1}, nextQid:1,
    deadline:0, phaseTimer:null, votes:{}, voters:[], voteKind:'', mayorTimer:null, lastResult:null
  };
  var netRole=null, mySeat=0, myName='', roomCode='', selectedTimer=240;
  var gameStarted=false, inRound=false, roundLiveForLobby=false;
  /* vue côté joueur */
  var me={role:null, word:null, loups:[], choices:null};
  var view={questions:[], tokens:{hot:1,cold:1}, endsAt:0, totalMs:1, phase:'', voteKind:'', voted:false, voteTarget:null};

  /* ===================== RÉSEAU ===================== */
  function setNetStatus(cls,label){
    var el=$('loupNetStatus');
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
  function broadcast(msg){ handleMsg(JSON.parse(JSON.stringify(msg))); net.sendToAll(msg); }
  function sendToSeat(seat, msg){ if(seat===0) handleMsg(JSON.parse(JSON.stringify(msg))); else net.sendTo(seat, msg); }

  function clearTimers(){
    clearTimeout(ls.phaseTimer); ls.phaseTimer=null;
    clearTimeout(ls.mayorTimer); ls.mayorTimer=null;
  }
  function cleanupOnline(){
    net.close(netRole==='host' ? {type:'room_closed'} : null);
    clearTimers();
    netRole=null; mySeat=0; roomCode='';
    gameStarted=false; inRound=false; roundLiveForLobby=false;
    ls.players=[]; ls.scores=[]; ls.connected=[]; ls.clientIds=[];
    ls.phase='lobby'; ls.round=0; ls.roundSeats=[]; ls.mayorTurn=-1; ls.lastResult=null;
    me={role:null, word:null, loups:[], choices:null};
    $('loupRoundBadge').style.display='none';
    hideBanner();
    setNetStatus('offline','HORS LIGNE');
  }
  function showBanner(t){ $('loupNetBannerText').textContent=t; $('loupNetBanner').classList.add('open'); }
  function hideBanner(){ $('loupNetBanner').classList.remove('open'); }
  function showLostModal(text){
    hideBanner(); setNetStatus('offline','DÉCONNECTÉ');
    $('loupDisconnectModalText').textContent=text;
    openModal('loupDisconnectModal');
  }
  $('loupDisconnectBackBtn').addEventListener('click',function(){
    closeModal('loupDisconnectModal'); cleanupOnline(); gotoScreen('online');
  });

  function isConnected(seat){ return seat===0 || ls.connected[seat]!==false; }
  function activeCount(){
    var n=0;
    for(var s=0;s<ls.players.length;s++){ if(ls.players[s] && isConnected(s)) n++; }
    return n;
  }
  function isRoundLive(){ return ['choosing','asking','loupvote','villagevote'].indexOf(ls.phase)!==-1; }
  function pname(seat){ var p=ls.players[seat]; return p?p.name:'?'; }
  function pcolor(seat){ return COLORS[seat%COLORS.length]; }

  /* ----- création / connexion ----- */
  (function(){
    var btns=$('loupTimerToggle').querySelectorAll('button');
    for(var i=0;i<btns.length;i++){
      btns[i].addEventListener('click',function(){
        for(var j=0;j<btns.length;j++) btns[j].classList.remove('active');
        this.classList.add('active');
        selectedTimer=parseInt(this.getAttribute('data-timer'),10);
        sfxToggle();
      });
    }
  })();
  $('loupCreateRoomBtn').addEventListener('click',function(){
    myName=$('loupName').value.trim()||'Joueur';
    cleanupOnline();
    net.host(function(code){
      netRole='host'; mySeat=0; roomCode=code;
      ls.timer=selectedTimer; ls.phase='lobby';
      ls.players=[{name:myName}]; ls.scores=[0]; ls.connected=[true]; ls.clientIds=[net.clientId];
      try{ history.replaceState(null,'','#loup?room='+code); }catch(e){}
      $('loupCodeDisplay').textContent=code;
      renderLobby();
      gotoScreen('lobby');
    });
    sfxToggle();
  });
  $('loupJoinCode').addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); $('loupJoinRoomBtn').click(); } });
  $('loupJoinRoomBtn').addEventListener('click',function(){
    myName=$('loupName').value.trim()||'Joueur';
    var code=$('loupJoinCode').value.trim().toUpperCase();
    if(!code){ shake($('loupJoinCode')); return; }
    cleanupOnline();
    netRole='guest';
    net.join(code, {name:myName});
    sfxToggle();
  });
  $('loupCopyCodeBtn').addEventListener('click',function(){ copyText(roomCode, $('loupCopyCodeBtn')); });
  $('loupCopyLinkBtn').addEventListener('click',function(){ copyText(location.origin+location.pathname+'#loup?room='+roomCode, $('loupCopyLinkBtn')); });
  $('loupBackFromLobby').addEventListener('click',function(){ sfxToggle(); cleanupOnline(); gotoScreen('online'); });
  $('loupHubReturnBtn').addEventListener('click',function(){ sfxToggle(); location.hash='hub'; });
  $('loupRulesBtn').addEventListener('click',function(){ openModal('loupRulesModal'); sfxToggle(); });
  $('loupRulesModalClose').addEventListener('click',function(){ closeModal('loupRulesModal'); });
  $('loupRulesModal').addEventListener('click',function(e){ if(e.target===this) closeModal('loupRulesModal'); });

  /* ===================== HÔTE : PLACES ===================== */
  function hostOnJoinRequest(msg){
    for(var s=1;s<ls.clientIds.length;s++){
      if(msg.clientId && ls.clientIds[s]===msg.clientId && ls.players[s]) return s;
    }
    if(activeCount()>=MAX_PLAYERS) return 'SALLE COMPLÈTE ('+MAX_PLAYERS+'/'+MAX_PLAYERS+')';
    return Math.max(1, ls.players.length);
  }
  function hostOnSeatJoined(seat, msg, isRepeat){
    var p=ls.players[seat];
    if(p){ if(msg.name) p.name=msg.name; }
    else { ls.players[seat]={name:msg.name||'Joueur'}; ls.scores[seat]=0; }
    ls.clientIds[seat]=msg.clientId||null;
    ls.connected[seat]=true;
    net.sendTo(seat, {type:'seat_assigned', seat:seat, players:ls.players.slice(), scores:ls.scores.slice(),
      connected:ls.connected.slice(), inRound:isRoundLive()});
    if(isRoundLive() && ls.roundSeats.indexOf(seat)!==-1){
      if(seat===ls.mayorSeat && ls.mayorTimer){ clearTimeout(ls.mayorTimer); ls.mayorTimer=null; }
      hostSendResync(seat);
    } else if(ls.phase==='result' && ls.lastResult) net.sendTo(seat, ls.lastResult);
    hostBroadcastLobby();
    if(!isRepeat) sfxValidate();
  }
  function hostOnSeatLost(seat){
    if(!gameStarted){
      ls.players[seat]=null; ls.clientIds[seat]=null;
      hostBroadcastLobby();
      return;
    }
    ls.connected[seat]=false;
    hostBroadcastLobby();
    if(!isRoundLive() || ls.roundSeats.indexOf(seat)===-1) return;
    if(seat===ls.mayorSeat && (ls.phase==='choosing' || ls.phase==='asking')){
      /* sans Maire, personne ne peut répondre : on l'attend un peu */
      clearTimeout(ls.mayorTimer);
      ls.mayorTimer=setTimeout(function(){
        ls.mayorTimer=null;
        /* pendant les votes, le Maire n'a plus de rôle à jouer : on continue */
        if((ls.phase==='choosing' || ls.phase==='asking') && !isConnected(ls.mayorSeat)) hostAbort('le Maire a quitté la partie (aucun point attribué).');
      }, MAYOR_GRACE);
    }
    if(ls.phase==='loupvote' || ls.phase==='villagevote') hostCheckVotes();
  }
  function hostOnGuestMessage(seat, msg){
    if(msg.type==='choose_word') hostChooseWord(seat, msg.idx);
    else if(msg.type==='ask') hostAsk(seat, msg.text);
    else if(msg.type==='answer') hostAnswer(seat, msg.id, msg.ans);
    else if(msg.type==='vote') hostVote(seat, msg.target);
  }
  function hostBroadcastLobby(){
    broadcast({type:'lobby_update', players:ls.players.slice(), scores:ls.scores.slice(),
      connected:ls.connected.slice(), inRound:isRoundLive()});
  }

  /* ===================== HÔTE : MANCHE ===================== */
  function roleMsg(seat){
    var role=ls.roles[seat];
    var knows = role==='loup' || role==='voyant' || seat===ls.mayorSeat;
    return {type:'round_start', round:ls.round, roundSeats:ls.roundSeats.slice(), mayorSeat:ls.mayorSeat,
      role:role, word:(knows && ls.word) ? ls.word : null, chosen:ls.phase!=='choosing',
      loups: role==='loup' ? ls.roundSeats.filter(function(s){ return ls.roles[s]==='loup'; }) : [],
      choices: (seat===ls.mayorSeat && ls.phase==='choosing') ? ls.choices.slice() : null,
      ms: ls.phase==='choosing' ? Math.max(0, ls.deadline-Date.now()) : 0};
  }
  function askingMsg(){
    return {type:'asking_start', ms:Math.max(0, ls.deadline-Date.now()), total:ls.timer*1000,
      questions:ls.questions, tokens:ls.tokens};
  }
  function hostSendResync(seat){
    sendToSeat(seat, roleMsg(seat));
    if(ls.phase==='asking') sendToSeat(seat, askingMsg());
    else if(ls.phase==='loupvote' || ls.phase==='villagevote'){
      sendToSeat(seat, voteMsg(ls.votes.hasOwnProperty(seat)));
    }
  }
  $('loupStartBtn').addEventListener('click',function(){ sfxValidate(); hostStartRound(); });
  $('loupNextRoundBtn').addEventListener('click',function(){ sfxToggle(); hostStartRound(); });
  function hostStartRound(){
    var seats=[];
    for(var i=0;i<ls.players.length;i++){ if(ls.players[i] && isConnected(i)) seats.push(i); }
    if(seats.length<MIN_PLAYERS){
      ls.phase='lobby_wait';
      if(gameStarted) broadcast({type:'round_aborted', reason:'il faut '+MIN_PLAYERS+' joueurs connectés pour continuer.'});
      else { renderLobby(); gotoScreen('lobby'); }
      setNetStatus('error', MIN_PLAYERS+' JOUEURS CONNECTÉS MINIMUM');
      return;
    }
    setNetStatus('connected','PARTIE EN COURS');
    clearTimers();
    gameStarted=true;
    ls.round++;
    ls.roundSeats=seats;
    /* le rôle de Maire tourne */
    ls.mayorTurn=(ls.mayorTurn+1)%seats.length;
    ls.mayorSeat=seats[ls.mayorTurn];
    var nLoups=seats.length>=7?2:1;
    var order=shuffle(seats.slice());
    ls.roles={};
    order.forEach(function(s,i){ ls.roles[s] = i<nLoups ? 'loup' : (i===nLoups ? 'voyant' : 'villageois'); });
    ls.word=''; ls.choices=shuffle(WORDS.slice()).slice(0,3);
    ls.questions=[]; ls.tokens={hot:1,cold:1}; ls.nextQid=1;
    ls.votes={}; ls.voters=[]; ls.voteKind=''; ls.lastResult=null;
    ls.phase='choosing';
    ls.deadline=Date.now()+CHOOSE_MS;
    ls.phaseTimer=setTimeout(function(){ if(ls.phase==='choosing') hostChooseWord(ls.mayorSeat, 0, true); }, CHOOSE_MS+300);
    seats.forEach(function(s){ sendToSeat(s, roleMsg(s)); });
    hostBroadcastLobby();
  }
  function hostChooseWord(seat, idx, auto){
    if(ls.phase!=='choosing' || (seat!==ls.mayorSeat && !auto)) return;
    idx=parseInt(idx,10);
    if(!(idx>=0 && idx<ls.choices.length)) idx=0;
    clearTimeout(ls.phaseTimer);
    ls.word=ls.choices[idx];
    ls.phase='asking';
    ls.deadline=Date.now()+ls.timer*1000;
    ls.phaseTimer=setTimeout(hostTimeUp, ls.timer*1000+300);
    /* chacun reçoit son rôle avec le mot s'il doit le connaître */
    ls.roundSeats.forEach(function(s){ sendToSeat(s, roleMsg(s)); sendToSeat(s, askingMsg()); });
  }
  function hostAsk(seat, text){
    if(ls.phase!=='asking' || ls.roundSeats.indexOf(seat)===-1 || seat===ls.mayorSeat) return;
    text=String(text||'').trim().slice(0,90);
    if(!text) return;
    var pending=ls.questions.filter(function(q){ return q.seat===seat && !q.ans; }).length;
    if(pending>=MAX_PENDING) return;
    var q={id:ls.nextQid++, seat:seat, text:text, ans:null};
    ls.questions.push(q);
    broadcast({type:'q_add', q:q});
  }
  function hostAnswer(seat, id, ans){
    if(ls.phase!=='asking' || seat!==ls.mayorSeat || !ANSWERS[ans]) return;
    var q=ls.questions.filter(function(x){ return x.id===id; })[0];
    if(!q || q.ans) return;
    if((ans==='hot'||ans==='cold') && ls.tokens[ans]<=0) return;
    if(ans==='hot'||ans==='cold') ls.tokens[ans]--;
    q.ans=ans;
    broadcast({type:'q_answer', id:id, ans:ans, tokens:ls.tokens});
    if(ans==='found') hostWordFound(q.seat);
  }
  function hostWordFound(bySeat){
    clearTimeout(ls.phaseTimer);
    var loups=ls.roundSeats.filter(function(s){ return ls.roles[s]==='loup'; });
    hostStartVote('voyant', loups, LOUPVOTE_MS, bySeat);
  }
  function hostTimeUp(){
    if(ls.phase!=='asking') return;
    hostStartVote('loup', ls.roundSeats.slice(), VILLAGEVOTE_MS, -1);
  }
  function voteMsg(alreadyVoted){
    return {type:'vote_start', kind:ls.voteKind, voters:ls.voters.slice(), ms:Math.max(0,ls.deadline-Date.now()),
      total: ls.voteKind==='voyant' ? LOUPVOTE_MS : VILLAGEVOTE_MS, foundBy:ls.foundBy,
      word: ls.voteKind==='voyant' ? ls.word : null, alreadyVoted:!!alreadyVoted,
      voted:Object.keys(ls.votes).map(Number)};
  }
  function hostStartVote(kind, voters, ms, foundBy){
    ls.phase = kind==='voyant' ? 'loupvote' : 'villagevote';
    ls.voteKind=kind; ls.voters=voters; ls.votes={}; ls.foundBy=foundBy;
    ls.deadline=Date.now()+ms;
    clearTimeout(ls.phaseTimer);
    ls.phaseTimer=setTimeout(hostResolveVote, ms+300);
    broadcast(voteMsg(false));
    hostCheckVotes();
  }
  function hostVote(seat, target){
    if((ls.phase!=='loupvote' && ls.phase!=='villagevote') || ls.voters.indexOf(seat)===-1) return;
    if(ls.votes.hasOwnProperty(seat) || ls.roundSeats.indexOf(target)===-1 || target===seat) return;
    if(ls.voteKind==='voyant' && ls.roles[target]==='loup') return;
    ls.votes[seat]=target;
    broadcast({type:'vote_status', voted:Object.keys(ls.votes).map(Number)});
    hostCheckVotes();
  }
  function hostCheckVotes(){
    if(ls.phase!=='loupvote' && ls.phase!=='villagevote') return;
    var pending=ls.voters.filter(function(s){ return isConnected(s) && !ls.votes.hasOwnProperty(s); });
    if(!pending.length){ clearTimeout(ls.phaseTimer); ls.phaseTimer=setTimeout(hostResolveVote, 600); }
  }
  function hostResolveVote(){
    if(ls.phase!=='loupvote' && ls.phase!=='villagevote') return;
    clearTimeout(ls.phaseTimer);
    var tally={}, max=0, leaders=[];
    Object.keys(ls.votes).forEach(function(v){ var t=ls.votes[v]; tally[t]=(tally[t]||0)+1; });
    Object.keys(tally).forEach(function(t){
      t=Number(t);
      if(tally[t]>max){ max=tally[t]; leaders=[t]; } else if(tally[t]===max) leaders.push(t);
    });
    var accused = leaders.length ? leaders[Math.floor(Math.random()*leaders.length)] : -1;
    var winner, reason;
    if(ls.voteKind==='voyant'){
      if(accused!==-1 && ls.roles[accused]==='voyant'){ winner='loups'; reason='Le mot a été trouvé… mais les Loups ont démasqué le Voyant !'; }
      else { winner='village'; reason= accused===-1 ? 'Le mot a été trouvé et les Loups n’ont désigné personne.' : 'Le mot a été trouvé et les Loups se sont trompés de Voyant.'; }
    } else {
      if(accused!==-1 && ls.roles[accused]==='loup'){ winner='village'; reason='Le mot n’a pas été trouvé… mais le village a démasqué un Loup !'; }
      else { winner='loups'; reason= accused===-1 ? 'Le mot n’a pas été trouvé et personne n’a voté.' : 'Le mot n’a pas été trouvé et le village a accusé un innocent.'; }
    }
    var winners=ls.roundSeats.filter(function(s){ return winner==='loups' ? ls.roles[s]==='loup' : ls.roles[s]!=='loup'; });
    winners.forEach(function(s){ ls.scores[s]=(ls.scores[s]||0)+1; });
    ls.phase='result';
    var msg={type:'round_result', winner:winner, reason:reason, word:ls.word, roles:ls.roles, mayorSeat:ls.mayorSeat,
      accused:accused, kind:ls.voteKind, tally:tally, winners:winners, scores:ls.scores.slice(), roundSeats:ls.roundSeats.slice()};
    ls.lastResult=msg;
    broadcast(msg);
    hostBroadcastLobby();
  }
  function hostAbort(reason){
    clearTimers();
    ls.phase='lobby_wait';
    broadcast({type:'round_aborted', reason:reason});
    hostBroadcastLobby();
  }

  /* ===================== MESSAGES ===================== */
  function handleMsg(msg){
    if(!msg || !msg.type) return;
    switch(msg.type){
      case 'room_full': setNetStatus('error', msg.reason||'SALLE COMPLÈTE'); break;
      case 'seat_assigned':
        mySeat=msg.seat; roomCode=net.code;
        ls.players=msg.players.slice(); ls.scores=(msg.scores||[]).slice(); ls.connected=(msg.connected||[]).slice();
        roundLiveForLobby=!!msg.inRound; inRound=false;
        $('loupCodeDisplay').textContent=roomCode;
        renderLobby(); gotoScreen('lobby');
        break;
      case 'lobby_update':
        ls.players=msg.players.slice(); if(msg.scores) ls.scores=msg.scores.slice(); if(msg.connected) ls.connected=msg.connected.slice();
        roundLiveForLobby=!!msg.inRound;
        renderLobby(); refreshBanner();
        if(view.phase==='asking') renderFeed();
        break;
      case 'round_start': onRoundStart(msg); break;
      case 'asking_start': onAskingStart(msg); break;
      case 'q_add':
        if(!inRound) break;
        view.questions.push(msg.q); renderFeed(true);
        if(isMayor()) sfxToggle();
        break;
      case 'q_answer':
        if(!inRound) break;
        view.questions.forEach(function(q){ if(q.id===msg.id) q.ans=msg.ans; });
        view.tokens=msg.tokens; renderFeed(false);
        if(msg.ans==='found') sfxReveal(100);
        break;
      case 'vote_start': if(inRound) onVoteStart(msg); break;
      case 'vote_status': if(inRound) renderVoteStatus(msg.voted); break;
      case 'round_result': showResult(msg); break;
      case 'round_aborted':
        inRound=false; roundLiveForLobby=false; view.phase='';
        renderLobby(); gotoScreen('lobby');
        $('loupLobbyStatus').textContent='⚠ Manche annulée : '+msg.reason;
        hideBanner();
        break;
      case 'room_closed':
        net.close(); showLostModal("L'hôte a fermé la salle.");
        break;
    }
  }

  /* ===================== AFFICHAGE ===================== */
  function gotoScreen(name){
    var all=document.querySelectorAll('.loup-screen');
    for(var i=0;i<all.length;i++) all[i].classList.remove('active');
    $('loup-screen-'+name).classList.add('active');
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function isMayor(){ return mySeat===ls.mayorSeat; }
  function refreshBanner(){
    if(!netRole || !inRound){ hideBanner(); return; }
    var missing=ls.roundSeats.filter(function(s){ return ls.players[s] && !isConnected(s); }).map(pname);
    if(missing.length) showBanner('⚠ '+missing.join(', ')+(missing.length>1?' se sont déconnectés':" s'est déconnecté(e)")+(missing.indexOf(pname(ls.mayorSeat))!==-1?' — on attend le Maire...':' — la partie continue.'));
    else hideBanner();
  }
  function playerRow(s, extra){
    var p=ls.players[s], off=!isConnected(s);
    return '<div class="cham-player-row filled'+(off?' offline':'')+'"><span class="cham-player-dot" style="background:'+pcolor(s)+';"></span>'+
      '<span class="cham-player-name">'+escapeHtml(p.name)+(s===mySeat?' (toi)':'')+(off?'<span class="imp-tag">déconnecté(e)</span>':'')+'</span>'+(extra||'')+'</div>';
  }
  function renderLobby(){
    var html='';
    for(var s=0;s<ls.players.length;s++){
      if(!ls.players[s]) continue;
      html+=playerRow(s, '<span class="cham-vote-count">'+(ls.scores[s]||0)+' pts</span>');
    }
    $('loupPlayerList').innerHTML=html;
    var count=activeCount();
    var live = netRole==='host' ? isRoundLive() : roundLiveForLobby;
    var st=$('loupLobbyStatus');
    if(live) st.textContent='Une manche est en cours — tu joueras dès la prochaine.';
    else if(count<MIN_PLAYERS) st.textContent=count+' joueur(s) connecté(s) — '+MIN_PLAYERS+' minimum pour lancer la partie.';
    else st.textContent = netRole==='host' ? (count+' joueurs prêts. Tu peux lancer la partie !') : (count+" joueurs prêts. En attente que l'hôte lance la partie...");
    $('loupStartBtn').style.display = (netRole==='host' && count>=MIN_PLAYERS && !live) ? 'inline-block' : 'none';
  }

  /* ----- rôle + choix du mot ----- */
  var roleTick=null;
  function onRoundStart(msg){
    var newRound = !inRound || ls.round!==msg.round;
    inRound=true;
    ls.round=msg.round; ls.roundSeats=msg.roundSeats; ls.mayorSeat=msg.mayorSeat;
    me.role=msg.role; me.word=msg.word; me.loups=msg.loups||[]; me.choices=msg.choices;
    if(newRound){ view.questions=[]; view.tokens={hot:1,cold:1}; view.phase='choosing'; }
    $('loupRoundBadge').textContent='MANCHE N°'+msg.round;
    $('loupRoundBadge').style.display='inline-block';
    renderRoleCard();
    if(!msg.chosen){
      /* le mot n'est pas encore choisi */
      view.phase='choosing';
      var box=$('loupChooseBox');
      if(isMayor() && msg.choices){
        box.style.display='block';
        var html='';
        msg.choices.forEach(function(w,i){ html+='<button data-idx="'+i+'">'+escapeHtml(w)+'</button>'; });
        $('loupWordChoices').innerHTML=html;
        var btns=$('loupWordChoices').querySelectorAll('button');
        for(var i=0;i<btns.length;i++){
          btns[i].addEventListener('click',function(){
            var idx=parseInt(this.getAttribute('data-idx'),10);
            sfxValidate();
            $('loupWordChoices').innerHTML='<p class="loup-sys">Mot choisi !</p>';
            if(netRole==='host') hostChooseWord(0, idx); else net.send({type:'choose_word', idx:idx});
          });
        }
      } else box.style.display='none';
      var endsAt=Date.now()+(msg.ms||CHOOSE_MS);
      clearInterval(roleTick);
      roleTick=setInterval(function(){
        if(view.phase!=='choosing'){ clearInterval(roleTick); return; }
        var left=Math.max(0,Math.ceil((endsAt-Date.now())/1000));
        $('loupRoleStatus').textContent = isMayor() ? ('Choisis ton mot ('+left+' s)') : ('👑 '+pname(ls.mayorSeat)+' choisit le mot secret... ('+left+' s)');
      }, 250);
      gotoScreen('role');
      if(newRound) sfxToggle();
    }
    refreshBanner();
  }
  function roleText(){
    var r=ROLES[me.role]||ROLES.villageois;
    return r;
  }
  function renderRoleCard(){
    var r=roleText(), card=$('loupRoleCard');
    card.className='loup-role-card '+(me.role||'');
    var extra='';
    if(isMayor()) extra+='<p>👑 Tu es aussi le <b>Maire</b> : tu choisis le mot et tu réponds aux questions, honnêtement.</p>';
    else extra+='<p>👑 Le Maire est <b>'+escapeHtml(pname(ls.mayorSeat))+'</b>.</p>';
    if(me.role==='loup' && me.loups.length>1){
      extra+='<p>🐺 Ta meute : '+me.loups.filter(function(s){ return s!==mySeat; }).map(function(s){ return '<b>'+escapeHtml(pname(s))+'</b>'; }).join(', ')+'</p>';
    }
    card.innerHTML='<div class="ico">'+r.ico+'</div><h2>'+r.name+'</h2><p>'+r.desc+'</p>'+extra+
      (me.word ? '<div class="loup-secret">Mot secret : '+escapeHtml(me.word)+'</div>' : '');
  }

  /* ----- phase de questions ----- */
  var gameTick=null;
  function onAskingStart(msg){
    view.phase='asking';
    view.questions=msg.questions.slice();
    view.tokens=msg.tokens;
    view.endsAt=Date.now()+msg.ms; view.totalMs=msg.total;
    clearInterval(roleTick);
    renderRoleCard();
    renderMiniRole();
    $('loupAskBox').style.display = isMayor() ? 'none' : 'flex';
    $('loupAskInput').value='';
    renderFeed(true);
    gotoScreen('game');
    clearInterval(gameTick);
    gameTick=setInterval(updateGameTimer, 250);
    updateGameTimer();
    refreshBanner();
  }
  function updateGameTimer(){
    if(view.phase!=='asking'){ clearInterval(gameTick); return; }
    var left=Math.max(0, view.endsAt-Date.now());
    $('loupTimerFill').style.width=(left/view.totalMs*100)+'%';
    var m=Math.floor(left/60000), s=Math.floor(left/1000)%60;
    $('loupTimerText').textContent='⏳ '+m+':'+(s<10?'0':'')+s;
  }
  function renderMiniRole(){
    var r=roleText();
    var html='<span>'+r.ico+' <b>'+r.name+'</b>'+(isMayor()?' · 👑 <b>MAIRE</b>':'')+'</span>';
    html+='<span>Mot : <b>'+(me.word?escapeHtml(me.word):'???')+'</b></span>';
    if(!isMayor()) html+='<span>Maire : <b>'+escapeHtml(pname(ls.mayorSeat))+'</b></span>';
    if(me.role==='loup' && me.loups.length>1) html+='<span>Meute : <b>'+me.loups.filter(function(s){ return s!==mySeat; }).map(pname).map(escapeHtml).join(', ')+'</b></span>';
    $('loupMiniRole').innerHTML=html;
  }
  function renderFeed(scroll){
    var feed=$('loupFeed'), atBottom=feed.scrollHeight-feed.scrollTop-feed.clientHeight<40;
    var html='', mayor=isMayor() && view.phase==='asking';
    if(!view.questions.length){
      html='<p class="loup-sys">'+(isMayor() ? 'Les questions vont arriver ici. Réponds avec les boutons.' : 'Pose la première question au Maire ! Tu peux aussi proposer directement un mot.')+'</p>';
    }
    view.questions.forEach(function(q){
      var a=q.ans?ANSWERS[q.ans]:null;
      html+='<div class="loup-q'+(q.ans?'':' pending')+(q.seat===mySeat?' mine':'')+'">'+
        '<span class="who" style="color:'+pcolor(q.seat)+'">'+escapeHtml(pname(q.seat))+'</span>'+
        '<span class="txt">'+escapeHtml(q.text)+
        (mayor && !q.ans ? mayorButtons(q.id) : '')+'</span>'+
        (a ? '<span class="ans '+a.cls+'">'+a.label+'</span>' : (mayor?'':'<span class="ans" style="color:#888">…</span>'))+
        '</div>';
    });
    feed.innerHTML=html;
    if(scroll || atBottom) feed.scrollTop=feed.scrollHeight;
    if(mayor){
      var btns=feed.querySelectorAll('.loup-mayor-btns button');
      for(var i=0;i<btns.length;i++){
        btns[i].addEventListener('click',function(){
          var id=parseInt(this.getAttribute('data-id'),10), ans=this.getAttribute('data-ans');
          if(ans==='found' && !confirm('Confirmer : le mot a été trouvé ?')) return;
          sfxToggle();
          if(netRole==='host') hostAnswer(0, id, ans); else net.send({type:'answer', id:id, ans:ans});
        });
      }
    }
    var pending=view.questions.filter(function(q){ return !q.ans; }).length;
    var mine=view.questions.filter(function(q){ return !q.ans && q.seat===mySeat; }).length;
    var st=$('loupGameStatus');
    if(isMayor()) st.textContent= pending ? (pending+' question(s) en attente de ta réponse') : 'Aucune question en attente.';
    else st.textContent= mine>=MAX_PENDING ? 'Attends que le Maire réponde à tes questions avant d’en poser d’autres.' : 'Jetons du Maire restants : 🔥 '+view.tokens.hot+' · 🧊 '+view.tokens.cold;
  }
  function mayorButtons(id){
    var order=['yes','no','maybe','hot','cold','found'], html='<div class="loup-mayor-btns">';
    order.forEach(function(k){
      var dis=(k==='hot'||k==='cold') && view.tokens[k]<=0;
      html+='<button class="'+ANSWERS[k].cls+'" data-id="'+id+'" data-ans="'+k+'"'+(dis?' disabled':'')+'>'+ANSWERS[k].label+'</button>';
    });
    return html+'</div>';
  }
  function submitQuestion(){
    var inp=$('loupAskInput'), text=inp.value.trim();
    if(!text){ shake(inp); return; }
    var mine=view.questions.filter(function(q){ return !q.ans && q.seat===mySeat; }).length;
    if(mine>=MAX_PENDING){ shake(inp); return; }
    inp.value='';
    if(netRole==='host') hostAsk(0, text); else net.send({type:'ask', text:text});
  }
  $('loupAskBtn').addEventListener('click', submitQuestion);
  $('loupAskInput').addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); submitQuestion(); } });

  /* ----- votes ----- */
  var voteTick=null;
  function onVoteStart(msg){
    view.phase='vote'; view.voteKind=msg.kind;
    clearInterval(gameTick); clearInterval(roleTick);
    var iVote=msg.voters.indexOf(mySeat)!==-1;
    view.voted=!!msg.alreadyVoted; view.voteTarget=null;
    if(msg.kind==='voyant'){
      $('loupVoteTitle').textContent='🎯 MOT TROUVÉ !';
      $('loupVoteSubtitle').innerHTML='Le mot était <b>'+escapeHtml(msg.word||'')+'</b>'+(msg.foundBy>=0?' (trouvé par <b>'+escapeHtml(pname(msg.foundBy))+'</b>)':'')+'. '+
        (iVote ? '🐺 À la meute de démasquer le <b>Voyant</b> !' : 'Les Loups cherchent le Voyant... Croisez les doigts !');
    } else {
      $('loupVoteTitle').textContent='⌛ TEMPS ÉCOULÉ !';
      $('loupVoteSubtitle').innerHTML='Le mot n’a pas été trouvé. Votez contre le joueur que vous pensez être un <b>Loup</b>.';
    }
    var html='';
    ls.roundSeats.forEach(function(s){
      if(!ls.players[s]) return;
      var can = iVote && s!==mySeat && !(msg.kind==='voyant' && me.loups.indexOf(s)!==-1);
      html+=playerRow(s, (s===ls.mayorSeat?'<span class="imp-tag">👑 Maire</span>':'')+
        (can ? '<button class="cham-vote-btn" data-seat="'+s+'"'+(view.voted?' disabled':'')+'><span>'+(msg.kind==='voyant'?'C’est le Voyant':'Accuser')+'</span></button>' : ''));
    });
    $('loupVoteList').innerHTML=html;
    var btns=$('loupVoteList').querySelectorAll('.cham-vote-btn');
    for(var i=0;i<btns.length;i++){
      btns[i].addEventListener('click',function(){
        if(view.voted) return;
        view.voted=true;
        var t=parseInt(this.getAttribute('data-seat'),10);
        this.classList.add('voted');
        for(var j=0;j<btns.length;j++) btns[j].disabled=true;
        sfxValidate();
        if(netRole==='host') hostVote(0, t); else net.send({type:'vote', target:t});
      });
    }
    view.voters=msg.voters;
    renderVoteStatus(msg.voted||[]);
    var endsAt=Date.now()+msg.ms;
    clearInterval(voteTick);
    voteTick=setInterval(function(){
      if(view.phase!=='vote'){ clearInterval(voteTick); return; }
      var left=Math.max(0,endsAt-Date.now());
      $('loupVoteTimerFill').style.width=(left/msg.total*100)+'%';
      $('loupVoteTimerText').textContent=Math.ceil(left/1000)+' s';
    }, 250);
    gotoScreen('vote');
    sfxToggle();
  }
  function renderVoteStatus(voted){
    var n=voted.length, total=(view.voters||[]).length;
    $('loupVoteStatus').textContent=(view.voted?'Vote envoyé. ':'')+n+' / '+total+' vote(s)';
  }

  /* ----- résultat ----- */
  function showResult(msg){
    inRound=false; view.phase='result';
    clearInterval(gameTick); clearInterval(voteTick); clearInterval(roleTick);
    if(msg.scores) ls.scores=msg.scores.slice();
    var mine=msg.winners.indexOf(mySeat)!==-1, inThis=msg.roundSeats.indexOf(mySeat)!==-1;
    var b=$('loupResultBanner');
    b.textContent = msg.winner==='village' ? '🧑‍🌾 LE VILLAGE GAGNE !' : '🐺 LES LOUPS GAGNENT !';
    b.className='cham-result-banner '+(msg.winner==='village'?'b-perfect':'b-fail');
    var acc = msg.accused>=0 ? '<br>'+(msg.kind==='voyant'?'Les Loups ont désigné ':'Le village a accusé ')+'<b>'+escapeHtml(pname(msg.accused))+'</b> ('+ROLES[msg.roles[msg.accused]].name.toLowerCase()+').' : '';
    $('loupResultText').innerHTML='Le mot était <b>'+escapeHtml(msg.word||'?')+'</b>.<br>'+escapeHtml(msg.reason)+acc;
    var html='';
    msg.roundSeats.forEach(function(s){
      if(!ls.players[s]) return;
      var r=ROLES[msg.roles[s]];
      html+=playerRow(s, '<span class="imp-tag">'+r.ico+' '+r.name+(s===msg.mayorSeat?' · 👑':'')+'</span>'+
        '<span class="cham-vote-count">'+(ls.scores[s]||0)+' pts'+(msg.winners.indexOf(s)!==-1?' +1':'')+'</span>');
    });
    $('loupScoreList').innerHTML=html;
    var host=netRole==='host';
    $('loupNextRoundBtn').style.display=host?'inline-block':'none';
    $('loupWaitingHostLabel').style.display=host?'none':'inline-block';
    $('loupWaitingHostLabel').textContent="⏳ En attente que l'hôte lance une nouvelle manche...";
    sfxReveal(inThis ? (mine?100:0) : 50);
    hideBanner();
    gotoScreen('result');
  }

  /* ---------- API pour le hub ---------- */
  CG.loup={
    reset:function(){
      if(netRole) cleanupOnline();
      closeModal('loupDisconnectModal');
      gotoScreen('online');
    },
    enterJoinFlow:function(code){
      gotoScreen('online');
      $('loupJoinCode').value=decodeURIComponent(code).toUpperCase();
    }
  };
})();
