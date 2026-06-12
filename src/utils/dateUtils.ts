export const formatDateForInputLocal = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const toDateInputValue = (value: any): string => {
  if (!value) return ''

  try {
    if (value instanceof Date) {
      return formatDateForInputLocal(value)
    }

    if (value?.toDate && typeof value.toDate === 'function') {
      return formatDateForInputLocal(value.toDate())
    }

    if (typeof value?.seconds === 'number') {
      return formatDateForInputLocal(new Date(value.seconds * 1000))
    }

    const parsed = new Date(value)
    if (!isNaN(parsed.getTime())) {
      return formatDateForInputLocal(parsed)
    }
  } catch {
    return ''
  }

  return ''
}

export const getTodayLocalDateString = (): string => {
  return formatDateForInputLocal(new Date())
}
