import { createContext, useEffect, useState } from 'react'
import { createHashRouter, Navigate, Outlet, RouterProvider } from 'react-router-dom'
import { App as AntApp, ConfigProvider, Spin } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { getUserInfo } from '@/api/auth'
import type { UserInfo } from '@/types'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import ProjectList from '@/pages/ProjectList'
import ServiceList from '@/pages/ServiceList'
import ServiceEdit from '@/pages/ServiceEdit'
import UserList from '@/pages/UserList'
import MemberList from '@/pages/MemberList'
import RoleList from '@/pages/RoleList'
import CrossAccess from '@/pages/CrossAccess'
import DeployLogs from '@/pages/DeployLogs'
import ContainerLogs from '@/pages/ContainerLogs'
import MainLayout from '@/layouts/MainLayout'
import '@/styles/global.css'

export const UserContext = createContext<UserInfo | null>(null)

function AuthGuard() {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      setChecking(false)
      return
    }

    getUserInfo()
      .then((res) => setUserInfo(res.data))
      .catch(() => {
        localStorage.removeItem('token')
      })
      .finally(() => setChecking(false))
  }, [])

  if (checking) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!userInfo) {
    return <Navigate to="/login" replace />
  }

  return (
    <UserContext.Provider value={userInfo}>
      <MainLayout userInfo={userInfo}>
        <Outlet />
      </MainLayout>
    </UserContext.Provider>
  )
}

const router = createHashRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/',
    element: <AuthGuard />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'projects', element: <ProjectList /> },
      { path: 'projects/:projectId/services', element: <ServiceList /> },
      { path: 'projects/:projectId/services/create', element: <ServiceEdit /> },
      { path: 'projects/:projectId/members', element: <MemberList /> },
      { path: 'services/:id', element: <ServiceEdit /> },
      { path: 'projects/:projectId/services/:id/logs', element: <ContainerLogs /> },
      { path: 'logs', element: <DeployLogs /> },
      { path: 'users', element: <UserList /> },
      { path: 'roles', element: <RoleList /> },
      { path: 'access', element: <CrossAccess /> },
    ],
  },
])

export default function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <AntApp>
        <RouterProvider router={router} />
      </AntApp>
    </ConfigProvider>
  )
}
