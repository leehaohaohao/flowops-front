import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Collapse,
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
  Tooltip,
  Typography,
  Upload,
} from 'antd'
import type { TableProps } from 'antd'
import { PlusOutlined, ReloadOutlined, UploadOutlined } from '@ant-design/icons'
import {
  createRegistry,
  deleteRegistry,
  distributeRunnerPackage,
  getNodeList,
  getNodePackageDistributions,
  getNodeSsh,
  getPackageDistribution,
  getRegistry,
  getRunnerPackages,
  saveNodeSsh,
  testNodeSsh,
  updateRegistry,
  uploadRunnerPackage,
} from '@/api/nodes'
import SshSetupGuide from '@/components/SshSetupGuide'
import { UserContext } from '@/App'
import { formatTime } from '@/utils/format'
import type {
  NodeInfo,
  PackageDistribution,
  RegisteredNode,
  RunnerPackage,
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

// ==================== 发布包分发（P4） ====================

/** 分发状态中文（阶段式展示；v1 不提供字节级进度） */
const DISTRIBUTION_STATUS_LABELS: Record<string, string> = {
  PENDING: '排队中',
  UPLOADING: '传输中',
  VERIFYING: '校验中',
  SUCCEEDED: '分发成功',
  FAILED: '分发失败',
}

const DISTRIBUTION_STATUS_COLORS: Record<string, string> = {
  PENDING: 'default',
  UPLOADING: 'processing',
  VERIFYING: 'warning',
  SUCCEEDED: 'success',
  FAILED: 'error',
}

/** 分发特有失败码；连接类失败沿用阶段 1 的 SSH_RESULT_LABELS（契约 §5.4） */
const PACKAGE_ERROR_LABELS: Record<string, string> = {
  REMOTE_DIR_MISSING: '目标机固定目录不存在（需运维预置）',
  REMOTE_DIR_NOT_WRITABLE: '目标机目录当前账号不可写',
  REMOTE_DISK_INSUFFICIENT: '目标机可用空间不足',
  REMOTE_WRITE_FAILED: '写入目标机临时文件失败',
  REMOTE_TOOL_MISSING: '目标机缺少 sha256sum / mv 等基础命令',
  REMOTE_COMMAND_TIMEOUT: '远端校验或改名命令超时',
  REMOTE_COMMAND_FAILED: '远端校验或改名命令退出码非 0',
  REMOTE_CHECKSUM_MISMATCH: '远端临时文件摘要不一致（传输损坏），未改名为正式包',
  UPLOAD_TIMEOUT: '传输整体超时',
  UPLOAD_INTERRUPTED: '传输连接中断',
  MASTER_RESTARTED: '主节点在分发过程中重启',
  STORE_READ_FAILED: '主节点读取已存储包失败',
  SSH_CONFIG_CHANGED: 'SSH 设置已变更或已被删除，需重新配置并测试连接后再分发',
  SSH_NOT_VERIFIED: '该节点 SSH 最近一次测试未通过，请重新测试连接后再分发',
  STORE_CHECKSUM_MISMATCH: '主节点存储的发布包与摘要不一致，请重新上传该包',
}

/** 需回到 SSH 设置重测的失败码：给出"去测试连接"入口，不提供"重试分发"（API 契约 §8.5） */
const SSH_PREREQUISITE_ERROR_CODES = ['SSH_CONFIG_CHANGED', 'SSH_NOT_VERIFIED']

/** 需重新上传主节点包文件的失败码：给出"重新上传"入口，同样不提供"重试分发" */
const STORE_RECOVERY_ERROR_CODES = ['STORE_CHECKSUM_MISMATCH']

function isTerminalStatus(status?: string): boolean {
  return status === 'SUCCEEDED' || status === 'FAILED'
}

/**
 * 组件是否仍挂载：异步请求返回时用它丢弃结果，
 * 避免抽屉/页面卸载后才 resolve 的回调触发渲染（StrictMode 下会重置为 true）。
 */
function useAliveRef() {
  const aliveRef = useRef(true)
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])
  return aliveRef
}

function distributionErrorLabel(record: PackageDistribution): string {
  if (!record.errorCode) return record.errorMessage || ''
  return (
    SSH_RESULT_LABELS[record.errorCode] ||
    PACKAGE_ERROR_LABELS[record.errorCode] ||
    record.errorMessage ||
    record.errorCode
  )
}

/** 上传本地预检：仅减少无效传输，服务端仍完整校验（不作为安全边界） */
const RUNNER_PACKAGE_NAME_PATTERN = /^flowops-executor-.+-linux-amd64\.tar\.gz$/
const RUNNER_PACKAGE_MAX_BYTES = 1024 * 1024 * 1024
const DISTRIBUTION_POLL_INTERVAL = 2000

function formatSize(bytes?: number | null): string {
  if (bytes == null) return '-'
  const mib = bytes / (1024 * 1024)
  return mib >= 1024 ? `${(mib / 1024).toFixed(2)} GiB` : `${mib.toFixed(1)} MiB`
}

function shortDigest(sha256?: string | null): string {
  if (!sha256) return '-'
  return `${sha256.slice(0, 12)}…`
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
  const [packageRunnerId, setPackageRunnerId] = useState('')
  const [activeTab, setActiveTab] = useState('online')
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
      width: 300,
      render: (_, record) => (
        <Space size="small">
          <Button size="small" onClick={() => openSsh(record)}>
            SSH 设置
          </Button>
          <Button size="small" onClick={() => setPackageRunnerId(record.runnerId)}>
            分发包
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
        activeKey={activeTab}
        onChange={setActiveTab}
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
                {
                  key: 'packages',
                  label: '发布包',
                  children: <PackagePanel onDistributed={(runnerId) => setPackageRunnerId(runnerId)} />,
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

      <NodePackageDrawer
        open={!!packageRunnerId}
        runnerId={packageRunnerId}
        onClose={() => setPackageRunnerId('')}
        onOpenSshSettings={() => {
          setSshRunnerId(packageRunnerId)
          setPackageRunnerId('')
        }}
        onRequestReupload={() => {
          setActiveTab('packages')
          setPackageRunnerId('')
        }}
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
  // 教程命令按当前表单值渲染，未填写时保留占位符
  const guideHost = Form.useWatch('host', form) as string | undefined
  const guidePort = Form.useWatch('port', form) as number | undefined
  const guideUsername = Form.useWatch('username', form) as string | undefined
  const guideKeyAlias = Form.useWatch('keyAlias', form) as string | undefined
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

      <Collapse
        ghost
        size="small"
        style={{ marginBottom: 12 }}
        items={[
          {
            key: 'setup-guide',
            label: '配置教程（Ubuntu / Debian）',
            children: (
              <SshSetupGuide
                values={{
                  host: guideHost,
                  port: guidePort,
                  username: guideUsername,
                  keyAlias: guideKeyAlias,
                }}
              />
            ),
          },
        ]}
      />

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

/** 发布包上传与版本/摘要列表（P4，入口仅在超管可见的「发布包」页签内） */
function PackagePanel({ onDistributed }: { onDistributed: (runnerId: string) => void }) {
  const [packages, setPackages] = useState<RunnerPackage[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [nodes, setNodes] = useState<RegisteredNode[]>([])
  const [distributeOpen, setDistributeOpen] = useState(false)
  const [distributePackage, setDistributePackage] = useState<RunnerPackage | null>(null)
  const [targetRunnerId, setTargetRunnerId] = useState<string | undefined>(undefined)
  const [distributing, setDistributing] = useState(false)
  const aliveRef = useAliveRef()

  const load = useCallback(() => {
    setLoading(true)
    getRunnerPackages()
      .then((res) => {
        if (!aliveRef.current) return
        setPackages(res.data || [])
      })
      .catch((err) => {
        if (aliveRef.current) message.error((err as Error).message || '获取发布包列表失败')
      })
      .finally(() => {
        if (aliveRef.current) setLoading(false)
      })
  }, [aliveRef])

  const loadNodes = useCallback(() => {
    getRegistry()
      .then((res) => setNodes(res.data || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    load()
    loadNodes()
  }, [load, loadNodes])

  const handleUpload = async (file: File) => {
    if (uploading) return
    try {
      setUploading(true)
      const res = await uploadRunnerPackage(file)
      if (!aliveRef.current) return
      const data = res.data
      const text = res.msg || '发布包已上传'
      if (data?.repaired) {
        // 自愈分支：本次按摘要重写了主节点存储文件，属成功结果而非错误（契约 §8.2）
        message.success(text)
      } else if (data?.existing) {
        message.info(text)
      } else {
        message.success(text)
      }
      load()
    } catch (err) {
      // 校验失败文案由后端给出（契约 §2），直接展示
      message.error((err as Error).message || '上传失败')
    } finally {
      setUploading(false)
    }
  }

  const handleBeforeUpload = (file: File) => {
    if (!RUNNER_PACKAGE_NAME_PATTERN.test(file.name)) {
      message.error('发布包文件名应为 flowops-executor-<版本>-linux-amd64.tar.gz')
      return false
    }
    if (file.size > RUNNER_PACKAGE_MAX_BYTES) {
      message.error('发布包超过 1 GiB 上限')
      return false
    }
    void handleUpload(file)
    return false
  }

  const openDistribute = (record: RunnerPackage) => {
    setDistributePackage(record)
    setTargetRunnerId(undefined)
    loadNodes()
    setDistributeOpen(true)
  }

  const handleDistribute = async () => {
    if (!distributePackage || distributing) return
    if (!targetRunnerId) {
      message.warning('请选择目标节点')
      return
    }
    try {
      setDistributing(true)
      const res = await distributeRunnerPackage(targetRunnerId, distributePackage.sha256)
      if (!aliveRef.current) return
      message.success(res.msg || '分发已开始')
      setDistributeOpen(false)
      // 打开该节点的分发抽屉查看阶段式进度与结果
      onDistributed(targetRunnerId)
    } catch (err) {
      // 前置不满足（未登记 / 未配置 SSH / 未测通过）时后端给出明确文案
      message.error((err as Error).message || '分发失败')
    } finally {
      setDistributing(false)
    }
  }

  const columns: TableProps<RunnerPackage>['columns'] = [
    { title: '版本', dataIndex: 'version', width: 100 },
    {
      title: '文件名',
      dataIndex: 'fileName',
      ellipsis: true,
      render: (val: string) => <Tooltip title={val}>{val}</Tooltip>,
    },
    {
      title: '摘要',
      dataIndex: 'sha256',
      width: 150,
      render: (val: string) => <Tooltip title={val}>{shortDigest(val)}</Tooltip>,
    },
    {
      title: '大小',
      dataIndex: 'sizeBytes',
      width: 100,
      render: (val: number) => formatSize(val),
    },
    { title: '平台', width: 110, render: (_, record) => `${record.os}/${record.arch}` },
    { title: '镜像', dataIndex: 'imageReference', width: 180, ellipsis: true },
    { title: '格式', dataIndex: 'formatVersion', width: 70 },
    { title: '上传者', dataIndex: 'uploadedBy', width: 100 },
    {
      title: '上传时间',
      dataIndex: 'uploadedAt',
      width: 170,
      render: (val: string) => formatTime(val),
    },
    {
      title: '操作',
      width: 120,
      render: (_, record) => (
        <Button size="small" onClick={() => openDistribute(record)}>
          分发给节点
        </Button>
      ),
    },
  ]

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Upload beforeUpload={handleBeforeUpload} showUploadList={false} accept=".gz">
          <Button type="primary" icon={<UploadOutlined />} loading={uploading}>
            上传发布包
          </Button>
        </Upload>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          刷新
        </Button>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          仅接受 flowops-executor-&lt;版本&gt;-linux-amd64.tar.gz，上限 1 GiB；主节点只校验与存储，不解压、不执行
        </Typography.Text>
      </Space>

      <Table
        columns={columns}
        dataSource={packages}
        rowKey="sha256"
        loading={loading}
        pagination={false}
        locale={{ emptyText: '尚未上传任何发布包' }}
      />

      <Modal
        title="分发发布包"
        open={distributeOpen}
        onOk={handleDistribute}
        confirmLoading={distributing}
        onCancel={() => setDistributeOpen(false)}
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          包：{distributePackage?.fileName}（{shortDigest(distributePackage?.sha256)}）
        </Typography.Paragraph>
        <Select
          style={{ width: '100%' }}
          placeholder="选择目标节点"
          value={targetRunnerId}
          onChange={setTargetRunnerId}
          options={nodes.map((node) => ({
            value: node.runnerId,
            label: node.nodeName ? `${node.runnerId}（${node.nodeName}）` : node.runnerId,
          }))}
          notFoundContent="暂无可选节点"
        />
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8 }}>
          目标节点需已配置 SSH 目标、补齐主机密钥算法并通过连接测试，否则分发会被拒绝。
        </Typography.Paragraph>
      </Modal>
    </div>
  )
}

/**
 * 单节点发布包分发（P4）：分发前置提示、触发分发、轮询阶段式进度与历史记录。
 * 轮询进入终态即停止，关闭抽屉时停止；v1 不提供取消与字节级进度。
 */
function NodePackageDrawer({
  open,
  runnerId,
  onClose,
  onOpenSshSettings,
  onRequestReupload,
}: {
  open: boolean
  runnerId: string
  onClose: () => void
  /** 需要重测时的入口：打开该节点的 SSH 设置抽屉 */
  onOpenSshSettings?: () => void
  /** 需要重新上传包时的入口：跳到「发布包」页签 */
  onRequestReupload?: () => void
}) {
  const [packages, setPackages] = useState<RunnerPackage[]>([])
  const [records, setRecords] = useState<PackageDistribution[]>([])
  const [sshTarget, setSshTarget] = useState<SshTarget | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedSha, setSelectedSha] = useState<string | undefined>(undefined)
  const [distributing, setDistributing] = useState(false)
  const [active, setActive] = useState<PackageDistribution | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollingIdRef = useRef<number | null>(null)
  const aliveRef = useAliveRef()

  const stopPolling = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    pollingIdRef.current = null
  }, [])

  const load = useCallback(() => {
    if (!runnerId) return
    setLoading(true)
    Promise.all([
      getRunnerPackages(),
      getNodePackageDistributions(runnerId),
      getNodeSsh(runnerId),
    ])
      .then(([packageRes, distributionRes, sshRes]) => {
        if (!aliveRef.current) return
        setPackages(packageRes.data || [])
        setRecords(distributionRes.data || [])
        setSshTarget(sshRes.data ?? null)
      })
      .catch((err) => {
        if (aliveRef.current) message.error((err as Error).message || '获取分发信息失败')
      })
      .finally(() => {
        if (aliveRef.current) setLoading(false)
      })
  }, [runnerId, aliveRef])

  useEffect(() => {
    if (!open) {
      stopPolling()
      return
    }
    setSelectedSha(undefined)
    setActive(null)
    stopPolling()
    load()
  }, [open, load, stopPolling])

  const startPolling = useCallback(
    (id: number) => {
      if (!runnerId) return
      pollingIdRef.current = id
      const tick = async () => {
        try {
          const res = await getPackageDistribution(runnerId, id)
          // 轮询已停止（抽屉关闭 / 组件卸载 / 已进入终态）时丢弃本次结果，避免卸载后仍触发渲染
          if (!aliveRef.current || pollingIdRef.current !== id) return
          const record = res.data ?? null
          setActive(record)
          if (!record || isTerminalStatus(record.status)) {
            stopPolling()
            load()
            return
          }
        } catch {
          // 单次轮询失败不终止，按间隔继续
        }
        timerRef.current = setTimeout(tick, DISTRIBUTION_POLL_INTERVAL)
      }
      void tick()
    },
    [runnerId, stopPolling, load, aliveRef],
  )

  // 抽屉打开期间自动接管在途记录（例如从「发布包」页签触发后进入）
  useEffect(() => {
    if (!open) return
    const running = records.find((item) => !isTerminalStatus(item.status))
    if (running && pollingIdRef.current !== running.id) {
      setActive(running)
      startPolling(running.id)
    }
  }, [records, open, startPolling])

  useEffect(() => () => stopPolling(), [stopPolling])

  // 分发前置（契约 §4.1）：未配置 / 缺算法 / 未测通过时给出明确原因
  const preconditionMessage = !sshTarget
    ? '尚未配置 SSH 目标'
    : !sshTarget.hostKeyAlgorithm
      ? '尚未选择主机密钥算法，请先补全 SSH 设置'
      : sshTarget.lastTest?.resultCode !== 'CONNECTED'
        ? '该节点 SSH 尚未通过连接测试，请先测试连接'
        : null

  const startDistribution = async (sha256: string) => {
    if (!runnerId || distributing) return
    try {
      setDistributing(true)
      const res = await distributeRunnerPackage(runnerId, sha256)
      if (!aliveRef.current) return
      message.success(res.msg || '分发已开始')
      const record = res.data ?? null
      if (record) {
        setActive(record)
        startPolling(record.id)
      }
      load()
    } catch (err) {
      message.error((err as Error).message || '分发失败')
    } finally {
      setDistributing(false)
    }
  }

  const handleDistribute = async () => {
    if (!selectedSha) {
      message.warning('请选择要分发的发布包')
      return
    }
    if (preconditionMessage) {
      message.warning(preconditionMessage)
      return
    }
    await startDistribution(selectedSha)
  }

  // 服务端允许对终态记录重新发起分发（非 SSH/存储类失败时提供该入口）
  const handleRetry = async (record: PackageDistribution) => {
    setSelectedSha(record.packageSha256)
    await startDistribution(record.packageSha256)
  }

  const recordColumns: TableProps<PackageDistribution>['columns'] = [
    { title: '包版本', dataIndex: 'version', width: 90 },
    {
      title: '摘要',
      dataIndex: 'packageSha256',
      width: 140,
      render: (val: string) => <Tooltip title={val}>{shortDigest(val)}</Tooltip>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (val: string) => (
        <Tag color={DISTRIBUTION_STATUS_COLORS[val] || 'default'}>
          {DISTRIBUTION_STATUS_LABELS[val] || val}
        </Tag>
      ),
    },
    {
      title: '绑定版本',
      dataIndex: 'sshConfigVersion',
      width: 100,
      render: (val: number | null) =>
        val == null ? (
          <Tooltip title="旧记录未绑定 SSH 配置版本，分发会失败为 SSH_CONFIG_CHANGED">
            <Tag color="orange">未绑定</Tag>
          </Tooltip>
        ) : (
          <Tag>v{val}</Tag>
        ),
    },
    {
      title: '结果',
      render: (_, record) =>
        record.status === 'FAILED' ? (
          <Typography.Text type="danger" style={{ fontSize: 12 }}>
            {distributionErrorLabel(record)}
          </Typography.Text>
        ) : record.status === 'SUCCEEDED' ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {record.alreadyPresent ? '目标机已有该包，跳过传输' : record.remotePath || '已完成'}
          </Typography.Text>
        ) : (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            进行中
          </Typography.Text>
        ),
    },
    { title: '触发人', dataIndex: 'operator', width: 100 },
    {
      title: '开始时间',
      dataIndex: 'startedAt',
      width: 170,
      render: (val: string | null) => (val ? formatTime(val) : '-'),
    },
    {
      title: '操作',
      width: 130,
      render: (_, record) => {
        if (record.status !== 'FAILED') return null
        // SSH 前置类失败：引导去重测，不提供"重试分发"（API 契约 §8.5.2）
        if (SSH_PREREQUISITE_ERROR_CODES.includes(record.errorCode || '')) {
          return (
            <Button size="small" onClick={onOpenSshSettings}>
              去测试连接
            </Button>
          )
        }
        // 存储失同步：引导重新上传同摘要包，无需改节点设置
        if (STORE_RECOVERY_ERROR_CODES.includes(record.errorCode || '')) {
          return (
            <Button size="small" onClick={onRequestReupload}>
              重新上传
            </Button>
          )
        }
        // 其余失败码沿用既有映射并允许重试分发（§8.5.3）
        return (
          <Button size="small" onClick={() => handleRetry(record)} loading={distributing}>
            重试分发
          </Button>
        )
      },
    },
  ]

  return (
    <Drawer
      title={runnerId ? `分发包：${runnerId}` : '分发包'}
      size={720}
      open={open}
      onClose={onClose}
    >
      <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
        分发为异步任务：主节点通过 SFTP 上传到目标机固定目录并核对远端摘要，不改配置、不解压、不启动子节点。
      </Typography.Paragraph>

      {preconditionMessage && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          title="当前节点不满足分发前置条件"
          description={`${preconditionMessage}。可在「节点登记」页用「SSH 设置」完成配置与测试连接。`}
        />
      )}

      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          style={{ width: 360 }}
          placeholder="选择要分发的发布包"
          value={selectedSha}
          onChange={setSelectedSha}
          options={packages.map((item) => ({
            value: item.sha256,
            label: `${item.version} · ${item.fileName}（${formatSize(item.sizeBytes)}）`,
          }))}
          notFoundContent="主节点尚未上传发布包"
        />
        <Button
          type="primary"
          onClick={handleDistribute}
          loading={distributing}
          disabled={!!preconditionMessage}
        >
          开始分发
        </Button>
        <Button
          onClick={() => active && startPolling(active.id)}
          disabled={!active}
        >
          刷新结果
        </Button>
      </Space>

      {active && (
        <Alert
          style={{ marginBottom: 16 }}
          type={
            active.status === 'SUCCEEDED'
              ? 'success'
              : active.status === 'FAILED'
                ? 'error'
                : 'info'
          }
          showIcon
          title={`分发状态：${DISTRIBUTION_STATUS_LABELS[active.status] || active.status}`}
          description={
            <div style={{ fontSize: 12 }}>
              <div>
                包版本：{active.version}（{shortDigest(active.packageSha256)}）
              </div>
              <div>
                绑定 SSH 配置版本：
                {active.sshConfigVersion == null ? '未绑定（旧记录）' : `v${active.sshConfigVersion}`}
              </div>
              {active.status === 'SUCCEEDED' && (
                <div>
                  已完成
                  {active.alreadyPresent ? '（目标机已有同摘要包，跳过传输）' : ''}
                  {active.remotePath ? `，目标路径：${active.remotePath}` : ''}
                </div>
              )}
              {active.status === 'FAILED' && <div>失败原因：{distributionErrorLabel(active)}</div>}
              {active.startedAt && <div>开始时间：{formatTime(active.startedAt)}</div>}
              {active.durationMs != null && <div>耗时：{active.durationMs} ms</div>}
            </div>
          }
        />
      )}

      <Spin spinning={loading}>
        <Table
          columns={recordColumns}
          dataSource={records}
          rowKey="id"
          pagination={false}
          locale={{ emptyText: '该节点尚无分发记录' }}
        />
      </Spin>
    </Drawer>
  )
}
