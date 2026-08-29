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
- **Vue finale** : chaque ligne est éditable en place.

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
| `Ctrl+B` | panneau latéral (historique, lignes cachées) |
| `Ctrl+Tab` / `Ctrl+1…9` | navigue entre les onglets |

Survoler l'espace entre deux lignes fait apparaître un `+` : le clic insère une
ligne à cet endroit. La dernière ligne est toujours un champ vide prêt à
recevoir la frappe suivante.

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
