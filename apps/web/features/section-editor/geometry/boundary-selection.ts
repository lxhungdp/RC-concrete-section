export const boundarySelectionStatus = (selectedCount: number) => {
  if (selectedCount === 1) return '1 region selected'
  if (selectedCount > 1) return `${selectedCount} regions selected`
  return 'No regions selected'
}

export type BoundaryDeleteShortcutInput = {
  key: string
  defaultPrevented: boolean
  repeat: boolean
  selectedCount: number
  inBoundaryContext: boolean
  editableTarget: boolean
}

export const shouldHandleBoundaryDelete = (input: BoundaryDeleteShortcutInput) =>
  input.key === 'Delete' &&
  !input.defaultPrevented &&
  !input.repeat &&
  input.selectedCount > 0 &&
  input.inBoundaryContext &&
  !input.editableTarget
