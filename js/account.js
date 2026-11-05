/* CRAZY GAMES — comptes joueurs (pseudo + mot de passe) via Supabase, sans librairie :
   quelques appels REST à l'API Auth et à PostgREST (voir supabase/schema.sql).
   Le compte est facultatif : sans connexion, tout fonctionne comme avant.
   - CG.account.record(jeu, score, gagné) en fin de partie (ignoré si non connecté)
   - « top record » du meilleur compte affiché dans le menu de chaque jeu
   - le pseudo est pré-rempli dans tous les jeux
   - amis : demande par pseudo de connexion, acceptation, comparaison des stats,
     et invitation d'un ami dans sa salle (il reçoit une notification ici,
     vérifiée toutes les 20 s tant que le site est ouvert) */
(function(){
  'use strict';
  var CG=window.CG, $=CG.$, escapeHtml=CG.escapeHtml;

  var URL_='https://pjcmpgqektxaidjkjylp.supabase.co';
  var KEY='sb_publishable_FhjSCVlZUKrsh3KX231q3w_vj5PGQN5';   /* clé publique : faite pour être dans le site */
  var MAIL_DOMAIN='@joueurs.crazygames.app';                  /* adresse interne, jamais utilisée pour écrire */
  var SESSION_KEY='cg_session', NAME_KEY='cg_name';

  /* metric : ce qui fait le « top record » du jeu (meilleur score d'une partie, ou nombre de victoires) */
  var GAMES={
    soiree:     {label:'Soirée All in',     input:'partyName',  metric:'best', unit:'pts'},
    crousprison:{label:'Crous ou Prison ?', input:'copName',    metric:'best', unit:'pts'},
    classement: {label:'Le Classement',     input:'clsName',    metric:'best', unit:'pts'},
    quiaecrit:  {label:'Qui a écrit ça ?',  input:'qaeName',    metric:'best', unit:'pts'},
    demicercle: {label:'Le Demi-Cercle',    input:'onlineName', metric:'best', unit:'pts'},
    bots:       {label:'Battle Bots',       input:'botsName',   metric:'wins', unit:'dégâts'},
    cameleon:   {label:'Le Caméléon',       input:'chamName',   metric:'wins'},
    imposteur:  {label:"L'Imposteur",       input:'impName',    metric:'wins'},
    emoji:      {label:'Emoji Quiz',        input:'emoName',    metric:'best', unit:'pts'},
    loup:       {label:'Le Loup des mots',  input:'loupName',   metric:'wins'}
  };

  /* ---------- session ---------- */
  var session=null;
  try{ session=JSON.parse(localStorage.getItem(SESSION_KEY)||'null'); }catch(e){}
  function saveSession(s){
    var was=!!session;
    session=s;
    try{ if(s) localStorage.setItem(SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY); }catch(e){}
    refreshUI();
    /* connexion / déconnexion : boutons d'invitation et notifications */
    if(was!==!!s && typeof startPolling==='function'){ startPolling(); refreshInviteButtons(); }
  }
  function fromAuth(res, profile){
    return {
      access_token:res.access_token, refresh_token:res.refresh_token,
      expires_at:res.expires_at || (Math.floor(Date.now()/1000)+(res.expires_in||3600)),
      id:res.user.id,
      profile:profile || (session && session.profile) || null
    };
  }

  /* ---------- appels HTTP ---------- */
  function request(path, opts){
    opts=opts||{};
    var headers={'apikey':KEY, 'Content-Type':'application/json'};
    if(opts.token) headers.Authorization='Bearer '+opts.token;
    if(opts.prefer) headers.Prefer=opts.prefer;
    return fetch(URL_+path, {method:opts.method||'GET', headers:headers, body:opts.body?JSON.stringify(opts.body):undefined})
      .then(function(r){
        return r.text().then(function(t){
          var data=null; try{ data=t?JSON.parse(t):null; }catch(e){}
          if(!r.ok){ var err=new Error((data && (data.msg||data.message||data.error_description))||('HTTP '+r.status)); err.code=data && (data.error_code||data.code); err.status=r.status; throw err; }
          return data;
        });
      });
  }
  var refreshing=null;
  function token(){
    if(!session) return Promise.reject(new Error('non connecté'));
    if(session.expires_at-60 > Date.now()/1000) return Promise.resolve(session.access_token);
    if(!refreshing){
      refreshing=request('/auth/v1/token?grant_type=refresh_token',{method:'POST', body:{refresh_token:session.refresh_token}})
        .then(function(res){ saveSession(fromAuth(res)); return session.access_token; })
        .catch(function(e){ if(e.status>=400 && e.status<500) saveSession(null); throw e; })
        .then(function(t){ refreshing=null; return t; }, function(e){ refreshing=null; throw e; });
    }
    return refreshing;
  }
  function authed(path, opts){
    return token().then(function(t){ opts=opts||{}; opts.token=t; return request(path, opts); });
  }

  /* ---------- compte ---------- */
  function cleanUser(u){ return String(u||'').trim().toLowerCase(); }
  function loadProfile(){
    if(!session) return Promise.resolve(null);
    return authed('/rest/v1/profiles?id=eq.'+session.id+'&select=username,display_name').then(function(rows){
      if(rows && rows[0] && session){ session.profile=rows[0]; saveSession(session); }
      return session && session.profile;
    });
  }
  /* le profil en base fait foi (nom changé depuis un autre appareil) ; sans bloquer l'affichage */
  function syncProfile(){
    var before=session && session.profile && session.profile.display_name;
    loadProfile().then(function(p){ if(p && p.display_name!==before) fillNames(true); }, function(){});
  }
  function signup(user, display, pass){
    user=cleanUser(user);
    display=String(display||'').trim().slice(0,18) || user;
    return request('/auth/v1/signup',{method:'POST', body:{email:user+MAIL_DOMAIN, password:pass, data:{username:user, display_name:display}}})
      .then(function(res){
        if(!res || !res.access_token) throw new Error('Inscription impossible');
        saveSession(fromAuth(res, {username:user, display_name:display}));
        syncProfile();
      });
  }
  function login(user, pass){
    user=cleanUser(user);
    return request('/auth/v1/token?grant_type=password',{method:'POST', body:{email:user+MAIL_DOMAIN, password:pass}})
      .then(function(res){
        saveSession(fromAuth(res, {username:user, display_name:(res.user.user_metadata||{}).display_name||user}));
        syncProfile();
      });
  }
  function logout(){
    var s=session; saveSession(null); statsCache=null;
    if(s) request('/auth/v1/logout',{method:'POST', token:s.access_token}).catch(function(){});
  }

  /* ---------- statistiques ---------- */
  var lastRecord={}, statsCache=null;
  function record(game, score, won){
    if(!session || !GAMES[game]) return;
    var now=Date.now();
    if(lastRecord[game] && now-lastRecord[game]<4000) return;   /* un même écran de fin rendu deux fois */
    lastRecord[game]=now;
    achieve('first_game');
    var played=loadJSON('cg_games_played', {}); played[game]=1; saveJSON('cg_games_played', played);
    if(Object.keys(GAMES).every(function(k){ return k==='soiree' || played[k]; })) achieve('all_games');
    score=Math.max(0, Math.min(1000000, Math.round(+score||0)));
    authed('/rest/v1/rpc/record_result',{method:'POST', body:{p_game:game, p_score:score, p_won:!!won}})
      .then(function(){ statsCache=null; recordsAll=null; })
      .catch(function(){});
  }
  function myStats(){
    if(!session) return Promise.resolve({});
    if(statsCache) return Promise.resolve(statsCache);
    return request('/rest/v1/stats?user_id=eq.'+session.id+'&select=game,played,wins,best,total').then(function(rows){
      statsCache={}; (rows||[]).forEach(function(r){ statsCache[r.game]=r; }); return statsCache;
    });
  }
  /* tous les records en une requête (vue « records »), gardés une minute */
  var recordsAll=null;
  function records(){
    if(recordsAll && Date.now()-recordsAll.t<60000) return recordsAll.p;
    var p=request('/rest/v1/records?select=*').then(function(rows){
      var map={}; (rows||[]).forEach(function(r){ map[r.game]=r; }); return map;
    });
    recordsAll={t:Date.now(), p:p};
    p.catch(function(){ recordsAll=null; });
    return p;
  }
  function recordText(game, all, short){
    var g=GAMES[game], r=all[game]||{}, m=g.metric;
    var who=r[m+'_name'], val=r[m];
    if(!who || !val) return short ? '—' : '🏆 Aucun record pour l’instant : connecte-toi et prends la première place !';
    who=escapeHtml(who)+(session && r[m+'_user']===session.id ? ' (toi !)' : '');
    val = m==='best' ? fmt(val)+' '+g.unit : val+' victoire'+(val>1?'s':'');
    return short ? '<b>'+val+'</b> · '+who : '🏆 Record : <b>'+val+'</b> par <b>'+who+'</b>';
  }
  function fmt(n){ return String(n).replace(/\B(?=(\d{3})+(?!\d))/g,' '); }

  /* « top record » au-dessus du champ pseudo de chaque jeu */
  function showTopRecord(game){
    var g=GAMES[game], input=g && $(g.input);
    if(!input) return;
    var el=document.querySelector('.top-record[data-game="'+game+'"]');
    if(!el){
      el=document.createElement('p');
      el.className='top-record'; el.setAttribute('data-game',game); el.hidden=true;
      var label=document.querySelector('label[for="'+g.input+'"]')||input;
      label.parentNode.insertBefore(el, label);
    }
    records().then(function(all){ el.innerHTML=recordText(game,all); el.hidden=false; })
      .catch(function(){ el.hidden=true; });
  }

  /* ---------- pseudo partagé entre les jeux ---------- */
  function preferredName(){
    if(session && session.profile) return session.profile.display_name;
    try{ return localStorage.getItem(NAME_KEY)||''; }catch(e){ return ''; }
  }
  function fillNames(force){
    var name=preferredName();
    if(!name) return;
    Object.keys(GAMES).forEach(function(k){
      var el=$(GAMES[k].input);
      if(el && (force || !el.value.trim())) el.value=name.slice(0, el.maxLength>0 ? el.maxLength : 18);
    });
  }
  Object.keys(GAMES).forEach(function(k){
    var el=$(GAMES[k].input);
    if(el) el.addEventListener('change',function(){
      var v=el.value.trim(); if(v){ try{ localStorage.setItem(NAME_KEY, v); }catch(e){} }
    });
  });

  /* ---------- interface ---------- */
  var mode='login';
  function refreshUI(){
    var btn=$('accountBtn');
    if(btn){
      var who = session && session.profile ? session.profile.display_name : '';
      btn.classList.toggle('logged', !!who);
      btn.setAttribute('aria-label', who ? 'Mon compte : '+who : 'Mon compte : se connecter');
      btn.title = who ? who : 'Se connecter';
    }
    var inn=!!session;
    $('accountOut').hidden=inn; $('accountIn').hidden=!inn;
    if(inn && session.profile){
      $('accountHello').textContent=session.profile.display_name;
      $('accountUser').textContent='@'+session.profile.username;
    }
  }
  function setMode(m){
    mode=m;
    $('accountLoginTab').classList.toggle('active', m==='login');
    $('accountSignupTab').classList.toggle('active', m==='signup');
    $('accountDisplayRow').hidden = m!=='signup';
    $('accountPass2Row').hidden = m!=='signup';
    $('accountSubmitBtn').querySelector('span').textContent = m==='login' ? '▶ Se connecter' : '✚ Créer mon compte';
    $('accountPass').setAttribute('autocomplete', m==='login'?'current-password':'new-password');
    setError('');
  }
  function setError(t, ok){ var e=$('accountError'); e.textContent=t; e.hidden=!t; e.classList.toggle('ok', !!ok); }
  function frenchError(e){
    var c=e && e.code, m=(e && e.message)||'';
    if(c==='invalid_credentials' || /invalid login/i.test(m)) return 'Pseudo ou mot de passe incorrect.';
    if(c==='user_already_exists' || /already registered/i.test(m)) return 'Ce pseudo est déjà pris.';
    if(c==='weak_password' || /password/i.test(m) && /least|short|weak/i.test(m)) return 'Mot de passe trop faible (6 caractères minimum).';
    if(c==='over_request_rate_limit' || c==='over_email_send_rate_limit' || e.status===429) return 'Trop d’essais, réessaie dans une minute.';
    if(e instanceof TypeError) return 'Pas de connexion au serveur. Vérifie ton réseau.';
    return 'Erreur : '+m;
  }
  function submit(){
    var user=cleanUser($('accountUserInput').value), pass=$('accountPass').value;
    if(!/^[a-z0-9_]{3,20}$/.test(user)) return setError('Pseudo de connexion : 3 à 20 caractères, lettres, chiffres ou _ (sans accent ni espace).');
    if(pass.length<6) return setError('Mot de passe : 6 caractères minimum.');
    if(mode==='signup' && pass!==$('accountPass2').value) return setError('Les deux mots de passe ne sont pas identiques.');
    var btn=$('accountSubmitBtn'); btn.disabled=true; setError('');
    var p = mode==='login' ? login(user, pass) : signup(user, $('accountDisplay').value, pass);
    p.then(function(){
      CG.sfxValidate(); $('accountPass').value=''; $('accountPass2').value='';
      fillNames(true); refreshUI(); renderProfile(); renderFriends(); syncAch(); renderAch(); currentRecord();
    }, function(e){ setError(frenchError(e)); CG.shake && CG.shake($('accountForm')); })
     .then(function(){ btn.disabled=false; });
  }
  function renderProfile(){
    if(!session) return;
    $('accountStats').innerHTML='<p class="theme-count">Chargement…</p>';
    Promise.all([myStats(), records().catch(function(){ return {}; })])
      .then(function(r){
        var mine=r[0], tops=r[1], html='', totPlayed=0, totWins=0;
        /* les jeux déjà joués d'abord */
        Object.keys(GAMES).sort(function(a,b){ return ((mine[b]||{}).played||0)-((mine[a]||{}).played||0); }).forEach(function(k){
          var g=GAMES[k], s=mine[k]||{played:0,wins:0,best:0};
          totPlayed+=s.played; totWins+=s.wins;
          var best = g.unit && s.best ? fmt(s.best)+' '+g.unit : '—';
          html+='<div class="acc-row"><span class="acc-game">'+g.label+'</span>'+
            '<span class="acc-num"><b>'+s.played+'</b><small>parties</small></span>'+
            '<span class="acc-num"><b>'+s.wins+'</b><small>victoires</small></span>'+
            '<span class="acc-num"><b>'+best+'</b><small>meilleur</small></span>'+
            '<span class="acc-top">'+recordText(k, tops, true)+'</span></div>';
        });
        $('accountTotals').textContent=totPlayed+' partie'+(totPlayed>1?'s':'')+' · '+totWins+' victoire'+(totWins>1?'s':'');
        $('accountStats').innerHTML=html;
      }, function(){ $('accountStats').innerHTML='<p class="theme-count">Statistiques indisponibles pour le moment.</p>'; });
  }
  function currentRecord(){
    var r=(location.hash.replace(/^#/,'').split('?')[0])||'hub';
    if(GAMES[r]) showTopRecord(r);
  }

  function wire(){
    CG.wireModal('accountModal','accountBtn');
    $('accountBtn').addEventListener('click',function(){ setError(''); friendMsg(''); renderAch(); if(session){ renderProfile(); renderFriends(); renderPush(); syncProfile(); } });
    /* onglets du compte : Profil / Succès / Amis (flèches gauche/droite au clavier) */
    var accTabs=Array.prototype.slice.call(document.querySelectorAll('#accountIn .acc-tab'));
    function showAccTab(tab, focus){
      accTabs.forEach(function(t){
        var on=t===tab;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', on?'true':'false');
        t.tabIndex = on ? 0 : -1;
        $(t.getAttribute('data-pane')).hidden=!on;
      });
      if(focus) tab.focus();
    }
    accTabs.forEach(function(t, i){
      t.addEventListener('click',function(){ CG.sfxToggle(); showAccTab(t); });
      t.addEventListener('keydown',function(e){
        var d = e.key==='ArrowRight' ? 1 : e.key==='ArrowLeft' ? -1 : 0;
        if(d){ e.preventDefault(); showAccTab(accTabs[(i+d+accTabs.length)%accTabs.length], true); }
      });
    });
    $('accountLoginTab').addEventListener('click',function(){ setMode('login'); });
    $('accountSignupTab').addEventListener('click',function(){ setMode('signup'); });
    $('accountForm').addEventListener('submit',function(e){ e.preventDefault(); submit(); });
    $('accountLogoutBtn').addEventListener('click',function(){ CG.sfxToggle(); disablePush().catch(function(){}); logout(); setMode('login'); currentRecord(); });
    $('accountRenameBtn').addEventListener('click',function(){
      var v=prompt('Ton nom affiché dans les jeux (18 caractères max) :', session.profile ? session.profile.display_name : '');
      if(v===null) return; v=v.trim().slice(0,18); if(!v) return;
      authed('/rest/v1/profiles?id=eq.'+session.id,{method:'PATCH', body:{display_name:v}, prefer:'return=minimal'})
        .then(function(){ session.profile.display_name=v; saveSession(session); fillNames(true); recordsAll=null; renderProfile(); })
        .catch(function(e){ alert(frenchError(e)); });
    });
    $('accountPassBtn').addEventListener('click',function(){
      var v=prompt('Nouveau mot de passe (6 caractères minimum) :');
      if(v===null) return;
      if(v.length<6) return alert('Mot de passe trop court (6 caractères minimum).');
      authed('/auth/v1/user',{method:'PUT', body:{password:v}})
        .then(function(){ alert('Mot de passe modifié ✔'); })
        .catch(function(e){ alert(frenchError(e)); });
    });
    $('accountDeleteBtn').addEventListener('click',function(){
      if(!confirm('Supprimer définitivement ton compte et toutes tes statistiques ?')) return;
      authed('/rest/v1/rpc/delete_my_account',{method:'POST', body:{}})
        .then(function(){ logout(); setMode('login'); CG.closeModal('accountModal'); recordsAll=null; currentRecord(); })
        .catch(function(e){ alert(frenchError(e)); });
    });
    window.addEventListener('hashchange', currentRecord);
    setMode('login'); refreshUI(); fillNames(false); currentRecord();
    if(session) syncProfile();
  }
  wire();
  wireFriends();

  /* ===================== SUCCÈS =====================
     Débloqués pendant les parties (CG.achieve('clé')), gardés dans le navigateur
     et, si on est connecté, copiés sur le compte (table achievements) : ils
     apparaissent alors aussi chez les amis. */
  var ACH=[
    ['first_game','🎮','Première partie','Terminer une partie avec un compte.'],
    ['all_games','🌍','Touche-à-tout','Jouer à tous les jeux du hub.'],
    ['dc_perfect','🎯','Pile poil','Demi-Cercle : viser pile dans la zone 100.'],
    ['dc_perfect5','🏹','Tireur d’élite','Demi-Cercle : 5 « pile poil ».'],
    ['imp_escape','🕵️','Insoupçonnable','Imposteur : s’échapper sans être démasqué.'],
    ['imp_detective5','🔍','Détective','Imposteur : démasquer l’imposteur 5 fois.'],
    ['cham_hidden','🦎','Maître du camouflage','Caméléon : gagner en étant le Caméléon.'],
    ['loup_wolf','🐺','Grand méchant loup','Loup des mots : gagner en étant Loup.'],
    ['cls_mind','🧠','Dans la tête du groupe','Classement : être le plus proche du groupe.'],
    ['qae_fool3','🎭','Maître du bluff','Qui a écrit ça : berner 3 joueurs avec une réponse.'],
    ['qae_funny','😂','Le plus drôle','Qui a écrit ça : réponse la plus drôle de la manche.'],
    ['cop_perfect','🏆','Sans faute','Crous ou Prison : 9 bonnes réponses sur 9.'],
    ['cop_streak5','🔥','En feu','Crous ou Prison : 5 bonnes réponses d’affilée.'],
    ['bots_win','🤖','Dernier tank debout','Battle Bots : gagner un combat.'],
    ['bots_wave5','🛡️','Survivant','Battle Bots : atteindre la vague 5 en Survie.'],
    ['party_win','🎉','Roi de la soirée','Gagner une Soirée All in.'],
    ['emo_win','🤔','Décodeur d’emojis','Emoji Quiz : gagner une partie.'],
    ['friends3','👥','Bien entouré','Avoir 3 amis.']
  ];
  var ACH_BY={}; ACH.forEach(function(a){ ACH_BY[a[0]]=a; });
  var ACH_KEY='cg_ach_v1', CNT_KEY='cg_ach_counts_v1';
  function loadJSON(k, d){ try{ var v=JSON.parse(localStorage.getItem(k)||'null'); return v||d; }catch(e){ return d; } }
  function saveJSON(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
  function unlocked(){ return loadJSON(ACH_KEY, {}); }
  function achieve(key){
    if(!ACH_BY[key]) return;
    var u=unlocked(); if(u[key]) return;
    u[key]=Date.now(); saveJSON(ACH_KEY, u);
    showAchToast(ACH_BY[key]);
    if(session) authed('/rest/v1/rpc/unlock_achievement',{method:'POST', body:{p_key:key}}).catch(function(){});
  }
  /* compteur (ex : 5 « pile poil ») : débloque key au bout de n */
  function achieveCount(counter, n, key){
    var c=loadJSON(CNT_KEY, {}); c[counter]=(c[counter]||0)+1; saveJSON(CNT_KEY, c);
    if(c[counter]>=n) achieve(key);
  }
  /* les succès gagnés hors connexion partent sur le compte dès qu'on se connecte */
  function syncAch(){
    if(!session) return;
    Object.keys(unlocked()).forEach(function(k){
      authed('/rest/v1/rpc/unlock_achievement',{method:'POST', body:{p_key:k}}).catch(function(){});
    });
  }
  var achQueue=[], achShowing=false;
  function showAchToast(a){
    achQueue.push(a); if(achShowing) return;
    (function next(){
      var x=achQueue.shift(); if(!x){ achShowing=false; return; }
      achShowing=true;
      var el=$('achToast');
      el.innerHTML='<span class="ach-ico">'+x[1]+'</span><span><small>SUCCÈS DÉBLOQUÉ</small><b>'+escapeHtml(x[2])+'</b></span>';
      el.hidden=false; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
      if(CG.sfxReveal) CG.sfxReveal(100);
      setTimeout(function(){ el.hidden=true; next(); }, 3200);
    })();
  }
  function achGrid(have){
    var html='';
    ACH.forEach(function(a){
      var ok=!!have[a[0]];
      html+='<div class="ach'+(ok?' ok':'')+'" title="'+escapeHtml(a[3])+'"><span class="ach-ico">'+(ok?a[1]:'🔒')+'</span><b>'+escapeHtml(a[2])+'</b><small>'+escapeHtml(a[3])+'</small></div>';
    });
    return html;
  }
  function renderAch(){
    var have=unlocked();
    $('accountAchCount').textContent=Object.keys(have).filter(function(k){ return ACH_BY[k]; }).length+' / '+ACH.length;
    $('accountAch').innerHTML=achGrid(have);
  }
  CG.achieve=achieve;
  CG.achieveCount=achieveCount;

  /* ===================== AMIS ===================== */
  function rpc(name, body){ return authed('/rest/v1/rpc/'+name, {method:'POST', body:body||{}}); }
  var JOIN={demicercle:['demicercle','joinRoomBtn'], cameleon:['cameleon','chamJoinRoomBtn'], imposteur:['imposteur','impJoinRoomBtn'],
    loup:['loup','loupJoinRoomBtn'], classement:['classement','clsJoinRoomBtn'], quiaecrit:['quiaecrit','qaeJoinRoomBtn'],
    crousprison:['crousprison','copJoinRoomBtn'], bots:['bots','botsJoinRoomBtn'], soiree:['party','partyJoinRoomBtn'], emoji:['emoji','emoJoinRoomBtn']};
  function ago(iso){
    if(!iso) return 'jamais joué';
    var m=Math.round((Date.now()-new Date(iso).getTime())/60000);
    if(m<2) return 'a joué à l’instant';
    if(m<60) return 'a joué il y a '+m+' min';
    var h=Math.round(m/60); if(h<48) return 'a joué il y a '+h+' h';
    return 'a joué il y a '+Math.round(h/24)+' j';
  }
  function friendMsg(t, ok){ var e=$('accountFriendMsg'); e.textContent=t; e.hidden=!t; e.classList.toggle('ok', !!ok); }
  var friends=[];
  function loadFriends(){ return rpc('my_friends').then(function(rows){ friends=rows||[]; return friends; }); }
  function renderFriends(){
    var box=$('accountFriends');
    if(!session){ box.innerHTML=''; return; }
    box.innerHTML='<p class="theme-count">Chargement…</p>';
    loadFriends().then(function(rows){
      var html='';
      var incoming=rows.filter(function(f){ return f.status==='pending' && f.incoming; });
      var outgoing=rows.filter(function(f){ return f.status==='pending' && !f.incoming; });
      var mates=rows.filter(function(f){ return f.status==='accepted'; });
      var badge=$('accFriendsBadge');
      badge.textContent=incoming.length; badge.hidden=!incoming.length;
      if(mates.length>=3) achieve('friends3');
      renderBoard();
      incoming.forEach(function(f){
        html+='<div class="acc-friend pending"><span class="acc-friend-name"><b>'+escapeHtml(f.display_name)+'</b> <small>@'+escapeHtml(f.username)+' veut être ton ami</small></span>'+
          '<span class="acc-friend-btns"><button class="btn yellow small" data-act="accept" data-id="'+f.id+'"><span>✔ Accepter</span></button>'+
          '<button class="btn ghost small" data-act="refuse" data-id="'+f.id+'"><span>✕</span></button></span></div>';
      });
      mates.forEach(function(f){
        html+='<div class="acc-friend"><span class="acc-friend-name"><b>'+escapeHtml(f.display_name)+'</b> <small>@'+escapeHtml(f.username)+' · '+
          f.played+' partie'+(f.played>1?'s':'')+' · '+f.wins+' victoire'+(f.wins>1?'s':'')+' · '+ago(f.last_played)+'</small></span>'+
          '<span class="acc-friend-btns"><button class="btn ghost small" data-act="compare" data-id="'+f.id+'"><span>📊 Comparer</span></button>'+
          '<button class="btn ghost small" data-act="remove" data-id="'+f.id+'" aria-label="Retirer"><span>🗑️</span></button></span>'+
          '<div class="acc-compare" id="cmp-'+f.id+'" hidden></div></div>';
      });
      outgoing.forEach(function(f){
        html+='<div class="acc-friend waiting"><span class="acc-friend-name"><b>'+escapeHtml(f.display_name)+'</b> <small>@'+escapeHtml(f.username)+' · demande envoyée</small></span>'+
          '<span class="acc-friend-btns"><button class="btn ghost small" data-act="remove" data-id="'+f.id+'"><span>Annuler</span></button></span></div>';
      });
      box.innerHTML = html || '<p class="theme-count">Pas encore d’amis : ajoute-les avec leur pseudo de connexion.</p>';
    }, function(){ box.innerHTML='<p class="theme-count">Amis indisponibles pour le moment.</p>'; });
  }
  function addFriend(){
    var u=cleanUser($('accountFriendInput').value);
    if(!/^[a-z0-9_]{3,20}$/.test(u)) return friendMsg('Tape le pseudo de connexion de ton ami (ex : yasin_93).');
    rpc('send_friend_request', {p_username:u}).then(function(r){
      var t={introuvable:'Aucun joueur avec ce pseudo.', soi:'C’est toi 😄', deja:'Déjà ami, ou demande déjà envoyée.',
        accepte:'Vous êtes maintenant amis ! 🎉', envoye:'Demande envoyée ✔', trop:'Trop de demandes en attente.'}[r]||'Fait.';
      friendMsg(t, r==='accepte'||r==='envoye');
      if(r==='accepte'||r==='envoye'){ $('accountFriendInput').value=''; CG.sfxValidate(); renderFriends(); }
    }, function(e){ friendMsg(frenchError(e)); });
  }
  /* ----- classement entre amis : un jeu, toi et tes amis ----- */
  function renderBoard(){
    var sel=$('accountBoardGame'), box=$('accountBoard');
    if(!sel.options.length){
      Object.keys(GAMES).forEach(function(k){ var o=document.createElement('option'); o.value=k; o.textContent=GAMES[k].label; sel.appendChild(o); });
    }
    var mates=friends.filter(function(f){ return f.status==='accepted'; });
    $('accountBoardWrap').hidden=!mates.length;
    if(!mates.length || !session) return;
    var g=GAMES[sel.value], m=g.metric;
    var names={}; names[session.id]=(session.profile||{}).display_name||'Moi';
    mates.forEach(function(f){ names[f.id]=f.display_name; });
    box.innerHTML='<p class="theme-count">Chargement…</p>';
    request('/rest/v1/stats?game=eq.'+sel.value+'&user_id=in.('+Object.keys(names).join(',')+')&select=user_id,played,wins,best').then(function(rows){
      var by={}; (rows||[]).forEach(function(r){ by[r.user_id]=r; });
      var ids=Object.keys(names).sort(function(a,b){ return (((by[b]||{})[m])||0)-(((by[a]||{})[m])||0) || (((by[b]||{}).wins)||0)-(((by[a]||{}).wins)||0); });
      var html='';
      ids.forEach(function(id,i){
        var r=by[id]||{played:0,wins:0,best:0}, val = m==='best' ? fmt(r.best||0)+' '+(g.unit||'') : (r.wins||0)+' victoire'+((r.wins||0)>1?'s':'');
        html+='<div class="acc-board-row'+(id===session.id?' me':'')+'"><span class="cls-pos">'+(i===0 && r[m]>0?'👑':(i+1))+'</span><b>'+escapeHtml(names[id])+(id===session.id?' (toi)':'')+'</b><span>'+val+'</span><small>'+(r.played||0)+' partie'+((r.played||0)>1?'s':'')+'</small></div>';
      });
      box.innerHTML=html;
    }, function(){ box.innerHTML='<p class="theme-count">Classement indisponible.</p>'; });
  }

  function compare(id){
    var el=$('cmp-'+id);
    if(!el.hidden){ el.hidden=true; return; }
    el.hidden=false; el.innerHTML='<p class="theme-count">Chargement…</p>';
    Promise.all([myStats(), request('/rest/v1/stats?user_id=eq.'+id+'&select=game,played,wins,best'),
                 request('/rest/v1/achievements?user_id=eq.'+id+'&select=key').catch(function(){ return []; })]).then(function(r){
      var theirAch={}; (r[2]||[]).forEach(function(x){ theirAch[x.key]=1; });
      var mine=r[0], his={}; (r[1]||[]).forEach(function(s){ his[s.game]=s; });
      var html='<div class="acc-cmp-row head"><span></span><span>Moi</span><span>Ami</span></div>';
      Object.keys(GAMES).forEach(function(k){
        var a=mine[k], b=his[k]; if(!a && !b) return;
        var g=GAMES[k];
        function cell(s){
          if(!s) return '—';
          return s.wins+' 🏆'+(g.unit && s.best ? ' · '+fmt(s.best) : '')+' <small>('+s.played+')</small>';
        }
        var aw=(a||{}).wins||0, bw=(b||{}).wins||0;
        html+='<div class="acc-cmp-row"><span>'+g.label+'</span><span class="'+(aw>bw?'lead':'')+'">'+cell(a)+'</span><span class="'+(bw>aw?'lead':'')+'">'+cell(b)+'</span></div>';
      });
      var mineN=Object.keys(unlocked()).filter(function(k){ return ACH_BY[k]; }).length, theirN=Object.keys(theirAch).filter(function(k){ return ACH_BY[k]; }).length;
      html+='<div class="acc-cmp-row"><span>🏅 Succès</span><span class="'+(mineN>theirN?'lead':'')+'">'+mineN+' / '+ACH.length+'</span><span class="'+(theirN>mineN?'lead':'')+'">'+theirN+' / '+ACH.length+'</span></div>';
      el.innerHTML=html+'<p class="theme-count" style="margin:4px 0 0;">victoires 🏆 · meilleur score · (parties)</p>'+
        '<div class="ach-mini">'+ACH.filter(function(a){ return theirAch[a[0]]; }).map(function(a){ return '<span title="'+escapeHtml(a[2])+'">'+a[1]+'</span>'; }).join('')+'</div>';
    }, function(){ el.innerHTML='<p class="theme-count">Stats indisponibles.</p>'; });
  }

  /* ----- inviter des amis dans sa salle ----- */
  var inviteTarget=null;
  function roomOf(el){
    var view=el.closest('.view'), route=view ? view.id.replace(/^view-/,'') : '';
    var code=(el.textContent||'').trim();
    return (JOIN[route] && /^[A-Z0-9-]{3,20}$/.test(code)) ? {route:route, code:code} : null;
  }
  function addInviteButtons(){
    var els=document.querySelectorAll('.room-code-display');
    Array.prototype.forEach.call(els, function(el){
      var b=document.createElement('button');
      b.type='button'; b.className='btn ghost small acc-invite-btn'; b.hidden=true;
      b.innerHTML='<span>👥 Inviter des amis</span>';
      b.addEventListener('click', function(){
        inviteTarget=roomOf(el); if(!inviteTarget) return;
        CG.sfxToggle(); openInvite();
      });
      var row=el.nextElementSibling;
      if(row && row.classList.contains('btn-row')) row.appendChild(b); else el.insertAdjacentElement('afterend', b);
      el._inviteBtn=b;
    });
    refreshInviteButtons();
  }
  function refreshInviteButtons(){
    Array.prototype.forEach.call(document.querySelectorAll('.room-code-display'), function(el){ if(el._inviteBtn) el._inviteBtn.hidden=!session; });
  }
  function openInvite(){
    $('inviteRoomText').textContent=inviteTarget.code;
    $('inviteList').innerHTML='<p class="theme-count">Chargement…</p>';
    CG.openModal('friendInviteModal');
    loadFriends().then(function(rows){
      var mates=rows.filter(function(f){ return f.status==='accepted'; }), html='';
      mates.forEach(function(f){
        html+='<div class="acc-friend"><span class="acc-friend-name"><b>'+escapeHtml(f.display_name)+'</b> <small>'+ago(f.last_played)+'</small></span>'+
          '<span class="acc-friend-btns"><button class="btn yellow small" data-invite="'+f.id+'"><span>📨 Inviter</span></button></span></div>';
      });
      $('inviteList').innerHTML = html || '<p class="theme-count">Ajoute d’abord des amis depuis ton compte (bouton 👤).</p>';
    }, function(){ $('inviteList').innerHTML='<p class="theme-count">Amis indisponibles pour le moment.</p>'; });
  }

  /* ----- invitations reçues : petite notification en bas de l'écran ----- */
  var SHOWN_KEY='cg_invites_seen', POLL_MS=20000, pollTimer=null, current=null;
  function seenIds(){ try{ return JSON.parse(sessionStorage.getItem(SHOWN_KEY)||'[]'); }catch(e){ return []; } }
  function markSeen(id){ var a=seenIds(); a.push(id); try{ sessionStorage.setItem(SHOWN_KEY, JSON.stringify(a.slice(-50))); }catch(e){} }
  function pollInvites(){
    if(!session || document.visibilityState!=='visible' || current) return;
    var since=new Date(Date.now()-10*60000).toISOString();
    authed('/rest/v1/room_invites?to_id=eq.'+session.id+'&created_at=gt.'+encodeURIComponent(since)+'&order=created_at.desc&select=id,from_name,route,code')
      .then(function(rows){
        var seen=seenIds(), inv=(rows||[]).filter(function(r){ return seen.indexOf(r.id)===-1 && JOIN[r.route]; })[0];
        if(inv) showInvite(inv);
      }, function(){});
  }
  var ROUTE_LABEL={soiree:'Soirée All in'};
  function showInvite(inv){
    current=inv; markSeen(inv.id);
    var label=ROUTE_LABEL[inv.route] || (GAMES[inv.route]||{}).label || inv.route;
    $('inviteToastText').innerHTML='🎮 <b>'+escapeHtml(inv.from_name)+'</b> t’invite : <b>'+escapeHtml(label)+'</b> <small>(salle '+escapeHtml(inv.code)+')</small>';
    $('inviteToast').hidden=false;
    CG.yourTurn && CG.yourTurn();
  }
  function closeInvite(){
    if(current) rpc('dismiss_invite', {p_id:current.id}).catch(function(){});
    current=null; $('inviteToast').hidden=true;
  }
  function joinInvite(){
    var inv=current; closeInvite();
    if(!inv) return;
    var j=JOIN[inv.route];
    location.hash=inv.route;
    setTimeout(function(){
      var api=CG[j[0]];
      if(api && api.enterJoinFlow) api.enterJoinFlow(inv.code);
      fillNames(false);
      CG.autoJoin(inv.route);
    }, 300);
  }
  function startPolling(){
    clearInterval(pollTimer); pollTimer=null;
    if(!session) return;
    pollTimer=setInterval(pollInvites, POLL_MS);
    setTimeout(pollInvites, 2000);
  }
  /* ----- notifications push (app fermée) : abonnement de cet appareil ----- */
  var VAPID_PUBLIC='BMavyCuK6hO0DDsq6jZ1v59cf9aeyQVdBElNu5klo6chq9aAGiDdnGaj2mI6-hzQQkJPhGBn7zT7u9WnWZv4T-s';
  function pushSupported(){ return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
  function b64ToBytes(s){
    s=(s+'===='.slice((s.length+3)%4)).replace(/-/g,'+').replace(/_/g,'/');
    var raw=atob(s), out=new Uint8Array(raw.length);
    for(var i=0;i<raw.length;i++) out[i]=raw.charCodeAt(i);
    return out;
  }
  function currentSub(){
    if(!pushSupported()) return Promise.resolve(null);
    return navigator.serviceWorker.ready.then(function(reg){ return reg.pushManager.getSubscription(); });
  }
  function renderPush(){
    var chk=$('accountPushChk'), note=$('accountPushNote');
    if(!pushSupported()){
      chk.disabled=true; chk.checked=false;
      var ios=/iPhone|iPad|iPod/.test(navigator.userAgent||'');
      note.textContent = ios ? 'Sur iPhone, installe d’abord l’app (bouton « Installer l’app » du hub), puis active-les depuis l’app.' : 'Ce navigateur ne gère pas les notifications.';
      return;
    }
    if(Notification.permission==='denied'){ chk.checked=false; chk.disabled=true; note.textContent='Notifications bloquées : autorise-les dans les réglages du site / de l’app.'; return; }
    chk.disabled=false;
    currentSub().then(function(s){ chk.checked=!!s && Notification.permission==='granted'; note.textContent=''; });
  }
  function enablePush(){
    return Notification.requestPermission().then(function(p){
      if(p!=='granted') throw new Error('refusé');
      return navigator.serviceWorker.ready;
    }).then(function(reg){
      return reg.pushManager.getSubscription().then(function(s){
        return s || reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:b64ToBytes(VAPID_PUBLIC)});
      });
    }).then(function(s){
      var j=s.toJSON();
      return rpc('save_push_subscription', {p_endpoint:j.endpoint, p_p256dh:j.keys.p256dh, p_auth:j.keys.auth});
    });
  }
  function disablePush(){
    return currentSub().then(function(s){
      if(!s) return;
      var ep=s.endpoint;
      return s.unsubscribe().then(function(){ return session ? rpc('delete_push_subscription', {p_endpoint:ep}) : null; });
    });
  }
  function sendPush(friendId, tgt){
    token().then(function(t){
      return fetch(URL_+'/functions/v1/invite-push', {method:'POST',
        headers:{'apikey':KEY, 'Authorization':'Bearer '+t, 'Content-Type':'application/json'},
        body:JSON.stringify({friend:friendId, route:tgt.route, code:tgt.code})});
    }).catch(function(){});   /* la notification dans le site reste le plan B */
  }

  function wireFriends(){
    $('accountBoardGame').addEventListener('change', function(){ CG.sfxToggle(); renderBoard(); });
    $('accountPushChk').addEventListener('change', function(){
      var chk=this, note=$('accountPushNote');
      chk.disabled=true;
      (chk.checked ? enablePush() : disablePush()).then(function(){
        note.textContent = chk.checked ? '🔔 Activées sur cet appareil.' : 'Désactivées sur cet appareil.';
      }, function(){
        chk.checked=false; note.textContent='Impossible d’activer les notifications ici.';
      }).then(function(){ chk.disabled=false; });
    });
    $('accountFriendAddBtn').addEventListener('click', addFriend);
    $('accountFriendInput').addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); addFriend(); } });
    $('accountFriends').addEventListener('click', function(e){
      var b=e.target.closest ? e.target.closest('button[data-act]') : null; if(!b) return;
      var id=b.getAttribute('data-id'), act=b.getAttribute('data-act');
      if(act==='compare'){ CG.sfxToggle(); compare(id); return; }
      if(act==='remove' && !confirm('Retirer cet ami ?')) return;
      var p = act==='accept' ? rpc('respond_friend_request',{p_from:id, p_accept:true})
            : act==='refuse' ? rpc('respond_friend_request',{p_from:id, p_accept:false})
            : rpc('remove_friend',{p_other:id});
      p.then(function(){ CG.sfxToggle(); renderFriends(); }, function(err){ friendMsg(frenchError(err)); });
    });
    CG.wireModal('friendInviteModal');
    $('inviteList').addEventListener('click', function(e){
      var b=e.target.closest ? e.target.closest('button[data-invite]') : null; if(!b || !inviteTarget) return;
      b.disabled=true;
      var fid=b.getAttribute('data-invite'), tgt=inviteTarget;
      rpc('invite_friend', {p_friend:fid, p_route:tgt.route, p_code:tgt.code})
        .then(function(){ b.querySelector('span').textContent='✔ Invité'; CG.sfxValidate(); sendPush(fid, tgt); },
              function(){ b.disabled=false; b.querySelector('span').textContent='Réessayer'; });
    });
    $('inviteJoinBtn').addEventListener('click', joinInvite);
    $('inviteCloseBtn').addEventListener('click', closeInvite);
    document.addEventListener('visibilitychange', function(){ if(document.visibilityState==='visible') pollInvites(); });
    addInviteButtons();
    startPolling();
  }

  /* ---------- Demi-Cercle : meilleures estimations (table dc_estimates, voir schema.sql) ---------- */
  function recordEstimate(e){
    if(!session) return;
    function txt(v,n){ return String(v||'').slice(0,n); }
    authed('/rest/v1/rpc/record_estimate',{method:'POST', body:{
      p_role:e.role==='giver'?'giver':'guesser', p_points:Math.round(+e.points||0), p_theme:txt(e.theme,30),
      p_left:txt(e.left,20), p_right:txt(e.right,20), p_clue:txt(e.clue,60), p_target:+e.target||0, p_guess:+e.guess||0}})
      .then(function(){ bestCache=null; }).catch(function(){});
  }
  var bestCache=null;
  function bestEstimates(limit){
    if(bestCache && Date.now()-bestCache.t<60000) return bestCache.p;
    var p=request('/rest/v1/best_estimates?select=*&limit='+(limit||8));
    bestCache={t:Date.now(), p:p};
    p.catch(function(){ bestCache=null; });
    return p;
  }

  CG.account={
    record:record,
    recordEstimate:recordEstimate,
    bestEstimates:bestEstimates,
    isLoggedIn:function(){ return !!session; },
    /* raccourci pour les jeux à classement : score du joueur et victoire (ex-aequo compris) */
    recordRanked:function(game, scores, seats, mySeat){
      if(seats.indexOf(mySeat)===-1) return;
      var top=0; seats.forEach(function(s){ top=Math.max(top, scores[s]||0); });
      record(game, scores[mySeat]||0, top>0 && (scores[mySeat]||0)===top);
    }
  };
})();
