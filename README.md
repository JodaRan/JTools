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
| `Ctrl+B` | panneau latéral (historique, lignes cachées, lignes masquées) |
| `Ctrl+Tab` / `Ctrl+1…9` | navigue entre les onglets |
| `Retour arrière` (hors champ) | remonte au niveau supérieur |
| `Alt+←` | remonte au niveau supérieur, y compris depuis un champ |

Survoler l'espace entre deux lignes fait apparaître un `+` : le clic insère une
ligne à cet endroit. La dernière ligne est toujours un champ vide prêt à
recevoir la frappe suivante.

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

> Le masquage protège des regards par-dessus l'épaule et d'un partage d'écran,
> **pas** du contenu du disque : `data.json` reste en clair. Le chiffrement au
> repos n'est pas encore en place.

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
