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
    const parsed = parseInt(val, base)
    return {
        decimal: parsed.toString(10),
        hex: '0x' + parsed.toString(16),
        octal: '0o' + parsed.toString(8),
        binary: '0b' + parsed.toString(2),
        detectedBase: base
    }
}

function detectTool(val: string) {
    const trimmed = val.trim()
    if (!trimmed) return ''
    if (trimmed.startsWith('{')) return 'json'
    const numeric = Number(trimmed)
    if (!isNaN(numeric)) {
        // Roughly, represents seconds since epoch from 2001 to 2049. We auto-detect as unix time.
        if (numeric >= 1000000000 && numeric <= 2500000000) return 'unix'
        return 'number'
    }
    return ''
}

function renderPaneByTool(
    tool: string,
    inputA: string,
    inputB: string,
    setInputB: React.Dispatch<React.SetStateAction<string>>
) {
    if (tool === 'diff') {
        return (
            <div className="h-full flex p-2">
                <textarea
                    className="w-full h-full resize-none border"
                    placeholder="Enter text to compare..."
                    value={inputB}
                    onChange={(e) => setInputB(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                />
            </div>
        )
    }
    if (tool === 'json') {
        try {
            const pretty = JSON.stringify(JSON.parse(inputA), null, 2)
            return <pre className="p-2 overflow-auto">{pretty}</pre>
        } catch {
            return <div className="p-2 text-red-600">Invalid JSON</div>
        }
    }
    if (tool === 'unix') {
        const { local, utc } = parseUnixTime(inputA)
        return (
            <div className="p-2">
                <div>Local: {local}</div>
                <div>UTC: {utc}</div>
            </div>
        )
    }
    if (tool === 'number') {
        const { decimal, hex, octal, binary, detectedBase } = parseNumber(inputA)
        const grayIf = (base: number) => base === detectedBase ? 'text-gray-400' : ''
        return (
            <div className="p-2 space-y-1">
                <div className={grayIf(10)}>Decimal: {decimal}</div>
                <div className={grayIf(16)}>Hex: {hex}</div>
                <div className={grayIf(8)}>Octal: {octal}</div>
                <div className={grayIf(2)}>Binary: {binary}</div>
            </div>
        )
    }
    return (!tool ? <div className="p-2">No tool auto-detected.</div> : null)
}

export default function App() {
    const [tool, setTool] = useState('')
    const [inputA, setInputA] = useState('')
    const [inputB, setInputB] = useState('')
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const [rightPaneSelected, setRightPaneSelected] = useState(false)
    const [diffPanelHeight, setDiffPanelHeight] = useState(256)

    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    const handleRightPaneKeyDown = async (e: React.KeyboardEvent) => {
        const isPaste = (e.metaKey || e.ctrlKey) && e.key === 'v'
        if (isPaste) {
            e.preventDefault()
            try {
                const text = await navigator.clipboard.readText()
                setTool('diff')
                setInputB(text)
            } catch (err) {
                console.error('Failed to read clipboard:', err)
            }
        }
    }

    const renderRightPane = () => {
        if (!tool) {
            const autodetected = detectTool(inputA)
            if (!autodetected) {
                return <div className="p-2">No tool auto-detected. Please enter valid input or choose a tool.</div>
            }
            return (
                <>
                    <div className="p-2">Auto-detected: {autodetected}</div>
                    {renderPaneByTool(autodetected, inputA, inputB, setInputB)}
                </>
            )
        }
        return renderPaneByTool(tool, inputA, inputB, setInputB)
    }

    const renderDiffContent = () => {
        const dmp = new diff_match_patch()
        const diffs = dmp.diff_main(inputA, inputB)
        dmp.diff_cleanupSemantic(diffs)

        const splitIntoLines = (content: React.ReactNode[]) => {
            let lineNumber = 1
            const lines: React.ReactNode[][] = [[]]

            content.forEach((node) => {
                if (typeof node === 'string') {
                    const textLines = node.split('\n')
                    textLines.forEach((line, i) => {
                        if (i > 0) {
                            lines.push([])
                            lineNumber++
                        }
                        if (line) lines[lines.length - 1].push(line)
                    })
                } else if (node && typeof node === 'object' && 'props' in node) {
                    const text = (node as React.ReactElement).props.children
                    if (text !== undefined) {
                        const textLines = text.split('\n')
                        textLines.forEach((line: string, i: number) => {
                            if (i > 0) {
                                lines.push([])
                                lineNumber++
                            }
                            if (line) {
                                lines[lines.length - 1].push(
                                    React.cloneElement(node as React.ReactElement, {
                                        key: `${lineNumber}-${i}`,
                                        children: line
                                    })
                                )
                            }
                        })
                    }
                }
            })
            return lines
        }

        const leftContent = diffs.map((diff, i) => {
            const [op, text] = diff
            if (op === 0) {
                return <span key={i}>{text}</span>
            } else if (op === -1) {
                return <span key={i} className="bg-red-200">{text}</span>
            } else {
                return <span key={i}></span>
            }
        })

        const rightContent = diffs.map((diff, i) => {
            const [op, text] = diff
            if (op === 0) {
                return <span key={i}>{text}</span>
            } else if (op === 1) {
                return <span key={i} className="bg-green-200">{text}</span>
            } else {
                return <span key={i}></span>
            }
        })

        const leftLines = splitIntoLines(leftContent)
        const rightLines = splitIntoLines(rightContent)

        return (
            <div className="flex">
                <div className="w-1/2 border-r">
                    <div className="text-sm text-gray-500 border-b mb-1">Original</div>
                    <pre className="whitespace-pre-wrap">
                        {leftLines.map((line, i) => (
                            <div key={i} className="flex">
                                <span className="w-8 text-gray-400 select-none text-right pr-2">{i + 1}</span>
                                <div className="flex-1">{line}</div>
                            </div>
                        ))}
                    </pre>
                </div>
                <div className="w-1/2 pl-2">
                    <div className="text-sm text-gray-500 border-b mb-1">Modified</div>
                    <pre className="whitespace-pre-wrap">
                        {rightLines.map((line, i) => (
                            <div key={i} className="flex">
                                <span className="w-8 text-gray-400 select-none text-right pr-2">{i + 1}</span>
                                <div className="flex-1">{line}</div>
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

    return (
        <div className="h-screen flex flex-col">
            <div className="flex flex-1">
                <div className="w-1/2 h-full p-2">
                    <textarea
                        ref={inputRef}
                        className="w-full h-full border p-2 resize-none"
                        placeholder="Enter input..."
                        value={inputA}
                        onChange={(e) => setInputA(e.target.value)}
                    />
                </div>
                <div
                    className={`w-1/2 h-full flex flex-col border-l ${rightPaneSelected ? 'ring-2 ring-blue-500' : ''}`}
                    tabIndex={0}
                    onFocus={() => setRightPaneSelected(true)}
                    onBlur={() => setRightPaneSelected(false)}
                    onKeyDown={handleRightPaneKeyDown}
                >
                    <select
                        className="p-2"
                        value={tool}
                        onChange={(e) => setTool(e.target.value)}
                    >
                        <option value="">Autodetect</option>
                        <option value="diff">Text diff</option>
                        <option value="json">JSON pretty print</option>
                        <option value="unix">Unix time</option>
                        <option value="number">Number conversion</option>
                    </select>
                    <div className="flex-1 overflow-auto">
                        {renderRightPane()}
                    </div>
                </div>
            </div>
            {tool === 'diff' && (
                <>
                    <div
                        onMouseDown={handleDiffPanelResizeMouseDown}
                        className="bg-gray-300 cursor-row-resize"
                        style={{ height: '6px' }}
                    />
                    <div
                        style={{ height: diffPanelHeight }}
                        className="border-t p-2 overflow-auto font-mono"
                    >
                        {renderDiffContent()}
                    </div>
                </>
            )}
        </div>
    )
}