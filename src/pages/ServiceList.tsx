import { useContext, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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
import {
  deployRemove,
  deployRestart,
  deployStart,
  deployStop,
  getServiceList,
} from '@/api/services'
import { getProject } from '@/api/projects'
import { UserContext } from '@/App'
import { hasPermission } from '@/utils/permission'
import type { DeployService } from '@/types'

const { Title } = Typography

const serviceTypeMap: Record<string, string> = {
  backend: '纯后端',
  frontend: '纯前端',
  fullstack: '前后端一体',
}

export default function ServiceList() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const userInfo = useContext(UserContext)!
  const [list, setList] = useState<DeployService[]>([])
  const [loading, setLoading] = useState(true)
  const [projectName, setProjectName] = useState('')

  const pid = Number(projectId)

  useEffect(() => {
    if (pid) {
      getProject(pid)
        .then((res) => setProjectName(res.data.name))
        .catch(() => {})
    }
  }, [pid])

  const fetchList = () => {
    setLoading(true)
    getServiceList()
      .then((res) => {
        const filtered = pid ? res.data.filter((s) => s.projectId === pid) : res.data
        setList(filtered)
      })
      .catch((err) => message.error((err as Error).message || '获取服务列表失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchList()
  }, [pid])

  const handleAction = async (
    action: 'deploy' | 'stop' | 'restart' | 'remove',
    id: number,
  ) => {
    const fnMap = { deploy: deployStart, stop: deployStop, restart: deployRestart, remove: deployRemove }
    const msgMap = { deploy: '部署中，请稍候...', stop: '已停止', restart: '已重启', remove: '已删除' }
    try {
      await fnMap[action](id)
      message.success(msgMap[action])
      fetchList()
    } catch (err) {
      message.error((err as Error).message || '操作失败')
    }
  }

  const canCreate = userInfo.superAdmin || (pid && hasPermission(userInfo, { projectId: pid } as DeployService, 'EDIT_CONFIG'))

  const columns: TableProps<DeployService>['columns'] = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '服务名', dataIndex: 'name' },
    {
      title: '类型',
      dataIndex: 'serviceType',
      width: 120,
      render: (val: string) => serviceTypeMap[val] || val,
    },
    { title: '端口', dataIndex: 'port', width: 80 },
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
      render: (_, record) => {
        const canDeploy = hasPermission(userInfo, record, 'DEPLOY')
        const canStop = hasPermission(userInfo, record, 'STOP')
        const canEdit = hasPermission(userInfo, record, 'EDIT_CONFIG')
        const canDelete = hasPermission(userInfo, record, 'DELETE')
        const canView = hasPermission(userInfo, record, 'VIEW')

        return (
          <Space size="small" wrap>
            {canEdit && (
              <Button size="small" onClick={() => navigate(`/services/${record.id}`)}>
                编辑
              </Button>
            )}
            {canView && (
              <Button size="small" onClick={() => navigate(`/services/${record.id}/logs`)}>
                日志
              </Button>
            )}
            {canDeploy && (
              <Popconfirm title="确认部署？" onConfirm={() => handleAction('deploy', record.id)}>
                <Button size="small" type="primary">
                  部署
                </Button>
              </Popconfirm>
            )}
            {canDeploy && (
              <Popconfirm title="确认重启？" onConfirm={() => handleAction('restart', record.id)}>
                <Button size="small">重启</Button>
              </Popconfirm>
            )}
            {canStop && (
              <Popconfirm title="确认停止？" onConfirm={() => handleAction('stop', record.id)}>
                <Button size="small">停止</Button>
              </Popconfirm>
            )}
            {canDelete && (
              <Popconfirm title="确认删除该容器？" onConfirm={() => handleAction('remove', record.id)}>
                <Button size="small" danger>
                  删除
                </Button>
              </Popconfirm>
            )}
          </Space>
        )
      },
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
        <Space>
          <Button onClick={() => navigate('/projects')}>返回项目列表</Button>
          <Title level={4} style={{ margin: 0 }}>
            {projectName ? `${projectName} — 服务列表` : '服务列表'}
          </Title>
        </Space>
        {canCreate && (
          <Button type="primary" onClick={() => navigate(`/projects/${projectId}/services/create`)}>
            创建服务
          </Button>
        )}
      </div>
      <Table columns={columns} dataSource={list} rowKey="id" loading={loading} pagination={false} />
    </div>
  )
}
