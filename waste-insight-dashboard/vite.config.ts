import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves at /waste-insight-dashboard/ — change if repo name changes
  base: '/Waste-Insight/',
})
