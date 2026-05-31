import request from '@/utils/request'
import type { ApiResponse, DeployService } from '@/types'

export function getServiceList(): Promise<ApiResponse<DeployService[]>> {
  return request.get('/api/services/list')
}

export function getService(id: number): Promise<ApiResponse<DeployService>> {
  return request.get(`/api/services/${id}`)
}

export function createService(data: Record<string, unknown>): Promise<ApiResponse<null>> {
  return request.post('/api/services/create', data)
}

export function updateService(id: number, data: Record<string, unknown>): Promise<ApiResponse<null>> {
  return request.put(`/api/services/${id}`, data)
}

export function deleteService(id: number): Promise<ApiResponse<null>> {
  return request.delete(`/api/services/${id}`)
}

export function uploadJar(serviceId: number, file: File): Promise<ApiResponse<string>> {
  const form = new FormData()
  form.append('file', file)
  form.append('type', 'jar')
  return request.post(`/api/deploy/upload/${serviceId}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export function uploadBinary(serviceId: number, file: File): Promise<ApiResponse<string>> {
  const form = new FormData()
  form.append('file', file)
  form.append('type', 'binary')
  return request.post(`/api/deploy/upload/${serviceId}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export function uploadDist(serviceId: number, file: File): Promise<ApiResponse<null>> {
  const form = new FormData()
  form.append('file', file)
  return request.post(`/api/deploy/upload-dist/${serviceId}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
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
