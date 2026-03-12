const { DataTypes } = require('sequelize');
const { sequelize } = require('../database');

const User = sequelize.define('user', {
  uid: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  username: { type: DataTypes.STRING(255), unique: true },
  display: DataTypes.STRING(255),
  isOnline: DataTypes.BOOLEAN,
});

const UserAuth = sequelize.define('userAuth', {
  uid: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: false,
    primaryKey: true,
  },
  type: DataTypes.STRING(16),
  password: DataTypes.TEXT,
  inUse: { type: DataTypes.BOOLEAN, defaultValue: true },
});

const RoleMap = sequelize.define('roleMap', {
  userUid: { type: DataTypes.INTEGER.UNSIGNED },
  roleName: DataTypes.STRING(255),
});

User.hasMany(RoleMap);
User.hasOne(UserAuth, { foreignKey: 'uid' });

module.exports = { User, UserAuth, RoleMap };
