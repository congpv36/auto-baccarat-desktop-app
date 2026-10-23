import { Trans, useTranslation } from 'react-i18next'

import { Button } from '@renderer/components/ui/button'

export type SabaUnauthorizedInfo = {
  platformName: string
  loginID: string
  // i18n keys (layout namespace); default to the SABA nickname notice
  titleKey?: 'saba_unauthorized_title' | 'region_restricted_title'
  messageKey?: 'saba_unauthorized_message' | 'region_restricted_message'
}

export default function SabaUnauthorizedPopup({
  platformName,
  loginID,
  titleKey = 'saba_unauthorized_title',
  messageKey = 'saba_unauthorized_message',
  onClose
}: SabaUnauthorizedInfo & { onClose: () => void }) {
  const { t } = useTranslation('layout')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="relative rounded-2xl bg-white px-8 py-7 shadow-2xl min-w-[340px] max-w-[420px] text-center">
        <div className="text-lg font-bold mb-1">{t(titleKey)}</div>
        <div className="text-sm text-gray-500 mb-4">
          <Trans
            t={t}
            i18nKey="ps3838_account_info"
            values={{ platformName, loginID }}
            components={{ b: <strong className="font-semibold text-gray-700" /> }}
          />
        </div>

        <div className="text-sm text-gray-700 mb-6">{t(messageKey)}</div>

        <Button className="w-full" onClick={onClose}>
          {t('ok')}
        </Button>
      </div>
    </div>
  )
}
