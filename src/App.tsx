import React, { useState, useEffect, useRef } from 'react'
import { File, MultiFileDiff } from '@pierre/diffs/react'

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

function detectMode(val: string) {
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

export default function App() {
    const [mode, setMode] = useState('')
    const [inputA, setInputA] = useState('')
    const [inputB, setInputB] = useState('')
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const diffTextareaRef = useRef<HTMLTextAreaElement>(null)
    const [rightPaneSelected, setRightPaneSelected] = useState(false)
    const [diffPanelHeight, setDiffPanelHeight] = useState(256)
    const [aboutOpen, setAboutOpen] = useState(false)

    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    useEffect(() => {
        if (mode === 'diff') {
            diffTextareaRef.current?.focus()
            diffTextareaRef.current?.setSelectionRange(diffTextareaRef.current.value.length, diffTextareaRef.current.value.length)
        }
    }, [mode])

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
            const autodetected = detectMode(inputA)
            if (!autodetected) {
                return <div className="text-gray-300 text-center">No mode auto-detected. Please enter valid input or select a mode.</div>
            }
            return (
                <>
                    <div className="font-medium mb-3" style={{ color: '#cc9cfc' }}>Auto-detected: {autodetected}</div>
                    {renderPaneByMode(autodetected, inputA, inputB, setInputB)}
                </>
            )
        }
        return renderPaneByMode(mode, inputA, inputB, setInputB)
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
    // Avoid Pierre's EOF marker for missing trailing newlines.
    const pierreInputA = `${inputA}\n`
    const pierreInputB = `${inputB}\n`
    const headerHeight = '40px'
    return (
        <div className="h-screen flex flex-col text-gray-100" style={{ background: 'linear-gradient(135deg, #070a13 0%, #100713 50%, #070a13 100%)' }}>
            <div className="relative flex items-center justify-center px-6 py-4 border-b border-purple-700/30 bg-gray-800/50 backdrop-blur-sm">
                <div className="flex flex-col justify-center items-center gap-1">
                    <h1 className="text-4xl font-bold font-mono">
                        <span style={{ color: '#d3d3d3' }}>t</span>
                        <span style={{ color: '#ff5252' }}>x</span>
                        <span style={{ color: '#d3d3d3' }}>t</span>
                        <span style={{ color: '#00b894' }}>l</span>
                    </h1>
                    <p className="text-sm text-gray-400">A fast, no frills collection of text utilities</p>
                </div>
                <div className="absolute right-6 flex space-x-6">
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
            <div className="flex flex-1" style={{ background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.08) 0%, rgba(33, 0, 57, 0.18) 50%, rgba(0, 0, 0, 0.08) 100%)' }}>
                <div className="w-1/2 h-full flex flex-col">
                    <div className="flex shrink-0 items-center border-b border-purple-700/30" style={{ height: headerHeight }}>
                        <span className="ml-2 p-2">Input</span>
                    </div>
                    <div className="p-4 w-full h-full">
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
                    className={`w-1/2 h-full flex flex-col border-l border-purple-700/30 ${rightPaneSelected ? 'ring-2 ring-purple-500' : ''}`}
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
                                <div className="text-sm text-gray-300">Inputs match exactly.</div>
                                {inputA ? (
                                    <File
                                        file={{
                                            name: 'matching.txt',
                                            contents: pierreInputA,
                                            lang: 'text',
                                        }}
                                        options={{
                                            overflow: 'wrap',
                                            disableFileHeader: true,
                                        }}
                                    />
                                ) : null}
                            </div>
                        ) : (
                            <MultiFileDiff
                                oldFile={{
                                    name: 'before.txt',
                                    contents: pierreInputA,
                                    lang: 'text',
                                }}
                                newFile={{
                                    name: 'after.txt',
                                    contents: pierreInputB,
                                    lang: 'text',
                                }}
                                options={{
                                    diffStyle: 'split',
                                    overflow: 'wrap',
                                    lineDiffType: 'char',
                                    disableFileHeader: true,
                                }}
                            />
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
