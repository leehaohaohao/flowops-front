import { useContext, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Button,
  Form,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Typography,
} from 'antd'
import type { TableProps } from 'antd'
import { addMember, getProjectMembers, removeMember, updateMemberRole } from '@/api/members'
import { getProjectRoles } from '@/api/roles'
import { getProject } from '@/api/projects'
import { getUserList } from '@/api/users'
import { UserContext } from '@/App'
import { formatTime } from '@/utils/format'
import { isSupervisor } from '@/utils/permission'
import type { GroupMember, Role, SysUser } from '@/types'

const { Title } = Typography

export default function MemberList() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const userInfo = useContext(UserContext)!
  const pid = Number(projectId)

  const [members, setMembers] = useState<GroupMember[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [users, setUsers] = useState<SysUser[]>([])
  const [projectName, setProjectName] = useState('')
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<GroupMember | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()

  const canManage = userInfo.isSuperAdmin || isSupervisor(userInfo, pid)

  useEffect(() => {
    if (!userInfo.isSuperAdmin && !isSupervisor(userInfo, pid)) {
      navigate('/dashboard', { replace: true })
    }
  }, [userInfo.isSuperAdmin, pid])

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
    getProjectRoles(pid).then((res) => setRoles(res.data)).catch(() => {})
    fetchMembers()
  }, [pid])

  const openAdd = async () => {
    setEditing(null)
    form.resetFields()
    try {
      const res = await getUserList()
      setUsers(res.data)
    } catch { /* ignore */ }
    setModalOpen(true)
  }

  const openEditRole = (record: GroupMember) => {
    setEditing(record)
    form.setFieldsValue({ roleId: record.roleId })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      if (editing) {
        await updateMemberRole(pid, editing.userId, { roleId: values.roleId })
        message.success('角色更新成功')
      } else {
        await addMember(pid, { userId: values.userId, roleId: values.roleId })
        message.success('成员添加成功')
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
    { title: '加入时间', dataIndex: 'createTime', width: 180, render: (val: string) => formatTime(val) },
    ...(canManage
      ? [
          {
            title: '操作',
            width: 140,
            render: (_: unknown, record: GroupMember) => (
              <Space size="small">
                <Button size="small" onClick={() => openEditRole(record)}>
                  修改角色
                </Button>
                <Popconfirm title="确认移除该成员？" onConfirm={() => handleRemove(record.userId)}>
                  <Button size="small" danger>
                    移除
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]
      : []),
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
            {projectName ? `${projectName} — 成员管理` : '成员管理'}
          </Title>
        </Space>
        {canManage && (
          <Button type="primary" onClick={openAdd}>
            添加成员
          </Button>
        )}
      </div>
      <Table columns={columns} dataSource={members} rowKey="userId" loading={loading} pagination={false} />

      <Modal
        title={editing ? '修改角色' : '添加成员'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          {!editing && (
            <Form.Item name="userId" label="用户" rules={[{ required: true, message: '请选择用户' }]}>
              <Select
                placeholder="选择用户"
                showSearch
                optionFilterProp="label"
                options={users.map((u) => ({ value: u.id, label: u.username }))}
              />
            </Form.Item>
          )}
          <Form.Item name="roleId" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
            <Select
              placeholder="选择角色"
              options={roles.map((r) => ({ value: r.id, label: `${r.name}${r.isPreset ? ' (预设)' : ''}` }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
