import { useDataStore } from '@/stores/data'
import { useUiStore } from '@/stores/ui'
import { flushAll } from '@/lib/persist'
import { looksLikeBackup, migrateData, migrateUi } from '@/lib/migrate'
import { defaultHistory, type BackupFile } from '@shared/models'

/** Sauvegarde complète en un seul objet : donnée + journal + état d'interface. */
export function buildBackup(appVersion: string): BackupFile {
  return {
    app: 'JTools',
    appVersion,
    exportedAt: new Date().toISOString(),
    data: useDataStore().serialize(),
    // Le journal reçoit son store en phase 6 ; la clé existe dès maintenant
    // pour que le format de sauvegarde ne change pas ensuite.
    history: defaultHistory(),
    ui: useUiStore().serialize()
  }
}

export function backupToText(appVersion: string): string {
  return JSON.stringify(buildBackup(appVersion), null, 2)
}

/** Copie la sauvegarde dans le presse-papiers. */
export function copyBackup(appVersion: string): void {
  window.jtools.clipboard.write(backupToText(appVersion))
}

/** Écrit la sauvegarde dans un fichier choisi par l'utilisateur. */
export function saveBackupToFile(appVersion: string): Promise<string | null> {
  return window.jtools.backup.save(backupToText(appVersion))
}

export interface RestoreResult {
  ok: boolean
  reason?: string
}

/**
 * Remplace l'état courant. `restoreUi: false` conserve les onglets et la
 * fenêtre en cours — utile pour récupérer des données sans casser sa session.
 */
export function applyBackup(input: unknown, restoreUi = true): RestoreResult {
  if (!looksLikeBackup(input)) {
    return { ok: false, reason: "Ce JSON n'est pas une sauvegarde JTools." }
  }
  const backup = input as BackupFile
  useDataStore().hydrate(migrateData(backup.data))
  if (restoreUi) useUiStore().hydrate(migrateUi(backup.ui))
  flushAll()
  return { ok: true }
}

/** Restaure depuis un JSON collé (presse-papiers ou champ texte). */
export function applyBackupText(text: string, restoreUi = true): RestoreResult {
  try {
    return applyBackup(JSON.parse(text), restoreUi)
  } catch {
    return { ok: false, reason: 'JSON illisible.' }
  }
}

export async function loadBackupFromFile(restoreUi = true): Promise<RestoreResult | null> {
  const payload = await window.jtools.backup.load()
  if (payload === null) return null
  return applyBackup(payload, restoreUi)
}
