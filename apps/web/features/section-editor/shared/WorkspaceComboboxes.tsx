'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { nextComboboxIndex, searchComboboxIndex } from './combobox-navigation'

type Choice = { node: HTMLOptionElement; value: string; label: string; disabled: boolean; group: string; selected: boolean }
type Menu = { control: HTMLSelectElement; choices: Choice[]; index: number; label: string }

const choicesFor = (control: HTMLSelectElement): Choice[] => Array.from(control.options)
  .filter(option => !option.hidden)
  .map(option => ({
    node: option,
    value: option.value,
    label: option.label,
    disabled: option.disabled || (option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled),
    group: option.parentElement instanceof HTMLOptGroupElement ? option.parentElement.label : '',
    selected: option.selected
  }))

const labelFor = (control: HTMLSelectElement) => control.getAttribute('aria-label') ||
  Array.from(control.labels ?? []).map(label => {
    const copy = label.cloneNode(true) as HTMLLabelElement
    copy.querySelectorAll('select, input, button, svg').forEach(node => node.remove())
    return copy.textContent?.trim() ?? ''
  }).join(' ').trim() || control.title || 'Options'

/** React owns only the popup. Existing native selects keep their values and handlers. */
export function WorkspaceComboboxes() {
  const popupId = `ws-combobox-${useId()}`
  const popupRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<Menu | null>(null)
  const commitRef = useRef<(index: number) => void>(() => {})
  const highlightRef = useRef<(index: number) => void>(() => {})
  const [menu, setMenu] = useState<Menu | null>(null)

  useEffect(() => {
    let originalIndex = -1
    let search = ''
    let searchedAt = 0
    const close = () => {
      const active = menuRef.current
      if (!active) return
      active.control.setAttribute('aria-expanded', 'false')
      active.control.removeAttribute('aria-controls')
      active.control.removeAttribute('aria-activedescendant')
      menuRef.current = null
      setMenu(null)
    }
    const highlight = (index: number) => {
      const active = menuRef.current
      if (!active) return
      const next = { ...active, index }
      menuRef.current = next
      if (index < 0) active.control.removeAttribute('aria-activedescendant')
      else active.control.setAttribute('aria-activedescendant', `${popupId}-${index}`)
      setMenu(next)
    }
    const open = (control: HTMLSelectElement) => {
      close()
      control.focus()
      const choices = choicesFor(control)
      originalIndex = control.selectedIndex
      search = ''
      const index = choices.findIndex(choice => choice.selected && !choice.disabled)
      const next = { control, choices, index, label: labelFor(control) }
      menuRef.current = next
      control.setAttribute('aria-haspopup', 'listbox')
      control.setAttribute('aria-expanded', 'true')
      control.setAttribute('aria-controls', popupId)
      setMenu(next)
      highlight(index)
    }
    const commit = (index: number) => {
      const active = menuRef.current
      const choice = active?.choices[index]
      if (!active || !choice || choice.disabled || active.control.disabled || !choice.node.isConnected) return
      const selectedIndex = Array.from(active.control.options).indexOf(choice.node)
      const changed = selectedIndex !== active.control.selectedIndex
      active.control.selectedIndex = selectedIndex
      close()
      if (!changed) return
      active.control.dispatchEvent(new Event('input', { bubbles: true }))
      active.control.dispatchEvent(new Event('change', { bubbles: true }))
    }
    commitRef.current = commit
    highlightRef.current = highlight
    const controlFor = (target: EventTarget | null) => {
      const control = target instanceof Element ? target.closest('select:not([multiple])') : null
      return control instanceof HTMLSelectElement && control.closest('.pm-shell') &&
        !control.disabled && control.size <= 1 ? control : null
    }
    const pointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && popupRef.current?.contains(event.target)) {
        // Popup lives in a portal: protect its parent file/basis menu's outside listener.
        event.preventDefault()
        event.stopPropagation()
        return
      }
      const control = controlFor(event.target)
      if (!control || event.button !== 0) { close(); return }
      event.preventDefault() // Suppress the OS popup, keeping the native value contract.
      if (menuRef.current?.control === control) close()
      else open(control)
    }
    const keyDown = (event: KeyboardEvent) => {
      const control = controlFor(event.target)
      if (!control) return
      if (event.key === 'Escape' && menuRef.current) {
        event.preventDefault()
        event.stopPropagation()
        close()
        return
      }
      if (event.key === 'Tab') { close(); return }
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const navigation = ['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp'].includes(event.key)
      const activation = event.key === 'Enter' || event.key === ' '
      const typing = event.key.length === 1 && !activation
      if (!navigation && !activation && !typing) return
      event.preventDefault()
      event.stopPropagation()
      const wasOpen = menuRef.current?.control === control
      if (!wasOpen) open(control)
      const active = menuRef.current
      if (!active) return
      if (activation) { if (wasOpen) commit(active.index); return }
      if (navigation) { highlight(nextComboboxIndex(active.choices, active.index, event.key)); return }
      const now = Date.now()
      search = now - searchedAt > 700 ? event.key : search + event.key
      searchedAt = now
      const repeated = [...search].every(character => character === search[0])
      const index = searchComboboxIndex(active.choices, repeated ? event.key : search, repeated ? active.index : -1)
      if (index >= 0) highlight(index)
    }
    const blur = (event: FocusEvent) => { if (event.target === menuRef.current?.control) close() }
    const scroll = (event: Event) => {
      if (!(event.target instanceof Node) || !popupRef.current?.contains(event.target)) close()
    }
    const observer = new MutationObserver(() => {
      const active = menuRef.current
      if (!active) return
      const current = choicesFor(active.control)
      if (!active.control.isConnected || active.control.disabled || active.control.selectedIndex !== originalIndex ||
        current.length !== active.choices.length || current.some((choice, index) => {
          const previous = active.choices[index]
          return choice.node !== previous.node || choice.value !== previous.value || choice.label !== previous.label ||
            choice.disabled !== previous.disabled || choice.group !== previous.group
        })) close()
    })
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true,
      attributeFilter: ['disabled', 'hidden', 'label', 'value'] })
    document.addEventListener('pointerdown', pointerDown, true)
    document.addEventListener('keydown', keyDown, true)
    document.addEventListener('blur', blur, true)
    window.addEventListener('scroll', scroll, true)
    window.addEventListener('resize', close)
    return () => {
      close()
      observer.disconnect()
      document.removeEventListener('pointerdown', pointerDown, true)
      document.removeEventListener('keydown', keyDown, true)
      document.removeEventListener('blur', blur, true)
      window.removeEventListener('scroll', scroll, true)
      window.removeEventListener('resize', close)
    }
  }, [popupId])

  useLayoutEffect(() => {
    const popup = popupRef.current
    if (!menu || !popup) return
    const typography = getComputedStyle(menu.control)
    popup.style.fontSize = typography.fontSize
    popup.style.fontFamily = typography.fontFamily
    popup.style.fontWeight = typography.fontWeight
    popup.style.lineHeight = typography.lineHeight
    popup.style.letterSpacing = typography.letterSpacing
    const box = menu.control.getBoundingClientRect()
    const viewport = window.visualViewport
    const left = viewport?.offsetLeft ?? 0
    const top = viewport?.offsetTop ?? 0
    const width = viewport?.width ?? window.innerWidth
    const height = viewport?.height ?? window.innerHeight
    const available = Math.max(28, width - 16)
    popup.style.minWidth = `${Math.min(box.width, available)}px`
    popup.style.maxWidth = `${available}px`
    const below = top + height - box.bottom - 12
    const above = box.top - top - 12
    const up = below < Math.min(200, popup.scrollHeight) && above > below
    popup.style.maxHeight = `${Math.max(28, Math.min(320, up ? above : below))}px`
    const bounds = popup.getBoundingClientRect()
    popup.style.left = `${Math.max(left + 8, Math.min(box.right - bounds.width, left + width - bounds.width - 8))}px`
    popup.style.top = `${up ? Math.max(top + 8, box.top - bounds.height - 4) : box.bottom + 4}px`
    document.getElementById(`${popupId}-${menu.index}`)?.scrollIntoView({ block: 'nearest' })
  }, [menu])

  return menu ? createPortal(<div ref={popupRef} id={popupId} className="ws-combobox-popup"
    role="listbox" aria-label={menu.label}>
    {menu.choices.map((choice, index) => <div key={index}>
      {choice.group && choice.group !== menu.choices[index - 1]?.group &&
        <div className="ws-combobox-group">{choice.group}</div>}
      <div id={`${popupId}-${index}`} role="option"
        aria-selected={choice.selected} aria-disabled={choice.disabled}
        className={`ws-combobox-option${index === menu.index ? ' ws-combobox-option--active' : ''}`}
        onPointerMove={() => { if (!choice.disabled && menuRef.current?.index !== index) highlightRef.current(index) }}
        onClick={() => commitRef.current(index)}>
        <span className="ws-combobox-option__label">{choice.label}</span>
        <svg className="ws-combobox-option__check" aria-hidden="true" viewBox="0 0 16 16">
          <path d="M2.5 8.5 6 12 12.5 3" fill="none" stroke="currentColor"
            strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>)}
    {!menu.choices.length && <div className="ws-combobox-empty" role="status">No options</div>}
  </div>, document.body) : null
}
