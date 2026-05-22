import { useEffect, useState } from 'react'
import { Card, Col, message, Row, Spin, Statistic, Typography } from 'antd'
import { CheckCircleOutlined, CloudServerOutlined, RocketOutlined } from '@ant-design/icons'
import { getDashboardStats } from '@/api/stats'
import type { DashboardStats } from '@/types'

const { Title } = Typography

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
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="服务总数"
              value={stats?.totalServices ?? 0}
              prefix={<CloudServerOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="运行中"
              value={stats?.runningServices ?? 0}
              prefix={<CheckCircleOutlined />}
              styles={{ content: { color: '#3f8600' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="部署次数"
              value={stats?.totalDeploys ?? 0}
              prefix={<RocketOutlined />}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
