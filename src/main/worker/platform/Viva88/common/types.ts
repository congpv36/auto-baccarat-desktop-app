export type LoginResponse = {
  errorCode: number
  errorMessage: string
  redirectUrl: string
  resCode: number
  userLanguage: string
  msgResourceKey: string | null
  gestureFailCnt: number
  userName: string | null
  nickname: string | null
  requestIp: string | null
  loginCount: number
  lastChangePwdDate: string | null
  custToken: string
}
