# CRAZY GAMES — Phantom Wave

Un hub de mini-jeux multijoueurs dans le navigateur, façon *Persona 5 / Phantom Thieves*.
Aucun serveur de jeu : tout tourne dans la page, et le mode en ligne relie
directement les navigateurs entre eux (WebRTC via [PeerJS](https://peerjs.com/)).
Hébergeable tel quel sur GitHub Pages.

## Les jeux

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
Tout le monde connaît le mot secret, sauf le Caméléon. Chacun trace un trait à tour de
rôle (deux passages), puis on vote. Démasqué, le Caméléon peut encore gagner en
devinant le mot (majuscules, accents et ponctuation ignorés).
Limites de temps : 45 s par trait, 60 s pour voter, 45 s pour la dernière chance.

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

## Jouer en ligne

1. Un joueur crée la salle et partage le **code** (ex. `JOKER-4821`) ou le **lien d'invitation**.
2. Les autres choisissent « Rejoindre une salle ».
3. L'hôte lance la partie quand tout le monde est là.

Si quelqu'un perd la connexion, il est reconnecté automatiquement et retrouve sa place.
S'il a rechargé la page, il lui suffit de rejoindre à nouveau la salle depuis le même
onglet. En 1 vs 1 / 2 vs 2, la place d'un joueur parti peut aussi être reprise par
quelqu'un d'autre. L'hôte doit rester connecté : c'est lui qui fait tourner la partie.

## Structure du projet

```
index.html        le balisage des écrans (hub + jeux + modales)
css/style.css     tout le style
js/common.js      outils partagés : DOM, sons, copie, comparaison de mots
js/net.js         couche réseau commune (PeerJS) : salles, reconnexion, battements de cœur
js/demicercle.js  le Demi-Cercle
js/cameleon.js    le Caméléon
js/imposteur.js   L'Imposteur des chiffres
js/loup.js        Le Loup des mots
js/classement.js  Le Classement
js/quiaecrit.js   Qui a écrit ça ?
js/bots-maps.js   Battle Bots : génération des cartes, décors, rendu lissé du terrain
js/bots.js        Battle Bots : physique, simulation, réseau, visée, rendu
js/hub.js         routeur (#hub, #demicercle, #cameleon, #imposteur, #bots, #loup, #classement, #quiaecrit), infos, bouton son
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
