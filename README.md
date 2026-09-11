# JTools

Boîte à outils personnelle sur le bureau. Deux outils à ce jour, tous deux
organisés par projet :

- **Séquences** — listes de commandes à copier-coller (backup de BDD, mise à
  jour de code…).
- **Tâches** — tableaux kanban, avec colonnes, priorités et glisser-déposer.

Le but n'est pas de stocker de la donnée — c'est de la saisir et de s'en servir
sans jamais s'arrêter : édition en place, aucune modale, aucun bouton
« enregistrer », onglets persistants et annulation globale. Les deux outils
partagent toute la coquille : explorateur, onglets, vue côte à côte, journal,
Ctrl+Z global et chiffrement.

## Démarrer

```bash
pnpm install
pnpm dev            # Electron + HMR
```

## Scripts

| Commande | Effet |
|---|---|
| `pnpm dev` | lance l'app en développement |
| `pnpm build` | typecheck puis bundles dans `out/` |
| `pnpm test` | tests unitaires des stores (Vitest) |
| `pnpm verify` | scénarios de bout en bout sur l'app buildée |
| `pnpm icon` | régénère `build/icon.ico` |
| `pnpm tasks:seed` | reprend `saves/` dans le stockage réel (`--dry` pour voir sans écrire) |
| `pnpm dist` | installeur Windows dans `dist/` |

`pnpm verify` pilote l'application réelle par CDP (voir `scripts/app-driver.mjs`)
et dépose ses captures dans `.shots/`. Il faut avoir construit l'app avant
(`pnpm build`).

## Prise en main

- **Explorer** (pastille 📁 à gauche des onglets) : Outils › Projets › Séquences
  ou Tableaux. Le fil d'Ariane ramène à n'importe quel ancêtre.
- **Ouvrir une séquence ou un tableau** crée son onglet. Un onglet ne se ferme qu'au clic sur
  son ×, au clic milieu ou par `Ctrl+W` ; on le déplace au glisser.
- **Deux séquences côte à côte** : clic droit sur un onglet › « Ouvrir à
  droite ». Le séparateur central se glisse à la souris, et le volet se ferme
  par son ×. Une même séquence ne peut pas occuper les deux volets.
- **Vue finale** : chaque ligne est éditable en place.
- **Remonter d'un cran** : le chevron `‹` posé à gauche de chaque titre, ou
  `Retour arrière` hors d'un champ de saisie.

### Raccourcis

| Touches | Effet |
|---|---|
| `Entrée` | valide la ligne et en ouvre une nouvelle dessous |
| `Maj+Entrée` | saut de ligne dans le texte |
| `Retour arrière` (ligne vide) | supprime et remonte |
| `↑` / `↓` (aux bords du texte) | ligne précédente / suivante |
| `Alt+↑` / `Alt+↓` | déplace la ligne |
| `Ctrl+D` | duplique la ligne |
| `Ctrl+Z` / `Ctrl+Y` | annule / rétablit, partout dans l'app |
| `Ctrl+Z` (frappe en cours) | annule d'abord le texte tapé, pas l'action précédente |
| `Ctrl+B` | panneau latéral (historique, lignes cachées, lignes masquées) |
| `Ctrl+P` | ouverture rapide : cherche une séquence ou un tableau par son nom |
| `Ctrl+F` | recherche de mots, depuis une liste de projets ou de séquences |
| `Ctrl+Tab` / `Ctrl+1…9` | navigue entre les onglets |
| `Ctrl+L` | verrouille le coffre immédiatement |
| `Retour arrière` (hors champ) | remonte au niveau supérieur |
| `Alt+←` | remonte au niveau supérieur, y compris depuis un champ |

Survoler l'espace entre deux lignes fait apparaître un `+` : le clic insère une
ligne à cet endroit. La dernière ligne est toujours un champ vide prêt à
recevoir la frappe suivante.

### Retrouver quelque chose

Deux recherches, pour deux questions différentes.

**`Ctrl+P` — je sais comment ça s'appelle.** La palette d'ouverture rapide
cherche par le nom, à travers tous les outils à la fois : séquences et
tableaux dans la même liste. L'outil où l'on se trouve passe en premier,
séparé du reste par un trait — depuis un tableau, ce sont les tableaux qu'on
voit d'abord, sans que les séquences disparaissent pour autant. Sur l'index
des outils, aucun n'est prioritaire.

L'appariement est approximatif : `dplmt` trouve « Deploiement », les accents
et les capitales ne comptent pas, et le nom du projet compte aussi — taper
`ephrata` ramène tout ce qu'il contient. `Entrée` ouvre, `Ctrl+Entrée` ouvre
dans le volet de droite, `Échap` referme. Sans rien taper, la palette liste
les séquences les plus récemment touchées.

**`Ctrl+F` — je me souviens d'un bout de la commande.** Depuis la liste des
projets ou celle des séquences, le champ cherche cette fois dans le *contenu*
des lignes. La portée suit l'endroit d'où l'on cherche : tout l'outil depuis
la liste des projets, le seul projet depuis la liste de ses séquences. Chaque
mot saisi doit se trouver sur la ligne, dans n'importe quel ordre. Un résultat
ouvre sa séquence et pose le halo sur la ligne trouvée.

Rien d'approximatif ici, contrairement à la palette : on cherche un mot qu'on
sait avoir écrit. **Les lignes masquées ne sont jamais fouillées** — leur
contenu n'apparaît nulle part sans le geste explicite de l'œil.

L'outil Tâches, lui, garde la recherche de son tableau : elle filtre les
cartes en place, colonne par colonne.

### Coller un bloc, copier la séquence

Coller un texte à plusieurs lignes — depuis un fichier, un script, une autre
séquence — crée **une ligne par saut de ligne**, en une seule action : un
`Ctrl+Z` retire tout le bloc.

- Dans la **ligne fantôme**, le bloc s'ajoute à la suite.
- **Au milieu d'une ligne**, le collage se comporte comme dans un éditeur de
  texte : la ligne se coupe au curseur et les morceaux s'intercalent.
- Un collage **sans saut de ligne** reste un collage ordinaire.

Les fins de ligne Windows sont normalisées et les blancs de fin retirés.
L'indentation de début est conservée, car elle est parfois signifiante. Les
lignes vides du milieu sont gardées — elles font un séparateur commode entre
deux étapes ; seuls les sauts de ligne **finaux** sont écartés, presque tout
fichier en portant un.

L'icône presse-papiers de l'en-tête copie **toute la séquence**, jointe par des
sauts de ligne. C'est l'exact inverse du collage : l'aller-retour est fidèle.
Elle copie les lignes masquées **en clair** — c'est le but — mais laisse de côté
les lignes cachées.

### Cacher ou masquer une ligne

Deux notions distinctes, toutes deux dans le menu `⋮` de la ligne :

- **Cacher** retire la ligne de la liste ; elle ne vit plus que dans l'onglet
  « Cachées » du panneau latéral, d'où on la réaffiche.
- **Masquer le contenu** la laisse à sa place mais remplace son texte par des
  points. Un bouton œil apparaît alors sur la ligne — **hors du menu `⋮`**, pour
  que révéler tienne en un geste. La révélation est éphémère : elle n'est pas
  enregistrée et se referme dès qu'on quitte l'onglet.

Masquer une ligne expurge aussi ce que le journal avait déjà écrit d'elle : le
libellé et les valeurs conservées sont remplacés, car `history.json` est écrit
en clair sur le disque. Une ligne masquée n'est donc plus restaurable depuis le
panneau « Historique » — elle reste annulable par `Ctrl+Z`, dont la pile ne vit
qu'en mémoire.

> Le masquage protège des regards par-dessus l'épaule et d'un partage d'écran.
> Pour le disque, c'est le coffre qui s'en charge — voir ci-dessous.

## Tâches

Un projet contient des **tableaux** — un par sprint, par exemple. Un tableau
s'ouvre dans son onglet, comme une séquence, et se met côte à côte avec
n'importe quel autre.

### Colonnes

Les colonnes d'un tableau neuf sont *À faire*, *En cours*, *En révision* et
*Terminé*. Le nom se change en cliquant dessus, l'ordre au glissé de la
poignée, et « Ajouter une colonne » prolonge le tableau à droite. Supprimer une
colonne emporte ses tâches — Ctrl+Z les ramène toutes ensemble.

### Cartes

Une carte porte son titre, son assigné et sa priorité en pastille colorée :
rouge *Urgente*, ambre *Haute*, bleu *Moyenne*, gris *Basse*. S'y ajoutent, le
cas échéant, la taille estimée et l'échéance — en rouge si elle est passée.

Le `+` d'une colonne ouvre un champ qui **reste ouvert après Entrée** : on
enchaîne dix tâches sans jamais reprendre la souris. Un clic sur une carte
ouvre son panneau, à droite du tableau ; tout s'y modifie en place, et `Échap`
le referme. Le clic droit sur une carte donne les gestes fréquents — changer la
priorité, dupliquer, supprimer — sans l'ouvrir.

Le panneau porte aussi ce que l'ancien outil ne connaissait pas : une **taille
estimée** (XS à XL) et la **date du dernier changement de statut**, posée
automatiquement au passage d'une colonne à l'autre. La date de création reste
modifiable, et l'échéance vient à côté d'elle.

### Ordre et glisser-déposer

Dans une colonne, les cartes sont rangées **par priorité** : les urgentes en
haut, les basses en bas. À l'intérieur d'une priorité, l'ordre est le vôtre.

Le glisser-déposer respecte cette règle plutôt que de la contourner : une carte
ne se dépose que dans un groupe **de sa propre priorité**, dans sa colonne ou
dans une autre. Pendant le déplacement, les zones qui l'acceptent s'entourent
de pointillés et les autres s'estompent. Changer de priorité est donc une
décision explicite — par le panneau ou le clic droit —, jamais l'effet de bord
d'une main qui glisse.

Déposer une carte dans une autre colonne date son changement de statut. La
recherche de l'en-tête filtre les cartes ; tant qu'elle est active, le
glisser-déposer est suspendu — l'ordre affiché n'étant que partiel, le rang
qu'on croirait fixer serait faux.

### Reprendre les tableaux de l'ancien outil

Les sauvegardes de l'ancien gestionnaire (`tasks`, `statuses`, `members`) se
reprennent telles quelles, sans conversion préalable :

- **Un dossier entier** : Outils › Tâches › « Reprendre d'anciennes
  sauvegardes ». Chaque sous-dossier contenant un `data.json` devient un
  projet ; ceux qui partagent une base — `Ephrata`, `Ephrata_sprint_2`,
  `Ephrata_sprint_3` — se rangent sous un même projet, en sprints.
- **Un tableau seul** : depuis la liste des tableaux d'un projet, « Importer un
  tableau ».
- **En ligne de commande** : `pnpm tasks:seed` fait la même chose sur `saves/`.
  Coffre actif, il refuse d'écrire — il n'a pas la clé — et renvoie vers
  l'interface, qui l'a.

La reprise est **une seule action annulable** : six dossiers repris puis
Ctrl+Z, et il n'en reste rien.

Trois détails de la conversion valent d'être connus. Les statuts deviennent des
colonnes, dans l'ordre déclaré, et un statut qui n'existait que sur une tâche
obtient quand même la sienne — rien n'est perdu. Le champ `order` de l'ancien
format se compte **au sein d'une priorité**, pas d'une colonne ; les rangs sont
donc redonnés groupe par groupe, en conservant l'ordre affiché et en
départageant les ex æquo par ancienneté. Enfin, l'ancien outil ne datait pas
les changements de statut et n'estimait pas : ces deux champs restent vides
plutôt que d'être inventés.

## Chiffrement

Le coffre est **facultatif** : JTools le propose au premier lancement, et on
peut l'activer plus tard depuis le menu › Sécurité.

Actif, il chiffre `data.json`, `history.json` et **les exports** en AES-256-GCM.
Le mot de passe n'est demandé qu'au démarrage. Il ne chiffre rien directement :
il dérive, par scrypt, une clé qui en encapsule une autre, tirée au hasard, qui
chiffre réellement les fichiers. C'est ce détour qui permet de changer de mot de
passe sans rien rechiffrer — seule l'enveloppe est refaite.

Un export emporte ce matériel de clé : le JSON se copie d'une machine à l'autre
et s'ouvre avec le mot de passe du poste d'origine, ou sa clé de secours.

### Ce qu'il protège, et ce qu'il ne protège pas

| Menace | Couvert |
|---|---|
| Disque volé, image, sauvegarde du profil | oui |
| Autre compte Windows, autre machine | oui |
| L'export qu'on copie ou synchronise | oui |
| Regard par-dessus l'épaule, partage d'écran | oui, par le masquage |
| **Malware tournant sous votre propre session** | **non** |

La dernière ligne est structurelle, pas un défaut d'implémentation : ce qu'une
application sait déchiffrer sans vous, un programme tournant sous votre compte
le sait aussi — il peut enregistrer la frappe de la passphrase, lire la mémoire
du processus, ou modifier l'application elle-même. Le verrouillage sur
inactivité réduit la fenêtre d'exposition, il ne la ferme pas.

Trois détails qui vont dans le même sens : le verrouillage **vide les stores**
et la pile d'annulation, marquer une ligne masquée **expurge le journal**
existant, et `vault.json` ne contient que des clés encapsulées.

### Clé de secours et oubli

Un mot de passe oublié est **définitif** : il n'y a aucune récupération. La clé
de secours remise à l'activation est la seule porte de sortie — elle s'affiche
une fois, et n'est stockée nulle part. Elle survit aux changements de mot de
passe, et se régénère depuis le menu › Sécurité, ce qui invalide l'ancienne.

`ui.json` reste volontairement en clair : le processus principal le lit pour
ouvrir la fenêtre à la bonne taille, donc avant toute passphrase. Il ne porte
que la géométrie, le thème et des identifiants opaques — jamais de noms.

## Sécurité des données pendant les tests

Les scripts de `pnpm verify` effacent le stockage avant chaque scénario. Ils
tournent pour cela dans un **profil Electron dédié**, passé à l'exécutable via
`--user-data-dir` et rangé dans le dossier temporaire du système : ils ne
voient pas `%APPDATA%\jtools` et ne peuvent donc pas l'effacer. Un garde-fou
(`assertIsolated`, couvert par `test/isolation.spec.ts`) refuse de démarrer si
la cible retombait sur le dossier réel.

Filet manuel, à prendre avant une manipulation risquée :

```
pnpm data:save             instantané daté du stockage réel
pnpm data:list             liste les instantanés
pnpm data:restore <nom>    restaure (en sauvegardant d'abord l'état courant)
```

Les instantanés sont rangés dans `%LOCALAPPDATA%\JTools-snapshots`, hors du
dépôt. Coffre actif, ils héritent du chiffrement ; sinon ils sont en clair.

## Données

Tout est en JSON dans `%APPDATA%/jtools/JTools/` :

| Fichier | Contenu |
|---|---|
| `data.json` | projets, séquences, lignes, tableaux, colonnes, tâches |
| `history.json` | journal des modifications |
| `ui.json` | fenêtre, thème, onglets ouverts, panneau latéral |

Le menu ☰ de la barre de titre permet de copier la sauvegarde complète dans le
presse-papiers, de l'exporter dans un fichier ou d'en réimporter une.

## Ajouter un outil

Un outil est du code, pas de la donnée : ajouter une entrée dans
`src/renderer/src/tools/registry.ts` et la vue finale correspondante suffit.
L'entrée y déclare aussi les mots de l'outil — « séquence » ou « tableau » — et
sa vue finale, que `ToolHost.vue` monte aussi bien dans l'onglet principal que
dans le volet droit. La structure Projets › Séquences et toute la coquille
(onglets, annulation, persistance) sont réutilisées telles quelles.

Un tableau de tâches **est** une séquence : il porte son identifiant, et hérite
ainsi de l'onglet, du fil d'Ariane et de la vue côte à côte sans une ligne de
code en plus.

## Architecture

```
src/main/      processus principal : fenêtre frameless, IPC, stockage atomique
src/preload/   pont `window.jtools` (contextIsolation, aucun Node dans la page)
src/shared/    modèles partagés entre les deux mondes
src/renderer/  Vue 3 + Pinia + Vue Router, Tailwind v4 et Naive UI
```

Toute mutation passe par une commande (`src/renderer/src/lib/commands.ts`) qui
sait se défaire : c'est ce qui rend l'annulation globale possible et alimente
le journal.
