import { v4 as uuidv4 } from 'uuid'

import { AccountType } from '@shared/common/types'

export const ALLOWED_PLATFORM_NAMES = ['Viva88Bet'] as const

export const EMPTY_ACCOUNT: AccountType = {
  id: uuidv4(),

  orderID: 0,
  winBetsCount: 0,
  autoLoginAttempts: 0,

  loginID: '',
  password: '',
  secret: '',

  limitMethod: '',
  livePreGame: 0,
  limitType: '',
  totalAmount: '',
  totalCount: '',

  platformName: '',
  loginURL: '',

  currency: '',
  credit: '',
  cashBalance: '',
  outstanding: '',
  givenCredit: '',
  textLog: '',

  customIP: '',
  proxyIP: '',
  proxyPort: '',
  proxyUsername: '',
  proxyPassword: '',
  proxyScope: 'None',

  typeCrawl: '',

  checkBoxBet: 0,
  checkBoxRefresh: 0,
  checkBoxAutoLogin: 0,
  checkBoxLockURL: 0,

  statusLogin: null,
  statusPair: 0,
  status: '',
  statusDelete: 0,

  cookie: '',
  vHucode: '',
  hdToken: '',
  token: '',
  host: '',
  socketUrl: '',
  parent_id: null,
  uid: ''
}

export const PROGRAM_SETTING_LIST = [
  { id: 'general-setting', label: 'General Settings', key: 'general_settings' },
  { id: 'proxy-setting', label: 'Proxy Server Setting', key: 'proxy_server_setting' },
  { id: 'language', label: 'Language', key: 'language' }
]
