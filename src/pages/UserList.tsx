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
  Typography,
} from 'antd'
import type { TableProps } from 'antd'
import { createUser, deleteUser, getUserList } from '@/api/users'
import { getGroupList, type Group } from '@/api/groups'
import { getGroupRoles, getRolePermissions } from '@/api/roles'
import { UserContext } from '@/App'
import { formatTime } from '@/utils/format'
import { isSupervisor, PERM_LABEL } from '@/utils/permission'
import type { Role, SysUser } from '@/types'

const { Title } = Typography

const ALL_PERMISSIONS = Object.entries(PERM_LABEL).map(([value, label]) => ({ value, label }))

export default function UserList() {
  const userInfo = useContext(UserContext)!
  const navigate = useNavigate()
  const [list, setList] = useState<SysUser[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [rolePerms, setRolePerms] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()

  const selectedGroupId = Form.useWatch('groupId', form)

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
    getGroupList().then((res) => setGroups(res.data)).catch(() => {})
  }, [])

  // 项目组变化时重新获取角色列表
  useEffect(() => {
    if (!selectedGroupId) {
      setRoles([])
      form.setFieldsValue({ roleId: undefined })
      return
    }
    getGroupRoles(selectedGroupId)
      .then((res) => setRoles(res.data))
      .catch(() => {})
  }, [selectedGroupId])

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
    setRoles([])
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
        groupId: values.groupId || undefined,
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
      dataIndex: 'roleName',
      width: 120,
      render: (val: string) => val || '-',
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

  // 过滤可选项目组：superAdmin 全部，主管只能选自己管理的组
  const availableGroups = userInfo.isSuperAdmin
    ? groups
    : groups.filter((g) => isSupervisor(userInfo, g.id))

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
          <Form.Item name="groupId" label="项目组" help="不选则归入默认项目组">
            <Select
              placeholder="选择项目组（可留空）"
              allowClear
              options={availableGroups.map((g) => ({ value: g.id, label: g.name }))}
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
