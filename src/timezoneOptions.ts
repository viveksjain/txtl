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
const numericTimezoneNamePattern = /^(?:GMT|UTC)[+-]\d{1,2}(?::?\d{2})?$/

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
        const options: Intl.DateTimeFormatOptions = {
            timeZone,
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
            timeZoneName: 'short',
        }
        const formatter = new Intl.DateTimeFormat('en-US', options)
        const timeZoneName = formatter
            .formatToParts(date)
            .find((part) => part.type === 'timeZoneName')

        if (
            timeZoneName &&
            numericTimezoneNamePattern.test(timeZoneName.value)
        ) {
            try {
                const genericOptions: Intl.DateTimeFormatOptions = {
                    ...options,
                    timeZoneName: 'shortGeneric',
                }
                const genericFormatter = new Intl.DateTimeFormat('en-US', genericOptions)
                const genericTimezoneName = genericFormatter
                    .formatToParts(date)
                    .find((part) => part.type === 'timeZoneName')

                if (
                    genericTimezoneName &&
                    !numericTimezoneNamePattern.test(genericTimezoneName.value)
                ) {
                    return genericFormatter.format(date)
                }
            } catch {
                // Older runtimes may not support generic timezone names.
            }

            const { timeZoneName: _, ...withoutTimeZoneName } = options
            return new Intl.DateTimeFormat('en-US', withoutTimeZoneName).format(date)
        }

        return formatter.format(date)
    } catch {
        return 'Unable to format selected timezone'
    }
}

export function resolveTimezoneOptionInstant(
    parsedDate: Date | undefined,
    now: Date = new Date()
): Date {
    return parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : now
}
