import request from '@/utils/request'
import type {
  ApiResponse,
  ImportableNetwork,
  NetworkInfo,
  ProjectNetwork,
} from '@/types'

// ==================== 全局网络管理（仅超级管理员） ====================

export function getNetworkList(): Promise<ApiResponse<NetworkInfo[]>> {
  return request.get('/api/networks')
}

export function getImportableNetworks(): Promise<ApiResponse<ImportableNetwork[]>> {
  return request.get('/api/networks/importable')
}

export function createNetwork(data: {
  name: string
  displayName?: string
}): Promise<ApiResponse<NetworkInfo>> {
  return request.post('/api/networks', data)
}

export function importNetwork(data: {
  name: string
  displayName?: string
}): Promise<ApiResponse<NetworkInfo>> {
  return request.post('/api/networks/import', data)
}

export function deleteNetwork(networkId: number): Promise<ApiResponse<null>> {
  return request.delete(`/api/networks/${networkId}`)
}

export function grantNetworkToProject(
  networkId: number,
  projectId: number,
): Promise<ApiResponse<null>> {
  return request.put(`/api/networks/${networkId}/projects/${projectId}`)
}

export function revokeNetworkFromProject(
  networkId: number,
  projectId: number,
): Promise<ApiResponse<null>> {
  return request.delete(`/api/networks/${networkId}/projects/${projectId}`)
}

// ==================== 项目视角 ====================

/** 项目已授权且主节点 Docker 实际存在的网络 */
export function getProjectNetworks(projectId: number): Promise<ApiResponse<ProjectNetwork[]>> {
  return request.get(`/api/projects/${projectId}/networks`)
}

export function getDefaultNetwork(
  projectId: number,
): Promise<ApiResponse<{ networkId: number | null }>> {
  return request.get(`/api/projects/${projectId}/default-network`)
}

/** networkId 传 null 表示清除项目默认网络 */
export function setDefaultNetwork(
  projectId: number,
  networkId: number | null,
): Promise<ApiResponse<null>> {
  return request.put(`/api/projects/${projectId}/default-network`, { networkId })
}
