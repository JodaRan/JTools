/**
 * Guides de prompt de l'outil « Exercices ».
 *
 * Un guide se copie, se colle dans un LLM, et ce qui en revient s'importe tel
 * quel. Il tient donc en deux morceaux : un guide GÉNÉRAL, qui décrit la forme
 * du CSV et ne change qu'avec le code de l'importateur, et une SPÉCIFICATION
 * par type, qui dit ce qu'il faut produire ici et nulle part ailleurs — des
 * leçons pour les mathématiques, pas pour la communication. Le second est de
 * la donnée : il s'édite depuis le panneau latéral.
 */

/** En-têtes attendus par l'importateur, dans l'ordre où il les exporte. */
export const CSV_HEADERS = [
  'question',
  'type',
  'choix',
  'reponse',
  'explication',
  'lecon',
  'lien_lecon',
  'description'
] as const

/** Séparateur des options d'une question à choix, à l'intérieur d'un champ. */
export const CHOICE_SEPARATOR = '|'

export const GENERAL_PROMPT_GUIDE = `# Guide général — génération d'exercices (CSV pour JTools)

Tu produis un fichier CSV, et rien d'autre : pas d'introduction, pas de
commentaire, pas de bloc de code. La première ligne porte exactement ces
en-têtes, dans cet ordre :

question,type,choix,reponse,explication,lecon,lien_lecon,description

## Les colonnes

- question — l'énoncé complet. Il doit se suffire à lui-même.
- type — « nombre » si la réponse est un nombre à saisir, « choix » si elle se
  prend dans une liste. Rien d'autre.
- choix — les options, séparées par une barre verticale | . Vide si type vaut
  « nombre ». Quatre options en général, toujours plausibles : une seule est
  juste, les autres correspondent à des erreurs de raisonnement courantes.
- reponse — la réponse correcte. Pour « choix », recopie l'option mot pour mot
  (une lettre A/B/C/D ou un numéro 1/2/3/4 sont acceptés aussi). Pour
  « nombre », le nombre seul : pas d'unité, pas d'espace, le point comme
  séparateur décimal.
- explication — le raisonnement qui mène à la réponse, en 2 à 5 phrases. On
  doit comprendre POURQUOI, pas seulement QUOI. Quand une option fausse est
  tentante, dis en une phrase où est le piège.
- lecon — le cours nécessaire AVANT de savoir répondre. Laisse vide quand
  l'exercice ne demande aucune connaissance préalable ; la spécification du
  type ci-dessous dit si cette colonne est attendue.
- lien_lecon — une URL vers une leçon en ligne, uniquement en français ou en
  anglais. Sers-t'en quand la leçon comporte des formules, des schémas ou des
  graphes que le CSV rendrait illisibles. Vide sinon.
- description — une ligne de contexte ou de consigne (« Sans calculatrice »,
  « Durée conseillée : 2 min »). Peut être vide.

## La forme du fichier

- Encodage UTF-8, séparateur virgule.
- Tout champ contenant une virgule, un guillemet ou un saut de ligne est
  entouré de guillemets doubles ; un guillemet à l'intérieur se double ("").
- Aucun retour à la ligne dans un champ non entouré de guillemets.
- Aucune colonne en plus, aucune en moins, aucune ligne vide au milieu.
- Pas de LaTeX ni de Markdown dans les champs : écris les formules en texte
  simple (x^2, racine(2), 3/4, pi). Si ça devient illisible, passe par
  lien_lecon.

## La qualité des exercices

- Difficulté croissante au fil du fichier.
- Aucune question en double, aucune variante triviale d'une autre.
- Chaque énoncé est vérifiable : la réponse est unique et démontrable.
- Recalcule chaque réponse avant de l'écrire ; une réponse fausse dans le
  corrigé fait plus de mal que pas d'exercice du tout.
- Français courant, tutoiement proscrit, pas d'emphase inutile.`

/**
 * Assemble le guide d'un type : le général, puis ce qui lui est propre. C'est
 * ce texte-là qu'on copie dans le LLM.
 */
export function buildPromptGuide(typeName: string, spec: string): string {
  const own = spec.trim()
  const head = `${GENERAL_PROMPT_GUIDE}\n\n# Spécifique au type « ${typeName} »`
  return own ? `${head}\n\n${own}` : `${head}\n\n(Aucune spécification pour ce type.)`
}

/** Ce qu'on met dans le guide d'un type créé à la main : un canevas à remplir. */
export const BLANK_TYPE_SPEC = `Domaine : (à préciser)
Nombre d'exercices attendus : 20.
Format de réponse dominant : choix (4 options).
Colonne « lecon » : laisser vide.
Attendus particuliers :
- (à compléter)`

/** Une partie d'un type de départ. */
export interface SeedPart {
  name: string
  description: string
}

export interface SeedType {
  name: string
  description: string
  spec: string
  parts: SeedPart[]
}

/**
 * Les cinq types de départ. Ce ne sont que des valeurs initiales : un type
 * s'ajoute, se renomme et se supprime comme n'importe quel projet, et sa
 * spécification s'édite depuis le panneau latéral.
 */
export const SEED_TYPES: SeedType[] = [
  {
    name: 'Raisonnement numérique',
    description: 'Lire des nombres, des proportions et des tableaux sans se faire avoir.',
    spec: `Domaine : raisonnement sur les nombres tels qu'on les rencontre dans la vie
courante et professionnelle — pourcentages, proportions, ratios, moyennes,
taux de variation, conversions, ordres de grandeur, lecture de tableaux.

Nombre d'exercices attendus : 20.

Format de réponse : moitié « nombre », moitié « choix ». Quand c'est un
nombre, dis dans l'énoncé l'unité et l'arrondi attendus, et mets dans
« reponse » le nombre seul, sans unité.

Colonne « lecon » : laisser vide. Ces exercices ne demandent aucun cours
préalable ; l'explication suffit.

Attendus particuliers :
- Ancre chaque énoncé dans une situation réelle : facture, salaire, remise,
  consommation, population, budget, temps de trajet.
- Fais figurer au moins cinq questions où le piège est la confusion entre
  points de pourcentage et pourcentage de variation, ou entre deux bases de
  calcul différentes.
- Ajoute deux ou trois estimations d'ordre de grandeur, à résoudre de tête.
- Les données d'un tableau se posent dans l'énoncé, en phrases : le CSV ne
  sait pas porter un tableau.`,
    parts: [
      {
        name: 'Série de base',
        description: 'Pourcentages, proportions, ordres de grandeur.'
      }
    ]
  },
  {
    name: 'Raisonnement logique pratique',
    description: 'Déduire, repérer une faille, ne pas conclure trop vite.',
    spec: `Domaine : déduction appliquée à des situations concrètes — conditions
(si… alors), contraposée, quantificateurs (tous, certains, aucun), énigmes de
contraintes, séquences à compléter, repérage de sophismes et d'arguments
fallacieux.

Nombre d'exercices attendus : 20.

Format de réponse : « choix » à 4 options presque exclusivement. Une des
options fausses doit être la conclusion que l'on tire quand on raisonne trop
vite.

Colonne « lecon » : laisser vide, sauf pour les deux ou trois questions
portant sur la contraposée ou la réciproque, où trois lignes de rappel
suffisent.

Attendus particuliers :
- Au moins quatre questions distinguent implication, réciproque et contraposée.
- Au moins quatre portent sur « certains » / « tous » / « aucun ».
- Trois énigmes de contraintes à cinq éléments, résolubles à la main en moins
  de trois minutes, l'énoncé donnant toutes les contraintes en phrases courtes
  et numérotées.
- Trois questions présentent un argument et demandent quelle faille il porte
  (corrélation prise pour une cause, généralisation hâtive, appel à l'autorité,
  faux dilemme).
- L'explication nomme explicitement la règle ou le sophisme en jeu.`,
    parts: [
      {
        name: 'Série de base',
        description: 'Déductions, quantificateurs, sophismes.'
      }
    ]
  },
  {
    name: 'Stratégie',
    description: 'Décider avec peu d’information, arbitrer, anticiper la réaction d’en face.',
    spec: `Domaine : décision et arbitrage — coûts irrécupérables, coût d'opportunité,
espérance de gain, risque et incertitude, théorie des jeux élémentaire
(dilemme du prisonnier, jeux à somme nulle, équilibre), allocation de
ressources rares, ordonnancement, négociation.

Nombre d'exercices attendus : 20.

Format de réponse : « choix » à 4 options, sauf quelques calculs d'espérance
de gain ou de délai qui appellent un « nombre ».

Colonne « lecon » : laisser vide, sauf pour les questions d'espérance de gain
et de théorie des jeux, où quatre à six lignes de rappel sont bienvenues
(définition, formule, exemple minimal).

Attendus particuliers :
- Chaque énoncé décrit une situation avec des chiffres suffisants pour
  trancher : budget, délais, probabilités, gains.
- Au moins trois questions punissent la prise en compte d'un coût déjà engagé.
- Au moins trois demandent d'anticiper le choix d'un autre acteur rationnel.
- L'explication distingue la décision juste du résultat obtenu : un bon choix
  peut mal tourner, et c'est le choix qu'on évalue.`,
    parts: [
      {
        name: 'Série de base',
        description: 'Arbitrages, espérance de gain, jeux.'
      }
    ]
  },
  {
    name: 'Mathématiques',
    description: 'Le programme, par niveau : première, terminale, première année de physique.',
    spec: `Domaine : mathématiques scolaires et post-bac, au niveau indiqué par la
PARTIE dans laquelle le fichier sera importé. Le nom de la partie fixe le
programme ; ne déborde pas au-dessus.

Nombre d'exercices attendus : 20 par partie.

Format de réponse : majoritairement « nombre ». Quand la réponse est une
expression (une dérivée, une primitive, un ensemble de solutions), passe en
« choix » avec quatre expressions plausibles plutôt que d'attendre une saisie
littérale.

Colonne « lecon » : OBLIGATOIRE ici, et c'est le seul type où elle l'est.
Chaque exercice porte la leçon nécessaire pour le résoudre : la définition,
la propriété ou la formule en jeu, puis un exemple minimal résolu, en cinq à
douze lignes. Plusieurs exercices d'une même notion peuvent partager le même
texte de leçon, mot pour mot.

Écris les formules en texte simple : x^2, racine(x), |x|, ln(x), e^x, 3/4,
pi, somme, integrale de a a b. Dès qu'une leçon réclame un schéma, une courbe
ou une mise en page à deux dimensions (fractions imbriquées, matrices),
abrège la leçon et renvoie vers « lien_lecon » : une page en français ou en
anglais, stable et gratuite — par exemple maths-et-tiques.fr, lelivrescolaire.fr,
bibmath.net, khanacademy.org/fr, mathsisfun.com, ou un chapitre de
fr.wikipedia.org / en.wikipedia.org.

Attendus particuliers :
- L'énoncé donne l'arrondi attendu quand la réponse n'est pas exacte.
- « reponse » ne porte jamais d'unité ni de texte : le nombre seul.
- Les exercices progressent de l'application directe de la leçon vers un
  raisonnement en deux ou trois étapes.
- Vérifie chaque calcul avant d'écrire la ligne.`,
    parts: [
      {
        name: 'Première',
        description:
          'Second degré, suites, dérivation, probabilités conditionnelles, trigonométrie.'
      },
      {
        name: 'Terminale',
        description: 'Limites, continuité, dérivées, exponentielle, logarithme, intégrales, lois.'
      },
      {
        name: 'Première année de physique',
        description:
          'Outils mathématiques du physicien : analyse dimensionnelle, dérivées partielles, équations différentielles, vecteurs, développements limités.'
      }
    ]
  },
  {
    name: 'Communication',
    description: 'Dire les choses clairement, écouter ce qui est dit, désamorcer.',
    spec: `Domaine : communication professionnelle et interpersonnelle — reformulation,
écoute active, message en « je », feedback, désamorçage d'un conflit, annonce
d'une mauvaise nouvelle, courriel efficace, prise de parole, distinction entre
fait, interprétation et jugement.

Nombre d'exercices attendus : 20.

Format de réponse : « choix » exclusivement. Chaque question pose une
situation en deux ou trois phrases, puis propose quatre réponses possibles ;
une seule est la bonne pratique, les trois autres sont des maladresses
ordinaires et reconnaissables (jugement déguisé, conseil non demandé,
minimisation, agressivité passive).

Colonne « lecon » : laisser vide en général. Deux ou trois questions peuvent
porter un rappel court quand elles reposent sur un cadre nommé (message en
« je », communication non violente, DESC).

Attendus particuliers :
- Les situations sont banales et concrètes : réunion, collègue en retard,
  client mécontent, retour sur un travail insuffisant, désaccord avec un
  supérieur.
- Les mauvaises options doivent être tentantes : rien de caricatural.
- L'explication dit ce que la bonne réponse produit chez l'autre, et ce que
  les mauvaises déclenchent.
- Aucune question de pure définition : on évalue un choix de formulation.`,
    parts: [
      {
        name: 'Série de base',
        description: 'Reformulation, feedback, désamorçage.'
      }
    ]
  }
]
