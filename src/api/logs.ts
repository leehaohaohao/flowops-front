import request from '@/utils/request'
import type { ApiResponse } from '@/types'

export function getLogFiles(
  serviceId: number,
  type: string,
  date: string,
): Promise<ApiResponse<string[]>> {
  return request.get('/api/logs/list', { params: { serviceId, type, date } })
}

export function getLogDates(
  serviceId: number,
  type: string,
): Promise<ApiResponse<string[]>> {
  return request.get('/api/logs/dates', { params: { serviceId, type } })
}

export function getLogContent(
  serviceId: number,
  type: string,
  date: string,
  filename: string,
  offset = 0,
  limit = 5000,
): Promise<ApiResponse<string>> {
  return request.get('/api/logs/content', {
    params: { serviceId, type, date, filename, offset, limit },
  })
}

export function getContainerLogs(
  serviceId: number,
  params?: { tail?: number; since?: string; until?: string; timestamps?: boolean },
): Promise<ApiResponse<string>> {
  return request.get(`/api/logs/container/${serviceId}`, { params })
}
