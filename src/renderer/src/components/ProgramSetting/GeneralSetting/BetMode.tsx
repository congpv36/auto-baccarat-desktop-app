import { useContext } from 'react'
import { useTranslation } from 'react-i18next'

import { Label } from '@renderer/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@renderer/components/ui/radio-group'
import { SettingContext } from '@renderer/context/SettingContext'

import { BET_MODES, BET_MODES_BY_GAME_TYPE } from '@shared/common/constants'

const BET_MODE_LABEL_KEYS = {
  [BET_MODES.Random]: 'random',
  [BET_MODES.Big]: 'big',
  [BET_MODES.Small]: 'small',
  [BET_MODES.Even]: 'even',
  [BET_MODES.Odd]: 'odd',
  [BET_MODES.Dragon]: 'dragon',
  [BET_MODES.Tiger]: 'tiger'
} as const

function BetMode() {
  const { t } = useTranslation('main')

  const context = useContext(SettingContext)
  if (!context) return null

  const betModes = BET_MODES_BY_GAME_TYPE[context.gameType.gameType] ?? [BET_MODES.Random]
  const betMode = betModes.includes(context.betMode.betMode)
    ? context.betMode.betMode
    : BET_MODES.Random

  return (
    <div className="pt-3">
      <div className="text-base font-semibold flex">
        <div className="w-[300px] text-sm font-semibold">{t('bet_mode')}</div>
        <div className=" flex items-center">
          <div className="flex w-full">
            <RadioGroup
              className="flex gap-16"
              value={betMode}
              onValueChange={context.betMode.setBetMode}
            >
              {betModes.map((mode) => (
                <div key={mode} className="flex items-center space-x-1 whitespace-nowrap w-28">
                  <RadioGroupItem value={mode} id={`BetMode_${mode}`} />
                  <Label htmlFor={`BetMode_${mode}`} className="text-sm font-medium">
                    {t(BET_MODE_LABEL_KEYS[mode])}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BetMode
