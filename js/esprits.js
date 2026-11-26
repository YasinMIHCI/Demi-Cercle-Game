/* Les Esprits connectés — 4 à 10 joueurs en ligne, par équipes de 2.
   Les deux coéquipiers tapent un mot en même temps, sans se concerter. Puis,
   à partir de leurs deux mots, chacun tape le mot qui les relie le mieux…
   jusqu'à taper le même mot ! Toutes les équipes jouent en même temps : la
   plus rapide à se connecter (le moins d'essais, puis le moins de temps)
   gagne la manche. Avec un nombre impair de joueurs, une équipe est à trois
   (il faut alors que les trois tapent le même mot). L'hôte fait autorité :
   il garde les mots secrets tant que toute l'équipe n'a pas validé. */
(function(){
  'use strict';
  var CG=window.CG;
  var $=CG.$, escapeHtml=CG.escapeHtml, shuffle=CG.shuffle, shake=CG.shake, closeModal=CG.closeModal;
  var sfxToggle=CG.sfxToggle, sfxValidate=CG.sfxValidate, sfxReveal=CG.sfxReveal;

  var ROOM_PREFIX='cgesprits-';
  var MIN_PLAYERS=4, MAX_PLAYERS=10;
  var ROUND_MS=30000, MAX_ROUNDS=10, BETWEEN_MS=9000;
  var PTS=[10,6,4,3,2];                 /* points de chaque joueur selon la place de son équipe */
  var COLORS=['#E60012','#2E6FF2','#FFE600','#7cff6e','#ff6ec7','#ff9d2f','#00e5ff','#b388ff','#ffffff','#c49a6c'];

  /* deux mots sont « le même » sans accents ni majuscules, sans article devant et sans s/x de pluriel */
  function key(w){
    var s=String(w||'').toLowerCase().replace(/[’']/g,' ');
    if(s.normalize) s=s.normalize('NFD').replace(/[̀-ͯ]/g,'');
    s=s.replace(/œ/g,'oe').replace(/æ/g,'ae').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
    s=s.replace(/^(le|la|les|l|un|une|des|du|de)\s+/,'').replace(/ /g,'');
    if(s.length>3 && /[sx]$/.test(s)) s=s.slice(0,-1);
    return s;
  }

  /* hôte : état qui fait foi */
  var xs={players:[], scores:[], connected:[], clientIds:[], phase:'lobby', started:false,
          manches:3, manche:0, teams:[], seatTeam:{}, mancheStart:0, results:null, timer:null};
  var netRole=null, mySeat=0, myName='', roomCode='', liveForLobby=false;
  var view={state:null, roundKey:''};
  var bar=CG.timerBar('espTimerFill','espTimerText');

  var ui=CG.roomUI('esp', {route:'esprits', code:function(){ return roomCode; },
    onLostBack:function(){ cleanup(); ui.goto('online'); }});
  var seats=CG.seatTools(xs), isConnected=seats.isConnected, activeCount=seats.activeCount;
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

  function clearTimers(){
    clearTimeout(xs.timer); xs.timer=null;
    xs.teams.forEach(function(t){ clearTimeout(t.timer); t.timer=null; });
  }
  function cleanup(){
    net.close(netRole==='host' ? {type:'room_closed'} : null);
    clearTimers(); bar.stop();
    netRole=null; mySeat=0; roomCode=''; liveForLobby=false; view.state=null; view.roundKey='';
    xs.players=[]; xs.scores=[]; xs.connected=[]; xs.clientIds=[]; xs.phase='lobby'; xs.started=false; xs.teams=[]; xs.seatTeam={}; xs.results=null;
    $('espRoundBadge').style.display='none';
    ui.hideBanner(); ui.setStatus('offline','HORS LIGNE');
  }
  function isLive(){ return xs.phase==='play' || xs.phase==='between'; }
  function pname(s){ var p=xs.players[s]; return p?p.name:'?'; }
  function pcolor(s){ return COLORS[s%COLORS.length]; }

  /* ===================== CRÉER / REJOINDRE ===================== */
  (function(){
    var btns=$('espMancheToggle').querySelectorAll('button');
    for(var i=0;i<btns.length;i++) btns[i].addEventListener('click', function(){
      for(var j=0;j<btns.length;j++) btns[j].classList.remove('active');
      this.classList.add('active'); xs.manches=parseInt(this.getAttribute('data-manches'),10)||3; sfxToggle();
    });
  })();
  $('espCreateRoomBtn').addEventListener('click',function(){
    var wanted=CG.readRoomCode('espHostCode');
    if(!wanted){ sfxToggle(); return; }
    myName=$('espName').value.trim()||'Joueur';
    var manches=xs.manches;
    cleanup(); xs.manches=manches;
    net.host(function(code){
      netRole='host'; mySeat=0; roomCode=code;
      xs.players=[{name:myName}]; xs.scores=[0]; xs.connected=[true]; xs.clientIds=[net.clientId];
      try{ history.replaceState(null,'','#esprits?room='+code); }catch(e){}
      $('espCodeDisplay').textContent=code;
      renderLobby(); ui.goto('lobby');
    }, wanted);
    sfxToggle();
  });
  $('espJoinCode').addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); $('espJoinRoomBtn').click(); } });
  $('espJoinRoomBtn').addEventListener('click',function(){
    myName=$('espName').value.trim()||'Joueur';
    var code=CG.cleanRoomCode($('espJoinCode').value);
    if(!code){ shake($('espJoinCode')); return; }
    cleanup(); netRole='guest';
    net.join(code, {name:myName});
    sfxToggle();
  });
  $('espBackFromLobby').addEventListener('click',function(){ sfxToggle(); cleanup(); ui.goto('online'); });
  $('espHubReturnBtn').addEventListener('click',function(){ sfxToggle(); location.hash='hub'; });
  CG.wireModal('espRulesModal','espRulesBtn');

  /* ===================== HÔTE ===================== */
  function hostOnJoinRequest(msg){
    var back=seats.returningSeat(msg); if(back) return back;
    if(activeCount()>=MAX_PLAYERS) return 'SALLE COMPLÈTE ('+MAX_PLAYERS+'/'+MAX_PLAYERS+')';
    for(var s=1;s<xs.players.length;s++) if(!xs.players[s]) return s;
    return Math.max(1, xs.players.length);
  }
  function hostOnSeatJoined(seat, msg, isRepeat){
    var p=xs.players[seat];
    if(p){ if(msg.name) p.name=msg.name; }
    else { xs.players[seat]={name:msg.name||'Joueur'}; xs.scores[seat]=0; }
    xs.clientIds[seat]=msg.clientId||null; xs.connected[seat]=true;
    net.sendTo(seat, {type:'seat_assigned', seat:seat, players:xs.players.slice(), scores:xs.scores.slice(), connected:xs.connected.slice(), live:isLive()});
    if(xs.phase!=='lobby') net.sendTo(seat, viewFor(seat));
    hostBroadcastLobby();
    if(!isRepeat) sfxValidate();
  }
  function hostOnSeatLost(seat){
    if(!xs.started){ xs.players[seat]=null; xs.clientIds[seat]=null; }
    else xs.connected[seat]=false;
    hostBroadcastLobby();
    /* l'équipe n'attend pas un joueur parti */
    var t=xs.teams[xs.seatTeam[seat]];
    if(xs.phase==='play' && t && !t.over) hostTeamCheck(t);
  }
  function hostOnGuestMessage(seat, msg){ if(msg.type==='word') hostWord(seat, msg.text); }
  function hostBroadcastLobby(){
    broadcast({type:'lobby_update', players:xs.players.slice(), scores:xs.scores.slice(), connected:xs.connected.slice(), live:isLive()});
  }
  function teamName(t){ return t.seats.map(pname).join(' & '); }
  function teamSummary(t, withWords){
    return {seats:t.seats.slice(), round:t.round, done:t.done, failed:t.failed, rounds:t.rounds, time:t.time,
      hist: withWords ? t.hist : null};
  }
  /* ce que voit chaque place : les mots de son équipe déjà dévoilés, jamais ceux en cours des autres */
  function viewFor(seat){
    var ti=xs.seatTeam.hasOwnProperty(seat) ? xs.seatTeam[seat] : -1, t=xs.teams[ti];
    var reveal = xs.phase!=='play';
    var out={type:'e_state', phase:xs.phase, manche:xs.manche, manches:xs.manches, maxRounds:MAX_ROUNDS,
      players:xs.players.slice(), scores:xs.scores.slice(), myTeam:ti,
      teams:xs.teams.map(function(x){ return teamSummary(x, reveal); }), results:xs.results};
    if(t){
      out.team={seats:t.seats.slice(), round:t.round, hist:t.hist, done:t.done, failed:t.failed, rounds:t.rounds,
        mine: t.cur.hasOwnProperty(seat) ? t.cur[seat] : null,
        ready: t.seats.map(function(s){ return t.cur.hasOwnProperty(s); }),
        ms: Math.max(0, t.deadline-Date.now()), total:ROUND_MS};
    }
    return out;
  }
  function hostPush(){ xs.players.forEach(function(p,s){ if(p) sendToSeat(s, viewFor(s)); }); }
  $('espStartBtn').addEventListener('click',function(){ sfxValidate(); hostStartGame(); });
  $('espReplayBtn').addEventListener('click',function(){ sfxValidate(); hostStartGame(); });
  function hostStartGame(){
    if(activeCount()<MIN_PLAYERS) return;
    for(var s=1;s<xs.players.length;s++) if(xs.players[s] && !isConnected(s)){ xs.players[s]=null; xs.clientIds[s]=null; }
    xs.scores=xs.players.map(function(){ return 0; });
    xs.started=true; xs.manche=0;
    hostStartManche();
  }
  /* équipes de 2 tirées au hasard ; s'il reste un joueur, il rejoint la dernière équipe */
  function makeTeams(list){
    list=shuffle(list.slice());
    var teams=[];
    for(var i=0;i+1<list.length;i+=2) teams.push([list[i], list[i+1]]);
    if(list.length%2) teams[teams.length-1].push(list[list.length-1]);
    return teams;
  }
  function hostStartManche(){
    clearTimers();
    var here=xs.players.map(function(p,s){ return s; }).filter(function(s){ return xs.players[s] && isConnected(s); });
    if(here.length<MIN_PLAYERS && xs.manche>0){ hostOver(); return; }
    xs.manche++;
    xs.results=null;
    xs.mancheStart=Date.now();
    xs.seatTeam={};
    xs.teams=makeTeams(here).map(function(ss, i){
      ss.forEach(function(s){ xs.seatTeam[s]=i; });
      return {seats:ss, round:1, hist:[], cur:{}, used:{}, done:false, failed:false, over:false, rounds:0, time:0, deadline:0, timer:null};
    });
    xs.phase='play';
    xs.teams.forEach(hostStartRound);
    hostPush();
    hostBroadcastLobby();
  }
  function hostStartRound(t){
    t.cur={};
    t.deadline=Date.now()+ROUND_MS;
    clearTimeout(t.timer);
    t.timer=setTimeout(function(){ if(!t.over) hostResolve(t); }, ROUND_MS+500);
  }
  function hostWord(seat, text){
    if(xs.phase!=='play') return;
    var t=xs.teams[xs.seatTeam[seat]];
    if(!t || t.over || t.cur.hasOwnProperty(seat)) return;
    text=String(text||'').trim().slice(0,30);
    var k=key(text);
    if(!k){ sendToSeat(seat, {type:'e_bad', why:'empty'}); return; }
    if(t.used[k]){ sendToSeat(seat, {type:'e_bad', why:'used', text:text}); return; }
    t.cur[seat]=text;
    hostTeamCheck(t);
  }
  /* toute l'équipe (encore connectée) a validé : on dévoile */
  function hostTeamCheck(t){
    var waiting=t.seats.some(function(s){ return isConnected(s) && !t.cur.hasOwnProperty(s); });
    if(!waiting) hostResolve(t);
    else hostPush();
  }
  function hostResolve(t){
    if(t.over) return;
    clearTimeout(t.timer); t.timer=null;
    var words=t.seats.map(function(s){ return {seat:s, word:t.cur.hasOwnProperty(s) ? t.cur[s] : null}; });
    t.hist.push(words);
    words.forEach(function(w){ if(w.word) t.used[key(w.word)]=1; });
    var k0=words[0].word ? key(words[0].word) : null;
    var same = k0 && words.every(function(w){ return w.word && key(w.word)===k0; });
    if(same){
      t.done=true; t.over=true; t.rounds=t.round; t.time=Date.now()-xs.mancheStart;
    } else if(t.round>=MAX_ROUNDS){
      t.failed=true; t.over=true;
    } else {
      t.round++;
      hostStartRound(t);
    }
    if(xs.teams.every(function(x){ return x.over; })) hostEndManche();
    else hostPush();
  }
  function hostEndManche(){
    clearTimers();
    var ranked=xs.teams.map(function(t,i){ return i; }).filter(function(i){ return xs.teams[i].done; });
    ranked.sort(function(a,b){ var A=xs.teams[a], B=xs.teams[b]; return A.rounds-B.rounds || A.time-B.time; });
    var res=[];
    ranked.forEach(function(i, r){
      var pts=PTS[Math.min(r, PTS.length-1)];
      xs.teams[i].seats.forEach(function(s){ xs.scores[s]=(xs.scores[s]||0)+pts; });
      res.push({team:i, pts:pts});
    });
    xs.teams.forEach(function(t,i){ if(!t.done) res.push({team:i, pts:0}); });
    xs.results=res;
    if(xs.manche>=xs.manches){ hostOver(); return; }
    xs.phase='between';
    hostPush();
    xs.timer=setTimeout(hostStartManche, BETWEEN_MS);
  }
  function hostOver(){
    clearTimers();
    xs.phase='over';
    hostPush();
    hostBroadcastLobby();
    if(CG.partyEnd) CG.partyEnd(xs.players, xs.scores);
  }
  function onPromote(info){
    netRole='host'; mySeat=0; roomCode=net.code;
    CG.promoteSeats(xs, info);
    clearTimers(); bar.stop();
    xs.started=true; xs.phase='over'; xs.teams=[]; xs.seatTeam={}; view.state=null;
    $('espCodeDisplay').textContent=roomCode;
    ui.hideBanner(); hostBroadcastLobby(); renderLobby(); ui.goto('lobby');
    $('espLobbyStatus').textContent=CG.PROMOTED_TEXT;
  }

  /* ===================== MESSAGES ===================== */
  function handleMsg(msg){
    if(!msg || !msg.type) return;
    switch(msg.type){
      case 'room_full': ui.setStatus('error', msg.reason||'SALLE COMPLÈTE'); break;
      case 'seat_assigned':
        mySeat=msg.seat; roomCode=net.code;
        xs.players=msg.players.slice(); xs.scores=(msg.scores||[]).slice(); xs.connected=(msg.connected||[]).slice();
        liveForLobby=!!msg.live;
        $('espCodeDisplay').textContent=roomCode;
        renderLobby(); ui.goto('lobby');
        break;
      case 'lobby_update':
        xs.players=msg.players.slice(); xs.connected=msg.connected.slice();
        if(netRole!=='host') xs.scores=msg.scores.slice();
        liveForLobby=!!msg.live;
        renderLobby();
        break;
      case 'e_state': onState(msg); break;
      case 'e_bad':
        shake($('espInput'));
        $('espNote').textContent = msg.why==='used' ? '❌ « '+msg.text+' » a déjà été dit par ton équipe : trouve autre chose !' : '❌ Tape un mot !';
        break;
      case 'room_closed': net.close(); ui.showLost("L'hôte a fermé la salle."); break;
    }
  }

  /* ===================== AFFICHAGE ===================== */
  function row(s, extra){
    var p=xs.players[s]||{name:'?'};
    return CG.playerRow({name:p.name, color:pcolor(s), me:s===mySeat, off:!isConnected(s), extra:extra});
  }
  function renderLobby(){
    var html='';
    xs.players.forEach(function(p,s){ if(p) html+=row(s, '<span class="cham-vote-count">'+(xs.scores[s]||0)+' pts</span>'); });
    $('espPlayerList').innerHTML=html;
    var n=activeCount(), live = netRole==='host' ? isLive() : liveForLobby, st=$('espLobbyStatus');
    if(live) st.textContent='Une partie est en cours — tu joues dès la prochaine manche.';
    else if(n<MIN_PLAYERS) st.textContent=n+' joueur(s) — '+MIN_PLAYERS+' minimum pour lancer (2 équipes).';
    else st.textContent = netRole==='host' ? n+' joueurs prêts. Lance la partie !' : n+" joueurs prêts. En attente que l'hôte lance la partie...";
    $('espStartBtn').style.display = (netRole==='host' && n>=MIN_PLAYERS && !live) ? 'inline-block' : 'none';
  }
  function names(m, ss){ return ss.map(function(s){ return m.players[s] ? m.players[s].name : '?'; }).join(' & '); }
  function wordChip(w, m){
    return '<span class="esp-word" style="border-color:'+CG.safeColor(pcolor(w.seat))+'">'+(w.word ? escapeHtml(w.word) : '<i>…rien</i>')+'</span>';
  }
  function histHtml(hist, m){
    var html='';
    (hist||[]).forEach(function(words, i){
      var k0=words[0].word ? key(words[0].word) : null;
      var same=k0 && words.every(function(w){ return w.word && key(w.word)===k0; });
      html+='<div class="esp-hist-row'+(same?' same':'')+'"><span class="esp-hist-n">'+(i+1)+'</span>'+words.map(function(w){ return wordChip(w, m); }).join('<span class="esp-vs">'+(same?'=':'≠')+'</span>')+'</div>';
    });
    return html;
  }
  function onState(m){
    view.state=m;
    if(m.players) xs.players=m.players.slice();
    if(m.scores) xs.scores=m.scores.slice();
    if(m.phase==='over'){ onOver(m); return; }
    $('espRoundBadge').textContent='MANCHE '+m.manche+' / '+m.manches;
    $('espRoundBadge').style.display='inline-block';
    var t=m.team;
    if(m.phase==='between'){ renderBetween(m); return; }
    $('espResults').hidden=true;
    if(!t){
      $('espTeamName').textContent='👀 Tu regardes cette manche';
      $('espPrompt').textContent='Tu joues dès la prochaine manche.';
      $('espHist').innerHTML=''; $('espInputBox').hidden=true; $('espMine').textContent=''; bar.stop();
    } else {
      $('espTeamName').textContent='🧠 Ton équipe : '+names(m, t.seats);
      var last=t.hist[t.hist.length-1];
      if(t.done){
        $('espPrompt').innerHTML='✨ <b>CONNECTÉS !</b> en '+t.rounds+' essai'+(t.rounds>1?'s':'')+' — on attend les autres équipes…';
      } else if(t.failed){
        $('espPrompt').textContent='😵 Pas connectés en '+m.maxRounds+' essais… on attend les autres équipes.';
      } else if(!last){
        $('espPrompt').innerHTML='Essai 1 : tapez <b>un mot, n’importe lequel</b>, en même temps !';
      } else {
        $('espPrompt').innerHTML='Essai '+t.round+' : trouvez le mot qui relie '+last.map(function(w){ return '<b>'+(w.word ? escapeHtml(w.word) : '…')+'</b>'; }).join(' et ')+' !';
      }
      $('espHist').innerHTML=histHtml(t.hist, m);
      var open=!t.done && !t.failed && t.mine===null;
      $('espInputBox').hidden=!open;
      if(!t.done && !t.failed && t.mine!==null){
        var wait=t.seats.filter(function(s,i){ return !t.ready[i]; }).map(function(s){ return m.players[s] ? m.players[s].name : '?'; });
        $('espMine').innerHTML='✅ Ton mot : <b>'+escapeHtml(t.mine)+'</b>'+(wait.length ? ' — on attend '+escapeHtml(wait.join(' & '))+'…' : '');
      } else $('espMine').textContent='';
      if(!t.done && !t.failed){ bar.start(t.ms, t.total); } else { bar.stop(); $('espTimerText').textContent=''; $('espTimerFill').style.width='0%'; }
      var rk=m.manche+':'+t.round+':'+t.hist.length;
      if(view.roundKey!==rk){
        var prevKey=view.roundKey; view.roundKey=rk;
        $('espNote').textContent='';
        if(t.done){ sfxReveal(100); CG.buzz && CG.buzz([40,40,120]); if(CG.achieve && t.rounds<=3) CG.achieve('esp_mind'); }
        else if(prevKey && t.hist.length) sfxReveal(30);
        if(open){ $('espInput').value=''; setTimeout(function(){ try{ $('espInput').focus(); }catch(e){} }, 200); }
      }
    }
    var html='';
    m.teams.forEach(function(x, i){
      var tag = x.done ? '✅ en '+x.rounds+' essai'+(x.rounds>1?'s':'') : x.failed ? '😵 raté' : '🤔 essai '+x.round;
      html+='<div class="esp-team-row'+(i===m.myTeam?' me':'')+'"><span>'+x.seats.map(function(s){ return CG.playerDot(pcolor(s)); }).join('')+' '+escapeHtml(names(m, x.seats))+'</span><span class="cham-vote-count">'+tag+'</span></div>';
    });
    $('espTeams').innerHTML=html;
    if(!document.querySelector('#esp-screen-play.active')) ui.goto('play');
  }
  function renderBetween(m){
    bar.stop(); $('espTimerText').textContent=''; $('espTimerFill').style.width='0%';
    $('espInputBox').hidden=true; $('espMine').textContent=''; $('espNote').textContent='';
    $('espTeamName').textContent='🏁 Fin de la manche '+m.manche;
    $('espPrompt').textContent='Manche suivante dans quelques secondes (nouvelles équipes)…';
    $('espHist').innerHTML='';
    var html='';
    (m.results||[]).forEach(function(r, i){
      var x=m.teams[r.team];
      html+='<div class="esp-res'+(r.team===m.myTeam?' me':'')+'"><div class="esp-res-head"><span>'+(x.done ? (i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1)+'e') : '😵')+' '+escapeHtml(names(m, x.seats))+'</span><span class="cham-vote-count">'+
        (x.done ? x.rounds+' essai'+(x.rounds>1?'s':'')+' · +'+r.pts+' pts' : 'pas connectés')+'</span></div>'+histHtml(x.hist, m)+'</div>';
    });
    $('espResults').innerHTML=html; $('espResults').hidden=false;
    $('espTeams').innerHTML='';
    var mine=(m.results||[]).filter(function(r){ return r.team===m.myTeam; })[0];
    if(view.roundKey!=='between'+m.manche){ view.roundKey='between'+m.manche; sfxReveal(mine && mine.pts>=PTS[0] ? 100 : 40); }
    if(!document.querySelector('#esp-screen-play.active')) ui.goto('play');
  }
  function submit(){
    var inp=$('espInput'), t=inp.value.trim(), m=view.state;
    if(!t || !m || m.phase!=='play' || !m.team || m.team.mine!==null){ shake(inp); return; }
    inp.value='';
    if(netRole==='host') hostWord(0, t); else net.send({type:'word', text:t});
  }
  $('espSendBtn').addEventListener('click', submit);
  $('espInput').addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); submit(); } });
  function onOver(m){
    bar.stop();
    var order=[]; m.players.forEach(function(p,s){ if(p) order.push(s); });
    order.sort(function(a,b){ return (m.scores[b]||0)-(m.scores[a]||0); });
    var top=order.length ? m.scores[order[0]]||0 : 0;
    var winners=order.filter(function(s){ return (m.scores[s]||0)===top; });
    $('espWinnerText').textContent = top>0 ? winners.map(function(s){ return m.players[s].name; }).join(' & ')+(winners.length>1?' L’EMPORTENT !':' L’EMPORTE !') : 'Personne ne s’est connecté… 🙈';
    var html='';
    order.forEach(function(s,i){
      html+='<div class="cls-podium-row'+(i===0?' first':'')+(s===mySeat?' me':'')+'"><span class="cls-pos">'+(winners.indexOf(s)!==-1&&top>0?'👑':(i+1))+'</span>'+CG.playerDot(pcolor(s))+
        '<span class="cls-slot-name">'+escapeHtml(m.players[s].name)+(s===mySeat?' (toi)':'')+'</span><span class="cham-vote-count">'+(m.scores[s]||0)+' pts</span></div>';
    });
    /* dernière manche : les chaînes de mots de chaque équipe */
    (m.results||[]).forEach(function(r){
      var x=m.teams[r.team];
      html+='<div class="esp-res'+(r.team===m.myTeam?' me':'')+'"><div class="esp-res-head"><span>'+escapeHtml(names(m, x.seats))+'</span><span class="cham-vote-count">'+
        (x.done ? x.rounds+' essai'+(x.rounds>1?'s':'') : 'pas connectés')+'</span></div>'+histHtml(x.hist, m)+'</div>';
    });
    $('espFinalList').innerHTML=html;
    $('espReplayBtn').style.display = netRole==='host' ? 'inline-block' : 'none';
    $('espOverWait').style.display = netRole==='host' ? 'none' : 'inline-block';
    $('espRoundBadge').style.display='none';
    sfxReveal(winners.indexOf(mySeat)!==-1 && top>0 ? 100 : 50);
    if(CG.account) CG.account.recordRanked('esprits', m.scores, order, mySeat);
    if(CG.achieve && top>0 && winners.indexOf(mySeat)!==-1) CG.achieve('esp_win');
    ui.goto('over');
  }
  CG.esprits={
    reset:function(){ if(netRole) cleanup(); closeModal('espDisconnectModal'); ui.goto('online'); },
    enterJoinFlow:function(code){ ui.goto('online'); $('espJoinCode').value=CG.cleanRoomCode(decodeURIComponent(code)); }
  };
  CG.lobbyChat(net, $('espPlayerList'), 'espName');
  /* exposé pour les tests */
  CG.esprits._key=key;
  CG.esprits._makeTeams=makeTeams;
  CG.esprits._state=function(){ return netRole==='host' ? xs : null; };
})();
