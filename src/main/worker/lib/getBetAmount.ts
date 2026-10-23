import { Setting, SportsBook } from '@db/model'
import { SettingSchemaType } from '@db/schema/setting'

import { SportsBookType } from '@shared/common/types'

function getRandomInt(from: number, to: number): number {
  const min = Math.min(from, to)
  const max = Math.max(from, to)
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * Stake = SportsBook.betFixedAmountValue of the platform.
 * When Setting.enableRandomizer = 1, the stake is scaled by a random percentage
 * between fromRandomizer and toRandomizer (e.g. 50-150 => 50%-150% of the base).
 */
export function getBetAmount(platformName: string): number {
  const sportsBook = SportsBook.findOne<SportsBookType>({ platform: platformName })
  const baseAmount = Number(sportsBook?.betFixedAmountValue)
  if (!Number.isFinite(baseAmount) || baseAmount <= 0) return 0

  const setting = (Setting.findAll() as SettingSchemaType[])[0]
  if (Number(setting?.enableRandomizer) !== 1) return baseAmount

  const from = Number(setting.fromRandomizer)
  const to = Number(setting.toRandomizer)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return baseAmount

  const randomAmount = Math.round((baseAmount * getRandomInt(from, to)) / 100)
  return randomAmount > 0 ? randomAmount : baseAmount
}
