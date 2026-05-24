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
import { createGroup, deleteGroup, getGroupList, updateGroup } from '@/api/groups'
import type { Group } from '@/api/groups'
import { UserContext } from '@/App'
import { formatTime } from '@/utils/format'

const { Title } = Typography

export default function GroupList() {
  const navigate = useNavigate()
  const userInfo = useContext(UserContext)!
  const [list, setList] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Group | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()

  useEffect(() => {
    if (!userInfo.isSuperAdmin) navigate('/dashboard', { replace: true })
  }, [userInfo.isSuperAdmin])

  const fetchList = () => {
    setLoading(true)
    getGroupList()
      .then((res) => setList(res.data))
      .catch((err) => message.error((err as Error).message || '获取项目组列表失败'))
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

  const openEdit = (record: Group) => {
    setEditing(record)
    form.setFieldsValue({ name: record.name, description: record.description })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      if (editing) {
        await updateGroup(editing.id, values)
        message.success('更新成功')
      } else {
        await createGroup(values)
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
      await deleteGroup(id)
      message.success('删除成功')
      fetchList()
    } catch (err) {
      message.error((err as Error).message || '删除失败')
    }
  }

  const columns: TableProps<Group>['columns'] = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    {
      title: '项目组名称',
      dataIndex: 'name',
      render: (val, record) => (
        <a onClick={() => navigate(`/groups/${record.id}/members`)}>{val}</a>
      ),
    },
    { title: '描述', dataIndex: 'description', ellipsis: true },
    { title: '成员数', dataIndex: 'memberCount', width: 80, render: (val?: number) => val ?? '-' },
    { title: '项目数', dataIndex: 'projectCount', width: 80, render: (val?: number) => val ?? '-' },
    { title: '创建时间', dataIndex: 'createTime', width: 180, render: (val: string) => formatTime(val) },
    ...(userInfo.isSuperAdmin
      ? [
          {
            title: '操作',
            width: 140,
            render: (_: unknown, record: Group) => {
              const isDefault = record.isDefault === 1
              return (
                <Space size="small">
                  <Button size="small" onClick={() => openEdit(record)}>
                    编辑
                  </Button>
                  {isDefault ? (
                    <Tooltip title="默认项目组不可删除">
                      <Button size="small" danger disabled>
                        删除
                      </Button>
                    </Tooltip>
                  ) : (
                    <Popconfirm title="确认删除该项目组？需先移除组内所有项目。" onConfirm={() => handleDelete(record.id)}>
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
          项目组管理
        </Title>
        {userInfo.isSuperAdmin && (
          <Button type="primary" onClick={openCreate}>
            创建项目组
          </Button>
        )}
      </div>
      <Table columns={columns} dataSource={list} rowKey="id" loading={loading} pagination={false} />

      <Modal
        title={editing ? '编辑项目组' : '创建项目组'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="项目组名称" rules={[{ required: true, message: '请输入项目组名称' }]}>
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
