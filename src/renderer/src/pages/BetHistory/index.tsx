import { useTranslation } from 'react-i18next'

import ListBetHistory from '@renderer/components/BetHistory/ListBetHistory'

function BetHistory() {
  const { t } = useTranslation('layout')

  return (
    <div className="h-[99%] mt-[10px] mx-[12px] flex flex-col">
      <div className="font-bold">{t('bet_history')}</div>

      <div className="flex-1 overflow-x-auto custom-scrollbar mb-3">
        <div className="h-full">
          <ListBetHistory />
        </div>
      </div>
    </div>
  )
}

export default BetHistory
