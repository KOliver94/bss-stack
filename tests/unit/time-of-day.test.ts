import { describe, expect, it } from 'vitest'
import { parseTimeOfDay } from '#/components/admin/form.tsx'

describe('parseTimeOfDay', () => {
  it('elfogadja a szokásos beírási formákat', () => {
    expect(parseTimeOfDay('19:30')).toBe('19:30')
    expect(parseTimeOfDay('9:05')).toBe('09:05')
    expect(parseTimeOfDay('19.30')).toBe('19:30')
    expect(parseTimeOfDay('1930')).toBe('19:30')
    expect(parseTimeOfDay('930')).toBe('09:30')
    expect(parseTimeOfDay(' 19 ')).toBe('19:00')
  })

  it('érvénytelen időpontra null', () => {
    expect(parseTimeOfDay('')).toBeNull()
    expect(parseTimeOfDay('24:00')).toBeNull()
    expect(parseTimeOfDay('19:60')).toBeNull()
    expect(parseTimeOfDay('19:')).toBeNull()
    expect(parseTimeOfDay('abc')).toBeNull()
  })
})
