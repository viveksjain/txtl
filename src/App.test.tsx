// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
        vi.useRealTimers()
        cleanup()
    })

    it('stacks input and output panes below the desktop breakpoint', () => {
        render(<App />)

        const inputPane = screen.getByText('Input').parentElement?.parentElement
        const outputPane = screen.getByText('Mode').parentElement?.parentElement

        expect(inputPane?.className).toContain('w-full')
        expect(inputPane?.className).toContain('md:w-1/2')
        expect(inputPane?.className).toContain('flex-1')
        expect(outputPane?.className).toContain('w-full')
        expect(outputPane?.className).toContain('md:w-1/2')
        expect(outputPane?.className).toContain('flex-1')
    })

    it('keeps header navigation in normal flow below the small breakpoint', () => {
        render(<App />)

        const navigation = screen.getByRole('link', { name: 'GitHub' }).parentElement

        expect(navigation?.className).toContain('sm:absolute')
        expect(navigation?.className).not.toContain(' absolute ')
    })

    it('renders manual timezone conversion, persists selection, and clears None', async () => {
        const { input, mode, user } = renderTimezoneMode()
        const date = new Date(inputValue)

        await user.selectOptions(mode, 'timezone')
        await user.type(input, inputValue)

        expect(screen.getByText(`Local: ${date.toString()}`)).toBeTruthy()
        expect(screen.getByText(`UTC: ${date.toUTCString()}`)).toBeTruthy()

        const timezoneSelect = screen.getByLabelText('Add timezone')
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
        expect(screen.getByLabelText('Add timezone')).toBeTruthy()
        expect(screen.queryByText(/Los Angeles - America:/)).toBeNull()
    })

    it('refreshes fallback option offsets when timezone mode activates', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-01-23T12:00:00.000Z'))
        render(<App />)

        const input = screen.getByPlaceholderText('Enter input...')
        const mode = screen.getByRole('combobox')

        fireEvent.change(input, { target: { value: 'not a date' } })
        vi.setSystemTime(new Date('2026-07-23T12:00:00.000Z'))
        fireEvent.change(mode, { target: { value: 'timezone' } })

        const option = Array.from(
            (screen.getByLabelText('Add timezone') as HTMLSelectElement).options
        ).find((candidate) => candidate.value === 'America/Los_Angeles')

        expect(option?.textContent).toBe('Los Angeles - America (UTC-07:00)')
    })

    it('shows the selector for autodetected timezone input', async () => {
        const { input, user } = renderTimezoneMode()

        await user.type(input, '4pm UTC')

        expect(screen.getByText('Auto-detected: timezone')).toBeTruthy()
        expect(screen.getByLabelText('Add timezone')).toBeTruthy()
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

        expect((screen.getByLabelText('Add timezone') as HTMLSelectElement).value).toBe(
            'America/Los_Angeles'
        )
        expect(screen.getByText(selectedOutput)).toBeTruthy()
    })
})
