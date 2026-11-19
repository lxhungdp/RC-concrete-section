/** View-only sidebar bounds from the workspace design contract. */
export const DEFAULT_SIDEBAR_WIDTH = 378
export const STACKED_WORKSPACE_WIDTH = 560
export const WORKSPACE_PANE_GAP = 6

export function sidebarBounds(workspaceWidth: number) {
  const available = Math.max(0, workspaceWidth - WORKSPACE_PANE_GAP)
  const max = available < STACKED_WORKSPACE_WIDTH
    ? available / 2
    : Math.min(720, available - 280)
  return { min: Math.min(260, max), max }
}

export function visibleSidebarWidth(preferred: number, workspaceWidth: number) {
  const { min, max } = sidebarBounds(workspaceWidth)
  return Math.min(max, Math.max(min, preferred))
}

export function sidebarKeyboardWidth(key: string, shift: boolean, width: number, workspaceWidth: number) {
  const { min, max } = sidebarBounds(workspaceWidth)
  const step = shift ? 40 : 10
  switch (key) {
    case 'ArrowLeft': return Math.max(min, width - step)
    case 'ArrowRight': return Math.min(max, width + step)
    case 'Home': return min
    case 'End': return max
    default: return null
  }
}
