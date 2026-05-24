import { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Form,
  Input,
  message,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tooltip,
  Typography,
} from 'antd'
import type { TableProps } from 'antd'
import { createProject, deleteProject, getProjectList, updateProject } from '@/api/projects'
import { UserContext } from '@/App'
import { formatTime } from '@/utils/format'
import { isSupervisor } from '@/utils/permission'
import type { Project } from '@/types'

const { Title } = Typography

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

  const canManage = userInfo.superAdmin || isSupervisor(userInfo)

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

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
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
    {
      title: '成员数',
      dataIndex: 'memberCount',
      width: 80,
      render: (val?: number) => val ?? '-',
    },
    {
      title: '服务数',
      dataIndex: 'serviceCount',
      width: 80,
      render: (val?: number) => val ?? '-',
    },
    {
      title: '默认',
      dataIndex: 'isDefault',
      width: 70,
      render: (val?: number) => (val === 1 ? '是' : ''),
    },
    { title: '创建时间', dataIndex: 'createTime', width: 180, render: (val: string) => formatTime(val) },
    ...(canManage
      ? [
          {
            title: '操作',
            width: 200,
            render: (_: unknown, record: Project) => {
              const isDefault = record.isDefault === 1
              return (
                <Space size="small">
                  <Button size="small" onClick={() => navigate(`/projects/${record.id}/members`)}>
                    成员管理
                  </Button>
                  <Button size="small" onClick={() => openEdit(record)}>
                    编辑
                  </Button>
                  {isDefault ? (
                    <Tooltip title="默认项目不可删除">
                      <Button size="small" danger disabled>
                        删除
                      </Button>
                    </Tooltip>
                  ) : (
                    <Popconfirm title="确认删除该项目？需先移除项目下所有服务。" onConfirm={() => handleDelete(record.id)}>
                      <Button size="small" danger>
                        删除
                      </Button>
                    </Popconfirm>
                  )}
                </Space>
              )
            },
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
