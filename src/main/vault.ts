/**
 * Le coffre : gestion de la clé, verrouillage, changement de passphrase.
 *
 * La clé de données (DEK) ne vit que dans ce module, dans le processus
 * principal, et jamais dans le renderer. `vault.json` ne contient que du
 * matériel de clé — aucune donnée métier.
 *
 * Le coffre est facultatif : sans `vault.json`, les fichiers restent en clair
 * et l'application se comporte exactement comme avant.
 */
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  SCRYPT_PARAMS,
  deriveKey,
  formatRecoveryKey,
  open,
  parseRecoveryKey,
  randomKey,
  randomSalt,
  seal,
  type Sealed
} from './crypto'

export interface VaultFile {
  v: 1
  kdf: { alg: 'scrypt'; salt: string; N: number; r: number; p: number }
  /** DEK encapsulée par la clé dérivée de la passphrase. */
  passphrase: Sealed
  /** DEK encapsulée par la clé de secours. */
  recovery: Sealed
  createdAt: string
  updatedAt: string
}

export type UnlockResult =
  | { ok: true }
  | { ok: false; reason: 'no-vault' | 'bad-passphrase' | 'bad-recovery' | 'unreadable' }

let vaultPath = ''
/** `null` = verrouillé, ou pas de coffre du tout. */
let dek: Buffer | null = null
/**
 * Coût de dérivation des coffres créés ici. Paramétrable pour que la suite de
 * tests ne paie pas une seconde de scrypt par assertion ; la production ne
 * passe jamais cet argument. Les paramètres réellement utilisés sont écrits
 * dans le fichier, donc un coffre reste lisible quel que soit ce réglage.
 */
let kdfParams: { N: number; r: number; p: number } = SCRYPT_PARAMS

export function initVault(
  storageDirectory: string,
  params?: { N: number; r: number; p: number }
): void {
  vaultPath = join(storageDirectory, 'vault.json')
  kdfParams = params ?? SCRYPT_PARAMS
}

export const isConfigured = (): boolean => vaultPath !== '' && existsSync(vaultPath)
export const isUnlocked = (): boolean => dek !== null

/** Clé de chiffrement courante, ou `null` si le stockage doit rester en clair. */
export const currentKey = (): Buffer | null => dek

function readVault(): VaultFile | null {
  try {
    return JSON.parse(readFileSync(vaultPath, 'utf-8')) as VaultFile
  } catch {
    return null
  }
}

/** Écriture atomique : perdre `vault.json` rendrait toutes les données illisibles. */
function writeVault(file: VaultFile): void {
  const tmp = `${vaultPath}.tmp`
  writeFileSync(tmp, JSON.stringify(file, null, 2), 'utf-8')
  renameSync(tmp, vaultPath)
}

/**
 * Efface la clé de la mémoire. On écrase le tampon avant de le lâcher plutôt
 * que d'attendre le ramasse-miettes, qui pourrait le laisser traîner.
 */
export function lock(): void {
  dek?.fill(0)
  dek = null
}

/**
 * Active le coffre. Renvoie la clé de secours en clair — c'est la seule fois
 * où elle est lisible, elle n'est stockée nulle part.
 */
export async function create(passphrase: string): Promise<{ recoveryKey: string }> {
  const key = randomKey()
  const salt = randomSalt()
  const recoveryRaw = randomKey()

  const kek = await deriveKey(passphrase, salt, kdfParams)
  const stamp = new Date().toISOString()

  writeVault({
    v: 1,
    kdf: { alg: 'scrypt', salt: salt.toString('base64'), ...kdfParams },
    passphrase: seal(kek, key),
    recovery: seal(recoveryRaw, key),
    createdAt: stamp,
    updatedAt: stamp
  })

  kek.fill(0)
  dek = key
  const formatted = formatRecoveryKey(recoveryRaw)
  recoveryRaw.fill(0)
  return { recoveryKey: formatted }
}

export async function unlock(passphrase: string): Promise<UnlockResult> {
  const file = readVault()
  if (!file) return { ok: false, reason: isConfigured() ? 'unreadable' : 'no-vault' }

  const kek = await deriveKey(passphrase, Buffer.from(file.kdf.salt, 'base64'), file.kdf)
  try {
    dek = open(kek, file.passphrase)
    return { ok: true }
  } catch {
    // Le tag GCM n'a pas passé : la passphrase est fausse.
    return { ok: false, reason: 'bad-passphrase' }
  } finally {
    kek.fill(0)
  }
}

export function unlockWithRecovery(recoveryKey: string): UnlockResult {
  const file = readVault()
  if (!file) return { ok: false, reason: isConfigured() ? 'unreadable' : 'no-vault' }

  const raw = parseRecoveryKey(recoveryKey)
  if (!raw) return { ok: false, reason: 'bad-recovery' }

  try {
    dek = open(raw, file.recovery)
    return { ok: true }
  } catch {
    return { ok: false, reason: 'bad-recovery' }
  } finally {
    raw.fill(0)
  }
}

/**
 * Change la passphrase sans toucher aux données : seule l'encapsulation de la
 * DEK est refaite. La clé de secours reste valable.
 */
export async function changePassphrase(
  current: string,
  next: string
): Promise<{ ok: boolean }> {
  const file = readVault()
  if (!file || !dek) return { ok: false }

  // On revérifie l'ancienne passphrase même déverrouillé : sans ça, quiconque
  // passe devant un écran déverrouillé pourrait s'approprier le coffre.
  const currentKek = await deriveKey(current, Buffer.from(file.kdf.salt, 'base64'), file.kdf)
  try {
    open(currentKek, file.passphrase)
  } catch {
    return { ok: false }
  } finally {
    currentKek.fill(0)
  }

  // Sel neuf : deux mots de passe successifs ne doivent pas partager de dérivé.
  const salt = randomSalt()
  const kek = await deriveKey(next, salt, kdfParams)
  writeVault({
    ...file,
    kdf: { alg: 'scrypt', salt: salt.toString('base64'), ...kdfParams },
    passphrase: seal(kek, dek),
    updatedAt: new Date().toISOString()
  })
  kek.fill(0)
  return { ok: true }
}

/** Regénère la clé de secours et invalide l'ancienne. */
export async function regenerateRecoveryKey(
  passphrase: string
): Promise<{ ok: boolean; recoveryKey?: string }> {
  const file = readVault()
  if (!file || !dek) return { ok: false }

  const kek = await deriveKey(passphrase, Buffer.from(file.kdf.salt, 'base64'), file.kdf)
  try {
    open(kek, file.passphrase)
  } catch {
    return { ok: false }
  } finally {
    kek.fill(0)
  }

  const recoveryRaw = randomKey()
  writeVault({
    ...file,
    recovery: seal(recoveryRaw, dek),
    updatedAt: new Date().toISOString()
  })
  const formatted = formatRecoveryKey(recoveryRaw)
  recoveryRaw.fill(0)
  return { ok: true, recoveryKey: formatted }
}

/**
 * Matériel de clé à embarquer dans un export, pour qu'il s'ouvre sur une autre
 * machine. Il ne contient que la DEK encapsulée : sans la passphrase ou la clé
 * de secours, il ne sert à rien.
 */
export const exportVaultFile = (): VaultFile | null => readVault()

/**
 * Ouvre un chiffré accompagné du coffre qui l'a produit — le cas d'un export
 * venu d'un autre poste, dont la passphrase n'est pas celle d'ici.
 */
export async function openForeign(
  file: VaultFile,
  secret: string,
  sealed: Sealed
): Promise<Buffer | null> {
  const unwrap = async (): Promise<Buffer | null> => {
    // Une clé de secours se reconnaît à sa forme ; sinon c'est une passphrase.
    const recovery = parseRecoveryKey(secret)
    if (recovery) {
      try {
        return open(recovery, file.recovery)
      } catch {
        return null
      } finally {
        recovery.fill(0)
      }
    }
    const kek = await deriveKey(secret, Buffer.from(file.kdf.salt, 'base64'), file.kdf)
    try {
      return open(kek, file.passphrase)
    } catch {
      return null
    } finally {
      kek.fill(0)
    }
  }

  const key = await unwrap()
  if (!key) return null
  try {
    return open(key, sealed)
  } catch {
    return null
  } finally {
    key.fill(0)
  }
}

/**
 * Désactive le coffre. L'appelant doit avoir réécrit les fichiers en clair
 * AVANT d'appeler ceci : supprimer `vault.json` d'abord rendrait des données
 * encore chiffrées définitivement illisibles.
 */
export async function disable(passphrase: string): Promise<{ ok: boolean }> {
  const file = readVault()
  if (!file) return { ok: false }

  const kek = await deriveKey(passphrase, Buffer.from(file.kdf.salt, 'base64'), file.kdf)
  try {
    open(kek, file.passphrase)
  } catch {
    return { ok: false }
  } finally {
    kek.fill(0)
  }

  rmSync(vaultPath, { force: true })
  lock()
  return { ok: true }
}
