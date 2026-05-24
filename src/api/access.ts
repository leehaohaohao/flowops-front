import request from '@/utils/request'
import type { ApiResponse, CrossAccess } from '@/types'

export function grantAccess(data: {
  userId: number
  projectId: number
  permCodes: string[]
}): Promise<ApiResponse<null>> {
  return request.post('/api/access/grant', data)
}

export function getUserAccess(userId: number): Promise<ApiResponse<CrossAccess[]>> {
  return request.get('/api/access', { params: { userId } })
}

export function revokeAccess(id: number): Promise<ApiResponse<null>> {
  return request.delete(`/api/access/${id}`)
}
