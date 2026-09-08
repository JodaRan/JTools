import { describe, expect, it } from 'vitest'
import * as path from 'node:path'
import {
  STORAGE_DIR,
  TEST_PROFILE,
  assertIsolated,
  isInsideRealStorage
} from '../scripts/app-driver.mjs'

/**
 * Ces tests existent parce que la suite de vérification a réellement détruit
 * les données de l'utilisateur : elle effaçait le dossier de l'application
 * avant chaque scénario. Le profil de test est désormais ailleurs, et ce
 * garde-fou doit rester en place.
 */
describe('isolement des tests de bout en bout', () => {
  const APPDATA = 'C:\Users\Quelquun\AppData\Roaming'

  it('reconnaît le dossier réel de l’application', () => {
    expect(isInsideRealStorage(path.join(APPDATA, 'jtools'), APPDATA)).toBe(true)
    expect(isInsideRealStorage(path.join(APPDATA, 'jtools', 'JTools'), APPDATA)).toBe(true)
    expect(
      isInsideRealStorage(path.join(APPDATA, 'jtools', 'JTools', 'data.json'), APPDATA)
    ).toBe(true)
  })

  it('ne se déclenche pas sur un dossier voisin au nom proche', () => {
    expect(isInsideRealStorage(path.join(APPDATA, 'jtools-autre'), APPDATA)).toBe(false)
    expect(isInsideRealStorage(path.join(APPDATA, 'autre'), APPDATA)).toBe(false)
  })

  it('laisse passer le profil temporaire des tests', () => {
    expect(isInsideRealStorage(STORAGE_DIR, APPDATA)).toBe(false)
  })

  it('vise bien un profil jetable, hors du dossier de l’application', () => {
    expect(STORAGE_DIR.startsWith(TEST_PROFILE)).toBe(true)
    expect(isInsideRealStorage(STORAGE_DIR)).toBe(false)
    expect(() => assertIsolated()).not.toThrow()
  })
})
