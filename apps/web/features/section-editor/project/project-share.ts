import { createDefaultProjectInformation, type PmProjectDocument } from '@pm/project'

export const PROJECT_SHARE_HASH_KEY = 'project'

const PROJECT_SHARE_CODEC_VERSION = 'v1'
const PROJECT_SHARE_COMPRESSION = 'brotli'
const MAX_PROJECT_SHARE_PAYLOAD_CHARS = 12_000
const MAX_PROJECT_SHARE_JSON_BYTES = 1_000_000
const BINARY_CHUNK_SIZE = 0x8000
const BROTLI_WASM_OUTPUT_CHUNK_SIZE = 64 * 1024

type BrotliStreamResult = {
  buf: Uint8Array
  code: number
  input_offset: number
  free?: () => void
}

type BrotliWasmApi = {
  compress: (input: Uint8Array, options?: { quality?: number }) => Uint8Array
  decompress: (input: Uint8Array) => Uint8Array
  BrotliStreamResultCode: {
    ResultSuccess: number
    NeedsMoreInput: number
    NeedsMoreOutput: number
  }
  DecompressStream: new () => {
    decompress: (input: Uint8Array, outputSize: number) => BrotliStreamResult
    free: () => void
  }
}

let brotliWasmPromise: Promise<BrotliWasmApi> | null = null

const copyToArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

const bytesToBase64Url = (bytes: Uint8Array): string => {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += BINARY_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BINARY_CHUNK_SIZE))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

const base64UrlToBytes = (encoded: string): Uint8Array => {
  if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new Error('The shared project payload is not valid Base64 URL data.')
  }
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(encoded.length / 4) * 4, '=')
  let binary: string
  try {
    binary = atob(padded)
  } catch {
    throw new Error('The shared project payload is corrupted.')
  }
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

const readStreamWithLimit = async (
  stream: ReadableStream<Uint8Array>,
  maximumBytes: number
): Promise<Uint8Array> => {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > maximumBytes) {
      await reader.cancel()
      throw new Error('The shared project is too large to open safely.')
    }
    chunks.push(value)
  }

  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return merged
}

const isBrotliWasmApi = (value: unknown): value is BrotliWasmApi =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Partial<BrotliWasmApi>).compress === 'function' &&
  typeof (value as Partial<BrotliWasmApi>).decompress === 'function' &&
  typeof (value as Partial<BrotliWasmApi>).DecompressStream === 'function'

const resolveBrotliWasm = async (): Promise<BrotliWasmApi> => {
  let candidate: unknown = await import('brotli-wasm')
  for (let depth = 0; depth < 6; depth += 1) {
    if (isBrotliWasmApi(candidate)) return candidate
    if (
      typeof candidate === 'object' &&
      candidate !== null &&
      'then' in candidate &&
      typeof (candidate as PromiseLike<unknown>).then === 'function'
    ) {
      candidate = await candidate
      continue
    }
    if (typeof candidate === 'object' && candidate !== null && 'default' in candidate) {
      candidate = (candidate as { default: unknown }).default
      continue
    }
    break
  }
  throw new Error('The Brotli project-link codec could not be loaded.')
}

const loadBrotliWasm = (): Promise<BrotliWasmApi> => {
  brotliWasmPromise ??= resolveBrotliWasm()
  return brotliWasmPromise
}

const tryNativeBrotliCompression = async (input: Uint8Array): Promise<Uint8Array | null> => {
  if (typeof CompressionStream === 'undefined') return null
  try {
    return await readStreamWithLimit(
      new Blob([copyToArrayBuffer(input)])
        .stream()
        .pipeThrough(new CompressionStream(PROJECT_SHARE_COMPRESSION as CompressionFormat)),
      MAX_PROJECT_SHARE_JSON_BYTES
    )
  } catch {
    return null
  }
}

const tryNativeBrotliDecompression = async (input: Uint8Array): Promise<Uint8Array | null> => {
  if (typeof DecompressionStream === 'undefined') return null
  try {
    return await readStreamWithLimit(
      new Blob([copyToArrayBuffer(input)])
        .stream()
        .pipeThrough(new DecompressionStream(PROJECT_SHARE_COMPRESSION as CompressionFormat)),
      MAX_PROJECT_SHARE_JSON_BYTES
    )
  } catch {
    return null
  }
}

const compressProjectBytes = async (input: Uint8Array): Promise<Uint8Array> => {
  const native = await tryNativeBrotliCompression(input)
  if (native) return native
  const brotli = await loadBrotliWasm()
  const compressed = brotli.compress(input, { quality: 11 })
  if (compressed.byteLength > MAX_PROJECT_SHARE_JSON_BYTES) {
    throw new Error('The compressed project is too large to share safely.')
  }
  return compressed
}

const decompressProjectBytesWithWasm = async (
  brotli: BrotliWasmApi,
  input: Uint8Array
): Promise<Uint8Array> => {
  const stream = new brotli.DecompressStream()
  const chunks: Uint8Array[] = []
  let total = 0
  let inputOffset = 0

  try {
    for (let iteration = 0; iteration < 10_000; iteration += 1) {
      const result = stream.decompress(input.subarray(inputOffset), BROTLI_WASM_OUTPUT_CHUNK_SIZE)
      const chunk = result.buf.slice()
      const resultCode = result.code
      inputOffset += result.input_offset
      result.free?.()

      if (chunk.byteLength > 0) {
        total += chunk.byteLength
        if (total > MAX_PROJECT_SHARE_JSON_BYTES) {
          throw new Error('The shared project is too large to open safely.')
        }
        chunks.push(chunk)
      }

      if (resultCode === brotli.BrotliStreamResultCode.ResultSuccess) {
        const merged = new Uint8Array(total)
        let offset = 0
        for (const value of chunks) {
          merged.set(value, offset)
          offset += value.byteLength
        }
        return merged
      }
      if (resultCode === brotli.BrotliStreamResultCode.NeedsMoreOutput) continue
      if (resultCode === brotli.BrotliStreamResultCode.NeedsMoreInput && inputOffset < input.byteLength) continue
      throw new Error('The shared project Brotli stream is incomplete.')
    }
    throw new Error('The shared project Brotli stream exceeded the processing limit.')
  } finally {
    stream.free()
  }
}

const decompressProjectBytes = async (input: Uint8Array): Promise<Uint8Array> => {
  const native = await tryNativeBrotliDecompression(input)
  if (native) return native
  return decompressProjectBytesWithWasm(await loadBrotliWasm(), input)
}

const projectShareJson = (document: PmProjectDocument): string =>
  JSON.stringify({
    schema: document.schema,
    version: document.version,
    meta: {
      id: document.meta.id,
      name: document.meta.name,
      createdAt: document.meta.createdAt,
      updatedAt: document.meta.updatedAt
    },
    inputs: document.inputs
  })

const restoreProjectInformation = (json: string): string => {
  let value: unknown
  try {
    value = JSON.parse(json) as unknown
  } catch {
    throw new Error('The shared project does not contain valid JSON.')
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('The shared project document is invalid.')
  }
  const record = value as Record<string, unknown>
  if (typeof record.meta !== 'object' || record.meta === null || Array.isArray(record.meta)) {
    throw new Error('The shared project metadata is invalid.')
  }
  return JSON.stringify({
    ...record,
    meta: {
      ...(record.meta as Record<string, unknown>),
      information: createDefaultProjectInformation()
    }
  })
}

export const encodeProjectSharePayload = async (document: PmProjectDocument): Promise<string> => {
  const json = projectShareJson(document)
  const jsonBytes = new TextEncoder().encode(json)
  if (jsonBytes.byteLength > MAX_PROJECT_SHARE_JSON_BYTES) {
    throw new Error('This project is too large for a self-contained link. Use project export instead.')
  }

  const compressed = await compressProjectBytes(jsonBytes)
  const payload = `${PROJECT_SHARE_CODEC_VERSION}.${bytesToBase64Url(compressed)}`
  if (payload.length > MAX_PROJECT_SHARE_PAYLOAD_CHARS) {
    throw new Error('This project produces a link that is too long to share reliably. Use project export instead.')
  }
  return payload
}

export const decodeProjectSharePayload = async (payload: string): Promise<string> => {
  if (payload.length > MAX_PROJECT_SHARE_PAYLOAD_CHARS) {
    throw new Error('The shared project link is too long to open safely.')
  }
  const separator = payload.indexOf('.')
  if (separator < 0 || payload.slice(0, separator) !== PROJECT_SHARE_CODEC_VERSION) {
    throw new Error('This shared project link uses an unsupported format.')
  }

  const compressed = base64UrlToBytes(payload.slice(separator + 1))
  let decompressed: Uint8Array
  try {
    decompressed = await decompressProjectBytes(compressed)
  } catch (error) {
    if (error instanceof Error && error.message.includes('too large')) throw error
    throw new Error('The shared project payload could not be decompressed.')
  }

  let json: string
  try {
    json = new TextDecoder('utf-8', { fatal: true }).decode(decompressed)
  } catch {
    throw new Error('The shared project contains invalid text data.')
  }
  return restoreProjectInformation(json)
}

export const projectSharePayloadFromHash = (hash: string): string | null => {
  const parameters = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
  return parameters.get(PROJECT_SHARE_HASH_KEY)
}

export const createProjectShareUrl = async (
  document: PmProjectDocument,
  currentUrl: string
): Promise<string> => {
  const url = new URL(currentUrl)
  const parameters = new URLSearchParams()
  parameters.set(PROJECT_SHARE_HASH_KEY, await encodeProjectSharePayload(document))
  url.hash = parameters.toString()
  return url.toString()
}
