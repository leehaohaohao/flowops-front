import type { DeployService, UserInfo } from '@/types'

export function hasPermission(userInfo: UserInfo, service: DeployService, permCode: string): boolean {
  if (userInfo.isSuperAdmin) return true
  const perms = userInfo.projectPermissions?.[String(service.projectId)]
  return perms?.includes(permCode) ?? false
}

export function isSupervisor(userInfo: UserInfo, groupId?: number): boolean {
  if (userInfo.isSuperAdmin) return true
  if (!groupId) return userInfo.groups?.some((g) => g.isSupervisor) ?? false
  return userInfo.groups?.some((g) => g.id === groupId && g.isSupervisor) ?? false
}
