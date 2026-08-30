import { useDataStore } from '@/stores/data'
import { useHistoryStore } from '@/stores/history'
import { useUiStore } from '@/stores/ui'
import { flushAll } from '@/lib/persist'
import { looksLikeBackup, migrateData, migrateHistory, migrateUi } from '@/lib/migrate'
import { isEncryptedBackup, type BackupFile, type EncryptedBackup } from '@shared/models'

/** Sauvegarde complète en un seul objet : donnée + journal + état d'interface. */
export function buildBackup(appVersion: string): BackupFile {
  return {
    app: 'JTools',
    appVersion,
    exportedAt: new Date().toISOString(),
    data: useDataStore().serialize(),
    history: useHistoryStore().serialize(),
    ui: useUiStore().serialize()
  }
}

export function backupToText(appVersion: string): string {
  return JSON.stringify(buildBackup(appVersion), null, 2)
}

/**
 * Copie la sauvegarde dans le presse-papiers. Coffre actif, c'est la version
 * chiffrée qui part — le presse-papiers est lisible par tout le poste.
 */
export async function copyBackup(appVersion: string): Promise<void> {
  const sealed = await window.jtools.backup.seal(backupToText(appVersion))
  window.jtools.clipboard.write(sealed)
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
  useHistoryStore().hydrate(migrateHistory(backup.history))
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

/**
 * Ouvre un fichier de sauvegarde. S'il est chiffré, `askSecret` est sollicité
 * pour obtenir la passphrase — celle du poste d'origine, qui n'est pas
 * forcément celle d'ici : c'est ce qui rend l'export réellement portable.
 */
export async function loadBackupFromFile(
  askSecret: () => Promise<string | null>,
  restoreUi = true
): Promise<RestoreResult | null> {
  const payload = await window.jtools.backup.load()
  if (payload === null) return null

  if (!isEncryptedBackup(payload)) return applyBackup(payload, restoreUi)

  const secret = await askSecret()
  if (!secret) return null

  const opened = await window.jtools.backup.openForeign(payload as EncryptedBackup, secret)
  if (!opened) {
    return { ok: false, reason: 'Mot de passe ou clé de secours incorrect.' }
  }
  return applyBackup(opened.backup, restoreUi)
}
