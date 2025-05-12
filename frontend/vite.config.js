import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': '/src',
      // You can add more aliases here if needed
      // e.g., '@components': path.resolve(__dirname, './src/components'),
    },
  },
})
