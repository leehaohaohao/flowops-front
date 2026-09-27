import { useContext, useEffect, useState } from 'react'
import {
  Alert,
  Button,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { TableProps } from 'antd'
import { ImportOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  deleteNetwork,
  getNetworkList,
  grantNetworkToProject,
} from '@/api/networks'
import { getProjectList } from '@/api/projects'
import NetworkFormDrawer from '@/components/NetworkFormDrawer'
import type { NetworkFormMode } from '@/components/NetworkFormDrawer'
import { UserContext } from '@/App'
import { formatTime } from '@/utils/format'
import type { NetworkInfo, Project } from '@/types'

const { Title, Text } = Typography

/** 超级管理员专属的主节点网络管理页（F1） */
export default function NetworkList() {
  const userInfo = useContext(UserContext)
  const isAdmin = !!userInfo?.superAdmin

  const [list, setList] = useState<NetworkInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<NetworkFormMode>('create')
  const [grantOpen, setGrantOpen] = useState(false)
  const [grantNetwork, setGrantNetwork] = useState<NetworkInfo | null>(null)
  const [grantProjectId, setGrantProjectId] = useState<number | undefined>(undefined)
  const [granting, setGranting] = useState(false)

  const fetchList = () => {
    setLoading(true)
    getNetworkList()
      .then((res) => setList(res.data || []))
      .catch((err) => message.error((err as Error).message || '获取网络列表失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!isAdmin) return
    fetchList()
    getProjectList()
      .then((res) => setProjects(res.data || []))
      .catch(() => {})
  }, [isAdmin])

  const openDrawer = (mode: NetworkFormMode) => {
    setDrawerMode(mode)
    setDrawerOpen(true)
  }

  const openGrant = (record: NetworkInfo) => {
    setGrantNetwork(record)
    setGrantProjectId(undefined)
    setGrantOpen(true)
  }

  const handleGrant = async () => {
    if (!grantNetwork) return
    if (grantProjectId == null) {
      message.warning('请选择要授权的项目')
      return
    }
    try {
      setGranting(true)
      await grantNetworkToProject(grantNetwork.id, grantProjectId)
      message.success('已授权该项目使用网络')
      setGrantOpen(false)
      fetchList()
    } catch (err) {
      message.error((err as Error).message || '授权失败')
    } finally {
      setGranting(false)
    }
  }

  const handleDelete = async (record: NetworkInfo) => {
    try {
      await deleteNetwork(record.id)
      message.success('网络已删除')
      fetchList()
    } catch (err) {
      // 仍有授权/默认值/服务引用或 Docker 容器连接时后端会拒绝，透传原因
      message.error((err as Error).message || '删除失败')
    }
  }

  const columns: TableProps<NetworkInfo>['columns'] = [
    {
      title: '网络',
      dataIndex: 'displayName',
      render: (_, record) => (
        <div>
          <div>{record.displayName || record.name}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.name}
          </Text>
        </div>
      ),
    },
    {
      title: '来源',
      dataIndex: 'source',
      width: 110,
      render: (val: string) =>
        val === 'MANAGED' ? <Tag color="blue">托管</Tag> : <Tag color="orange">导入</Tag>,
    },
    {
      title: 'Docker 状态',
      dataIndex: 'dockerStatus',
      width: 120,
      render: (val: string) =>
        val === 'PRESENT' ? <Tag color="green">存在</Tag> : <Tag color="red">缺失</Tag>,
    },
    { title: '授权项目', dataIndex: 'grantedProjectCount', width: 100 },
    { title: '引用服务', dataIndex: 'serviceRefCount', width: 100 },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      width: 180,
      render: (val: string) => formatTime(val),
    },
    {
      title: '操作',
      width: 170,
      render: (_, record) => (
        <Space size="small">
          <Button size="small" onClick={() => openGrant(record)}>
            授权项目
          </Button>
          <Popconfirm
            title={`确认删除网络 ${record.displayName || record.name}？`}
            onConfirm={() => handleDelete(record)}
          >
            <Button size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  if (!isAdmin) {
    return (
      <div>
        <Title level={4} style={{ marginBottom: 16 }}>
          网络管理
        </Title>
        <Alert
          type="warning"
          showIcon
          title="仅超级管理员可管理主节点网络"
          description="如需为项目配置共享网络，请联系超级管理员。"
        />
      </div>
    )
  }

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
          网络管理
        </Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchList} loading={loading}>
            刷新
          </Button>
          <Button icon={<ImportOutlined />} onClick={() => openDrawer('import')}>
            导入网络
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openDrawer('create')}>
            新建网络
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={list}
        rowKey="id"
        loading={loading}
        pagination={false}
      />

      <NetworkFormDrawer
        open={drawerOpen}
        mode={drawerMode}
        onClose={() => setDrawerOpen(false)}
        onSuccess={() => fetchList()}
      />

      <Modal
        title={`授权项目使用网络：${grantNetwork?.displayName || grantNetwork?.name || ''}`}
        open={grantOpen}
        onOk={handleGrant}
        confirmLoading={granting}
        onCancel={() => setGrantOpen(false)}
      >
        <Select
          style={{ width: '100%', marginTop: 16 }}
          placeholder="选择项目"
          value={grantProjectId}
          onChange={setGrantProjectId}
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
        />
      </Modal>
    </div>
  )
}
