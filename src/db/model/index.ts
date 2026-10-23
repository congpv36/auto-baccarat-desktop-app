import db from '@db/config/database'
import accountSchema from '@db/schema/account'
import authTokensSchema from '@db/schema/authTokens'
import betHistorySchema from '@db/schema/betHistory'
import betListResultSchema from '@db/schema/betListResult'
import platformSchema from '@db/schema/platform'
import platformUrlSchema from '@db/schema/platformUrl'
import settingSchema from '@db/schema/setting'
import sportsBookSchema from '@db/schema/sportsBook'
import sportsBookProvidersSchema from '@db/schema/sportsBookProvidersSchema'
import settingsTableViewSchema from '@db/schema/tableViewSettings'

export interface RecordData {
  [key: string]: string | number | boolean | null
}
type QueryCondition = Record<string, string | number | boolean>

class Model {
  private tableName: string

  constructor(tableName: string, schema: string) {
    this.tableName = tableName
    db.prepare(`CREATE TABLE IF NOT EXISTS ${this.tableName} (${schema})`).run()
  }

  findOne<T>(query: QueryCondition): T | undefined {
    const keys = Object.keys(query)
    const values = Object.values(query)

    const conditions = keys.map((key) => `${key} = ?`).join(' AND ')

    return db.prepare(`SELECT * FROM ${this.tableName} WHERE ${conditions}`).get(...values) as
      | T
      | undefined
  }

  findAll(query: RecordData = {}): RecordData[] {
    const keys = Object.keys(query)
    if (keys.length === 0) {
      return db.prepare(`SELECT * FROM ${this.tableName}`).all()
    }

    const conditions = keys.map((key) => `${key} = ?`).join(' AND ')
    const values = Object.values(query)
    return db.prepare(`SELECT * FROM ${this.tableName} WHERE ${conditions}`).all(...values)
  }

  findById(id: number | string) {
    return db.prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`).get(id)
  }

  create(data: RecordData) {
    const keys = Object.keys(data).join(', ')
    const values = Object.values(data)
    const placeholders = values.map(() => '?').join(', ')

    const stmt = db.prepare(`
      INSERT INTO ${this.tableName} (${keys})
      VALUES (${placeholders})
      RETURNING *
    `)

    const result = stmt.get(...values)
    return result
  }

  insertMany(records: RecordData[]): void {
    if (!records.length) return

    const firstRecord = records[0]
    const keys = Object.keys(firstRecord).join(', ')
    const placeholder = '(?' + ',?'.repeat(Object.keys(firstRecord).length - 1) + ')'
    const allPlaceholders = new Array(records.length).fill(placeholder).join(', ')
    const values = records.flatMap((record) => Object.values(record))

    db.transaction(() => {
      db.prepare(`INSERT INTO ${this.tableName} (${keys}) VALUES ${allPlaceholders}`).run(...values)
    })()
  }

  update(query: RecordData, updates: RecordData): RecordData {
    if (Object.keys(query).length === 0) {
      const updateKeys = Object.keys(updates)
        .map((key) => `${key} = ?`)
        .join(', ')
      const updateValues = Object.values(updates)

      const sql = `UPDATE ${this.tableName} SET ${updateKeys}`
      db.prepare(sql).run(...updateValues)

      const selectSql = `SELECT * FROM ${this.tableName} LIMIT 1`
      const updatedRecord = db.prepare(selectSql).get()
      return updatedRecord
    } else {
      const queryKeys = Object.keys(query)
        .map((key) => `${key} = ?`)
        .join(' AND ')
      const queryValues = Object.values(query)

      const updateKeys = Object.keys(updates)
        .map((key) => `${key} = ?`)
        .join(', ')
      const updateValues = Object.values(updates)

      const sql = `UPDATE ${this.tableName} SET ${updateKeys} WHERE ${queryKeys}`
      const params = [...updateValues, ...queryValues]

      const selectBeforeUpdateSql = `SELECT * FROM ${this.tableName} WHERE ${queryKeys}`

      db.prepare(sql).run(...params)

      const updatedRecord = db.prepare(selectBeforeUpdateSql).get(...queryValues)
      return updatedRecord || null
    }
  }

  updateMany(query: RecordData, data: RecordData) {
    const conditionKeys = Object.keys(query)
    const updateKeys = Object.keys(data)

    if (conditionKeys.length === 0 || updateKeys.length === 0) {
      throw new Error('Missing query conditions or update data')
    }

    const conditionClause = conditionKeys.map((key) => `${key} = ?`).join(' AND ')
    const updateClause = updateKeys.map((key) => `${key} = ?`).join(', ')

    const conditionValues = Object.values(query)
    const updateValues = Object.values(data)

    const stmt = db.prepare(`
    UPDATE ${this.tableName}
    SET ${updateClause}
    WHERE ${conditionClause}
    RETURNING *
  `)

    return db.transaction(() => {
      return stmt.all(...updateValues, ...conditionValues)
    })()
  }

  updateTypeCrawlForRefresh(newTypeCrawl: string): number {
    const updateQuery = `UPDATE ${this.tableName} SET typeCrawl = ? WHERE checkBoxRefresh = ?`
    const result = db.prepare(updateQuery).run(newTypeCrawl, 1)

    return result.changes
  }

  delete(query: RecordData) {
    // model.delete({ id: 1 })
    const [key, value] = Object.entries(query)[0]

    db.transaction(() => {
      db.prepare(`DELETE FROM ${this.tableName} WHERE ${key} = ?`).run(value)
    })()
  }

  deleteMany(query: RecordData) {
    const conditions = Object.entries(query)
      .map(([key]) => `${key} = ?`)
      .join(' AND ')

    const values = Object.values(query)

    db.transaction(() => {
      db.prepare(`DELETE FROM ${this.tableName} WHERE ${conditions}`).run(...values)
    })()
  }
}

function createModel(tableName: string, schema: string): Model {
  return new Model(tableName, schema)
}

export function clearAllTables() {
  const tables = db
    .prepare(
      `SELECT name FROM sqlite_master 
       WHERE type='table' 
       AND name NOT LIKE 'sqlite_%'`
    )
    .all()

  const transaction = db.transaction(() => {
    db.prepare('PRAGMA foreign_keys = OFF').run()

    for (const table of tables) {
      db.prepare(`DELETE FROM ${table.name}`).run()
    }

    db.prepare('PRAGMA foreign_keys = ON').run()
  })

  transaction()
}

export function clearTable(tableName: string) {
  const tableExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
    .get(tableName)

  if (tableExists) {
    const deleteTransaction = db.transaction(() => {
      db.prepare('PRAGMA foreign_keys = OFF').run()
      db.prepare(`DELETE FROM ${tableName}`).run()
      db.prepare('PRAGMA foreign_keys = ON').run()
    })

    deleteTransaction()
  }
}
export const AuthToken = createModel('AuthToken', authTokensSchema)

export const Account = createModel('Account', accountSchema)
export const Platform = createModel('Platform', platformSchema)
export const SportsBook = createModel('SportsBook', sportsBookSchema)
export const Setting = createModel('Setting', settingSchema)

export const BetListResult = createModel('BetListResult', betListResultSchema)
export const BetHistory = createModel('BetHistory', betHistorySchema)

export const PlatformUrl = createModel('PlatformUrl', platformUrlSchema)

export const SettingTableView = createModel('SettingTableView', settingsTableViewSchema)

export const SportsBookProviders = createModel('SportsBookProviders', sportsBookProvidersSchema)

export default Model
