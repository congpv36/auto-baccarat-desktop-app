import React from 'react'
import { useEffect, useState } from 'react'

import TableData from '@renderer/components/BetListContraListSuccessList/TableData'

import { sortBetHistory } from '@shared/common/betHistory'
import { BetHistoryType } from '@shared/common/types'

const ListBetHistory = () => {
  const [dataTable, setDataTable] = useState<BetHistoryType[]>([])

  useEffect(() => {
    const fetchBetHistory = async () => {
      const data: BetHistoryType[] = await window.electron.ipcRenderer.invoke('GetBetHistory')
      setDataTable(data)
    }

    const newBetHistoryListener = (_event: unknown, newRows: BetHistoryType[]) => {
      setDataTable((prev) => {
        const existingIds = new Set(prev.map((row) => row.id))
        const rows = newRows.filter((row) => !existingIds.has(row.id))
        return rows.length ? sortBetHistory([...rows, ...prev]) : prev
      })
    }

    const removeNewBetHistory = window.electron.ipcRenderer.on(
      'NewBetHistory',
      newBetHistoryListener
    )
    fetchBetHistory()

    return () => {
      removeNewBetHistory()
    }
  }, [])

  return (
    <div className="h-full flex flex-col text-sm">
      <TableData dataTable={dataTable} enableScroll={false} />
    </div>
  )
}

export default React.memo(ListBetHistory)
