import request from '@/utils/request'
import type { ApiResponse, NodeInfo } from '@/types'

export function getNodeList(): Promise<ApiResponse<NodeInfo[]>> {
  return request.get('/api/nodes')
}

export function getNode(runnerId: string): Promise<ApiResponse<NodeInfo>> {
  return request.get(`/api/nodes/${runnerId}`)
}
