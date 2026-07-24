export type TimezoneOption = {
    value: string
    label: string
}

type SupportedValuesOf = (key: 'timeZone') => string[]

function browserSupportedValuesOf(): SupportedValuesOf | null {
    const intl = Intl as typeof Intl & {
        supportedValuesOf?: SupportedValuesOf
    }

    return intl.supportedValuesOf
        ? (key) => intl.supportedValuesOf!.call(Intl, key)
        : null
}

export function getSupportedTimezoneNames(
    supportedValuesOf: SupportedValuesOf | null = browserSupportedValuesOf()
): string[] {
    try {
        const supported = supportedValuesOf?.('timeZone') ?? []
        return Array.from(new Set(['UTC', ...supported]))
    } catch {
        return ['UTC']
    }
}

export function formatTimezoneLabel(timeZone: string): string {
    return timeZone
        .split('/')
        .reverse()
        .map((segment) => segment.replace(/_/g, ' '))
        .join(' - ')
}

const offsetFormatters = new Map<string, Intl.DateTimeFormat>()

function getOffsetFormatter(timeZone: string): Intl.DateTimeFormat {
    const existing = offsetFormatters.get(timeZone)
    if (existing) return existing

    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        timeZoneName: 'longOffset',
        hour: 'numeric',
    })
    offsetFormatters.set(timeZone, formatter)
    return formatter
}

export function getTimezoneOffsetLabel(timeZone: string, instant: Date): string {
    try {
        const offsetPart = getOffsetFormatter(timeZone)
            .formatToParts(instant)
            .find((part) => part.type === 'timeZoneName')

        if (!offsetPart) return 'offset unavailable'
        if (offsetPart.value === 'GMT') return 'UTC+00:00'
        return offsetPart.value.replace(/^GMT/, 'UTC')
    } catch {
        return 'offset unavailable'
    }
}

export function buildTimezoneOptions(
    instant: Date,
    timeZones: readonly string[] = getSupportedTimezoneNames()
): TimezoneOption[] {
    return timeZones
        .map((value) => ({
            value,
            displayName: formatTimezoneLabel(value),
        }))
        .sort(
            (left, right) =>
                left.displayName.localeCompare(right.displayName, 'en-US') ||
                left.value.localeCompare(right.value, 'en-US')
        )
        .map(({ value, displayName }) => ({
            value,
            label: `${displayName} (${getTimezoneOffsetLabel(value, instant)})`,
        }))
}

export function formatDateInTimezone(date: Date, timeZone: string): string {
    try {
        return new Intl.DateTimeFormat('en-US', {
            timeZone,
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
            timeZoneName: 'short',
        }).format(date)
    } catch {
        return 'Unable to format selected timezone'
    }
}

export function resolveTimezoneOptionInstant(
    parsedDate: Date | undefined,
    now: Date = new Date()
): Date {
    return parsedDate ?? now
}
