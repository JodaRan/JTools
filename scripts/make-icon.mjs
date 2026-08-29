/**
 * Génère `build/icon.ico` — un « J » blanc sur pastille verte, aux couleurs de
 * l'app. Écrit le PNG et l'ICO à la main : aucune dépendance graphique, et
 * l'icône reste régénérable si la charte change.
 *
 * Usage : `node scripts/make-icon.mjs`
 */
import { deflateSync } from 'node:zlib'
import * as fs from 'node:fs'
import * as path from 'node:path'

const SIZE = 256
const SS = 4 // suréchantillonnage, pour des bords lissés
const ACCENT = [24, 160, 88]
const WHITE = [255, 255, 255]

// — Géométrie du glyphe, en coordonnées 256 —
const RADIUS = 56 // arrondi de la pastille
const STEM = { x0: 146, x1: 182, y0: 52, y1: 150 }
const HOOK = { cx: 114, cy: 150, inner: 32, outer: 68 }

/** Pastille aux coins arrondis. */
function inBadge(x, y) {
  const dx = Math.max(RADIUS - x, 0, x - (SIZE - RADIUS))
  const dy = Math.max(RADIUS - y, 0, y - (SIZE - RADIUS))
  return dx * dx + dy * dy <= RADIUS * RADIUS
}

/** Le J : une hampe verticale prolongée par un demi-anneau vers la gauche. */
function inLetter(x, y) {
  if (x >= STEM.x0 && x <= STEM.x1 && y >= STEM.y0 && y <= STEM.y1) return true
  if (y < HOOK.cy) return false
  const dx = x - HOOK.cx
  const dy = y - HOOK.cy
  const d2 = dx * dx + dy * dy
  return d2 >= HOOK.inner * HOOK.inner && d2 <= HOOK.outer * HOOK.outer
}

function renderPixels() {
  const pixels = Buffer.alloc(SIZE * SIZE * 4)
  const samples = SS * SS
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let badge = 0
      let letter = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS
          const py = y + (sy + 0.5) / SS
          if (inBadge(px, py)) badge++
          if (inLetter(px, py)) letter++
        }
      }
      const alpha = badge / samples
      const ink = letter / samples
      const offset = (y * SIZE + x) * 4
      for (let channel = 0; channel < 3; channel++) {
        pixels[offset + channel] = Math.round(
          ACCENT[channel] * (1 - ink) + WHITE[channel] * ink
        )
      }
      pixels[offset + 3] = Math.round(alpha * 255)
    }
  }
  return pixels
}

// — Encodage PNG —

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePng(pixels) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(SIZE, 0)
  header.writeUInt32BE(SIZE, 4)
  header[8] = 8 // 8 bits par canal
  header[9] = 6 // RGBA
  header[10] = 0
  header[11] = 0
  header[12] = 0

  // Chaque ligne est précédée de son octet de filtre (0 = aucun).
  const stride = SIZE * 4
  const raw = Buffer.alloc((stride + 1) * SIZE)
  for (let y = 0; y < SIZE; y++) {
    raw[y * (stride + 1)] = 0
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/** ICO moderne : une seule entrée, dont la charge utile est le PNG. */
function encodeIco(png) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2) // type icône
  header.writeUInt16LE(1, 4) // une image

  const entry = Buffer.alloc(16)
  entry[0] = 0 // 0 signifie 256 px
  entry[1] = 0
  entry.writeUInt16LE(1, 4) // plans
  entry.writeUInt16LE(32, 6) // bits par pixel
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(22, 12) // décalage du PNG

  return Buffer.concat([header, entry, png])
}

const outDir = path.resolve(import.meta.dirname, '../build')
fs.mkdirSync(outDir, { recursive: true })

const png = encodePng(renderPixels())
fs.writeFileSync(path.join(outDir, 'icon.png'), png)
fs.writeFileSync(path.join(outDir, 'icon.ico'), encodeIco(png))
console.log(`icône écrite : ${path.join(outDir, 'icon.ico')} (${png.length} octets de PNG)`)
