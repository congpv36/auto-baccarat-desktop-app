import { Account, Setting, SportsBook } from '@db/model'
import { SettingSchemaType } from '@db/schema/setting'

import { AccountType } from '@shared/common/types'
import { DEFAULT_ACCOUNT_STATUS } from '@shared/main/constants'

export function handleCollectUserSettingOnApp() {
  const listAccount = Account.findAll() as AccountType[]
  const listAccountDefault = listAccount.map((account) => ({
    ...account,
    ...DEFAULT_ACCOUNT_STATUS
  }))

  const listSportsBook = SportsBook.findAll()

  const dataSetting = Setting.findAll() as SettingSchemaType[]

  const settingsBundle = {
    accounts: listAccountDefault,
    sportsBook: listSportsBook,
    settings: dataSetting
  }
  return settingsBundle
}
