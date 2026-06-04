import { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  message,
  Modal,
  Popconfirm,
  Row,
  Statistic,
  Tooltip,
  Typography,
} from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  TeamOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons'
import { createProject, deleteProject, getProjectList, updateProject } from '@/api/projects'
import { UserContext } from '@/App'
import { isSupervisor } from '@/utils/permission'
import type { Project } from '@/types'

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
                          valueStyle={{ fontSize: 20 }}
                        />
                      </Col>
                      <Col span={8}>
                        <Statistic
                          title="运行中"
                          value={project.runningCount ?? 0}
                          valueStyle={{
                            fontSize: 20,
                            color: (project.runningCount ?? 0) > 0 ? '#52c41a' : undefined,
                          }}
                        />
                      </Col>
                      <Col span={8}>
                        <Statistic
                          title="成员数"
                          value={project.memberCount ?? 0}
                          valueStyle={{ fontSize: 20 }}
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
