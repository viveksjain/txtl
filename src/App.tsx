import React, { useState, useEffect, useMemo, useRef } from 'react'
import { parseDiffFromFile, setLanguageOverride } from '@pierre/diffs'
import { File, FileDiff, SupportedLanguages } from '@pierre/diffs/react'
import type { ModelOperations, ModelOperationsOptions } from '@vscode/vscode-languagedetection'
import { bundledLanguagesInfo } from 'shiki'
import { detectMode } from './modeDetection'
import { parseTimezoneInput } from './timezone'
import {
    buildTimezoneOptions,
    formatDateInTimezone,
    formatTimezoneLabel,
    getSupportedTimezoneNames,
    resolveTimezoneOptionInstant,
} from './timezoneOptions'
import {
    loadSelectedTimezone,
    saveSelectedTimezone,
} from './timezoneSelection'

declare global {
    interface Window {
        DEBUG_LANG_DETECTION?: boolean
    }
}

// Maps canonical diff language IDs to the dropdown labels shown in the UI.
const LANGUAGE_ID_TO_LABEL = new Map<string, string>([
    ['text', 'Plain text'],
    ...bundledLanguagesInfo
        .map((language) => [language.id, language.name] as const)
        .sort((a, b) => a[1].localeCompare(b[1])),
])
// Maps detector output IDs and aliases to the canonical diff language IDs. The
// language detection model `vscode-languagedetection` outputs IDs like "md",
// whereas Shiki's canonical ID for it is "markdown" and "md" is just an alias.
// So we maintain this mapping to resolve the detector output to a language that
// Shiki/Pierre can understand for syntax highlighting.
const ALIASES_TO_LANGUAGE_ID = bundledLanguagesInfo.reduce((aliases, language) => {
    aliases.set(language.id.toLowerCase(), language.id)
    language.aliases?.forEach((alias) => aliases.set(alias.toLowerCase(), language.id))
    return aliases
}, new Map<string, string>())

function getDiffLanguageLabel(languageId: string) {
    return LANGUAGE_ID_TO_LABEL.get(languageId) ?? LANGUAGE_ID_TO_LABEL.get('text')!
}

function detectedLanguageToLanguageId(languageId: string) {
    return ALIASES_TO_LANGUAGE_ID.get(languageId.toLowerCase()) ?? 'text'
}

const MIN_DIFF_LANGUAGE_CONFIDENCE = 0.07 // Determined experimentally based on what seemed reasonable.

type VSCodeLanguageDetectionModule = {
    ModelOperations: new (options?: ModelOperationsOptions) => ModelOperations
}

async function loadVSCodeLanguageDetectionModule() {
    const [
        { default: moduleSource },
        { default: chunk979Source },
    ] = await Promise.all([
        import('@vscode/vscode-languagedetection/dist/lib/index.js?raw'),
        import('@vscode/vscode-languagedetection/dist/lib/979.js?raw'),
    ])

    const evaluateCommonJS = (source: string, requireFn: (id: string) => unknown) => {
        const module = { exports: {} as VSCodeLanguageDetectionModule }
        const factory = new Function(
            'module',
            'exports',
            'require',
            `${source}\nreturn module.exports;`
        ) as (module: { exports: VSCodeLanguageDetectionModule }, exports: VSCodeLanguageDetectionModule, require: (id: string) => unknown) => VSCodeLanguageDetectionModule

        return factory(module, module.exports, requireFn) ?? module.exports
    }

    let chunk979Exports: unknown
    const requireFn = (id: string) => {
        if (id === './979.js') {
            chunk979Exports ??= evaluateCommonJS(chunk979Source, requireFn)
            return chunk979Exports
        }

        throw new Error(`Unsupported vscode-languagedetection require: ${id}`)
    }

    return evaluateCommonJS(moduleSource, requireFn)
}

// Create a language detector instance by loading the model and weights. We do
// this lazily on demand when the user enters diff mode to avoid unnecessary
// network usage for users who don't use that feature.
async function createDiffLanguageDetector() {
    const [
        { ModelOperations },
        { default: languageDetectionModelJson },
        { default: languageDetectionWeightsUrl },
    ] = await Promise.all([
        loadVSCodeLanguageDetectionModule(),
        import('@vscode/vscode-languagedetection/model/model.json'),
        import('@vscode/vscode-languagedetection/model/group1-shard1of1.bin?url'),
    ])

    return new ModelOperations({
        modelJsonLoaderFunc: async () => languageDetectionModelJson,
        weightsLoaderFunc: async () => fetch(languageDetectionWeightsUrl).then((response) => response.arrayBuffer()),
        minContentSize: 1,
    })
}

function debugLangDetection(message: string, details?: unknown) {
    if (!window.DEBUG_LANG_DETECTION) {
        return
    }

    console.log(`[lang-detect] ${message}`, details)
    // if (details === undefined) {
    //     return
    // }

    // console.log(`[lang-detect] ${message}`, details)
}

function parseUnixTime(val: string) {
    const n = Number(val)
    // Autodetect if in seconds or milliseconds, convert seconds if needed.
    let epoch = n > 100000000000 ? n : n * 1000
    let date = new Date(epoch)
    return {
        local: date.toString(),
        utc: date.toUTCString()
    }
}

function parseNumber(val: string) {
    let base = 10
    if (val.startsWith('0x')) base = 16
    else if (val.startsWith('0b')) base = 2
    else if (val.startsWith('0o')) base = 8
    const parsed = Number(val)
    return {
        decimal: parsed.toString(10),
        hex: '0x' + parsed.toString(16),
        octal: '0o' + parsed.toString(8),
        binary: '0b' + parsed.toString(2),
        detectedBase: base
    }
}

export default function App() {
    const [mode, setMode] = useState('')
    const [inputA, setInputA] = useState('')
    const [inputB, setInputB] = useState('')
    const [diffLanguageOverride, setDiffLanguageOverride] = useState('auto')
    const [detectedDiffLanguage, setDetectedDiffLanguage] = useState('text')
    const [diffLanguageLoading, setDiffLanguageLoading] = useState(false)
    const [diffStyle, setDiffStyle] = useState<'split' | 'unified'>('split')
    const [hoveredDiffStyle, setHoveredDiffStyle] = useState<'split' | 'unified' | null>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const diffTextareaRef = useRef<HTMLTextAreaElement>(null)
    // Reuse the initialized detector across runs so we only load the model once.
    const diffLanguageDetectorRef = useRef<ModelOperations | null>(null)
    // Track the in-flight detector initialization promise and share it between callers.
    const diffLanguageDetectorPromiseRef = useRef<Promise<ModelOperations> | null>(null)
    // Queue detection work so model execution stays serialized while inputs change rapidly.
    const diffLanguageDetectionChainRef = useRef(Promise.resolve())
    // Used to invalidate stale async detection results when a newer request supersedes them.
    const diffLanguageDetectionRequestIdRef = useRef(0)
    const [rightPaneSelected, setRightPaneSelected] = useState(false)
    const [diffPanelHeight, setDiffPanelHeight] = useState(256)
    const [aboutOpen, setAboutOpen] = useState(false)
    const supportedTimezones = useMemo(getSupportedTimezoneNames, [])
    const timezoneStorage = useMemo(() => {
        try {
            return window.localStorage
        } catch {
            return null
        }
    }, [])
    const [selectedTimezone, setSelectedTimezone] = useState(() =>
        loadSelectedTimezone(timezoneStorage, supportedTimezones)
    )
    const activeMode = useMemo(
        () => mode || (inputA ? detectMode(inputA) : ''),
        [inputA, mode]
    )
    const parsedTimezoneDate = useMemo(
        () => parseTimezoneInput(inputA),
        [inputA]
    )
    const timezoneOptionInstant = useMemo(
        () => resolveTimezoneOptionInstant(parsedTimezoneDate),
        [activeMode, inputA, parsedTimezoneDate]
    )
    const timezoneOptions = useMemo(
        () =>
            activeMode === 'timezone'
                ? buildTimezoneOptions(timezoneOptionInstant, supportedTimezones)
                : [],
        [activeMode, supportedTimezones, timezoneOptionInstant]
    )

    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    useEffect(() => {
        saveSelectedTimezone(timezoneStorage, selectedTimezone)
    }, [selectedTimezone, timezoneStorage])

    useEffect(() => {
        if (mode === 'diff') {
            diffTextareaRef.current?.focus()
            diffTextareaRef.current?.setSelectionRange(diffTextareaRef.current.value.length, diffTextareaRef.current.value.length)
        }
    }, [mode])

    useEffect(() => {
        diffLanguageDetectionRequestIdRef.current++;
        if (mode !== 'diff' || diffLanguageOverride !== 'auto') {
            setDiffLanguageLoading(false)
            return
        }

        const detectionSample = [inputA, inputB]
            .filter((value) => value.trim() !== '')
            .join('\n')

        if (!detectionSample) {
            debugLangDetection('Returning early: empty detection sample')
            setDetectedDiffLanguage('text')
            setDiffLanguageLoading(false)
            return
        }

        const requestId = diffLanguageDetectionRequestIdRef.current
        // Add debounce effect to avoid frequent language detection.
        const timeoutId = window.setTimeout(() => {
            // Serialize detector runs so the model doesn't reload weights concurrently.
            diffLanguageDetectionChainRef.current = diffLanguageDetectionChainRef.current
                .catch(() => { })
                .then(async () => {
                    if (requestId !== diffLanguageDetectionRequestIdRef.current) {
                        return
                    }

                    try {
                        let detector = diffLanguageDetectorRef.current
                        if (detector == null) {
                            debugLangDetection('Loading language detector')
                            setDiffLanguageLoading(true)
                            detector = await (diffLanguageDetectorPromiseRef.current ??= createDiffLanguageDetector())
                            debugLangDetection('Language detector loaded')
                        }

                        diffLanguageDetectorRef.current = detector
                        diffLanguageDetectorPromiseRef.current = null
                        setDiffLanguageLoading(false)

                        debugLangDetection('Running language detector')
                        const results = await detector.runModel(detectionSample)
                        if (requestId !== diffLanguageDetectionRequestIdRef.current) {
                            debugLangDetection('Returning early: stale request after detection completes', {
                                requestId,
                                currentRequestId: diffLanguageDetectionRequestIdRef.current,
                            })
                            return
                        }

                        const bestResult = results[0]
                        if (!bestResult) {
                            debugLangDetection('Returning early: detector returned no results')
                            setDetectedDiffLanguage('text')
                            return
                        } else if (bestResult.confidence < MIN_DIFF_LANGUAGE_CONFIDENCE) {
                            debugLangDetection('Returning early: confidence below threshold', {
                                requestId,
                                bestResult,
                                threshold: MIN_DIFF_LANGUAGE_CONFIDENCE,
                            })
                            setDetectedDiffLanguage('text')
                            return
                        }

                        const resolvedLanguage = detectedLanguageToLanguageId(bestResult.languageId)
                        debugLangDetection('Language detected', {
                            bestResult,
                            resolved: resolvedLanguage,
                        })
                        setDetectedDiffLanguage(resolvedLanguage)
                    } catch (error) {
                        console.error('Failed to auto-detect diff language:', error)
                        if (requestId === diffLanguageDetectionRequestIdRef.current) {
                            setDetectedDiffLanguage('text')
                            setDiffLanguageLoading(false)
                        }
                        diffLanguageDetectorPromiseRef.current = null
                    }
                })
        }, 150)

        return () => {
            window.clearTimeout(timeoutId)
        }
    }, [diffLanguageOverride, inputA, inputB, mode])

    const handleRightPanePaste = async (e: React.ClipboardEvent) => {
        if (!mode) {
            e.preventDefault()
            try {
                const text = e.clipboardData.getData('text')
                setMode('diff')
                setInputB(text)
            } catch (err) {
                console.error('Failed to read clipboard:', err)
            }
        }
    }

    function renderAdditionalTimezone(date?: Date) {
        return (
            <div className="mt-4 space-y-2">
                <label className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
                    <span className="shrink-0">Add timezone</span>
                    <select
                        aria-label="Add timezone"
                        className="min-w-0 w-full max-w-full p-2 bg-gray-800/80 text-gray-100 border border-purple-600/40 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        value={selectedTimezone}
                        onChange={(event) => setSelectedTimezone(event.target.value)}
                    >
                        <option value="">None</option>
                        {timezoneOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </label>
                {date && selectedTimezone ? (
                    <div>
                        {formatTimezoneLabel(selectedTimezone)}:{' '}
                        {formatDateInTimezone(date, selectedTimezone)}
                    </div>
                ) : null}
            </div>
        )
    }

    function renderPaneByMode(
        mode: string,
        inputA: string,
        inputB: string,
        setInputB: React.Dispatch<React.SetStateAction<string>>
    ) {
        if (mode === 'diff') {
            return (
                <div className="h-full flex p-4">
                    <textarea
                        ref={diffTextareaRef}
                        className="w-full h-full border border-purple-600/40 rounded-lg p-4 resize-none bg-gray-800/80 text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
                        placeholder="Enter text to compare..."
                        value={inputB}
                        onChange={(e) => setInputB(e.target.value)}
                    />
                </div>
            )
        }
        if (mode === 'json') {
            try {
                const pretty = JSON.stringify(JSON.parse(inputA), null, 2)
                return <pre>{pretty}</pre>
            } catch (err) {
                return <div className="text-red-600">Invalid JSON: {err.message}</div>
            }
        }
        if (mode === 'unix') {
            const { local, utc } = parseUnixTime(inputA)
            return (
                <div>
                    <div>Local: {local}</div>
                    <div>UTC: {utc}</div>
                </div>
            )
        }
        if (mode === 'timezone') {
            const date = parseTimezoneInput(inputA)
            if (!date) {
                return (
                    <div>
                        <div className="text-red-600">Invalid date or time</div>
                        {renderAdditionalTimezone()}
                    </div>
                )
            }
            return (
                <div>
                    <div>Local: {date.toString()}</div>
                    <div>UTC: {date.toUTCString()}</div>
                    {renderAdditionalTimezone(date)}
                </div>
            )
        }
        if (mode === 'number') {
            const { decimal, hex, octal, binary, detectedBase } = parseNumber(inputA)
            const grayIf = (base: number) => base === detectedBase ? 'text-gray-400' : ''
            return (
                <div className="space-y-1">
                    <div className={grayIf(10)}>Decimal: {decimal}</div>
                    <div className={grayIf(16)}>Hex: {hex}</div>
                    <div className={grayIf(8)}>Octal: {octal}</div>
                    <div className={grayIf(2)}>Binary: {binary}</div>
                </div>
            )
        }
        if (mode === 'urlendecode') {
            const encoded = encodeURIComponent(inputA)
            let decoded: JSX.Element
            try {
                decoded = <div>{decodeURIComponent(inputA)}</div>
            } catch (err) {
                decoded = <div className="text-red-600">Invalid URI component: {err.message}</div>
            }
            return (
                <div>
                    <div>Encoded:</div>
                    <div>{encoded}</div>
                    <div className="my-4 border-t border-gray-500"></div>
                    <div>Decoded:</div>
                    {decoded}
                </div>
            )
        }
        if (mode === 'base64') {
            let decoded: JSX.Element
            try {
                decoded = <div className="bg-gray-700 p-2 my-2 rounded whitespace-pre-wrap">{atob(inputA)}</div>
            } catch (err) {
                decoded = <div className="text-red-600">Invalid Base64: {err.message}</div>
            }
            const encoded = btoa(inputA)
            return (
                <div>
                    <div>Encoded:</div>
                    <div className="bg-gray-700 p-2 my-2 rounded break-all">{encoded}</div>
                    <div className="my-4 border-t border-gray-500"></div>
                    <div>Decoded:</div>
                    {decoded}
                </div>
            )
        }
        return (!mode ? <div className="text-gray-400 text-center">No mode auto-detected.</div> : null)
    }

    const renderRightPane = () => {
        if (!mode) {
            if (!inputA) {
                return <div className="text-gray-300 text-center">Please enter some input. We will try to auto-detect the most appropriate mode. Alternatively, you can select a mode from the dropdown above.</div>
            }
            if (!activeMode) {
                return <div className="text-gray-300 text-center">No mode auto-detected. Please enter valid input or select a mode.</div>
            }
            return (
                <>
                    <div className="font-medium mb-3" style={{ color: '#cc9cfc' }}>
                        Auto-detected: {activeMode}
                    </div>
                    {renderPaneByMode(activeMode, inputA, inputB, setInputB)}
                </>
            )
        }
        return renderPaneByMode(activeMode, inputA, inputB, setInputB)
    }

    const handleDiffPanelResizeMouseDown = (
        e: React.MouseEvent<HTMLDivElement>
    ) => {
        e.preventDefault()
        const startY = e.clientY
        const startHeight = diffPanelHeight
        const onMouseMove = (event: MouseEvent) => {
            const newHeight = startHeight - (event.clientY - startY)
            setDiffPanelHeight(Math.max(newHeight, 100))
        }
        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove)
            document.removeEventListener('mouseup', onMouseUp)
        }
        document.addEventListener('mousemove', onMouseMove)
        document.addEventListener('mouseup', onMouseUp)
    }

    const diffInputsMatch = inputA === inputB
    // Pierre removes the last newline and shows missing end-of-file newline, so we manually add an extra newline.
    const pierreInputA = `${inputA}\n`
    const pierreInputB = `${inputB}\n`
    const headerHeight = '40px'
    const diffLanguage = diffLanguageOverride === 'auto' ? detectedDiffLanguage : diffLanguageOverride
    const detectedDiffLanguageLabel = getDiffLanguageLabel(detectedDiffLanguage)
    const diffLanguageOptions = useMemo(() => [
        {
            value: 'auto',
            label: diffLanguageLoading
                ? 'Auto-detect (Loading)'
                : `Auto-detect (${detectedDiffLanguageLabel})`,
        },
        ...Array.from(LANGUAGE_ID_TO_LABEL, ([languageId, label]) => ({
            value: languageId,
            label,
        })),
    ], [detectedDiffLanguageLabel, diffLanguageLoading])
    const pierreFileDiff = useMemo(() => {
        if (diffInputsMatch) {
            return null
        }

        return setLanguageOverride(
            parseDiffFromFile(
                {
                    name: 'before',
                    contents: pierreInputA,
                },
                {
                    name: 'after',
                    contents: pierreInputB,
                }
            ),
            diffLanguage as SupportedLanguages
        )
    }, [diffInputsMatch, diffLanguage, pierreInputA, pierreInputB])

    const renderDiffLanguageSelect = () => (
        <select
            className="h-9 min-w-[240px] rounded-lg border border-purple-600/40 bg-gray-800/80 px-3 text-sm text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 font-sans"
            aria-label="Diff language override"
            value={diffLanguageOverride}
            onChange={(e) => setDiffLanguageOverride(e.target.value)}
        >
            {diffLanguageOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
            ))}
        </select>
    )

    const renderDiffStyleToggle = () => {
        const sharedButtonClassName = 'inline-flex h-9 shrink-0 select-none items-center justify-center gap-2 rounded-none border px-[14px] py-2 text-sm font-medium leading-5 outline-none transition-all duration-150 first:rounded-l-[9px] last:rounded-r-[9px]'

        return (
            <div
                role="group"
                aria-label="Diff layout style"
                className="inline-flex self-start overflow-hidden rounded-[10px] font-sans"
                style={{
                    backgroundColor: 'oklch(26.9% 0 0)',
                }}
            >
                <button
                    type="button"
                    aria-pressed={diffStyle === 'split'}
                    onClick={() => setDiffStyle('split')}
                    onMouseEnter={() => setHoveredDiffStyle('split')}
                    onMouseLeave={() => setHoveredDiffStyle((current) => current === 'split' ? null : current)}
                    className={sharedButtonClassName}
                    style={diffStyle === 'split'
                        ? {
                            backgroundColor: 'oklch(14.5% 0 0)',
                            borderColor: 'oklch(100% 0 0 / 0.1)',
                            color: 'oklch(98.5% 0 0)',
                            boxShadow: 'none',
                            pointerEvents: 'none',
                        }
                        : {
                            backgroundColor: hoveredDiffStyle === 'split' ? 'oklch(14.5% 0 0 / 0.45)' : 'transparent',
                            borderColor: hoveredDiffStyle === 'split' ? 'oklch(100% 0 0 / 0.08)' : 'transparent',
                            color: hoveredDiffStyle === 'split' ? 'oklch(98.5% 0 0)' : 'oklch(70.8% 0 0)',
                        }}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                        <path d="M2.5 1H8v14H2.5A1.5 1.5 0 0 1 1 13.5v-11A1.5 1.5 0 0 1 2.5 1" fill="#ff5252" fillOpacity="0.28" />
                        <path d="M8 1h5.5A1.5 1.5 0 0 1 15 2.5v11a1.5 1.5 0 0 1-1.5 1.5H8V1" fill="#00b894" fillOpacity="0.3" />
                        <path d="M3.2 8h2.6" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                        <path d="M11.5 6.4v3.2" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                        <path d="M9.9 8h3.2" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                    </svg>
                    <span>Split</span>
                </button>
                <button
                    type="button"
                    aria-pressed={diffStyle === 'unified'}
                    onClick={() => setDiffStyle('unified')}
                    onMouseEnter={() => setHoveredDiffStyle('unified')}
                    onMouseLeave={() => setHoveredDiffStyle((current) => current === 'unified' ? null : current)}
                    className={sharedButtonClassName}
                    style={diffStyle === 'unified'
                        ? {
                            backgroundColor: 'oklch(14.5% 0 0)',
                            borderColor: 'oklch(100% 0 0 / 0.1)',
                            color: 'oklch(98.5% 0 0)',
                            boxShadow: 'none',
                            pointerEvents: 'none',
                        }
                        : {
                            backgroundColor: hoveredDiffStyle === 'unified' ? 'oklch(14.5% 0 0 / 0.45)' : 'transparent',
                            borderColor: hoveredDiffStyle === 'unified' ? 'oklch(100% 0 0 / 0.08)' : 'transparent',
                            color: hoveredDiffStyle === 'unified' ? 'oklch(98.5% 0 0)' : 'oklch(70.8% 0 0)',
                        }}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                        <path d="M2.5 1H13.5A1.5 1.5 0 0 1 15 2.5V8H1V2.5A1.5 1.5 0 0 1 2.5 1" fill="#ff5252" fillOpacity="0.28" />
                        <path d="M1 8h14v5.5a1.5 1.5 0 0 1-1.5 1.5H2.5A1.5 1.5 0 0 1 1 13.5V8" fill="#00b894" fillOpacity="0.3" />
                        <path d="M5.2 4.5h5.6" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                        <path d="M8 10.1v3.1" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                        <path d="M6.45 11.65h3.1" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                    </svg>
                    <span>Stacked</span>
                </button>
            </div>
        )
    }

    return (
        <div className="h-screen flex flex-col text-gray-100" style={{ background: 'linear-gradient(135deg, #070a13 0%, #100713 50%, #070a13 100%)' }}>
            <div className="relative flex flex-col items-center justify-center gap-3 px-4 py-3 border-b border-purple-700/30 bg-gray-800/50 backdrop-blur-sm sm:px-6 sm:py-4">
                <div className="flex flex-col justify-center items-center gap-1">
                    <h1 className="text-4xl font-bold font-mono">
                        <span style={{ color: '#d3d3d3' }}>t</span>
                        <span style={{ color: '#ff5252' }}>x</span>
                        <span style={{ color: '#d3d3d3' }}>t</span>
                        <span style={{ color: '#00b894' }}>l</span>
                    </h1>
                    <p className="text-sm text-gray-400">A fast, no frills collection of text utilities</p>
                </div>
                <div className="flex space-x-6 sm:absolute sm:right-6">
                    <a
                        href="https://github.com/viveksjain/txtl"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-300 hover:text-white hover:underline transition-colors duration-200 inline-flex items-center gap-1"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        GitHub
                    </a>
                    <button className="text-gray-300 hover:text-white hover:underline transition-colors duration-200" onClick={() => setAboutOpen(true)}>About</button>
                </div>
            </div>
            <div className="flex flex-1 min-h-0 flex-col md:flex-row" style={{ background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.08) 0%, rgba(33, 0, 57, 0.18) 50%, rgba(0, 0, 0, 0.08) 100%)' }}>
                <div className="w-full md:w-1/2 flex-1 min-h-0 flex flex-col">
                    <div className="flex shrink-0 items-center border-b border-purple-700/30" style={{ height: headerHeight }}>
                        <span className="ml-2 p-2">Input</span>
                    </div>
                    <div className="p-4 w-full flex-1 min-h-0">
                        <textarea
                            ref={inputRef}
                            className="w-full h-full border border-purple-600/40 rounded-lg p-4 resize-none bg-gray-800/70 text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
                            placeholder="Enter input..."
                            value={inputA}
                            onChange={(e) => setInputA(e.target.value)}
                        />
                    </div>
                </div>
                <div
                    className={`w-full md:w-1/2 flex-1 min-h-0 flex flex-col border-t md:border-t-0 md:border-l border-purple-700/30 ${rightPaneSelected ? 'ring-2 ring-purple-500' : ''}`}
                    tabIndex={0}
                    onFocus={() => setRightPaneSelected(true)}
                    onBlur={() => setRightPaneSelected(false)}
                    onPaste={handleRightPanePaste}
                >
                    <div className="flex items-center border-b border-purple-700/30" style={{ height: headerHeight }}>
                        <span className="ml-2 p-2">Mode</span>
                        <select
                            className="p-2 ml-4 bg-gray-800/80 text-gray-100 border border-purple-600/40 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
                            value={mode}
                            onChange={(e) => setMode(e.target.value)}
                        >
                            <option value="">Autodetect</option>
                            <option value="diff">Text diff</option>
                            <option value="json">JSON pretty print</option>
                            <option value="unix">Unix epoch time</option>
                            <option value="timezone">Timezone conversion</option>
                            <option value="number">Number conversion</option>
                            <option value="urlendecode">URL encode/decode</option>
                            <option value="base64">Base64 encode/decode</option>
                        </select>
                    </div>
                    <div className="h-full overflow-auto" style={{ flex: "1 1 0" }}>
                        {mode === 'diff' ? (
                            renderRightPane()
                        ) : (
                            <div className="p-4 h-full">
                                <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4 h-full border border-purple-600/10">
                                    {renderRightPane()}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {mode === 'diff' && (
                <>
                    <div
                        onMouseDown={handleDiffPanelResizeMouseDown}
                        className="bg-purple-800/60 hover:bg-purple-500/80 cursor-row-resize transition-colors duration-200"
                        style={{ height: '6px' }}
                    />
                    <div
                        style={{ height: diffPanelHeight }}
                        className="border-t border-purple-700/30 overflow-auto font-mono p-4"
                    >
                        {diffInputsMatch ? (
                            <div className="space-y-3">
                                <div className="flex items-center gap-3 font-sans">
                                    <div className="text-sm text-gray-300 font-sans">Inputs match exactly.</div>
                                    {renderDiffLanguageSelect()}
                                </div>
                                {inputA ? (
                                    <File
                                        file={{
                                            name: 'matching',
                                            contents: pierreInputA,
                                            lang: diffLanguage,
                                        }}
                                        options={{
                                            // Pin Pierre to the dark theme so it does not load the unused light variant.
                                            theme: 'pierre-dark',
                                            themeType: 'dark',
                                            overflow: 'wrap',
                                            disableFileHeader: true,
                                        }}
                                    />
                                ) : null}
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex items-center gap-3 font-sans">
                                    {renderDiffStyleToggle()}
                                    {renderDiffLanguageSelect()}
                                </div>
                                {pierreFileDiff ? (
                                    <FileDiff
                                        fileDiff={pierreFileDiff}
                                        options={{
                                            theme: 'pierre-dark',
                                            themeType: 'dark',
                                            diffStyle,
                                            overflow: 'wrap',
                                            lineDiffType: 'char',
                                            disableFileHeader: true,
                                        }}
                                    />
                                ) : null}
                            </div>
                        )}
                    </div>
                </>
            )}
            {aboutOpen && (
                <div
                    className="absolute top-0 left-0 w-full h-full flex items-center justify-center bg-black bg-opacity-50"
                    onClick={() => setAboutOpen(false)}
                >
                    <div
                        className="bg-gray-800/90 backdrop-blur-sm p-6 rounded-xl shadow-lg max-w-md border border-purple-600/30"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <p>
                            A fast, no frills collection of text utilities. This is a purely static webpage, all data is processed locally.
                            Source code available on <a href="https://github.com/viveksjain/txtl" target="_blank" rel="noopener noreferrer" className="underline">Github</a>.
                        </p>
                        <div className="flex justify-end">
                            <button
                                onClick={() => setAboutOpen(false)}
                                className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors duration-200 font-medium"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
