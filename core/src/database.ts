import { Sequelize } from 'sequelize'
import process from 'process'
import 'dotenv/config'

export const sequelize = new Sequelize(process.env.DB_NAME || 'mophmeet', process.env.DB_USER || 'dasiens', process.env.DB_PASSWORD || '',{
    database: process.env.DB_NAME || 'mophmeet',
    dialect: 'postgres',
    host: process.env.DB_HOST || 'dasiens.chggmo80kw31.ap-southeast-1.rds.amazonaws.com',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USER || 'dasiens',
    password: process.env.DB_PASSWORD || '',
    dialectOptions: {
      // ssl:{
      //   require: false, // This will help you. But you will see nwe error
      //   rejectUnauthorized: false // This line will fix new error
      // }
    },
    logging: false
})

