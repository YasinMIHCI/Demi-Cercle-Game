/* Le Demi-Cercle — jeu d'estimation (local + en ligne 1v1 / 2v2). */
(function(){
  'use strict';
  var CG=window.CG;
  var $=CG.$, escapeHtml=CG.escapeHtml, shuffle=CG.shuffle, shake=CG.shake, openModal=CG.openModal, closeModal=CG.closeModal;
  var sfxToggle=CG.sfxToggle, sfxValidate=CG.sfxValidate, sfxWhoosh=CG.sfxWhoosh, sfxReveal=CG.sfxReveal;


  /* ---------- CONFIG ---------- */
  var CX=300, CY=300, R_OUT=250, R_IN=150, SLICES=72;
  var COLORS = {
    neutral:'#232323',
    yellow:'#FFE600',
    red:'#FF0033',
    redDark:'#7a0012',
    white:'#ffffff',
    black:'#050505'
  };

  var DEFAULT_THEMES = [
    {theme:"Films", left:"NAVET TOTAL", right:"CHEF-D'ŒUVRE"},
    {theme:"Nourriture", left:"DÉGOÛTANT", right:"DÉLICIEUX"},
    {theme:"Jeux vidéo", left:"À OUBLIER", right:"CULTE"},
    {theme:"Villes de France", left:"ENNUYEUSE", right:"INCROYABLE"},
    {theme:"Célébrités", left:"DÉTESTÉE", right:"ADORÉE"},
    {theme:"Animaux", left:"FLIPPANT", right:"MIGNON"},
    {theme:"Vacances de rêve", left:"CAUCHEMAR", right:"PARADIS"},
    {theme:"Métiers", left:"INGRAT", right:"RÊVÉ"},
    {theme:"Chansons", left:"RINGARDE", right:"TUBE PLANÉTAIRE"},
    {theme:"Sports", left:"ENNUYEUX", right:"SPECTACULAIRE"},
    {theme:"Voitures", left:"POUBELLE", right:"BOLIDE DE RÊVE"},
    {theme:"Séries TV", left:"FLOP TOTAL", right:"CHEF-D'ŒUVRE"},
    {theme:"Réseaux sociaux", left:"TOXIQUE", right:"UTILE"},
    {theme:"Super-héros", left:"RIDICULE", right:"TOUT-PUISSANT"},
    {theme:"Livres", left:"ILLISIBLE", right:"PASSIONNANT"},
    {theme:"Habitudes bizarres", left:"NORMAL", right:"COMPLÈTEMENT FOU"},
    {theme:"Plats cuisinés", left:"IMMANGEABLE", right:"GASTRONOMIQUE"},
    {theme:"Map de FPS", left:"À BANNIR", right:"ICONIQUE"},
    {theme:"Créatures mythiques", left:"RIDICULE", right:"TERRIFIANTE"},
    {theme:"Instruments de musique", left:"INSUPPORTABLE", right:"MAGIQUE"},
    {theme:"Saisons", left:"DÉTESTÉE", right:"PRÉFÉRÉE"},
    {theme:"Boissons", left:"INFECTE", right:"DÉLICIEUSE"},
    {theme:"Cadeaux d'anniversaire", left:"NULISSIME", right:"PARFAIT"},
    {theme:"Excuses pour être en retard", left:"BIDON", right:"GÉNIALE"}
  ];

  var THEME_STORAGE_KEY = 'demicercle_themes_v1';
  function loadThemesFromStorage(){
    try{
      var raw = localStorage.getItem(THEME_STORAGE_KEY);
      if(raw){
        var arr = JSON.parse(raw);
        if(Array.isArray(arr) && arr.length){ return arr; }
      }
    }catch(e){}
    return DEFAULT_THEMES.slice();
  }
  function saveThemesToStorage(){
    try{ localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(state.allThemes)); }catch(e){}
  }

  /* ---------- STATE ---------- */
  var state = {
    players:["Joueur 1","Joueur 2"],   /* local: length 2 | online: length 4 (seats) */
    connected:[true,true,true,true],    /* online: false = place réservée, joueur déconnecté */
    scores:[0,0],                       /* local only */
    giverIndex:0,                       /* local only */
    round:1,
    roundsLimit:null,
    allThemes: loadThemesFromStorage(),
    pool: [],
    currentTheme:null,
    targetPercent:50,
    guessPercent:50,
    clueText:'',
    wagerActive:false,
    /* online 2v2 */
    teamNames:['ÉQUIPE ROUGE','ÉQUIPE BLEUE'],
    teamScores:[0,0],
    teamTurnCount:[0,0],
    activeTeam:0,
    giverSeat:0,
    guesserSeat:1,
    history:[]
  };

  var gameMode = 'local';       /* 'local' | 'online' */
  var netRole = null;           /* 'host' | 'guest' */
  var mySeat = 0;                /* online: 0..3 */
  var onlineFormat = '1v1';      /* '1v1' | '2v2' */
  var selectedCreateFormat = '1v1';
  var seatsPerTeam = 1;
  var totalSeats = 2;
  var gameStarted = false;
  var gameEnded = false;
  var currentRoomCode = '';
  var myOnlineName = '';
  var lastCursorSend = 0;
  var ROOM_PREFIX = 'p5demicercle-';
  /* host only: clientId de chaque place (pour récupérer sa place après une
     coupure), et journal de la manche en cours pour resynchroniser un
     joueur qui se reconnecte. */
  var seatClientIds = [null,null,null,null];
  var roundLog = [];
  var roundSnapshot = null;

  var NS='http://www.w3.org/2000/svg';
  function polar(r,angleDeg){
    var rad = angleDeg*Math.PI/180;
    return {x:CX+r*Math.cos(rad), y:CY-r*Math.sin(rad)};
  }
  function percentToAngle(p){ return 180-(p/100)*180; }
  function clampPercent(p){ return Math.max(0,Math.min(100,p)); }


  /* ---------- DIAL FACTORY ---------- */
  function createDial(container, opts){
    opts = opts||{};
    var svg = document.createElementNS(NS,'svg');
    svg.setAttribute('viewBox','0 0 600 320');
    svg.classList.add('dial-svg');
    if(opts.interactive) svg.classList.add('dial-interactive');

    var slicesG = document.createElementNS(NS,'g');
    var slices = [];
    var i, p, pStart, pEnd, aStart, aEnd, o1,o2,i1,i2, poly;
    for(i=0;i<SLICES;i++){
      pStart=i*(100/SLICES); pEnd=(i+1)*(100/SLICES);
      aStart=percentToAngle(pStart); aEnd=percentToAngle(pEnd);
      o1=polar(R_OUT,aStart); o2=polar(R_OUT,aEnd);
      i2=polar(R_IN,aEnd); i1=polar(R_IN,aStart);
      poly=document.createElementNS(NS,'polygon');
      poly.setAttribute('points',
        o1.x.toFixed(2)+','+o1.y.toFixed(2)+' '+
        o2.x.toFixed(2)+','+o2.y.toFixed(2)+' '+
        i2.x.toFixed(2)+','+i2.y.toFixed(2)+' '+
        i1.x.toFixed(2)+','+i1.y.toFixed(2)
      );
      poly.setAttribute('fill',COLORS.neutral);
      poly.setAttribute('stroke',COLORS.neutral);
      poly.setAttribute('stroke-width','1');
      poly._pcenter=(pStart+pEnd)/2;
      slicesG.appendChild(poly);
      slices.push(poly);
    }
    svg.appendChild(slicesG);

    function polylineEl(pts){
      var pl=document.createElementNS(NS,'polyline');
      var s=[];
      for(var k=0;k<pts.length;k++){ s.push(pts[k].x.toFixed(2)+','+pts[k].y.toFixed(2)); }
      pl.setAttribute('points',s.join(' '));
      pl.setAttribute('class','dial-rim');
      pl.setAttribute('fill','none');
      return pl;
    }
    var outerPts=[], innerPts=[];
    for(i=0;i<=SLICES;i++){
      p=i*(100/SLICES);
      var a=percentToAngle(p);
      outerPts.push(polar(R_OUT,a));
      innerPts.push(polar(R_IN,a));
    }
    svg.appendChild(polylineEl(outerPts));
    svg.appendChild(polylineEl(innerPts));
    [0,100].forEach(function(pp){
      var aa=percentToAngle(pp);
      svg.appendChild(polylineEl([polar(R_IN,aa),polar(R_OUT,aa)]));
    });

    var ticksG=document.createElementNS(NS,'g');
    [0,25,50,75,100].forEach(function(pp){
      var aa=percentToAngle(pp);
      var t1=polar(R_OUT+4,aa), t2=polar(R_OUT+18,aa);
      var tick=document.createElementNS(NS,'line');
      tick.setAttribute('x1',t1.x);tick.setAttribute('y1',t1.y);
      tick.setAttribute('x2',t2.x);tick.setAttribute('y2',t2.y);
      tick.setAttribute('class','dial-tick');
      ticksG.appendChild(tick);
    });
    svg.appendChild(ticksG);

    var targetMark=document.createElementNS(NS,'circle');
    targetMark.setAttribute('r','16');
    targetMark.setAttribute('class','dial-target-mark');
    targetMark.style.display='none';
    svg.appendChild(targetMark);

    var needle=document.createElementNS(NS,'polygon');
    needle.setAttribute('class','dial-needle');
    svg.appendChild(needle);

    var pivot=document.createElementNS(NS,'circle');
    pivot.setAttribute('cx',CX);pivot.setAttribute('cy',CY);pivot.setAttribute('r',22);
    pivot.setAttribute('class','dial-pivot');
    svg.appendChild(pivot);

    container.innerHTML='';
    container.appendChild(svg);

    var dial={svg:svg, slices:slices, needle:needle, targetMark:targetMark, percent:50};

    function setNeedle(pc){
      dial.percent=clampPercent(pc);
      var ang=percentToAngle(dial.percent);
      var tip=polar(R_OUT-16,ang);
      var b1=polar(20,ang+90);
      var b2=polar(20,ang-90);
      var back=polar(26,ang+180);
      needle.setAttribute('points',
        b1.x.toFixed(2)+','+b1.y.toFixed(2)+' '+
        tip.x.toFixed(2)+','+tip.y.toFixed(2)+' '+
        b2.x.toFixed(2)+','+b2.y.toFixed(2)+' '+
        back.x.toFixed(2)+','+back.y.toFixed(2)
      );
      if(opts.onChange) opts.onChange(dial.percent);
    }
    function setTarget(pc, show){
      var ang=percentToAngle(pc);
      var pos=polar((R_IN+R_OUT)/2,ang);
      targetMark.setAttribute('cx',pos.x);
      targetMark.setAttribute('cy',pos.y);
      targetMark.style.display = show?'block':'none';
    }
    function colorZones(targetPercent){
      slices.forEach(function(sl){
        var diff=Math.abs(sl._pcenter-targetPercent);
        var c;
        if(diff<=3) c=COLORS.yellow;
        else if(diff<=8) c=COLORS.red;
        else if(diff<=16) c=COLORS.white;
        else if(diff<=28) c=COLORS.redDark;
        else c=COLORS.black;
        sl.setAttribute('fill',c);
        sl.setAttribute('stroke',c);
      });
    }
    function resetZones(){
      slices.forEach(function(sl){ sl.setAttribute('fill',COLORS.neutral); sl.setAttribute('stroke',COLORS.neutral); });
    }

    dial.setNeedle=setNeedle;
    dial.setTarget=setTarget;
    dial.colorZones=colorZones;
    dial.resetZones=resetZones;

    setNeedle(50);

    if(opts.interactive){
      var dragging=false;
      function angleFromEvent(evt){
        var pt=svg.createSVGPoint();
        pt.x=evt.clientX; pt.y=evt.clientY;
        var loc=pt.matrixTransform(svg.getScreenCTM().inverse());
        var dx=loc.x-CX, dy=CY-loc.y;
        var ang=Math.atan2(dy,dx)*180/Math.PI;
        if(!isFinite(ang)) ang=90;
        if(ang<0) ang = dx>=0?0:180;
        if(ang>180) ang=180;
        return ang;
      }
      function percentFromEvent(evt){
        var a=angleFromEvent(evt);
        return clampPercent((180-a)/180*100);
      }
      function down(evt){
        dragging=true;
        try{svg.setPointerCapture(evt.pointerId);}catch(e){}
        setNeedle(percentFromEvent(evt));
        evt.preventDefault();
      }
      function move(evt){
        if(!dragging) return;
        setNeedle(percentFromEvent(evt));
        evt.preventDefault();
      }
      function up(){ dragging=false; }
      svg.addEventListener('pointerdown',down);
      svg.addEventListener('pointermove',move);
      svg.addEventListener('pointerup',up);
      svg.addEventListener('pointercancel',up);
      svg.addEventListener('pointerleave',up);
    }

    return dial;
  }

  var dialTarget=null, dialGuess=null, dialReveal=null, dialSpectate=null, guessSlider=null;


  /* ---------- SCREEN MGMT ---------- */
  function goto_(name){
    var all=document.querySelectorAll('.screen');
    for(var i=0;i<all.length;i++){ all[i].classList.remove('active'); }
    $('screen-'+name).classList.add('active');
    window.scrollTo({top:0,behavior:'smooth'});
  }

  /* ---------- SCOREBOARD (dispatcher) ---------- */
  function renderScoreboard(){
    if(gameMode==='online'){ renderScoreboardOnline(); } else { renderScoreboardLocal(); }
  }
  function renderScoreboardLocal(){
    var box=$('scoreboard');
    var html='';
    for(var i=0;i<state.players.length;i++){
      var role = state.giverIndex===i ? '🎯' : '🕵️';
      var roleTitle = state.giverIndex===i ? "Donne l'indice" : "Devine";
      html += '<div class="score-chip"><span class="score-role" title="'+roleTitle+'">'+role+'</span><span class="score-name">'+escapeHtml(state.players[i])+'</span><span class="score-num">'+state.scores[i]+'</span></div>';
      if(i===0) html += '<div class="score-vs">VS</div>';
    }
    box.innerHTML = html;
  }
  function renderScoreboardOnline(){
    var box=$('scoreboard');
    var html='';
    for(var t=0;t<2;t++){
      var active = state.activeTeam===t;
      var cls = 'score-chip team-chip '+(t===0?'team-red':'team-blue')+(active?' active-team':'');
      var prefix = seatsPerTeam===1 ? '' : ((t===0?'🔴':'🔵')+' ');
      html += '<div class="'+cls+'"><span class="score-name">'+prefix+escapeHtml(teamLabel(t))+(active?' ▶':'')+'</span><span class="score-num">'+state.teamScores[t]+'</span></div>';
      if(t===0) html+='<div class="score-vs">VS</div>';
    }
    box.innerHTML = html;
  }
  function updateRoundBadge(){
    var suffix = state.roundsLimit ? (' / '+state.roundsLimit) : '';
    $('roundBadge').textContent = 'MANCHE N°'+state.round+suffix;
  }

  /* ---------- RULES MODAL ---------- */
  $('rulesBtn').addEventListener('click',function(){ openModal('rulesModal'); sfxToggle(); });
  $('rulesModalClose').addEventListener('click',function(){ closeModal('rulesModal'); });
  $('rulesModal').addEventListener('click',function(e){ if(e.target===this) closeModal('rulesModal'); });

  /* ---------- THEME BANK ---------- */
  function renderThemeList(){
    var list=$('themeList');
    var html='';
    for(var i=0;i<state.allThemes.length;i++){
      var t=state.allThemes[i];
      html += '<div class="theme-chip"><button class="theme-del" data-idx="'+i+'" title="Supprimer ce thème" aria-label="Supprimer '+escapeHtml(t.theme)+'">✕</button><b>'+escapeHtml(t.theme)+'</b><span>'+escapeHtml(t.left)+' ⟷ '+escapeHtml(t.right)+'</span></div>';
    }
    list.innerHTML = html;
    $('themeCount').textContent = state.allThemes.length+' thème(s) dans la banque';
  }

  $('themeList').addEventListener('click',function(e){
    var btn = e.target.closest ? e.target.closest('.theme-del') : null;
    if(!btn) return;
    if(state.allThemes.length<=1){
      shake($('themeList'));
      return;
    }
    var idx = parseInt(btn.getAttribute('data-idx'),10);
    state.allThemes.splice(idx,1);
    renderThemeList();
    saveThemesToStorage();
    sfxToggle();
  });

  $('resetThemesBtn').addEventListener('click',function(){
    state.allThemes = DEFAULT_THEMES.slice();
    renderThemeList();
    saveThemesToStorage();
    sfxToggle();
  });

  $('addThemeBtn').addEventListener('click',function(){
    var name=$('customThemeName').value.trim();
    var left=$('customLeft').value.trim();
    var right=$('customRight').value.trim();
    if(!name||!left||!right){
      shake($('customThemeForm'));
      return;
    }
    state.allThemes.unshift({theme:name,left:left.toUpperCase(),right:right.toUpperCase()});
    $('customThemeName').value=''; $('customLeft').value=''; $('customRight').value='';
    renderThemeList();
    saveThemesToStorage();
    sfxToggle();
  });

  function getRoundsLimitFromInput(){
    var v=parseInt($('roundsLimit').value,10);
    return (v>0)?v:null;
  }

  /* ---------- MODE SELECT NAVIGATION ---------- */
  $('chooseLocalBtn').addEventListener('click',function(){
    gameMode='local';
    $('netStatus').style.display='none';
    sfxToggle();
    goto_('setup');
  });
  $('chooseOnlineBtn').addEventListener('click',function(){
    gameMode='online';
    $('netStatus').style.display='inline-flex';
    setNetStatus('offline','HORS LIGNE');
    sfxToggle();
    goto_('online');
  });
  $('backFromSetup').addEventListener('click',function(){ sfxToggle(); goto_('mode'); });
  $('backFromOnline').addEventListener('click',function(){ sfxToggle(); cleanupOnline(); goto_('mode'); });
  $('backFromLobby').addEventListener('click',function(){ sfxToggle(); cleanupOnline(); goto_('mode'); });

  /* ================= LOCAL FLOW (2 players, unchanged) ================= */
  $('startGameBtn').addEventListener('click',function(){
    var n1=$('playerName1').value.trim()||'Joueur 1';
    var n2=$('playerName2').value.trim()||'Joueur 2';
    state.players=[n1,n2];
    state.scores=[0,0];
    state.giverIndex=0;
    state.round=1;
    state.roundsLimit = getRoundsLimitFromInput();
    state.pool = shuffle(state.allThemes.slice());
    gameMode='local';
    sfxValidate();
    nextRound();
  });

  function nextRound(){
    if(state.pool.length===0){ state.pool=shuffle(state.allThemes.slice()); }
    state.currentTheme = state.pool.pop();
    state.targetPercent = 6+Math.random()*88;
    state.guessPercent = 50;
    state.clueText='';
    updateRoundBadge();
    renderTargetScreen();
    renderScoreboard();
    goto_('target');
  }

  function renderTargetScreen(){
    $('targetGiverName').textContent = state.players[state.giverIndex];
    $('targetThemeName').textContent = state.currentTheme.theme;
    $('targetLeftLabel').textContent = state.currentTheme.left;
    $('targetRightLabel').textContent = state.currentTheme.right;
    $('clueInput').value='';
    if(!dialTarget){
      dialTarget = createDial($('dialTargetWrap'), {interactive:false});
      dialTarget.needle.style.display='none';
    }
    dialTarget.resetZones();
    dialTarget.setTarget(state.targetPercent, true);
    $('targetSubtitleTail').textContent = "Trouve un indice qui correspond à la position de la cible, puis cache l'écran avant de passer l'appareil.";
    $('validateClueBtn').querySelector('span').textContent = "🙈 Valider et cacher l'écran";
    $('rerollTargetBtn').style.display='inline-block';
  }

  $('rerollTargetBtn').addEventListener('click',function(){
    state.targetPercent = 6+Math.random()*88;
    dialTarget.setTarget(state.targetPercent,true);
    sfxToggle();
  });

  $('clueInput').addEventListener('keydown',function(e){
    if(e.key==='Enter'){ e.preventDefault(); $('validateClueBtn').click(); }
  });

  $('validateClueBtn').addEventListener('click',function(){
    var clue=$('clueInput').value.trim();
    if(!clue){ shake($('clueInput')); return; }
    state.clueText=clue;
    sfxValidate();
    if(gameMode==='online'){
      send({type:'clue', text:clue});
      renderSpectateScreenOnline();
      goto_('spectate');
    } else {
      renderPassScreen();
      goto_('pass');
    }
  });

  function renderPassScreen(){
    var guesserIdx = 1-state.giverIndex;
    $('passLocalContent').style.display='block';
    $('passOnlineContent').style.display='none';
    $('passGuesserName').textContent = state.players[guesserIdx];
  }

  $('readyGuessBtn').addEventListener('click',function(){
    sfxWhoosh();
    renderGuessScreen();
    goto_('guess');
  });

  function guessDialOnChange(pc){
    state.guessPercent=pc;
    $('guessReadout').textContent = Math.round(pc)+'%';
    if(guessSlider) guessSlider.value = pc;
    if(gameMode==='online' && mySeat===state.guesserSeat){ throttledSendCursor(pc); }
  }
  function ensureGuessDial(){
    if(!dialGuess){
      dialGuess = createDial($('dialGuessWrap'), {interactive:true, onChange:guessDialOnChange});
      dialGuess.targetMark.style.display='none';
      guessSlider = $('guessSlider');
      guessSlider.addEventListener('input',function(){
        dialGuess.setNeedle(parseFloat(guessSlider.value));
      });
    }
  }

  function renderGuessScreen(){
    var guesserIdx=1-state.giverIndex;
    $('guessGuesserName').textContent = state.players[guesserIdx];
    $('guessThemeName').textContent = state.currentTheme.theme;
    $('guessLeftLabel').textContent = state.currentTheme.left;
    $('guessRightLabel').textContent = state.currentTheme.right;
    $('guessClueText').textContent = state.clueText;
    ensureGuessDial();
    dialGuess.resetZones();
    state.guessPercent=50;
    dialGuess.setNeedle(50);
    guessSlider.value=50;
    $('guessReadout').textContent='50%';
    $('wagerRow').style.display='none';
  }

  $('validateGuessBtn').addEventListener('click',function(){
    sfxValidate();
    if(gameMode==='online'){
      var w = state.wagerActive;
      send({type:'guess_final', percent: state.guessPercent, wager:w});
      revealRoundOnline(w);
    } else {
      revealRoundLocal();
    }
  });

  function computeScore(target,guess){
    var diff=Math.abs(target-guess);
    if(diff<=3) return 100;
    if(diff<=8) return 80;
    if(diff<=16) return 50;
    if(diff<=28) return 20;
    return 0;
  }

  function revealRoundLocal(){
    var guesserIdx = 1-state.giverIndex;
    var points = computeScore(state.targetPercent, state.guessPercent);
    state.scores[guesserIdx]+=points;

    $('revealGiverName').textContent = state.players[state.giverIndex];
    $('revealGuesserName').textContent = state.players[guesserIdx];
    $('revealTheme').textContent = state.currentTheme.theme;
    $('revealClue').textContent = state.clueText;
    $('revealPoints').textContent = '+'+points;
    $('revealWagerBadge').style.display='none';
    $('revealPointsDetail').textContent='';
    $('revealTeamScoreLine').textContent='';

    var bannerText, bannerClass;
    if(points>=100){bannerText='PILE POIL !!';bannerClass='b-perfect';}
    else if(points>=80){bannerText='PRESQUE PARFAIT !';bannerClass='b-great';}
    else if(points>=50){bannerText='PAS MAL...';bannerClass='b-ok';}
    else if(points>=20){bannerText='UN PEU LOIN...';bannerClass='b-meh';}
    else{bannerText='RATÉ TOTAL !';bannerClass='b-fail';}
    var bannerEl=$('revealBanner');
    bannerEl.textContent=bannerText;
    bannerEl.className='reveal-banner '+bannerClass;
    void bannerEl.offsetWidth;

    if(!dialReveal){ dialReveal=createDial($('dialRevealWrap'),{interactive:false}); }
    dialReveal.colorZones(state.targetPercent);
    dialReveal.setTarget(state.targetPercent,true);
    dialReveal.setNeedle(state.guessPercent);

    renderScoreboard();
    sfxReveal(points);

    var contEl=$('revealContinueBtn');
    var waitingLabel=$('waitingHostLabel');
    var isLastRound = state.roundsLimit && state.round>=state.roundsLimit;

    contEl.style.display='inline-block';
    waitingLabel.style.display='none';
    if(isLastRound){
      contEl.querySelector('span').textContent='🏁 Voir les résultats finaux';
      contEl.onclick=function(){ sfxValidate(); renderEndScreen(); goto_('end'); };
    } else {
      contEl.querySelector('span').textContent='▶ Manche suivante';
      contEl.onclick=function(){
        sfxToggle();
        state.giverIndex = 1-state.giverIndex;
        state.round++;
        nextRound();
      };
    }
    goto_('reveal');
  }

  function renderEndScreenLocal(){
    var s0=state.scores[0], s1=state.scores[1];
    var winnerText;
    if(s0===s1) winnerText='ÉGALITÉ PARFAITE !';
    else winnerText = (s0>s1?state.players[0]:state.players[1]).toUpperCase()+' REMPORTE LA PARTIE !';
    $('endWinnerText').textContent = winnerText;
    var html='';
    for(var i=0;i<state.players.length;i++){
      html += '<div class="end-score-line"><span>'+escapeHtml(state.players[i])+'</span><b>'+state.scores[i]+' pts</b></div>';
    }
    $('endFinalScores').innerHTML = html;
  }

  /* ---------- END SCREEN (dispatcher) ---------- */
  function renderEndScreen(){
    if(gameMode==='online'){
      $('endLocalContent').style.display='none';
      $('endOnlineContent').style.display='block';
      renderEndScreenOnline();
    } else {
      $('endLocalContent').style.display='block';
      $('endOnlineContent').style.display='none';
      renderEndScreenLocal();
    }
  }

  $('restartBtn').addEventListener('click',function(){
    sfxValidate();
    if(gameMode==='online'){ cleanupOnline(); }
    goto_('mode');
  });

  /* ================= ONLINE 2v2 FLOW (PeerJS star topology) ================= */
  function setNetStatus(cls,label){
    var el=$('netStatus');
    el.className='net-status '+cls;
    el.querySelector('.net-label').textContent=label;
  }

  var net = CG.createRoomNet({
    prefix: ROOM_PREFIX,
    onStatus: setNetStatus,
    onJoinRequest: hostOnJoinRequest,
    onSeatJoined: hostOnSeatJoined,
    onGuestMessage: hostOnGuestMessage,
    onSeatLost: hostOnSeatLost,
    onHostMessage: handleNetMessage,
    onReconnecting: function(){ showNetBanner('📡 Connexion perdue — reconnexion en cours...', false); },
    onReconnected: function(){ hideNetBanner(); },
    onLost: function(){ showLostModal('Impossible de rétablir la connexion avec l’hôte.'); }
  });

  /* Envoi d'un message de jeu. Côté hôte, les messages qui font avancer la
     manche sont journalisés pour pouvoir resynchroniser un joueur revenu. */
  function send(msg){
    if(netRole==='host') logRoundMsg(msg);
    net.send(msg);
  }
  function logRoundMsg(msg){
    if(msg.type==='round_setup'||msg.type==='clue'||msg.type==='guess_final'||msg.type==='game_end'){
      roundLog.push(msg);
    }
  }
  function throttledSendCursor(pc){
    var now=Date.now();
    if(now-lastCursorSend>70){ lastCursorSend=now; send({type:'cursor', percent:pc}); }
  }

  function applyFormat(fmt){
    onlineFormat = (fmt==='2v2') ? '2v2' : '1v1';
    seatsPerTeam = onlineFormat==='2v2' ? 2 : 1;
    totalSeats = onlineFormat==='2v2' ? 4 : 2;
  }
  /* Label to show for a team: real player name in 1v1 (each "team" is
     just one person), or the team name in 2v2. */
  function teamLabel(t){
    return seatsPerTeam===1 ? state.players[t] : state.teamNames[t];
  }
  /* Label for a specific seat: just their name in 1v1 (no team suffix
     needed since the team IS that one player), or "Name (Team)" in 2v2. */
  function actorLabel(seat, team){
    if(seatsPerTeam===1) return state.players[seat];
    return state.players[seat]+' ('+teamLabel(team)+')';
  }
  function computeGiverGuesserSeats(){
    if(seatsPerTeam===1){
      return {giver:state.activeTeam, guesser:1-state.activeTeam};
    }
    var base=state.activeTeam*2;
    var flip=state.teamTurnCount[state.activeTeam]%2;
    return {giver: flip===0?base:base+1, guesser: flip===0?base+1:base};
  }

  function cleanupOnline(){
    /* l'hôte prévient les invités que la salle ferme (sinon ils
       tenteraient de se reconnecter pendant une minute) */
    net.close(netRole==='host' ? {type:'room_closed'} : null);
    netRole=null; mySeat=0; gameStarted=false; gameEnded=false; currentRoomCode='';
    state.players=[null,null,null,null];
    state.connected=[true,true,true,true];
    seatClientIds=[null,null,null,null];
    roundLog=[]; roundSnapshot=null;
    hideNetBanner();
    setNetStatus('offline','HORS LIGNE');
  }

  /* ----- bannière d'état (joueur déconnecté / reconnexion) ----- */
  function showNetBanner(text, withAbort){
    $('netBannerText').textContent=text;
    $('netBannerAbort').style.display = withAbort ? 'inline-block' : 'none';
    $('netBanner').classList.add('open');
  }
  function hideNetBanner(){ $('netBanner').classList.remove('open'); }
  function refreshDisconnectBanner(){
    if(gameMode!=='online' || !gameStarted || gameEnded){ hideNetBanner(); return; }
    var missing=[];
    for(var s=0;s<totalSeats;s++){
      if(state.players[s] && state.connected[s]===false) missing.push(state.players[s]);
    }
    if(missing.length){
      showNetBanner('⏸ '+missing.join(', ')+(missing.length>1?' se sont déconnectés':' s’est déconnecté(e)')+' — en attente de reconnexion...', true);
    } else {
      hideNetBanner();
    }
  }
  $('netBannerAbort').addEventListener('click',function(){
    sfxToggle();
    cleanupOnline();
    goto_('mode');
  });
  function showLostModal(text){
    hideNetBanner();
    setNetStatus('offline','DÉCONNECTÉ');
    $('disconnectModalText').textContent=text;
    openModal('disconnectModal');
  }
  $('disconnectBackBtn').addEventListener('click',function(){
    closeModal('disconnectModal');
    cleanupOnline();
    goto_('mode');
  });

  /* ----- format toggle (host chooses 1v1 or 2v2 before creating) ----- */
  $('formatBtn1v1').addEventListener('click',function(){
    selectedCreateFormat='1v1';
    $('formatBtn1v1').classList.add('active');
    $('formatBtn2v2').classList.remove('active');
    sfxToggle();
  });
  $('formatBtn2v2').addEventListener('click',function(){
    selectedCreateFormat='2v2';
    $('formatBtn2v2').classList.add('active');
    $('formatBtn1v1').classList.remove('active');
    sfxToggle();
  });

  /* ----- room creation (host) ----- */
  $('createRoomBtn').addEventListener('click',function(){
    myOnlineName = $('onlineName').value.trim() || 'Joueur 1';
    cleanupOnline();
    applyFormat(selectedCreateFormat);
    net.host(function(code){
      netRole='host'; mySeat=0;
      currentRoomCode=code;
      state.players=[myOnlineName,null,null,null];
      state.connected=[true,true,true,true];
      seatClientIds=[net.clientId,null,null,null];
      state.teamScores=[0,0];
      state.teamTurnCount=[0,0];
      state.activeTeam=0;
      state.round=1;
      state.roundsLimit=getRoundsLimitFromInput();
      state.pool=[];
      state.history=[];
      gameStarted=false; gameEnded=false;
      try{ history.replaceState(null,'','#demicercle?room='+code); }catch(e){}
      $('lobbyCodeDisplay').textContent=code;
      $('lobbyTitle').textContent = 'LOBBY — '+(onlineFormat==='2v2'?'2 VS 2':'1 VS 1');
      renderLobbyScreen();
      goto_('lobby');
    });
    sfxToggle();
  });

  /* ----- host: seats ----- */
  function nextOpenSeat(){
    for(var s=1;s<totalSeats;s++){ if(!state.players[s]) return s; }
    return -1;
  }
  function hostOnJoinRequest(msg){
    var s;
    /* même onglet qui revient : il récupère sa place */
    for(s=1;s<totalSeats;s++){ if(msg.clientId && seatClientIds[s]===msg.clientId) return s; }
    if(!gameStarted){
      s=nextOpenSeat();
      return s===-1 ? 'SALLE COMPLÈTE ('+totalSeats+'/'+totalSeats+')' : s;
    }
    /* partie en cours : on peut reprendre la place d'un joueur déconnecté
       (de préférence celle qui porte le même nom) */
    var free=-1;
    for(s=1;s<totalSeats;s++){
      if(state.connected[s]===false){
        if(state.players[s]===msg.name) return s;
        if(free===-1) free=s;
      }
    }
    return free!==-1 ? free : 'PARTIE DÉJÀ EN COURS';
  }
  function hostOnSeatJoined(seat, msg, isRepeat){
    seatClientIds[seat]=msg.clientId||null;
    if(msg.name) state.players[seat]=msg.name;
    state.connected[seat]=true;
    net.sendTo(seat, {
      type:'seat_assigned', seat:seat, format:onlineFormat,
      players:state.players.slice(), connected:state.connected.slice(),
      teamNames:state.teamNames, roundsLimit:state.roundsLimit,
      started:gameStarted, snapshot:roundSnapshot
    });
    if(gameStarted){
      /* rejoue la manche en cours pour remettre le joueur au bon écran */
      for(var i=0;i<roundLog.length;i++) net.sendTo(seat, roundLog[i]);
      broadcastPlayerStatus();
    } else {
      broadcastLobby();
    }
    if(!isRepeat) sfxValidate();
  }
  function hostOnSeatLost(seat){
    if(!gameStarted){
      state.players[seat]=null;
      seatClientIds[seat]=null;
      broadcastLobby();
      return;
    }
    state.connected[seat]=false;
    broadcastPlayerStatus();
  }
  function hostOnGuestMessage(seat, msg){
    /* on n'accepte que les actions du joueur dont c'est le tour */
    if(msg.type==='clue' && seat!==state.giverSeat) return;
    if((msg.type==='cursor'||msg.type==='guess_final') && seat!==state.guesserSeat) return;
    if(msg.type!=='clue' && msg.type!=='cursor' && msg.type!=='guess_final') return;
    logRoundMsg(msg);
    handleNetMessage(msg);
    net.sendToAllExcept(msg, seat);
  }
  function broadcastLobby(){
    net.sendToAll({type:'lobby_update', players:state.players.slice(), teamNames:state.teamNames, roundsLimit:state.roundsLimit, format:onlineFormat});
    renderLobbyScreen();
  }
  function broadcastPlayerStatus(){
    var msg={type:'player_status', players:state.players.slice(), connected:state.connected.slice()};
    net.sendToAll(msg);
    refreshDisconnectBanner();
    renderScoreboard();
  }

  /* ----- join (guest) ----- */
  $('joinCodeInput').addEventListener('keydown',function(e){
    if(e.key==='Enter'){ e.preventDefault(); $('joinRoomBtn').click(); }
  });
  $('joinRoomBtn').addEventListener('click',function(){
    myOnlineName = $('onlineName').value.trim() || 'Joueur';
    var code = $('joinCodeInput').value.trim().toUpperCase();
    if(!code){ shake($('joinCodeInput')); return; }
    cleanupOnline();
    netRole='guest';
    net.join(code, {name:myOnlineName});
    sfxToggle();
  });

  /* ----- copy code / link ----- */
  $('copyCodeBtn').addEventListener('click',function(){ CG.copyText(currentRoomCode, $('copyCodeBtn')); });
  $('copyLinkBtn').addEventListener('click',function(){
    var url = location.origin+location.pathname+'#demicercle?room='+currentRoomCode;
    CG.copyText(url, $('copyLinkBtn'));
  });

  /* ----- lobby rendering ----- */
  function setSeatEl(el, name, seatIdx){
    if(!el) return;
    if(name){
      el.textContent = name + (seatIdx===mySeat?' (toi)':'');
      el.classList.add('filled');
    } else {
      el.textContent='En attente...';
      el.classList.remove('filled');
    }
  }
  function renderLobbyScreen(){
    if(onlineFormat==='2v2'){
      $('teamColHeader0').textContent='🔴 ÉQUIPE ROUGE';
      $('teamColHeader1').textContent='🔵 ÉQUIPE BLEUE';
      $('seatSlot1').style.display='block';
      $('seatSlot3').style.display='block';
      setSeatEl($('seatSlot0'), state.players[0], 0);
      setSeatEl($('seatSlot1'), state.players[1], 1);
      setSeatEl($('seatSlot2'), state.players[2], 2);
      setSeatEl($('seatSlot3'), state.players[3], 3);
    } else {
      $('teamColHeader0').textContent='👤 JOUEUR 1';
      $('teamColHeader1').textContent='👤 JOUEUR 2';
      $('seatSlot1').style.display='none';
      $('seatSlot3').style.display='none';
      setSeatEl($('seatSlot0'), state.players[0], 0);
      setSeatEl($('seatSlot2'), state.players[1], 1);
    }
    var filled=0;
    for(var i=0;i<totalSeats;i++){ if(state.players[i]) filled++; }
    var statusEl=$('lobbyStatusMsg');
    if(filled<totalSeats){
      statusEl.textContent = filled+' / '+totalSeats+' joueurs — en attente de '+(totalSeats-filled)+' Phantom Thief(s)...';
    } else {
      statusEl.textContent = netRole==='host' ? 'Équipe au complet ! Tu peux lancer la partie.' : "Équipe au complet ! En attente que l'hôte lance la partie...";
    }
    $('lobbyStartBtn').style.display = (netRole==='host' && filled===totalSeats) ? 'inline-block' : 'none';
  }
  $('lobbyStartBtn').addEventListener('click',function(){
    sfxValidate();
    gameStarted=true; gameEnded=false;
    state.pool = shuffle(state.allThemes.slice());
    hostAdvanceRoundOnline();
  });

  /* ----- round flow (host authoritative) ----- */
  function hostAdvanceRoundOnline(){
    if(state.pool.length===0){ state.pool=shuffle(state.allThemes.slice()); }
    var theme = state.pool.pop();
    var target = 6+Math.random()*88;
    var gg = computeGiverGuesserSeats();
    /* état avant la manche : un joueur qui revient le reçoit, puis on lui
       rejoue les messages de la manche (les points sont donc comptés une fois) */
    roundSnapshot = {teamScores:state.teamScores.slice(), history:JSON.parse(JSON.stringify(state.history))};
    roundLog = [];
    var msg = {type:'round_setup', round:state.round, theme:theme, targetPercent:target, activeTeam:state.activeTeam, giverSeat:gg.giver, guesserSeat:gg.guesser};
    handleNetMessage(msg);
    send(msg);
  }
  function hostGoToNextRoundOnline(){
    state.teamTurnCount[state.activeTeam]++;
    state.activeTeam = 1-state.activeTeam;
    state.round++;
    hostAdvanceRoundOnline();
  }

  /* ----- incoming message dispatcher ----- */
  function handleNetMessage(msg){
    if(!msg || !msg.type) return;
    switch(msg.type){
      case 'room_full':
        setNetStatus('error', msg.reason || ('SALLE COMPLÈTE ('+totalSeats+'/'+totalSeats+')'));
        break;
      case 'seat_assigned':
        applyFormat(msg.format);
        mySeat = msg.seat;
        currentRoomCode = net.code;
        state.players = msg.players.slice();
        state.connected = msg.connected ? msg.connected.slice() : [true,true,true,true];
        state.roundsLimit = msg.roundsLimit;
        if(msg.snapshot){
          state.teamScores = msg.snapshot.teamScores.slice();
          state.history = msg.snapshot.history.slice();
        } else {
          state.teamScores=[0,0]; state.history=[];
        }
        state.teamTurnCount=[0,0]; state.activeTeam=0;
        gameStarted = !!msg.started;
        gameEnded = false;
        $('lobbyCodeDisplay').textContent = currentRoomCode;
        $('lobbyTitle').textContent = 'LOBBY — '+(onlineFormat==='2v2'?'2 VS 2':'1 VS 1');
        renderLobbyScreen();
        refreshDisconnectBanner();
        /* partie déjà lancée : la suite (round_setup...) arrive juste après */
        if(!gameStarted) goto_('lobby');
        break;
      case 'lobby_update':
        state.players = msg.players.slice();
        state.roundsLimit = msg.roundsLimit;
        renderLobbyScreen();
        break;
      case 'player_status':
        state.players = msg.players.slice();
        state.connected = msg.connected.slice();
        refreshDisconnectBanner();
        renderScoreboard();
        break;
      case 'room_closed':
        var wasPlaying = gameStarted && !gameEnded;
        net.close();
        if(wasPlaying || document.querySelector('#screen-lobby.active')){
          showLostModal("L'hôte a fermé la salle.");
        } else {
          setNetStatus('offline','SALLE FERMÉE');
        }
        break;
      case 'round_setup':
        gameStarted=true;
        state.round = msg.round;
        state.currentTheme = msg.theme;
        state.targetPercent = msg.targetPercent;
        state.activeTeam = msg.activeTeam;
        state.giverSeat = msg.giverSeat;
        state.guesserSeat = msg.guesserSeat;
        state.clueText='';
        state.wagerActive=false;
        updateRoundBadge();
        renderScoreboard();
        if(mySeat===state.giverSeat){
          renderTargetScreenOnline();
          goto_('target');
        } else {
          renderWaitOnline();
          goto_('pass');
        }
        break;
      case 'clue':
        state.clueText = msg.text;
        if(mySeat===state.guesserSeat){
          renderGuessScreenOnline();
          goto_('guess');
        } else {
          renderSpectateScreenOnline();
          goto_('spectate');
        }
        break;
      case 'cursor':
        if(dialSpectate){ dialSpectate.setNeedle(msg.percent); }
        break;
      case 'guess_final':
        state.guessPercent = msg.percent;
        revealRoundOnline(!!msg.wager);
        break;
      case 'game_end':
        gameEnded=true;
        hideNetBanner();
        renderEndScreen();
        goto_('end');
        break;
    }
  }

  /* ----- online screen renderers ----- */
  function renderTargetScreenOnline(){
    $('targetGiverName').textContent = actorLabel(state.giverSeat, state.activeTeam);
    $('targetThemeName').textContent = state.currentTheme.theme;
    $('targetLeftLabel').textContent = state.currentTheme.left;
    $('targetRightLabel').textContent = state.currentTheme.right;
    $('clueInput').value='';
    if(!dialTarget){
      dialTarget = createDial($('dialTargetWrap'), {interactive:false});
      dialTarget.needle.style.display='none';
    }
    dialTarget.resetZones();
    dialTarget.setTarget(state.targetPercent, true);
    $('targetSubtitleTail').textContent = "Trouve un indice qui correspond à la position de la cible, puis envoie-le à ton équipe.";
    $('validateClueBtn').querySelector('span').textContent = "📡 Envoyer l'indice";
    $('rerollTargetBtn').style.display='inline-block';
  }

  function renderWaitOnline(){
    $('passLocalContent').style.display='none';
    $('passOnlineContent').style.display='block';
    var waitingText = (mySeat===state.guesserSeat) ? state.players[state.giverSeat] : (teamLabel(state.activeTeam)+' joue');
    $('passOnlineGiverName').textContent = waitingText;
  }

  function renderSpectateScreenOnline(){
    $('spectateGuesserName').textContent = actorLabel(state.guesserSeat, state.activeTeam);
    $('spectateThemeName').textContent = state.currentTheme.theme;
    $('spectateClueText').textContent = state.clueText;
    $('spectateLeftLabel').textContent = state.currentTheme.left;
    $('spectateRightLabel').textContent = state.currentTheme.right;
    if(!dialSpectate){ dialSpectate = createDial($('dialSpectateWrap'), {interactive:false}); }
    dialSpectate.resetZones();
    dialSpectate.setTarget(state.targetPercent, true);
    dialSpectate.setNeedle(50);
  }

  function renderGuessScreenOnline(){
    $('guessGuesserName').textContent = actorLabel(state.guesserSeat, state.activeTeam);
    $('guessThemeName').textContent = state.currentTheme.theme;
    $('guessLeftLabel').textContent = state.currentTheme.left;
    $('guessRightLabel').textContent = state.currentTheme.right;
    $('guessClueText').textContent = state.clueText;
    ensureGuessDial();
    dialGuess.resetZones();
    state.guessPercent=50;
    state.wagerActive=false;
    dialGuess.setNeedle(50);
    guessSlider.value=50;
    $('guessReadout').textContent='50%';
    var wagerRow=$('wagerRow'), wagerBtn=$('wagerBtn');
    if(mySeat===state.guesserSeat){
      wagerRow.style.display='flex';
      wagerBtn.classList.remove('active');
      wagerBtn.querySelector('span').textContent='🎲 Pari de Confiance (Risque)';
    } else {
      wagerRow.style.display='none';
    }
  }
  $('wagerBtn').addEventListener('click',function(){
    state.wagerActive = !state.wagerActive;
    this.classList.toggle('active', state.wagerActive);
    this.querySelector('span').textContent = state.wagerActive ? '🎲 PARI ACTIVÉ ⚠' : '🎲 Pari de Confiance (Risque)';
    sfxToggle();
  });

  function computeBasePoints(target,guess){ return computeScore(target,guess); }
  function computeFinalPoints(base, wagerActive){
    if(!wagerActive) return base;
    if(base>=80) return Math.round(base*1.5);
    if(base<=20) return -30;
    return base;
  }

  function revealRoundOnline(wagerFlag){
    var base = computeBasePoints(state.targetPercent, state.guessPercent);
    var final = computeFinalPoints(base, wagerFlag);
    state.teamScores[state.activeTeam] = Math.max(0, state.teamScores[state.activeTeam]+final);

    state.history.push({
      round:state.round, team:state.activeTeam, teamName:teamLabel(state.activeTeam),
      giver:state.players[state.giverSeat], guesser:state.players[state.guesserSeat],
      theme:state.currentTheme.theme, clue:state.clueText,
      base:base, wager:wagerFlag, final:final
    });

    $('revealGiverName').textContent = state.players[state.giverSeat];
    $('revealGuesserName').textContent = state.players[state.guesserSeat];
    $('revealTheme').textContent = state.currentTheme.theme;
    $('revealClue').textContent = state.clueText;
    $('revealPoints').textContent = (final>=0?'+':'')+final;

    var bannerText, bannerClass;
    if(wagerFlag && base>=80){ bannerText='PARI RÉUSSI !!'; bannerClass='b-perfect'; }
    else if(wagerFlag && base<=20){ bannerText='PARI PERDU...'; bannerClass='b-fail'; }
    else if(base>=100){bannerText='PILE POIL !!';bannerClass='b-perfect';}
    else if(base>=80){bannerText='PRESQUE PARFAIT !';bannerClass='b-great';}
    else if(base>=50){bannerText='PAS MAL...';bannerClass='b-ok';}
    else if(base>=20){bannerText='UN PEU LOIN...';bannerClass='b-meh';}
    else{bannerText='RATÉ TOTAL !';bannerClass='b-fail';}
    var bannerEl=$('revealBanner');
    bannerEl.textContent=bannerText;
    bannerEl.className='reveal-banner '+bannerClass;
    void bannerEl.offsetWidth;

    $('revealWagerBadge').style.display = wagerFlag ? 'inline-block' : 'none';
    $('revealPointsDetail').textContent = wagerFlag ? ('Base : '+base+' pts, avec Pari de Confiance') : '';
    $('revealTeamScoreLine').textContent = teamLabel(state.activeTeam)+' : '+state.teamScores[state.activeTeam]+' pts au total';

    if(!dialReveal){ dialReveal=createDial($('dialRevealWrap'),{interactive:false}); }
    dialReveal.colorZones(state.targetPercent);
    dialReveal.setTarget(state.targetPercent,true);
    dialReveal.setNeedle(state.guessPercent);

    renderScoreboard();
    sfxReveal(final);

    var contEl=$('revealContinueBtn');
    var waitingLabel=$('waitingHostLabel');
    var isLastRound = state.roundsLimit && state.round>=state.roundsLimit;

    if(netRole==='host'){
      contEl.style.display='inline-block';
      waitingLabel.style.display='none';
      contEl.querySelector('span').textContent = isLastRound ? '🏁 Voir les résultats finaux' : '▶ Manche suivante';
      contEl.onclick=function(){
        sfxToggle();
        if(isLastRound){
          var endMsg={type:'game_end'};
          send(endMsg);
          handleNetMessage(endMsg);
        } else {
          hostGoToNextRoundOnline();
        }
      };
    } else {
      contEl.style.display='none';
      waitingLabel.style.display='inline-block';
      waitingLabel.textContent = isLastRound ? "⏳ En attente que l'hôte affiche les résultats..." : "⏳ En attente que l'hôte lance la manche suivante...";
    }
    goto_('reveal');
  }

  function renderEndScreenOnline(){
    var s0=state.teamScores[0], s1=state.teamScores[1];
    var winnerIdx = s0===s1 ? -1 : (s0>s1?0:1);
    var prefix0 = seatsPerTeam===1 ? '' : '🔴 ';
    var prefix1 = seatsPerTeam===1 ? '' : '🔵 ';
    var html = '<div class="team-vs-final">';
    html += '<div class="team-final-block'+(winnerIdx===0?' winner':'')+'"><h3 style="color:var(--red-bright);">'+prefix0+escapeHtml(teamLabel(0))+'</h3><div class="team-final-score">'+s0+'</div>'+(winnerIdx===0?'<div class="crown">👑</div>':'')+'</div>';
    html += '<div class="team-vs-sep">VS</div>';
    html += '<div class="team-final-block blue'+(winnerIdx===1?' winner':'')+'"><h3 style="color:var(--blue);">'+prefix1+escapeHtml(teamLabel(1))+'</h3><div class="team-final-score">'+s1+'</div>'+(winnerIdx===1?'<div class="crown">👑</div>':'')+'</div>';
    html += '</div>';
    html += '<div class="end-winner-text">'+(winnerIdx===-1?'ÉGALITÉ PARFAITE !':escapeHtml(teamLabel(winnerIdx))+' REMPORTE LA PARTIE !')+'</div>';
    html += '<h3 class="rules-subhead" style="margin-top:22px;text-align:center;">HISTORIQUE DES MANCHES</h3>';
    html += '<div class="history-list">';
    for(var i=0;i<state.history.length;i++){
      var h=state.history[i];
      html += '<div class="history-row team'+h.team+'">';
      html += '<span class="hist-round">M'+h.round+'</span>';
      html += '<span class="hist-team">'+escapeHtml(h.teamName)+'</span>';
      html += '<span class="hist-detail">'+escapeHtml(h.giver)+' ➜ '+escapeHtml(h.guesser)+' : « '+escapeHtml(h.clue)+' »'+(h.wager?' 🎲':'')+'</span>';
      html += '<span class="hist-points">'+(h.final>=0?'+':'')+h.final+'</span>';
      html += '</div>';
    }
    html += '</div>';
    $('endOnlineContent').innerHTML = html;
  }

  /* ---------- API pour le hub ---------- */
  CG.demicercle = {
    /* retour au hub : on quitte proprement la salle éventuelle */
    reset: function(){
      if(gameMode==='online') cleanupOnline();
      gameMode='local';
      closeModal('disconnectModal');
      goto_('mode');
    },
    enterJoinFlow: function(code){
      gameMode='online';
      $('netStatus').style.display='inline-flex';
      setNetStatus('offline','HORS LIGNE');
      goto_('online');
      $('joinCodeInput').value = decodeURIComponent(code).toUpperCase();
    }
  };

  renderThemeList();
})();
