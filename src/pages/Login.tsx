import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Form, Input, message, Typography } from 'antd'
import { LockOutlined, UserOutlined } from '@ant-design/icons'
import { login } from '@/api/auth'
import type { LoginRequest } from '@/types'

const { Title } = Typography

export default function Login() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (values: LoginRequest) => {
    setLoading(true)
    try {
      const res = await login(values)
      localStorage.setItem('token', res.data)
      navigate('/dashboard')
    } catch (err) {
      message.error((err as Error).message || '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f5f5',
      }}
    >
      <Card style={{ width: 380 }}>
        <Title level={4} style={{ textAlign: 'center', marginBottom: 32 }}>
          FlowOps
        </Title>
        <Form onFinish={handleSubmit} size="large">
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" block loading={loading}>
              登录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
