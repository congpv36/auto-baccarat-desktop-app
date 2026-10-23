import { BetHistoryType } from './types'

// time format: "HH:mm dd/MM/yyyy"
function toSortKey(time: string): string {
  const [hm = '', dmy = ''] = (time ?? '').split(' ')
  const [hh = '', mm = ''] = hm.split(':')
  const [dd = '', MM = '', yyyy = ''] = dmy.split('/')
  return `${yyyy}${MM}${dd}${hh}${mm}`
}

export function sortBetHistory(data: BetHistoryType[]): BetHistoryType[] {
  return data.sort((a, b) => toSortKey(b.time).localeCompare(toSortKey(a.time)) || b.id - a.id)
}
