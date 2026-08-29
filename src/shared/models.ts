/**
 * Modèles partagés entre le processus principal et le renderer.
 * Toute évolution de forme doit s'accompagner d'un incrément de SCHEMA_VERSION
 * et d'une étape dans `migrate.ts`.
 */

export const SCHEMA_VERSION = 1

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
  hidden: boolean
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
  | 'comment'
  | 'import'

export type EntityType = 'project' | 'sequence' | 'line'

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
export type SidebarPanel = 'history' | 'hidden'

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

export interface UiState {
  window: WindowState
  theme: ThemeMode
  tabs: TabState[]
  /** `null` = la pastille Explorer est active. */
  activeTabId: string | null
  /** Dernier emplacement visité dans l'explorateur, pour y revenir au lancement. */
  explorer: { toolId: string | null; projectId: string | null }
  sidebar: { open: boolean; panel: SidebarPanel; width: number }
}

export interface DataFile {
  version: number
  projects: Project[]
  sequences: Sequence[]
  lines: Line[]
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
  lines: []
})

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
  sidebar: { open: false, panel: 'history', width: 320 }
})
