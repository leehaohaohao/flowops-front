export interface ApiResponse<T> {
  code: number
  msg: string
  data: T
}

export interface LoginRequest {
  username: string
  password: string
}

export interface UserInfo {
  username: string
  role: string
}

export interface DashboardStats {
  totalServices: number
  runningServices: number
  totalDeploys: number
}

export interface DeployService {
  id: number
  name: string
  port: number
  volumeDir: string
  serviceType: 'backend' | 'frontend' | 'fullstack'
  serviceConfig: string
  status: 'running' | 'stopped'
  createTime: string
  updateTime: string
}
