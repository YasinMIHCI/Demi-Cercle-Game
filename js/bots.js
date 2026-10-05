/* BATTLE BOTS — combat de tanks 2D, actions simultanées, terrain destructible.

   Fonctionnement réseau (hôte qui fait autorité) :
   - chaque tour, les joueurs envoient UNE action (type + angle + puissance) ;
   - à la fin du chrono (ou quand tout le monde a validé), l'hôte simule le
     tour complet (physique, explosions, dégâts) et envoie un "replay" :
     positions échantillonnées + événements (explosions, murs, dégâts) ;
   - tout le monde (hôte compris) rejoue l'animation, puis applique l'état
     final envoyé par l'hôte (terrain + tanks), qui fait foi. */
(function(){
  'use strict';
  var CG=window.CG;
  var $=CG.$, escapeHtml=CG.escapeHtml, shuffle=CG.shuffle, shake=CG.shake, openModal=CG.openModal, closeModal=CG.closeModal;
  var sfxToggle=CG.sfxToggle, sfxValidate=CG.sfxValidate, sfxReveal=CG.sfxReveal, copyText=CG.copyText;

  /* ===================== CONSTANTES ===================== */
  var W=960, H=540, CELL=4, GW=W/CELL, GH=H/CELL;
  var EMPTY=0, DIRT=1, STONE=2;
  var GRAVITY=520, TPS=60, DT=1/TPS;
  var FRAME_EVERY=3;               /* un échantillon toutes les 3 frames (20 /s) */
  var MAX_TICKS=TPS*12;
  var WATER_START=516, WATER_RISE_FROM=15, WATER_MIN=30;
  var AIM_MAX_LEN=170;             /* longueur de flèche à 100 % (unités du canvas) */
  var BOTS_ROOM_PREFIX='p5bots-';
  var MODE_LABEL={'1v1':'1 VS 1','2v2':'2 VS 2','ffa':'CHACUN POUR SOI'};
  var MODE_CAP={'1v1':2,'2v2':4,'ffa':6};
  var TEAM_COLORS=['#E60012','#2E6FF2'];
  var FFA_COLORS=['#E60012','#2E6FF2','#FFE600','#7cff6e','#ff6ec7','#ff9d2f'];

  var SHOT={name:'Tir', ico:'💥', speed:640, dmg:22, r:26, wr:10, desc:'Obus standard, le même pour tous.'};
  var JUMP_MIN=0.15;

  /* Les trois tanks. jump = vitesse max du saut ; mass réduit le recul. */
  var TANKS={
    titan:{
      name:'TITAN', role:'Lourd', hp:160, w:36, h:20, jump:250, mass:1.6,
      stats:{hp:1, speed:0.35, power:1},
      atk:{key:'heavy', name:'Obus lourd', ico:'☄️', cd:3, aim:true,
           desc:'Énorme obus : 55 dégâts, grosse explosion qui perce la pierre.'},
      surv:{key:'rampart', name:'Rempart', ico:'🧱', cd:3, aim:true,
            desc:'Fait surgir un mur de pierre là où pointe la flèche.'}
    },
    ranger:{
      name:'RANGER', role:'Équilibré', hp:115, w:28, h:17, jump:330, mass:1,
      stats:{hp:0.68, speed:0.65, power:0.6},
      atk:{key:'cluster', name:'Fragmentation', ico:'🎆', cd:2, aim:true,
           desc:'Obus qui éclate en 4 fragments à l’impact.'},
      surv:{key:'repair', name:'Réparation', ico:'🔧', cd:3, aim:false,
            desc:'Répare 35 PV, immédiatement.'}
    },
    viper:{
      name:'VIPER', role:'Rapide', hp:80, w:22, h:14, jump:410, mass:0.7,
      stats:{hp:0.45, speed:1, power:0.45},
      atk:{key:'burst', name:'Rafale', ico:'🔫', cd:1, aim:true,
           desc:'3 petits obus tirés en rafale (13 dégâts chacun).'},
      surv:{key:'boost', name:'Propulsion', ico:'🚀', cd:2, aim:true,
            desc:'Saut surpuissant pour traverser la carte, dégâts subis réduits de moitié ce tour.'}
    }
  };
  var TANK_ORDER=['titan','ranger','viper'];

  /* ===================== TERRAIN ===================== */
  function newGrid(){ return new Uint8Array(GW*GH); }
  function gridGet(g,cx,cy){
    if(cx<0||cx>=GW||cy<0||cy>=GH) return EMPTY;
    return g[cy*GW+cx];
  }
  /* RLE : [valeur, longueur, valeur, longueur...] */
  function gridEncode(g){
    var out=[], cur=g[0], n=0;
    for(var i=0;i<g.length;i++){
      if(g[i]===cur) n++;
      else { out.push(cur,n); cur=g[i]; n=1; }
    }
    out.push(cur,n);
    return out;
  }
  function gridDecode(arr){
    var g=newGrid(), k=0;
    for(var i=0;i<arr.length;i+=2){
      var v=arr[i], n=arr[i+1];
      for(var j=0;j<n && k<g.length;j++) g[k++]=v;
    }
    return g;
  }
  /* Explosion : la terre part dans le rayon r, la pierre seulement dans wr. */
  function carve(g, x, y, r, wr){
    var cx0=Math.floor((x-r)/CELL), cx1=Math.floor((x+r)/CELL);
    var cy0=Math.floor((y-r)/CELL), cy1=Math.floor((y+r)/CELL);
    for(var cy=Math.max(0,cy0);cy<=Math.min(GH-1,cy1);cy++){
      for(var cx=Math.max(0,cx0);cx<=Math.min(GW-1,cx1);cx++){
        var px=cx*CELL+CELL/2, py=cy*CELL+CELL/2;
        var d2=(px-x)*(px-x)+(py-y)*(py-y);
        var i=cy*GW+cx;
        if(g[i]===DIRT && d2<=r*r) g[i]=EMPTY;
        else if(g[i]===STONE && d2<=wr*wr) g[i]=EMPTY;
      }
    }
  }
  function generateTerrain(){
    var g=newGrid();
    var p1=Math.random()*6.28, p2=Math.random()*6.28, p3=Math.random()*6.28;
    var a1=40+Math.random()*40, a2=20+Math.random()*25, a3=6+Math.random()*8;
    var f1=1+Math.random()*1.5, f2=3+Math.random()*3, f3=9+Math.random()*6;
    var base=330+Math.random()*40;
    var heights=[];
    for(var cx=0;cx<GW;cx++){
      var t=cx/GW*Math.PI*2;
      var h=base+a1*Math.sin(t*f1+p1)+a2*Math.sin(t*f2+p2)+a3*Math.sin(t*f3+p3);
      heights.push(Math.max(225, Math.min(450, h)));
    }
    for(cx=0;cx<GW;cx++){
      for(var cy=Math.floor(heights[cx]/CELL);cy<GH;cy++) g[cy*GW+cx]=DIRT;
    }
    /* îlots flottants */
    var islands=1+Math.floor(Math.random()*3);
    for(var k=0;k<islands;k++){
      var ix=120+Math.random()*(W-240), iy=75+Math.random()*55;
      var rx=40+Math.random()*50, ry=10+Math.random()*8;
      for(cy=0;cy<GH;cy++) for(cx=0;cx<GW;cx++){
        var dx=(cx*CELL+2-ix)/rx, dy=(cy*CELL+2-iy)/ry;
        if(dx*dx+dy*dy<=1) g[cy*GW+cx]=DIRT;
      }
    }
    /* piliers de pierre posés sur le sol */
    var pillars=2+Math.floor(Math.random()*3);
    for(k=0;k<pillars;k++){
      var px=Math.floor((0.15+0.7*(k+Math.random()*0.6)/pillars)*GW);
      var pw=3+Math.floor(Math.random()*3), ph=10+Math.floor(Math.random()*14);
      var top=Math.floor(heights[px]/CELL)-ph;
      for(cy=top;cy<top+ph+3;cy++) for(cx=px;cx<px+pw;cx++){
        if(cx>=0&&cx<GW&&cy>=0&&cy<GH) g[cy*GW+cx]=STONE;
      }
    }
    /* une couche de pierre près du fond, pour éviter de creuser jusqu'à l'eau trop vite */
    for(cx=0;cx<GW;cx++) for(cy=GH-6;cy<GH;cy++) if(g[cy*GW+cx]===DIRT && Math.random()<0.6) g[cy*GW+cx]=STONE;
    return g;
  }

  /* ===================== SIMULATION (hôte) ===================== */
  function solidPx(g, px, py){
    if(px<0||px>=W) return true;            /* bords de la carte : murs invisibles */
    if(py<0||py>=H) return false;
    return g[Math.floor(py/CELL)*GW+Math.floor(px/CELL)]!==EMPTY;
  }
  function boxHits(g, x, y, w, h){
    var x0=x-w/2, x1=x+w/2-0.01, y0=y-h/2, y1=y+h/2-0.01;
    if(x0<0||x1>=W) return true;
    var cx0=Math.floor(x0/CELL), cx1=Math.floor(x1/CELL);
    var cy0=Math.max(0,Math.floor(y0/CELL)), cy1=Math.min(GH-1,Math.floor(y1/CELL));
    for(var cy=cy0;cy<=cy1;cy++) for(var cx=cx0;cx<=cx1;cx++){
      if(g[cy*GW+cx]!==EMPTY) return true;
    }
    return false;
  }
  function tankSpec(t){ return TANKS[t.type]; }
  function aimVec(a){ return {x:Math.cos(a), y:-Math.sin(a)}; }
  function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }

  /* Place un tank posé sur le sol à l'abscisse x (sous les îlots flottants,
     en évitant les piliers de pierre). */
  function columnHasStone(g, x, w){
    for(var cx=Math.floor((x-w/2)/CELL);cx<=Math.floor((x+w/2)/CELL);cx++)
      for(var cy=0;cy<GH;cy++) if(gridGet(g,cx,cy)===STONE && cy<GH-8) return true;
    return false;
  }
  function dropTank(g, t, x){
    var s=tankSpec(t);
    x=clamp(x, s.w/2+2, W-s.w/2-2);
    for(var k=1;k<12 && columnHasStone(g,x,s.w+8);k++){
      x=clamp(x+(k%2?1:-1)*k*14, s.w/2+2, W-s.w/2-2);
    }
    t.x=x;
    t.y=160;
    for(var i=0;i<H;i++){
      if(boxHits(g,t.x,t.y+1,s.w,s.h)) break;
      t.y++;
    }
    /* coincé dans un pilier : on remonte */
    while(boxHits(g,t.x,t.y,s.w,s.h) && t.y>s.h) t.y--;
  }

  /* Simule un tour complet. state = {grid, tanks, waterY}, actions[seat] = {kind,a,p}.
     Modifie state et renvoie {frames, events, stats}. */
  function simulateTurn(state, actions){
    var g=state.grid, tanks=state.tanks, waterY=state.waterY;
    var events=[], frames=[], projs=[], spawns=[], nextId=1;
    var dmgDealt={}, kills={};
    var tick=0;

    function ev(e){ e.t=tick; events.push(e); }
    function addProj(owner, x, y, vx, vy, spec){
      projs.push({id:nextId++, owner:owner, x:x, y:y, vx:vx, vy:vy, age:0,
        dmg:spec.dmg, r:spec.r, wr:spec.wr, grav:spec.grav||1, frag:!!spec.frag, kind:spec.kind||'shot'});
    }
    function muzzle(t, a){
      var s=tankSpec(t), v=aimVec(a);
      return {x:t.x+v.x*(s.w/2+4), y:t.y-s.h/2+v.y*(s.w/2+4)};
    }
    function damageTank(t, amount, owner){
      if(!t.alive || amount<=0) return;
      if(t.shielded) amount=Math.round(amount/2);
      amount=Math.min(amount, t.hp);
      t.hp-=amount;
      ev({type:'dmg', seat:t.seat, n:amount});
      if(owner!==undefined && owner!==t.seat){ dmgDealt[owner]=(dmgDealt[owner]||0)+amount; }
      if(t.hp<=0){
        t.alive=false; t.hp=0;
        ev({type:'kill', seat:t.seat, by:owner});
        if(owner!==undefined && owner!==t.seat) kills[owner]=(kills[owner]||0)+1;
      }
    }
    function explode(x, y, r, wr, dmg, owner){
      carve(g, x, y, r, wr);
      ev({type:'boom', x:Math.round(x), y:Math.round(y), r:r, wr:wr});
      tanks.forEach(function(t){
        if(!t.alive) return;
        var s=tankSpec(t);
        var dx=t.x-x, dy=t.y-y, dist=Math.sqrt(dx*dx+dy*dy);
        var d=Math.max(0, dist-Math.max(s.w,s.h)*0.45);
        if(d>=r) return;
        var f=1-d/r;
        damageTank(t, Math.round(dmg*(0.35+0.65*f)), owner);
        var nx=dist>0.01?dx/dist:0, ny=dist>0.01?dy/dist:-1;
        var imp=(160+260*f)/s.mass;
        t.vx+=nx*imp; t.vy+=ny*imp-120*f/s.mass;
        t.grounded=false;
      });
    }

    /* ----- tick 0 : actions ----- */
    tanks.forEach(function(t){ t.shielded=false; });
    /* d'abord les actions instantanées (soin, mur), puis les mouvements et tirs */
    tanks.forEach(function(t){
      var act=actions[t.seat];
      if(!t.alive || !act) return;
      var s=tankSpec(t);
      if(act.kind==='surv' && s.surv.key==='repair'){
        var heal=Math.min(35, s.hp-t.hp);
        t.hp+=heal; ev({type:'heal', seat:t.seat, n:heal});
      } else if(act.kind==='surv' && s.surv.key==='rampart'){
        var v=aimVec(act.a), dist=50+act.p*190;
        var wx=t.x+v.x*dist, wy=t.y+v.y*dist;
        var cells=[], cx0=Math.floor(wx/CELL)-2, cy0=Math.floor(wy/CELL)-10;
        for(var cy=cy0;cy<cy0+18;cy++) for(var cx=cx0;cx<cx0+4;cx++){
          if(cx<0||cx>=GW||cy<0||cy>=GH) continue;
          var px=cx*CELL+2, py=cy*CELL+2, onTank=false;
          tanks.forEach(function(o){
            var os=tankSpec(o);
            if(o.alive && Math.abs(px-o.x)<os.w/2+3 && Math.abs(py-o.y)<os.h/2+3) onTank=true;
          });
          if(!onTank){ g[cy*GW+cx]=STONE; cells.push(cy*GW+cx); }
        }
        ev({type:'wall', cells:cells});
      }
    });
    tanks.forEach(function(t){
      var act=actions[t.seat];
      if(!t.alive || !act) return;
      var s=tankSpec(t), v=aimVec(act.a), p=clamp(act.p,0,1), m;
      if(act.kind!=='pass' && !(act.kind==='surv' && !s.surv.aim)) t.aim=act.a;
      if(act.kind==='move'){
        var jp=Math.max(JUMP_MIN,p)*s.jump;
        t.vx=v.x*jp; t.vy=v.y*jp; t.grounded=false;
      } else if(act.kind==='shot'){
        m=muzzle(t,act.a);
        addProj(t.seat, m.x, m.y, v.x*p*SHOT.speed, v.y*p*SHOT.speed, SHOT);
      } else if(act.kind==='atk'){
        m=muzzle(t,act.a);
        if(s.atk.key==='heavy'){
          addProj(t.seat, m.x, m.y, v.x*p*560, v.y*p*560, {dmg:55, r:50, wr:24, grav:1.15, kind:'heavy'});
        } else if(s.atk.key==='cluster'){
          addProj(t.seat, m.x, m.y, v.x*p*600, v.y*p*600, {dmg:20, r:28, wr:8, frag:true, kind:'cluster'});
        } else if(s.atk.key==='burst'){
          [-0.07,0,0.07].forEach(function(da,i){
            spawns.push({tick:i*7, owner:t.seat, tank:t, a:act.a+da, p:p});
          });
        }
      } else if(act.kind==='surv' && s.surv.key==='boost'){
        var bp=Math.max(JUMP_MIN,p)*720;
        t.vx=v.x*bp; t.vy=v.y*bp; t.grounded=false; t.shielded=true;
      }
    });

    function stepTank(t){
      var s=tankSpec(t);
      if(t.y-s.h/2>waterY){ ev({type:'drown', seat:t.seat}); damageTank(t, t.hp); return; }
      if(t.grounded && !boxHits(g,t.x,t.y+1,s.w,s.h)) t.grounded=false;
      if(t.grounded) return;
      t.vy+=GRAVITY*DT;
      /* horizontal, avec petite marche pour gravir les bosses */
      var nx=t.x+t.vx*DT;
      if(boxHits(g,nx,t.y,s.w,s.h)){
        var stepped=false;
        for(var st=1;st<=6;st++){
          if(!boxHits(g,nx,t.y-st,s.w,s.h)){ t.x=nx; t.y-=st; stepped=true; break; }
        }
        if(!stepped) t.vx=-t.vx*0.25;
      } else t.x=nx;
      /* vertical */
      var ny=t.y+t.vy*DT;
      if(boxHits(g,t.x,ny,s.w,s.h)){
        if(t.vy>0){
          for(var k=0;k<14 && !boxHits(g,t.x,t.y+1,s.w,s.h);k++) t.y+=1;
          if(t.vy>620) damageTank(t, Math.round((t.vy-620)*0.06));
          t.vy=0; t.vx=0; t.grounded=true;
        } else {
          t.vy=0;
        }
      } else t.y=ny;
    }
    function projHitsTank(pr){
      for(var i=0;i<tanks.length;i++){
        var t=tanks[i];
        if(!t.alive) continue;
        if(t.seat===pr.owner && pr.age<0.25) continue;
        var s=tankSpec(t);
        if(Math.abs(pr.x-t.x)<=s.w/2+2 && Math.abs(pr.y-t.y)<=s.h/2+2) return true;
      }
      return false;
    }
    function stepProj(pr){
      var sub=3, d=DT/sub;
      for(var k=0;k<sub;k++){
        pr.vy+=GRAVITY*pr.grav*d;
        pr.x+=pr.vx*d; pr.y+=pr.vy*d;
        pr.age+=d;
        if(pr.x<-40||pr.x>W+40||pr.y>waterY){ pr.dead=true; if(pr.y>waterY && pr.x>=0 && pr.x<W) ev({type:'splash', x:Math.round(pr.x), y:Math.round(waterY)}); return; }
        if((pr.y>=0 && solidPx(g,pr.x,pr.y) && pr.x>=0 && pr.x<W) || projHitsTank(pr)){
          pr.dead=true;
          explode(pr.x, pr.y, pr.r, pr.wr, pr.dmg, pr.owner);
          if(pr.frag){
            [-2.2,-1.4,-0.9,-0.45].forEach(function(ang,i){
              var sp=170+i*25, sgn=(i%2?1:-1);
              addProj(pr.owner, pr.x, pr.y-6, Math.cos(ang)*sp*sgn, Math.sin(ang)*sp*0.9-60, {dmg:12, r:18, wr:4, kind:'frag'});
            });
          }
          return;
        }
      }
    }
    function snapshot(){
      var k=[], p=[];
      tanks.forEach(function(t){ k.push(Math.round(t.x), Math.round(t.y)); });
      projs.forEach(function(pr){ if(!pr.dead) p.push(pr.id, Math.round(pr.x), Math.round(pr.y)); });
      frames.push({t:tick, k:k, p:p});
    }

    for(tick=0; tick<MAX_TICKS; tick++){
      for(var si=spawns.length-1;si>=0;si--){
        var sp=spawns[si];
        if(sp.tick===tick){
          if(sp.tank.alive){
            var v2=aimVec(sp.a), m2=muzzle(sp.tank, sp.a);
            addProj(sp.owner, m2.x, m2.y, v2.x*sp.p*660, v2.y*sp.p*660, {dmg:13, r:18, wr:4, kind:'burst'});
          }
          spawns.splice(si,1);
        }
      }
      tanks.forEach(function(t){ if(t.alive) stepTank(t); });
      projs.forEach(function(pr){ if(!pr.dead) stepProj(pr); });
      projs=projs.filter(function(pr){ return !pr.dead; });
      if(tick%FRAME_EVERY===0) snapshot();
      var settled = tick>20 && !projs.length && !spawns.length &&
        tanks.every(function(t){ return !t.alive || t.grounded; });
      if(settled) break;
    }
    snapshot();
    tanks.forEach(function(t){ t.vx=0; t.vy=0; t.shielded=false; });
    return {frames:frames, events:events, dmg:dmgDealt, kills:kills};
  }

  /* ===================== ÉTAT ===================== */
  var bs={
    players:[], connected:[], clientIds:[],
    mode:'1v1', timer:30, phase:'lobby',      /* 'lobby' | 'aiming' | 'resolving' | 'ended' */
    match:null,                                /* hôte : état qui fait foi */
    actions:{}, turnDeadline:0, turnTimer:null, nextTimer:null, stats:{}
  };
  var botsNetRole=null, botsMySeat=0, botsMyName='', botsRoomCode='';
  var botsSelectedMode='1v1', botsSelectedTimer=30;
  /* ce que l'écran affiche (tout le monde, hôte compris) */
  var view={grid:null, tanks:[], waterY:WATER_START, turn:0, phase:'idle', projs:[], particles:[], texts:[], replay:null, mode:'1v1'};
  var aim={kind:null, a:Math.PI/4, p:0.6, set:false, locked:false, dragging:false};
  var lockedSeats=[], turnEndsAt=0;

  /* ===================== RÉSEAU ===================== */
  function botsSetNetStatus(cls,label){
    var el=$('botsNetStatus');
    el.className='net-status '+cls;
    el.querySelector('.net-label').textContent=label;
  }
  var net=CG.createRoomNet({
    prefix: BOTS_ROOM_PREFIX,
    onStatus: botsSetNetStatus,
    onJoinRequest: hostOnJoinRequest,
    onSeatJoined: hostOnSeatJoined,
    onGuestMessage: hostOnGuestMessage,
    onSeatLost: hostOnSeatLost,
    onHostMessage: handleMsg,
    onReconnecting: function(){ showBanner('📡 Connexion perdue — reconnexion en cours...'); },
    onReconnected: function(){ hideBanner(); },
    onLost: function(){ showLostModal("Impossible de rétablir la connexion avec l'hôte."); }
  });
  /* l'hôte traite une copie : l'animation ne doit jamais toucher l'état qui fait foi */
  function broadcast(msg){ handleMsg(JSON.parse(JSON.stringify(msg))); net.sendToAll(msg); }

  function cleanupOnline(){
    net.close(botsNetRole==='host' ? {type:'room_closed'} : null);
    clearTimeout(bs.turnTimer); clearTimeout(bs.nextTimer);
    botsNetRole=null; botsMySeat=0; botsRoomCode='';
    bs.players=[]; bs.connected=[]; bs.clientIds=[]; bs.phase='lobby'; bs.match=null; bs.actions={};
    view.grid=null; view.tanks=[]; view.replay=null; view.phase='idle';
    $('botsTurnBadge').style.display='none';
    hideBanner();
    botsSetNetStatus('offline','HORS LIGNE');
  }
  function showBanner(t){ $('botsNetBannerText').textContent=t; $('botsNetBanner').classList.add('open'); }
  function hideBanner(){ $('botsNetBanner').classList.remove('open'); }
  function showLostModal(text){
    hideBanner();
    botsSetNetStatus('offline','DÉCONNECTÉ');
    $('botsDisconnectModalText').textContent=text;
    openModal('botsDisconnectModal');
  }
  $('botsDisconnectBackBtn').addEventListener('click',function(){
    closeModal('botsDisconnectModal'); cleanupOnline(); gotoScreen('online');
  });

  function isConnected(seat){ return seat===0 || bs.connected[seat]!==false; }
  function activeSeats(){
    var out=[];
    for(var s=0;s<bs.players.length;s++){ if(bs.players[s] && isConnected(s)) out.push(s); }
    return out;
  }

  /* ----- création / connexion ----- */
  function setupToggle(id, attr, cb){
    var btns=$(id).querySelectorAll('button');
    for(var i=0;i<btns.length;i++){
      btns[i].addEventListener('click',function(){
        for(var j=0;j<btns.length;j++) btns[j].classList.remove('active');
        this.classList.add('active');
        cb(this.getAttribute(attr));
        sfxToggle();
      });
    }
  }
  setupToggle('botsModeToggle','data-mode',function(v){ botsSelectedMode=v; });
  setupToggle('botsTimerToggle','data-timer',function(v){ botsSelectedTimer=parseInt(v,10); });

  $('botsCreateRoomBtn').addEventListener('click',function(){
    botsMyName=$('botsName').value.trim()||'Joueur';
    cleanupOnline();
    net.host(function(code){
      botsNetRole='host'; botsMySeat=0; botsRoomCode=code;
      bs.mode=botsSelectedMode; bs.timer=botsSelectedTimer; bs.phase='lobby';
      bs.players=[{name:botsMyName, tank:'ranger', team:0}];
      bs.connected=[true]; bs.clientIds=[net.clientId];
      try{ history.replaceState(null,'','#bots?room='+code); }catch(e){}
      $('botsCodeDisplay').textContent=code;
      renderLobby();
      gotoScreen('lobby');
    });
    sfxToggle();
  });
  $('botsJoinCode').addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); $('botsJoinRoomBtn').click(); } });
  $('botsJoinRoomBtn').addEventListener('click',function(){
    botsMyName=$('botsName').value.trim()||'Joueur';
    var code=$('botsJoinCode').value.trim().toUpperCase();
    if(!code){ shake($('botsJoinCode')); return; }
    cleanupOnline();
    botsNetRole='guest';
    net.join(code, {name:botsMyName});
    sfxToggle();
  });
  $('botsCopyCodeBtn').addEventListener('click',function(){ copyText(botsRoomCode, $('botsCopyCodeBtn')); });
  $('botsCopyLinkBtn').addEventListener('click',function(){ copyText(location.origin+location.pathname+'#bots?room='+botsRoomCode, $('botsCopyLinkBtn')); });
  $('botsBackFromLobby').addEventListener('click',function(){ sfxToggle(); cleanupOnline(); gotoScreen('online'); });
  $('botsHubReturnBtn').addEventListener('click',function(){ sfxToggle(); location.hash='hub'; });
  $('botsRulesBtn').addEventListener('click',function(){ openModal('botsRulesModal'); sfxToggle(); });
  $('botsRulesModalClose').addEventListener('click',function(){ closeModal('botsRulesModal'); });
  $('botsRulesModal').addEventListener('click',function(e){ if(e.target===this) closeModal('botsRulesModal'); });

  /* ----- hôte : places ----- */
  function hostOnJoinRequest(msg){
    for(var s=1;s<bs.clientIds.length;s++){
      if(msg.clientId && bs.clientIds[s]===msg.clientId && bs.players[s]) return s;
    }
    if(bs.phase!=='lobby'){
      /* en plein combat : seul un joueur déconnecté peut reprendre sa place */
      for(s=1;s<bs.players.length;s++){
        if(bs.players[s] && !isConnected(s) && bs.players[s].name===msg.name) return s;
      }
      return 'COMBAT EN COURS — RÉESSAIE APRÈS';
    }
    if(activeSeats().length>=MODE_CAP[bs.mode]) return 'SALLE COMPLÈTE ('+MODE_CAP[bs.mode]+'/'+MODE_CAP[bs.mode]+')';
    for(s=1;s<bs.players.length;s++){ if(!bs.players[s]) return s; }
    return Math.max(1,bs.players.length);
  }
  function hostOnSeatJoined(seat, msg, isRepeat){
    var p=bs.players[seat];
    if(p){ if(msg.name) p.name=msg.name; }
    else {
      var counts=[0,0];
      bs.players.forEach(function(q){ if(q) counts[q.team]++; });
      bs.players[seat]={name:msg.name||'Joueur', tank:'ranger', team:counts[0]<=counts[1]?0:1};
    }
    bs.clientIds[seat]=msg.clientId||null;
    bs.connected[seat]=true;
    net.sendTo(seat, {type:'seat_assigned', seat:seat, mode:bs.mode, timer:bs.timer});
    hostBroadcastLobby();
    if(bs.phase!=='lobby' && bs.match) net.sendTo(seat, hostSyncMsg(seat));
    if(!isRepeat) sfxValidate();
  }
  function hostOnSeatLost(seat){
    if(bs.phase==='lobby'){
      bs.players[seat]=null; bs.clientIds[seat]=null;
    } else {
      bs.connected[seat]=false;
    }
    hostBroadcastLobby();
    if(bs.phase==='aiming') hostCheckAllLocked();
  }
  function hostOnGuestMessage(seat, msg){
    var p=bs.players[seat];
    if(!p) return;
    if(msg.type==='pick_tank' && bs.phase==='lobby' && TANKS[msg.tank]){ p.tank=msg.tank; hostBroadcastLobby(); }
    else if(msg.type==='pick_team' && bs.phase==='lobby' && (msg.team===0||msg.team===1)){ p.team=msg.team; hostBroadcastLobby(); }
    else if(msg.type==='action') hostReceiveAction(seat, msg);
  }
  function hostBroadcastLobby(){
    broadcast({type:'lobby_update', players:bs.players.slice(), connected:bs.connected.slice(),
      mode:bs.mode, timer:bs.timer, phase:bs.phase});
  }
  function hostSyncMsg(seat){
    var m=bs.match;
    return {type:'sync', grid:gridEncode(m.grid), tanks:m.tanks, waterY:m.waterY, turn:m.turn,
      mode:bs.mode, phase:bs.phase, msLeft:Math.max(0,bs.turnDeadline-Date.now()),
      locked:Object.keys(bs.actions).map(Number), myLocked:bs.actions.hasOwnProperty(seat)};
  }

  /* ----- hôte : démarrage du combat ----- */
  function lobbyProblem(){
    var seats=activeSeats(), cap=MODE_CAP[bs.mode];
    if(bs.mode==='1v1' && seats.length!==2) return 'Il faut exactement 2 joueurs.';
    if(bs.mode==='2v2'){
      if(seats.length!==4) return 'Il faut exactement 4 joueurs.';
      var c=[0,0]; seats.forEach(function(s){ c[bs.players[s].team]++; });
      if(c[0]!==2) return 'Il faut 2 joueurs dans chaque équipe.';
    }
    if(bs.mode==='ffa' && (seats.length<2 || seats.length>cap)) return 'Il faut entre 2 et '+cap+' joueurs.';
    return null;
  }
  $('botsStartBtn').addEventListener('click',function(){ sfxValidate(); hostStartMatch(); });
  function hostStartMatch(){
    if(lobbyProblem()) return;
    var seats=activeSeats();
    var grid=generateTerrain();
    var tanks=seats.map(function(s,i){
      var p=bs.players[s];
      var team = bs.mode==='2v2' ? p.team : (bs.mode==='1v1' ? i : i);
      return {seat:s, type:p.tank, team:team, name:p.name, hp:TANKS[p.tank].hp, alive:true,
        x:0, y:0, vx:0, vy:0, grounded:true, aim:Math.PI/4, cds:{atk:0, surv:0}};
    });
    /* positions de départ réparties, équipes alternées */
    var order;
    if(bs.mode==='2v2'){
      var a=tanks.filter(function(t){return t.team===0;}), b=tanks.filter(function(t){return t.team===1;});
      if(Math.random()<0.5){ var tmp=a; a=b; b=tmp; }
      order=[a[0],b[0],a[1],b[1]];
    } else order=shuffle(tanks.slice());
    order.forEach(function(t,i){
      var x=(i+0.5)/order.length*W + (Math.random()-0.5)*40;
      dropTank(grid, t, x);
      t.aim = t.x<W/2 ? Math.PI/4 : Math.PI*3/4;
    });
    bs.match={grid:grid, tanks:tanks, waterY:WATER_START, turn:0};
    bs.stats={};
    seats.forEach(function(s){ bs.stats[s]={dmg:0, kills:0}; });
    bs.phase='aiming';
    broadcast({type:'match_start', grid:gridEncode(grid), tanks:tanks, waterY:WATER_START, mode:bs.mode});
    hostBroadcastLobby();
    hostStartTurn();
  }
  function hostStartTurn(){
    var m=bs.match;
    m.turn++;
    /* mort subite : l'eau monte de plus en plus vite (8, 12, 16... px par tour) */
    if(m.turn>WATER_RISE_FROM) m.waterY=Math.max(WATER_MIN, m.waterY-(4+4*(m.turn-WATER_RISE_FROM)));
    m.tanks.forEach(function(t){
      if(t.cds.atk>0) t.cds.atk--;
      if(t.cds.surv>0) t.cds.surv--;
    });
    bs.actions={};
    bs.phase='aiming';
    bs.turnDeadline=Date.now()+bs.timer*1000;
    clearTimeout(bs.turnTimer);
    bs.turnTimer=setTimeout(hostResolveTurn, bs.timer*1000+300);
    broadcast({type:'turn_start', turn:m.turn, ms:bs.timer*1000, waterY:m.waterY, tanks:m.tanks});
  }
  function hostReceiveAction(seat, msg){
    if(bs.phase!=='aiming' || bs.actions.hasOwnProperty(seat)) return;
    var t=bs.match.tanks.filter(function(x){ return x.seat===seat; })[0];
    if(!t || !t.alive) return;
    var kind=msg.kind;
    if(['move','shot','atk','surv','pass'].indexOf(kind)===-1) return;
    if((kind==='atk'||kind==='surv') && t.cds[kind]>0) return;
    var a=+msg.a, p=+msg.p;
    if(!isFinite(a)||!isFinite(p)) return;
    bs.actions[seat]={kind:kind, a:a, p:clamp(p,0,1)};
    broadcast({type:'locked', seats:Object.keys(bs.actions).map(Number)});
    hostCheckAllLocked();
  }
  function hostCheckAllLocked(){
    if(bs.phase!=='aiming') return;
    var waiting=bs.match.tanks.filter(function(t){
      return t.alive && isConnected(t.seat) && !bs.actions.hasOwnProperty(t.seat);
    });
    if(!waiting.length){ clearTimeout(bs.turnTimer); bs.turnTimer=setTimeout(hostResolveTurn, 400); }
  }
  function hostResolveTurn(){
    if(bs.phase!=='aiming') return;
    clearTimeout(bs.turnTimer);
    bs.phase='resolving';
    var m=bs.match;
    var start=m.tanks.map(function(t){ return {seat:t.seat, x:t.x, y:t.y, hp:t.hp, alive:t.alive, aim:t.aim}; });
    var res=simulateTurn(m, bs.actions);
    /* recharges des compétences utilisées */
    m.tanks.forEach(function(t){
      var act=bs.actions[t.seat], s=TANKS[t.type];
      if(!act) return;
      if(act.kind==='atk') t.cds.atk=s.atk.cd+1;
      if(act.kind==='surv') t.cds.surv=s.surv.cd+1;
    });
    Object.keys(res.dmg).forEach(function(s){ if(bs.stats[s]) bs.stats[s].dmg+=res.dmg[s]; });
    Object.keys(res.kills).forEach(function(s){ if(bs.stats[s]) bs.stats[s].kills+=res.kills[s]; });
    var actionsShown={};
    Object.keys(bs.actions).forEach(function(s){ actionsShown[s]=bs.actions[s].kind; });
    broadcast({type:'turn_result', start:start, frames:res.frames, events:res.events, actions:actionsShown,
      final:{grid:gridEncode(m.grid), tanks:m.tanks, waterY:m.waterY}});
    var animMs=res.frames.length*FRAME_EVERY/TPS*1000+1200;
    clearTimeout(bs.nextTimer);
    bs.nextTimer=setTimeout(function(){
      var teams={};
      m.tanks.forEach(function(t){ if(t.alive) teams[t.team]=true; });
      var alive=Object.keys(teams);
      if(alive.length<=1){
        bs.phase='ended';
        var winners=m.tanks.filter(function(t){ return alive.length && String(t.team)===alive[0]; }).map(function(t){ return t.seat; });
        broadcast({type:'match_end', winners:winners, draw:!alive.length, stats:bs.stats, tanks:m.tanks, mode:bs.mode});
        hostBroadcastLobby();
      } else {
        hostStartTurn();
      }
    }, animMs);
  }
  $('botsRematchBtn').addEventListener('click',function(){
    sfxToggle();
    bs.phase='lobby'; bs.match=null;
    /* les joueurs partis pendant le combat libèrent leur place */
    for(var s=1;s<bs.players.length;s++){ if(bs.players[s] && !isConnected(s)){ bs.players[s]=null; bs.clientIds[s]=null; } }
    hostBroadcastLobby();
    gotoScreen('lobby');
  });

  /* ===================== MESSAGES ===================== */
  function handleMsg(msg){
    if(!msg || !msg.type) return;
    switch(msg.type){
      case 'room_full': botsSetNetStatus('error', msg.reason||'SALLE COMPLÈTE'); break;
      case 'seat_assigned':
        botsMySeat=msg.seat; botsRoomCode=net.code;
        bs.mode=msg.mode; bs.timer=msg.timer;
        $('botsCodeDisplay').textContent=botsRoomCode;
        gotoScreen('lobby');
        break;
      case 'lobby_update':
        bs.players=msg.players.slice(); bs.connected=msg.connected.slice();
        bs.mode=msg.mode; bs.timer=msg.timer;
        var wasPhase=bs.phase;
        bs.phase=msg.phase;
        renderLobby();
        renderRoster();
        if(msg.phase==='lobby' && wasPhase!=='lobby') gotoScreen('lobby');
        break;
      case 'match_start':
        view.grid=gridDecode(msg.grid); view.tanks=msg.tanks; view.waterY=msg.waterY; view.mode=msg.mode;
        view.projs=[]; view.particles=[]; view.texts=[]; view.replay=null; view.turn=0;
        terrainDirty=true;
        gotoScreen('battle');
        break;
      case 'sync':
        view.grid=gridDecode(msg.grid); view.tanks=msg.tanks; view.waterY=msg.waterY; view.mode=msg.mode;
        view.turn=msg.turn; view.replay=null; view.projs=[]; terrainDirty=true;
        lockedSeats=msg.locked||[];
        gotoScreen('battle');
        if(msg.phase==='aiming') beginAiming(msg.msLeft, !!msg.myLocked);
        else { view.phase='resolving'; setTurnStatus('Résolution du tour en cours...'); }
        break;
      case 'turn_start':
        view.tanks=msg.tanks; view.waterY=msg.waterY; view.turn=msg.turn;
        lockedSeats=[];
        beginAiming(msg.ms, false);
        break;
      case 'locked':
        lockedSeats=msg.seats; renderRoster(); renderTurnStatus();
        break;
      case 'turn_result': startReplay(msg); break;
      case 'match_end': showEnd(msg); break;
      case 'room_closed':
        net.close();
        showLostModal("L'hôte a fermé la salle.");
        break;
    }
  }

  /* ===================== LOBBY (affichage) ===================== */
  function gotoScreen(name){
    var all=document.querySelectorAll('.bots-screen');
    for(var i=0;i<all.length;i++) all[i].classList.remove('active');
    $('bots-screen-'+name).classList.add('active');
    if(name!=='battle') $('botsTurnBadge').style.display='none';
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function playerColor(seat, team){
    if(bs.mode==='ffa' || view.mode==='ffa'){
      var idx=0;
      for(var s=0;s<seat;s++) if(bs.players[s]) idx++;
      return FFA_COLORS[idx%FFA_COLORS.length];
    }
    return TEAM_COLORS[team||0];
  }
  function renderTankCards(){
    var me=bs.players[botsMySeat];
    var grid=$('botsTankGrid');
    if(grid.childElementCount!==TANK_ORDER.length){
      grid.innerHTML='';
      TANK_ORDER.forEach(function(key){
        var s=TANKS[key];
        var card=document.createElement('div');
        card.className='bots-tank-card';
        card.setAttribute('data-tank',key);
        card.innerHTML='<canvas width="120" height="54"></canvas>'+
          '<div class="bots-tank-role">'+s.role+'</div><h4>'+s.name+'</h4>'+
          stat('PV', s.stats.hp, s.hp)+stat('Mobilité', s.stats.speed)+stat('Puissance', s.stats.power)+
          '<div class="bots-skill">'+s.atk.ico+' <b>'+s.atk.name+'</b> ('+plural(s.atk.cd)+') — '+s.atk.desc+'</div>'+
          '<div class="bots-skill">'+s.surv.ico+' <b>'+s.surv.name+'</b> ('+plural(s.surv.cd)+') — '+s.surv.desc+'</div>';
        card.addEventListener('click',function(){
          sfxToggle();
          if(botsNetRole==='host'){ bs.players[0].tank=key; hostBroadcastLobby(); }
          else net.send({type:'pick_tank', tank:key});
        });
        grid.appendChild(card);
        var c=card.querySelector('canvas').getContext('2d');
        drawTank(c, {type:key, x:60, y:36, aim:Math.PI/5, alive:true}, '#E60012', 1.35);
      });
    }
    var cards=grid.querySelectorAll('.bots-tank-card');
    for(var i=0;i<cards.length;i++) cards[i].classList.toggle('selected', !!me && cards[i].getAttribute('data-tank')===me.tank);
    function plural(n){ return 'recharge '+n+' tour'+(n>1?'s':''); }
    function stat(label, v, n){
      return '<div class="bots-stat"><span>'+label+(n?' '+n:'')+'</span><div class="bots-stat-bar"><i style="width:'+Math.round(v*100)+'%"></i></div></div>';
    }
  }
  (function(){
    var btns=$('botsTeamPicker').querySelectorAll('button');
    for(var i=0;i<btns.length;i++){
      btns[i].addEventListener('click',function(){
        var team=parseInt(this.getAttribute('data-team'),10);
        sfxToggle();
        if(botsNetRole==='host'){ bs.players[0].team=team; hostBroadcastLobby(); }
        else net.send({type:'pick_team', team:team});
      });
    }
  })();
  function renderLobby(){
    $('botsLobbyTitle').textContent='LOBBY — '+MODE_LABEL[bs.mode];
    renderTankCards();
    var me=bs.players[botsMySeat];
    $('botsTeamPicker').style.display = bs.mode==='2v2' ? 'block' : 'none';
    var tb=$('botsTeamPicker').querySelectorAll('button');
    for(var i=0;i<tb.length;i++) tb[i].classList.toggle('active', !!me && me.team===parseInt(tb[i].getAttribute('data-team'),10));
    var html='';
    for(var s=0;s<bs.players.length;s++){
      var p=bs.players[s];
      if(!p) continue;
      var off=!isConnected(s);
      var col = bs.mode==='2v2' ? TEAM_COLORS[p.team] : playerColor(s, s===0?0:1);
      html+='<div class="cham-player-row filled'+(off?' offline':'')+'"><span class="cham-player-dot" style="background:'+col+';"></span>'+
        '<span class="cham-player-name">'+escapeHtml(p.name)+(s===botsMySeat?' (toi)':'')+(off?'<span class="imp-tag">déconnecté(e)</span>':'')+'</span>'+
        '<span class="imp-tag">'+TANKS[p.tank].name+(bs.mode==='2v2'?(p.team?' · BLEU':' · ROUGE'):'')+'</span></div>';
    }
    $('botsPlayerList').innerHTML=html;
    var problem= botsNetRole==='host' ? lobbyProblem() : null;
    var st=$('botsLobbyStatus');
    if(bs.phase!=='lobby') st.textContent='Combat en cours...';
    else if(botsNetRole==='host') st.textContent = problem || 'Tout le monde est prêt. Lance le combat !';
    else st.textContent="Choisis ton tank. L'hôte lancera le combat.";
    $('botsStartBtn').style.display = (botsNetRole==='host' && bs.phase==='lobby' && !problem) ? 'inline-block' : 'none';
  }

  /* ===================== TOUR : VISÉE ===================== */
  function myTank(){
    for(var i=0;i<view.tanks.length;i++) if(view.tanks[i].seat===botsMySeat) return view.tanks[i];
    return null;
  }
  function actionDefs(t){
    var s=TANKS[t.type];
    return [
      {kind:'move', ico:'🦘', name:'Saut', sub:'Puissance = hauteur', aim:true, cd:0},
      {kind:'shot', ico:SHOT.ico, name:SHOT.name, sub:SHOT.dmg+' dégâts', aim:true, cd:0},
      {kind:'atk', ico:s.atk.ico, name:s.atk.name, sub:'Attaque', aim:s.atk.aim, cd:t.cds.atk},
      {kind:'surv', ico:s.surv.ico, name:s.surv.name, sub:'Survie', aim:s.surv.aim, cd:t.cds.surv}
    ];
  }
  function beginAiming(ms, alreadyLocked){
    view.phase='aiming'; view.replay=null; view.projs=[];
    turnEndsAt=Date.now()+ms;
    var t=myTank();
    aim.kind=null; aim.set=false; aim.locked=alreadyLocked; aim.dragging=false;
    if(t){ aim.a=t.aim; aim.p=0.6; }
    $('botsTurnBadge').textContent='TOUR '+view.turn;
    $('botsTurnBadge').style.display='inline-block';
    renderActionBar();
    renderRoster();
    renderTurnStatus();
    if(t && t.alive && !alreadyLocked) sfxToggle();
  }
  function renderActionBar(){
    var t=myTank(), bar=$('botsActionBar');
    if(!t || !t.alive || view.phase!=='aiming' || aim.locked){
      bar.innerHTML=''; $('botsLockBtn').style.display='none'; renderAimInfo(); return;
    }
    $('botsLockBtn').style.display='inline-block';
    var html='';
    actionDefs(t).forEach(function(d){
      var cd=d.cd>0;
      html+='<button class="bots-action-btn'+(aim.kind===d.kind?' active':'')+'" data-kind="'+d.kind+'"'+(cd?' disabled':'')+'>'+
        (cd?'<span class="cd">'+d.cd+'</span>':'')+'<span class="ico">'+d.ico+'</span>'+escapeHtml(d.name)+'<small>'+(cd?'recharge : '+d.cd+' tour(s)':d.sub)+'</small></button>';
    });
    bar.innerHTML=html;
    var btns=bar.querySelectorAll('.bots-action-btn');
    for(var i=0;i<btns.length;i++){
      btns[i].addEventListener('click',function(){
        aim.kind=this.getAttribute('data-kind');
        var def=actionDefs(t).filter(function(d){ return d.kind===aim.kind; })[0];
        aim.set=!def.aim || aim.set;
        sfxToggle();
        renderActionBar();
      });
    }
    $('botsLockBtn').disabled=!(aim.kind && aim.set);
    renderAimInfo();
  }
  function currentDef(){
    var t=myTank();
    if(!t || !aim.kind) return null;
    return actionDefs(t).filter(function(d){ return d.kind===aim.kind; })[0];
  }
  function renderAimInfo(){
    var el=$('botsAimInfo'), t=myTank();
    if(view.phase!=='aiming'){ el.textContent=''; return; }
    if(!t || !t.alive){ el.textContent= t ? '💀 Ton tank est détruit — tu regardes la suite du combat.' : '👀 Tu regardes le combat.'; return; }
    if(aim.locked){ el.textContent='✅ Action validée. En attente des autres joueurs...'; return; }
    var d=currentDef();
    if(!d){ el.textContent='Choisis une action ci-dessous.'; return; }
    if(!d.aim){ el.textContent=d.ico+' '+d.name+' : pas besoin de viser, valide !'; return; }
    if(!aim.set){ el.textContent='🎯 Glisse depuis ton tank sur le terrain pour orienter la flèche (longueur = puissance).'; return; }
    var deg=Math.round(aim.a*180/Math.PI);
    el.textContent=d.ico+' '+d.name+' — angle '+deg+'° — puissance '+Math.round(aim.p*100)+' %';
  }
  $('botsLockBtn').addEventListener('click',function(){
    var d=currentDef();
    if(!d || (d.aim && !aim.set) || aim.locked || view.phase!=='aiming') return;
    aim.locked=true;
    var msg={type:'action', kind:aim.kind, a:aim.a, p:aim.p};
    if(botsNetRole==='host') hostReceiveAction(0, msg); else net.send(msg);
    var t=myTank(); if(t && d.aim) t.aim=aim.a;
    sfxValidate();
    renderActionBar();
  });
  function renderTurnStatus(){
    var alive=view.tanks.filter(function(t){ return t.alive; });
    var n=alive.filter(function(t){ return lockedSeats.indexOf(t.seat)!==-1; }).length;
    if(view.phase==='aiming') setTurnStatus(n+' / '+alive.length+' actions validées');
  }
  function setTurnStatus(t){ $('botsTurnStatus').textContent=t; }
  function renderRoster(){
    if(!view.tanks.length){ $('botsRoster').innerHTML=''; return; }
    var html='';
    view.tanks.forEach(function(t){
      var s=TANKS[t.type], col=tankColor(t);
      var st = !t.alive ? '💀' : (!isConnected(t.seat) ? '📡' : (view.phase==='aiming' ? (lockedSeats.indexOf(t.seat)!==-1?'✅':'⏳') : ''));
      html+='<div class="bots-roster-item'+(t.alive?'':' dead')+'"><span class="st">'+st+'</span>'+
        '<b style="color:'+col+'">'+escapeHtml(t.name)+'</b>'+(t.seat===botsMySeat?' (toi)':'')+'<br><span class="imp-tag" style="margin:0">'+s.name+' · '+t.hp+' / '+s.hp+' PV</span>'+
        '<div class="hp"><i style="width:'+Math.round(t.hp/s.hp*100)+'%;background:'+col+'"></i></div></div>';
    });
    $('botsRoster').innerHTML=html;
  }
  function tankColor(t){
    if(view.mode==='ffa') return FFA_COLORS[t.team%FFA_COLORS.length];
    return TEAM_COLORS[t.team%2];
  }

  /* ----- caméra : sur petit écran, zoom sur son tank pendant la visée,
     vue d'ensemble pendant l'action. Le bouton force l'une ou l'autre. ----- */
  var canvas=$('botsCanvas'), ctx=canvas.getContext('2d');
  var cam={zoom:1, cx:W/2, cy:H/2, mode:'auto'};
  function camTarget(){
    var small=canvas.getBoundingClientRect().width<700;
    var close = cam.mode==='close' || (cam.mode==='auto' && small && view.phase==='aiming');
    var t=myTank();
    if(!t || !t.alive) t=view.tanks.filter(function(x){ return x.alive; })[0];
    var z = close && t ? 2 : 1;
    var cx=t?t.x:W/2, cy=t?t.y-40:H/2;
    var hw=W/2/z, hh=H/2/z;
    return {zoom:z, cx:clamp(cx,hw,W-hw), cy:clamp(cy,hh,H-hh)};
  }
  function updateCamera(dt, snap){
    var tg=camTarget(), k=snap?1:Math.min(1,dt*5);
    cam.zoom+=(tg.zoom-cam.zoom)*k; cam.cx+=(tg.cx-cam.cx)*k; cam.cy+=(tg.cy-cam.cy)*k;
    var hw=W/2/cam.zoom, hh=H/2/cam.zoom;
    cam.cx=clamp(cam.cx,hw,W-hw); cam.cy=clamp(cam.cy,hh,H-hh);
  }
  function applyCamera(){ ctx.setTransform(cam.zoom,0,0,cam.zoom, W/2-cam.cx*cam.zoom, H/2-cam.cy*cam.zoom); }
  $('botsZoomBtn').addEventListener('click',function(){
    var small=canvas.getBoundingClientRect().width<700;
    var zoomedNow=cam.zoom>1.5;
    cam.mode = zoomedNow ? 'overview' : 'close';
    if(cam.mode==='overview' && !small) cam.mode='auto';
    sfxToggle();
  });
  function canvasPoint(evt){
    var r=canvas.getBoundingClientRect();
    var px=(evt.clientX-r.left)*W/r.width, py=(evt.clientY-r.top)*H/r.height;
    /* écran -> monde (on inverse la caméra) */
    return {x:(px-(W/2-cam.cx*cam.zoom))/cam.zoom, y:(py-(H/2-cam.cy*cam.zoom))/cam.zoom};
  }
  function updateAimFrom(evt){
    var t=myTank(); if(!t) return;
    var s=TANKS[t.type], pt=canvasPoint(evt);
    var ox=t.x, oy=t.y-s.h/2;
    var dx=pt.x-ox, dy=oy-pt.y, len=Math.sqrt(dx*dx+dy*dy);
    if(len<4) return;
    aim.a=Math.atan2(dy,dx);
    aim.p=clamp(len/AIM_MAX_LEN, 0.05, 1);
    aim.set=true;
    $('botsLockBtn').disabled=false;
    renderAimInfo();
  }
  canvas.addEventListener('pointerdown',function(evt){
    var d=currentDef(), t=myTank();
    if(view.phase!=='aiming' || aim.locked || !t || !t.alive) return;
    if(!d){ setTurnStatus('👇 Choisis d’abord une action.'); return; }
    if(!d.aim) return;
    aim.dragging=true;
    try{ canvas.setPointerCapture(evt.pointerId); }catch(e){}
    updateAimFrom(evt);
    evt.preventDefault();
  });
  canvas.addEventListener('pointermove',function(evt){ if(aim.dragging){ updateAimFrom(evt); evt.preventDefault(); } });
  function endDrag(){ if(aim.dragging){ aim.dragging=false; renderActionBar(); } }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  /* ===================== REPLAY ===================== */
  function startReplay(msg){
    view.phase='resolving';
    aim.kind=null; aim.dragging=false;
    renderActionBar();
    /* on repart de l'état de début de tour envoyé par l'hôte */
    msg.start.forEach(function(st){
      var t=view.tanks.filter(function(x){ return x.seat===st.seat; })[0];
      if(t){ t.x=st.x; t.y=st.y; t.hp=st.hp; t.alive=st.alive; }
    });
    view.tanks.forEach(function(t){
      var k=msg.actions[t.seat];
      t.lastAction=k||null;
      var f=msg.final.tanks.filter(function(x){ return x.seat===t.seat; })[0];
      if(f && k && k!=='pass' && k!=='move') t.aim=f.aim;
    });
    view.replay={msg:msg, start:performance.now(), evIdx:0};
    var names=[];
    view.tanks.forEach(function(t){
      if(!t.alive) return;
      var k=msg.actions[t.seat];
      names.push(t.name+' : '+(k?actionLabel(t,k):'rien'));
    });
    setTurnStatus('⚡ '+names.join(' · '));
  }
  function actionLabel(t,k){
    var s=TANKS[t.type];
    if(k==='move') return 'saut'; if(k==='shot') return 'tir';
    if(k==='atk') return s.atk.name.toLowerCase(); if(k==='surv') return s.surv.name.toLowerCase();
    return 'rien';
  }
  function stepReplay(now){
    var r=view.replay; if(!r) return;
    var msg=r.msg, frames=msg.frames;
    var tick=(now-r.start)/1000*TPS;
    /* événements arrivés à ce moment */
    while(r.evIdx<msg.events.length && msg.events[r.evIdx].t<=tick){
      applyEvent(msg.events[r.evIdx]);
      r.evIdx++;
    }
    var last=frames[frames.length-1];
    if(tick>=last.t){
      while(r.evIdx<msg.events.length){ applyEvent(msg.events[r.evIdx]); r.evIdx++; }
      finishReplay(msg);
      return;
    }
    var i=0;
    while(i<frames.length-1 && frames[i+1].t<=tick) i++;
    var a=frames[i], b=frames[Math.min(i+1,frames.length-1)];
    var f=b.t>a.t ? (tick-a.t)/(b.t-a.t) : 0;
    view.tanks.forEach(function(t,idx){
      t.x=a.k[idx*2]+(b.k[idx*2]-a.k[idx*2])*f;
      t.y=a.k[idx*2+1]+(b.k[idx*2+1]-a.k[idx*2+1])*f;
    });
    var projs=[], bmap={};
    for(var j=0;j<b.p.length;j+=3) bmap[b.p[j]]=[b.p[j+1],b.p[j+2]];
    for(j=0;j<a.p.length;j+=3){
      var id=a.p[j], ax=a.p[j+1], ay=a.p[j+2], nb=bmap[id];
      projs.push(nb ? {x:ax+(nb[0]-ax)*f, y:ay+(nb[1]-ay)*f} : {x:ax, y:ay});
    }
    view.projs=projs;
  }
  function applyEvent(e){
    var t;
    if(e.type==='boom'){
      carve(view.grid, e.x, e.y, e.r, e.wr);
      terrainDirty=true;
      addExplosion(e.x, e.y, e.r);
      CG.sfxWhoosh();
    } else if(e.type==='wall'){
      e.cells.forEach(function(i){ view.grid[i]=STONE; });
      terrainDirty=true;
    } else if(e.type==='dmg'){
      t=findViewTank(e.seat);
      if(t){ t.hp=Math.max(0,t.hp-e.n); addText(t.x, t.y-30, '-'+e.n, '#FF0033'); }
      renderRoster();
    } else if(e.type==='heal'){
      t=findViewTank(e.seat);
      if(t){ t.hp+=e.n; addText(t.x, t.y-30, '+'+e.n, '#7cff6e'); }
      renderRoster();
    } else if(e.type==='kill'){
      t=findViewTank(e.seat);
      if(t){ t.alive=false; addExplosion(t.x, t.y, 34); addText(t.x, t.y-46, 'K.O. !', '#FFE600'); }
      renderRoster();
    } else if(e.type==='splash'){
      for(var i=0;i<8;i++) view.particles.push({x:e.x, y:e.y, vx:(Math.random()-0.5)*120, vy:-80-Math.random()*120, life:0.7, max:0.7, c:'#9ad7ff', s:3});
    }
  }
  function findViewTank(seat){ return view.tanks.filter(function(x){ return x.seat===seat; })[0]; }
  function finishReplay(msg){
    view.replay=null; view.projs=[];
    view.grid=gridDecode(msg.final.grid); terrainDirty=true;
    view.tanks=msg.final.tanks; view.waterY=msg.final.waterY;
    renderRoster();
    setTurnStatus('Préparation du tour suivant...');
  }
  function addExplosion(x,y,r){
    view.particles.push({ring:true, x:x, y:y, r:r, life:0.45, max:0.45});
    for(var i=0;i<14;i++){
      var a=Math.random()*Math.PI*2, sp=60+Math.random()*180;
      view.particles.push({x:x, y:y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp-60, life:0.5+Math.random()*0.4, max:0.9,
        c:Math.random()<0.5?'#FFE600':'#FF0033', s:2+Math.random()*3});
    }
  }
  function addText(x,y,txt,c){ view.texts.push({x:x, y:y, txt:txt, c:c, life:1.3}); }

  /* ===================== FIN DE COMBAT ===================== */
  function showEnd(msg){
    view.phase='ended';
    var mine=msg.winners.indexOf(botsMySeat)!==-1;
    var names=msg.tanks.filter(function(t){ return msg.winners.indexOf(t.seat)!==-1; }).map(function(t){ return t.name; });
    var banner=$('botsEndBanner');
    if(msg.draw){ banner.textContent='💥 DESTRUCTION MUTUELLE !'; banner.className='cham-result-banner b-meh'; }
    else { banner.textContent= mine ? '🏆 VICTOIRE !' : '💀 DÉFAITE...'; banner.className='cham-result-banner '+(mine?'b-perfect':'b-fail'); }
    $('botsEndText').innerHTML = msg.draw ? 'Aucun survivant.' : ('Vainqueur'+(names.length>1?'s':'')+' : <b>'+names.map(escapeHtml).join(' & ')+'</b>');
    var rows=msg.tanks.slice().sort(function(a,b){ return (msg.stats[b.seat]||{}).dmg-(msg.stats[a.seat]||{}).dmg; });
    var html='';
    rows.forEach(function(t){
      var st=msg.stats[t.seat]||{dmg:0,kills:0};
      html+='<div class="cham-player-row filled"><span class="cham-player-dot" style="background:'+tankColor(t)+';"></span>'+
        '<span class="cham-player-name">'+escapeHtml(t.name)+(msg.winners.indexOf(t.seat)!==-1?' 🏆':'')+'<span class="imp-tag">'+TANKS[t.type].name+(t.alive?'':' · détruit')+'</span></span>'+
        '<span class="imp-tag">'+st.kills+' K.O.</span><span class="cham-vote-count">'+st.dmg+' dégâts</span></div>';
    });
    $('botsEndList').innerHTML=html;
    var host=botsNetRole==='host';
    $('botsRematchBtn').style.display=host?'inline-block':'none';
    $('botsEndWaitLabel').style.display=host?'none':'inline-block';
    $('botsEndWaitLabel').textContent="⏳ En attente que l'hôte relance...";
    sfxReveal(mine?100:0);
    gotoScreen('end');
  }

  /* ===================== RENDU ===================== */
  var terrainCanvas=document.createElement('canvas');
  terrainCanvas.width=GW; terrainCanvas.height=GH;
  var tctx=terrainCanvas.getContext('2d');
  var terrainDirty=true;
  function rebuildTerrain(){
    var img=tctx.createImageData(GW,GH), d=img.data, g=view.grid;
    for(var cy=0;cy<GH;cy++) for(var cx=0;cx<GW;cx++){
      var i=cy*GW+cx, v=g[i], o=i*4;
      if(v===EMPTY){ d[o+3]=0; continue; }
      var top=cy===0 || g[i-GW]===EMPTY;
      var n=((cx*7+cy*13)%5);
      if(v===DIRT){
        if(top){ d[o]=230; d[o+1]=0; d[o+2]=18; }
        else { var stripe=((cx+cy)%9)<2; d[o]=stripe?70:44+n*3; d[o+1]=stripe?10:12; d[o+2]=stripe?16:18; }
      } else {
        var edge=top || gridGet(g,cx-1,cy)===EMPTY || gridGet(g,cx+1,cy)===EMPTY;
        var c=edge?235:170+n*8; d[o]=c; d[o+1]=c; d[o+2]=c-4;
      }
      d[o+3]=255;
    }
    tctx.putImageData(img,0,0);
    terrainDirty=false;
  }
  function drawBackground(){
    var gr=ctx.createLinearGradient(0,0,0,H);
    gr.addColorStop(0,'#160306'); gr.addColorStop(1,'#050505');
    ctx.fillStyle=gr; ctx.fillRect(0,0,W,H);
    ctx.save();
    ctx.globalAlpha=0.07; ctx.strokeStyle='#E60012'; ctx.lineWidth=14;
    for(var x=-H;x<W;x+=60){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x+H,H); ctx.stroke(); }
    ctx.restore();
  }
  function drawWater(time){
    var y=view.waterY;
    ctx.fillStyle='rgba(12,30,60,0.92)';
    ctx.fillRect(0,y,W,H-y);
    ctx.strokeStyle='rgba(180,220,255,0.7)'; ctx.lineWidth=2;
    ctx.beginPath();
    for(var x=0;x<=W;x+=8){
      var wy=y+Math.sin(x/28+time/400)*3;
      if(x===0) ctx.moveTo(x,wy); else ctx.lineTo(x,wy);
    }
    ctx.stroke();
  }
  /* dessine un tank ; scale sert aux aperçus du lobby */
  function drawTank(c, t, color, scale){
    var s=TANKS[t.type], k=scale||1, w=s.w*k, h=s.h*k;
    var x=t.x, y=t.y;
    c.save();
    if(!t.alive) c.globalAlpha=0.35;
    /* canon */
    var a=t.aim, len=(s.w*0.62)*k;
    c.strokeStyle='#111'; c.lineWidth=(t.type==='titan'?7:5)*k; c.lineCap='round';
    c.beginPath(); c.moveTo(x, y-h*0.35); c.lineTo(x+Math.cos(a)*len, y-h*0.35-Math.sin(a)*len); c.stroke();
    c.strokeStyle='#ddd'; c.lineWidth=(t.type==='titan'?4:2.5)*k;
    c.beginPath(); c.moveTo(x, y-h*0.35); c.lineTo(x+Math.cos(a)*len, y-h*0.35-Math.sin(a)*len); c.stroke();
    /* chenilles */
    c.fillStyle='#111';
    roundRect(c, x-w/2, y+h*0.05, w, h*0.45, 4*k); c.fill();
    c.fillStyle='#555';
    for(var i=0;i<4;i++){ c.beginPath(); c.arc(x-w/2+w*(i+0.5)/4, y+h*0.28, h*0.13, 0, Math.PI*2); c.fill(); }
    /* caisse + tourelle */
    c.fillStyle=color; c.strokeStyle='#000'; c.lineWidth=2*k;
    roundRect(c, x-w/2+2*k, y-h*0.3, w-4*k, h*0.42, 3*k); c.fill(); c.stroke();
    c.beginPath(); c.arc(x, y-h*0.3, h*0.33, Math.PI, 0); c.fill(); c.stroke();
    c.fillStyle='#000';
    c.fillRect(x-w*0.3, y-h*0.15, w*0.6, 2*k);
    c.restore();
  }
  function roundRect(c,x,y,w,h,r){
    c.beginPath(); c.moveTo(x+r,y); c.lineTo(x+w-r,y); c.quadraticCurveTo(x+w,y,x+w,y+r);
    c.lineTo(x+w,y+h-r); c.quadraticCurveTo(x+w,y+h,x+w-r,y+h); c.lineTo(x+r,y+h); c.quadraticCurveTo(x,y+h,x,y+h-r);
    c.lineTo(x,y+r); c.quadraticCurveTo(x,y,x+r,y); c.closePath();
  }
  function drawTankLabel(t){
    var s=TANKS[t.type], col=tankColor(t);
    var y=t.y-s.h/2-24;
    ctx.font='bold 12px Oswald, sans-serif'; ctx.textAlign='center';
    ctx.fillStyle='#000'; ctx.fillText(t.name, t.x+1, y+1);
    ctx.fillStyle=t.seat===botsMySeat?'#FFE600':'#fff'; ctx.fillText(t.name, t.x, y);
    if(!t.alive) return;
    var bw=36, frac=t.hp/s.hp;
    ctx.fillStyle='#000'; ctx.fillRect(t.x-bw/2-1, y+4, bw+2, 6);
    ctx.fillStyle=col; ctx.fillRect(t.x-bw/2, y+5, bw*frac, 4);
    if(view.phase==='aiming' && lockedSeats.indexOf(t.seat)!==-1){
      ctx.fillStyle='#7cff6e'; ctx.fillText('✔', t.x+bw/2+9, y+11);
    }
  }
  function drawAimArrow(){
    var t=myTank(), d=currentDef();
    if(view.phase!=='aiming' || !t || !t.alive || !d || !d.aim || !aim.set) return;
    var s=TANKS[t.type], ox=t.x, oy=t.y-s.h/2;
    var len=20+aim.p*(AIM_MAX_LEN-20), v=aimVec(aim.a);
    var ex=ox+v.x*len, ey=oy+v.y*len;
    var thick=3+aim.p*9;
    var col = aim.locked ? 'rgba(124,255,110,0.9)' : (d.kind==='move'||d.kind==='surv' ? '#00e5ff' : '#FFE600');
    ctx.save();
    ctx.strokeStyle='#000'; ctx.lineWidth=thick+4; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(ox,oy); ctx.lineTo(ex,ey); ctx.stroke();
    ctx.strokeStyle=col; ctx.lineWidth=thick;
    ctx.beginPath(); ctx.moveTo(ox,oy); ctx.lineTo(ex,ey); ctx.stroke();
    var hs=10+aim.p*12, ang=Math.atan2(ey-oy, ex-ox);
    ctx.fillStyle=col; ctx.strokeStyle='#000'; ctx.lineWidth=2;
    ctx.beginPath();
    ctx.moveTo(ex+Math.cos(ang)*hs, ey+Math.sin(ang)*hs);
    ctx.lineTo(ex+Math.cos(ang+2.4)*hs, ey+Math.sin(ang+2.4)*hs);
    ctx.lineTo(ex+Math.cos(ang-2.4)*hs, ey+Math.sin(ang-2.4)*hs);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.font='bold 14px Oswald, sans-serif'; ctx.textAlign='center';
    ctx.fillStyle='#000'; ctx.fillText(Math.round(aim.p*100)+'%', ex+1, ey-hs-5);
    ctx.fillStyle='#fff'; ctx.fillText(Math.round(aim.p*100)+'%', ex, ey-hs-6);
    ctx.restore();
  }
  var lastFrame=performance.now();
  function render(now){
    requestAnimationFrame(render);
    if(!$('bots-screen-battle').classList.contains('active') || !view.grid) return;
    var dt=Math.min(0.05,(now-lastFrame)/1000); lastFrame=now;
    stepReplay(now);
    if(terrainDirty) rebuildTerrain();
    updateCamera(dt, false);
    ctx.setTransform(1,0,0,1,0,0);
    drawBackground();
    applyCamera();
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(terrainCanvas,0,0,W,H);
    view.tanks.forEach(function(t){ drawTank(ctx, t, tankColor(t), 1); });
    view.tanks.forEach(drawTankLabel);
    /* obus */
    view.projs.forEach(function(p){
      ctx.fillStyle='#000'; ctx.beginPath(); ctx.arc(p.x,p.y,5,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#FFE600'; ctx.beginPath(); ctx.arc(p.x,p.y,3,0,Math.PI*2); ctx.fill();
    });
    drawWater(now);
    /* particules */
    view.particles=view.particles.filter(function(p){
      p.life-=dt;
      if(p.life<=0) return false;
      if(p.ring){
        var k=1-p.life/p.max;
        ctx.strokeStyle='rgba(255,230,0,'+(1-k)+')'; ctx.lineWidth=4;
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r*(0.4+k*0.8),0,Math.PI*2); ctx.stroke();
        ctx.fillStyle='rgba(255,0,51,'+(0.5*(1-k))+')';
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r*(0.3+k*0.6),0,Math.PI*2); ctx.fill();
      } else {
        p.vy+=300*dt; p.x+=p.vx*dt; p.y+=p.vy*dt;
        ctx.globalAlpha=Math.max(0,p.life/p.max);
        ctx.fillStyle=p.c; ctx.fillRect(p.x-p.s/2,p.y-p.s/2,p.s,p.s);
        ctx.globalAlpha=1;
      }
      return true;
    });
    view.texts=view.texts.filter(function(tx){
      tx.life-=dt; tx.y-=28*dt;
      if(tx.life<=0) return false;
      ctx.globalAlpha=Math.min(1,tx.life);
      ctx.font='bold 20px "Bebas Neue", Oswald, sans-serif'; ctx.textAlign='center';
      ctx.fillStyle='#000'; ctx.fillText(tx.txt, tx.x+2, tx.y+2);
      ctx.fillStyle=tx.c; ctx.fillText(tx.txt, tx.x, tx.y);
      ctx.globalAlpha=1;
      return true;
    });
    drawAimArrow();
    ctx.setTransform(1,0,0,1,0,0);
    $('botsZoomBtn').querySelector('span').textContent = cam.zoom>1.5 ? '🗺 Vue d\u2019ensemble' : '🔍 Zoom sur mon tank';
    /* chrono */
    if(view.phase==='aiming'){
      var left=Math.max(0, turnEndsAt-Date.now());
      $('botsTimerFill').style.width=(left/(bs.timer*1000)*100)+'%';
      $('botsTimerText').textContent='TOUR '+view.turn+' — '+Math.ceil(left/1000)+' s';
    } else if(view.phase==='resolving'){
      $('botsTimerFill').style.width='0%';
      $('botsTimerText').textContent='TOUR '+view.turn+' — ACTION !';
    }
    if(view.waterY<WATER_START && view.phase==='aiming'){
      ctx.font='bold 14px Oswald, sans-serif'; ctx.textAlign='right';
      ctx.fillStyle='#9ad7ff'; ctx.fillText('🌊 L’eau monte !', W-10, 20);
    }
  }
  requestAnimationFrame(render);

  /* ---------- API pour le hub ---------- */
  CG.bots = {
    reset: function(){
      if(botsNetRole) cleanupOnline();
      closeModal('botsDisconnectModal');
      gotoScreen('online');
    },
    enterJoinFlow: function(code){
      gotoScreen('online');
      $('botsJoinCode').value=decodeURIComponent(code).toUpperCase();
    },
    /* exposé pour les tests */
    _simulate: simulateTurn, _generate: generateTerrain, _drop: dropTank
  };
})();
