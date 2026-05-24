import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Button,
  Card,
  Collapse,
  Divider,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Space,
  Typography,
  Upload,
} from 'antd'
import { MinusCircleOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons'
import {
  createService,
  getService,
  updateService,
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
    baseImage: string
    containerPort: number
    startupCommand: string
    envVars: Record<string, string>
    dataMount?: { containerPath: string; hostDir: string }
  }
  frontend?: {
    baseImage: string
    backendUrl: string
    proxyRules: ProxyRule[]
    customNginxConfig: string | null
  }
}

const defaultProxyDirectives = (path: string, target: string): ProxyDirective[] => [
  { name: 'proxy_pass', value: target + path },
  { name: 'proxy_set_header', value: 'Host $http_host' },
  { name: 'proxy_set_header', value: 'X-Real-IP $remote_addr' },
  { name: 'proxy_set_header', value: 'X-Forwarded-For $proxy_add_x_forwarded_for' },
  { name: 'proxy_set_header', value: 'X-Forwarded-Proto $scheme' },
]

function generateNginxConf(proxyRules: ProxyRule[]): string {
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
    listen 80;
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

function generatePreview(config: ServiceConfig, type: string, port: number) {
  let dockerfile = ''
  let nginx = ''
  let compose = 'services:\n'

  if ((type === 'backend' || type === 'fullstack') && config.backend) {
    const b = config.backend
    dockerfile = `FROM ${b.baseImage}\nWORKDIR /app\nCOPY app.jar /app/app.jar\nEXPOSE ${b.containerPort}`
    for (const [k, v] of Object.entries(b.envVars || {})) {
      dockerfile += `\nENV ${k}=${v}`
    }
    const cmdParts = b.startupCommand.split(/\s+/)
    dockerfile += `\nENTRYPOINT [${cmdParts.map((p) => `"${p}"`).join(', ')}]`
  }

  if ((type === 'frontend' || type === 'fullstack') && config.frontend) {
    nginx = generateNginxConf(config.frontend.proxyRules || [])
  }

  if (type === 'backend' && config.backend) {
    compose += `  backend:\n    build: .\n    ports:\n      - "${port}:${config.backend.containerPort}"\n`
    if (config.backend.dataMount) {
      compose += `    volumes:\n      - ${config.backend.dataMount.hostDir}:${config.backend.dataMount.containerPath}\n`
    }
    compose += `    restart: unless-stopped\n`
  } else if (type === 'frontend' && config.frontend) {
    compose += `  frontend:\n    image: ${config.frontend.baseImage}\n    ports:\n      - "${port}:80"\n    volumes:\n      - ./dist:/usr/share/nginx/html\n      - ./default.conf:/etc/nginx/conf.d/default.conf\n    restart: unless-stopped\n`
  } else if (type === 'fullstack' && config.backend && config.frontend) {
    compose += `  backend:\n    build: .\n    expose:\n      - "${config.backend.containerPort}"\n`
    if (config.backend.dataMount) {
      compose += `    volumes:\n      - ${config.backend.dataMount.hostDir}:${config.backend.dataMount.containerPath}\n`
    }
    compose += `    restart: unless-stopped\n`
    compose += `  frontend:\n    image: ${config.frontend.baseImage}\n    ports:\n      - "${port}:80"\n    volumes:\n      - ./dist:/usr/share/nginx/html\n      - ./default.conf:/etc/nginx/conf.d/default.conf\n    depends_on:\n      - backend\n    restart: unless-stopped\n`
  }

  return { dockerfile, nginx, compose }
}

export default function ServiceEdit() {
  const { id, projectId } = useParams()
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [serviceType, setServiceType] = useState<string>('backend')
  const [saving, setSaving] = useState(false)
  const [previewVisible, setPreviewVisible] = useState(false)
  const [preview, setPreview] = useState({ dockerfile: '', nginx: '', compose: '' })
  const [useCustomNginx, setUseCustomNginx] = useState(false)
  const [loadedProjectId, setLoadedProjectId] = useState<number | null>(null)

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

        form.setFieldsValue({
          name: svc.name,
          port: svc.port,
          serviceType: svc.serviceType,
          backendBaseImage: config.backend?.baseImage || 'openjdk:17-jdk-slim',
          backendContainerPort: config.backend?.containerPort || 8090,
          backendStartupCommand: config.backend?.startupCommand || 'java -jar /app/app.jar',
          envVars,
          dataMountContainerPath: config.backend?.dataMount?.containerPath || '',
          dataMountHostDir: config.backend?.dataMount?.hostDir || './data',
          frontendBaseImage: config.frontend?.baseImage || 'nginx:alpine',
          frontendBackendUrl: config.frontend?.backendUrl || '',
          proxyRules: config.frontend?.proxyRules || [],
          customNginxConfig: config.frontend?.customNginxConfig || '',
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
        baseImage: values.backendBaseImage || 'openjdk:17-jdk-slim',
        containerPort: values.backendContainerPort || 8090,
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
        baseImage: values.frontendBaseImage || 'nginx:alpine',
        backendUrl: values.frontendBackendUrl || '',
        proxyRules: values.proxyRules || [],
        customNginxConfig: useCustomNginx ? values.customNginxConfig || null : null,
      }
    }

    return config
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      const config = collectConfig()
      const data = {
        name: values.name,
        port: values.port,
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
    const port = values.port || 8080
    setPreview(generatePreview(config, serviceType, port))
    setPreviewVisible(true)
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

  return (
    <div>
      <Title level={4}>{isEdit ? '编辑服务' : '创建服务'}</Title>

      <Form form={form} layout="vertical" initialValues={{ serviceType: 'backend' }} style={{ marginTop: 24 }}>
        {/* Basic info */}
        <Space style={{ display: 'flex', gap: 16, marginBottom: 0 }} align="start">
          <Form.Item name="serviceType" label="服务类型" rules={[{ required: true }]} style={{ width: 200 }}>
            <Select
              onChange={(val) => setServiceType(val)}
              options={[
                { value: 'backend', label: '纯后端' },
                { value: 'frontend', label: '纯前端' },
                { value: 'fullstack', label: '前后端一体' },
              ]}
            />
          </Form.Item>
          <Form.Item name="name" label="服务名称" rules={[{ required: true }]} style={{ flex: 1, minWidth: 200 }}>
            <Input />
          </Form.Item>
          <Form.Item name="port" label="暴露端口" rules={[{ required: true }]} style={{ width: 160 }}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
        </Space>

        {/* Backend config */}
        {showBackend && (
          <Card title="后端配置" size="small" style={{ marginBottom: 16 }}>
            <Space style={{ display: 'flex', gap: 16 }} align="start" wrap>
              <Form.Item name="backendBaseImage" label="基础镜像" initialValue="openjdk:17-jdk-slim" style={{ width: 240 }}>
                <Input />
              </Form.Item>
              <Form.Item name="backendContainerPort" label="容器端口" initialValue={8090} style={{ width: 140 }}>
                <InputNumber style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="backendStartupCommand" label="启动命令" initialValue="java -jar /app/app.jar" style={{ flex: 1, minWidth: 280 }}>
                <Input />
              </Form.Item>
            </Space>

            <Divider style={{ margin: '12px 0' }} />

            <Text strong>环境变量</Text>
            <Form.List name="envVars">
              {(fields, { add, remove }) => (
                <div style={{ marginTop: 8, marginBottom: 16 }}>
                  {fields.map((field) => (
                    <Space key={field.key} align="baseline" style={{ display: 'flex', marginBottom: 4 }}>
                      <Form.Item name={[field.name, 'key']} noStyle>
                        <Input placeholder="KEY" style={{ width: 200 }} />
                      </Form.Item>
                      <span>=</span>
                      <Form.Item name={[field.name, 'value']} noStyle>
                        <Input placeholder="VALUE" style={{ width: 200 }} />
                      </Form.Item>
                      <MinusCircleOutlined onClick={() => remove(field.name)} />
                    </Space>
                  ))}
                  <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />} size="small">
                    添加环境变量
                  </Button>
                </div>
              )}
            </Form.List>

            <Divider style={{ margin: '12px 0' }} />

            <Text strong>数据持久化</Text>
            <Space style={{ display: 'flex', gap: 16, marginTop: 8 }} align="start" wrap>
              <Form.Item name="dataMountContainerPath" extra="留空则不挂载" style={{ flex: 1, minWidth: 200 }}>
                <Input placeholder="容器内数据目录，如 /app/data" />
              </Form.Item>
              <Form.Item name="dataMountHostDir" initialValue="./data" extra="相对于服务部署目录" style={{ flex: 1, minWidth: 200 }}>
                <Input placeholder="宿主机目录（默认 ./data）" />
              </Form.Item>
            </Space>
          </Card>
        )}

        {/* Frontend config */}
        {showFrontend && (
          <Card title="前端配置" size="small" style={{ marginBottom: 16 }}>
            <Space style={{ display: 'flex', gap: 16 }} align="start" wrap>
              <Form.Item name="frontendBaseImage" label="基础镜像" initialValue="nginx:alpine" style={{ width: 240 }}>
                <Input />
              </Form.Item>
              {serviceType === 'frontend' && (
                <Form.Item
                  name="frontendBackendUrl"
                  label="后端地址"
                  extra="仅纯前端模式需要，一体模式自动使用 Docker 内部通信"
                  style={{ flex: 1, minWidth: 280 }}
                >
                  <Input placeholder="http://121.40.154.188:8090" />
                </Form.Item>
              )}
            </Space>

            <Divider style={{ margin: '12px 0' }} />

            <Text strong>代理规则</Text>
            <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 8 }}>
              配置 Nginx 反向代理路径，如 /api/、/api/sse/ 等
            </Text>
            <Form.List name="proxyRules">
              {(rules, { add: addRule, remove: removeRule }) => (
                <div style={{ marginBottom: 16 }}>
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
                      const backendTarget =
                        serviceType === 'fullstack'
                          ? `http://backend:${form.getFieldValue('backendContainerPort') || 8080}`
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

            <Divider style={{ margin: '12px 0' }} />

            <Collapse
              ghost
              items={[
                {
                  key: 'nginx',
                  label: '高级：自定义 Nginx 配置',
                  children: (
                    <div>
                      <label style={{ display: 'block', marginBottom: 8 }}>
                        <input
                          type="checkbox"
                          checked={useCustomNginx}
                          onChange={(e) => setUseCustomNginx(e.target.checked)}
                          style={{ marginRight: 8 }}
                        />
                        使用自定义配置
                      </label>
                      {useCustomNginx && (
                        <Form.Item name="customNginxConfig" noStyle>
                          <TextArea
                            rows={10}
                            style={{ fontFamily: 'monospace', fontSize: 13 }}
                            placeholder="输入自定义 Nginx 配置..."
                          />
                        </Form.Item>
                      )}
                    </div>
                  ),
                },
              ]}
            />
          </Card>
        )}

        {/* Actions */}
        <Space>
          <Button type="primary" onClick={handleSave} loading={saving}>
            保存
          </Button>
          <Button onClick={handlePreview}>预览配置</Button>
          <Button onClick={() => currentProjectId ? navigate(`/projects/${currentProjectId}/services`) : navigate('/projects')}>取消</Button>
        </Space>
      </Form>

      {/* Upload section (edit mode) */}
      {isEdit && (
        <>
          <Divider />
          <Title level={5}>上传产物</Title>
          <Space size="large" wrap>
            {showBackend && (
              <div>
                <Text>上传 JAR 文件</Text>
                <div style={{ marginTop: 8 }}>
                  <Upload
                    beforeUpload={(file) => { handleUploadJar(file); return false }}
                    showUploadList={false}
                    accept=".jar"
                  >
                    <Button icon={<UploadOutlined />}>选择 JAR 文件</Button>
                  </Upload>
                </div>
              </div>
            )}
            {showFrontend && (
              <div>
                <Text>上传前端 dist (zip)</Text>
                <div style={{ marginTop: 8 }}>
                  <Upload
                    beforeUpload={(file) => { handleUploadDist(file); return false }}
                    showUploadList={false}
                    accept=".zip"
                  >
                    <Button icon={<UploadOutlined />}>选择 ZIP 文件</Button>
                  </Upload>
                </div>
              </div>
            )}
          </Space>
        </>
      )}

      {/* Preview modal */}
      <Modal
        title="部署配置预览"
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        footer={null}
        width={800}
      >
        {preview.dockerfile && (
          <div style={{ marginBottom: 16 }}>
            <Text strong>Dockerfile</Text>
            <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: 12, borderRadius: 4, marginTop: 4 }}>
              {preview.dockerfile}
            </pre>
          </div>
        )}
        {preview.nginx && (
          <div style={{ marginBottom: 16 }}>
            <Text strong>default.conf</Text>
            <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: 12, borderRadius: 4, marginTop: 4 }}>
              {preview.nginx}
            </pre>
          </div>
        )}
        <Text strong>docker-compose.yml</Text>
        <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: 12, borderRadius: 4, marginTop: 4 }}>
          {preview.compose}
        </pre>
      </Modal>
    </div>
  )
}
