/* L'Imposteur des chiffres — bluff et déduction (3 à 8 joueurs en ligne).
   Tout le monde répond par un nombre à la même question, sauf l'imposteur
   qui a reçu une autre question sans le savoir. L'hôte fait autorité :
   il tire l'imposteur, collecte les réponses et les votes, compte les points. */
(function(){
  'use strict';
  var CG=window.CG;
  var $=CG.$, escapeHtml=CG.escapeHtml, shuffle=CG.shuffle, shake=CG.shake, openModal=CG.openModal, closeModal=CG.closeModal;
  var sfxToggle=CG.sfxToggle, sfxValidate=CG.sfxValidate, sfxReveal=CG.sfxReveal, copyText=CG.copyText;

  var IMP_ROOM_PREFIX = 'p5imposteur-';
  var IMP_PALETTE = ['#E60012','#ffffff','#FFE600','#00e5ff','#ff6ec7','#ff9d2f','#7cff6e','#b388ff'];
  var IMP_OLD_BANK_KEY = 'imp_questions_v1';   /* ancien format : toute la banque */
  var IMP_CUSTOM_KEY = 'imp_custom_v2';        /* seulement les paires ajoutées par le joueur */
  /* [question de tout le monde, question de l'imposteur] : des réponses du
     même ordre de grandeur, pour que l'imposteur puisse se fondre dans la masse */
  var IMP_DEFAULT_BANK = [
    ["Combien de cafés bois-tu par semaine ?", "Combien de fois par semaine fais-tu du sport ?"],
    ["Combien de fois es-tu allé(e) au cinéma cette année ?", "Combien de livres as-tu lus cette année ?"],
    ["Sur 10, quel est ton niveau en cuisine ?", "Sur 10, quel est ton sens de l'orientation ?"],
    ["Combien de pays as-tu visités ?", "Combien de fois as-tu déménagé ?"],
    ["Combien d'amis proches as-tu ?", "Combien de groupes de discussion as-tu sur ton téléphone ?"],
    ["Combien de minutes mets-tu pour te préparer le matin ?", "Combien de minutes dure ta douche ?"],
    ["Combien d'euros dépenses-tu pour un cadeau d'anniversaire ?", "Combien d'euros dépenses-tu pour un repas au restaurant ?"],
    ["Combien de jeux vidéo possèdes-tu ?", "Combien de paires de chaussures possèdes-tu ?"],
    ["Sur 10, à quel point aimes-tu les films d'horreur ?", "Sur 10, à quel point as-tu peur du noir ?"],
    ["Combien de minutes dure ton trajet quotidien ?", "Combien de minutes peux-tu tenir sans regarder ton téléphone ?"],
    ["Combien de fois par mois manges-tu au fast-food ?", "Combien de fois par mois appelles-tu ta famille ?"],
    ["Sur 10, à quel point es-tu mauvais(e) perdant(e) ?", "Sur 10, à quel point es-tu bavard(e) ?"],
    ["Combien de séries regardes-tu en ce moment ?", "Combien de podcasts ou chaînes suis-tu régulièrement ?"],
    ["Combien de verres d'eau bois-tu par jour ?", "Combien de fois par jour te laves-tu les mains ?"],
    ["Combien d'heures as-tu joué aux jeux vidéo cette semaine ?", "Combien d'heures as-tu passées dehors cette semaine ?"],
    ["Combien de pompes peux-tu faire d'affilée ?", "Combien de mots connais-tu en japonais ?"],
    ["Sur 10, quelle est ta résistance au piment ?", "Sur 10, quel est ton niveau en danse ?"],
    ["Combien de personnes étaient à ton dernier anniversaire ?", "Combien de personnes as-tu dans ta famille proche ?"],
    ["Combien de fois par an vas-tu chez le coiffeur ?", "Combien de fois par an prends-tu le train ?"],
    ["Quel âge aimerais-tu avoir pour toujours ?", "À quel âge penses-tu être devenu(e) adulte ?"],
    ["Combien de fois appuies-tu sur « snooze » le matin ?", "Combien de fois par jour ouvres-tu le frigo ?"],
    ["Combien d'euros paierais-tu pour un bon concert ?", "Combien d'euros paierais-tu pour un jeu vidéo neuf ?"],
    ["Combien de minutes peux-tu attendre dans une file avant de partir ?", "Combien de minutes de retard tolères-tu chez un ami ?"],
    ["Sur 10, à quel point es-tu organisé(e) ?", "Sur 10, à quel point es-tu ponctuel(le) ?"],
    ["Combien de parts de pizza peux-tu manger en une soirée ?", "Combien de parts de gâteau peux-tu manger d'affilée ?"],
    ["Combien de kilomètres peux-tu courir sans t'arrêter ?", "Combien de kilomètres marches-tu par jour ?"],
    ["Combien d'applis as-tu sur la première page de ton téléphone ?", "Combien d'onglets as-tu ouverts sur ton navigateur ?"],
    ["Combien d'heures dors-tu par nuit ?", "Combien d'heures passes-tu sur ton téléphone par jour ?"],
    ["Sur 10, à quel point es-tu fan de Persona ?", "Sur 10, à quel point aimes-tu les animes ?"],
    ["Combien de fois as-tu pleuré devant un film ?", "Combien de fois as-tu ri aux éclats cette semaine ?"],
    /* Quotidien et maison */
    ["Combien de réveils mets-tu le matin ?", "Combien de fois par jour te brosses-tu les dents ?"],
    ["Combien de minutes passes-tu dans la salle de bain le matin ?", "Combien de minutes mets-tu à prendre ton petit-déjeuner ?"],
    ["Combien de paires de chaussettes possèdes-tu ?", "Combien de t-shirts possèdes-tu ?"],
    ["Combien de coussins as-tu chez toi ?", "Combien de plantes as-tu chez toi ?"],
    ["Combien de mugs ou de tasses as-tu dans ta cuisine ?", "Combien d'assiettes as-tu dans ta cuisine ?"],
    ["Combien de clés as-tu sur ton trousseau ?", "Combien de cartes as-tu dans ton portefeuille ?"],
    ["Combien de minutes mets-tu pour faire tes courses ?", "Combien de minutes mets-tu pour cuisiner un repas ?"],
    ["Combien de fois par semaine fais-tu une sieste ?", "Combien de fois par semaine fais-tu une grasse matinée ?"],
    ["Combien d'heures as-tu dormi la nuit dernière ?", "Combien d'heures as-tu travaillé ou étudié hier ?"],
    ["Combien de cafés ou thés as-tu bus aujourd'hui ?", "Combien de repas as-tu mangés aujourd'hui ?"],
    ["À quelle heure te lèves-tu le week-end ?", "À quelle heure te lèves-tu en semaine ?"],
    ["Quelle température fait-il dans ta chambre (en °C) ?", "Quelle température extérieure trouves-tu idéale (en °C) ?"],
    ["Combien de jours peux-tu porter le même jean sans le laver ?", "Combien de jours gardes-tu les mêmes draps ?"],
    ["Sur 10, à quel point ta chambre est-elle rangée en ce moment ?", "Sur 10, à quel point ton bureau est-il propre en ce moment ?"],
    ["Combien d'heures par semaine passes-tu dans les transports ?", "Combien d'heures par semaine passes-tu à cuisiner ?"],
    ["Combien d'étages montes-tu à pied par jour ?", "Combien de fois par jour prends-tu l'ascenseur ?"],
    /* Téléphone et écrans */
    ["Combien de messages envoies-tu par jour ?", "Combien de vidéos regardes-tu par jour sur les réseaux ?"],
    ["Combien de mots de passe différents utilises-tu ?", "Combien de comptes as-tu sur des sites ou des applis ?"],
    ["Combien de fois par jour déverrouilles-tu ton téléphone ?", "Combien de mails reçois-tu par jour ?"],
    ["Quel pourcentage de batterie as-tu en ce moment ?", "Quel pourcentage de ta journée passes-tu assis(e) ?"],
    ["Combien de personnes suis-tu sur Instagram ?", "Combien d'abonnés as-tu sur Instagram ?"],
    ["Combien d'heures de musique écoutes-tu par semaine ?", "Combien d'heures de télé ou de streaming regardes-tu par semaine ?"],
    ["Combien de fois par semaine postes-tu une story ?", "Combien de fois par semaine envoies-tu un message vocal ?"],
    ["Combien de conversations non lues as-tu en ce moment ?", "Combien de groupes de discussion as-tu mis en sourdine ?"],
    ["En quelle année as-tu eu ton premier téléphone ?", "En quelle année as-tu eu ta première console ?"],
    ["Combien de selfies prends-tu par semaine ?", "Combien de photos de nourriture prends-tu par semaine ?"],
    ["Combien de fois as-tu regardé la météo cette semaine ?", "Combien de fois as-tu ouvert ton appli bancaire cette semaine ?"],
    ["Combien de minutes passes-tu à choisir quoi regarder sur Netflix ?", "Combien de minutes passes-tu à choisir quoi manger au restaurant ?"],
    ["Combien de minutes mets-tu à répondre à un message de ta mère ?", "Combien de minutes mets-tu à répondre à un message de ton/ta meilleur(e) ami(e) ?"],
    ["Combien d'abonnements payants as-tu (Netflix, Spotify...) ?", "Combien de cartes de fidélité as-tu ?"],
    ["Combien de fois as-tu changé de téléphone en 5 ans ?", "Combien de fois as-tu changé de coupe de cheveux en 5 ans ?"],
    /* Nourriture et boissons */
    ["Combien de carrés de chocolat manges-tu d'affilée ?", "Combien de biscuits manges-tu d'affilée ?"],
    ["Combien de fois par semaine manges-tu des pâtes ?", "Combien de fois par semaine manges-tu de la viande ?"],
    ["Combien de sushis peux-tu manger en un repas ?", "Combien de nuggets peux-tu manger en un repas ?"],
    ["Combien d'œufs manges-tu par semaine ?", "Combien de fruits manges-tu par semaine ?"],
    ["Sur 10, à quel point aimes-tu le fromage ?", "Sur 10, à quel point aimes-tu le chocolat ?"],
    ["Combien d'euros dépenses-tu par semaine en nourriture ?", "Combien d'euros dépenses-tu par mois en sorties ?"],
    ["Combien de fois par mois commandes-tu à manger ?", "Combien de fois par mois vas-tu au restaurant ?"],
    ["Combien de verres de soda bois-tu par semaine ?", "Combien de bonbons manges-tu par semaine ?"],
    ["Combien de crêpes peux-tu manger d'affilée ?", "Combien de tranches de pain manges-tu par jour ?"],
    ["Combien de plats sais-tu cuisiner sans recette ?", "Combien de numéros de téléphone connais-tu par cœur ?"],
    ["Combien de minutes dure ton dîner ?", "Combien de minutes dure ta pause de midi ?"],
    ["Combien de hot-dogs pourrais-tu manger en 10 minutes ?", "Combien de verres d'eau pourrais-tu boire en 10 minutes ?"],
    ["Combien de pizzas commanderais-tu pour ce groupe ?", "Combien de bouteilles de soda prévoirais-tu pour ce groupe ?"],
    ["Combien coûte une baguette selon toi (en centimes) ?", "Combien coûte un café au comptoir selon toi (en centimes) ?"],
    /* Loisirs et culture */
    ["Combien de films as-tu vus le mois dernier ?", "Combien d'épisodes de série as-tu vus la semaine dernière ?"],
    ["Combien de concerts as-tu vus dans ta vie ?", "Combien de festivals ou de salons as-tu faits dans ta vie ?"],
    ["Combien de jeux de société possèdes-tu ?", "Combien de mugs possèdes-tu ?"],
    ["Combien d'heures as-tu joué à ton jeu vidéo préféré ?", "Combien d'épisodes compte ta série préférée ?"],
    ["Combien de fois as-tu vu ton film préféré ?", "Combien de fois as-tu relu ton livre ou ton manga préféré ?"],
    ["Combien de mangas ou de BD as-tu lus cette année ?", "Combien de jeux vidéo as-tu terminés cette année ?"],
    ["Sur 10, à quel point chantes-tu bien ?", "Sur 10, à quel point dessines-tu bien ?"],
    ["Combien d'instruments sais-tu jouer, même un peu ?", "Combien de langues parles-tu, même un peu ?"],
    ["Combien de fois es-tu allé(e) dans un parc d'attractions ?", "Combien de fois es-tu allé(e) au zoo ?"],
    ["Sur 10, à quel point aimes-tu le karaoké ?", "Sur 10, à quel point aimes-tu danser en soirée ?"],
    ["Combien de séries as-tu abandonnées en cours de route ?", "Combien de livres as-tu abandonnés en cours de route ?"],
    ["Combien de Pokémon peux-tu citer de tête ?", "Combien de footballeurs peux-tu citer de tête ?"],
    ["Combien de jours peux-tu tenir sans jeux vidéo ?", "Combien de jours peux-tu tenir sans sucre ?"],
    ["Combien de jeux vidéo as-tu achetés sans jamais y jouer ?", "Combien de vêtements as-tu achetés sans jamais les porter ?"],
    ["Combien d'heures par jour écoutes-tu de la musique ?", "Combien d'heures par jour passes-tu à discuter avec des gens ?"],
    ["Sur 10, à quel point es-tu fort(e) à Mario Kart ?", "Sur 10, à quel point es-tu fort(e) aux jeux de cartes ?"],
    /* Sport et corps */
    ["Combien de secondes peux-tu tenir en apnée ?", "Combien de secondes peux-tu tenir la planche ?"],
    ["Combien d'abdos peux-tu faire d'affilée ?", "Combien de squats peux-tu faire d'affilée ?"],
    ["Combien de minutes marches-tu par jour ?", "Combien de minutes passes-tu dehors par jour ?"],
    ["Combien de fois par mois vas-tu à la salle de sport ?", "Combien de fois par mois vas-tu à une soirée ?"],
    ["Combien de fois t'es-tu cassé un os ?", "Combien de fois as-tu eu des points de suture ?"],
    ["Combien de cicatrices as-tu ?", "Combien de grains de beauté as-tu sur les mains ?"],
    ["Combien de sports différents as-tu pratiqués en club ?", "Combien d'écoles différentes as-tu fréquentées ?"],
    ["Sur 10, à quel point es-tu sportif(ve) ?", "Sur 10, à quel point es-tu du matin ?"],
    ["Sur 100, combien de points de vie as-tu ce matin ?", "Sur 100, à combien est ta jauge de motivation aujourd'hui ?"],
    /* Vie et souvenirs */
    ["À combien de mariages as-tu assisté ?", "À combien d'anniversaires surprises as-tu participé ?"],
    ["Combien de cousins et cousines as-tu ?", "Combien de voisins connais-tu par leur prénom ?"],
    ["Combien de personnes as-tu appelées cette semaine ?", "Combien de personnes t'ont envoyé un message aujourd'hui ?"],
    ["Combien de personnes inviterais-tu à ton anniversaire ?", "Combien de personnes peuvent tenir dans ton salon ?"],
    ["À quel âge as-tu eu ton premier téléphone ?", "À quel âge as-tu commencé à avoir de l'argent de poche ?"],
    ["À quel âge as-tu appris à nager ?", "À quel âge as-tu appris à faire du vélo ?"],
    ["À quel âge aimerais-tu avoir ton premier enfant ?", "À quel âge aimerais-tu acheter ta maison ?"],
    ["À quel âge aimerais-tu prendre ta retraite ?", "À quel âge penses-tu qu'on devient vieux ?"],
    ["Combien d'amis as-tu gardés depuis le collège ?", "Combien d'amis as-tu rencontrés au travail ou à la fac ?"],
    ["Combien de fois as-tu été en retard ce mois-ci ?", "Combien de fois as-tu oublié quelque chose chez toi ce mois-ci ?"],
    ["Combien de fois as-tu menti cette semaine ?", "Combien de fois as-tu dit « désolé » aujourd'hui ?"],
    ["Combien de nuits par an dors-tu hors de chez toi ?", "Combien de jours de vacances prends-tu par an ?"],
    ["Combien de fois as-tu pris l'avion ?", "Combien de fois as-tu dormi sous une tente ?"],
    ["Dans combien de villes différentes as-tu habité ?", "Combien de jobs différents as-tu eus ?"],
    ["Combien de fois par an vas-tu chez le dentiste ?", "Combien de fois par an vas-tu chez le médecin ?"],
    ["Combien de fois as-tu failli rater un train ou un avion ?", "Combien de fois as-tu perdu tes clés ?"],
    ["Combien de fois t'es-tu endormi(e) devant un film ce mois-ci ?", "Combien de fois t'es-tu endormi(e) en cours ou au travail cette année ?"],
    ["Combien de fois par semaine te parles-tu à toi-même ?", "Combien de fois par semaine chantes-tu sous la douche ?"],
    ["Combien de fois as-tu vu la mer cette année ?", "Combien de fois as-tu vu la neige cette année ?"],
    ["Combien de fois as-tu pleuré cette année ?", "Combien de fois t'es-tu disputé(e) avec quelqu'un cette année ?"],
    ["Combien de rendez-vous amoureux as-tu eus cette année ?", "Combien de soirées as-tu faites ce mois-ci ?"],
    /* Personnalité (sur 10) */
    ["Sur 10, à quel point es-tu tête en l'air ?", "Sur 10, à quel point es-tu gourmand(e) ?"],
    ["Sur 10, à quel point es-tu frileux(se) ?", "Sur 10, à quel point es-tu maniaque du rangement ?"],
    ["Sur 10, à quel point supportes-tu les insectes ?", "Sur 10, à quel point aimes-tu les montagnes russes ?"],
    ["Sur 10, à quel point es-tu jaloux(se) ?", "Sur 10, à quel point es-tu rancunier(ère) ?"],
    ["Sur 10, à quel point crois-tu aux fantômes ?", "Sur 10, à quel point crois-tu à l'astrologie ?"],
    ["Sur 10, à quel point aimes-tu ton prénom ?", "Sur 10, à quel point aimes-tu ta ville ?"],
    ["Sur 10, quelle note donnes-tu à ta journée d'hier ?", "Sur 10, quelle note donnes-tu à ta dernière soirée ?"],
    ["Sur 10, à quel point as-tu le vertige ?", "Sur 10, à quel point as-tu peur des araignées ?"],
    ["Sur 10, à quel point es-tu patient(e) ?", "Sur 10, à quel point es-tu têtu(e) ?"],
    ["Sur 10, à quel point es-tu dépensier(ère) ?", "Sur 10, à quel point es-tu fan de shopping ?"],
    ["Sur 10, à quel point aimes-tu les chats ?", "Sur 10, à quel point aimes-tu les chiens ?"],
    ["Sur 10, à quel point es-tu drôle ?", "Sur 10, à quel point es-tu sociable ?"],
    ["Sur 10, à quel point es-tu stressé(e) en ce moment ?", "Sur 10, à quel point es-tu fatigué(e) en ce moment ?"],
    ["Sur 10, à quel point es-tu nostalgique ?", "Sur 10, à quel point es-tu romantique ?"],
    ["Sur 10, à quel point détestes-tu le lundi ?", "Sur 10, à quel point aimes-tu la pluie ?"],
    ["Sur 10, à quel point sais-tu garder un secret ?", "Sur 10, à quel point es-tu curieux(se) ?"],
    /* Pourcentages */
    ["En %, quelles sont tes chances de survie dans un film d'horreur ?", "En %, quelles sont tes chances de survie face à une apocalypse zombie ?"],
    ["En %, quelle part de ton argent mets-tu de côté ?", "En %, quelle part de ta journée passes-tu devant un écran ?"],
    ["En %, à quel point fais-tu confiance à la météo ?", "En %, à quel point fais-tu confiance à ton GPS ?"],
    /* Argent */
    ["Combien d'euros as-tu sur toi en ce moment ?", "Combien d'euros dépenses-tu en moyenne par jour ?"],
    ["Combien d'euros mettrais-tu dans une paire de baskets ?", "Combien d'euros mettrais-tu dans un manteau ?"],
    ["Combien d'euros mettrais-tu dans un téléphone ?", "Combien d'euros mettrais-tu dans un ordinateur ?"],
    ["Combien d'euros paierais-tu pour dîner avec ton idole ?", "Combien d'euros paierais-tu pour un week-end de rêve ?"],
    ["Combien d'euros faudrait-il te donner pour manger un insecte ?", "Combien d'euros faudrait-il te donner pour te raser la tête ?"],
    ["Combien d'euros faudrait-il te donner pour lâcher ton téléphone pendant un mois ?", "Combien d'euros faudrait-il te donner pour arrêter le sucre pendant un mois ?"],
    /* Et si... ? */
    ["Combien de jours pourrais-tu survivre seul(e) sur une île déserte ?", "Combien de jours pourrais-tu tenir sans internet ?"],
    ["Combien de joueurs de cette partie pourrais-tu battre au bras de fer ?", "Combien de joueurs de cette partie pourrais-tu battre à la course ?"],
    ["Combien de zombies pourrais-tu affronter avant d'être mordu(e) ?", "Combien de poulets en colère pourrais-tu affronter en même temps ?"],
    ["Combien d'heures pourrais-tu rester coincé(e) dans un ascenseur sans paniquer ?", "Combien d'heures pourrais-tu rester sans parler ?"],
    ["De combien d'années voudrais-tu remonter dans le temps ?", "De combien d'années voudrais-tu voyager dans le futur ?"],
    ["Combien d'enfants aimerais-tu avoir ?", "Combien d'animaux de compagnie aimerais-tu avoir ?"],
    ["Combien de pièces aurait ta maison de rêve ?", "Combien de voitures aurais-tu si tu étais milliardaire ?"],
    ["Combien de langues aimerais-tu parler couramment ?", "Combien de pays aimerais-tu visiter dans ta vie ?"],
    ["Combien de minutes faut-il pour t'énerver dans un bouchon ?", "Combien de minutes faut-il pour que tu t'ennuies en réunion ou en cours ?"]
  ];
  /* On ne sauvegarde que les paires personnalisées : avant, toute la banque
     était enregistrée et les nouvelles questions par défaut n'apparaissaient
     jamais chez ceux qui avaient ajouté une question. */
  function impLoadCustom(){
    var custom=[];
    try{
      var raw=localStorage.getItem(IMP_CUSTOM_KEY);
      if(raw){ var arr=JSON.parse(raw); if(Array.isArray(arr)) custom=arr; }
      else {
        var old=localStorage.getItem(IMP_OLD_BANK_KEY);
        if(old){
          var known={};
          IMP_DEFAULT_BANK.forEach(function(q){ known[q[0]]=true; });
          (JSON.parse(old)||[]).forEach(function(q){ if(Array.isArray(q) && q.length===2 && !known[q[0]]) custom.push(q); });
          localStorage.setItem(IMP_CUSTOM_KEY, JSON.stringify(custom));
          localStorage.removeItem(IMP_OLD_BANK_KEY);
        }
      }
    }catch(e){}
    return custom.filter(function(q){ return Array.isArray(q) && q.length===2 && q[0] && q[1]; });
  }
  var impCustom=impLoadCustom();
  function impSaveCustom(){
    try{ localStorage.setItem(IMP_CUSTOM_KEY, JSON.stringify(impCustom)); }catch(e){}
  }

  var impState = {
    players:[], scores:[], connected:[],
    bank: impCustom.concat(IMP_DEFAULT_BANK), pool:[],
    round:0, roundSeats:[],
    myQuestion:'', answers:{}, votes:{},
    /* host only */
    phase:'lobby',               /* 'lobby' | 'answering' | 'voting' | 'result' | 'lobby_wait' */
    question:'', imposterQuestion:'', imposterSeat:-1,
    clientIds:[], lastPhaseMsg:null
  };
  var impNetRole=null, impMySeat=0, impMyName='', impCurrentRoomCode='';
  var impGameStarted=false;     /* host: au moins une manche lancée */
  var impInRound=false;         /* ce joueur participe à la manche en cours */
  var impRoundLiveForLobby=false;
  var impMyVoteTarget=null;
  var impImposterTimer=null;
  var IMP_IMPOSTER_GRACE=30000;  /* délai laissé à l'imposteur déconnecté pour revenir */
  /* sans limite de temps, un joueur inactif bloquait la manche pour tout le monde */
  var IMP_ANSWER_MS=90000, IMP_VOTE_MS=60000;
  var impPhaseTimer=null, impDeadline=0;
  /* repli si un ancien common.js est encore en cache : le jeu doit se charger quand même */
  var timerBar=CG.timerBar||function(){ return {start:function(){}, stop:function(){}}; };
  var impAnswerBar=timerBar('impAnswerTimerFill','impAnswerTimerText');
  var impVoteBar=timerBar('impVoteTimerFill','impVoteTimerText');
  function impLeft(){ return Math.max(0, impDeadline-Date.now()); }

  /* ----- screens ----- */
  function impGoto_(name){
    var all=document.querySelectorAll('.imp-screen');
    for(var i=0;i<all.length;i++){ all[i].classList.remove('active'); }
    $('imp-screen-'+name).classList.add('active');
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function impSetNetStatus(cls,label){
    var el=$('impNetStatus');
    el.className='net-status '+cls;
    el.querySelector('.net-label').textContent=label;
  }
  function impRenderBankCount(){
    $('impBankCount').textContent=impState.bank.length+' paires de questions';
  }

  $('impRulesBtn').addEventListener('click',function(){ openModal('impRulesModal'); sfxToggle(); });
  $('impRulesModalClose').addEventListener('click',function(){ closeModal('impRulesModal'); });
  $('impRulesModal').addEventListener('click',function(e){ if(e.target===this) closeModal('impRulesModal'); });
  $('impHubReturnBtn').addEventListener('click',function(){ sfxToggle(); location.hash='hub'; });
  $('impBackFromLobby').addEventListener('click',function(){ sfxToggle(); impCleanupOnline(); impGoto_('online'); });

  $('impAddQBtn').addEventListener('click',function(){
    var q=$('impCustomQ').value.trim(), qi=$('impCustomQImp').value.trim();
    if(!q||!qi){ shake($('impCustomQ')); return; }
    impCustom.unshift([q,qi]);
    impState.bank.unshift([q,qi]);
    impSaveCustom();
    $('impCustomQ').value=''; $('impCustomQImp').value='';
    impRenderBankCount();
    sfxToggle();
  });

  /* ================= RÉSEAU ================= */
  var net = CG.createRoomNet({
    prefix: IMP_ROOM_PREFIX,
    onStatus: impSetNetStatus,
    onJoinRequest: impHostOnJoinRequest,
    onSeatJoined: impHostOnSeatJoined,
    onGuestMessage: impHostOnGuestMessage,
    onSeatLost: impHostOnSeatLost,
    onHostMessage: impHandleNetMessage,
    onReconnecting: function(){ impShowBanner('📡 Connexion perdue — reconnexion en cours...'); },
    onReconnected: function(){ impHideBanner(); },
    onLost: function(){ impShowLostModal("Impossible de rétablir la connexion avec l'hôte."); }
  });
  /* l'hôte traite une copie : l'affichage ne doit pas toucher l'état qui fait foi */
  function impBroadcast(msg){ impHandleNetMessage(JSON.parse(JSON.stringify(msg))); net.sendToAll(msg); }

  function impCleanupOnline(){
    net.close(impNetRole==='host' ? {type:'room_closed'} : null);
    impNetRole=null; impMySeat=0; impCurrentRoomCode='';
    impGameStarted=false; impInRound=false; impRoundLiveForLobby=false;
    impState.players=[]; impState.scores=[]; impState.connected=[]; impState.clientIds=[];
    impState.answers={}; impState.votes={}; impState.roundSeats=[]; impState.round=0;
    impState.phase='lobby'; impState.lastPhaseMsg=null;
    if(impImposterTimer){ clearTimeout(impImposterTimer); impImposterTimer=null; }
    clearTimeout(impPhaseTimer); impPhaseTimer=null;
    impAnswerBar.stop(); impVoteBar.stop();
    $('impRoundBadge').style.display='none';
    impHideBanner();
    impSetNetStatus('offline','HORS LIGNE');
  }

  function impShowBanner(text){
    $('impNetBannerText').textContent=text;
    $('impNetBanner').classList.add('open');
  }
  function impHideBanner(){ $('impNetBanner').classList.remove('open'); }
  function impRefreshBanner(){
    if(!impNetRole || !impInRound){ impHideBanner(); return; }
    var missing=[];
    impState.roundSeats.forEach(function(s){
      if(impState.players[s] && impState.connected[s]===false) missing.push(impState.players[s].name);
    });
    var live=$('imp-screen-answer').classList.contains('active') || $('imp-screen-vote').classList.contains('active');
    if(missing.length && live){
      impShowBanner('⚠ '+missing.join(', ')+(missing.length>1?' se sont déconnectés':" s'est déconnecté(e)")+' — la manche continue sans eux.');
    } else {
      impHideBanner();
    }
  }
  function impShowLostModal(text){
    impHideBanner();
    impSetNetStatus('offline','DÉCONNECTÉ');
    $('impDisconnectModalText').textContent=text;
    openModal('impDisconnectModal');
  }
  $('impDisconnectBackBtn').addEventListener('click',function(){
    closeModal('impDisconnectModal');
    impCleanupOnline();
    impGoto_('online');
  });

  function impIsConnected(seat){ return seat===0 || impState.connected[seat]!==false; }
  function impActiveCount(){
    var n=0;
    for(var s=0;s<impState.players.length;s++){ if(impState.players[s] && impIsConnected(s)) n++; }
    return n;
  }
  function impIsRoundLive(){ return impState.phase==='answering' || impState.phase==='voting'; }
  function impPickColor(){
    var used=impState.players.map(function(p){ return p?p.color:null; });
    for(var i=0;i<IMP_PALETTE.length;i++){ if(used.indexOf(IMP_PALETTE[i])===-1) return IMP_PALETTE[i]; }
    return IMP_PALETTE[Math.floor(Math.random()*IMP_PALETTE.length)];
  }

  /* ----- room creation (host) ----- */
  $('impCreateRoomBtn').addEventListener('click',function(){
    impMyName=$('impName').value.trim()||'Joueur';
    impCleanupOnline();
    net.host(function(code){
      impNetRole='host'; impMySeat=0;
      impCurrentRoomCode=code;
      impState.players=[{name:impMyName, color:IMP_PALETTE[0]}];
      impState.scores=[0];
      impState.connected=[true];
      impState.clientIds=[net.clientId];
      impState.phase='lobby';
      impState.pool=shuffle(impState.bank.slice());
      try{ history.replaceState(null,'','#imposteur?room='+code); }catch(e){}
      $('impCodeDisplay').textContent=code;
      impRenderLobby();
      impGoto_('lobby');
    });
    sfxToggle();
  });

  /* ----- host: seats ----- */
  function impHostOnJoinRequest(msg){
    for(var s=1;s<impState.clientIds.length;s++){
      if(msg.clientId && impState.clientIds[s]===msg.clientId && impState.players[s]) return s;
    }
    if(impActiveCount()>=8) return 'SALLE COMPLÈTE (8/8)';
    return Math.max(1, impState.players.length);
  }
  function impHostOnSeatJoined(seat, msg, isRepeat){
    var p=impState.players[seat];
    if(p){ if(msg.name) p.name=msg.name; }
    else {
      impState.players[seat]={name:msg.name||'Joueur', color:impPickColor()};
      impState.scores[seat]=0;
    }
    impState.clientIds[seat]=msg.clientId||null;
    impState.connected[seat]=true;
    net.sendTo(seat, {type:'seat_assigned', seat:seat, players:impState.players.slice(),
      scores:impState.scores.slice(), connected:impState.connected.slice(), inRound:impIsRoundLive()});
    if(impIsRoundLive() && impState.roundSeats.indexOf(seat)!==-1) impHostSendResync(seat);
    else if(impState.phase==='result' && impState.lastPhaseMsg) net.sendTo(seat, impState.lastPhaseMsg);
    impBroadcastLobby();
    if(!isRepeat) sfxValidate();
  }
  function impHostOnSeatLost(seat){
    if(!impGameStarted){
      impState.players[seat]=null;
      impState.clientIds[seat]=null;
      impBroadcastLobby();
      return;
    }
    impState.connected[seat]=false;
    impBroadcastLobby();
    if(!impIsRoundLive() || impState.roundSeats.indexOf(seat)===-1) return;
    if(impState.roundSeats.filter(impIsConnected).length<2){
      impBroadcast({type:'round_aborted', reason:'Trop de joueurs se sont déconnectés.'});
      return;
    }
    /* l'imposteur parti : on l'attend un peu, puis la manche est annulée
       (sinon il gagnerait des points sans être là) */
    if(seat===impState.imposterSeat){
      if(impImposterTimer) clearTimeout(impImposterTimer);
      impImposterTimer=setTimeout(function(){
        impImposterTimer=null;
        if(impIsRoundLive() && !impIsConnected(impState.imposterSeat)){
          impBroadcast({type:'round_aborted', reason:"l'imposteur a quitté la partie (aucun point attribué)."});
        }
      }, IMP_IMPOSTER_GRACE);
      return;
    }
    /* on n'attend pas les autres absents */
    if(impState.phase==='answering') impHostCheckAnswers();
    else if(impState.phase==='voting') impHostCheckVotes();
  }
  function impHostOnGuestMessage(seat, msg){
    if(msg.type==='answer_submit') impHostReceiveAnswer(seat, msg.value);
    else if(msg.type==='vote_cast') impHostReceiveVote(seat, msg.target);
  }
  function impBroadcastLobby(){
    net.sendToAll({type:'lobby_update', players:impState.players.slice(), scores:impState.scores.slice(),
      connected:impState.connected.slice(), inRound:impIsRoundLive()});
    impRenderLobby();
    impRefreshBanner();
  }
  /* Remet au bon écran un joueur revenu en cours de manche. */
  function impHostSendResync(seat){
    net.sendTo(seat, impRoundStartMsg(seat));
    if(impState.phase==='answering'){
      net.sendTo(seat, {type:'answer_status', answered:Object.keys(impState.answers).map(Number),
        mine: impState.answers.hasOwnProperty(seat) ? impState.answers[seat] : null});
    } else if(impState.phase==='voting'){
      var m=impState.lastPhaseMsg, copy={};
      for(var k in m) copy[k]=m[k];
      copy.ms=impLeft();
      copy.alreadyVoted=impState.votes.hasOwnProperty(seat);
      net.sendTo(seat, copy);
      net.sendTo(seat, {type:'vote_status', voted:Object.keys(impState.votes).map(Number)});
    }
  }

  /* ----- join (guest) ----- */
  $('impJoinCode').addEventListener('keydown',function(e){
    if(e.key==='Enter'){ e.preventDefault(); $('impJoinRoomBtn').click(); }
  });
  $('impJoinRoomBtn').addEventListener('click',function(){
    impMyName=$('impName').value.trim()||'Joueur';
    var code=$('impJoinCode').value.trim().toUpperCase();
    if(!code){ shake($('impJoinCode')); return; }
    impCleanupOnline();
    impNetRole='guest';
    net.join(code, {name:impMyName});
    sfxToggle();
  });
  $('impCopyCodeBtn').addEventListener('click',function(){ copyText(impCurrentRoomCode, $('impCopyCodeBtn')); });
  $('impCopyLinkBtn').addEventListener('click',function(){
    copyText(location.origin+location.pathname+'#imposteur?room='+impCurrentRoomCode, $('impCopyLinkBtn'));
  });

  /* ----- lobby ----- */
  function impPlayerRow(i, extra){
    var p=impState.players[i];
    var off=!impIsConnected(i);
    return '<div class="cham-player-row filled'+(off?' offline':'')+'"><span class="cham-player-dot" style="background:'+p.color+';"></span>'+
      '<span class="cham-player-name">'+escapeHtml(p.name)+(i===impMySeat?' (toi)':'')+(off?'<span class="imp-tag">déconnecté(e)</span>':'')+'</span>'+(extra||'')+'</div>';
  }
  function impRenderLobby(){
    var html='';
    for(var i=0;i<impState.players.length;i++){
      if(!impState.players[i]) continue;
      html+=impPlayerRow(i, '<span class="cham-vote-count">'+(impState.scores[i]||0)+' pts</span>');
    }
    $('impPlayerList').innerHTML=html;
    var count=impActiveCount();
    var live = impNetRole==='host' ? impIsRoundLive() : impRoundLiveForLobby;
    var statusEl=$('impLobbyStatus');
    if(live){
      statusEl.textContent='Une manche est en cours — tu joueras dès la prochaine.';
    } else if(count<3){
      statusEl.textContent=count+' joueur(s) connecté(s) — 3 minimum pour lancer la partie.';
    } else {
      statusEl.textContent = impNetRole==='host' ? (count+' joueurs prêts. Tu peux lancer la partie !') : (count+" joueurs prêts. En attente que l'hôte lance la partie...");
    }
    $('impStartBtn').style.display = (impNetRole==='host' && count>=3 && !live) ? 'inline-block' : 'none';
  }
  $('impStartBtn').addEventListener('click',function(){ sfxValidate(); impHostStartRound(); });
  $('impNextRoundBtn').addEventListener('click',function(){ sfxToggle(); impHostStartRound(); });

  /* ----- round flow (host authoritative) ----- */
  function impRoundStartMsg(seat){
    return {type:'round_start', round:impState.round, roundSeats:impState.roundSeats.slice(),
      question: seat===impState.imposterSeat ? impState.imposterQuestion : impState.question,
      ms: impState.phase==='answering' ? impLeft() : 0, total:IMP_ANSWER_MS};
  }
  function impHostStartRound(){
    var seats=[];
    for(var i=0;i<impState.players.length;i++){ if(impState.players[i] && impIsConnected(i)) seats.push(i); }
    if(seats.length<3){
      impState.phase='lobby_wait';
      if(impGameStarted) impBroadcast({type:'round_aborted', reason:'il faut 3 joueurs connectés pour continuer.'});
      else { impRenderLobby(); impGoto_('lobby'); }
      impSetNetStatus('error','3 JOUEURS CONNECTÉS MINIMUM');
      return;
    }
    impSetNetStatus('connected','PARTIE EN COURS');
    impGameStarted=true;
    if(impState.pool.length===0) impState.pool=shuffle(impState.bank.slice());
    var pair=impState.pool.pop();
    /* une fois sur deux on inverse la paire : impossible de deviner son rôle à la question */
    var flip=Math.random()<0.5;
    impState.question=flip?pair[1]:pair[0];
    impState.imposterQuestion=flip?pair[0]:pair[1];
    impState.imposterSeat=seats[Math.floor(Math.random()*seats.length)];
    impState.roundSeats=seats;
    impState.answers={}; impState.votes={};
    impState.round++;
    impState.lastPhaseMsg=null;
    impState.phase='answering';
    if(impImposterTimer){ clearTimeout(impImposterTimer); impImposterTimer=null; }
    impDeadline=Date.now()+IMP_ANSWER_MS;
    clearTimeout(impPhaseTimer);
    impPhaseTimer=setTimeout(function(){ if(impState.phase==='answering') impHostRevealAnswers(); }, IMP_ANSWER_MS+300);
    seats.forEach(function(s){
      var m=impRoundStartMsg(s);
      if(s===0) impHandleNetMessage(m); else net.sendTo(s, m);
    });
    impBroadcastLobby();
  }
  function impHostReceiveAnswer(seat, value){
    if(impState.phase!=='answering' || impState.roundSeats.indexOf(seat)===-1) return;
    if(impState.answers.hasOwnProperty(seat)) return;
    var v=parseFloat(value);
    if(!isFinite(v)) return;
    impState.answers[seat]=Math.round(v*100)/100;
    impBroadcast({type:'answer_status', answered:Object.keys(impState.answers).map(Number)});
    impHostCheckAnswers();
  }
  function impHostCheckAnswers(){
    if(impState.phase!=='answering') return;
    var pending=impState.roundSeats.filter(function(s){ return (impIsConnected(s) || s===impState.imposterSeat) && !impState.answers.hasOwnProperty(s); });
    if(pending.length) return;
    impHostRevealAnswers();
  }
  /* tout le monde a répondu, ou le temps est écoulé (réponses manquantes : —) */
  function impHostRevealAnswers(){
    impState.phase='voting';
    impDeadline=Date.now()+IMP_VOTE_MS;
    clearTimeout(impPhaseTimer);
    impPhaseTimer=setTimeout(function(){ if(impState.phase==='voting') impHostFinishRound(); }, IMP_VOTE_MS+300);
    var msg={type:'reveal_answers', question:impState.question, answers:impState.answers, roundSeats:impState.roundSeats.slice(),
      ms:IMP_VOTE_MS, total:IMP_VOTE_MS};
    impState.lastPhaseMsg=msg;
    impBroadcast(msg);
  }
  function impHostReceiveVote(seat, target){
    var rs=impState.roundSeats;
    if(impState.phase!=='voting' || rs.indexOf(seat)===-1 || rs.indexOf(target)===-1 || seat===target) return;
    if(impState.votes.hasOwnProperty(seat)) return;
    impState.votes[seat]=target;
    impBroadcast({type:'vote_status', voted:Object.keys(impState.votes).map(Number)});
    impHostCheckVotes();
  }
  function impHostCheckVotes(){
    if(impState.phase!=='voting') return;
    var pending=impState.roundSeats.filter(function(s){ return (impIsConnected(s) || s===impState.imposterSeat) && !impState.votes.hasOwnProperty(s); });
    if(pending.length) return;
    impHostFinishRound();
  }
  function impHostFinishRound(){
    clearTimeout(impPhaseTimer); impPhaseTimer=null;
    var tally={};
    impState.roundSeats.forEach(function(s){ tally[s]=0; });
    Object.keys(impState.votes).forEach(function(v){ var t=impState.votes[v]; if(tally.hasOwnProperty(t)) tally[t]++; });
    var max=-1, leaders=[];
    impState.roundSeats.forEach(function(s){
      if(tally[s]>max){ max=tally[s]; leaders=[s]; }
      else if(tally[s]===max){ leaders.push(s); }
    });
    /* démasqué seulement s'il est seul en tête des votes */
    var caught = leaders.length===1 && leaders[0]===impState.imposterSeat;
    var winners=[];
    if(caught){
      Object.keys(impState.votes).forEach(function(v){
        if(impState.votes[v]===impState.imposterSeat){ v=Number(v); winners.push(v); impState.scores[v]=(impState.scores[v]||0)+1; }
      });
    } else {
      winners.push(impState.imposterSeat);
      impState.scores[impState.imposterSeat]=(impState.scores[impState.imposterSeat]||0)+2;
    }
    impState.phase='result';
    var msg={type:'round_result', caught:caught, imposterSeat:impState.imposterSeat,
      question:impState.question, imposterQuestion:impState.imposterQuestion,
      answers:impState.answers, tally:tally, votes:impState.votes, winners:winners,
      leaders:leaders, scores:impState.scores.slice(), roundSeats:impState.roundSeats.slice()};
    impState.lastPhaseMsg=msg;
    impBroadcast(msg);
    impBroadcastLobby();
  }

  /* ----- incoming message dispatcher ----- */
  function impHandleNetMessage(msg){
    if(!msg || !msg.type) return;
    switch(msg.type){
      case 'room_full':
        impSetNetStatus('error', msg.reason||'SALLE COMPLÈTE (8/8)');
        break;
      case 'seat_assigned':
        impMySeat=msg.seat;
        impCurrentRoomCode=net.code;
        impState.players=msg.players.slice();
        impState.scores=(msg.scores||[]).slice();
        impState.connected=(msg.connected||[]).slice();
        impRoundLiveForLobby=!!msg.inRound;
        impInRound=false;
        $('impCodeDisplay').textContent=impCurrentRoomCode;
        impRenderLobby();
        impGoto_('lobby');
        break;
      case 'lobby_update':
        impState.players=msg.players.slice();
        if(msg.scores) impState.scores=msg.scores.slice();
        if(msg.connected) impState.connected=msg.connected.slice();
        impRoundLiveForLobby=!!msg.inRound;
        impRenderLobby();
        impRefreshBanner();
        break;
      case 'round_start':
        impInRound=true;
        impState.round=msg.round;
        impState.roundSeats=msg.roundSeats.slice();
        impState.myQuestion=msg.question;
        impState.answers={}; impState.votes={};
        impShowAnswerScreen(null);
        impAnswerBar.start(msg.ms||IMP_ANSWER_MS, msg.total||IMP_ANSWER_MS);
        break;
      case 'answer_status':
        if(!impInRound) break;
        if(msg.mine!==undefined && msg.mine!==null) impMarkAnswered(msg.mine);
        impRenderAnswerStatus(msg.answered);
        break;
      case 'reveal_answers':
        if(!impInRound) break;
        impState.answers=msg.answers;
        impAnswerBar.stop();
        impShowVoteScreen(msg, !!msg.alreadyVoted);
        impVoteBar.start(msg.ms||IMP_VOTE_MS, msg.total||IMP_VOTE_MS);
        break;
      case 'vote_status':
        if(!impInRound) break;
        impRenderVoteStatus(msg.voted);
        break;
      case 'round_result':
        if(msg.scores) impState.scores=msg.scores.slice();
        impShowResult(msg);
        break;
      case 'round_aborted':
        impInRound=false; impRoundLiveForLobby=false;
        impAnswerBar.stop(); impVoteBar.stop();
        if(impNetRole==='host'){ impState.phase='lobby_wait'; clearTimeout(impPhaseTimer); impPhaseTimer=null; }
        impRenderLobby();
        impGoto_('lobby');
        $('impLobbyStatus').textContent='⚠ Manche annulée : '+msg.reason;
        impHideBanner();
        break;
      case 'room_closed':
        net.close();
        impShowLostModal("L'hôte a fermé la salle.");
        break;
    }
  }

  /* ----- answer phase ----- */
  function impShowAnswerScreen(){
    $('impRoundBadge').textContent='MANCHE N°'+impState.round;
    $('impRoundBadge').style.display='inline-block';
    $('impMyQuestion').textContent=impState.myQuestion;
    $('impAnswerInput').value='';
    $('impAnswerInput').disabled=false;
    $('impAnswerBtn').disabled=false;
    $('impAnswerBox').style.display='block';
    impRenderAnswerStatus([]);
    impGoto_('answer');
    impRefreshBanner();
    setTimeout(function(){ try{ $('impAnswerInput').focus(); }catch(e){} }, 350);
  }
  function impMarkAnswered(value){
    $('impAnswerInput').value=value;
    $('impAnswerInput').disabled=true;
    $('impAnswerBtn').disabled=true;
    $('impAnswerBox').style.display='none';
  }
  function impRenderAnswerStatus(answered){
    var html='', n=0;
    impState.roundSeats.forEach(function(s){
      if(!impState.players[s]) return;
      var done=answered.indexOf(s)!==-1;
      if(done) n++;
      html+=impPlayerRow(s, '<span class="cham-vote-count">'+(done?'✅':'⏳')+'</span>');
    });
    $('impAnswerList').innerHTML=html;
    var mine=$('impAnswerBox').style.display==='none';
    $('impAnswerStatus').textContent=(mine?'Réponse envoyée. ':'')+n+' / '+impState.roundSeats.length+' réponses reçues';
  }
  $('impAnswerInput').addEventListener('keydown',function(e){
    if(e.key==='Enter'){ e.preventDefault(); $('impAnswerBtn').click(); }
  });
  $('impAnswerBtn').addEventListener('click',function(){
    var raw=$('impAnswerInput').value.replace(',','.').trim();
    var v=parseFloat(raw);
    if(raw==='' || !isFinite(v)){ shake($('impAnswerInput')); return; }
    sfxValidate();
    impMarkAnswered(v);
    if(impNetRole==='host') impHostReceiveAnswer(0, v);
    else net.send({type:'answer_submit', value:v});
    $('impAnswerStatus').textContent='Réponse envoyée. En attente des autres...';
  });

  /* ----- reveal & vote ----- */
  function impFormat(v){ return String(v).replace('.',','); }
  /* Ligne graduée : les réponses placées entre la plus petite et la plus grande. */
  function impRenderLine(el, answers, seats, highlightSeat){
    var vals=seats.filter(function(s){ return answers.hasOwnProperty(s); });
    if(!vals.length){ el.innerHTML=''; return; }
    var min=Infinity, max=-Infinity;
    vals.forEach(function(s){ min=Math.min(min,answers[s]); max=Math.max(max,answers[s]); });
    var span=(max-min)||1;
    vals.sort(function(a,b){ return answers[a]-answers[b]; });
    var html='';
    vals.forEach(function(s,i){
      var p=impState.players[s]||{name:'?',color:'#888'};
      var left=(max===min)?50:((answers[s]-min)/span*100);
      html+='<div class="imp-line-dot" style="left:'+left+'%;background:'+p.color+';'+(s===highlightSeat?'box-shadow:0 0 0 3px var(--red-bright);':'')+'"></div>';
      /* seulement la valeur : la liste en dessous associe couleur, nom et réponse */
      html+='<div class="imp-line-label'+(i%2?' low':'')+'" style="left:'+left+'%;color:'+p.color+';" title="'+escapeHtml(p.name)+'">'+impFormat(answers[s])+'</div>';
    });
    el.innerHTML=html;
  }
  function impShowVoteScreen(msg, alreadyVoted){
    $('impRealQuestion').textContent=msg.question;
    impRenderLine($('impVoteLine'), msg.answers, msg.roundSeats, -1);
    impMyVoteTarget = alreadyVoted ? -1 : null;
    var seats=msg.roundSeats.slice().sort(function(a,b){
      var va=msg.answers.hasOwnProperty(a)?msg.answers[a]:Infinity, vb=msg.answers.hasOwnProperty(b)?msg.answers[b]:Infinity;
      return va-vb;
    });
    var html='';
    seats.forEach(function(s){
      if(!impState.players[s]) return;
      var val=msg.answers.hasOwnProperty(s)?impFormat(msg.answers[s]):'—';
      var btn = s===impMySeat ? '<span class="imp-tag">toi</span>' : '<button class="cham-vote-btn" data-seat="'+s+'"'+(alreadyVoted?' disabled':'')+'><span>Accuser</span></button>';
      html+=impPlayerRow(s, '<span class="imp-answer-value">'+val+'</span>'+btn);
    });
    $('impVoteList').innerHTML=html;
    var btns=$('impVoteList').querySelectorAll('.cham-vote-btn');
    for(var k=0;k<btns.length;k++){
      btns[k].addEventListener('click', function(){
        if(impMyVoteTarget!==null) return;
        impMyVoteTarget=parseInt(this.getAttribute('data-seat'),10);
        this.classList.add('voted');
        for(var j=0;j<btns.length;j++) btns[j].disabled=true;
        if(impNetRole==='host') impHostReceiveVote(0, impMyVoteTarget);
        else net.send({type:'vote_cast', target:impMyVoteTarget});
        sfxValidate();
      });
    }
    impRenderVoteStatus([]);
    impGoto_('vote');
    impRefreshBanner();
  }
  function impRenderVoteStatus(voted){
    var n=voted.length, total=impState.roundSeats.length;
    var mine = impMyVoteTarget!==null;
    $('impVoteStatus').textContent=(mine?'Vote envoyé. ':'')+n+' / '+total+' votes';
  }

  /* ----- result ----- */
  function impShowResult(msg){
    impInRound=false;
    impAnswerBar.stop(); impVoteBar.stop();
    var imp=impState.players[msg.imposterSeat]||{name:'?'};
    var banner=$('impResultBanner');
    banner.textContent = msg.caught ? '🎯 IMPOSTEUR DÉMASQUÉ !' : "🕵️ L'IMPOSTEUR S'ÉCHAPPE !";
    banner.className='cham-result-banner '+(msg.caught?'b-perfect':'b-fail');
    var who = msg.imposterSeat===impMySeat ? 'C’était <b>toi</b> !' : 'C’était <b>'+escapeHtml(imp.name)+'</b>.';
    $('impResultText').innerHTML = who+'<br>Question de tous : « '+escapeHtml(msg.question)+' »<br>'+
      'Question de l’imposteur : « '+escapeHtml(msg.imposterQuestion)+' » — réponse : <b>'+
      (msg.answers.hasOwnProperty(msg.imposterSeat)?impFormat(msg.answers[msg.imposterSeat]):'—')+'</b>';
    impRenderLine($('impResultLine'), msg.answers, msg.roundSeats, msg.imposterSeat);

    var html='';
    for(var i=0;i<impState.players.length;i++){
      if(!impState.players[i]) continue;
      var gained=msg.winners.indexOf(i)!==-1 ? (i===msg.imposterSeat?' +2':' +1') : '';
      var votes=msg.tally.hasOwnProperty(i) ? (msg.tally[i]+' vote(s)') : '';
      html+=impPlayerRow(i, '<span class="imp-tag">'+(i===msg.imposterSeat?'🕵️ ':'')+votes+'</span><span class="cham-vote-count">'+(impState.scores[i]||0)+' pts'+gained+'</span>');
    }
    $('impScoreList').innerHTML=html;

    if(impNetRole==='host'){
      $('impNextRoundBtn').style.display='inline-block';
      $('impWaitingHostLabel').style.display='none';
    } else {
      $('impNextRoundBtn').style.display='none';
      $('impWaitingHostLabel').style.display='inline-block';
      $('impWaitingHostLabel').textContent="⏳ En attente que l'hôte lance une nouvelle manche...";
    }
    var iWon=msg.winners.indexOf(impMySeat)!==-1;
    sfxReveal(iWon?100:0);
    impHideBanner();
    impGoto_('result');
  }

  /* ---------- API pour le hub ---------- */
  CG.imposteur = {
    reset: function(){
      if(impNetRole) impCleanupOnline();
      closeModal('impDisconnectModal');
      impGoto_('online');
    },
    enterJoinFlow: function(code){
      impGoto_('online');
      $('impJoinCode').value = decodeURIComponent(code).toUpperCase();
    }
  };

  impRenderBankCount();
})();
