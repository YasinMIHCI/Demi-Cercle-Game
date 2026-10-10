/* CRAZY GAMES — outils partagés par tous les jeux du hub.
   Tout est exposé sur window.CG (pas de modules, pour rester compatible
   avec GitHub Pages et l'ouverture directe du fichier). */
(function(){
  'use strict';
  var CG = window.CG = window.CG || {};

  /* ---------- DOM ---------- */
  function $(id){ return document.getElementById(id); }
  function escapeHtml(s){
    var d=document.createElement('div'); d.textContent=s; return d.innerHTML;
  }
  function shuffle(arr){
    for(var i=arr.length-1;i>0;i--){
      var j=Math.floor(Math.random()*(i+1));
      var tmp=arr[i]; arr[i]=arr[j]; arr[j]=tmp;
    }
    return arr;
  }
  function shake(el){
    el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
  }
  function openModal(id){ $(id).classList.add('open'); }
  function closeModal(id){ $(id).classList.remove('open'); }

  /* Comparaison souple de mots : ignore la casse, les accents, les
     espaces et la ponctuation ("Éléphant" == "elephant", "Spider-Man" == "spiderman"). */
  function normalizeWord(s){
    s=(s||'').toLowerCase().replace(/œ/g,'oe').replace(/æ/g,'ae');
    if(s.normalize) s=s.normalize('NFD').replace(/[̀-ͯ]/g,'');
    return s.replace(/[^a-z0-9]/g,'');
  }

  function copyText(text, btnEl){
    function done(){
      var span=btnEl.querySelector('span');
      var old=span.textContent; span.textContent='✅ Copié !';
      setTimeout(function(){ span.textContent=old; },1400);
    }
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(done)['catch'](done);
    } else {
      var ta=document.createElement('textarea'); ta.value=text; document.body.appendChild(ta);
      ta.select(); try{document.execCommand('copy');}catch(e){} document.body.removeChild(ta);
      done();
    }
  }

  /* ---------- AUDIO ---------- */
  var actx=null;
  var audioMuted=false;
  try{ audioMuted = localStorage.getItem('crazygames_muted')==='1'; }catch(e){}
  function ensureAudio(){
    if(!actx){
      var AC = window.AudioContext||window.webkitAudioContext;
      if(AC) actx = new AC();
    }
    if(actx && actx.state==='suspended') actx.resume();
  }
  function tone(freq,dur,type,gainVal,delay){
    if(!actx || audioMuted) return;
    type=type||'square'; gainVal=gainVal||0.15; delay=delay||0;
    var t0=actx.currentTime+delay;
    var osc=actx.createOscillator();
    var gain=actx.createGain();
    osc.type=type;
    osc.frequency.setValueAtTime(freq,t0);
    gain.gain.setValueAtTime(gainVal,t0);
    gain.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
    osc.connect(gain); gain.connect(actx.destination);
    osc.start(t0); osc.stop(t0+dur+0.03);
  }
  function sfxToggle(){ tone(330,0.06,'square',0.10,0); }
  function sfxValidate(){ tone(440,0.07,'square',0.14,0); tone(660,0.09,'square',0.12,0.06); }
  function sfxWhoosh(){ tone(180,0.15,'sawtooth',0.08,0); }
  function sfxReveal(points){
    if(points>=100){ tone(523,0.1,'square',0.2,0); tone(659,0.1,'square',0.2,0.09); tone(784,0.1,'square',0.2,0.18); tone(1047,0.3,'square',0.22,0.27); }
    else if(points>=80){ tone(523,0.1,'square',0.18,0); tone(784,0.2,'square',0.18,0.11); }
    else if(points>=50){ tone(392,0.14,'triangle',0.16,0); tone(523,0.16,'triangle',0.14,0.09); }
    else if(points>=20){ tone(294,0.2,'triangle',0.14,0); }
    else { tone(140,0.28,'sawtooth',0.14,0); tone(90,0.3,'sawtooth',0.12,0.1); }
  }
  document.addEventListener('pointerdown', ensureAudio);
  function isMuted(){ return audioMuted; }
  function setMuted(v){
    audioMuted=!!v;
    try{ localStorage.setItem('crazygames_muted', audioMuted?'1':'0'); }catch(e){}
  }

  /* Barre de temps (même style que Battle Bots) : start(ms restantes, durée totale). */
  function timerBar(fillId, textId){
    var tick=null, endsAt=0, total=1;
    function update(){
      var left=Math.max(0, endsAt-Date.now()), fill=$(fillId), text=$(textId);
      if(fill) fill.style.width=(left/total*100)+'%';
      if(text) text.textContent='⏳ '+Math.ceil(left/1000)+' s';
      if(!left){ clearInterval(tick); tick=null; }
    }
    return {
      start:function(ms, totalMs){
        endsAt=Date.now()+Math.max(0,ms||0); total=totalMs||ms||1;
        clearInterval(tick); tick=setInterval(update, 250); update();
      },
      stop:function(){ clearInterval(tick); tick=null; }
    };
  }

  CG.$=$;
  CG.timerBar=timerBar;
  CG.escapeHtml=escapeHtml;
  CG.shuffle=shuffle;
  CG.shake=shake;
  CG.openModal=openModal;
  CG.closeModal=closeModal;
  CG.normalizeWord=normalizeWord;
  CG.copyText=copyText;
  CG.sfxToggle=sfxToggle;
  CG.sfxValidate=sfxValidate;
  CG.sfxWhoosh=sfxWhoosh;
  CG.sfxReveal=sfxReveal;
  CG.isMuted=isMuted;
  CG.setMuted=setMuted;
})();
