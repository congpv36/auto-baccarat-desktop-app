export const SPORTS_BOOK_LIST = [
  { id: 'sports-book1', label: 'SportsBook 1' },
  { id: 'sports-book2', label: 'SportsBook 2' },
  { id: 'sports-book3', label: 'SportsBook 3' },
  { id: 'sports-book4', label: 'SportsBook 4' },
  { id: 'sports-book5', label: 'SportsBook 5' }
]

export const BET_MODES = {
  Random: 'Random',
  Big: 'Big',
  Small: 'Small',
  Even: 'Even',
  Odd: 'Odd',
  Dragon: 'Dragon',
  Tiger: 'Tiger'
} as const

enum Language {
  EN = 'en',
  VI = 'vi',
  ZH = 'zh'
}

export type LanguageType = 'en' | 'zh' | 'vi'

export const DEFAULT_LANGUAGE = Language.EN

export const GAME_TYPES = {
  DRAGON_TIGER: 'Dragon Tiger',
  SE_DIE: 'Se Die',
  BIG_SMALL: 'Big Small'
}

export const BET_MODES_BY_GAME_TYPE: Record<string, string[]> = {
  [GAME_TYPES.BIG_SMALL]: [BET_MODES.Random, BET_MODES.Big, BET_MODES.Small],
  [GAME_TYPES.SE_DIE]: [BET_MODES.Random, BET_MODES.Even, BET_MODES.Odd],
  [GAME_TYPES.DRAGON_TIGER]: [BET_MODES.Random, BET_MODES.Dragon, BET_MODES.Tiger]
}
