export const SELECTED_TIMEZONE_STORAGE_KEY = 'txtl.selectedTimezone'

export type TimezoneStorage = Pick<
    Storage,
    'getItem' | 'setItem' | 'removeItem'
>

export function loadSelectedTimezone(
    storage: TimezoneStorage | null,
    supportedTimezones: readonly string[]
): string {
    try {
        const stored = storage?.getItem(SELECTED_TIMEZONE_STORAGE_KEY)
        return stored && supportedTimezones.includes(stored) ? stored : ''
    } catch {
        return ''
    }
}

export function saveSelectedTimezone(
    storage: TimezoneStorage | null,
    selectedTimezone: string
): void {
    try {
        if (!storage) return
        if (selectedTimezone) {
            storage.setItem(SELECTED_TIMEZONE_STORAGE_KEY, selectedTimezone)
        } else {
            storage.removeItem(SELECTED_TIMEZONE_STORAGE_KEY)
        }
    } catch {
        // Persistence is optional; keep the current in-memory selection.
    }
}
