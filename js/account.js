/* CRAZY GAMES — comptes joueurs (pseudo + mot de passe) via Supabase, sans librairie :
   quelques appels REST à l'API Auth et à PostgREST (voir supabase/schema.sql).
   Le compte est facultatif : sans connexion, tout fonctionne comme avant.
   - CG.account.record(jeu, score, gagné) en fin de partie (ignoré si non connecté)
   - « top record » du meilleur compte affiché dans le menu de chaque jeu
   - le pseudo est pré-rempli dans tous les jeux */
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
    loup:       {label:'Le Loup des mots',  input:'loupName',   metric:'wins'}
  };

  /* ---------- session ---------- */
  var session=null;
  try{ session=JSON.parse(localStorage.getItem(SESSION_KEY)||'null'); }catch(e){}
  function saveSession(s){
    session=s;
    try{ if(s) localStorage.setItem(SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY); }catch(e){}
    refreshUI();
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
    if(btn) btn.querySelector('span').textContent = session && session.profile ? '👤 '+session.profile.display_name : '👤 Se connecter';
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
      fillNames(true); refreshUI(); renderProfile(); currentRecord();
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
    $('accountBtn').addEventListener('click',function(){ setError(''); if(session){ renderProfile(); syncProfile(); } });
    $('accountLoginTab').addEventListener('click',function(){ setMode('login'); });
    $('accountSignupTab').addEventListener('click',function(){ setMode('signup'); });
    $('accountForm').addEventListener('submit',function(e){ e.preventDefault(); submit(); });
    $('accountLogoutBtn').addEventListener('click',function(){ CG.sfxToggle(); logout(); setMode('login'); currentRecord(); });
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

  CG.account={
    record:record,
    isLoggedIn:function(){ return !!session; },
    /* raccourci pour les jeux à classement : score du joueur et victoire (ex-aequo compris) */
    recordRanked:function(game, scores, seats, mySeat){
      if(seats.indexOf(mySeat)===-1) return;
      var top=0; seats.forEach(function(s){ top=Math.max(top, scores[s]||0); });
      record(game, scores[mySeat]||0, top>0 && (scores[mySeat]||0)===top);
    }
  };
})();
