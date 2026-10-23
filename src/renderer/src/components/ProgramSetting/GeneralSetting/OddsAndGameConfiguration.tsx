import { useContext } from 'react'
import { useTranslation } from 'react-i18next'

import { Label } from '@renderer/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@renderer/components/ui/radio-group'
import { SettingContext } from '@renderer/context/SettingContext'

import { BET_MODES, GAME_TYPES } from '@shared/common/constants'

function OddsAndGameConfiguration() {
  const context = useContext(SettingContext)
  if (!context) return null

  const { t } = useTranslation(['main', 'layout'])

  const handleGameTypeChange = (value: string) => {
    context.gameType.setGameType(value)
    context.betMode.setBetMode(BET_MODES.Random)
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-2 mb-2 border-b border-border-default">
        <div className="flex flex-col space-y-6 p-2 pl-0">
          <div className="flex">
            <div className="w-[300px] text-sm flex-shrink-0 whitespace-nowrap font-semibold">
              {t('game_type')}
            </div>
            <div className=" flex items-center gap-2 flex-shrink-0">
              <div className="flex justify-between w-full">
                <RadioGroup
                  className="flex justify-between w-full"
                  value={context.gameType.gameType}
                  onValueChange={handleGameTypeChange}
                >
                  <div className="flex items-center space-x-1 whitespace-nowrap w-28">
                    <RadioGroupItem value={GAME_TYPES.BIG_SMALL} id="BigSmall" />
                    <Label htmlFor="BigSmall">{t('big_small')}</Label>
                  </div>
                  <div className="flex items-center space-x-1 whitespace-nowrap w-28">
                    <RadioGroupItem value={GAME_TYPES.SE_DIE} id="SeDie" />
                    <Label htmlFor="SeDie">{t('se_die')}</Label>
                  </div>
                  <div className="flex items-center space-x-1 whitespace-nowrap w-28">
                    <RadioGroupItem value={GAME_TYPES.DRAGON_TIGER} id="DragonTiger" />
                    <Label htmlFor="DragonTiger">{t('dragon_tiger')}</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default OddsAndGameConfiguration
