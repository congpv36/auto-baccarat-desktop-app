import { TFunction } from 'i18next'

export const defaultColumns = (t: TFunction) => [
  {
    accessorKey: 'gameType',
    header: () => <span>{t('game_type_col')}</span>,
    footer: (props: { column: { id: string } }) => props.column.id,
    size: 110,
    cell: ({ getValue }) => {
      const text = getValue()
      return (
        <span className={`px-2 text-xs `} style={{ whiteSpace: 'nowrap' }}>
          {text}
        </span>
      )
    }
  },
  {
    accessorKey: 'loginID',
    header: () => <span>{t('login_id_col')}</span>,
    footer: (props: { column: { id: string } }) => props.column.id,
    size: 130,
    cell: ({ getValue }) => {
      const text = getValue()
      return (
        <span className={`px-2 text-xs `} style={{ whiteSpace: 'nowrap' }}>
          {text}
        </span>
      )
    }
  },
  {
    accessorKey: 'time',
    header: () => <span>{t('time_col')}</span>,
    footer: (props: { column: { id: string } }) => props.column.id,
    size: 130,
    cell: ({ getValue }) => {
      const text = getValue()
      return (
        <span className={`px-2 text-xs `} style={{ whiteSpace: 'nowrap' }}>
          {text}
        </span>
      )
    }
  },
  {
    accessorKey: 'round',
    header: () => <span>{t('round_col')}</span>,
    footer: (props: { column: { id: string } }) => props.column.id,
    size: 250,
    cell: ({ getValue }) => {
      const text = getValue()
      return (
        <span className={`px-2 text-xs `} style={{ whiteSpace: 'nowrap' }}>
          {text}
        </span>
      )
    }
  },
  {
    accessorKey: 'betChoice',
    header: () => <span>{t('bet_choice_col')}</span>,
    footer: (props: { column: { id: string } }) => props.column.id,
    size: 100,
    cell: ({ getValue }) => {
      const text = getValue()
      return (
        <span className={`px-2 text-xs `} style={{ whiteSpace: 'nowrap' }}>
          {text}
        </span>
      )
    }
  },
  {
    accessorKey: 'result',
    header: () => <span>{t('result_col')}</span>,
    footer: (props: { column: { id: string } }) => props.column.id,
    size: 140,
    cell: ({ getValue }) => {
      const text = getValue()
      return (
        <span className={`px-2 text-xs `} style={{ whiteSpace: 'nowrap' }}>
          {text}
        </span>
      )
    }
  },
  {
    accessorKey: 'stake',
    header: () => <span>{t('stake_col')}</span>,
    footer: (props: { column: { id: string } }) => props.column.id,
    size: 80,
    cell: ({ getValue }) => {
      const text = getValue()
      return (
        <span className={`px-2 text-xs `} style={{ whiteSpace: 'nowrap' }}>
          {text}
        </span>
      )
    }
  },
  {
    accessorKey: 'refund',
    header: () => <span>{t('refund_col')}</span>,
    footer: (props: { column: { id: string } }) => props.column.id,
    size: 80,
    cell: ({ getValue }) => {
      const text = getValue()
      return (
        <span className={`px-2 text-xs `} style={{ whiteSpace: 'nowrap' }}>
          {text}
        </span>
      )
    }
  },
  {
    accessorKey: 'win',
    header: () => <span>{t('win_col')}</span>,
    footer: (props: { column: { id: string } }) => props.column.id,
    size: 80,
    cell: ({ getValue }) => {
      const text = getValue()
      return (
        <span className={`px-2 text-xs `} style={{ whiteSpace: 'nowrap' }}>
          {text}
        </span>
      )
    }
  }
]
