require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME || 'meet',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD || '',
  {
    dialect: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    logging: false,
  }
);

module.exports = { sequelize };
