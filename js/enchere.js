/* Adjugé, vendu ! — devine le prix d'objets (vrais !) vendus aux enchères
   (2 à 10 joueurs en ligne).
   Un objet s'affiche : carte Pokémon, toilettes en or, gant de star…
   Chacun tape son estimation ; au bout de 5 s, une anecdote sur l'objet
   apparaît et on peut changer d'avis jusqu'à la fin du temps. Au résultat,
   tu marques selon le nombre de joueurs que tu bats (plus proche du vrai prix
   qu'eux), avec un bonus si tu tombes presque pile. L'hôte fait autorité :
   il garde le prix secret, reçoit les estimations et compte les points. */
(function(){
  'use strict';
  var CG=window.CG;
  var $=CG.$, escapeHtml=CG.escapeHtml, shuffle=CG.shuffle, shake=CG.shake, closeModal=CG.closeModal;
  var sfxToggle=CG.sfxToggle, sfxValidate=CG.sfxValidate, sfxReveal=CG.sfxReveal;

  var ROOM_PREFIX='cgenchere-';
  var MIN_PLAYERS=2, MAX_PLAYERS=10;
  var GUESS_MS=25000, ANECDOTE_AT=5000, REVEAL_MS=8000;
  var BEAT_PTS=100;                 /* battre tous les autres joueurs = 100 pts */
  var BONUS=[[0.02,50],[0.10,25]];  /* à 2 % près : +50, à 10 % près : +25 */
  var COLORS=['#E60012','#2E6FF2','#FFE600','#7cff6e','#ff6ec7','#ff9d2f','#00e5ff','#b388ff','#ffffff','#c49a6c'];

  /* [emoji, objet, où et quand, anecdote, prix, devise, clé de la photo (js/enchere-photos.js)]
     Prix d'adjudication tels que rapportés par la presse (frais compris quand
     c'est le chiffre le plus cité). */
  var BANK=[
    ['🃏','Carte Pokémon « Pikachu Illustrator » (notée PSA 10)','Achetée par le youtubeur Logan Paul, 2022',
      'Seulement une trentaine d’exemplaires existent : elle a été offerte en 1998 aux gagnants d’un concours de dessin au Japon. Logan Paul l’a portée autour du cou sur le ring de WrestleMania.',5275000,'$','pikachu'],
    ['🚽','Toilettes en or massif « America » de Maurizio Cattelan','Sotheby’s, New York, 2025',
      'Environ 100 kg d’or 18 carats… et elles fonctionnent ! Leur jumelle a été volée en 2019 au palais de Blenheim, en Angleterre, et n’a jamais été retrouvée.',12100000,'$','toilet'],
    ['🍌','Une banane scotchée au mur (« Comedian », Maurizio Cattelan)','Sotheby’s, New York, 2024',
      'La banane avait été achetée 35 centimes chez un marchand de fruits juste à côté. L’acheteur, un entrepreneur de la crypto, l’a mangée quelques jours plus tard.',6200000,'$','banana'],
    ['🧤','Le gant blanc à strass de Michael Jackson','Vente aux enchères à New York, 2009',
      'C’est le gant qu’il portait en 1983 à la télé, le soir où il a fait son tout premier moonwalk en public.',350000,'$','glove'],
    ['🎩','Un chapeau (bicorne) de Napoléon',
      'Osenat, Fontainebleau, 2023',
      'Il était estimé entre 600 000 et 800 000 €. Napoléon le portait « en bataille », pointes sur les épaules, pour qu’on le reconnaisse de loin sur le champ de bataille.',1932000,'€','bicorne'],
    ['🥪','Un croque-monsieur où l’on voit le visage de la Vierge Marie','eBay, 2004',
      'Sa propriétaire l’avait gardé 10 ans sur sa table de nuit : il n’avait jamais moisi. Il a été acheté par un casino en ligne pour sa pub.',28000,'$','grilled'],
    ['🏀','Maillot de Michael Jordan porté en finale NBA 1998 (« The Last Dance »)','Sotheby’s, 2022',
      'Il le portait lors du premier match de sa dernière finale avec les Chicago Bulls, rendue célèbre par la série documentaire « The Last Dance ».',10100000,'$','jordan_jersey'],
    ['⚾','Maillot de Babe Ruth du « called shot » (1932)','Heritage Auctions, 2024',
      'Pendant ce match, Babe Ruth aurait pointé les tribunes du doigt… puis envoyé la balle exactement là. Un des moments les plus légendaires du baseball.',24120000,'$','ruth'],
    ['🎮','Un jeu Super Mario 64 neuf, jamais ouvert','Heritage Auctions, 2021',
      'Deux jours plus tôt, une cartouche de Zelda (NES) neuve venait de battre le record à 870 000 $. Mario l’a pulvérisé.',1560000,'$','mario64'],
    ['🦖','Squelette de T. rex « Stan »','Christie’s, New York, 2020',
      'Découvert en 1987 dans le Dakota du Sud, il a été acheté par un musée d’Abu Dhabi. Il mesure 12 mètres de long.',31800000,'$','stan'],
    ['🦕','Squelette de stégosaure « Apex »','Sotheby’s, New York, 2024',
      'Estimé entre 4 et 6 millions… Il a été trouvé en 2022 par un paléontologue amateur sur son propre terrain, dans une ville du Colorado qui s’appelle… Dinosaur.',44600000,'$','apex'],
    ['🖼️','Le tableau « Salvator Mundi » attribué à Léonard de Vinci','Christie’s, New York, 2017',
      'En 2005, des marchands l’avaient acheté pour 1 175 $ seulement : il était abîmé et on pensait que c’était une copie. C’est le tableau le plus cher jamais vendu.',450300000,'$','salvator'],
    ['🏎️','Voiture Mercedes-Benz 300 SLR « Uhlenhaut Coupé » (1955)','Vente secrète au musée Mercedes, Stuttgart, 2022',
      'Il n’en existe que deux. La vente s’est faite en secret, sur invitation : c’est la voiture la plus chère de l’histoire.',135000000,'€','uhlenhaut'],
    ['🩴','Les vieilles sandales Birkenstock de Steve Jobs','Julien’s Auctions, 2022',
      'Estimées 60 000 à 80 000 $. Il les portait dans les années 70 et 80, à l’époque des débuts d’Apple : on voit encore l’empreinte de ses pieds.',218750,'$','sandals'],
    ['💻','Un ordinateur Apple-1 (1976)','Bonhams, New York, 2014',
      'Fabriqué à la main par Steve Wozniak. En 1976, il était vendu… 666,66 $.',905000,'$','apple1'],
    ['🎸','La guitare de Kurt Cobain du concert MTV Unplugged (1993)','Julien’s Auctions, 2020',
      'Cobain l’avait jouée lors du célèbre concert acoustique de Nirvana, quelques mois avant sa mort.',6010000,'$','cobain'],
    ['👗','La robe de Marilyn Monroe « Happy Birthday Mr. President »','Julien’s Auctions, 2016',
      'Marilyn a dû être cousue dedans tellement elle était serrée. Kim Kardashian l’a portée au Met Gala en 2022.',4800000,'$','marilyn'],
    ['👠','Les souliers de rubis de Dorothy (« Le Magicien d’Oz »)','Heritage Auctions, 2024',
      'Cette paire avait été volée en 2005 dans un musée du Minnesota. Le FBI l’a retrouvée 13 ans plus tard.',32500000,'$','ruby'],
    ['⌚','La montre Rolex Daytona de Paul Newman','Phillips, New York, 2017',
      'Elle lui avait été offerte par sa femme, qui avait fait graver au dos : « Drive carefully me » (« Conduis prudemment, moi »).',17800000,'$','rolex'],
    ['🐦','Le tout premier tweet de l’histoire (vendu en NFT)','Vente en ligne, 2021',
      'Le tweet dit « just setting up my twttr ». L’acheteur a essayé de le revendre en 2022 pour 48 millions… la meilleure offre était d’environ 280 $.',2900000,'$','tweet'],
    ['🍽️','Un déjeuner avec le milliardaire Warren Buffett','Enchère caritative en ligne, 2022',
      'C’était la dernière édition de cette enchère annuelle : tout l’argent est allé à une association qui aide les sans-abri à San Francisco.',19000100,'$','buffett'],
    ['🦷','Une dent de John Lennon','Vente aux enchères en Angleterre, 2011',
      'Achetée par un dentiste canadien… qui disait vouloir un jour cloner Lennon grâce à son ADN.',19500,'£','lennon_tooth'],
    ['🍞','Le pain perdu à moitié mangé de Justin Timberlake','eBay, 2000',
      'Ce sont des animateurs radio qui l’avaient récupéré sur sa table après une interview, puis mis en vente.',1025,'$','french_toast'],
    ['🪨','Un calcul rénal de William Shatner (le capitaine Kirk de « Star Trek »)','Vente caritative en ligne, 2006',
      'Oui, une pierre sortie de son rein. L’argent a servi à construire des maisons pour une association.',25000,'$','shatner'],
    ['🤧','Un mouchoir usagé de Scarlett Johansson','eBay, 2008',
      'Elle s’était mouchée dedans en direct, dans une émission de télé américaine. L’argent a été reversé à une association.',5300,'$','tissue'],
    ['🫥','Une sculpture invisible (« Io Sono », de Salvatore Garau)','Art-Rite, Milan, 2021',
      'Il n’y a rien à voir : l’acheteur reçoit un certificat. L’œuvre doit être « exposée » dans un espace vide d’environ 1,5 m × 1,5 m.',15000,'€','iosono'],
    ['🐒','Trois tableaux peints par Congo, un chimpanzé','Bonhams, Londres, 2005',
      'Dans la même vente, un Renoir et un Warhol n’ont trouvé aucun acheteur. Le chimpanzé, lui, a fait un carton.',14400,'£','congo'],
    ['👜','Le tout premier sac Birkin d’Hermès, celui de Jane Birkin','Sotheby’s, Paris, 2025',
      'Le sac est né en 1984 d’une discussion dans un avion entre Jane Birkin et le patron d’Hermès. Elle y avait collé des autocollants et accroché un coupe-ongles.',8600000,'€','birkin'],
    ['🌕','Un sac de Neil Armstrong avec de la poussière de Lune','Sotheby’s, New York, 2017',
      'Deux ans plus tôt, le gouvernement américain l’avait vendu par erreur dans une enchère en ligne… pour 995 $.',1800000,'$','moonbag'],
    ['✉️','La « lettre sur Dieu » d’Albert Einstein','Christie’s, New York, 2018',
      'Une lettre d’une page et demie écrite en 1954, un an avant sa mort, où il dit ce qu’il pense de Dieu et de la religion.',2900000,'$','einstein_god'],
    ['📝','Un petit mot d’Einstein sur le bonheur','Vente aux enchères à Jérusalem, 2017',
      'En 1922 à Tokyo, il n’avait pas de monnaie pour donner un pourboire au coursier de l’hôtel : il lui a écrit ce mot à la place, en lui disant qu’il vaudrait peut-être cher un jour.',1560000,'$','einstein_note'],
    ['🎈','Le tableau à moitié déchiqueté de Banksy (« Love is in the Bin »)','Sotheby’s, Londres, 2021',
      'En 2018, juste après avoir été adjugé 1 million de livres, il s’est autodétruit dans son cadre grâce à une broyeuse cachée. Revendu 3 ans plus tard…',18600000,'£','banksy'],
    ['👟','Une paire de Nike « Moon Shoe » (1972)','Sotheby’s, 2019',
      'Leur semelle a été fabriquée avec le gaufrier de la femme du cofondateur de Nike. Seule une douzaine de paires ont été fabriquées, pour les coureurs des sélections olympiques.',437500,'$','moonshoe'],
    ['💿','Le seul exemplaire d’un album du Wu-Tang Clan','Vente privée, 2015',
      'L’acheteur, condamné plus tard pour fraude, a dû le céder à la justice américaine. Le contrat interdit de le commercialiser pendant 88 ans.',2000000,'$','wutang'],
    ['🥃','Une bouteille de whisky Macallan de 1926','Sotheby’s, Londres, 2023',
      'Le whisky a vieilli 60 ans en fût. L’étiquette a été peinte à la main par un artiste. C’est la bouteille d’alcool la plus chère du monde.',2187500,'£','macallan'],
    ['🐟','Un thon rouge de 278 kg','Marché aux poissons de Toyosu, Tokyo, 2019',
      'Acheté à la toute première criée de l’année par le patron d’une chaîne de restaurants de sushis, surnommé « le roi du thon ».',333600000,'¥','tuna'],
    ['🍈','Deux melons japonais Yubari','Criée de Sapporo, Japon, 2019',
      'Ces melons sont cultivés dans une seule petite ville. La première criée de la saison sert surtout à faire de la pub… mais quand même.',5000000,'¥','yubari'],
    ['⚾','Une carte de baseball Mickey Mantle de 1952','Heritage Auctions, 2022',
      'Une simple carte à collectionner en carton, mais en état quasi parfait. C’est la carte de sport la plus chère au monde.',12600000,'$','mantle'],
    ['⚽','Les 6 maillots portés par Messi à la Coupe du monde 2022','Sotheby’s, New York, 2023',
      'Dont celui de la finale contre la France, gagnée par l’Argentine aux tirs au but.',7800000,'$','messi'],
    ['🤚','Le maillot de Maradona du match de la « main de Dieu » (1986)','Sotheby’s, Londres, 2022',
      'Maradona l’avait échangé à la fin du match avec un joueur anglais, Steve Hodge, qui l’a gardé 36 ans.',7100000,'£','maradona'],
    ['🐰','Une sculpture de lapin en acier (« Rabbit », Jeff Koons)','Christie’s, New York, 2019',
      'Un lapin gonflable… en acier inoxydable, de 1 mètre de haut. Œuvre la plus chère vendue par un artiste vivant à l’époque.',91100000,'$','rabbit'],
    ['👟','Les baskets Air Jordan portées par Michael Jordan en finale 1998','Sotheby’s, 2023',
      'Il les portait lors du deuxième match de sa dernière finale avec les Bulls. Record pour une paire de baskets.',2200000,'$','aj13'],
    ['🚙','La Rolls-Royce psychédélique de John Lennon','Sotheby’s, New York, 1985',
      'Lennon l’avait fait peindre en jaune vif avec des fleurs. Une passante londonienne l’aurait attaquée à coups de parapluie en criant au sacrilège.',2290000,'$','lennon_rolls'],
    ['🕷️','La BD où Spider-Man apparaît pour la première fois (1962)','Heritage Auctions, 2021',
      'Le numéro « Amazing Fantasy #15 » coûtait 12 cents à sa sortie.',3600000,'$','amazing'],
    ['🎻','Le violon du chef d’orchestre du Titanic','Vente en Angleterre, 2013',
      'Wallace Hartley et ses musiciens ont joué jusqu’au naufrage. Son violon a été retrouvé dans une valise attachée à son corps.',900000,'£','titanic_violin'],
    ['🚗','L’Aston Martin DB5 de James Bond','RM Sotheby’s, 2019',
      'Une des voitures des films, avec les gadgets : fausses mitrailleuses, plaques d’immatriculation tournantes…',6385000,'$','db5'],
    ['🎻','Un violon Stradivarius (« Lady Blunt », 1721)','Vente en ligne, 2011',
      'Vendu au profit des victimes du tsunami au Japon. Il est presque dans l’état où Stradivarius l’a fabriqué, il y a 300 ans.',9800000,'£','lady_blunt'],
    ['🐶','Le dessin original d’une couverture de Tintin (« Le Lotus bleu »)','Artcurial, Paris, 2021',
      'Hergé l’avait refusé en 1936 : trop cher à imprimer. Il a été offert au fils de l’éditeur, qui l’a gardé plié dans un tiroir pendant des années.',3175400,'€','tintin'],
    ['📱','Un iPhone de 2007, jamais déballé','LCG Auctions, 2023',
      'À sa sortie, il coûtait 599 $.',190372,'$','iphone'],
    ['📜','Un des premiers exemplaires imprimés de la Constitution américaine','Sotheby’s, New York, 2021',
      'Un groupe de fans de crypto avait récolté 40 millions sur Internet pour l’acheter… et a perdu face à un milliardaire.',43200000,'$','constitution'],
    ['📓','Un carnet de Léonard de Vinci (le « Codex Leicester »)','Christie’s, New York, 1994',
      'L’acheteur s’appelle Bill Gates. Le carnet parle d’eau, de fossiles et explique pourquoi la Lune brille.',30800000,'$','codex'],
    ['💎','Le diamant rose « Pink Star »','Sotheby’s, Hong Kong, 2017',
      'Près de 60 carats. La vente a duré cinq minutes.',71200000,'$','pinkstar'],
    ['🗡️','Un jeu The Legend of Zelda (NES) neuf, jamais ouvert','Heritage Auctions, 2021',
      'Une cartouche de 1987 encore sous son plastique d’origine. Record éphémère : battu deux jours plus tard par Super Mario 64.',870000,'$','zelda'],
    ['🖼️','Une œuvre numérique (NFT) de l’artiste Beeple','Christie’s, en ligne, 2021',
      'Un collage de 5 000 dessins, un par jour pendant 13 ans et demi. Il n’existe que sous forme de fichier.',69300000,'$','beeple']
  ];
  var CUR_NAME={'$':'dollars','€':'euros','£':'livres','¥':'yens'};

  /* hôte : état qui fait foi */
  var as={players:[], scores:[], connected:[], clientIds:[], phase:'lobby', count:8, pool:[], idx:-1, item:null,
          guesses:{}, deadline:0, timer:null, anecTimer:null, lastMsg:null, started:false};
  var netRole=null, mySeat=0, myName='', roomCode='', inGame=false, liveForLobby=false;
  var view={idx:-1, cur:'$', mine:null, guessed:[]};
  var bar=CG.timerBar('adjTimerFill','adjTimerText');

  var ui=CG.roomUI('adj', {route:'enchere', code:function(){ return roomCode; },
    onLostBack:function(){ cleanup(); ui.goto('online'); }});
  var seats=CG.seatTools(as), isConnected=seats.isConnected, activeCount=seats.activeCount;
  var net=CG.createRoomNet({
    prefix:ROOM_PREFIX,
    onStatus:ui.setStatus,
    onJoinRequest:hostOnJoinRequest,
    onSeatJoined:hostOnSeatJoined,
    onGuestMessage:hostOnGuestMessage,
    onSeatLost:hostOnSeatLost,
    onHostMessage:handleMsg,
    onReconnecting:function(){ ui.showBanner('📡 Connexion perdue — reconnexion en cours...'); },
    onReconnected:function(){ ui.hideBanner(); },
    onLost:function(){ ui.showLost("Impossible de rétablir la connexion avec l'hôte."); },
    onPromote:onPromote
  });
  var broadcast=net.broadcast, sendToSeat=net.sendToSeat;

  function clearTimers(){ clearTimeout(as.timer); as.timer=null; clearTimeout(as.anecTimer); as.anecTimer=null; }
  function cleanup(){
    net.close(netRole==='host' ? {type:'room_closed'} : null);
    clearTimers(); bar.stop();
    netRole=null; mySeat=0; roomCode=''; inGame=false; liveForLobby=false;
    as.players=[]; as.scores=[]; as.connected=[]; as.clientIds=[]; as.phase='lobby'; as.idx=-1; as.lastMsg=null; as.started=false;
    $('adjRoundBadge').style.display='none';
    ui.hideBanner(); ui.setStatus('offline','HORS LIGNE');
  }
  function isLive(){ return as.phase==='guess' || as.phase==='reveal'; }
  function pcolor(s){ return COLORS[s%COLORS.length]; }

  /* ----- prix : lecture de ce que tape le joueur, et affichage ----- */
  /* « 12 500 », « 1,5 M », « 2 millions », « 300k », « 3 milliards », « 1.200.000 »… */
  var MAX_PRICE=1e12;
  function parsePrice(s){
    s=String(s||'').toLowerCase().replace(/[\s  '’_]/g,'').replace(/[$€£¥]|euros?|dollars?|livres?|yens?/g,'');
    var m=s.match(/^(\d+(?:[.,]\d+)*)(k|mille|m|millions?|md|mds|milliards?|b)?$/);
    if(!m) return null;
    var num=m[1], mult=1, suf=m[2]||'';
    if(suf==='k' || suf==='mille') mult=1e3;
    else if(/^m(illions?)?$/.test(suf)) mult=1e6;
    else if(suf) mult=1e9;
    /* séparateurs de milliers (1.200.000 ou 1,200,000) */
    if(/^\d{1,3}([.,]\d{3}){2,}$/.test(num) || (mult===1 && /^\d{1,3}[.,]\d{3}$/.test(num))) num=num.replace(/[.,]/g,'');
    else num=num.replace(',','.');
    if((num.match(/\./g)||[]).length>1) return null;
    var v=Math.round(parseFloat(num)*mult);
    if(!isFinite(v) || v<0) return null;
    return Math.min(v, MAX_PRICE);
  }
  function fmt(n, cur){
    var s=Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,' ');
    return cur==='$' || cur==='£' ? cur+' '+s : s+' '+cur;
  }
  /* version courte pour les gros montants : « 12,1 M$ » */
  function fmtShort(n, cur){
    if(n>=1e9) return (Math.round(n/1e8)/10).toString().replace('.',',')+'\u202fMd\u202f'+cur;
    if(n>=1e6) return (Math.round(n/1e5)/10).toString().replace('.',',')+'\u202fM\u202f'+cur;
    return fmt(n, cur);
  }

  /* ----- points : battre les autres joueurs, et bonus de précision ----- */
  function scoreRound(item, guesses, inRound){
    var price=item[4], n=inRound.length, rows=[];
    inRound.forEach(function(s){
      var g=guesses.hasOwnProperty(s) ? guesses[s] : null;
      rows.push({seat:s, guess:g, diff: g===null ? Infinity : Math.abs(g-price)});
    });
    rows.forEach(function(r){
      if(r.guess===null){ r.pts=0; r.beaten=0; r.bonus=0; return; }
      r.beaten=rows.filter(function(o){ return o!==r && o.diff>r.diff; }).length;
      r.pts = n>1 ? Math.round(BEAT_PTS*r.beaten/(n-1)) : 0;
      r.bonus=0;
      var rel = price>0 ? r.diff/price : (r.diff===0?0:1);
      for(var i=0;i<BONUS.length;i++){ if(rel<=BONUS[i][0]){ r.bonus=BONUS[i][1]; break; } }
      r.pts+=r.bonus;
    });
    rows.sort(function(a,b){ return a.diff-b.diff; });
    return rows;
  }

  /* ===================== CRÉER / REJOINDRE ===================== */
  (function(){
    var btns=$('adjCountToggle').querySelectorAll('button');
    for(var i=0;i<btns.length;i++) btns[i].addEventListener('click', function(){
      for(var j=0;j<btns.length;j++) btns[j].classList.remove('active');
      this.classList.add('active'); as.count=parseInt(this.getAttribute('data-count'),10)||8; sfxToggle();
    });
  })();
  $('adjCreateRoomBtn').addEventListener('click',function(){
    var wanted=CG.readRoomCode('adjHostCode');
    if(!wanted){ sfxToggle(); return; }
    myName=$('adjName').value.trim()||'Joueur';
    var count=as.count;
    cleanup(); as.count=count;
    net.host(function(code){
      netRole='host'; mySeat=0; roomCode=code;
      as.players=[{name:myName}]; as.scores=[0]; as.connected=[true]; as.clientIds=[net.clientId];
      try{ history.replaceState(null,'','#enchere?room='+code); }catch(e){}
      $('adjCodeDisplay').textContent=code;
      renderLobby(); ui.goto('lobby');
    }, wanted);
    sfxToggle();
  });
  $('adjJoinRoomBtn').addEventListener('click',function(){
    myName=$('adjName').value.trim()||'Joueur';
    var code=CG.cleanRoomCode($('adjJoinCode').value);
    if(!code){ shake($('adjJoinCode')); return; }
    cleanup(); netRole='guest';
    net.join(code, {name:myName});
    sfxToggle();
  });
  $('adjBackFromLobby').addEventListener('click',function(){ sfxToggle(); cleanup(); ui.goto('online'); });
  $('adjHubReturnBtn').addEventListener('click',function(){ sfxToggle(); location.hash='hub'; });
  CG.wireModal('adjRulesModal','adjRulesBtn');

  /* ===================== HÔTE ===================== */
  function hostOnJoinRequest(msg){
    var back=seats.returningSeat(msg); if(back) return back;
    if(activeCount()>=MAX_PLAYERS) return 'SALLE COMPLÈTE ('+MAX_PLAYERS+'/'+MAX_PLAYERS+')';
    for(var s=1;s<as.players.length;s++) if(!as.players[s]) return s;
    return Math.max(1, as.players.length);
  }
  function hostOnSeatJoined(seat, msg, isRepeat){
    var p=as.players[seat];
    if(p){ if(msg.name) p.name=msg.name; }
    else { as.players[seat]={name:msg.name||'Joueur'}; as.scores[seat]=0; }
    as.clientIds[seat]=msg.clientId||null; as.connected[seat]=true;
    net.sendTo(seat, {type:'seat_assigned', seat:seat, players:as.players.slice(), scores:as.scores.slice(), connected:as.connected.slice(), live:isLive()});
    if(as.phase==='guess') net.sendTo(seat, guessMsg(seat));
    else if((as.phase==='reveal' || as.phase==='over') && as.lastMsg) net.sendTo(seat, as.lastMsg);
    hostBroadcastLobby();
    if(!isRepeat) sfxValidate();
  }
  function hostOnSeatLost(seat){
    if(!as.started){ as.players[seat]=null; as.clientIds[seat]=null; }
    else as.connected[seat]=false;
    hostBroadcastLobby();
  }
  function hostOnGuestMessage(seat, msg){ if(msg.type==='guess') hostGuess(seat, msg.value); }
  function hostBroadcastLobby(){
    broadcast({type:'lobby_update', players:as.players.slice(), scores:as.scores.slice(), connected:as.connected.slice(), live:isLive()});
  }
  function anecdoteShown(){ return Date.now()>=as.deadline-GUESS_MS+ANECDOTE_AT; }
  function guessMsg(seat){
    var it=as.item;
    return {type:'guess_start', idx:as.idx, count:as.count, emoji:it[0], name:it[1], where:it[2], cur:it[5], photo:it[6],
      anecdote: anecdoteShown() ? it[3] : null,
      ms:Math.max(0, as.deadline-Date.now()), total:GUESS_MS, guessed:Object.keys(as.guesses).map(Number),
      mine: as.guesses.hasOwnProperty(seat) ? as.guesses[seat] : null};
  }
  $('adjStartBtn').addEventListener('click',function(){ sfxValidate(); hostStartGame(); });
  $('adjReplayBtn').addEventListener('click',function(){ sfxValidate(); hostStartGame(); });
  function hostStartGame(){
    if(activeCount()<MIN_PLAYERS) return;
    for(var s=1;s<as.players.length;s++) if(as.players[s] && !isConnected(s)){ as.players[s]=null; as.clientIds[s]=null; }
    as.scores=as.players.map(function(){ return 0; });
    as.started=true;
    if(as.pool.length<as.count) as.pool=shuffle(BANK.slice());
    as.idx=-1;
    broadcast({type:'preload', photos:as.pool.slice(-as.count).map(function(it){ return it[6]; })});
    hostNext();
  }
  function hostNext(){
    clearTimers();
    as.idx++;
    if(as.idx>=as.count){ hostOver(); return; }
    as.item=as.pool.pop();
    as.guesses={};
    as.phase='guess';
    as.deadline=Date.now()+GUESS_MS;
    as.timer=setTimeout(hostReveal, GUESS_MS+300);
    as.anecTimer=setTimeout(function(){ if(as.phase==='guess') broadcast({type:'anecdote', idx:as.idx, text:as.item[3]}); }, ANECDOTE_AT);
    as.players.forEach(function(p,s){ if(p) sendToSeat(s, guessMsg(s)); });
    hostBroadcastLobby();
  }
  function hostGuess(seat, value){
    if(as.phase!=='guess' || !as.players[seat]) return;
    var v=+value;
    if(!isFinite(v) || v<0) return;
    as.guesses[seat]=Math.min(Math.round(v), MAX_PRICE);
    sendToSeat(seat, {type:'guess_ok', idx:as.idx, value:as.guesses[seat]});
    broadcast({type:'guessed', idx:as.idx, guessed:Object.keys(as.guesses).map(Number)});
  }
  function hostReveal(){
    if(as.phase!=='guess') return;
    clearTimers();
    as.phase='reveal';
    var inRound=[];
    as.players.forEach(function(p,s){ if(p && (isConnected(s) || as.guesses.hasOwnProperty(s))) inRound.push(s); });
    var rows=scoreRound(as.item, as.guesses, inRound);
    rows.forEach(function(r){ as.scores[r.seat]=(as.scores[r.seat]||0)+r.pts; });
    as.lastMsg={type:'reveal', idx:as.idx, count:as.count, emoji:as.item[0], name:as.item[1], where:as.item[2], anecdote:as.item[3],
      price:as.item[4], cur:as.item[5], photo:as.item[6], rows:rows.map(function(r){ return {seat:r.seat, guess:r.guess, pts:r.pts, bonus:r.bonus}; }),
      scores:as.scores.slice(), players:as.players.slice()};
    broadcast(as.lastMsg);
    as.timer=setTimeout(hostNext, REVEAL_MS);
  }
  function hostOver(){
    clearTimers();
    as.phase='over';
    as.lastMsg={type:'game_over', scores:as.scores.slice(), players:as.players.slice()};
    broadcast(as.lastMsg);
    hostBroadcastLobby();
    if(CG.partyEnd) CG.partyEnd(as.players, as.scores);
  }
  function onPromote(info){
    netRole='host'; mySeat=0; roomCode=net.code;
    CG.promoteSeats(as, info);
    clearTimers(); bar.stop();
    as.started=true; as.phase='over'; as.lastMsg=null; inGame=false;
    $('adjCodeDisplay').textContent=roomCode;
    ui.hideBanner(); hostBroadcastLobby(); ui.goto('lobby');
    $('adjLobbyStatus').textContent=CG.PROMOTED_TEXT;
  }

  /* ===================== MESSAGES ===================== */
  function handleMsg(msg){
    if(!msg || !msg.type) return;
    switch(msg.type){
      case 'room_full': ui.setStatus('error', msg.reason||'SALLE COMPLÈTE'); break;
      case 'seat_assigned':
        mySeat=msg.seat; roomCode=net.code;
        as.players=msg.players.slice(); as.scores=(msg.scores||[]).slice(); as.connected=(msg.connected||[]).slice();
        liveForLobby=!!msg.live;
        $('adjCodeDisplay').textContent=roomCode;
        renderLobby(); ui.goto('lobby');
        break;
      case 'lobby_update':
        as.players=msg.players.slice(); as.connected=msg.connected.slice();
        if(netRole!=='host') as.scores=msg.scores.slice();
        liveForLobby=!!msg.live;
        renderLobby(); renderGuessed();
        break;
      case 'preload': if(Array.isArray(msg.photos)) preload(msg.photos.slice(0,20)); break;
      case 'guess_start': onGuessStart(msg); break;
      case 'anecdote': if(msg.idx===view.idx) showAnecdote(msg.text, true); break;
      case 'guess_ok':
        if(msg.idx!==view.idx) break;
        view.mine=msg.value;
        $('adjMine').innerHTML='🔨 Ton estimation : <b>'+escapeHtml(fmt(msg.value, view.cur))+'</b> <small>(tu peux encore la changer)</small>';
        break;
      case 'guessed': if(msg.idx===view.idx){ view.guessed=msg.guessed||[]; renderGuessed(); } break;
      case 'reveal': onReveal(msg); break;
      case 'game_over': onOver(msg); break;
      case 'room_closed': net.close(); ui.showLost("L'hôte a fermé la salle."); break;
    }
  }

  /* ===================== AFFICHAGE ===================== */
  function row(s, extra){
    var p=as.players[s]||{name:'?'};
    return CG.playerRow({name:p.name, color:pcolor(s), me:s===mySeat, off:!isConnected(s), extra:extra});
  }
  function renderLobby(){
    var html='';
    as.players.forEach(function(p,s){ if(p) html+=row(s, '<span class="cham-vote-count">'+(as.scores[s]||0)+' pts</span>'); });
    $('adjPlayerList').innerHTML=html;
    var n=activeCount(), live = netRole==='host' ? isLive() : liveForLobby, st=$('adjLobbyStatus');
    if(live) st.textContent='Une partie est en cours — tu joues dès le prochain objet.';
    else if(n<MIN_PLAYERS) st.textContent=n+' joueur(s) — '+MIN_PLAYERS+' minimum pour lancer.';
    else st.textContent = netRole==='host' ? n+' joueurs prêts. Lance la partie !' : n+" joueurs prêts. En attente que l'hôte lance la partie...";
    $('adjStartBtn').style.display = (netRole==='host' && n>=MIN_PLAYERS && !live) ? 'inline-block' : 'none';
  }
  function showAnecdote(text, fresh){
    var el=$('adjAnecdote');
    el.innerHTML='<b>💡 Anecdote</b> '+escapeHtml(text);
    el.hidden=false;
    if(fresh){ el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); CG.buzz(40); sfxToggle(); }
  }
  /* photo de l'objet (js/enchere-photos.js), sinon son emoji */
  var PHOTOS=CG.ADJ_PHOTOS||{};
  function showItem(msg){
    var ph=PHOTOS[msg.photo], fig=$('adjPhoto'), img=$('adjImg');
    if(ph){
      if(img.getAttribute('src')!==ph.f){ img.removeAttribute('src'); img.src=ph.f; }
      img.alt='Photo : '+msg.name;
      $('adjCredit').innerHTML='📷 <a href="'+escapeHtml(ph.url)+'" target="_blank" rel="noopener">'+escapeHtml(ph.by||'Wikimedia Commons')+'</a> · '+escapeHtml(ph.lic||'');
      fig.hidden=false;
    } else fig.hidden=true;
    $('adjEmoji').hidden=!!ph;
    $('adjEmoji').textContent=msg.emoji;
    $('adjItemName').textContent=msg.name;
    $('adjWhere').textContent='🔨 '+msg.where;
  }
  function onGuessStart(msg){
    if(!inGame || view.idx!==msg.idx) CG.yourTurn();
    inGame=true; view.idx=msg.idx; view.cur=msg.cur; view.mine=msg.mine; view.guessed=msg.guessed||[];
    $('adjRoundBadge').textContent='OBJET '+(msg.idx+1)+' / '+msg.count;
    $('adjRoundBadge').style.display='inline-block';
    showItem(msg);
    if(msg.anecdote) showAnecdote(msg.anecdote, false); else { $('adjAnecdote').hidden=true; $('adjAnecdote').innerHTML=''; }
    $('adjCurLabel').textContent='Ton prix en '+(CUR_NAME[msg.cur]||msg.cur)+' ('+msg.cur+')';
    $('adjGuessBox').hidden=false;
    $('adjGuessInput').value='';
    $('adjPreview').textContent='';
    $('adjMine').innerHTML = msg.mine!==null ? '🔨 Ton estimation : <b>'+escapeHtml(fmt(msg.mine, msg.cur))+'</b>' : '';
    $('adjResult').hidden=true; $('adjResult').innerHTML='';
    bar.start(msg.ms, msg.total);
    renderGuessed();
    ui.goto('play');
    setTimeout(function(){ try{ $('adjGuessInput').focus(); }catch(e){} }, 300);
  }
  function renderGuessed(){
    if(!inGame || !$('adjResult').hidden) return;
    var html='';
    as.players.forEach(function(p,s){
      if(!p) return;
      html+=row(s, '<span class="cham-vote-count">'+(view.guessed.indexOf(s)!==-1?'🔨 a misé':'🤔')+'</span>');
    });
    $('adjGuessList').innerHTML=html;
  }
  function updatePreview(){
    var t=$('adjGuessInput').value.trim(), v=parsePrice(t), el=$('adjPreview');
    el.classList.toggle('bad', !!t && v===null);
    el.textContent = !t ? '' : v===null ? 'Je ne comprends pas ce prix (ex : 12 500, 1,5 M, 300k)' : '= '+fmt(v, view.cur);
  }
  function submitGuess(){
    var inp=$('adjGuessInput'), v=parsePrice(inp.value);
    if(v===null){ shake(inp); return; }
    inp.value=''; updatePreview();
    sfxToggle();
    if(netRole==='host') hostGuess(0, v); else net.send({type:'guess', value:v});
  }
  $('adjGuessBtn').addEventListener('click', submitGuess);
  $('adjGuessInput').addEventListener('input', updatePreview);
  $('adjGuessInput').addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); submitGuess(); } });

  function onReveal(msg){
    bar.stop();
    inGame=true; view.idx=msg.idx; view.cur=msg.cur;
    if(msg.scores) as.scores=msg.scores.slice();
    if(msg.players) as.players=msg.players.slice();
    $('adjRoundBadge').textContent='OBJET '+(msg.idx+1)+' / '+msg.count;
    $('adjRoundBadge').style.display='inline-block';
    showItem(msg);
    showAnecdote(msg.anecdote, false);
    $('adjGuessBox').hidden=true;
    $('adjMine').innerHTML='';
    var html='<div class="adj-price-label">ADJUGÉ, VENDU !</div><div class="adj-price">'+escapeHtml(fmt(msg.price, msg.cur))+'</div>';
    $('adjResult').innerHTML=html; $('adjResult').hidden=false;
    var list='', mine=null;
    msg.rows.forEach(function(r, i){
      var p=msg.players[r.seat]||{name:'?'};
      if(r.seat===mySeat) mine=r;
      var g = r.guess===null ? 'pas d’estimation' : fmt(r.guess, msg.cur);
      var off = r.guess===null ? '' : (r.guess===msg.price ? 'pile !' : (r.guess>msg.price?'+':'−')+fmtShort(Math.abs(r.guess-msg.price), msg.cur));
      list+='<div class="cls-podium-row'+(i===0 && r.guess!==null?' first':'')+(r.seat===mySeat?' me':'')+'"><span class="cls-pos">'+(i===0 && r.guess!==null?'🏆':(i+1))+'</span>'+CG.playerDot(pcolor(r.seat))+
        '<span class="cls-slot-name">'+escapeHtml(p.name)+(r.seat===mySeat?' (toi)':'')+'<small class="adj-guess">'+escapeHtml(g)+(off?' · '+escapeHtml(off):'')+'</small></span>'+
        (r.bonus?'<span class="imp-tag">🎯 +'+r.bonus+'</span>':'')+'<span class="cham-vote-count">+'+r.pts+'</span></div>';
    });
    $('adjGuessList').innerHTML='<div class="cls-podium">'+list+'</div>';
    sfxReveal(mine ? (mine.bonus>=50 ? 100 : mine.pts>=80 ? 80 : mine.pts>=40 ? 50 : mine.pts>0 ? 20 : 0) : 0);
    if(CG.achieve && mine && mine.bonus>=50) CG.achieve('adj_pile');
    ui.goto('play');
  }
  function onOver(msg){
    inGame=false; bar.stop();
    as.scores=msg.scores.slice();
    var order=[]; msg.players.forEach(function(p,s){ if(p) order.push(s); });
    order.sort(function(a,b){ return (msg.scores[b]||0)-(msg.scores[a]||0); });
    var top=order.length ? msg.scores[order[0]]||0 : 0;
    var winners=order.filter(function(s){ return (msg.scores[s]||0)===top; });
    $('adjWinnerText').textContent = top>0 ? winners.map(function(s){ return msg.players[s].name; }).join(' & ')+(winners.length>1?' ONT LE MEILLEUR ŒIL !':' A LE MEILLEUR ŒIL !') : 'Personne n’a marqué… 🙈';
    var html='';
    order.forEach(function(s,i){
      html+='<div class="cls-podium-row'+(i===0?' first':'')+(s===mySeat?' me':'')+'"><span class="cls-pos">'+(winners.indexOf(s)!==-1&&top>0?'👑':(i+1))+'</span>'+CG.playerDot(pcolor(s))+
        '<span class="cls-slot-name">'+escapeHtml(msg.players[s].name)+(s===mySeat?' (toi)':'')+'</span><span class="cham-vote-count">'+(msg.scores[s]||0)+' pts</span></div>';
    });
    $('adjFinalList').innerHTML=html;
    $('adjReplayBtn').style.display = netRole==='host' ? 'inline-block' : 'none';
    $('adjOverWait').style.display = netRole==='host' ? 'none' : 'inline-block';
    $('adjRoundBadge').style.display='none';
    sfxReveal(winners.indexOf(mySeat)!==-1 && top>0 ? 100 : 50);
    if(CG.account) CG.account.recordRanked('enchere', msg.scores, order, mySeat);
    if(CG.achieve && top>0 && winners.indexOf(mySeat)!==-1 && order.length>=2) CG.achieve('adj_win');
    ui.goto('over');
  }

  CG.enchere={
    reset:function(){ if(netRole) cleanup(); closeModal('adjDisconnectModal'); ui.goto('online'); },
    enterJoinFlow:function(code){ ui.goto('online'); $('adjJoinCode').value=CG.cleanRoomCode(decodeURIComponent(code)); }
  };
  /* photo qui ne charge pas (hors ligne…) : on garde l'emoji */
  $('adjImg').addEventListener('error', function(){ $('adjPhoto').hidden=true; $('adjEmoji').hidden=false; });
  /* préchargement des photos d'une partie, pour qu'elles s'affichent tout de suite */
  function preload(keys){ keys.forEach(function(k){ var ph=PHOTOS[k]; if(ph){ var i=new Image(); i.src=ph.f; } }); }
  CG.lobbyChat(net, $('adjPlayerList'), 'adjName');
  /* exposé pour les tests */
  CG.enchere._parsePrice=parsePrice;
  CG.enchere._score=function(price, guesses, inRound){ return scoreRound([0,0,0,0,price,'$'], guesses, inRound); };
  CG.enchere._bank=BANK;
})();
