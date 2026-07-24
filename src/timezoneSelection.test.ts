import { describe, expect, it, vi } from 'vitest'
import {
    loadSelectedTimezone,
    saveSelectedTimezone,
    SELECTED_TIMEZONE_STORAGE_KEY,
    type TimezoneStorage,
} from './timezoneSelection'

function createStorage(initialValue: string | null = null): TimezoneStorage {
    return {
        getItem: vi.fn(() => initialValue),
        setItem: vi.fn(),
        removeItem: vi.fn(),
    }
}

describe('loadSelectedTimezone', () => {
    const supported = ['UTC', 'America/Los_Angeles']

    it('restores a supported timezone', () => {
        const storage = createStorage('America/Los_Angeles')
        expect(loadSelectedTimezone(storage, supported)).toBe('America/Los_Angeles')
        expect(storage.getItem).toHaveBeenCalledWith(SELECTED_TIMEZONE_STORAGE_KEY)
    })

    it('returns None for missing or unsupported values', () => {
        expect(loadSelectedTimezone(createStorage(), supported)).toBe('')
        expect(loadSelectedTimezone(createStorage('Invalid/Zone'), supported)).toBe('')
    })

    it('returns None when storage access throws', () => {
        const storage = createStorage()
        vi.mocked(storage.getItem).mockImplementation(() => {
            throw new Error('blocked')
        })

        expect(loadSelectedTimezone(storage, supported)).toBe('')
    })

    it('returns None when storage is unavailable', () => {
        expect(loadSelectedTimezone(null, supported)).toBe('')
    })
})

describe('saveSelectedTimezone', () => {
    it('stores an IANA identifier', () => {
        const storage = createStorage()

        saveSelectedTimezone(storage, 'America/Los_Angeles')

        expect(storage.setItem).toHaveBeenCalledWith(
            SELECTED_TIMEZONE_STORAGE_KEY,
            'America/Los_Angeles'
        )
    })

    it('removes the key for None', () => {
        const storage = createStorage()

        saveSelectedTimezone(storage, '')

        expect(storage.removeItem).toHaveBeenCalledWith(SELECTED_TIMEZONE_STORAGE_KEY)
    })

    it('ignores storage write failures', () => {
        const storage = createStorage()
        vi.mocked(storage.setItem).mockImplementation(() => {
            throw new Error('blocked')
        })

        expect(() =>
            saveSelectedTimezone(storage, 'America/Los_Angeles')
        ).not.toThrow()
    })

    it('ignores unavailable storage', () => {
        expect(() =>
            saveSelectedTimezone(null, 'America/Los_Angeles')
        ).not.toThrow()
    })
})
