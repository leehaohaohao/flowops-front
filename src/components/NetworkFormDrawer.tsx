import { useEffect, useState } from 'react'
import { Button, Drawer, Form, Input, message, Select, Space } from 'antd'
import { createNetwork, getImportableNetworks, importNetwork } from '@/api/networks'
import type { ImportableNetwork } from '@/types'

export type NetworkFormMode = 'create' | 'import'

interface NetworkFormDrawerProps {
  open: boolean
  mode: NetworkFormMode
  onClose: () => void
  /** 创建/导入成功回调，携带新登记网络 id（供调用方自动授权给项目） */
  onSuccess?: (networkId: number) => void
}

/** Docker 网络名：后端还会做严格校验，这里只拦截明显非法输入 */
const NETWORK_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/

/**
 * 主节点网络「创建 / 导入」抽屉（F1 暴露，网络管理页、项目入口与服务编辑页复用）。
 * 仅超级管理员可用，权限由后端兜底。
 */
export default function NetworkFormDrawer({
  open,
  mode,
  onClose,
  onSuccess,
}: NetworkFormDrawerProps) {
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const [importable, setImportable] = useState<ImportableNetwork[]>([])
  const [loadingImportable, setLoadingImportable] = useState(false)

  useEffect(() => {
    if (!open) return
    form.resetFields()
    if (mode !== 'import') return
    setLoadingImportable(true)
    getImportableNetworks()
      .then((res) => setImportable(res.data || []))
      .catch((err) => message.error((err as Error).message || '获取可导入网络失败'))
      .finally(() => setLoadingImportable(false))
  }, [open, mode, form])

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      const payload = {
        name: mode === 'create' ? values.name.trim() : values.name,
        displayName: values.displayName?.trim() || undefined,
      }
      const res =
        mode === 'create' ? await createNetwork(payload) : await importNetwork(payload)
      message.success(res.msg || (mode === 'create' ? '网络已创建' : '网络已导入'))
      onClose()
      if (res.data?.id != null) {
        onSuccess?.(res.data.id)
      }
    } catch (err) {
      if ((err as { errorFields?: unknown }).errorFields) return
      message.error((err as Error).message || '操作失败')
    } finally {
      setSubmitting(false)
    }
  }

  const isCreate = mode === 'create'

  return (
    <Drawer
      title={isCreate ? '新建主节点网络' : '导入已存在的网络'}
      size={480}
      open={open}
      onClose={onClose}
      footer={
        <Space style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={submitting} onClick={handleSubmit}>
            确定
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="name"
          label="网络名称"
          extra={
            isCreate
              ? '将在主节点创建用户自定义 bridge 网络（Docker 默认地址分配）'
              : '选择主节点上尚未登记的已有网络'
          }
          rules={[
            { required: true, message: '请输入网络名称' },
            ...(isCreate
              ? [
                  {
                    pattern: NETWORK_NAME_PATTERN,
                    message: '只能包含字母、数字、下划线、点和连字符，且以字母或数字开头',
                  },
                ]
              : []),
          ]}
        >
          {isCreate ? (
            <Input placeholder="flowops-shared" />
          ) : (
            <Select
              loading={loadingImportable}
              placeholder="选择要导入的网络"
              options={importable.map((item) => ({
                value: item.name,
                label: `${item.name}（${item.driver}）`,
              }))}
              notFoundContent={loadingImportable ? '加载中...' : '暂无可导入的网络'}
            />
          )}
        </Form.Item>
        <Form.Item name="displayName" label="显示名" extra="可选，留空则使用网络名称">
          <Input placeholder="生产共享网络" />
        </Form.Item>
      </Form>
    </Drawer>
  )
}
