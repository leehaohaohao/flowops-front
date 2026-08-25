import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Flex, Input, Select, Space, Switch, Typography } from 'antd'
import { getContainerLogs } from '@/api/logs'
import LogViewer from '@/components/LogViewer'

const { Text } = Typography

const tailOptions = [
  { value: 100, label: '100' },
  { value: 200, label: '200' },
  { value: 500, label: '500' },
  { value: 1000, label: '1000' },
  { value: 2000, label: '2000' },
]

const sinceOptions = [
  { value: '', label: '不限' },
  { value: '5m', label: '最近 5 分钟' },
  { value: '15m', label: '最近 15 分钟' },
  { value: '30m', label: '最近 30 分钟' },
  { value: '1h', label: '最近 1 小时' },
  { value: '2h', label: '最近 2 小时' },
  { value: '6h', label: '最近 6 小时' },
  { value: '12h', label: '最近 12 小时' },
  { value: '24h', label: '最近 24 小时' },
]

export default function ContainerLogs() {
  const { projectId, id } = useParams<{ projectId: string; id: string }>()
  const navigate = useNavigate()
  const serviceId = Number(id)

  const [tail, setTail] = useState(500)
  const [since, setSince] = useState('')
  const [timestamps, setTimestamps] = useState(false)
  const [grep, setGrep] = useState('')
  const [status, setStatus] = useState('')
  const [logContent, setLogContent] = useState('点击"加载日志"或"实时跟踪"查看容器运行日志')
  const [following, setFollowing] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    return () => {
      wsRef.current?.close()
    }
  }, [])

  const handleLoad = async () => {
    stopFollow()
    setStatus('加载中...')
    setLogContent('')
    try {
      const res = await getContainerLogs(serviceId, {
        tail,
        since: since || undefined,
        until: undefined,
        timestamps: timestamps || undefined,
      })
      setLogContent(res.data)
      setStatus('加载完成')
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
      ws.send(JSON.stringify({
        serviceId,
        tail,
        follow: true,
        since: since || undefined,
        timestamps: timestamps || undefined,
        grep: grep || undefined,
      }))
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
        <Typography.Title level={4} style={{ margin: 0 }}>运行日志</Typography.Title>
        <Button onClick={() => navigate(`/projects/${projectId}/services`)}>返回服务列表</Button>
      </div>

      <Flex vertical gap={8} style={{ marginBottom: 16 }}>
        <Space wrap>
          <span>显示行数</span>
          <Select value={tail} onChange={setTail} options={tailOptions} style={{ width: 100 }} />
          <span>时间范围</span>
          <Select value={since} onChange={setSince} options={sinceOptions} style={{ width: 150 }} />
          <span>显示时间戳</span>
          <Switch checked={timestamps} onChange={setTimestamps} />
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
        <Input.Search
          placeholder="关键词过滤（服务端过滤）"
          value={grep}
          onChange={(e) => setGrep(e.target.value)}
          onSearch={handleFollow}
          style={{ maxWidth: 360 }}
          allowClear
        />
      </Flex>

      <LogViewer content={logContent} highlight={grep || undefined} />
    </div>
  )
}
