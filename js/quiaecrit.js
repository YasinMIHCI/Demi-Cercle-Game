/* Qui a écrit ça ? — réponses anonymes et devinettes (3 à 8 joueurs en ligne).
   Une question drôle (« Ce que tu penses vraiment des pieds ? ») : chacun
   répond par écrit, en secret. Les réponses sont ensuite révélées une par une,
   mélangées, et tout le monde vote : qui a écrit ça ? L'auteur vote aussi
   (pour bluffer), mais son vote ne compte pas. +1 par bonne devinette, et
   l'auteur gagne +1 par joueur berné (3 au maximum).
   L'hôte fait autorité : il garde les auteurs secrets jusqu'à la révélation. */
(function(){
  'use strict';
  var CG=window.CG;
  var $=CG.$, escapeHtml=CG.escapeHtml, shuffle=CG.shuffle, shake=CG.shake, openModal=CG.openModal, closeModal=CG.closeModal;
  var sfxToggle=CG.sfxToggle, sfxValidate=CG.sfxValidate, sfxReveal=CG.sfxReveal, copyText=CG.copyText;

  var ROOM_PREFIX='cgquiaecrit-';
  var MIN_PLAYERS=3, MAX_PLAYERS=8;
  var WRITE_MS=90000, GUESS_MS=30000, MAX_LEN=140, FOOL_MAX=3;
  var COLORS=['#E60012','#2E6FF2','#FFE600','#7cff6e','#ff6ec7','#ff9d2f','#00e5ff','#b388ff'];
  var CUSTOM_KEY='qae_custom_v1';
  /* forme des réponses : texte, dessin ou emojis (l'hôte choisit, ou chacun choisit)
     une réponse = {k:'t'|'d'|'e', v:texte | image PNG en data URL | emojis} */
  var EMOJI_MAX=40, DRAW_MAX=200000;
  var EMOJI_RE=/^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|\p{Emoji_Modifier}|\u200d|\ufe0f|\s)+$/u;
  var DATA_RE=/^data:image\/png;base64,[A-Za-z0-9+\/=]+$/;
  function cleanAnswer(a){
    if(typeof a==='string') a={k:'t', v:a};
    if(!a || typeof a!=='object') return null;
    var v=String(a.v||'');
    if(a.k==='d') return (v.length<=DRAW_MAX && DATA_RE.test(v)) ? {k:'d', v:v} : null;
    if(a.k==='e'){
      v=v.replace(/\s+/g,' ').trim().slice(0,EMOJI_MAX);
      return (v && EMOJI_RE.test(v) && /\p{Extended_Pictographic}/u.test(v)) ? {k:'e', v:v} : null;
    }
    v=v.replace(/\s+/g,' ').trim().slice(0,MAX_LEN);
    return v ? {k:'t', v:v} : null;
  }
  /* affiche une réponse dans un élément (sans jamais passer par innerHTML pour le contenu) */
  function showAnswer(el, a){
    el.innerHTML='';
    el.className=(el.getAttribute('data-base')||'')+' ans-'+(a&&a.k||'t');
    if(!a) return;
    if(a.k==='d'){ var img=document.createElement('img'); img.src=a.v; img.alt='Dessin'; el.appendChild(img); }
    else el.textContent=a.v;
  }

  var DEFAULT_QUESTIONS=[
    /* ce que tu penses vraiment de... */
    "Ce que tu penses vraiment des pieds ?","Ce que tu penses vraiment des pigeons ?","Ce que tu penses vraiment des clowns ?",
    "Ce que tu penses vraiment des chaussettes dans les sandales ?","Ce que tu penses vraiment de l'ananas sur la pizza ?",
    "Ce que tu penses vraiment des gens qui répondent juste « ok » ?","Ce que tu penses vraiment des vocaux de 5 minutes ?",
    "Ce que tu penses vraiment du lundi matin ?","Ce que tu penses vraiment de la coriandre ?","Ce que tu penses vraiment des moustaches ?",
    "Ce que tu penses vraiment des gens qui applaudissent quand l'avion atterrit ?","Ce que tu penses vraiment de ton voisin ?",
    "Ce que tu penses vraiment des gens qui marchent lentement devant toi ?","Ce que tu penses vraiment des gens qui parlent au cinéma ?",
    "Ce que tu penses vraiment des escargots dans l'assiette ?","Ce que tu penses vraiment des chats ?","Ce que tu penses vraiment des licornes ?",
    "Ce que tu penses vraiment des selfies à la salle de sport ?","Ce que tu penses vraiment du ketchup sur les pâtes ?",
    "Ce que tu penses vraiment des gens qui mettent des emojis partout ?","Ce que tu penses vraiment des crocs ?",
    /* hontes et souvenirs */
    "Ton pire souvenir de soirée ?","Ta plus grosse honte au collège ?","La bêtise d'enfance que tes parents ignorent encore ?",
    "Ton pire moment de solitude ?","Le message que tu regrettes d'avoir envoyé ?","Le pire SMS envoyé à la mauvaise personne ?",
    "La chose la plus gênante que tu aies dite à un prof ?","Ton pire rendez-vous amoureux ?","Ta pire coupe de cheveux ?",
    "Le pire endroit où tu t'es endormi(e) ?","Ton pire fail en cuisine ?","La chose la plus chère que tu aies cassée ?",
    "Ton plus gros caprice d'enfant ?","Le dernier mensonge que tu as dit à tes parents ?","Ta pire prise de bec avec un inconnu ?",
    "Le jeu vidéo sur lequel tu as le plus rage quit ?","La chose la plus « hors-la-loi » que tu aies faite ?","Le dernier truc qui t'a fait pleurer ?",
    /* secrets inavouables */
    "Ce que tu fais quand personne ne te regarde ?","La dernière recherche Google que tu n'assumes pas ?","L'appli la plus honteuse sur ton téléphone ?",
    "La musique que tu écoutes en cachette ?","Le film que tu fais semblant d'avoir vu ?","Ton crush de célébrité le plus gênant ?",
    "Le mensonge que tu racontes le plus souvent ?","Ce que contient vraiment ta galerie photo ?","Ton record de jours sans te laver les cheveux ?",
    "Ta phobie la plus ridicule ?","Un secret sur toi que personne ici ne connaît ?","Ta technique de drague secrète ?",
    "La chose la plus bizarre dans ton frigo en ce moment ?","Ta dernière dépense complètement inutile ?","Le défaut que tu ne corrigeras jamais ?",
    "Ton pire tic de langage ?","La phrase que tu dis le plus souvent ?","Ce que tu chantes sous la douche ?",
    /* imagination */
    "Le titre de ton autobiographie ?","Le slogan de ta campagne présidentielle ?","La première loi que tu voterais si tu étais président(e) ?",
    "Ce que tu ferais si tu étais invisible pendant une journée ?","Ce que tu ferais en premier pendant une apocalypse zombie ?",
    "Ce que tu ferais si tu te réveillais dans le corps du joueur à ta gauche ?","Le nom que tu donnerais à ton yacht ?",
    "Le pire prénom que tu donnerais à ton enfant ?","Ce que tu ferais avec 1 million d'euros, à dépenser en 24 heures ?",
    "Si tu étais un plat, lequel et pourquoi ?","Ton animal totem, et pourquoi ?","Le seul aliment que tu mangerais toute ta vie ?",
    "Ta théorie du complot préférée ?","Le pire boulot que tu pourrais faire ?","Ce que tu dirais à ton toi de 12 ans ?",
    "Ton rêve le plus bizarre ?","Décris ta chambre en 3 mots ?","Ce que tu crierais en gagnant un combat contre un ours ?",
    "Le super-pouvoir le plus nul que tu voudrais quand même ?","Ton dernier repas si c'était le dernier ?","Ta réplique culte si tu étais un méchant de film ?",
    /* cadeaux et autres */
    "Le pire cadeau que tu aies reçu ?","Le pire cadeau que tu aies offert ?","Le pire conseil qu'on t'ait donné ?",
    "Le compliment le plus bizarre qu'on t'ait fait ?","La chose que tu ne prêterais jamais, même à ton meilleur ami ?",
    "Ton talent complètement inutile ?","Ton plat signature (même s'il est raté) ?","Le surnom le plus nul qu'on t'ait donné ?",
    "La pire excuse que tu aies donnée pour annuler un plan ?","Ton excuse pour être en retard aujourd'hui ?","Le plat que tout le monde aime sauf toi ?"
  ];
  function loadCustom(){
    try{ var arr=JSON.parse(localStorage.getItem(CUSTOM_KEY)||'[]'); if(Array.isArray(arr)) return arr.filter(function(q){ return typeof q==='string' && q; }); }catch(e){}
    return [];
  }
  var custom=loadCustom();
  function bank(){ return custom.concat(DEFAULT_QUESTIONS); }

  /* hôte : état qui fait foi (les auteurs restent secrets jusqu'à la révélation) */
  var qs={
    players:[], scores:[], connected:[], clientIds:[],
    phase:'lobby',           /* 'lobby' | 'writing' | 'guess' | 'reveal' | 'scores' | 'over' | 'lobby_wait' */
    round:0, roundSeats:[], question:'', answers:{}, order:[], idx:0, votes:{}, laughs:{}, pool:[],
    deadline:0, timer:null, lastMsg:null, started:false,
    format:'t', anon:false         /* réglages de la manche : 't' | 'd' | 'e' | 'free', mode anonyme */
  };
  var netRole=null, mySeat=0, myName='', roomCode='';
  var inRound=false, roundLiveForLobby=false;
  var view={roundSeats:[], written:[], sent:false, voted:[], myVote:null, writers:[]};
  var writeBar=CG.timerBar('qaeWriteTimerFill','qaeWriteTimerText');
  var guessBar=CG.timerBar('qaeGuessTimerFill','qaeGuessTimerText');

  /* ===================== RÉSEAU ===================== */
  var ui=CG.roomUI('qae', {route:'quiaecrit', code:function(){ return roomCode; },
    onLostBack:function(){ cleanupOnline(); gotoScreen('online'); }});
  var setNetStatus=ui.setStatus, showBanner=ui.showBanner, hideBanner=ui.hideBanner, showLostModal=ui.showLost, gotoScreen=ui.goto;
  var seats=CG.seatTools(qs), isConnected=seats.isConnected, activeCount=seats.activeCount;
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
  /* l'hôte a disparu : on reprend la salle, retour au lobby avec les scores */
  function onPromote(info){
    netRole='host'; mySeat=0; roomCode=net.code;
    CG.promoteSeats(qs, info);
    clearTimeout(qs.timer); qs.timer=null;
    stopBars();
    inRound=false; roundLiveForLobby=false;
    qs.started=true; qs.phase='lobby_wait'; qs.answers={}; qs.order=[]; qs.votes={}; qs.laughs={}; qs.lastMsg=null;
    qs.pool=shuffle(bank());
    $('qaeCodeDisplay').textContent=roomCode;
    hideBanner();
    hostBroadcastLobby();
    gotoScreen('lobby');
    $('qaeLobbyStatus').textContent=CG.PROMOTED_TEXT;
  }
  var broadcast=net.broadcast, sendToSeat=net.sendToSeat;

  function stopBars(){ writeBar.stop(); guessBar.stop(); }
  function cleanupOnline(){
    net.close(netRole==='host' ? {type:'room_closed'} : null);
    clearTimeout(qs.timer); qs.timer=null;
    stopBars();
    netRole=null; mySeat=0; roomCode='';
    inRound=false; roundLiveForLobby=false;
    qs.players=[]; qs.scores=[]; qs.connected=[]; qs.clientIds=[];
    qs.phase='lobby'; qs.round=0; qs.roundSeats=[]; qs.answers={}; qs.order=[]; qs.votes={}; qs.laughs={}; qs.lastMsg=null; qs.started=false;
    $('qaeRoundBadge').style.display='none';
    hideBanner();
    setNetStatus('offline','HORS LIGNE');
  }

  function isRoundLive(){ return qs.phase==='writing' || qs.phase==='guess' || qs.phase==='reveal' || qs.phase==='scores'; }
  function pname(seat){ var p=qs.players[seat]; return p?p.name:'?'; }
  function pcolor(seat){ return COLORS[seat%COLORS.length]; }

  /* ----- création / connexion ----- */
  function renderBankCount(){ $('qaeBankCount').textContent=bank().length+' questions'; }
  $('qaeAddQBtn').addEventListener('click',function(){
    var q=$('qaeCustomQ').value.trim();
    if(!q){ shake($('qaeCustomQ')); return; }
    if(!/\?\s*$/.test(q)) q+=' ?';
    custom.unshift(q);
    try{ localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom)); }catch(e){}
    $('qaeCustomQ').value='';
    renderBankCount(); sfxToggle();
  });
  $('qaeCreateRoomBtn').addEventListener('click',function(){
    var wantedCode=CG.readRoomCode('qaeHostCode');
    if(!wantedCode){ sfxToggle(); return; }
    myName=$('qaeName').value.trim()||'Joueur';
    cleanupOnline();
    net.host(function(code){
      netRole='host'; mySeat=0; roomCode=code;
      qs.phase='lobby'; qs.pool=shuffle(bank());
      qs.players=[{name:myName}]; qs.scores=[0]; qs.connected=[true]; qs.clientIds=[net.clientId];
      try{ history.replaceState(null,'','#quiaecrit?room='+code); }catch(e){}
      $('qaeCodeDisplay').textContent=code;
      renderLobby();
      gotoScreen('lobby');
    }, wantedCode);
    sfxToggle();
  });
  $('qaeJoinCode').addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); $('qaeJoinRoomBtn').click(); } });
  $('qaeJoinRoomBtn').addEventListener('click',function(){
    myName=$('qaeName').value.trim()||'Joueur';
    var code=CG.cleanRoomCode($('qaeJoinCode').value);
    if(!code){ shake($('qaeJoinCode')); return; }
    cleanupOnline();
    netRole='guest';
    net.join(code, {name:myName});
    sfxToggle();
  });
  $('qaeBackFromLobby').addEventListener('click',function(){ sfxToggle(); cleanupOnline(); gotoScreen('online'); });
  $('qaeHubReturnBtn').addEventListener('click',function(){ sfxToggle(); location.hash='hub'; });
  CG.wireModal('qaeRulesModal', 'qaeRulesBtn');

  /* ===================== HÔTE : PLACES ===================== */
  function hostOnJoinRequest(msg){
    var back=seats.returningSeat(msg); if(back) return back;
    if(activeCount()>=MAX_PLAYERS) return 'SALLE COMPLÈTE ('+MAX_PLAYERS+'/'+MAX_PLAYERS+')';
    return Math.max(1, qs.players.length);
  }
  function hostOnSeatJoined(seat, msg, isRepeat){
    var p=qs.players[seat];
    if(p){ if(msg.name) p.name=msg.name; }
    else { qs.players[seat]={name:msg.name||'Joueur'}; qs.scores[seat]=0; }
    qs.clientIds[seat]=msg.clientId||null;
    qs.connected[seat]=true;
    net.sendTo(seat, {type:'seat_assigned', seat:seat, players:qs.players.slice(), scores:qs.scores.slice(),
      connected:qs.connected.slice(), inRound:isRoundLive()});
    hostResync(seat);
    hostBroadcastLobby();
    if(!isRepeat) sfxValidate();
  }
  /* remet un joueur revenu au bon écran */
  function hostResync(seat){
    var inThis=qs.roundSeats.indexOf(seat)!==-1;
    if(qs.phase==='writing' && inThis) net.sendTo(seat, writeMsg(seat));
    else if(qs.phase==='guess' && inThis) net.sendTo(seat, guessMsg(seat));
    else if(qs.phase==='reveal' && inThis) net.sendTo(seat, revealMsg(seat));
    else if(qs.phase==='scores' && inThis && qs.lastMsg) net.sendTo(seat, qs.lastMsg);
    else if(qs.phase==='over' && qs.lastMsg) net.sendTo(seat, qs.lastMsg);
  }
  function hostOnSeatLost(seat){
    if(!qs.started){
      qs.players[seat]=null; qs.clientIds[seat]=null;
      hostBroadcastLobby();
      return;
    }
    qs.connected[seat]=false;
    hostBroadcastLobby();
    if(!isRoundLive() || qs.roundSeats.indexOf(seat)===-1) return;
    if(qs.roundSeats.filter(isConnected).length<2){ hostAbort('trop de joueurs se sont déconnectés.'); return; }
    if(qs.phase==='writing') hostCheckWritten();
    else if(qs.phase==='guess') hostCheckVotes();
  }
  function hostOnGuestMessage(seat, msg){
    if(msg.type==='write_submit') hostReceiveAnswer(seat, msg.ans!==undefined ? msg.ans : msg.text);
    else if(msg.type==='guess_vote') hostReceiveVote(seat, msg.target);
    else if(msg.type==='laugh') hostReceiveLaugh(seat, msg.idx);
  }
  /* 😂 pendant la révélation : la réponse la plus drôle de la manche rapporte +1 à son auteur
     (on désigne la réponse par son numéro : en mode anonyme, personne ne connaît l'auteur) */
  function hostReceiveLaugh(seat, idx){
    var author=qs.order[qs.idx];
    if(qs.phase!=='reveal' || idx!==qs.idx || seat===author || qs.roundSeats.indexOf(seat)===-1) return;
    var l=qs.laughs[author]=qs.laughs[author]||[];
    if(l.indexOf(seat)!==-1) return;
    l.push(seat);
    broadcast({type:'laugh_status', idx:idx, n:l.length});
  }
  function hostBroadcastLobby(){
    broadcast({type:'lobby_update', players:qs.players.slice(), scores:qs.scores.slice(),
      connected:qs.connected.slice(), inRound:isRoundLive()});
  }
  function setPhaseTimer(ms, fn){
    clearTimeout(qs.timer);
    qs.deadline=Date.now()+ms;
    qs.timer=setTimeout(fn, ms+300);
  }
  function left(){ return Math.max(0, qs.deadline-Date.now()); }

  /* ===================== HÔTE : MANCHE ===================== */
  function writeMsg(seat){
    return {type:'write_start', round:qs.round, question:qs.question, roundSeats:qs.roundSeats.slice(),
      format:qs.format, anon:qs.anon,
      ms:left(), total:WRITE_MS, mine: qs.answers.hasOwnProperty(seat) ? qs.answers[seat] : null,
      written:Object.keys(qs.answers).map(Number)};
  }
  $('qaeStartBtn').addEventListener('click',function(){ sfxValidate(); hostStartRound(); });
  $('qaeNextRoundBtn').addEventListener('click',function(){ sfxToggle(); hostStartRound(); });
  function hostStartRound(){
    var seats=[];
    for(var i=0;i<qs.players.length;i++){ if(qs.players[i] && isConnected(i)) seats.push(i); }
    if(seats.length<MIN_PLAYERS){
      qs.phase='lobby_wait';
      if(qs.started) broadcast({type:'round_aborted', reason:'il faut '+MIN_PLAYERS+' joueurs connectés pour continuer.'});
      else { renderLobby(); gotoScreen('lobby'); }
      setNetStatus('error', MIN_PLAYERS+' JOUEURS CONNECTÉS MINIMUM');
      return;
    }
    setNetStatus('connected','PARTIE EN COURS');
    qs.started=true;
    if(!qs.pool.length) qs.pool=shuffle(bank());
    qs.question=qs.pool.pop();
    qs.round++;
    qs.roundSeats=seats;
    qs.answers={}; qs.order=[]; qs.idx=0; qs.votes={}; qs.laughs={}; qs.lastMsg=null;
    var f=$('qaeFormatSel').value;
    qs.format=['t','d','e','free'].indexOf(f)!==-1 ? f : 't';
    qs.anon=$('qaeAnonChk').checked;
    qs.phase='writing';
    setPhaseTimer(WRITE_MS, function(){ if(qs.phase==='writing') hostStartGuessing(); });
    seats.forEach(function(s){ sendToSeat(s, writeMsg(s)); });
    hostBroadcastLobby();
  }
  function hostReceiveAnswer(seat, ans){
    if(qs.phase!=='writing' || qs.roundSeats.indexOf(seat)===-1 || qs.answers.hasOwnProperty(seat)) return;
    var a=cleanAnswer(ans);
    if(!a || (qs.format!=='free' && a.k!==qs.format)) return;
    qs.answers[seat]=a;
    broadcast({type:'write_status', written:Object.keys(qs.answers).map(Number)});
    hostCheckWritten();
  }
  function hostCheckWritten(){
    if(qs.phase!=='writing') return;
    var pending=qs.roundSeats.filter(function(s){ return isConnected(s) && !qs.answers.hasOwnProperty(s); });
    if(!pending.length){ clearTimeout(qs.timer); qs.timer=setTimeout(hostStartGuessing, 500); }
  }
  function hostStartGuessing(){
    if(qs.phase!=='writing') return;
    qs.order=shuffle(Object.keys(qs.answers).map(Number));
    if(!qs.order.length){ hostAbort('personne n’a répondu à la question.'); return; }
    qs.idx=0;
    hostStartGuess();
  }
  /* message propre à chaque joueur : seul l'auteur sait que c'est sa réponse */
  function guessMsg(seat){
    var author=qs.order[qs.idx];
    return {type:'guess_start', round:qs.round, question:qs.question, roundSeats:qs.roundSeats.slice(),
      writers:qs.order.slice().sort(function(a,b){ return a-b; }),
      idx:qs.idx, count:qs.order.length, ans:qs.answers[author], isMine:seat===author,
      ms:left(), total:GUESS_MS, voted:Object.keys(qs.votes).map(Number),
      myVote: qs.votes.hasOwnProperty(seat) ? qs.votes[seat] : null};
  }
  function hostStartGuess(){
    /* mode anonyme : pas de devinette, la réponse s'affiche directement, sans nom */
    if(qs.anon){
      qs.phase='reveal'; qs.votes={};
      clearTimeout(qs.timer); qs.timer=null;
      qs.roundSeats.forEach(function(s){ sendToSeat(s, revealMsg(s)); });
      hostBroadcastLobby();
      return;
    }
    qs.phase='guess'; qs.votes={};
    setPhaseTimer(GUESS_MS, function(){ if(qs.phase==='guess') hostReveal(); });
    qs.roundSeats.forEach(function(s){ sendToSeat(s, guessMsg(s)); });
    hostBroadcastLobby();
  }
  function hostReceiveVote(seat, target){
    if(qs.phase!=='guess' || qs.roundSeats.indexOf(seat)===-1 || qs.votes.hasOwnProperty(seat)) return;
    if(qs.order.indexOf(target)===-1 || target===seat) return;
    qs.votes[seat]=target;
    broadcast({type:'vote_status', voted:Object.keys(qs.votes).map(Number)});
    hostCheckVotes();
  }
  function hostCheckVotes(){
    if(qs.phase!=='guess') return;
    var pending=qs.roundSeats.filter(function(s){ return isConnected(s) && !qs.votes.hasOwnProperty(s); });
    if(!pending.length){ clearTimeout(qs.timer); qs.timer=setTimeout(hostReveal, 400); }
  }
  function hostReveal(){
    if(qs.phase!=='guess') return;
    clearTimeout(qs.timer); qs.timer=null;
    var author=qs.order[qs.idx], pts={}, correct=[], fooled=0;
    Object.keys(qs.votes).forEach(function(v){
      v=Number(v);
      if(v===author) return;                       /* le vote de l'auteur n'était qu'un bluff */
      if(qs.votes[v]===author){ correct.push(v); pts[v]=(pts[v]||0)+1; }
      else fooled++;
    });
    if(fooled) pts[author]=Math.min(FOOL_MAX, fooled);
    Object.keys(pts).forEach(function(s){ qs.scores[s]=(qs.scores[s]||0)+pts[s]; });
    qs.phase='reveal';
    qs.lastReveal={correct:correct, pts:pts};
    qs.roundSeats.forEach(function(s){ sendToSeat(s, revealMsg(s)); });
    hostBroadcastLobby();
  }
  /* révélation d'une réponse, propre à chaque joueur (en mode anonyme, seul l'auteur sait que c'est la sienne) */
  function revealMsg(seat){
    var author=qs.order[qs.idx], r=qs.anon ? {correct:[], pts:{}} : (qs.lastReveal||{correct:[], pts:{}});
    return {type:'guess_reveal', round:qs.round, question:qs.question, idx:qs.idx, count:qs.order.length,
      ans:qs.answers[author], anon:qs.anon, author:qs.anon ? -1 : author, isMine:seat===author,
      votes:qs.anon ? {} : qs.votes, correct:r.correct, pts:r.pts, scores:qs.scores.slice(),
      last:qs.idx>=qs.order.length-1, laughs:(qs.laughs[author]||[]).length};
  }
  $('qaeNextAnswerBtn').addEventListener('click',function(){
    if(netRole!=='host' || qs.phase!=='reveal') return;
    sfxToggle();
    if(qs.idx<qs.order.length-1){ qs.idx++; hostStartGuess(); return; }
    /* toutes les réponses sont passées : récap de la manche */
    qs.phase='scores';
    var all={}, laughs={}, best=0;
    qs.order.forEach(function(s){ all[s]=qs.answers[s]; laughs[s]=(qs.laughs[s]||[]).length; best=Math.max(best, laughs[s]); });
    var funniest=best ? qs.order.filter(function(s){ return laughs[s]===best; }) : [];
    if(qs.anon){
      /* anonyme : liste dans l'ordre de passage, sans auteur ni point (un point trahirait l'auteur) */
      var list=qs.order.map(function(s){ return {ans:qs.answers[s], laughs:laughs[s], top:funniest.indexOf(s)!==-1}; });
      qs.lastMsg={type:'round_scores', round:qs.round, question:qs.question, anon:true, list:list, scores:qs.scores.slice()};
    } else {
      funniest.forEach(function(s){ qs.scores[s]=(qs.scores[s]||0)+1; });
      qs.lastMsg={type:'round_scores', round:qs.round, question:qs.question, answers:all, laughs:laughs, funniest:funniest, scores:qs.scores.slice()};
    }
    broadcast(qs.lastMsg);
    hostBroadcastLobby();
    if(CG.partyEnd) CG.partyEnd(qs.players, qs.scores);
  });
  function hostAbort(reason){
    clearTimeout(qs.timer); qs.timer=null;
    qs.phase='lobby_wait';
    broadcast({type:'round_aborted', reason:reason});
    hostBroadcastLobby();
  }
  $('qaeEndGameBtn').addEventListener('click',function(){
    if(netRole!=='host' || qs.phase!=='scores') return;
    sfxValidate();
    qs.phase='over';
    qs.lastMsg={type:'game_over', scores:qs.scores.slice(), players:qs.players.slice(), anyScored:qs.scores.some(function(x){ return x>0; })};
    broadcast(qs.lastMsg);
    hostBroadcastLobby();
  });
  $('qaeNewGameBtn').addEventListener('click',function(){
    if(netRole!=='host') return;
    sfxToggle();
    for(var s=1;s<qs.players.length;s++){ if(qs.players[s] && !isConnected(s)){ qs.players[s]=null; qs.clientIds[s]=null; } }
    for(s=0;s<qs.players.length;s++) qs.scores[s]=0;
    qs.phase='lobby'; qs.round=0; qs.lastMsg=null; qs.started=false;
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
        qs.players=msg.players.slice(); qs.scores=(msg.scores||[]).slice(); qs.connected=(msg.connected||[]).slice();
        roundLiveForLobby=!!msg.inRound; inRound=false;
        $('qaeCodeDisplay').textContent=roomCode;
        renderLobby(); gotoScreen('lobby');
        break;
      case 'lobby_update':
        qs.players=msg.players.slice(); if(msg.scores) qs.scores=msg.scores.slice(); if(msg.connected) qs.connected=msg.connected.slice();
        roundLiveForLobby=!!msg.inRound;
        renderLobby(); refreshBanner();
        break;
      case 'write_start': onWriteStart(msg); break;
      case 'write_status': if(inRound){ view.written=msg.written; renderWriteStatus(); } break;
      case 'guess_start': onGuessStart(msg); break;
      case 'vote_status': if(inRound){ view.voted=msg.voted; renderVoteStatus(); } break;
      case 'laugh_status': if(msg.idx===view.revealIdx) renderLaugh(msg.n); break;
      case 'guess_reveal': onReveal(msg); break;
      case 'round_scores': onRoundScores(msg); break;
      case 'game_over': showGameOver(msg); break;
      case 'back_to_lobby':
        inRound=false; stopBars();
        renderLobby(); gotoScreen('lobby');
        break;
      case 'round_aborted':
        inRound=false; roundLiveForLobby=false; stopBars();
        renderLobby(); gotoScreen('lobby');
        $('qaeLobbyStatus').textContent='⚠ Manche annulée : '+msg.reason;
        hideBanner();
        break;
      case 'room_closed':
        net.close(); showLostModal("L'hôte a fermé la salle.");
        break;
    }
  }

  /* ===================== AFFICHAGE ===================== */
  function refreshBanner(){
    if(!netRole || !inRound){ hideBanner(); return; }
    var missing=view.roundSeats.filter(function(s){ return qs.players[s] && !isConnected(s); }).map(pname);
    if(missing.length) showBanner(CG.missingText(missing));
    else hideBanner();
  }
  function setRound(round){
    $('qaeRoundBadge').textContent='MANCHE N°'+round;
    $('qaeRoundBadge').style.display='inline-block';
  }
  function dot(s){ return CG.playerDot(pcolor(s)); }
  function playerRow(s, extra){
    var p=qs.players[s]||{name:'?'};
    return CG.playerRow({name:p.name, color:pcolor(s), me:s===mySeat, off:!isConnected(s), extra:extra});
  }
  function renderLobby(){
    var html='';
    for(var s=0;s<qs.players.length;s++){
      if(!qs.players[s]) continue;
      html+=playerRow(s, '<span class="cham-vote-count">'+(qs.scores[s]||0)+' pts</span>');
    }
    $('qaePlayerList').innerHTML=html;
    var count=activeCount();
    var live = netRole==='host' ? isRoundLive() : roundLiveForLobby;
    var st=$('qaeLobbyStatus');
    if(live) st.textContent='Une manche est en cours — tu joueras dès la prochaine.';
    else if(count<MIN_PLAYERS) st.textContent=count+' joueur(s) connecté(s) — '+MIN_PLAYERS+' minimum pour lancer la partie.';
    else st.textContent = netRole==='host' ? (count+' joueurs prêts. Tu peux lancer la partie !') : (count+" joueurs prêts. En attente que l'hôte lance la partie...");
    $('qaeStartBtn').style.display = (netRole==='host' && count>=MIN_PLAYERS && !live) ? 'inline-block' : 'none';
    $('qaeHostOpts').hidden = netRole!=='host' || live;
  }

  /* ----- écriture : texte, dessin ou emojis ----- */
  var FORMAT_LABEL={t:'✍️ Texte', d:'🎨 Dessin', e:'😀 Emojis'};
  var EMOJIS=['😂','🤣','😭','😍','🥰','😎','🤔','😱','🤢','🤮','😈','💀','👻','🤡','💩','👀','🙈','🔥','💯','❤️','💔','👍','👎','🙏',
    '💪','🍕','🍔','🍟','🍺','🍷','☕','🎉','🎁','⚽','🎮','📱','💸','🚀','🚽','🛏️','🐶','🐱','🐷','🐍','🦄','🌈','☀️','🌧️','⏰','👑'];
  /* petit carnet de dessin : fond blanc, quelques couleurs, effacer / annuler */
  var pad=(function(){
    var cv=$('qaeDrawCanvas'), ctx=cv.getContext('2d'), strokes=[], cur=null, color='#111111', locked=false;
    function redraw(){
      ctx.fillStyle='#fff'; ctx.fillRect(0,0,cv.width,cv.height);
      ctx.lineCap='round'; ctx.lineJoin='round';
      strokes.forEach(function(st){
        ctx.strokeStyle=st.c; ctx.lineWidth=st.w;
        ctx.beginPath(); ctx.moveTo(st.p[0][0], st.p[0][1]);
        if(st.p.length===1) ctx.lineTo(st.p[0][0]+0.1, st.p[0][1]);
        for(var i=1;i<st.p.length;i++) ctx.lineTo(st.p[i][0], st.p[i][1]);
        ctx.stroke();
      });
    }
    function pos(e){
      var r=cv.getBoundingClientRect();
      return [Math.round((e.clientX-r.left)/r.width*cv.width), Math.round((e.clientY-r.top)/r.height*cv.height)];
    }
    cv.addEventListener('pointerdown', function(e){
      if(locked) return;
      e.preventDefault();
      try{ cv.setPointerCapture(e.pointerId); }catch(err){}
      cur={c:color, w:color==='#ffffff'?18:5, p:[pos(e)]}; strokes.push(cur); redraw();
    });
    cv.addEventListener('pointermove', function(e){ if(cur){ cur.p.push(pos(e)); redraw(); } });
    function end(){ cur=null; }
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    var colors=document.querySelectorAll('#qaeDrawColors .qae-color');
    Array.prototype.forEach.call(colors, function(b){
      b.style.background=b.getAttribute('data-c');
      b.addEventListener('click', function(){
        color=b.getAttribute('data-c');
        Array.prototype.forEach.call(colors, function(x){ x.classList.toggle('active', x===b); });
        sfxToggle();
      });
    });
    $('qaeDrawUndo').addEventListener('click', function(){ if(locked) return; strokes.pop(); redraw(); sfxToggle(); });
    $('qaeDrawClear').addEventListener('click', function(){ if(locked) return; strokes=[]; redraw(); sfxToggle(); });
    redraw();
    return {
      reset:function(){ strokes=[]; cur=null; locked=false; redraw(); },
      lock:function(v){ locked=v; },
      empty:function(){ return !strokes.length; },
      show:function(url){ var img=new Image(); img.onload=function(){ ctx.drawImage(img,0,0,cv.width,cv.height); }; img.src=url; },
      data:function(){ return cv.toDataURL('image/png'); }
    };
  })();
  (function(){
    var html='';
    EMOJIS.forEach(function(e){ html+='<button type="button" class="qae-emoji">'+e+'</button>'; });
    $('qaeEmojiPalette').innerHTML=html;
    var btns=$('qaeEmojiPalette').querySelectorAll('.qae-emoji');
    Array.prototype.forEach.call(btns, function(b){
      b.addEventListener('click', function(){
        if(view.sent) return;
        var inp=$('qaeEmojiInput');
        if((inp.value+b.textContent).length>EMOJI_MAX){ shake(inp); return; }
        inp.value+=b.textContent; sfxToggle();
      });
    });
    $('qaeEmojiDel').addEventListener('click', function(){
      if(view.sent) return;
      var arr=Array.from ? Array.from($('qaeEmojiInput').value) : $('qaeEmojiInput').value.split('');
      /* retire le dernier emoji entier (avec ses variantes et liaisons) */
      while(arr.length && /[\u200d\ufe0f]|\p{Emoji_Modifier}/u.test(arr[arr.length-1])) arr.pop();
      arr.pop();
      while(arr.length && arr[arr.length-1]==='\u200d'){ arr.pop(); arr.pop(); }
      $('qaeEmojiInput').value=arr.join('');
      sfxToggle();
    });
    var tabs=$('qaeFormatTabs').querySelectorAll('button');
    Array.prototype.forEach.call(tabs, function(t){
      t.addEventListener('click', function(){ if(view.sent) return; setWriteFormat(t.getAttribute('data-k')); sfxToggle(); });
    });
  })();
  function setWriteFormat(k){
    view.k=k;
    var tabs=$('qaeFormatTabs').querySelectorAll('button');
    Array.prototype.forEach.call(tabs, function(t){ t.classList.toggle('active', t.getAttribute('data-k')===k); });
    $('qaeTextBox').hidden=k!=='t';
    $('qaeDrawBox').hidden=k!=='d';
    $('qaeEmojiBox').hidden=k!=='e';
  }
  function onWriteStart(msg){
    if(!inRound) CG.yourTurn();
    inRound=true; stopBars();
    view.roundSeats=msg.roundSeats.slice(); view.written=msg.written||[]; view.sent=msg.mine!==null && msg.mine!==undefined;
    view.format=msg.format||'t'; view.anon=!!msg.anon;
    setRound(msg.round);
    $('qaeQuestion').textContent=msg.question;
    $('qaeFormatTabs').hidden=view.format!=='free';
    var mine=view.sent ? cleanAnswer(msg.mine) : null;
    setWriteFormat(mine ? mine.k : (view.format==='free' ? 't' : view.format));
    $('qaeAnswerInput').value=(mine && mine.k==='t') ? mine.v : '';
    $('qaeEmojiInput').value=(mine && mine.k==='e') ? mine.v : '';
    pad.reset();
    if(mine && mine.k==='d') pad.show(mine.v);
    $('qaeAnonNote').hidden=!view.anon;
    renderWriteBox();
    renderWriteStatus();
    writeBar.start(msg.ms, msg.total);
    gotoScreen('write');
    refreshBanner();
    sfxToggle();
    if(!view.sent && view.k==='t') setTimeout(function(){ try{ $('qaeAnswerInput').focus(); }catch(e){} }, 350);
  }
  function renderWriteBox(){
    $('qaeAnswerInput').disabled=view.sent;
    $('qaeEmojiInput').disabled=view.sent;
    pad.lock(view.sent);
    $('qaeWriteArea').classList.toggle('sent', view.sent);
    $('qaeAnswerBtn').style.display=view.sent?'none':'inline-block';
    updateCharCount();
  }
  function updateCharCount(){ $('qaeCharCount').textContent=$('qaeAnswerInput').value.length+' / '+MAX_LEN; }
  $('qaeAnswerInput').addEventListener('input', updateCharCount);
  $('qaeAnswerInput').addEventListener('keydown',function(e){ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); $('qaeAnswerBtn').click(); } });
  $('qaeEmojiInput').addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); $('qaeAnswerBtn').click(); } });
  $('qaeAnswerBtn').addEventListener('click',function(){
    if(view.sent) return;
    var a=null;
    if(view.k==='d'){ if(!pad.empty()) a=cleanAnswer({k:'d', v:pad.data()}); if(!a){ shake($('qaeDrawCanvas')); return; } }
    else if(view.k==='e'){ a=cleanAnswer({k:'e', v:$('qaeEmojiInput').value}); if(!a){ shake($('qaeEmojiInput')); return; } }
    else { a=cleanAnswer({k:'t', v:$('qaeAnswerInput').value}); if(!a){ shake($('qaeAnswerInput')); return; } }
    view.sent=true;
    sfxValidate();
    if(netRole==='host') hostReceiveAnswer(0, a); else net.send({type:'write_submit', ans:a});
    renderWriteBox(); renderWriteStatus();
  });
  function renderWriteStatus(){
    var html='';
    view.roundSeats.forEach(function(s){
      if(!qs.players[s]) return;
      html+=playerRow(s, '<span class="cham-vote-count">'+(view.written.indexOf(s)!==-1?'✅':'✍️')+'</span>');
    });
    $('qaeWriteList').innerHTML=html;
    $('qaeWriteStatus').textContent=(view.sent?'Réponse envoyée. ':'')+view.written.length+' / '+view.roundSeats.length+' réponses';
  }

  /* ----- devinettes ----- */
  function onGuessStart(msg){
    inRound=true; stopBars();
    view.roundSeats=msg.roundSeats.slice(); view.voted=msg.voted||[]; view.myVote=msg.myVote; view.writers=msg.writers;
    setRound(msg.round);
    $('qaeGuessQuestion').textContent=msg.question;
    $('qaeGuessProgress').textContent='RÉPONSE '+(msg.idx+1)+' / '+msg.count;
    showCard(msg.ans);
    $('qaeGuessCard').classList.remove('revealed');
    $('qaeGuessHint').textContent = msg.isMine ? '🤫 C’est ta réponse ! Vote pour quelqu’un d’autre pour brouiller les pistes.' : '🔎 Qui a écrit ça ?';
    $('qaeGuessHint').className='qae-hint'+(msg.isMine?' mine':'');
    var html='';
    msg.writers.forEach(function(s){
      if(s===mySeat || !qs.players[s]) return;
      html+='<button class="cls-chip qae-vote" data-seat="'+s+'">'+dot(s)+escapeHtml(pname(s))+'</button>';
    });
    $('qaeVoteChoices').innerHTML=html;
    var btns=$('qaeVoteChoices').querySelectorAll('.qae-vote');
    for(var i=0;i<btns.length;i++){
      var s=parseInt(btns[i].getAttribute('data-seat'),10);
      if(view.myVote!==null) btns[i].disabled=true;
      if(view.myVote===s) btns[i].classList.add('picked');
      btns[i].addEventListener('click', function(){
        if(view.myVote!==null) return;
        view.myVote=parseInt(this.getAttribute('data-seat'),10);
        this.classList.add('picked');
        for(var j=0;j<btns.length;j++) btns[j].disabled=true;
        sfxValidate();
        if(netRole==='host') hostReceiveVote(0, view.myVote); else net.send({type:'guess_vote', target:view.myVote});
        renderVoteStatus();
      });
    }
    $('qaeVoteChoices').style.display='flex';
    $('qaeRevealBox').style.display='none';
    $('qaeHostBtns').style.display='none';
    $('qaeGuessWait').style.display='none';
    renderVoteStatus();
    guessBar.start(msg.ms, msg.total);
    $('qaeGuessTimer').style.display='block';
    gotoScreen('guess');
    refreshBanner();
    sfxToggle();
  }
  function showCard(ans){
    var a=cleanAnswer(ans);
    showAnswer($('qaeGuessText'), a);
    $('qaeGuessCard').classList.toggle('pic', !!a && a.k!=='t');
  }
  function renderVoteStatus(){
    $('qaeVoteStatus').textContent=(view.myVote!==null?'Vote envoyé. ':'')+view.voted.length+' / '+view.roundSeats.length+' votes';
  }
  function onReveal(msg){
    inRound=true; stopBars();
    if(msg.scores) qs.scores=msg.scores.slice();
    setRound(msg.round);
    /* joueur revenu pendant la révélation : on remet la carte de la réponse */
    $('qaeGuessQuestion').textContent=msg.question;
    $('qaeGuessProgress').textContent='RÉPONSE '+(msg.idx+1)+' / '+msg.count;
    showCard(msg.ans);
    $('qaeGuessCard').classList.add('revealed');
    $('qaeGuessHint').className='qae-hint author';
    if(msg.anon) $('qaeGuessHint').innerHTML='🤐 Réponse anonyme'+(msg.isMine?' <small>(c’est la tienne, chut !)</small>':'');
    else $('qaeGuessHint').innerHTML='✍️ Écrit par <b style="color:'+pcolor(msg.author)+'">'+escapeHtml(pname(msg.author))+'</b>'+(msg.author===mySeat?' (toi)':'')+' !';
    $('qaeVoteChoices').style.display='none';
    $('qaeGuessTimer').style.display='none';
    var lines='';
    Object.keys(msg.votes).map(Number).forEach(function(v){
      var t=msg.votes[v], ok=t===msg.author, bluff=v===msg.author;
      lines+='<div class="qae-vote-line">'+dot(v)+'<b>'+escapeHtml(pname(v))+'</b> → '+escapeHtml(pname(t))+
        ' <span class="'+(bluff?'qae-bluff':(ok?'qae-ok':'qae-ko'))+'">'+(bluff?'(bluff 😏)':(ok?'✔':'✘'))+'</span></div>';
    });
    var fooled=msg.pts[msg.author]||0;
    var nonAuthorVotes=Object.keys(msg.votes).filter(function(v){ return Number(v)!==msg.author; }).length;
    var verdict = !nonAuthorVotes ? '😴 Personne n’a voté.' : !msg.correct.length ? '🕵️ Personne n’a trouvé ! '+escapeHtml(pname(msg.author))+' +'+fooled
      : (fooled ? escapeHtml(pname(msg.author))+' a berné '+fooled+' joueur'+(fooled>1?'s':'')+' (+'+fooled+')' : '🎯 Tout le monde l’a reconnu(e) !');
    if(msg.anon) verdict='';
    $('qaeRevealVerdict').innerHTML=verdict;
    $('qaeRevealVotes').innerHTML=lines;
    $('qaeRevealBox').style.display='block';
    view.revealIdx=msg.idx; view.revealMine=!!msg.isMine; view.laughed=false;
    $('qaeLaughBtn').disabled=view.revealMine;
    renderLaugh(msg.laughs||0);
    var host=netRole==='host';
    $('qaeHostBtns').style.display=host?'flex':'none';
    $('qaeNextAnswerBtn').querySelector('span').textContent = msg.last ? '📊 Voir les scores' : '▶ Réponse suivante';
    $('qaeGuessWait').style.display=host?'none':'block';
    $('qaeVoteStatus').textContent='';
    gotoScreen('guess');
    if(msg.anon) sfxReveal(50);
    else if(msg.correct.indexOf(mySeat)!==-1 || (msg.author===mySeat && fooled)) sfxReveal(100);
    else sfxReveal(msg.author===mySeat ? 0 : 20);
  }
  function scoreRows(scores){
    var order=[];
    for(var s=0;s<qs.players.length;s++) if(qs.players[s]) order.push(s);
    order.sort(function(a,b){ return (scores[b]||0)-(scores[a]||0); });
    return order;
  }
  function renderLaugh(n){
    $('qaeLaughCount').textContent = n ? n+' 😂' : '';
    $('qaeLaughBtn').classList.toggle('picked', !!view.laughed);
  }
  $('qaeLaughBtn').addEventListener('click',function(){
    if(view.laughed || view.revealMine || view.revealIdx===undefined) return;
    view.laughed=true; this.disabled=true; this.classList.add('picked');
    CG.sfxToggle(); CG.buzz(30);
    if(netRole==='host') hostReceiveLaugh(0, view.revealIdx); else net.send({type:'laugh', idx:view.revealIdx});
  });
  function onRoundScores(msg){
    inRound=false; stopBars(); hideBanner();
    qs.scores=msg.scores.slice();
    setRound(msg.round);
    $('qaeRecapQuestion').textContent=msg.question;
    var box=$('qaeRecapAnswers'); box.innerHTML='';
    /* une ligne par réponse ; le contenu passe par showAnswer (texte, image ou emojis) */
    function recapRow(seat, ans, n, top){
      var row=document.createElement('div');
      row.className='qae-answer-recap'+(top?' funniest':'');
      row.innerHTML=(seat>=0 ? dot(seat)+'<b>'+escapeHtml(pname(seat))+'</b>' : '<b>🤐</b>')+'<div class="qae-recap-ans" data-base="qae-recap-ans"></div>'+
        (n?'<em>'+(top?'🏅 ':'')+n+' 😂'+(top && seat>=0?' · +1':'')+'</em>':'');
      showAnswer(row.querySelector('.qae-recap-ans'), cleanAnswer(ans));
      box.appendChild(row);
    }
    if(msg.anon) (msg.list||[]).forEach(function(it){ recapRow(-1, it.ans, it.laughs, it.top); });
    else Object.keys(msg.answers).forEach(function(s){
      s=Number(s);
      recapRow(s, msg.answers[s], (msg.laughs||{})[s]||0, (msg.funniest||[]).indexOf(s)!==-1);
    });
    var rows='';
    scoreRows(qs.scores).forEach(function(s){ rows+=playerRow(s, '<span class="cham-vote-count">'+(qs.scores[s]||0)+' pts</span>'); });
    $('qaeScoreList').innerHTML=rows;
    var host=netRole==='host';
    $('qaeNextRoundBtn').style.display=host?'inline-block':'none';
    $('qaeEndGameBtn').style.display=host?'inline-block':'none';
    $('qaeWaitingHostLabel').style.display=host?'none':'inline-block';
    gotoScreen('scores');
  }
  function showGameOver(msg){
    inRound=false; stopBars(); hideBanner();
    qs.scores=msg.scores.slice();
    var order=[];
    for(var s=0;s<msg.players.length;s++) if(msg.players[s]) order.push(s);
    order.sort(function(a,b){ return (msg.scores[b]||0)-(msg.scores[a]||0); });
    var top=order.length ? msg.scores[order[0]]||0 : 0;
    var winners=order.filter(function(s){ return (msg.scores[s]||0)===top; });
    $('qaeWinnerText').textContent=winners.map(function(s){ return (msg.players[s]||{}).name||'?'; }).join(' & ')+(winners.length>1?' L’EMPORTENT !':' L’EMPORTE !');
    var html='';
    order.forEach(function(s,i){
      html+='<div class="cls-podium-row'+(i===0?' first':'')+(s===mySeat?' me':'')+'"><span class="cls-pos">'+(winners.indexOf(s)!==-1?'👑':(i+1))+'</span>'+dot(s)+
        '<span class="cls-slot-name">'+escapeHtml((msg.players[s]||{}).name||'?')+(s===mySeat?' (toi)':'')+'</span><span class="cham-vote-count">'+(msg.scores[s]||0)+' pts</span></div>';
    });
    $('qaeFinalList').innerHTML=html;
    /* partie toute en mode anonyme : aucun point, rien à enregistrer */
    if(CG.account && msg.anyScored!==false) CG.account.recordRanked('quiaecrit', msg.scores, order, mySeat);
    $('qaeNewGameBtn').style.display = netRole==='host' ? 'inline-block' : 'none';
    $('qaeOverWaitLabel').style.display = netRole==='host' ? 'none' : 'inline-block';
    sfxReveal(winners.indexOf(mySeat)!==-1 ? 100 : 50);
    gotoScreen('over');
  }

  /* ---------- API pour le hub ---------- */
  CG.quiaecrit={
    reset:function(){
      if(netRole) cleanupOnline();
      closeModal('qaeDisconnectModal');
      gotoScreen('online');
    },
    enterJoinFlow:function(code){
      gotoScreen('online');
      $('qaeJoinCode').value=CG.cleanRoomCode(decodeURIComponent(code));
    }
  };
  renderBankCount();
})();
