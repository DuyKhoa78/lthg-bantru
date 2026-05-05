import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/',           // Cấu hình base thành '/' khi dùng Netlify hoặc tên miền riêng
  build: {
    outDir: 'dist',
  },
})
