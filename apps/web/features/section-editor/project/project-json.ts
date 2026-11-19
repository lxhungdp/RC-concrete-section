import { PROJECT_INPUT_LIMITS, ProjectResourceLimitError } from '@pm/project'

/** Bound file allocation before reading; the project parser independently checks UTF-8 text. */
export const readProjectJsonText = async (file: { size: number; text(): Promise<string> }): Promise<string> => {
  if (!Number.isFinite(file.size) || file.size < 0 || file.size > PROJECT_INPUT_LIMITS.jsonBytes) {
    throw new ProjectResourceLimitError('Project JSON exceeds its file resource limit (10 MiB).')
  }
  return file.text()
}
