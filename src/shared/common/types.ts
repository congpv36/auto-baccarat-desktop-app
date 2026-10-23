export type PlatformUrlType = {
  id: string
  url: string
  platformName: string
}

export type SettingTableViewType = {
  id: number
  tab: string
  contraStrategy: string
  clear: number
  scroll: number
}

export type TicketInfoDataBetType = {
  id: number

  isBetAllowed: boolean
  betRejectionReason: string

  checkOdd: number
  oddFrom: string
  oddTo: string

  HDP: string
  submatch_id: number | null
  altLineId: number
  marketSelectionId_home_over: number | null
  marketSelectionId_away_under: number | null

  type_away_under: number
  type_home_over: number

  away: string | null
  away_under: number
  bet: string
  betAmount_Standard: string
  betType: number
  company: string
  coverage: string
  gameType: string
  hdp_point: number
  home: string | null
  home_over: number
  idAccount: string
  idEvent: number
  isHomeStrong: number | null
  idLeague: number
  uuidLeague: string | null
  info: string | null
  league: string | null
  nameAway: string
  nameHome: string
  nameLeague: string

  score: string
  redCard: string
  stat: string
  type: string

  number: number
  odd: number
  platform: string
  profit: number
  receiptID: string | null
  receiptStatus: string
  specialOdd: number | null
  time: string
  typeOdd: string
}

export type BetListDBType = {
  id: number
  dataPair: string
}

export type BetHistoryType = {
  id: number
  gameType: string
  loginID: string
  time: string
  round: string
  betChoice: string
  result: string
  stake: string
  refund: string
  win: string
}

export type PlatformType = {
  id: number
  uuid: string
  url: string
  name: string
}

export type AccountType = {
  id: string

  orderID: number
  winBetsCount: number
  autoLoginAttempts: number

  loginID: string
  password: string
  secret: string | null

  limitMethod: string
  livePreGame: number
  limitType: string
  totalAmount: string
  totalCount: string

  platformName: string
  loginURL: string

  currency: string
  cashBalance: string
  outstanding: string
  credit: string
  givenCredit: string

  textLog: string

  customIP: string
  proxyIP: string
  proxyPort: string
  proxyUsername: string
  proxyPassword: string
  proxyScope: string

  typeCrawl: string

  checkBoxBet: number
  checkBoxRefresh: number
  checkBoxAutoLogin: number
  checkBoxLockURL: number

  statusLogin: string | null
  statusPair: number
  status: string
  statusDelete: number

  cookie: string
  vHucode: string
  hdToken: string
  token: string

  host: string
  socketUrl: string
  parent_id: string | null
  uid: string
}

export interface DataPlatformType extends SportsBookType {
  accounts: AccountType[]
}

export type SportsBookType = {
  id: string
  name: string
  platform: string
  url: string

  betFixedAmountValue: string

  isSwitchBySuccessCount: number
  minSuccessCount: string
  maxSuccessCount: string

  isSwitchByCredit: number
  maxCredit: string

  lockURL: number
}

export type SettingType = {
  id: string

  gameType: string

  ipAddress: string
  port: string
  username: string
  password: string

  enableRandomizer: number
  fromRandomizer: string
  toRandomizer: string

  betMode: string
  language: string
}
