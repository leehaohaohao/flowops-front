import type { DeployService, UserInfo } from '@/types'

export const PERM_LABEL: Record<string, string> = {
  VIEW: '查看',
  DEPLOY: '部署',
  START: '启动',
  STOP: '停止',
  UPLOAD: '上传',
  EDIT_CONFIG: '编辑配置',
  DELETE: '删除',
  MANAGE_MEMBERS: '管理成员',
  MANAGE_PROJECTS: '管理项目',
}

export function hasPermission(userInfo: UserInfo, service: DeployService, permCode: string): boolean {
  if (userInfo.superAdmin) return true
  if (isSupervisor(userInfo, service.projectId)) return true
  const perms = userInfo.projectPermissions?.[String(service.projectId)]
  return perms?.includes(permCode) ?? false
}

export function isSupervisor(userInfo: UserInfo, projectId?: number): boolean {
  if (userInfo.superAdmin) return true
  if (!projectId) return userInfo.projects?.some((p) => p.roleName === 'supervisor') ?? false
  return userInfo.projects?.some((p) => p.id === projectId && p.roleName === 'supervisor') ?? false
}
