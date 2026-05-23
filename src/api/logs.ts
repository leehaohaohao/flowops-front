import request from '@/utils/request'
import type { ApiResponse } from '@/types'

export function getLogList(): Promise<ApiResponse<string[]>> {
  return request.get('/api/logs/list')
}

export function getLogContent(filename: string, offset = 0, limit = 1000): Promise<ApiResponse<string>> {
  return request.get('/api/logs/content', { params: { filename, offset, limit } })
}

export function getContainerLogs(serviceId: number, tail = 500): Promise<ApiResponse<string>> {
  return request.get(`/api/deploy/logs/${serviceId}`, { params: { tail } })
}
