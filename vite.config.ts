
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    // Allow Github Action to override base
    base: process.env.OVERRIDE_BASE || undefined,
    plugins: [react()]
})