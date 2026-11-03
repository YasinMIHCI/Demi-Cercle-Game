# CRAZY GAMES

Un hub de mini-jeux multijoueurs dans le navigateur, dans un style comics rouge, noir et blanc.
Aucun serveur de jeu : tout tourne dans la page, et le mode en ligne relie
directement les navigateurs entre eux (WebRTC via [PeerJS](https://peerjs.com/)).
Hébergeable tel quel sur GitHub Pages.

## L'intro

À l'ouverture de la page, une intro en 3D d'environ 7 secondes (Three.js, dessinée en code,
sans image ni vidéo) : vue à la première personne, on court sur les toits d'une ville néon
rouge et on saute par-dessus l'avenue, puis salto arrière depuis une tour (la ville passe à
l'envers) ; une grande bande rouge « CRAZY GAMES » fait la transition vers le titre en lettres
découpées, et des bandes diagonales dévoilent le hub. On peut la passer (bouton « Passer », Échap).
- La bibliothèque 3D (`js/vendor/three.min.js`) n'est chargée que si l'intro doit passer ;
  si elle n'est pas prête au bout de 2,5 s (réseau lent) ou sans 3D, on arrive directement au hub.
- Trajectoire de caméra calculée d'avance puis lissée : aucun à-coup aux sauts.
- Effets sonores et musique synthétisés en direct (Web Audio, aucun fichier).

## L'app (iPhone / Android)

Le site s'installe comme une app sur l'écran d'accueil (PWA) : icône, plein écran,
ouverture même sans réseau (il en faut pour jouer en ligne). Bouton « 📲 Installer l'app »
dans le hub, qui donne les étapes selon l'appareil :
- **Android** (Chrome, Brave, Samsung Internet) : fenêtre d'installation du navigateur,
  ou menu → « Installer l'application » / « Ajouter à l'écran d'accueil ».
- **iPhone** : Safari → Partager → « Sur l'écran d'accueil ».

Dans l'app, l'intro ne passe qu'à la première ouverture de la journée. Fichiers :
`manifest.webmanifest`, `icons/`, `sw.js` (cache : la page en réseau d'abord, les fichiers
`?v=` en cache ; rien à modifier à chaque mise à jour) et `js/pwa.js`.

## Son et musiques

Tout le son passe par `js/audio.js` (un seul contexte audio pour le site) :
- **OST originales**, composées pour le site dans un esprit acid-jazz et jouées
  par un petit séquenceur : *lounge* (hub et menus), *heist* (jeux de soirée), *riot*
  (Battle Bots). La musique change toute seule selon l'écran, avec un fondu.
- Boutons du hub : 🔊 Son (tout) et 🎵 Musique (seulement la musique), mémorisés.
- Les navigateurs gardent une page muette tant qu'on n'a rien touché : le son démarre au
  premier geste (pendant l'intro, toucher l'écran active le son sans la passer). Sur
  iPhone, le son est débloqué au relâché du doigt et une piste muette empêche le bouton
  « silencieux » de couper le son.

## Les jeux

### 🎉 Soirée All in
Une seule salle pour toute la soirée (2 à 10 joueurs). L'hôte coche les jeux et choisit le
nombre de manches (3 à 15) : chaque manche lance un jeu différent (les jeux choisis passent
tous, dans un ordre mélangé, avant qu'un jeu ne revienne). La salle de chaque jeu s'ouvre et
se rejoint toute seule, la partie démarre quand tout le monde est là, et à la fin de la manche
tout le monde revient au classement général. Points de soirée selon la place dans la manche
(10, 7, 5, 4, 3, 2, puis 1 ; égalité = même place), pour que tous les jeux pèsent pareil.
Un jeu qui ne se joue pas au nombre de joueurs présents est remplacé ; l'hôte peut passer une
manche bloquée. Fichier : `js/party.js` (chaque jeu appelle `CG.partyEnd()` côté hôte en fin de manche).

### 🌗 Le Demi-Cercle
Jeu d'estimation inspiré du *Jeu du Demi-Cercle* (Wankil Studio).
Un thème avec deux extrémités opposées (« Films » : NAVET TOTAL ↔ CHEF-D'ŒUVRE),
une cible secrète sur un cadran : le donneur d'indice propose un exemple, le devin
place l'aiguille. Plus c'est proche, plus ça rapporte (100 / 80 / 50 / 20 / 0).

- **Local** : 2 joueurs sur le même écran (on se passe l'appareil).
- **En ligne** : 1 vs 1 ou 2 vs 2, avec l'aiguille du devin visible en direct et le
  *Pari de Confiance* (×1,5 si réussi, −30 si raté).
- Banque de thèmes modifiable, sauvegardée dans le navigateur.
- Sans limite de manches, le bouton « Terminer la partie » affiche les résultats finaux.

### 🦎 Le Caméléon
Dessin partagé et déduction sociale, de 3 à 8 joueurs en ligne.
Tout le monde connaît le mot secret, sauf le Caméléon. Chacun dessine à tour de rôle
(deux passages) : autant de traits qu'il veut, tant qu'il reste de l'encre dans sa jauge,
puis « J'ai fini ». On vote ensuite. Démasqué, le Caméléon peut encore gagner en
devinant le mot (majuscules, accents et ponctuation ignorés).
Limites de temps : 35 s par tour de dessin, 60 s pour voter, 45 s pour la dernière chance.
L'hôte valide chaque trait et renvoie le dessin complet à tout le monde : toutes les
toiles sont identiques, quel que soit l'écran (téléphone ou ordinateur).

### 🕵️ L'Imposteur des chiffres
Bluff et déduction, de 3 à 8 joueurs en ligne.
Chacun répond par un nombre à une question secrète (« Combien de cafés bois-tu par
semaine ? »)… sauf l'Imposteur, qui a reçu une autre question (« Combien de fois par
semaine fais-tu du sport ? ») **sans le savoir**. Les réponses sont révélées sur une
ligne graduée avec la vraie question : l'Imposteur découvre le piège et doit bluffer,
puis tout le monde vote. Si l'Imposteur est le seul plus accusé, ceux qui ont voté
contre lui gagnent 1 point ; sinon il s'échappe et gagne 2 points. Banque de plus de 150 paires
de questions, complétable avec les vôtres. Limites de temps : 90 s pour répondre, 60 s
pour voter.

### 🐺 Le Loup des mots
Déduction et bluff, de 4 à 10 joueurs en ligne (dans l'esprit de *Werewords*).
Chaque manche, un Maire choisit un mot secret ; chacun reçoit un rôle caché : **Loup**
(connaît le mot, 2 loups à partir de 7 joueurs), **Voyant** (connaît le mot) ou
**Villageois**. Tout le monde pose des questions fermées au Maire, qui répond Oui, Non,
Peut-être, Tu chauffes ! ou Loin ! (une fois chacun), jusqu'à « Trouvé ! ».
- Mot trouvé : les Loups ont 30 s pour démasquer le Voyant.
- Chrono écoulé : tout le monde vote contre un Loup présumé.
Le camp gagnant marque 1 point par joueur ; le rôle de Maire tourne à chaque manche.

### 🎭 Qui a écrit ça ?
Réponses anonymes et devinettes, de 3 à 8 joueurs en ligne. Une question drôle (« Ce que
tu penses vraiment des pieds ? ») : chacun répond par écrit en secret (90 s). Les
réponses sont révélées une par une, sans nom, et tout le monde vote : qui a écrit ça ?
(30 s). L'auteur vote aussi pour brouiller les pistes. +1 par bonne devinette, et
l'auteur gagne +1 par joueur berné (3 au maximum). Plus de 80 questions, complétables
avec les vôtres.

### 🏆 Le Classement
« Qui est le plus… ? », de 3 à 8 joueurs en ligne (dans l'esprit des classements entre
potes). Chaque manche, une question sur le groupe (« Qui est le plus fort au bras de
fer ? ») : chacun classe en secret tous les joueurs, lui compris (75 s).
- On révèle le **podium du groupe** (moyenne des classements), du dernier au premier.
- Jusqu'à 10 points selon la proximité de ton classement avec celui du groupe.
- Les titres : 🪞 **l'Ego** (se classe bien plus haut que le groupe ne le fait),
  🙈 **le Modeste**, 🤘 **le Rebelle** (le moins d'accord avec tout le monde).
- Une centaine de questions, complétable avec les vôtres ; l'hôte termine la partie
  quand il veut.

### 🛏️ Crous ou Prison ?
Une photo de chambre, 10 secondes pour trancher : chambre étudiante du CROUS ou cellule
de prison ? 9 photos par partie (1 min 30). En solo (avec record personnel) ou de 2 à 8
joueurs en ligne, tout le monde voit la même photo en même temps. Bonne réponse : 100
points + jusqu'à 50 points de rapidité. Les 60 photos (29 cellules, 31 chambres étudiantes) viennent de Wikimedia Commons, sous
licence libre ; leurs auteurs sont crédités dans le jeu (bouton « Crédits photos ») et
dans `js/crousprison-photos.js`.

### 🤖 Battle Bots
Combat de tanks en 2D sur un terrain destructible (façon *Worms*), en ligne : 1 vs 1,
2 vs 2 ou chacun pour soi (jusqu'à 6).
- 3 tanks : **Titan** (lourd, 160 PV, Obus lourd / Rempart), **Ranger** (équilibré,
  115 PV, Fragmentation / Réparation), **Viper** (rapide, 80 PV, Rafale / Propulsion).
- À chaque tour, tout le monde choisit **une action** en secret (saut, tir, compétence
  d'attaque, compétence de survie) et vise **comme un lance-pierre** : on tire vers
  l'arrière, la flèche part à l'opposé et sa longueur donne la puissance. À la fin du
  chrono, toutes les actions partent en même temps.
- 3 cartes (ou aléatoire, choisie par l'hôte) : **Shibuya** (collines et îlots sous la
  lune rouge), **La Prison** (bâtiment fermé sur 3 étages, trappes, cellules et murs à
  faire sauter) et **Les Docks** (îles, quais et conteneurs au milieu de la mer).
- Chaque tank a sa silhouette : le Titan est un blindé riveté, le Ranger un char-soldat
  casqué, le Viper un serpent mécanique. Les tanks rebondissent à l'atterrissage et après
  un choc, sauf s'ils retombent bien droit sur leurs roues.
- Les explosions creusent la terre ; la pierre résiste mieux. Les compétences ont un
  temps de recharge. Le tir allié est actif. À partir du tour 15, l'eau monte de plus en
  plus vite.
- L'hôte simule chaque tour et envoie le résultat à tous : tout le monde voit exactement
  la même chose. Sur téléphone, la caméra zoome sur ton tank pendant la visée.

## Comptes joueurs (facultatif)

Bouton **👤 Se connecter** dans le hub : un pseudo de connexion et un mot de passe, aucun
e-mail. Avec un compte, chaque fin de partie est enregistrée (parties, victoires, meilleur
score par jeu), le nom est pré-rempli dans tous les jeux, et le menu de chaque jeu affiche
le **top record** : meilleur score d'une partie (Soirée, Crous ou Prison, Classement, Qui a
écrit ça, Demi-Cercle) ou plus grand nombre de victoires (Battle Bots, Caméléon, Imposteur,
Loup). Sans compte, tout fonctionne comme avant.

Les comptes sont stockés sur [Supabase](https://supabase.com) (offre gratuite) :
- `supabase/schema.sql` crée les tables, les droits et les fonctions : à coller une fois dans
  le **SQL Editor** du projet puis **Run** (le relancer ne casse rien) ;
- dans *Authentication → Providers → Email*, « Confirm email » doit rester **désactivé** :
  le pseudo devient une adresse interne `pseudo@joueurs.crazygames.app` qui ne reçoit rien ;
- l'URL du projet et la clé *publishable* sont en haut de `js/account.js` (cette clé est
  publique par nature ; les droits sont gérés par la sécurité des tables).

Pas d'e-mail, donc pas de « mot de passe oublié » : le joueur peut le changer une fois
connecté, et supprimer son compte depuis la même fenêtre.

## Jouer en ligne

1. Un joueur crée la salle en **choisissant son code** (ex. `SOIREE-YASIN` : lettres,
   chiffres et tirets, 3 à 20 caractères ; les accents et espaces sont convertis
   automatiquement) et le partage, ou envoie le **lien d'invitation**.
2. Les autres choisissent « Rejoindre une salle » et tapent le même code. Si le code est
   déjà utilisé par une autre salle du même jeu, l'hôte doit en choisir un autre.
3. L'hôte lance la partie quand tout le monde est là.

Si quelqu'un perd la connexion, il est reconnecté automatiquement et retrouve sa place.
S'il a rechargé la page, il lui suffit de rejoindre à nouveau la salle depuis le même
onglet. En 1 vs 1 / 2 vs 2, la place d'un joueur parti peut aussi être reprise par
quelqu'un d'autre. L'hôte doit rester connecté : c'est lui qui fait tourner la partie.

## Structure du projet

```
index.html        le balisage des écrans (hub + jeux + modales)
css/style.css     tout le style
js/audio.js       son commun : déblocage, instruments synthétisés, musiques
js/intro.js       l'intro 3D (Three.js + canvas)
js/vendor/three.min.js  Three.js r128 (licence MIT), chargé seulement pour l'intro
js/common.js      outils partagés : DOM, sons, copie, comparaison de mots
js/net.js         couche réseau commune (PeerJS) : salles, reconnexion, battements de cœur
js/demicercle.js  le Demi-Cercle
js/cameleon.js    le Caméléon
js/imposteur.js   L'Imposteur des chiffres
js/loup.js        Le Loup des mots
js/classement.js  Le Classement
js/quiaecrit.js   Qui a écrit ça ?
js/crousprison-photos.js  Crous ou Prison ? : liste des photos et crédits
js/crousprison.js Crous ou Prison ?
img/cop/          Crous ou Prison ? : les photos
js/bots-maps.js   Battle Bots : génération des cartes, décors, rendu lissé du terrain
js/bots.js        Battle Bots : physique, simulation, réseau, visée, rendu
js/pwa.js         app installable : service worker, bouton « Installer l'app »
sw.js             service worker (cache hors ligne)
manifest.webmanifest  nom, icônes et couleurs de l'app
js/party.js       Soirée All in : salle de la soirée, enchaînement des jeux, classement général
js/account.js     comptes (Supabase) : connexion, statistiques, top records, pseudo pré-rempli
supabase/schema.sql  tables et droits des comptes, à exécuter dans le SQL Editor de Supabase
js/vendor/qrcode.js  générateur de QR codes (licence MIT)
js/hub.js         routeur (#hub, #demicercle, #cameleon, #imposteur, #bots, #loup, #classement, #quiaecrit, #crousprison), infos, bouton son
```

Les scripts sont de simples fichiers chargés dans l'ordre (pas de build). Ils partagent
l'objet global `window.CG`.

**À chaque mise à jour**, augmenter le numéro `?v=` des fichiers CSS/JS dans `index.html`.
Sinon un navigateur peut garder en cache une partie des anciens fichiers et les mélanger
avec les nouveaux (le jeu ne se charge plus et tout reste « HORS LIGNE »).

### Ajouter un jeu
1. Ajouter une vue `<div id="view-monjeu" class="view">` dans `index.html` et une carte dans le hub.
2. Créer `js/monjeu.js` et utiliser `CG.createRoomNet({...})` pour le multijoueur
   (voir les commentaires en tête de `js/net.js`).
3. Exposer `CG.monjeu = {reset, enterJoinFlow}` et ajouter la route dans `js/hub.js`.

## Lancer en local

Ouvrir `index.html` suffit. Pour que les liens d'invitation fonctionnent, il vaut mieux servir le dossier :

```sh
python3 -m http.server 8000
# puis http://localhost:8000
```

Le mode en ligne utilise le serveur public de PeerJS pour la mise en relation.
Pour utiliser votre propre [PeerServer](https://github.com/peers/peerjs-server),
définissez avant les scripts :

```html
<script>window.CG_PEER_OVERRIDE = {host:'mon-serveur.fr', port:443, path:'/', secure:true};</script>
```
