import { useContext, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Checkbox,
  Col,
  Form,
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
import { CloseCircleOutlined } from '@ant-design/icons'
import { getUserList } from '@/api/users'
import { getProjectList } from '@/api/projects'
import { getUserAccess, grantAccess, revokeAccess } from '@/api/access'
import { UserContext } from '@/App'
import { formatTime } from '@/utils/format'
import { PERM_LABEL } from '@/utils/permission'
import type { AggregatedAccess, CrossAccess, Project, SysUser } from '@/types'

const { Title } = Typography

const ALL_PERMISSIONS = Object.entries(PERM_LABEL).map(([value, label]) => ({ value, label }))

export default function CrossAccessPage() {
  const userInfo = useContext(UserContext)!
  const navigate = useNavigate()
  const [rawList, setRawList] = useState<CrossAccess[]>([])

  useEffect(() => {
    if (!userInfo.superAdmin) navigate('/dashboard', { replace: true })
  }, [userInfo.superAdmin])
  const [users, setUsers] = useState<SysUser[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()

  // 按 (userId, projectId) 聚合
  const aggregated: AggregatedAccess[] = useMemo(() => {
    const map = new Map<string, AggregatedAccess>()
    for (const item of rawList) {
      const key = `${item.userId}-${item.projectId}`
      if (!map.has(key)) {
        map.set(key, { userId: item.userId, projectId: item.projectId, items: [] })
      }
      map.get(key)!.items.push({ id: item.id, permCode: item.permCode, createTime: item.createTime })
    }
    return Array.from(map.values())
  }, [rawList])

  const fetchAccess = (userId: number) => {
    setLoading(true)
    getUserAccess(userId)
      .then((res) => setRawList(res.data))
      .catch((err) => message.error((err as Error).message || '获取授权列表失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    getUserList().then((res) => setUsers(res.data)).catch(() => {})
    getProjectList().then((res) => setProjects(res.data)).catch(() => {})
  }, [])

  const handleUserChange = (userId: number) => {
    setSelectedUserId(userId)
    fetchAccess(userId)
  }

  const handleGrant = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      await grantAccess({
        userId: values.userId,
        projectId: values.projectId,
        permCodes: values.permCodes || [],
      })
      message.success('授权成功')
      setModalOpen(false)
      form.resetFields()
      if (selectedUserId) fetchAccess(selectedUserId)
    } catch (err) {
      if ((err as Error).message) {
        message.error((err as Error).message || '授权失败')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleRevokeOne = async (id: number) => {
    try {
      await revokeAccess(id)
      message.success('已撤销')
      if (selectedUserId) fetchAccess(selectedUserId)
    } catch (err) {
      message.error((err as Error).message || '撤销失败')
    }
  }

  const handleRevokeAll = async (items: AggregatedAccess['items']) => {
    try {
      await Promise.all(items.map((item) => revokeAccess(item.id)))
      message.success('已全部撤销')
      if (selectedUserId) fetchAccess(selectedUserId)
    } catch (err) {
      message.error((err as Error).message || '撤销失败')
    }
  }

  const getProjectName = (projectId: number) => projects.find((p) => p.id === projectId)?.name || String(projectId)

  const columns: TableProps<AggregatedAccess>['columns'] = [
    { title: '用户ID', dataIndex: 'userId', width: 80 },
    {
      title: '项目',
      dataIndex: 'projectId',
      render: (val: number) => getProjectName(val),
    },
    {
      title: '权限',
      dataIndex: 'items',
      render: (_: unknown, record: AggregatedAccess) => (
        <Space size={4} wrap>
          {record.items.map((item) => (
            <Tag
              key={item.id}
              color="blue"
              closable
              onClose={(e) => {
                e.preventDefault()
                handleRevokeOne(item.id)
              }}
              closeIcon={<CloseCircleOutlined />}
            >
              {PERM_LABEL[item.permCode] || item.permCode}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '授权时间',
      dataIndex: 'items',
      width: 180,
      render: (_: unknown, record: AggregatedAccess) => {
        const times = record.items.map((i) => i.createTime).sort()
        return formatTime(times[0])
      },
    },
    {
      title: '操作',
      width: 100,
      render: (_: unknown, record: AggregatedAccess) => (
        <Popconfirm
          title={`确认撤销 ${getProjectName(record.projectId)} 的全部权限？`}
          onConfirm={() => handleRevokeAll(record.items)}
        >
          <Button size="small" danger>
            全部撤销
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
          跨项目授权
        </Title>
        <Button type="primary" onClick={() => { form.resetFields(); setModalOpen(true) }}>
          授权
        </Button>
      </div>

      <Space style={{ marginBottom: 16 }}>
        <span>选择用户：</span>
        <Select
          style={{ width: 200 }}
          placeholder="选择用户查看授权"
          showSearch
          optionFilterProp="label"
          onChange={handleUserChange}
          options={users.map((u) => ({ value: u.id, label: u.username }))}
        />
      </Space>

      {selectedUserId ? (
        <Table columns={columns} dataSource={aggregated} rowKey={(r) => `${r.userId}-${r.projectId}`} loading={loading} pagination={false} />
      ) : (
        <div style={{ color: '#999', textAlign: 'center', padding: 40 }}>请先选择用户</div>
      )}

      <Modal
        title="跨项目授权"
        open={modalOpen}
        onOk={handleGrant}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        width={480}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="userId" label="用户" rules={[{ required: true, message: '请选择用户' }]}>
            <Select
              placeholder="选择用户"
              showSearch
              optionFilterProp="label"
              options={users.map((u) => ({ value: u.id, label: u.username }))}
            />
          </Form.Item>
          <Form.Item name="projectId" label="项目" rules={[{ required: true, message: '请选择项目' }]}>
            <Select
              placeholder="选择项目"
              showSearch
              optionFilterProp="label"
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Form.Item>
          <Form.Item name="permCodes" label="权限">
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
