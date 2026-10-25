import { describe, expect, it } from 'vitest'
import {
  InvalidInputError,
  idInput,
  integerInput,
  optionalNumberInput,
  searchInput,
  stringInput,
} from '#/server/shared/server-fn-input.ts'
import { videoListSearchInput } from '#/server/pages/video-list.ts'

const VIDEO_ID = '0b6f6a3e-5c1d-4f7a-9a51-2f0c8d7e6b41'

describe('Szerverfüggvény-bemenetek ellenőrzése', () => {
  it('az azonosító csak UUID lehet', () => {
    expect(idInput({ id: VIDEO_ID })).toEqual({ id: VIDEO_ID })
    for (const input of [
      undefined,
      null,
      VIDEO_ID,
      {},
      { id: 42 },
      { id: 'nem-uuid' },
      { id: `${VIDEO_ID}' or '1'='1` },
    ]) {
      expect(() => idInput(input), JSON.stringify(input)).toThrow(
        InvalidInputError,
      )
    }
  })

  it('a keresési paraméterek csak szöveget és számot tartalmazhatnak', () => {
    expect(searchInput(undefined)).toEqual({})
    expect(searchInput({ q: 'koncert', page: 2 })).toEqual({
      q: 'koncert',
      page: 2,
    })
    for (const input of [
      null,
      'koncert',
      ['koncert'],
      { q: { $ne: '' } },
      { tag: ['a', 'b'] },
    ]) {
      expect(() => searchInput(input), JSON.stringify(input)).toThrow(
        InvalidInputError,
      )
    }
  })

  it('a szöveg és a szám típusát nem váltja át', () => {
    expect(stringInput('abc')).toBe('abc')
    expect(() => stringInput(5)).toThrow(InvalidInputError)
    expect(optionalNumberInput(undefined)).toBeUndefined()
    expect(optionalNumberInput(3)).toBe(3)
    expect(() => optionalNumberInput('3')).toThrow(InvalidInputError)
  })

  it('az egész számnak a megadott tartományba kell esnie', () => {
    expect(integerInput(50, 1, 50)).toBe(50)
    for (const value of [0, 51, 1.5, '10', undefined]) {
      expect(() => integerInput(value, 1, 50), String(value)).toThrow(
        InvalidInputError,
      )
    }
  })

  it('a videólista címkéi szövegek vagy szöveglista', () => {
    expect(
      videoListSearchInput({
        q: 'gólya',
        page: '2',
        tags: ['koncert', 'tánc'],
      }),
    ).toMatchObject({ q: 'gólya', page: '2', tags: ['koncert', 'tánc'] })
    expect(videoListSearchInput({ tags: 'koncert' })).toMatchObject({
      tags: 'koncert',
    })
    for (const input of [{ tags: [1] }, { q: 5 }, { page: {} }, 'gólya']) {
      expect(() => videoListSearchInput(input), JSON.stringify(input)).toThrow(
        InvalidInputError,
      )
    }
  })
})
