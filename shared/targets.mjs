export const targets = [
  { id: 'production', name: 'Production', url: 'https://karturt.vercel.app/' },
  { id: 'uat', name: 'UAT', url: 'https://karturt-v1-uat-preview-git-main-rt-6.vercel.app/' },
]

export const intervalMinutes = 30
export const staleMinutes = 75
export const retentionDays = 7
export const statusFeedUrl = 'https://raw.githubusercontent.com/karturt-app/karturt-monitoring/status-data/status.json'
