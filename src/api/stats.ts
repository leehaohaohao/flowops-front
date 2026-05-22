import request from '@/utils/request'
import type { ApiResponse, DashboardStats } from '@/types'

export function getDashboardStats(): Promise<ApiResponse<DashboardStats>> {
  return request.get('/api/stats/dashboard')
}
