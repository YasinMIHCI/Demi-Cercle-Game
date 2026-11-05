/* Le Demi-Cercle — jeu d'estimation (local + en ligne 1v1 / 2v2 / équipes tournantes).
   Équipes tournantes (3 à 10 joueurs) : à chaque manche un duo joue (un
   donneur d'indice, un devineur) et les duos changent à chaque manche ; les
   points vont aux deux joueurs du duo, chacun a son score. Les thèmes perso
   des invités rejoignent ceux de l'hôte (thèmes partagés), et les meilleures
   estimations sont gardées (dans le navigateur, et sur le compte si connecté). */
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
    roundPhase:'',                      /* online : 'clue' | 'guess' | 'reveal' (ignore les doublons) */
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
  var ROOM_PREFIX = 'cgdemicercle-';
  /* host only: clientId de chaque place (pour récupérer sa place après une
     coupure), et journal de la manche en cours pour resynchroniser un
     joueur qui se reconnecte. */
  var MAX_SEATS = 10;             /* équipes tournantes : jusqu'à 10 joueurs */
  var ROT_MIN = 3;
  var rotating = false;          /* format 'rot' : duos qui tournent, scores individuels */
  function emptySeats(v){ var a=[]; for(var i=0;i<MAX_SEATS;i++) a.push(v); return a; }
  var seatClientIds = emptySeats(null);
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
    if(rotating){
      for(var s=0;s<totalSeats;s++){
        if(!state.players[s]) continue;
        var role = s===state.giverSeat ? '🎯 ' : s===state.guesserSeat ? '🕵️ ' : '';
        html += '<div class="score-chip rot-chip'+(role?' active-team':'')+(state.connected[s]===false?' off':'')+'"><span class="score-name">'+role+escapeHtml(state.players[s])+(s===mySeat?' (toi)':'')+'</span><span class="score-num">'+(state.playerScores[s]||0)+'</span></div>';
      }
      box.innerHTML='<div class="rot-board">'+html+'</div>';
      return;
    }
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
  CG.wireModal('rulesModal', 'rulesBtn');

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
    $('themeCountShort').textContent = state.allThemes.length+' thème'+(state.allThemes.length>1?'s':'');
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
    if(gameMode==='online' && state.roundPhase!=='clue') return;
    state.targetPercent = 6+Math.random()*88;
    dialTarget.setTarget(state.targetPercent,true);
    /* en ligne, tout le monde doit avoir la même cible (sinon les points diffèrent) */
    if(gameMode==='online') send({type:'target', percent:state.targetPercent});
    sfxToggle();
  });

  $('clueInput').addEventListener('keydown',function(e){
    if(e.key==='Enter'){ e.preventDefault(); $('validateClueBtn').click(); }
  });

  $('validateClueBtn').addEventListener('click',function(){
    if(!$('screen-target').classList.contains('active')) return;
    if(gameMode==='online' && state.roundPhase!=='clue') return;
    var clue=$('clueInput').value.trim();
    if(!clue){ shake($('clueInput')); return; }
    state.clueText=clue;
    sfxValidate();
    if(gameMode==='online'){
      state.roundPhase='guess';
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
    /* double clic : les points étaient comptés deux fois */
    if(!$('screen-guess').classList.contains('active')) return;
    if(gameMode==='online' && state.roundPhase!=='guess') return;
    sfxValidate();
    if(gameMode==='online'){
      state.roundPhase='reveal';
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
    saveEstimate('guesser', points, state.players[guesserIdx]);

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
    showEndGameBtn(!isLastRound, function(){ renderEndScreen(); goto_('end'); });
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

  /* sans limite de manches, c'était le seul moyen de voir les résultats finaux */
  function showEndGameBtn(show, onEnd){
    var b=$('endGameBtn');
    if(!b) return;
    b.style.display=show?'inline-block':'none';
    b.onclick=function(){ sfxValidate(); onEnd(); };
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
    var online=gameMode==='online';
    $('rematchBtn').style.display = online && netRole==='host' ? 'inline-block' : 'none';
    $('rematchWaitLabel').style.display = online && netRole!=='host' ? 'inline-block' : 'none';
    $('restartBtn').querySelector('span').textContent = online ? '🚪 Quitter la salle' : '🔁 Rejouer';
    $('restartBtn').className = online ? 'btn ghost' : 'btn yellow';
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

  $('rematchBtn').addEventListener('click',function(){
    if(netRole!=='host') return;
    sfxValidate();
    var m={type:'rematch'};
    send(m); handleNetMessage(m);
    roundLog=[];
    state.pool=shuffle(gameThemes());
    hostAdvanceRoundOnline();
  });
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
    onLost: function(){ showLostModal('Impossible de rétablir la connexion avec l’hôte.'); },
    onPromote: onPromote
  });

  /* L'hôte a disparu et c'est toi qui reprends la salle (voir net.js).
     Le nouvel hôte doit être la place 0 : on renumérote les places sans
     casser les équipes (en 2 VS 2 / 1 VS 1, si tu étais dans l'équipe bleue,
     les deux équipes échangent leur numéro, avec leurs scores). La manche en
     cours est rejouée (nouvelle cible), ou la suivante est lancée si la
     cible venait d'être révélée. */
  function onPromote(info){
    var n=totalSeats, k=info.oldSeat||0, perm=[], s;
    for(s=0;s<n;s++) perm[s]=s;
    var teamSwap=false;
    if(onlineFormat==='2v2' && k>=2){ teamSwap=true; perm=[2,3,0,1]; }
    else if(onlineFormat==='1v1' && k===1){ teamSwap=true; perm=[1,0]; }
    var mine=perm[k];
    if(mine!==0) perm=perm.map(function(v){ return v===0 ? mine : (v===mine ? 0 : v); });
    function remap(arr, fill){
      var out=[];
      for(var i=0;i<MAX_SEATS;i++) out.push(fill);
      for(var o=0;o<n;o++) out[perm[o]] = (arr && arr[o]!==undefined) ? arr[o] : fill;
      return out;
    }
    function seat(x){ return (typeof x==='number' && x>=0 && x<n) ? perm[x] : x; }
    state.players=remap(state.players, null);
    state.playerScores=remap(state.playerScores, 0);
    seatClientIds=remap(info.ids||[], null);
    state.connected=state.players.map(function(p,i){ return i===0; });
    if(teamSwap){
      state.teamScores=[state.teamScores[1], state.teamScores[0]];
      state.activeTeam=1-state.activeTeam;
    }
    state.history.forEach(function(h){
      if(teamSwap && !rotating) h.team=1-h.team;
      h.giverSeat=seat(h.giverSeat); h.guesserSeat=seat(h.guesserSeat);
    });
    state.giverSeat=seat(state.giverSeat); state.guesserSeat=seat(state.guesserSeat);
    /* les compteurs de l'hôte, retrouvés à partir de l'historique */
    state.teamTurnCount=[0,0];
    state.history.forEach(function(h){ if(!rotating) state.teamTurnCount[h.team]++; });
    state.rotIdx=state.history.length;
    netRole='host'; mySeat=0; currentRoomCode=net.code;
    roundLog=[]; sharedThemes=[]; sharedCount=0;
    state.pool=shuffle(gameThemes());
    $('lobbyCodeDisplay').textContent=currentRoomCode;
    if(!gameStarted){
      renderLobbyScreen(); goto_('lobby');
      $('lobbyStatusMsg').textContent=CG.PROMOTED_TEXT;
      return;
    }
    if(gameEnded) return;
    roundSnapshot={teamScores:state.teamScores.slice(), playerScores:state.playerScores.slice(), history:JSON.parse(JSON.stringify(state.history))};
    showNetBanner('👑 L’hôte est parti : tu reprends la partie ! On attend que les autres reviennent...', false);
    /* on relance quand les joueurs sont revenus (15 s au plus) : sinon le
       duo ou l'équipe de la manche serait choisi parmi des absents */
    var waitUntil=Date.now()+15000, oldHost=perm[0];
    (function waitBack(){
      if(netRole!=='host' || gameEnded) return;
      var missing=false;
      for(var i=1;i<n;i++){ if(i!==oldHost && state.players[i] && state.connected[i]===false) missing=true; }
      if(missing && Date.now()<waitUntil){ setTimeout(waitBack, 500); return; }
      relaunch();
    })();
  }
  function relaunch(){
    if(state.roundPhase==='reveal'){
      /* la manche était finie : on enchaîne (l'équipe qui vient de jouer passe la main) */
      if(state.roundsLimit && state.round>=state.roundsLimit){ var endMsg={type:'game_end'}; send(endMsg); handleNetMessage(endMsg); }
      else hostGoToNextRoundOnline();
    } else {
      /* la manche est rejouée avec une nouvelle cible */
      hostAdvanceRoundOnline();
    }
    refreshDisconnectBanner();
  }

  /* Envoi d'un message de jeu. Côté hôte, les messages qui font avancer la
     manche sont journalisés pour pouvoir resynchroniser un joueur revenu. */
  function send(msg){
    if(netRole==='host') logRoundMsg(msg);
    net.send(msg);
  }
  function logRoundMsg(msg){
    if(msg.type==='round_setup'||msg.type==='target'||msg.type==='clue'||msg.type==='guess_final'||msg.type==='game_end'){
      roundLog.push(msg);
    }
  }
  function throttledSendCursor(pc){
    var now=Date.now();
    if(now-lastCursorSend>70){ lastCursorSend=now; send({type:'cursor', percent:pc}); }
  }

  function applyFormat(fmt){
    onlineFormat = (fmt==='2v2' || fmt==='rot') ? fmt : '1v1';
    rotating = onlineFormat==='rot';
    seatsPerTeam = onlineFormat==='2v2' ? 2 : 1;
    totalSeats = onlineFormat==='2v2' ? 4 : rotating ? MAX_SEATS : 2;
  }
  function formatTitle(){ return onlineFormat==='2v2' ? '2 VS 2' : rotating ? 'ÉQUIPES TOURNANTES' : '1 VS 1'; }
  /* Label to show for a team: real player name in 1v1 (each "team" is
     just one person), or the team name in 2v2. */
  function teamLabel(t){
    if(rotating) return duoLabel();
    return seatsPerTeam===1 ? state.players[t] : state.teamNames[t];
  }
  function duoLabel(){ return (state.players[state.giverSeat]||'?')+' & '+(state.players[state.guesserSeat]||'?'); }
  /* Label for a specific seat: just their name in 1v1 (no team suffix
     needed since the team IS that one player), or "Name (Team)" in 2v2. */
  function actorLabel(seat, team){
    if(seatsPerTeam===1 || rotating) return state.players[seat];
    return state.players[seat]+' ('+teamLabel(team)+')';
  }
  /* équipes tournantes : le donneur change à chaque manche, et son partenaire
     se décale d'un cran à chaque tour complet (tous les duos finissent par jouer) */
  function rotSeats(){
    var list=[];
    for(var s=0;s<totalSeats;s++){ if(state.players[s] && state.connected[s]!==false) list.push(s); }
    return list;
  }
  function computeGiverGuesserSeats(){
    if(rotating){
      var list=rotSeats(), n=list.length, k=state.rotIdx||0;
      var gi=k%n, off=1+Math.floor(k/n)%(n-1);
      return {giver:list[gi], guesser:list[(gi+off)%n]};
    }
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
    state.players=emptySeats(null);
    state.connected=emptySeats(true);
    state.playerScores=emptySeats(0);
    seatClientIds=emptySeats(null);
    roundLog=[]; roundSnapshot=null;
    sharedThemes=[]; sharedCount=0; rotating=false;
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
      /* équipes tournantes : seuls le donneur et le devineur de la manche bloquent la partie */
      if(rotating && s!==state.giverSeat && s!==state.guesserSeat) continue;
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
    $('formatBtnRot').classList.remove('active');
    sfxToggle();
  });
  $('formatBtn2v2').addEventListener('click',function(){
    selectedCreateFormat='2v2';
    $('formatBtn2v2').classList.add('active');
    $('formatBtn1v1').classList.remove('active');
    $('formatBtnRot').classList.remove('active');
    sfxToggle();
  });
  $('formatBtnRot').addEventListener('click',function(){
    selectedCreateFormat='rot';
    $('formatBtnRot').classList.add('active');
    $('formatBtn1v1').classList.remove('active');
    $('formatBtn2v2').classList.remove('active');
    sfxToggle();
  });

  /* ----- room creation (host) ----- */
  $('createRoomBtn').addEventListener('click',function(){
    var wantedCode=CG.readRoomCode('hostCodeInput');
    if(!wantedCode){ sfxToggle(); return; }
    myOnlineName = $('onlineName').value.trim() || 'Joueur 1';
    cleanupOnline();
    applyFormat(selectedCreateFormat);
    net.host(function(code){
      netRole='host'; mySeat=0;
      currentRoomCode=code;
      state.players=emptySeats(null); state.players[0]=myOnlineName;
      state.connected=emptySeats(true);
      seatClientIds=emptySeats(null); seatClientIds[0]=net.clientId;
      state.playerScores=emptySeats(0);
      state.rotIdx=0;
      sharedThemes=[];
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
      $('lobbyTitle').textContent = 'LOBBY — '+formatTitle();
      renderLobbyScreen();
      goto_('lobby');
    }, wantedCode);
    sfxToggle();
  });

  /* ----- host: seats ----- */
  function nextOpenSeat(){
    for(var s=1;s<totalSeats;s++){ if(!state.players[s]) return s; }
    return -1;
  }
  /* spectateurs (1 VS 1 / 2 VS 2) : places au-delà des joueurs ; ils voient tout */
  function watchSeat(){
    if(rotating) return -1;
    for(var s=totalSeats;s<MAX_SEATS;s++){ if(!state.players[s]) return s; }
    return -1;
  }
  function isWatcher(s){ return !rotating && s>=totalSeats; }
  function hostOnJoinRequest(msg){
    var s;
    /* même onglet qui revient : il récupère sa place */
    for(s=1;s<MAX_SEATS;s++){ if(msg.clientId && seatClientIds[s]===msg.clientId && state.players[s]) return s; }
    /* équipes tournantes : on peut arriver en cours de partie (on joue dès qu'un duo nous inclut) */
    if(!gameStarted || rotating){
      if(gameStarted){ for(s=1;s<totalSeats;s++){ if(state.connected[s]===false && state.players[s]===msg.name) return s; } }
      s=nextOpenSeat();
      if(s!==-1) return s;
      if(!gameStarted){ s=watchSeat(); return s!==-1 ? s : 'SALLE COMPLÈTE ('+totalSeats+'/'+totalSeats+')'; }
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
    if(free!==-1) return free;
    s=watchSeat();
    return s!==-1 ? s : 'PARTIE DÉJÀ EN COURS (SALLE PLEINE)';
  }
  function hostOnSeatJoined(seat, msg, isRepeat){
    var isNew=!state.players[seat];
    seatClientIds[seat]=msg.clientId||null;
    if(msg.name) state.players[seat]=msg.name;
    state.connected[seat]=true;
    if(isNew) state.playerScores[seat]=0;
    if(!isRepeat) hostAddSharedThemes(seat, msg.themes);
    net.sendTo(seat, {
      type:'seat_assigned', seat:seat, format:onlineFormat,
      players:state.players.slice(), connected:state.connected.slice(),
      teamNames:state.teamNames, roundsLimit:state.roundsLimit,
      started:gameStarted, snapshot:roundSnapshot, shared:sharedThemes.length
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
    if(isWatcher(seat)){
      state.players[seat]=null; seatClientIds[seat]=null;
      if(gameStarted) broadcastPlayerStatus(); else broadcastLobby();
      return;
    }
    /* équipes tournantes : un joueur qui n'a encore joué aucune manche libère simplement sa place */
    if(gameStarted && rotating && seat!==state.giverSeat && seat!==state.guesserSeat &&
       !state.history.some(function(h){ return h.giverSeat===seat || h.guesserSeat===seat; })){
      state.players[seat]=null; seatClientIds[seat]=null;
      broadcastPlayerStatus();
      return;
    }
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
    /* ... et seulement à la bonne étape de la manche (pas de doublon) */
    if((msg.type==='clue'||msg.type==='target') && (seat!==state.giverSeat || state.roundPhase!=='clue')) return;
    if((msg.type==='cursor'||msg.type==='guess_final') && (seat!==state.guesserSeat || state.roundPhase!=='guess')) return;
    if(msg.type!=='clue' && msg.type!=='target' && msg.type!=='cursor' && msg.type!=='guess_final') return;
    if(msg.type==='target'){ var pc=+msg.percent; if(!(pc>=0 && pc<=100)) return; msg={type:'target', percent:pc}; }
    logRoundMsg(msg);
    handleNetMessage(msg);
    net.sendToAllExcept(msg, seat);
  }
  function broadcastLobby(){
    net.sendToAll({type:'lobby_update', players:state.players.slice(), teamNames:state.teamNames, roundsLimit:state.roundsLimit, format:onlineFormat, shared:sharedThemes.length});
    renderLobbyScreen();
  }
  function broadcastPlayerStatus(){
    var msg={type:'player_status', players:state.players.slice(), connected:state.connected.slice(), playerScores:state.playerScores.slice()};
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
    var code = CG.cleanRoomCode($('joinCodeInput').value);
    if(!code){ shake($('joinCodeInput')); return; }
    cleanupOnline();
    netRole='guest';
    net.join(code, {name:myOnlineName, themes:myCustomThemes()});
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
  function renderWatchers(){
    var names=[];
    for(var s=totalSeats;s<MAX_SEATS && !rotating;s++){ if(state.players[s]) names.push(state.players[s]+(s===mySeat?' (toi)':'')); }
    var el=$('lobbyWatchers');
    el.textContent = names.length ? '👀 Spectateurs : '+names.join(', ') : '';
    el.hidden=!names.length;
  }
  function renderLobbyScreen(){
    renderWatchers();
    $('lobbyTeamCols').style.display = rotating ? 'none' : '';
    $('rotPlayerList').style.display = rotating ? '' : 'none';
    $('lobbySharedThemes').textContent = sharedCount ? '🎨 '+sharedCount+' thème'+(sharedCount>1?'s':'')+' perso des invités ajouté'+(sharedCount>1?'s':'')+' à la partie' : '';
    if(rotating){
      var rows='', n=0;
      for(var r=0;r<totalSeats;r++){
        if(!state.players[r]) continue; n++;
        rows+='<div class="seat filled">'+escapeHtml(state.players[r])+(r===mySeat?' (toi)':'')+(r===0?' 👑':'')+'</div>';
      }
      $('rotPlayerList').innerHTML=rows;
      var st=$('lobbyStatusMsg');
      if(n<ROT_MIN) st.textContent=n+' joueur(s) — '+ROT_MIN+' minimum, jusqu’à '+MAX_SEATS+'.';
      else st.textContent = netRole==='host' ? n+' joueurs. Tu peux lancer la partie (d’autres peuvent encore arriver).' : n+" joueurs. En attente que l'hôte lance la partie...";
      $('lobbyStartBtn').style.display = (netRole==='host' && n>=ROT_MIN) ? 'inline-block' : 'none';
      return;
    }
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
      statusEl.textContent = filled+' / '+totalSeats+' joueurs — en attente de '+(totalSeats-filled)+' joueur(s)...';
    } else {
      statusEl.textContent = netRole==='host' ? 'Équipe au complet ! Tu peux lancer la partie.' : "Équipe au complet ! En attente que l'hôte lance la partie...";
    }
    $('lobbyStartBtn').style.display = (netRole==='host' && filled===totalSeats) ? 'inline-block' : 'none';
    if(isWatcher(mySeat)) statusEl.textContent='👀 La salle est pleine : tu regardes la partie.';
  }
  $('lobbyStartBtn').addEventListener('click',function(){
    sfxValidate();
    gameStarted=true; gameEnded=false;
    state.pool = shuffle(gameThemes());
    hostAdvanceRoundOnline();
  });

  /* ----- round flow (host authoritative) ----- */
  function hostAdvanceRoundOnline(){
    if(state.pool.length===0){ state.pool=shuffle(gameThemes()); }
    var theme = state.pool.pop();
    var target = 6+Math.random()*88;
    var gg = computeGiverGuesserSeats();
    /* état avant la manche : un joueur qui revient le reçoit, puis on lui
       rejoue les messages de la manche (les points sont donc comptés une fois) */
    roundSnapshot = {teamScores:state.teamScores.slice(), playerScores:state.playerScores.slice(), history:JSON.parse(JSON.stringify(state.history))};
    roundLog = [];
    var msg = {type:'round_setup', round:state.round, theme:theme, targetPercent:target, activeTeam:state.activeTeam, giverSeat:gg.giver, guesserSeat:gg.guesser,
      players:state.players.slice()};
    handleNetMessage(msg);
    send(msg);
  }
  function hostGoToNextRoundOnline(){
    if(rotating){
      if(rotSeats().length<2){ var endMsg={type:'game_end'}; send(endMsg); handleNetMessage(endMsg); return; }
      state.rotIdx=(state.rotIdx||0)+1;
    }
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
        state.connected = msg.connected ? msg.connected.slice() : emptySeats(true);
        state.roundsLimit = msg.roundsLimit;
        sharedCount = msg.shared||0;
        if(msg.snapshot){
          state.teamScores = msg.snapshot.teamScores.slice();
          state.playerScores = (msg.snapshot.playerScores||emptySeats(0)).slice();
          state.history = msg.snapshot.history.slice();
        } else {
          state.teamScores=[0,0]; state.playerScores=emptySeats(0); state.history=[];
        }
        state.teamTurnCount=[0,0]; state.activeTeam=0;
        gameStarted = !!msg.started;
        gameEnded = false;
        $('lobbyCodeDisplay').textContent = currentRoomCode;
        $('lobbyTitle').textContent = 'LOBBY — '+formatTitle();
        renderLobbyScreen();
        refreshDisconnectBanner();
        /* partie déjà lancée : la suite (round_setup...) arrive juste après */
        if(!gameStarted) goto_('lobby');
        break;
      case 'lobby_update':
        state.players = msg.players.slice();
        state.roundsLimit = msg.roundsLimit;
        sharedCount = msg.shared||0;
        renderLobbyScreen();
        break;
      case 'player_status':
        state.players = msg.players.slice();
        state.connected = msg.connected.slice();
        if(msg.playerScores && netRole!=='host') state.playerScores = msg.playerScores.slice();
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
        if(msg.players && netRole!=='host') state.players = msg.players.slice();
        state.round = msg.round;
        state.currentTheme = msg.theme;
        state.targetPercent = msg.targetPercent;
        state.activeTeam = msg.activeTeam;
        state.giverSeat = msg.giverSeat;
        state.guesserSeat = msg.guesserSeat;
        state.clueText='';
        state.wagerActive=false;
        state.roundPhase='clue';
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
      case 'target':
        if(state.roundPhase!=='clue') break;
        state.targetPercent = msg.percent;
        if(dialTarget && mySeat===state.giverSeat) dialTarget.setTarget(state.targetPercent, true);
        break;
      case 'clue':
        if(state.roundPhase!=='clue') break;
        state.roundPhase='guess';
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
        if(state.roundPhase!=='guess') break;
        state.roundPhase='reveal';
        state.guessPercent = msg.percent;
        revealRoundOnline(!!msg.wager);
        break;
      case 'rematch':
        /* revanche dans la même salle : scores et historique à zéro */
        state.teamScores=[0,0]; state.playerScores=emptySeats(0); state.history=[];
        state.teamTurnCount=[0,0]; state.activeTeam=0; state.round=1; state.rotIdx=0;
        gameEnded=false;
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
    $('targetThemeName').textContent = themeTitle(state.currentTheme);
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
    var waitingText = (mySeat===state.guesserSeat) ? state.players[state.giverSeat] : (rotating ? duoLabel()+' jouent' : teamLabel(state.activeTeam)+' joue');
    if(isWatcher(mySeat)) waitingText='👀 '+waitingText;
    $('passOnlineGiverName').textContent = waitingText;
  }

  function renderSpectateScreenOnline(){
    $('spectateGuesserName').textContent = actorLabel(state.guesserSeat, state.activeTeam);
    $('spectateThemeName').textContent = themeTitle(state.currentTheme);
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
    $('guessThemeName').textContent = themeTitle(state.currentTheme);
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
    if(rotating){
      /* les deux joueurs du duo marquent */
      [state.giverSeat, state.guesserSeat].forEach(function(s){ state.playerScores[s]=Math.max(0, (state.playerScores[s]||0)+final); });
    } else state.teamScores[state.activeTeam] = Math.max(0, state.teamScores[state.activeTeam]+final);

    state.history.push({
      round:state.round, team:rotating ? 0 : state.activeTeam, teamName:teamLabel(state.activeTeam),
      giverSeat:state.giverSeat, guesserSeat:state.guesserSeat, target:state.targetPercent, guess:state.guessPercent,
      left:state.currentTheme.left, right:state.currentTheme.right,
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
    $('revealTeamScoreLine').textContent = rotating
      ? state.players[state.giverSeat]+' : '+state.playerScores[state.giverSeat]+' pts · '+state.players[state.guesserSeat]+' : '+state.playerScores[state.guesserSeat]+' pts'
      : teamLabel(state.activeTeam)+' : '+state.teamScores[state.activeTeam]+' pts au total';
    if(mySeat===state.guesserSeat || mySeat===state.giverSeat) saveEstimate(mySeat===state.guesserSeat ? 'guesser' : 'giver', base);

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
      showEndGameBtn(!isLastRound, function(){
        var endMsg={type:'game_end'};
        send(endMsg);
        handleNetMessage(endMsg);
      });
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
      showEndGameBtn(false);
      waitingLabel.style.display='inline-block';
      waitingLabel.textContent = isLastRound ? "⏳ En attente que l'hôte affiche les résultats..." : "⏳ En attente que l'hôte lance la manche suivante...";
    }
    goto_('reveal');
  }

  function renderEndScreenRot(){
    var order=[];
    for(var s=0;s<totalSeats;s++) if(state.players[s]) order.push(s);
    order.sort(function(a,b){ return (state.playerScores[b]||0)-(state.playerScores[a]||0); });
    var top=order.length ? state.playerScores[order[0]]||0 : 0;
    if(CG.account && order.indexOf(mySeat)!==-1) CG.account.record('demicercle', Math.max(0, state.playerScores[mySeat]||0), top>0 && (state.playerScores[mySeat]||0)===top);
    var winners=order.filter(function(s){ return (state.playerScores[s]||0)===top; });
    var html='<div class="end-winner-text">'+(top>0 ? escapeHtml(winners.map(function(s){ return state.players[s]; }).join(' & '))+(winners.length>1?' REMPORTENT':' REMPORTE')+' LA PARTIE !' : 'PERSONNE N’A MARQUÉ…')+'</div><div class="cls-podium">';
    order.forEach(function(s,i){
      html+='<div class="cls-podium-row'+(i===0?' first':'')+(s===mySeat?' me':'')+'"><span class="cls-pos">'+(winners.indexOf(s)!==-1 && top>0?'👑':(i+1))+'</span><span class="cls-slot-name">'+escapeHtml(state.players[s])+(s===mySeat?' (toi)':'')+'</span><span class="cham-vote-count">'+(state.playerScores[s]||0)+' pts</span></div>';
    });
    html+='</div>'+historyHtml();
    $('endOnlineContent').innerHTML = html;
  }
  function historyHtml(){
    var html = '<h3 class="rules-subhead" style="margin-top:22px;text-align:center;">HISTORIQUE DES MANCHES</h3>';
    html += '<div class="history-list">';
    for(var i=0;i<state.history.length;i++){
      var h=state.history[i];
      html += '<div class="history-row team'+h.team+'">';
      html += '<span class="hist-round">M'+h.round+'</span>';
      if(!rotating) html += '<span class="hist-team">'+escapeHtml(h.teamName)+'</span>';
      html += '<span class="hist-detail">'+escapeHtml(h.giver)+' ➜ '+escapeHtml(h.guesser)+' : « '+escapeHtml(h.clue)+' »'+(h.wager?' 🎲':'')+'</span>';
      html += '<span class="hist-points">'+(h.final>=0?'+':'')+h.final+'</span>';
      html += '</div>';
    }
    return html+'</div>';
  }
  function renderEndScreenOnline(){
    if(rotating){ renderEndScreenRot(); return; }
    var s0=state.teamScores[0], s1=state.teamScores[1];
    var winnerIdx = s0===s1 ? -1 : (s0>s1?0:1);
    var myTeam = seatsPerTeam===1 ? mySeat : Math.floor(mySeat/2);
    if(CG.account && !isWatcher(mySeat)) CG.account.record('demicercle', Math.max(0, state.teamScores[myTeam]||0), winnerIdx===myTeam);
    var prefix0 = seatsPerTeam===1 ? '' : '🔴 ';
    var prefix1 = seatsPerTeam===1 ? '' : '🔵 ';
    var html = '<div class="team-vs-final">';
    html += '<div class="team-final-block'+(winnerIdx===0?' winner':'')+'"><h3 style="color:var(--red-bright);">'+prefix0+escapeHtml(teamLabel(0))+'</h3><div class="team-final-score">'+s0+'</div>'+(winnerIdx===0?'<div class="crown">👑</div>':'')+'</div>';
    html += '<div class="team-vs-sep">VS</div>';
    html += '<div class="team-final-block blue'+(winnerIdx===1?' winner':'')+'"><h3 style="color:var(--blue);">'+prefix1+escapeHtml(teamLabel(1))+'</h3><div class="team-final-score">'+s1+'</div>'+(winnerIdx===1?'<div class="crown">👑</div>':'')+'</div>';
    html += '</div>';
    html += '<div class="end-winner-text">'+(winnerIdx===-1?'ÉGALITÉ PARFAITE !':escapeHtml(teamLabel(winnerIdx))+' REMPORTE LA PARTIE !')+'</div>';
    html += historyHtml();
    $('endOnlineContent').innerHTML = html;
  }

  /* ---------- THÈMES PARTAGÉS ----------
     En ligne, chaque invité apporte les thèmes qu'il a ajoutés à sa banque :
     l'hôte les mélange aux siens pour toute la partie (« thème de Alice »). */
  var sharedThemes=[], sharedCount=0, SHARED_MAX=30;
  function themeKey(t){ return CG.normalizeWord(t.theme)+'|'+CG.normalizeWord(t.left)+'|'+CG.normalizeWord(t.right); }
  function myCustomThemes(){
    var known={};
    DEFAULT_THEMES.forEach(function(t){ known[themeKey(t)]=true; });
    return state.allThemes.filter(function(t){ return t && !known[themeKey(t)]; }).slice(0,SHARED_MAX)
      .map(function(t){ return {theme:t.theme, left:t.left, right:t.right}; });
  }
  function hostAddSharedThemes(seat, list){
    if(!Array.isArray(list)) return;
    var have={};
    state.allThemes.concat(sharedThemes).forEach(function(t){ have[themeKey(t)]=true; });
    list.slice(0,SHARED_MAX).forEach(function(t){
      if(!t || typeof t!=='object') return;
      var th={theme:String(t.theme||'').trim().slice(0,30), left:String(t.left||'').trim().slice(0,20).toUpperCase(),
        right:String(t.right||'').trim().slice(0,20).toUpperCase(), by:state.players[seat]||'?'};
      if(!th.theme || !th.left || !th.right || have[themeKey(th)]) return;
      have[themeKey(th)]=true;
      sharedThemes.push(th);
      /* partie en cours : le thème entre dans la pioche tout de suite */
      if(gameStarted) state.pool.splice(Math.floor(Math.random()*(state.pool.length+1)), 0, th);
    });
    sharedCount=sharedThemes.length;
  }
  function gameThemes(){ return state.allThemes.concat(sharedThemes); }
  function themeTitle(t){ return t.theme+(t.by ? ' · thème de '+t.by : ''); }

  /* ---------- MEILLEURES ESTIMATIONS ----------
     Gardées dans le navigateur (les 10 meilleures) et, si on est connecté,
     envoyées au compte : le menu affiche les siennes et le top de tout le monde. */
  var EST_KEY='demicercle_best_v1', EST_KEEP=10;
  function loadEstimates(){
    try{ var a=JSON.parse(localStorage.getItem(EST_KEY)||'[]'); if(Array.isArray(a)) return a; }catch(e){}
    return [];
  }
  function estimateSort(a,b){ return (b.points-a.points) || (Math.abs(a.target-a.guess)-Math.abs(b.target-b.guess)) || (b.at-a.at); }
  /* who : nom du joueur en local (même écran) ; en ligne, c'est toi */
  function saveEstimate(role, base, who){
    var t=state.currentTheme||{};
    var e={role:role, points:base, theme:t.theme||'', left:t.left||'', right:t.right||'', clue:state.clueText||'',
      target:Math.round(state.targetPercent*10)/10, guess:Math.round(state.guessPercent*10)/10, at:Date.now(), who:who||''};
    var list=loadEstimates(); list.push(e); list.sort(estimateSort);
    try{ localStorage.setItem(EST_KEY, JSON.stringify(list.slice(0,EST_KEEP))); }catch(err){}
    if(!who && base>=50 && CG.account && CG.account.recordEstimate) CG.account.recordEstimate(e);
    if(!who && role==='guesser' && base>=100 && CG.achieve){ CG.achieve('dc_perfect'); CG.achieveCount('dc_perfect', 5, 'dc_perfect5'); }
    renderBestEstimates();
  }
  function estimateRow(e, name){
    var gap=Math.abs(e.target-e.guess);
    return '<div class="est-row"><span class="est-pts">'+e.points+'</span><span class="est-body"><b>« '+escapeHtml(e.clue)+' »</b> '+
      '<small>'+escapeHtml(e.theme)+' ('+escapeHtml(e.left)+' ⟷ '+escapeHtml(e.right)+') · écart '+String(Math.round(gap*10)/10).replace('.',',')+' %'+
      (name ? ' · '+escapeHtml(name) : '')+(e.role==='giver' ? ' · 🎯 indice' : ' · 🕵️ estimation')+'</small></span></div>';
  }
  var estTab='mine';
  function renderBestEstimates(){
    var box=$('bestEstList'); if(!box) return;
    var tabs=$('bestEstTabs').querySelectorAll('button');
    Array.prototype.forEach.call(tabs, function(b){ b.classList.toggle('active', b.getAttribute('data-tab')===estTab); });
    if(estTab==='mine'){
      var list=loadEstimates();
      box.innerHTML = list.length ? list.slice(0,5).map(function(e){ return estimateRow(e, e.who); }).join('')
        : '<p class="theme-count">Aucune estimation pour l’instant : joue une manche !</p>';
      return;
    }
    box.innerHTML='<p class="theme-count">Chargement…</p>';
    if(!CG.account || !CG.account.bestEstimates){ box.innerHTML='<p class="theme-count">Indisponible.</p>'; return; }
    CG.account.bestEstimates(8).then(function(rows){
      if(estTab!=='all') return;
      box.innerHTML = rows.length ? rows.map(function(r){
        return estimateRow({points:r.points, theme:r.theme, left:r.left_label, right:r.right_label, clue:r.clue, target:+r.target, guess:+r.guess, role:r.role}, r.display_name);
      }).join('') : '<p class="theme-count">Pas encore de record : connecte-toi et fais un « pile poil » en ligne !</p>';
    }, function(){ if(estTab==='all') box.innerHTML='<p class="theme-count">Top indisponible pour le moment.</p>'; });
  }
  Array.prototype.forEach.call($('bestEstTabs').querySelectorAll('button'), function(b){
    b.addEventListener('click', function(){ estTab=b.getAttribute('data-tab'); sfxToggle(); renderBestEstimates(); });
  });

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
      $('joinCodeInput').value = CG.cleanRoomCode(decodeURIComponent(code));
    }
  };

  renderThemeList();
  renderBestEstimates();
  /* réactions et petits messages dans le lobby (common.js) */
  CG.lobbyChat(net, $('lobbyStatusMsg'), 'onlineName');
})();
