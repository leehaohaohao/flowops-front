import request from '@/utils/request'
import type {
  ApiResponse,
  NodeInfo,
  PackageDistribution,
  RegisteredNode,
  RunnerPackage,
  SshTarget,
  SshTestResult,
} from '@/types'

export function getNodeList(): Promise<ApiResponse<NodeInfo[]>> {
  return request.get('/api/nodes')
}

export function getNode(runnerId: string): Promise<ApiResponse<NodeInfo>> {
  return request.get(`/api/nodes/${runnerId}`)
}

export function getRegistry(): Promise<ApiResponse<RegisteredNode[]>> {
  return request.get('/api/nodes/registry')
}

export function createRegistry(data: {
  runnerId: string
  nodeName?: string
  token: string
}): Promise<ApiResponse<null>> {
  return request.post('/api/nodes/registry', data)
}

export function updateRegistry(
  runnerId: string,
  data: { nodeName?: string; token?: string },
): Promise<ApiResponse<null>> {
  return request.put(`/api/nodes/registry/${runnerId}`, data)
}

export function deleteRegistry(runnerId: string): Promise<ApiResponse<null>> {
  return request.delete(`/api/nodes/registry/${runnerId}`)
}

// ==================== 宿主机 SSH 设置与连接测试（仅超级管理员） ====================

/** 读取 SSH 设置与最近一次测试结果；未配置时 data 为 null */
export function getNodeSsh(runnerId: string): Promise<ApiResponse<SshTarget | null>> {
  return request.get(`/api/nodes/registry/${runnerId}/ssh`)
}

/** 全量保存 SSH 设置（私钥只传别名，不传内容）；保存后清空旧测试结果 */
export function saveNodeSsh(
  runnerId: string,
  data: {
    host: string
    port: number
    username: string
    keyAlias: string
    hostKeySha256: string
    /** ED25519 / ECDSA / RSA；与 hostKeySha256 指向同一把主机公钥 */
    hostKeyAlgorithm: string
  },
): Promise<ApiResponse<SshTarget>> {
  return request.put(`/api/nodes/registry/${runnerId}/ssh`, data)
}

/** 用已保存的设置执行一次只读连接验证；连接是否成功由 resultCode 表达 */
export function testNodeSsh(runnerId: string): Promise<ApiResponse<SshTestResult>> {
  return request.post(`/api/nodes/registry/${runnerId}/ssh/test`)
}

// ==================== 执行器发布包（仅超级管理员） ====================

/** 上传发布包；1 GiB 级上传需覆盖全局 100 秒超时 */
export function uploadRunnerPackage(file: File): Promise<ApiResponse<RunnerPackage>> {
  const form = new FormData()
  form.append('file', file)
  return request.post('/api/nodes/packages', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 0,
  })
}

/** 主节点已存储的发布包列表（按上传时间倒序） */
export function getRunnerPackages(): Promise<ApiResponse<RunnerPackage[]>> {
  return request.get('/api/nodes/packages')
}

export function getRunnerPackage(sha256: string): Promise<ApiResponse<RunnerPackage>> {
  return request.get(`/api/nodes/packages/${sha256}`)
}

/** 触发一次分发（异步，立即返回 PENDING 记录）；传输可能远超全局超时 */
export function distributeRunnerPackage(
  runnerId: string,
  sha256: string,
): Promise<ApiResponse<PackageDistribution>> {
  return request.post(
    `/api/nodes/registry/${runnerId}/packages/${sha256}/distribute`,
    undefined,
    { timeout: 0 },
  )
}

/** 该节点各包的最新一次分发记录（按记录 id 倒序） */
export function getNodePackageDistributions(
  runnerId: string,
): Promise<ApiResponse<PackageDistribution[]>> {
  return request.get(`/api/nodes/registry/${runnerId}/packages`)
}

/** 轮询单条分发记录 */
export function getPackageDistribution(
  runnerId: string,
  id: number,
): Promise<ApiResponse<PackageDistribution>> {
  return request.get(`/api/nodes/registry/${runnerId}/packages/distributions/${id}`)
}
