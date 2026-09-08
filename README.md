# JTools

Boîte à outils personnelle sur le bureau. Le premier outil, **Séquences**, gère
des listes de commandes à copier-coller (backup de BDD, mise à jour de code…),
organisées par projet.

Le but n'est pas de stocker des commandes — c'est de les saisir et de les copier
sans jamais s'arrêter : édition en place, aucune modale, aucun bouton
« enregistrer », onglets persistants et annulation globale.

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
| `pnpm dist` | installeur Windows dans `dist/` |

`pnpm verify` pilote l'application réelle par CDP (voir `scripts/app-driver.mjs`)
et dépose ses captures dans `.shots/`. Il faut avoir construit l'app avant
(`pnpm build`).

## Prise en main

- **Explorer** (pastille 📁 à gauche des onglets) : Outils › Projets › Séquences.
  Le fil d'Ariane ramène à n'importe quel ancêtre.
- **Ouvrir une séquence** crée son onglet. Un onglet ne se ferme qu'au clic sur
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
| `Ctrl+Tab` / `Ctrl+1…9` | navigue entre les onglets |
| `Ctrl+L` | verrouille le coffre immédiatement |
| `Retour arrière` (hors champ) | remonte au niveau supérieur |
| `Alt+←` | remonte au niveau supérieur, y compris depuis un champ |

Survoler l'espace entre deux lignes fait apparaître un `+` : le clic insère une
ligne à cet endroit. La dernière ligne est toujours un champ vide prêt à
recevoir la frappe suivante.

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

## Données

Tout est en JSON dans `%APPDATA%/jtools/JTools/` :

| Fichier | Contenu |
|---|---|
| `data.json` | projets, séquences, lignes |
| `history.json` | journal des modifications |
| `ui.json` | fenêtre, thème, onglets ouverts, panneau latéral |

Le menu ☰ de la barre de titre permet de copier la sauvegarde complète dans le
presse-papiers, de l'exporter dans un fichier ou d'en réimporter une.

## Ajouter un outil

Un outil est du code, pas de la donnée : ajouter une entrée dans
`src/renderer/src/tools/registry.ts` et la vue finale correspondante suffit. La
structure Projets › Séquences et toute la coquille (onglets, annulation,
persistance) sont réutilisées telles quelles.

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
