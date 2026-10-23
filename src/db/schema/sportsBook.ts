const sportsBookSchema = `
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        platform TEXT NOT NULL,
        url TEXT NOT NULL,


        betFixedAmountValue TEXT NOT NULL,

        isSwitchBySuccessCount INTEGER,
        minSuccessCount TEXT NOT NULL,
        maxSuccessCount TEXT NOT NULL,

        isSwitchByCredit INTEGER,
        maxCredit TEXT NOT NULL,

        lockURL INTEGER NOT NULL DEFAULT 0
      `

export default sportsBookSchema
