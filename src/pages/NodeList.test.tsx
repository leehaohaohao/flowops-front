import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NodeList from '@/pages/NodeList'
import { UserContext } from '@/App'
import type { UserInfo } from '@/types'

const { iconNames, mocks } = vi.hoisted(() => ({
  iconNames: [
    'PlusOutlined',
    'ReloadOutlined',
    'DownOutlined',
    'CloseOutlined',
    'CheckOutlined',
    'CheckCircleOutlined',
    'CheckCircleFilled',
    'CloseCircleFilled',
    'ExclamationCircleFilled',
    'InfoCircleFilled',
    'LoadingOutlined',
    'SearchOutlined',
    'MinusCircleOutlined',
    'UploadOutlined',
  ],
  mocks: {
    getNodeList: vi.fn(),
    getRegistry: vi.fn(),
    createRegistry: vi.fn(),
    updateRegistry: vi.fn(),
    deleteRegistry: vi.fn(),
    getNodeSsh: vi.fn(),
    saveNodeSsh: vi.fn(),
    testNodeSsh: vi.fn(),
    uploadRunnerPackage: vi.fn(),
    getRunnerPackages: vi.fn(),
    distributeRunnerPackage: vi.fn(),
    getNodePackageDistributions: vi.fn(),
    getPackageDistribution: vi.fn(),
  },
}))

// @ant-design/icons 的 CJS 入口在 Node 下无法加载（见 ServiceEdit.test.tsx 说明）
vi.mock('@ant-design/icons', () => {
  const IconStub = () => null
  const stubModule: Record<string, unknown> = { __esModule: true, default: IconStub }
  for (const name of iconNames) stubModule[name] = IconStub
  return stubModule
})

vi.mock('@/App', async () => {
  const { createContext } = await import('react')
  return { UserContext: createContext(null) }
})

vi.mock('@/api/nodes', () => ({
  getNodeList: mocks.getNodeList,
  getRegistry: mocks.getRegistry,
  createRegistry: mocks.createRegistry,
  updateRegistry: mocks.updateRegistry,
  deleteRegistry: mocks.deleteRegistry,
  getNodeSsh: mocks.getNodeSsh,
  saveNodeSsh: mocks.saveNodeSsh,
  testNodeSsh: mocks.testNodeSsh,
  uploadRunnerPackage: mocks.uploadRunnerPackage,
  getRunnerPackages: mocks.getRunnerPackages,
  getRunnerPackage: vi.fn(),
  distributeRunnerPackage: mocks.distributeRunnerPackage,
  getNodePackageDistributions: mocks.getNodePackageDistributions,
  getPackageDistribution: mocks.getPackageDistribution,
}))

const adminUser = { username: 'admin', superAdmin: true, projects: [] } as UserInfo
const normalUser = {
  username: 'member',
  superAdmin: false,
  projects: [],
  projectPermissions: {},
} as UserInfo

const registeredNodes = [
  {
    runnerId: 'runner-1',
    nodeName: '生产节点1',
    status: 'online',
    lastHeartbeat: '2026-09-27 10:00:00',
    createTime: '2026-09-01 09:00:00',
    hasToken: true,
  },
]

const FINGERPRINT = 'SHA256:uL53VNB2cODbKzRjnoENplYrqjNzX1TqxuVCoAZpOb8'

const sshTarget = {
  runnerId: 'runner-1',
  host: '10.0.0.5',
  port: 22,
  username: 'root',
  keyAlias: 'runner-1',
  hostKeySha256: FINGERPRINT,
  hostKeyAlgorithm: 'ED25519',
  keyFileExists: true,
  lastTest: null,
  updateTime: '2026-09-27 16:00:00',
}

type User = ReturnType<typeof userEvent.setup>

const PACKAGE_SHA = 'a'.repeat(64)

const runnerPackage = {
  sha256: PACKAGE_SHA,
  fileName: 'flowops-executor-0.7.0-linux-amd64.tar.gz',
  version: '0.7.0',
  os: 'linux',
  arch: 'amd64',
  sizeBytes: 268435456,
  gitCommit: '4786ea0020f471c6ddf53ebef098490ad7f641b6',
  imageReference: 'flowops-executor:0.7.0',
  imageId: 'sha256:9f2c1e0b',
  dockerCliVersion: '27.3.1',
  composeVersion: 'v2.29.7',
  formatVersion: 1,
  uploadedBy: 'admin',
  uploadedAt: '2026-09-28T10:12:33',
}

const distributionRecord = {
  id: 5,
  runnerId: 'runner-1',
  packageSha256: PACKAGE_SHA,
  version: '0.7.0',
  fileName: runnerPackage.fileName,
  sizeBytes: runnerPackage.sizeBytes,
  status: 'PENDING',
  alreadyPresent: false,
  errorCode: null as string | null,
  errorMessage: null as string | null,
  remotePath: null as string | null,
  sshConfigVersion: 3,
  operator: 'admin',
  startedAt: '2026-09-28T10:20:00',
  finishedAt: null as string | null,
  durationMs: null as number | null,
}

/** SSH 已配置、算法已补齐且最近一次测试通过（满足分发前置） */
const connectedSshTarget = {
  ...sshTarget,
  lastTest: {
    resultCode: 'CONNECTED',
    message: '连接成功',
    testedAt: '2026-09-28T10:00:00',
    durationMs: 800,
  },
}

function renderPage(user: UserInfo) {
  const eventUser = userEvent.setup({ delay: null })
  render(
    <UserContext.Provider value={user}>
      <NodeList />
    </UserContext.Provider>,
  )
  return eventUser
}

async function openSshDrawer(user: User) {
  await user.click(await screen.findByRole('tab', { name: '节点登记' }))
  await screen.findByText('runner-1')
  await user.click(screen.getByRole('button', { name: 'SSH 设置' }))
  await screen.findByText('SSH 设置：runner-1')
}

async function openPackageTab(user: User) {
  await user.click(await screen.findByRole('tab', { name: '发布包' }))
  await screen.findByRole('button', { name: /上传发布包/ })
}

async function openPackageDrawer(user: User) {
  await user.click(await screen.findByRole('tab', { name: '节点登记' }))
  await screen.findByText('runner-1')
  await user.click(screen.getByRole('button', { name: '分发包' }))
  await screen.findByText('分发包：runner-1')
}

async function uploadFile(file: File) {
  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
  fireEvent.change(fileInput, { target: { files: [file] } })
}

async function selectAlgorithm(label: string) {
  fireEvent.mouseDown(screen.getByLabelText('主机密钥算法'))
  const option = await screen.findByTitle(label)
  fireEvent.click(option)
}

async function fillSshForm(user: User) {
  await user.type(await screen.findByLabelText('宿主机地址'), '10.0.0.5')
  await user.type(screen.getByLabelText('SSH 用户名'), 'root')
  await user.type(screen.getByLabelText('私钥别名'), 'runner-1')
  await selectAlgorithm('ED25519')
  await user.type(screen.getByLabelText('主机密钥指纹'), FINGERPRINT)
}

beforeEach(() => {
  vi.clearAllMocks()
  // 在线节点每 30s 轮询会在用例结束后仍调度渲染，测试内禁用（轮询不是 S3 验收点）
  vi.spyOn(globalThis, 'setInterval').mockReturnValue(
    0 as unknown as ReturnType<typeof setInterval>,
  )
  mocks.getNodeList.mockResolvedValue({ code: 200, msg: 'ok', data: [] })
  mocks.getRegistry.mockResolvedValue({ code: 200, msg: 'ok', data: registeredNodes })
  mocks.getNodeSsh.mockResolvedValue({ code: 200, msg: 'ok', data: null })
  mocks.saveNodeSsh.mockResolvedValue({ code: 200, msg: 'SSH 设置已保存', data: sshTarget })
  mocks.getRunnerPackages.mockResolvedValue({ code: 200, msg: 'ok', data: [runnerPackage] })
  mocks.getNodePackageDistributions.mockResolvedValue({ code: 200, msg: 'ok', data: [] })
  mocks.getPackageDistribution.mockResolvedValue({
    code: 200,
    msg: 'ok',
    data: distributionRecord,
  })
  mocks.distributeRunnerPackage.mockResolvedValue({
    code: 200,
    msg: '分发已开始',
    data: distributionRecord,
  })
  mocks.uploadRunnerPackage.mockResolvedValue({
    code: 200,
    msg: '发布包已上传',
    data: runnerPackage,
  })
  mocks.testNodeSsh.mockResolvedValue({
    code: 200,
    msg: 'ok',
    data: { resultCode: 'CONNECTED', message: '连接成功', testedAt: '2026-09-27T16:30:00', durationMs: 812 },
  })
})

describe('节点 SSH 设置与测试连接（S3）', () => {
  it('超级管理员：节点登记每行有 SSH 设置入口，打开后回显已保存设置', async () => {
    mocks.getNodeSsh.mockResolvedValue({ code: 200, msg: 'ok', data: sshTarget })
    const user = renderPage(adminUser)

    await openSshDrawer(user)

    expect(mocks.getNodeSsh).toHaveBeenCalledWith('runner-1')
    await waitFor(() => {
      expect((screen.getByLabelText('宿主机地址') as HTMLInputElement).value).toBe('10.0.0.5')
    })
    expect((screen.getByLabelText('SSH 用户名') as HTMLInputElement).value).toBe('root')
    expect((screen.getByLabelText('私钥别名') as HTMLInputElement).value).toBe('runner-1')
    expect((screen.getByLabelText('主机密钥指纹') as HTMLInputElement).value).toBe(FINGERPRINT)
    // 算法回显（H1.4）
    expect(await screen.findByTitle('ED25519')).toBeTruthy()
  })

  it('非超级管理员：看不到节点登记页签与 SSH 入口，也不请求相关接口', async () => {
    renderPage(normalUser)

    await screen.findByText('节点管理')
    expect(screen.queryByRole('tab', { name: '节点登记' })).toBeNull()
    expect(screen.queryByRole('tab', { name: '发布包' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'SSH 设置' })).toBeNull()
    expect(screen.queryByRole('button', { name: '分发包' })).toBeNull()
    expect(mocks.getRegistry).not.toHaveBeenCalled()
    expect(mocks.getNodeSsh).not.toHaveBeenCalled()
    expect(mocks.getRunnerPackages).not.toHaveBeenCalled()
  })

  it('表单校验：非法宿主机地址与非法私钥别名都会被拦下', async () => {
    const user = renderPage(adminUser)
    await openSshDrawer(user)

    await user.type(await screen.findByLabelText('宿主机地址'), 'ssh://10.0.0.5')
    await user.type(screen.getByLabelText('SSH 用户名'), 'root')
    await user.type(screen.getByLabelText('私钥别名'), '..')
    await user.type(screen.getByLabelText('主机密钥指纹'), FINGERPRINT)
    await user.click(screen.getByRole('button', { name: '保存设置' }))

    expect(await screen.findByText('只能包含字母、数字、点、下划线、连字符和冒号')).toBeTruthy()
    expect(await screen.findByText('别名不能为 . 或 ..')).toBeTruthy()
    expect(mocks.saveNodeSsh).not.toHaveBeenCalled()
  })

  it('表单校验：主机密钥指纹格式非法时不提交', async () => {
    const user = renderPage(adminUser)
    await openSshDrawer(user)

    await user.type(await screen.findByLabelText('宿主机地址'), '10.0.0.5')
    await user.type(screen.getByLabelText('SSH 用户名'), 'root')
    await user.type(screen.getByLabelText('私钥别名'), 'runner-1')
    await user.type(screen.getByLabelText('主机密钥指纹'), 'not-a-fingerprint')
    await user.click(screen.getByRole('button', { name: '保存设置' }))

    expect(await screen.findByText('格式应为 SHA256:<base64>（32 字节指纹）')).toBeTruthy()
    expect(mocks.saveNodeSsh).not.toHaveBeenCalled()
  })

  it('保存设置：提交全量字段并回显后端结果', async () => {
    const user = renderPage(adminUser)
    await openSshDrawer(user)

    await fillSshForm(user)
    await user.click(screen.getByRole('button', { name: '保存设置' }))

    await waitFor(() => expect(mocks.saveNodeSsh).toHaveBeenCalledTimes(1))
    expect(mocks.saveNodeSsh).toHaveBeenCalledWith('runner-1', {
      host: '10.0.0.5',
      port: 22,
      username: 'root',
      keyAlias: 'runner-1',
      hostKeySha256: FINGERPRINT,
      hostKeyAlgorithm: 'ED25519',
    })
    expect(await screen.findByText('SSH 设置已保存')).toBeTruthy()
  })

  it('测试连接成功：展示结果码对应的中文原因与测试时间', async () => {
    mocks.getNodeSsh.mockResolvedValue({ code: 200, msg: 'ok', data: sshTarget })
    const user = renderPage(adminUser)
    await openSshDrawer(user)

    await user.click(screen.getByRole('button', { name: '测试连接' }))

    await waitFor(() => expect(mocks.testNodeSsh).toHaveBeenCalledWith('runner-1'))
    expect(
      await screen.findByText('上次测试结果：连接成功（握手、主机密钥、认证、只读命令与 SFTP 均通过）'),
    ).toBeTruthy()
    expect(screen.getByText(/耗时 812 ms/)).toBeTruthy()
  })

  it('测试连接失败：按结果码展示中文原因（主机密钥不匹配）', async () => {
    mocks.getNodeSsh.mockResolvedValue({ code: 200, msg: 'ok', data: sshTarget })
    mocks.testNodeSsh.mockResolvedValue({
      code: 200,
      msg: 'ok',
      data: {
        resultCode: 'HOST_KEY_MISMATCH',
        message: '主机密钥不匹配',
        testedAt: '2026-09-27T16:31:20',
        durationMs: 1533,
      },
    })
    const user = renderPage(adminUser)
    await openSshDrawer(user)

    await user.click(screen.getByRole('button', { name: '测试连接' }))

    expect(await screen.findByText('上次测试结果：主机密钥不匹配，已中止（疑似中间人）')).toBeTruthy()
  })

  it('刷新后结果保持：重新打开抽屉展示持久化的上次测试结果', async () => {
    mocks.getNodeSsh.mockResolvedValue({
      code: 200,
      msg: 'ok',
      data: {
        ...sshTarget,
        lastTest: {
          resultCode: 'AUTH_FAILED',
          message: '公钥认证失败',
          testedAt: '2026-09-27T16:31:20',
          durationMs: 1533,
        },
      },
    })
    const user = renderPage(adminUser)

    await openSshDrawer(user)

    expect(await screen.findByText('上次测试结果：公钥认证失败')).toBeTruthy()
    expect(screen.getByText(/耗时 1533 ms/)).toBeTruthy()
  })

  it('私钥缺失提示：keyFileExists 为 false 时给出管理员操作指引', async () => {
    mocks.getNodeSsh.mockResolvedValue({
      code: 200,
      msg: 'ok',
      data: { ...sshTarget, keyFileExists: false },
    })
    const user = renderPage(adminUser)

    await openSshDrawer(user)

    expect(await screen.findByText('主节点内未找到该别名对应的私钥文件')).toBeTruthy()
  })

  it('未配置 SSH 时测试按钮不可用（避免用空设置发起测试）', async () => {
    const user = renderPage(adminUser)
    await openSshDrawer(user)

    expect((screen.getByRole('button', { name: '测试连接' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('SSH 主机密钥算法（H1.4）', () => {
  it('表单校验：未选择主机密钥算法时不提交', async () => {
    const user = renderPage(adminUser)
    await openSshDrawer(user)

    await user.type(await screen.findByLabelText('宿主机地址'), '10.0.0.5')
    await user.type(screen.getByLabelText('SSH 用户名'), 'root')
    await user.type(screen.getByLabelText('私钥别名'), 'runner-1')
    await user.type(screen.getByLabelText('主机密钥指纹'), FINGERPRINT)
    await user.click(screen.getByRole('button', { name: '保存设置' }))

    expect(await screen.findByText('请选择主机密钥算法')).toBeTruthy()
    expect(mocks.saveNodeSsh).not.toHaveBeenCalled()
  })

  it('保存与读取：算法随设置一起提交并回显', async () => {
    mocks.getNodeSsh.mockResolvedValue({
      code: 200,
      msg: 'ok',
      data: { ...sshTarget, hostKeyAlgorithm: 'RSA' },
    })
    const user = renderPage(adminUser)
    await openSshDrawer(user)

    // 读取时回显已保存的算法
    expect(await screen.findByTitle('RSA')).toBeTruthy()

    await selectAlgorithm('ECDSA')
    await user.click(screen.getByRole('button', { name: '保存设置' }))

    await waitFor(() => expect(mocks.saveNodeSsh).toHaveBeenCalledTimes(1))
    expect(mocks.saveNodeSsh.mock.calls[0][1]).toMatchObject({ hostKeyAlgorithm: 'ECDSA' })
  })

  it('多算法提示：指纹提示始终指向所选算法的目标机主机公钥', async () => {
    const user = renderPage(adminUser)
    await openSshDrawer(user)

    // 未选算法时先提示选择算法
    expect(await screen.findByText(/请先选择主机密钥算法/)).toBeTruthy()

    await selectAlgorithm('RSA')
    expect(await screen.findByText(/ssh_host_rsa_key\.pub/)).toBeTruthy()

    await selectAlgorithm('ECDSA')
    expect(await screen.findByText(/ssh_host_ecdsa_key\.pub/)).toBeTruthy()

    await selectAlgorithm('ED25519')
    expect(await screen.findByText(/ssh_host_ed25519_key\.pub/)).toBeTruthy()
  })

  it('旧记录缺算法：给出补齐提示并禁止测试', async () => {
    mocks.getNodeSsh.mockResolvedValue({
      code: 200,
      msg: 'ok',
      data: { ...sshTarget, hostKeyAlgorithm: null },
    })
    const user = renderPage(adminUser)
    await openSshDrawer(user)

    expect(await screen.findByText('该记录尚未选择主机密钥算法')).toBeTruthy()
    expect((screen.getByRole('button', { name: '测试连接' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect(mocks.testNodeSsh).not.toHaveBeenCalled()
  })

  it('算法结果码：未提供所选算法、需补齐算法都展示中文原因', async () => {
    mocks.getNodeSsh.mockResolvedValue({ code: 200, msg: 'ok', data: sshTarget })
    mocks.testNodeSsh
      .mockResolvedValueOnce({
        code: 200,
        msg: 'ok',
        data: {
          resultCode: 'HOST_KEY_ALGORITHM_UNAVAILABLE',
          message: '目标机未提供所选主机密钥算法',
          testedAt: '2026-09-27T16:40:00',
          durationMs: 320,
        },
      })
      .mockResolvedValueOnce({
        code: 200,
        msg: 'ok',
        data: {
          resultCode: 'HOST_KEY_ALGORITHM_REQUIRED',
          message: '尚未选择主机密钥算法',
          testedAt: '2026-09-27T16:41:00',
          durationMs: 5,
        },
      })
    const user = renderPage(adminUser)
    await openSshDrawer(user)

    await user.click(screen.getByRole('button', { name: '测试连接' }))
    expect(await screen.findByText('上次测试结果：目标机未提供所选主机密钥算法')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '测试连接' }))
    expect(
      await screen.findByText('上次测试结果：尚未选择主机密钥算法，旧记录需补齐后才能测试'),
    ).toBeTruthy()
  })
})

describe('发布包上传与分发（P4）', () => {
  it('上传预检：文件名不符合规则或超过 1 GiB 时不提交', async () => {
    const user = renderPage(adminUser)
    await openPackageTab(user)

    await uploadFile(new File(['x'], 'flowops-executor-0.7.0.tar.gz'))
    expect(
      await screen.findByText('发布包文件名应为 flowops-executor-<版本>-linux-amd64.tar.gz'),
    ).toBeTruthy()
    expect(mocks.uploadRunnerPackage).not.toHaveBeenCalled()

    const oversized = new File(['x'], 'flowops-executor-0.8.0-linux-amd64.tar.gz')
    Object.defineProperty(oversized, 'size', { value: 2 * 1024 * 1024 * 1024 })
    await uploadFile(oversized)
    expect(await screen.findByText('发布包超过 1 GiB 上限')).toBeTruthy()
    expect(mocks.uploadRunnerPackage).not.toHaveBeenCalled()
  })

  it('上传成功：调用上传接口并刷新版本与摘要列表', async () => {
    const user = renderPage(adminUser)
    await openPackageTab(user)

    await uploadFile(new File(['x'], 'flowops-executor-0.7.0-linux-amd64.tar.gz'))

    await waitFor(() => expect(mocks.uploadRunnerPackage).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('发布包已上传')).toBeTruthy()
    // 上传后刷新列表
    await waitFor(() => expect(mocks.getRunnerPackages).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('0.7.0')).toBeTruthy()
    expect(screen.getByText(new RegExp(`${'a'.repeat(12)}…`))).toBeTruthy()
  })

  it('上传失败：直接展示后端校验文案', async () => {
    mocks.uploadRunnerPackage.mockRejectedValue(
      new Error('发布包 manifest 不合法: gitCommit'),
    )
    const user = renderPage(adminUser)
    await openPackageTab(user)

    await uploadFile(new File(['x'], 'flowops-executor-0.7.0-linux-amd64.tar.gz'))

    expect(await screen.findByText('发布包 manifest 不合法: gitCommit')).toBeTruthy()
  })

  it('分发：选择节点触发分发，重复点击不会重复提交', async () => {
    mocks.getNodeSsh.mockResolvedValue({ code: 200, msg: 'ok', data: connectedSshTarget })
    let resolveDistribute: (value: unknown) => void = () => {}
    mocks.distributeRunnerPackage.mockReturnValue(
      new Promise((resolve) => {
        resolveDistribute = resolve
      }),
    )
    const user = renderPage(adminUser)
    await openPackageTab(user)

    await user.click(await screen.findByRole('button', { name: '分发给节点' }))
    fireEvent.mouseDown(await screen.findByRole('combobox'))
    await user.click(await screen.findByTitle('runner-1（生产节点1）'))

    const okButton = screen.getByRole('button', { name: /OK|确\s*定/ })
    await user.click(okButton)
    // 请求进行中重复点击不应产生第二次分发
    await user.click(okButton)
    expect(mocks.distributeRunnerPackage).toHaveBeenCalledTimes(1)
    expect(mocks.distributeRunnerPackage).toHaveBeenCalledWith('runner-1', PACKAGE_SHA)

    resolveDistribute({ code: 200, msg: '分发已开始', data: distributionRecord })
    // 分发后打开该节点的分发抽屉
    await screen.findByText('分发包：runner-1')
  })

  it('分发前置不满足（未配置 SSH）：给出明确原因并禁用分发按钮', async () => {
    const user = renderPage(adminUser)
    await openPackageDrawer(user)

    expect(await screen.findByText('当前节点不满足分发前置条件')).toBeTruthy()
    expect(screen.getByText(/尚未配置 SSH 目标/)).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: '开始分发' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('分发前置（缺主机密钥算法）：提示补齐 SSH 设置', async () => {
    mocks.getNodeSsh.mockResolvedValue({
      code: 200,
      msg: 'ok',
      data: { ...sshTarget, hostKeyAlgorithm: null },
    })
    const user = renderPage(adminUser)
    await openPackageDrawer(user)

    expect(await screen.findByText(/尚未选择主机密钥算法，请先补全 SSH 设置/)).toBeTruthy()
  })

  it('进度与结果：接管在途记录并展示分发成功与目标路径', async () => {
    mocks.getNodeSsh.mockResolvedValue({ code: 200, msg: 'ok', data: connectedSshTarget })
    mocks.getNodePackageDistributions.mockResolvedValue({
      code: 200,
      msg: 'ok',
      data: [distributionRecord],
    })
    mocks.getPackageDistribution.mockResolvedValue({
      code: 200,
      msg: 'ok',
      data: {
        ...distributionRecord,
        status: 'SUCCEEDED',
        remotePath: `/opt/flowops/runner/packages/${PACKAGE_SHA}.tar.gz`,
        finishedAt: '2026-09-28T10:21:00',
        durationMs: 61234,
      },
    })
    const user = renderPage(adminUser)
    await openPackageDrawer(user)

    await waitFor(() => expect(mocks.getPackageDistribution).toHaveBeenCalled())
    expect(await screen.findByText('分发状态：分发成功')).toBeTruthy()
    expect(screen.getByText(/opt\/flowops\/runner\/packages/)).toBeTruthy()
    expect(screen.getByText(/耗时：61234 ms/)).toBeTruthy()
  })

  it('分发失败：按 errorCode 展示中文原因', async () => {
    mocks.getNodeSsh.mockResolvedValue({ code: 200, msg: 'ok', data: connectedSshTarget })
    mocks.getNodePackageDistributions.mockResolvedValue({
      code: 200,
      msg: 'ok',
      data: [
        {
          ...distributionRecord,
          status: 'FAILED',
          errorCode: 'REMOTE_DISK_INSUFFICIENT',
          errorMessage: '目标机可用空间不足',
        },
      ],
    })
    const user = renderPage(adminUser)
    await openPackageDrawer(user)

    // 终态记录不进"进行中"状态卡片，在历史表格中展示失败原因
    expect(await screen.findByText('分发失败')).toBeTruthy()
    expect(screen.getAllByText(/目标机可用空间不足/).length).toBeGreaterThan(0)
  })
})

describe('发布包失败码与恢复入口（F1）', () => {
  it('上传自愈：repaired=true 展示修复文案，不当作错误', async () => {
    mocks.uploadRunnerPackage.mockResolvedValue({
      code: 200,
      msg: '发布包已存在，已按摘要修复存储文件',
      data: { ...runnerPackage, existing: true, repaired: true },
    })
    const user = renderPage(adminUser)
    await openPackageTab(user)

    await uploadFile(new File(['x'], 'flowops-executor-0.7.0-linux-amd64.tar.gz'))

    expect(await screen.findByText('发布包已存在，已按摘要修复存储文件')).toBeTruthy()
  })

  it('上传重复：existing=true 且未修复时展示已存在文案', async () => {
    mocks.uploadRunnerPackage.mockResolvedValue({
      code: 200,
      msg: '发布包已存在（相同摘要）',
      data: { ...runnerPackage, existing: true, repaired: false },
    })
    const user = renderPage(adminUser)
    await openPackageTab(user)

    await uploadFile(new File(['x'], 'flowops-executor-0.7.0-linux-amd64.tar.gz'))

    expect(await screen.findByText('发布包已存在（相同摘要）')).toBeTruthy()
  })

  it('SSH_CONFIG_CHANGED：提示去重测，提供「去测试连接」而非重试分发', async () => {
    mocks.getNodeSsh.mockResolvedValue({ code: 200, msg: 'ok', data: connectedSshTarget })
    mocks.getNodePackageDistributions.mockResolvedValue({
      code: 200,
      msg: 'ok',
      data: [
        {
          ...distributionRecord,
          status: 'FAILED',
          errorCode: 'SSH_CONFIG_CHANGED',
          errorMessage: 'SSH 设置已变更',
        },
      ],
    })
    const user = renderPage(adminUser)
    await openPackageDrawer(user)

    expect(
      await screen.findByText(/SSH 设置已变更或已被删除，需重新配置并测试连接后再分发/),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: '重试分发' })).toBeNull()

    // 「去测试连接」打开该节点的 SSH 设置抽屉
    await user.click(screen.getByRole('button', { name: '去测试连接' }))
    expect(await screen.findByText('SSH 设置：runner-1')).toBeTruthy()
  })

  it('SSH_NOT_VERIFIED：提示重新测试连接', async () => {
    mocks.getNodeSsh.mockResolvedValue({ code: 200, msg: 'ok', data: connectedSshTarget })
    mocks.getNodePackageDistributions.mockResolvedValue({
      code: 200,
      msg: 'ok',
      data: [
        {
          ...distributionRecord,
          status: 'FAILED',
          errorCode: 'SSH_NOT_VERIFIED',
          errorMessage: '最近测试未通过',
        },
      ],
    })
    const user = renderPage(adminUser)
    await openPackageDrawer(user)

    expect(
      await screen.findByText(/该节点 SSH 最近一次测试未通过，请重新测试连接后再分发/),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: '去测试连接' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '重试分发' })).toBeNull()
  })

  it('STORE_CHECKSUM_MISMATCH：提示重新上传并跳转到发布包页签', async () => {
    mocks.getNodeSsh.mockResolvedValue({ code: 200, msg: 'ok', data: connectedSshTarget })
    mocks.getNodePackageDistributions.mockResolvedValue({
      code: 200,
      msg: 'ok',
      data: [
        {
          ...distributionRecord,
          status: 'FAILED',
          errorCode: 'STORE_CHECKSUM_MISMATCH',
          errorMessage: '存储包与摘要不一致',
        },
      ],
    })
    const user = renderPage(adminUser)
    await openPackageDrawer(user)

    expect(
      await screen.findByText(/主节点存储的发布包与摘要不一致，请重新上传该包/),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: '重试分发' })).toBeNull()

    await user.click(screen.getByRole('button', { name: '重新上传' }))
    expect(await screen.findByRole('button', { name: /上传发布包/ })).toBeTruthy()
  })

  it('其他失败码：提供重试分发并再次触发该包', async () => {
    mocks.getNodeSsh.mockResolvedValue({ code: 200, msg: 'ok', data: connectedSshTarget })
    mocks.getNodePackageDistributions.mockResolvedValue({
      code: 200,
      msg: 'ok',
      data: [
        {
          ...distributionRecord,
          status: 'FAILED',
          errorCode: 'REMOTE_DISK_INSUFFICIENT',
          errorMessage: '目标机可用空间不足',
        },
      ],
    })
    const user = renderPage(adminUser)
    await openPackageDrawer(user)

    const retryButton = await screen.findByRole('button', { name: '重试分发' })
    mocks.getNodePackageDistributions.mockResolvedValue({ code: 200, msg: 'ok', data: [] })
    await user.click(retryButton)

    await waitFor(() =>
      expect(mocks.distributeRunnerPackage).toHaveBeenCalledWith('runner-1', PACKAGE_SHA),
    )
  })

  it('绑定版本展示：已绑定显示版本号，未绑定标记旧记录', async () => {
    mocks.getNodeSsh.mockResolvedValue({ code: 200, msg: 'ok', data: connectedSshTarget })
    mocks.getNodePackageDistributions.mockResolvedValue({
      code: 200,
      msg: 'ok',
      data: [
        {
          ...distributionRecord,
          id: 6,
          status: 'SUCCEEDED',
          sshConfigVersion: 4,
          remotePath: `/opt/flowops/runner/packages/${PACKAGE_SHA}.tar.gz`,
        },
        {
          ...distributionRecord,
          id: 5,
          status: 'FAILED',
          errorCode: 'SSH_CONFIG_CHANGED',
          sshConfigVersion: null,
        },
      ],
    })
    const user = renderPage(adminUser)
    await openPackageDrawer(user)

    expect(await screen.findByText('v4')).toBeTruthy()
    expect(screen.getByText('未绑定')).toBeTruthy()
  })
})
