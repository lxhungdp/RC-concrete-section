const createLocalStorageSlot = (key, validate) => ({
  read: () => {
    try {
      if (typeof localStorage === 'undefined') return null
      const value = localStorage.getItem(key)
      return validate(value) ? value : null
    } catch (_) {
      return null
    }
  },
  write: (value) => {
    if (!validate(value)) return
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value)
    } catch (_) {}
  }
})

module.exports = { createLocalStorageSlot }
