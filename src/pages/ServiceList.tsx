import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  message,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { TableProps } from 'antd'
import { deployRestart, deployStart, deployStop, getServiceList } from '@/api/services'
import type { DeployService } from '@/types'

const { Title } = Typography

const serviceTypeMap: Record<string, string> = {
  backend: '后端',
  frontend: '前端',
  fullstack: '前后端',
}

export default function ServiceList() {
  const navigate = useNavigate()
  const [list, setList] = useState<DeployService[]>([])
  const [loading, setLoading] = useState(true)

  const fetchList = () => {
    setLoading(true)
    getServiceList()
      .then((res) => setList(res.data))
      .catch((err) => message.error((err as Error).message || '获取服务列表失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchList()
  }, [])

  const handleAction = async (action: 'start' | 'stop' | 'restart', id: number) => {
    try {
      const fn = action === 'start' ? deployStart : action === 'stop' ? deployStop : deployRestart
      await fn(id)
      message.success('操作成功')
      fetchList()
    } catch (err) {
      message.error((err as Error).message || '操作失败')
    }
  }

  const columns: TableProps<DeployService>['columns'] = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 60,
    },
    {
      title: '服务名',
      dataIndex: 'name',
    },
    {
      title: '类型',
      dataIndex: 'serviceType',
      width: 100,
      render: (val: string) => serviceTypeMap[val] || val,
    },
    {
      title: '端口',
      dataIndex: 'port',
      width: 80,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (val: string) => (
        <Tag color={val === 'running' ? 'green' : 'default'}>
          {val === 'running' ? '运行中' : '已停止'}
        </Tag>
      ),
    },
    {
      title: '操作',
      width: 260,
      render: (_, record) => (
        <Space size="small">
          <Button size="small" onClick={() => navigate(`/services/${record.id}`)}>
            编辑
          </Button>
          <Button size="small" onClick={() => navigate(`/services/${record.id}/logs`)}>
            日志
          </Button>
          {record.status === 'running' ? (
            <>
              <Popconfirm title="确认重启？" onConfirm={() => handleAction('restart', record.id)}>
                <Button size="small">重启</Button>
              </Popconfirm>
              <Popconfirm title="确认停止？" onConfirm={() => handleAction('stop', record.id)}>
                <Button size="small" danger>
                  停止
                </Button>
              </Popconfirm>
            </>
          ) : (
            <Popconfirm title="确认部署？" onConfirm={() => handleAction('start', record.id)}>
              <Button size="small" type="primary">
                部署
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          服务管理
        </Title>
        <Button type="primary" onClick={() => navigate('/services/create')}>
          创建服务
        </Button>
      </div>
      <Table
        columns={columns}
        dataSource={list}
        rowKey="id"
        loading={loading}
        pagination={false}
      />
    </div>
  )
}
