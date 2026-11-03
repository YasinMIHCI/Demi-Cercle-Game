/* CRAZY GAMES — app installable (PWA) : enregistrement du service worker
   (sw.js) et bouton « Installer l'app » du hub.
   - Android (Chrome, Brave, Samsung Internet…) : le navigateur fournit sa
     fenêtre d'installation ; sinon on explique où la trouver dans le menu.
   - iPhone / iPad : Apple n'a pas de fenêtre d'installation, on affiche les
     étapes (Partager → « Sur l'écran d'accueil »). */
(function(){
  'use strict';
  var CG=window.CG, $=CG.$;

  /* le service worker exige https (ou localhost pour les tests) */
  var secure=location.protocol==='https:' || location.hostname==='localhost' || location.hostname==='127.0.0.1';
  if('serviceWorker' in navigator && secure){
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('sw.js').catch(function(){});
    });
  }

  var ua=navigator.userAgent||'';
  var isIOS=/iPhone|iPad|iPod/.test(ua) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
  var isAndroid=/Android/.test(ua);
  var isSamsung=/SamsungBrowser/.test(ua);
  function isApp(){
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone===true;
  }
  CG.isApp=isApp;

  var deferred=null;
  var btn=$('installBtn');
  function refresh(){ btn.style.display = isApp() ? 'none' : 'inline-block'; }
  window.addEventListener('beforeinstallprompt', function(e){ e.preventDefault(); deferred=e; refresh(); });
  window.addEventListener('appinstalled', function(){ deferred=null; CG.closeModal('installModal'); refresh(); });

  function steps(){
    if(isIOS){
      var other=/CriOS|FxiOS|EdgiOS/.test(ua);
      return '<ol class="rules-list install-steps">'+
        '<li>Appuie sur <b>Partager</b> <span class="ios-share" aria-hidden="true"></span> '+(other?'(dans le menu de ton navigateur)':'(en bas de Safari, ou dans le menu « ··· »)')+'.</li>'+
        '<li>Fais défiler et choisis <b>« Sur l\'écran d\'accueil »</b>. Absent ? Tout en bas : « Modifier les actions ».</li>'+
        '<li>Si l\'option <b>« Ouvrir en tant qu\'app web »</b> apparaît, laisse-la activée.</li>'+
        '<li>Appuie sur <b>Ajouter</b> : l\'icône CRAZY GAMES arrive sur ton écran d\'accueil.</li>'+
        '</ol><p class="subtitle">L\'app a sa propre mémoire : records, codes et questions perso enregistrés dans Safari n\'y sont pas repris.</p>';
    }
    if(isAndroid){
      return '<ol class="rules-list install-steps">'+
        (isSamsung
          ? '<li>Appuie sur l\'icône d\'installation dans la barre d\'adresse, ou ouvre le menu <b>☰</b> → <b>« Ajouter la page à »</b> → <b>« Écran d\'accueil »</b>.</li>'
          : '<li>Ouvre le menu <b>⋮</b> du navigateur (Chrome, Brave…).</li><li>Choisis <b>« Installer l\'application »</b> ou <b>« Ajouter à l\'écran d\'accueil »</b>.</li>')+
        '<li>Confirme : l\'icône CRAZY GAMES arrive sur ton écran d\'accueil.</li></ol>'+
        '<p class="subtitle">Sous Brave : si tes potes n\'arrivent pas à te rejoindre, désactive le bouclier (icône du lion) pour ce site.</p>';
    }
    return '<ol class="rules-list install-steps"><li>Sur ordinateur (Chrome, Edge, Brave) : clique sur l\'icône d\'installation à droite de la barre d\'adresse, ou menu → « Installer CRAZY GAMES ».</li>'+
      '<li>Sur téléphone, ouvre ce site et appuie sur ce même bouton : les étapes s\'afficheront pour ton appareil.</li></ol>';
  }
  btn.addEventListener('click', function(){
    CG.sfxToggle();
    if(deferred){
      var e=deferred; deferred=null;
      e.prompt();
      (e.userChoice||Promise.resolve()).then(refresh, refresh);
      return;
    }
    $('installSteps').innerHTML=steps();
    CG.openModal('installModal');
  });
  CG.wireModal('installModal');
  if(isApp()) document.documentElement.classList.add('is-app');
  refresh();
})();
