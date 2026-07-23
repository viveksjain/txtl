import { describe, expect, it } from 'vitest'
import { parseTimezoneInput } from './timezone'

describe('parseTimezoneInput', () => {
    it('parses a UTC ISO timestamp', () => {
        const result = parseTimezoneInput('2026-07-22T16:30:00Z')

        expect(result).toEqual({
            ok: true,
            date: new Date('2026-07-22T16:30:00.000Z'),
        })
    })

    it('parses an ISO timestamp with a numeric timezone offset', () => {
        const result = parseTimezoneInput('2026-07-22T16:30:00-07:00')

        expect(result).toEqual({
            ok: true,
            date: new Date('2026-07-22T23:30:00.000Z'),
        })
    })

    it('uses the reference instant browser-local date for a time without timezone', () => {
        const reference = new Date('2026-07-22T23:30:00.000Z')
        const expected = new Date(
            reference.getFullYear(),
            reference.getMonth(),
            reference.getDate(),
            16,
            0,
            0,
            0
        )

        const result = parseTimezoneInput('4pm', reference)

        expect(result).toEqual({ ok: true, date: expected })
    })

    it('uses the reference instant UTC date for a UTC time', () => {
        const reference = new Date('2026-07-22T23:30:00.000Z')

        const result = parseTimezoneInput('4pm UTC', reference)

        expect(result).toEqual({
            ok: true,
            date: new Date(Date.UTC(2026, 6, 22, 16, 0, 0, 0)),
        })
    })

    it('uses the input timezone date when the UTC date rolls over', () => {
        const reference = new Date('2026-07-22T00:30:00.000Z')

        const result = parseTimezoneInput('4pm UTC+14', reference)

        expect(result).toEqual({
            ok: true,
            date: new Date('2026-07-22T02:00:00.000Z'),
        })
    })

    it.each([
        ['empty input', '   '],
        ['arbitrary text', 'a meeting soon'],
        ['date-only input', '2026-07-22'],
        ['partial prose match', 'meet at 4pm tomorrow'],
        ['unmatched suffix', '4pm invalid'],
        ['time range', '4pm to 5pm'],
    ])('rejects %s', (_description, input) => {
        expect(parseTimezoneInput(input)).toEqual({ ok: false, reason: 'invalid' })
    })
})
