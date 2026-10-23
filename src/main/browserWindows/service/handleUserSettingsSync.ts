/* eslint-disable @typescript-eslint/no-explicit-any */
import { Account, Setting, SportsBook } from '@db/model'

import { systemLogToFile } from '@/worker/lib/systemLogToFile'

type SyncConfig<T, R = T> = {
  data?: T[]
  model: {
    findAll: () => R[]
    insertMany: (data: R[]) => void
  }
  transform?: (item: T) => R
}

const SPORTS_BOOK_COLUMNS = [
  'id',
  'name',
  'platform',
  'url',
  'betFixedAmountValue',
  'isSwitchBySuccessCount',
  'minSuccessCount',
  'maxSuccessCount',
  'isSwitchByCredit',
  'maxCredit',
  'lockURL'
]

const pickColumns = (item: Record<string, any>, columns: string[]) =>
  Object.fromEntries(columns.filter((key) => key in item).map((key) => [key, item[key]]))

const syncIfEmpty = <T, R = T>({ data, model, transform }: SyncConfig<T, R>) => {
  if (!data || data.length === 0) return

  const existed = model.findAll()
  if (existed.length > 0) return

  const insertData = transform ? data.map(transform) : (data as unknown as R[])
  model.insertMany(insertData)
}

export const handleUserSettingsSync = async (accessToken: string) => {
  try {
    const res = await fetch(`${import.meta.env.VITE_URL}/user/users/setting`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      }
    })

    const { data } = (await res.json()) as {
      data: Record<string, any>
    }

    if (!data || Object.keys(data).length === 0) {
      return
    }

    const { accounts = [], settings = [], sportsBook = [] } = data

    syncIfEmpty({ data: settings, model: Setting })
    syncIfEmpty({
      data: sportsBook,
      model: SportsBook,
      transform: (item: Record<string, any>) => pickColumns(item, SPORTS_BOOK_COLUMNS)
    })

    syncIfEmpty({ data: accounts, model: Account })
  } catch (error) {
    console.error('HandleUserSettingsSync error:', error)
    await systemLogToFile(`HandleUserSettingsSync error`, 'Program')
  }
}
