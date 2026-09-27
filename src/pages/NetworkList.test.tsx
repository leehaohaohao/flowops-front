import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NetworkList from '@/pages/NetworkList'
import { UserContext } from '@/App'
import type { UserInfo } from '@/types'

const { iconNames, mocks } = vi.hoisted(() => ({
  iconNames: [
    'PlusOutlined',
    'ImportOutlined',
    'ReloadOutlined',
    'ApartmentOutlined',
    'DeleteOutlined',
    'EditOutlined',
    'TeamOutlined',
    'ArrowRightOutlined',
    'MinusCircleOutlined',
    'InboxOutlined',
    'CloseOutlined',
    'CheckOutlined',
    'DownOutlined',
    'CloseCircleFilled',
    'CheckCircleFilled',
    'ExclamationCircleFilled',
    'InfoCircleFilled',
    'LoadingOutlined',
    'SearchOutlined',
  ],
  mocks: {
    getNetworkList: vi.fn(),
    getImportableNetworks: vi.fn(),
    createNetwork: vi.fn(),
    importNetwork: vi.fn(),
    deleteNetwork: vi.fn(),
    grantNetworkToProject: vi.fn(),
    getProjectList: vi.fn(),
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

vi.mock('@/api/networks', () => ({
  getNetworkList: mocks.getNetworkList,
  getImportableNetworks: mocks.getImportableNetworks,
  createNetwork: mocks.createNetwork,
  importNetwork: mocks.importNetwork,
  deleteNetwork: mocks.deleteNetwork,
  grantNetworkToProject: mocks.grantNetworkToProject,
  revokeNetworkFromProject: vi.fn(),
  getProjectNetworks: vi.fn(),
  getDefaultNetwork: vi.fn(),
  setDefaultNetwork: vi.fn(),
}))

vi.mock('@/api/projects', () => ({
  getProjectList: mocks.getProjectList,
}))

const adminUser = { username: 'admin', superAdmin: true, projects: [] } as UserInfo
const normalUser = {
  username: 'member',
  superAdmin: false,
  projects: [],
  projectPermissions: {},
} as UserInfo

const networks = [
  {
    id: 1,
    name: 'net-a',
    displayName: '网络A',
    source: 'MANAGED',
    dockerStatus: 'PRESENT',
    grantedProjectCount: 2,
    serviceRefCount: 3,
    createTime: '2026-01-01 10:00:00',
  },
  {
    id: 2,
    name: 'net-b',
    displayName: '网络B',
    source: 'IMPORTED',
    dockerStatus: 'MISSING',
    grantedProjectCount: 0,
    serviceRefCount: 1,
    createTime: '2026-01-02 10:00:00',
  },
]

function renderPage(user: UserInfo) {
  const eventUser = userEvent.setup({ delay: null })
  render(
    <UserContext.Provider value={user}>
      <NetworkList />
    </UserContext.Provider>,
  )
  return eventUser
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getNetworkList.mockResolvedValue({ code: 200, msg: 'ok', data: networks })
  mocks.getProjectList.mockResolvedValue({ code: 200, msg: 'ok', data: [] })
  mocks.getImportableNetworks.mockResolvedValue({
    code: 200,
    msg: 'ok',
    data: [{ name: 'ext-net', driver: 'bridge' }],
  })
  mocks.createNetwork.mockResolvedValue({
    code: 200,
    msg: '网络已创建并登记',
    data: { id: 9, name: 'new-net', displayName: '新网络' },
  })
  mocks.importNetwork.mockResolvedValue({
    code: 200,
    msg: '网络已导入并登记',
    data: { id: 10, name: 'ext-net', displayName: '外部网络' },
  })
  mocks.deleteNetwork.mockResolvedValue({ code: 200, msg: '网络已删除', data: null })
})

describe('网络管理页（F1）', () => {
  it('超级管理员可看到网络列表、来源与 Docker 状态', async () => {
    renderPage(adminUser)

    expect(await screen.findByText('网络A')).toBeTruthy()
    expect(screen.getByText('网络B')).toBeTruthy()
    expect(screen.getByText('托管')).toBeTruthy()
    expect(screen.getByText('导入')).toBeTruthy()
    expect(screen.getByText('存在')).toBeTruthy()
    expect(screen.getByText('缺失')).toBeTruthy()
    expect(screen.getByRole('button', { name: /新建网络/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /导入网络/ })).toBeTruthy()
  })

  it('非超级管理员看不到管理入口，也不请求网络列表', async () => {
    renderPage(normalUser)

    expect(await screen.findByText('仅超级管理员可管理主节点网络')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /新建网络/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /导入网络/ })).toBeNull()
    expect(mocks.getNetworkList).not.toHaveBeenCalled()
  })

  it('创建网络：提交后调用创建接口', async () => {
    const user = renderPage(adminUser)
    await screen.findByText('网络A')

    await user.click(screen.getByRole('button', { name: /新建网络/ }))
    const nameInput = await screen.findByLabelText('网络名称')
    await user.type(nameInput, 'new-net')
    await user.click(screen.getByRole('button', { name: /OK|确\s*定/ }))

    await waitFor(() => expect(mocks.createNetwork).toHaveBeenCalledTimes(1))
    expect(mocks.createNetwork).toHaveBeenCalledWith({ name: 'new-net', displayName: undefined })
    // 成功后刷新列表
    await waitFor(() => expect(mocks.getNetworkList).toHaveBeenCalledTimes(2))
  })

  it('导入网络：打开抽屉时加载可导入网络列表', async () => {
    const user = renderPage(adminUser)
    await screen.findByText('网络A')

    await user.click(screen.getByRole('button', { name: /导入网络/ }))

    await waitFor(() => expect(mocks.getImportableNetworks).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('导入已存在的网络')).toBeTruthy()
  })

  it('删除失败：把后端拒绝原因展示给用户', async () => {
    mocks.deleteNetwork.mockRejectedValue(
      new Error('该项目仍有 2 个服务使用该网络，请先解除服务网络选择'),
    )
    const user = renderPage(adminUser)
    await screen.findByText('网络A')

    const deleteButtons = screen.getAllByRole('button', { name: /删\s*除/ })
    await user.click(deleteButtons[0])
    await user.click(await screen.findByRole('button', { name: /OK|确\s*定/ }))

    expect(await screen.findByText(/仍有 2 个服务使用该网络/)).toBeTruthy()
  })
})
