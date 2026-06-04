import { useEffect, useState } from 'react'
import { Col, DatePicker, message, Row, Select, Table, Tabs, Typography } from 'antd'
import type { TableProps } from 'antd'
import { getLogContent, getLogDates, getLogFiles } from '@/api/logs'
import { getProjectList } from '@/api/projects'
import { getServiceList } from '@/api/services'
import LogViewer from '@/components/LogViewer'
import type { DeployService, Project } from '@/types'
import dayjs from 'dayjs'

const { Title } = Typography

export default function DeployLogs() {
  const [projects, setProjects] = useState<Project[]>([])
  const [allServices, setAllServices] = useState<DeployService[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null)
  const [logType, setLogType] = useState<'deploy' | 'app'>('deploy')
  const [dates, setDates] = useState<string[]>([])
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [files, setFiles] = useState<string[]>([])
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [logContent, setLogContent] = useState('')
  const [loadingContent, setLoadingContent] = useState(false)
  const [loadingFiles, setLoadingFiles] = useState(false)

  // Load projects and services on mount
  useEffect(() => {
    getProjectList()
      .then((res) => setProjects(res.data || []))
      .catch(() => message.error('获取项目列表失败'))
    getServiceList()
      .then((res) => setAllServices(res.data || []))
      .catch(() => message.error('获取服务列表失败'))
  }, [])

  // Reset service when project changes
  useEffect(() => {
    setSelectedServiceId(null)
  }, [selectedProjectId])

  // Fetch dates when service/type changes
  useEffect(() => {
    if (!selectedServiceId) {
      setDates([])
      setSelectedDate('')
      return
    }
    getLogDates(selectedServiceId, logType)
      .then((res) => {
        const d = res.data || []
        setDates(d)
        setSelectedDate(d.length > 0 ? d[d.length - 1] : '')
      })
      .catch(() => {
        setDates([])
        setSelectedDate('')
      })
  }, [selectedServiceId, logType])

  // Fetch files when date changes
  useEffect(() => {
    if (!selectedServiceId || !selectedDate) {
      setFiles([])
      setActiveFile(null)
      setLogContent('')
      return
    }
    setLoadingFiles(true)
    getLogFiles(selectedServiceId, logType, selectedDate)
      .then((res) => {
        setFiles(res.data || [])
        setActiveFile(null)
        setLogContent('')
      })
      .catch(() => setFiles([]))
      .finally(() => setLoadingFiles(false))
  }, [selectedServiceId, logType, selectedDate])

  const viewFile = async (filename: string) => {
    if (!selectedServiceId || !selectedDate) return
    setActiveFile(filename)
    setLogContent('')
    setLoadingContent(true)
    try {
      const res = await getLogContent(selectedServiceId, logType, selectedDate, filename)
      setLogContent(res.data)
    } catch (err) {
      setLogContent('加载失败: ' + (err as Error).message)
    } finally {
      setLoadingContent(false)
    }
  }

  const filteredServices = selectedProjectId
    ? allServices.filter((s) => s.projectId === selectedProjectId)
    : allServices

  const columns: TableProps<string>['columns'] = [
    {
      title: '文件名',
      dataIndex: 'toString',
      render: (_, filename) => (
        <a
          onClick={() => viewFile(filename)}
          style={{
            cursor: 'pointer',
            color: activeFile === filename ? '#1677ff' : undefined,
            fontWeight: activeFile === filename ? 500 : undefined,
          }}
        >
          {filename}
        </a>
      ),
    },
  ]

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>日志查看</Title>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <Select
          placeholder="选择项目"
          value={selectedProjectId}
          onChange={setSelectedProjectId}
          allowClear
          style={{ width: 180 }}
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
        />
        <Select
          placeholder="选择服务"
          value={selectedServiceId}
          onChange={setSelectedServiceId}
          allowClear
          style={{ width: 180 }}
          options={filteredServices.map((s) => ({ value: s.id, label: s.name }))}
          disabled={!selectedProjectId && allServices.length > 20}
        />
        <Tabs
          activeKey={logType}
          onChange={(key) => setLogType(key as 'deploy' | 'app')}
          items={[
            { key: 'deploy', label: '部署日志' },
            { key: 'app', label: '应用日志' },
          ]}
          style={{ marginBottom: 0 }}
        />
        <DatePicker
          value={selectedDate ? dayjs(selectedDate) : null}
          onChange={(d) => setSelectedDate(d ? d.format('YYYY-MM-dd') : '')}
          allowClear={false}
          disabledDate={(d) => {
            const formatted = d.format('YYYY-MM-dd')
            return dates.length > 0 && !dates.includes(formatted)
          }}
          placeholder="选择日期"
        />
      </div>

      {/* Content area */}
      <Row gutter={16}>
        <Col span={6}>
          <div style={{ border: '1px solid #f0f0f0', borderRadius: 4, padding: 8, height: 'calc(100vh - 280px)', overflow: 'auto' }}>
            <Table
              columns={columns}
              dataSource={files}
              rowKey={(f) => f}
              loading={loadingFiles}
              pagination={false}
              size="small"
              locale={{ emptyText: selectedServiceId ? '暂无日志' : '请先选择服务' }}
            />
          </div>
        </Col>
        <Col span={18}>
          <LogViewer content={logContent} loading={loadingContent} />
        </Col>
      </Row>
    </div>
  )
}
