import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, DatePicker, Drawer, List, message, Select, Space, Tabs, Typography } from 'antd'
import { FullscreenOutlined } from '@ant-design/icons'
import { getContainerLogs, getLogContent, getLogDates, getLogFiles } from '@/api/logs'
import LogViewer from '@/components/LogViewer'
import dayjs from 'dayjs'

const { Text } = Typography

interface LogDrawerProps {
  open: boolean
  onClose: () => void
  serviceId: number
  serviceName: string
}

export default function LogDrawer({ open, onClose, serviceId, serviceName }: LogDrawerProps) {
  const navigate = useNavigate()

  // Deploy log state
  const [dates, setDates] = useState<string[]>([])
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [files, setFiles] = useState<string[]>([])
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [logContent, setLogContent] = useState('')
  const [loadingContent, setLoadingContent] = useState(false)

  // Realtime state
  const [following, setFollowing] = useState(false)
  const [followContent, setFollowContent] = useState('')
  const [followStatus, setFollowStatus] = useState('')
  const wsRef = useRef<WebSocket | null>(null)

  // Reset on open/service change
  useEffect(() => {
    if (!open || !serviceId) return
    setDates([])
    setSelectedDate('')
    setFiles([])
    setActiveFile(null)
    setLogContent('')
    setFollowContent('')
    setFollowStatus('')
    stopFollow()

    getLogDates(serviceId, 'deploy')
      .then((res) => {
        const d = res.data || []
        setDates(d)
        if (d.length > 0) setSelectedDate(d[d.length - 1])
      })
      .catch(() => {})
  }, [open, serviceId])

  // Fetch files when date changes
  useEffect(() => {
    if (!serviceId || !selectedDate) {
      setFiles([])
      return
    }
    getLogFiles(serviceId, 'deploy', selectedDate)
      .then((res) => setFiles(res.data || []))
      .catch(() => setFiles([]))
  }, [serviceId, selectedDate])

  // Cleanup on close
  useEffect(() => {
    if (!open) stopFollow()
  }, [open])

  const viewFile = async (filename: string) => {
    setActiveFile(filename)
    setLogContent('')
    setLoadingContent(true)
    try {
      const res = await getLogContent(serviceId, 'deploy', selectedDate, filename)
      setLogContent(res.data)
    } catch (err) {
      setLogContent('加载失败: ' + (err as Error).message)
    } finally {
      setLoadingContent(false)
    }
  }

  const handleFollow = () => {
    stopFollow()
    setFollowing(true)
    setFollowStatus('正在连接...')
    setFollowContent('')

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const token = localStorage.getItem('token') || ''
    const ws = new WebSocket(`${protocol}//${location.host}/ws/container-logs?token=${encodeURIComponent(token)}`)
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({ serviceId, tail: 500, follow: true }))
    }

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        switch (data.type) {
          case 'status':
            setFollowStatus(data.msg)
            break
          case 'statusLine':
            setFollowStatus(data.msg)
            setFollowContent((prev) => prev + '--- ' + data.msg + ' ---\n')
            break
          case 'line':
            setFollowContent((prev) => prev + data.msg + '\n')
            break
          case 'end':
            setFollowStatus(data.msg)
            setFollowing(false)
            break
          case 'error':
            setFollowContent((prev) => prev + '[错误] ' + data.msg + '\n')
            setFollowStatus('错误')
            setFollowing(false)
            break
        }
      } catch {
        setFollowContent((prev) => prev + e.data + '\n')
      }
    }

    ws.onerror = () => {
      setFollowStatus('WebSocket 连接失败')
      setFollowing(false)
    }

    ws.onclose = () => {
      setFollowStatus('连接已关闭')
      setFollowing(false)
    }
  }

  const stopFollow = () => {
    wsRef.current?.close()
    wsRef.current = null
    setFollowing(false)
  }

  const handleClearFollow = () => {
    setFollowContent('')
    setFollowStatus('')
  }

  const goFullscreen = () => {
    onClose()
    navigate('/logs')
  }

  const tabItems = [
    {
      key: 'deploy',
      label: '部署日志',
      children: (
        <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 200px)' }}>
          <div style={{ width: 240, flexShrink: 0, overflow: 'auto' }}>
            <div style={{ marginBottom: 8 }}>
              <Text strong style={{ fontSize: 12 }}>日期</Text>
              <DatePicker
                value={selectedDate ? dayjs(selectedDate) : null}
                onChange={(d) => setSelectedDate(d ? d.format('YYYY-MM-dd') : '')}
                style={{ width: '100%', marginTop: 4 }}
                allowClear={false}
                disabledDate={(d) => {
                  const formatted = d.format('YYYY-MM-dd')
                  return dates.length > 0 && !dates.includes(formatted)
                }}
                cellRender={(current, info) => {
                  if (info.type === 'date') {
                    const formatted = (current as dayjs.Dayjs).format('YYYY-MM-dd')
                    const hasLogs = dates.includes(formatted)
                    return (
                      <div style={{ color: hasLogs ? undefined : '#bbb' }}>
                        {(current as dayjs.Dayjs).date()}
                      </div>
                    )
                  }
                  return info.originNode
                }}
              />
            </div>
            <Text strong style={{ fontSize: 12 }}>日志文件</Text>
            <List
              size="small"
              dataSource={files}
              locale={{ emptyText: '暂无日志' }}
              renderItem={(filename) => (
                <List.Item
                  style={{
                    cursor: 'pointer',
                    padding: '4px 8px',
                    background: activeFile === filename ? '#e6f4ff' : undefined,
                    borderRadius: 4,
                  }}
                  onClick={() => viewFile(filename)}
                >
                  <Text ellipsis style={{ fontSize: 12 }}>{filename}</Text>
                </List.Item>
              )}
            />
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <LogViewer content={logContent} height="100%" loading={loadingContent} />
          </div>
        </div>
      ),
    },
    {
      key: 'follow',
      label: '实时跟踪',
      children: (
        <div>
          <Space style={{ marginBottom: 8 }}>
            <Button
              type="primary"
              size="small"
              onClick={handleFollow}
              disabled={following}
            >
              开始跟踪
            </Button>
            <Button size="small" onClick={stopFollow} disabled={!following}>
              停止跟踪
            </Button>
            <Button size="small" onClick={handleClearFollow}>清空</Button>
            {followStatus && <Text type="secondary">{followStatus}</Text>}
          </Space>
          <LogViewer content={followContent} height="calc(100vh - 280px)" />
        </div>
      ),
    },
  ]

  return (
    <Drawer
      title={`日志 — ${serviceName}`}
      open={open}
      onClose={onClose}
      width="70%"
      destroyOnClose
      extra={
        <Button icon={<FullscreenOutlined />} onClick={goFullscreen}>
          全屏
        </Button>
      }
    >
      <Tabs items={tabItems} defaultActiveKey="deploy" />
    </Drawer>
  )
}
