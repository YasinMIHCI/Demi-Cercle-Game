/* BATTLE BOTS — cartes : génération (hôte), décors et rendu du terrain.

   Le terrain physique est une grille de cases de 4 px (voir js/bots.js).
   Pour l'affichage, on lisse cette grille (interpolation bilinéaire +
   seuil) puis on la texture pixel par pixel selon le thème de la carte :
   liseré de surface, contour sombre, briques, conteneurs... */
(function(){
  'use strict';
  var CG=window.CG;

  var W=960, H=540, CELL=4, GW=W/CELL, GH=H/CELL;
  var EMPTY=0, DIRT=1, STONE=2, METAL_R=3, METAL_B=4, METAL_Y=5;

  /* ---------- hasard reproductible (décors identiques chez tous) ---------- */
  function rng(seed){
    var s=seed>>>0 || 1;
    return function(){ s^=s<<13; s>>>=0; s^=s>>17; s^=s<<5; s>>>=0; return s/4294967296; };
  }
  function hash(x,y){
    var h=(x*374761393+y*668265263)|0;
    h=(h^(h>>>13))*1274126177|0;
    return ((h^(h>>>16))>>>0)/4294967296;
  }
  function vnoise(x,y){
    var xi=Math.floor(x), yi=Math.floor(y), fx=x-xi, fy=y-yi;
    fx=fx*fx*(3-2*fx); fy=fy*fy*(3-2*fy);
    var a=hash(xi,yi), b=hash(xi+1,yi), c=hash(xi,yi+1), d=hash(xi+1,yi+1);
    return a+(b-a)*fx+(c-a)*fy+(a-b-c+d)*fx*fy;
  }

  /* ---------- outils de génération ---------- */
  function newGrid(){ return new Uint8Array(GW*GH); }
  function fillRect(g, cx, cy, w, h, v){
    for(var y=cy;y<cy+h;y++) for(var x=cx;x<cx+w;x++){
      if(x>=0&&x<GW&&y>=0&&y<GH) g[y*GW+x]=v;
    }
  }
  function get(g,cx,cy){ return (cx<0||cx>=GW||cy<0||cy>=GH)?EMPTY:g[cy*GW+cx]; }
  /* choisit n points de départ bien espacés parmi des candidats */
  function spreadPick(cands, n){
    if(!cands.length) return [];
    var chosen=[cands.slice().sort(function(a,b){ return a.x-b.x; })[0]];
    while(chosen.length<n && chosen.length<cands.length){
      var best=null, bestD=-1;
      cands.forEach(function(c){
        if(chosen.indexOf(c)!==-1) return;
        var d=Infinity;
        chosen.forEach(function(o){ d=Math.min(d, Math.abs(o.x-c.x)+Math.abs(o.y-c.y)*0.6); });
        if(d>bestD){ bestD=d; best=c; }
      });
      chosen.push(best);
    }
    while(chosen.length<n) chosen.push(cands[chosen.length%cands.length]);
    return chosen.sort(function(a,b){ return a.x-b.x; });
  }

  /* ===================== CARTE 1 : SHIBUYA ===================== */
  function genShibuya(n, R){
    var g=newGrid();
    var p1=R()*6.28, p2=R()*6.28, p3=R()*6.28;
    var a1=40+R()*40, a2=20+R()*25, a3=6+R()*8;
    var f1=1+R()*1.5, f2=3+R()*3, f3=9+R()*6;
    var base=330+R()*40, heights=[], cx, cy, k;
    for(cx=0;cx<GW;cx++){
      var t=cx/GW*Math.PI*2;
      heights.push(Math.max(225, Math.min(450, base+a1*Math.sin(t*f1+p1)+a2*Math.sin(t*f2+p2)+a3*Math.sin(t*f3+p3))));
    }
    for(cx=0;cx<GW;cx++) for(cy=Math.floor(heights[cx]/CELL);cy<GH;cy++) g[cy*GW+cx]=DIRT;
    var islands=1+Math.floor(R()*3);
    for(k=0;k<islands;k++){
      var ix=120+R()*(W-240), iy=75+R()*55, rx=40+R()*50, ry=10+R()*8;
      for(cy=0;cy<GH;cy++) for(cx=0;cx<GW;cx++){
        var dx=(cx*CELL+2-ix)/rx, dy=(cy*CELL+2-iy)/ry;
        if(dx*dx+dy*dy<=1) g[cy*GW+cx]=DIRT;
      }
    }
    var pillarCols=[];
    var pillars=2+Math.floor(R()*3);
    for(k=0;k<pillars;k++){
      var px=Math.floor((0.15+0.7*(k+R()*0.6)/pillars)*GW);
      var pw=3+Math.floor(R()*3), ph=10+Math.floor(R()*14);
      fillRect(g, px, Math.floor(heights[px]/CELL)-ph, pw, ph+3, STONE);
      pillarCols.push([px*CELL-24, (px+pw)*CELL+24]);
    }
    for(cx=0;cx<GW;cx++) for(cy=GH-6;cy<GH;cy++) if(g[cy*GW+cx]===DIRT && R()<0.6) g[cy*GW+cx]=STONE;
    var cands=[];
    for(var x=40;x<W-40;x+=20){
      var blocked=pillarCols.some(function(c){ return x>c[0]&&x<c[1]; });
      if(!blocked) cands.push({x:x, y:160});
    }
    return {grid:g, spawns:spreadPick(cands,n)};
  }

  /* ===================== CARTE 2 : LA PRISON ===================== */
  /* Bâtiment fermé sur 3 étages : planchers de pierre percés de trappes,
     murs de cellules avec des portes (certaines murées de gravats). */
  function genPrison(n, R){
    var g=newGrid(), k, cx;
    var F1=40, F2=77, GROUND=113;               /* lignes (en cases) des planchers */
    fillRect(g, 0, GROUND, GW, GH-GROUND, DIRT);
    fillRect(g, 0, GH-8, GW, 8, STONE);
    fillRect(g, 0, 0, GW, 4, STONE);             /* plafond */
    fillRect(g, 0, 0, 3, GH, STONE);             /* murs extérieurs */
    fillRect(g, GW-3, 0, 3, GH, STONE);
    var gaps={};
    [F1,F2].forEach(function(row, li){
      fillRect(g, 0, row, GW, 3, STONE);
      /* tronçons en gravats : on peut les faire sauter */
      for(k=0;k<3;k++){ fillRect(g, 10+Math.floor(R()*(GW-40)), row, 14+Math.floor(R()*10), 3, DIRT); }
      /* deux trappes, pas alignées d'un étage à l'autre */
      var gs=[];
      for(k=0;k<2;k++){
        var gx=Math.floor((0.12+0.4*k+R()*0.3)*GW)+(li?18:0);
        gx=Math.max(8,Math.min(GW-24,gx));
        fillRect(g, gx, row, 14, 3, EMPTY);
        gs.push([gx-4, gx+18]);
      }
      gaps[row]=gs;
    });
    /* murs de cellules par étage, avec une porte en bas */
    var zones=[[4,F1],[F1+3,F2],[F2+3,GROUND]];
    var walls=[];
    zones.forEach(function(z, zi){
      var count=2+(zi===1?1:0);
      for(k=0;k<count;k++){
        var wx=Math.floor(((k+0.5)/count+(R()-0.5)*0.12)*GW);
        var floorGaps=gaps[z[1]]||[];
        if(floorGaps.some(function(gp){ return wx>gp[0]-6 && wx<gp[1]+6; })) wx+=24;
        wx=Math.max(20,Math.min(GW-24,wx));
        fillRect(g, wx, z[0], 3, z[1]-z[0], STONE);
        var doorH=11;
        var door=R()<0.55 ? EMPTY : DIRT;            /* porte ouverte ou murée de gravats */
        fillRect(g, wx, z[1]-doorH, 3, doorH, door);
        walls.push(wx);
      }
    });
    /* quelques caisses de gravats dans les couloirs */
    for(k=0;k<5;k++){
      var zz=zones[Math.floor(R()*3)];
      cx=6+Math.floor(R()*(GW-20));
      fillRect(g, cx, zz[1]-5, 6, 5, DIRT);
    }
    var cands=[];
    zones.forEach(function(z){
      for(var x=30;x<W-30;x+=18){
        var c=Math.floor(x/CELL);
        var nearWall=walls.some(function(w){ return c>w-6 && c<w+9; });
        var overGap=(gaps[z[1]]||[]).some(function(gp){ return c>gp[0] && c<gp[1]; });
        if(!nearWall && !overGap) cands.push({x:x, y:(z[0]+2)*CELL+4});
      }
    });
    return {grid:g, spawns:spreadPick(cands,n)};
  }

  /* ===================== CARTE 3 : LES DOCKS ===================== */
  /* Îlots séparés par la mer, quais en béton et conteneurs empilés :
     un bon recul et c'est le plongeon. */
  function genDocks(n, R){
    var g=newGrid(), k, cx, cy;
    var count=4+Math.floor(R()*2);
    var islands=[];
    for(k=0;k<count;k++){
      var c=(k+0.5)/count*W+(R()-0.5)*30;
      var w=(W/count)*(0.58+R()*0.18);
      var top=320+R()*80;
      islands.push({c:c, w:w, top:top});
      for(cx=Math.floor((c-w/2)/CELL);cx<=Math.floor((c+w/2)/CELL);cx++){
        if(cx<0||cx>=GW) continue;
        var u=(cx*CELL-c)/(w/2);
        var h=top+(1-Math.cos(Math.max(-1,Math.min(1,u))*Math.PI/2))*55+(R()-0.5)*4;
        for(cy=Math.floor(h/CELL);cy<GH;cy++) g[cy*GW+cx]=DIRT;
      }
      /* quai en béton sur une île sur deux */
      if(k%2===0){
        var qx=Math.floor((c-w*0.35)/CELL), qw=Math.floor(w*0.7/CELL);
        var qy=Math.floor(top/CELL)-1;
        fillRect(g, qx, qy, qw, 3, STONE);
        for(cx=qx;cx<qx+qw;cx++) for(cy=qy+3;cy<GH && get(g,cx,cy)===EMPTY;cy++) g[cy*GW+cx]=DIRT;
      }
    }
    /* conteneurs */
    var metals=[METAL_R,METAL_B,METAL_Y];
    islands.forEach(function(isl, i){
      if(R()<0.35) return;
      var stacks=1+Math.floor(R()*2);
      var x0=Math.floor((isl.c+(R()<0.5?-1:1)*isl.w*0.18)/CELL)-6;
      var surface=GH;
      for(cx=x0;cx<x0+12;cx++){ for(cy=0;cy<GH && get(g,cx,cy)===EMPTY;cy++); surface=Math.min(surface,cy); }
      for(var s=0;s<stacks;s++){
        var off=s===1?Math.floor(R()*4)-2:0;
        fillRect(g, x0+off, surface-6*(s+1), 12, 6, metals[(i+s)%3]);
      }
      isl.container=[x0*CELL-10, (x0+12)*CELL+10];
    });
    var cands=[];
    islands.forEach(function(isl){
      for(var x=isl.c-isl.w*0.32;x<=isl.c+isl.w*0.32;x+=16){
        if(isl.container && x>isl.container[0] && x<isl.container[1]) continue;
        cands.push({x:Math.round(x), y:150});
      }
    });
    return {grid:g, spawns:spreadPick(cands,n)};
  }

  /* ===================== THÈMES (couleurs + décors) ===================== */
  function clamp8(v){ return v<0?0:(v>255?255:v|0); }
  var THEMES={
    shibuya:{
      outline:[6,0,2],
      water:'rgba(14,20,48,0.93)', wave:'rgba(255,60,80,0.75)',
      paint:function(m, px, py, rim, band, n){
        if(m===DIRT){
          if(rim) return [255,24+n*30,46];
          if(band) return [8,0,2];
          /* hachures noires façon Persona 5 sur un rouge sombre */
          if(((px-py+2000)%22)<6) return [34+n*10,3,8];
          return [118+n*50, 14+n*14, 30+n*16];
        }
        var v=188+n*40;
        if(rim) v=242;
        if((px%16)===0 || (py%22)===0) v-=55;
        return [v, v, v+6];
      }
    },
    prison:{
      outline:[14,14,18],
      water:'rgba(40,70,22,0.93)', wave:'rgba(170,230,80,0.8)',
      paint:function(m, px, py, rim, band, n){
        if(m===DIRT){
          if(rim) return [150,138,118];
          var speck=hash(px,py)>0.93 ? 30 : 0;
          return [72+n*30+speck, 66+n*26+speck, 60+n*22+speck];
        }
        /* briques décalées d'une rangée à l'autre */
        var row=Math.floor(py/12), bx=px+(row%2)*12;
        if((py%12)<2 || (bx%24)<2) return [46,46,54];
        var b=hash(Math.floor(bx/24), row)*28;
        if(rim) b+=26;
        return [96+b+n*12, 98+b+n*12, 112+b+n*12];
      }
    },
    docks:{
      outline:[18,10,4],
      water:'rgba(10,40,78,0.9)', wave:'rgba(255,220,170,0.85)',
      paint:function(m, px, py, rim, band, n){
        if(m===DIRT){
          if(rim) return [236,196,112+n*20];
          if(band) return [176,132,74];
          var rock=vnoise(px/14,py/14)>0.72 ? 26 : 0;
          return [92+n*26+rock, 62+n*18+rock, 40+n*12+rock];
        }
        if(m===STONE){
          var v=150+n*30;
          if(rim) v=196;
          if((px%32)===0) v-=50;
          if(((px+4)%32)<2 && ((py+2)%8)<2) v+=40;      /* rivets */
          return [v, v, v-6];
        }
        var col = m===METAL_R ? [176,38,36] : (m===METAL_B ? [36,86,160] : [214,160,28]);
        var rib = (px%7)<2 ? -34 : 0;
        var frame = (py%24)<3 || (py%24)>21 ? -50 : 0;
        var k=rib+frame+n*20+(rim?20:0);
        return [col[0]+k, col[1]+k, col[2]+k];
      }
    }
  };

  /* Décors de fond (peints une fois, mêmes pour tous grâce à la graine). */
  function paintBackground(c, key, seed){
    var R=rng(seed*7+3), i, x, y, w, h, gr;
    c.save();
    if(key==='shibuya'){
      gr=c.createLinearGradient(0,0,0,H);
      gr.addColorStop(0,'#2a0510'); gr.addColorStop(0.55,'#12040a'); gr.addColorStop(1,'#050205');
      c.fillStyle=gr; c.fillRect(0,0,W,H);
      /* lune rouge */
      c.fillStyle='rgba(255,40,60,0.18)'; c.beginPath(); c.arc(760,110,92,0,Math.PI*2); c.fill();
      c.fillStyle='#ff2a3c'; c.beginPath(); c.arc(760,110,62,0,Math.PI*2); c.fill();
      c.fillStyle='#2a0510'; c.beginPath(); c.arc(785,95,56,0,Math.PI*2); c.fill();
      /* deux rangées d'immeubles */
      [[0.45,'#1c0810',260],[0.8,'#0b0306',330]].forEach(function(layer){
        x=-10;
        while(x<W){
          w=30+R()*70; h=layer[2]*0.35+R()*layer[2]*0.6;
          c.fillStyle=layer[1]; c.fillRect(x, H-h-60, w, h+60);
          for(var wy=H-h-50; wy<H-40; wy+=14) for(var wx=x+5; wx<x+w-8; wx+=11){
            if(R()<0.22){ c.fillStyle=R()<0.7?'rgba(255,230,0,'+layer[0]*0.6+')':'rgba(255,40,70,'+layer[0]*0.6+')'; c.fillRect(wx,wy,5,7); }
          }
          x+=w+4+R()*10;
        }
      });
      c.globalAlpha=0.08; c.strokeStyle='#ff0033'; c.lineWidth=16;
      for(x=-H;x<W;x+=70){ c.beginPath(); c.moveTo(x,0); c.lineTo(x+H,H); c.stroke(); }
    } else if(key==='prison'){
      gr=c.createLinearGradient(0,0,0,H);
      gr.addColorStop(0,'#1a1d26'); gr.addColorStop(1,'#0b0c10');
      c.fillStyle=gr; c.fillRect(0,0,W,H);
      /* mur de briques lointain */
      c.globalAlpha=0.35;
      for(y=0;y<H;y+=18){
        for(x=((y/18)%2)*20-20;x<W;x+=40){
          c.fillStyle='rgb('+(40+R()*14|0)+','+(42+R()*14|0)+','+(52+R()*14|0)+')';
          c.fillRect(x+1,y+1,38,16);
        }
      }
      c.globalAlpha=1;
      /* barreaux de cellules */
      for(i=0;i<6;i++){
        var bx0=60+i*150+R()*30, by0=40+Math.floor(R()*3)*140;
        c.fillStyle='rgba(0,0,0,0.5)'; c.fillRect(bx0-6,by0-6,92,92);
        c.fillStyle='#0d0e12'; c.fillRect(bx0,by0,80,80);
        c.strokeStyle='#5d6370'; c.lineWidth=4;
        for(x=bx0+8;x<bx0+80;x+=14){ c.beginPath(); c.moveTo(x,by0); c.lineTo(x,by0+80); c.stroke(); }
        c.fillStyle='#5d6370'; c.fillRect(bx0,by0+30,80,4);
      }
      /* faisceaux de projecteurs */
      [[200,0],[720,0]].forEach(function(s){
        gr=c.createRadialGradient(s[0],s[1],10,s[0],s[1],420);
        gr.addColorStop(0,'rgba(255,240,180,0.18)'); gr.addColorStop(1,'rgba(255,240,180,0)');
        c.fillStyle=gr; c.beginPath(); c.moveTo(s[0]-10,s[1]); c.lineTo(s[0]-160,H); c.lineTo(s[0]+160,H); c.closePath(); c.fill();
      });
      /* lampes rouges d'alarme */
      for(i=0;i<5;i++){ c.fillStyle='rgba(255,0,40,0.5)'; c.beginPath(); c.arc(100+i*190,26,5,0,Math.PI*2); c.fill(); }
    } else {
      gr=c.createLinearGradient(0,0,0,H);
      gr.addColorStop(0,'#2b0b3a'); gr.addColorStop(0.45,'#b02a3a'); gr.addColorStop(0.75,'#ff9a3c'); gr.addColorStop(1,'#ffd27a');
      c.fillStyle=gr; c.fillRect(0,0,W,H);
      c.fillStyle='rgba(255,236,170,0.95)'; c.beginPath(); c.arc(300,330,70,0,Math.PI*2); c.fill();
      c.fillStyle='rgba(255,180,90,0.35)'; c.beginPath(); c.arc(300,330,110,0,Math.PI*2); c.fill();
      /* bateaux et grues en silhouette */
      c.fillStyle='rgba(40,10,40,0.75)';
      for(i=0;i<3;i++){
        x=80+i*320+R()*80; y=400;
        c.fillRect(x,y-18,150,18); c.fillRect(x+20,y-40,40,22); c.fillRect(x+90,y-30,30,12);
      }
      c.strokeStyle='rgba(40,10,40,0.8)'; c.lineWidth=6;
      [[560,150],[860,190]].forEach(function(cr){
        c.beginPath(); c.moveTo(cr[0],420); c.lineTo(cr[0],cr[1]); c.lineTo(cr[0]+120,cr[1]); c.stroke();
        c.beginPath(); c.moveTo(cr[0],cr[1]+30); c.lineTo(cr[0]+60,cr[1]); c.stroke();
        c.lineWidth=2; c.beginPath(); c.moveTo(cr[0]+100,cr[1]); c.lineTo(cr[0]+100,cr[1]+90); c.stroke(); c.lineWidth=6;
      });
      /* mouettes */
      c.strokeStyle='rgba(40,10,40,0.7)'; c.lineWidth=2;
      for(i=0;i<6;i++){
        x=100+R()*760; y=60+R()*140;
        c.beginPath(); c.moveTo(x-8,y); c.quadraticCurveTo(x-4,y-6,x,y); c.quadraticCurveTo(x+4,y-6,x+8,y); c.stroke();
      }
    }
    c.restore();
  }

  /* ===================== RENDU DU TERRAIN ===================== */
  /* Peint la zone [x0,x1[ x [y0,y1[ de l'image (960x540) à partir de la grille. */
  function paintTerrain(img, g, key, x0, y0, x1, y1){
    var th=THEMES[key]||THEMES.shibuya, d=img.data, ol=th.outline;
    x0=Math.max(0,x0|0); y0=Math.max(0,y0|0); x1=Math.min(W,Math.ceil(x1)); y1=Math.min(H,Math.ceil(y1));
    function S(px,py){
      var gx=px/CELL-0.5, gy=py/CELL-0.5;
      var i=Math.floor(gx), j=Math.floor(gy), fx=gx-i, fy=gy-j;
      var i0=i<0?0:(i>=GW?GW-1:i), i1=i+1<0?0:(i+1>=GW?GW-1:i+1);
      var a=0,b=0,c=0,e=0;
      if(j>=0 && j<GH){ a=g[j*GW+i0]?1:0; b=g[j*GW+i1]?1:0; }
      else if(j>=GH){ a=1; b=1; }
      var j1=j+1;
      if(j1>=0 && j1<GH){ c=g[j1*GW+i0]?1:0; e=g[j1*GW+i1]?1:0; }
      else if(j1>=GH){ c=1; e=1; }
      return (a*(1-fx)+b*fx)*(1-fy)+(c*(1-fx)+e*fx)*fy;
    }
    for(var py=y0;py<y1;py++){
      for(var px=x0;px<x1;px++){
        var o=(py*W+px)*4;
        if(S(px+0.5,py+0.5)<0.5){ d[o+3]=0; continue; }
        var cx=Math.floor(px/CELL), cy=Math.floor(py/CELL);
        var m=g[cy*GW+cx];
        if(!m){
          m=get(g,cx+1,cy)||get(g,cx-1,cy)||get(g,cx,cy+1)||get(g,cx,cy-1)||DIRT;
        }
        var col;
        if(S(px-1.5,py+0.5)<0.5 || S(px+2.5,py+0.5)<0.5 || S(px+0.5,py-1.5)<0.5 || S(px+0.5,py+2.5)<0.5){
          col=ol;
        } else {
          var rim=S(px+0.5,py-5)<0.5, band=!rim && S(px+0.5,py-9)<0.5;
          var n=vnoise(px/9,py/9)*0.7+hash(px,py)*0.3;
          col=th.paint(m, px, py, rim, band, n);
        }
        d[o]=clamp8(col[0]); d[o+1]=clamp8(col[1]); d[o+2]=clamp8(col[2]); d[o+3]=255;
      }
    }
  }

  var MAPS={
    shibuya:{name:'SHIBUYA', ico:'🌃', desc:'Collines, îlots flottants et piliers sous la lune rouge.', gen:genShibuya, waterStart:516},
    prison:{name:'LA PRISON', ico:'⛓️', desc:'Bâtiment fermé sur 3 étages : trappes, cellules et murs à faire sauter.', gen:genPrison, waterStart:516},
    docks:{name:'LES DOCKS', ico:'⚓', desc:'Îles, quais et conteneurs au coucher du soleil. Gare au plongeon !', gen:genDocks, waterStart:468}
  };

  CG.botsMaps={
    MAPS:MAPS, ORDER:['shibuya','prison','docks'],
    EMPTY:EMPTY, DIRT:DIRT, STONE:STONE,
    generate:function(key, n, seed){ return MAPS[key].gen(n, rng(seed)); },
    paintBackground:paintBackground,
    paintTerrain:paintTerrain,
    theme:function(key){ return THEMES[key]||THEMES.shibuya; }
  };
})();
