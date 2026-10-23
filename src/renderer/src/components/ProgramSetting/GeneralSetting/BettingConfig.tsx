import { useContext, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { InputNumber } from '@renderer/components/ui/input-number'
import { SwitchCustom } from '@renderer/components/ui/switch'
import { SettingContext } from '@renderer/context/SettingContext'

function BettingConfig() {
  const context = useContext(SettingContext)
  if (!context) return null

  const { t } = useTranslation(['main', 'layout'])

  const {
    enableRandomizer,
    setRandomizerEnabled,
    fromRandomizer,
    setFromValue,
    toRandomizer,
    setToValue
  } = context.betAmountRandom

  const profile = localStorage.getItem('profile')
  const isTrialAccount = profile ? JSON.parse(profile)?.isTrialAccount : false

  const effectiveBetAmount = useMemo(() => {
    const fromPercentage = Number(fromRandomizer) / 100
    const toPercentage = Number(toRandomizer) / 100

    const fromBet = Math.round(500 * fromPercentage)
    const toBet = Math.round(500 * toPercentage)

    return `$${fromBet} - $${toBet}`
  }, [fromRandomizer, toRandomizer])

  return (
    <div>
      <h1 className="text-sm font-semibold mb-5 border-b pb-2 border-border-default whitespace-nowrap" />

      <div className="grid grid-cols-1 gap-2 mb-2">
        <div className="flex flex-col space-y-6 p-2 pl-0">
          <div className="flex">
            <div className="w-[300px] text-sm flex-shrink-0 whitespace-nowrap font-semibold">
              {t('bet_amount_randomizer')}
            </div>
            <div className="w-[400px] flex flex-wrap gap-2 flex-shrink-0">
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <SwitchCustom
                    disabled={isTrialAccount}
                    checked={Boolean(enableRandomizer)}
                    onCheckedChange={() => setRandomizerEnabled(Number(!enableRandomizer))}
                  />
                  <span className="text-sm font-medium">{t('enable', { ns: 'layout' })}</span>
                </div>
                <div className="text-[#94979C] font-normal text-sm whitespace-nowrap">
                  {t('effective_bet_amount_eg2')}
                </div>
              </div>

              <div className="flex w-full gap-2 mt-2">
                <div className="w-full">
                  <div className="text-sm mb-1  font-medium whitespace-nowrap">
                    {t('from_0_100_percent')}
                  </div>
                  <InputNumber
                    precision={0}
                    min={0}
                    max={100}
                    step={1}
                    disabled={!enableRandomizer}
                    value={Number(fromRandomizer)}
                    onChange={(value) => {
                      setFromValue(String(value))
                    }}
                  />
                </div>

                <div className="w-full">
                  <div className="text-sm mb-1  font-medium whitespace-nowrap">
                    {t('to_100_400_percent')}
                  </div>
                  <InputNumber
                    precision={0}
                    min={100}
                    max={400}
                    step={1}
                    disabled={!enableRandomizer}
                    value={Number(toRandomizer)}
                    onChange={(value) => {
                      setToValue(String(value))
                    }}
                  />
                </div>
              </div>

              <div className="w-full">
                <div className="text-sm mb-1  font-medium whitespace-nowrap">
                  {t('calculated_effective_bet_amount')}
                </div>
                <div
                  className={`text-sm font-medium p-1 rounded border text-center border-border-default  whitespace-nowrap ${
                    enableRandomizer ? '' : 'text-gray-600'
                  }`}
                >
                  {effectiveBetAmount}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BettingConfig
