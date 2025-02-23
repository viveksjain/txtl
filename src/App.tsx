import React, { useState, useEffect, useRef } from 'react'
import { diff_match_patch } from 'diff-match-patch'

function parseUnixTime(val: string) {
    const n = Number(val)
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
        // Roughly, represents seconds since epoch from 2001 to 2049. We auto-detect as unix time.
        if (numeric >= 1000000000 && numeric <= 2500000000) return 'unix'
        return 'number'
    }
    try {
        new URL(trimmed)
        return 'urlendecode'
    } catch {
        // Not a valid URL
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
                return <pre className="overflow-auto">{pretty}</pre>
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
            try {
                const encoded = encodeURIComponent(inputA)
                const decoded = decodeURIComponent(inputA)
                return (
                    <div>
                        <div>Encoded:</div>
                        <div>{encoded}</div>
                        <div className="my-4 border-t border-gray-500"></div>
                        <div>Decoded:</div>
                        <div>{decoded}</div>
                    </div>
                )
            } catch (err) {
                return <div className="text-red-600">Invalid URL: {err.message}</div>
            }
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

    function renderDiffContent() {
        const dmp = new diff_match_patch()
        const diffs = dmp.diff_main(inputA, inputB)
        dmp.diff_cleanupSemantic(diffs)

        class DiffSpan {
            content: string;
            state: 'added' | 'removed' | 'unchanged';

            constructor(content: string, state: 'added' | 'removed' | 'unchanged') {
                this.content = content;
                this.state = state;
            }
        }
        class DiffLine {
            spans: DiffSpan[];
            lineNumber?: number;

            constructor() {
                this.spans = [];
            }

            addSpan(span: DiffSpan) {
                this.spans.push(span);
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

            addLine() {
                this.lines.push(new DiffLine());
            }

            computeLineNumbers() {
                let lineNumber = 1;
                this.lines.forEach((line) => {
                    if (line.spans.length !== 0) {
                        line.lineNumber = lineNumber;
                        lineNumber++;
                    }
                });
            }
        }

        let leftContent = new Content()
        let rightContent = new Content()
        diffs.map((diff, _) => {
            const [op, text] = diff
            text.split('\n').forEach((spanText, i) => {
                if (i > 0) {
                    leftContent.addLine()
                    rightContent.addLine()
                }

                if (op === 0) {
                    // TODO we should try to distinguish between newline unchanged and newline added/removed
                    if (spanText !== '') {
                        leftContent.last().addSpan(new DiffSpan(spanText, 'unchanged'))
                        rightContent.last().addSpan(new DiffSpan(spanText, 'unchanged'))
                    }
                } else if (op === 1) {
                    rightContent.last().addSpan(new DiffSpan(spanText, 'added'))
                } else {
                    leftContent.last().addSpan(new DiffSpan(spanText, 'removed'))
                }
            })
        })
        leftContent.computeLineNumbers()
        rightContent.computeLineNumbers()
        console.log(leftContent, rightContent)

        return (
            <div className="flex">
                <div className="w-1/2 border-r">
                    <div className="p-2 text-sm text-gray-500 border-b mb-1">Original</div>
                    <pre className="whitespace-pre-wrap p-2">
                        {leftContent.lines.map((line, i) => (
                            <div key={i} className="flex">
                                <span className="w-8 select-none text-right pr-2">
                                    {line.lineNumber || '\u00A0'}
                                </span>
                                <div className="flex-1">
                                    {line.spans.map((span, j) => (
                                        <span
                                            key={`${i}-${j}`}
                                            className={
                                                span.state === 'added' ? 'bg-green-700' :
                                                    span.state === 'removed' ? 'bg-red-700' : ''
                                            }
                                        >
                                            {span.content}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </pre>
                </div>
                <div className="w-1/2">
                    <div className="p-2 text-sm text-gray-500 border-b mb-1">Modified</div>
                    <pre className="whitespace-pre-wrap p-2">
                        {rightContent.lines.map((line, i) => (
                            <div key={i} className="flex">
                                <span className="w-8 select-none text-right pr-2">
                                    {line.lineNumber || '\u00A0'}
                                </span>
                                <div className="flex-1">
                                    {line.spans.map((span, j) => (
                                        <span
                                            key={`${i}-${j}`}
                                            className={
                                                span.state === 'added' ? 'bg-green-700' :
                                                    span.state === 'removed' ? 'bg-red-700' : ''
                                            }
                                        >
                                            {span.content}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </pre>
                </div>
            </div>
        )
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

    const headerHeight = '40px'
    return (
        <div className="h-screen flex flex-col bg-gray-900 text-gray-100">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
                <div className="flex-1 flex justify-center items-center">
                    <h1 className="text-4xl font-bold">txtl</h1>
                </div>
                <button onClick={() => setAboutOpen(true)}>About</button>
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
                    <div className="flex items-center h-full border-b border-gray-700" style={{ height: headerHeight }}>
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
                            <option value="urlendecode">URL decode/encode</option>
                        </select>
                    </div>
                    <div className="flex-1 overflow-auto p-2">
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
                        {renderDiffContent()}
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