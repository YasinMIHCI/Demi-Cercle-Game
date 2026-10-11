/* CRAZY GAMES — intro animée de 5 secondes, façon Persona 5.
   Tout est dessiné en code sur un canvas (aucune image ni vidéo à charger).

   Déroulé :
   0,00 s  ouverture : un éclair blanc tranche l'écran en diagonale, une bande
           rouge claque, et les deux moitiés noires s'écartent ;
   0,00 s  la ville : nuit rouge, lune géante en trame de points, trois plans de
           buildings en parallaxe, néons. Un voleur masqué court sur les toits
           et saute de building en building ;
   1,68 s  arrêt sur image « SHOWTIME! » au sommet du grand saut (façon
           All-Out Attack), puis retour à la scène par une découpe en diagonale ;
   2,68 s  il bondit vers la caméra : son manteau envahit l'écran ;
   3,03 s  titre : étoile rouge qui explose, lettres découpées façon carte de
           visite des Phantom Thieves, bandeau PHANTOM WAVE ;
   4,55 s  sortie : des bandes noires, rouges et blanches balaient l'écran et
           dévoilent le hub.

   On peut passer l'intro (bouton, clic, touche). Elle n'est pas jouée quand on
   arrive par un lien d'invitation (#jeu?room=...), ni si l'utilisateur préfère
   réduire les animations. ?introt=1.5 fige l'image à 1,5 s (pour la mise au
   point). */
(function(){
  'use strict';
  var overlay=document.getElementById('introOverlay');
  if(!overlay) return;
  var reduce=window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var debugT=(/[?&]introt=([0-9.]+)/.exec(location.search)||[])[1];
  if(!debugT && (window.CG_NO_INTRO || /room=/.test(location.hash) || reduce)){
    overlay.parentNode.removeChild(overlay);
    return;
  }

  /* ===================== OUTILS ===================== */
  var TAU=Math.PI*2;
  function clamp01(u){ return u<0?0:(u>1?1:u); }
  function lerp(a,b,u){ return a+(b-a)*u; }
  function seg(t,a,b){ return clamp01((t-a)/(b-a)); }
  function easeOutCubic(u){ u=clamp01(u); return 1-Math.pow(1-u,3); }
  function easeInCubic(u){ u=clamp01(u); return u*u*u; }
  function easeInOutCubic(u){ u=clamp01(u); return u<0.5 ? 4*u*u*u : 1-Math.pow(-2*u+2,3)/2; }
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

  /* ===================== CANVAS ===================== */
  var canvas=document.getElementById('introCanvas');
  var ctx=canvas.getContext('2d');
  var W=0, H=0, DPR=1, S=1, VW=1920;        /* on dessine en « unités » : l'écran fait 1080 de haut */
  var halftoneRed=null, halftoneBlack=null, moonSprite=null, midSprites=[];
  var freezeCanvas=document.createElement('canvas'), fctx=freezeCanvas.getContext('2d'), freezeReady=false;

  function resize(){
    W=window.innerWidth; H=window.innerHeight;
    DPR=Math.min(window.devicePixelRatio||1, 2);
    canvas.width=Math.round(W*DPR); canvas.height=Math.round(H*DPR);
    canvas.style.width=W+'px'; canvas.style.height=H+'px';
    freezeCanvas.width=canvas.width; freezeCanvas.height=canvas.height; freezeReady=false;
    S=H/1080; VW=W/S;
    halftoneRed=makeHalftone('rgba(255,26,58,1)');
    halftoneBlack=makeHalftone('rgba(0,0,0,1)');
    moonSprite=makeMoon();
    var maxX=(VX*P_DIVE0-VW*0.36)*0.5+VW+200;
    midSprites=MID.map(function(b){ return (b.x+b.w>-VW*0.5 && b.x<maxX) ? makeMidSprite(b) : null; });
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

  /* ===================== LA VILLE ===================== */
  /* plan lointain (parallaxe 0.2) : silhouettes simples */
  var FAR=[], FAR_WIN=[];
  (function(){
    var r=rng(7), x=-300;
    while(x<5200){
      var w=90+r()*170, top=360+r()*260;
      FAR.push({x:x, w:w, top:top, spire:r()<0.2});
      for(var k=0;k<6;k++) if(r()<0.6) FAR_WIN.push({x:x+8+r()*(w-16), y:top+20+r()*(1080-top), c:r()<0.7?'rgba(255,90,90,0.55)':'rgba(255,214,120,0.5)'});
      x+=w+r()*24-8;
    }
  })();
  /* plan du milieu (parallaxe 0.5) : immeubles éclairés + enseignes néon, pré-rendus */
  var SIGNS=['BAR','HOTEL','24H','CLUB','LEBLANC','KARAOKE','SALE','★★★'];
  var NEONS=['#ff2a6d','#05d9e8','#ffe600','#ff6ec7','#7cff6e','#ffffff'];
  var MID=[];
  (function(){
    var r=rng(42), x=-400, i=0;
    while(x<6200){
      var w=150+r()*190, top=430+r()*230;
      MID.push({x:x, w:w, top:top, seed:Math.floor(r()*1e9), sign:r()<0.45 ? SIGNS[i++%SIGNS.length] : null,
        neon:NEONS[Math.floor(r()*NEONS.length)], board:r()<0.18, tint:r()});
      x+=w+10+r()*50;
    }
  })();
  function makeMidSprite(b){
    /* plan du milieu : une résolution plus faible suffit et économise la mémoire */
    var hgt=1080-b.top+60, pad=40, o=newCanvas(b.w+pad*2, hgt+pad+80, Math.min(S*DPR,1.1)), x=o.x, r=rng(b.seed);
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
      x.fillText(b.tint<0.5?'TAKE YOUR HEART':'PHANTOM', bx+bw/2, -59, bw-16);
    }
    x.shadowBlur=0;
    return {c:o.c, ox:pad, oy:pad+80, w:b.w+pad*2, h:hgt+pad+80};
  }
  /* toits où court le voleur (parallaxe 1) */
  var ROOFS=[
    {x0:-2600, x1:437, top:760, tank:true},
    {x0:900, x1:1312, top:680, antenna:true},
    {x0:2250, x1:2950, top:790, board:true},
    {x0:3200, x1:4300, top:700, tank:true},
    {x0:4550, x1:5800, top:760, antenna:true},
    {x0:6050, x1:7600, top:690}
  ];
  ROOFS.forEach(function(rf,i){
    var r=rng(100+i); rf.wins=[];
    for(var wy=rf.top+60; wy<1300; wy+=64){
      for(var wx=rf.x0+30; wx<rf.x1-40; wx+=52){
        var v=r(); if(v<0.5) rf.wins.push({x:wx, y:wy, lit:v<0.13});
      }
    }
    rf.ac=[]; for(var k=0;k<3;k++){ rf.ac.push(rf.x0+60+r()*(rf.x1-rf.x0-160)); }
  });
  /* premier plan (parallaxe 1.6) : poteaux et câbles qui défilent vite */
  var POLES=[]; for(var pi=0;pi<14;pi++) POLES.push(-900+pi*1100);
  /* particules et traits de vitesse */
  var EMBERS=[], LINES=[];
  (function(){
    var r=rng(9);
    for(var i=0;i<70;i++) EMBERS.push({x:r(), y:r()*1080, v:40+r()*120, s:2+r()*4, c:r()<0.7?RED_HOT:YELLOW, w:r()*TAU});
    for(i=0;i<22;i++) LINES.push({y:r()*1080, len:120+r()*380, v:1.4+r()*2.2, o:r()});
  })();

  /* ===================== LE PERSONNAGE ===================== */
  /* Angles en radians mesurés depuis la verticale vers le bas, positifs vers l'avant (+x). */
  var POSE_TUCK={hip:66, lean:0.45, tF:1.3, bF:2.1, tB:0.75, bB:1.7, aF:-0.5, eF:0.6, aB:-1.0, eB:0.4, head:0.15};
  var POSE_LEAP={hip:74, lean:0.55, tF:1.5, bF:0.15, tB:-1.25, bB:0.35, aF:2.6, eF:0.1, aB:-1.6, eB:0.15, head:-0.1};
  var POSE_LAND={hip:46, lean:0.75, tF:1.5, bF:2.4, tB:0.95, bB:2.3, aF:0.9, eF:0.6, aB:-0.5, eB:0.5, head:0.05};
  var POSE_DIVE={hip:74, lean:0.95, tF:1.1, bF:0.4, tB:-0.6, bB:0.6, aF:2.2, eF:0.0, aB:2.9, eB:0.1, head:-0.2};
  function poseRun(ph){
    var s=Math.sin(ph), c=Math.cos(ph);
    return {hip:70-6*Math.abs(c), lean:0.38, tF:0.85*s, bF:0.25+1.2*Math.max(0,c), tB:-0.85*s, bB:0.25+1.2*Math.max(0,-c),
      aF:-0.9*s, eF:1.3, aB:0.9*s, eB:1.3, head:0.08};
  }
  function mix(a,b,u){
    var o={}; for(var k in a) o[k]=lerp(a[k], b[k], u); return o;
  }
  function limb(x0,y0,ang,len){ return {x:x0+Math.sin(ang)*len, y:y0+Math.cos(ang)*len}; }

  /* opts : color (tout d'une couleur, pour le liseré), widen (épaissit), tail (agitation du manteau) */
  function drawChar(c, x, y, k, pose, time, opts){
    opts=opts||{};
    var mono=opts.color, wd=opts.widen||0;
    var cBody=mono||'#060606', cBack=mono||'#141414', cRed=mono||'#e8001f', cLining=mono||'#b0001a', cMask=mono||WHITE;
    c.save();
    c.translate(x,y); c.scale(k,k);
    if(opts.rot) c.rotate(opts.rot);
    c.lineCap='round'; c.lineJoin='round';
    var hip={x:0, y:-pose.hip};
    var sh={x:hip.x+Math.sin(pose.lean)*54, y:hip.y-Math.cos(pose.lean)*54};
    var hd={x:sh.x+Math.sin(pose.lean+pose.head)*20, y:sh.y-Math.cos(pose.lean+pose.head)*20};
    function stroke(col, w, pts){
      c.strokeStyle=col; c.lineWidth=w+wd;
      c.beginPath(); c.moveTo(pts[0].x,pts[0].y);
      for(var i=1;i<pts.length;i++) c.lineTo(pts[i].x,pts[i].y);
      c.stroke();
    }
    function dot(col, p, r){ c.fillStyle=col; c.beginPath(); c.arc(p.x,p.y,r+wd/2,0,TAU); c.fill(); }
    function leg(t, b, col){
      var knee=limb(hip.x,hip.y,t,40), foot=limb(knee.x,knee.y,t-b,40);
      stroke(col, 13, [hip,knee,foot]);
      /* chaussure pointue */
      var dir=t-b+Math.PI/2;
      var toe={x:foot.x+Math.sin(dir)*13, y:foot.y+Math.cos(dir)*13};
      stroke(col, 9, [foot,toe]);
    }
    function arm(a, e, col, glove){
      var elbow=limb(sh.x,sh.y,a,30), hand=limb(elbow.x,elbow.y,a+e,28);
      stroke(col, 10, [sh,elbow,hand]);
      dot(glove, hand, 6.5);
    }
    /* manteau : deux pans qui flottent derrière, doublure rouge */
    var tail=opts.tail===undefined ? 1 : opts.tail;
    function coatTail(len, phase, spread){
      var base=-1.95+spread+Math.sin(time*21+phase)*0.22*tail;
      var tip={x:hip.x+Math.sin(base)*len, y:hip.y+Math.cos(base)*len};
      var mid={x:hip.x+Math.sin(base+0.35)*len*0.55, y:hip.y+Math.cos(base+0.35)*len*0.55+6};
      c.fillStyle=mono||'#0b0b0b';
      c.beginPath();
      c.moveTo(hip.x+2, hip.y-12);
      c.quadraticCurveTo(mid.x, mid.y-10, tip.x, tip.y);
      c.quadraticCurveTo(mid.x+8, mid.y+14, hip.x+4, hip.y+8);
      c.closePath(); c.fill();
      if(wd){ c.strokeStyle=c.fillStyle; c.lineWidth=wd; c.stroke(); }
      else { c.strokeStyle=cLining; c.lineWidth=3; c.beginPath(); c.moveTo(hip.x+4,hip.y+8); c.quadraticCurveTo(mid.x+8, mid.y+14, tip.x, tip.y); c.stroke(); }
    }
    arm(pose.aB, pose.eB, cBack, mono||'#9a0016');
    leg(pose.tB, pose.bB, cBack);
    coatTail(86, 0, 0.0);
    coatTail(70, 1.7, 0.3);
    /* buste (manteau) */
    stroke(cBody, 26, [hip, sh]);
    /* col montant pointu, derrière la tête */
    c.fillStyle=cBody;
    var ux=Math.sin(pose.lean), uy=-Math.cos(pose.lean), bx=-Math.cos(pose.lean), by=-Math.sin(pose.lean);
    c.beginPath();
    c.moveTo(sh.x+bx*12, sh.y+by*12);
    c.lineTo(sh.x+bx*15+ux*26, sh.y+by*15+uy*26);
    c.lineTo(sh.x+ux*8, sh.y+uy*8);
    c.closePath(); c.fill();
    leg(pose.tF, pose.bF, cBody);
    /* tête, cheveux en pointes */
    dot(cBody, hd, 14);
    c.fillStyle=cBody;
    var spikes=[[-2.4,20],[-1.9,22],[-1.35,19],[-0.8,15],[-2.9,15]];
    var face=pose.lean+pose.head;
    spikes.forEach(function(sp){
      var a=face+sp[0], a1=a-0.28, a2=a+0.28;
      c.beginPath();
      c.moveTo(hd.x+Math.sin(a1)*10, hd.y-Math.cos(a1)*10);
      c.lineTo(hd.x+Math.sin(a)*(sp[1]+wd/2), hd.y-Math.cos(a)*(sp[1]+wd/2));
      c.lineTo(hd.x+Math.sin(a2)*10, hd.y-Math.cos(a2)*10);
      c.closePath(); c.fill();
    });
    /* masque blanc (loup) avec la fente de l'œil */
    if(!wd){
      c.save(); c.translate(hd.x, hd.y); c.rotate(face);
      c.fillStyle=cMask;
      c.beginPath(); c.moveTo(3,-5); c.lineTo(15,-8); c.lineTo(19,-2); c.lineTo(13,3); c.lineTo(4,2); c.closePath(); c.fill();
      if(!mono){
        c.fillStyle='#000'; c.beginPath(); c.ellipse(12,-2.5,3.2,1.6,-0.2,0,TAU); c.fill();
        c.fillStyle=RED_HOT; c.beginPath(); c.arc(13,-2.6,0.9,0,TAU); c.fill();
      }
      c.restore();
    }
    arm(pose.aF, pose.eF, cBody, cRed);
    c.restore();
  }

  /* ===================== CHRONOLOGIE ===================== */
  var VX=1250;                         /* vitesse de course (unités par seconde) */
  var CK=1.3;                          /* taille du voleur dans la ville */
  var P_SLOW=1.25, SLOW=0.35, P_APEX=1.40, P_DIVE0=2.0, P_DIVE1=2.35;
  var F0=P_SLOW+(P_APEX-P_SLOW)/SLOW;  /* début de l'arrêt sur image */
  var F1=F0+0.40;                      /* fin */
  var T_TITLE=F1+(P_DIVE1-P_APEX);     /* ≈ 3,03 s */
  var T_EXIT=4.55, TOTAL=5.0;
  function warp(s){
    if(s<P_SLOW) return s;
    if(s<F0) return P_SLOW+(s-P_SLOW)*SLOW;
    if(s<F1) return P_APEX;
    return P_APEX+(s-F1);
  }
  var LANDINGS=[0.72, 1.80];

  /* état du personnage à l'instant p (temps « du personnage ») */
  function charAt(p){
    var x=VX*p, y, pose, air=false, ph=p*TAU*3.1, u;
    if(p<0.35){ y=760; pose=poseRun(ph); }
    else if(p<0.72){
      u=(p-0.35)/0.37; air=true;
      y=lerp(760,680,u)-4*170*u*(1-u);
      pose= u<0.2 ? mix(poseRun(0.35*TAU*3.1), POSE_TUCK, u/0.2) : (u<0.78 ? POSE_TUCK : mix(POSE_TUCK, POSE_LAND, (u-0.78)/0.22));
    }
    else if(p<1.05){
      y=680; u=(p-0.72)/0.12;
      pose= u<1 ? mix(POSE_LAND, poseRun(ph), easeOutCubic(u)) : poseRun(ph);
    }
    else if(p<1.80){
      u=(p-1.05)/0.75; air=true;
      y=lerp(680,790,u)-4*300*u*(1-u);
      pose= u<0.25 ? mix(poseRun(1.05*TAU*3.1), POSE_LEAP, easeOutCubic(u/0.25)) : (u<0.8 ? POSE_LEAP : mix(POSE_LEAP, POSE_LAND, (u-0.8)/0.2));
    }
    else if(p<P_DIVE0){
      y=790; u=(p-1.80)/0.12;
      pose= u<1 ? mix(POSE_LAND, poseRun(ph), easeOutCubic(u)) : poseRun(ph);
    }
    else { y=790; pose=POSE_DIVE; air=true; }
    return {x:x, y:y, pose:pose, air:air};
  }
  function camera(p){
    var pc=Math.min(p, P_DIVE0), ch=charAt(pc);
    var cx=ch.x-VW*0.36, cy=(ch.y-720)*0.55;
    var shake=0;
    LANDINGS.forEach(function(L){ if(p>=L && p<L+0.22){ shake+=18*(1-(p-L)/0.22)*Math.sin(p*95); } });
    return {x:cx, y:cy, shake:shake};
  }

  /* ===================== RENDU : LA VILLE ===================== */
  function drawSky(cam){
    var g=ctx.createLinearGradient(0,0,0,1080);
    g.addColorStop(0,'#030003'); g.addColorStop(0.42,'#2b0010'); g.addColorStop(0.68,'#8d0018'); g.addColorStop(1,'#2a0008');
    ctx.fillStyle=g; ctx.fillRect(-10,-10,VW+20,1100);
    /* lune géante, presque fixe */
    var mx=VW*0.68-cam.x*0.04, my=300-cam.y*0.05;
    ctx.drawImage(moonSprite, mx-310, my-310, 620, 620);
  }
  function drawFar(cam){
    var ox=-cam.x*0.2, oy=-cam.y*0.2;
    ctx.save(); ctx.translate(ox, oy);
    var x0=-ox-50, x1=-ox+VW+50;
    ctx.fillStyle='#14030a';
    FAR.forEach(function(b){
      if(b.x+b.w<x0 || b.x>x1) return;
      ctx.fillRect(b.x, b.top, b.w, 1200-b.top);
      if(b.spire){ ctx.beginPath(); ctx.moveTo(b.x+b.w*0.3,b.top); ctx.lineTo(b.x+b.w*0.5,b.top-90); ctx.lineTo(b.x+b.w*0.7,b.top); ctx.fill(); }
    });
    FAR_WIN.forEach(function(w){ if(w.x<x0 || w.x>x1) return; ctx.fillStyle=w.c; ctx.fillRect(w.x,w.y,4,5); });
    /* tour rouge façon Tokyo Tower */
    var tx=1150, ty=170;
    if(tx+200>x0 && tx-200<x1){
      ctx.strokeStyle='rgba(255,40,60,0.85)'; ctx.lineWidth=3;
      ctx.shadowColor=RED_HOT; ctx.shadowBlur=12;
      ctx.beginPath();
      ctx.moveTo(tx-110,700); ctx.lineTo(tx-14,ty+80); ctx.lineTo(tx,ty);
      ctx.lineTo(tx+14,ty+80); ctx.lineTo(tx+110,700);
      for(var k=0;k<8;k++){
        var yy=ty+90+k*75, half=14+(yy-ty-80)/(700-ty-80)*96;
        ctx.moveTo(tx-half,yy); ctx.lineTo(tx+half,yy);
        if(k<7){ var yn=yy+75, hn=14+(yn-ty-80)/(700-ty-80)*96; ctx.moveTo(tx-half,yy); ctx.lineTo(tx+hn,yn); ctx.moveTo(tx+half,yy); ctx.lineTo(tx-hn,yn); }
      }
      ctx.stroke();
      ctx.shadowBlur=0;
      ctx.fillStyle=RED_HOT; ctx.fillRect(tx-30,ty+300,60,14); ctx.fillRect(tx-46,ty+470,92,16);
    }
    ctx.restore();
    /* brume rouge à l'horizon */
    var g=ctx.createLinearGradient(0,560-cam.y*0.2,0,900-cam.y*0.2);
    g.addColorStop(0,'rgba(255,20,50,0)'); g.addColorStop(0.5,'rgba(255,20,50,0.22)'); g.addColorStop(1,'rgba(40,0,10,0)');
    ctx.fillStyle=g; ctx.fillRect(0,0,VW,1080);
  }
  function drawMid(cam){
    var ox=-cam.x*0.5, oy=-cam.y*0.5;
    var x0=-ox-400, x1=-ox+VW+50;
    MID.forEach(function(b,i){
      if(b.x+b.w<x0 || b.x>x1) return;
      var sp=midSprites[i];
      if(!sp) return;
      ctx.drawImage(sp.c, b.x+ox-sp.ox, b.top+oy-sp.oy, sp.w, sp.h);
    });
  }
  function drawRoofs(cam, time){
    ctx.save(); ctx.translate(-cam.x, -cam.y);
    var x0=cam.x-100, x1=cam.x+VW+100;
    ROOFS.forEach(function(rf){
      if(rf.x1<x0 || rf.x0>x1) return;
      var w=rf.x1-rf.x0;
      ctx.fillStyle='#040306'; ctx.fillRect(rf.x0, rf.top, w, 1400);
      /* fenêtres */
      rf.wins.forEach(function(wn){
        if(wn.x<x0-60 || wn.x>x1) return;
        ctx.fillStyle= wn.lit ? 'rgba(255,190,80,0.7)' : 'rgba(60,20,32,0.5)';
        ctx.fillRect(wn.x, wn.y, 22, 30);
      });
      /* équipements de toit (derrière le voleur) */
      ctx.fillStyle=BLACK;
      rf.ac.forEach(function(ax){ ctx.fillRect(ax, rf.top-34, 56, 34); ctx.fillRect(ax+6, rf.top-44, 20, 10); });
      if(rf.tank){
        var tx=rf.x1-330;
        ctx.fillRect(tx, rf.top-70, 8, 70); ctx.fillRect(tx+70, rf.top-70, 8, 70);
        ctx.fillRect(tx-6, rf.top-160, 90, 92);
        ctx.beginPath(); ctx.moveTo(tx-12,rf.top-160); ctx.lineTo(tx+39,rf.top-196); ctx.lineTo(tx+90,rf.top-160); ctx.fill();
        ctx.fillStyle='rgba(255,40,60,0.6)'; ctx.fillRect(tx-6, rf.top-160, 3, 92);
        ctx.fillStyle=BLACK;
      }
      if(rf.antenna){
        var axx=rf.x0+90;
        ctx.fillRect(axx, rf.top-190, 6, 190);
        ctx.fillRect(axx-26, rf.top-150, 58, 4); ctx.fillRect(axx-16, rf.top-120, 38, 4);
        if(Math.sin(time*9)>0){ ctx.fillStyle=RED_HOT; ctx.shadowColor=RED_HOT; ctx.shadowBlur=16; ctx.beginPath(); ctx.arc(axx+3, rf.top-196, 6, 0, TAU); ctx.fill(); ctx.shadowBlur=0; ctx.fillStyle=BLACK; }
      }
      if(rf.board){
        var bx=rf.x0+120, bw=Math.min(380, w-180);
        ctx.fillRect(bx+30, rf.top-120, 8, 120); ctx.fillRect(bx+bw-38, rf.top-120, 8, 120);
        ctx.fillStyle='#160006'; ctx.fillRect(bx, rf.top-230, bw, 110);
        ctx.strokeStyle=RED_HOT; ctx.lineWidth=4; ctx.shadowColor=RED_HOT; ctx.shadowBlur=18;
        ctx.strokeRect(bx, rf.top-230, bw, 110);
        ctx.fillStyle=RED_HOT; ctx.font='64px '+FONT_DISPLAY; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText('TAKE YOUR HEART', bx+bw/2, rf.top-174, bw-30);
        ctx.shadowBlur=0; ctx.fillStyle=BLACK;
      }
      /* rambarde + rebord, liseré rouge (la lune) */
      ctx.fillRect(rf.x0-10, rf.top-12, w+20, 16);
      ctx.fillRect(rf.x0-10, rf.top-46, w+20, 4);
      for(var px=rf.x0; px<=rf.x1; px+=34) ctx.fillRect(px, rf.top-46, 4, 36);
      ctx.shadowColor=RED_HOT; ctx.shadowBlur=14;
      ctx.fillStyle=RED_HOT; ctx.fillRect(rf.x0-10, rf.top-14, w+20, 4);
      ctx.shadowBlur=0;
      ctx.fillStyle='rgba(255,26,58,0.35)'; ctx.fillRect(rf.x0-10, rf.top-48, w+20, 2);
    });
    ctx.restore();
  }
  function drawForeground(cam){
    var ox=-cam.x*1.6;
    ctx.fillStyle='#000'; ctx.strokeStyle='#000'; ctx.lineWidth=5;
    for(var i=0;i<POLES.length-1;i++){
      var a=POLES[i]+ox, b=POLES[i+1]+ox;
      if(b<-200 || a>VW+200) continue;
      ctx.fillRect(a-14, 120, 28, 1000);
      ctx.fillRect(a-60, 150, 120, 10);
      for(var k=0;k<2;k++){
        ctx.beginPath(); ctx.moveTo(a+(k?50:-50), 160);
        ctx.quadraticCurveTo((a+b)/2, 260+k*30, b+(k?50:-50), 160); ctx.stroke();
      }
    }
    var last=POLES[POLES.length-1]+ox;
    if(last>-200 && last<VW+200) ctx.fillRect(last-14,120,28,1000);
  }
  function drawEmbers(time){
    EMBERS.forEach(function(e){
      var y=((e.y-e.v*time)%1100+1100)%1100-10, x=e.x*VW+Math.sin(time*2+e.w)*18;
      ctx.globalAlpha=0.35+0.35*Math.sin(time*6+e.w);
      ctx.fillStyle=e.c; ctx.fillRect(x,y,e.s,e.s);
    });
    ctx.globalAlpha=1;
  }
  function drawSpeedLines(time, power){
    if(power<=0) return;
    ctx.strokeStyle=WHITE; ctx.lineWidth=2;
    LINES.forEach(function(l){
      var span=VW+l.len, x=span-((time*l.v*VW+l.o*span)%span)-l.len;
      ctx.globalAlpha=0.12*power+0.18*power*l.o;
      ctx.beginPath(); ctx.moveTo(x,l.y); ctx.lineTo(x+l.len,l.y); ctx.stroke();
    });
    ctx.globalAlpha=1;
  }
  function drawVignette(){
    var g=ctx.createRadialGradient(VW/2,540,200,VW/2,540,Math.max(VW,1080)*0.75);
    g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,'rgba(0,0,0,0.75)');
    ctx.fillStyle=g; ctx.fillRect(0,0,VW,1080);
  }

  /* la scène de la ville à l'instant s (temps de l'intro) */
  function drawCity(s){
    var p=warp(s), cam=camera(p), ch=charAt(Math.min(p,P_DIVE0));
    var diving=p>=P_DIVE0, du=diving ? (p-P_DIVE0)/(P_DIVE1-P_DIVE0) : 0;
    /* léger coup de zoom au décollage du grand saut */
    var zoom=1+0.08*Math.sin(Math.PI*seg(p,1.0,1.35))+0.18*easeInCubic(du);
    var sx=(ch.x-cam.x), sy=(ch.y-cam.y)-80;
    base();
    ctx.save();
    ctx.translate(sx, sy); ctx.scale(zoom,zoom); ctx.translate(-sx, -sy);
    ctx.translate(cam.shake*0.7, cam.shake);
    drawSky(cam);
    drawFar(cam);
    drawEmbers(s);
    drawMid(cam);
    var hz=ctx.createLinearGradient(0,300,0,1080);
    hz.addColorStop(0,'rgba(60,0,18,0)'); hz.addColorStop(1,'rgba(40,0,12,0.6)');
    ctx.fillStyle=hz; ctx.fillRect(0,0,VW,1080);
    drawRoofs(cam, s);
    /* traînées rouges (images rémanentes) pendant les sauts */
    if(ch.air && !diving){
      for(var i=4;i>=1;i--){
        var g=charAt(p-0.028*i);
        if(!g.air) continue;
        ctx.globalAlpha=0.5-0.1*i;
        drawChar(ctx, g.x-cam.x, g.y-cam.y, CK, g.pose, s, {color:RED_HOT});
      }
      ctx.globalAlpha=1;
    }
    if(!diving){
      drawChar(ctx, ch.x-cam.x-2, ch.y-cam.y-1, CK, ch.pose, s, {color:RED_HOT, widen:5});
      drawChar(ctx, ch.x-cam.x, ch.y-cam.y, CK, ch.pose, s);
      /* poussière à l'atterrissage */
      LANDINGS.forEach(function(L){
        var a=seg(p,L,L+0.25);
        if(a<=0 || a>=1) return;
        var lx=charAt(L).x-cam.x, ly=charAt(L).y-cam.y;
        ctx.strokeStyle='rgba(255,255,255,'+(0.8*(1-a))+')'; ctx.lineWidth=4;
        for(var k=0;k<7;k++){
          var ang=Math.PI+k*Math.PI/6, r0=20+a*30, r1=40+a*110;
          ctx.beginPath(); ctx.moveTo(lx+Math.cos(ang)*r0, ly+Math.sin(ang)*r0*0.5); ctx.lineTo(lx+Math.cos(ang)*r1, ly+Math.sin(ang)*r1*0.5); ctx.stroke();
        }
      });
    }
    drawForeground(cam);
    ctx.restore();
    drawSpeedLines(s, ch.air ? 1 : 0.55);
    ctx.globalAlpha=0.33; ctx.drawImage(halftoneRed,0,0,VW,1080); ctx.globalAlpha=1;
    drawVignette();
    if(diving) drawDive(du, cam, ch, s);
  }

  /* il bondit vers la caméra : la silhouette envahit l'écran */
  function drawDive(u, cam, ch, s){
    var e=easeInCubic(u);
    var x0=ch.x-cam.x, y0=ch.y-cam.y;
    var m=easeOutCubic(u), k=lerp(CK, 15, e);
    var x=lerp(x0, VW*0.5, m)-40*k*m, y=lerp(y0, 540+95*k, m)-120*Math.sin(u*Math.PI);
    /* traits de zoom autour */
    ctx.save();
    ctx.strokeStyle='rgba(255,255,255,'+(0.55*u)+')';
    var r=rng(77);
    for(var i=0;i<40;i++){
      var a=r()*TAU, r0=200+r()*400, r1=r0+300+u*900;
      ctx.lineWidth=2+r()*4;
      ctx.beginPath(); ctx.moveTo(VW/2+Math.cos(a)*r0, 540+Math.sin(a)*r0); ctx.lineTo(VW/2+Math.cos(a)*r1, 540+Math.sin(a)*r1); ctx.stroke();
    }
    ctx.restore();
    drawChar(ctx, x, y, k, POSE_DIVE, s, {color:RED_HOT, widen:5, rot:-0.35*e});
    drawChar(ctx, x, y, k, POSE_DIVE, s, {rot:-0.35*e});
    var b=seg(u,0.72,1);
    if(b>0){ ctx.fillStyle='rgba(5,5,5,'+b+')'; ctx.fillRect(0,0,VW,1080); }
  }

  /* ===================== RENDU : ARRÊT SUR IMAGE ===================== */
  function sunburst(c, cx, cy, rays, rot, col){
    var R=Math.hypot(VW,1080);
    c.fillStyle=col;
    for(var i=0;i<rays;i++){
      var a0=rot+i*TAU/rays, a1=a0+TAU/rays*0.5;
      c.beginPath(); c.moveTo(cx,cy);
      c.lineTo(cx+Math.cos(a0)*R, cy+Math.sin(a0)*R);
      c.lineTo(cx+Math.cos(a1)*R, cy+Math.sin(a1)*R);
      c.closePath(); c.fill();
    }
  }
  function drawFreeze(c, f, time){
    base(c);
    c.fillStyle=RED; c.fillRect(-10,-10,VW+20,1100);
    sunburst(c, VW*0.42, 600, 22, 0.2*f, 'rgba(0,0,0,0.88)');
    c.globalAlpha=0.55; c.drawImage(halftoneBlack,0,0,VW,1080); c.globalAlpha=1;
    /* le voleur en grand, détouré de blanc */
    var k=Math.min(2.6, VW/300), cx=VW*0.42, cy=Math.min(880, 560+k*130)+20*Math.sin(f*3);
    drawChar(c, cx, cy, k, POSE_LEAP, time, {color:WHITE, widen:9, tail:0.4});
    drawChar(c, cx, cy, k, POSE_LEAP, time, {tail:0.4});
    /* reflet du masque */
    var tw=0.5+0.5*Math.sin(f*20);
    c.save(); c.translate(cx+k*58, cy-k*178); c.rotate(f*2); c.fillStyle=WHITE; c.globalAlpha=tw;
    star4(c, 0, 0, 34*k/2.6, 6);
    c.restore(); c.globalAlpha=1;
    /* bandeau « SHOWTIME! » qui arrive de la droite */
    var u=easeOutCubic(f/0.3);
    var fs=Math.min(170, VW/4.6);
    c.font='italic '+fs+'px '+FONT_DISPLAY;
    var tw=c.measureText('SHOWTIME!').width;
    if(tw>VW*0.8){ fs*=VW*0.8/tw; c.font='italic '+fs+'px '+FONT_DISPLAY; tw=c.measureText('SHOWTIME!').width; }
    var pad=fs*0.45, bx=Math.min(VW*0.42, VW-tw-pad*2-20);
    c.save();
    c.translate(lerp(VW+pad, bx, u), 1080*0.22);
    c.rotate(-0.1);
    c.fillStyle=BLACK; c.strokeStyle=WHITE; c.lineWidth=8;
    c.beginPath(); c.moveTo(0,-fs*0.62); c.lineTo(tw+pad*2.2,-fs*0.72); c.lineTo(tw+pad*1.8,fs*0.62); c.lineTo(-pad*0.4,fs*0.7); c.closePath();
    c.fill(); c.stroke();
    c.textBaseline='middle'; c.textAlign='left';
    c.fillStyle=RED; c.fillText('SHOWTIME!', pad+6, 6);
    c.fillStyle=WHITE; c.fillText('SHOWTIME!', pad, 0);
    c.restore();
    /* éclair blanc à l'entrée */
    if(f<0.12){ c.fillStyle='rgba(255,255,255,'+(1-f/0.12)+')'; c.fillRect(0,0,VW,1080); }
  }
  function star4(c, x, y, r, w){
    c.beginPath();
    c.moveTo(x,y-r); c.lineTo(x+w,y-w); c.lineTo(x+r,y); c.lineTo(x+w,y+w);
    c.lineTo(x,y+r); c.lineTo(x-w,y+w); c.lineTo(x-r,y); c.lineTo(x-w,y-w); c.closePath(); c.fill();
  }

  /* ===================== TRANSITIONS DIAGONALES ===================== */
  /* demi-plan au-dessus (side=-1) ou en dessous (side=1) d'une droite passant par (cx,cy) */
  function halfPlane(c, cx, cy, ang, side, off){
    var L=4000, dx=Math.cos(ang), dy=Math.sin(ang), nx=-dy*side, ny=dx*side;
    var ox=cx+nx*off, oy=cy+ny*off;
    c.beginPath();
    c.moveTo(ox-dx*L, oy-dy*L); c.lineTo(ox+dx*L, oy+dy*L);
    c.lineTo(ox+dx*L+nx*L, oy+dy*L+ny*L); c.lineTo(ox-dx*L+nx*L, oy-dy*L+ny*L);
    c.closePath();
  }
  var CUT=-0.42;                        /* angle de la découpe (vers le haut à droite) */
  /* ouverture : éclair, bande rouge, puis les deux moitiés noires s'écartent */
  function drawOpening(t){
    base();
    var cx=VW/2, cy=540, open=easeInCubic(seg(t,0.2,0.55))*1400;
    [-1,1].forEach(function(side){
      halfPlane(ctx, cx, cy, CUT, side, open);
      ctx.fillStyle=BLACK; ctx.fill();
      /* bord rouge sur la découpe */
      if(open>0){ halfPlane(ctx, cx, cy, CUT, side, open); ctx.save(); ctx.clip(); halfPlane(ctx, cx, cy, CUT, -side, -open-26); ctx.fillStyle=RED; ctx.fill(); ctx.restore(); }
    });
    if(t<0.2){
      /* l'éclair qui trace la découpe */
      var u=easeOutCubic(t/0.14), L=Math.hypot(VW,1080);
      ctx.save(); ctx.translate(cx,cy); ctx.rotate(CUT);
      ctx.fillStyle=RED; ctx.fillRect(-L/2, -10*seg(t,0.08,0.2)*3, L*u, 20*seg(t,0.08,0.2)*3+1);
      ctx.fillStyle=WHITE; ctx.fillRect(-L/2, -3, L*u, 6);
      ctx.restore();
    }
  }
  /* sortie de l'arrêt sur image : l'image se fend et glisse */
  function drawFreezeSplit(u){
    base();
    var off=easeInCubic(u)*1500;
    [-1,1].forEach(function(side){
      ctx.save();
      halfPlane(ctx, VW/2, 540, CUT, side, off); ctx.clip();
      var nx=-Math.sin(CUT)*side, ny=Math.cos(CUT)*side;
      ctx.setTransform(1,0,0,1, nx*off*S*DPR, ny*off*S*DPR);
      ctx.drawImage(freezeCanvas,0,0);
      ctx.restore();
    });
    base();
    if(u<0.35){
      ctx.save(); ctx.translate(VW/2,540); ctx.rotate(CUT);
      ctx.fillStyle='rgba(255,255,255,'+(1-u/0.35)+')'; ctx.fillRect(-3000,-6,6000,12);
      ctx.restore();
    }
  }

  /* ===================== RENDU : TITRE ===================== */
  /* lettres découpées façon carte de visite des Phantom Thieves */
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
  function drawMask(c, x, y, w, col){
    c.save(); c.translate(x,y); c.scale(w/400,w/400);
    c.fillStyle=col;
    c.beginPath();
    c.moveTo(-200,-30); c.quadraticCurveTo(-120,-70,-30,-28); c.quadraticCurveTo(0,-14,30,-28);
    c.quadraticCurveTo(120,-70,200,-30); c.quadraticCurveTo(170,40,90,46); c.quadraticCurveTo(30,46,0,20);
    c.quadraticCurveTo(-30,46,-90,46); c.quadraticCurveTo(-170,40,-200,-30); c.closePath(); c.fill();
    c.strokeStyle=BLACK; c.lineWidth=9; c.stroke();
    c.globalCompositeOperation='destination-out';
    c.beginPath(); c.ellipse(-95,4,52,20,0.12,0,TAU); c.fill();
    c.beginPath(); c.ellipse(95,4,52,20,-0.12,0,TAU); c.fill();
    c.restore();
  }
  function drawTitle(q, time){
    base();
    var shake=0;
    LETTERS.forEach(function(L,j){ var a=q-(0.24+j*0.05)-0.1; if(a>0 && a<0.12) shake+=(1-a/0.12)*7*Math.sin(a*120+j); });
    ctx.save(); ctx.translate(shake, shake*0.6);
    ctx.fillStyle=RED; ctx.fillRect(-20,-20,VW+40,1120);
    sunburst(ctx, VW/2, 540, 24, time*0.25, 'rgba(0,0,0,0.9)');
    /* masque géant en fond */
    var mw=Math.min(VW*0.95, 1100)*(1+0.05*q);
    drawMask(ctx, VW/2, 290, mw, '#ff2a3a');
    ctx.globalAlpha=0.6; ctx.drawImage(halftoneBlack,0,0,VW,1080); ctx.globalAlpha=1;
    /* bande noire en diagonale derrière les lettres */
    var bu=easeOutCubic(seg(q,0.04,0.26));
    ctx.save(); ctx.translate(lerp(-VW*1.3, 0, bu), 0);
    ctx.fillStyle=BLACK;
    ctx.beginPath(); ctx.moveTo(-50,420); ctx.lineTo(VW+50,350); ctx.lineTo(VW+50,700); ctx.lineTo(-50,770); ctx.closePath(); ctx.fill();
    ctx.fillStyle=WHITE;
    ctx.beginPath(); ctx.moveTo(-50,404); ctx.lineTo(VW+50,334); ctx.lineTo(VW+50,344); ctx.lineTo(-50,414); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-50,778); ctx.lineTo(VW+50,708); ctx.lineTo(VW+50,716); ctx.lineTo(-50,786); ctx.closePath(); ctx.fill();
    ctx.restore();
    /* petite étiquette en haut */
    var tu=easeOutCubic(seg(q,0.1,0.3));
    var tag='LES PHANTOM THIEVES PRÉSENTENT', tfs=40;
    ctx.font=tfs+'px '+FONT_DISPLAY;
    var tw=ctx.measureText(tag).width;
    if(tw>VW*0.82){ tfs*=VW*0.82/tw; ctx.font=tfs+'px '+FONT_DISPLAY; tw=ctx.measureText(tag).width; }
    ctx.save(); ctx.translate(lerp(-tw-200, Math.min(VW*0.06, (VW-tw)/2), tu), 170); ctx.rotate(-0.06);
    ctx.fillStyle=WHITE; ctx.fillRect(-14,-tfs*0.75,tw+28,tfs*1.4);
    ctx.fillStyle=BLACK; ctx.textBaseline='middle'; ctx.textAlign='left'; ctx.fillText(tag,0,0);
    ctx.restore();
    /* les lettres claquent une par une */
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
        var j=LETTERS.indexOf(L), t0=0.24+j*0.05, a=seg(q,t0,t0+0.2);
        var w=widths[i], cx=x+w/2; x+=w;
        if(a<=0) return;
        var sc=lerp(2.8,1,easeOutBack(a)), rot=L.rot+(1-easeOutCubic(a))*0.7;
        ctx.save();
        ctx.translate(cx, y+L.dy*fs); ctx.rotate(rot); ctx.scale(sc,sc);
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
    /* bandeau PHANTOM WAVE */
    var su=easeOutCubic(seg(q,0.78,0.98));
    if(su>0){
      var sfs=Math.min(70, VW/11);
      ctx.save(); ctx.translate(lerp(VW+900, VW/2+fs*0.6, su), 840); ctx.rotate(-0.05);
      ctx.font=sfs+'px '+FONT_DISPLAY;
      var label='PHANTOM  WAVE', lw=ctx.measureText(label).width;
      ctx.fillStyle=BLACK; ctx.beginPath(); ctx.moveTo(-lw/2-40+10,-sfs*0.62+10); ctx.lineTo(lw/2+60+10,-sfs*0.7+10); ctx.lineTo(lw/2+40+10,sfs*0.62+10); ctx.lineTo(-lw/2-60+10,sfs*0.7+10); ctx.closePath(); ctx.fill();
      ctx.fillStyle=WHITE; ctx.beginPath(); ctx.moveTo(-lw/2-40,-sfs*0.62); ctx.lineTo(lw/2+60,-sfs*0.7); ctx.lineTo(lw/2+40,sfs*0.62); ctx.lineTo(-lw/2-60,sfs*0.7); ctx.closePath(); ctx.fill();
      ctx.fillStyle=BLACK; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(label,0,sfs*0.05);
      ctx.restore();
    }
    /* étincelles */
    var r=rng(5);
    for(var i=0;i<9;i++){
      var sx=VW*(0.12+r()*0.76), sy=300+r()*520, ph=r()*TAU, tw=Math.max(0,Math.sin(time*7+ph));
      if(q<0.5) tw*=seg(q,0.3,0.5);
      ctx.fillStyle=i%3?WHITE:YELLOW; ctx.globalAlpha=tw;
      star4(ctx, sx, sy, 16+r()*16, 3.5);
    }
    ctx.globalAlpha=1;
    ctx.restore();
    /* entrée : une étoile rouge jaillit du noir */
    var eu=seg(q,0,0.24);
    if(eu<1){
      ctx.save();
      ctx.beginPath(); ctx.rect(-20,-20,VW+40,1120);
      starPath(ctx, VW/2, 540, easeOutCubic(eu)*Math.hypot(VW,1080)*1.1, 12, q*2);
      ctx.fillStyle=BLACK; ctx.fill('evenodd');
      ctx.strokeStyle=WHITE; ctx.lineWidth=10;
      starPath(ctx, VW/2, 540, easeOutCubic(eu)*Math.hypot(VW,1080)*1.1, 12, q*2); ctx.stroke();
      ctx.restore();
    }
  }
  function starPath(c, cx, cy, R, n, rot){
    c.moveTo(cx+Math.cos(rot)*R, cy+Math.sin(rot)*R);
    for(var i=1;i<=n*2;i++){
      var a=rot+i*Math.PI/n, rr=i%2 ? R*0.55 : R;
      c.lineTo(cx+Math.cos(a)*rr, cy+Math.sin(a)*rr);
    }
    c.closePath();
  }

  /* ===================== SORTIE : BANDES QUI BALAIENT ===================== */
  var STRIPES=[{w:90,c:RED},{w:46,c:BLACK},{w:200,c:BLACK},{w:22,c:WHITE},{w:130,c:RED},{w:60,c:BLACK}];
  var BAND=STRIPES.reduce(function(a,s){ return a+s.w; },0), SLANT=420;
  function drawExit(u){
    var e=easeInOutCubic(u);
    var lead=lerp(-40, VW+BAND+SLANT+40, e);
    /* à gauche des bandes : le hub apparaît (on efface) */
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

  /* ===================== BOUCLE ===================== */
  function render(t){
    base();
    if(t<T_TITLE){
      if(t>=F0 && t<F1){ drawFreeze(ctx, (t-F0)/(F1-F0), t); return; }
      drawCity(t);
      if(t>=F1 && t<F1+0.2){
        if(!freezeReady){ drawFreeze(fctx, 1, F1); freezeReady=true; }
        drawFreezeSplit((t-F1)/0.2);
      }
      if(t<0.6) drawOpening(t);
      return;
    }
    drawTitle(t-T_TITLE, t);
    if(t>=T_EXIT) drawExit(seg(t,T_EXIT,TOTAL));
  }

  var start=0, offset=0, raf=0, done=false, exiting=false;
  function finish(){
    if(done) return;
    done=true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    document.removeEventListener('keydown', onKey);
    if(overlay.parentNode) overlay.parentNode.removeChild(overlay);
    document.documentElement.classList.remove('intro-playing');
    try{ window.dispatchEvent(new Event('cg-intro-done')); }catch(e){}
  }
  function frame(now){
    if(!start) start=now;
    var t=(now-start)/1000+offset;
    if(t>=T_EXIT && !exiting){ exiting=true; overlay.classList.add('exiting'); }
    if(t>=TOTAL){ finish(); return; }
    render(t);
    raf=requestAnimationFrame(frame);
  }
  /* passer : on saute directement aux bandes de sortie */
  function skip(){
    if(done || exiting) return;
    var now=performance.now(), t=(now-(start||now))/1000+offset;
    offset+=T_EXIT-t;
  }
  function onKey(e){ if(e.key==='Escape' || e.key===' ' || e.key==='Enter'){ e.preventDefault(); skip(); } }

  resize();
  window.addEventListener('resize', resize);
  if(debugT){
    var dt=parseFloat(debugT);
    if(dt>=T_EXIT) overlay.classList.add('exiting');
    render(dt);
    window.CG_INTRO_RENDER=function(t){ overlay.classList.toggle('exiting', t>=T_EXIT); render(t); };
    return;
  }
  document.documentElement.classList.add('intro-playing');
  overlay.addEventListener('pointerdown', skip);
  document.addEventListener('keydown', onKey);
  raf=requestAnimationFrame(frame);
})();
