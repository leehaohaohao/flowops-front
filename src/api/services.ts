import request from '@/utils/request'
import type { ApiResponse, DeployService } from '@/types'

export function getServiceList(): Promise<ApiResponse<DeployService[]>> {
  return request.get('/api/services/list')
}

export function getService(id: number): Promise<ApiResponse<DeployService>> {
  return request.get(`/api/services/${id}`)
}

export function deleteService(id: number): Promise<ApiResponse<null>> {
  return request.delete(`/api/services/${id}`)
}

export function deployStart(id: number): Promise<ApiResponse<null>> {
  return request.post(`/api/deploy/start/${id}`)
}

export function deployStop(id: number): Promise<ApiResponse<null>> {
  return request.post(`/api/deploy/stop/${id}`)
}

export function deployRestart(id: number): Promise<ApiResponse<null>> {
  return request.post(`/api/deploy/restart/${id}`)
}

export function deployRemove(id: number): Promise<ApiResponse<null>> {
  return request.post(`/api/deploy/remove/${id}`)
}
