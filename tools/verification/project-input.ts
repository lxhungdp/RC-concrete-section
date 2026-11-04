import { createProjectDocument, parseProjectDocument, type PmProjectDocument } from '@pm/project'

/** Compare explicit legacy input through the same documented canonical export boundary as users. */
export const canonicalVerificationProject = (raw: unknown): PmProjectDocument => {
  const parsed = parseProjectDocument(raw)
  if (!parsed.ok) throw new Error(`Invalid verification project: ${parsed.error}`)
  const source = parsed.document
  const canonical = createProjectDocument({ ...source.inputs, meta: source.meta })
  // Verification compares identity as well as engineering input; export time is not a new input.
  canonical.meta.updatedAt = source.meta.updatedAt
  return canonical
}

/** Exact input comparison ignores only object property order, never array order or numeric drift. */
export const verificationInputMismatch = (actual: unknown, expected: unknown, path = 'project'): string | null => {
  if (actual === expected) return null
  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) return `${path}: array lengths differ`
    for (let index = 0; index < actual.length; index += 1) {
      const mismatch = verificationInputMismatch(actual[index], expected[index], `${path}[${index}]`)
      if (mismatch) return mismatch
    }
    return null
  }
  if (actual && expected && typeof actual === 'object' && typeof expected === 'object') {
    const a = actual as Record<string, unknown>, b = expected as Record<string, unknown>
    const keys = Object.keys(a).sort()
    if (keys.join('\0') !== Object.keys(b).sort().join('\0')) return `${path}: object fields differ`
    for (const key of keys) {
      const mismatch = verificationInputMismatch(a[key], b[key], `${path}.${key}`)
      if (mismatch) return mismatch
    }
    return null
  }
  return `${path}: ${String(actual).slice(0, 120)} differs from ${String(expected).slice(0, 120)}`
}
