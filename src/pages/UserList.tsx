import { useEffect, useState } from 'react'
import {
  Button,
  Form,
  Input,
  message,
  Modal,
  Popconfirm,
  Select,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { TableProps } from 'antd'
import { createUser, deleteUser, getUserList } from '@/api/users'
import { formatTime } from '@/utils/format'
import type { SysUser } from '@/types'

const { Title } = Typography

export default function UserList() {
  const [list, setList] = useState<SysUser[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form] = Form.useForm()

  const fetchList = () => {
    setLoading(true)
    getUserList()
      .then((res) => setList(res.data))
      .catch((err) => message.error((err as Error).message || '获取用户列表失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchList()
  }, [])

  const handleCreate = async () => {
    try {
      const values = await form.validateFields()
      setCreating(true)
      await createUser(values)
      message.success('创建成功')
      setModalOpen(false)
      form.resetFields()
      fetchList()
    } catch (err) {
      if ((err as Error).message) {
        message.error((err as Error).message || '创建失败')
      }
    } finally {
      setCreating(false)
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
      width: 100,
      render: (val: string) => (
        <Tag color={val === 'admin' ? 'red' : 'default'}>
          {val === 'admin' ? '管理员' : '普通用户'}
        </Tag>
      ),
    },
    { title: '创建时间', dataIndex: 'createTime', width: 180, render: (val: string) => formatTime(val) },
    {
      title: '操作',
      width: 80,
      render: (_, record) => (
        <Popconfirm title="确认删除该用户？" onConfirm={() => handleDelete(record.id)}>
          <Button size="small" danger>
            删除
          </Button>
        </Popconfirm>
      ),
    },
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
          用户管理
        </Title>
        <Button type="primary" onClick={() => { form.resetFields(); setModalOpen(true) }}>
          创建用户
        </Button>
      </div>
      <Table columns={columns} dataSource={list} rowKey="id" loading={loading} pagination={false} />

      <Modal
        title="创建用户"
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => setModalOpen(false)}
        confirmLoading={creating}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="role" label="角色" initialValue="user">
            <Select
              options={[
                { value: 'user', label: '普通用户' },
                { value: 'admin', label: '管理员' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
