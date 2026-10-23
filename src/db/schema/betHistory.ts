const betHistorySchema = `
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          
          gameType TEXT,
          loginID TEXT,
          time TEXT,
          round TEXT,
          betChoice TEXT,
          result TEXT,
          stake TEXT,
          refund TEXT,
          win TEXT
          `

export default betHistorySchema
