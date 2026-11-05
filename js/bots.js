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
  var MAPS=CG.botsMaps.MAPS;
  var AIM_MAX_LEN=170;             /* longueur de flèche à 100 % (unités du canvas) */
  var BOTS_ROOM_PREFIX='cgbots-';
  var MODE_LABEL={'1v1':'1 VS 1','2v2':'2 VS 2','ffa':'CHACUN POUR SOI','surv':'SURVIE CONTRE LES BOTS'};
  var MODE_CAP={'1v1':2,'2v2':4,'ffa':6,'surv':4};
  var AI_SEAT=100;                 /* tanks pilotés par l'ordinateur : places 100, 101... */
  var AI_COLOR='#8d939c';
  var SURV_WATER_FROM=30;          /* en survie, l'eau ne monte qu'à partir du tour 30 */

  /* Personnalisation : couleur de carrosserie (hors 2 VS 2, où c'est la couleur
     d'équipe) et accessoire sur le tank. Gardée dans le navigateur. */
  var PAINTS=['#E60012','#2E6FF2','#FFE600','#7cff6e','#ff6ec7','#ff9d2f','#00e5ff','#b388ff','#f4f4f4','#3b3b3b'];
  var ACCS={none:'Aucun', crown:'👑 Couronne', horns:'😈 Cornes', cap:'🧢 Casquette', flag:'🏴‍☠️ Drapeau', halo:'😇 Auréole'};
  var ACC_ORDER=['none','crown','horns','cap','flag','halo'];
  var SKIN_KEY='bots_skin_v1';

  /* Armes spéciales : une par joueur, choisie dans le lobby (5e action). */
  var WEAPONS={
    drill:{name:'Foreuse', ico:'🌀', cd:2, desc:'Traverse la terre et la pierre un instant, puis explose (30 dégâts).'},
    bounce:{name:'Rebondisseuse', ico:'🏀', cd:2, desc:'Rebondit 3 fois sur le terrain avant d’exploser (28 dégâts) — ou au contact d’un tank.'},
    sniper:{name:'Fusil de précision', ico:'🎯', cd:1, desc:'Balle en ligne droite, sans gravité (24 dégâts). La puissance ne compte pas.'},
    airstrike:{name:'Frappe aérienne', ico:'✈️', cd:4, desc:'3 obus tombent du ciel autour du point visé (18 dégâts chacun).'}
  };
  var WEAPON_ORDER=['drill','bounce','sniper','airstrike'];
  function loadSkin(){
    var d={paint:PAINTS[0], acc:'none', weapon:'drill'};
    try{ var o=JSON.parse(localStorage.getItem(SKIN_KEY)||'{}'); if(o && typeof o==='object') return cleanSkin(o, d); }catch(e){}
    return d;
  }
  function cleanSkin(o, d){
    d=d||{paint:PAINTS[0], acc:'none', weapon:'drill'};
    return {paint:PAINTS.indexOf(o.paint)!==-1?o.paint:d.paint, acc:ACCS[o.acc]?o.acc:d.acc, weapon:WEAPONS[o.weapon]?o.weapon:d.weapon};
  }
  var mySkin=loadSkin();
  function saveSkin(){ try{ localStorage.setItem(SKIN_KEY, JSON.stringify(mySkin)); }catch(e){} }
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
        else if(g[i]>=STONE && d2<=wr*wr) g[i]=EMPTY;
      }
    }
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

  /* Pose un tank : on part du point de départ et on descend jusqu'au sol. */
  function dropTank(g, t, x, y0){
    var s=tankSpec(t);
    t.x=clamp(x, s.w/2+2, W-s.w/2-2);
    t.y=y0;
    while(boxHits(g,t.x,t.y,s.w,s.h) && t.y>s.h) t.y-=2;
    for(var i=0;i<H;i++){
      if(boxHits(g,t.x,t.y+1,s.w,s.h)) break;
      t.y++;
    }
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
        dmg:spec.dmg, r:spec.r, wr:spec.wr, grav:spec.grav===undefined?1:spec.grav, frag:!!spec.frag, kind:spec.kind||'shot',
        drill:spec.drill||0, bounces:spec.bounces||0, life:spec.life||0});
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
        t.grounded=false; t.bumped=true; t.bounces=0;
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
      } else if(act.kind==='spec'){
        var wk=WEAPONS[t.weapon] ? t.weapon : 'drill';
        m=muzzle(t,act.a);
        if(wk==='drill') addProj(t.seat, m.x, m.y, v.x*p*560, v.y*p*560, {dmg:30, r:26, wr:12, kind:'drill', drill:0.22});
        else if(wk==='bounce') addProj(t.seat, m.x, m.y, v.x*p*600, v.y*p*600, {dmg:28, r:30, wr:10, kind:'bounce', bounces:3, life:5});
        else if(wk==='sniper') addProj(t.seat, m.x, m.y, v.x*1100, v.y*1100, {dmg:24, r:14, wr:5, grav:0, kind:'sniper'});
        else if(wk==='airstrike'){
          /* point visé : devant le tank, d'autant plus loin que la flèche est longue */
          var tx=clamp(t.x+v.x*(60+p*420), 20, W-20);
          [-42,0,42].forEach(function(dx,i){ spawns.push({tick:i*9, owner:t.seat, air:true, x:clamp(tx+dx,8,W-8)}); });
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
        if(!stepped) t.vx=-t.vx*0.4;               /* rebond contre un mur */
      } else t.x=nx;
      /* vertical */
      var ny=t.y+t.vy*DT;
      if(boxHits(g,t.x,ny,s.w,s.h)){
        if(t.vy>0){
          for(var k=0;k<14 && !boxHits(g,t.x,t.y+1,s.w,s.h);k++) t.y+=1;
          var impact=t.vy;
          if(impact>620) damageTank(t, Math.round((impact-620)*0.06));
          /* Atterrissage : on ne s'arrête net que si l'on retombe bien droit
             sur ses roues (peu de vitesse horizontale, sol presque plat).
             Sinon le tank rebondit et glisse un peu dans le sens de la pente. */
          var slope=groundSlope(t, s);
          var flat=Math.abs(t.vx)<45 && Math.abs(slope)<0.3;
          var bounces=t.bounces||0;
          if(!flat && impact>80 && bounces<4){
            var e=t.bumped?0.45:0.32;
            t.bounces=bounces+1;
            t.vy=-impact*e;
            t.vx=t.vx*0.7+slope*impact*0.22;
          } else {
            t.vy=0; t.vx=0; t.grounded=true; t.bounces=0; t.bumped=false;
          }
        } else {
          t.vy=-t.vy*0.3;                          /* rebond au plafond */
        }
      } else t.y=ny;
    }
    /* pente sous le tank : >0 si le sol descend vers la droite */
    function groundSlope(t, s){
      function groundAt(x){
        for(var dy=0;dy<=24;dy+=2){ if(solidPx(g, x, t.y+s.h/2+dy)) return dy; }
        return 24;
      }
      var l=groundAt(t.x-s.w/2+2), r=groundAt(t.x+s.w/2-2);
      return clamp((r-l)/(s.w-4), -1.5, 1.5);
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
        /* une foreuse qui descend sous le niveau de l'eau en creusant explose là */
        if(pr.kind==='drill' && pr.dtick!==undefined && pr.y>waterY){ pr.dead=true; explode(pr.x, pr.y, pr.r, pr.wr, pr.dmg, pr.owner); return; }
        if(pr.x<-40||pr.x>W+40||pr.y>waterY||(pr.grav===0 && pr.age>2)){ pr.dead=true; if(pr.y>waterY && pr.x>=0 && pr.x<W) ev({type:'splash', x:Math.round(pr.x), y:Math.round(waterY)}); return; }
        if(pr.life && pr.age>pr.life){ pr.dead=true; explode(pr.x, pr.y, pr.r, pr.wr, pr.dmg, pr.owner); return; }
        var inGround=pr.y>=0 && solidPx(g,pr.x,pr.y) && pr.x>=0 && pr.x<W, onTank=projHitsTank(pr);
        /* foreuse : creuse un tunnel tant qu'il lui reste du temps de forage */
        if(inGround && !onTank && pr.drill>0){
          pr.drill-=d; carve(g, pr.x, pr.y, 9, 9);
          pr.vx*=0.975; pr.vy*=0.975;
          if(pr.dtick!==tick){ pr.dtick=tick; ev({type:'drill', x:Math.round(pr.x), y:Math.round(pr.y)}); }
          continue;
        }
        /* rebondisseuse : repart dans l'autre sens, en perdant de la vitesse */
        if(inGround && !onTank && pr.bounces>0){
          pr.bounces--;
          pr.x-=pr.vx*d; pr.y-=pr.vy*d;
          var hx=solidPx(g, pr.x+pr.vx*d, pr.y), hy=solidPx(g, pr.x, pr.y+pr.vy*d);
          if(hy || !hx) pr.vy=-pr.vy*0.62;
          if(hx) pr.vx=-pr.vx*0.62; else pr.vx*=0.8;
          ev({type:'bounce', x:Math.round(pr.x), y:Math.round(pr.y)});
          continue;
        }
        if(inGround || onTank){
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
          if(sp.air){
            addProj(sp.owner, sp.x, -10, 0, 120, {dmg:18, r:24, wr:8, kind:'air'});
          } else if(sp.tank.alive){
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
    tanks.forEach(function(t){ t.vx=0; t.vy=0; t.shielded=false; t.bumped=false; t.bounces=0; });
    return {frames:frames, events:events, dmg:dmgDealt, kills:kills};
  }

  /* ===================== ÉTAT ===================== */
  var bs={
    players:[], connected:[], clientIds:[],
    mode:'1v1', timer:30, map:'random', phase:'lobby',      /* 'lobby' | 'aiming' | 'resolving' | 'ended' */
    match:null,                                /* hôte : état qui fait foi */
    actions:{}, turnDeadline:0, turnTimer:null, nextTimer:null, stats:{}, lastEnd:null
  };
  var botsNetRole=null, botsMySeat=0, botsMyName='', botsRoomCode='';
  var botsSelectedMode='1v1', botsSelectedTimer=30;
  /* ce que l'écran affiche (tout le monde, hôte compris) */
  var view={grid:null, tanks:[], waterY:WATER_START, waterStart:WATER_START, map:'shibuya', seed:1, turn:0, phase:'idle', projs:[], particles:[], texts:[], replay:null, mode:'1v1'};
  var aim={kind:null, a:Math.PI/4, p:0.6, set:false, locked:false, dragging:false};
  var lockedSeats=[], turnEndsAt=0;

  /* ===================== RÉSEAU ===================== */
  var ui=CG.roomUI('bots', {route:'bots', code:function(){ return botsRoomCode; },
    onLostBack:function(){ cleanupOnline(); gotoScreen('online'); }});
  var botsSetNetStatus=ui.setStatus, showBanner=ui.showBanner, hideBanner=ui.hideBanner, showLostModal=ui.showLost;
  var seats=CG.seatTools(bs), isConnected=seats.isConnected;
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
    onLost: function(){ showLostModal("Impossible de rétablir la connexion avec l'hôte."); },
    onPromote: onPromote
  });
  /* l'hôte a disparu : on reprend la salle ; le combat en cours est perdu,
     retour au lobby (mêmes tanks, mêmes réglages) */
  function onPromote(info){
    botsNetRole='host'; botsMySeat=0; botsRoomCode=net.code;
    CG.promoteSeats(bs, info);
    clearTimeout(bs.turnTimer); clearTimeout(bs.nextTimer);
    bs.phase='lobby'; bs.match=null; bs.actions={}; bs.lastEnd=null;
    view.replay=null; view.phase='idle';
    /* dans le lobby, une place libérée disparaît : les absents restent affichés le temps de revenir */
    $('botsCodeDisplay').textContent=botsRoomCode;
    hideBanner();
    hostBroadcastLobby();
    gotoScreen('lobby');
    $('botsLobbyStatus').textContent=CG.PROMOTED_TEXT;
  }
  var broadcast=net.broadcast;

  function cleanupOnline(){
    net.close(botsNetRole==='host' ? {type:'room_closed'} : null);
    clearTimeout(bs.turnTimer); clearTimeout(bs.nextTimer);
    botsNetRole=null; botsMySeat=0; botsRoomCode='';
    bs.players=[]; bs.connected=[]; bs.clientIds=[]; bs.phase='lobby'; bs.match=null; bs.actions={}; bs.lastEnd=null;
    view.grid=null; view.tanks=[]; view.replay=null; view.phase='idle';
    $('botsTurnBadge').style.display='none';
    hideBanner();
    botsSetNetStatus('offline','HORS LIGNE');
  }

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
    var wantedCode=CG.readRoomCode('botsHostCode');
    if(!wantedCode){ sfxToggle(); return; }
    botsMyName=$('botsName').value.trim()||'Joueur';
    cleanupOnline();
    net.host(function(code){
      botsNetRole='host'; botsMySeat=0; botsRoomCode=code;
      bs.mode=botsSelectedMode; bs.timer=botsSelectedTimer; bs.phase='lobby';
      bs.players=[{name:botsMyName, tank:'ranger', team:0, paint:mySkin.paint, acc:mySkin.acc, weapon:mySkin.weapon}];
      bs.connected=[true]; bs.clientIds=[net.clientId];
      try{ history.replaceState(null,'','#bots?room='+code); }catch(e){}
      $('botsCodeDisplay').textContent=code;
      renderLobby();
      gotoScreen('lobby');
    }, wantedCode);
    sfxToggle();
  });
  $('botsJoinCode').addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); $('botsJoinRoomBtn').click(); } });
  $('botsJoinRoomBtn').addEventListener('click',function(){
    botsMyName=$('botsName').value.trim()||'Joueur';
    var code=CG.cleanRoomCode($('botsJoinCode').value);
    if(!code){ shake($('botsJoinCode')); return; }
    cleanupOnline();
    botsNetRole='guest';
    net.join(code, {name:botsMyName, skin:mySkin});
    sfxToggle();
  });
  $('botsBackFromLobby').addEventListener('click',function(){ sfxToggle(); cleanupOnline(); gotoScreen('online'); });
  $('botsHubReturnBtn').addEventListener('click',function(){ sfxToggle(); location.hash='hub'; });
  CG.wireModal('botsRulesModal', 'botsRulesBtn');

  /* ----- hôte : places ----- */
  function hostOnJoinRequest(msg){
    var s, back=seats.returningSeat(msg); if(back) return back;
    if(bs.phase!=='lobby' && bs.phase!=='ended'){
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
      var sk=cleanSkin(msg.skin||{});
      bs.players[seat]={name:msg.name||'Joueur', tank:'ranger', team:counts[0]<=counts[1]?0:1, paint:sk.paint, acc:sk.acc, weapon:sk.weapon};
    }
    bs.clientIds[seat]=msg.clientId||null;
    bs.connected[seat]=true;
    net.sendTo(seat, {type:'seat_assigned', seat:seat, mode:bs.mode, timer:bs.timer});
    hostBroadcastLobby();
    if(bs.phase==='ended'){
      /* combat terminé : un participant revenu retrouve l'écran de fin */
      if(bs.lastEnd && bs.lastEnd.tanks.some(function(t){ return t.seat===seat; })) net.sendTo(seat, bs.lastEnd);
    } else if(bs.phase!=='lobby' && bs.match) net.sendTo(seat, hostSyncMsg(seat));
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
    else if(msg.type==='pick_skin' && bs.phase==='lobby'){ var sk=cleanSkin(msg.skin||{}, p); p.paint=sk.paint; p.acc=sk.acc; p.weapon=sk.weapon; hostBroadcastLobby(); }
    else if(msg.type==='action') hostReceiveAction(seat, msg);
  }
  function hostBroadcastLobby(){
    broadcast({type:'lobby_update', players:bs.players.slice(), connected:bs.connected.slice(),
      mode:bs.mode, timer:bs.timer, map:bs.map, phase:bs.phase});
  }
  function hostSyncMsg(seat){
    var m=bs.match;
    return {type:'sync', grid:gridEncode(m.grid), tanks:m.tanks, waterY:m.waterY, turn:m.turn, wave:m.wave,
      map:m.map, seed:m.seed, waterStart:MAPS[m.map].waterStart,
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
    if(bs.mode==='surv' && (seats.length<1 || seats.length>cap)) return 'De 1 à '+cap+' joueurs, tous dans le même camp.';
    return null;
  }
  $('botsStartBtn').addEventListener('click',function(){ sfxValidate(); hostStartMatch(); });
  function hostStartMatch(){
    if(lobbyProblem()) return;
    var seats=activeSeats();
    var mapKey = bs.map==='random' ? CG.botsMaps.ORDER[Math.floor(Math.random()*CG.botsMaps.ORDER.length)] : bs.map;
    var seed=Math.floor(Math.random()*1e9)+1;
    var surv=bs.mode==='surv';
    /* en survie, on garde aussi des points d'apparition pour les vagues de bots */
    var gen=CG.botsMaps.generate(mapKey, surv ? seats.length+6 : seats.length, seed);
    var grid=gen.grid, waterStart=MAPS[mapKey].waterStart;
    var tanks=seats.map(function(s,i){
      var p=bs.players[s];
      var team = bs.mode==='2v2' ? p.team : surv ? 0 : i;
      return {seat:s, type:p.tank, team:team, name:p.name, hp:TANKS[p.tank].hp, alive:true,
        x:0, y:0, vx:0, vy:0, grounded:true, aim:Math.PI/4, cds:{atk:0, surv:0, spec:0},
        paint:p.paint||PAINTS[0], acc:p.acc||'none', weapon:WEAPONS[p.weapon]?p.weapon:'drill'};
    });
    /* deux tanks de la même couleur (hors 2 VS 2) : le second en prend une libre */
    var usedPaint={};
    tanks.forEach(function(t){
      if(usedPaint[t.paint]){ t.paint=PAINTS.filter(function(c){ return !usedPaint[c]; })[0]||t.paint; }
      usedPaint[t.paint]=true;
    });
    /* positions de départ réparties, équipes alternées */
    var order;
    if(bs.mode==='2v2'){
      var a=tanks.filter(function(t){return t.team===0;}), b=tanks.filter(function(t){return t.team===1;});
      if(Math.random()<0.5){ var tmp=a; a=b; b=tmp; }
      order=[a[0],b[0],a[1],b[1]];
    } else order=shuffle(tanks.slice());
    var spawnPts=gen.spawns.slice();
    if(surv){
      /* les joueurs ensemble d'un côté, les bots arriveront de l'autre */
      var mid=Math.floor(spawnPts.length/2)-Math.floor(order.length/2);
      spawnPts=spawnPts.slice(mid, mid+order.length).concat(spawnPts.slice(0,mid), spawnPts.slice(mid+order.length));
    }
    order.forEach(function(t,i){
      var sp=spawnPts[i];
      dropTank(grid, t, sp.x, sp.y);
      t.aim = t.x<W/2 ? Math.PI/4 : Math.PI*3/4;
    });
    bs.match={grid:grid, tanks:tanks, waterY:waterStart, turn:0, map:mapKey, seed:seed, wave:0, aiCount:0, spawns:gen.spawns.slice(), aiKills:0};
    bs.stats={};
    seats.forEach(function(s){ bs.stats[s]={dmg:0, kills:0}; });
    if(surv) hostSpawnWave();
    bs.phase='aiming';
    broadcast({type:'match_start', grid:gridEncode(grid), tanks:bs.match.tanks, waterY:waterStart, waterStart:waterStart,
      mode:bs.mode, map:mapKey, seed:seed});
    hostBroadcastLobby();
    hostStartTurn();
  }
  function hostStartTurn(){
    var m=bs.match;
    m.turn++;
    /* mort subite : l'eau monte de plus en plus vite (8, 12, 16... px par tour) */
    var riseFrom = bs.mode==='surv' ? SURV_WATER_FROM : WATER_RISE_FROM;
    if(m.turn>riseFrom) m.waterY=Math.max(WATER_MIN, m.waterY-(4+4*(m.turn-riseFrom)));
    m.tanks.forEach(function(t){
      if(t.cds.atk>0) t.cds.atk--;
      if(t.cds.surv>0) t.cds.surv--;
      if(t.cds.spec>0) t.cds.spec--;
    });
    bs.actions={};
    /* les bots choisissent leur action tout de suite */
    m.tanks.forEach(function(t){ if(t.ai && t.alive) bs.actions[t.seat]=aiChooseAction(m, t); });
    bs.phase='aiming';
    bs.turnDeadline=Date.now()+bs.timer*1000;
    clearTimeout(bs.turnTimer);
    bs.turnTimer=setTimeout(hostResolveTurn, bs.timer*1000+300);
    broadcast({type:'turn_start', turn:m.turn, ms:bs.timer*1000, waterY:m.waterY, tanks:m.tanks, wave:m.wave,
      locked:Object.keys(bs.actions).map(Number)});
    hostCheckAllLocked();
  }
  function hostReceiveAction(seat, msg){
    if(bs.phase!=='aiming' || bs.actions.hasOwnProperty(seat)) return;
    var t=bs.match.tanks.filter(function(x){ return x.seat===seat; })[0];
    if(!t || !t.alive) return;
    var kind=msg.kind;
    if(['move','shot','atk','surv','spec','pass'].indexOf(kind)===-1) return;
    if((kind==='atk'||kind==='surv'||kind==='spec') && t.cds[kind]>0) return;
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
      if(act.kind==='spec') t.cds.spec=WEAPONS[t.weapon].cd+1;
    });
    Object.keys(res.dmg).forEach(function(s){ if(bs.stats[s]) bs.stats[s].dmg+=res.dmg[s]; });
    Object.keys(res.kills).forEach(function(s){ if(bs.stats[s]) bs.stats[s].kills+=res.kills[s]; });
    res.events.forEach(function(e){ if(e.type==='kill' && e.seat>=AI_SEAT) m.aiKills++; });
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
      if(bs.mode==='surv'){
        if(!teams[0]){
          bs.phase='ended';
          bs.lastEnd={type:'match_end', winners:[], draw:false, surv:{wave:m.wave, kills:m.aiKills}, stats:bs.stats, tanks:m.tanks.filter(function(t){ return !t.ai; }), mode:bs.mode};
          broadcast(bs.lastEnd);
          hostBroadcastLobby();
          return;
        }
        if(!teams[1]) hostSpawnWave();
        hostStartTurn();
        return;
      }
      if(alive.length<=1){
        bs.phase='ended';
        var winners=m.tanks.filter(function(t){ return alive.length && String(t.team)===alive[0]; }).map(function(t){ return t.seat; });
        bs.lastEnd={type:'match_end', winners:winners, draw:!alive.length, stats:bs.stats, tanks:m.tanks, mode:bs.mode};
        broadcast(bs.lastEnd);
        hostBroadcastLobby();
        /* soirée : les gagnants d'abord, puis aux dégâts infligés */
        if(CG.partyEnd) CG.partyEnd(bs.players, bs.players.map(function(p,s){ return (winners.indexOf(s)!==-1?100000:0)+((bs.stats[s]||{}).dmg||0); }));
      } else {
        hostStartTurn();
      }
    }, animMs);
  }
  /* ===================== SURVIE : VAGUES DE BOTS ===================== */
  var AI_TYPES=['viper','ranger','titan'];
  function hostSpawnWave(){
    var m=bs.match;
    m.wave++;
    /* on retire les épaves de la vague précédente, et les joueurs récupèrent un peu */
    m.tanks=m.tanks.filter(function(t){ return !t.ai; });
    if(m.wave>1) m.tanks.forEach(function(t){ if(t.alive) t.hp=Math.min(TANKS[t.type].hp, t.hp+30); });
    var humans=m.tanks.filter(function(t){ return t.alive; });
    var count=Math.min(6, m.wave+Math.ceil(humans.length/2));
    /* les points d'apparition les plus loin des joueurs */
    var pts=m.spawns.slice().sort(function(a,b){
      function far(p){ var d=Infinity; humans.forEach(function(h){ d=Math.min(d, Math.abs(h.x-p.x)); }); return d; }
      return far(b)-far(a);
    });
    for(var i=0;i<count;i++){
      var type=AI_TYPES[(m.wave+i)%3], seat=AI_SEAT+(m.aiCount++);
      var t={seat:seat, type:type, team:1, name:'BOT-'+(m.aiCount), hp:TANKS[type].hp, alive:true, ai:true,
        x:0, y:0, vx:0, vy:0, grounded:true, aim:Math.PI/4, cds:{atk:1, surv:1, spec:0}, paint:AI_COLOR, acc:'none', weapon:'drill'};
      var p=pts[i%pts.length];
      dropTank(m.grid, t, p.x+(i>=pts.length?14:0), p.y);
      t.aim = t.x<W/2 ? Math.PI/4 : Math.PI*3/4;
      m.tanks.push(t);
      bs.stats[seat]={dmg:0, kills:0};
    }
  }
  /* Visée de l'ordinateur : on essaie des angles et des puissances, on suit
     la trajectoire (gravité + terrain) et on garde celle qui passe le plus
     près de la cible ; puis un peu d'imprécision, de moins en moins à
     chaque vague. */
  var AI_SPEC={shot:{speed:SHOT.speed, grav:1}, heavy:{speed:560, grav:1.15}, cluster:{speed:600, grav:1}, burst:{speed:660, grav:1}};
  function aiAim(m, t, target, spec){
    var s=TANKS[t.type], best={d:Infinity, a:Math.PI/4, p:0.6};
    var dir=target.x>=t.x ? 1 : -1;
    for(var deg=8;deg<=82;deg+=3){
      var a = dir>0 ? deg*Math.PI/180 : Math.PI-deg*Math.PI/180, v=aimVec(a);
      for(var p=0.25;p<=1.001;p+=0.05){
        var x=t.x+v.x*(s.w/2+4), y=t.y-s.h/2+v.y*(s.w/2+4), vx=v.x*p*spec.speed, vy=v.y*p*spec.speed, dmin=Infinity;
        for(var k=0;k<360;k++){
          vy+=GRAVITY*spec.grav*DT/2; x+=vx*DT/2; y+=vy*DT/2;
          var dx=x-target.x, dy=y-target.y, d=dx*dx+dy*dy;
          if(d<dmin) dmin=d;
          if(x<0||x>W||y>m.waterY) break;
          if(y>=0 && solidPx(m.grid,x,y)) break;
        }
        if(dmin<best.d){ best={d:dmin, a:a, p:p}; }
      }
    }
    var noise=Math.max(0.04, 0.24-0.035*m.wave);
    return {a:best.a+(Math.random()-0.5)*2*noise, p:clamp(best.p+(Math.random()-0.5)*noise, 0.2, 1)};
  }
  function aiChooseAction(m, t){
    var s=TANKS[t.type];
    var foes=m.tanks.filter(function(o){ return o.alive && !o.ai; });
    if(!foes.length) return {kind:'pass', a:t.aim, p:0};
    var target=foes.slice().sort(function(a,b){ return Math.abs(a.x-t.x)-Math.abs(b.x-t.x); })[0];
    /* en danger : réparation (Ranger) ou fuite (Viper) */
    if(s.surv.key==='repair' && t.cds.surv===0 && t.hp<s.hp*0.5) return {kind:'surv', a:t.aim, p:0};
    if(s.surv.key==='boost' && t.cds.surv===0 && t.hp<s.hp*0.4 && Math.random()<0.6){
      return {kind:'surv', a:target.x>t.x ? Math.PI*0.72 : Math.PI*0.28, p:0.7};
    }
    var useAtk=t.cds.atk===0 && Math.random()<0.55;
    var spec=AI_SPEC[useAtk ? s.atk.key : 'shot'] || AI_SPEC.shot;
    var aimed=aiAim(m, t, {x:target.x, y:target.y-TANKS[target.type].h/4}, spec);
    return {kind:useAtk?'atk':'shot', a:aimed.a, p:aimed.p};
  }

  $('botsRematchBtn').addEventListener('click',function(){
    sfxToggle();
    bs.phase='lobby'; bs.match=null; bs.lastEnd=null;
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
        bs.mode=msg.mode; bs.timer=msg.timer; bs.map=msg.map||'random';
        var wasPhase=bs.phase;
        bs.phase=msg.phase;
        renderLobby();
        renderRoster();
        if(msg.phase==='lobby' && wasPhase!=='lobby') gotoScreen('lobby');
        break;
      case 'match_start':
        view.wave=0;
        view.grid=gridDecode(msg.grid); view.tanks=msg.tanks; view.waterY=msg.waterY; view.mode=msg.mode;
        view.projs=[]; view.particles=[]; view.texts=[]; view.replay=null; view.turn=0;
        setupMapVisuals(msg);
        gotoScreen('battle');
        break;
      case 'sync':
        view.grid=gridDecode(msg.grid); view.tanks=msg.tanks; view.waterY=msg.waterY; view.mode=msg.mode;
        view.turn=msg.turn; view.replay=null; view.projs=[];
        setupMapVisuals(msg);
        lockedSeats=msg.locked||[];
        gotoScreen('battle');
        if(msg.phase==='aiming') beginAiming(msg.msLeft, !!msg.myLocked);
        else { view.phase='resolving'; setTurnStatus('Résolution du tour en cours...'); }
        break;
      case 'turn_start':
        flushReplay();
        view.tanks=keepVisual(msg.tanks); view.waterY=msg.waterY; view.turn=msg.turn;
        lockedSeats=msg.locked||[];
        if(msg.wave && msg.wave!==view.wave){
          view.wave=msg.wave;
          addText(W/2, H/3, '⚠ VAGUE '+msg.wave+' ⚠', '#FFE600');
          view.texts[view.texts.length-1].big=true;
        }
        beginAiming(msg.ms, false);
        CG.yourTurn();
        break;
      case 'locked':
        lockedSeats=msg.seats; renderRoster(); renderTurnStatus();
        break;
      case 'turn_result': startReplay(msg); break;
      case 'match_end': flushReplay(); showEnd(msg); break;
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
        card.innerHTML='<canvas width="160" height="78"></canvas>'+
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
      });
    }
    var paint=(me && bs.mode==='2v2') ? TEAM_COLORS[me.team||0] : mySkin.paint;
    var sig=paint+'|'+mySkin.acc;
    if(grid.getAttribute('data-sig')!==sig){
      grid.setAttribute('data-sig', sig);
      Array.prototype.forEach.call(grid.querySelectorAll('.bots-tank-card'), function(card){
        var cv=card.querySelector('canvas'), c=cv.getContext('2d');
        c.clearRect(0,0,cv.width,cv.height);
        drawTank(c, {type:card.getAttribute('data-tank'), x:76, y:54, aim:Math.PI/6, alive:true, acc:mySkin.acc}, paint, 2.1);
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
  /* Personnalisation (couleur, accessoire) et arme spéciale : gardées dans le
     navigateur, envoyées à l'hôte. */
  function sendSkin(){
    saveSkin();
    if(botsNetRole==='host'){ var p=bs.players[0]; if(p){ p.paint=mySkin.paint; p.acc=mySkin.acc; p.weapon=mySkin.weapon; } hostBroadcastLobby(); }
    else if(botsNetRole) net.send({type:'pick_skin', skin:mySkin});
    renderLobby();
  }
  function renderSkinPicker(){
    var pp=$('botsPaintPicker');
    if(!pp.childElementCount){
      PAINTS.forEach(function(c){
        var b=document.createElement('button'); b.type='button'; b.className='bots-swatch'; b.style.background=c;
        b.setAttribute('data-c', c); b.setAttribute('aria-label','Couleur '+c);
        b.addEventListener('click', function(){ mySkin.paint=c; sfxToggle(); sendSkin(); });
        pp.appendChild(b);
      });
      ACC_ORDER.forEach(function(k){
        var b=document.createElement('button'); b.type='button'; b.className='btn ghost small format-opt'; b.setAttribute('data-acc', k);
        b.innerHTML='<span>'+ACCS[k]+'</span>';
        b.addEventListener('click', function(){ mySkin.acc=k; sfxToggle(); sendSkin(); });
        $('botsAccPicker').appendChild(b);
      });
      WEAPON_ORDER.forEach(function(k){
        var w=WEAPONS[k], b=document.createElement('button'); b.type='button'; b.className='bots-weapon-card'; b.setAttribute('data-w', k);
        b.innerHTML='<span class="ico">'+w.ico+'</span><b>'+w.name+'</b><small>recharge '+w.cd+' tour'+(w.cd>1?'s':'')+'</small><small>'+w.desc+'</small>';
        b.addEventListener('click', function(){ mySkin.weapon=k; sfxToggle(); sendSkin(); });
        $('botsWeaponGrid').appendChild(b);
      });
    }
    Array.prototype.forEach.call(pp.querySelectorAll('.bots-swatch'), function(b){ b.classList.toggle('active', b.getAttribute('data-c')===mySkin.paint); });
    Array.prototype.forEach.call($('botsAccPicker').querySelectorAll('button'), function(b){ b.classList.toggle('active', b.getAttribute('data-acc')===mySkin.acc); });
    Array.prototype.forEach.call($('botsWeaponGrid').querySelectorAll('button'), function(b){ b.classList.toggle('selected', b.getAttribute('data-w')===mySkin.weapon); });
    $('botsPaintNote').hidden = bs.mode!=='2v2';
  }
  /* Cartes : aperçu généré localement (graine fixe), choix par l'hôte. */
  function renderMapGrid(){
    var grid=$('botsMapGrid'), keys=CG.botsMaps.ORDER.concat(['random']);
    if(grid.childElementCount!==keys.length){
      grid.innerHTML='';
      keys.forEach(function(key){
        var card=document.createElement('div');
        card.className='bots-map-card';
        card.setAttribute('data-map',key);
        if(key==='random'){
          card.innerHTML='<div class="bots-map-random">🎲</div><b>ALÉATOIRE</b><small>Une des cartes, au hasard.</small>';
        } else {
          var m=MAPS[key];
          card.innerHTML='<canvas width="240" height="135"></canvas><b>'+m.ico+' '+m.name+'</b><small>'+m.desc+'</small>';
          drawMapPreview(card.querySelector('canvas'), key);
        }
        card.addEventListener('click',function(){
          if(botsNetRole!=='host' || bs.phase!=='lobby') return;
          bs.map=key; sfxToggle(); hostBroadcastLobby();
        });
        grid.appendChild(card);
      });
    }
    var cards=grid.querySelectorAll('.bots-map-card');
    for(var i=0;i<cards.length;i++){
      cards[i].classList.toggle('selected', cards[i].getAttribute('data-map')===bs.map);
      cards[i].classList.toggle('readonly', botsNetRole!=='host');
    }
  }
  function drawMapPreview(cv, key){
    var big=document.createElement('canvas'); big.width=W; big.height=H;
    var bc=big.getContext('2d');
    CG.botsMaps.paintBackground(bc, key, 7);
    var gen=CG.botsMaps.generate(key, 4, 7);
    var tc=document.createElement('canvas'); tc.width=W; tc.height=H;
    var tx=tc.getContext('2d'), img=tx.createImageData(W,H);
    CG.botsMaps.paintTerrain(img, gen.grid, key, 0, 0, W, H);
    tx.putImageData(img,0,0);
    bc.drawImage(tc,0,0);
    var th=CG.botsMaps.theme(key), wy=MAPS[key].waterStart;
    bc.fillStyle=th.water; bc.fillRect(0,wy,W,H-wy);
    cv.getContext('2d').drawImage(big,0,0,cv.width,cv.height);
  }
  function renderLobby(){
    $('botsLobbyTitle').textContent='LOBBY — '+MODE_LABEL[bs.mode];
    renderTankCards();
    renderSkinPicker();
    renderMapGrid();
    var me=bs.players[botsMySeat];
    $('botsTeamPicker').style.display = bs.mode==='2v2' ? 'block' : 'none';
    var tb=$('botsTeamPicker').querySelectorAll('button');
    for(var i=0;i<tb.length;i++) tb[i].classList.toggle('active', !!me && me.team===parseInt(tb[i].getAttribute('data-team'),10));
    var html='';
    for(var s=0;s<bs.players.length;s++){
      var p=bs.players[s];
      if(!p) continue;
      var w=WEAPONS[p.weapon]||WEAPONS.drill;
      html+=CG.playerRow({name:p.name, color:bs.mode==='2v2' ? TEAM_COLORS[p.team] : (p.paint||playerColor(s, s===0?0:1)), me:s===botsMySeat, off:!isConnected(s),
        extra:'<span class="imp-tag">'+TANKS[p.tank].name+' · '+w.ico+(bs.mode==='2v2'?(p.team?' · BLEU':' · ROUGE'):'')+'</span>'});
    }
    $('botsPlayerList').innerHTML=html;
    var problem= botsNetRole==='host' ? lobbyProblem() : null;
    var st=$('botsLobbyStatus');
    if(bs.phase==='ended') st.textContent='Combat terminé — en attente de la revanche...';
    else if(bs.phase!=='lobby') st.textContent='Combat en cours...';
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
      {kind:'surv', ico:s.surv.ico, name:s.surv.name, sub:'Survie', aim:s.surv.aim, cd:t.cds.surv},
      {kind:'spec', ico:(WEAPONS[t.weapon]||WEAPONS.drill).ico, name:(WEAPONS[t.weapon]||WEAPONS.drill).name, sub:'Arme spéciale', aim:true, cd:t.cds.spec||0}
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
    if(!aim.set){ el.textContent='🎯 Lance-pierre : tire vers l\u2019arrière, la flèche part dans l\u2019autre sens (plus tu tires loin, plus c\u2019est puissant).'; return; }
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
    if(t.ai) return AI_COLOR;
    if(view.mode==='2v2') return TEAM_COLORS[t.team%2];
    if(t.paint) return t.paint;
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
    /* lance-pierre : on tire vers l'arrière, l'action part à l'opposé du doigt */
    var dx=ox-pt.x, dy=pt.y-oy, len=Math.sqrt(dx*dx+dy*dy);
    aim.pull={x:pt.x, y:pt.y};
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
  function endDrag(){ if(aim.dragging){ aim.dragging=false; aim.pull=null; renderActionBar(); } }
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
    if(k==='spec') return (WEAPONS[t.weapon]||WEAPONS.drill).name.toLowerCase();
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
  /* Replay pas fini quand la suite arrive (onglet en arrière-plan : l'animation
     est en pause) : on applique tout d'un coup, sinon le terrain restait
     dans son état d'avant le tour. */
  function flushReplay(){
    var r=view.replay; if(!r) return;
    while(r.evIdx<r.msg.events.length){ applyEvent(r.msg.events[r.evIdx], true); r.evIdx++; }
    finishReplay(r.msg);
  }
  function applyEvent(e, quiet){
    var t;
    if(e.type==='boom'){
      carve(view.grid, e.x, e.y, e.r, e.wr);
      markDirty(e.x-e.r-8, e.y-e.r-8, e.x+e.r+8, e.y+e.r+16);
      if(!quiet){ addExplosion(e.x, e.y, e.r); CG.sfxWhoosh(); }
    } else if(e.type==='wall'){
      e.cells.forEach(function(i){
        view.grid[i]=STONE;
        var cx=(i%GW)*CELL, cy=Math.floor(i/GW)*CELL;
        markDirty(cx-8, cy-8, cx+CELL+8, cy+CELL+16);
      });
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
    } else if(e.type==='drill'){
      carve(view.grid, e.x, e.y, 9, 9);
      markDirty(e.x-18, e.y-18, e.x+18, e.y+26);
      if(!quiet) addSparks(e.x, e.y, '#c89b6d', 3);
    } else if(e.type==='bounce'){
      if(!quiet){ addSparks(e.x, e.y, '#ffffff', 5); CG.sfxToggle(); }
    } else if(e.type==='splash'){
      for(var i=0;i<8;i++) view.particles.push({x:e.x, y:e.y, vx:(Math.random()-0.5)*120, vy:-80-Math.random()*120, life:0.7, max:0.7, c:'#9ad7ff', s:3});
    }
  }
  /* garde l'inclinaison affichée quand l'état des tanks est remplacé */
  function keepVisual(tanks){
    tanks.forEach(function(t){
      var old=findViewTank(t.seat);
      if(old){ t._tilt=old._tilt; t._px=old._px; }
    });
    return tanks;
  }
  function findViewTank(seat){ return view.tanks.filter(function(x){ return x.seat===seat; })[0]; }
  function finishReplay(msg){
    view.replay=null; view.projs=[];
    /* l'état de l'hôte fait foi ; on ne repeint que s'il diffère du replay */
    var fin=gridDecode(msg.final.grid), same=true;
    for(var i=0;i<fin.length;i++){ if(fin[i]!==view.grid[i]){ same=false; break; } }
    view.grid=fin;
    if(!same) markAllDirty();
    view.tanks=keepVisual(msg.final.tanks); view.waterY=msg.final.waterY;
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
  /* petites étincelles : forage et rebonds */
  function addSparks(x,y,c,n){
    for(var i=0;i<n;i++) view.particles.push({x:x, y:y, vx:(Math.random()-0.5)*140, vy:-40-Math.random()*90, life:0.35, max:0.35, c:c, s:2});
  }

  /* ===================== FIN DE COMBAT ===================== */
  function showEnd(msg){
    view.phase='ended';
    var mine=msg.winners.indexOf(botsMySeat)!==-1;
    var names=msg.tanks.filter(function(t){ return msg.winners.indexOf(t.seat)!==-1; }).map(function(t){ return t.name; });
    var banner=$('botsEndBanner');
    if(msg.surv){
      var w=msg.surv.wave;
      banner.textContent='🤖 LES BOTS ONT GAGNÉ… À LA VAGUE '+w; banner.className='cham-result-banner '+(w>=5?'b-great':w>=3?'b-ok':'b-fail');
      $('botsEndText').innerHTML='Vous avez tenu jusqu’à la <b>vague '+w+'</b> et détruit <b>'+msg.surv.kills+' bot'+(msg.surv.kills>1?'s':'')+'</b>.';
    } else if(msg.draw){ banner.textContent='💥 DESTRUCTION MUTUELLE !'; banner.className='cham-result-banner b-meh'; }
    else { banner.textContent= mine ? '🏆 VICTOIRE !' : '💀 DÉFAITE...'; banner.className='cham-result-banner '+(mine?'b-perfect':'b-fail'); }
    if(!msg.surv) $('botsEndText').innerHTML = msg.draw ? 'Aucun survivant.' : ('Vainqueur'+(names.length>1?'s':'')+' : <b>'+names.map(escapeHtml).join(' & ')+'</b>');
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
    if(CG.account && msg.tanks.some(function(t){ return t.seat===botsMySeat; })) CG.account.record('bots', (msg.stats[botsMySeat]||{}).dmg||0, mine && !msg.draw);
    if(CG.achieve && msg.tanks.some(function(t){ return t.seat===botsMySeat; })){
      if(mine && !msg.draw && !msg.surv) CG.achieve('bots_win');
      if(msg.surv && msg.surv.wave>=5) CG.achieve('bots_wave5');
    }
    gotoScreen('end');
  }

  /* ===================== RENDU ===================== */
  /* Terrain lissé et texturé (voir js/bots-maps.js), repeint seulement
     dans la zone touchée par une explosion. Le décor est peint une fois. */
  var terrainCanvas=document.createElement('canvas');
  terrainCanvas.width=W; terrainCanvas.height=H;
  var tctx=terrainCanvas.getContext('2d');
  var terrainImg=tctx.createImageData(W,H);
  var shadowCanvas=document.createElement('canvas');
  shadowCanvas.width=W; shadowCanvas.height=H;
  var sctx=shadowCanvas.getContext('2d');
  var bgCanvas=document.createElement('canvas');
  bgCanvas.width=W; bgCanvas.height=H;
  var bgctx=bgCanvas.getContext('2d');
  var dirty=null;
  function markDirty(x0,y0,x1,y1){
    if(!dirty) dirty={x0:x0,y0:y0,x1:x1,y1:y1};
    else { dirty.x0=Math.min(dirty.x0,x0); dirty.y0=Math.min(dirty.y0,y0); dirty.x1=Math.max(dirty.x1,x1); dirty.y1=Math.max(dirty.y1,y1); }
  }
  function markAllDirty(){ markDirty(0,0,W,H); }
  function rebuildTerrain(){
    var x0=Math.max(0,Math.floor(dirty.x0)), y0=Math.max(0,Math.floor(dirty.y0));
    var x1=Math.min(W,Math.ceil(dirty.x1)), y1=Math.min(H,Math.ceil(dirty.y1));
    dirty=null;
    if(x1<=x0 || y1<=y0) return;
    CG.botsMaps.paintTerrain(terrainImg, view.grid, view.map, x0, y0, x1, y1);
    tctx.putImageData(terrainImg, 0, 0, x0, y0, x1-x0, y1-y0);
    /* silhouette noire pour l'ombre portée */
    sctx.globalCompositeOperation='source-over';
    sctx.clearRect(0,0,W,H);
    sctx.drawImage(terrainCanvas,0,0);
    sctx.globalCompositeOperation='source-in';
    sctx.fillStyle='#000'; sctx.fillRect(0,0,W,H);
    sctx.globalCompositeOperation='source-over';
  }
  function setupMapVisuals(msg){
    view.map=msg.map||'shibuya'; view.seed=msg.seed||1;
    view.waterStart=msg.waterStart||WATER_START;
    bgctx.clearRect(0,0,W,H);
    CG.botsMaps.paintBackground(bgctx, view.map, view.seed);
    markAllDirty();
  }
  function drawWater(time){
    var y=view.waterY, th=CG.botsMaps.theme(view.map);
    ctx.fillStyle=th.water;
    ctx.fillRect(0,y,W,H-y+2);
    ctx.strokeStyle=th.wave; ctx.lineWidth=2;
    for(var row=0;row<2;row++){
      ctx.globalAlpha=row?0.35:1;
      ctx.beginPath();
      for(var x=0;x<=W;x+=8){
        var wy=y+row*10+Math.sin(x/28+time/400+row*2)*3;
        if(x===0) ctx.moveTo(x,wy); else ctx.lineTo(x,wy);
      }
      ctx.stroke();
    }
    ctx.globalAlpha=1;
  }
  /* ===================== DESSIN DES TANKS =====================
     Trois silhouettes dessinées en code (aucune image à charger) :
     - TITAN : blindé lourd, plaques rivetées, éperon, double chenille ;
     - RANGER : char "soldat", tourelle-tête avec casque et lunettes, camouflage ;
     - VIPER : serpent mécanique, corps en anneaux, tête à crocs et langue.
     La couleur d'équipe teinte la carrosserie ; le tank regarde du côté où il vise. */
  function shade(hex, f){
    var n=parseInt(hex.slice(1),16), r=(n>>16)&255, g=(n>>8)&255, b=n&255;
    if(f<0){ r*=1+f; g*=1+f; b*=1+f; } else { r+=(255-r)*f; g+=(255-g)*f; b+=(255-b)*f; }
    return 'rgb('+(r|0)+','+(g|0)+','+(b|0)+')';
  }
  var BARREL={ titan:{x:-0.08, y:-0.5, len:0.62, wd:7, wl:4},
               ranger:{x:0.02, y:-0.52, len:0.66, wd:5.5, wl:3},
               viper:{x:0.34, y:-0.28, len:0.62, wd:4.5, wl:2.5} };
  function drawTank(c, t, color, scale){
    var s=TANKS[t.type], k=scale||1, w=s.w, h=s.h;
    var dir=Math.cos(t.aim)<0?-1:1, tilt=t._tilt||0;
    c.save();
    if(!t.alive) c.globalAlpha=0.35;
    c.translate(t.x, t.y);
    c.scale(k,k);
    c.rotate(tilt);
    /* canon : dans le repère incliné mais pas retourné, il vise dans la direction réelle */
    var b=BARREL[t.type], bx=b.x*w*dir, by=b.y*h, a=t.aim+tilt, bl=b.len*w;
    var ex=bx+Math.cos(a)*bl, ey=by-Math.sin(a)*bl;
    c.lineCap='round';
    c.strokeStyle='#0a0a0a'; c.lineWidth=b.wd;
    c.beginPath(); c.moveTo(bx,by); c.lineTo(ex,ey); c.stroke();
    c.strokeStyle=t.type==='viper'?'#e8e8e8':'#cfcfcf'; c.lineWidth=b.wl;
    c.beginPath(); c.moveTo(bx,by); c.lineTo(ex,ey); c.stroke();
    if(t.type==='titan'){ /* frein de bouche */
      c.fillStyle='#0a0a0a'; c.beginPath(); c.arc(ex,ey,4.2,0,Math.PI*2); c.fill();
    }
    c.scale(dir,1);
    c.lineJoin='round';
    if(t.type==='titan') drawTitan(c, w, h, color);
    else if(t.type==='ranger') drawRanger(c, w, h, color);
    else drawViper(c, w, h, color);
    if(t.acc && t.acc!=='none') drawAccessory(c, t.type, w, h, t.acc, color);
    c.restore();
  }
  /* accessoire posé sur le haut du tank (repère déjà tourné vers la visée) */
  var ACC_ANCHOR={titan:{x:-0.05, y:-0.74}, ranger:{x:0.05, y:-0.86}, viper:{x:0.36, y:-0.5}};
  function drawAccessory(c, type, w, h, acc, col){
    var an=ACC_ANCHOR[type], x=an.x*w, y=an.y*h;
    c.save();
    c.lineJoin='round'; c.lineCap='round';
    if(acc==='crown'){
      c.fillStyle='#FFD400'; c.strokeStyle='#000'; c.lineWidth=1;
      c.beginPath(); c.moveTo(x-6,y); c.lineTo(x-6,y-5); c.lineTo(x-3,y-2.5); c.lineTo(x,y-6.5); c.lineTo(x+3,y-2.5); c.lineTo(x+6,y-5); c.lineTo(x+6,y); c.closePath(); c.fill(); c.stroke();
      c.fillStyle='#ff0033'; c.beginPath(); c.arc(x,y-1.5,1,0,Math.PI*2); c.fill();
    } else if(acc==='horns'){
      c.fillStyle='#b0001a'; c.strokeStyle='#000'; c.lineWidth=1;
      [-1,1].forEach(function(sd){
        c.beginPath(); c.moveTo(x+sd*2,y); c.quadraticCurveTo(x+sd*7,y-2,x+sd*6,y-8); c.quadraticCurveTo(x+sd*5,y-3,x+sd*4.5,y+0.5); c.closePath(); c.fill(); c.stroke();
      });
    } else if(acc==='cap'){
      c.fillStyle=shade(col,-0.5); c.strokeStyle='#000'; c.lineWidth=1;
      c.beginPath(); c.arc(x,y,4.5,Math.PI,0); c.closePath(); c.fill(); c.stroke();
      c.fillRect(x+3,y-1,5,1.8); c.strokeRect(x+3,y-1,5,1.8);
    } else if(acc==='flag'){
      c.strokeStyle='#111'; c.lineWidth=1.2;
      c.beginPath(); c.moveTo(x-3,y); c.lineTo(x-3,y-14); c.stroke();
      c.fillStyle='#111'; c.fillRect(x-3,y-14,9,6);
      c.fillStyle='#fff'; c.beginPath(); c.arc(x+1.5,y-11,1.4,0,Math.PI*2); c.fill();
    } else if(acc==='halo'){
      c.strokeStyle='#FFE600'; c.lineWidth=1.6;
      c.beginPath(); c.ellipse(x,y-6,5.5,1.8,0,0,Math.PI*2); c.stroke();
    }
    c.restore();
  }
  function wheels(c, x0, x1, y, r, n){
    for(var i=0;i<n;i++){
      var x=x0+(x1-x0)*(n===1?0.5:i/(n-1));
      c.fillStyle='#2b2b2b'; c.beginPath(); c.arc(x,y,r,0,Math.PI*2); c.fill();
      c.fillStyle='#8a8a8a'; c.beginPath(); c.arc(x,y,r*0.45,0,Math.PI*2); c.fill();
    }
  }
  function drawTitan(c, w, h, col){
    var hw=w/2, hh=h/2;
    /* chenille épaisse */
    c.fillStyle='#0d0d0d';
    roundRect(c, -hw, hh*0.1, w, hh*0.9, 5); c.fill();
    c.strokeStyle='#444'; c.lineWidth=1;
    for(var x=-hw+3;x<hw-2;x+=4){ c.beginPath(); c.moveTo(x,hh*0.12); c.lineTo(x,hh*0.28); c.stroke(); }
    wheels(c, -hw+5, hw-5, hh*0.6, 3.2, 6);
    /* caisse blindée trapézoïdale */
    c.fillStyle=col; c.strokeStyle='#000'; c.lineWidth=2;
    c.beginPath();
    c.moveTo(-hw+1, hh*0.15); c.lineTo(hw+1, hh*0.15); c.lineTo(hw-3, -hh*0.45);
    c.lineTo(-hw+5, -hh*0.45); c.closePath(); c.fill(); c.stroke();
    /* plaques et rivets */
    c.fillStyle=shade(col,-0.35);
    c.fillRect(-hw+4, -hh*0.32, w*0.3, hh*0.38);
    c.fillRect(-hw+4+w*0.36, -hh*0.32, w*0.3, hh*0.38);
    c.fillStyle='#e9e9e9';
    for(var i=0;i<6;i++){ c.beginPath(); c.arc(-hw+5+i*(w-10)/5, hh*0.02, 0.9, 0, Math.PI*2); c.fill(); }
    /* éperon avant */
    c.fillStyle='#1a1a1a';
    c.beginPath(); c.moveTo(hw-1, hh*0.15); c.lineTo(hw+6, hh*0.05); c.lineTo(hw-2, -hh*0.3); c.closePath(); c.fill();
    /* tourelle carrée + trappe + fente de vision */
    c.fillStyle=shade(col,-0.15); c.strokeStyle='#000'; c.lineWidth=2;
    c.beginPath();
    c.moveTo(-w*0.3, -hh*0.45); c.lineTo(w*0.18, -hh*0.45); c.lineTo(w*0.12, -h*0.72);
    c.lineTo(-w*0.22, -h*0.72); c.closePath(); c.fill(); c.stroke();
    c.fillStyle='#111'; c.fillRect(-w*0.16, -h*0.8, w*0.14, 2.5);
    c.fillStyle='#FFE600'; c.fillRect(0, -h*0.62, w*0.1, 2);
  }
  function drawRanger(c, w, h, col){
    var hw=w/2, hh=h/2;
    c.fillStyle='#111';
    roundRect(c, -hw, hh*0.12, w, hh*0.85, 4); c.fill();
    wheels(c, -hw+4, hw-4, hh*0.58, 2.8, 4);
    /* caisse camouflée */
    c.fillStyle=col; c.strokeStyle='#000'; c.lineWidth=2;
    roundRect(c, -hw+1, -hh*0.42, w-2, hh*0.62, 3); c.fill(); c.stroke();
    c.save(); c.clip();
    c.fillStyle=shade(col,-0.45);
    [[-0.3,-0.2,4],[0.05,0.05,3.2],[0.32,-0.25,3.6],[-0.08,-0.35,2.4]].forEach(function(p){
      c.beginPath(); c.ellipse(p[0]*w, p[1]*h, p[2]*1.6, p[2], 0.4, 0, Math.PI*2); c.fill();
    });
    c.restore();
    /* étoile militaire */
    star(c, -w*0.2, -hh*0.1, 3.2, '#fff');
    /* antenne + fanion à l'arrière */
    c.strokeStyle='#111'; c.lineWidth=1.2;
    c.beginPath(); c.moveTo(-hw+3, -hh*0.4); c.lineTo(-hw-1, -h*1.05); c.stroke();
    c.fillStyle=col; c.beginPath(); c.moveTo(-hw-1,-h*1.05); c.lineTo(-hw+6,-h*0.98); c.lineTo(-hw-0.5,-h*0.88); c.fill();
    /* tête de soldat : visage, lunettes, casque */
    var cx=w*0.05, cy=-h*0.52;
    c.fillStyle='#e8b98a'; c.strokeStyle='#000'; c.lineWidth=1.5;
    c.beginPath(); c.arc(cx, cy+1.5, h*0.27, 0, Math.PI*2); c.fill(); c.stroke();
    c.fillStyle='#FFE600'; c.strokeStyle='#000'; c.lineWidth=1;
    roundRect(c, cx-1, cy+0.5, h*0.3, 2.6, 1); c.fill(); c.stroke();
    c.fillStyle=shade(col,-0.5); c.strokeStyle='#000'; c.lineWidth=1.5;
    c.beginPath(); c.arc(cx, cy, h*0.32, Math.PI, 0); c.closePath(); c.fill(); c.stroke();
    c.fillStyle='#000'; c.fillRect(cx-h*0.38, cy-0.6, h*0.76, 1.6);
    c.strokeStyle='#3a2a1a'; c.lineWidth=0.8;
    c.beginPath(); c.moveTo(cx+h*0.22,cy+0.5); c.lineTo(cx+h*0.12,cy+h*0.28); c.stroke();
  }
  function drawViper(c, w, h, col){
    var hw=w/2, hh=h/2;
    wheels(c, -hw+2, hw-5, hh*0.72, 2.2, 4);
    /* queue qui remonte */
    c.strokeStyle='#000'; c.lineWidth=4.5; c.lineCap='round';
    c.beginPath(); c.moveTo(-hw*0.7, hh*0.3); c.quadraticCurveTo(-hw-5, hh*0.3, -hw-4, -hh*0.7); c.stroke();
    c.strokeStyle=col; c.lineWidth=2.5;
    c.beginPath(); c.moveTo(-hw*0.7, hh*0.3); c.quadraticCurveTo(-hw-5, hh*0.3, -hw-4, -hh*0.7); c.stroke();
    /* corps en anneaux, du plus petit (arrière) au plus gros (avant) */
    var segs=[[-0.42,0.18,0.30],[-0.18,0.08,0.36],[0.08,0.02,0.40]];
    segs.forEach(function(sg, i){
      var x=sg[0]*w, y=sg[1]*h, r=sg[2]*h;
      c.fillStyle=col; c.strokeStyle='#000'; c.lineWidth=1.6;
      c.beginPath(); c.arc(x,y,r,0,Math.PI*2); c.fill(); c.stroke();
      c.fillStyle=shade(col,-0.4);
      c.beginPath(); c.arc(x, y-r*0.25, r*0.55, Math.PI*1.1, Math.PI*1.9); c.lineTo(x,y-r*0.1); c.fill();
      c.fillStyle=shade(col,0.55);
      c.beginPath(); c.ellipse(x, y+r*0.55, r*0.7, r*0.3, 0, 0, Math.PI*2); c.fill();
    });
    /* tête */
    var hx=w*0.36, hy=-h*0.22;
    c.fillStyle=col; c.strokeStyle='#000'; c.lineWidth=1.6;
    c.beginPath(); c.ellipse(hx, hy, h*0.42, h*0.3, -0.15, 0, Math.PI*2); c.fill(); c.stroke();
    /* langue fourchue */
    c.strokeStyle='#ff0033'; c.lineWidth=1;
    c.beginPath(); c.moveTo(hx+h*0.4, hy+1); c.lineTo(hx+h*0.62, hy+1.5);
    c.lineTo(hx+h*0.72, hy); c.moveTo(hx+h*0.62, hy+1.5); c.lineTo(hx+h*0.72, hy+3); c.stroke();
    /* crocs */
    c.fillStyle='#fff';
    c.beginPath(); c.moveTo(hx+h*0.18, hy+h*0.18); c.lineTo(hx+h*0.24, hy+h*0.36); c.lineTo(hx+h*0.3, hy+h*0.16); c.fill();
    /* oeil jaune à pupille fendue */
    c.fillStyle='#FFE600'; c.beginPath(); c.ellipse(hx+h*0.1, hy-h*0.08, 2.2, 1.7, 0, 0, Math.PI*2); c.fill();
    c.fillStyle='#000'; c.fillRect(hx+h*0.1-0.4, hy-h*0.08-1.5, 0.9, 3);
  }
  function star(c, x, y, r, col){
    c.fillStyle=col; c.beginPath();
    for(var i=0;i<10;i++){
      var rr=i%2?r*0.45:r, a=-Math.PI/2+i*Math.PI/5;
      c.lineTo(x+Math.cos(a)*rr, y+Math.sin(a)*rr);
    }
    c.closePath(); c.fill();
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
    /* élastique du lance-pierre pendant qu'on tire */
    if(aim.dragging && aim.pull){
      ctx.setLineDash([6,6]); ctx.strokeStyle='rgba(255,255,255,0.75)'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(ox-6,oy); ctx.lineTo(aim.pull.x,aim.pull.y); ctx.lineTo(ox+6,oy); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(aim.pull.x,aim.pull.y,6,0,Math.PI*2); ctx.fill();
    }
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
  /* Inclinaison purement visuelle : suit la pente au sol, penche dans le
     sens du mouvement en l'air (les rebonds se voient mieux). */
  function updateTilts(dt){
    var g=view.grid;
    view.tanks.forEach(function(t){
      var s=TANKS[t.type];
      function ground(x){
        for(var dy=0;dy<=10;dy+=1){ if(solidPx(g, x, t.y+s.h/2+dy)) return dy; }
        return -1;
      }
      var l=ground(t.x-s.w/2+2), r=ground(t.x+s.w/2-2), target;
      if(l>=0 && r>=0) target=Math.atan2(r-l, s.w-4);
      else {
        var vx=(t._px!==undefined && dt>0) ? (t.x-t._px)/dt : 0;
        target=clamp(vx*0.0011, -0.45, 0.45);
      }
      t._px=t.x;
      t._tilt=(t._tilt||0)+(clamp(target,-0.7,0.7)-(t._tilt||0))*Math.min(1,dt*10);
    });
  }
  var lastFrame=performance.now();
  function render(now){
    requestAnimationFrame(render);
    if(!$('bots-screen-battle').classList.contains('active') || !view.grid) return;
    var dt=Math.min(0.05,(now-lastFrame)/1000); lastFrame=now;
    stepReplay(now);
    if(dirty) rebuildTerrain();
    updateCamera(dt, false);
    ctx.setTransform(1,0,0,1,0,0);
    ctx.fillStyle='#000'; ctx.fillRect(0,0,W,H);
    applyCamera();
    ctx.imageSmoothingEnabled=true;
    ctx.drawImage(bgCanvas,0,0);
    /* ombre portée du terrain, puis le terrain */
    ctx.globalAlpha=0.45; ctx.drawImage(shadowCanvas,5,6); ctx.globalAlpha=1;
    ctx.drawImage(terrainCanvas,0,0);
    updateTilts(dt);
    /* halo clair : les tanks restent lisibles même sur un terrain de leur couleur */
    ctx.save(); ctx.shadowColor='rgba(255,255,255,0.75)'; ctx.shadowBlur=8;
    view.tanks.forEach(function(t){ drawTank(ctx, t, tankColor(t), 1); });
    ctx.restore();
    view.tanks.forEach(drawTankLabel);
    /* obus */
    view.projs.forEach(function(p){
      ctx.fillStyle='#000'; ctx.beginPath(); ctx.arc(p.x,p.y,5,0,Math.PI*2); ctx.fill();
      ctx.fillStyle=p.c||'#FFE600'; ctx.beginPath(); ctx.arc(p.x,p.y,3,0,Math.PI*2); ctx.fill();
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
      ctx.font='bold '+(tx.big?44:20)+'px "Bebas Neue", Oswald, sans-serif'; ctx.textAlign='center';
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
    if(view.waterY<view.waterStart && view.phase==='aiming'){
      ctx.font='bold 14px Oswald, sans-serif'; ctx.textAlign='right';
      ctx.fillStyle='#9ad7ff'; ctx.fillText(view.map==='volcano' ? '🌋 La lave monte !' : '🌊 L’eau monte !', W-10, 20);
    }
  }
  requestAnimationFrame(render);

  /* ----- plein écran + paysage pour le combat (Android ; l'iPhone ne le permet pas aux sites) ----- */
  var fsEl=document.documentElement;
  function canFull(){ return !!(fsEl.requestFullscreen || fsEl.webkitRequestFullscreen); }
  function isFull(){ return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function lockLandscape(){
    if(screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function(){});
  }
  function enterFull(){
    var p=fsEl.requestFullscreen ? fsEl.requestFullscreen() : (fsEl.webkitRequestFullscreen(), null);
    Promise.resolve(p).then(lockLandscape).catch(function(){});
  }
  function exitFull(){
    try{ if(screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); }catch(e){}
    if(isFull()){ try{ (document.exitFullscreen||document.webkitExitFullscreen).call(document); }catch(e){} }
  }
  $('botsFullBtn').hidden=!canFull();
  $('botsFullBtn').addEventListener('click',function(){ sfxToggle(); if(isFull()) exitFull(); else enterFull(); });
  document.addEventListener('fullscreenchange',function(){ $('botsFullBtn').querySelector('span').textContent=isFull()?'⛶ Quitter le plein écran':'⛶ Plein écran'; });
  /* dans l'app installée (déjà en plein écran), on passe en paysage pendant le combat */
  new MutationObserver(function(){
    var on=$('bots-screen-battle').classList.contains('active');
    if(on && CG.isApp && CG.isApp()) lockLandscape();
    else if(!on){ try{ if(screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); }catch(e){} if(isFull() && !on) exitFull(); }
  }).observe($('bots-screen-battle'), {attributes:true, attributeFilter:['class']});

  /* ---------- API pour le hub ---------- */
  CG.bots = {
    reset: function(){
      if(botsNetRole) cleanupOnline();
      closeModal('botsDisconnectModal');
      gotoScreen('online');
    },
    enterJoinFlow: function(code){
      gotoScreen('online');
      $('botsJoinCode').value=CG.cleanRoomCode(decodeURIComponent(code));
    },
    /* exposé pour les tests */
    _simulate: simulateTurn, _drop: dropTank, _drawTank: drawTank, _view: function(){ return view; }, _host: function(){ return bs; }
  };
  /* réactions et petits messages dans le lobby (common.js) */
  CG.lobbyChat(net, $('botsPlayerList'), 'botsName');
})();
