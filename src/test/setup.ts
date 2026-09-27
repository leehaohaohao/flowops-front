import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { message } from 'antd'

// antd 依赖浏览器 API，jsdom 未实现的部分在此补齐
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

if (!window.ResizeObserver) {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver
}

if (!window.CSS?.supports) {
  Object.defineProperty(window, 'CSS', {
    writable: true,
    value: { supports: () => false },
  })
}

// jsdom 不支持伪元素的 getComputedStyle，rc-table 测量滚动条时会触发 not-implemented 报错
const nativeGetComputedStyle = window.getComputedStyle.bind(window)
window.getComputedStyle = ((element: Element) =>
  nativeGetComputedStyle(element)) as typeof window.getComputedStyle

afterEach(async () => {
  cleanup()
  // antd 全局提示的自动关闭定时器可能在环境拆除后才触发渲染，先统一销毁
  message.destroy()
  // React 19 的被动效果回调会读取 window.event；等调度队列清空，
  // 避免环境拆除后抛出 "ReferenceError: window is not defined"
  await new Promise((resolve) => setImmediate(resolve))
})
