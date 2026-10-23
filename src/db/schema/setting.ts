export type SettingSchemaType = {
  id: string

  gameType: string

  ipAddress: string
  port: string
  username: string
  password: string

  enableRandomizer: number
  fromRandomizer: string
  toRandomizer: string

  betMode: string
  language: string
}

const settingSchema = `
        id TEXT PRIMARY KEY NOT NULL,
 
        gameType NOT NULL DEFAULT 'Big Small',
        
        ipAddress TEXT,
        port TEXT,
        username TEXT,
        password TEXT,

        enableRandomizer INTEGER,
        fromRandomizer TEXT,
        toRandomizer TEXT,

        betMode NOT NULL DEFAULT 'Random',
        language NOT NULL DEFAULT 'en'
      `

export default settingSchema
