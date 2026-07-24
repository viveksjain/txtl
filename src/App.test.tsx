// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@pierre/diffs', () => ({
    parseDiffFromFile: vi.fn(),
    setLanguageOverride: vi.fn(),
}))

vi.mock('@pierre/diffs/react', () => ({
    File: () => null,
    FileDiff: () => null,
}))

vi.mock('shiki', () => ({
    bundledLanguagesInfo: [],
}))

import App from './App'
import { SELECTED_TIMEZONE_STORAGE_KEY } from './timezoneSelection'

const inputValue = '2026-07-23T23:00:00Z'
const selectedOutput = 'Los Angeles - America: Jul 23, 2026, 4:00:00 PM PDT'

function renderTimezoneMode() {
    const user = userEvent.setup()
    render(<App />)

    return {
        user,
        input: screen.getByPlaceholderText('Enter input...'),
        mode: screen.getByRole('combobox'),
    }
}

describe('timezone selector integration', () => {
    beforeEach(() => {
        window.localStorage.clear()
    })

    afterEach(() => {
        cleanup()
    })

    it('renders manual timezone conversion, persists selection, and clears None', async () => {
        const { input, mode, user } = renderTimezoneMode()
        const date = new Date(inputValue)

        await user.selectOptions(mode, 'timezone')
        await user.type(input, inputValue)

        expect(screen.getByText(`Local: ${date.toString()}`)).toBeTruthy()
        expect(screen.getByText(`UTC: ${date.toUTCString()}`)).toBeTruthy()

        const timezoneSelect = screen.getByLabelText('Additional timezone')
        expect(timezoneSelect.parentElement?.className).toContain('grid')
        expect(timezoneSelect.className).toContain('min-w-0')
        expect(timezoneSelect.className).toContain('w-full')
        expect(timezoneSelect.className).not.toContain('w-80')

        await user.selectOptions(timezoneSelect, 'America/Los_Angeles')

        expect(window.localStorage.getItem(SELECTED_TIMEZONE_STORAGE_KEY)).toBe(
            'America/Los_Angeles'
        )
        expect(screen.getByText(selectedOutput)).toBeTruthy()
        expect(screen.getByText(selectedOutput).textContent).not.toContain('UTC-07:00')

        await user.selectOptions(timezoneSelect, '')

        expect(window.localStorage.getItem(SELECTED_TIMEZONE_STORAGE_KEY)).toBeNull()
        expect(screen.queryByText(selectedOutput)).toBeNull()
    })

    it('keeps the selector without conversion for invalid manual input', async () => {
        const { input, mode, user } = renderTimezoneMode()

        await user.selectOptions(mode, 'timezone')
        await user.type(input, 'not a date')

        expect(screen.getByText('Invalid date or time')).toBeTruthy()
        expect(screen.getByLabelText('Additional timezone')).toBeTruthy()
        expect(screen.queryByText(/Los Angeles - America:/)).toBeNull()
    })

    it('shows the selector for autodetected timezone input', async () => {
        const { input, user } = renderTimezoneMode()

        await user.type(input, '4pm UTC')

        expect(screen.getByText('Auto-detected: timezone')).toBeTruthy()
        expect(screen.getByLabelText('Additional timezone')).toBeTruthy()
    })

    it('restores a persisted valid timezone selection after remount', async () => {
        window.localStorage.setItem(
            SELECTED_TIMEZONE_STORAGE_KEY,
            'America/Los_Angeles'
        )
        const { unmount } = render(<App />)

        unmount()
        const { input, mode, user } = renderTimezoneMode()

        await user.selectOptions(mode, 'timezone')
        await user.type(input, inputValue)

        expect((screen.getByLabelText('Additional timezone') as HTMLSelectElement).value).toBe(
            'America/Los_Angeles'
        )
        expect(screen.getByText(selectedOutput)).toBeTruthy()
    })
})
