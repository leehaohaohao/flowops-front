import { useEffect, useRef } from 'react'
import { Spin } from 'antd'

interface LogViewerProps {
  content: string
  height?: number | string
  autoScroll?: boolean
  loading?: boolean
}

export default function LogViewer({ content, height = 'calc(100vh - 320px)', autoScroll = true, loading = false }: LogViewerProps) {
  const preRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (!autoScroll || !preRef.current) return
    requestAnimationFrame(() => {
      if (preRef.current) {
        preRef.current.scrollTop = preRef.current.scrollHeight
      }
    })
  }, [content, autoScroll])

  return (
    <div style={{ position: 'relative' }}>
      {loading && (
        <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}>
          <Spin size="small" />
        </div>
      )}
      <pre
        ref={preRef}
        style={{
          background: '#1e1e1e',
          color: '#d4d4d4',
          padding: 16,
          borderRadius: 4,
          height,
          overflow: 'auto',
          fontSize: 13,
          lineHeight: 1.5,
          fontFamily: "'Cascadia Code','Fira Code','Consolas',monospace",
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          margin: 0,
        }}
      >
        {content || '暂无日志内容'}
      </pre>
    </div>
  )
}
