'use client'

import { useState, type ChangeEvent } from 'react'

/** Keep required entry stable without repeating a completed audit narrative in routine forms. */
export function ModificationReasonField({ value, onChange, showExisting = false, multiline = false,
  className = 'pm-field' }: {
  value: string
  onChange: (value: string) => void
  showExisting?: boolean
  multiline?: boolean
  className?: string
}) {
  const [enteredHere, setEnteredHere] = useState(false)
  if (value.trim().length > 0 && !showExisting && !enteredHere) return null
  const props = {
    value,
    placeholder: 'Project basis',
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setEnteredHere(true)
      onChange(event.target.value)
    }
  }
  return <label className={className}>
    <span>Modification reason</span>
    {multiline ? <textarea {...props} rows={2} /> : <input {...props} />}
  </label>
}
