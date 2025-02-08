import React, { useState, useEffect, useRef } from 'react'
import { diffChars } from 'diff'

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
        let diff = diffChars(inputA, inputB)
        return (
            <div className="flex flex-col h-full">
                <textarea
                    className="flex-1 p-2 border"
                    placeholder="Paste input B..."
                    value={inputB}
                    onChange={(e) => setInputB(e.target.value)}
                />
                <div className="border-t p-2 h-1/3 overflow-auto">
                    {diff.map((part, i) => {
                        const color = part.added ? 'bg-green-200' : part.removed ? 'bg-red-200' : ''
                        return (
                            <span key={i} className={color}>{part.value}</span>
                        )
                    })}
                </div>
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

    useEffect(() => {
        inputRef.current?.focus()
    }, [])

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

    return (
        <div className="h-screen flex">
            <div className="w-1/2 h-full p-2">
                <textarea
                    ref={inputRef}
                    className="w-full h-full border p-2"
                    placeholder="Paste input..."
                    value={inputA}
                    onChange={(e) => setInputA(e.target.value)}
                />
            </div>
            <div className="w-1/2 h-full flex flex-col border-l">
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
    )
}