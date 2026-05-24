import { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Checkbox,
  Col,
  Form,
  Input,
  message,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { TableProps } from 'antd'
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons'
import { createUser, deleteUser, getUserList } from '@/api/users'
import { getProjectList } from '@/api/projects'
import { getProjectRoles, getRolePermissions } from '@/api/roles'
import { UserContext } from '@/App'
import { formatTime } from '@/utils/format'
import { isSupervisor, PERM_LABEL } from '@/utils/permission'
import type { Project, Role, SysUser } from '@/types'

const { Title } = Typography

const ALL_PERMISSIONS = Object.entries(PERM_LABEL).map(([value, label]) => ({ value, label }))

export default function UserList() {
  const userInfo = useContext(UserContext)!
  const navigate = useNavigate()
  const [list, setList] = useState<SysUser[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [rolesMap, setRolesMap] = useState<Record<number, Role[]>>({})
  const [rolePermsMap, setRolePermsMap] = useState<Record<number, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()

  useEffect(() => {
    if (!userInfo.isSuperAdmin) navigate('/dashboard', { replace: true })
  }, [userInfo.isSuperAdmin])

  const fetchList = () => {
    setLoading(true)
    getUserList()
      .then((res) => setList(res.data))
      .catch((err) => message.error((err as Error).message || '获取用户列表失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchList()
    getProjectList().then((res) => setProjects(res.data)).catch(() => {})
  }, [])

  // 获取某项目的角色列表（带缓存）
  const fetchRoles = async (projectId: number) => {
    if (rolesMap[projectId]) return rolesMap[projectId]
    try {
      const res = await getProjectRoles(projectId)
      setRolesMap((prev) => ({ ...prev, [projectId]: res.data }))
      return res.data
    } catch {
      return []
    }
  }

  // 项目变化时加载角色
  const handleProjectChange = async (projectId: number, index: number) => {
    if (!projectId) {
      form.setFieldsValue({ projects: { [index]: { roleId: undefined, extraPermissions: [] } } })
      return
    }
    const roles = await fetchRoles(projectId)
    // 自动选第一个角色
    if (roles.length > 0) {
      form.setFieldsValue({ projects: { [index]: { roleId: roles[0].id } } })
      handleRoleChange(roles[0].id, index)
    }
  }

  // 角色变化时获取角色已有权限
  const handleRoleChange = async (roleId: number, index: number) => {
    if (!roleId) {
      setRolePermsMap((prev) => ({ ...prev, [index]: [] }))
      return
    }
    try {
      const res = await getRolePermissions(roleId)
      setRolePermsMap((prev) => ({ ...prev, [index]: res.data }))
      form.setFieldsValue({ projects: { [index]: { extraPermissions: res.data } } })
    } catch {
      setRolePermsMap((prev) => ({ ...prev, [index]: [] }))
    }
  }

  const openCreate = () => {
    form.resetFields()
    setRolePermsMap({})
    setModalOpen(true)
  }

  const handleCreate = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      const projectAssignments = (values.projects || [])
        .filter((p: { projectId?: number }) => p?.projectId)
        .map((p: { projectId: number; roleId: number; extraPermissions?: string[] }) => ({
          projectId: p.projectId,
          roleId: p.roleId,
          extraPermissions: (p.extraPermissions || []).filter(
            (perm: string) => !(rolePermsMap[p.projectId] || []).includes(perm),
          ),
        }))
      await createUser({
        username: values.username,
        password: values.password,
        projects: projectAssignments.length > 0 ? projectAssignments : undefined,
      })
      message.success('创建成功')
      setModalOpen(false)
      form.resetFields()
      fetchList()
    } catch (err) {
      if ((err as Error).message) {
        message.error((err as Error).message || '创建失败')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteUser(id)
      message.success('删除成功')
      fetchList()
    } catch (err) {
      message.error((err as Error).message || '删除失败')
    }
  }

  const columns: TableProps<SysUser>['columns'] = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '用户名', dataIndex: 'username' },
    {
      title: '所属项目',
      width: 240,
      render: (_: unknown, record: SysUser) => {
        if (record.isSuperAdmin) return <Tag color="red">超级管理员</Tag>
        if (!record.projects?.length) return '-'
        return (
          <Space size={4} wrap>
            {record.projects.map((p) => (
              <Tag key={p.id}>{p.name}（{p.roleName}）</Tag>
            ))}
          </Space>
        )
      },
    },
    { title: '创建时间', dataIndex: 'createTime', width: 180, render: (val: string) => formatTime(val) },
    ...(userInfo.isSuperAdmin
      ? [
          {
            title: '操作',
            width: 80,
            render: (_: unknown, record: SysUser) => (
              <Popconfirm title="确认删除该用户？" onConfirm={() => handleDelete(record.id)}>
                <Button size="small" danger>
                  删除
                </Button>
              </Popconfirm>
            ),
          },
        ]
      : []),
  ]

  // 过滤可选项目：superAdmin 全部，主管只能选自己管理的项目
  const availableProjects = userInfo.isSuperAdmin
    ? projects
    : projects.filter((p) => isSupervisor(userInfo, p.id))

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
          用户管理
        </Title>
        <Button type="primary" onClick={openCreate}>
          创建用户
        </Button>
      </div>
      <Table columns={columns} dataSource={list} rowKey="id" loading={loading} pagination={false} />

      <Modal
        title="创建用户"
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        width={640}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password />
          </Form.Item>

          <div style={{ marginBottom: 8, fontWeight: 500 }}>项目分配</div>
          <div style={{ color: '#999', fontSize: 12, marginBottom: 12 }}>
            不添加则自动归入默认项目（viewer 角色）
          </div>

          <Form.List name="projects">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }, index) => (
                  <div
                    key={key}
                    style={{
                      border: '1px solid #f0f0f0',
                      borderRadius: 6,
                      padding: 12,
                      marginBottom: 12,
                      position: 'relative',
                    }}
                  >
                    <MinusCircleOutlined
                      style={{ position: 'absolute', top: 8, right: 8, color: '#999', cursor: 'pointer' }}
                      onClick={() => {
                        remove(name)
                        setRolePermsMap((prev) => {
                          const next = { ...prev }
                          delete next[index]
                          return next
                        })
                      }}
                    />
                    <Row gutter={12}>
                      <Col span={12}>
                        <Form.Item
                          {...restField}
                          name={[name, 'projectId']}
                          label="项目"
                          rules={[{ required: true, message: '请选择项目' }]}
                        >
                          <Select
                            placeholder="选择项目"
                            options={availableProjects.map((p) => ({ value: p.id, label: p.name }))}
                            onChange={(val) => handleProjectChange(val, index)}
                          />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item
                          {...restField}
                          name={[name, 'roleId']}
                          label="角色"
                          rules={[{ required: true, message: '请选择角色' }]}
                        >
                          <Select
                            placeholder="先选项目"
                            options={(rolesMap[form.getFieldValue(['projects', index, 'projectId'])] || [])
                              .filter((r) => userInfo.isSuperAdmin || r.name !== 'supervisor')
                              .map((r) => ({ value: r.id, label: `${r.name}${r.isPreset ? ' (预设)' : ''}` }))}
                            onChange={(val) => handleRoleChange(val, index)}
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Form.Item
                      {...restField}
                      name={[name, 'extraPermissions']}
                      label="补充权限"
                      style={{ marginBottom: 0 }}
                    >
                      <Checkbox.Group>
                        <Row gutter={[8, 4]}>
                          {ALL_PERMISSIONS.map((p) => (
                            <Col span={8} key={p.value}>
                              <Checkbox value={p.value} disabled={(rolePermsMap[index] || []).includes(p.value)}>
                                {p.label}
                              </Checkbox>
                            </Col>
                          ))}
                        </Row>
                      </Checkbox.Group>
                    </Form.Item>
                  </div>
                ))}
                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                  添加项目
                </Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  )
}
