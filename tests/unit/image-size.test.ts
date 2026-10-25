import { afterEach, describe, expect, it } from 'vitest'
import { parsePngSize, probePngSize } from '#/server/media/image-size.ts'
import { installFetchMock } from '../helpers/http-mock.ts'
import type { FetchMock } from '../helpers/http-mock.ts'

function pngHeader(width: number, height: number): Buffer {
  const header = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header)
  header.writeUInt32BE(13, 8)
  header.write('IHDR', 12, 'ascii')
  header.writeUInt32BE(width, 16)
  header.writeUInt32BE(height, 20)
  return header
}

describe('PNG méret kiolvasása', () => {
  let fetchMock: FetchMock | undefined

  afterEach(() => {
    fetchMock?.restore()
    fetchMock = undefined
  })

  it('a fejlécből kiolvassa a szélességet és a magasságot', () => {
    expect(parsePngSize(pngHeader(768, 432))).toEqual({
      width: 768,
      height: 432,
    })
    expect(parsePngSize(Buffer.from('<html>not a png</html>'))).toBeNull()
    expect(parsePngSize(pngHeader(768, 432).subarray(0, 20))).toBeNull()
  })

  it('a távoli képnek csak a fejlécét kéri le, és megjegyzi az eredményt', async () => {
    fetchMock = installFetchMock([
      {
        urlPattern: '/keyframe/meret.png',
        respond: () => ({ status: 206, body: pngHeader(640, 480) }),
      },
    ])
    const url = 'https://media.test/keyframe/meret.png'
    expect(await probePngSize(url)).toEqual({ width: 640, height: 480 })
    expect(await probePngSize(url)).toEqual({ width: 640, height: 480 })
    expect(fetchMock.calls()).toHaveLength(1)
  })

  it('a hiányzó képet null-lal, a hibát undefined-dal jelzi', async () => {
    fetchMock = installFetchMock([
      {
        urlPattern: '/keyframe/hianyzik.png',
        respond: () => ({ status: 404 }),
      },
      { urlPattern: '/keyframe/hiba.png', respond: () => ({ status: 503 }) },
    ])
    expect(
      await probePngSize('https://media.test/keyframe/hianyzik.png'),
    ).toBeNull()
    expect(
      await probePngSize('https://media.test/keyframe/hiba.png'),
    ).toBeUndefined()
  })
})
