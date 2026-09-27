import { useContext, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Alert,
  Button,
  Card,
  Collapse,
  Col,
  Form,
  Input,
  InputNumber,
  message,
  Row,
  Select,
  Space,
  Switch,
  Typography,
  Upload,
} from 'antd'
import { MinusCircleOutlined, PlusOutlined, InboxOutlined } from '@ant-design/icons'
import {
  createService,
  getService,
  updateService,
  uploadBinary,
  uploadDist,
  uploadJar,
} from '@/api/services'
import { getNodeList } from '@/api/nodes'
import {
  getDefaultNetwork,
  getProjectNetworks,
  grantNetworkToProject,
} from '@/api/networks'
import NetworkFormDrawer from '@/components/NetworkFormDrawer'
import type { NetworkFormMode } from '@/components/NetworkFormDrawer'
import { UserContext } from '@/App'
import type { NodeInfo, ProjectNetwork } from '@/types'

const { Title, Text } = Typography
const { TextArea } = Input

interface ProxyDirective {
  name: string
  value: string
}

interface ProxyRule {
  path: string
  directives: ProxyDirective[]
}

interface ServiceConfig {
  backend?: {
    runtime?: string
    baseImage: string
    startupCommand: string
    envVars: Record<string, string>
    dataMount?: { containerPath: string; hostDir: string }
    appLogPath?: string
  }
  frontend?: {
    runtime?: string
    baseImage: string
    backendUrl: string
    proxyRules: ProxyRule[]
    customNginxConfig: string | null
    nginxListenPort: number
  }
}

const backendRuntimes: Record<string, { label: string; baseImage: string; startupCommand: string }> = {
  java: { label: 'Java', baseImage: 'openjdk:17-jdk-slim', startupCommand: 'java -jar /app/app.jar' },
  go: { label: 'Go', baseImage: 'golang:1.26.3-alpine', startupCommand: '/app/app' },
}

const frontendRuntimes: Record<string, { label: string }> = {
  vue: { label: 'Vue' },
  react: { label: 'React' },
  static: { label: '静态页面' },
}

const FRONTEND_DEFAULT_IMAGE = 'nginx:alpine'

interface ServiceFormValues {
  name?: string
  deployName?: string
  remark?: string
  serviceType?: string
  nodeId?: string
  networkId?: number | null
  portMappings?: Array<{
    hostPort?: number
    containerPort: number
    primary?: boolean
    expose?: boolean
    label?: string
    target?: string
  }>
  backendRuntime?: string
  backendBaseImage?: string
  backendStartupCommand?: string
  envVars?: Array<{ key?: string; value?: string }>
  dataMountContainerPath?: string
  dataMountHostDir?: string
  appLogPath?: string
  frontendRuntime?: string
  frontendBaseImage?: string
  frontendBackendUrl?: string
  proxyRules?: ProxyRule[]
  customNginxConfig?: string
  nginxListenPort?: number
  [key: string]: unknown
}

/** 按运行时解析后端预设（镜像/启动命令默认值的唯一来源） */
function resolveBackendPreset(runtime?: string) {
  return backendRuntimes[runtime || 'java'] || backendRuntimes.java
}

/**
 * 从完整表单值序列化 serviceConfig。
 * - 运行时以表单值为唯一数据源；
 * - 镜像/启动命令为空时按**当前运行时**预设补齐（Go 补 Go 预设，不再补 Java 默认值）；
 * - 非空自定义值原样保留。
 */
function buildServiceConfig(
  values: ServiceFormValues,
  options: { serviceType: string; useCustomNginx: boolean },
): ServiceConfig {
  const { serviceType, useCustomNginx } = options
  const config: ServiceConfig = {}

  if (serviceType === 'backend' || serviceType === 'fullstack') {
    const runtime = values.backendRuntime || 'java'
    const preset = resolveBackendPreset(runtime)
    const envVars: Record<string, string> = {}
    for (const item of values.envVars || []) {
      if (item?.key) envVars[item.key] = item.value || ''
    }
    config.backend = {
      runtime,
      baseImage: values.backendBaseImage?.trim() || preset.baseImage,
      startupCommand: values.backendStartupCommand?.trim() || preset.startupCommand,
      envVars,
    }
    if (values.dataMountContainerPath) {
      config.backend.dataMount = {
        containerPath: values.dataMountContainerPath,
        hostDir: values.dataMountHostDir || './data',
      }
    }
    if (values.appLogPath) {
      config.backend.appLogPath = values.appLogPath
    }
  }

  if (serviceType === 'frontend' || serviceType === 'fullstack') {
    config.frontend = {
      runtime: values.frontendRuntime || 'vue',
      baseImage: values.frontendBaseImage?.trim() || FRONTEND_DEFAULT_IMAGE,
      backendUrl: values.frontendBackendUrl || '',
      proxyRules: values.proxyRules || [],
      customNginxConfig: useCustomNginx ? values.customNginxConfig || null : null,
      nginxListenPort: values.nginxListenPort || 80,
    }
  }

  return config
}

const defaultProxyDirectives = (path: string, target: string): ProxyDirective[] => [
  { name: 'proxy_pass', value: target + path },
  { name: 'proxy_set_header', value: 'Host $http_host' },
  { name: 'proxy_set_header', value: 'X-Real-IP $remote_addr' },
  { name: 'proxy_set_header', value: 'X-Forwarded-For $proxy_add_x_forwarded_for' },
  { name: 'proxy_set_header', value: 'X-Forwarded-Proto $scheme' },
]

function generateNginxConf(proxyRules: ProxyRule[], nginxListenPort: number = 80): string {
  let proxyBlocks = ''
  for (const rule of proxyRules) {
    if (!rule.path) continue
    let p = rule.path.trim()
    if (!p.startsWith('/')) p = '/' + p
    if (!p.endsWith('/')) p = p + '/'
    proxyBlocks += `\n    # 反向代理: ${p}`
    proxyBlocks += `\n    location ${p} {`
    for (const d of rule.directives || []) {
      if (d.name) proxyBlocks += `\n        ${d.name} ${d.value};`
    }
    proxyBlocks += `\n    }`
  }
  return `server {
    listen ${nginxListenPort};
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    # 静态资源缓存
    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }${proxyBlocks}

    # SPA 路由
    location / {
        try_files $uri $uri/ /index.html;
    }
}`
}

function generatePreview(
  config: ServiceConfig,
  type: string,
  portMappings: Array<{ hostPort?: number; containerPort: number; primary?: boolean; expose?: boolean; label?: string; target?: string }> = [],
) {
  let dockerfile = ''
  let nginx = ''
  let compose = 'services:\n'

  const backendPorts = portMappings.filter((m) => type !== 'fullstack' || (m.target || 'backend') === 'backend')
  const frontendPorts = portMappings.filter((m) => type !== 'fullstack' || m.target === 'frontend')

  if ((type === 'backend' || type === 'fullstack') && config.backend) {
    const b = config.backend
    const runtime = b.runtime || 'java'
    const allPorts = type === 'fullstack' ? backendPorts : portMappings
    const exposePorts = [...new Set(allPorts.map((m) => m.containerPort))].join(' ')
    if (runtime === 'go') {
      dockerfile = `FROM ${b.baseImage}\nWORKDIR /app\nCOPY app /app/app\nRUN chmod +x /app/app\nEXPOSE ${exposePorts}`
    } else {
      dockerfile = `FROM ${b.baseImage}\nWORKDIR /app\nCOPY app.jar /app/app.jar\nEXPOSE ${exposePorts}`
    }
    for (const [k, v] of Object.entries(b.envVars || {})) {
      dockerfile += `\nENV ${k}=${v}`
    }
    const cmdParts = b.startupCommand.split(/\s+/)
    dockerfile += `\nENTRYPOINT [${cmdParts.map((p) => `"${p}"`).join(', ')}]`
  }

  if ((type === 'frontend' || type === 'fullstack') && config.frontend) {
    nginx = generateNginxConf(config.frontend.proxyRules || [], config.frontend.nginxListenPort || 80)
  }

  const buildPortLines = (mappings: typeof portMappings) => {
    const lines: string[] = []
    const primary = mappings.find((m) => m.primary)
    const exposeList = mappings.filter((m) => m.expose && m !== primary)
    const hostList = mappings.filter((m) => !m.expose || m === primary)
    if (exposeList.length > 0) {
      lines.push(...exposeList.map((m) => `      - "${m.containerPort}"`))
    }
    lines.push(...hostList.map((m) => m.hostPort ? `      - "${m.hostPort}:${m.containerPort}"` : `      - "${m.containerPort}"`))
    return lines
  }

  if (type === 'backend' && config.backend) {
    const lines = buildPortLines(portMappings)
    compose += `  backend:\n    build: .\n`
    compose += `    ports:\n${lines.join('\n')}\n`
    if (config.backend.dataMount) {
      compose += `    volumes:\n      - ${config.backend.dataMount.hostDir}:${config.backend.dataMount.containerPath}\n`
    }
    compose += `    restart: unless-stopped\n`
  } else if (type === 'frontend' && config.frontend) {
    const lines = buildPortLines(portMappings)
    compose += `  frontend:\n    image: ${config.frontend.baseImage}\n`
    compose += `    ports:\n${lines.join('\n')}\n`
    compose += `    volumes:\n      - ./dist:/usr/share/nginx/html\n      - ./default.conf:/etc/nginx/conf.d/default.conf\n    restart: unless-stopped\n`
  } else if (type === 'fullstack' && config.backend && config.frontend) {
    const beLines = buildPortLines(backendPorts)
    compose += `  backend:\n    build: .\n    ports:\n${beLines.join('\n')}\n`
    if (config.backend.dataMount) {
      compose += `    volumes:\n      - ${config.backend.dataMount.hostDir}:${config.backend.dataMount.containerPath}\n`
    }
    compose += `    restart: unless-stopped\n`
    const fePrimary = frontendPorts.find((m) => m.primary) || frontendPorts[0]
    const nginxContainerPort = fePrimary?.containerPort || 80
    const frontendHostPort = fePrimary?.hostPort || nginxContainerPort
    compose += `  frontend:\n    image: ${config.frontend.baseImage}\n    ports:\n      - "${frontendHostPort}:${nginxContainerPort}"\n`
    compose += `    volumes:\n      - ./dist:/usr/share/nginx/html\n      - ./default.conf:/etc/nginx/conf.d/default.conf\n    depends_on:\n      - backend\n    restart: unless-stopped\n`
  }

  return { dockerfile, nginx, compose }
}

export default function ServiceEdit() {
  const { id, projectId } = useParams()
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const userInfo = useContext(UserContext)
  const isSuperAdmin = !!userInfo?.superAdmin
  // F0：运行时与服务类型统一以表单存储为唯一数据源，避免与表单值漂移
  const serviceType = (Form.useWatch('serviceType', form) as string) ?? 'backend'
  const backendRuntime = (Form.useWatch('backendRuntime', form) as string) ?? 'java'
  // 目标节点非空（runner / auto）时共享网络不可选：节点与网络互斥
  const selectedNodeId = (Form.useWatch('nodeId', form) as string | undefined) ?? ''
  const networkDisabled = !!selectedNodeId
  const [saving, setSaving] = useState(false)
  const [legacyGoJavaMismatch, setLegacyGoJavaMismatch] = useState(false)
  const [preview, setPreview] = useState({ dockerfile: '', nginx: '', compose: '' })
  const [useCustomNginx, setUseCustomNginx] = useState(false)
  const [loadedProjectId, setLoadedProjectId] = useState<number | null>(null)
  const [nodeList, setNodeList] = useState<NodeInfo[]>([])
  const [projectNetworks, setProjectNetworks] = useState<ProjectNetwork[]>([])
  const [networkFormOpen, setNetworkFormOpen] = useState(false)
  const [networkFormMode, setNetworkFormMode] = useState<NetworkFormMode>('create')
  const [originalNetworkId, setOriginalNetworkId] = useState<number | null>(null)

  useEffect(() => {
    getNodeList()
      .then((res) => setNodeList(res.data))
      .catch(() => {})
  }, [])

  const isEdit = !!id
  const currentProjectId = projectId || (loadedProjectId ? String(loadedProjectId) : null)

  // F0：历史缺陷记录——runtime=go 但镜像/启动命令恰为 Java 默认组合。
  // 检测在编辑回显时完成（高级选项收起时镜像字段未挂载，useWatch 读不到值）；
  // 只提示并允许一键恢复，读取时不静默改数据，也不覆盖用户自定义值。
  const restoreGoDefaults = () => {
    form.setFieldsValue({
      backendRuntime: 'go',
      backendBaseImage: backendRuntimes.go.baseImage,
      backendStartupCommand: backendRuntimes.go.startupCommand,
    })
    setLegacyGoJavaMismatch(false)
    message.success('已恢复 Go 默认值，保存后生效')
  }

  const dismissLegacyGoJavaHint = () => setLegacyGoJavaMismatch(false)

  const loadProjectNetworks = (projectIdValue: string) => {
    getProjectNetworks(Number(projectIdValue))
      .then((res) => setProjectNetworks(res.data || []))
      .catch(() => setProjectNetworks([]))
  }

  // 共享网络候选：仅本项目已授权且主节点实际存在的网络；新建时预选项目默认值
  useEffect(() => {
    if (!currentProjectId) return
    loadProjectNetworks(currentProjectId)
    if (isEdit) return
    getDefaultNetwork(Number(currentProjectId))
      .then((res) => {
        if (res.data?.networkId != null) {
          form.setFieldsValue({ networkId: res.data.networkId })
        }
      })
      .catch(() => {})
  }, [currentProjectId, isEdit, form])

  useEffect(() => {
    if (!id) return
    getService(Number(id))
      .then((res) => {
        const svc = res.data
        setLoadedProjectId(svc.projectId)

        let config: ServiceConfig = {}
        try {
          config = JSON.parse(svc.serviceConfig || '{}')
        } catch {
          /* ignore */
        }

        const envVars = config.backend?.envVars
          ? Object.entries(config.backend.envVars).map(([k, v]) => ({ key: k, value: v }))
          : []

        const beRuntime = config.backend?.runtime || 'java'
        const feRuntime = config.frontend?.runtime || 'vue'
        const bePreset = resolveBackendPreset(beRuntime)

        let portMappings: Array<{ hostPort?: number; containerPort: number; primary?: boolean; expose?: boolean; label?: string; target?: string }> = []
        try {
          portMappings = svc.portMappings ? JSON.parse(svc.portMappings) : []
        } catch { /* ignore */ }
        if (portMappings.length === 0) {
          if (svc.serviceType === 'frontend') {
            portMappings = [{ containerPort: 80, label: 'Web端口', primary: true }]
          } else if (svc.serviceType === 'fullstack') {
            portMappings = [
              { hostPort: 80, containerPort: 80, label: 'Web端口', primary: true, target: 'frontend' },
              { containerPort: 8080, expose: true, label: '内部API', target: 'backend' },
            ]
          } else {
            portMappings = [{ hostPort: 8080, containerPort: 8080, label: 'HTTP', primary: true }]
          }
        }

        form.setFieldsValue({
          name: svc.name,
          deployName: svc.deployName || '',
          remark: svc.remark || '',
          serviceType: svc.serviceType,
          nodeId: svc.nodeId || '',
          networkId: svc.networkId ?? undefined,
          backendRuntime: beRuntime,
          backendBaseImage: config.backend?.baseImage || bePreset.baseImage,
          backendStartupCommand: config.backend?.startupCommand || bePreset.startupCommand,
          envVars,
          dataMountContainerPath: config.backend?.dataMount?.containerPath || '',
          dataMountHostDir: config.backend?.dataMount?.hostDir || './data',
          appLogPath: config.backend?.appLogPath || '',
          frontendRuntime: feRuntime,
          frontendBaseImage: config.frontend?.baseImage || 'nginx:alpine',
          frontendBackendUrl: config.frontend?.backendUrl || '',
          proxyRules: config.frontend?.proxyRules || [],
          customNginxConfig: config.frontend?.customNginxConfig || '',
          nginxListenPort: config.frontend?.nginxListenPort || 80,
          portMappings,
        })
        setUseCustomNginx(!!config.frontend?.customNginxConfig)
        setOriginalNetworkId(svc.networkId ?? null)
        setLegacyGoJavaMismatch(
          beRuntime === 'go' &&
            config.backend?.baseImage === backendRuntimes.java.baseImage &&
            config.backend?.startupCommand === backendRuntimes.java.startupCommand,
        )
      })
      .catch((err) => message.error((err as Error).message || '加载服务失败'))
  }, [id, form])

  // F0：读取完整表单存储（getFieldsValue(true) 含未挂载字段），作为唯一数据源。
  // 高级选项折叠时镜像/启动命令字段未挂载，无参数 getFieldsValue() 会丢失它们。
  const readFormValues = (): ServiceFormValues =>
    (form.getFieldsValue(true) as ServiceFormValues) || {}

  const collectConfig = (): ServiceConfig =>
    buildServiceConfig(readFormValues(), { serviceType, useCustomNginx })

  const handleSave = async () => {
    try {
      // 先触发挂载字段的校验；业务值一律取自完整表单存储
      await form.validateFields()
      const values = readFormValues()
      setSaving(true)
      const config = collectConfig()
      const mappings = (values.portMappings || []).filter((m) => m.containerPort)
      if (mappings.length > 0 && !mappings.some((m) => m.primary)) {
        mappings[0].primary = true
      }
      const networkId = values.networkId ?? undefined
      const data = {
        name: values.name,
        deployName: values.deployName,
        remark: values.remark || undefined,
        portMappings: JSON.stringify(mappings),
        serviceType: values.serviceType,
        serviceConfig: JSON.stringify(config),
        nodeId: values.nodeId || undefined,
        networkId,
        ...(projectId ? { projectId: Number(projectId) } : {}),
      }
      if (isEdit) {
        await updateService(Number(id), data)
        message.success('更新成功')
        if ((networkId ?? null) !== originalNetworkId) {
          message.info('共享网络变更需重新部署服务后生效')
        }
      } else {
        await createService(data)
        message.success('创建成功')
      }
      if (currentProjectId) {
        navigate(`/projects/${currentProjectId}/services`)
      } else {
        navigate('/projects')
      }
    } catch (err) {
      if ((err as { errorFields?: unknown }).errorFields) return
      message.error((err as Error).message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handlePreview = () => {
    const values = readFormValues()
    const config = collectConfig()
    const mappings = (values.portMappings || []).filter((m) => m.containerPort)
    setPreview(generatePreview(config, serviceType, mappings))
  }

  const openNetworkForm = (mode: NetworkFormMode) => {
    setNetworkFormMode(mode)
    setNetworkFormOpen(true)
  }

  // 超管在服务编辑页新建/导入网络后自动授权给当前项目并选中；授权失败时分别说明两步结果
  const handleNetworkFormSuccess = async (networkId: number) => {
    if (!currentProjectId) return
    try {
      await grantNetworkToProject(networkId, Number(currentProjectId))
      message.success('已自动授权本项目使用新网络')
      form.setFieldsValue({ networkId })
    } catch (err) {
      message.error(`网络已创建，但授权本项目失败：${(err as Error).message || '未知错误'}`)
    }
    loadProjectNetworks(currentProjectId)
  }

  const handleUploadJar = async (file: File) => {
    if (!id) { message.warning('请先保存服务'); return }
    try {
      await uploadJar(Number(id), file)
      message.success('上传成功')
    } catch (err) {
      message.error((err as Error).message || '上传失败')
    }
  }

  const handleUploadBinary = async (file: File) => {
    if (!id) { message.warning('请先保存服务'); return }
    try {
      await uploadBinary(Number(id), file)
      message.success('上传成功')
    } catch (err) {
      message.error((err as Error).message || '上传失败')
    }
  }

  const handleUploadDist = async (file: File) => {
    if (!id) { message.warning('请先保存服务'); return }
    try {
      await uploadDist(Number(id), file)
      message.success('上传成功')
    } catch (err) {
      message.error((err as Error).message || '上传失败')
    }
  }

  const showBackend = serviceType === 'backend' || serviceType === 'fullstack'
  const showFrontend = serviceType === 'frontend' || serviceType === 'fullstack'

  const codeBlockStyle: React.CSSProperties = { background: '#1e1e1e', color: '#d4d4d4', padding: 12, borderRadius: 4, marginTop: 4, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 300, overflow: 'auto' }

  return (
    <div>
      {/* Title bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>{isEdit ? '编辑服务' : '创建服务'}</Title>
        <Space>
          <Button type="primary" onClick={handleSave} loading={saving}>保存</Button>
          <Button onClick={handlePreview}>预览配置</Button>
          <Button onClick={() => currentProjectId ? navigate(`/projects/${currentProjectId}/services`) : navigate('/projects')}>取消</Button>
        </Space>
      </div>

      <Row gutter={24}>
        {/* Left column - Form */}
        <Col span={14}>
          <Form form={form} layout="vertical" initialValues={{ serviceType: 'backend', backendRuntime: 'java', backendBaseImage: 'openjdk:17-jdk-slim', backendStartupCommand: 'java -jar /app/app.jar', frontendRuntime: 'vue', frontendBaseImage: 'nginx:alpine', nginxListenPort: 80, nodeId: '', portMappings: [{ hostPort: 8080, containerPort: 8080, label: 'HTTP', primary: true }] }}>
            {/* Basic info - 4 column grid */}
            <Row gutter={16}>
              <Col span={6}>
                <Form.Item name="serviceType" label="服务类型" rules={[{ required: true }]}>
                  <Select
                    options={[
                      { value: 'backend', label: '纯后端' },
                      { value: 'frontend', label: '纯前端' },
                      { value: 'fullstack', label: '前后端一体' },
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="name" label="服务名称" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item
                  name="deployName"
                  label="部署名称"
                  rules={[
                    { required: true, message: '请输入部署名称' },
                    { pattern: /^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/, message: '只能包含小写字母、数字和连字符，且首尾为字母或数字' },
                    { max: 63 },
                  ]}
                  tooltip="用于 Docker Compose 项目命名和文件目录"
                >
                  <Input />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item
                  name="nodeId"
                  label="目标节点"
                  tooltip="部署执行的 Docker 节点；不选则在本机执行，auto 由后端按负载自动调度"
                >
                  <Select
                    placeholder="本机（默认）"
                    options={[
                      { value: '', label: '本机（默认）' },
                      { value: 'auto', label: '自动调度 (auto)' },
                      ...nodeList.map((n) => ({ value: n.runnerId, label: n.runnerId })),
                    ]}
                    onChange={(val: string) => {
                      // 节点与共享网络互斥：切到 runner / auto 时清空网络选择
                      if (val) form.setFieldsValue({ networkId: undefined })
                    }}
                  />
                </Form.Item>
              </Col>
            </Row>

            {/* 共享网络：仅本机部署可选，候选为本项目已授权且主节点存在的网络 */}
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item
                  name="networkId"
                  label="共享网络"
                  tooltip="同一共享网络内的容器可通过唯一别名互访监听端口；共享网络仅支持本机部署"
                  extra={
                    networkDisabled ? (
                      '已选择远程节点或自动调度，共享网络不可用'
                    ) : isSuperAdmin ? (
                      <Space size={4}>
                        <a onClick={() => openNetworkForm('create')}>新建网络</a>
                        <span>/</span>
                        <a onClick={() => openNetworkForm('import')}>导入网络</a>
                        <span>并授权本项目</span>
                      </Space>
                    ) : (
                      '共享网络需超级管理员授权给本项目'
                    )
                  }
                >
                  <Select
                    allowClear
                    disabled={networkDisabled}
                    placeholder="不加入共享网络"
                    options={projectNetworks.map((n) => ({
                      value: n.id,
                      label: `${n.displayName || n.name}（${n.name}）`,
                    }))}
                    notFoundContent="本项目暂无可用的共享网络"
                  />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="remark" label="备注">
              <TextArea rows={2} placeholder="可选，记录服务用途说明" />
            </Form.Item>

            {/* Port mappings */}
            <Form.Item label="端口映射">
              <Form.List name="portMappings">
                {(fields, { add, remove }) => (
                  <div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 12, color: '#888' }}>
                      <div style={{ width: 110 }}>宿主机端口</div>
                      <div style={{ width: 110 }}>容器端口</div>
                      <div style={{ width: 100 }}>标签</div>
                      <div style={{ width: 70 }}>仅内部</div>
                      {serviceType === 'fullstack' && <div style={{ width: 90 }}>目标</div>}
                    </div>
                    {fields.map((field) => (
                      <Space key={field.key} align="baseline" style={{ display: 'flex', marginBottom: 4 }}>
                        <Form.Item name={[field.name, 'hostPort']} noStyle>
                          <InputNumber
                            placeholder="宿主机端口"
                            style={{ width: 110 }}
                            disabled={form.getFieldValue(['portMappings', field.name, 'expose'])}
                          />
                        </Form.Item>
                        <Form.Item name={[field.name, 'containerPort']} noStyle>
                          <InputNumber placeholder="容器端口" style={{ width: 110 }} />
                        </Form.Item>
                        <Form.Item name={[field.name, 'label']} noStyle>
                          <Input placeholder="标签" style={{ width: 100 }} />
                        </Form.Item>
                        <Form.Item name={[field.name, 'expose']} noStyle valuePropName="checked">
                          <Switch
                            size="small"
                            onChange={(checked) => {
                              if (checked) form.setFieldValue(['portMappings', field.name, 'hostPort'], undefined)
                            }}
                          />
                        </Form.Item>
                        {serviceType === 'fullstack' && (
                          <Form.Item name={[field.name, 'target']} noStyle>
                            <Select style={{ width: 90 }} options={[{ value: 'backend', label: '后端' }, { value: 'frontend', label: '前端' }]} />
                          </Form.Item>
                        )}
                        <MinusCircleOutlined onClick={() => remove(field.name)} />
                      </Space>
                    ))}
                    <Button type="dashed" onClick={() => add({ containerPort: 8080 })} icon={<PlusOutlined />} size="small">
                      添加端口映射
                    </Button>
                  </div>
                )}
              </Form.List>
            </Form.Item>

            {/* Backend config */}
            {showBackend && (
              <Card title="后端配置" size="small" style={{ marginBottom: 16 }}>
                {legacyGoJavaMismatch && (
                  <Alert
                    type="warning"
                    showIcon
                    style={{ marginBottom: 12 }}
                    title="该服务运行时为 Go，但基础镜像与启动命令仍是 Java 默认值"
                    description="直接保存会继续沿用这组不匹配的配置。可一键恢复 Go 默认：golang:1.26.3-alpine / /app/app。"
                    action={
                      <Button size="small" onClick={restoreGoDefaults}>
                        恢复 Go 默认
                      </Button>
                    }
                  />
                )}
                <Row gutter={16}>
                  <Col span={8}>
                    <Form.Item name="backendRuntime" label="运行时">
                      <Select
                        options={Object.entries(backendRuntimes).map(([k, v]) => ({ value: k, label: v.label }))}
                        onChange={(val: string) => {
                          // 切换运行时即写入该运行时预设；值进表单存储，保存/预览/上传控件同源
                          const preset = backendRuntimes[val]
                          if (preset) {
                            form.setFieldsValue({
                              backendBaseImage: preset.baseImage,
                              backendStartupCommand: preset.startupCommand,
                            })
                          }
                          dismissLegacyGoJavaHint()
                        }}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item name="dataMountContainerPath" label="数据持久化（容器目录）" extra="留空则不挂载">
                      <Input placeholder="/app/data" />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item name="appLogPath" label="应用日志路径（容器内）" extra="留空则不采集应用日志">
                      <Input placeholder="/app/logs" />
                    </Form.Item>
                  </Col>
                </Row>

                {/* Advanced collapse for backend */}
                <Collapse
                  ghost
                  size="small"
                  items={[
                    {
                      key: 'advanced',
                      label: '高级选项',
                      children: (
                        <>
                          <Row gutter={16}>
                            <Col span={12}>
                              <Form.Item name="backendBaseImage" label="基础镜像">
                                <Input onChange={dismissLegacyGoJavaHint} />
                              </Form.Item>
                            </Col>
                            <Col span={12}>
                              <Form.Item name="backendStartupCommand" label="启动命令">
                                <Input onChange={dismissLegacyGoJavaHint} />
                              </Form.Item>
                            </Col>
                          </Row>
                          <Row gutter={16}>
                            <Col span={12}>
                              <Form.Item name="dataMountHostDir" label="宿主机目录" initialValue="./data" extra="相对于服务部署目录">
                                <Input placeholder="./data" />
                              </Form.Item>
                            </Col>
                          </Row>
                        </>
                      ),
                    },
                  ]}
                />

                {/* Env vars */}
                <Text strong style={{ display: 'block', marginTop: 12, marginBottom: 8 }}>环境变量</Text>
                <Form.List name="envVars">
                  {(fields, { add, remove }) => (
                    <div style={{ marginBottom: 8 }}>
                      {fields.map((field) => (
                        <Row key={field.key} gutter={8} style={{ marginBottom: 4 }} align="middle">
                          <Col flex="1">
                            <Form.Item name={[field.name, 'key']} noStyle>
                              <Input placeholder="KEY" />
                            </Form.Item>
                          </Col>
                          <Col flex="1">
                            <Form.Item name={[field.name, 'value']} noStyle>
                              <Input placeholder="VALUE" />
                            </Form.Item>
                          </Col>
                          <Col flex="none">
                            <MinusCircleOutlined onClick={() => remove(field.name)} />
                          </Col>
                        </Row>
                      ))}
                      <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />} size="small">
                        添加环境变量
                      </Button>
                    </div>
                  )}
                </Form.List>
              </Card>
            )}

            {/* Frontend config */}
            {showFrontend && (
              <Card title="前端配置" size="small" style={{ marginBottom: 16 }}>
                <Row gutter={16}>
                  <Col span={8}>
                    <Form.Item name="frontendRuntime" label="运行时">
                      <Select
                        options={Object.entries(frontendRuntimes).map(([k, v]) => ({ value: k, label: v.label }))}
                      />
                    </Form.Item>
                  </Col>
                  {serviceType === 'frontend' && (
                    <Col span={16}>
                      <Form.Item
                        name="frontendBackendUrl"
                        label="后端地址"
                        extra="仅纯前端模式需要，一体模式自动使用 Docker 内部通信"
                      >
                        <Input placeholder="http://121.40.154.188:8090" />
                      </Form.Item>
                    </Col>
                  )}
                </Row>

                {/* Advanced collapse for frontend */}
                <Collapse
                  ghost
                  size="small"
                  items={[
                    {
                      key: 'advanced',
                      label: '高级选项',
                      children: (
                        <Row gutter={16}>
                          <Col span={8}>
                            <Form.Item name="frontendBaseImage" label="基础镜像">
                              <Input />
                            </Form.Item>
                          </Col>
                          <Col span={8}>
                            <Form.Item name="nginxListenPort" label="Nginx 监听端口">
                              <InputNumber style={{ width: '100%' }} />
                            </Form.Item>
                          </Col>
                          <Col span={8}>
                            <div style={{ paddingTop: 30 }}>
                              <label>
                                <input
                                  type="checkbox"
                                  checked={useCustomNginx}
                                  onChange={(e) => setUseCustomNginx(e.target.checked)}
                                  style={{ marginRight: 8 }}
                                />
                                自定义 Nginx 配置
                              </label>
                            </div>
                          </Col>
                        </Row>
                      ),
                    },
                  ]}
                />
                {useCustomNginx && (
                  <Form.Item name="customNginxConfig" style={{ marginTop: 8 }}>
                    <TextArea
                      rows={8}
                      style={{ fontFamily: 'monospace', fontSize: 13 }}
                      placeholder="输入自定义 Nginx 配置..."
                    />
                  </Form.Item>
                )}

                {/* Proxy rules */}
                <Text strong style={{ display: 'block', marginTop: 12, marginBottom: 4 }}>代理规则</Text>
                <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 8 }}>
                  配置 Nginx 反向代理路径，如 /api/、/api/sse/ 等
                </Text>
                <Form.List name="proxyRules">
                  {(rules, { add: addRule, remove: removeRule }) => (
                    <div style={{ marginBottom: 8 }}>
                      {rules.map((rule) => (
                        <Card
                          key={rule.key}
                          size="small"
                          style={{ marginBottom: 8 }}
                          title={
                            <Form.Item name={[rule.name, 'path']} noStyle>
                              <Input
                                placeholder="/api/"
                                style={{ width: 200 }}
                                onBlur={(e) => {
                                  let v = e.target.value.trim()
                                  if (!v) return
                                  if (!v.startsWith('/')) v = '/' + v
                                  if (!v.endsWith('/')) v = v + '/'
                                  form.setFieldValue(['proxyRules', rule.name, 'path'], v)
                                }}
                              />
                            </Form.Item>
                          }
                          extra={<MinusCircleOutlined onClick={() => removeRule(rule.name)} />}
                        >
                          <Form.List name={[rule.name, 'directives']}>
                            {(dirs, { add: addDir, remove: removeDir }) => (
                              <>
                                {dirs.map((dir) => (
                                  <Space key={dir.key} align="baseline" style={{ display: 'flex', marginBottom: 4 }}>
                                    <Form.Item name={[dir.name, 'name']} noStyle>
                                      <Input placeholder="指令名" style={{ width: 200, fontFamily: 'monospace' }} />
                                    </Form.Item>
                                    <Form.Item name={[dir.name, 'value']} noStyle>
                                      <Input placeholder="值" style={{ width: 320, fontFamily: 'monospace' }} />
                                    </Form.Item>
                                    <MinusCircleOutlined onClick={() => removeDir(dir.name)} />
                                  </Space>
                                ))}
                                <Button type="dashed" onClick={() => addDir()} icon={<PlusOutlined />} size="small">
                                  添加指令
                                </Button>
                              </>
                            )}
                          </Form.List>
                        </Card>
                      ))}
                      <Button
                        type="dashed"
                        onClick={() => {
                          const portMappings = form.getFieldValue('portMappings') || []
                          const backendPorts = portMappings.filter((m: { target?: string }) => serviceType !== 'fullstack' || (m.target || 'backend') === 'backend')
                          const primaryBackend = backendPorts.find((m: { primary?: boolean }) => m.primary) || backendPorts[0]
                          const containerPort = primaryBackend?.containerPort || 8080
                          const backendTarget =
                            serviceType === 'fullstack'
                              ? `http://backend:${containerPort}`
                              : form.getFieldValue('frontendBackendUrl') || 'http://localhost:8080'
                          const path = '/api/'
                          addRule({ path, directives: defaultProxyDirectives(path, backendTarget) })
                        }}
                        icon={<PlusOutlined />}
                        block
                      >
                        添加代理规则
                      </Button>
                    </div>
                  )}
                </Form.List>
              </Card>
            )}
          </Form>
        </Col>

        {/* Right column - Sidebar */}
        <Col span={10}>
          <div style={{ position: 'sticky', top: 16 }}>
            {/* Upload section (edit mode) */}
            {isEdit && (
              <Card title="上传产物" size="small" style={{ marginBottom: 16 }}>
                {showBackend && (
                  <div style={{ marginBottom: 16 }}>
                    <Text strong>后端产物</Text>
                    <div style={{ marginTop: 8 }}>
                      {backendRuntime === 'go' ? (
                        <Upload.Dragger
                          beforeUpload={(file) => { handleUploadBinary(file); return false }}
                          showUploadList={false}
                          multiple={false}
                        >
                          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                          <p className="ant-upload-text">拖拽或点击上传二进制文件</p>
                          <p className="ant-upload-hint">Go 编译产物</p>
                        </Upload.Dragger>
                      ) : (
                        <Upload.Dragger
                          beforeUpload={(file) => { handleUploadJar(file); return false }}
                          showUploadList={false}
                          accept=".jar"
                          multiple={false}
                        >
                          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                          <p className="ant-upload-text">拖拽或点击上传 JAR 文件</p>
                          <p className="ant-upload-hint">Java 打包产物</p>
                        </Upload.Dragger>
                      )}
                    </div>
                  </div>
                )}
                {showFrontend && (
                  <div>
                    <Text strong>前端产物</Text>
                    <div style={{ marginTop: 8 }}>
                      <Upload.Dragger
                        beforeUpload={(file) => { handleUploadDist(file); return false }}
                        showUploadList={false}
                        accept=".zip"
                        multiple={false}
                      >
                        <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                        <p className="ant-upload-text">拖拽或点击上传前端 dist (zip)</p>
                        <p className="ant-upload-hint">前端构建产物压缩包</p>
                      </Upload.Dragger>
                    </div>
                  </div>
                )}
              </Card>
            )}

            {/* Preview section */}
            <Card
              title="配置预览"
              size="small"
              extra={<Button size="small" onClick={handlePreview}>刷新</Button>}
            >
              {preview.dockerfile ? (
                <div style={{ marginBottom: 12 }}>
                  <Text strong style={{ fontSize: 12 }}>Dockerfile</Text>
                  <pre style={codeBlockStyle}>{preview.dockerfile}</pre>
                </div>
              ) : null}
              {preview.nginx ? (
                <div style={{ marginBottom: 12 }}>
                  <Text strong style={{ fontSize: 12 }}>default.conf</Text>
                  <pre style={codeBlockStyle}>{preview.nginx}</pre>
                </div>
              ) : null}
              {preview.compose ? (
                <div>
                  <Text strong style={{ fontSize: 12 }}>docker-compose.yml</Text>
                  <pre style={codeBlockStyle}>{preview.compose}</pre>
                </div>
              ) : (
                <Text type="secondary">点击「预览配置」或「刷新」查看生成的配置</Text>
              )}
            </Card>
          </div>
        </Col>
      </Row>

      <NetworkFormDrawer
        open={networkFormOpen}
        mode={networkFormMode}
        onClose={() => setNetworkFormOpen(false)}
        onSuccess={handleNetworkFormSuccess}
      />
    </div>
  )
}
