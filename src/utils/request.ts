import axios from 'axios'
import type { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import type { ApiResponse } from '@/types'
import { env } from '@/config/env'

const request = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 100000,
  headers: { 'Content-Type': 'application/json' },
})

request.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = token
  }
  return config
})

request.interceptors.response.use(
  (response: AxiosResponse) => {
    const data = response.data as ApiResponse<unknown>

    if (data.code === 401) {
      localStorage.removeItem('token')
      window.location.href = '/#/login'
      return Promise.reject(new Error(data.msg || '未登录或登录已过期'))
    }

    if (data.code === 403) {
      return Promise.reject(new Error(data.msg || '权限不足'))
    }

    if (data.code !== 200) {
      return Promise.reject(new Error(data.msg || '请求失败'))
    }

    return response.data
  },
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/#/login'
    }
    return Promise.reject(error)
  },
)

export default request
