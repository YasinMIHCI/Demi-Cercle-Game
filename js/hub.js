/* CRAZY GAMES — hub : routeur par hash (#hub, #demicercle, #cameleon, #imposteur, #bots, #loup),
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

  function router(isInitial){
    var r = parseHash();
    if(r.route==='demicercle'){
      showView('demicercle');
      if(isInitial && r.query.room) CG.demicercle.enterJoinFlow(r.query.room);
    } else if(r.route==='cameleon'){
      showView('cameleon');
      if(isInitial && r.query.room) CG.cameleon.enterJoinFlow(r.query.room);
    } else if(r.route==='loup'){
      showView('loup');
      if(isInitial && r.query.room) CG.loup.enterJoinFlow(r.query.room);
    } else if(r.route==='bots'){
      showView('bots');
      if(isInitial && r.query.room) CG.bots.enterJoinFlow(r.query.room);
    } else if(r.route==='imposteur'){
      showView('imposteur');
      if(isInitial && r.query.room) CG.imposteur.enterJoinFlow(r.query.room);
    } else {
      /* retour au hub : on quitte proprement les salles en cours */
      CG.demicercle.reset();
      CG.cameleon.reset();
      CG.imposteur.reset();
      CG.bots.reset();
      CG.loup.reset();
      showView('hub');
    }
  }
  window.addEventListener('hashchange', function(){ router(false); });

  function goHome(){ location.hash='hub'; }
  $('hubReturnBtn').addEventListener('click',function(){ CG.sfxToggle(); goHome(); });
  $('playDemicercleBtn').addEventListener('click',function(){ CG.sfxToggle(); location.hash='demicercle'; });
  $('playLoupBtn').addEventListener('click',function(){ CG.sfxToggle(); location.hash='loup'; });
  $('playBotsBtn').addEventListener('click',function(){ CG.sfxToggle(); location.hash='bots'; });
  $('playImposteurBtn').addEventListener('click',function(){ CG.sfxToggle(); location.hash='imposteur'; });
  $('playCameleonBtn').addEventListener('click',function(){ CG.sfxToggle(); location.hash='cameleon'; });

  /* ----- hub toolbar: info modal + mute ----- */
  $('hubInfoBtn').addEventListener('click',function(){ CG.openModal('hubInfoModal'); CG.sfxToggle(); });
  $('hubInfoModalClose').addEventListener('click',function(){ CG.closeModal('hubInfoModal'); });
  $('hubInfoModal').addEventListener('click',function(e){ if(e.target===this) CG.closeModal('hubInfoModal'); });

  function refreshMuteBtn(){
    $('muteBtn').querySelector('span').textContent = CG.isMuted() ? '🔇 Son coupé' : '🔊 Son activé';
  }
  $('muteBtn').addEventListener('click',function(){
    CG.setMuted(!CG.isMuted());
    refreshMuteBtn();
    if(!CG.isMuted()) CG.sfxToggle();
  });

  refreshMuteBtn();
  router(true);
})();
