/* CRAZY GAMES — hub : routeur par hash (#hub, #demicercle, #cameleon, #imposteur, #bots, #loup, #classement, #quiaecrit, #crousprison),
   modale d'infos et bouton son. Chargé en dernier. */
(function(){
  'use strict';
  var CG=window.CG, $=CG.$;

  function showView(name){
    var views=document.querySelectorAll('.view');
    for(var i=0;i<views.length;i++){ views[i].classList.remove('active'); }
    $('view-'+name).classList.add('active');
    window.scrollTo({top:0,behavior:'auto'});
  }

  function parseHash(){
    var raw = location.hash.replace(/^#/,'');
    var route, query={};
    var qIdx = raw.indexOf('?');
    if(qIdx>=0){
      route = raw.substring(0,qIdx);
      raw.substring(qIdx+1).split('&').forEach(function(pair){
        if(!pair) return;
        var kv = pair.split('=');
        query[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1]||'');
      });
    } else {
      route = raw;
    }
    return {route: route||'hub', query: query};
  }

  /* musique de fond selon l'écran (js/audio.js) */
  var MUSIC={hub:'lounge', bots:'riot', demicercle:'heist', cameleon:'heist', imposteur:'heist', loup:'heist', classement:'heist', quiaecrit:'heist', crousprison:'riot', soiree:'heist', emoji:'heist'};
  /* quitte proprement les salles en cours ; un jeu qui n'a pas pu se charger ne doit pas bloquer les autres */
  function resetGames(){
    ['demicercle','cameleon','imposteur','bots','loup','classement','quiaecrit','crousprison','emoji'].forEach(function(k){
      try{ if(CG[k]) CG[k].reset(); }catch(e){}
    });
  }
  function router(isInitial){
    var r = parseHash();
    if(window.CGAudio) CGAudio.play(MUSIC[r.route]||'lounge');
    if(r.route==='soiree'){
      /* retour à la soirée : on ferme la salle du jeu de la manche précédente */
      resetGames();
      showView('soiree');
      if(isInitial && r.query.room) CG.party.enterJoinFlow(r.query.room);
    } else if(r.route==='demicercle'){
      showView('demicercle');
      if(isInitial && r.query.room) CG.demicercle.enterJoinFlow(r.query.room);
    } else if(r.route==='cameleon'){
      showView('cameleon');
      if(isInitial && r.query.room) CG.cameleon.enterJoinFlow(r.query.room);
    } else if(r.route==='crousprison'){
      showView('crousprison');
      if(isInitial && r.query.room) CG.crousprison.enterJoinFlow(r.query.room);
    } else if(r.route==='quiaecrit'){
      showView('quiaecrit');
      if(isInitial && r.query.room) CG.quiaecrit.enterJoinFlow(r.query.room);
    } else if(r.route==='classement'){
      showView('classement');
      if(isInitial && r.query.room) CG.classement.enterJoinFlow(r.query.room);
    } else if(r.route==='loup'){
      showView('loup');
      if(isInitial && r.query.room) CG.loup.enterJoinFlow(r.query.room);
    } else if(r.route==='bots'){
      showView('bots');
      if(isInitial && r.query.room) CG.bots.enterJoinFlow(r.query.room);
    } else if(r.route==='emoji'){
      showView('emoji');
      if(isInitial && r.query.room) CG.emoji.enterJoinFlow(r.query.room);
    } else if(r.route==='imposteur'){
      showView('imposteur');
      if(isInitial && r.query.room) CG.imposteur.enterJoinFlow(r.query.room);
    } else {
      /* retour au hub : on quitte proprement les salles en cours */
      /* un jeu qui n'a pas pu se charger ne doit pas bloquer les autres */
      resetGames();
      try{ if(CG.party) CG.party.reset(); }catch(e){}
      showView('hub');
    }
  }
  window.addEventListener('hashchange', function(){ router(false); });

  /* Lien ou QR code d'invitation : si le pseudo est déjà connu (compte ou
     dernière partie), on rejoint la salle directement, sans autre clic. */
  var AUTOJOIN={demicercle:['onlineName','joinRoomBtn'], cameleon:['chamName','chamJoinRoomBtn'], imposteur:['impName','impJoinRoomBtn'],
    loup:['loupName','loupJoinRoomBtn'], classement:['clsName','clsJoinRoomBtn'], quiaecrit:['qaeName','qaeJoinRoomBtn'],
    crousprison:['copName','copJoinRoomBtn'], bots:['botsName','botsJoinRoomBtn'], soiree:['partyName','partyJoinRoomBtn'], emoji:['emoName','emoJoinRoomBtn']};
  function autoJoin(route){
    var a=AUTOJOIN[route]; if(!a) return;
    setTimeout(function(){
      var name=$(a[0]), btn=$(a[1]);
      if(name && name.value.trim() && btn && !btn.disabled) btn.click();
      else if(name){ try{ name.focus(); }catch(e){} }
    }, 350);
  }
  CG.autoJoin=autoJoin;

  function goHome(){ location.hash='hub'; }
  $('hubReturnBtn').addEventListener('click',function(){ CG.sfxToggle(); goHome(); });
  $('playDemicercleBtn').addEventListener('click',function(){ CG.sfxToggle(); location.hash='demicercle'; });
  $('playSoireeBtn').addEventListener('click',function(){ CG.sfxToggle(); location.hash='soiree'; });
  $('playCrousprisonBtn').addEventListener('click',function(){ CG.sfxToggle(); location.hash='crousprison'; });
  $('playQuiaecritBtn').addEventListener('click',function(){ CG.sfxToggle(); location.hash='quiaecrit'; });
  $('playClassementBtn').addEventListener('click',function(){ CG.sfxToggle(); location.hash='classement'; });
  $('playLoupBtn').addEventListener('click',function(){ CG.sfxToggle(); location.hash='loup'; });
  $('playBotsBtn').addEventListener('click',function(){ CG.sfxToggle(); location.hash='bots'; });
  $('playEmojiBtn').addEventListener('click',function(){ CG.sfxToggle(); location.hash='emoji'; });
  $('playImposteurBtn').addEventListener('click',function(){ CG.sfxToggle(); location.hash='imposteur'; });
  $('playCameleonBtn').addEventListener('click',function(){ CG.sfxToggle(); location.hash='cameleon'; });

  /* ----- hub : fenêtre d'infos ----- */
  CG.wireModal('hubInfoModal', 'hubInfoBtn');

  /* ----- son et musique : rangés dans les Réglages ----- */
  function refreshSoundToggles(){
    $('setSoundOn').checked = !CG.isMuted();
    $('setMusicOn').checked = !!(window.CGAudio && CGAudio.isMusicOn());
  }
  $('setSoundOn').addEventListener('change',function(){
    CG.setMuted(!this.checked);
    if(this.checked) CG.sfxToggle();
  });
  $('setMusicOn').addEventListener('change',function(){
    if(window.CGAudio) CGAudio.setMusicOn(this.checked);
    CG.sfxToggle();
  });
  $('settingsBtn').addEventListener('click', refreshSoundToggles);

  /* ----- « On est combien ? » : met en avant les jeux jouables à ce nombre ----- */
  var FILTER_KEY='crazygames_hub_players';
  var cards=Array.prototype.slice.call(document.querySelectorAll('#gameGrid .game-card'));
  function applyFilter(n){
    var chips=document.querySelectorAll('#hubFilter .hub-chip'), ok=0;
    for(var i=0;i<chips.length;i++){
      var on=+chips[i].getAttribute('data-n')===n;
      chips[i].classList.toggle('active', on);
      chips[i].setAttribute('aria-pressed', on?'true':'false');
    }
    cards.forEach(function(c, idx){
      var fits = !n || (n>=+c.getAttribute('data-min') && n<=+c.getAttribute('data-max'));
      if(fits) ok++;
      c.classList.toggle('dim', !fits);
      /* les jeux jouables passent devant, sans changer leur ordre entre eux */
      c.style.order = fits ? idx : 100+idx;
    });
    $('hubFilterNote').textContent = n ? (ok+' jeu'+(ok>1?'x':'')+' pour '+n+' joueur'+(n>1?'s':'')+(n===1?' (solo)':'')) : '';
    try{ localStorage.setItem(FILTER_KEY, String(n)); }catch(e){}
  }
  $('hubFilter').addEventListener('click',function(e){
    var b=e.target.closest ? e.target.closest('.hub-chip') : null;
    if(!b) return;
    CG.sfxToggle();
    applyFilter(+b.getAttribute('data-n'));
  });
  (function(){ var n=0; try{ n=+(localStorage.getItem(FILTER_KEY)||0); }catch(e){} applyFilter(n>=1 && n<=10 ? n : 0); })();

  /* toute la carte est cliquable (le bouton ▶ JOUER reste la cible au clavier) */
  cards.forEach(function(c){
    var btn=c.querySelector('.btn');
    c.addEventListener('click',function(e){ if(btn && !(e.target.closest && e.target.closest('.btn'))) btn.click(); });
  });

  /* ----- réglages : volumes, vibrations, revoir l'intro ----- */
  CG.wireModal('settingsModal', 'settingsBtn');
  var AU=window.CGAudio;
  ['music','sfx'].forEach(function(k){
    var el=$(k==='music'?'setMusicVol':'setSfxVol');
    el.value=Math.round((AU && AU.getVolume ? AU.getVolume(k) : 1)*100);
    el.addEventListener('input',function(){ if(AU && AU.setVolume) AU.setVolume(k, el.value/100); });
    if(k==='sfx') el.addEventListener('change', CG.sfxValidate);
  });
  $('setVibrate').checked=CG.vibrateOn();
  if(!navigator.vibrate){ $('setVibrate').disabled=true; $('setVibrateNote').hidden=false; }
  $('setVibrate').addEventListener('change',function(){ CG.setVibrate(this.checked); CG.buzz(60); });
  $('replayIntroBtn').addEventListener('click',function(){ location.href=location.pathname+'?intro=1'; });

  refreshSoundToggles();
  router(true);
  (function(){ var r=parseHash(); if(r.query.room) autoJoin(r.route); })();
})();
