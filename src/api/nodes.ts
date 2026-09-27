import request from '@/utils/request'
import type { ApiResponse, NodeInfo, RegisteredNode, SshTarget, SshTestResult } from '@/types'

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
