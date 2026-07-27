import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// https://vite.dev/config/
export default defineConfig({
  plugins: [react(),tailwindcss()],
  server: {
    // The gateway's CORS_ORIGINS allows exactly http://localhost:5173. If Vite
    // falls back to 5174 because 5173 is busy, every API call is rejected as
    // CORS_BLOCKED, which axios reports as ERR_NETWORK — indistinguishable from
    // a backend that is down. Fail loudly on a busy port instead.
    port: 5173,
    strictPort: true,
  },
})
