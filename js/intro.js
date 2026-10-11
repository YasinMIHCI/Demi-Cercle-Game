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

  /* ===================== LE PERSONNAGE =====================
     Un squelette (angles en radians, mesurés depuis la verticale vers le bas,
     positifs vers l'avant), animé par images clés comme en animation 2D :
     - course : cycle de sprint en 9 poses par jambe (pose du pied, amorti,
       passage, poussée, décollage des orteils, talon qui remonte, montée du
       genou, extension, attaque du pas), lissé en Catmull-Rom. Le pied le plus
       bas est toujours posé au sol, avec une petite phase de suspension ;
     - sauts : appel, impulsion, groupé ou grand écart, réception amortie.
     Le corps est dessiné en volumes (membres galbés et effilés), et les deux
     pans du manteau sont de vraies chaînes simulées (inertie, traînée de l'air,
     gravité), calculées une fois pour toute la trajectoire. */
  var L_TH=46, L_SH=46, L_FT=21, L_TO=54, L_NK=7, L_UA=31, L_FA=28;
  var CAD=3.2;                                   /* cycles de course par seconde (2 pas par cycle) */
  function smooth(u){ u=clamp01(u); return u*u*(3-2*u); }
  function catmull(p0,p1,p2,p3,u){
    var u2=u*u, u3=u2*u;
    return 0.5*((2*p1)+(-p0+p2)*u+(2*p0-5*p1+4*p2-p3)*u2+(-p0+3*p1-3*p2+p3)*u3);
  }
  /* interpolation périodique et lisse d'images clés [phase, v1, v2, ...] */
  function cyc(keys, ph, idx){
    ph=ph-Math.floor(ph);
    var n=keys.length, i=n-1;
    for(var j=0;j<n;j++){ if(keys[j][0]>ph){ i=j-1; break; } }
    if(i<0) i=n-1;
    var k0=keys[(i-1+n)%n], k1=keys[i], k2=keys[(i+1)%n], k3=keys[(i+2)%n];
    var t1=k1[0], t2=k2[0]; if(t2<=t1) t2+=1;
    var pp=ph; if(pp<t1) pp+=1;
    return catmull(k0[idx], k1[idx], k2[idx], k3[idx], (pp-t1)/(t2-t1));
  }
  /* une jambe sur un cycle : [phase, cuisse, flexion du genou, extension de la cheville] */
  var LEG=[
    [0.00, 0.46, 0.16, 0.05],   /* le talon se pose devant */
    [0.10, 0.22, 0.58, 0.00],   /* amorti */
    [0.22,-0.16, 0.36, 0.05],   /* passage sous le bassin */
    [0.34,-0.52, 0.20, 0.38],   /* poussée */
    [0.45,-0.64, 0.92, 0.80],   /* les orteils quittent le sol */
    [0.58,-0.24, 2.05, 0.55],   /* le talon remonte vers la fesse */
    [0.72, 0.50, 2.20, 0.35],   /* le genou monte */
    [0.86, 0.95, 1.25, 0.20],   /* la jambe se déplie */
    [0.95, 0.74, 0.42, 0.10]    /* attaque du pas */
  ];
  function poseRun(p){
    var ph=p*CAD;
    var nT=cyc(LEG,ph,1), nK=cyc(LEG,ph,2), nA=cyc(LEG,ph,3);
    var fT=cyc(LEG,ph+0.5,1), fK=cyc(LEG,ph+0.5,2), fA=cyc(LEG,ph+0.5,3);
    /* chaque bras suit la jambe opposée ; le coude se ferme quand le bras passe devant */
    var nS=1.05*fT-0.08, fS=1.05*nT-0.08;
    var g=(ph*2)%1;                                     /* deux pas par cycle */
    return {lean:0.30+0.035*Math.sin(ph*TAU*2), head:-0.2, spin:0,
      float:7*Math.pow(Math.max(0,Math.cos((g-0.47)*TAU)),4),
      nT:nT, nK:nK, nA:nA, fT:fT, fK:fK, fA:fA,
      nS:nS, nE:1.25+0.55*clamp01(nS+0.2), fS:fS, fE:1.25+0.55*clamp01(fS+0.2)};
  }
  function P(o){ o.float=o.float||0; o.spin=o.spin||0; o.head=(o.head===undefined?-0.15:o.head); return o; }
  var POSE_PRE=P({lean:0.55, nT:0.35, nK:1.05, nA:0.1, fT:-0.35, fK:0.85, fA:0.4, nS:-0.9, nE:0.9, fS:-0.5, fE:1.0});
  var POSE_TAKEOFF=P({lean:0.48, nT:-0.55, nK:0.25, nA:0.8, fT:1.2, fK:1.9, fA:0.3, nS:1.6, nE:0.7, fS:-0.9, fE:0.6});
  var POSE_TUCK=P({lean:0.5, spin:0.06, nT:1.35, nK:2.25, nA:0.5, fT:0.95, fK:2.05, fA:0.5, nS:1.25, nE:0.9, fS:0.6, fE:1.1});
  var POSE_LEAP=P({lean:0.55, head:-0.3, nT:1.28, nK:0.62, nA:0.25, fT:-0.88, fK:1.35, fA:0.6, nS:2.35, nE:0.18, fS:-1.45, fE:0.35});
  var POSE_PRELAND=P({lean:0.32, nT:0.95, nK:0.45, nA:0.1, fT:0.42, fK:0.95, fA:0.2, nS:1.35, nE:0.4, fS:-0.55, fE:0.7});
  var POSE_LAND=P({lean:0.85, head:-0.35, nT:1.42, nK:2.3, nA:0.0, fT:0.62, fK:2.35, fA:0.6, nS:0.65, nE:0.35, fS:-0.85, fE:0.6});
  var POSE_DIVE=P({lean:1.0, head:-0.45, nT:-0.35, nK:0.9, nA:0.6, fT:-0.9, fK:1.45, fA:0.7, nS:2.05, nE:0.15, fS:2.65, fE:0.25});
  function mix(a,b,u){ var o={}; for(var k in a) o[k]=lerp(a[k], b[k], u); return o; }

  /* cinématique : tous les points du corps, dans le repère des pieds (y vers le bas) */
  function legPts(T,K,A){
    var knee={x:Math.sin(T)*L_TH, y:Math.cos(T)*L_TH}, s=T-K;
    var ank={x:knee.x+Math.sin(s)*L_SH, y:knee.y+Math.cos(s)*L_SH};
    var fd=s+Math.PI/2-A;
    return {knee:knee, ank:ank, toe:{x:ank.x+Math.sin(fd)*L_FT, y:ank.y+Math.cos(fd)*L_FT}, s:s, fd:fd};
  }
  function rig(pose){
    var n=legPts(pose.nT,pose.nK,pose.nA), f=legPts(pose.fT,pose.fK,pose.fA);
    /* le pied le plus bas touche le sol */
    var low=Math.max(n.ank.y+5, n.toe.y+2, f.ank.y+5, f.toe.y+2);
    var hipY=-low-pose.float;
    var ux=Math.sin(pose.lean), uy=-Math.cos(pose.lean);
    var sh={x:ux*L_TO, y:uy*L_TO};                     /* relatif à la hanche */
    var hl=pose.lean+pose.head;
    var hd={x:sh.x+Math.sin(hl)*(L_NK+12), y:sh.y-Math.cos(hl)*(L_NK+12)};
    return {hipY:hipY, n:n, f:f, sh:sh, hd:hd, ux:ux, uy:uy, fx:-uy, fy:ux, hl:hl};
  }
  /* point d'attache des pans du manteau (dans le repère des pieds, rotation comprise) */
  function tailRoots(pose){
    var r=rig(pose), out=[];
    [[-9,17],[-6,8]].forEach(function(o){
      var lx=r.fx*o[0]+r.ux*o[1], ly=r.fy*o[0]+r.uy*o[1];
      var c=Math.cos(pose.spin), s=Math.sin(pose.spin);
      out.push({x:lx*c-ly*s, y:r.hipY+lx*s+ly*c});
    });
    return out;
  }

  /* membre galbé : un « gélule » effilée d'un rayon ra à rb */
  function capsule(c, ax, ay, bx, by, ra, rb){
    var ang=Math.atan2(by-ay, bx-ax);
    c.beginPath();
    c.arc(ax, ay, ra, ang+Math.PI/2, ang-Math.PI/2);
    c.arc(bx, by, rb, ang-Math.PI/2, ang+Math.PI/2);
    c.closePath(); c.fill();
  }
  function ribbon(c, pts, w0, w1){
    var L=[], R=[];
    for(var i=0;i<pts.length;i++){
      var a=pts[Math.max(0,i-1)], b=pts[Math.min(pts.length-1,i+1)];
      var dx=b.x-a.x, dy=b.y-a.y, d=Math.hypot(dx,dy)||1, w=lerp(w0,w1,i/(pts.length-1));
      L.push({x:pts[i].x-dy/d*w, y:pts[i].y+dx/d*w}); R.push({x:pts[i].x+dy/d*w, y:pts[i].y-dx/d*w});
    }
    c.beginPath(); c.moveTo(L[0].x,L[0].y);
    for(i=1;i<L.length;i++) c.lineTo(L[i].x,L[i].y);
    for(i=R.length-1;i>=0;i--) c.lineTo(R[i].x,R[i].y);
    c.closePath(); c.fill();
    return R;
  }

  /* opts : color (silhouette d'une seule couleur), widen (épaissit, pour les contours),
     tails (pans du manteau simulés, dans le repère des pieds), rot (rotation en plus) */
  function drawChar(c, x, y, k, pose, time, opts){
    opts=opts||{};
    var mono=opts.color, wd=(opts.widen||0)/2;
    var col={
      far: mono||'#0b0b0f', near: mono||'#191920', coat: mono||'#0e0e13', coatHi: mono||'#24242d',
      boot: mono||'#050506', gloveN: mono||'#e0001c', gloveF: mono||'#8c0013', lining: mono||'#c3001b',
      hair: mono||'#08080b', mask: mono||WHITE
    };
    var r=rig(pose);
    c.save();
    c.translate(x,y); c.scale(k,k);
    if(opts.rot) c.rotate(opts.rot);
    c.lineCap='round'; c.lineJoin='round';
    /* pans du manteau, derrière tout le reste */
    if(opts.tails){
      opts.tails.forEach(function(pts, i){
        c.fillStyle=col.coat;
        var edge=ribbon(c, pts, (i?7:9)+wd, 1.5+wd);
        if(!mono){
          c.strokeStyle=col.lining; c.lineWidth=2.2;
          c.beginPath(); c.moveTo(edge[0].x,edge[0].y);
          for(var j=1;j<edge.length;j++) c.lineTo(edge[j].x,edge[j].y);
          c.stroke();
        }
      });
    }
    c.translate(0, r.hipY);
    c.rotate(pose.spin);
    function leg(L, fill, thigh){
      c.fillStyle=fill;
      capsule(c, 0, 0, L.knee.x, L.knee.y, 10.5+wd, 7+wd);
      /* mollet : un peu plus épais en haut */
      var mx=lerp(L.knee.x, L.ank.x, 0.35), my=lerp(L.knee.y, L.ank.y, 0.35);
      var bx=-Math.cos(L.s)*1.8, by=Math.sin(L.s)*1.8;
      capsule(c, L.knee.x, L.knee.y, mx+bx, my+by, 7+wd, 7.4+wd);
      capsule(c, mx+bx, my+by, L.ank.x, L.ank.y, 7.4+wd, 4.4+wd);
      /* botte */
      c.fillStyle=col.boot;
      capsule(c, L.ank.x-Math.sin(L.fd)*3, L.ank.y-Math.cos(L.fd)*3, L.toe.x, L.toe.y, 5.6+wd, 3.4+wd);
    }
    function arm(S, E, fill, glove){
      var sx=r.sh.x-r.ux*4, sy=r.sh.y-r.uy*4;
      var ex=sx+Math.sin(S)*L_UA, ey=sy+Math.cos(S)*L_UA;
      var a2=S+E, hx=ex+Math.sin(a2)*L_FA, hy=ey+Math.cos(a2)*L_FA;
      c.fillStyle=fill;
      capsule(c, sx, sy, ex, ey, 6.6+wd, 5+wd);
      capsule(c, ex, ey, hx, hy, 5+wd, 3.8+wd);
      c.fillStyle=glove;
      c.beginPath(); c.arc(hx+Math.sin(a2)*3, hy+Math.cos(a2)*3, 5.6+wd, 0, TAU); c.fill();
    }
    /* repère du buste : (f = avant, u = haut) depuis la hanche */
    function T(fw, up){ return {x:r.fx*fw+r.ux*up, y:r.fy*fw+r.uy*up}; }
    function poly(pts, fill){
      c.fillStyle=fill; c.beginPath();
      pts.forEach(function(p,i){ var q=T(p[0],p[1]); if(i) c.lineTo(q.x,q.y); else c.moveTo(q.x,q.y); });
      c.closePath(); c.fill();
      if(wd){ c.strokeStyle=fill; c.lineWidth=wd*2; c.stroke(); }
    }
    arm(pose.fS, pose.fE, col.far, col.gloveF);
    leg(r.f, col.far);
    /* buste : manteau ajusté, épaules, basque */
    poly([[-11,-2],[-13,20],[-13,42],[-10,55],[0,59],[9,55],[14,42],[12,24],[10,6],[11,-6]], col.coat);
    poly([[-13,22],[-16,-4],[-9,-22],[4,-20],[11,-8],[10,8]], col.coat);
    if(!mono){
      /* revers et boutons : un peu de lumière sur le manteau */
      poly([[9,52],[13,40],[10,26],[6,36]], col.coatHi);
      c.fillStyle='#3a3a46';
      [[10,20],[11,12]].forEach(function(b){ var q=T(b[0],b[1]); c.beginPath(); c.arc(q.x,q.y,1.4,0,TAU); c.fill(); });
    }
    /* col haut et pointu, derrière la tête */
    poly([[-9,50],[-15,76],[-4,66],[3,56]], col.coat);
    leg(r.n, col.near);
    /* cou + tête */
    var nk=T(1,L_TO+2);
    c.fillStyle=col.near;
    capsule(c, nk.x, nk.y, r.hd.x-Math.sin(r.hl)*6, r.hd.y+Math.cos(r.hl)*6, 4.5+wd, 4.5+wd);
    c.save();
    c.translate(r.hd.x, r.hd.y); c.rotate(r.hl);
    c.fillStyle=col.near;
    c.beginPath(); c.ellipse(1, 1, 11+wd, 12.5+wd, 0, 0, TAU); c.fill();
    /* profil : nez et menton */
    c.beginPath(); c.moveTo(9,-2); c.lineTo(14.5+wd,3); c.lineTo(10,6); c.lineTo(9,11); c.lineTo(4,13); c.closePath(); c.fill();
    /* cheveux en mèches, qui flottent un peu */
    c.fillStyle=col.hair;
    var locks=[[0.62,13],[0.32,15.5],[0.02,17],[-0.28,17.5],[-0.58,18.2],[-0.88,18],[-1.18,17.6],[-1.48,17],[-1.78,16],[-2.08,15],[-2.4,13.6],[-2.75,12]];
    c.beginPath();
    locks.forEach(function(l,i){
      var fl=Math.sin(time*16+i*1.3)*0.05;
      var a=l[0]+fl-0.2, len=l[1]+wd+Math.sin(time*11+i)*0.7;
      var ia=a+0.24, ir=10.5;
      var tip={x:Math.sin(a)*len, y:-Math.cos(a)*len}, inn={x:Math.sin(ia)*ir, y:-Math.cos(ia)*ir};
      if(i) c.lineTo(inn.x, inn.y); else c.moveTo(inn.x, inn.y);
      c.quadraticCurveTo(Math.sin(a+0.12)*len*0.8, -Math.cos(a+0.12)*len*0.8, tip.x, tip.y);
    });
    c.lineTo(-4,6); c.lineTo(6,-3); c.closePath(); c.fill();
    /* masque blanc, pointu vers l'extérieur */
    if(!wd){
      c.fillStyle=col.mask;
      c.beginPath(); c.moveTo(1,-4); c.lineTo(9,-7); c.lineTo(16,-6); c.lineTo(14.5,-1); c.lineTo(9,1.5); c.lineTo(2,0.5); c.lineTo(-3,-6); c.closePath(); c.fill();
      if(!mono){
        c.fillStyle='#000'; c.beginPath(); c.ellipse(10.5,-3,3.2,1.5,-0.15,0,TAU); c.fill();
        c.fillStyle=RED_HOT; c.beginPath(); c.arc(11.3,-3.1,0.9,0,TAU); c.fill();
      }
    }
    c.restore();
    arm(pose.nS, pose.nE, col.near, col.gloveN);
    c.restore();
  }

  /* ===================== CHRONOLOGIE ===================== */
  var VX=1250;                         /* vitesse de course (unités par seconde) */
  var CK=1.2;                          /* taille du voleur dans la ville */
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
  /* temps de l'intro correspondant à un temps « du personnage » (pour caler les sons) */
  function unwarp(p){
    if(p<P_SLOW) return p;
    if(p<P_APEX) return P_SLOW+(p-P_SLOW)/SLOW;
    return F1+(p-P_APEX);
  }
  var JUMPS=[{t0:0.35, t1:0.72, y0:760, y1:680, h:170, big:false}, {t0:1.05, t1:1.80, y0:680, y1:790, h:300, big:true}];
  var LANDINGS=[0.72, 1.80];

  /* état du personnage à l'instant p (temps « du personnage ») */
  function runWithLanding(p, landedAt){
    var run=poseRun(p);
    if(landedAt===null) return run;
    var d=p-landedAt;
    return d<0.17 ? mix(POSE_LAND, run, smooth(d/0.17)) : run;
  }
  function charAt(p){
    var x=VX*p, y, pose, air=false, u, J;
    if(p<P_DIVE0 && p>=JUMPS[1].t1){
      y=JUMPS[1].y1; pose=runWithLanding(p, JUMPS[1].t1);
      var pre=smooth((p-(P_DIVE0-0.075))/0.075);
      if(pre>0) pose=mix(pose, POSE_PRE, pre);
    }
    else if(p>=P_DIVE0){
      /* bond final vers la caméra */
      u=clamp01((p-P_DIVE0)/(P_DIVE1-P_DIVE0)); air=true;
      y=JUMPS[1].y1-760*easeOutCubic(u);
      pose=mix(POSE_TAKEOFF, POSE_DIVE, smooth(u/0.35));
    }
    else {
      for(var i=0;i<JUMPS.length;i++){
        J=JUMPS[i];
        if(p>=J.t0 && p<J.t1){
          u=(p-J.t0)/(J.t1-J.t0); air=true;
          y=lerp(J.y0,J.y1,u)-4*J.h*u*(1-u);
          var top=J.big ? POSE_LEAP : POSE_TUCK;
          if(u<0.07) pose=mix(POSE_PRE, POSE_TAKEOFF, smooth(u/0.07));
          else if(u<0.24) pose=mix(POSE_TAKEOFF, top, smooth((u-0.07)/0.17));
          else if(u<0.62) pose=top;
          else if(u<0.94) pose=mix(top, POSE_PRELAND, smooth((u-0.62)/0.32));
          else pose=mix(POSE_PRELAND, POSE_LAND, smooth((u-0.94)/0.06));
          pose=mix(pose, pose, 0); pose.spin=(J.big?0.13:0.07)*Math.sin(Math.PI*u);
          return {x:x, y:y, pose:pose, air:true};
        }
      }
      /* au sol */
      var prev=null, next=null;
      for(i=0;i<JUMPS.length;i++){ if(JUMPS[i].t1<=p) prev=JUMPS[i].t1; if(JUMPS[i].t0>p && next===null) next=JUMPS[i]; }
      y= prev===null ? JUMPS[0].y0 : (prev===JUMPS[0].t1 ? JUMPS[0].y1 : JUMPS[1].y1);
      pose=runWithLanding(p, prev);
      var nextT= next ? next.t0 : P_DIVE0;
      /* appel : on se ramasse juste avant de sauter */
      var a=smooth((p-(nextT-0.075))/0.075);
      if(a>0) pose=mix(pose, POSE_PRE, a);
    }
    return {x:x, y:y, pose:pose, air:air};
  }

  /* pans du manteau : chaînes simulées une fois pour toute la trajectoire */
  var TAIL_N=8, TAIL_SEG=[12.5,10.5], TAIL_DT=1/240, TAIL_STEP=1/120, TAIL_P0=-0.5, TAIL_P1=P_DIVE1+0.05;
  var TAIL_SAMPLES=[];
  (function(){
    var tails=[0,1].map(function(i){
      var pts=[]; for(var j=0;j<TAIL_N;j++) pts.push({x:-j*TAIL_SEG[i]*CK, y:0, px:-j*TAIL_SEG[i]*CK, py:0});
      return pts;
    });
    var first=true, nextSample=TAIL_P0;
    for(var p=TAIL_P0; p<=TAIL_P1+1e-9; p+=TAIL_DT){
      var ch=charAt(p), roots=tailRoots(ch.pose);
      tails.forEach(function(pts, i){
        var rx=ch.x+roots[i].x*CK, ry=ch.y+roots[i].y*CK;
        if(first){ pts.forEach(function(q,j){ q.x=q.px=rx-j*TAIL_SEG[i]*CK; q.y=q.py=ry+j*2; }); }
        pts[0].x=pts[0].px=rx; pts[0].y=pts[0].py=ry;
        for(var j=1;j<TAIL_N;j++){
          /* forte traînée de l'air : le tissu suit le vent relatif, la gravité le fait retomber */
          var q=pts[j], vx=(q.x-q.px)*0.86, vy=(q.y-q.py)*0.86;
          q.px=q.x; q.py=q.y;
          var flutter=Math.sin(p*46+j*0.95+i*2.1)*9000*(j/TAIL_N);
          q.x+=vx; q.y+=vy+(11000*CK+flutter)*TAIL_DT*TAIL_DT;
        }
        for(var it=0;it<4;it++){
          for(j=1;j<TAIL_N;j++){
            var a=pts[j-1], b=pts[j], dx=b.x-a.x, dy=b.y-a.y, d=Math.hypot(dx,dy)||1e-6, L=TAIL_SEG[i]*CK*(1-0.04*j);
            b.x=a.x+dx/d*L; b.y=a.y+dy/d*L;
          }
        }
      });
      first=false;
      if(p>=nextSample-1e-9){
        TAIL_SAMPLES.push(tails.map(function(pts){ return pts.map(function(q){ return {x:(q.x-ch.x)/CK, y:(q.y-ch.y)/CK}; }); }));
        nextSample+=TAIL_STEP;
      }
    }
  })();
  function tailsAt(p){
    var f=(clamp01((p-TAIL_P0)/(TAIL_P1-TAIL_P0)))*(TAIL_SAMPLES.length-1);
    var i=Math.floor(f), u=f-i, A=TAIL_SAMPLES[i], B=TAIL_SAMPLES[Math.min(i+1,TAIL_SAMPLES.length-1)];
    return A.map(function(pts,ti){ return pts.map(function(q,j){ return {x:lerp(q.x,B[ti][j].x,u), y:lerp(q.y,B[ti][j].y,u)}; }); });
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
        var gp=p-0.028*i, g=charAt(gp);
        if(!g.air) continue;
        ctx.globalAlpha=0.5-0.1*i;
        drawChar(ctx, g.x-cam.x, g.y-cam.y, CK, g.pose, s, {color:RED_HOT, tails:tailsAt(gp)});
      }
      ctx.globalAlpha=1;
    }
    if(!diving){
      var tl=tailsAt(p);
      drawChar(ctx, ch.x-cam.x-2, ch.y-cam.y-1, CK, ch.pose, s, {color:RED_HOT, widen:5, tails:tl});
      drawChar(ctx, ch.x-cam.x, ch.y-cam.y, CK, ch.pose, s, {tails:tl});
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
    if(diving) drawDive(du, cam, ch, s, p);
  }

  /* il bondit vers la caméra : la silhouette envahit l'écran */
  function drawDive(u, cam, ch, s, p){
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
    var dp=charAt(p).pose, dt=tailsAt(p);
    drawChar(ctx, x, y, k, dp, s, {color:RED_HOT, widen:5, rot:-0.35*e, tails:dt});
    drawChar(ctx, x, y, k, dp, s, {rot:-0.35*e, tails:dt});
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
    var ap=charAt(P_APEX).pose, at=tailsAt(P_APEX);
    drawChar(c, cx, cy, k, ap, time, {color:WHITE, widen:9, tails:at});
    drawChar(c, cx, cy, k, ap, time, {tails:at});
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

  /* ===================== SON =====================
     Tout est synthétisé en direct (Web Audio), aucun fichier à charger :
     lames, impacts, whooshs, pas, réceptions, coup de « SHOWTIME! », montée
     pendant la plongée, tampons des lettres, et une petite boucle basse +
     batterie (140 BPM) qui s'étouffe pendant le ralenti. */
  var AC=window.AudioContext||window.webkitAudioContext;
  var muted=false; try{ muted=localStorage.getItem('crazygames_muted')==='1'; }catch(e){}
  var actx=null, sfxBus=null, musicBus=null, musicFilter=null, exitBus=null, noiseBuf=null, audioT0=0, audioOn=false;
  function audioCreate(){
    if(muted || !AC || debugT) return;
    try{ actx=new AC(); }catch(e){ actx=null; return; }
    var comp=actx.createDynamicsCompressor();
    comp.threshold.value=-16; comp.knee.value=8; comp.ratio.value=5; comp.attack.value=0.003; comp.release.value=0.15;
    var master=actx.createGain(); master.gain.value=0.6;
    master.connect(comp); comp.connect(actx.destination);
    sfxBus=actx.createGain(); sfxBus.connect(master);
    exitBus=actx.createGain(); exitBus.connect(master);
    musicFilter=actx.createBiquadFilter(); musicFilter.type='lowpass'; musicFilter.frequency.value=18000; musicFilter.Q.value=1.2;
    musicBus=actx.createGain(); musicBus.gain.value=0.75;
    musicFilter.connect(musicBus); musicBus.connect(sfxBus);
    var len=Math.floor(actx.sampleRate*1.5);
    noiseBuf=actx.createBuffer(1, len, actx.sampleRate);
    var d=noiseBuf.getChannelData(0); for(var i=0;i<len;i++) d[i]=Math.random()*2-1;
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
    var out=g;
    if(o.lp){
      var f=actx.createBiquadFilter(); f.type='lowpass'; f.Q.value=o.q||1;
      f.frequency.setValueAtTime(o.lp, at);
      if(o.lp1) f.frequency.exponentialRampToValueAtTime(o.lp1, at+dur);
      osc.connect(f); f.connect(g);
    } else osc.connect(g);
    out.connect(o.bus||sfxBus);
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
    slash:function(at, dur, g){ noise(at, dur||0.2, {type:'bandpass', f0:7000, f1:700, q:1.4, gain:g||0.45, attack:0.01}); },
    whoosh:function(at, dur, f0, f1, g, bus){ noise(at, dur, {type:'bandpass', f0:f0, f1:f1, q:1.1, gain:g||0.4, attack:dur*0.55, bus:bus}); },
    thud:function(at, g){ tone(at, 0.42, {f0:95, f1:38, glide:0.2, gain:g||0.9}); noise(at, 0.14, {type:'lowpass', f0:900, gain:0.45*(g||0.9)}); noise(at+0.01, 0.09, {type:'bandpass', f0:2400, q:0.7, gain:0.12}); },
    step:function(at, g){ noise(at, 0.06, {type:'lowpass', f0:1300, gain:g||0.22}); tone(at, 0.05, {f0:150, f1:90, gain:0.12}); },
    stab:function(at, notes, dur, g){
      notes.forEach(function(f){
        [-9, 9].forEach(function(dt){ tone(at, dur, {type:'sawtooth', f0:f, detune:dt, gain:(g||0.09), lp:4200, lp1:600, q:2, attack:0.006}); });
      });
    },
    ting:function(at){ tone(at, 0.35, {f0:2637, gain:0.08}); tone(at+0.04, 0.4, {f0:3520, gain:0.06}); },
    stamp:function(at, i){
      noise(at, 0.07, {type:'bandpass', f0:1100+i*60, q:1, gain:0.42});
      tone(at, 0.1, {f0:130+i*4, f1:62, glide:0.08, gain:0.55});
      noise(at, 0.025, {type:'highpass', f0:3500, gain:0.2});
    },
    riser:function(at, dur){
      noise(at, dur, {type:'bandpass', f0:350, f1:7000, q:2, gain:0.32, attack:dur*0.95});
      tone(at, dur, {type:'sawtooth', f0:110, f1:880, gain:0.08, lp:3000, attack:dur*0.9});
      noise(at, dur, {type:'highpass', f0:6000, gain:0.2, attack:dur*0.98});
    },
    tapeStop:function(at){ tone(at, 0.42, {type:'sawtooth', f0:520, f1:60, gain:0.1, lp:1600}); }
  };
  var BEAT=60/140, E2=82.41, G2=98.0, A2=110.0, B2=123.47, D3=146.83;
  var BASS=[E2,E2,G2,E2,A2,E2,B2,D3];
  /* liste de tous les sons, en temps de l'intro */
  function audioEvents(){
    var ev=[];
    function add(t, fn){ ev.push({t:t, fn:fn}); }
    var M=musicFilter;
    /* ouverture */
    add(0.02, function(a){ SFX.shing(a,0.11); SFX.slash(a,0.18,0.5); });
    add(0.12, function(a){ SFX.kick(a,0.8); noise(a,0.25,{type:'lowpass',f0:600,gain:0.3}); });
    add(0.2, function(a){ SFX.whoosh(a,0.4,300,2500,0.35); });
    /* groove de la ville : 0,30 → arrêt sur image, puis de nouveau jusqu'au titre */
    function groove(t0, t1){
      for(var i=0, t=t0; t<t1-0.01; i++, t=t0+i*BEAT/2){
        (function(i,t){
          add(t, function(a){
            SFX.hat(a, i%2?0.07:0.12, M);
            if(i%4===0) SFX.kick(a, 0.85, M);
            if(i%4===2) SFX.snare(a, M);
            if(i%8===7) SFX.kick(a, 0.5, M);
            SFX.bass(a, BASS[i%8], M);
          });
        })(i,t);
      }
    }
    groove(0.30, F0);
    groove(F1, T_TITLE);
    /* ralenti : la musique s'étouffe, puis coupure nette sur l'arrêt sur image */
    add(P_SLOW, function(a){
      M.frequency.setValueAtTime(18000, a); M.frequency.exponentialRampToValueAtTime(380, a+(F0-P_SLOW));
      SFX.tapeStop(a);
    });
    add(F0, function(a){
      musicBus.gain.setValueAtTime(0.75, a); musicBus.gain.linearRampToValueAtTime(0.0001, a+0.03);
      SFX.kick(a,1); SFX.crash(a,0.38); SFX.stab(a,[110,220,261.6,329.6,392],0.7,0.075);
      tone(a, 0.7, {f0:55, f1:40, gain:0.5});
    });
    add(F0+0.12, function(a){ SFX.ting(a); });
    add(F1, function(a){
      musicBus.gain.setValueAtTime(0.75, a); M.frequency.setValueAtTime(18000, a);
      SFX.shing(a,0.1); SFX.slash(a,0.22,0.5);
    });
    /* pas et sauts (temps « du personnage » ramené au temps de l'intro) */
    [[0,0.35],[0.72,1.05],[1.80,P_DIVE0]].forEach(function(seg2){
      for(var k=0;k<20;k++){
        [k/CAD, (k+0.5)/CAD].forEach(function(p, j){
          if(p>=seg2[0]+0.02 && p<seg2[1]-0.02) add(unwarp(p), function(a){ SFX.step(a, j?0.18:0.24); });
        });
      }
    });
    add(unwarp(0.35), function(a){ SFX.whoosh(a,0.3,500,3500,0.35); });
    add(unwarp(0.72), function(a){ SFX.thud(a,0.75); });
    add(unwarp(1.05), function(a){ SFX.whoosh(a,0.45,300,5000,0.45); SFX.kick(a,0.5); });
    add(unwarp(1.80), function(a){ SFX.thud(a,1); SFX.crash(a,0.12); });
    /* plongée : montée jusqu'au titre */
    add(unwarp(P_DIVE0), function(a){ SFX.whoosh(a,0.25,600,4000,0.4); SFX.riser(a, T_TITLE-unwarp(P_DIVE0)); });
    /* titre */
    add(T_TITLE, function(a){
      SFX.kick(a,1); SFX.crash(a,0.42); tone(a, 0.9, {f0:55, f1:41, gain:0.55});
      SFX.stab(a,[164.8,196,246.9,293.7,370],0.95,0.075);
    });
    add(T_TITLE+0.1, function(a){ SFX.whoosh(a,0.22,800,5000,0.25); });
    LETTERS.forEach(function(L,j){ add(T_TITLE+0.24+j*0.05+0.07, function(a){ SFX.stamp(a,j); }); });
    add(T_TITLE+0.78, function(a){ SFX.whoosh(a,0.25,400,3000,0.35); });
    add(T_TITLE+0.95, function(a){ SFX.shing(a,0.09); });
    for(var i=0, t=T_TITLE+0.24; t<T_EXIT; i++, t=T_TITLE+0.24+i*BEAT/2){
      (function(i,t){ add(t, function(a){ SFX.hat(a, i%2?0.06:0.1); if(i%4===0) SFX.kick(a,0.6); SFX.bass(a, BASS[(i+4)%8]); }); })(i,t);
    }
    return ev;
  }
  var EVENTS=null;
  function audioStart(fromT){
    if(!actx || actx.state!=='running') return;
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
  /* bandes de sortie : un grand balayage */
  function audioExit(){
    if(!audioOn) return;
    var a=actx.currentTime+0.01;
    SFX.whoosh(a, 0.42, 250, 3200, 0.5, exitBus);
    noise(a+0.3, 0.3, {type:'lowpass', f0:500, gain:0.25, bus:exitBus});
  }
  function audioStop(){
    if(!actx) return;
    var a=actx;
    setTimeout(function(){ try{ a.close(); }catch(e){} }, 900);
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

  /* ===================== ÉCRAN « TOUCHE POUR ENTRER » =====================
     Les navigateurs interdisent le son avant un premier geste : si le son est
     bloqué, on attend un toucher (façon écran titre) pour lancer l'intro avec
     le son. Si le son est coupé dans le hub, l'intro démarre directement. */
  function drawGate(time){
    base();
    ctx.fillStyle=BLACK; ctx.fillRect(-10,-10,VW+20,1100);
    sunburst(ctx, VW/2, 470, 24, time*0.12, 'rgba(230,0,18,0.55)');
    ctx.globalAlpha=0.35; ctx.drawImage(halftoneRed,0,0,VW,1080); ctx.globalAlpha=1;
    var mw=Math.min(VW*0.86, 640)*(1+0.02*Math.sin(time*2.4));
    ctx.save(); ctx.translate(0, 8*Math.sin(time*1.7));
    drawMask(ctx, VW/2, 400, mw, WHITE);
    ctx.restore();
    var fs=Math.min(64, VW/11);
    ctx.font=fs+'px '+FONT_DISPLAY;
    var label='▶ TOUCHE POUR ENTRER', tw=ctx.measureText(label).width;
    if(tw>VW*0.8){ fs*=VW*0.8/tw; ctx.font=fs+'px '+FONT_DISPLAY; tw=ctx.measureText(label).width; }
    ctx.save(); ctx.translate(VW/2, 700); ctx.rotate(-0.05);
    var pad=fs*0.6;
    ctx.fillStyle=RED; ctx.fillRect(-tw/2-pad+10, -fs*0.75+10, tw+pad*2, fs*1.5);
    ctx.fillStyle=BLACK; ctx.fillRect(-tw/2-pad, -fs*0.75, tw+pad*2, fs*1.5);
    ctx.strokeStyle=WHITE; ctx.lineWidth=5; ctx.strokeRect(-tw/2-pad+6, -fs*0.75+6, tw+pad*2-12, fs*1.5-12);
    ctx.globalAlpha=0.6+0.4*Math.sin(time*5);
    ctx.fillStyle=WHITE; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(label, 0, fs*0.05);
    ctx.restore(); ctx.globalAlpha=1;
    ctx.font=Math.round(fs*0.5)+'px '+FONT_DISPLAY; ctx.fillStyle='#bbb'; ctx.textAlign='center';
    ctx.fillText('🔊 AVEC LE SON', VW/2, 700+fs*1.35);
    drawVignette();
  }

  /* ===================== BOUCLE ===================== */
  var start=0, offset=0, raf=0, done=false, exiting=false, begun=false, gateOn=false, gateStart=0;
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
    if(t>=T_EXIT && !exiting){ exiting=true; overlay.classList.add('exiting'); audioExit(); }
    if(t>=TOTAL){ finish(); return; }
    render(t);
    raf=requestAnimationFrame(frame);
  }
  function gateFrame(now){
    if(!gateOn) return;
    if(!gateStart) gateStart=now;
    drawGate((now-gateStart)/1000);
    raf=requestAnimationFrame(gateFrame);
  }
  function begin(){
    if(begun || done) return;
    begun=true; gateOn=false;
    cancelAnimationFrame(raf);
    overlay.classList.remove('gate');
    if(actx && actx.state==='running') audioStart(0);
    start=performance.now()+(audioOn?50:0);
    raf=requestAnimationFrame(frame);
  }
  function showGate(){
    if(begun || done) return;
    gateOn=true; overlay.classList.add('gate');
    raf=requestAnimationFrame(gateFrame);
  }
  function gateEnter(){
    if(!gateOn) return;
    gateOn=false;
    /* dans le geste : on débloque le son, puis on lance (même si le son refuse) */
    try{ actx.resume().then(begin, begin); }catch(e){ begin(); }
    setTimeout(begin, 400);
  }
  /* passer : on saute directement aux bandes de sortie */
  function skip(){
    if(done || exiting) return;
    if(!begun){ finish(); return; }
    offset+=T_EXIT-introTime(performance.now());
    audioSkip();
  }
  function onKey(e){
    if(e.key!=='Escape' && e.key!==' ' && e.key!=='Enter') return;
    e.preventDefault();
    if(gateOn && e.key!=='Escape') gateEnter(); else skip();
  }

  resize();
  window.addEventListener('resize', resize);
  if(debugT){
    var dt=parseFloat(debugT);
    if(dt>=T_EXIT) overlay.classList.add('exiting');
    render(dt);
    window.CG_INTRO_DEBUG={drawChar:drawChar, charAt:charAt, tailsAt:tailsAt, poseRun:poseRun, drawGate:drawGate};
    window.CG_INTRO_RENDER=function(t){ overlay.classList.toggle('exiting', t>=T_EXIT); render(t); };
    return;
  }
  document.documentElement.classList.add('intro-playing');
  overlay.addEventListener('pointerdown', function(){ if(gateOn) gateEnter(); else skip(); });
  document.getElementById('introSkip').addEventListener('pointerdown', function(e){ e.stopPropagation(); if(gateOn){ gateOn=false; finish(); } else skip(); });
  document.addEventListener('keydown', onKey);
  audioCreate();
  if(!actx) begin();
  else if(/[?&]introgate=1/.test(location.search)) showGate();
  else {
    /* le son est-il autorisé sans geste ? sinon, écran « touche pour entrer » */
    var decided=false;
    /* si le son se débloque pendant l'écran d'entrée, on lance tout seul */
    actx.onstatechange=function(){ if(gateOn && actx.state==='running'){ gateOn=false; begin(); } };
    try{ actx.resume().then(function(){ if(!decided && actx.state==='running'){ decided=true; begin(); } }, function(){}); }catch(e){}
    setTimeout(function(){ if(!decided){ decided=true; if(actx.state==='running') begin(); else showGate(); } }, 350);
  }
})();
