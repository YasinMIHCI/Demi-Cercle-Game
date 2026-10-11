/* CRAZY GAMES — son commun à tout le site : un seul AudioContext, son
   déblocage, les instruments synthétisés et les musiques (OST originales).

   Déblocage : les navigateurs gardent la page muette tant que l'utilisateur
   n'a rien touché. On retente donc au premier geste (clic, relâché du doigt,
   touche du clavier) — sur iPhone, seul le relâché (touchend) compte, pas le
   simple appui. Sur iOS, le son Web Audio est aussi coupé par le bouton
   « silencieux » : jouer en même temps une piste <audio> muette fait passer la
   page en mode « lecture », comme une vidéo.

   Musiques (composées pour le site, dans l'esprit acid-jazz de Persona) :
   - lounge : hub et menus (jazz feutré, piano électrique, vibraphone, balais) ;
   - heist  : jeux de soirée (funk, basse slap, clavinet, cuivres) ;
   - riot   : Battle Bots (rock-fusion nerveux, guitare saturée, arpèges).
   Chargé avant tous les autres scripts : expose window.CGAudio. */
(function(){
  'use strict';
  var AC=window.AudioContext||window.webkitAudioContext;
  var A=window.CGAudio={ctx:null, unlocked:false};
  var muted=false, musicOn=true;
  try{ muted=localStorage.getItem('crazygames_muted')==='1'; musicOn=localStorage.getItem('crazygames_music')!=='0'; }catch(e){}
  if(!AC){
    A.onUnlock=function(){}; A.isMuted=function(){ return muted; }; A.setMuted=function(v){ muted=!!v; };
    A.isMusicOn=function(){ return musicOn; }; A.setMusicOn=function(v){ musicOn=!!v; }; A.play=function(){}; A.allowMusic=function(){};
    return;
  }
  var ctx=A.ctx=new AC();
  /* chaîne de sortie : master -> compresseur -> haut-parleurs */
  var comp=ctx.createDynamicsCompressor();
  comp.threshold.value=-14; comp.knee.value=10; comp.ratio.value=4; comp.attack.value=0.004; comp.release.value=0.2;
  comp.connect(ctx.destination);
  var master=A.master=ctx.createGain(); master.gain.value=muted?0:1; master.connect(comp);
  var sfx=A.sfx=ctx.createGain(); sfx.gain.value=0.9; sfx.connect(master);
  var musicBus=A.musicBus=ctx.createGain(); musicBus.gain.value=musicOn?0.42:0; musicBus.connect(master);
  /* réverbération : réponse impulsionnelle générée (bruit qui décroît) */
  var reverb=ctx.createConvolver();
  (function(){
    var sr=ctx.sampleRate, len=Math.floor(sr*2.2), ir=ctx.createBuffer(2,len,sr);
    for(var ch=0;ch<2;ch++){ var d=ir.getChannelData(ch); for(var i=0;i<len;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.6); }
    reverb.buffer=ir;
  })();
  var reverbOut=ctx.createGain(); reverbOut.gain.value=0.32; reverb.connect(reverbOut); reverbOut.connect(musicBus);
  var noiseBuf=(function(){
    var len=Math.floor(ctx.sampleRate*1.5), b=ctx.createBuffer(1,len,ctx.sampleRate), d=b.getChannelData(0);
    for(var i=0;i<len;i++) d[i]=Math.random()*2-1;
    return b;
  })();
  A.noiseBuf=noiseBuf;
  var distCurve=(function(){
    var n=1024, c=new Float32Array(n);
    for(var i=0;i<n;i++){ var x=i/(n-1)*2-1; c[i]=Math.tanh(x*3.2); }
    return c;
  })();

  /* ===================== DÉBLOCAGE ===================== */
  var unlockCbs=[];
  function fireUnlock(){
    if(A.unlocked || ctx.state!=='running') return;
    A.unlocked=true;
    var cbs=unlockCbs; unlockCbs=[];
    cbs.forEach(function(cb){ try{ cb(); }catch(e){} });
    ['touchend','click','keydown','pointerup'].forEach(function(ev){ document.removeEventListener(ev, tryUnlock, true); });
  }
  A.onUnlock=function(cb){ if(A.unlocked) cb(); else unlockCbs.push(cb); };
  var silentEl=null;
  function silentAudio(){
    /* iOS : une piste <audio> muette met la page en mode « lecture » (le bouton silencieux ne coupe plus le son) */
    if(silentEl) return;
    try{
      var sr=8000, n=sr/2, b=new ArrayBuffer(44+n*2), v=new DataView(b);
      function w(o,s){ for(var i=0;i<s.length;i++) v.setUint8(o+i,s.charCodeAt(i)); }
      w(0,'RIFF'); v.setUint32(4,36+n*2,true); w(8,'WAVE'); w(12,'fmt '); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
      v.setUint32(24,sr,true); v.setUint32(28,sr*2,true); v.setUint16(32,2,true); v.setUint16(34,16,true); w(36,'data'); v.setUint32(40,n*2,true);
      silentEl=document.createElement('audio');
      silentEl.setAttribute('playsinline',''); silentEl.setAttribute('x-webkit-airplay','deny');
      silentEl.loop=true; silentEl.preload='auto';
      silentEl.src=URL.createObjectURL(new Blob([b],{type:'audio/wav'}));
      var p=silentEl.play(); if(p && p.catch) p.catch(function(){});
    }catch(e){}
  }
  function tryUnlock(){
    try{ if(navigator.audioSession) navigator.audioSession.type='playback'; }catch(e){}
    silentAudio();
    if(ctx.state!=='running'){ var p=ctx.resume(); if(p && p.then) p.then(fireUnlock, function(){}); }
    else fireUnlock();
  }
  ctx.onstatechange=function(){ if(ctx.state==='running') fireUnlock(); };
  ['touchend','click','keydown','pointerup'].forEach(function(ev){ document.addEventListener(ev, tryUnlock, true); });
  /* au chargement : certains navigateurs autorisent déjà le son (site visité souvent) */
  try{ var p0=ctx.resume(); if(p0 && p0.then) p0.then(fireUnlock, function(){}); }catch(e){}
  if(ctx.state==='running') setTimeout(fireUnlock, 0);

  A.isMuted=function(){ return muted; };
  A.setMuted=function(v){
    muted=!!v;
    try{ localStorage.setItem('crazygames_muted', muted?'1':'0'); }catch(e){}
    var t=ctx.currentTime; master.gain.cancelScheduledValues(t); master.gain.setTargetAtTime(muted?0:1, t, 0.05);
  };
  A.isMusicOn=function(){ return musicOn; };
  A.setMusicOn=function(v){
    musicOn=!!v;
    try{ localStorage.setItem('crazygames_music', musicOn?'1':'0'); }catch(e){}
    var t=ctx.currentTime; musicBus.gain.cancelScheduledValues(t); musicBus.gain.setTargetAtTime(musicOn?0.42:0, t, 0.15);
  };

  /* ===================== INSTRUMENTS ===================== */
  function mtof(m){ return 440*Math.pow(2,(m-69)/12); }
  function env(g, t, peak, attack, dur, rel){
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t+attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t+dur+(rel||0));
  }
  function send(node, out, wet){
    node.connect(out);
    if(wet){ var s=ctx.createGain(); s.gain.value=wet; node.connect(s); s.connect(reverb); }
  }
  function noise(t, dur, o, out){
    var src=ctx.createBufferSource(); src.buffer=noiseBuf;
    var f=ctx.createBiquadFilter(); f.type=o.type||'bandpass'; f.Q.value=o.q||1;
    f.frequency.setValueAtTime(o.f0||1000, t);
    if(o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t+dur);
    var g=ctx.createGain(); env(g, t, o.gain||0.3, o.attack||0.004, dur);
    src.connect(f); f.connect(g); send(g, out, o.wet);
    src.start(t, Math.random()*0.8); src.stop(t+dur+0.05);
  }
  function osc(t, dur, o, out){
    var s=ctx.createOscillator(); s.type=o.type||'sine';
    s.frequency.setValueAtTime(o.f0, t);
    if(o.f1) s.frequency.exponentialRampToValueAtTime(o.f1, t+(o.glide||dur));
    if(o.detune) s.detune.value=o.detune;
    var g=ctx.createGain(); env(g, t, o.gain||0.2, o.attack||0.004, dur, o.rel);
    var last=s;
    if(o.lp){
      var f=ctx.createBiquadFilter(); f.type='lowpass'; f.Q.value=o.q||0.8;
      f.frequency.setValueAtTime(o.lp, t);
      if(o.lp1) f.frequency.exponentialRampToValueAtTime(o.lp1, t+(o.lpTime||dur));
      s.connect(f); last=f;
    }
    if(o.dist){ var ws=ctx.createWaveShaper(); ws.curve=distCurve; last.connect(ws); last=ws; }
    last.connect(g); send(g, out, o.wet);
    s.start(t); s.stop(t+dur+(o.rel||0)+0.05);
    return s;
  }
  var I=A.inst={
    kick:function(t,out,v){ v=v||0.8; osc(t,0.34,{f0:150,f1:44,glide:0.11,gain:v},out); noise(t,0.015,{type:'highpass',f0:3500,gain:0.12*v},out); },
    snare:function(t,out,v){ v=v||0.5; noise(t,0.17,{type:'bandpass',f0:1900,q:0.8,gain:0.6*v,wet:0.15},out); osc(t,0.09,{type:'triangle',f0:210,f1:150,gain:0.35*v},out); },
    brush:function(t,out,v){ v=v||0.3; noise(t,0.22,{type:'bandpass',f0:3200,q:0.6,gain:v,attack:0.02,wet:0.2},out); },
    rim:function(t,out,v){ v=v||0.3; osc(t,0.05,{type:'triangle',f0:1700,gain:v},out); noise(t,0.03,{type:'bandpass',f0:2500,q:3,gain:0.6*v},out); },
    clap:function(t,out,v){ v=v||0.45; [0,0.011,0.022].forEach(function(d){ noise(t+d,0.09,{type:'bandpass',f0:1400,q:1.2,gain:v,wet:0.2},out); }); },
    hat:function(t,out,v,open){ noise(t, open?0.22:0.035, {type:'highpass',f0:open?7000:8200,gain:v||0.1}, out); },
    shaker:function(t,out,v){ noise(t,0.05,{type:'highpass',f0:6000,gain:v||0.04,attack:0.015},out); },
    crash:function(t,out,v){ v=v||0.3; noise(t,1.5,{type:'highpass',f0:5000,gain:v,attack:0.002,wet:0.3},out); },
    /* basses */
    upright:function(t,out,m,dur){ var f=mtof(m); osc(t,dur,{type:'triangle',f0:f,gain:0.5,attack:0.008,lp:900},out); osc(t,0.06,{type:'sine',f0:f*2,gain:0.12},out); },
    funk:function(t,out,m,dur,v){ var f=mtof(m); v=v||1; osc(t,dur,{type:'sawtooth',f0:f,gain:0.32*v,lp:1600,lp1:260,lpTime:0.12,q:6},out); osc(t,dur,{type:'square',f0:f/2,gain:0.1*v,lp:300},out); },
    pump:function(t,out,m,dur){ var f=mtof(m); osc(t,dur,{type:'sawtooth',f0:f,gain:0.3,lp:900,lp1:200,lpTime:dur,q:3,dist:true},out); osc(t,dur,{type:'sine',f0:f/2,gain:0.22},out); },
    /* piano électrique (synthèse FM, façon Rhodes) */
    epiano:function(t,out,ms,dur,v){
      v=v||0.4;
      ms.forEach(function(m){
        var f=mtof(m), car=ctx.createOscillator(), mod=ctx.createOscillator(), mg=ctx.createGain(), g=ctx.createGain();
        car.frequency.value=f; mod.frequency.value=f;
        mg.gain.setValueAtTime(f*2.2, t); mg.gain.exponentialRampToValueAtTime(f*0.25, t+0.6);
        mod.connect(mg); mg.connect(car.frequency);
        env(g, t, v/ms.length*1.6, 0.006, dur+0.4, 0.3);
        car.connect(g); send(g, out, 0.35);
        car.start(t); mod.start(t); car.stop(t+dur+0.8); mod.stop(t+dur+0.8);
        osc(t,0.25,{type:'sine',f0:f*7,gain:v/ms.length*0.12},out);  /* attaque « métallique » */
      });
    },
    vibes:function(t,out,m,dur){ var f=mtof(m); osc(t,dur+1.2,{type:'sine',f0:f,gain:0.22,attack:0.004,wet:0.5},out); osc(t,0.8,{type:'sine',f0:f*4,gain:0.05,wet:0.5},out); },
    clav:function(t,out,ms,dur,v){ ms.forEach(function(m){ osc(t,dur,{type:'square',f0:mtof(m),gain:(v||0.3)/ms.length*1.4,lp:2600,lp1:900,lpTime:0.08,q:4},out); }); },
    brass:function(t,out,m,dur,v){
      var f=mtof(m); v=v||0.22;
      [-8,8].forEach(function(dt){ osc(t,dur,{type:'sawtooth',f0:f,detune:dt,gain:v,attack:0.03,lp:700,lp1:2600,lpTime:0.06,q:1.5,wet:0.25},out); });
    },
    pluck:function(t,out,m,dur,v){ osc(t,dur,{type:'sawtooth',f0:mtof(m),gain:v||0.14,lp:4200,lp1:350,lpTime:0.18,q:3,wet:0.3},out); },
    power:function(t,out,ms,dur,v){ ms.forEach(function(m){ osc(t,dur,{type:'sawtooth',f0:mtof(m),gain:(v||0.1),lp:2600,dist:true,detune:(m%2?6:-6)},out); }); },
    pad:function(t,out,ms,dur,v){ ms.forEach(function(m){ [-10,10].forEach(function(dt){ osc(t,dur,{type:'sawtooth',f0:mtof(m),detune:dt,gain:(v||0.035),attack:0.5,rel:0.6,lp:950,wet:0.4},out); }); }); }
  };
  A.noise=noise; A.osc=osc; A.mtof=mtof;

  /* ===================== MUSIQUES ===================== */
  /* chaque piste joue des pas de double-croche : play(mesure, pas 0..15, temps, sortie) */
  var TRACKS={};
  /* --- LOUNGE : hub et menus. ii-V-I jazz en do, 92 BPM, swing --- */
  (function(){
    var CH=[
      {b:38, v:[53,57,60,64]},   /* Dm9 */
      {b:43, v:[53,59,64,69]},   /* G13 */
      {b:48, v:[52,55,59,62]},   /* Cmaj9 */
      {b:45, v:[55,61,65,70]},   /* A7(b9) */
      {b:38, v:[53,57,60,64]},
      {b:43, v:[53,59,64,69]},
      {b:40, v:[55,59,62,65]},   /* Em7(b5)… */
      {b:45, v:[55,61,64,67]}    /* A7 */
    ];
    var MEL=[
      [[4,69,2],[6,72,2],[8,74,6]],
      [[6,77,2],[8,76,4],[12,74,4]],
      [[0,71,4],[4,72,8]],
      [[8,73,2],[10,76,2],[12,79,4]],
      [[4,69,2],[6,72,2],[8,74,4],[12,77,4]],
      [[0,76,6],[8,74,2],[10,72,2],[12,71,4]],
      [[0,67,4],[8,69,4]],
      [[0,74,8],[10,73,2],[12,72,4]]
    ];
    TRACKS.lounge={bpm:92, swing:0.3, play:function(bar,s,t,o,sd){
      var c=CH[bar%8], n=CH[(bar+1)%8];
      if(s===0||s===8) I.kick(t,o,0.5);
      if(s===10 && bar%2) I.kick(t,o,0.3);
      if(s===4||s===12) I.brush(t,o,0.22);
      if(s%4===0) I.hat(t,o,0.05); if(s%4===2) I.hat(t,o,0.08);
      I.shaker(t,o,0.018);
      /* contrebasse : fondamentale, quinte, approche chromatique */
      if(s===0) I.upright(t,o,c.b,sd*5);
      if(s===6) I.upright(t,o,c.b+7,sd*2);
      if(s===8) I.upright(t,o,c.b+12,sd*3);
      if(s===12) I.upright(t,o,c.b+7,sd*2);
      if(s===14) I.upright(t,o,n.b+(n.b>c.b?-1:1),sd*2);
      /* piano électrique */
      if(s===0) I.epiano(t,o,c.v,sd*7,0.42);
      if(s===10 && bar%2===0) I.epiano(t,o,c.v,sd*2,0.25);
      if(s===14 && bar%2) I.epiano(t,o,n.v,sd*2,0.28);
      /* vibraphone : la mélodie revient une fois sur deux */
      if(Math.floor(bar/8)%2===1) MEL[bar%8].forEach(function(nt){ if(nt[0]===s) I.vibes(t,o,nt[1],sd*nt[2]); });
      if(s===0 && bar%8===0) I.pad(t,o,[50,57,60,64],sd*60,0.022);
    }};
  })();
  /* --- HEIST : jeux de soirée. Am9 / D9 / Fmaj9 / E7#9, 112 BPM, funk --- */
  (function(){
    var CH=[{r:33, v:[60,64,67,71]}, {r:38, v:[54,57,60,64]}, {r:41, v:[57,60,64,67]}, {r:40, v:[56,62,67]}];
    var BASS=[[0,0,2],[3,12,1],[4,0,1],[6,7,2],[8,10,1],[10,12,1],[11,0,1],[13,7,1],[14,10,2]];
    var HOOK=[
      [[0,76,2],[3,74,1],[4,72,2],[8,69,2],[10,72,2],[12,74,4]],
      [[0,75,3],[4,76,8],[14,72,2]]
    ];
    TRACKS.heist={bpm:112, swing:0.12, play:function(bar,s,t,o,sd){
      var c=CH[bar%4];
      if(s===0||s===7||s===8||(s===14&&bar%2)) I.kick(t,o,0.75);
      if(s===4||s===12) I.clap(t,o,0.38);
      I.hat(t,o, s%2 ? 0.035 : 0.08);
      if(s===14 && bar%2===0) I.hat(t,o,0.08,true);
      BASS.forEach(function(b){ if(b[0]===s) I.funk(t,o,c.r+12+b[1],sd*b[2]*0.9); });
      if(s===2||s===6||s===10||s===13) I.clav(t,o,c.v.map(function(m){ return m+12; }),sd*0.8,0.22);
      if(s===0) I.epiano(t,o,c.v,sd*3,0.22);
      var ph=bar%8;
      if(ph===6||ph===7) HOOK[ph-6].forEach(function(nt){ if(nt[0]===s) I.brass(t,o,nt[1],sd*nt[2]); });
      if(s===0 && bar%4===0) I.pad(t,o,[57,60,64,67],sd*60,0.02);
    }};
  })();
  /* --- RIOT : Battle Bots. Em / C / D / B7, 140 BPM, rock-fusion --- */
  (function(){
    var CH=[{r:40, v:[52,59,64]}, {r:36, v:[48,55,60]}, {r:38, v:[50,57,62]}, {r:35, v:[47,54,59,63]}];
    var CHUG=[[0,3],[3,1],[6,2],[8,3],[11,1],[14,2]];
    TRACKS.riot={bpm:140, swing:0, play:function(bar,s,t,o,sd){
      var c=CH[bar%4];
      if(s===0||s===3||s===8||(s===10&&bar%2)) I.kick(t,o,0.85);
      if(s===4||s===12) I.snare(t,o,0.55);
      I.hat(t,o, s%2 ? 0.03 : 0.08);
      if(s===0 && bar%8===0) I.crash(t,o,0.22);
      if(s%2===0) I.pump(t,o,c.r+12+((s===6||s===14)?12:0),sd*1.6);
      CHUG.forEach(function(ch){ if(ch[0]===s) I.power(t,o,c.v,sd*ch[1]*0.9,0.06); });
      /* arpège sur la seconde moitié de la phrase */
      if(bar%8>=4){
        var tones=c.v.map(function(m){ return m+24; }), up=[0,1,2,1];
        I.pluck(t,o,tones[up[s%4]%tones.length]+(s>=8?12:0),sd*0.9,0.09);
      }
    }};
  })();
  A.TRACKS=TRACKS;

  /* séquenceur : programme les notes un peu en avance (pas d'à-coups) */
  var cur=null, timer=null, wanted=null, allowMusic=false;
  function stopCurrent(fade){
    if(!cur) return;
    var g=cur.gain, t=ctx.currentTime;
    g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0.0001, t+(fade||0.8));
    setTimeout(function(){ try{ g.disconnect(); }catch(e){} }, (fade||0.8)*1000+300);
    cur=null;
  }
  function startTrack(name){
    var tr=TRACKS[name]; if(!tr) return;
    stopCurrent(0.9);
    var g=ctx.createGain(); g.connect(musicBus);
    g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.linearRampToValueAtTime(1, ctx.currentTime+1.2);
    cur={name:name, tr:tr, gain:g, bar:0, step:0, next:ctx.currentTime+0.12};
    if(!timer) timer=setInterval(tick, 25);
  }
  function tick(){
    if(!cur){ clearInterval(timer); timer=null; return; }
    var sd=60/cur.tr.bpm/4;
    /* onglet en arrière-plan : on se recale au lieu de rattraper le retard d'un coup */
    if(cur.next<ctx.currentTime-0.2) cur.next=ctx.currentTime+0.05;
    while(cur.next<ctx.currentTime+0.14){
      var sw=(cur.step%4===2) ? cur.tr.swing*sd : ((cur.step%2===1) ? cur.tr.swing*0.4*sd : 0);
      try{ cur.tr.play(cur.bar, cur.step, cur.next+sw, cur.gain, sd); }catch(e){}
      cur.step++; if(cur.step>=16){ cur.step=0; cur.bar++; }
      cur.next+=sd;
    }
  }
  function apply(){
    if(!allowMusic || !A.unlocked || !wanted || document.hidden){ if(cur && (!wanted || document.hidden || !allowMusic)) stopCurrent(0.5); return; }
    if(!cur || cur.name!==wanted) startTrack(wanted);
  }
  /* le jeu indique quelle musique il veut ; elle démarre dès que le son est débloqué */
  A.play=function(name){ wanted=name||null; apply(); };
  A.current=function(){ return cur ? cur.name : null; };
  /* pas de musique de fond pendant l'intro : elle est autorisée ensuite */
  A.allowMusic=function(v){ allowMusic=v!==false; apply(); };
  A.onUnlock(apply);
  document.addEventListener('visibilitychange', apply);
})();
