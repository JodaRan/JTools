import { describe, expect, it } from 'vitest'
import {
  deriveKey,
  formatRecoveryKey,
  open,
  parseRecoveryKey,
  randomKey,
  randomSalt,
  seal
} from '../src/main/crypto'

/** Coût dérisoire : ici on vérifie le comportement, pas la résistance. */
const CHEAP = { N: 1 << 8, r: 8, p: 1 }

describe('chiffrement authentifié', () => {
  it('rend le texte d’origine avec la bonne clé', () => {
    const key = randomKey()
    const sealed = seal(key, 'mysqldump -u root — accentué ✓')
    expect(open(key, sealed).toString('utf-8')).toBe('mysqldump -u root — accentué ✓')
  })

  it('tire un nonce neuf à chaque scellement', () => {
    const key = randomKey()
    const a = seal(key, 'même texte')
    const b = seal(key, 'même texte')
    // Réutiliser un nonce avec la même clé casserait la confidentialité.
    expect(a.nonce).not.toBe(b.nonce)
    expect(a.ct).not.toBe(b.ct)
  })

  it('refuse une clé qui n’est pas la bonne', () => {
    const sealed = seal(randomKey(), 'secret')
    expect(() => open(randomKey(), sealed)).toThrow()
  })

  it('détecte un chiffré altéré au lieu de rendre n’importe quoi', () => {
    const key = randomKey()
    const sealed = seal(key, 'scp dump.sql serveur:/backups/')
    const bytes = Buffer.from(sealed.ct, 'base64')
    bytes[0] ^= 0xff
    expect(() => open(key, { ...sealed, ct: bytes.toString('base64') })).toThrow()
  })

  it('détecte un tag d’authenticité altéré', () => {
    const key = randomKey()
    const sealed = seal(key, 'clé privée')
    const tag = Buffer.from(sealed.tag, 'base64')
    tag[0] ^= 0xff
    expect(() => open(key, { ...sealed, tag: tag.toString('base64') })).toThrow()
  })
})

describe('dérivation de clé', () => {
  it('redonne la même clé pour la même passphrase et le même sel', async () => {
    const salt = randomSalt()
    const a = await deriveKey('correcte batterie agrafe cheval', salt, CHEAP)
    const b = await deriveKey('correcte batterie agrafe cheval', salt, CHEAP)
    expect(a.equals(b)).toBe(true)
  })

  it('donne une clé différente avec un autre sel', async () => {
    const phrase = 'correcte batterie agrafe cheval'
    const a = await deriveKey(phrase, randomSalt(), CHEAP)
    const b = await deriveKey(phrase, randomSalt(), CHEAP)
    expect(a.equals(b)).toBe(false)
  })

  it('normalise l’unicode pour qu’un « é » composé ouvre le même coffre', async () => {
    const salt = randomSalt()
    // Même mot, deux représentations : précomposée puis décomposée.
    const a = await deriveKey('café', salt, CHEAP)
    const b = await deriveKey('café', salt, CHEAP)
    expect(a.equals(b)).toBe(true)
  })
})

describe('clé de secours', () => {
  it('fait l’aller-retour sans perte', () => {
    const raw = randomKey()
    const parsed = parseRecoveryKey(formatRecoveryKey(raw))
    expect(parsed?.equals(raw)).toBe(true)
  })

  it('se relit malgré la casse, les espaces et les tirets manquants', () => {
    const raw = randomKey()
    const formatted = formatRecoveryKey(raw)
    const mangled = formatted.toLowerCase().replace(/-/g, ' ')
    expect(parseRecoveryKey(mangled)?.equals(raw)).toBe(true)
  })

  it('s’écrit sans les caractères qu’on confond à la relecture', () => {
    const formatted = formatRecoveryKey(randomKey())
    // 0/O et 1/I sont les seules paires réellement ambiguës à la main.
    expect(formatted).not.toMatch(/[01IO]/)
    expect(formatted).toMatch(/^[A-Z2-9]{5}(-[A-Z2-9]{1,5})+$/)
  })

  it('porte bien 256 bits d’entropie', () => {
    // 32 octets en base32 : 52 caractères, en 11 groupes.
    const groups = formatRecoveryKey(randomKey()).split('-')
    expect(groups.join('').length).toBe(52)
    expect(groups.length).toBe(11)
  })

  it('rejette une clé tronquée plutôt que de deviner', () => {
    const formatted = formatRecoveryKey(randomKey())
    expect(parseRecoveryKey(formatted.slice(0, 20))).toBeNull()
  })
})
