import { describe, expect, it } from 'vitest'
import {
    buildTimezoneOptions,
    formatTimezoneLabel,
    formatDateInTimezone,
    getTimezoneOffsetLabel,
    getSupportedTimezoneNames,
    resolveTimezoneOptionInstant,
} from './timezoneOptions'

describe('formatTimezoneLabel', () => {
    it('reverses IANA segments using ASCII hyphens', () => {
        expect(formatTimezoneLabel('America/Los_Angeles')).toBe('Los Angeles - America')
        expect(formatTimezoneLabel('America/Argentina/Buenos_Aires')).toBe(
            'Buenos Aires - Argentina - America'
        )
    })

    it('leaves UTC unchanged', () => {
        expect(formatTimezoneLabel('UTC')).toBe('UTC')
    })
})

describe('getSupportedTimezoneNames', () => {
    it('adds UTC and removes duplicates', () => {
        const result = getSupportedTimezoneNames(() => [
            'America/Los_Angeles',
            'UTC',
            'Europe/London',
        ])

        expect(result).toEqual(['UTC', 'America/Los_Angeles', 'Europe/London'])
    })

    it('falls back to UTC when enumeration is unavailable', () => {
        expect(getSupportedTimezoneNames(null)).toEqual(['UTC'])
    })

    it('falls back to UTC when enumeration throws', () => {
        expect(
            getSupportedTimezoneNames(() => {
                throw new Error('unsupported')
            })
        ).toEqual(['UTC'])
    })
})

describe('getTimezoneOffsetLabel', () => {
    it('reflects daylight saving time at the supplied instant', () => {
        expect(
            getTimezoneOffsetLabel(
                'America/Los_Angeles',
                new Date('2026-01-23T12:00:00.000Z')
            )
        ).toBe('UTC-08:00')
        expect(
            getTimezoneOffsetLabel(
                'America/Los_Angeles',
                new Date('2026-07-23T12:00:00.000Z')
            )
        ).toBe('UTC-07:00')
    })

    it('supports fractional offsets and UTC', () => {
        const instant = new Date('2026-07-23T12:00:00.000Z')

        expect(getTimezoneOffsetLabel('Asia/Kolkata', instant)).toBe('UTC+05:30')
        expect(getTimezoneOffsetLabel('UTC', instant)).toBe('UTC+00:00')
    })
})

describe('buildTimezoneOptions', () => {
    it('sorts alphabetically by city-first label and includes offsets', () => {
        const result = buildTimezoneOptions(
            new Date('2026-07-23T12:00:00.000Z'),
            ['Europe/London', 'America/Los_Angeles', 'UTC']
        )

        expect(result).toEqual([
            {
                value: 'Europe/London',
                label: 'London - Europe (UTC+01:00)',
            },
            {
                value: 'America/Los_Angeles',
                label: 'Los Angeles - America (UTC-07:00)',
            },
            {
                value: 'UTC',
                label: 'UTC (UTC+00:00)',
            },
        ])
    })
})

describe('formatDateInTimezone', () => {
    it('formats the selected timezone without a numeric offset', () => {
        expect(
            formatDateInTimezone(
                new Date('2026-07-23T23:00:00.000Z'),
                'America/Los_Angeles'
            )
        ).toBe('Jul 23, 2026, 4:00:00 PM PDT')
    })

    it('returns a safe message when formatting fails', () => {
        expect(
            formatDateInTimezone(
                new Date('2026-07-23T23:00:00.000Z'),
                'Invalid/Zone'
            )
        ).toBe('Unable to format selected timezone')
    })
})

describe('resolveTimezoneOptionInstant', () => {
    it('uses the parsed instant and falls back to the supplied current instant', () => {
        const parsed = new Date('2026-01-23T12:00:00.000Z')
        const now = new Date('2026-07-23T12:00:00.000Z')

        expect(resolveTimezoneOptionInstant(parsed, now)).toBe(parsed)
        expect(resolveTimezoneOptionInstant(undefined, now)).toBe(now)
    })
})
