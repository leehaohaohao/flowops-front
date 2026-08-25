import { useEffect, useMemo, useRef } from 'react'
import { Spin } from 'antd'

interface LogViewerProps {
  content: string
  height?: number | string
  autoScroll?: boolean
  loading?: boolean
  highlight?: string
}

export default function LogViewer({ content, height = 'calc(100vh - 320px)', autoScroll = true, loading = false, highlight }: LogViewerProps) {
  const preRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (!autoScroll || !preRef.current) return
    requestAnimationFrame(() => {
      if (preRef.current) {
        preRef.current.scrollTop = preRef.current.scrollHeight
      }
    })
  }, [content, autoScroll])

  const lines = useMemo(() => {
    if (!content) return []
    return content.split('\n')
  }, [content])

  const renderLine = (line: string, index: number) => {
    const lineNum = (
      <span style={{ color: '#666', textAlign: 'right', width: 48, flexShrink: 0, paddingRight: 8, borderRight: '1px solid #333', marginRight: 12, userSelect: 'none' }}>
        {index + 1}
      </span>
    )

    if (highlight && highlight.length > 0) {
      const escaped = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(`(${escaped})`, 'gi')
      const parts = line.split(regex)
      return (
        <div key={index} style={{ display: 'flex' }}>
          {lineNum}
          <span>
            {parts.map((part, i) =>
              part.toLowerCase() === highlight.toLowerCase()
                ? <mark key={i} style={{ background: '#e6c300', color: '#000', padding: 0 }}>{part}</mark>
                : part,
            )}
          </span>
        </div>
      )
    }
    return (
      <div key={index} style={{ display: 'flex' }}>
        {lineNum}
        <span>{line}</span>
      </div>
    )
  }

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
        {lines.length > 0 ? lines.map(renderLine) : '暂无日志内容'}
      </pre>
    </div>
  )
}
