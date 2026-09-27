import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectList from '@/pages/ProjectList'
import { UserContext } from '@/App'
import type { UserInfo } from '@/types'

const { iconNames, mocks } = vi.hoisted(() => ({
  iconNames: [
    'ApartmentOutlined',
    'PlusOutlined',
    'ImportOutlined',
    'DeleteOutlined',
    'EditOutlined',
    'TeamOutlined',
    'ArrowRightOutlined',
    'ReloadOutlined',
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
    getProjectList: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    getProjectNetworks: vi.fn(),
    getDefaultNetwork: vi.fn(),
    setDefaultNetwork: vi.fn(),
    grantNetworkToProject: vi.fn(),
    revokeNetworkFromProject: vi.fn(),
    getNetworkList: vi.fn(),
    getImportableNetworks: vi.fn(),
    createNetwork: vi.fn(),
  },
}))

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

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('@/api/projects', () => ({
  getProjectList: mocks.getProjectList,
  createProject: mocks.createProject,
  updateProject: mocks.updateProject,
  deleteProject: mocks.deleteProject,
}))

vi.mock('@/api/networks', () => ({
  getNetworkList: mocks.getNetworkList,
  getImportableNetworks: mocks.getImportableNetworks,
  createNetwork: mocks.createNetwork,
  importNetwork: vi.fn(),
  deleteNetwork: vi.fn(),
  grantNetworkToProject: mocks.grantNetworkToProject,
  revokeNetworkFromProject: mocks.revokeNetworkFromProject,
  getProjectNetworks: mocks.getProjectNetworks,
  getDefaultNetwork: mocks.getDefaultNetwork,
  setDefaultNetwork: mocks.setDefaultNetwork,
}))

const adminUser = { username: 'admin', superAdmin: true, projects: [] } as UserInfo
const supervisorUser = {
  username: 'sup',
  superAdmin: false,
  projects: [{ id: 1, name: '订单项目', roleName: 'supervisor' }],
  projectPermissions: {},
} as UserInfo
const memberUser = {
  username: 'member',
  superAdmin: false,
  projects: [{ id: 1, name: '订单项目', roleName: 'member' }],
  projectPermissions: { '1': ['VIEW'] },
} as UserInfo

const project = {
  id: 1,
  name: '订单项目',
  description: '订单相关服务',
  createTime: '2026-01-01 10:00:00',
  serviceCount: 2,
  runningCount: 1,
  memberCount: 3,
}

const projectNetworks = [
  { id: 7, name: 'net-a', displayName: '网络A', source: 'MANAGED', dockerStatus: 'PRESENT' },
  { id: 8, name: 'net-b', displayName: '网络B', source: 'IMPORTED', dockerStatus: 'PRESENT' },
]

const allNetworks = [
  {
    id: 7,
    name: 'net-a',
    displayName: '网络A',
    source: 'MANAGED',
    dockerStatus: 'PRESENT',
    grantedProjectCount: 1,
    serviceRefCount: 0,
    createTime: '2026-01-01 10:00:00',
  },
  {
    id: 9,
    name: 'net-c',
    displayName: '网络C',
    source: 'MANAGED',
    dockerStatus: 'PRESENT',
    grantedProjectCount: 0,
    serviceRefCount: 0,
    createTime: '2026-01-02 10:00:00',
  },
]

function renderPage(user: UserInfo) {
  const eventUser = userEvent.setup({ delay: null })
  render(
    <UserContext.Provider value={user}>
      <ProjectList />
    </UserContext.Provider>,
  )
  return eventUser
}

async function openNetworkDrawer(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText('订单项目')
  await user.click(screen.getByRole('button', { name: /网\s*络/ }))
  await screen.findByText('项目网络：订单项目')
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getProjectList.mockResolvedValue({ code: 200, msg: 'ok', data: [project] })
  mocks.getProjectNetworks.mockResolvedValue({ code: 200, msg: 'ok', data: projectNetworks })
  mocks.getDefaultNetwork.mockResolvedValue({ code: 200, msg: 'ok', data: { networkId: 7 } })
  mocks.getNetworkList.mockResolvedValue({ code: 200, msg: 'ok', data: allNetworks })
  mocks.setDefaultNetwork.mockResolvedValue({ code: 200, msg: '已设置项目默认网络', data: null })
  mocks.grantNetworkToProject.mockResolvedValue({ code: 200, msg: '已授权该项目使用网络', data: null })
  mocks.revokeNetworkFromProject.mockResolvedValue({ code: 200, msg: '已撤销', data: null })
  mocks.createNetwork.mockResolvedValue({
    code: 200,
    msg: '网络已创建并登记',
    data: { id: 11, name: 'new-net', displayName: '新网络' },
  })
})

describe('项目网络入口（F2）', () => {
  it('超级管理员：可从项目卡片打开网络抽屉并看到已授权网络与默认值', async () => {
    const user = renderPage(adminUser)
    await openNetworkDrawer(user)

    expect(await screen.findByText('网络A')).toBeTruthy()
    expect(screen.getByText('网络B')).toBeTruthy()
    // 默认网络标记与「清除默认」按钮
    expect(screen.getByText('默认')).toBeTruthy()
    expect(screen.getByRole('button', { name: /清除默认/ })).toBeTruthy()
    // 超管可见管理入口
    expect(screen.getByRole('button', { name: /新建网络/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /授权已有网络/ })).toBeTruthy()
    expect(mocks.getProjectNetworks).toHaveBeenCalledWith(1)
    expect(mocks.getDefaultNetwork).toHaveBeenCalledWith(1)
  })

  it('项目主管：可调整默认网络，但看不到全局管理入口', async () => {
    const user = renderPage(supervisorUser)
    await openNetworkDrawer(user)

    expect(await screen.findByText('网络A')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /新建网络/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /授权已有网络/ })).toBeNull()

    await user.click(screen.getByRole('button', { name: /设为默认/ }))
    await waitFor(() => expect(mocks.setDefaultNetwork).toHaveBeenCalledWith(1, 8))
  })

  it('普通成员：项目卡片上没有网络管理入口', async () => {
    renderPage(memberUser)
    await screen.findByText('订单项目')

    expect(screen.queryByRole('button', { name: /网\s*络/ })).toBeNull()
    expect(mocks.getProjectNetworks).not.toHaveBeenCalled()
  })

  it('撤销授权失败：展示后端拒绝原因（仍有服务引用）', async () => {
    mocks.revokeNetworkFromProject.mockRejectedValue(
      new Error('该项目仍有 2 个服务使用该网络，请先解除服务网络选择'),
    )
    const user = renderPage(adminUser)
    await openNetworkDrawer(user)
    await screen.findByText('网络A')

    const revokeButtons = screen.getAllByRole('button', { name: /撤销授权/ })
    await user.click(revokeButtons[0])
    await user.click(await screen.findByRole('button', { name: /OK|确\s*定/ }))

    expect(await screen.findByText(/仍有 2 个服务使用该网络/)).toBeTruthy()
  })

  it('超管新建网络后自动授权：授权失败时分别说明已完成与未完成步骤', async () => {
    mocks.grantNetworkToProject.mockRejectedValue(new Error('仅超级管理员可管理主节点网络'))
    const user = renderPage(adminUser)
    await openNetworkDrawer(user)

    await user.click(screen.getByRole('button', { name: /新建网络/ }))
    await user.type(await screen.findByLabelText('网络名称'), 'new-net')
    await user.click(screen.getByRole('button', { name: /OK|确\s*定/ }))

    await waitFor(() => expect(mocks.createNetwork).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/网络已创建，但授权该项目失败/)).toBeTruthy()
  })
})
