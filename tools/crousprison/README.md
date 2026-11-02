# Photos de « Crous ou Prison ? »

Outils pour constituer la banque de photos (licences libres, Wikimedia Commons).
Nécessite l'accès réseau à `commons.wikimedia.org` et `upload.wikimedia.org`, et Pillow
(`pip install pillow`).

1. Télécharger des candidats (vignettes 1000 px + métadonnées) dans un dossier de travail
   hors du dépôt, une catégorie Commons par argument (suffixe `/N` = profondeur de sous-catégories, 1 par défaut) :

   ```
   python3 -I fetch.py /chemin/travail prison "Category:Prison cells" "Category:Prison cells in France"
   python3 -I fetch.py /chemin/travail crous "Category:Dormitory rooms" "Category:Student housing in France"
   ```
2. Faire des planches contact numérotées pour trier à l'œil (garder uniquement des
   intérieurs de chambres / cellules, écarter les photos trop évidentes ou de mauvaise qualité) :

   ```
   python3 -I sheet.py /chemin/travail/prison
   ```
3. Copier les photos retenues dans `img/cop/` (redimensionnées, nom neutre qui ne trahit
   pas la réponse) et les lister dans `js/crousprison-photos.js` avec la légende, l'auteur,
   la licence et le lien de la source (`meta.json`). Puis réafficher la carte du jeu dans
   le hub (`index.html`, carte « CROUS OU PRISON ? » actuellement masquée).

## Si Wikimedia bride les requêtes (erreurs 429)

Le workflow `.github/workflows/cop-photos.yml` fait le téléchargement depuis les serveurs
de GitHub : modifier `tools/crousprison/run.txt` sur une branche `claude/**` le lance, et
les vignettes réduites reviennent dans `tools/crousprison/candidates/` sur cette branche.
Ce dossier est temporaire : trier, puis repartir de `main` sans lui (il ne doit pas être fusionné).
