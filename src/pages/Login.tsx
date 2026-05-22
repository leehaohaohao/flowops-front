import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Form, Input, message, Typography } from 'antd'
import { LockOutlined, UserOutlined } from '@ant-design/icons'
import { login } from '@/api/auth'
import type { LoginRequest } from '@/types'

const { Title, Text } = Typography

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
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Left branding panel */}
      <div
        style={{
          flex: 1,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative circles */}
        <div
          style={{
            position: 'absolute',
            width: 400,
            height: 400,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.06)',
            top: -100,
            left: -100,
          }}
        />
        <div
          style={{
            position: 'absolute',
            width: 300,
            height: 300,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.04)',
            bottom: -80,
            right: -60,
          }}
        />
        <div style={{ position: 'relative', textAlign: 'center' }}>
          <div
            style={{
              fontSize: 56,
              fontWeight: 700,
              letterSpacing: 2,
              marginBottom: 16,
            }}
          >
            FlowOps
          </div>
          <Text
            style={{
              color: 'rgba(255,255,255,0.85)',
              fontSize: 18,
              display: 'block',
            }}
          >
            轻量级服务部署与管理平台
          </Text>
        </div>
      </div>

      {/* Right form panel */}
      <div
        style={{
          width: 520,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fafafa',
        }}
      >
        <Card
          bordered={false}
          style={{
            width: 400,
            boxShadow: 'none',
            background: 'transparent',
          }}
          styles={{ body: { padding: '40px 0' } }}
        >
          <Title level={3} style={{ marginBottom: 8 }}>
            欢迎回来
          </Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 40 }}>
            登录你的 FlowOps 账号
          </Text>
          <Form onFinish={handleSubmit} size="large" layout="vertical">
            <Form.Item
              name="username"
              rules={[{ required: true, message: '请输入用户名' }]}
            >
              <Input
                prefix={<UserOutlined style={{ color: '#bfbfbf' }} />}
                placeholder="用户名"
              />
            </Form.Item>
            <Form.Item
              name="password"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
                placeholder="密码"
              />
            </Form.Item>
            <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
              <Button
                type="primary"
                htmlType="submit"
                block
                loading={loading}
                style={{
                  height: 44,
                  borderRadius: 8,
                  fontSize: 16,
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  border: 'none',
                }}
              >
                登录
              </Button>
            </Form.Item>
          </Form>
        </Card>
      </div>
    </div>
  )
}
