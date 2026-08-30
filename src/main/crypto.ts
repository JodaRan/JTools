/**
 * Primitives cryptographiques du coffre. Tout est dans Node 22 : aucune
 * dépendance, rien à compiler.
 *
 * Choix de conception : une passphrase ne chiffre jamais les données
 * directement. Elle dérive une clé d'encapsulation (KEK) qui protège une clé
 * de données (DEK) tirée au hasard. Changer de mot de passe ne réencapsule
 * alors que la DEK — une écriture de quelques centaines d'octets — au lieu de
 * rechiffrer tous les fichiers.
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt,
  type ScryptOptions
} from 'node:crypto'

/**
 * `promisify` retient la surcharge sans options de `scrypt`, qui ne permet pas
 * de régler le coût. On enveloppe donc à la main.
 */
const scryptAsync = (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, key) => {
      if (err) reject(err)
      else resolve(key)
    })
  })

/**
 * Coût de dérivation. N=2^17 avec r=8 demande ~134 Mio et environ une seconde :
 * imperceptible une fois par démarrage, mais qui rend le cassage hors ligne
 * d'une passphrase correcte hors de portée.
 *
 * Les paramètres sont écrits dans l'enveloppe : un fichier ancien reste lisible
 * si on les durcit plus tard.
 */
export const SCRYPT_PARAMS = { N: 1 << 17, r: 8, p: 1 } as const

/** `maxmem` par défaut de Node est de 32 Mio — bien trop bas pour ce coût. */
const SCRYPT_MAXMEM = 256 * 1024 * 1024

export const KEY_BYTES = 32
export const SALT_BYTES = 16
/** 96 bits : la taille pour laquelle GCM est spécifié. */
export const NONCE_BYTES = 12

/** Chiffré autonome : nonce + texte chiffré + tag d'authenticité. */
export interface Sealed {
  nonce: string
  ct: string
  tag: string
}

export const randomKey = (): Buffer => randomBytes(KEY_BYTES)
export const randomSalt = (): Buffer => randomBytes(SALT_BYTES)

/** Dérive une clé d'encapsulation depuis une passphrase. */
export async function deriveKey(
  passphrase: string,
  salt: Buffer,
  params: { N: number; r: number; p: number } = SCRYPT_PARAMS
): Promise<Buffer> {
  return scryptAsync(passphrase.normalize('NFKC'), salt, KEY_BYTES, {
    ...params,
    maxmem: SCRYPT_MAXMEM
  })
}

/**
 * Chiffre avec AES-256-GCM. Un nonce neuf est tiré à chaque appel : le
 * réutiliser avec la même clé casserait complètement la confidentialité.
 */
export function seal(key: Buffer, plaintext: Buffer | string): Sealed {
  const nonce = randomBytes(NONCE_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  const ct = Buffer.concat([
    cipher.update(typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf-8') : plaintext),
    cipher.final()
  ])
  return {
    nonce: nonce.toString('base64'),
    ct: ct.toString('base64'),
    tag: cipher.getAuthTag().toString('base64')
  }
}

/**
 * Déchiffre et authentifie. Lève si la clé est fausse ou si le chiffré a été
 * altéré — le tag GCM ne laisse pas passer une modification silencieuse.
 */
export function open(key: Buffer, sealed: Sealed): Buffer {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(sealed.nonce, 'base64')
  )
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(sealed.ct, 'base64')), decipher.final()])
}

const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/**
 * Clé de secours : 256 bits d'entropie, présentés en groupes lisibles.
 * L'alphabet écarte 0, 1, I et O : les seules paires qu'on confond vraiment en
 * recopiant à la main. `L` peut rester, puisque le `1` avec lequel on le
 * confondrait n'y figure pas.
 *
 * Elle sert de clé d'encapsulation telle quelle : elle est déjà aléatoire, la
 * faire passer par un KDF n'ajouterait rien.
 */
export function formatRecoveryKey(raw: Buffer): string {
  let bits = 0
  let value = 0
  const chars: string[] = []
  for (const byte of raw) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      chars.push(RECOVERY_ALPHABET[(value >>> (bits - 5)) & 31])
      bits -= 5
    }
  }
  if (bits > 0) chars.push(RECOVERY_ALPHABET[(value << (5 - bits)) & 31])
  return (chars.join('').match(/.{1,5}/g) ?? []).join('-')
}

/** Inverse de `formatRecoveryKey`, tolérant sur la casse et les séparateurs. */
export function parseRecoveryKey(input: string): Buffer | null {
  const clean = input.toUpperCase().replace(/[^A-Z2-9]/g, '')
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of clean) {
    const index = RECOVERY_ALPHABET.indexOf(char)
    if (index === -1) return null
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  if (bytes.length !== KEY_BYTES) return null
  return Buffer.from(bytes)
}
