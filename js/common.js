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

  /* ---------- AUDIO ----------
     Le contexte audio, son déblocage et le réglage « son coupé » sont communs
     à tout le site (js/audio.js) ; ici, les petits bruitages des menus. */
  var AU=window.CGAudio||null;
  function tone(freq,dur,type,gainVal,delay){
    var actx=AU && AU.ctx;
    if(!actx || actx.state!=='running' || AU.isMuted()) return;
    type=type||'square'; gainVal=gainVal||0.15; delay=delay||0;
    var t0=actx.currentTime+delay;
    var osc=actx.createOscillator();
    var gain=actx.createGain();
    osc.type=type;
    osc.frequency.setValueAtTime(freq,t0);
    gain.gain.setValueAtTime(gainVal,t0);
    gain.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
    osc.connect(gain); gain.connect(AU.sfx);
    osc.start(t0); osc.stop(t0+dur+0.03);
  }
  function sfxToggle(){ tone(330,0.06,'square',0.10,0); }
  function sfxValidate(){ tone(440,0.07,'square',0.14,0); tone(660,0.09,'square',0.12,0.06); }
  function sfxWhoosh(){ tone(180,0.15,'sawtooth',0.08,0); }
  function sfxReveal(points){
    buzz(points>=80 ? [40,40,90] : 70);
    if(points>=100){ tone(523,0.1,'square',0.2,0); tone(659,0.1,'square',0.2,0.09); tone(784,0.1,'square',0.2,0.18); tone(1047,0.3,'square',0.22,0.27); }
    else if(points>=80){ tone(523,0.1,'square',0.18,0); tone(784,0.2,'square',0.18,0.11); }
    else if(points>=50){ tone(392,0.14,'triangle',0.16,0); tone(523,0.16,'triangle',0.14,0.09); }
    else if(points>=20){ tone(294,0.2,'triangle',0.14,0); }
    else { tone(140,0.28,'sawtooth',0.14,0); tone(90,0.3,'sawtooth',0.12,0.1); }
  }
  function isMuted(){ return AU ? AU.isMuted() : false; }
  function setMuted(v){ if(AU) AU.setMuted(v); }

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

  /* Fenêtre d'aide : bouton qui l'ouvre, croix et clic sur le fond qui la ferment. */
  function wireModal(modalId, openId, closeId){
    if(openId) $(openId).addEventListener('click',function(){ openModal(modalId); sfxToggle(); });
    $(closeId||modalId+'Close').addEventListener('click',function(){ closeModal(modalId); });
    $(modalId).addEventListener('click',function(e){ if(e.target===this) closeModal(modalId); });
  }

  /* ---------- SALLES EN LIGNE : interface commune ----------
     Chaque jeu en ligne a les mêmes éléments, nommés avec son préfixe p :
     #pNetStatus, #pNetBanner(+Text), #pDisconnectModal(+Text, BackBtn),
     #pCopyCodeBtn / #pCopyLinkBtn, et ses écrans .p-screen / #p-screen-<nom>. */
  function roomUI(p, opts){
    opts=opts||{};
    var sp=opts.screens||p;
    var ui={
      setStatus:function(cls,label){
        var el=$(p+'NetStatus');
        el.className='net-status '+cls;
        el.querySelector('.net-label').textContent=label;
      },
      showBanner:function(t){ $(p+'NetBannerText').textContent=t; $(p+'NetBanner').classList.add('open'); },
      hideBanner:function(){ $(p+'NetBanner').classList.remove('open'); },
      /* connexion perdue pour de bon : fenêtre avec retour au menu */
      showLost:function(text){
        ui.hideBanner(); ui.setStatus('offline','DÉCONNECTÉ');
        $(p+'DisconnectModalText').textContent=text;
        openModal(p+'DisconnectModal');
      },
      goto:function(name){
        var all=document.querySelectorAll('.'+sp+'-screen');
        for(var i=0;i<all.length;i++) all[i].classList.remove('active');
        $(sp+'-screen-'+name).classList.add('active');
        window.scrollTo({top:0,behavior:'smooth'});
      }
    };
    if(opts.onLostBack) $(p+'DisconnectBackBtn').addEventListener('click',function(){ closeModal(p+'DisconnectModal'); opts.onLostBack(); });
    /* boutons « copier le code » et « copier le lien d'invitation » */
    if(opts.route) {
      $(p+'CopyCodeBtn').addEventListener('click',function(){ copyText(opts.code(), $(p+'CopyCodeBtn')); });
      $(p+'CopyLinkBtn').addEventListener('click',function(){
        copyText(location.origin+location.pathname+'#'+opts.route+'?room='+opts.code(), $(p+'CopyLinkBtn'));
      });
    }
    return ui;
  }
  /* places d'une salle : st.players / st.connected / st.clientIds (la place 0 est l'hôte) */
  function seatTools(st){
    function isConnected(seat){ return seat===0 || st.connected[seat]!==false; }
    return {
      isConnected:isConnected,
      activeCount:function(){
        var n=0;
        for(var s=0;s<st.players.length;s++){ if(st.players[s] && isConnected(s)) n++; }
        return n;
      },
      /* même onglet qui revient (même identifiant client) : il retrouve sa place, sinon 0 */
      returningSeat:function(msg){
        for(var s=1;s<st.clientIds.length;s++){
          if(msg.clientId && st.clientIds[s]===msg.clientId && st.players[s]) return s;
        }
        return 0;
      }
    };
  }
  /* Migration de l'hôte (voir createRoomNet, onPromote) : l'invité qui reprend
     la salle devient la place 0 ; l'ancien hôte prend son ancienne place,
     marquée déconnectée. Tout le monde est déconnecté jusqu'à ce qu'il revienne
     (il retrouve sa place grâce à son identifiant client). fields : autres
     tableaux indexés par place à échanger aussi. Renvoie l'ancienne place. */
  function promoteSeats(st, info, fields){
    var k=info.oldSeat||0, ids=(info.ids||[]).slice();
    var n=Math.max(st.players.length, ids.length, k+1);
    st.clientIds=ids;
    ['players','scores','connected','clientIds'].concat(fields||[]).forEach(function(f){
      var a=st[f]; if(!Array.isArray(a)) return;
      while(a.length<n) a.push(f==='scores'?0:null);
      var t=a[0]; a[0]=a[k]; a[k]=t;
    });
    st.connected=st.players.map(function(p,s){ return s===0; });
    return k;
  }
  /* « ⚠ Alice, Bob se sont déconnectés — la manche continue sans eux. » */
  function missingText(names, what){
    return '⚠ '+names.join(', ')+(names.length>1?' se sont déconnectés':" s'est déconnecté(e)")+' — '+(what||'la manche')+' continue sans eux.';
  }
  function playerDot(color){ return '<span class="cham-player-dot" style="background:'+color+';"></span>'; }
  /* ligne de joueur des listes (lobby, scores…) */
  function playerRow(o){
    return '<div class="cham-player-row filled'+(o.off?' offline':'')+'">'+playerDot(o.color)+
      '<span class="cham-player-name">'+escapeHtml(o.name)+(o.me?' (toi)':'')+(o.off?'<span class="imp-tag">déconnecté(e)</span>':'')+'</span>'+(o.extra||'')+'</div>';
  }

  /* ---------- VIBRATIONS (téléphones Android ; l'iPhone n'en a pas pour les sites) ---------- */
  var VIB_KEY='crazygames_vibrate';
  function vibrateOn(){ try{ return localStorage.getItem(VIB_KEY)!=='0'; }catch(e){ return true; } }
  function setVibrate(v){ try{ localStorage.setItem(VIB_KEY, v?'1':'0'); }catch(e){} }
  function buzz(pattern){
    if(!vibrateOn() || !navigator.vibrate) return;
    try{ navigator.vibrate(pattern); }catch(e){}
  }
  /* « c'est à toi » : petit son + double vibration */
  function yourTurn(){ tone(587,0.08,'triangle',0.13,0); tone(880,0.12,'triangle',0.12,0.08); buzz([60,50,60]); }

  /* ---------- PARTAGE D'UNE SALLE : bouton « Partager » + QR code ----------
     Tous les salons affichent leur code dans un .room-code-display : on y
     ajoute automatiquement le QR code du lien d'invitation (à scanner par les
     potes) et, si le téléphone sait le faire, un bouton de partage natif. */
  function roomLink(el){
    var view=el.closest('.view'), route=view ? view.id.replace(/^view-/,'') : '';
    var code=(el.textContent||'').trim();
    return /[A-Z0-9]/.test(code) ? location.origin+location.pathname+'#'+route+'?room='+code : '';
  }
  function drawQR(canvas, text){
    if(typeof window.qrcode!=='function') return false;
    var qr=window.qrcode(0,'M'); qr.addData(text); qr.make();
    var n=qr.getModuleCount(), quiet=2, cell=Math.max(3, Math.floor(168/(n+quiet*2))), size=(n+quiet*2)*cell;
    canvas.width=size; canvas.height=size;
    var x=canvas.getContext('2d');
    x.fillStyle='#fff'; x.fillRect(0,0,size,size); x.fillStyle='#000';
    for(var r=0;r<n;r++) for(var c=0;c<n;c++) if(qr.isDark(r,c)) x.fillRect((c+quiet)*cell,(r+quiet)*cell,cell,cell);
    return true;
  }
  function enhanceRoomShare(){
    var els=document.querySelectorAll('.room-code-display');
    for(var i=0;i<els.length;i++) (function(el){
      var row=el.nextElementSibling;
      var box=document.createElement('div'); box.className='room-qr'; box.hidden=true;
      var cv=document.createElement('canvas'); cv.setAttribute('aria-label',"QR code du lien d'invitation");
      var cap=document.createElement('small'); cap.textContent='Scanne pour rejoindre';
      box.appendChild(cv); box.appendChild(cap);
      (row && row.classList.contains('btn-row') ? row : el).insertAdjacentElement('afterend', box);
      var shareBtn=null;
      if(navigator.share && row && row.classList.contains('btn-row')){
        shareBtn=document.createElement('button');
        shareBtn.type='button'; shareBtn.className='btn yellow small'; shareBtn.innerHTML='<span>📤 Partager</span>';
        shareBtn.addEventListener('click',function(){
          var link=roomLink(el); if(!link) return;
          sfxToggle();
          navigator.share({title:'CRAZY GAMES', text:'Rejoins ma salle : '+el.textContent.trim(), url:link})['catch'](function(){});
        });
        row.insertBefore(shareBtn, row.firstChild);
      }
      function refresh(){
        var link=roomLink(el);
        box.hidden=!(link && drawQR(cv, link));
      }
      new MutationObserver(refresh).observe(el, {childList:true, characterData:true, subtree:true});
      refresh();
    })(els[i]);
  }
  enhanceRoomShare();

  /* ---------- CHAT DE LOBBY : réactions en un clic + message court ----------
     lobbyChat(net, listEl, nameInputId) ajoute la boîte sous la liste des joueurs. */
  var QUICK=['👋','😂','🔥','👍','😱','⏳ On attend qui ?','🚀 C’est parti !','🔁 Revanche !'];
  function lobbyChat(net, listEl, nameId){
    if(!listEl || !net.chat) return;
    var box=document.createElement('div'); box.className='lobby-chat';
    var html='<div class="lobby-chat-log" aria-live="polite"></div><div class="lobby-chat-quick">';
    QUICK.forEach(function(q){ html+='<button type="button" class="lobby-chat-q">'+escapeHtml(q)+'</button>'; });
    html+='</div><form class="lobby-chat-form"><input type="text" maxlength="80" placeholder="Un message pour la salle…" autocomplete="off"><button type="submit" class="btn ghost small"><span>Envoyer</span></button></form>';
    box.innerHTML=html;
    listEl.insertAdjacentElement('afterend', box);
    var log=box.querySelector('.lobby-chat-log'), input=box.querySelector('input'), last=0;
    function send(text){
      text=String(text||'').trim(); if(!text || Date.now()-last<800) return;
      last=Date.now();
      var n=$(nameId); net.chat(text, (n && n.value.trim()) || 'Joueur');
    }
    Array.prototype.forEach.call(box.querySelectorAll('.lobby-chat-q'), function(b){ b.addEventListener('click', function(){ send(b.textContent); }); });
    box.querySelector('form').addEventListener('submit', function(e){ e.preventDefault(); send(input.value); input.value=''; });
    net.onChat(function(m){
      var row=document.createElement('div'); row.className='lobby-chat-msg';
      row.innerHTML='<b>'+escapeHtml(m.name)+'</b> '+escapeHtml(m.text);
      log.appendChild(row);
      while(log.children.length>6) log.removeChild(log.firstChild);
      log.scrollTop=log.scrollHeight;
      if(/^[^\w]{1,4}$/.test(m.text)) tone(660,0.05,'triangle',0.08,0);
    });
  }
  CG.lobbyChat=lobbyChat;

  CG.$=$;
  CG.buzz=buzz;
  CG.yourTurn=yourTurn;
  CG.vibrateOn=vibrateOn;
  CG.setVibrate=setVibrate;
  CG.wireModal=wireModal;
  CG.roomUI=roomUI;
  CG.seatTools=seatTools;
  CG.missingText=missingText;
  CG.promoteSeats=promoteSeats;
  CG.PROMOTED_TEXT="👑 L'hôte s'est déconnecté : tu es le nouvel hôte ! Les autres reviennent tout seuls, relance quand tout le monde est là.";
  CG.playerDot=playerDot;
  CG.playerRow=playerRow;
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
