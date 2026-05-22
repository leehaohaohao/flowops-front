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
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div>
      <Title level={2}>仪表盘</Title>
      <Row gutter={16} style={{ marginTop: 24 }}>
        <Col span={8}>
          <Card hoverable>
            <Statistic
              title="服务总数"
              value={stats?.totalServices ?? '-'}
              prefix={<CloudServerOutlined />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card hoverable>
            <Statistic
              title="运行中"
              value={stats?.runningServices ?? '-'}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card hoverable>
            <Statistic
              title="部署次数"
              value={stats?.totalDeploys ?? '-'}
              prefix={<RocketOutlined />}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
