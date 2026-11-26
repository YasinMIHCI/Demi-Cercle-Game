/* Chaîne de mots — 2 à 10 joueurs en ligne.
   Chacun son tour, on a quelques secondes pour taper un mot du thème (pays,
   animaux, Pokémon…) qui commence par la dernière lettre du mot précédent.
   Trop lent ou mot déjà dit : éliminé. Un mot hors thème ou qui ne commence
   pas par la bonne lettre est simplement refusé (on peut retenter tant qu'il
   reste du temps). Le dernier debout gagne la manche. L'hôte fait autorité :
   il vérifie les mots, tient le chrono et compte les points. */
(function(){
  'use strict';
  var CG=window.CG;
  var $=CG.$, escapeHtml=CG.escapeHtml, shuffle=CG.shuffle, shake=CG.shake, closeModal=CG.closeModal;
  var sfxToggle=CG.sfxToggle, sfxValidate=CG.sfxValidate, sfxReveal=CG.sfxReveal;

  var ROOM_PREFIX='cgchaine-';
  var MIN_PLAYERS=2, MAX_PLAYERS=10;
  var GRACE_MS=700, BETWEEN_MS=6000;
  var COLORS=['#E60012','#2E6FF2','#FFE600','#7cff6e','#ff6ec7','#ff9d2f','#00e5ff','#b388ff','#ffffff','#c49a6c'];

  /* thèmes : [clé, nom, icône, mots séparés par « | », autres orthographes acceptées] — noms français */
  var THEMES=[
    ['pays','Pays','🌍',
      'Afghanistan|Afrique du Sud|Albanie|Algérie|Allemagne|Andorre|Angola|Arabie saoudite|Argentine|Arménie|Australie|Autriche|Azerbaïdjan|'+
      'Bahamas|Bahreïn|Bangladesh|Belgique|Belize|Bénin|Bhoutan|Biélorussie|Birmanie|Bolivie|Bosnie-Herzégovine|Botswana|Brésil|Brunei|Bulgarie|Burkina Faso|Burundi|'+
      'Cambodge|Cameroun|Canada|Cap-Vert|Centrafrique|Chili|Chine|Chypre|Colombie|Comores|Congo|Corée du Nord|Corée du Sud|Costa Rica|Côte d’Ivoire|Croatie|Cuba|'+
      'Danemark|Djibouti|Dominique|Égypte|Émirats arabes unis|Équateur|Érythrée|Espagne|Estonie|Eswatini|États-Unis|Éthiopie|Fidji|Finlande|France|'+
      'Gabon|Gambie|Géorgie|Ghana|Grèce|Grenade|Guatemala|Guinée|Guinée-Bissau|Guinée équatoriale|Guyana|Haïti|Honduras|Hongrie|'+
      'Inde|Indonésie|Irak|Iran|Irlande|Islande|Israël|Italie|Jamaïque|Japon|Jordanie|Kazakhstan|Kenya|Kirghizistan|Kiribati|Kosovo|Koweït|'+
      'Laos|Lesotho|Lettonie|Liban|Liberia|Libye|Liechtenstein|Lituanie|Luxembourg|Macédoine du Nord|Madagascar|Malaisie|Malawi|Maldives|Mali|Malte|Maroc|Maurice|Mauritanie|Mexique|Micronésie|Moldavie|Monaco|Mongolie|Monténégro|Mozambique|'+
      'Namibie|Nauru|Népal|Nicaragua|Niger|Nigeria|Norvège|Nouvelle-Zélande|Oman|Ouganda|Ouzbékistan|Pakistan|Palaos|Palestine|Panama|Papouasie-Nouvelle-Guinée|Paraguay|Pays-Bas|Pérou|Philippines|Pologne|Portugal|Qatar|'+
      'République dominicaine|République tchèque|Roumanie|Royaume-Uni|Russie|Rwanda|Saint-Marin|Salvador|Samoa|Sénégal|Serbie|Seychelles|Sierra Leone|Singapour|Slovaquie|Slovénie|Somalie|Soudan|Soudan du Sud|Sri Lanka|Suède|Suisse|Suriname|Syrie|'+
      'Tadjikistan|Tanzanie|Tchad|Thaïlande|Timor oriental|Togo|Tonga|Trinité-et-Tobago|Tunisie|Turkménistan|Turquie|Tuvalu|Ukraine|Uruguay|Vanuatu|Vatican|Venezuela|Viêt Nam|Yémen|Zambie|Zimbabwe|'+
      'Angleterre|Écosse|Pays de Galles',
      {'États-Unis':['USA','Etats Unis d Amerique','Amerique'],'Pays-Bas':['Hollande'],'Royaume-Uni':['Grande-Bretagne'],'République tchèque':['Tchéquie'],
       'Viêt Nam':['Vietnam'],'Birmanie':['Myanmar'],'Centrafrique':['République centrafricaine'],'Biélorussie':['Bélarus'],'Eswatini':['Swaziland'],'Timor oriental':['Timor'],'Irak':['Iraq']}],
    ['animaux','Animaux','🐾',
      'Abeille|Aigle|Albatros|Alligator|Alpaga|Anaconda|Âne|Anguille|Antilope|Araignée|Autruche|Babouin|Baleine|Belette|Bélier|Biche|Bison|Blaireau|Bœuf|Bouc|Bouquetin|Buffle|'+
      'Cachalot|Caille|Calamar|Caméléon|Canard|Canari|Caribou|Carpe|Castor|Chacal|Chameau|Chamois|Chat|Chauve-souris|Cheval|Chèvre|Chevreuil|Chien|Chimpanzé|Chinchilla|Chouette|Cigale|Cigogne|Cobra|Coccinelle|Cochon|Colibri|Coq|Corbeau|Crabe|Crapaud|Crevette|Criquet|Crocodile|Cygne|'+
      'Dauphin|Dinde|Dindon|Dromadaire|Écureuil|Élan|Éléphant|Émeu|Escargot|Espadon|Étoile de mer|Faisan|Faucon|Flamant rose|Fouine|Fourmi|Furet|'+
      'Gazelle|Geai|Gecko|Gibbon|Girafe|Gnou|Gorille|Grenouille|Grillon|Guépard|Guêpe|Hamster|Hareng|Hérisson|Héron|Hibou|Hippopotame|Hirondelle|Homard|Hyène|'+
      'Ibis|Iguane|Impala|Jaguar|Kangourou|Kiwi|Koala|Lama|Lapin|Léopard|Lézard|Libellule|Lièvre|Limace|Lion|Loup|Loutre|Lynx|'+
      'Manchot|Mante religieuse|Marmotte|Méduse|Merle|Mésange|Morse|Mouche|Mouette|Mouflon|Moustique|Mouton|Mulet|Musaraigne|Naja|Nandou|Narval|'+
      'Ocelot|Oie|Okapi|Opossum|Orang-outan|Orque|Ornithorynque|Ouistiti|Ours|Oursin|Panda|Panthère|Paon|Papillon|Perroquet|Perruche|Phacochère|Phoque|Pie|Pieuvre|Pigeon|Pingouin|Piranha|Poisson rouge|Poney|Porc-épic|Poule|Pou|Puce|Puma|Putois|Python|'+
      'Quetzal|Raie|Rat|Raton laveur|Renard|Renne|Requin|Rhinocéros|Rossignol|Rouge-gorge|Sanglier|Sardine|Sauterelle|Scarabée|Scorpion|Serpent|Singe|Souris|Suricate|'+
      'Tapir|Tarentule|Tatou|Taupe|Taureau|Tigre|Tortue|Toucan|Truite|Unau|Vache|Varan|Vautour|Ver de terre|Vipère|Vison|Wapiti|Xérus|Yack|Zèbre|Zébu',
      {'Yack':['Yak'],'Ver de terre':['Ver'],'Poisson rouge':['Poisson'],'Orang-outan':['Orang-outang']}],
    ['pokemon','Pokémon (1re génération)','⚡',
      'Bulbizarre|Herbizarre|Florizarre|Salamèche|Reptincel|Dracaufeu|Carapuce|Carabaffe|Tortank|Chenipan|Chrysacier|Papilusion|Aspicot|Coconfort|Dardargnan|Roucool|Roucoups|Roucarnage|Rattata|Rattatac|'+
      'Piafabec|Rapasdepic|Abo|Arbok|Pikachu|Raichu|Sabelette|Sablaireau|Nidoran|Nidorina|Nidoqueen|Nidorino|Nidoking|Mélofée|Mélodelfe|Goupix|Feunard|Rondoudou|Grodoudou|Nosferapti|Nosferalto|'+
      'Mystherbe|Ortide|Rafflesia|Paras|Parasect|Mimitoss|Aéromite|Taupiqueur|Triopikeur|Miaouss|Persian|Psykokwak|Akwakwak|Férosinge|Colossinge|Caninos|Arcanin|Ptitard|Têtarte|Tartard|'+
      'Abra|Kadabra|Alakazam|Machoc|Machopeur|Mackogneur|Chétiflor|Boustiflor|Empiflor|Tentacool|Tentacruel|Racaillou|Gravalanch|Grolem|Ponyta|Galopa|Ramoloss|Flagadoss|Magnéti|Magnéton|'+
      'Canarticho|Doduo|Dodrio|Otaria|Lamantine|Tadmorv|Grotadmorv|Kokiyas|Crustabri|Fantominus|Spectrum|Ectoplasma|Onix|Soporifik|Hypnomade|Krabby|Krabboss|Voltorbe|Électrode|Noeunoeuf|Noadkoko|'+
      'Osselait|Ossatueur|Kicklee|Tygnon|Excelangue|Smogo|Smogogo|Rhinocorne|Rhinoféros|Leveinard|Saquedeneu|Kangourex|Hypotrempe|Hypocéan|Poissirène|Poissoroy|Stari|Staross|M. Mime|Insécateur|'+
      'Lippoutou|Élektek|Magmar|Scarabrute|Tauros|Magicarpe|Léviator|Lokhlass|Métamorph|Évoli|Aquali|Voltali|Pyroli|Porygon|Amonita|Amonistar|Kabuto|Kabutops|Ptéra|Ronflex|'+
      'Artikodin|Électhor|Sulfura|Minidraco|Draco|Dracolosse|Mewtwo|Mew',
      {'M. Mime':['Monsieur Mime','Mr Mime','M Mime']}],
    ['marques','Marques','🏷️',
      'Adidas|Airbus|Alfa Romeo|Amazon|Apple|Asus|Audi|Auchan|Balenciaga|Bic|BMW|Boeing|Bonduelle|Bugatti|Burger King|Canon|Carrefour|Cartier|Casio|Chanel|Citroën|Coca-Cola|Colgate|Converse|'+
      'Danone|Decathlon|Dell|Dior|Disney|Durex|eBay|Evian|Facebook|Fanta|Ferrari|Fiat|Ford|Garnier|Gillette|Google|Gucci|Guess|Haribo|Heineken|Hermès|Hollister|Honda|Hyundai|'+
      'Ikea|Instagram|Intel|Jaguar|Jeep|Jordan|Kellogg’s|KFC|Kia|Kiabi|Kinder|Lacoste|Lamborghini|Leclerc|Lego|Lenovo|Levi’s|Lidl|Lipton|Logitech|L’Oréal|Louis Vuitton|'+
      'Maserati|Mattel|Mazda|McDonald’s|Mercedes|Michelin|Microsoft|Milka|Monoprix|Netflix|Nestlé|Nike|Nintendo|Nissan|Nokia|Nutella|Oasis|Omega|Opel|Orange|Orangina|Oreo|'+
      'Panasonic|Pepsi|Peugeot|Philips|Playmobil|Porsche|Prada|Pringles|Puma|Quechua|Quick|Ray-Ban|Red Bull|Reebok|Renault|Ricard|Rolex|Samsung|Schweppes|Seat|Sephora|Shell|Skoda|Snapchat|Sony|Spotify|Starbucks|Subway|Supreme|Suzuki|Swatch|'+
      'Tesla|TikTok|Total|Toyota|Twix|Uber|Ubisoft|Uniqlo|Vans|Volkswagen|Volvo|Xbox|Xiaomi|Yamaha|Yoplait|YouTube|Zalando|Zara',
      {'McDonald’s':['McDo','MacDo','McDonalds'],'Coca-Cola':['Coca'],'Mercedes':['Mercedes-Benz'],'Volkswagen':['VW'],'Total':['TotalEnergies'],'Louis Vuitton':['Vuitton','LV']}],
    ['fruits','Fruits & légumes','🥕',
      'Abricot|Ail|Airelle|Amande|Ananas|Artichaut|Asperge|Aubergine|Avocat|Banane|Betterave|Brocoli|Brugnon|Cacahuète|Carotte|Cassis|Céleri|Cerise|Champignon|Châtaigne|Chou|Chou-fleur|Ciboulette|Citron|Citrouille|Clémentine|Coing|Concombre|Courge|Courgette|Cresson|'+
      'Datte|Échalote|Endive|Épinard|Figue|Fraise|Framboise|Fruit de la passion|Goyave|Grenade|Griotte|Groseille|Haricot|Kaki|Kiwi|Kumquat|Laitue|Lentille|Litchi|'+
      'Maïs|Mandarine|Mangue|Melon|Mirabelle|Mûre|Myrtille|Navet|Nectarine|Noisette|Noix|Noix de coco|Oignon|Olive|Orange|Pamplemousse|Panais|Papaye|Pastèque|Patate douce|Pêche|Petit pois|Physalis|Piment|Pistache|Poire|Poireau|Pois chiche|Poivron|Pomme|Pomme de terre|Potiron|Prune|Pruneau|'+
      'Quetsche|Radis|Raisin|Rhubarbe|Roquette|Rutabaga|Salade|Salsifis|Tomate|Topinambour|Yuzu',
      {'Litchi':['Lychee','Letchi'],'Noix de coco':['Coco'],'Pomme de terre':['Patate']}],
    ['villes','Villes de France','🏙️',
      'Paris|Marseille|Lyon|Toulouse|Nice|Nantes|Strasbourg|Montpellier|Bordeaux|Lille|Rennes|Reims|Le Havre|Saint-Étienne|Toulon|Grenoble|Dijon|Angers|Nîmes|Villeurbanne|Clermont-Ferrand|Le Mans|Aix-en-Provence|Brest|Tours|Amiens|Limoges|Annecy|Perpignan|'+
      'Metz|Besançon|Orléans|Rouen|Mulhouse|Caen|Nancy|Argenteuil|Montreuil|Roubaix|Tourcoing|Avignon|Nanterre|Créteil|Poitiers|Versailles|Pau|Calais|La Rochelle|Cannes|Antibes|Ajaccio|Bastia|Colmar|Bayonne|Biarritz|Lourdes|Chambéry|Valence|Troyes|'+
      'Quimper|Vannes|Lorient|Saint-Malo|Dunkerque|Arras|Lens|Douai|Valenciennes|Cherbourg|Évreux|Chartres|Blois|Bourges|Nevers|Auxerre|Mâcon|Vichy|Aurillac|Rodez|Albi|Cahors|Agen|Montauban|Tarbes|Narbonne|Béziers|Carcassonne|Sète|Arles|Fréjus|Hyères|Menton|Gap|Briançon|'+
      'Épinal|Verdun|Sedan|Laon|Beauvais|Compiègne|Saint-Denis|Vincennes|Meaux|Melun|Évry|Cergy|Niort|Angoulême|Cognac|Périgueux|Bergerac|Dax|Saintes|Royan|Vierzon|Châteauroux|Tulle|Alès|Orange|Istres|Martigues|Aubagne|Grasse|Saint-Tropez|'+
      'Dieppe|Fécamp|Honfleur|Deauville|Lisieux|Alençon|Laval|Saumur|Cholet|La Roche-sur-Yon|Saint-Nazaire|Lannion|Morlaix|Saint-Brieuc|Guingamp|Yerres|Wattrelos|Villejuif|Ivry-sur-Seine|Issy-les-Moulineaux|Haguenau|Hazebrouck|Uzès|Oyonnax|Ussel|Zuydcoote',
      {'Le Havre':['Havre'],'Le Mans':['Mans'],'La Rochelle':['Rochelle'],'Saint-Étienne':['St Etienne'],'Clermont-Ferrand':['Clermont'],'Aix-en-Provence':['Aix']}]
  ];

  /* ----- mots : minuscules, sans accents, sans espaces ni tirets ----- */
  function norm(s){
    s=String(s||'').toLowerCase();
    if(s.normalize) s=s.normalize('NFD').replace(/[̀-ͯ]/g,'');
    return s.replace(/œ/g,'oe').replace(/æ/g,'ae').replace(/[^a-z0-9]/g,'');
  }
  /* banque d'un thème : entrées {name, forms:[formes normalisées]} et index forme -> entrée */
  var BANKS={};
  THEMES.forEach(function(t){
    var seen={}, entries=[], idx={};
    t[3].split('|').forEach(function(name){
      var n=norm(name); if(!n || seen[n]) return; seen[n]=1;
      var forms=[n].concat(((t[4]||{})[name]||[]).map(norm)).filter(function(f,i,a){ return f && a.indexOf(f)===i; });
      var e={name:name, forms:forms, id:entries.length};
      entries.push(e);
      forms.forEach(function(f){ if(!idx.hasOwnProperty(f)) idx[f]=e.id; });
    });
    BANKS[t[0]]={key:t[0], label:t[1], icon:t[2], entries:entries, idx:idx};
  });
  function themeOf(k){ return BANKS[k]||BANKS.pays; }
  /* nombre de mots encore libres qui commencent par la lettre */
  function availFor(bank, used, letter){
    var n=0;
    bank.entries.forEach(function(e){ if(!used[e.id] && e.forms.some(function(f){ return f[0]===letter; })) n++; });
    return n;
  }
  function pickLetter(bank, used, min){
    var counts={};
    bank.entries.forEach(function(e){
      if(used[e.id]) return;
      e.forms.forEach(function(f){ counts[f[0]]=(counts[f[0]]||0)+1; });
    });
    var good=Object.keys(counts).filter(function(l){ return counts[l]>=(min||1); });
    if(!good.length) good=Object.keys(counts);
    return good.length ? good[Math.floor(Math.random()*good.length)] : '';
  }
  /* vérifie un mot : {ok, entry, form} ou {why} */
  function check(bank, used, letter, text){
    var f=norm(text);
    if(!f) return {why:'empty'};
    if(!bank.idx.hasOwnProperty(f)) return {why:'unknown'};
    if(letter && f[0]!==letter) return {why:'letter'};
    var e=bank.entries[bank.idx[f]];
    if(used[e.id]) return {why:'used', entry:e};
    return {ok:true, entry:e, form:f};
  }

  /* hôte : état qui fait foi */
  var cs={players:[], scores:[], connected:[], clientIds:[], phase:'lobby', started:false,
          theme:'hasard', turnMs:5000, manches:3, manche:0, bankKey:'pays',
          order:[], alive:{}, cur:-1, letter:'', used:{}, chain:[], out:[], note:'', words:{},
          deadline:0, timer:null, lastState:null};
  var netRole=null, mySeat=0, myName='', roomCode='', liveForLobby=false;
  var view={state:null, turnKey:''};
  var bar=CG.timerBar('chnTimerFill','chnTimerText');

  var ui=CG.roomUI('chn', {route:'chaine', code:function(){ return roomCode; },
    onLostBack:function(){ cleanup(); ui.goto('online'); }});
  var seats=CG.seatTools(cs), isConnected=seats.isConnected, activeCount=seats.activeCount;
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

  function clearTimers(){ clearTimeout(cs.timer); cs.timer=null; }
  function cleanup(){
    net.close(netRole==='host' ? {type:'room_closed'} : null);
    clearTimers(); bar.stop();
    netRole=null; mySeat=0; roomCode=''; liveForLobby=false; view.state=null; view.turnKey='';
    cs.players=[]; cs.scores=[]; cs.connected=[]; cs.clientIds=[]; cs.phase='lobby'; cs.started=false; cs.lastState=null;
    $('chnRoundBadge').style.display='none';
    ui.hideBanner(); ui.setStatus('offline','HORS LIGNE');
  }
  function isLive(){ return cs.phase==='turn' || cs.phase==='between'; }
  function pname(s){ var p=cs.players[s]; return p?p.name:'?'; }
  function pcolor(s){ return COLORS[s%COLORS.length]; }

  /* ===================== CRÉER / REJOINDRE ===================== */
  function wireToggle(id, attr, set){
    var btns=$(id).querySelectorAll('button');
    for(var i=0;i<btns.length;i++) btns[i].addEventListener('click', function(){
      for(var j=0;j<btns.length;j++) btns[j].classList.remove('active');
      this.classList.add('active'); set(this.getAttribute(attr)); sfxToggle();
    });
  }
  wireToggle('chnThemeToggle','data-theme', function(v){ cs.theme=v; });
  wireToggle('chnSpeedToggle','data-ms', function(v){ cs.turnMs=parseInt(v,10)||5000; });
  wireToggle('chnMancheToggle','data-manches', function(v){ cs.manches=parseInt(v,10)||3; });
  $('chnCreateRoomBtn').addEventListener('click',function(){
    var wanted=CG.readRoomCode('chnHostCode');
    if(!wanted){ sfxToggle(); return; }
    myName=$('chnName').value.trim()||'Joueur';
    var keep={theme:cs.theme, turnMs:cs.turnMs, manches:cs.manches};
    cleanup(); cs.theme=keep.theme; cs.turnMs=keep.turnMs; cs.manches=keep.manches;
    net.host(function(code){
      netRole='host'; mySeat=0; roomCode=code;
      cs.players=[{name:myName}]; cs.scores=[0]; cs.connected=[true]; cs.clientIds=[net.clientId];
      try{ history.replaceState(null,'','#chaine?room='+code); }catch(e){}
      $('chnCodeDisplay').textContent=code;
      renderLobby(); ui.goto('lobby');
    }, wanted);
    sfxToggle();
  });
  $('chnJoinCode').addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); $('chnJoinRoomBtn').click(); } });
  $('chnJoinRoomBtn').addEventListener('click',function(){
    myName=$('chnName').value.trim()||'Joueur';
    var code=CG.cleanRoomCode($('chnJoinCode').value);
    if(!code){ shake($('chnJoinCode')); return; }
    cleanup(); netRole='guest';
    net.join(code, {name:myName});
    sfxToggle();
  });
  $('chnBackFromLobby').addEventListener('click',function(){ sfxToggle(); cleanup(); ui.goto('online'); });
  $('chnHubReturnBtn').addEventListener('click',function(){ sfxToggle(); location.hash='hub'; });
  CG.wireModal('chnRulesModal','chnRulesBtn');

  /* ===================== HÔTE ===================== */
  function hostOnJoinRequest(msg){
    var back=seats.returningSeat(msg); if(back) return back;
    if(activeCount()>=MAX_PLAYERS) return 'SALLE COMPLÈTE ('+MAX_PLAYERS+'/'+MAX_PLAYERS+')';
    for(var s=1;s<cs.players.length;s++) if(!cs.players[s]) return s;
    return Math.max(1, cs.players.length);
  }
  function hostOnSeatJoined(seat, msg, isRepeat){
    var p=cs.players[seat];
    if(p){ if(msg.name) p.name=msg.name; }
    else { cs.players[seat]={name:msg.name||'Joueur'}; cs.scores[seat]=0; }
    cs.clientIds[seat]=msg.clientId||null; cs.connected[seat]=true;
    net.sendTo(seat, {type:'seat_assigned', seat:seat, players:cs.players.slice(), scores:cs.scores.slice(), connected:cs.connected.slice(), live:isLive()});
    if(cs.phase!=='lobby' && cs.lastState) net.sendTo(seat, stateMsg());
    hostBroadcastLobby();
    if(!isRepeat) sfxValidate();
  }
  function hostOnSeatLost(seat){
    if(!cs.started){ cs.players[seat]=null; cs.clientIds[seat]=null; }
    else cs.connected[seat]=false;
    hostBroadcastLobby();
    /* déconnecté pendant son tour : éliminé, on passe au suivant */
    if(cs.phase==='turn' && cs.cur===seat) hostEliminate(seat, 'gone');
  }
  function hostOnGuestMessage(seat, msg){ if(msg.type==='word') hostWord(seat, msg.text); }
  function hostBroadcastLobby(){
    broadcast({type:'lobby_update', players:cs.players.slice(), scores:cs.scores.slice(), connected:cs.connected.slice(), live:isLive()});
  }
  function stateMsg(){
    var bank=themeOf(cs.bankKey);
    return {type:'c_state', phase:cs.phase, manche:cs.manche, manches:cs.manches, theme:bank.key, themeLabel:bank.label, themeIcon:bank.icon,
      letter:cs.letter, cur:cs.cur, order:cs.order.slice(), alive:cs.alive, chain:cs.chain.slice(-14), chainLen:cs.chain.length,
      out:cs.out.slice(), note:cs.note, ms:Math.max(0, cs.deadline-Date.now()-GRACE_MS), total:cs.turnMs,
      scores:cs.scores.slice(), players:cs.players.slice(), words:cs.words, turnId:cs.chain.length+':'+cs.cur+':'+cs.manche};
  }
  function hostPush(){ cs.lastState=stateMsg(); broadcast(cs.lastState); }
  $('chnStartBtn').addEventListener('click',function(){ sfxValidate(); hostStartGame(); });
  $('chnReplayBtn').addEventListener('click',function(){ sfxValidate(); hostStartGame(); });
  function hostStartGame(){
    if(activeCount()<MIN_PLAYERS) return;
    for(var s=1;s<cs.players.length;s++) if(cs.players[s] && !isConnected(s)){ cs.players[s]=null; cs.clientIds[s]=null; }
    cs.scores=cs.players.map(function(){ return 0; });
    cs.started=true; cs.manche=0;
    hostStartManche();
  }
  function hostStartManche(){
    clearTimers();
    cs.manche++;
    if(cs.theme==='hasard'){
      var keys=Object.keys(BANKS).filter(function(k){ return k!==cs.bankKey; });
      cs.bankKey=keys[Math.floor(Math.random()*keys.length)];
    } else cs.bankKey=cs.theme;
    var bank=themeOf(cs.bankKey);
    cs.order=shuffle(cs.players.map(function(p,s){ return s; }).filter(function(s){ return cs.players[s] && isConnected(s); }));
    cs.alive={}; cs.order.forEach(function(s){ cs.alive[s]=true; });
    cs.used={}; cs.chain=[]; cs.out=[]; cs.words={};
    cs.letter=pickLetter(bank, cs.used, 4);
    cs.note='Première lettre : '+cs.letter.toUpperCase();
    cs.cur=-1;
    hostNextTurn();
  }
  function aliveList(){ return cs.order.filter(function(s){ return cs.alive[s]; }); }
  function hostNextTurn(){
    clearTimers();
    var alive=aliveList();
    if(alive.length<=1){ hostEndManche(); return; }
    /* joueur suivant dans l'ordre, encore en vie */
    var i=cs.order.indexOf(cs.cur), next=-1;
    for(var k=1;k<=cs.order.length;k++){ var s=cs.order[(i+k+cs.order.length)%cs.order.length]; if(cs.alive[s]){ next=s; break; } }
    cs.cur=next;
    /* plus aucun mot libre avec cette lettre : on en change */
    var bank=themeOf(cs.bankKey);
    if(!availFor(bank, cs.used, cs.letter)){
      var old=cs.letter, l=pickLetter(bank, cs.used, 1);
      if(!l){ cs.note='Plus aucun mot dans ce thème !'; hostEndManche(); return; }
      cs.letter=l;
      cs.note='Plus de mot en '+old.toUpperCase()+' → nouvelle lettre : '+l.toUpperCase();
    }
    cs.phase='turn';
    cs.deadline=Date.now()+cs.turnMs+GRACE_MS;
    cs.timer=setTimeout(function(){ if(cs.phase==='turn') hostEliminate(cs.cur, 'slow'); }, cs.turnMs+GRACE_MS);
    hostPush();
  }
  function hostWord(seat, text){
    if(cs.phase!=='turn' || seat!==cs.cur || !cs.alive[seat]) return;
    text=String(text||'').slice(0,60);
    var bank=themeOf(cs.bankKey), r=check(bank, cs.used, cs.letter, text);
    if(r.why==='used'){ cs.chain.push({seat:seat, word:r.entry.name, bad:true}); hostEliminate(seat, 'used', r.entry.name); return; }
    if(!r.ok){ sendToSeat(seat, {type:'c_bad', why:r.why, text:text, letter:cs.letter}); return; }
    cs.used[r.entry.id]=true;
    cs.chain.push({seat:seat, word:r.entry.name});
    cs.words[seat]=(cs.words[seat]||0)+1;
    cs.letter=r.form[r.form.length-1];
    cs.note='';
    hostNextTurn();
  }
  function hostEliminate(seat, why, word){
    if(!cs.alive[seat]) return;
    clearTimers();
    cs.alive[seat]=false;
    var pts=cs.out.length;                       /* nombre de joueurs déjà éliminés avant lui */
    cs.scores[seat]=(cs.scores[seat]||0)+pts;
    cs.out.push({seat:seat, why:why, word:word||'', pts:pts});
    var txt={slow:'trop lent ⏰', used:'« '+(word||'')+' » déjà dit 🔁', gone:'parti 📡'}[why]||'éliminé';
    cs.note='💥 '+pname(seat)+' est éliminé(e) : '+txt;
    hostNextTurn();
  }
  function hostEndManche(){
    clearTimers();
    var alive=aliveList();
    alive.forEach(function(s){
      var pts=cs.out.length+1;                   /* le dernier debout : tous les éliminés + 1 */
      cs.scores[s]=(cs.scores[s]||0)+pts;
      cs.out.push({seat:s, why:'win', pts:pts});
    });
    cs.cur=-1;
    if(cs.manche>=cs.manches){ hostOver(); return; }
    cs.phase='between';
    cs.deadline=Date.now()+BETWEEN_MS;
    hostPush();
    cs.timer=setTimeout(hostStartManche, BETWEEN_MS);
  }
  function hostOver(){
    clearTimers();
    cs.phase='over';
    hostPush();
    hostBroadcastLobby();
    if(CG.partyEnd) CG.partyEnd(cs.players, cs.scores);
  }
  function onPromote(info){
    netRole='host'; mySeat=0; roomCode=net.code;
    CG.promoteSeats(cs, info);
    clearTimers(); bar.stop();
    cs.started=true; cs.phase='over'; cs.lastState=null; view.state=null;
    $('chnCodeDisplay').textContent=roomCode;
    ui.hideBanner(); hostBroadcastLobby(); renderLobby(); ui.goto('lobby');
    $('chnLobbyStatus').textContent=CG.PROMOTED_TEXT;
  }

  /* ===================== MESSAGES ===================== */
  function handleMsg(msg){
    if(!msg || !msg.type) return;
    switch(msg.type){
      case 'room_full': ui.setStatus('error', msg.reason||'SALLE COMPLÈTE'); break;
      case 'seat_assigned':
        mySeat=msg.seat; roomCode=net.code;
        cs.players=msg.players.slice(); cs.scores=(msg.scores||[]).slice(); cs.connected=(msg.connected||[]).slice();
        liveForLobby=!!msg.live;
        $('chnCodeDisplay').textContent=roomCode;
        renderLobby(); ui.goto('lobby');
        break;
      case 'lobby_update':
        cs.players=msg.players.slice(); cs.connected=msg.connected.slice();
        if(netRole!=='host') cs.scores=msg.scores.slice();
        liveForLobby=!!msg.live;
        renderLobby();
        if(view.state && view.state.phase!=='over') renderPlayers(view.state);
        break;
      case 'c_state': onState(msg); break;
      case 'c_bad': onBad(msg); break;
      case 'room_closed': net.close(); ui.showLost("L'hôte a fermé la salle."); break;
    }
  }

  /* ===================== AFFICHAGE ===================== */
  function row(s, extra){
    var p=cs.players[s]||{name:'?'};
    return CG.playerRow({name:p.name, color:pcolor(s), me:s===mySeat, off:!isConnected(s), extra:extra});
  }
  function renderLobby(){
    var html='';
    cs.players.forEach(function(p,s){ if(p) html+=row(s, '<span class="cham-vote-count">'+(cs.scores[s]||0)+' pts</span>'); });
    $('chnPlayerList').innerHTML=html;
    var n=activeCount(), live = netRole==='host' ? isLive() : liveForLobby, st=$('chnLobbyStatus');
    if(live) st.textContent='Une partie est en cours — tu joues dès la prochaine manche.';
    else if(n<MIN_PLAYERS) st.textContent=n+' joueur(s) — '+MIN_PLAYERS+' minimum pour lancer.';
    else st.textContent = netRole==='host' ? n+' joueurs prêts. Lance la partie !' : n+" joueurs prêts. En attente que l'hôte lance la partie...";
    $('chnStartBtn').style.display = (netRole==='host' && n>=MIN_PLAYERS && !live) ? 'inline-block' : 'none';
  }
  function onState(m){
    var prev=view.state; view.state=m;
    if(m.players) cs.players=m.players.slice();
    if(m.scores) cs.scores=m.scores.slice();
    if(m.phase==='over'){ onOver(m); return; }
    $('chnRoundBadge').textContent='MANCHE '+m.manche+' / '+m.manches;
    $('chnRoundBadge').style.display='inline-block';
    $('chnTheme').textContent=m.themeIcon+' '+m.themeLabel;
    var chain='';
    m.chain.forEach(function(c,i){
      chain+='<span class="chn-word'+(c.bad?' bad':'')+(i===m.chain.length-1?' last':'')+'" style="border-color:'+CG.safeColor(pcolor(c.seat))+'">'+escapeHtml(c.word)+'</span>';
    });
    if(m.chainLen>m.chain.length) chain='<span class="chn-more">… '+(m.chainLen-m.chain.length)+' mots</span>'+chain;
    $('chnChain').innerHTML=chain || '<span class="chn-more">La chaîne commence !</span>';
    $('chnNote').textContent=m.note||'';
    var myTurn = m.phase==='turn' && m.cur===mySeat, imOut = m.alive.hasOwnProperty(mySeat) && !m.alive[mySeat];
    if(m.phase==='turn'){
      $('chnLetter').innerHTML='Lettre : <b>'+escapeHtml(m.letter.toUpperCase())+'</b>';
      $('chnTurn').textContent = myTurn ? '👉 À TOI !' : 'Au tour de '+(m.players[m.cur]?m.players[m.cur].name:'?');
      $('chnTurn').className='chn-turn'+(myTurn?' me':'');
      bar.start(m.ms, m.total);
      if(view.turnKey!==m.turnId){
        view.turnKey=m.turnId;
        if(myTurn){ CG.yourTurn(); CG.buzz && CG.buzz([60]); $('chnInput').value=''; }
      }
      if(prev && prev.out.length<m.out.length) sfxReveal(0);
    } else {
      bar.stop();
      var w=m.out.filter(function(o){ return o.why==='win'; }).map(function(o){ return m.players[o.seat] ? m.players[o.seat].name : '?'; });
      $('chnLetter').innerHTML = w.length ? '🏆 <b>'+escapeHtml(w.join(' & '))+'</b> gagne la manche !' : 'Fin de la manche';
      $('chnTurn').textContent='Manche suivante dans quelques secondes…';
      $('chnTurn').className='chn-turn';
      $('chnTimerText').textContent='';
      $('chnTimerFill').style.width='0%';
      if(!prev || prev.phase!=='between') sfxReveal(w.length && m.out.some(function(o){ return o.why==='win' && o.seat===mySeat; }) ? 100 : 40);
    }
    /* la zone de saisie reste ouverte (le clavier du téléphone ne se ferme pas) */
    $('chnInputBox').classList.toggle('waiting', !myTurn);
    $('chnInput').placeholder = imOut ? 'Éliminé(e)… regarde les autres 👀' : myTurn ? 'Un mot en « '+m.letter.toUpperCase()+' » !' : 'Prépare ton mot…';
    renderPlayers(m);
    if(!document.querySelector('#chn-screen-play.active')){
      ui.goto('play');
      setTimeout(function(){ try{ $('chnInput').focus(); }catch(e){} }, 300);
    } else if(myTurn){ try{ $('chnInput').focus(); }catch(e){} }
  }
  function renderPlayers(m){
    var html='', outBy={};
    m.out.forEach(function(o,i){ outBy[o.seat]=o; });
    m.order.forEach(function(s){
      if(!cs.players[s]) return;
      var o=outBy[s], tag;
      if(o && o.why==='win') tag='🏆';
      else if(o) tag='💥 '+(o.why==='slow'?'trop lent':o.why==='used'?'déjà dit':'parti');
      else if(m.phase==='turn' && m.cur===s) tag='✍️';
      else tag='✅';
      html+=row(s, '<span class="cham-vote-count">'+tag+' · '+(m.words[s]||0)+' mot'+((m.words[s]||0)>1?'s':'')+' · '+(m.scores[s]||0)+' pts</span>');
    });
    $('chnPlayers').innerHTML=html;
  }
  function onBad(msg){
    shake($('chnInput'));
    var t={unknown:'« '+msg.text+' » : pas dans le thème (ou mal écrit)', letter:'« '+msg.text+' » ne commence pas par '+String(msg.letter||'').toUpperCase(), empty:'Tape un mot !'}[msg.why]||'Refusé';
    $('chnNote').textContent='❌ '+t+' — réessaie !';
  }
  function submit(){
    var inp=$('chnInput'), t=inp.value.trim(), m=view.state;
    if(!t || !m || m.phase!=='turn' || m.cur!==mySeat){ shake(inp); return; }
    inp.value='';
    if(netRole==='host') hostWord(0, t); else net.send({type:'word', text:t});
  }
  $('chnSendBtn').addEventListener('click', submit);
  $('chnInput').addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); submit(); } });
  function onOver(m){
    bar.stop();
    var order=[]; m.players.forEach(function(p,s){ if(p) order.push(s); });
    order.sort(function(a,b){ return (m.scores[b]||0)-(m.scores[a]||0); });
    var top=order.length ? m.scores[order[0]]||0 : 0;
    var winners=order.filter(function(s){ return (m.scores[s]||0)===top; });
    $('chnWinnerText').textContent = winners.map(function(s){ return m.players[s].name; }).join(' & ')+(winners.length>1?' L’EMPORTENT !':' L’EMPORTE !');
    var html='';
    order.forEach(function(s,i){
      html+='<div class="cls-podium-row'+(i===0?' first':'')+(s===mySeat?' me':'')+'"><span class="cls-pos">'+(winners.indexOf(s)!==-1?'👑':(i+1))+'</span>'+CG.playerDot(pcolor(s))+
        '<span class="cls-slot-name">'+escapeHtml(m.players[s].name)+(s===mySeat?' (toi)':'')+'</span><span class="cham-vote-count">'+(m.scores[s]||0)+' pts</span></div>';
    });
    $('chnFinalList').innerHTML=html;
    $('chnReplayBtn').style.display = netRole==='host' ? 'inline-block' : 'none';
    $('chnOverWait').style.display = netRole==='host' ? 'none' : 'inline-block';
    $('chnRoundBadge').style.display='none';
    sfxReveal(winners.indexOf(mySeat)!==-1 ? 100 : 50);
    if(CG.account) CG.account.recordRanked('chaine', m.scores, order, mySeat);
    if(CG.achieve && winners.indexOf(mySeat)!==-1 && order.length>=2) CG.achieve('chn_win');
    ui.goto('over');
  }

  CG.chaine={
    reset:function(){ if(netRole) cleanup(); closeModal('chnDisconnectModal'); ui.goto('online'); },
    enterJoinFlow:function(code){ ui.goto('online'); $('chnJoinCode').value=CG.cleanRoomCode(decodeURIComponent(code)); }
  };
  CG.lobbyChat(net, $('chnPlayerList'), 'chnName');
  /* exposé pour les tests */
  CG.chaine._norm=norm;
  CG.chaine._banks=BANKS;
  CG.chaine._check=function(theme, used, letter, text){ return check(themeOf(theme), used||{}, letter, text); };
  CG.chaine._state=function(){ return netRole==='host' ? cs : null; };
})();
