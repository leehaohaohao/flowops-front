import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SshSetupGuide from '@/components/SshSetupGuide'
import { copyText } from '@/utils/clipboard'

const { iconNames, mocks } = vi.hoisted(() => ({
  iconNames: [
    'CopyOutlined',
    'CheckOutlined',
    'DownOutlined',
    'LoadingOutlined',
    'SearchOutlined',
    'CloseOutlined',
    'InfoCircleFilled',
    'CheckCircleFilled',
    'CloseCircleFilled',
    'ExclamationCircleFilled',
    'CheckCircleOutlined',
  ],
  mocks: {
    writeText: vi.fn(),
  },
}))

// @ant-design/icons 的 CJS 入口在 Node 下无法加载（见 ServiceEdit.test.tsx 说明）
vi.mock('@ant-design/icons', () => {
  const IconStub = () => null
  const stubModule: Record<string, unknown> = { __esModule: true, default: IconStub }
  for (const name of iconNames) stubModule[name] = IconStub
  return stubModule
})

type ExecCommand = (commandId: string) => boolean

function stubExecCommand(impl: ExecCommand) {
  ;(document as unknown as { execCommand: ExecCommand }).execCommand = impl
}

function stubClipboard(writeText?: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: writeText ? { writeText } : undefined,
    configurable: true,
  })
}

function stubSecureContext(value: boolean) {
  Object.defineProperty(window, 'isSecureContext', { value, configurable: true })
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  stubClipboard()
  stubSecureContext(true)
  vi.restoreAllMocks()
})

describe('SSH 配置教程（Ubuntu）', () => {
  it('渲染 Ubuntu 分步命令，未填表单时保留占位符', () => {
    render(<SshSetupGuide values={{}} />)

    expect(screen.getByText('1. 目标机：确认 SSH 服务已启动')).toBeTruthy()
    expect(screen.getByText('2. 主节点：确认运行 FlowOps 的用户')).toBeTruthy()
    expect(screen.getByText('3. 主节点：预置专用私钥并设置属主与权限')).toBeTruthy()
    expect(screen.getByText('4. 主节点：把公钥安装到目标机')).toBeTruthy()
    expect(screen.getByText('5. 目标机：读取主机密钥指纹')).toBeTruthy()

    // 未填写表单时用提示性占位符（命令多处出现别名，取集合断言）
    expect(screen.getByText(/<目标用户名>@<目标地址>/)).toBeTruthy()
    expect(screen.getAllByText(/ssh-keys\/runner-1/).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /复\s*制/ })).toHaveLength(5)
  })

  it('预置私钥步骤显式设置属主，并给出确认运行用户的命令', () => {
    render(<SshSetupGuide values={{ keyAlias: 'runner-1' }} />)

    // 步骤 2：容器与宿主机/WSL 直连两种方式下如何确认运行用户
    expect(screen.getByText(/docker exec flowops id -un/)).toBeTruthy()
    expect(screen.getByText(/ps -o user= -p/)).toBeTruthy()

    // 步骤 3：chmod 不改属主，命令里必须同时有 chown 与 install -o/-g
    expect(screen.getByText(/install -d -m 700 -o "\$RUN_USER" -g "\$RUN_USER"/)).toBeTruthy()
    expect(
      screen.getByText(/chown "\$RUN_USER":"\$RUN_USER" \/data\/flowops\/ssh-keys\/runner-1/),
    ).toBeTruthy()
    expect(screen.getByText(/chmod 600 \/data\/flowops\/ssh-keys\/runner-1/)).toBeTruthy()
  })

  it('命令按当前表单值渲染（地址/端口/用户名/私钥别名）', () => {
    render(
      <SshSetupGuide
        values={{ host: '10.0.0.5', port: 2222, username: 'deploy', keyAlias: 'runner-9' }}
      />,
    )

    expect(screen.getByText(/deploy@10\.0\.0\.5/)).toBeTruthy()
    expect(screen.getByText(/-p 2222/)).toBeTruthy()
    expect(screen.getAllByText(/runner-9/).length).toBeGreaterThan(0)
  })

  it('复制：安全上下文优先使用 Clipboard API', async () => {
    const user = userEvent.setup({ delay: null })
    stubSecureContext(true)
    stubClipboard(mocks.writeText)
    mocks.writeText.mockResolvedValue(undefined)

    render(<SshSetupGuide values={{}} />)
    await user.click(screen.getAllByRole('button', { name: /复\s*制/ })[0])

    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledTimes(1))
    expect(mocks.writeText.mock.calls[0][0]).toContain('apt install')
    expect(await screen.findByText('已复制')).toBeTruthy()
  })

  it('复制：无 HTTPS（非安全上下文、无 clipboard）时回退 execCommand', async () => {
    const user = userEvent.setup({ delay: null })
    stubSecureContext(false)
    stubClipboard(undefined)

    let copiedText = ''
    stubExecCommand(() => {
      const textarea = document.querySelector('textarea') as HTMLTextAreaElement | null
      copiedText = textarea?.value || ''
      return true
    })

    render(<SshSetupGuide values={{}} />)
    // 步骤 3（索引 2）含 ssh-keygen 与 chown
    await user.click(screen.getAllByRole('button', { name: /复\s*制/ })[2])

    // 回退路径把命令放进临时 textarea 后调用 execCommand('copy')
    await waitFor(() => expect(copiedText.length).toBeGreaterThan(0))
    expect(copiedText).toContain('ssh-keygen -t ed25519')
    expect(copiedText).toContain('chown')
    expect(await screen.findByText('已复制')).toBeTruthy()
  })

  it('复制失败：提示手动复制，不误报成功', async () => {
    const user = userEvent.setup({ delay: null })
    stubSecureContext(false)
    stubClipboard(undefined)
    stubExecCommand(() => false)

    render(<SshSetupGuide values={{}} />)
    await user.click(screen.getAllByRole('button', { name: /复\s*制/ })[0])

    expect(await screen.findByText('复制失败，请手动选中命令后复制')).toBeTruthy()
  })

  it('系统切换：Ubuntu 可选，未实现的系统为禁用占位（预留扩展）', async () => {
    render(<SshSetupGuide values={{}} />)

    fireEvent.mouseDown(screen.getByRole('combobox'))

    await waitFor(() =>
      expect(document.querySelectorAll('.ant-select-item-option').length).toBe(3),
    )
    const labels = Array.from(document.querySelectorAll('.ant-select-item-option')).map((el) =>
      el.getAttribute('title'),
    )
    expect(labels).toContain('Ubuntu / Debian')
    expect(labels).toContain('CentOS / RHEL（即将支持）')
    expect(labels).toContain('Windows（即将支持）')
    // 后两个是预留占位，不可选
    expect(document.querySelectorAll('.ant-select-item-option-disabled').length).toBe(2)
  })

  it('copyText：clipboard 写入被拒时仍回退 execCommand 成功', async () => {
    stubSecureContext(true)
    stubClipboard(() => Promise.reject(new Error('NotAllowedError')))
    stubExecCommand(() => true)

    await expect(copyText('flowops')).resolves.toBe(true)
  })
})
