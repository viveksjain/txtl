import React, { useState, useEffect, useRef, useMemo } from 'react'
import { diff_match_patch } from 'diff-match-patch'

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
                <div className="h-full flex">
                    <textarea
                        ref={diffTextareaRef}
                        className="w-full h-full border p-2 resize-none bg-gray-800 text-gray-100"
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
        return (!mode ? <div>No mode auto-detected.</div> : null)
    }

    const renderRightPane = () => {
        if (!mode) {
            if (!inputA) {
                return <div>Please enter some input. We will try to auto-detect the most appropriate mode. Alternatively, you can select a mode from the dropdown above.</div>
            }
            const autodetected = detectMode(inputA)
            if (!autodetected) {
                return <div>No mode auto-detected. Please enter valid input or select a mode.</div>
            }
            return (
                <>
                    <div>Auto-detected: {autodetected}</div>
                    {renderPaneByMode(autodetected, inputA, inputB, setInputB)}
                </>
            )
        }
        return renderPaneByMode(mode, inputA, inputB, setInputB)
    }

    const diffContent = useMemo(() => {
        if (mode !== 'diff') return null;
        const dmp = new diff_match_patch()
        const diffs = dmp.diff_main(inputA, inputB)
        dmp.diff_cleanupSemantic(diffs)

        class DiffSpan {
            uuid: string;
            content: string;
            state: 'added' | 'removed' | 'unchanged' | 'spacer';

            constructor(content: string, state: 'added' | 'removed' | 'unchanged' | 'spacer') {
                this.uuid = crypto.randomUUID();
                this.content = content;
                this.state = state;
            }
        }
        class DiffLine {
            uuid: string;
            spans: DiffSpan[];
            showNextLineNumber?: boolean;
            lineNumber?: number;

            constructor() {
                this.spans = [];
                this.uuid = crypto.randomUUID();
            }

            addSpan(span: DiffSpan) {
                this.spans.push(span);
            }

            lastSpan() {
                if (this.spans.length === 0) return undefined;
                return this.spans[this.spans.length - 1];
            }
        }
        class Content {
            lines: DiffLine[];

            constructor() {
                this.lines = [new DiffLine()];
            }

            last() {
                return this.lines[this.lines.length - 1];
            }

            addLine(showLineNumber: boolean) {
                this.last().showNextLineNumber = showLineNumber;
                if (!showLineNumber) {
                    this.last().spans.push(new DiffSpan('\n', 'spacer'));
                }
                this.lines.push(new DiffLine());
            }

            computeLineNumbers() {
                let lineNumber = 1
                let showNextLineNumber = true
                this.lines.forEach((line) => {
                    if (showNextLineNumber) {
                        line.lineNumber = lineNumber
                        lineNumber++
                    }
                    showNextLineNumber = line.showNextLineNumber ?? false
                });
            }
        }

        let leftContent = new Content()
        let rightContent = new Content()
        diffs.map((diff, _) => {
            const [op, text] = diff
            const lines = text.split(/(?<=\n)/);
            lines.forEach((spanText, _) => {
                if (op === 0) {
                    leftContent.last().addSpan(new DiffSpan(spanText, 'unchanged'))
                    rightContent.last().addSpan(new DiffSpan(spanText, 'unchanged'))
                } else if (op === 1) {
                    rightContent.last().addSpan(new DiffSpan(spanText, 'added'))
                } else {
                    leftContent.last().addSpan(new DiffSpan(spanText, 'removed'))
                }

                if (spanText.endsWith('\n')) {
                    if (op === 0) {
                        leftContent.addLine(true)
                        rightContent.addLine(true)
                    } else if (op === 1) {
                        leftContent.addLine(false)
                        rightContent.addLine(true)
                    } else {
                        leftContent.addLine(true)
                        rightContent.addLine(false)
                    }
                }
            })
        })
        leftContent.computeLineNumbers()
        rightContent.computeLineNumbers()

        return (
            <div className="flex">
                <div className="w-1/2 border-r">
                    <div className="p-2 text-sm text-gray-500 border-b mb-1">Original</div>
                    {renderContent(leftContent)}
                </div>
                <div className="w-1/2">
                    <div className="p-2 text-sm text-gray-500 border-b mb-1">Modified</div>
                    {renderContent(rightContent)}
                </div>
            </div>
        )

        function renderContent(content: Content) {
            return <pre className="whitespace-pre-wrap p-2">
                {content.lines.map((line, _) => (
                    <div key={line.uuid} className="flex">
                        <span className="w-8 select-none text-right pr-2">
                            {line.lineNumber || '\u00A0'}
                        </span>
                        <div className="flex-1 flex" style={{ overflowWrap: 'anywhere' }}>
                            <div>
                                {line.spans.map((span, _) => (
                                    <span key={span.uuid}
                                        className={span.state === 'added' ? 'bg-green-700' :
                                            span.state === 'removed' ? 'bg-red-700' : ''}
                                    >
                                        {span.content}
                                    </span>
                                ))}
                            </div>

                            {line.lastSpan()?.content.endsWith('\n') && (
                                <span
                                    className={`flex-1 ${line.lastSpan()?.state === 'added' ? 'bg-green-700' :
                                        line.lastSpan()?.state === 'removed' ? 'bg-red-700' :
                                            line.lastSpan()?.state === 'spacer' ? 'bg-gray-600' : ''}`} />
                            )}
                        </div>
                    </div>
                ))}
            </pre>
        }
    }, [inputA, inputB, mode])

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

    const headerHeight = '40px'
    return (
        <div className="h-screen flex flex-col bg-gray-900 text-gray-100">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
                <div className="flex-1 flex justify-center items-center">
                    <h1 className="text-4xl font-bold">txtl</h1>
                </div>
                <div className="flex space-x-4">
                    <a
                        href="https://github.com/viveksjain/txtl"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                    >
                        GitHub
                    </a>
                    <button className="hover:underline" onClick={() => setAboutOpen(true)}>About</button>
                </div>
            </div>
            <div className="flex flex-1">
                <div className="w-1/2 h-full flex flex-col">
                    <div className="flex shrink-0 items-center border-b border-gray-700" style={{ height: headerHeight }}>
                        <span className="ml-2 p-2">Input</span>
                    </div>
                    <div className="p-2 w-full h-full">
                        <textarea
                            ref={inputRef}
                            className="w-full h-full border p-2 resize-none bg-gray-800 text-gray-100"
                            placeholder="Enter input..."
                            value={inputA}
                            onChange={(e) => setInputA(e.target.value)}
                        />
                    </div>
                </div>
                <div
                    className={`w-1/2 h-full flex flex-col border-l border-gray-700 ${rightPaneSelected ? 'ring-2 ring-blue-500' : ''}`}
                    tabIndex={0}
                    onFocus={() => setRightPaneSelected(true)}
                    onBlur={() => setRightPaneSelected(false)}
                    onPaste={handleRightPanePaste}
                >
                    <div className="flex items-center border-b border-gray-700" style={{ height: headerHeight }}>
                        <span className="ml-2 p-2">Mode</span>
                        <select
                            className="p-2 bg-gray-800 text-gray-100"
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
                    <div className="h-full overflow-auto p-2" style={{ flex: "1 1 0" }}>
                        {renderRightPane()}
                    </div>
                </div>
            </div>
            {mode === 'diff' && (
                <>
                    <div
                        onMouseDown={handleDiffPanelResizeMouseDown}
                        className="bg-gray-700 cursor-row-resize"
                        style={{ height: '6px' }}
                    />
                    <div
                        style={{ height: diffPanelHeight }}
                        className="border-t border-gray-700 overflow-auto font-mono"
                    >
                        {diffContent}
                    </div>
                </>
            )}
            {aboutOpen && (
                <div
                    className="absolute top-0 left-0 w-full h-full flex items-center justify-center bg-black bg-opacity-50"
                    onClick={() => setAboutOpen(false)}
                >
                    <div
                        className="bg-gray-800 p-4 rounded shadow-lg max-w-md"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <p>
                            A fast, no frills collection of text utilities. This is a purely static webpage, all data is processed locally.
                            Source code available on <a href="https://github.com/viveksjain/txtl" className="underline">Github</a>.
                        </p>
                        <div className="flex justify-end">
                            <button onClick={() => setAboutOpen(false)} className="mt-2">Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
