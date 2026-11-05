/* Emoji Quiz — devinettes en emojis (2 à 10 joueurs en ligne).
   Une suite d'emojis cache un film, une série, une expression ou un dessin
   animé. Tout le monde tape ses propositions (autant qu'il veut) ; plus on
   trouve tôt, plus on marque : 100 pour le premier, puis 80, 65, 55, 45…, avec
   un bonus de rapidité. Un indice (première lettre et nombre de lettres)
   apparaît à mi-temps. L'hôte fait autorité : il garde la réponse secrète,
   vérifie les propositions et compte les points. */
(function(){
  'use strict';
  var CG=window.CG;
  var $=CG.$, escapeHtml=CG.escapeHtml, shuffle=CG.shuffle, shake=CG.shake, closeModal=CG.closeModal;
  var sfxToggle=CG.sfxToggle, sfxValidate=CG.sfxValidate, sfxReveal=CG.sfxReveal;

  var ROOM_PREFIX='cgemoji-';
  var MIN_PLAYERS=2, MAX_PLAYERS=10;
  var GUESS_MS=30000, HINT_AT=15000, REVEAL_MS=4500;
  var PLACE_PTS=[100,80,65,55,45,40,35,30,25,20];
  var COLORS=['#E60012','#2E6FF2','#FFE600','#7cff6e','#ff6ec7','#ff9d2f','#00e5ff','#b388ff','#ffffff','#c49a6c'];

  /* [emojis, réponse affichée, autres réponses acceptées, catégorie] */
  var BANK=[
    ['🦁👑','Le Roi Lion',['roi lion'],'Film'],
    ['❄️👸⛄','La Reine des neiges',['reine des neiges','frozen'],'Film'],
    ['🚢🧊💔','Titanic',[],'Film'],
    ['🦖🏝️🚙','Jurassic Park',['jurassic world'],'Film'],
    ['🧙‍♂️💍🌋','Le Seigneur des anneaux',['seigneur des anneaux'],'Film'],
    ['⚡👓🧙','Harry Potter',[],'Film'],
    ['🕷️👨','Spider-Man',['spiderman','spider man'],'Film'],
    ['🦇👨🌃','Batman',[],'Film'],
    ['🐠🔍','Le Monde de Nemo',['nemo','monde de nemo'],'Film'],
    ['🧸🤠🚀','Toy Story',[],'Film'],
    ['👻🚫🔫','SOS Fantômes',['sos fantomes','ghostbusters'],'Film'],
    ['🦈🏖️😱','Les Dents de la mer',['dents de la mer','jaws'],'Film'],
    ['👽📞🏠','E.T.',['et','e t'],'Film'],
    ['🏴‍☠️🚢💀','Pirates des Caraïbes',['pirates des caraibes'],'Film'],
    ['🐀👨‍🍳🇫🇷','Ratatouille',[],'Film'],
    ['🎈🏠👴','Là-haut',['la haut','up'],'Film'],
    ['🤖🌱🚀','WALL-E',['walle','wall e'],'Film'],
    ['🐼🥋','Kung Fu Panda',[],'Film'],
    ['🟢👹🏰','Shrek',[],'Film'],
    ['🦍🏙️✈️','King Kong',[],'Film'],
    ['⏰🔙🚗','Retour vers le futur',['retour vers le futur'],'Film'],
    ['🔴💊🔵🕶️','Matrix',['the matrix'],'Film'],
    ['🐒🌍👨‍🚀','La Planète des singes',['planete des singes'],'Film'],
    ['🃏😈🦇','Joker',['le joker'],'Film'],
    ['🦸‍♂️🛡️🇺🇸','Captain America',[],'Film'],
    ['⭐⚔️🌌','Star Wars',['la guerre des etoiles'],'Film'],
    ['🐟🐟🐟🔍👨','Le Monde de Dory',['monde de dory','dory'],'Film'],
    ['🧞‍♂️🪔🐒','Aladdin',['aladin'],'Dessin animé'],
    ['🐭🎩','Mickey',['mickey mouse'],'Dessin animé'],
    ['🧽🍍🌊','Bob l’éponge',['bob leponge','bob l eponge','spongebob'],'Dessin animé'],
    ['💛👨‍👩‍👧‍👦🍩','Les Simpson',['simpson','simpsons'],'Série'],
    ['🐉⚔️👑❄️','Game of Thrones',['got'],'Série'],
    ['🧪💊🚐','Breaking Bad',[],'Série'],
    ['🔴🦑🎮','Squid Game',[],'Série'],
    ['🏠💰🎭','La Casa de papel',['casa de papel','la casa de papel'],'Série'],
    ['👦🔦🌀👹','Stranger Things',[],'Série'],
    ['☕🛋️👫👫👫','Friends',[],'Série'],
    ['🧟‍♂️🚶','The Walking Dead',['walking dead'],'Série'],
    ['👑🇬🇧','The Crown',['crown'],'Série'],
    ['🐉⚽','Pokémon',['pokemon'],'Jeu vidéo'],
    ['🍄👨🔧','Mario',['super mario'],'Jeu vidéo'],
    ['⛏️🧱🟩','Minecraft',[],'Jeu vidéo'],
    ['🦔💨💍','Sonic',[],'Jeu vidéo'],
    ['🔫🪂🏝️','Fortnite',[],'Jeu vidéo'],
    ['🐔🥚','La poule ou l’œuf',['la poule ou loeuf','poule ou oeuf'],'Expression'],
    ['🌧️🐱🐶','Il pleut des cordes',['pleuvoir des cordes'],'Expression'],
    ['🐟🗓️4️⃣1️⃣','Poisson d’avril',['poisson davril'],'Expression'],
    ['🦆🦆🦆🍽️','Un froid de canard',['froid de canard'],'Expression'],
    ['🐒🦒🔝','Le roi de la jungle',['roi de la jungle'],'Expression'],
    ['🌙🍯','Lune de miel',['lune de miel'],'Expression'],
    ['😺👅','Donner sa langue au chat',['donner sa langue au chat','langue au chat'],'Expression'],
    ['🐮🇪🇸','Parler français comme une vache espagnole',['vache espagnole','comme une vache espagnole'],'Expression'],
    ['🍰🚶','C’est du gâteau',['cest du gateau','du gateau'],'Expression'],
    ['🐻🧸💤','Dormir comme un loir',['dormir comme un loir'],'Expression'],
    ['👀🍎','La prunelle de mes yeux',['prunelle de mes yeux'],'Expression'],
    ['🌹🧔🏰','La Belle et la Bête',['belle et la bete'],'Dessin animé'],
    ['🧜‍♀️🐠🦀','La Petite Sirène',['petite sirene'],'Dessin animé'],
    ['🐘👂🎪','Dumbo',[],'Dessin animé'],
    ['🦌❄️🛷🎅','Noël',['pere noel','le pere noel'],'Fête'],
    ['🎃👻🍬','Halloween',[],'Fête'],
    ['🗼🥖🇫🇷','Paris',[],'Lieu'],
    ['🗽🍎🏙️','New York',['newyork'],'Lieu'],
    ['🎬🌴⭐','Hollywood',[],'Lieu'],
    ['🍕🛵🌋','Naples',[],'Lieu'],
    ['⚽🏆🌍','Coupe du monde',['la coupe du monde','mondial'],'Sport'],
    ['🚴‍♂️🟡🇫🇷','Tour de France',['le tour de france'],'Sport'],
    ['🎾🟠🇫🇷','Roland-Garros',['roland garros'],'Sport'],
    ['🎤👑🕺','Michael Jackson',['mj'],'Célébrité'],
    ['🕷️🧑‍🦱🗽','Peter Parker',[],'Personnage'],
    ['🧑‍🚀🌕👣','Neil Armstrong',['armstrong'],'Célébrité'],
    ['🍎💻📱','Apple',[],'Marque'],
    ['🍔🍟🤡','McDonald’s',['mcdonalds','mcdo','macdo'],'Marque']
  ];

  /* hôte : état qui fait foi */
  var es={players:[], scores:[], connected:[], clientIds:[], phase:'lobby', count:10, pool:[], idx:-1, item:null,
          found:{}, order:[], deadline:0, timer:null, hintTimer:null, lastMsg:null, started:false};
  var netRole=null, mySeat=0, myName='', roomCode='', inGame=false, liveForLobby=false;
  var view={found:[], me:false, endsAt:0, total:GUESS_MS, seats:[]};
  var bar=CG.timerBar('emoTimerFill','emoTimerText');

  var ui=CG.roomUI('emo', {route:'emoji', code:function(){ return roomCode; },
    onLostBack:function(){ cleanup(); ui.goto('online'); }});
  var seats=CG.seatTools(es), isConnected=seats.isConnected, activeCount=seats.activeCount;
  var net=CG.createRoomNet({
    prefix:ROOM_PREFIX,
    onStatus:ui.setStatus,
    onJoinRequest:hostOnJoinRequest,
    onSeatJoined:hostOnSeatJoined,
    onGuestMessage:hostOnGuestMessage,
    onSeatLost:hostOnSeatLost,
    onHostMessage:handleMsg,
    onReconnecting:function(){ ui.showBanner('📡 Connexion perdue — reconnexion en cours...'); },
    onReconnected:function(){ ui.hideBanner(); },
    onLost:function(){ ui.showLost("Impossible de rétablir la connexion avec l'hôte."); },
    onPromote:onPromote
  });
  var broadcast=net.broadcast, sendToSeat=net.sendToSeat;

  function clearTimers(){ clearTimeout(es.timer); es.timer=null; clearTimeout(es.hintTimer); es.hintTimer=null; }
  function cleanup(){
    net.close(netRole==='host' ? {type:'room_closed'} : null);
    clearTimers(); bar.stop();
    netRole=null; mySeat=0; roomCode=''; inGame=false; liveForLobby=false;
    es.players=[]; es.scores=[]; es.connected=[]; es.clientIds=[]; es.phase='lobby'; es.idx=-1; es.lastMsg=null; es.started=false;
    $('emoRoundBadge').style.display='none';
    ui.hideBanner(); ui.setStatus('offline','HORS LIGNE');
  }
  function isLive(){ return es.phase==='guess' || es.phase==='reveal'; }
  function pname(s){ var p=es.players[s]; return p?p.name:'?'; }
  function pcolor(s){ return COLORS[s%COLORS.length]; }

  /* ----- comparaison des propositions : sans accents ni articles, une faute permise ----- */
  var ARTICLES=/^(le|la|les|l|un|une|des|du|the)\s+/;
  function norm(s){
    s=String(s||'').toLowerCase().replace(/[’']/g,' ');
    if(s.normalize) s=s.normalize('NFD').replace(/[̀-ͯ]/g,'');
    s=s.replace(/œ/g,'oe').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim().replace(ARTICLES,'');
    return s.replace(/ /g,'');
  }
  function lev(a,b){
    if(Math.abs(a.length-b.length)>1) return 2;
    var d=[],i,j; for(i=0;i<=a.length;i++){ d[i]=[i]; }
    for(j=0;j<=b.length;j++) d[0][j]=j;
    for(i=1;i<=a.length;i++) for(j=1;j<=b.length;j++) d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
    return d[a.length][b.length];
  }
  function isRight(guess, item){
    var g=norm(guess); if(!g) return false;
    return [item[1]].concat(item[2]).some(function(ans){
      var a=norm(ans);
      return g===a || (a.length>=6 && lev(g,a)<=1);
    });
  }
  function hintOf(item){
    var words=item[1].split(/\s+/);
    return words.map(function(w){
      var letters=w.replace(/[^A-Za-zÀ-ÿ0-9]/g,'');
      return letters ? letters[0].toUpperCase()+' '+'_ '.repeat(Math.max(0,letters.length-1)).trim() : w;
    }).join('   ');
  }

  /* ===================== CRÉER / REJOINDRE ===================== */
  (function(){
    var btns=$('emoCountToggle').querySelectorAll('button');
    for(var i=0;i<btns.length;i++) btns[i].addEventListener('click', function(){
      for(var j=0;j<btns.length;j++) btns[j].classList.remove('active');
      this.classList.add('active'); es.count=parseInt(this.getAttribute('data-count'),10)||10; sfxToggle();
    });
  })();
  $('emoCreateRoomBtn').addEventListener('click',function(){
    var wanted=CG.readRoomCode('emoHostCode');
    if(!wanted){ sfxToggle(); return; }
    myName=$('emoName').value.trim()||'Joueur';
    var count=es.count;
    cleanup(); es.count=count;
    net.host(function(code){
      netRole='host'; mySeat=0; roomCode=code;
      es.players=[{name:myName}]; es.scores=[0]; es.connected=[true]; es.clientIds=[net.clientId];
      try{ history.replaceState(null,'','#emoji?room='+code); }catch(e){}
      $('emoCodeDisplay').textContent=code;
      renderLobby(); ui.goto('lobby');
    }, wanted);
    sfxToggle();
  });
  $('emoJoinCode').addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); $('emoJoinRoomBtn').click(); } });
  $('emoJoinRoomBtn').addEventListener('click',function(){
    myName=$('emoName').value.trim()||'Joueur';
    var code=CG.cleanRoomCode($('emoJoinCode').value);
    if(!code){ shake($('emoJoinCode')); return; }
    cleanup(); netRole='guest';
    net.join(code, {name:myName});
    sfxToggle();
  });
  $('emoBackFromLobby').addEventListener('click',function(){ sfxToggle(); cleanup(); ui.goto('online'); });
  $('emoHubReturnBtn').addEventListener('click',function(){ sfxToggle(); location.hash='hub'; });
  CG.wireModal('emoRulesModal','emoRulesBtn');

  /* ===================== HÔTE ===================== */
  function hostOnJoinRequest(msg){
    var back=seats.returningSeat(msg); if(back) return back;
    if(activeCount()>=MAX_PLAYERS) return 'SALLE COMPLÈTE ('+MAX_PLAYERS+'/'+MAX_PLAYERS+')';
    for(var s=1;s<es.players.length;s++) if(!es.players[s]) return s;
    return Math.max(1, es.players.length);
  }
  function hostOnSeatJoined(seat, msg, isRepeat){
    var p=es.players[seat];
    if(p){ if(msg.name) p.name=msg.name; }
    else { es.players[seat]={name:msg.name||'Joueur'}; es.scores[seat]=0; }
    es.clientIds[seat]=msg.clientId||null; es.connected[seat]=true;
    net.sendTo(seat, {type:'seat_assigned', seat:seat, players:es.players.slice(), scores:es.scores.slice(), connected:es.connected.slice(), live:isLive()});
    if(es.phase==='guess') net.sendTo(seat, guessMsg(seat));
    else if((es.phase==='reveal' || es.phase==='over') && es.lastMsg) net.sendTo(seat, es.lastMsg);
    hostBroadcastLobby();
    if(!isRepeat) sfxValidate();
  }
  function hostOnSeatLost(seat){
    if(!es.started){ es.players[seat]=null; es.clientIds[seat]=null; }
    else es.connected[seat]=false;
    hostBroadcastLobby();
    if(es.phase==='guess') hostCheckAll();
  }
  function hostOnGuestMessage(seat, msg){ if(msg.type==='guess') hostGuess(seat, msg.text); }
  function hostBroadcastLobby(){
    broadcast({type:'lobby_update', players:es.players.slice(), scores:es.scores.slice(), connected:es.connected.slice(), live:isLive()});
  }
  function guessMsg(seat){
    return {type:'guess_start', idx:es.idx, count:es.count, emojis:es.item[0], cat:es.item[3],
      ms:Math.max(0, es.deadline-Date.now()), total:GUESS_MS, found:es.order.slice(), me:es.found.hasOwnProperty(seat),
      hint: Date.now()>=es.deadline-GUESS_MS+HINT_AT ? hintOf(es.item) : null};
  }
  $('emoStartBtn').addEventListener('click',function(){ sfxValidate(); hostStartGame(); });
  $('emoReplayBtn').addEventListener('click',function(){ sfxValidate(); hostStartGame(); });
  function hostStartGame(){
    if(activeCount()<MIN_PLAYERS) return;
    for(var s=1;s<es.players.length;s++) if(es.players[s] && !isConnected(s)){ es.players[s]=null; es.clientIds[s]=null; }
    es.scores=es.players.map(function(){ return 0; });
    es.started=true;
    if(es.pool.length<es.count) es.pool=shuffle(BANK.slice());
    es.idx=-1;
    hostNext();
  }
  function hostNext(){
    clearTimers();
    es.idx++;
    if(es.idx>=es.count){ hostOver(); return; }
    es.item=es.pool.pop();
    es.found={}; es.order=[];
    es.phase='guess';
    es.deadline=Date.now()+GUESS_MS;
    es.timer=setTimeout(hostReveal, GUESS_MS+300);
    es.hintTimer=setTimeout(function(){ if(es.phase==='guess') broadcast({type:'hint', hint:hintOf(es.item)}); }, HINT_AT);
    es.players.forEach(function(p,s){ if(p) sendToSeat(s, guessMsg(s)); });
    hostBroadcastLobby();
  }
  function hostGuess(seat, text){
    if(es.phase!=='guess' || !es.players[seat] || es.found.hasOwnProperty(seat)) return;
    text=String(text||'').slice(0,60);
    if(!isRight(text, es.item)){ sendToSeat(seat, {type:'wrong', text:text}); return; }
    var left=Math.max(0, es.deadline-Date.now());
    var pts=PLACE_PTS[Math.min(es.order.length, PLACE_PTS.length-1)]+Math.round(left/GUESS_MS*20);
    es.found[seat]=pts; es.order.push(seat);
    es.scores[seat]=(es.scores[seat]||0)+pts;
    sendToSeat(seat, {type:'right', pts:pts, answer:es.item[1]});
    broadcast({type:'found', order:es.order.slice()});
    hostCheckAll();
  }
  function hostCheckAll(){
    if(es.phase!=='guess') return;
    var pending=es.players.some(function(p,s){ return p && isConnected(s) && !es.found.hasOwnProperty(s); });
    if(!pending){ clearTimers(); es.timer=setTimeout(hostReveal, 600); }
  }
  function hostReveal(){
    if(es.phase!=='guess') return;
    clearTimers();
    es.phase='reveal';
    es.lastMsg={type:'reveal', idx:es.idx, count:es.count, emojis:es.item[0], answer:es.item[1], cat:es.item[3],
      found:es.found, order:es.order.slice(), scores:es.scores.slice(), players:es.players.slice()};
    broadcast(es.lastMsg);
    es.timer=setTimeout(hostNext, REVEAL_MS);
  }
  function hostOver(){
    clearTimers();
    es.phase='over';
    es.lastMsg={type:'game_over', scores:es.scores.slice(), players:es.players.slice()};
    broadcast(es.lastMsg);
    hostBroadcastLobby();
    if(CG.partyEnd) CG.partyEnd(es.players, es.scores);
  }
  function onPromote(info){
    netRole='host'; mySeat=0; roomCode=net.code;
    CG.promoteSeats(es, info);
    clearTimers(); bar.stop();
    es.started=true; es.phase='over'; es.lastMsg=null; inGame=false;
    $('emoCodeDisplay').textContent=roomCode;
    ui.hideBanner(); hostBroadcastLobby(); ui.goto('lobby');
    $('emoLobbyStatus').textContent=CG.PROMOTED_TEXT;
  }

  /* ===================== MESSAGES ===================== */
  function handleMsg(msg){
    if(!msg || !msg.type) return;
    switch(msg.type){
      case 'room_full': ui.setStatus('error', msg.reason||'SALLE COMPLÈTE'); break;
      case 'seat_assigned':
        mySeat=msg.seat; roomCode=net.code;
        es.players=msg.players.slice(); es.scores=(msg.scores||[]).slice(); es.connected=(msg.connected||[]).slice();
        liveForLobby=!!msg.live;
        $('emoCodeDisplay').textContent=roomCode;
        renderLobby(); ui.goto('lobby');
        break;
      case 'lobby_update':
        es.players=msg.players.slice(); es.connected=msg.connected.slice();
        if(netRole!=='host') es.scores=msg.scores.slice();
        liveForLobby=!!msg.live;
        renderLobby(); renderFound();
        break;
      case 'guess_start': onGuessStart(msg); break;
      case 'hint': $('emoHint').textContent='💡 '+msg.hint; $('emoHint').hidden=false; break;
      case 'wrong':
        shake($('emoGuessInput'));
        var w=document.createElement('span'); w.className='emo-wrong'; w.textContent=msg.text;
        $('emoWrong').insertBefore(w, $('emoWrong').firstChild);
        while($('emoWrong').children.length>4) $('emoWrong').removeChild($('emoWrong').lastChild);
        break;
      case 'right':
        view.me=true;
        $('emoGuessBox').hidden=true;
        $('emoMine').innerHTML='✅ Trouvé : <b>'+escapeHtml(msg.answer)+'</b> · +'+msg.pts;
        sfxReveal(100); CG.buzz([40,40,90]);
        break;
      case 'found': view.found=msg.order; renderFound(); if(msg.order.length && msg.order[msg.order.length-1]!==mySeat) CG.sfxToggle(); break;
      case 'reveal': onReveal(msg); break;
      case 'game_over': onOver(msg); break;
      case 'room_closed': net.close(); ui.showLost("L'hôte a fermé la salle."); break;
    }
  }

  /* ===================== AFFICHAGE ===================== */
  function row(s, extra){
    var p=es.players[s]||{name:'?'};
    return CG.playerRow({name:p.name, color:pcolor(s), me:s===mySeat, off:!isConnected(s), extra:extra});
  }
  function renderLobby(){
    var html='';
    es.players.forEach(function(p,s){ if(p) html+=row(s, '<span class="cham-vote-count">'+(es.scores[s]||0)+' pts</span>'); });
    $('emoPlayerList').innerHTML=html;
    var n=activeCount(), live = netRole==='host' ? isLive() : liveForLobby, st=$('emoLobbyStatus');
    if(live) st.textContent='Une partie est en cours — tu joues dès la prochaine devinette.';
    else if(n<MIN_PLAYERS) st.textContent=n+' joueur(s) — '+MIN_PLAYERS+' minimum pour lancer.';
    else st.textContent = netRole==='host' ? n+' joueurs prêts. Lance la partie !' : n+" joueurs prêts. En attente que l'hôte lance la partie...";
    $('emoStartBtn').style.display = (netRole==='host' && n>=MIN_PLAYERS && !live) ? 'inline-block' : 'none';
  }
  function onGuessStart(msg){
    if(!inGame || view.idx!==msg.idx) CG.yourTurn();
    inGame=true; view.idx=msg.idx; view.found=msg.found||[]; view.me=!!msg.me;
    $('emoRoundBadge').textContent='DEVINETTE '+(msg.idx+1)+' / '+msg.count;
    $('emoRoundBadge').style.display='inline-block';
    $('emoCat').textContent=msg.cat;
    $('emoEmojis').textContent=msg.emojis;
    $('emoHint').hidden=!msg.hint; $('emoHint').textContent=msg.hint ? '💡 '+msg.hint : '';
    $('emoGuessBox').hidden=view.me;
    $('emoMine').textContent = view.me ? '✅ Déjà trouvé !' : '';
    $('emoWrong').innerHTML='';
    $('emoGuessInput').value='';
    $('emoAnswer').hidden=true;
    bar.start(msg.ms, msg.total);
    renderFound();
    ui.goto('play');
    if(!view.me) setTimeout(function(){ try{ $('emoGuessInput').focus(); }catch(e){} }, 300);
  }
  function renderFound(){
    if(!inGame) return;
    var html='';
    es.players.forEach(function(p,s){
      if(!p) return;
      var k=view.found.indexOf(s);
      html+=row(s, '<span class="cham-vote-count">'+(k>=0?'✅ '+(k+1)+(k===0?'er':'e'):'🤔')+'</span>');
    });
    $('emoFoundList').innerHTML=html;
  }
  function submitGuess(){
    var inp=$('emoGuessInput'), t=inp.value.trim();
    if(!t || view.me){ shake(inp); return; }
    inp.value='';
    if(netRole==='host') hostGuess(0, t); else net.send({type:'guess', text:t});
  }
  $('emoGuessBtn').addEventListener('click', submitGuess);
  $('emoGuessInput').addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); submitGuess(); } });
  function onReveal(msg){
    bar.stop();
    if(msg.scores) es.scores=msg.scores.slice();
    $('emoEmojis').textContent=msg.emojis;
    $('emoCat').textContent=msg.cat;
    $('emoGuessBox').hidden=true;
    $('emoHint').hidden=true;
    $('emoAnswer').hidden=false;
    $('emoAnswer').innerHTML='C’était <b>'+escapeHtml(msg.answer)+'</b>'+(msg.order.length ? '' : ' — personne n’a trouvé 😅');
    view.found=msg.order; renderFound();
    if(!msg.found.hasOwnProperty(mySeat)) sfxReveal(0);
    ui.goto('play');
  }
  function onOver(msg){
    inGame=false; bar.stop();
    es.scores=msg.scores.slice();
    var order=[]; msg.players.forEach(function(p,s){ if(p) order.push(s); });
    order.sort(function(a,b){ return (msg.scores[b]||0)-(msg.scores[a]||0); });
    var top=order.length ? msg.scores[order[0]]||0 : 0;
    var winners=order.filter(function(s){ return (msg.scores[s]||0)===top; });
    $('emoWinnerText').textContent = top>0 ? winners.map(function(s){ return msg.players[s].name; }).join(' & ')+(winners.length>1?' L’EMPORTENT !':' L’EMPORTE !') : 'Personne n’a trouvé… 🙈';
    var html='';
    order.forEach(function(s,i){
      html+='<div class="cls-podium-row'+(i===0?' first':'')+(s===mySeat?' me':'')+'"><span class="cls-pos">'+(winners.indexOf(s)!==-1&&top>0?'👑':(i+1))+'</span>'+CG.playerDot(pcolor(s))+
        '<span class="cls-slot-name">'+escapeHtml(msg.players[s].name)+(s===mySeat?' (toi)':'')+'</span><span class="cham-vote-count">'+(msg.scores[s]||0)+' pts</span></div>';
    });
    $('emoFinalList').innerHTML=html;
    $('emoReplayBtn').style.display = netRole==='host' ? 'inline-block' : 'none';
    $('emoOverWait').style.display = netRole==='host' ? 'none' : 'inline-block';
    $('emoRoundBadge').style.display='none';
    sfxReveal(winners.indexOf(mySeat)!==-1 && top>0 ? 100 : 50);
    if(CG.account) CG.account.recordRanked('emoji', msg.scores, order, mySeat);
    if(CG.achieve && top>0 && winners.indexOf(mySeat)!==-1 && order.length>=2) CG.achieve('emo_win');
    ui.goto('over');
  }

  CG.emoji={
    reset:function(){ if(netRole) cleanup(); closeModal('emoDisconnectModal'); ui.goto('online'); },
    enterJoinFlow:function(code){ ui.goto('online'); $('emoJoinCode').value=CG.cleanRoomCode(decodeURIComponent(code)); }
  };
  CG.lobbyChat(net, $('emoPlayerList'), 'emoName');
  /* exposé pour les tests */
  CG.emoji._isRight=function(g,i){ return isRight(g, BANK[i]); };
  CG.emoji._answer=function(){ return netRole==='host' && es.item ? es.item[1] : null; };
})();
