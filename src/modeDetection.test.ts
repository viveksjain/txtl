import { describe, expect, it } from 'vitest'
import { detectMode } from './modeDetection'

describe('detectMode', () => {
    it('detects JSON-shaped input', () => {
        expect(detectMode('{"key":"value"}')).toBe('json')
    })

    it('detects Unix timestamps in seconds and milliseconds', () => {
        expect(detectMode('1720000000')).toBe('unix')
        expect(detectMode('1720000000000')).toBe('unix')
    })

    it('detects other numeric input as number conversion', () => {
        expect(detectMode('42')).toBe('number')
        expect(detectMode('0x2a')).toBe('number')
    })

    it('detects URLs before encoded text', () => {
        expect(detectMode('https://example.com/path?q=value')).toBe('urlendecode')
    })

    it('detects Base64 input', () => {
        expect(detectMode('SGVsbG8=')).toBe('base64')
    })

    it('returns no mode for unrecognized text', () => {
        expect(detectMode('plain text')).toBe('')
    })
})
