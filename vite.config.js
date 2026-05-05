import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/lthg-bantru/',           // đổi thành thư mục github pages
  build: {
    outDir: 'dist',
  },
})
