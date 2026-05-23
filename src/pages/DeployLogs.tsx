import { useEffect, useRef, useState } from 'react'
import { Button, message, Space, Table, Typography } from 'antd'
import type { TableProps } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import { getLogList } from '@/api/logs'
import { env } from '@/config/env'

const { Title } = Typography

export default function DeployLogs() {
  const [files, setFiles] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [logContent, setLogContent] = useState('点击上方日志文件查看内容')
  const wsRef = useRef<WebSocket | null>(null)

  const fetchList = () => {
    setLoading(true)
    getLogList()
      .then((res) => setFiles(res.data))
      .catch((err) => message.error((err as Error).message || '获取日志列表失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchList()
    return () => {
      wsRef.current?.close()
    }
  }, [])

  const viewLog = (filename: string) => {
    wsRef.current?.close()
    setActiveFile(filename)
    setLogContent('加载中...')

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${location.host}/ws/logs`)
    wsRef.current = ws

    ws.onopen = () => ws.send(filename)

    ws.onmessage = (e) => {
      setLogContent((prev) => {
        if (prev === '加载中...') return e.data
        return prev + e.data
      })
    }

    ws.onerror = () => {
      setLogContent('WebSocket 连接失败，请重试')
    }
  }

  const downloadUrl = (filename: string) => {
    const base = env.apiBaseUrl || ''
    return `${base}/api/logs/content?filename=${encodeURIComponent(filename)}`
  }

  const columns: TableProps<string>['columns'] = [
    {
      title: '日志文件',
      dataIndex: 'toString',
      render: (_, filename) => (
        <a onClick={() => viewLog(filename)} style={{ cursor: 'pointer' }}>
          {filename}
        </a>
      ),
    },
    {
      title: '操作',
      width: 100,
      render: (_, filename) => (
        <Button size="small" icon={<DownloadOutlined />} href={downloadUrl(filename)}>
          下载
        </Button>
      ),
    },
  ]

  return (
    <div>
      <Title level={4}>日志查看</Title>

      <div style={{ marginTop: 16 }}>
        <Title level={5}>部署日志列表</Title>
        <Table
          columns={columns}
          dataSource={files}
          rowKey={(f) => f}
          loading={loading}
          pagination={false}
          size="small"
          locale={{ emptyText: '暂无日志' }}
        />
      </div>

      <div style={{ marginTop: 24 }}>
        <Space style={{ marginBottom: 8 }}>
          <Title level={5} style={{ margin: 0 }}>实时日志</Title>
          {activeFile && <span style={{ color: '#999', fontSize: 13 }}>- {activeFile}</span>}
        </Space>
        <pre
          style={{
            background: '#1e1e1e',
            color: '#d4d4d4',
            padding: 16,
            borderRadius: 4,
            maxHeight: 500,
            overflow: 'auto',
            fontSize: 13,
            fontFamily: "'Cascadia Code','Fira Code','Consolas',monospace",
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {logContent}
        </pre>
      </div>
    </div>
  )
}
