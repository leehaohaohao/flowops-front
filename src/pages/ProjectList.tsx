import { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Form,
  Input,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Typography,
} from 'antd'
import type { TableProps } from 'antd'
import { createProject, deleteProject, getProjectList, updateProject } from '@/api/projects'
import { getGroupList } from '@/api/groups'
import type { Group } from '@/api/groups'
import { UserContext } from '@/App'
import { formatTime } from '@/utils/format'
import { isSupervisor } from '@/utils/permission'
import type { Project } from '@/types'

const { Title } = Typography

export default function ProjectList() {
  const navigate = useNavigate()
  const userInfo = useContext(UserContext)!
  const [list, setList] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [groups, setGroups] = useState<Group[]>([])
  const [form] = Form.useForm()

  const canManage = userInfo.isSuperAdmin || isSupervisor(userInfo)

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

  const openCreate = async () => {
    setEditing(null)
    form.resetFields()
    if (userInfo.isSuperAdmin && groups.length === 0) {
      try {
        const res = await getGroupList()
        setGroups(res.data)
      } catch { /* ignore */ }
    }
    setModalOpen(true)
  }

  const openEdit = (record: Project) => {
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
        const groupId = userInfo.isSuperAdmin
          ? values.groupId
          : userInfo.groups.find((g) => g.isSupervisor)?.id
        if (!groupId) {
          message.error('请选择项目组')
          return
        }
        await createProject({ ...values, groupId })
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
      await deleteProject(id)
      message.success('删除成功')
      fetchList()
    } catch (err) {
      message.error((err as Error).message || '删除失败')
    }
  }

  const columns: TableProps<Project>['columns'] = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    {
      title: '项目名称',
      dataIndex: 'name',
      render: (val, record) => (
        <a onClick={() => navigate(`/projects/${record.id}/services`)}>{val}</a>
      ),
    },
    { title: '描述', dataIndex: 'description', ellipsis: true },
    { title: '创建时间', dataIndex: 'createTime', width: 180, render: (val: string) => formatTime(val) },
    ...(canManage
      ? [
          {
            title: '操作',
            width: 140,
            render: (_: unknown, record: Project) => (
              <Space size="small">
                <Button size="small" onClick={() => openEdit(record)}>
                  编辑
                </Button>
                <Popconfirm title="确认删除该项目？需先移除项目下所有服务。" onConfirm={() => handleDelete(record.id)}>
                  <Button size="small" danger>
                    删除
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
        <Title level={4} style={{ margin: 0 }}>
          项目管理
        </Title>
        {canManage && (
          <Button type="primary" onClick={openCreate}>
            创建项目
          </Button>
        )}
      </div>
      <Table columns={columns} dataSource={list} rowKey="id" loading={loading} pagination={false} />

      <Modal
        title={editing ? '编辑项目' : '创建项目'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          {userInfo.isSuperAdmin && !editing && (
            <Form.Item name="groupId" label="所属项目组" rules={[{ required: true, message: '请选择项目组' }]}>
              <Select
                placeholder="选择项目组"
                options={groups.map((g) => ({ value: g.id, label: g.name }))}
              />
            </Form.Item>
          )}
          <Form.Item name="name" label="项目名称" rules={[{ required: true, message: '请输入项目名称' }]}>
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
