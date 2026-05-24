import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Button, Layout, Menu, Tag } from 'antd'
import {
  CloudServerOutlined,
  DashboardOutlined,
  FileTextOutlined,
  LogoutOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { logout } from '@/api/auth'
import type { UserInfo } from '@/types'

const { Header, Sider, Content } = Layout

function buildMenuItems(userInfo: UserInfo) {
  const items = [
    { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
    { key: '/projects', icon: <CloudServerOutlined />, label: '服务管理' },
    { key: '/logs', icon: <FileTextOutlined />, label: '日志查看' },
  ]

  if (userInfo.isSuperAdmin) {
    items.push({ key: '/users', icon: <TeamOutlined />, label: '用户管理' })
  }

  return items
}

export default function MainLayout({
  userInfo,
  children,
}: {
  userInfo: UserInfo
  children: ReactNode
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)

  const menuItems = useMemo(() => buildMenuItems(userInfo), [userInfo])
  const firstSegment = '/' + location.pathname.split('/')[1]
  const selectedKey = firstSegment === '/services' ? '/projects' : firstSegment

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key)
  }

  const handleLogout = async () => {
    try {
      await logout()
    } finally {
      localStorage.removeItem('token')
      navigate('/login')
    }
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="dark"
        width={200}
      >
        <div
          style={{
            height: 48,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 600,
            fontSize: 16,
            borderBottom: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          {collapsed ? 'F' : 'FlowOps'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={handleMenuClick}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            padding: '0 24px',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 16,
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          <span>{userInfo.username}</span>
          {userInfo.isSuperAdmin && <Tag color="red">超级管理员</Tag>}
          {userInfo.groups
            ?.filter((g) => g.isSupervisor)
            .map((g) => (
              <Tag key={g.id} color="blue">
                {g.name}主管
              </Tag>
            ))}
          <Button type="link" icon={<LogoutOutlined />} onClick={handleLogout}>
            退出
          </Button>
        </Header>
        <Content style={{ margin: 24 }}>{children}</Content>
      </Layout>
    </Layout>
  )
}
