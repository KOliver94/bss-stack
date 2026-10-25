export interface ImageSize {
  width: number
  height: number
}

export type ImageProbe = ImageSize | null | undefined

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const PNG_HEADER_LENGTH = 24
const PROBE_TIMEOUT_MS = 1500
const CACHE_LIMIT = 2000

const cache = new Map<string, ImageSize | null>()

export function parsePngSize(bytes: Uint8Array): ImageSize | null {
  if (
    bytes.length < PNG_HEADER_LENGTH ||
    PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)
  ) {
    return null
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const width = view.getUint32(16)
  const height = view.getUint32(20)
  return width > 0 && height > 0 ? { width, height } : null
}

async function readPrefix(
  response: Response,
  length: number,
): Promise<Uint8Array> {
  const bytes = new Uint8Array(length)
  let received = 0
  if (response.body === null) {
    return bytes.subarray(0, 0)
  }
  const reader = response.body.getReader()
  try {
    while (received < length) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      const chunk = value.subarray(0, length - received)
      bytes.set(chunk, received)
      received += chunk.length
    }
  } finally {
    await reader.cancel()
  }
  return bytes.subarray(0, received)
}

export async function probePngSize(url: string): Promise<ImageProbe> {
  if (cache.has(url)) {
    return cache.get(url)
  }
  let result: ImageSize | null
  try {
    const response = await fetch(url, {
      headers: { range: `bytes=0-${PNG_HEADER_LENGTH - 1}` },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    if (response.status === 404) {
      result = null
    } else if (!response.ok) {
      return undefined
    } else {
      result = parsePngSize(await readPrefix(response, PNG_HEADER_LENGTH))
    }
  } catch {
    // Timeouts and network errors aren't cached, so the next request retries.
    return undefined
  }
  if (cache.size >= CACHE_LIMIT) {
    cache.delete(cache.keys().next().value!)
  }
  cache.set(url, result)
  return result
}
