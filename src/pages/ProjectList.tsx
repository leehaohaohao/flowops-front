import { useCallback, useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Card,
  Col,
  Drawer,
  Empty,
  Form,
  Input,
  message,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import type { TableProps } from 'antd'
import {
  ApartmentOutlined,
  DeleteOutlined,
  EditOutlined,
  ImportOutlined,
  PlusOutlined,
  TeamOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons'
import { createProject, deleteProject, getProjectList, updateProject } from '@/api/projects'
import {
  getDefaultNetwork,
  getNetworkList,
  getProjectNetworks,
  grantNetworkToProject,
  revokeNetworkFromProject,
  setDefaultNetwork,
} from '@/api/networks'
import NetworkFormDrawer from '@/components/NetworkFormDrawer'
import type { NetworkFormMode } from '@/components/NetworkFormDrawer'
import { UserContext } from '@/App'
import { isSupervisor } from '@/utils/permission'
import type { NetworkInfo, Project, ProjectNetwork } from '@/types'

const { Title, Text } = Typography

const LAST_VISITED_KEY = 'lastVisitedProjectId'

function getLastVisitedId(): number | null {
  const v = localStorage.getItem(LAST_VISITED_KEY)
  return v ? Number(v) : null
}

export default function ProjectList() {
  const navigate = useNavigate()
  const userInfo = useContext(UserContext)
  const [list, setList] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [networkProject, setNetworkProject] = useState<Project | null>(null)
  const [form] = Form.useForm()

  if (!userInfo) return null

  const canManage =
    userInfo.superAdmin ||
    isSupervisor(userInfo) ||
    Object.values(userInfo.projectPermissions || {}).some((perms) =>
      perms.includes('MANAGE_MEMBERS'),
    )

  const lastVisitedId = getLastVisitedId()
  const lastVisited = lastVisitedId ? list.find((p) => p.id === lastVisitedId) : null

  const fetchList = () => {
    setLoading(true)
    getProjectList()
      .then((res) => setList(res.data))
      .catch((err) => message.error((err as Error).message || '获取项目列表失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchList()
  }, [])

  const goToServices = (project: Project) => {
    localStorage.setItem(LAST_VISITED_KEY, String(project.id))
    navigate(`/projects/${project.id}/services`)
  }

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openEdit = (e: React.MouseEvent, record: Project) => {
    e.stopPropagation()
    setEditing(record)
    form.setFieldsValue({ name: record.name, description: record.description })
    setModalOpen(true)
  }

  const openNetwork = (e: React.MouseEvent, record: Project) => {
    e.stopPropagation()
    setNetworkProject(record)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      if (editing) {
        await updateProject(editing.id, values)
        message.success('更新成功')
      } else {
        await createProject(values)
        message.success('创建成功')
      }
      setModalOpen(false)
      form.resetFields()
      fetchList()
    } catch (err) {
      if ((err as Error).message) {
        message.error((err as Error).message || '操作失败')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    try {
      await deleteProject(id)
      message.success('删除成功')
      fetchList()
    } catch (err) {
      message.error((err as Error).message || '删除失败')
    }
  }

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center' }}>加载中...</div>
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
          项目管理
        </Title>
        {canManage && (
          <Button type="primary" onClick={openCreate}>
            创建项目
          </Button>
        )}
      </div>

      {lastVisited && (
        <div
          style={{
            marginBottom: 24,
            padding: '12px 16px',
            background: '#f6f8fa',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Text type="secondary">上次访问：</Text>
          <a
            onClick={() => goToServices(lastVisited)}
            style={{ fontWeight: 500 }}
          >
            {lastVisited.name}
          </a>
          <ArrowRightOutlined style={{ color: '#999', fontSize: 12 }} />
        </div>
      )}

      {list.length === 0 ? (
        <Empty description="暂无项目" />
      ) : (
        <Row gutter={[16, 16]}>
          {list.map((project) => {
            const isDefault = project.isDefault === 1
            const canEditProject =
              userInfo.superAdmin || isSupervisor(userInfo, project.id)
            const canManageMembers =
              userInfo.superAdmin ||
              isSupervisor(userInfo, project.id) ||
              (userInfo.projectPermissions?.[String(project.id)]?.includes('MANAGE_MEMBERS') ??
                false)

            return (
              <Col key={project.id} xs={24} sm={12} lg={8}>
                <Card
                  hoverable
                  onClick={() => goToServices(project)}
                  style={{ height: '100%' }}
                  styles={{ body: { display: 'flex', flexDirection: 'column', height: '100%' } }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ marginBottom: 8 }}>
                      <Text strong style={{ fontSize: 16 }}>
                        {project.name}
                      </Text>
                      {isDefault && (
                        <Text
                          type="secondary"
                          style={{ marginLeft: 8, fontSize: 12 }}
                        >
                          [默认]
                        </Text>
                      )}
                    </div>
                    <Text
                      type="secondary"
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        marginBottom: 16,
                      }}
                    >
                      {project.description || '暂无描述'}
                    </Text>

                    <Row gutter={16}>
                      <Col span={8}>
                        <Statistic
                          title="服务数"
                          value={project.serviceCount ?? 0}
                          styles={{ content: { fontSize: 20 } }}
                        />
                      </Col>
                      <Col span={8}>
                        <Statistic
                          title="运行中"
                          value={project.runningCount ?? 0}
                          styles={{
                            content: {
                              fontSize: 20,
                              color: (project.runningCount ?? 0) > 0 ? '#52c41a' : undefined,
                            },
                          }}
                        />
                      </Col>
                      <Col span={8}>
                        <Statistic
                          title="成员数"
                          value={project.memberCount ?? 0}
                          styles={{ content: { fontSize: 20 } }}
                        />
                      </Col>
                    </Row>
                  </div>

                  {canManage && (canManageMembers || canEditProject) && (
                    <div
                      style={{
                        borderTop: '1px solid #f0f0f0',
                        marginTop: 16,
                        paddingTop: 12,
                        display: 'flex',
                        gap: 8,
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {canManageMembers && (
                        <Button
                          size="small"
                          icon={<TeamOutlined />}
                          onClick={() =>
                            navigate(`/projects/${project.id}/members`)
                          }
                        >
                          成员
                        </Button>
                      )}
                      {canEditProject && (
                        <Button
                          size="small"
                          icon={<ApartmentOutlined />}
                          onClick={(e) => openNetwork(e, project)}
                        >
                          网络
                        </Button>
                      )}
                      {canEditProject && (
                        <Button
                          size="small"
                          icon={<EditOutlined />}
                          onClick={(e) => openEdit(e, project)}
                        >
                          编辑
                        </Button>
                      )}
                      {canEditProject &&
                        (isDefault ? (
                          <Tooltip title="默认项目不可删除">
                            <Button size="small" danger disabled icon={<DeleteOutlined />}>
                              删除
                            </Button>
                          </Tooltip>
                        ) : (
                          <Popconfirm
                            title="确认删除该项目？需先移除项目下所有服务。"
                            onConfirm={(e) => handleDelete(e!, project.id)}
                          >
                            <Button size="small" danger icon={<DeleteOutlined />}>
                              删除
                            </Button>
                          </Popconfirm>
                        ))}
                    </div>
                  )}
                </Card>
              </Col>
            )
          })}
        </Row>
      )}

      <ProjectNetworkDrawer
        open={!!networkProject}
        project={networkProject}
        isSuperAdmin={!!userInfo.superAdmin}
        canManageDefault={
          !!userInfo.superAdmin ||
          (networkProject ? isSupervisor(userInfo, networkProject.id) : false)
        }
        onClose={() => setNetworkProject(null)}
      />

      <Modal
        title={editing ? '编辑项目' : '创建项目'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="项目名称"
            rules={[{ required: true, message: '请输入项目名称' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

/**
 * 项目网络入口抽屉（F2）：查看项目已授权网络、设置/清除默认网络、超管授权与撤权。
 * 创建/导入网络复用 F1 的 NetworkFormDrawer，不在本页重复实现。
 */
function ProjectNetworkDrawer({
  open,
  project,
  isSuperAdmin,
  canManageDefault,
  onClose,
}: {
  open: boolean
  project: Project | null
  isSuperAdmin: boolean
  canManageDefault: boolean
  onClose: () => void
}) {
  const projectId = project?.id
  const [networks, setNetworks] = useState<ProjectNetwork[]>([])
  const [defaultNetworkId, setDefaultNetworkId] = useState<number | null>(null)
  const [allNetworks, setAllNetworks] = useState<NetworkInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [grantOpen, setGrantOpen] = useState(false)
  const [grantNetworkId, setGrantNetworkId] = useState<number | undefined>(undefined)
  const [granting, setGranting] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<NetworkFormMode>('create')

  const load = useCallback(() => {
    if (!projectId) return
    setLoading(true)
    getProjectNetworks(projectId)
      .then((res) => setNetworks(res.data || []))
      .catch((err) => message.error((err as Error).message || '获取项目网络失败'))
      .finally(() => setLoading(false))
    getDefaultNetwork(projectId)
      .then((res) => setDefaultNetworkId(res.data?.networkId ?? null))
      .catch(() => setDefaultNetworkId(null))
    if (isSuperAdmin) {
      getNetworkList()
        .then((res) => setAllNetworks(res.data || []))
        .catch(() => {})
    }
  }, [projectId, isSuperAdmin])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  const applyDefault = async (networkId: number | null) => {
    if (!projectId) return
    try {
      await setDefaultNetwork(projectId, networkId)
      message.success(networkId == null ? '已清除项目默认网络' : '已设置项目默认网络')
      setDefaultNetworkId(networkId)
    } catch (err) {
      message.error((err as Error).message || '设置默认网络失败')
    }
  }

  const handleRevoke = async (networkId: number) => {
    if (!projectId) return
    try {
      await revokeNetworkFromProject(networkId, projectId)
      message.success('已撤销该项目网络授权')
      load()
    } catch (err) {
      // 仍有服务引用或作为项目默认值时后端会拒绝，透传原因
      message.error((err as Error).message || '撤销授权失败')
    }
  }

  const handleGrant = async () => {
    if (!projectId) return
    if (grantNetworkId == null) {
      message.warning('请选择要授权的网络')
      return
    }
    try {
      setGranting(true)
      await grantNetworkToProject(grantNetworkId, projectId)
      message.success('已授权该项目使用网络')
      setGrantOpen(false)
      setGrantNetworkId(undefined)
      load()
    } catch (err) {
      message.error((err as Error).message || '授权失败')
    } finally {
      setGranting(false)
    }
  }

  // 网络已创建但后续授权失败时，分别说明两步的完成情况，不把网络创建隐含成成功
  const handleFormSuccess = async (networkId: number) => {
    if (!projectId) return
    try {
      await grantNetworkToProject(networkId, projectId)
      message.success('已自动授权该项目使用新网络')
    } catch (err) {
      message.error(`网络已创建，但授权该项目失败：${(err as Error).message || '未知错误'}`)
    }
    load()
  }

  const grantableNetworks = allNetworks.filter((n) => !networks.some((p) => p.id === n.id))

  const columns: TableProps<ProjectNetwork>['columns'] = [
    {
      title: '网络',
      dataIndex: 'displayName',
      render: (_, record) => (
        <div>
          <div>
            {record.displayName || record.name}
            {record.id === defaultNetworkId && (
              <Tag color="blue" style={{ marginLeft: 8 }}>
                默认
              </Tag>
            )}
          </div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {record.name}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: '来源',
      dataIndex: 'source',
      width: 90,
      render: (val: string) =>
        val === 'MANAGED' ? <Tag color="blue">托管</Tag> : <Tag color="orange">导入</Tag>,
    },
    {
      title: '操作',
      width: 210,
      render: (_, record) => (
        <Space size="small">
          {canManageDefault &&
            (record.id === defaultNetworkId ? (
              <Button size="small" onClick={() => applyDefault(null)}>
                清除默认
              </Button>
            ) : (
              <Button size="small" onClick={() => applyDefault(record.id)}>
                设为默认
              </Button>
            ))}
          {isSuperAdmin && (
            <Popconfirm
              title={`确认撤销该项目对网络 ${record.displayName || record.name} 的授权？`}
              onConfirm={() => handleRevoke(record.id)}
            >
              <Button size="small" danger>
                撤销授权
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <Drawer
      title={project ? `项目网络：${project.name}` : '项目网络'}
      size={640}
      open={open}
      onClose={onClose}
    >
      <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
        项目默认网络只作为新建服务时的预选值，不会改变已存在服务的网络选择。
      </Typography.Paragraph>

      {isSuperAdmin && (
        <Space style={{ marginBottom: 16 }}>
          <Button
            icon={<PlusOutlined />}
            onClick={() => {
              setFormMode('create')
              setFormOpen(true)
            }}
          >
            新建网络
          </Button>
          <Button
            icon={<ImportOutlined />}
            onClick={() => {
              setFormMode('import')
              setFormOpen(true)
            }}
          >
            导入网络
          </Button>
          <Button onClick={() => setGrantOpen(true)}>授权已有网络</Button>
        </Space>
      )}

      <Table
        columns={columns}
        dataSource={networks}
        rowKey="id"
        loading={loading}
        pagination={false}
        locale={{ emptyText: '该项目暂未授权任何网络' }}
      />

      <NetworkFormDrawer
        open={formOpen}
        mode={formMode}
        onClose={() => setFormOpen(false)}
        onSuccess={handleFormSuccess}
      />

      <Modal
        title="授权已有网络给该项目"
        open={grantOpen}
        onOk={handleGrant}
        confirmLoading={granting}
        onCancel={() => setGrantOpen(false)}
      >
        <Select
          style={{ width: '100%', marginTop: 16 }}
          placeholder="选择网络"
          value={grantNetworkId}
          onChange={setGrantNetworkId}
          options={grantableNetworks.map((n) => ({
            value: n.id,
            label: `${n.displayName || n.name}（${n.name}）`,
          }))}
          notFoundContent="没有可授权的网络"
        />
      </Modal>
    </Drawer>
  )
}
