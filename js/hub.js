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

  /* ----- hub toolbar: info modal + mute ----- */
  CG.wireModal('hubInfoModal', 'hubInfoBtn');

  function refreshMuteBtn(){
    $('muteBtn').querySelector('span').textContent = CG.isMuted() ? '🔇 Son coupé' : '🔊 Son activé';
  }
  $('muteBtn').addEventListener('click',function(){
    CG.setMuted(!CG.isMuted());
    refreshMuteBtn();
    if(!CG.isMuted()) CG.sfxToggle();
  });
  function refreshMusicBtn(){
    var on=window.CGAudio && CGAudio.isMusicOn();
    $('musicBtn').querySelector('span').textContent = on ? '🎵 Musique activée' : '🎵 Musique coupée';
  }
  $('musicBtn').addEventListener('click',function(){
    if(window.CGAudio) CGAudio.setMusicOn(!CGAudio.isMusicOn());
    refreshMusicBtn(); CG.sfxToggle();
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

  refreshMuteBtn();
  refreshMusicBtn();
  router(true);
  (function(){ var r=parseHash(); if(r.query.room) autoJoin(r.route); })();
})();
