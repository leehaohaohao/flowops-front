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
import { createRole, deleteRole, getProjectRoles, getRolePermissions, updateRole } from '@/api/roles'
import { getProjectList } from '@/api/projects'
import type { Project } from '@/api/projects'
import { UserContext } from '@/App'
import { isSupervisor, PERM_LABEL } from '@/utils/permission'
import type { Role } from '@/types'

const { Title } = Typography

const ALL_PERMISSIONS = Object.entries(PERM_LABEL).map(([value, label]) => ({ value, label }))

export default function RoleList() {
  const userInfo = useContext(UserContext)!
  const navigate = useNavigate()
  const [list, setList] = useState<Role[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Role | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()

  const canManage = userInfo.isSuperAdmin || isSupervisor(userInfo)

  useEffect(() => {
    if (!userInfo.isSuperAdmin && !isSupervisor(userInfo)) {
      navigate('/dashboard', { replace: true })
    }
  }, [userInfo.isSuperAdmin])

  const fetchList = () => {
    setLoading(true)
    const fetcher = userInfo.isSuperAdmin
      ? getProjectList().then((res) => {
          setProjects(res.data)
          return Promise.all(res.data.map((p) => getProjectRoles(p.id).then((r) => r.data)))
        })
      : Promise.all(
          (userInfo.projects || [])
            .filter((p) => p.isSupervisor)
            .map((p) => getProjectRoles(p.id).then((r) => r.data))
        )

    fetcher
      .then((results) => {
        const all = results.flat()
        const seen = new Set<number>()
        setList(all.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true))))
      })
      .catch((err) => message.error((err as Error).message || '获取角色列表失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchList()
  }, [])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openEdit = async (record: Role) => {
    setEditing(record)
    try {
      const res = await getRolePermissions(record.id)
      form.setFieldsValue({
        name: record.name,
        description: record.description,
        permissions: res.data,
        projectId: record.projectId,
      })
    } catch {
      form.setFieldsValue({ name: record.name, description: record.description, permissions: [], projectId: record.projectId })
    }
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      if (editing) {
        await updateRole(editing.id, {
          name: values.name,
          description: values.description,
          permissions: values.permissions,
        })
        message.success('更新成功')
      } else {
        const projectId = userInfo.isSuperAdmin
          ? values.projectId
          : userInfo.projects?.find((p) => p.isSupervisor)?.id
        if (!projectId) {
          message.error('请选择项目')
          return
        }
        await createRole({
          name: values.name,
          projectId,
          description: values.description,
          permissions: values.permissions || [],
        })
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

  const handleDelete = async (id: number) => {
    try {
      await deleteRole(id)
      message.success('删除成功')
      fetchList()
    } catch (err) {
      message.error((err as Error).message || '删除失败')
    }
  }

  const columns: TableProps<Role>['columns'] = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '角色名', dataIndex: 'name' },
    { title: '描述', dataIndex: 'description', ellipsis: true },
    {
      title: '类型',
      dataIndex: 'isPreset',
      width: 100,
      render: (val: boolean) => (
        <Tag color={val ? 'blue' : 'green'}>{val ? '预设' : '自定义'}</Tag>
      ),
    },
    ...(canManage
      ? [
          {
            title: '操作',
            width: 140,
            render: (_: unknown, record: Role) => (
              <Space size="small">
                <Button size="small" onClick={() => openEdit(record)}>
                  编辑
                </Button>
                {!record.isPreset && (
                  <Popconfirm title="确认删除该角色？" onConfirm={() => handleDelete(record.id)}>
                    <Button size="small" danger>
                      删除
                    </Button>
                  </Popconfirm>
                )}
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
        <Title level={4} style={{ margin: 0 }}>
          角色管理
        </Title>
        {canManage && (
          <Button type="primary" onClick={openCreate}>
            创建角色
          </Button>
        )}
      </div>
      <Table columns={columns} dataSource={list} rowKey="id" loading={loading} pagination={false} />

      <Modal
        title={editing ? '编辑角色' : '创建角色'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        width={520}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          {userInfo.isSuperAdmin && !editing && (
            <Form.Item name="projectId" label="所属项目" rules={[{ required: true, message: '请选择项目' }]}>
              <Select
                placeholder="选择项目"
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
              />
            </Form.Item>
          )}
          <Form.Item name="name" label="角色名称" rules={[{ required: true, message: '请输入角色名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="permissions" label="权限">
            <Checkbox.Group>
              <Row gutter={[8, 8]}>
                {ALL_PERMISSIONS.map((p) => (
                  <Col span={8} key={p.value}>
                    <Checkbox value={p.value}>{p.label}</Checkbox>
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
