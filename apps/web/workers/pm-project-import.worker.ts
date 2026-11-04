import { parseProjectDocument, type ParseProjectResult } from '@pm/project'

const workerSelf = self as unknown as {
  postMessage(result: ParseProjectResult): void
  onmessage: ((event: MessageEvent<string>) => void) | null
}

workerSelf.onmessage = (event) => workerSelf.postMessage(parseProjectDocument(event.data))
