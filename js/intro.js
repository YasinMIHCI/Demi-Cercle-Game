/* CRAZY GAMES — intro animée d'environ 5 secondes.
   Tout est dessiné en code sur un canvas (aucune image ni vidéo à charger).
   Pas de personnage : c'est la caméra qui raconte, avec des mouvements
   continus et amortis (aucune coupe sèche pendant le vol).

   Déroulé :
   0,00 s  ouverture : un trait blanc tranche l'écran en diagonale, les deux
           moitiés noires s'écartent ;
   0,00 s  la ville : nuit rouge, lune géante en trame de points, trois plans de
           buildings en parallaxe, néons, projecteurs. La caméra glisse au ras
           des toits en accélérant doucement, pendant que de longs rubans rouges,
           noirs et blancs ondulent dans le ciel ;
   1,90 s  elle s'élève et ralentit, des rayons s'ouvrent derrière la lune, puis
           elle plonge vers elle ; une onde de choc part de la lune et une
           énorme bande rouge recouvre l'écran ;
   3,00 s  titre : la bande repart en s'affinant, les lettres de CRAZY GAMES
           claquent une à une, bandeau LET'S PLAY ;
   4,50 s  sortie : des bandes noires, rouges et blanches balaient l'écran et
           dévoilent le hub.

   On peut passer l'intro (bouton « Passer », Échap). Toucher l'écran active le
   son s'il est encore bloqué par le navigateur. Elle n'est pas jouée quand on
   arrive par un lien d'invitation (#jeu?room=...), ni si l'utilisateur préfère
   réduire les animations. Dans l'app installée, elle ne passe qu'à la première
   ouverture de la journée. ?introt=1.5 fige l'image à 1,5 s (pour la mise au
   point). */
(function(){
  'use strict';
  var overlay=document.getElementById('introOverlay');
  if(!overlay) return;
  var reduce=window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var debugT=(/[?&]introt=([0-9.]+)/.exec(location.search)||[])[1];
  var AU=window.CGAudio||null;
  /* dans l'app installée (écran d'accueil) : une seule fois par jour */
  var isApp=(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone===true;
  var today=new Date(), dayKey=today.getFullYear()+'-'+(today.getMonth()+1)+'-'+today.getDate(), seenToday=false;
  if(isApp){
    try{ seenToday=localStorage.getItem('cg_intro_day')===dayKey; if(!seenToday) localStorage.setItem('cg_intro_day', dayKey); }catch(e){}
  }
  if(!debugT && (window.CG_NO_INTRO || /room=/.test(location.hash) || reduce || seenToday)){
    overlay.parentNode.removeChild(overlay);
    if(AU) AU.allowMusic(true);
    return;
  }

  /* ===================== OUTILS ===================== */
  var TAU=Math.PI*2;
  function clamp01(u){ return u<0?0:(u>1?1:u); }
  function lerp(a,b,u){ return a+(b-a)*u; }
  function seg(t,a,b){ return clamp01((t-a)/(b-a)); }
  function smooth(u){ u=clamp01(u); return u*u*(3-2*u); }
  function easeOutCubic(u){ u=clamp01(u); return 1-Math.pow(1-u,3); }
  function easeInCubic(u){ u=clamp01(u); return u*u*u; }
  function easeInOutCubic(u){ u=clamp01(u); return u<0.5 ? 4*u*u*u : 1-Math.pow(-2*u+2,3)/2; }
  function easeInOutSine(u){ u=clamp01(u); return 0.5-0.5*Math.cos(Math.PI*u); }
  function easeOutBack(u){ u=clamp01(u); var c1=2.2, c3=c1+1; return 1+c3*Math.pow(u-1,3)+c1*Math.pow(u-1,2); }
  function rng(seed){ return function(){ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; }; }

  var RED='#E60012', RED_HOT='#ff1a3a', YELLOW='#FFE600', BLACK='#050505', WHITE='#ffffff';
  var FONT_DISPLAY='"Bebas Neue", Impact, "Arial Black", sans-serif';
  var RANSOM_FONTS=['"Bebas Neue", Impact, sans-serif', '"Permanent Marker", "Comic Sans MS", cursive',
    'Georgia, "Times New Roman", serif', '"Oswald", "Arial Black", sans-serif', 'Impact, "Arial Black", sans-serif'];
  /* les polices ne servent qu'au canvas : on force leur chargement */
  if(document.fonts && document.fonts.load){
    ['400 100px "Bebas Neue"','400 100px "Permanent Marker"','700 100px "Oswald"'].forEach(function(f){
      try{ document.fonts.load(f); }catch(e){}
    });
  }

  /* ===================== CHRONOLOGIE ===================== */
  var T_RISE=1.9, T_DIVE=2.35, T_WAVE=2.72, T_BAND=2.6, T_TITLE=3.0, T_EXIT=4.5, TOTAL=4.95, LT0=0.3;

  /* ===================== CANVAS ===================== */
  var canvas=document.getElementById('introCanvas');
  var ctx=canvas.getContext('2d');
  var W=0, H=0, DPR=1, S=1, VW=1920;        /* on dessine en « unités » : l'écran fait 1080 de haut */
  var halftoneRed=null, halftoneBlack=null, moonSprite=null, midSprites=[], towerSprite=null;

  function resize(){
    W=window.innerWidth; H=window.innerHeight;
    DPR=Math.min(window.devicePixelRatio||1, 2);
    canvas.width=Math.round(W*DPR); canvas.height=Math.round(H*DPR);
    canvas.style.width=W+'px'; canvas.style.height=H+'px';
    S=H/1080; VW=W/S;
    halftoneRed=makeHalftone('rgba(255,26,58,1)');
    halftoneBlack=makeHalftone('rgba(0,0,0,1)');
    moonSprite=makeMoon();
    towerSprite=makeTower();
    ROOFS.forEach(function(rf){ if(rf.board) rf.sprite=makeBoard(rf); });
    var maxX=(camX(T_TITLE)+VW)*0.5+VW+400;
    midSprites=MID.map(function(b){ return (b.x+b.w>-VW && b.x<maxX) ? makeMidSprite(b) : null; });
  }
  function base(c){ (c||ctx).setTransform(DPR*S,0,0,DPR*S,0,0); }
  function newCanvas(wu,hu,px){
    px=px||S*DPR;
    var c=document.createElement('canvas');
    c.width=Math.max(1,Math.ceil(wu*px)); c.height=Math.max(1,Math.ceil(hu*px));
    var x=c.getContext('2d'); x.setTransform(px,0,0,px,0,0);
    return {c:c, x:x};
  }

  /* Trame de points (comics) : grosse dans deux coins, nulle au centre. */
  function makeHalftone(color){
    var o=newCanvas(VW,1080), x=o.x, step=16;
    x.fillStyle=color;
    for(var py=0;py<1080+step;py+=step){
      for(var px=0;px<VW+step;px+=step){
        var ox=px+((py/step)%2?step/2:0);
        var d1=Math.hypot(ox/VW, (1080-py)/1080);          /* coin bas-gauche */
        var d2=Math.hypot((VW-ox)/VW, py/1080);            /* coin haut-droit */
        var r=Math.max(0, 0.62-Math.min(d1,d2))*15;
        if(r>0.6){ x.beginPath(); x.arc(ox,py,r,0,TAU); x.fill(); }
      }
    }
    return o.c;
  }
  function makeMoon(){
    var R=230, o=newCanvas(R*2+160,R*2+160), x=o.x, c=R+80;
    x.shadowColor='rgba(255,40,60,0.9)'; x.shadowBlur=70;
    var g=x.createRadialGradient(c-60,c-70,20,c,c,R);
    g.addColorStop(0,'#fff6ec'); g.addColorStop(0.55,'#ffd9c9'); g.addColorStop(1,'#ff6b6b');
    x.fillStyle=g; x.beginPath(); x.arc(c,c,R,0,TAU); x.fill();
    x.shadowBlur=0;
    /* trame rouge sur le bas de la lune */
    x.save(); x.beginPath(); x.arc(c,c,R,0,TAU); x.clip();
    x.fillStyle='rgba(200,0,30,0.55)';
    for(var py=c-R;py<c+R;py+=12){
      for(var px=c-R;px<c+R;px+=12){
        var k=(py-(c-R*0.2))/(R*1.2);
        var r=Math.max(0,k)*5.2;
        if(r>0.4){ x.beginPath(); x.arc(px+((py/12)%2?6:0),py,r,0,TAU); x.fill(); }
      }
    }
    x.restore();
    return o.c;
  }
  /* tour en treillis rouge au loin, halo compris, dessinée une fois */
  function makeTower(){
    var o=newCanvas(280,640), x=o.x, tx=140, ty=20;
    x.strokeStyle='rgba(255,40,60,0.85)'; x.lineWidth=3; x.shadowColor=RED_HOT; x.shadowBlur=12;
    x.beginPath();
    x.moveTo(tx-110,550); x.lineTo(tx-14,ty+80); x.lineTo(tx,ty); x.lineTo(tx+14,ty+80); x.lineTo(tx+110,550);
    for(var k=0;k<8;k++){
      var yy=ty+90+k*75, half=14+(yy-ty-80)/(550-ty-80)*96;
      if(yy>550) break;
      x.moveTo(tx-half,yy); x.lineTo(tx+half,yy);
      if(k<6){ var yn=yy+75, hn=14+(yn-ty-80)/(550-ty-80)*96; x.moveTo(tx-half,yy); x.lineTo(tx+hn,yn); x.moveTo(tx+half,yy); x.lineTo(tx-hn,yn); }
    }
    x.stroke(); x.shadowBlur=0;
    x.fillStyle=RED_HOT; x.fillRect(tx-30,ty+300,60,14); x.fillRect(tx-46,ty+470,92,16);
    return o.c;
  }
  function makeBoard(rf){
    var bw=Math.min(380, rf.x1-rf.x0-180), o=newCanvas(bw+60, 170), x=o.x;
    x.translate(30,30);
    x.fillStyle=BLACK; x.fillRect(30, 110, 8, 30); x.fillRect(bw-38, 110, 8, 30);
    x.fillStyle='#160006'; x.fillRect(0, 0, bw, 110);
    x.strokeStyle=rf.neon; x.lineWidth=4; x.shadowColor=rf.neon; x.shadowBlur=18;
    x.strokeRect(0, 0, bw, 110);
    x.fillStyle=rf.neon; x.font='64px '+FONT_DISPLAY; x.textAlign='center'; x.textBaseline='middle';
    x.fillText(rf.label, bw/2, 56, bw-30);
    return {c:o.c, w:bw+60};
  }

  /* ===================== LA VILLE ===================== */
  /* plan lointain (parallaxe 0.2) : silhouettes simples */
  var FAR=[], FAR_WIN=[];
  (function(){
    var r=rng(7), x=-600;
    while(x<5200){
      var w=90+r()*170, top=360+r()*260;
      FAR.push({x:x, w:w, top:top, spire:r()<0.2});
      for(var k=0;k<6;k++) if(r()<0.6) FAR_WIN.push({x:x+8+r()*(w-16), y:top+20+r()*(1080-top), c:r()<0.7?'rgba(255,90,90,0.55)':'rgba(255,214,120,0.5)', ph:r()*TAU});
      x+=w+r()*24-8;
    }
  })();
  /* plan du milieu (parallaxe 0.5) : immeubles éclairés + enseignes néon, pré-rendus */
  var SIGNS=['BAR','HOTEL','24H','CLUB','RAMEN','KARAOKE','ARCADE','★★★'];
  var BOARDS=['CRAZY GAMES','GAME ON','PLAY'];
  var NEONS=['#ff2a6d','#05d9e8','#ffe600','#ff6ec7','#7cff6e','#ffffff'];
  var MID=[];
  (function(){
    var r=rng(42), x=-900, i=0, j=0;
    while(x<6600){
      var w=150+r()*190, top=430+r()*230;
      MID.push({x:x, w:w, top:top, seed:Math.floor(r()*1e9), sign:r()<0.45 ? SIGNS[i++%SIGNS.length] : null,
        neon:NEONS[Math.floor(r()*NEONS.length)], board:r()<0.18 ? BOARDS[j++%BOARDS.length] : null, tint:r(), ph:r()*TAU});
      x+=w+10+r()*50;
    }
  })();
  function makeMidSprite(b){
    /* plan du milieu : une résolution plus faible suffit et économise la mémoire */
    var hgt=1080-b.top+300, pad=40, o=newCanvas(b.w+pad*2, hgt+pad+80, Math.min(S*DPR,1.1)), x=o.x, r=rng(b.seed);
    x.translate(pad, pad+80);
    var g=x.createLinearGradient(0,0,0,hgt);
    var base=b.tint<0.5 ? ['#1d0b14','#0b0408'] : ['#140f1f','#07050a'];
    g.addColorStop(0,base[0]); g.addColorStop(1,base[1]);
    x.fillStyle=g; x.fillRect(0,0,b.w,hgt);
    /* liseré lumineux côté lune */
    x.fillStyle='rgba(255,60,80,0.28)'; x.fillRect(0,0,3,hgt);
    /* fenêtres */
    var lit=['#ffd46b','#fff3c4','#7fe8ff','#ff8aa0'];
    for(var wy=24;wy<hgt-20;wy+=30){
      for(var wx=12;wx<b.w-20;wx+=24){
        var v=r();
        if(v<0.33){ x.fillStyle=lit[Math.floor(r()*lit.length)]; x.globalAlpha=0.55+r()*0.4; x.fillRect(wx,wy,12,16); x.globalAlpha=1; }
        else if(v<0.7){ x.fillStyle='rgba(255,255,255,0.05)'; x.fillRect(wx,wy,12,16); }
      }
    }
    /* toit : antennes */
    x.strokeStyle='#0b0408'; x.lineWidth=3;
    for(var a=0;a<2;a++) if(r()<0.6){ var ax=20+r()*(b.w-40), ah=30+r()*60; x.beginPath(); x.moveTo(ax,0); x.lineTo(ax,-ah); x.stroke(); }
    x.fillStyle='#0b0408'; if(r()<0.5) x.fillRect(b.w*0.2, -18, b.w*0.3, 18);
    /* enseigne verticale au néon */
    x.shadowColor=b.neon; x.shadowBlur=18;
    if(b.sign){
      var letters=b.sign.split(''), sh=letters.length*30+24, sx=b.w-48, sy=40;
      x.fillStyle='#0a0a0a'; x.fillRect(sx,sy,38,sh);
      x.strokeStyle=b.neon; x.lineWidth=3; x.strokeRect(sx,sy,38,sh);
      x.fillStyle=b.neon; x.font='26px '+FONT_DISPLAY; x.textAlign='center'; x.textBaseline='middle';
      letters.forEach(function(ch,k){ x.fillText(ch, sx+19, sy+24+k*30); });
    }
    /* panneau publicitaire sur le toit */
    if(b.board){
      var bw=Math.min(b.w-20,200), bx=(b.w-bw)/2;
      x.shadowBlur=0; x.fillStyle='#0b0408'; x.fillRect(bx+20,-30,6,30); x.fillRect(bx+bw-26,-30,6,30);
      x.shadowBlur=20; x.fillStyle='#120006'; x.fillRect(bx,-90,bw,60);
      x.strokeStyle=b.neon; x.lineWidth=3; x.strokeRect(bx,-90,bw,60);
      x.fillStyle=b.neon; x.font='34px '+FONT_DISPLAY; x.textAlign='center'; x.textBaseline='middle';
      x.fillText(b.board, bx+bw/2, -59, bw-16);
    }
    x.shadowBlur=0;
    return {c:o.c, ox:pad, oy:pad+80, w:b.w+pad*2, h:hgt+pad+80};
  }
  /* premier plan (parallaxe 1) : les toits que la caméra survole */
  var ROOFS=[];
  (function(){
    var r=rng(2024), x=-2400, i=0;
    while(x<9000){
      var w=520+r()*900, top=640+r()*170;
      var rf={x0:x, x1:x+w, top:top, tank:r()<0.35, antenna:r()<0.45, board:false, neon:NEONS[Math.floor(r()*3)], label:BOARDS[i%BOARDS.length]};
      if(w>800 && r()<0.4){ rf.board=true; i++; }
      rf.wins=[];
      for(var wy=top+60; wy<1500; wy+=64){
        for(var wx=x+30; wx<x+w-40; wx+=52){ var v=r(); if(v<0.5) rf.wins.push({x:wx, y:wy, lit:v<0.13}); }
      }
      rf.ac=[]; for(var k=0;k<3;k++) rf.ac.push(x+60+r()*(w-160));
      ROOFS.push(rf);
      x+=w+140+r()*360;
    }
  })();
  /* premier plan très proche (parallaxe 1.6) : poteaux et câbles */
  var POLES=[]; for(var pi=0;pi<14;pi++) POLES.push(-900+pi*1300);
  /* particules qui flottent */
  var EMBERS=[], TWINKLES=[];
  (function(){
    var r=rng(9);
    for(var i=0;i<70;i++) EMBERS.push({x:r(), y:r()*1080, v:30+r()*90, s:2+r()*4, c:r()<0.7?RED_HOT:YELLOW, w:r()*TAU});
    for(i=0;i<18;i++) TWINKLES.push({x:r(), y:40+r()*420, s:8+r()*16, ph:r()*TAU, sp:2+r()*3});
  })();
  /* projecteurs qui balaient le ciel, entre le plan lointain et celui du milieu */
  var LIGHTS=[{x:300, ph:0.0, sp:0.9}, {x:1500, ph:2.1, sp:0.7}, {x:2700, ph:4.0, sp:1.1}, {x:3900, ph:1.2, sp:0.8}];

  /* ===================== LA CAMÉRA =====================
     La vitesse varie en douceur : départ lent, pleine vitesse, puis elle
     ralentit en montant pour regarder la lune. On intègre une fois pour toutes. */
  var CAM_DT=1/240, CAM_X=[0];
  function camSpeed(t){
    return lerp(650, 1750, easeOutCubic(seg(t,0,0.9)))*(1-0.75*smooth(seg(t,T_RISE-0.1,T_TITLE)));
  }
  (function(){
    for(var i=1, x=0; i*CAM_DT<=T_TITLE+0.05; i++){ x+=camSpeed(i*CAM_DT)*CAM_DT; CAM_X.push(x); }
  })();
  function camX(t){
    var f=Math.max(0, t)/CAM_DT, i=Math.min(CAM_X.length-2, Math.floor(f));
    return lerp(CAM_X[i], CAM_X[i+1], Math.min(1, f-i))-700;
  }
  function camera(t){
    /* au ras des toits, puis la caméra s'élève pour dégager la ligne d'horizon */
    var y=lerp(230, -230, easeInOutSine(seg(t,0.15,T_DIVE+0.3)));
    var roll=0.022*Math.sin(t*1.4)*(1-smooth(seg(t,T_RISE,T_DIVE)));
    return {x:camX(t), y:y, roll:roll};
  }
  function moonPos(cam){ return {x:VW*0.66-cam.x*0.03, y:300-cam.y*0.08}; }

  /* ===================== RENDU : LA VILLE ===================== */
  function drawSky(cam, t){
    var g=ctx.createLinearGradient(0,-200,0,1200);
    g.addColorStop(0,'#030003'); g.addColorStop(0.42,'#2b0010'); g.addColorStop(0.68,'#8d0018'); g.addColorStop(1,'#2a0008');
    ctx.fillStyle=g; ctx.fillRect(-400,-400,VW+800,1900);
    var mp=moonPos(cam);
    /* rayons qui s'ouvrent derrière la lune quand la caméra la regarde */
    var ra=smooth(seg(t,T_RISE,T_DIVE+0.2));
    if(ra>0){
      ctx.globalAlpha=0.5*ra;
      sunburst(ctx, mp.x, mp.y, 20, t*0.35, 'rgba(255,30,60,0.55)');
      ctx.globalAlpha=1;
    }
    var pulse=1+0.04*Math.sin(t*3)*ra;
    ctx.drawImage(moonSprite, mp.x-310*pulse, mp.y-310*pulse, 620*pulse, 620*pulse);
    /* étoiles qui scintillent */
    TWINKLES.forEach(function(s){
      var a=Math.max(0, Math.sin(t*s.sp+s.ph));
      if(a<0.05) return;
      ctx.globalAlpha=a*0.9; ctx.fillStyle=WHITE;
      star4(ctx, s.x*VW-cam.x*0.02, s.y-cam.y*0.03, s.s*a, s.s*a*0.18);
    });
    ctx.globalAlpha=1;
  }
  function drawFar(cam, t){
    var ox=-cam.x*0.2, oy=-cam.y*0.2;
    ctx.save(); ctx.translate(ox, oy);
    var x0=-ox-80, x1=-ox+VW+80;
    ctx.fillStyle='#14030a';
    FAR.forEach(function(b){
      if(b.x+b.w<x0 || b.x>x1) return;
      ctx.fillRect(b.x, b.top, b.w, 1500-b.top);
      if(b.spire){ ctx.beginPath(); ctx.moveTo(b.x+b.w*0.3,b.top); ctx.lineTo(b.x+b.w*0.5,b.top-90); ctx.lineTo(b.x+b.w*0.7,b.top); ctx.fill(); }
    });
    FAR_WIN.forEach(function(w){
      if(w.x<x0 || w.x>x1) return;
      ctx.globalAlpha=0.6+0.4*Math.sin(t*1.5+w.ph);
      ctx.fillStyle=w.c; ctx.fillRect(w.x,w.y,4,5);
    });
    ctx.globalAlpha=1;
    if(1350>x0 && 950<x1) ctx.drawImage(towerSprite, 1010, 150, 280, 640);
    ctx.restore();
    /* brume rouge à l'horizon */
    var g=ctx.createLinearGradient(0,560-cam.y*0.2,0,900-cam.y*0.2);
    g.addColorStop(0,'rgba(255,20,50,0)'); g.addColorStop(0.5,'rgba(255,20,50,0.22)'); g.addColorStop(1,'rgba(40,0,10,0)');
    ctx.fillStyle=g; ctx.fillRect(-400,-400,VW+800,1900);
  }
  function drawLights(cam, t){
    var ox=-cam.x*0.35, oy=-cam.y*0.35;
    ctx.save(); ctx.globalCompositeOperation='lighter';
    LIGHTS.forEach(function(l){
      var bx=l.x+ox; if(bx<-900 || bx>VW+900) return;
      var by=1000+oy, a=-Math.PI/2+0.55*Math.sin(t*l.sp+l.ph), len=1500, spread=0.07;
      var g=ctx.createLinearGradient(bx, by, bx+Math.cos(a)*len, by+Math.sin(a)*len);
      g.addColorStop(0,'rgba(255,150,170,0.22)'); g.addColorStop(1,'rgba(255,60,90,0)');
      ctx.fillStyle=g;
      ctx.beginPath(); ctx.moveTo(bx,by);
      ctx.lineTo(bx+Math.cos(a-spread)*len, by+Math.sin(a-spread)*len);
      ctx.lineTo(bx+Math.cos(a+spread)*len, by+Math.sin(a+spread)*len);
      ctx.closePath(); ctx.fill();
    });
    ctx.restore();
  }
  function drawMid(cam, t){
    var ox=-cam.x*0.5, oy=-cam.y*0.5;
    var x0=-ox-400, x1=-ox+VW+50;
    MID.forEach(function(b,i){
      if(b.x+b.w<x0 || b.x>x1) return;
      var sp=midSprites[i];
      if(!sp) return;
      ctx.drawImage(sp.c, b.x+ox-sp.ox, b.top+oy-sp.oy, sp.w, sp.h);
    });
  }
  function drawRoofs(cam, t){
    ctx.save(); ctx.translate(-cam.x, -cam.y);
    var x0=cam.x-300, x1=cam.x+VW+300;
    ROOFS.forEach(function(rf){
      if(rf.x1<x0 || rf.x0>x1) return;
      var w=rf.x1-rf.x0;
      ctx.fillStyle='#040306'; ctx.fillRect(rf.x0, rf.top, w, 1800);
      rf.wins.forEach(function(wn){
        if(wn.x<x0-60 || wn.x>x1) return;
        ctx.fillStyle= wn.lit ? 'rgba(255,190,80,0.7)' : 'rgba(60,20,32,0.5)';
        ctx.fillRect(wn.x, wn.y, 22, 30);
      });
      ctx.fillStyle=BLACK;
      rf.ac.forEach(function(ax){ ctx.fillRect(ax, rf.top-34, 56, 34); ctx.fillRect(ax+6, rf.top-44, 20, 10); });
      if(rf.tank){
        var tx=rf.x1-200;
        ctx.fillRect(tx, rf.top-70, 8, 70); ctx.fillRect(tx+70, rf.top-70, 8, 70);
        ctx.fillRect(tx-6, rf.top-160, 90, 92);
        ctx.beginPath(); ctx.moveTo(tx-12,rf.top-160); ctx.lineTo(tx+39,rf.top-196); ctx.lineTo(tx+90,rf.top-160); ctx.fill();
        ctx.fillStyle='rgba(255,40,60,0.6)'; ctx.fillRect(tx-6, rf.top-160, 3, 92);
        ctx.fillStyle=BLACK;
      }
      if(rf.antenna){
        var axx=rf.x0+90, blink=0.5+0.5*Math.sin(t*5+rf.x0);
        ctx.fillRect(axx, rf.top-190, 6, 190);
        ctx.fillRect(axx-26, rf.top-150, 58, 4); ctx.fillRect(axx-16, rf.top-120, 38, 4);
        ctx.globalAlpha=blink;
        ctx.fillStyle='rgba(255,26,58,0.25)'; ctx.beginPath(); ctx.arc(axx+3, rf.top-196, 16, 0, TAU); ctx.fill();
        ctx.fillStyle=RED_HOT; ctx.beginPath(); ctx.arc(axx+3, rf.top-196, 6, 0, TAU); ctx.fill();
        ctx.globalAlpha=1; ctx.fillStyle=BLACK;
      }
      if(rf.board && rf.sprite){
        var bx=rf.x0+(w-rf.sprite.w)/2;
        ctx.fillRect(bx+60, rf.top-120, 8, 120); ctx.fillRect(bx+rf.sprite.w-68, rf.top-120, 8, 120);
        ctx.globalAlpha=0.85+0.15*Math.sin(t*9+rf.x0);
        ctx.drawImage(rf.sprite.c, bx, rf.top-260, rf.sprite.w, 170);
        ctx.globalAlpha=1;
      }
      /* rambarde + rebord, liseré rouge (la lune) */
      ctx.fillRect(rf.x0-10, rf.top-12, w+20, 16);
      ctx.fillRect(rf.x0-10, rf.top-46, w+20, 4);
      for(var px=rf.x0; px<=rf.x1; px+=34) ctx.fillRect(px, rf.top-46, 4, 36);
      ctx.fillStyle='rgba(255,26,58,0.22)'; ctx.fillRect(rf.x0-14, rf.top-22, w+28, 18);
      ctx.fillStyle=RED_HOT; ctx.fillRect(rf.x0-10, rf.top-14, w+20, 4);
      ctx.fillStyle='rgba(255,26,58,0.35)'; ctx.fillRect(rf.x0-10, rf.top-48, w+20, 2);
    });
    ctx.restore();
  }
  function drawForeground(cam){
    var ox=-cam.x*1.6, oy=-cam.y*1.2;
    ctx.fillStyle='#000'; ctx.strokeStyle='#000'; ctx.lineWidth=5;
    for(var i=0;i<POLES.length-1;i++){
      var a=POLES[i]+ox, b=POLES[i+1]+ox;
      if(b<-300 || a>VW+300) continue;
      ctx.fillRect(a-14, 120+oy, 28, 1400);
      ctx.fillRect(a-60, 150+oy, 120, 10);
      for(var k=0;k<2;k++){
        ctx.beginPath(); ctx.moveTo(a+(k?50:-50), 160+oy);
        ctx.quadraticCurveTo((a+b)/2, 260+k*30+oy, b+(k?50:-50), 160+oy); ctx.stroke();
      }
    }
  }
  function drawEmbers(t){
    EMBERS.forEach(function(e){
      var y=((e.y-e.v*t)%1100+1100)%1100-10, x=e.x*VW+Math.sin(t*1.6+e.w)*22;
      ctx.globalAlpha=0.3+0.3*Math.sin(t*4+e.w);
      ctx.fillStyle=e.c; ctx.fillRect(x,y,e.s,e.s);
    });
    ctx.globalAlpha=1;
  }
  function drawVignette(){
    var g=ctx.createRadialGradient(VW/2,540,200,VW/2,540,Math.max(VW,1080)*0.75);
    g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,'rgba(0,0,0,0.75)');
    ctx.fillStyle=g; ctx.fillRect(0,0,VW,1080);
  }

  /* ===================== LES RUBANS =====================
     De longues bandes qui se dessinent d'un geste puis se retirent, en
     ondulant : rouge bordé de blanc, ou noir bordé de rouge. */
  var RIBBONS=[
    {t0:0.30, dur:1.5, x0:-0.15, y0:0.78, ang:-0.42, len:1.5, w:46, amp:70, k:1.4, col:RED, edge:WHITE, par:0.15},
    {t0:0.75, dur:1.5, x0:1.15, y0:0.18, ang:Math.PI+0.28, len:1.45, w:30, amp:55, k:1.8, col:BLACK, edge:RED_HOT, par:0.25},
    {t0:1.25, dur:1.4, x0:-0.15, y0:0.40, ang:-0.12, len:1.5, w:64, amp:90, k:1.1, col:RED, edge:BLACK, par:0.1}
  ];
  function drawRibbon(rb, t){
    var u=(t-rb.t0)/rb.dur;
    if(u<=0 || u>=1) return;
    var head=easeInOutSine(clamp01(u/0.62)), tail=easeInOutSine(clamp01((u-0.38)/0.62));
    if(head-tail<0.005) return;
    /* sur écran étroit (téléphone) : ruban plus long que l'écran, vague plus douce */
    var nar=Math.min(1, VW/1500), N=60, L=rb.len*Math.max(VW,1300), ca=Math.cos(rb.ang), sa=Math.sin(rb.ang);
    var ox=rb.x0<0.5 ? rb.x0*VW-(L-rb.len*VW)*0.5 : rb.x0*VW+(L-rb.len*VW)*0.5, oy=rb.y0*1080, left=[], right=[];
    for(var i=0;i<=N;i++){
      var s=lerp(tail, head, i/N);
      var wave=Math.sin(s*rb.k*TAU-t*3.2)*rb.amp*(0.5+0.5*nar);
      var cx=ox+ca*s*L-sa*wave, cy=oy+sa*s*L+ca*wave;
      /* largeur : fine aux deux bouts, et le ruban se « tord » (il s'affine par endroits) */
      var taper=Math.pow(Math.sin(Math.PI*clamp01((s-tail)/(head-tail||1))),0.5);
      var twist=0.35+0.65*Math.abs(Math.cos(s*rb.k*Math.PI*1.5-t*2.4));
      var hw=rb.w*taper*twist*(0.6+0.4*nar);
      left.push([cx+sa*hw, cy-ca*hw]); right.push([cx-sa*hw, cy+ca*hw]);
    }
    function strip(extra, col){
      ctx.fillStyle=col; ctx.beginPath();
      for(var i=0;i<left.length;i++){
        var dx=left[i][0]-right[i][0], dy=left[i][1]-right[i][1], d=Math.hypot(dx,dy)||1, ex=dx/d*extra, ey=dy/d*extra;
        if(i) ctx.lineTo(left[i][0]+ex, left[i][1]+ey); else ctx.moveTo(left[i][0]+ex, left[i][1]+ey);
      }
      for(i=right.length-1;i>=0;i--){
        var dx2=left[i][0]-right[i][0], dy2=left[i][1]-right[i][1], d2=Math.hypot(dx2,dy2)||1;
        ctx.lineTo(right[i][0]-dx2/d2*extra, right[i][1]-dy2/d2*extra);
      }
      ctx.closePath(); ctx.fill();
    }
    strip(7, rb.edge);
    strip(0, rb.col);
  }

  /* la scène de la ville à l'instant t */
  function drawCity(t){
    var cam=camera(t), mp=moonPos(cam);
    /* légère poussée au départ, puis plongée vers la lune */
    var zoom=1.07-0.07*easeOutCubic(seg(t,0,1.2))+0.5*easeInCubic(seg(t,T_DIVE,T_TITLE));
    base();
    ctx.save();
    ctx.translate(VW/2, 540); ctx.rotate(cam.roll); ctx.translate(-VW/2, -540);
    ctx.translate(mp.x, mp.y); ctx.scale(zoom,zoom); ctx.translate(-mp.x, -mp.y);
    drawSky(cam, t);
    ctx.save(); ctx.translate(-cam.x*RIBBONS[1].par, -cam.y*0.1); drawRibbon(RIBBONS[1], t); ctx.restore();
    drawFar(cam, t);
    drawLights(cam, t);
    drawEmbers(t);
    drawMid(cam, t);
    var hz=ctx.createLinearGradient(0,300,0,1080);
    hz.addColorStop(0,'rgba(60,0,18,0)'); hz.addColorStop(1,'rgba(40,0,12,0.6)');
    ctx.fillStyle=hz; ctx.fillRect(-400,-400,VW+800,1900);
    ctx.save(); ctx.translate(-cam.x*RIBBONS[0].par, 0); drawRibbon(RIBBONS[0], t); ctx.restore();
    drawRoofs(cam, t);
    drawRibbon(RIBBONS[2], t);
    drawForeground(cam);
    ctx.restore();
    /* onde de choc partie de la lune */
    var wv=seg(t,T_WAVE,T_WAVE+0.4);
    if(wv>0 && wv<1){
      var zr=1+0.5*easeInCubic(seg(t,T_DIVE,T_TITLE));
      var cx=VW/2+(mp.x-VW/2)*1, cy=mp.y;
      ctx.strokeStyle='rgba(255,255,255,'+(0.9*(1-wv))+')'; ctx.lineWidth=14*(1-wv)+2;
      ctx.beginPath(); ctx.arc(cx, cy, (230+900*easeOutCubic(wv))*zr, 0, TAU); ctx.stroke();
      ctx.fillStyle='rgba(255,255,255,'+(0.35*(1-wv))+')'; ctx.fillRect(0,0,VW,1080);
    }
    ctx.globalAlpha=0.33; ctx.drawImage(halftoneRed,0,0,VW,1080); ctx.globalAlpha=1;
    drawVignette();
    /* la grande bande arrive et recouvre tout */
    if(t>T_BAND) drawBigBand(seg(t,T_BAND,T_TITLE), 'in', t);
  }

  /* ===================== LA GRANDE BANDE (transition) =====================
     Une énorme bande rouge en diagonale, bordée de noir et de blanc, avec
     « CRAZY GAMES ★ » qui défile : elle entre par le bas jusqu'à couvrir
     l'écran, puis repart vers le haut en s'affinant (sur le titre). */
  var BAND_ANG=-0.3;
  function drawBigBand(v, mode, time){
    var D=Math.hypot(VW,1080), w, off;
    if(mode==='in'){ w=lerp(300, 2.4*D, easeInCubic(v)); off=lerp(0.85*D, 0, easeOutCubic(v)); }
    else { w=lerp(2.4*D, 90, easeOutCubic(Math.min(1,v*1.25))); off=lerp(0, -1.05*D, easeInCubic(v)); }
    if(w<=0) return;
    var nx=-Math.sin(BAND_ANG), ny=Math.cos(BAND_ANG);
    ctx.save();
    ctx.translate(VW/2+nx*off, 540+ny*off); ctx.rotate(BAND_ANG);
    var L=D*1.6;
    ctx.fillStyle=BLACK; ctx.fillRect(-L, -w/2-46, 2*L, w+92);
    ctx.fillStyle=WHITE; ctx.fillRect(-L, -w/2-30, 2*L, 10); ctx.fillRect(-L, w/2+20, 2*L, 10);
    ctx.fillStyle=RED; ctx.fillRect(-L, -w/2, 2*L, w);
    ctx.save(); ctx.beginPath(); ctx.rect(-L, -w/2, 2*L, w); ctx.clip();
    ctx.fillStyle=BLACK; ctx.fillRect(-L, -w/2+18, 2*L, 6); ctx.fillRect(-L, w/2-24, 2*L, 6);
    var fs=Math.min(Math.max(w*0.6, 60), 260), rows=Math.max(1, Math.min(7, Math.ceil(w/(fs*1.15)))), label='CRAZY GAMES ★ ';
    ctx.font='italic '+fs+'px '+FONT_DISPLAY; ctx.textBaseline='middle'; ctx.textAlign='left';
    var tw=ctx.measureText(label).width||1;
    for(var r=0;r<rows;r++){
      var ry=(r-(rows-1)/2)*fs*1.15, dir=r%2?1:-1, sh=((time*1200*dir)%tw+tw)%tw;
      ctx.fillStyle= r%2 ? 'rgba(0,0,0,0.9)' : 'rgba(0,0,0,0.75)';
      for(var x=-L-sh; x<L; x+=tw) ctx.fillText(label, x, ry+fs*0.04);
    }
    ctx.restore();
    ctx.restore();
  }

  function sunburst(c, cx, cy, rays, rot, col){
    var R=Math.hypot(VW,1080)*1.5;
    c.fillStyle=col;
    for(var i=0;i<rays;i++){
      var a0=rot+i*TAU/rays, a1=a0+TAU/rays*0.5;
      c.beginPath(); c.moveTo(cx,cy);
      c.lineTo(cx+Math.cos(a0)*R, cy+Math.sin(a0)*R);
      c.lineTo(cx+Math.cos(a1)*R, cy+Math.sin(a1)*R);
      c.closePath(); c.fill();
    }
  }
  function star4(c, x, y, r, w){
    c.beginPath();
    c.moveTo(x,y-r); c.lineTo(x+w,y-w); c.lineTo(x+r,y); c.lineTo(x+w,y+w);
    c.lineTo(x,y+r); c.lineTo(x-w,y+w); c.lineTo(x-r,y); c.lineTo(x-w,y-w); c.closePath(); c.fill();
  }

  /* ===================== OUVERTURE ===================== */
  /* demi-plan au-dessus (side=-1) ou en dessous (side=1) d'une droite passant par (cx,cy) */
  function halfPlane(c, cx, cy, ang, side, off){
    var L=4000, dx=Math.cos(ang), dy=Math.sin(ang), nx=-dy*side, ny=dx*side;
    var ox=cx+nx*off, oy=cy+ny*off;
    c.beginPath();
    c.moveTo(ox-dx*L, oy-dy*L); c.lineTo(ox+dx*L, oy+dy*L);
    c.lineTo(ox+dx*L+nx*L, oy+dy*L+ny*L); c.lineTo(ox-dx*L+nx*L, oy-dy*L+ny*L);
    c.closePath();
  }
  var CUT=-0.42;
  /* un trait blanc trace la découpe, puis les deux moitiés noires s'écartent en douceur */
  function drawOpening(t){
    base();
    var cx=VW/2, cy=540, open=easeInOutCubic(seg(t,0.18,0.62))*1400;
    [-1,1].forEach(function(side){
      halfPlane(ctx, cx, cy, CUT, side, open);
      ctx.fillStyle=BLACK; ctx.fill();
      if(open>0){ halfPlane(ctx, cx, cy, CUT, side, open); ctx.save(); ctx.clip(); halfPlane(ctx, cx, cy, CUT, -side, -open-22); ctx.fillStyle=RED; ctx.fill(); ctx.restore(); }
    });
    if(t<0.3){
      var u=easeOutCubic(t/0.18), L=Math.hypot(VW,1080), fade=1-seg(t,0.18,0.3);
      ctx.save(); ctx.translate(cx,cy); ctx.rotate(CUT); ctx.globalAlpha=fade;
      ctx.fillStyle=WHITE; ctx.fillRect(-L/2, -3, L*u, 6);
      ctx.restore(); ctx.globalAlpha=1;
    }
  }

  /* ===================== TITRE ===================== */
  /* lettres découpées dans des papiers de couleurs et polices différentes */
  var LETTERS=[];
  (function(){
    var r=rng(1337), words=['CRAZY','GAMES'];
    var styles=[{bg:BLACK,fg:WHITE},{bg:WHITE,fg:BLACK},{bg:RED,fg:WHITE},{bg:WHITE,fg:RED},{bg:BLACK,fg:RED},{bg:YELLOW,fg:BLACK}];
    var last=-1;
    words.forEach(function(w,line){
      w.split('').forEach(function(ch,i){
        var st; do{ st=Math.floor(r()*styles.length); }while(st===last); last=st;
        LETTERS.push({ch:ch, line:line, i:i, n:w.length, style:styles[st], font:RANSOM_FONTS[Math.floor(r()*RANSOM_FONTS.length)],
          italic:r()<0.3, rot:(r()-0.5)*0.26, size:0.9+r()*0.28, dy:(r()-0.5)*0.16, pad:0.08+r()*0.08});
      });
    });
  })();
  function starPath(c, cx, cy, R, n, rot){
    c.moveTo(cx+Math.cos(rot)*R, cy+Math.sin(rot)*R);
    for(var i=1;i<=n*2;i++){
      var a=rot+i*Math.PI/n, rr=i%2 ? R*0.55 : R;
      c.lineTo(cx+Math.cos(a)*rr, cy+Math.sin(a)*rr);
    }
    c.closePath();
  }
  function drawTitle(q, time){
    base();
    var shake=0;
    LETTERS.forEach(function(L,j){ var a=q-(LT0+j*0.05)-0.1; if(a>0 && a<0.12) shake+=(1-a/0.12)*5*Math.sin(a*120+j); });
    ctx.save(); ctx.translate(shake, shake*0.6);
    ctx.fillStyle=RED; ctx.fillRect(-20,-20,VW+40,1120);
    sunburst(ctx, VW/2, 540, 24, time*0.22, 'rgba(0,0,0,0.9)');
    /* grande étoile qui tourne lentement en fond */
    var sr=Math.min(VW*0.4, 460)*(0.92+0.08*easeOutCubic(seg(q,0,0.6)));
    ctx.beginPath(); starPath(ctx, VW/2, 540, sr, 5, -Math.PI/2+time*0.15);
    ctx.fillStyle='#ff2a3a'; ctx.fill(); ctx.strokeStyle=BLACK; ctx.lineWidth=10; ctx.stroke();
    ctx.globalAlpha=0.6; ctx.drawImage(halftoneBlack,0,0,VW,1080); ctx.globalAlpha=1;
    /* bande noire en diagonale derrière les lettres */
    var bu=easeOutCubic(seg(q,0.04,0.3));
    ctx.save(); ctx.translate(lerp(-VW*1.3, 0, bu), 0);
    ctx.fillStyle=BLACK;
    ctx.beginPath(); ctx.moveTo(-50,420); ctx.lineTo(VW+50,350); ctx.lineTo(VW+50,700); ctx.lineTo(-50,770); ctx.closePath(); ctx.fill();
    ctx.fillStyle=WHITE;
    ctx.beginPath(); ctx.moveTo(-50,404); ctx.lineTo(VW+50,334); ctx.lineTo(VW+50,344); ctx.lineTo(-50,414); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-50,778); ctx.lineTo(VW+50,708); ctx.lineTo(VW+50,716); ctx.lineTo(-50,786); ctx.closePath(); ctx.fill();
    ctx.restore();
    /* petite étiquette en haut */
    var tu=easeOutCubic(seg(q,0.12,0.36));
    var tag='LE HUB DE JEUX ENTRE POTES', tfs=40;
    ctx.font=tfs+'px '+FONT_DISPLAY;
    var tw=ctx.measureText(tag).width;
    if(tw>VW*0.82){ tfs*=VW*0.82/tw; ctx.font=tfs+'px '+FONT_DISPLAY; tw=ctx.measureText(tag).width; }
    ctx.save(); ctx.translate(lerp(-tw-200, Math.min(VW*0.06, (VW-tw)/2), tu), 170); ctx.rotate(-0.06);
    ctx.fillStyle=WHITE; ctx.fillRect(-14,-tfs*0.75,tw+28,tfs*1.4);
    ctx.fillStyle=BLACK; ctx.textBaseline='middle'; ctx.textAlign='left'; ctx.fillText(tag,0,0);
    ctx.restore();
    /* les lettres arrivent une par une, avec un léger rebond */
    var fs=Math.min(190, VW/6.6);
    var lines=[[],[]];
    LETTERS.forEach(function(L){ lines[L.line].push(L); });
    lines.forEach(function(arr,line){
      var widths=arr.map(function(L){
        ctx.font=(L.italic?'italic ':'')+Math.round(fs*L.size)+'px '+L.font;
        return ctx.measureText(L.ch).width+fs*L.pad*2+fs*0.06;
      });
      var total=widths.reduce(function(a,b){ return a+b; },0);
      var gap=fs*1.18, x=VW/2-total/2+(line?fs*0.35:-fs*0.35), y=line?560+gap/2:560-gap/2;
      arr.forEach(function(L,i){
        var j=LETTERS.indexOf(L), t0=LT0+j*0.05, a=seg(q,t0,t0+0.26);
        var w=widths[i], cx=x+w/2; x+=w;
        if(a<=0) return;
        var sc=lerp(2.4,1,easeOutBack(a)), rot=L.rot+(1-easeOutCubic(a))*0.5;
        /* respiration douce une fois posées */
        var bob=Math.sin(time*2.4+j*0.7)*3*seg(q,t0+0.3,t0+0.6);
        ctx.save();
        ctx.translate(cx, y+L.dy*fs+bob); ctx.rotate(rot); ctx.scale(sc,sc);
        ctx.globalAlpha=clamp01(a*4);
        var size=Math.round(fs*L.size);
        ctx.font=(L.italic?'italic ':'')+size+'px '+L.font;
        var bw=w-fs*0.06, bh=size*1.12;
        ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(-bw/2+8,-bh/2+10,bw,bh);
        ctx.fillStyle=L.style.bg; ctx.fillRect(-bw/2,-bh/2,bw,bh);
        if(L.style.bg===BLACK){ ctx.strokeStyle=WHITE; ctx.lineWidth=3; ctx.strokeRect(-bw/2+5,-bh/2+5,bw-10,bh-10); }
        ctx.fillStyle=L.style.fg; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(L.ch, 0, size*0.06);
        ctx.restore();
      });
    });
    ctx.globalAlpha=1;
    /* bandeau LET'S PLAY */
    var su=easeOutCubic(seg(q,0.86,1.12));
    if(su>0){
      var sfs=Math.min(70, VW/11);
      ctx.save(); ctx.translate(lerp(VW+900, VW/2+fs*0.6, su), 840); ctx.rotate(-0.05);
      ctx.font=sfs+'px '+FONT_DISPLAY;
      var label='LET’S  PLAY', lw=ctx.measureText(label).width;
      ctx.fillStyle=BLACK; ctx.beginPath(); ctx.moveTo(-lw/2-40+10,-sfs*0.62+10); ctx.lineTo(lw/2+60+10,-sfs*0.7+10); ctx.lineTo(lw/2+40+10,sfs*0.62+10); ctx.lineTo(-lw/2-60+10,sfs*0.7+10); ctx.closePath(); ctx.fill();
      ctx.fillStyle=WHITE; ctx.beginPath(); ctx.moveTo(-lw/2-40,-sfs*0.62); ctx.lineTo(lw/2+60,-sfs*0.7); ctx.lineTo(lw/2+40,sfs*0.62); ctx.lineTo(-lw/2-60,sfs*0.7); ctx.closePath(); ctx.fill();
      ctx.fillStyle=BLACK; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(label,0,sfs*0.05);
      ctx.restore();
    }
    /* étincelles */
    var r=rng(5);
    for(var i=0;i<9;i++){
      var sx=VW*(0.12+r()*0.76), sy=300+r()*520, ph=r()*TAU, tw2=Math.max(0,Math.sin(time*5+ph));
      if(q<0.5) tw2*=seg(q,0.3,0.5);
      ctx.fillStyle=i%3?WHITE:YELLOW; ctx.globalAlpha=tw2;
      star4(ctx, sx, sy, 16+r()*16, 3.5);
    }
    ctx.globalAlpha=1;
    ctx.restore();
    /* entrée : la grande bande repart vers le haut en s'affinant */
    if(q<0.34) drawBigBand(q/0.34, 'out', time);
  }

  /* ===================== SORTIE : BANDES QUI BALAIENT ===================== */
  var STRIPES=[{w:90,c:RED},{w:46,c:BLACK},{w:200,c:BLACK},{w:22,c:WHITE},{w:130,c:RED},{w:60,c:BLACK}];
  var BAND=STRIPES.reduce(function(a,s){ return a+s.w; },0), SLANT=420;
  function drawExit(u){
    var e=easeInOutCubic(u);
    var lead=lerp(-40, VW+BAND+SLANT+40, e);
    var trail=lead-BAND;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(-50,-20); ctx.lineTo(trail,-20); ctx.lineTo(trail-SLANT,1100); ctx.lineTo(-50,1100); ctx.closePath();
    ctx.clip(); ctx.clearRect(-50,-50,VW+SLANT+BAND+200,1200);
    ctx.restore();
    var x=lead;
    STRIPES.forEach(function(st){
      ctx.fillStyle=st.c;
      ctx.beginPath(); ctx.moveTo(x+1,-20); ctx.lineTo(x-st.w,-20); ctx.lineTo(x-st.w-SLANT,1100); ctx.lineTo(x+1-SLANT,1100); ctx.closePath(); ctx.fill();
      x-=st.w;
    });
  }

  /* ===================== SON =====================
     Tout est synthétisé en direct (Web Audio), aucun fichier à charger :
     une petite boucle groove (basse, batterie, piano électrique, arpège),
     des souffles qui suivent les rubans, une montée vers la lune, l'impact du
     titre et les tampons des lettres. */
  var actx=AU ? AU.ctx : null, sfxBus=null, musicBus=null, musicFilter=null, exitBus=null, noiseBuf=null, audioT0=0, audioOn=false;
  function audioCreate(){
    if(!actx || debugT || sfxBus) return;
    sfxBus=actx.createGain(); sfxBus.gain.value=0.62; sfxBus.connect(AU.master);
    exitBus=actx.createGain(); exitBus.gain.value=0.62; exitBus.connect(AU.master);
    musicFilter=actx.createBiquadFilter(); musicFilter.type='lowpass'; musicFilter.frequency.value=18000; musicFilter.Q.value=1.2;
    musicBus=actx.createGain(); musicBus.gain.value=0.75;
    /* la musique de l'intro respecte le bouton « Musique » du hub */
    var musicGate=actx.createGain(); musicGate.gain.value=AU.isMusicOn()?1:0;
    musicFilter.connect(musicBus); musicBus.connect(musicGate); musicGate.connect(sfxBus);
    noiseBuf=AU.noiseBuf;
  }
  function env(g, at, peak, attack, dur){
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at+attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at+dur);
  }
  function noise(at, dur, o){
    var src=actx.createBufferSource(); src.buffer=noiseBuf;
    var f=actx.createBiquadFilter(); f.type=o.type||'bandpass'; f.Q.value=o.q||1;
    f.frequency.setValueAtTime(o.f0||1000, at);
    if(o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, at+dur);
    var g=actx.createGain(); env(g, at, o.gain||0.3, o.attack||0.005, dur);
    src.connect(f); f.connect(g); g.connect(o.bus||sfxBus);
    src.start(at, Math.random()*0.5); src.stop(at+dur+0.05);
  }
  function tone(at, dur, o){
    var osc=actx.createOscillator(); osc.type=o.type||'sine';
    osc.frequency.setValueAtTime(o.f0, at);
    if(o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, at+(o.glide||dur));
    if(o.detune) osc.detune.value=o.detune;
    var g=actx.createGain(); env(g, at, o.gain||0.2, o.attack||0.004, dur);
    if(o.lp){
      var f=actx.createBiquadFilter(); f.type='lowpass'; f.Q.value=o.q||1;
      f.frequency.setValueAtTime(o.lp, at);
      if(o.lp1) f.frequency.exponentialRampToValueAtTime(o.lp1, at+dur);
      osc.connect(f); f.connect(g);
    } else osc.connect(g);
    g.connect(o.bus||sfxBus);
    osc.start(at); osc.stop(at+dur+0.05);
  }
  var SFX={
    kick:function(at, g, bus){ tone(at, 0.32, {f0:155, f1:42, glide:0.12, gain:g||0.9, bus:bus}); noise(at, 0.02, {type:'highpass', f0:3000, gain:0.15*(g||0.9), bus:bus}); },
    snare:function(at, bus){ noise(at, 0.16, {type:'bandpass', f0:1900, q:0.8, gain:0.32, bus:bus}); tone(at, 0.08, {type:'triangle', f0:210, f1:150, gain:0.2, bus:bus}); },
    hat:function(at, g, bus){ noise(at, 0.035, {type:'highpass', f0:8000, gain:g||0.12, bus:bus}); },
    bass:function(at, f, bus){
      tone(at, 0.19, {type:'sawtooth', f0:f, gain:0.2, lp:900, lp1:180, q:7, bus:bus});
      tone(at, 0.19, {type:'square', f0:f/2, gain:0.07, lp:400, bus:bus});
    },
    crash:function(at, g){ noise(at, 1.6, {type:'highpass', f0:5000, gain:g||0.35, attack:0.002}); noise(at, 0.9, {type:'bandpass', f0:9000, q:0.6, gain:(g||0.35)*0.6}); },
    shing:function(at, g){
      [2380, 3170, 4230, 5650].forEach(function(f,i){ tone(at, 0.55-i*0.08, {type:'sine', f0:f, f1:f*0.98, gain:(g||0.12)/(1+i*0.5)}); });
      noise(at, 0.12, {type:'highpass', f0:6000, gain:0.25});
    },
    whoosh:function(at, dur, f0, f1, g, bus){ noise(at, dur, {type:'bandpass', f0:f0, f1:f1, q:1.1, gain:g||0.4, attack:dur*0.55, bus:bus}); },
    stab:function(at, notes, dur, g){
      notes.forEach(function(f){
        [-9, 9].forEach(function(dt){ tone(at, dur, {type:'sawtooth', f0:f, detune:dt, gain:(g||0.09), lp:4200, lp1:600, q:2, attack:0.006}); });
      });
    },
    ting:function(at){ tone(at, 0.35, {f0:2637, gain:0.08}); tone(at+0.04, 0.4, {f0:3520, gain:0.06}); },
    stamp:function(at, i){
      noise(at, 0.07, {type:'bandpass', f0:1100+i*60, q:1, gain:0.36});
      tone(at, 0.1, {f0:130+i*4, f1:62, glide:0.08, gain:0.45});
      noise(at, 0.025, {type:'highpass', f0:3500, gain:0.16});
    },
    riser:function(at, dur){
      noise(at, dur, {type:'bandpass', f0:350, f1:7000, q:2, gain:0.3, attack:dur*0.95});
      tone(at, dur, {type:'sawtooth', f0:110, f1:880, gain:0.07, lp:3000, attack:dur*0.9});
      noise(at, dur, {type:'highpass', f0:6000, gain:0.18, attack:dur*0.98});
    }
  };
  var BEAT=60/140, E2=82.41, G2=98.0, A2=110.0, B2=123.47, D3=146.83;
  var BASS=[E2,E2,G2,E2,A2,E2,B2,D3];
  var ARP=[76,79,83,86,83,79,74,71];
  function audioEvents(){
    var ev=[];
    function add(t, fn){ ev.push({t:t, fn:fn}); }
    var M=musicFilter;
    /* ouverture : trait blanc, puis les moitiés s'écartent */
    add(0.02, function(a){ SFX.shing(a,0.1); noise(a,0.16,{type:'bandpass',f0:7000,f1:900,q:1.4,gain:0.35,attack:0.01}); });
    add(0.18, function(a){ SFX.whoosh(a,0.5,250,2400,0.35); SFX.kick(a,0.6); });
    /* groove de la ville, qui s'ouvre progressivement */
    for(var i=0, t=0.30; t<T_TITLE-0.01; i++, t=0.30+i*BEAT/2){
      (function(i,t){
        add(t, function(a){
          SFX.hat(a, i%2?0.06:0.1, M);
          if(i%4===0) SFX.kick(a, 0.8, M);
          if(i%4===2) SFX.snare(a, M);
          SFX.bass(a, BASS[i%8], M);
          var I=AU.inst;
          if(i%8===0) I.epiano(a, M, (Math.floor(i/8)%2 ? [52,55,59,62] : [55,59,62,66]), BEAT*3.2, 0.32);
          I.pluck(a, M, ARP[i%8], BEAT*0.45, 0.07);
        });
      })(i,t);
    }
    /* les rubans passent */
    RIBBONS.forEach(function(rb){ add(rb.t0+0.1, function(a){ SFX.whoosh(a, rb.dur*0.55, 300, 3200, 0.22); }); });
    /* montée vers la lune ; le filtre se referme doucement pendant la plongée */
    add(T_RISE, function(a){ SFX.riser(a, T_TITLE-T_RISE); });
    add(T_DIVE, function(a){ M.frequency.setValueAtTime(18000, a); M.frequency.exponentialRampToValueAtTime(900, a+(T_TITLE-T_DIVE)); });
    add(T_WAVE, function(a){ SFX.ting(a); SFX.shing(a,0.07); });
    add(T_BAND, function(a){ SFX.whoosh(a,0.4,180,6500,0.55); noise(a,0.3,{type:'lowpass',f0:400,gain:0.3}); });
    /* titre */
    add(T_TITLE, function(a){
      musicBus.gain.setValueAtTime(0.75, a); M.frequency.setValueAtTime(18000, a);
      SFX.kick(a,1); SFX.crash(a,0.38); tone(a, 0.9, {f0:55, f1:41, gain:0.5});
      SFX.stab(a,[164.8,196,246.9,293.7,370],0.95,0.07);
    });
    add(T_TITLE+0.02, function(a){ SFX.whoosh(a,0.3,5000,300,0.35); });
    LETTERS.forEach(function(L,j){ add(T_TITLE+LT0+j*0.05+0.08, function(a){ SFX.stamp(a,j); }); });
    add(T_TITLE+0.86, function(a){ SFX.whoosh(a,0.25,400,3000,0.3); });
    add(T_TITLE+1.1, function(a){ SFX.shing(a,0.08); });
    for(i=0, t=T_TITLE+0.24; t<T_EXIT; i++, t=T_TITLE+0.24+i*BEAT/2){
      (function(i,t){ add(t, function(a){
        SFX.hat(a, i%2?0.06:0.1); if(i%4===0) SFX.kick(a,0.6); SFX.bass(a, BASS[(i+4)%8]);
        AU.inst.pluck(a, musicFilter, ARP[(i+3)%8]+12, BEAT*0.4, 0.06);
        if(i%8===0) AU.inst.brass(a, musicFilter, [76,79,83][Math.floor(i/8)%3], BEAT*1.5, 0.12);
      }); })(i,t);
    }
    return ev;
  }
  var EVENTS=null;
  function audioStart(fromT){
    if(!actx || actx.state!=='running' || audioOn || AU.isMuted()) return;
    audioCreate();
    audioOn=true;
    EVENTS=EVENTS||audioEvents();
    audioT0=actx.currentTime+0.05-fromT;
    EVENTS.forEach(function(e){ if(e.t>=fromT-0.001) e.fn(audioT0+e.t); });
  }
  /* passer : tout ce qui était programmé se tait (la sortie a son propre bus) */
  function audioSkip(){
    if(!audioOn) return;
    var now=actx.currentTime;
    sfxBus.gain.setValueAtTime(sfxBus.gain.value, now);
    sfxBus.gain.linearRampToValueAtTime(0.0001, now+0.05);
  }
  function audioExit(){
    if(!audioOn) return;
    var a=actx.currentTime+0.01;
    SFX.whoosh(a, 0.42, 250, 3200, 0.5, exitBus);
    noise(a+0.3, 0.3, {type:'lowpass', f0:500, gain:0.25, bus:exitBus});
  }
  /* fin de l'intro : on coupe ce qui reste et on laisse la musique du hub prendre le relais */
  function audioStop(){
    if(audioOn){
      var now=actx.currentTime;
      sfxBus.gain.setValueAtTime(sfxBus.gain.value, now); sfxBus.gain.linearRampToValueAtTime(0.0001, now+0.3);
    }
    if(AU) AU.allowMusic(true);
  }

  /* ===================== BOUCLE ===================== */
  function render(t){
    base();
    if(t<T_TITLE){
      drawCity(t);
      if(t<0.7) drawOpening(t);
      return;
    }
    drawTitle(t-T_TITLE, t);
    if(t>=T_EXIT) drawExit(seg(t,T_EXIT,TOTAL));
  }

  var start=0, offset=0, raf=0, done=false, exiting=false, begun=false;
  var hint=document.getElementById('introSoundHint');
  function finish(){
    if(done) return;
    done=true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    document.removeEventListener('keydown', onKey);
    audioStop();
    if(overlay.parentNode) overlay.parentNode.removeChild(overlay);
    document.documentElement.classList.remove('intro-playing');
    try{ window.dispatchEvent(new Event('cg-intro-done')); }catch(e){}
  }
  /* horloge de l'image : celle de la page (si le son plante, l'image continue).
     Les sons sont programmés au même instant de départ, à 50 ms près. */
  function introTime(now){
    return Math.max(0, (now-start)/1000)+offset;
  }
  function frame(now){
    if(!start) start=now;
    var t=introTime(now);
    if(t>=T_EXIT && !exiting){ exiting=true; overlay.classList.add('exiting'); audioExit(); if(hint) hint.style.display='none'; }
    if(t>=TOTAL){ finish(); return; }
    render(t);
    raf=requestAnimationFrame(frame);
  }
  function begin(){
    if(begun || done) return;
    begun=true;
    if(actx && actx.state==='running') audioStart(0);
    start=performance.now()+(audioOn?50:0);
    raf=requestAnimationFrame(frame);
    /* son encore bloqué : il démarrera au premier geste, calé sur l'image */
    if(AU && !audioOn && !AU.isMuted()){
      if(hint) hint.style.display='block';
      AU.onUnlock(function(){
        if(hint) hint.style.display='none';
        if(done || exiting) return;
        audioStart(introTime(performance.now()));
      });
    }
  }
  /* passer : on saute directement aux bandes de sortie */
  function skip(){
    if(done || exiting) return;
    offset+=T_EXIT-introTime(performance.now());
    audioSkip();
  }
  /* Échap passe l'intro (les autres touches servent juste à activer le son) */
  function onKey(e){ if(e.key==='Escape'){ e.preventDefault(); skip(); } }

  resize();
  window.addEventListener('resize', resize);
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ if(!done) resize(); });
  if(debugT){
    var dt=parseFloat(debugT);
    if(dt>=T_EXIT) overlay.classList.add('exiting');
    render(dt);
    window.CG_INTRO_RENDER=function(t){ overlay.classList.toggle('exiting', t>=T_EXIT); render(t); };
    return;
  }
  document.documentElement.classList.add('intro-playing');
  /* toucher l'écran active le son (js/audio.js) ; seul le bouton ou Échap passent l'intro */
  document.getElementById('introSkip').addEventListener('click', function(e){ e.stopPropagation(); skip(); });
  document.addEventListener('keydown', onKey);
  begin();
})();
