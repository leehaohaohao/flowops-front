import { useEffect, useState } from 'react'
import { Button, message, Progress, Table, Tag, Typography } from 'antd'
import type { TableProps } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { getNodeList } from '@/api/nodes'
import type { NodeInfo } from '@/types'

const { Title } = Typography

export default function NodeList() {
  const [list, setList] = useState<NodeInfo[]>([])
  const [loading, setLoading] = useState(false)

  const fetchList = () => {
    setLoading(true)
    getNodeList()
      .then((res) => setList(res.data))
      .catch((err) => message.error((err as Error).message || '获取节点列表失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchList()
    const timer = setInterval(fetchList, 30000)
    return () => clearInterval(timer)
  }, [])

  const columns: TableProps<NodeInfo>['columns'] = [
    { title: '节点 ID', dataIndex: 'runnerId', width: 200 },
    { title: '主机名', dataIndex: 'hostname', width: 140 },
    { title: 'IP', dataIndex: 'ip', width: 140 },
    { title: '版本', dataIndex: 'version', width: 100 },
    {
      title: '状态',
      dataIndex: 'online',
      width: 90,
      render: (val: boolean) => (val ? <Tag color="green">在线</Tag> : <Tag>离线</Tag>),
    },
    {
      title: 'CPU',
      dataIndex: 'cpuUsage',
      width: 140,
      render: (val: number) => <Progress percent={Math.round(val)} size="small" />,
    },
    {
      title: '内存',
      dataIndex: 'memoryUsage',
      width: 140,
      render: (val: number) => <Progress percent={Math.round(val)} size="small" />,
    },
    { title: '运行中任务', dataIndex: 'runningTasks', width: 100 },
    {
      title: '最后心跳',
      dataIndex: 'lastHeartbeatTime',
      render: (val: number) => (val ? new Date(val).toLocaleString() : '-'),
    },
  ]

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <Title level={4} style={{ margin: 0 }}>
          节点管理
        </Title>
        <Button icon={<ReloadOutlined />} onClick={fetchList} loading={loading}>
          刷新
        </Button>
      </div>
      <Table columns={columns} dataSource={list} rowKey="runnerId" loading={loading} pagination={false} />
    </div>
  )
}
