/* CRAZY GAMES — intro 3D d'environ 7 secondes (Three.js, js/vendor/three.min.js).
   Vue à la première personne : course sur les toits d'une ville néon rouge,
   sauts par-dessus l'avenue, puis salto arrière depuis une tour (la ville passe
   à l'envers, comme dans Spider-Verse) ; une grande bande rouge fait la
   transition vers le titre en lettres découpées, et des bandes diagonales
   dévoilent le hub.

   - La bibliothèque 3D n'est chargée que si l'intro doit passer. Si elle n'est
     pas prête au bout de 2,5 s (réseau lent) ou si l'appareil n'a pas de 3D,
     on va directement au hub.
   - Toute la trajectoire de la caméra est calculée d'avance puis lissée
     (position, regard, roulis, champ de vue) : aucun à-coup aux sauts.
   - On peut passer l'intro (bouton « Passer », Échap). Toucher l'écran active
     le son s'il est encore bloqué. Pas d'intro quand on arrive par un lien
     d'invitation (#jeu?room=...) ni si l'utilisateur préfère réduire les
     animations ; dans l'app installée, une seule fois par jour.
   - ?introt=1.5 fige l'image à 1,5 s (mise au point). */
(function(){
  'use strict';
  var overlay=document.getElementById('introOverlay');
  if(!overlay) return;
  var reduce=window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var debugT=(/[?&]introt=([0-9.]+)/.exec(location.search)||[])[1];
  var AU=window.CGAudio||null;
  var isApp=(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone===true;
  var today=new Date(), dayKey=today.getFullYear()+'-'+(today.getMonth()+1)+'-'+today.getDate(), seenToday=false;
  if(isApp){ try{ seenToday=localStorage.getItem('cg_intro_day')===dayKey; }catch(e){} }
  function abort(){
    if(overlay.parentNode) overlay.parentNode.removeChild(overlay);
    document.documentElement.classList.remove('intro-playing');
    if(AU) AU.allowMusic(true);
    try{ window.dispatchEvent(new Event('cg-intro-done')); }catch(e){}
  }
  if(!debugT && (window.CG_NO_INTRO || /room=/.test(location.hash) || reduce || seenToday)){ abort(); return; }
  function hasWebGL(){
    try{ var c=document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl')||c.getContext('experimental-webgl'))); }catch(e){ return false; }
  }
  if(!hasWebGL()){ abort(); return; }

  /* écran noir pendant le chargement de la 3D ; trop long = pas d'intro */
  document.documentElement.classList.add('intro-playing');
  var LOAD_LIMIT=2500, gaveUp=false;
  var limit=setTimeout(function(){ gaveUp=true; if(typeof THREE==='undefined') abort(); }, LOAD_LIMIT);
  function ready(){
    clearTimeout(limit);
    if(gaveUp && !debugT) return;
    if(typeof THREE==='undefined'){ abort(); return; }
    if(isApp){ try{ localStorage.setItem('cg_intro_day', dayKey); }catch(e){} }
    try{ start(); }catch(e){ abort(); }
  }
  if(typeof THREE!=='undefined') ready();
  else {
    var sc=document.createElement('script');
    sc.src='js/vendor/three.min.js?v=1';
    sc.onload=ready; sc.onerror=function(){ clearTimeout(limit); abort(); };
    document.head.appendChild(sc);
  }

  function start(){
  /* ===================== OUTILS ===================== */
  var TAU=Math.PI*2;
  function clamp01(u){ return u<0?0:(u>1?1:u); }
  function lerp(a,b,u){ return a+(b-a)*u; }
  function seg(t,a,b){ return clamp01((t-a)/(b-a)); }
  function smooth(u){ u=clamp01(u); return u*u*(3-2*u); }
  function easeOutCubic(u){ u=clamp01(u); return 1-Math.pow(1-u,3); }
  function easeInCubic(u){ u=clamp01(u); return u*u*u; }
  function easeInOutCubic(u){ u=clamp01(u); return u<0.5?4*u*u*u:1-Math.pow(-2*u+2,3)/2; }
  function easeOutBack(u){ u=clamp01(u); var c1=2.2,c3=c1+1; return 1+c3*Math.pow(u-1,3)+c1*Math.pow(u-1,2); }
  function rng(seed){ return function(){ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; }; }
  var RED='#E60012', RED_HOT='#ff1a3a', YELLOW='#FFE600', BLACK='#050505', WHITE='#ffffff';
  var FONT='"Bebas Neue", Impact, "Arial Black", sans-serif';
  var RANSOM=['"Bebas Neue", Impact, sans-serif','"Permanent Marker", "Comic Sans MS", cursive','Georgia, "Times New Roman", serif','"Oswald", "Arial Black", sans-serif','Impact, "Arial Black", sans-serif'];

  /* ===================== CHRONOLOGIE =====================
     Vue à la première personne : course sur les toits, sauts par-dessus
     l'avenue et les rues transversales, puis un saut arrière depuis une tour
     (salto complet, la ville passe à l'envers) avant le titre. */
  var EYE=3.2, VRUN=135, H_JUMP=13, GRAV=70;
  /* toits du parcours : côté de l'avenue, étendue, hauteur */
  var ROUTE=[
    {side: 1, z1: 92,  z0:-34,  h:64},
    {side:-1, z1:-62,  z0:-152, h:58},
    {side: 1, z1:-176, z0:-262, h:86},
    {side:-1, z1:-294, z0:-380, h:120, tower:true}
  ];
  function eye(x,ri,z){ return new THREE.Vector3(x, ROUTE[ri].h+EYE, z); }
  var WAY=[
    ['run',  eye(32,0,40),   eye(24,0,-24)],
    ['jump', eye(24,0,-24),  eye(-24,1,-76)],
    ['run',  eye(-24,1,-76), eye(-24,1,-138)],
    ['jump', eye(-24,1,-138),eye(24,2,-190)],
    ['run',  eye(24,2,-190), eye(24,2,-254)],
    ['jump', eye(24,2,-254), eye(-26,3,-308)],
    ['run',  eye(-26,3,-308),eye(-30,3,-376)],
    ['flip', eye(-30,3,-376), null]
  ];
  var SEGS=[], T_FLY=0;
  WAY.forEach(function(w){
    var sg={type:w[0], a:w[1], b:w[2], t0:T_FLY};
    if(sg.type==='run') sg.dur=Math.max(0.36, sg.a.distanceTo(sg.b)/VRUN);
    else if(sg.type==='jump') sg.dur=0.55+Math.max(0, sg.b.y-sg.a.y)*0.004;
    else sg.dur=1.75;
    T_FLY+=sg.dur; SEGS.push(sg);
  });
  var FLIP=SEGS[SEGS.length-1], FLIP_V=new THREE.Vector3(16, 21, -34), FLIP_ROT=1.45;
  var T_BAND=T_FLY-0.42, T_TITLE=T_FLY, T_EXIT=T_TITLE+1.55, TOTAL=T_EXIT+0.45, LT0=0.3;

  function segAt(t){
    for(var i=0;i<SEGS.length;i++){ var s=SEGS[i]; if(t<s.t0+s.dur || i===SEGS.length-1) return {s:s, i:i, tau:clamp01((t-s.t0)/s.dur), dt:t-s.t0}; }
  }
  /* position de l'œil (sans le balancement de la course) */
  function bodyPos(t){
    t=Math.max(0, Math.min(t, T_FLY));
    var w=segAt(t), s=w.s, u=w.tau, p=new THREE.Vector3();
    if(s.type==='run'){ p.lerpVectors(s.a, s.b, u); }
    else if(s.type==='jump'){
      /* départ explosif, temps suspendu au sommet, accélération vers la réception */
      var k=0.38; u=u+k/TAU*Math.sin(TAU*u);
      p.lerpVectors(s.a, s.b, u); p.y+=4*H_JUMP*u*(1-u);
    }
    else { var d=w.dt; p.copy(s.a).addScaledVector(FLIP_V, d); p.y-=0.5*GRAV*d*d; }
    return {p:p, w:w};
  }
  /* dernier atterrissage : depuis combien de temps */
  function sinceLanding(t){
    var best=9;
    SEGS.forEach(function(s){ if(s.type==='jump'){ var e=s.t0+s.dur; if(t>=e) best=Math.min(best, t-e); } });
    return best;
  }
  /* ===================== CALQUES ===================== */
  var fxC=document.getElementById('introCanvas'), fx=fxC.getContext('2d');
  var glC=document.getElementById('introGL');
  var renderer=new THREE.WebGLRenderer({canvas:glC, antialias:true, alpha:true});
  renderer.setClearColor(0x000000, 0);
  var scene=new THREE.Scene();
  var FOG=0x3a0010;
  scene.fog=new THREE.Fog(FOG, 90, 760);
  var camera=new THREE.PerspectiveCamera(70, 1, 0.5, 3000);
  var W=1,H=1,DPR=1,S=1,VW=1920, halftoneRed=null, halftoneBlack=null;

  function newCanvas(wu,hu){
    var px=S*DPR, c=document.createElement('canvas');
    c.width=Math.max(1,Math.ceil(wu*px)); c.height=Math.max(1,Math.ceil(hu*px));
    var x=c.getContext('2d'); x.setTransform(px,0,0,px,0,0); return {c:c,x:x};
  }
  function makeHalftone(color){
    var o=newCanvas(VW,1080), x=o.x, step=16; x.fillStyle=color;
    for(var py=0;py<1080+step;py+=step) for(var px=0;px<VW+step;px+=step){
      var ox=px+((py/step)%2?step/2:0);
      var d1=Math.hypot(ox/VW,(1080-py)/1080), d2=Math.hypot((VW-ox)/VW,py/1080);
      var r=Math.max(0,0.62-Math.min(d1,d2))*15;
      if(r>0.6){ x.beginPath(); x.arc(ox,py,r,0,TAU); x.fill(); }
    }
    return o.c;
  }
  function resize(){
    W=window.innerWidth; H=window.innerHeight; DPR=Math.min(window.devicePixelRatio||1, 2);
    fxC.width=Math.round(W*DPR); fxC.height=Math.round(H*DPR); fxC.style.width=W+'px'; fxC.style.height=H+'px';
    renderer.setPixelRatio(Math.min(DPR,1.75)); renderer.setSize(W,H);
    camera.aspect=W/H; camera.updateProjectionMatrix();
    S=H/1080; VW=W/S;
    halftoneRed=makeHalftone('rgba(255,26,58,1)'); halftoneBlack=makeHalftone('rgba(0,0,0,1)');
  }

  /* ===================== LA VILLE 3D =====================
     Tous les immeubles sont fusionnés en une seule géométrie (un seul dessin),
     leurs arêtes en un seul jeu de lignes rouges : léger, même sur téléphone. */
  function windowTexture(seed){
    var c=document.createElement('canvas'); c.width=c.height=512; var x=c.getContext('2d'), r=rng(seed);
    x.fillStyle='#08030a'; x.fillRect(0,0,512,512);
    /* bandeaux d'étage et montants : la façade se lit comme un immeuble, pas comme des confettis */
    for(var fy=0;fy<16;fy++){ x.fillStyle='#14070e'; x.fillRect(0,fy*32+27,512,3); }
    for(var fx2=0;fx2<16;fx2+=4){ x.fillStyle='#0f050b'; x.fillRect(fx2*32,0,4,512); }
    var lit=['#ffd46b','#ffd46b','#ffd46b','#fff3c4','#fff3c4','#ffb37a','#7fe8ff','#ff8aa0'];
    for(var gy=0;gy<16;gy++){
      /* des étages entiers allumés ou éteints, par blocs */
      var floorOn=r()<0.5;
      for(var gx=0;gx<16;gx++){
        var v=r(), px=gx*32, py=gy*32;
        if(v<(floorOn?0.42:0.1)){ x.fillStyle=lit[Math.floor(r()*lit.length)]; x.globalAlpha=0.45+r()*0.45; }
        else { x.fillStyle='#1a0b13'; x.globalAlpha=1; }
        x.fillRect(px+10,py+8,12,16); x.globalAlpha=1;
      }
    }
    /* coin sombre réservé aux toits */
    x.fillStyle='#24101a'; x.fillRect(0,0,6,4);
    var t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping;
    t.anisotropy=renderer.capabilities.getMaxAnisotropy(); return t;
  }
  var BOXES=[];
  (function(){
    var r=rng(77);
    [-1,1].forEach(function(side){
      /* rangée sur l'avenue */
      var z=70, n=0;
      while(z>-1300){
        var d=22+r()*34, h=55+Math.pow(r(),1.4)*190, w=26+r()*30;
        BOXES.push({x0:side>0?20:-20-w, x1:side>0?20+w:-20, z1:z, z0:z-d, h:h, side:side, row:0});
        z-=d+2+r()*4; n++;
        if(n%4===0) z-=26;     /* rue transversale */
      }
      /* deuxième rangée, plus haute */
      z=40;
      while(z>-1500){
        var d2=30+r()*50, h2=90+Math.pow(r(),1.2)*260, x0=62+r()*20, w2=30+r()*40;
        BOXES.push({x0:side>0?x0:-x0-w2, x1:side>0?x0+w2:-x0, z1:z, z0:z-d2, h:h2, row:1});
        z-=d2+8+r()*20;
      }
    });
    /* horizon : grandes tours lointaines */
    for(var i=0;i<170;i++){
      var ax=(r()<0.5?-1:1)*(140+r()*700), az=-200-r()*2400, aw=40+r()*90, ad=40+r()*90;
      if(Math.abs(ax)<160 && az>-1400) continue;
      BOXES.push({x0:ax, x1:ax+aw, z1:az, z0:az-ad, h:120+Math.pow(r(),1.3)*420, row:2});
    }
    for(i=0;i<60;i++){
      var bx=-160+r()*320, bz=-1450-r()*1200, bw=40+r()*80;
      BOXES.push({x0:bx, x1:bx+bw, z1:bz, z0:bz-50-r()*80, h:140+Math.pow(r(),1.2)*380, row:2});
    }
    /* les toits du parcours remplacent les immeubles de la rangée sur l'avenue */
    function clear(side, zTop, zBot){
      for(var k=BOXES.length-1;k>=0;k--){ var b=BOXES[k];
        if(b.row===0 && b.side===side && b.z0<zTop && b.z1>zBot) BOXES.splice(k,1); }
    }
    ROUTE.forEach(function(R){ clear(R.side, R.z1+4, R.z0-4); });
    /* autour du parcours, les toits voisins restent plus bas : on voit le ciel et la lune */
    BOXES.forEach(function(b){
      var zc=(b.z0+b.z1)/2;
      if(zc>-460 && zc<110){
        var near=ROUTE.reduce(function(m,R){ var dz=Math.max(0, R.z0-zc, zc-R.z1); return dz<m.dz?{dz:dz,h:R.h}:m; }, {dz:1e9,h:60});
        if(b.row===0) b.h=Math.min(b.h, near.h*(0.55+0.4*((Math.abs(b.x0*7+b.z0*3)%10)/10)));
        if(b.row===1) b.h=Math.min(b.h, near.h+18+((Math.abs(b.x0*5+b.z1)%10)*6));
      }
      /* les tours lointaines au centre restent sous la lune */
      if(b.row===2) b.h=Math.min(b.h, 150+Math.min(1, Math.abs((b.x0+b.x1)/2)/600)*320);
    });
    clear(-1, -376, -520);      /* le vide sous le saut final */
    ROUTE.forEach(function(R, i){
      var w=R.tower?40:32;
      BOXES.push({x0:R.side>0?20:-20-w, x1:R.side>0?20+w:-20, z1:R.z1, z0:R.z0, h:R.h, side:R.side, row:0});
      /* équipements de toit qui défilent tout près */
      var rr=rng(500+i), runX=R.side*28;
      for(var k=0;k<4;k++){
        var zz=lerp(R.z1-10, R.z0+14, (k+0.5)/4), side2=(k%2?1:-1), bw=4+rr()*4;
        var cx=runX+side2*(9+rr()*4);
        if(Math.abs(cx)<21 || Math.abs(cx)>20+w-2) cx=runX-side2*(9+rr()*3);
        BOXES.push({x0:cx-bw/2, x1:cx+bw/2, z1:zz+3, z0:zz-3, yb:R.h, h:R.h+2.5+rr()*3, row:3});
      }
      if(i===0) BOXES.push({x0:42, x1:48, z1:20, z0:14, yb:R.h, h:R.h+12, row:3});
    });
  })();
  function buildCity(){
    var TILE=36, pos=[], uv=[], idx=[], edges=[], r=rng(5);
    BOXES.forEach(function(b){
      var ox=r(), oy=r(), y1=b.h, yb=b.yb||0;
      function quad(p, uvs){
        var base=pos.length/3;
        p.forEach(function(v){ pos.push(v[0],v[1],v[2]); });
        uvs.forEach(function(v){ uv.push(v[0],v[1]); });
        idx.push(base,base+1,base+2, base,base+2,base+3);
      }
      var X0=b.x0,X1=b.x1,Z0=b.z0,Z1=b.z1, wx=(X1-X0)/TILE, wz=(Z1-Z0)/TILE, hy=(y1-yb)/TILE;
      if(b.row===3){ var dd=0.004; ox=dd; oy=dd; wx=wz=hy=0; }   /* équipements de toit : sans fenêtres */
      quad([[X0,yb,Z1],[X1,yb,Z1],[X1,y1,Z1],[X0,y1,Z1]], [[ox,oy],[ox+wx,oy],[ox+wx,oy+hy],[ox,oy+hy]]);   /* face +z */
      quad([[X1,yb,Z0],[X0,yb,Z0],[X0,y1,Z0],[X1,y1,Z0]], [[ox,oy],[ox+wx,oy],[ox+wx,oy+hy],[ox,oy+hy]]);   /* face -z */
      quad([[X1,yb,Z1],[X1,yb,Z0],[X1,y1,Z0],[X1,y1,Z1]], [[ox,oy],[ox+wz,oy],[ox+wz,oy+hy],[ox,oy+hy]]);   /* face +x */
      quad([[X0,yb,Z0],[X0,yb,Z1],[X0,y1,Z1],[X0,y1,Z0]], [[ox,oy],[ox+wz,oy],[ox+wz,oy+hy],[ox,oy+hy]]);   /* face -x */
      var d=0.004; quad([[X0,y1,Z1],[X1,y1,Z1],[X1,y1,Z0],[X0,y1,Z0]], [[d,d],[d,d],[d,d],[d,d]]);         /* toit */
      /* arêtes : verticales + contour du toit (+ rebord) */
      var C=[[X0,Z0],[X1,Z0],[X1,Z1],[X0,Z1]];
      for(var k=0;k<4;k++){
        var a=C[k], c=C[(k+1)%4];
        edges.push(a[0],yb,a[1], a[0],y1,a[1]);
        edges.push(a[0],y1,a[1], c[0],y1,c[1]);
        if(b.row!==3) edges.push(a[0],y1-2.2,a[1], c[0],y1-2.2,c[1]);
      }
    });
    var g=new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2));
    g.setIndex(idx);
    scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({map:windowTexture(11), fog:true})));
    var eg=new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.Float32BufferAttribute(edges,3));
    scene.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({color:0xff1a3a, fog:true, transparent:true, opacity:0.85})));
  }
  /* enseignes néon verticales sur les façades de l'avenue */
  function neonTexture(text, color){
    var letters=text.split(''), c=document.createElement('canvas'); c.width=96; c.height=letters.length*80+40;
    var x=c.getContext('2d');
    x.fillStyle='#0a0a0a'; x.fillRect(0,0,c.width,c.height);
    x.shadowColor=color; x.shadowBlur=16; x.strokeStyle=color; x.lineWidth=6; x.strokeRect(6,6,c.width-12,c.height-12);
    x.fillStyle=color; x.font='64px '+FONT; x.textAlign='center'; x.textBaseline='middle';
    letters.forEach(function(ch,k){ x.fillText(ch, 48, 50+k*80); });
    return {t:new THREE.CanvasTexture(c), ratio:c.height/c.width};
  }
  function roofTexture(){
    var c=document.createElement('canvas'); c.width=c.height=256; var x=c.getContext('2d');
    x.fillStyle='#1c0b12'; x.fillRect(0,0,256,256);
    x.strokeStyle='#2c1019'; x.lineWidth=6;
    for(var k=-256;k<512;k+=32){ x.beginPath(); x.moveTo(k,0); x.lineTo(k+256,256); x.stroke(); }
    x.fillStyle='rgba(255,26,58,0.18)'; x.fillRect(0,124,256,8);
    var t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.anisotropy=renderer.capabilities.getMaxAnisotropy(); return t;
  }
  function buildRoofs(){
    var tex=roofTexture();
    ROUTE.forEach(function(R){
      var w=R.tower?40:32, d=R.z1-R.z0, x0=R.side>0?20:-20-w;
      var tt=tex.clone(); tt.needsUpdate=true; tt.repeat.set(w/14, d/14);
      var m=new THREE.Mesh(new THREE.PlaneGeometry(w-1, d-1), new THREE.MeshBasicMaterial({map:tt, fog:true}));
      m.rotation.x=-Math.PI/2; m.position.set(x0+w/2, R.h+0.06, (R.z0+R.z1)/2); scene.add(m);
      /* trait blanc peint au bord du toit, côté vide : on voit où sauter */
      var edge=new THREE.Mesh(new THREE.PlaneGeometry(0.5, d-2), new THREE.MeshBasicMaterial({color:0xff6a7a, fog:true, transparent:true, opacity:0.8}));
      edge.rotation.x=-Math.PI/2; edge.position.set(R.side>0?21.5:-21.5, R.h+0.08, (R.z0+R.z1)/2); scene.add(edge);
    });
  }
  function buildDetails(){
    buildRoofs();
    var r=rng(31), words=['BAR','HOTEL','24H','ARCADE','RAMEN','CLUB','KARAOKE','★★★','GAME'], cols=['#ff2a6d','#05d9e8','#ffe600','#ff6ec7','#7cff6e','#ffffff'];
    var k=0;
    BOXES.forEach(function(b){
      if(b.row!==0 || r()>0.45 || b.h<60) return;
      var n=neonTexture(words[k%words.length], cols[Math.floor(r()*cols.length)]); k++;
      var w=4.2, h=w*n.ratio*0.92, m=new THREE.Mesh(new THREE.PlaneGeometry(w,h), new THREE.MeshBasicMaterial({map:n.t, fog:true, side:THREE.DoubleSide}));
      var fx0=b.side>0?b.x0-0.6:b.x1+0.6;
      m.position.set(fx0, Math.min(b.h-h/2-6, 20+r()*40+h/2), lerp(b.z0+4,b.z1-4,r()));
      m.rotation.y=Math.PI/2; scene.add(m);
    });
    /* sol, trottoirs et lampadaires */
    var ground=new THREE.Mesh(new THREE.PlaneGeometry(3000,4000), new THREE.MeshBasicMaterial({color:0x070206, fog:true}));
    ground.rotation.x=-Math.PI/2; ground.position.z=-1200; scene.add(ground);
    [-17,17].forEach(function(x){
      var line=new THREE.Mesh(new THREE.PlaneGeometry(0.6,2600), new THREE.MeshBasicMaterial({color:0xff1a3a, fog:true}));
      line.rotation.x=-Math.PI/2; line.position.set(x,0.05,-1000); scene.add(line);
    });
    var glowC=document.createElement('canvas'); glowC.width=glowC.height=64; var gx=glowC.getContext('2d');
    var gg=gx.createRadialGradient(32,32,0,32,32,32); gg.addColorStop(0,'rgba(255,230,200,1)'); gg.addColorStop(0.3,'rgba(255,120,120,0.6)'); gg.addColorStop(1,'rgba(255,0,40,0)');
    gx.fillStyle=gg; gx.fillRect(0,0,64,64);
    var glowT=new THREE.CanvasTexture(glowC);
    var lampMat=new THREE.SpriteMaterial({map:glowT, blending:THREE.AdditiveBlending, depthWrite:false, fog:true});
    for(var z=40;z>-1300;z-=42){ [-16,16].forEach(function(x){ var sp=new THREE.Sprite(lampMat); sp.position.set(x,9,z); sp.scale.set(9,9,1); scene.add(sp); }); }
    /* feux rouges clignotants au sommet des tours */
    BLINKS.mat=new THREE.SpriteMaterial({map:glowT, color:0xff1a3a, blending:THREE.AdditiveBlending, depthWrite:false, fog:true, transparent:true});
    BOXES.forEach(function(b){ if(b.h>170 && r()<0.5){ var sp=new THREE.Sprite(BLINKS.mat); sp.position.set((b.x0+b.x1)/2, b.h+4, (b.z0+b.z1)/2); sp.scale.set(10,10,1); scene.add(sp); } });
    /* circulation : feux arrière rouges et phares blancs qui filent */
    var carGeo=new THREE.BoxGeometry(0.5,0.5,5);
    [[-6,0xff2040,1],[-3,0xff2040,1],[3,0xfff2d0,-1],[6,0xfff2d0,-1]].forEach(function(l){
      var mat=new THREE.MeshBasicMaterial({color:l[1], fog:true});
      for(var i=0;i<14;i++){ var m=new THREE.Mesh(carGeo, mat); m.position.set(l[0],1,-r()*1400); m.userData={dir:l[2], v:40+r()*30}; CARS.push(m); scene.add(m); }
    });
  }
  var BLINKS={mat:null}, CARS=[];

  /* ===================== RENDU 2D ===================== */
  function base(c){ c.setTransform(DPR*S,0,0,DPR*S,0,0); }
  /* Ciel en 3D (il doit suivre la caméra quand elle se retourne pendant le salto) :
     une sphère en dégradé, la lune et ses rayons en sprites, très loin. */
  var skyDome=null, moonObj=null, raysObj=null, MOON_DIR=new THREE.Vector3(0.05, 0.4, -1).normalize();
  function buildSky(){
    var g=new THREE.SphereGeometry(2800, 32, 24), cols=[], pos=g.attributes.position;
    var stops=[[-1,[0.23,0,0.06]],[-0.02,[0.23,0,0.06]],[0.04,[0.55,0,0.1]],[0.25,[0.17,0,0.06]],[0.6,[0.04,0,0.02]],[1,[0.012,0,0.012]]];
    for(var i=0;i<pos.count;i++){
      var y=pos.getY(i)/2800, c=stops[stops.length-1][1];
      for(var k=0;k<stops.length-1;k++){ if(y>=stops[k][0] && y<=stops[k+1][0]){ var f=(y-stops[k][0])/(stops[k+1][0]-stops[k][0]); c=[0,1,2].map(function(n){ return lerp(stops[k][1][n],stops[k+1][1][n],f); }); break; } }
      cols.push(c[0],c[1],c[2]);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols,3));
    skyDome=new THREE.Mesh(g, new THREE.MeshBasicMaterial({vertexColors:true, side:THREE.BackSide, fog:false, depthWrite:false}));
    skyDome.renderOrder=-10; scene.add(skyDome);
    /* lune */
    var mc=document.createElement('canvas'); mc.width=mc.height=640; var mx=mc.getContext('2d'), R=230, c=320;
    mx.shadowColor='rgba(255,40,60,0.9)'; mx.shadowBlur=70;
    var gr=mx.createRadialGradient(c-60,c-70,20,c,c,R); gr.addColorStop(0,'#fff6ec'); gr.addColorStop(0.55,'#ffd9c9'); gr.addColorStop(1,'#ff6b6b');
    mx.fillStyle=gr; mx.beginPath(); mx.arc(c,c,R,0,TAU); mx.fill(); mx.shadowBlur=0;
    mx.save(); mx.beginPath(); mx.arc(c,c,R,0,TAU); mx.clip(); mx.fillStyle='rgba(200,0,30,0.55)';
    for(var py=c-R;py<c+R;py+=12) for(var px=c-R;px<c+R;px+=12){ var kk=(py-(c-R*0.2))/(R*1.2), rr=Math.max(0,kk)*5.2; if(rr>0.4){ mx.beginPath(); mx.arc(px+((py/12)%2?6:0),py,rr,0,TAU); mx.fill(); } }
    mx.restore();
    moonObj=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(mc), fog:false, depthWrite:false, transparent:true}));
    moonObj.renderOrder=-8; moonObj.scale.set(900,900,1); scene.add(moonObj);
    /* rayons derrière la lune */
    var rc=document.createElement('canvas'); rc.width=rc.height=1024; var rx=rc.getContext('2d');
    rx.translate(512,512); rx.fillStyle='rgba(255,40,70,1)';
    for(var n=0;n<20;n++){ var a0=n*TAU/20, a1=a0+TAU/40; rx.beginPath(); rx.moveTo(0,0); rx.lineTo(Math.cos(a0)*512,Math.sin(a0)*512); rx.lineTo(Math.cos(a1)*512,Math.sin(a1)*512); rx.closePath(); rx.fill(); }
    var fade=rx.createRadialGradient(0,0,60,0,0,512); fade.addColorStop(0,'rgba(0,0,0,0)'); fade.addColorStop(1,'rgba(0,0,0,1)');
    rx.globalCompositeOperation='destination-out'; rx.fillStyle=fade; rx.fillRect(-512,-512,1024,1024);
    raysObj=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(rc), fog:false, depthWrite:false, transparent:true, opacity:0}));
    raysObj.renderOrder=-9; raysObj.scale.set(5200,5200,1); scene.add(raysObj);
  }
  function drawSky(t){
    skyDome.position.copy(camera.position);
    moonObj.position.copy(camera.position).addScaledVector(MOON_DIR, 2600);
    raysObj.position.copy(camera.position).addScaledVector(MOON_DIR, 2650);
    var k=1+0.3*seg(t, FLIP.t0, T_FLY); moonObj.scale.set(900*k,900*k,1);
    raysObj.material.opacity=0.5*smooth(seg(t, FLIP.t0-0.6, FLIP.t0+0.4));
    raysObj.material.rotation=t*0.35;
  }
  function sunburst(c, cx, cy, rays, rot, col){
    var R=Math.hypot(VW,1080)*1.6; c.fillStyle=col;
    for(var i=0;i<rays;i++){ var a0=rot+i*TAU/rays, a1=a0+TAU/rays*0.5;
      c.beginPath(); c.moveTo(cx,cy); c.lineTo(cx+Math.cos(a0)*R, cy+Math.sin(a0)*R); c.lineTo(cx+Math.cos(a1)*R, cy+Math.sin(a1)*R); c.closePath(); c.fill(); }
  }
  function star4(c,x,y,r,w){ c.beginPath(); c.moveTo(x,y-r); c.lineTo(x+w,y-w); c.lineTo(x+r,y); c.lineTo(x+w,y+w); c.lineTo(x,y+r); c.lineTo(x-w,y+w); c.lineTo(x-r,y); c.lineTo(x-w,y-w); c.closePath(); c.fill(); }
  var LINES=[]; (function(){ var r=rng(3); for(var i=0;i<46;i++) LINES.push({a:r()*TAU, o:r(), len:0.2+r()*0.35, sp:1.6+r()*1.6}); })();
  function drawSpeed(t, power){
    if(power<=0.02) return;
    var cx=VW/2, cy=540, R=Math.hypot(VW,1080)*0.62;
    fx.strokeStyle=WHITE;
    LINES.forEach(function(l){
      var ph=(t*l.sp+l.o)%1, r0=R*(0.35+ph*0.75), r1=r0+R*l.len*power;
      fx.globalAlpha=0.35*power*(1-ph); fx.lineWidth=2+3*(1-ph);
      fx.beginPath(); fx.moveTo(cx+Math.cos(l.a)*r0, cy+Math.sin(l.a)*r0); fx.lineTo(cx+Math.cos(l.a)*r1, cy+Math.sin(l.a)*r1); fx.stroke();
    });
    fx.globalAlpha=1;
  }
  function drawVignette(){
    var g=fx.createRadialGradient(VW/2,540,200,VW/2,540,Math.max(VW,1080)*0.75);
    g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,'rgba(0,0,0,0.7)'); fx.fillStyle=g; fx.fillRect(0,0,VW,1080);
  }
  function halfPlane(c,cx,cy,ang,side,off){
    var L=4000, dx=Math.cos(ang), dy=Math.sin(ang), nx=-dy*side, ny=dx*side, ox=cx+nx*off, oy=cy+ny*off;
    c.beginPath(); c.moveTo(ox-dx*L,oy-dy*L); c.lineTo(ox+dx*L,oy+dy*L); c.lineTo(ox+dx*L+nx*L,oy+dy*L+ny*L); c.lineTo(ox-dx*L+nx*L,oy-dy*L+ny*L); c.closePath();
  }
  var CUT=-0.42;
  function drawOpening(t){
    var cx=VW/2, cy=540, open=easeInOutCubic(seg(t,0.18,0.62))*1400;
    [-1,1].forEach(function(side){
      halfPlane(fx,cx,cy,CUT,side,open); fx.fillStyle=BLACK; fx.fill();
      if(open>0){ halfPlane(fx,cx,cy,CUT,side,open); fx.save(); fx.clip(); halfPlane(fx,cx,cy,CUT,-side,-open-22); fx.fillStyle=RED; fx.fill(); fx.restore(); }
    });
    if(t<0.3){ var u=easeOutCubic(t/0.18), L=Math.hypot(VW,1080); fx.save(); fx.translate(cx,cy); fx.rotate(CUT); fx.globalAlpha=1-seg(t,0.18,0.3); fx.fillStyle=WHITE; fx.fillRect(-L/2,-3,L*u,6); fx.restore(); fx.globalAlpha=1; }
  }
  var BAND_ANG=-0.3;
  function drawBigBand(v, mode, time){
    var D=Math.hypot(VW,1080), w, off;
    if(mode==='in'){ w=lerp(300,2.4*D,easeInCubic(v)); off=lerp(0.85*D,0,easeOutCubic(v)); }
    else { w=lerp(2.4*D,90,easeOutCubic(Math.min(1,v*1.25))); off=lerp(0,-1.05*D,easeInCubic(v)); }
    var nx=-Math.sin(BAND_ANG), ny=Math.cos(BAND_ANG);
    fx.save(); fx.translate(VW/2+nx*off, 540+ny*off); fx.rotate(BAND_ANG);
    var L=D*1.6;
    fx.fillStyle=BLACK; fx.fillRect(-L,-w/2-46,2*L,w+92);
    fx.fillStyle=WHITE; fx.fillRect(-L,-w/2-30,2*L,10); fx.fillRect(-L,w/2+20,2*L,10);
    fx.fillStyle=RED; fx.fillRect(-L,-w/2,2*L,w);
    fx.save(); fx.beginPath(); fx.rect(-L,-w/2,2*L,w); fx.clip();
    fx.fillStyle=BLACK; fx.fillRect(-L,-w/2+18,2*L,6); fx.fillRect(-L,w/2-24,2*L,6);
    var fs=Math.min(Math.max(w*0.6,60),260), rows=Math.max(1,Math.min(7,Math.ceil(w/(fs*1.15)))), label='CRAZY GAMES ★ ';
    fx.font='italic '+fs+'px '+FONT; fx.textBaseline='middle'; fx.textAlign='left';
    var tw=fx.measureText(label).width||1;
    for(var r=0;r<rows;r++){ var ry=(r-(rows-1)/2)*fs*1.15, dir=r%2?1:-1, sh=((time*1200*dir)%tw+tw)%tw;
      fx.fillStyle=r%2?'rgba(0,0,0,0.9)':'rgba(0,0,0,0.75)'; for(var x=-L-sh;x<L;x+=tw) fx.fillText(label,x,ry+fs*0.04); }
    fx.restore(); fx.restore();
  }
  var LETTERS=[]; (function(){
    var r=rng(1337), words=['CRAZY','GAMES'], styles=[{bg:BLACK,fg:WHITE},{bg:WHITE,fg:BLACK},{bg:RED,fg:WHITE},{bg:WHITE,fg:RED},{bg:BLACK,fg:RED},{bg:YELLOW,fg:BLACK}], last=-1;
    words.forEach(function(w,line){ w.split('').forEach(function(ch){ var st; do{ st=Math.floor(r()*styles.length); }while(st===last); last=st;
      LETTERS.push({ch:ch,line:line,style:styles[st],font:RANSOM[Math.floor(r()*RANSOM.length)],italic:r()<0.3,rot:(r()-0.5)*0.26,size:0.9+r()*0.28,dy:(r()-0.5)*0.16,pad:0.08+r()*0.08}); }); });
  })();
  function starPath(c,cx,cy,R,n,rot){ c.moveTo(cx+Math.cos(rot)*R,cy+Math.sin(rot)*R); for(var i=1;i<=n*2;i++){ var a=rot+i*Math.PI/n, rr=i%2?R*0.55:R; c.lineTo(cx+Math.cos(a)*rr,cy+Math.sin(a)*rr); } c.closePath(); }
  function drawTitle(q, time){
    var shake=0; LETTERS.forEach(function(L,j){ var a=q-(LT0+j*0.05)-0.1; if(a>0&&a<0.12) shake+=(1-a/0.12)*5*Math.sin(a*120+j); });
    fx.save(); fx.translate(shake,shake*0.6);
    fx.fillStyle=RED; fx.fillRect(-20,-20,VW+40,1120);
    sunburst(fx,VW/2,540,24,time*0.22,'rgba(0,0,0,0.9)');
    var sr=Math.min(VW*0.4,460)*(0.92+0.08*easeOutCubic(seg(q,0,0.6)));
    fx.beginPath(); starPath(fx,VW/2,540,sr,5,-Math.PI/2+time*0.15); fx.fillStyle='#ff2a3a'; fx.fill(); fx.strokeStyle=BLACK; fx.lineWidth=10; fx.stroke();
    fx.globalAlpha=0.6; fx.drawImage(halftoneBlack,0,0,VW,1080); fx.globalAlpha=1;
    var bu=easeOutCubic(seg(q,0.04,0.3));
    fx.save(); fx.translate(lerp(-VW*1.3,0,bu),0); fx.fillStyle=BLACK;
    fx.beginPath(); fx.moveTo(-50,420); fx.lineTo(VW+50,350); fx.lineTo(VW+50,700); fx.lineTo(-50,770); fx.closePath(); fx.fill();
    fx.fillStyle=WHITE;
    fx.beginPath(); fx.moveTo(-50,404); fx.lineTo(VW+50,334); fx.lineTo(VW+50,344); fx.lineTo(-50,414); fx.closePath(); fx.fill();
    fx.beginPath(); fx.moveTo(-50,778); fx.lineTo(VW+50,708); fx.lineTo(VW+50,716); fx.lineTo(-50,786); fx.closePath(); fx.fill();
    fx.restore();
    var tu=easeOutCubic(seg(q,0.12,0.36)), tag='LE HUB DE JEUX ENTRE POTES', tfs=40; fx.font=tfs+'px '+FONT;
    var tw=fx.measureText(tag).width; if(tw>VW*0.82){ tfs*=VW*0.82/tw; fx.font=tfs+'px '+FONT; tw=fx.measureText(tag).width; }
    fx.save(); fx.translate(lerp(-tw-200,Math.min(VW*0.06,(VW-tw)/2),tu),170); fx.rotate(-0.06);
    fx.fillStyle=WHITE; fx.fillRect(-14,-tfs*0.75,tw+28,tfs*1.4); fx.fillStyle=BLACK; fx.textBaseline='middle'; fx.textAlign='left'; fx.fillText(tag,0,0); fx.restore();
    var fs=Math.min(190,VW/6.6), lines=[[],[]]; LETTERS.forEach(function(L){ lines[L.line].push(L); });
    lines.forEach(function(arr,line){
      var widths=arr.map(function(L){ fx.font=(L.italic?'italic ':'')+Math.round(fs*L.size)+'px '+L.font; return fx.measureText(L.ch).width+fs*L.pad*2+fs*0.06; });
      var total=widths.reduce(function(a,b){return a+b;},0), gap=fs*1.18, x=VW/2-total/2+(line?fs*0.35:-fs*0.35), y=line?560+gap/2:560-gap/2;
      arr.forEach(function(L,i){
        var j=LETTERS.indexOf(L), t0=LT0+j*0.05, a=seg(q,t0,t0+0.26), w=widths[i], cx=x+w/2; x+=w;
        if(a<=0) return;
        var sc=lerp(2.4,1,easeOutBack(a)), rot=L.rot+(1-easeOutCubic(a))*0.5, bob=Math.sin(time*2.4+j*0.7)*3*seg(q,t0+0.3,t0+0.6);
        fx.save(); fx.translate(cx,y+L.dy*fs+bob); fx.rotate(rot); fx.scale(sc,sc); fx.globalAlpha=clamp01(a*4);
        var size=Math.round(fs*L.size); fx.font=(L.italic?'italic ':'')+size+'px '+L.font;
        var bw=w-fs*0.06, bh=size*1.12;
        fx.fillStyle='rgba(0,0,0,0.6)'; fx.fillRect(-bw/2+8,-bh/2+10,bw,bh);
        fx.fillStyle=L.style.bg; fx.fillRect(-bw/2,-bh/2,bw,bh);
        if(L.style.bg===BLACK){ fx.strokeStyle=WHITE; fx.lineWidth=3; fx.strokeRect(-bw/2+5,-bh/2+5,bw-10,bh-10); }
        fx.fillStyle=L.style.fg; fx.textAlign='center'; fx.textBaseline='middle'; fx.fillText(L.ch,0,size*0.06);
        fx.restore();
      });
    });
    fx.globalAlpha=1;
    var su=easeOutCubic(seg(q,0.86,1.12));
    if(su>0){ var sfs=Math.min(70,VW/11); fx.save(); fx.translate(lerp(VW+900,VW/2+fs*0.6,su),840); fx.rotate(-0.05); fx.font=sfs+'px '+FONT;
      var label='LET’S  PLAY', lw=fx.measureText(label).width;
      fx.fillStyle=BLACK; fx.beginPath(); fx.moveTo(-lw/2-30,-sfs*0.62+10); fx.lineTo(lw/2+70,-sfs*0.7+10); fx.lineTo(lw/2+50,sfs*0.62+10); fx.lineTo(-lw/2-50,sfs*0.7+10); fx.closePath(); fx.fill();
      fx.fillStyle=WHITE; fx.beginPath(); fx.moveTo(-lw/2-40,-sfs*0.62); fx.lineTo(lw/2+60,-sfs*0.7); fx.lineTo(lw/2+40,sfs*0.62); fx.lineTo(-lw/2-60,sfs*0.7); fx.closePath(); fx.fill();
      fx.fillStyle=BLACK; fx.textAlign='center'; fx.textBaseline='middle'; fx.fillText(label,0,sfs*0.05); fx.restore(); }
    var r=rng(5);
    for(var i=0;i<9;i++){ var sx=VW*(0.12+r()*0.76), sy=300+r()*520, ph=r()*TAU, tw2=Math.max(0,Math.sin(time*5+ph)); if(q<0.5) tw2*=seg(q,0.3,0.5);
      fx.fillStyle=i%3?WHITE:YELLOW; fx.globalAlpha=tw2; star4(fx,sx,sy,16+r()*16,3.5); }
    fx.globalAlpha=1; fx.restore();
    if(q<0.34) drawBigBand(q/0.34,'out',time);
  }
  var STRIPES=[{w:90,c:RED},{w:46,c:BLACK},{w:200,c:BLACK},{w:22,c:WHITE},{w:130,c:RED},{w:60,c:BLACK}];
  var BANDW=STRIPES.reduce(function(a,s){return a+s.w;},0), SLANT=420;
  function drawExit(u){
    var e=easeInOutCubic(u), lead=lerp(-40,VW+BANDW+SLANT+40,e), trail=lead-BANDW;
    fx.save(); fx.beginPath(); fx.moveTo(-50,-20); fx.lineTo(trail,-20); fx.lineTo(trail-SLANT,1100); fx.lineTo(-50,1100); fx.closePath(); fx.clip();
    fx.clearRect(-50,-50,VW+SLANT+BANDW+200,1200);
    fx.restore();
    var x=lead; STRIPES.forEach(function(st){ fx.fillStyle=st.c; fx.beginPath(); fx.moveTo(x+1,-20); fx.lineTo(x-st.w,-20); fx.lineTo(x-st.w-SLANT,1100); fx.lineTo(x+1-SLANT,1100); fx.closePath(); fx.fill(); x-=st.w; });
  }

  /* ===================== CAMÉRA =====================
     On calcule d'abord toute la trajectoire « brute » (course, sauts, salto),
     puis on la lisse canal par canal (position, regard, roulis, champ de vue) :
     plus aucun à-coup au décollage ni à la réception. */
  var STEP_HZ=4.6, CAM_DT=1/240, CAM_T0=-0.4, CAM=null;
  /* salto arrière : la rotation ralentit quand la ville est à l'envers */
  function flipAngle(d){
    var u=clamp01(d/FLIP_ROT), e=0.5-0.5*Math.cos(Math.PI*u), k=0.78;
    return TAU*(e+k/TAU*Math.sin(TAU*e));
  }
  function rawState(t){
    var b=bodyPos(t), w=b.w, s=w.s, u=w.tau, p=b.p;
    var o={x:p.x, y:p.y, z:p.z, pitch:-0.06, roll:0, fov:72, power:0.35, ground:0, lat:0};
    if(t<0) o.z-=VRUN*t*0.9;
    if(s.type==='run'){
      o.ground=1;
      var next=SEGS[w.i+1];
      /* appel : on fléchit les jambes juste avant le bord */
      if(next && next.type!=='run'){ var c=smooth(seg(t, s.t0+s.dur-0.16, s.t0+s.dur)); o.y-=1.1*c; o.pitch+=0.05*c; o.fov+=4*c; }
    } else if(s.type==='jump'){
      var lat=Math.sign(s.b.x-s.a.x)*Math.min(1, Math.abs(s.b.x-s.a.x)/40);
      var arc=Math.sin(Math.PI*u);
      o.pitch=0.12*(1-u)*(1-u)-0.36*arc*(0.5+0.5*u);      /* on regarde l'horizon au décollage, la rue au sommet */
      o.roll=-0.3*arc*lat; o.fov=72+16*arc; o.power=0.6+0.4*arc; o.lat=lat;
    } else {
      var d=w.dt;
      o.pitch=flipAngle(d)-0.55*smooth(seg(d, FLIP_ROT, FLIP_ROT+0.25));
      o.roll=0.12*Math.sin(Math.PI*clamp01(d/FLIP_ROT));
      o.fov=76+10*seg(d, FLIP_ROT, FLIP.dur);
      o.power=0.2+0.6*seg(d, FLIP_ROT, FLIP.dur);
    }
    /* réception : on s'écrase sur les jambes puis on repart */
    var sl=sinceLanding(t);
    if(sl<0.32 && s.type==='run'){ var kk=Math.sin(Math.PI*sl/0.32)*Math.pow(1-sl/0.32,0.5); o.y-=1.9*kk; o.pitch-=0.16*kk; o.fov-=5*kk; o.power+=0.5*kk; }
    return o;
  }
  function gaussSmooth(arr, key, sigma){
    var n=arr.length, r=Math.ceil(sigma*3/CAM_DT), wts=[], out=new Float32Array(n), i, k;
    for(k=-r;k<=r;k++) wts.push(Math.exp(-0.5*Math.pow(k*CAM_DT/sigma,2)));
    for(i=0;i<n;i++){
      var sum=0, ws=0;
      for(k=-r;k<=r;k++){ var j=Math.min(n-1, Math.max(0, i+k)); sum+=arr[j][key]*wts[k+r]; ws+=wts[k+r]; }
      out[i]=sum/ws;
    }
    return out;
  }
  function buildCamTrack(){
    var raw=[];
    for(var t=CAM_T0; t<=T_FLY+0.4; t+=CAM_DT) raw.push(rawState(t));
    CAM={n:raw.length,
      x:gaussSmooth(raw,'x',0.085), z:gaussSmooth(raw,'z',0.085), y:gaussSmooth(raw,'y',0.035),
      pitch:gaussSmooth(raw,'pitch',0.05), roll:gaussSmooth(raw,'roll',0.07), fov:gaussSmooth(raw,'fov',0.06),
      power:gaussSmooth(raw,'power',0.06), ground:gaussSmooth(raw,'ground',0.05)};
  }
  function camAt(key, t){
    var f=(t-CAM_T0)/CAM_DT, i=Math.max(0, Math.min(CAM.n-2, Math.floor(f))), a=Math.max(0, Math.min(1, f-i));
    return lerp(CAM[key][i], CAM[key][i+1], a);
  }
  function placeCamera(t){
    if(!CAM) buildCamTrack();
    var x=camAt('x',t), y=camAt('y',t), z=camAt('z',t), g=camAt('ground',t);
    /* regard : vers où la trajectoire lissée nous emmène */
    var ax=camAt('x',t+0.2)-x, az=camAt('z',t+0.2)-z;
    var w=segAt(Math.max(0,Math.min(t,T_FLY)));
    if(w.s.type==='flip'){ var fb=smooth(seg(w.dt,0,0.2)); ax=lerp(ax, FLIP_V.x, fb); az=lerp(az, FLIP_V.z, fb); }
    var yaw=Math.atan2(-ax, -az)*0.75;
    /* foulées, seulement quand on a les pieds sur le toit */
    var ph=(t*STEP_HZ)%1;
    y+=g*(0.38*Math.abs(Math.sin(Math.PI*ph))-0.1);
    var roll=camAt('roll',t)+g*0.025*Math.sin(TAU*t*STEP_HZ/2);
    var pitch=camAt('pitch',t)+g*0.015*Math.sin(TAU*t*STEP_HZ);
    camera.position.set(x,y,z);
    camera.rotation.set(pitch, yaw, roll, 'YXZ');
    camera.fov=camAt('fov',t); camera.updateProjectionMatrix();
    return {power:camAt('power',t), type:w.s.type};
  }
  /* impact comique à chaque réception : traits blancs et rouges depuis les bords */
  var IMPACT=[]; (function(){ var r=rng(21); for(var i=0;i<28;i++) IMPACT.push({a:r()*TAU, len:0.12+r()*0.18, w:3+r()*7, red:r()<0.35}); })();
  function drawImpact(t){
    var sl=sinceLanding(t);
    if(sl>0.2 || t>=T_FLY) return;
    var a=sl/0.2, cx=VW/2, cy=600, R=Math.hypot(VW,1080)*0.6;
    IMPACT.forEach(function(l){
      var r1=R*(1.05-0.1*a), r0=r1-R*l.len*(1-a);
      fx.strokeStyle=l.red?RED_HOT:WHITE; fx.globalAlpha=0.8*(1-a); fx.lineWidth=l.w*(1-a*0.5);
      fx.beginPath(); fx.moveTo(cx+Math.cos(l.a)*r0, cy+Math.sin(l.a)*r0*0.75); fx.lineTo(cx+Math.cos(l.a)*r1, cy+Math.sin(l.a)*r1*0.75); fx.stroke();
    });
    fx.globalAlpha=1;
  }


  /* ===================== SON =====================
     Synthétisé en direct (Web Audio), branché sur la sortie commune du site
     (js/audio.js) : il respecte les boutons Son et Musique du hub. */
  var actx=AU ? AU.ctx : null, sfxBus=null, musicBus=null, musicFilter=null, exitBus=null, noiseBuf=null, audioOn=false;
  function audioCreate(){
    if(!actx || debugT || sfxBus) return;
    sfxBus=actx.createGain(); sfxBus.gain.value=0.62; sfxBus.connect(AU.master);
    exitBus=actx.createGain(); exitBus.gain.value=0.62; exitBus.connect(AU.master);
    musicFilter=actx.createBiquadFilter(); musicFilter.type='lowpass'; musicFilter.frequency.value=18000; musicFilter.Q.value=1.2;
    musicBus=actx.createGain(); musicBus.gain.value=0.75;
    var musicGate=actx.createGain(); musicGate.gain.value=AU.isMusicOn()?1:0;
    musicFilter.connect(musicBus); musicBus.connect(musicGate); musicGate.connect(sfxBus);
    noiseBuf=AU.noiseBuf;
  }
  function env(g, at, peak, attack, dur){ g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(peak, at+attack); g.gain.exponentialRampToValueAtTime(0.0001, at+dur); }
  function noise(at, dur, o){
    var src=actx.createBufferSource(); src.buffer=noiseBuf;
    var f=actx.createBiquadFilter(); f.type=o.type||'bandpass'; f.Q.value=o.q||1;
    f.frequency.setValueAtTime(o.f0||1000, at); if(o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, at+dur);
    var g=actx.createGain(); env(g, at, o.gain||0.3, o.attack||0.005, dur);
    src.connect(f); f.connect(g); g.connect(o.bus||sfxBus); src.start(at, Math.random()*0.5); src.stop(at+dur+0.05);
  }
  function tone(at, dur, o){
    var osc=actx.createOscillator(); osc.type=o.type||'sine';
    osc.frequency.setValueAtTime(o.f0, at); if(o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, at+(o.glide||dur));
    if(o.detune) osc.detune.value=o.detune;
    var g=actx.createGain(); env(g, at, o.gain||0.2, o.attack||0.004, dur);
    if(o.lp){ var f=actx.createBiquadFilter(); f.type='lowpass'; f.Q.value=o.q||1; f.frequency.setValueAtTime(o.lp, at); if(o.lp1) f.frequency.exponentialRampToValueAtTime(o.lp1, at+dur); osc.connect(f); f.connect(g); }
    else osc.connect(g);
    g.connect(o.bus||sfxBus); osc.start(at); osc.stop(at+dur+0.05);
  }
  var SFX={
    kick:function(at, g, bus){ tone(at, 0.32, {f0:155, f1:42, glide:0.12, gain:g||0.9, bus:bus}); noise(at, 0.02, {type:'highpass', f0:3000, gain:0.15*(g||0.9), bus:bus}); },
    snare:function(at, bus){ noise(at, 0.16, {type:'bandpass', f0:1900, q:0.8, gain:0.32, bus:bus}); tone(at, 0.08, {type:'triangle', f0:210, f1:150, gain:0.2, bus:bus}); },
    hat:function(at, g, bus){ noise(at, 0.035, {type:'highpass', f0:8000, gain:g||0.12, bus:bus}); },
    bass:function(at, f, bus){ tone(at, 0.19, {type:'sawtooth', f0:f, gain:0.2, lp:900, lp1:180, q:7, bus:bus}); tone(at, 0.19, {type:'square', f0:f/2, gain:0.07, lp:400, bus:bus}); },
    crash:function(at, g){ noise(at, 1.6, {type:'highpass', f0:5000, gain:g||0.35, attack:0.002}); noise(at, 0.9, {type:'bandpass', f0:9000, q:0.6, gain:(g||0.35)*0.6}); },
    shing:function(at, g){ [2380, 3170, 4230, 5650].forEach(function(f,i){ tone(at, 0.55-i*0.08, {type:'sine', f0:f, f1:f*0.98, gain:(g||0.12)/(1+i*0.5)}); }); noise(at, 0.12, {type:'highpass', f0:6000, gain:0.25}); },
    whoosh:function(at, dur, f0, f1, g, bus){ noise(at, dur, {type:'bandpass', f0:f0, f1:f1, q:1.1, gain:g||0.4, attack:dur*0.55, bus:bus}); },
    stab:function(at, notes, dur, g){ notes.forEach(function(f){ [-9, 9].forEach(function(dt){ tone(at, dur, {type:'sawtooth', f0:f, detune:dt, gain:(g||0.09), lp:4200, lp1:600, q:2, attack:0.006}); }); }); },
    stamp:function(at, i){ noise(at, 0.07, {type:'bandpass', f0:1100+i*60, q:1, gain:0.36}); tone(at, 0.1, {f0:130+i*4, f1:62, glide:0.08, gain:0.45}); noise(at, 0.025, {type:'highpass', f0:3500, gain:0.16}); },
    riser:function(at, dur){ noise(at, dur, {type:'bandpass', f0:350, f1:7000, q:2, gain:0.3, attack:dur*0.95}); tone(at, dur, {type:'sawtooth', f0:110, f1:880, gain:0.07, lp:3000, attack:dur*0.9}); noise(at, dur, {type:'highpass', f0:6000, gain:0.18, attack:dur*0.98}); },
    step:function(at, k){ noise(at, 0.05, {type:'lowpass', f0:1100+(k%2)*200, gain:0.24}); tone(at, 0.05, {f0:150, f1:90, gain:0.11}); },
    land:function(at){ tone(at, 0.42, {f0:95, f1:38, glide:0.2, gain:0.85}); noise(at, 0.14, {type:'lowpass', f0:900, gain:0.42}); noise(at+0.01, 0.09, {type:'bandpass', f0:2400, q:0.7, gain:0.12}); },
    wind:function(at, dur){ noise(at, dur, {type:'bandpass', f0:500, f1:1800, q:0.7, gain:0.22, attack:dur*0.4}); }
  };
  var BEAT=60/140, BASS=[82.41,82.41,98,82.41,110,82.41,123.47,146.83], ARP=[76,79,83,86,83,79,74,71];
  function audioEvents(){
    var ev=[]; function add(t, fn){ ev.push({t:t, fn:fn}); }
    var M=musicFilter;
    add(0.02, function(a){ SFX.shing(a,0.1); noise(a,0.16,{type:'bandpass',f0:7000,f1:900,q:1.4,gain:0.35,attack:0.01}); });
    add(0.18, function(a){ SFX.whoosh(a,0.5,250,2400,0.35); SFX.kick(a,0.6); });
    for(var i=0, t=0.30; t<T_TITLE-0.01; i++, t=0.30+i*BEAT/2){
      (function(i,t){ add(t, function(a){
        SFX.hat(a, i%2?0.06:0.1, M); if(i%4===0) SFX.kick(a, 0.8, M); if(i%4===2) SFX.snare(a, M);
        SFX.bass(a, BASS[i%8], M);
        if(i%8===0) AU.inst.epiano(a, M, (Math.floor(i/8)%2 ? [52,55,59,62] : [55,59,62,66]), BEAT*3.2, 0.32);
        AU.inst.pluck(a, M, ARP[i%8], BEAT*0.45, 0.07);
      }); })(i,t);
    }
    SEGS.forEach(function(s){
      if(s.type==='run'){ for(var k=0, ts=s.t0+0.05; ts<s.t0+s.dur-0.04; k++, ts=s.t0+0.05+k/STEP_HZ){ (function(ts,k){ add(ts, function(a){ SFX.step(a,k); }); })(ts,k); } }
      else if(s.type==='jump'){ add(s.t0, function(a){ SFX.whoosh(a, s.dur*0.9, 300, 3000, 0.34); }); add(s.t0+s.dur, function(a){ SFX.land(a); }); }
      else {
        add(s.t0, function(a){ SFX.whoosh(a, 0.5, 500, 4000, 0.4); SFX.wind(a, s.dur); });
        add(s.t0+0.35, function(a){ SFX.riser(a, s.dur-0.35); });
        /* la musique s'étouffe pendant le salto, la ville à l'envers */
        add(s.t0, function(a){ M.frequency.setValueAtTime(18000, a); M.frequency.exponentialRampToValueAtTime(700, a+FLIP_ROT*0.55); M.frequency.exponentialRampToValueAtTime(6000, a+s.dur); });
      }
    });
    add(T_BAND, function(a){ SFX.whoosh(a,0.4,180,6500,0.55); noise(a,0.3,{type:'lowpass',f0:400,gain:0.3}); });
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
    audioCreate(); audioOn=true;
    EVENTS=EVENTS||audioEvents();
    var t0=actx.currentTime+0.05-fromT;
    EVENTS.forEach(function(e){ if(e.t>=fromT-0.001) e.fn(t0+e.t); });
  }
  function audioSkip(){ if(!audioOn) return; var now=actx.currentTime; sfxBus.gain.setValueAtTime(sfxBus.gain.value, now); sfxBus.gain.linearRampToValueAtTime(0.0001, now+0.05); }
  function audioExit(){ if(!audioOn) return; var a=actx.currentTime+0.01; SFX.whoosh(a, 0.42, 250, 3200, 0.5, exitBus); noise(a+0.3, 0.3, {type:'lowpass', f0:500, gain:0.25, bus:exitBus}); }
  function audioStop(){
    if(audioOn){ var now=actx.currentTime; sfxBus.gain.setValueAtTime(sfxBus.gain.value, now); sfxBus.gain.linearRampToValueAtTime(0.0001, now+0.3); }
    if(AU) AU.allowMusic(true);
  }

  /* ===================== BOUCLE ===================== */
  function render(t){
    if(t<T_TITLE){
      glC.style.visibility='visible';
      var p=placeCamera(Math.min(t,T_FLY));
      if(BLINKS.mat) BLINKS.mat.opacity=0.6+0.4*Math.sin(t*6);
      CARS.forEach(function(m){
        if(m.userData.base===undefined) m.userData.base=m.position.z;
        var z=m.userData.base-m.userData.dir*m.userData.v*t;
        m.position.z=((z+1340)%1400+1400)%1400-1340;
      });
      drawSky(t);
      renderer.render(scene,camera);
    } else glC.style.visibility='hidden';     /* le titre couvre tout : on n'a plus besoin de la 3D */
    base(fx); fx.clearRect(0,0,VW,1080);
    if(t<T_TITLE){
      drawSpeed(t, p.power);
      drawImpact(t);
      fx.globalAlpha=0.32; fx.drawImage(halftoneRed,0,0,VW,1080); fx.globalAlpha=1;
      drawVignette();
      if(t<0.7) drawOpening(t);
      if(t>T_BAND) drawBigBand(seg(t,T_BAND,T_TITLE),'in',t);
    } else {
      drawTitle(t-T_TITLE,t);
      if(t>=T_EXIT) drawExit(seg(t,T_EXIT,TOTAL));
    }
  }
  var startAt=0, offset=0, raf=0, done=false, exiting=false;
  var hint=document.getElementById('introSoundHint');
  function finish(){
    if(done) return;
    done=true; cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('keydown', onKey);
    audioStop();
    try{ renderer.dispose(); }catch(e){}
    if(overlay.parentNode) overlay.parentNode.removeChild(overlay);
    document.documentElement.classList.remove('intro-playing');
    try{ window.dispatchEvent(new Event('cg-intro-done')); }catch(e){}
  }
  function introTime(now){ return Math.max(0, (now-startAt)/1000)+offset; }
  function frame(now){
    if(!startAt) startAt=now;
    var t=introTime(now);
    if(t>=T_EXIT && !exiting){ exiting=true; overlay.classList.add('exiting'); audioExit(); if(hint) hint.style.display='none'; }
    if(t>=TOTAL){ finish(); return; }
    render(t);
    raf=requestAnimationFrame(frame);
  }
  function skip(){ if(done || exiting) return; offset+=T_EXIT-introTime(performance.now()); audioSkip(); }
  function onKey(e){ if(e.key==='Escape'){ e.preventDefault(); skip(); } }
  function onResize(){ resize(); }

  resize(); buildSky(); buildCity(); buildDetails(); buildCamTrack();
  window.addEventListener('resize', onResize);
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ if(!done) resize(); });
  if(debugT){
    var dt=parseFloat(debugT);
    overlay.classList.toggle('exiting', dt>=T_EXIT); render(dt);
    window.CG_INTRO_RENDER=function(t){ overlay.classList.toggle('exiting', t>=T_EXIT); render(t); };
    return;
  }
  document.getElementById('introSkip').addEventListener('click', function(e){ e.stopPropagation(); skip(); });
  document.addEventListener('keydown', onKey);
  if(actx && actx.state==='running') audioStart(0);
  startAt=performance.now()+(audioOn?50:0);
  raf=requestAnimationFrame(frame);
  if(AU && !audioOn && !AU.isMuted()){
    if(hint) hint.style.display='block';
    AU.onUnlock(function(){ if(hint) hint.style.display='none'; if(done || exiting) return; audioStart(introTime(performance.now())); });
  }
  }
})();
