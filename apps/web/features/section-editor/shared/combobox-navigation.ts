export type ComboboxChoice = { label: string; disabled: boolean }

/** Exploration never commits a value; callers commit only an enabled option. */
export function nextComboboxIndex(options: readonly ComboboxChoice[], index: number, key: string) {
  const enabled = options.flatMap((option, i) => option.disabled ? [] : [i])
  if (!enabled.length) return -1
  const position = enabled.indexOf(index)
  if (key === 'Home') return enabled[0]
  if (key === 'End') return enabled[enabled.length - 1]
  const step = key === 'PageDown' ? 10 : key === 'PageUp' ? -10 : key === 'ArrowUp' ? -1 : 1
  const start = position < 0 ? (step > 0 ? -1 : enabled.length) : position
  return enabled[Math.max(0, Math.min(enabled.length - 1, start + step))]
}

export function searchComboboxIndex(options: readonly ComboboxChoice[], search: string, after: number) {
  const query = search.toLocaleLowerCase()
  for (let offset = 1; offset <= options.length; offset++) {
    const index = (after + offset + options.length) % options.length
    if (!options[index].disabled && options[index].label.toLocaleLowerCase().startsWith(query)) return index
  }
  return -1
}
