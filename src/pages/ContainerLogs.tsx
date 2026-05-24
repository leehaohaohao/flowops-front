import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Select, Space, Typography } from 'antd'
import { getContainerLogs } from '@/api/logs'

const { Title, Text } = Typography

const tailOptions = [
  { value: 100, label: '100' },
  { value: 200, label: '200' },
  { value: 500, label: '500' },
  { value: 1000, label: '1000' },
  { value: 2000, label: '2000' },
]

export default function ContainerLogs() {
  const { projectId, id } = useParams<{ projectId: string; id: string }>()
  const navigate = useNavigate()
  const serviceId = Number(id)

  const [tail, setTail] = useState(500)
  const [status, setStatus] = useState('')
  const [logContent, setLogContent] = useState('点击"加载日志"或"实时跟踪"查看容器运行日志')
  const [following, setFollowing] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const contentRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    return () => {
      wsRef.current?.close()
    }
  }, [])

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      if (contentRef.current) {
        contentRef.current.scrollTop = contentRef.current.scrollHeight
      }
    })
  }

  const handleLoad = async () => {
    stopFollow()
    setStatus('加载中...')
    setLogContent('')
    try {
      const res = await getContainerLogs(serviceId, tail)
      setLogContent(res.data)
      setStatus('加载完成')
      scrollToBottom()
    } catch (err) {
      setLogContent('加载失败: ' + (err as Error).message)
      setStatus('')
    }
  }

  const handleFollow = () => {
    stopFollow()
    setFollowing(true)
    setStatus('正在连接...')
    setLogContent('')

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${location.host}/ws/container-logs`)
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({ serviceId, tail, follow: true }))
    }

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        switch (data.type) {
          case 'status':
            setStatus(data.msg)
            break
          case 'statusLine':
            setStatus(data.msg)
            setLogContent((prev) => prev + '--- ' + data.msg + ' ---\n')
            break
          case 'line':
            setLogContent((prev) => prev + data.msg + '\n')
            scrollToBottom()
            break
          case 'end':
            setStatus(data.msg)
            setFollowing(false)
            break
          case 'error':
            setLogContent((prev) => prev + '[错误] ' + data.msg + '\n')
            setStatus('错误')
            setFollowing(false)
            break
        }
      } catch {
        setLogContent((prev) => prev + e.data + '\n')
      }
    }

    ws.onerror = () => {
      setStatus('WebSocket 连接失败')
      setFollowing(false)
    }

    ws.onclose = () => {
      setStatus('连接已关闭')
      setFollowing(false)
    }
  }

  const stopFollow = () => {
    wsRef.current?.close()
    wsRef.current = null
    setFollowing(false)
  }

  const handleClear = () => {
    setLogContent('')
    setStatus('')
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>运行日志</Title>
        <Button onClick={() => navigate(`/projects/${projectId}/services`)}>返回服务列表</Button>
      </div>

      <Space style={{ marginBottom: 16 }}>
        <span>显示行数</span>
        <Select value={tail} onChange={setTail} options={tailOptions} style={{ width: 100 }} />
        <Button type="primary" onClick={handleLoad} disabled={following}>
          加载日志
        </Button>
        <Button
          style={{ background: '#52c41a', borderColor: '#52c41a', color: '#fff' }}
          onClick={handleFollow}
          disabled={following}
        >
          实时跟踪
        </Button>
        <Button onClick={stopFollow} disabled={!following}>
          停止跟踪
        </Button>
        <Button onClick={handleClear}>清空</Button>
        {status && <Text type="secondary">{status}</Text>}
      </Space>

      <pre
        ref={contentRef}
        style={{
          background: '#1e1e1e',
          color: '#d4d4d4',
          padding: 16,
          borderRadius: 4,
          height: 'calc(100vh - 260px)',
          overflow: 'auto',
          fontSize: 13,
          lineHeight: 1.5,
          fontFamily: "'Cascadia Code','Fira Code','Consolas',monospace",
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {logContent}
      </pre>
    </div>
  )
}
