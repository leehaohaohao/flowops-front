import { useEffect, useState } from 'react'
import { Card, Col, message, Row, Spin, Typography } from 'antd'
import {
  CheckCircleOutlined,
  CloudServerOutlined,
  RocketOutlined,
} from '@ant-design/icons'
import { getDashboardStats } from '@/api/stats'
import type { DashboardStats } from '@/types'

const { Title, Text } = Typography

interface StatCardProps {
  title: string
  value: number | string
  icon: React.ReactNode
  color: string
  bgColor: string
}

function StatCard({ title, value, icon, color, bgColor }: StatCardProps) {
  return (
    <Card
      bordered={false}
      style={{
        borderRadius: 12,
        boxShadow: '0 1px 2px 0 rgba(0,0,0,0.03), 0 1px 6px -1px rgba(0,0,0,0.02), 0 2px 4px 0 rgba(0,0,0,0.02)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 12,
            background: bgColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
            color,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: 14 }}>
            {title}
          </Text>
          <div style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.2, marginTop: 4 }}>
            {value ?? '-'}
          </div>
        </div>
      </div>
    </Card>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDashboardStats()
      .then((res) => setStats(res.data))
      .catch((err) => message.error((err as Error).message || '获取数据失败'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 120 }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>
        仪表盘
      </Title>
      <Row gutter={[24, 24]}>
        <Col xs={24} sm={8}>
          <StatCard
            title="服务总数"
            value={stats?.totalServices ?? '-'}
            icon={<CloudServerOutlined />}
            color="#6366f1"
            bgColor="#eef2ff"
          />
        </Col>
        <Col xs={24} sm={8}>
          <StatCard
            title="运行中"
            value={stats?.runningServices ?? '-'}
            icon={<CheckCircleOutlined />}
            color="#10b981"
            bgColor="#ecfdf5"
          />
        </Col>
        <Col xs={24} sm={8}>
          <StatCard
            title="部署次数"
            value={stats?.totalDeploys ?? '-'}
            icon={<RocketOutlined />}
            color="#f59e0b"
            bgColor="#fffbeb"
          />
        </Col>
      </Row>
    </div>
  )
}
