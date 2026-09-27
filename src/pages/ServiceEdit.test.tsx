import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ServiceEdit from '@/pages/ServiceEdit'

const mocks = vi.hoisted(() => ({
  params: { projectId: '1' } as Record<string, string | undefined>,
  navigate: vi.fn(),
  createService: vi.fn(),
  updateService: vi.fn(),
  getService: vi.fn(),
  uploadJar: vi.fn(),
  uploadBinary: vi.fn(),
  uploadDist: vi.fn(),
  getNodeList: vi.fn(),
  getProjectNetworks: vi.fn(),
  getDefaultNetwork: vi.fn(),
  grantNetworkToProject: vi.fn(),
}))

vi.mock('react-router-dom', () => ({
  useParams: () => mocks.params,
  useNavigate: () => mocks.navigate,
}))

vi.mock('@/api/services', () => ({
  createService: mocks.createService,
  updateService: mocks.updateService,
  getService: mocks.getService,
  uploadJar: mocks.uploadJar,
  uploadBinary: mocks.uploadBinary,
  uploadDist: mocks.uploadDist,
}))

vi.mock('@/api/nodes', () => ({
  getNodeList: mocks.getNodeList,
}))

vi.mock('@/api/networks', () => ({
  getProjectNetworks: mocks.getProjectNetworks,
  getDefaultNetwork: mocks.getDefaultNetwork,
  grantNetworkToProject: mocks.grantNetworkToProject,
}))

// ServiceEdit 通过 UserContext 判断是否超管（决定是否显示网络新建/导入入口）
vi.mock('@/App', async () => {
  const { createContext } = await import('react')
  return {
    UserContext: createContext({ username: 'admin', superAdmin: true, projects: [] }),
  }
})

// @ant-design/icons 的 CJS 入口（lib/colorUtils.js）require 了 ESM 形式的
// @ant-design/colors/es/generate，Node 加载必然抛 "Cannot use import statement outside a module"。
// 该包与 F0 断言（表单值 → 保存 payload）无关，用图标桩替换。
vi.mock('@ant-design/icons', () => {
  const IconStub = () => null
  const names = [
    'MinusCircleOutlined',
    'PlusOutlined',
    'InboxOutlined',
    'CloseOutlined',
    'CloseCircleOutlined',
    'CloseCircleFilled',
    'CheckOutlined',
    'CheckCircleOutlined',
    'CheckCircleFilled',
    'ExclamationCircleOutlined',
    'ExclamationCircleFilled',
    'InfoCircleOutlined',
    'InfoCircleFilled',
    'QuestionCircleOutlined',
    'WarningOutlined',
    'LoadingOutlined',
    'SearchOutlined',
    'EyeOutlined',
    'EyeInvisibleOutlined',
    'UpOutlined',
    'DownOutlined',
    'LeftOutlined',
    'RightOutlined',
    'CalendarOutlined',
    'ClockCircleOutlined',
    'DeleteOutlined',
    'EditOutlined',
    'ReloadOutlined',
    'DownloadOutlined',
    'UploadOutlined',
    'FileOutlined',
    'SettingOutlined',
    'SyncOutlined',
    'CopyOutlined',
  ]
  const stubModule: Record<string, unknown> = { __esModule: true, default: IconStub }
  for (const name of names) stubModule[name] = IconStub
  return stubModule
})

const GO_IMAGE = 'golang:1.26.3-alpine'
const GO_COMMAND = '/app/app'
const JAVA_IMAGE = 'openjdk:17-jdk-slim'
const JAVA_COMMAND = 'java -jar /app/app.jar'
const LEGACY_HINT = /该服务运行时为 Go/

type User = ReturnType<typeof userEvent.setup>
type SavePayload = {
  serviceConfig: string
  serviceType: string
  name: string
  nodeId?: string
  networkId?: number
}
type BackendConfig = {
  runtime?: string
  baseImage?: string
  startupCommand?: string
  envVars?: Record<string, string>
}
type SavedConfig = { backend?: BackendConfig }

const SERVICE_ID = 9

function makeService(
  serviceConfig: object,
  serviceType = 'backend',
  networkId: number | null = null,
) {
  return {
    id: SERVICE_ID,
    name: 'order-service',
    deployName: 'order-service',
    remark: '',
    projectId: 1,
    nodeId: '',
    networkId,
    volumeDir: '/data/order-service',
    serviceType,
    serviceConfig: JSON.stringify(serviceConfig),
    portMappings: JSON.stringify([{ hostPort: 8080, containerPort: 8080, primary: true }]),
    status: 'running',
    createTime: '2026-01-01 00:00:00',
    updateTime: '2026-01-01 00:00:00',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.params = { projectId: '1' }
  mocks.createService.mockResolvedValue({ code: 200, msg: 'ok', data: null })
  mocks.updateService.mockResolvedValue({ code: 200, msg: 'ok', data: null })
  mocks.uploadBinary.mockResolvedValue({ code: 200, msg: 'ok', data: null })
  mocks.uploadJar.mockResolvedValue({ code: 200, msg: 'ok', data: null })
  mocks.getNodeList.mockResolvedValue({ code: 200, msg: 'ok', data: [] })
  mocks.getProjectNetworks.mockResolvedValue({ code: 200, msg: 'ok', data: [] })
  mocks.getDefaultNetwork.mockResolvedValue({ code: 200, msg: 'ok', data: { networkId: null } })
  mocks.grantNetworkToProject.mockResolvedValue({ code: 200, msg: 'ok', data: null })
})

async function renderForm() {
  const user = userEvent.setup({ delay: null })
  render(<ServiceEdit />)
  await waitFor(() => expect(mocks.getNodeList).toHaveBeenCalled())
  return user
}

async function renderEditForm(
  serviceConfig: object,
  serviceType = 'backend',
  networkId: number | null = null,
) {
  mocks.params = { projectId: '1', id: String(SERVICE_ID) }
  mocks.getService.mockResolvedValue({
    code: 200,
    msg: 'ok',
    data: makeService(serviceConfig, serviceType, networkId),
  })
  const user = userEvent.setup({ delay: null })
  render(<ServiceEdit />)
  // 等待编辑回显完成（name 与 deployName 同值，不能用 findByDisplayValue）
  await waitFor(() => {
    expect((screen.getByLabelText('服务名称') as HTMLInputElement).value).toBe('order-service')
  })
  return user
}

async function fillRequiredFields(user: User, name = 'order-service') {
  await user.type(screen.getByLabelText('服务名称'), name)
  await user.type(screen.getByLabelText('部署名称'), name)
}

async function selectRuntime(optionText: string) {
  fireEvent.mouseDown(screen.getByLabelText('运行时'))
  const option = await screen.findByTitle(optionText)
  fireEvent.click(option)
}

async function expandAdvanced(user: User) {
  await user.click(screen.getByText('高级选项'))
  await screen.findByLabelText('基础镜像')
}

async function clickSave(user: User) {
  // antd 会在两字中文按钮的字符间插入空格，accessible name 为 "保 存"
  await user.click(screen.getByRole('button', { name: /保\s*存/ }))
}

async function uploadBinaryFile() {
  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
  fireEvent.change(fileInput, { target: { files: [new File(['binary'], 'app')] } })
  await waitFor(() => expect(mocks.uploadBinary).toHaveBeenCalledTimes(1))
}

function configFromCreate(): SavedConfig {
  const payload = mocks.createService.mock.calls[0][0] as SavePayload
  return JSON.parse(payload.serviceConfig)
}

function configFromUpdate(): SavedConfig {
  // updateService(id, data)
  const payload = mocks.updateService.mock.calls[0][1] as SavePayload
  return JSON.parse(payload.serviceConfig)
}

describe('ServiceEdit Go 配置保存（F0）', () => {
  it('高级选项未展开时选择 Go：保存写入 Go 预设镜像与启动命令', async () => {
    const user = await renderForm()
    await fillRequiredFields(user)
    await selectRuntime('Go')

    await clickSave(user)

    await waitFor(() => expect(mocks.createService).toHaveBeenCalledTimes(1))
    expect(configFromCreate().backend).toMatchObject({
      runtime: 'go',
      baseImage: GO_IMAGE,
      startupCommand: GO_COMMAND,
    })
  })

  it('高级选项已展开后选择 Go：保存结果与未展开时一致', async () => {
    const user = await renderForm()
    await fillRequiredFields(user)
    await expandAdvanced(user)
    await selectRuntime('Go')

    await clickSave(user)

    await waitFor(() => expect(mocks.createService).toHaveBeenCalledTimes(1))
    expect(configFromCreate().backend).toMatchObject({
      runtime: 'go',
      baseImage: GO_IMAGE,
      startupCommand: GO_COMMAND,
    })
  })

  it('Java 默认路径不回归：不做任何运行时操作时保存为 Java 预设', async () => {
    const user = await renderForm()
    await fillRequiredFields(user)

    await clickSave(user)

    await waitFor(() => expect(mocks.createService).toHaveBeenCalledTimes(1))
    expect(configFromCreate().backend).toMatchObject({
      runtime: 'java',
      baseImage: JAVA_IMAGE,
      startupCommand: JAVA_COMMAND,
    })
  })

  it('Go 切回 Java：保存使用 Java 预设', async () => {
    const user = await renderForm()
    await fillRequiredFields(user)
    await selectRuntime('Go')
    await selectRuntime('Java')

    await clickSave(user)

    await waitFor(() => expect(mocks.createService).toHaveBeenCalledTimes(1))
    expect(configFromCreate().backend).toMatchObject({
      runtime: 'java',
      baseImage: JAVA_IMAGE,
      startupCommand: JAVA_COMMAND,
    })
  })

  it('选择 Go 后只改其他字段：运行时与镜像命令保持 Go', async () => {
    const user = await renderForm()
    await fillRequiredFields(user)
    await selectRuntime('Go')
    await user.type(screen.getByLabelText('备注'), 'note')

    await clickSave(user)

    await waitFor(() => expect(mocks.createService).toHaveBeenCalledTimes(1))
    expect(configFromCreate().backend).toMatchObject({
      runtime: 'go',
      baseImage: GO_IMAGE,
      startupCommand: GO_COMMAND,
    })
  })

  it('高级选项内自定义镜像与启动命令：自定义值被保留', async () => {
    const user = await renderForm()
    await fillRequiredFields(user)
    await expandAdvanced(user)
    await selectRuntime('Go')
    const imageInput = screen.getByLabelText('基础镜像')
    await user.clear(imageInput)
    await user.type(imageInput, 'custom/go:1.0')
    const commandInput = screen.getByLabelText('启动命令')
    await user.clear(commandInput)
    await user.type(commandInput, '/opt/run')

    await clickSave(user)

    await waitFor(() => expect(mocks.createService).toHaveBeenCalledTimes(1))
    expect(configFromCreate().backend).toMatchObject({
      runtime: 'go',
      baseImage: 'custom/go:1.0',
      startupCommand: '/opt/run',
    })
  })

  it('上传二进制后保存：配置与上传前一致（仍为 Go 预设）', async () => {
    const user = await renderEditForm({
      backend: { runtime: 'go', baseImage: GO_IMAGE, startupCommand: GO_COMMAND, envVars: {} },
    })
    await uploadBinaryFile()

    await clickSave(user)

    await waitFor(() => expect(mocks.updateService).toHaveBeenCalledTimes(1))
    expect(configFromUpdate().backend).toMatchObject({
      runtime: 'go',
      baseImage: GO_IMAGE,
      startupCommand: GO_COMMAND,
    })
  })

  it('编辑已有 Go 服务：重开表单回显与保存请求一致', async () => {
    const user = await renderEditForm({
      backend: { runtime: 'go', baseImage: GO_IMAGE, startupCommand: GO_COMMAND, envVars: {} },
    })

    // 正常 Go 服务不出现历史缺陷提示
    expect(screen.queryByText(LEGACY_HINT)).toBeNull()

    await clickSave(user)

    await waitFor(() => expect(mocks.updateService).toHaveBeenCalledTimes(1))
    const payload = mocks.updateService.mock.calls[0][1] as SavePayload
    expect(payload.serviceType).toBe('backend')
    expect(configFromUpdate().backend).toMatchObject({
      runtime: 'go',
      baseImage: GO_IMAGE,
      startupCommand: GO_COMMAND,
    })
  })

  it('历史 Go + Java 默认组合：显示提示，恢复 Go 默认后保存为 Go 预设', async () => {
    const user = await renderEditForm({
      backend: { runtime: 'go', baseImage: JAVA_IMAGE, startupCommand: JAVA_COMMAND, envVars: {} },
    })

    // 提示出现，且此时尚未静默改动数据
    expect(await screen.findByText(LEGACY_HINT)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '恢复 Go 默认' }))

    await clickSave(user)

    await waitFor(() => expect(mocks.updateService).toHaveBeenCalledTimes(1))
    expect(configFromUpdate().backend).toMatchObject({
      runtime: 'go',
      baseImage: GO_IMAGE,
      startupCommand: GO_COMMAND,
    })
  })
})

const NETWORK_A = {
  id: 7,
  name: 'net-a',
  displayName: '网络A',
  source: 'MANAGED',
  dockerStatus: 'PRESENT',
}
const NETWORK_B = {
  id: 8,
  name: 'net-b',
  displayName: '网络B',
  source: 'MANAGED',
  dockerStatus: 'PRESENT',
}

async function selectNetwork(optionTitle: string) {
  fireEvent.mouseDown(screen.getByLabelText('共享网络'))
  const option = await screen.findByTitle(optionTitle)
  fireEvent.click(option)
}

async function selectTargetNode(optionTitle: string) {
  fireEvent.mouseDown(screen.getByLabelText('目标节点'))
  const option = await screen.findByTitle(optionTitle)
  fireEvent.click(option)
}

describe('服务共享网络选择（F3）', () => {
  it('新建服务：预选项目默认网络并随保存提交', async () => {
    mocks.getProjectNetworks.mockResolvedValue({
      code: 200,
      msg: 'ok',
      data: [NETWORK_A, NETWORK_B],
    })
    mocks.getDefaultNetwork.mockResolvedValue({ code: 200, msg: 'ok', data: { networkId: 8 } })
    const user = await renderForm()
    await fillRequiredFields(user)
    // 等待项目默认网络预选完成
    await screen.findByTitle('网络B（net-b）')

    await clickSave(user)

    await waitFor(() => expect(mocks.createService).toHaveBeenCalledTimes(1))
    expect((mocks.createService.mock.calls[0][0] as SavePayload).networkId).toBe(8)
  })

  it('新建服务：手动选择本项目已授权网络后保存', async () => {
    mocks.getProjectNetworks.mockResolvedValue({
      code: 200,
      msg: 'ok',
      data: [NETWORK_A, NETWORK_B],
    })
    const user = await renderForm()
    await fillRequiredFields(user)

    await selectNetwork('网络A（net-a）')
    await clickSave(user)

    await waitFor(() => expect(mocks.createService).toHaveBeenCalledTimes(1))
    expect((mocks.createService.mock.calls[0][0] as SavePayload).networkId).toBe(7)
  })

  it('节点联动：切到自动调度后清空并禁用共享网络', async () => {
    mocks.getProjectNetworks.mockResolvedValue({ code: 200, msg: 'ok', data: [NETWORK_A] })
    const user = await renderForm()
    await fillRequiredFields(user)
    await selectNetwork('网络A（net-a）')

    await selectTargetNode('自动调度 (auto)')

    await waitFor(() => {
      expect((screen.getByLabelText('共享网络') as HTMLInputElement).disabled).toBe(true)
    })

    await clickSave(user)
    await waitFor(() => expect(mocks.createService).toHaveBeenCalledTimes(1))
    expect((mocks.createService.mock.calls[0][0] as SavePayload).networkId).toBeUndefined()
  })

  it('编辑服务：回填已保存的网络，不被项目默认值覆盖', async () => {
    mocks.getProjectNetworks.mockResolvedValue({
      code: 200,
      msg: 'ok',
      data: [NETWORK_A, NETWORK_B],
    })
    mocks.getDefaultNetwork.mockResolvedValue({ code: 200, msg: 'ok', data: { networkId: 8 } })
    const user = await renderEditForm(
      {
        backend: {
          runtime: 'java',
          baseImage: JAVA_IMAGE,
          startupCommand: JAVA_COMMAND,
          envVars: {},
        },
      },
      'backend',
      7,
    )

    await clickSave(user)

    await waitFor(() => expect(mocks.updateService).toHaveBeenCalledTimes(1))
    expect((mocks.updateService.mock.calls[0][1] as SavePayload).networkId).toBe(7)
  })

  it('编辑服务：网络变更保存后提示需重新部署生效', async () => {
    mocks.getProjectNetworks.mockResolvedValue({
      code: 200,
      msg: 'ok',
      data: [NETWORK_A, NETWORK_B],
    })
    const user = await renderEditForm(
      {
        backend: {
          runtime: 'java',
          baseImage: JAVA_IMAGE,
          startupCommand: JAVA_COMMAND,
          envVars: {},
        },
      },
      'backend',
      7,
    )

    await selectNetwork('网络B（net-b）')
    await clickSave(user)

    await waitFor(() => expect(mocks.updateService).toHaveBeenCalledTimes(1))
    expect((mocks.updateService.mock.calls[0][1] as SavePayload).networkId).toBe(8)
    expect(await screen.findByText(/共享网络变更需重新部署服务后生效/)).toBeTruthy()
  })
})
