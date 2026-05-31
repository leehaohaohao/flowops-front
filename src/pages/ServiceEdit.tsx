import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
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
  const [serviceType, setServiceType] = useState<string>('backend')
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState({ dockerfile: '', nginx: '', compose: '' })
  const [useCustomNginx, setUseCustomNginx] = useState(false)
  const [loadedProjectId, setLoadedProjectId] = useState<number | null>(null)
  const [backendRuntime, setBackendRuntime] = useState<string>('java')
  const [frontendRuntime, setFrontendRuntime] = useState<string>('vue')

  const isEdit = !!id
  const currentProjectId = projectId || (loadedProjectId ? String(loadedProjectId) : null)

  useEffect(() => {
    if (!id) return
    getService(Number(id))
      .then((res) => {
        const svc = res.data
        setServiceType(svc.serviceType)
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
        setBackendRuntime(beRuntime)
        setFrontendRuntime(feRuntime)

        let portMappings: Array<{ hostPort?: number; containerPort: number; primary?: boolean; expose?: boolean; label?: string; target?: string }> = []
        try {
          portMappings = svc.portMappings ? JSON.parse(svc.portMappings) : []
        } catch { /* ignore */ }
        if (portMappings.length === 0) {
          if (svc.serviceType === 'frontend') {
            portMappings = [{ containerPort: 80, label: 'Web端口', primary: true }]
          } else if (svc.serviceType === 'fullstack') {
            portMappings = [
              { hostPort: svc.port || 80, containerPort: 80, label: 'Web端口', primary: true, target: 'frontend' },
              { containerPort: 8080, expose: true, label: '内部API', target: 'backend' },
            ]
          } else {
            portMappings = [{ hostPort: svc.port || 8080, containerPort: 8080, label: 'HTTP', primary: true }]
          }
        }
        const primaryPort = portMappings.find((p) => p.primary) || portMappings[0]

        form.setFieldsValue({
          name: svc.name,
          deployName: svc.deployName || '',
          remark: svc.remark || '',
          serviceType: svc.serviceType,
          port: primaryPort?.hostPort || svc.port,
          backendRuntime: beRuntime,
          backendBaseImage: config.backend?.baseImage || backendRuntimes[beRuntime]?.baseImage || 'openjdk:17-jdk-slim',
          backendStartupCommand: config.backend?.startupCommand || backendRuntimes[beRuntime]?.startupCommand || 'java -jar /app/app.jar',
          envVars,
          dataMountContainerPath: config.backend?.dataMount?.containerPath || '',
          dataMountHostDir: config.backend?.dataMount?.hostDir || './data',
          frontendRuntime: feRuntime,
          frontendBaseImage: config.frontend?.baseImage || 'nginx:alpine',
          frontendBackendUrl: config.frontend?.backendUrl || '',
          proxyRules: config.frontend?.proxyRules || [],
          customNginxConfig: config.frontend?.customNginxConfig || '',
          nginxListenPort: config.frontend?.nginxListenPort || 80,
          portMappings,
        })
        setUseCustomNginx(!!config.frontend?.customNginxConfig)
      })
      .catch((err) => message.error((err as Error).message || '加载服务失败'))
  }, [id, form])

  const collectConfig = (): ServiceConfig => {
    const values = form.getFieldsValue()
    const config: ServiceConfig = {}

    if (serviceType === 'backend' || serviceType === 'fullstack') {
      const envVars: Record<string, string> = {}
      for (const item of values.envVars || []) {
        if (item.key) envVars[item.key] = item.value || ''
      }
      config.backend = {
        runtime: backendRuntime,
        baseImage: values.backendBaseImage || 'openjdk:17-jdk-slim',
        startupCommand: values.backendStartupCommand || 'java -jar /app/app.jar',
        envVars,
      }
      if (values.dataMountContainerPath) {
        config.backend.dataMount = {
          containerPath: values.dataMountContainerPath,
          hostDir: values.dataMountHostDir || './data',
        }
      }
    }

    if (serviceType === 'frontend' || serviceType === 'fullstack') {
      config.frontend = {
        runtime: frontendRuntime,
        baseImage: values.frontendBaseImage || 'nginx:alpine',
        backendUrl: values.frontendBackendUrl || '',
        proxyRules: values.proxyRules || [],
        customNginxConfig: useCustomNginx ? values.customNginxConfig || null : null,
        nginxListenPort: values.nginxListenPort || 80,
      }
    }

    return config
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      const config = collectConfig()
      const mappings = (values.portMappings || []).filter((m: { containerPort?: number }) => m.containerPort)
      if (mappings.length > 0 && !mappings.some((m: { primary?: boolean }) => m.primary)) {
        mappings[0].primary = true
      }
      const primaryMapping = mappings.find((m: { primary?: boolean }) => m.primary) || mappings[0]
      const data = {
        name: values.name,
        deployName: values.deployName,
        remark: values.remark || undefined,
        port: primaryMapping?.hostPort || 0,
        portMappings: JSON.stringify(mappings),
        serviceType: values.serviceType,
        serviceConfig: JSON.stringify(config),
        ...(projectId ? { projectId: Number(projectId) } : {}),
      }
      if (isEdit) {
        await updateService(Number(id), data)
        message.success('更新成功')
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
    const values = form.getFieldsValue()
    const config = collectConfig()
    const mappings = (values.portMappings || []).filter((m: { containerPort?: number }) => m.containerPort)
    setPreview(generatePreview(config, serviceType, mappings))
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
          <Form form={form} layout="vertical" initialValues={{ serviceType: 'backend', backendRuntime: 'java', backendBaseImage: 'openjdk:17-jdk-slim', backendStartupCommand: 'java -jar /app/app.jar', frontendRuntime: 'vue', frontendBaseImage: 'nginx:alpine', nginxListenPort: 80, portMappings: [{ hostPort: 8080, containerPort: 8080, label: 'HTTP', primary: true }] }}>
            {/* Basic info - 3 column grid */}
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="serviceType" label="服务类型" rules={[{ required: true }]}>
                  <Select
                    onChange={(val) => setServiceType(val)}
                    options={[
                      { value: 'backend', label: '纯后端' },
                      { value: 'frontend', label: '纯前端' },
                      { value: 'fullstack', label: '前后端一体' },
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="name" label="服务名称" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
              </Col>
              <Col span={8}>
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
                <Row gutter={16}>
                  <Col span={8}>
                    <Form.Item name="backendRuntime" label="运行时">
                      <Select
                        options={Object.entries(backendRuntimes).map(([k, v]) => ({ value: k, label: v.label }))}
                        onChange={(val: string) => {
                          setBackendRuntime(val)
                          const preset = backendRuntimes[val]
                          if (preset) {
                            form.setFieldsValue({
                              backendBaseImage: preset.baseImage,
                              backendStartupCommand: preset.startupCommand,
                            })
                          }
                        }}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={16}>
                    <Form.Item name="dataMountContainerPath" label="数据持久化（容器目录）" extra="留空则不挂载">
                      <Input placeholder="/app/data" />
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
                                <Input />
                              </Form.Item>
                            </Col>
                            <Col span={12}>
                              <Form.Item name="backendStartupCommand" label="启动命令">
                                <Input />
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
                        onChange={(val: string) => setFrontendRuntime(val)}
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
                            <Form.Item name="nginxListenPort" label="Nginx 监听端口">>
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
    </div>
  )
}
