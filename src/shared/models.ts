/**
 * Modèles partagés entre le processus principal et le renderer.
 * Toute évolution de forme doit s'accompagner d'un incrément de SCHEMA_VERSION
 * et d'une étape dans `migrate.ts`.
 */

export const SCHEMA_VERSION = 4

export interface Project {
  id: string
  toolId: string
  name: string
  description: string
  order: number
  createdAt: string
  updatedAt: string
}

export interface Sequence {
  id: string
  projectId: string
  name: string
  description: string
  order: number
  createdAt: string
  updatedAt: string
}

export interface Line {
  id: string
  sequenceId: string
  content: string
  comment: string
  /** Retirée de la liste : elle ne vit plus que dans le panneau latéral. */
  hidden: boolean
  /**
   * Contenu obscurci en place. La ligne garde sa position et reste copiable,
   * mais son texte n'est révélé que le temps d'un clic sur l'œil — et la
   * révélation ne quitte jamais la mémoire de la vue.
   */
  masked: boolean
  order: number
  createdAt: string
  updatedAt: string
}

/**
 * Tableau de tâches. C'est le pendant d'une séquence pour l'outil « Tâches » :
 * un tableau EST une séquence (même identifiant, mêmes onglets, même fil
 * d'Ariane) ; cet enregistrement ne porte que ce qui lui est propre.
 */
export interface Board {
  /** Identique à l'identifiant de la séquence qui le porte. */
  id: string
  /** Acteurs proposés pour l'assignation. « Non assigné » ouvre toujours la liste. */
  assignees: string[]
}

/** Colonne d'un tableau — le « statut » de l'ancien outil, devenu une entité. */
export interface Column {
  id: string
  boardId: string
  name: string
  order: number
  createdAt: string
  updatedAt: string
}

export const PRIORITIES = ['urgent', 'high', 'medium', 'low'] as const
export type Priority = (typeof PRIORITIES)[number]

/** Taille relative plutôt qu'une durée en heures : une estimation reste une estimation. */
export const ESTIMATES = ['xs', 's', 'm', 'l', 'xl'] as const
export type Estimate = (typeof ESTIMATES)[number] | ''

export const UNASSIGNED = 'Non assigné'

export interface Task {
  id: string
  boardId: string
  columnId: string
  title: string
  description: string
  assignee: string
  priority: Priority
  estimate: Estimate
  /** Date de création reprise de l'ancien outil, `YYYY-MM-DD`, modifiable. */
  date: string
  /** Échéance, `YYYY-MM-DD`. Vide tant qu'on n'en a pas fixé. */
  dueDate: string
  /** Dernier passage d'une colonne à une autre. Vide si jamais déplacée. */
  statusChangedAt: string
  /**
   * Rang au sein du couple (colonne, priorité) : le glisser-déposer ne
   * réordonne qu'à priorité égale, il ne la change jamais.
   */
  order: number
  createdAt: string
  updatedAt: string
}

export type HistoryAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'reorder'
  | 'hide'
  | 'unhide'
  | 'mask'
  | 'unmask'
  | 'comment'
  | 'import'
  | 'move'

export type EntityType = 'project' | 'sequence' | 'line' | 'board' | 'column' | 'task'

/** Journal persistant, distinct de la pile d'annulation (en mémoire). */
export interface HistoryEntry {
  id: string
  at: string
  action: HistoryAction
  entityType: EntityType
  entityId: string
  /** Séquence concernée, pour filtrer le panneau latéral. */
  sequenceId: string | null
  label: string
  before: unknown
  after: unknown
}

export type ThemeMode = 'light' | 'dark' | 'system'
export type SidebarPanel = 'history' | 'hidden' | 'masked'

export interface WindowState {
  x: number | null
  y: number | null
  width: number
  height: number
  maximized: boolean
}

export interface TabState {
  id: string
  toolId: string
  projectId: string
  sequenceId: string
}

/** Volet secondaire : un second onglet affiché côte à côte avec le principal. */
export interface SplitState {
  /** `null` = pas de volet droit. */
  tabId: string | null
  /** Largeur du volet principal, en fraction de la zone de contenu. */
  ratio: number
}

export interface SecurityState {
  /**
   * L'offre de créer un mot de passe n'est faite qu'une fois : le coffre étant
   * facultatif, redemander à chaque lancement serait du harcèlement.
   */
  prompted: boolean
  /** Minutes d'inactivité avant verrouillage. `0` désactive. */
  idleLockMinutes: number
}

export interface UiState {
  window: WindowState
  theme: ThemeMode
  tabs: TabState[]
  /** `null` = la pastille Explorer est active. */
  activeTabId: string | null
  /** Dernier emplacement visité dans l'explorateur, pour y revenir au lancement. */
  explorer: { toolId: string | null; projectId: string | null }
  sidebar: { open: boolean; panel: SidebarPanel; width: number }
  split: SplitState
  security: SecurityState
}

export interface DataFile {
  version: number
  projects: Project[]
  sequences: Sequence[]
  lines: Line[]
  /** v3 → v4 : l'outil « Tâches ». Vides pour un fichier d'avant. */
  boards: Board[]
  columns: Column[]
  tasks: Task[]
}

export interface HistoryFile {
  version: number
  entries: HistoryEntry[]
}

export interface UiFile extends UiState {
  version: number
}

/** Sauvegarde complète : c'est ce qu'on copie-colle. */
export interface BackupFile {
  app: 'JTools'
  appVersion: string
  exportedAt: string
  data: DataFile
  history: HistoryFile
  ui: UiFile
}

/**
 * Sauvegarde chiffrée. Elle embarque le matériel de clé du coffre qui l'a
 * produite : le fichier s'ouvre donc sur n'importe quelle machine, avec la
 * passphrase — ou la clé de secours — en vigueur au moment de l'export.
 */
export interface EncryptedBackup {
  app: 'JTools'
  jtools: 'encrypted'
  v: 1
  exportedAt: string
  /** Contenu de `vault.json` : la clé de données, encapsulée. */
  vault: unknown
  payload: { nonce: string; ct: string; tag: string }
}

export const isEncryptedBackup = (value: unknown): value is EncryptedBackup =>
  typeof value === 'object' &&
  value !== null &&
  (value as EncryptedBackup).jtools === 'encrypted'

export const DEFAULT_WINDOW: WindowState = {
  x: null,
  y: null,
  width: 1200,
  height: 800,
  maximized: false
}

export const defaultData = (): DataFile => ({
  version: SCHEMA_VERSION,
  projects: [],
  sequences: [],
  lines: [],
  boards: [],
  columns: [],
  tasks: []
})

/** Colonnes d'un tableau neuf, dans l'ordre où le travail avance. */
export const DEFAULT_COLUMNS = ['À faire', 'En cours', 'En révision', 'Terminé']

const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

/** Ordre d'affichage : Urgente d'abord, Basse en dernier. */
export const priorityRank = (priority: Priority): number => PRIORITY_RANK[priority] ?? 2

export const defaultHistory = (): HistoryFile => ({
  version: SCHEMA_VERSION,
  entries: []
})

export const defaultUi = (): UiFile => ({
  version: SCHEMA_VERSION,
  window: { ...DEFAULT_WINDOW },
  theme: 'system',
  tabs: [],
  activeTabId: null,
  explorer: { toolId: null, projectId: null },
  sidebar: { open: false, panel: 'history', width: 320 },
  split: { tabId: null, ratio: 0.5 },
  security: { prompted: false, idleLockMinutes: 15 }
})
