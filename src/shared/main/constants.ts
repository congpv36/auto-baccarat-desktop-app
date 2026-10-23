import { v4 as uuidv4 } from 'uuid'

import { BET_MODES, GAME_TYPES } from '@shared/common/constants'

export const DEFAULT_SETTING = {
  id: uuidv4(),

  gameType: GAME_TYPES.BIG_SMALL,

  betMode: BET_MODES.Random,

  ipAddress: '',
  port: '0',
  username: '',
  password: '',

  enableRandomizer: 0,
  fromRandomizer: '50',
  toRandomizer: '200'
}

export const DEFAULT_SPORTS_BOOK_CONFIG = {
  betFixedAmountValue: '10',

  isSwitchBySuccessCount: 0,
  minSuccessCount: '5',
  maxSuccessCount: '10',

  isSwitchByCredit: 0,
  maxCredit: '50'
}

export const STATUS_ACCOUNT = {
  LOGIN: 'Login',
  LOGOUT: 'Logout',
  EXIT: 'Exit',
  IN_PROGRESS: 'In-Progress'
}

export const DEFAULT_ACCOUNT_STATUS = {
  status: STATUS_ACCOUNT.LOGIN,
  autoLoginAttempts: 0,
  checkBoxBet: 1,
  checkBoxRefresh: 1,
  checkBoxAutoLogin: 0,
  winBetsCount: 0,
  statusLogin: null,
  currency: null,
  credit: '0',
  cashBalance: '0',
  outstanding: '0',
  givenCredit: '0',
  parent_id: null,
  textLog: null,
  host: null,
  cookie: null,
  socketUrl: null,
  uid: null
}

export const STATUS_LOGIN = {
  SUCCESS: 'Success',
  FAIL: 'Fail'
}

export const OPTIONS_PROXY = {
  NONE: 'None',
  FULL: 'Full',
  ONLY_LOGIN: 'OnlyLogin'
}
