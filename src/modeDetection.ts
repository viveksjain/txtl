function isMaybeEpochTime(val: number) {
    // Roughly, represents seconds since epoch from 2001 to 2049. We auto-detect this range as unix time.
    const inAllowedRange = (num: number): boolean => num >= 1000000000 && num <= 2500000000;
    if (inAllowedRange(val)) {
        return true;
    }
    // Try as milliseconds since epoch
    if (inAllowedRange(val / 1000)) {
        return true;
    }
    return false;
}

export function detectMode(val: string) {
    const trimmed = val.trim()
    if (trimmed.startsWith('{')) return 'json'
    const numeric = Number(trimmed)
    if (!isNaN(numeric)) {
        if (isMaybeEpochTime(numeric)) return 'unix'
        return 'number'
    }
    try {
        new URL(trimmed)
        return 'urlendecode'
    } catch {
        // Not a valid URL
    }
    // Thanks to https://github.com/gchq/CyberChef/wiki/Automatic-detection-of-encoded-data-using-CyberChef-Magic#pattern-matching
    const base64Regex = /^(?:[A-Z\d+/]{4})+(?:[A-Z\d+/]{2}==|[A-Z\d+/]{3}=)?$/i
    if (base64Regex.test(trimmed)) {
        return 'base64'
    }
    return ''
}
