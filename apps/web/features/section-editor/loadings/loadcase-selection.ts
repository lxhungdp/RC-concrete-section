export const selectLoadcaseFromRow = (
  selectedLoadcaseId: number | null,
  loadcaseId: number,
  onSelectLoadcase: (id: number) => void
) => {
  if (selectedLoadcaseId !== loadcaseId) onSelectLoadcase(loadcaseId)
}
