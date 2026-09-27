import { useCallback, useContext, useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Progress,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import type { TableProps } from 'antd'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  createRegistry,
  deleteRegistry,
  getNodeList,
  getNodeSsh,
  getRegistry,
  saveNodeSsh,
  testNodeSsh,
  updateRegistry,
} from '@/api/nodes'
import { UserContext } from '@/App'
import { formatTime } from '@/utils/format'
import type {
  NodeInfo,
  RegisteredNode,
  SshHostKeyAlgorithm,
  SshTarget,
  SshTestResult,
} from '@/types'

const { Title } = Typography

/** SSH 连接测试结果码 → 中文原因（契约见 2026-09-27-node-ssh-connection-plan.md） */
const SSH_RESULT_LABELS: Record<string, string> = {
  CONNECTED: '连接成功（握手、主机密钥、认证、只读命令与 SFTP 均通过）',
  CONNECT_TIMEOUT: '连接超时',
  CONNECT_FAILED: '无法连接（端口拒绝、地址不可达或域名解析失败）',
  HOST_KEY_MISMATCH: '主机密钥不匹配，已中止（疑似中间人）',
  HOST_KEY_ALGORITHM_UNAVAILABLE: '目标机未提供所选主机密钥算法',
  HOST_KEY_ALGORITHM_REQUIRED: '尚未选择主机密钥算法，旧记录需补齐后才能测试',
  AUTH_TIMEOUT: '认证超时',
  AUTH_FAILED: '公钥认证失败',
  COMMAND_TIMEOUT: '只读命令执行超时',
  COMMAND_FAILED: '只读命令失败（退出码非 0）',
  SFTP_TIMEOUT: 'SFTP 通道打开超时',
  SFTP_FAILED: 'SFTP 通道不可用',
  KEY_NOT_FOUND: '私钥文件不存在',
  KEY_PERMISSION_TOO_OPEN: '私钥文件权限过宽（要求 0600 或更严）',
  KEY_ALIAS_INVALID: '私钥别名非法',
  KEY_UNREADABLE: '私钥不可读（格式不支持或带口令）',
  TEST_OBSOLETE: '测试结果已过期（配置已变更或有更新的测试），未保存',
  NODE_NOT_REGISTERED: '节点未登记',
  INTERNAL_ERROR: '未预期错误',
}

function sshResultLabel(resultCode?: string): string {
  if (!resultCode) return '未知结果'
  return SSH_RESULT_LABELS[resultCode] || `未知结果码：${resultCode}`
}

/** 主机密钥算法选项及其对应的目标机主机公钥文件名（H1.4：指纹必须取自同一算法） */
const HOST_KEY_ALGORITHMS: Array<{ value: SshHostKeyAlgorithm; label: string; file: string }> = [
  { value: 'ED25519', label: 'ED25519', file: 'ssh_host_ed25519_key.pub' },
  { value: 'ECDSA', label: 'ECDSA', file: 'ssh_host_ecdsa_key.pub' },
  { value: 'RSA', label: 'RSA', file: 'ssh_host_rsa_key.pub' },
]

function hostKeyFileName(algorithm?: string | null): string | null {
  const matched = HOST_KEY_ALGORITHMS.find(
    (item) => item.value === (algorithm || '').toUpperCase(),
  )
  return matched ? matched.file : null
}

export default function NodeList() {
  const userInfo = useContext(UserContext)
  const isAdmin = !!userInfo?.superAdmin

  // ===== 在线节点（会话实时状态） =====
  const [list, setList] = useState<NodeInfo[]>([])
  const [loading, setLoading] = useState(false)

  const fetchList = () => {
    setLoading(true)
    getNodeList()
      .then((res) => setList(res.data))
      .catch((err) => message.error((err as Error).message || '获取节点列表失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchList()
    const timer = setInterval(fetchList, 30000)
    return () => clearInterval(timer)
  }, [])

  // ===== 节点登记管理（仅超级管理员） =====
  const [regList, setRegList] = useState<RegisteredNode[]>([])
  const [regLoading, setRegLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<RegisteredNode | null>(null)
  const [saving, setSaving] = useState(false)
  const [sshRunnerId, setSshRunnerId] = useState('')
  const [form] = Form.useForm()

  const fetchRegistry = () => {
    setRegLoading(true)
    getRegistry()
      .then((res) => setRegList(res.data))
      .catch((err) => message.error((err as Error).message || '获取节点登记失败'))
      .finally(() => setRegLoading(false))
  }

  useEffect(() => {
    if (isAdmin) fetchRegistry()
  }, [isAdmin])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openEdit = (node: RegisteredNode) => {
    setEditing(node)
    form.setFieldsValue({ displayName: node.nodeName || '', token: '' })
    setModalOpen(true)
  }

  const openSsh = (node: RegisteredNode) => {
    setSshRunnerId(node.runnerId)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      if (editing) {
        await updateRegistry(editing.runnerId, {
          nodeName: values.displayName || undefined,
          token: values.token || undefined,
        })
        message.success('节点登记已更新')
      } else {
        await createRegistry({
          runnerId: values.runnerId.trim(),
          nodeName: values.displayName || undefined,
          token: values.token,
        })
        message.success('节点已登记')
      }
      setModalOpen(false)
      fetchRegistry()
    } catch (err) {
      if ((err as { errorFields?: unknown }).errorFields) return
      message.error((err as Error).message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (runnerId: string) => {
    try {
      await deleteRegistry(runnerId)
      message.success('节点登记已删除')
      fetchRegistry()
    } catch (err) {
      message.error((err as Error).message || '删除失败')
    }
  }

  const refreshAll = () => {
    fetchList()
    if (isAdmin) fetchRegistry()
  }

  const columns: TableProps<NodeInfo>['columns'] = [
    { title: '节点 ID', dataIndex: 'runnerId', width: 200 },
    { title: '主机名', dataIndex: 'hostname', width: 140 },
    { title: 'IP', dataIndex: 'ip', width: 140 },
    { title: '版本', dataIndex: 'version', width: 100 },
    {
      title: '状态',
      dataIndex: 'online',
      width: 90,
      render: (val: boolean) => (val ? <Tag color="green">在线</Tag> : <Tag>离线</Tag>),
    },
    {
      title: 'CPU',
      dataIndex: 'cpuUsage',
      width: 140,
      render: (val: number) => <Progress percent={Math.round(val)} size="small" />,
    },
    {
      title: '内存',
      dataIndex: 'memoryUsage',
      width: 140,
      render: (val: number) => <Progress percent={Math.round(val)} size="small" />,
    },
    { title: '运行中任务', dataIndex: 'runningTasks', width: 100 },
    {
      title: '最后心跳',
      dataIndex: 'lastHeartbeatTime',
      render: (val: number) => (val ? new Date(val).toLocaleString() : '-'),
    },
  ]

  const regColumns: TableProps<RegisteredNode>['columns'] = [
    { title: '节点 ID', dataIndex: 'runnerId', width: 180 },
    { title: '显示名', dataIndex: 'nodeName', render: (v: string) => v || '-' },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (v: string) => (v === 'online' ? <Tag color="green">在线</Tag> : <Tag>离线</Tag>),
    },
    { title: '最后心跳', dataIndex: 'lastHeartbeat', render: (v: string) => formatTime(v) },
    { title: '创建时间', dataIndex: 'createTime', render: (v: string) => formatTime(v) },
    {
      title: '注册令牌',
      dataIndex: 'hasToken',
      width: 100,
      render: (v: boolean) => (v ? <Tag color="blue">已配置</Tag> : <Tag color="red">未配置</Tag>),
    },
    {
      title: '操作',
      width: 220,
      render: (_, record) => (
        <Space size="small">
          <Button size="small" onClick={() => openSsh(record)}>
            SSH 设置
          </Button>
          <Button size="small" onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Popconfirm title={`确认删除登记 ${record.runnerId}？`} onConfirm={() => handleDelete(record.runnerId)}>
            <Button size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
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
          节点管理
        </Title>
        <Button icon={<ReloadOutlined />} onClick={refreshAll} loading={loading || regLoading}>
          刷新
        </Button>
      </div>
      <Tabs
        items={[
          {
            key: 'online',
            label: '在线节点',
            children: <Table columns={columns} dataSource={list} rowKey="runnerId" loading={loading} pagination={false} />,
          },
          ...(isAdmin
            ? [
                {
                  key: 'registry',
                  label: '节点登记',
                  children: (
                    <div>
                      <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} style={{ marginBottom: 16 }}>
                        新增登记
                      </Button>
                      <Table columns={regColumns} dataSource={regList} rowKey="runnerId" loading={regLoading} pagination={false} />
                    </div>
                  ),
                },
              ]
            : []),
        ]}
      />
      <Modal
        title={editing ? `编辑登记 - ${editing.runnerId}` : '新增节点登记'}
        open={modalOpen}
        onOk={handleSubmit}
        confirmLoading={saving}
        onCancel={() => setModalOpen(false)}
      >
        <Form form={form} layout="vertical" initialValues={{ displayName: '', token: '' }}>
          {!editing && (
            <Form.Item name="runnerId" label="节点 ID" rules={[{ required: true, message: '请输入节点 ID' }]}>
              <Input placeholder="runner-1" />
            </Form.Item>
          )}
          <Form.Item name="displayName" label="显示名" extra="可选">
            <Input placeholder="如：生产节点1" />
          </Form.Item>
          <Form.Item
            name="token"
            label={editing ? '注册令牌（留空则不修改）' : '注册令牌'}
            rules={editing ? [] : [{ required: true, message: '请输入注册令牌' }]}
            extra={editing ? '修改后需同步更新对应子节点配置，否则注册会被拒绝' : '将分发给对应子节点配置，服务端自动 sha256 存储'}
          >
            <Input.Password placeholder={editing ? '输入新令牌以重新设置' : '输入注册令牌原文'} />
          </Form.Item>
        </Form>
      </Modal>

      <SshSettingsDrawer
        open={!!sshRunnerId}
        runnerId={sshRunnerId}
        onClose={() => setSshRunnerId('')}
      />
    </div>
  )
}

/**
 * 宿主机 SSH 设置与连接测试抽屉（S3）。
 * 入口只出现在仅超级管理员可见的「节点登记」页签内；后端仍会独立鉴权。
 * 测试使用**已保存**的设置，修改后需先保存再测试。
 */
function SshSettingsDrawer({
  open,
  runnerId,
  onClose,
}: {
  open: boolean
  runnerId: string
  onClose: () => void
}) {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [target, setTarget] = useState<SshTarget | null>(null)
  const [lastTest, setLastTest] = useState<SshTestResult | null>(null)
  // 指纹提示需要随所选算法变化：指纹必须取自同一算法的主机公钥
  const selectedAlgorithm = Form.useWatch('hostKeyAlgorithm', form) as string | undefined
  const selectedKeyFile = hostKeyFileName(selectedAlgorithm)
  // H1 之前的旧记录没有算法，后端会拒绝测试（HOST_KEY_ALGORITHM_REQUIRED）
  const algorithmMissing = !!target && !target.hostKeyAlgorithm

  const load = useCallback(() => {
    if (!runnerId) return
    setLoading(true)
    getNodeSsh(runnerId)
      .then((res) => {
        const data = res.data ?? null
        setTarget(data)
        setLastTest(data?.lastTest ?? null)
        if (data) {
          form.setFieldsValue({
            host: data.host,
            port: data.port,
            username: data.username,
            keyAlias: data.keyAlias,
            hostKeySha256: data.hostKeySha256,
            hostKeyAlgorithm: data.hostKeyAlgorithm ?? undefined,
          })
        }
      })
      .catch((err) => message.error((err as Error).message || '获取 SSH 设置失败'))
      .finally(() => setLoading(false))
  }, [runnerId, form])

  useEffect(() => {
    if (!open) return
    form.resetFields()
    setTarget(null)
    setLastTest(null)
    load()
  }, [open, load, form])

  const handleSave = async () => {
    if (!runnerId) return
    try {
      const values = await form.validateFields()
      setSaving(true)
      const res = await saveNodeSsh(runnerId, {
        host: values.host.trim(),
        port: values.port,
        username: values.username.trim(),
        keyAlias: values.keyAlias.trim(),
        hostKeySha256: values.hostKeySha256.trim(),
        hostKeyAlgorithm: values.hostKeyAlgorithm,
      })
      message.success(res.msg || 'SSH 设置已保存')
      const data = res.data ?? null
      setTarget(data)
      // 覆盖设置后后端会清空旧结果，页面同步清空避免展示误导
      setLastTest(data?.lastTest ?? null)
    } catch (err) {
      if ((err as { errorFields?: unknown }).errorFields) return
      message.error((err as Error).message || '保存 SSH 设置失败')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!runnerId) return
    try {
      setTesting(true)
      const res = await testNodeSsh(runnerId)
      const result = res.data ?? null
      setLastTest(result)
      const label = sshResultLabel(result?.resultCode)
      if (result?.resultCode === 'CONNECTED') {
        message.success(label)
      } else {
        message.warning(label)
      }
    } catch (err) {
      // 尚未配置 SSH 等业务错误在接口层返回
      message.error((err as Error).message || '测试连接失败')
    } finally {
      setTesting(false)
    }
  }

  return (
    <Drawer
      title={runnerId ? `SSH 设置：${runnerId}` : 'SSH 设置'}
      size={560}
      open={open}
      onClose={onClose}
      footer={
        <Space style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>关闭</Button>
          <Button onClick={handleTest} loading={testing} disabled={!target || algorithmMissing}>
            测试连接
          </Button>
          <Button type="primary" onClick={handleSave} loading={saving}>
            保存设置
          </Button>
        </Space>
      }
    >
      <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
        私钥由管理员预先放到主节点容器的密钥目录（权限 0600），此处只填写别名。
        测试依次校验握手、主机密钥、公钥认证、只读命令与 SFTP，全程不向远端写文件；
        测试使用**已保存**的设置，修改后请先保存再测试。
      </Typography.Paragraph>

      {algorithmMissing && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          title="该记录尚未选择主机密钥算法"
          description="算法与指纹必须指向同一把目标机主机公钥。请选择算法并核对指纹后保存，保存前后端会拒绝测试。"
        />
      )}

      {target && !target.keyFileExists && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          title="主节点内未找到该别名对应的私钥文件"
          description="请管理员将私钥放入主节点密钥目录并设置 0600 权限，否则测试会返回「私钥文件不存在」。"
        />
      )}

      {lastTest && (
        <Alert
          type={lastTest.resultCode === 'CONNECTED' ? 'success' : 'warning'}
          showIcon
          style={{ marginBottom: 16 }}
          title={`上次测试结果：${sshResultLabel(lastTest.resultCode)}`}
          description={`测试时间 ${formatTime(lastTest.testedAt)}${
            lastTest.durationMs != null ? `，耗时 ${lastTest.durationMs} ms` : ''
          }`}
        />
      )}

      <Spin spinning={loading}>
        <Form form={form} layout="vertical" initialValues={{ port: 22 }}>
          <Form.Item
            name="host"
            label="宿主机地址"
            extra="不含端口与 scheme，支持域名、IPv4 或 IPv6"
            rules={[
              { required: true, message: '请输入宿主机地址' },
              { max: 253, message: '长度不能超过 253 字符' },
              {
                pattern: /^[A-Za-z0-9._:-]+$/,
                message: '只能包含字母、数字、点、下划线、连字符和冒号',
              },
            ]}
          >
            <Input placeholder="10.0.0.5" />
          </Form.Item>
          <Form.Item
            name="port"
            label="SSH 端口"
            rules={[
              { required: true, message: '请输入 SSH 端口' },
              { type: 'number', min: 1, max: 65535, message: '端口范围为 1-65535' },
            ]}
          >
            <InputNumber style={{ width: '100%' }} placeholder="22" />
          </Form.Item>
          <Form.Item
            name="username"
            label="SSH 用户名"
            rules={[
              { required: true, message: '请输入 SSH 用户名' },
              { max: 64, message: '长度不能超过 64 字符' },
              {
                pattern: /^[A-Za-z0-9._-]+$/,
                message: '只能包含字母、数字、点、下划线和连字符',
              },
            ]}
          >
            <Input placeholder="root" />
          </Form.Item>
          <Form.Item
            name="keyAlias"
            label="私钥别名"
            extra="对应主节点容器内密钥目录下的文件名，不含路径分隔符"
            rules={[
              { required: true, message: '请输入私钥别名' },
              { max: 128, message: '长度不能超过 128 字符' },
              {
                validator: (_, value: string) => {
                  const alias = (value || '').trim()
                  if (!alias) return Promise.resolve()
                  if (!/^[A-Za-z0-9._-]+$/.test(alias)) {
                    return Promise.reject(new Error('只能包含字母、数字、点、下划线和连字符'))
                  }
                  if (alias === '.' || alias === '..') {
                    return Promise.reject(new Error('别名不能为 . 或 ..'))
                  }
                  return Promise.resolve()
                },
              },
            ]}
          >
            <Input placeholder={runnerId || 'runner-1'} />
          </Form.Item>
          <Form.Item
            name="hostKeyAlgorithm"
            label="主机密钥算法"
            extra="必须与下面的指纹取自同一把目标机主机公钥；不要用后端日志里的观察值回填"
            rules={[{ required: true, message: '请选择主机密钥算法' }]}
          >
            <Select
              placeholder="选择算法"
              options={HOST_KEY_ALGORITHMS.map((item) => ({
                value: item.value,
                label: item.label,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="hostKeySha256"
            label="主机密钥指纹"
            extra={
              selectedKeyFile
                ? `必须取自所选算法的目标机主机公钥 ${selectedKeyFile}（ssh-keygen -E sha256 -lf /etc/ssh/${selectedKeyFile}），与其他算法或日志观察值混用会失败`
                : '请先选择主机密钥算法，再填写该算法对应的指纹'
            }
            rules={[
              { required: true, message: '请输入主机密钥指纹' },
              {
                validator: (_, value: string) => {
                  const raw = (value || '').trim()
                  if (!raw) return Promise.resolve()
                  const normalized = raw.replace(/^SHA256:/, '').replace(/=+$/, '')
                  if (!/^[A-Za-z0-9+/]{43}$/.test(normalized)) {
                    return Promise.reject(new Error('格式应为 SHA256:<base64>（32 字节指纹）'))
                  }
                  try {
                    if (atob(normalized).length !== 32) {
                      return Promise.reject(new Error('指纹解码后应为 32 字节'))
                    }
                  } catch {
                    return Promise.reject(new Error('指纹不是合法的 base64'))
                  }
                  return Promise.resolve()
                },
              },
            ]}
          >
            <Input placeholder="SHA256:uL53VNB2cODbKzRjnoENplYrqjNzX1TqxuVCoAZpOb8" />
          </Form.Item>
        </Form>
      </Spin>
    </Drawer>
  )
}
