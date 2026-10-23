export const getValidatedSwitchSettings = (settings: {
  isSwitchBySuccessCount: number
  isSwitchByCredit: number
  minSuccessCount: string
  maxSuccessCount: string
  maxCredit: string
}) => {
  const minSuccessCount = settings.minSuccessCount?.trim() || '5'
  const maxSuccessCount = settings.maxSuccessCount?.trim() || '10'
  const maxCredit = settings.maxCredit?.trim() || '50'
  return {
    ...settings,
    minSuccessCount,
    maxSuccessCount,
    maxCredit
  }
}
