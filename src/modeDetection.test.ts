import { describe, expect, it } from 'vitest'
import { detectMode } from './modeDetection'

describe('detectMode', () => {
    it('detects JSON-shaped input', () => {
        expect(detectMode('{"key":"value"}')).toBe('json')
    })

    it('keeps Unix epoch precedence for seconds and milliseconds', () => {
        expect(detectMode('1720000000')).toBe('unix')
        expect(detectMode('1720000000000')).toBe('unix')
    })

    it('keeps ordinary-number precedence', () => {
        expect(detectMode('42')).toBe('number')
        expect(detectMode('0x2a')).toBe('number')
    })

    it('detects URLs before encoded text', () => {
        expect(detectMode('https://example.com/path?q=value')).toBe('urlendecode')
    })

    it.each([
        '2026-07-22T16:30:00Z',
        '4pm UTC',
        '4pm',
    ])('detects complete timezone input %s', (input) => {
        expect(detectMode(input)).toBe('timezone')
    })

    it('does not detect a valid time embedded in prose as timezone', () => {
        expect(detectMode('meet at 4pm tomorrow')).toBe('')
    })

    it('detects Base64 input', () => {
        expect(detectMode('SGVsbG8=')).toBe('base64')
    })

    it('returns no mode for unrecognized text', () => {
        expect(detectMode('plain text')).toBe('')
    })
})
