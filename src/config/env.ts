interface EnvConfig {
  apiBaseUrl: string
  useMock: boolean
  appTitle: string
}

export const env: EnvConfig = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '',
  useMock: import.meta.env.VITE_USE_MOCK === 'true',
  appTitle: import.meta.env.VITE_APP_TITLE || 'FlowOps',
}
