interface EnvConfig {
  apiBaseUrl: string
  appTitle: string
}

export const env: EnvConfig = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '',
  appTitle: import.meta.env.VITE_APP_TITLE || 'FlowOps',
}
