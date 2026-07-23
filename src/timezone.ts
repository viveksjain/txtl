import * as chrono from 'chrono-node'

const dateComponents: chrono.Component[] = ['year', 'month', 'day']

function parseFullInput(input: string, reference?: chrono.ParsingReference | Date) {
    const results = chrono.parse(input, reference)
    const result = results[0]

    if (
        results.length !== 1 ||
        !result ||
        result.index !== 0 ||
        result.text.length !== input.length ||
        result.end ||
        !result.start.isCertain('hour')
    ) {
        return undefined
    }

    return result
}

export function parseTimezoneInput(
    input: string,
    referenceInstant?: Date
): Date | undefined {
    const trimmedInput = input.trim()

    try {
        let result = parseFullInput(trimmedInput, referenceInstant)
        if (!result) return undefined

        const hasCertainDate = dateComponents.some((component) => result.start.isCertain(component))

        if (!hasCertainDate && result.start.isCertain('timezoneOffset')) {
            const timezoneOffset = result.start.get('timezoneOffset')
            if (timezoneOffset === null) return undefined

            result = parseFullInput(trimmedInput, {
                instant: referenceInstant,
                timezone: timezoneOffset,
            })
            if (!result) return undefined
        }

        const date = result.start.date()
        if (Number.isNaN(date.getTime())) return undefined

        return date
    } catch {
        return undefined
    }
}
