import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // antd 表单在 jsdom 下渲染较慢，放宽单测超时
    testTimeout: 30000,
    hookTimeout: 30000,
    // 依赖预打包：加速 antd 这类 UI 库在测试中的加载（jsdom 环境对应 client）
    deps: {
      optimizer: {
        client: {
          enabled: true,
          include: ['antd', '@ant-design/icons', '@ant-design/colors'],
        },
      },
    },
  },
})
