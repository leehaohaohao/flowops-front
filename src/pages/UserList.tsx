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
  Table,
  Tag,
  Typography,
} from 'antd'
import type { TableProps } from 'antd'
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
  const [roles, setRoles] = useState<Role[]>([])
  const [rolePerms, setRolePerms] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()

  const selectedProjectId = Form.useWatch('projectId', form)

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

  // 查找默认项目
  const defaultProject = projects.find((p) => p.isDefault === 1)

  // 项目变化时重新获取角色列表
  useEffect(() => {
    const pid = selectedProjectId || defaultProject?.id
    if (!pid) {
      setRoles([])
      form.setFieldsValue({ roleId: undefined })
      return
    }
    getProjectRoles(pid)
      .then((res) => setRoles(res.data))
      .catch(() => {})
  }, [selectedProjectId, defaultProject?.id])

  // 角色变化时获取角色已有权限
  const handleRoleChange = async (roleId: number) => {
    if (!roleId) {
      setRolePerms([])
      return
    }
    try {
      const res = await getRolePermissions(roleId)
      setRolePerms(res.data)
      form.setFieldsValue({ extraPermissions: res.data })
    } catch {
      setRolePerms([])
    }
  }

  const openCreate = () => {
    form.resetFields()
    setRolePerms([])
    setModalOpen(true)
  }

  const handleCreate = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      await createUser({
        username: values.username,
        password: values.password,
        projectId: values.projectId || undefined,
        roleId: values.roleId,
        extraPermissions: (values.extraPermissions || []).filter(
          (p: string) => !rolePerms.includes(p),
        ),
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
      title: '角色',
      dataIndex: 'role',
      width: 120,
      render: (_: unknown, record: SysUser) => {
        if (record.isSuperAdmin) return <Tag color="red">超级管理员</Tag>
        return record.roleName || record.role || '-'
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

  // 过滤可选角色：不能分配 supervisor 角色（除非自己是 superAdmin）
  const availableRoles = userInfo.isSuperAdmin
    ? roles
    : roles.filter((r) => r.name !== 'supervisor')

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
        width={520}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="projectId" label="项目" help="不选则归入默认项目">
            <Select
              placeholder="选择项目（可留空）"
              allowClear
              options={availableProjects.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Form.Item>
          <Form.Item name="roleId" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
            <Select
              placeholder="选择角色"
              options={availableRoles.map((r) => ({ value: r.id, label: `${r.name}${r.isPreset ? ' (预设)' : ''}` }))}
              onChange={handleRoleChange}
            />
          </Form.Item>
          <Form.Item name="extraPermissions" label="补充权限" help="角色已包含的权限自动勾选">
            <Checkbox.Group>
              <Row gutter={[8, 8]}>
                {ALL_PERMISSIONS.map((p) => (
                  <Col span={8} key={p.value}>
                    <Checkbox value={p.value} disabled={rolePerms.includes(p.value)}>
                      {p.label}
                    </Checkbox>
                  </Col>
                ))}
              </Row>
            </Checkbox.Group>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
