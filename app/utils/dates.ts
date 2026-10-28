// Helpers de dates en français — semaine commençant le lundi.
// Aucune dépendance : uniquement l'API Intl + manipulations de Date.

const FR_LOCALE = 'fr-FR'

/** Index = 0 dimanche, cohérent avec `Date.getDay()`. */
export const WEEKDAYS_SHORT: string[] = [
  'dim',
  'lun',
  'mar',
  'mer',
  'jeu',
  'ven',
  'sam',
]

export const WEEKDAYS_LONG: string[] = [
  'dimanche',
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
]

export const MONTHS_LONG: string[] = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
]

/** « lundi 28 octobre 2026 » */
export function formatLongDate(d: Date): string {
  return new Intl.DateTimeFormat(FR_LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d)
}

/** « lun. 28 oct. » */
export function formatShortDate(d: Date): string {
  return new Intl.DateTimeFormat(FR_LOCALE, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(d)
}

/** « lundi » */
export function formatWeekday(d: Date): string {
  return new Intl.DateTimeFormat(FR_LOCALE, { weekday: 'long' }).format(d)
}

/** `YYYY-MM-DD` en heure locale (pas UTC). */
export function toISODate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Parse `YYYY-MM-DD` en Date locale. */
export function fromISODate(s: string): Date {
  const [year, month, day] = s.split('-').map((part) => Number.parseInt(part, 10))
  return new Date(year, (month ?? 1) - 1, day ?? 1)
}

/** Copie de `d` décalée de `n` jours. */
export function addDays(d: Date, n: number): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + n)
  return copy
}

/** Lundi de la semaine contenant `d`. */
export function startOfWeek(d: Date): Date {
  const copy = new Date(d)
  const day = copy.getDay()
  const diff = day === 0 ? -6 : 1 - day
  copy.setDate(copy.getDate() + diff)
  copy.setHours(0, 0, 0, 0)
  return copy
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}
