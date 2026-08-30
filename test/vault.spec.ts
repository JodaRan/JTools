import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as vault from '../src/main/vault'

/**
 * Coût de dérivation réduit : la suite ferait sinon plusieurs secondes de
 * scrypt par test. Le comportement vérifié est le même.
 */
const CHEAP = { N: 1 << 8, r: 8, p: 1 }

const PASS = 'correcte batterie agrafe cheval'

let dir = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'jtools-vault-'))
  vault.initVault(dir, CHEAP)
})

afterEach(() => {
  vault.lock()
  rmSync(dir, { recursive: true, force: true })
})

const vaultJson = (): Record<string, unknown> =>
  JSON.parse(readFileSync(join(dir, 'vault.json'), 'utf-8'))

describe('coffre — activation', () => {
  it('part désactivé, donc en clair', () => {
    expect(vault.isConfigured()).toBe(false)
    expect(vault.isUnlocked()).toBe(false)
    expect(vault.currentKey()).toBeNull()
  })

  it('à la création, ouvre le coffre et rend une clé de secours', async () => {
    const { recoveryKey } = await vault.create(PASS)
    expect(vault.isConfigured()).toBe(true)
    expect(vault.isUnlocked()).toBe(true)
    expect(recoveryKey).toMatch(/^[A-Z2-9]{5}-/)
  })

  it('n’écrit aucun secret en clair dans vault.json', async () => {
    const { recoveryKey } = await vault.create(PASS)
    const raw = readFileSync(join(dir, 'vault.json'), 'utf-8')
    expect(raw).not.toContain(PASS)
    expect(raw).not.toContain(recoveryKey)
    // Le fichier ne porte que du matériel de clé, jamais la clé elle-même.
    expect(vaultJson()).toHaveProperty('kdf')
    expect(raw).not.toContain(vault.currentKey()!.toString('base64'))
  })
})

describe('coffre — déverrouillage', () => {
  it('rouvre avec la bonne passphrase et retrouve la même clé', async () => {
    await vault.create(PASS)
    const before = Buffer.from(vault.currentKey()!)

    vault.lock()
    expect(vault.isUnlocked()).toBe(false)
    expect(vault.currentKey()).toBeNull()

    expect(await vault.unlock(PASS)).toEqual({ ok: true })
    expect(vault.currentKey()!.equals(before)).toBe(true)
  })

  it('refuse une passphrase fausse et reste fermé', async () => {
    await vault.create(PASS)
    vault.lock()

    expect(await vault.unlock('pas le bon')).toEqual({ ok: false, reason: 'bad-passphrase' })
    expect(vault.isUnlocked()).toBe(false)
  })

  it('ouvre avec la clé de secours', async () => {
    const { recoveryKey } = await vault.create(PASS)
    const before = Buffer.from(vault.currentKey()!)
    vault.lock()

    expect(vault.unlockWithRecovery(recoveryKey)).toEqual({ ok: true })
    expect(vault.currentKey()!.equals(before)).toBe(true)
  })

  it('refuse une clé de secours mal formée ou étrangère', async () => {
    await vault.create(PASS)
    vault.lock()

    expect(vault.unlockWithRecovery('TROP-COURT')).toEqual({ ok: false, reason: 'bad-recovery' })
    expect(vault.isUnlocked()).toBe(false)
  })
})

describe('coffre — changement de passphrase', () => {
  it('garde la même clé de données, donc ne rechiffre rien', async () => {
    await vault.create(PASS)
    const before = Buffer.from(vault.currentKey()!)

    expect(await vault.changePassphrase(PASS, 'nouvelle phrase de passe')).toEqual({ ok: true })
    // C'est tout l'intérêt de l'encapsulation : les fichiers ne bougent pas.
    expect(vault.currentKey()!.equals(before)).toBe(true)
  })

  it('n’ouvre plus qu’avec la nouvelle', async () => {
    await vault.create(PASS)
    await vault.changePassphrase(PASS, 'nouvelle phrase de passe')
    vault.lock()

    expect(await vault.unlock(PASS)).toEqual({ ok: false, reason: 'bad-passphrase' })
    expect(await vault.unlock('nouvelle phrase de passe')).toEqual({ ok: true })
  })

  it('exige l’ancienne passphrase même quand le coffre est ouvert', async () => {
    await vault.create(PASS)
    expect(await vault.changePassphrase('mauvaise', 'peu importe')).toEqual({ ok: false })
    vault.lock()
    // Le changement n'a pas eu lieu : l'ancienne ouvre toujours.
    expect(await vault.unlock(PASS)).toEqual({ ok: true })
  })

  it('tire un sel neuf, pour que deux mots de passe ne partagent rien', async () => {
    await vault.create(PASS)
    const saltBefore = (vaultJson().kdf as { salt: string }).salt
    await vault.changePassphrase(PASS, 'nouvelle phrase de passe')
    expect((vaultJson().kdf as { salt: string }).salt).not.toBe(saltBefore)
  })

  it('laisse la clé de secours valable', async () => {
    const { recoveryKey } = await vault.create(PASS)
    await vault.changePassphrase(PASS, 'nouvelle phrase de passe')
    vault.lock()
    expect(vault.unlockWithRecovery(recoveryKey)).toEqual({ ok: true })
  })
})

describe('coffre — clé de secours régénérée', () => {
  it('invalide l’ancienne et accepte la nouvelle', async () => {
    const { recoveryKey: old } = await vault.create(PASS)
    const { ok, recoveryKey: fresh } = await vault.regenerateRecoveryKey(PASS)
    expect(ok).toBe(true)

    vault.lock()
    expect(vault.unlockWithRecovery(old)).toEqual({ ok: false, reason: 'bad-recovery' })
    expect(vault.unlockWithRecovery(fresh!)).toEqual({ ok: true })
  })

  it('refuse sans la passphrase', async () => {
    await vault.create(PASS)
    expect(await vault.regenerateRecoveryKey('mauvaise')).toEqual({ ok: false })
  })
})

describe('coffre — désactivation', () => {
  it('retire le fichier et repasse en clair', async () => {
    await vault.create(PASS)
    expect(await vault.disable(PASS)).toEqual({ ok: true })

    expect(existsSync(join(dir, 'vault.json'))).toBe(false)
    expect(vault.isConfigured()).toBe(false)
    expect(vault.currentKey()).toBeNull()
  })

  it('refuse sans la passphrase, et n’efface rien', async () => {
    await vault.create(PASS)
    expect(await vault.disable('mauvaise')).toEqual({ ok: false })
    expect(existsSync(join(dir, 'vault.json'))).toBe(true)
    expect(vault.isUnlocked()).toBe(true)
  })
})
