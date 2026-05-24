import { useContext, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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
  Typography,
} from 'antd'
import type { TableProps } from 'antd'
import { createUser, getAssignable, type AssignableData } from '@/api/users'
import { getProjectMembers, removeMember, updateMemberRole } from '@/api/members'
import { getProject } from '@/api/projects'
import { UserContext } from '@/App'
import { formatTime } from '@/utils/format'
import { isSupervisor, PERM_LABEL } from '@/utils/permission'
import type { GroupMember } from '@/types'

const { Title } = Typography

export default function MemberList() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const userInfo = useContext(UserContext)
  const pid = Number(projectId)

  const [members, setMembers] = useState<GroupMember[]>([])
  const [projectName, setProjectName] = useState('')
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<GroupMember | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [assignable, setAssignable] = useState<AssignableData | null>(null)
  const [rolePerms, setRolePerms] = useState<string[]>([])
  const [form] = Form.useForm()

  if (!userInfo) return null

  const canManage = userInfo.superAdmin || isSupervisor(userInfo, pid) || (userInfo.projectPermissions?.[String(pid)]?.includes('MANAGE_MEMBERS') ?? false)

  useEffect(() => {
    if (!canManage) {
      navigate('/dashboard', { replace: true })
    }
  }, [userInfo.superAdmin, pid])

  const fetchMembers = () => {
    setLoading(true)
    getProjectMembers(pid)
      .then((res) => setMembers(res.data))
      .catch((err) => message.error((err as Error).message || '获取成员列表失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!pid) return
    getProject(pid).then((res) => setProjectName(res.data.name)).catch(() => {})
    fetchMembers()
  }, [pid])

  const openCreate = async () => {
    setEditing(null)
    form.resetFields()
    setRolePerms([])
    try {
      const res = await getAssignable(pid)
      setAssignable(res.data)
    } catch { /* ignore */ }
    setModalOpen(true)
  }

  const openEditRole = async (record: GroupMember) => {
    setEditing(record)
    setRolePerms([])
    try {
      const res = await getAssignable(pid)
      setAssignable(res.data)
      const roleId = res.data.roles.find((r) => r.name === record.roleName)?.id
      form.setFieldsValue({ roleId })
      if (roleId) {
        const role = res.data.roles.find((r) => r.id === roleId)
        if (role) setRolePerms(role.permissions)
      }
    } catch { /* ignore */ }
    setModalOpen(true)
  }

  const handleRoleChange = (roleId: number) => {
    const role = assignable?.roles.find((r) => r.id === roleId)
    const perms = role?.permissions || []
    setRolePerms(perms)
    form.setFieldsValue({ extraPermissions: perms })
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      if (editing) {
        await updateMemberRole(pid, editing.userId, { roleId: values.roleId })
        message.success('角色更新成功')
      } else {
        await createUser({
          username: values.username,
          password: values.password,
          projects: [{
            projectId: pid,
            roleId: values.roleId,
            extraPermissions: (values.extraPermissions || []).filter(
              (p: string) => !rolePerms.includes(p),
            ),
          }],
        })
        message.success('创建成功')
      }
      setModalOpen(false)
      form.resetFields()
      fetchMembers()
    } catch (err) {
      if ((err as Error).message) {
        message.error((err as Error).message || '操作失败')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleRemove = async (userId: number) => {
    try {
      await removeMember(pid, userId)
      message.success('移除成功')
      fetchMembers()
    } catch (err) {
      message.error((err as Error).message || '移除失败')
    }
  }

  const columns: TableProps<GroupMember>['columns'] = [
    { title: '用户ID', dataIndex: 'userId', width: 80 },
    { title: '用户名', dataIndex: 'username' },
    { title: '角色', dataIndex: 'roleName', width: 120 },
    { title: '加入时间', dataIndex: 'joinTime', width: 180, render: (val: string) => formatTime(val) },
    ...(canManage
      ? [
          {
            title: '操作',
            width: 140,
            render: (_: unknown, record: GroupMember) => {
              const isSelf = record.username === userInfo.username
              return (
                <Space size="small">
                  <Button size="small" disabled={isSelf} onClick={() => openEditRole(record)}>
                    修改角色
                  </Button>
                  <Popconfirm title="确认移除该成员？" onConfirm={() => handleRemove(record.userId)} disabled={isSelf}>
                    <Button size="small" danger disabled={isSelf}>
                      移除
                    </Button>
                  </Popconfirm>
                </Space>
              )
            },
          },
        ]
      : []),
  ]

  // 过滤可分配角色：非超管不能分配 supervisor
  const availableRoles = assignable?.roles.filter(
    (r) => userInfo.superAdmin || r.name !== 'supervisor',
  ) || []

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
            {projectName ? `${projectName} — 成员管理` : '成员管理'}
          </Title>
        </Space>
        {canManage && (
          <Button type="primary" onClick={openCreate}>
            创建用户
          </Button>
        )}
      </div>
      <Table columns={columns} dataSource={members} rowKey="userId" loading={loading} pagination={false} />

      <Modal
        title={editing ? '修改角色' : '创建用户'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        width={520}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          {!editing && (
            <>
              <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
                <Input />
              </Form.Item>
              <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
                <Input.Password />
              </Form.Item>
            </>
          )}
          <Form.Item name="roleId" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
            <Select
              placeholder="选择角色"
              options={availableRoles.map((r) => ({ value: r.id, label: `${r.name}${r.description ? ` — ${r.description}` : ''}` }))}
              onChange={handleRoleChange}
            />
          </Form.Item>
          {!editing && (
            <Form.Item name="extraPermissions" label="补充权限" help="角色已包含的权限自动勾选">
              <Checkbox.Group>
                <Row gutter={[8, 8]}>
                  {(assignable?.permissions || []).map((p) => (
                    <Col span={8} key={p}>
                      <Checkbox value={p} disabled={rolePerms.includes(p)}>
                        {PERM_LABEL[p] || p}
                      </Checkbox>
                    </Col>
                  ))}
                </Row>
              </Checkbox.Group>
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  )
}
