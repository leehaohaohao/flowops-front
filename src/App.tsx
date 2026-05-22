import { createContext, useEffect, useState } from 'react'
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router-dom'
import { App as AntApp, ConfigProvider, Spin } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { getUserInfo } from '@/api/auth'
import type { UserInfo } from '@/types'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import ServiceList from '@/pages/ServiceList'
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

const router = createBrowserRouter([
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
      { path: 'services', element: <ServiceList /> },
      { path: 'services/create', element: <div>创建服务</div> },
      { path: 'services/:id', element: <div>编辑服务</div> },
      { path: 'services/:id/logs', element: <div>容器日志</div> },
      { path: 'logs', element: <div>部署日志</div> },
      { path: 'users', element: <div>用户管理</div> },
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
