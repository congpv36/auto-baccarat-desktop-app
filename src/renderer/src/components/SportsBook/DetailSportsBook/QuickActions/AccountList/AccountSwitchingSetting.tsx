import React from 'react'
import { useTranslation } from 'react-i18next'
import BoxLabel from '@renderer/layouts/BoxLabel'

import { Checkbox } from '@renderer/components/ui/checkbox'
import { InputNumber } from '@renderer/components/ui/input-number'

type SwitchSettings = {
  isSwitchBySuccessCount: number
  isSwitchByCredit: number
  minSuccessCount: string
  maxSuccessCount: string
  maxCredit: string
}

type AccountSwitchingSettingProps = {
  settings: SwitchSettings
  onSettingsChange: (newSettings: SwitchSettings) => void
}

const AccountSwitchingSetting: React.FC<AccountSwitchingSettingProps> = ({
  settings,
  onSettingsChange
}) => {
  const { t } = useTranslation(['main', 'layout'])
  const handleChange = (key: string, value: string | number) => {
    onSettingsChange({
      ...settings,
      [key]: value
    })
  }

  const numericInputProps = {
    type: 'number',
    min: '0',
    step: 1,
    pattern: '[0-9]*',
    onKeyDown: (e: { key: string; preventDefault: () => void }) => {
      if (['e', 'E', '+', ',', '-', '.'].includes(e.key)) e.preventDefault()
      const allowedKeys = ['Backspace', 'ArrowLeft', 'ArrowRight', 'Delete', 'Tab']
      if (!/^[0-9]$/.test(e.key) && !allowedKeys.includes(e.key)) e.preventDefault()
    }
  }

  return (
    <BoxLabel label={t('account_switching_setting')} className="w-full pt-7 pb-2 px-2">
      <div className="flex gap-20">
        {/* Success Count Block */}
        <div className="flex gap-2">
          <div className="flex items-center justify-center">
            <Checkbox
              id="success-count-toggle"
              checked={Boolean(settings.isSwitchBySuccessCount)}
              onCheckedChange={(checked) => handleChange('isSwitchBySuccessCount', Number(checked))}
            />
            <label htmlFor="success-count-toggle" className="mx-1 cursor-pointer text-sm">
              {t('switching_when_bet_success_count')}
            </label>
            <span className="leading-none">{'>'} </span>=
          </div>
          <div className="w-14">
            <InputNumber
              {...numericInputProps}
              precision={0}
              min={1}
              max={45}
              step={1}
              disabled={!settings.isSwitchBySuccessCount}
              value={Number(settings.minSuccessCount)}
              onChange={(value) => {
                handleChange('minSuccessCount', String(value))
              }}
            />
          </div>
          <div className="w-14">
            <InputNumber
              {...numericInputProps}
              precision={0}
              min={1}
              max={45}
              step={1}
              disabled={!settings.isSwitchBySuccessCount}
              value={Number(settings.maxSuccessCount)}
              onChange={(value) => {
                handleChange('maxSuccessCount', String(value))
              }}
            />
          </div>
        </div>

        {/* Credit Block */}
        <div className="flex gap-2">
          <div className="flex items-center justify-center">
            <Checkbox
              id="credit-toggle"
              checked={Boolean(settings.isSwitchByCredit)}
              onCheckedChange={(checked) => handleChange('isSwitchByCredit', Number(checked))}
            />
            <label htmlFor="credit-toggle" className="mx-1 cursor-pointer">
              {t('switching_when_bet_credit')}
            </label>
            <span className="leading-none">{'<'}</span> =
          </div>
          <div className="w-20">
            <InputNumber
              {...numericInputProps}
              precision={0}
              min={0}
              max={999999}
              step={1}
              disabled={!settings.isSwitchByCredit}
              value={Number(settings.maxCredit ?? 50)}
              onChange={(value) => {
                handleChange('maxCredit', String(value))
              }}
            />
          </div>
        </div>
      </div>
    </BoxLabel>
  )
}

export default React.memo(AccountSwitchingSetting)
