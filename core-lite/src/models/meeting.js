const { DataTypes } = require('sequelize');
const { sequelize } = require('../database');
const { User } = require('./user');

const Meet = sequelize.define('meet', {
  title: DataTypes.STRING(255),
  description: DataTypes.TEXT,
  starttime: DataTypes.DATE,
  endtime: DataTypes.DATE,
  inviteOnly: { type: DataTypes.BOOLEAN, defaultValue: false },
  hostname: DataTypes.STRING(255),
  hostProviderID: DataTypes.STRING(255),
  hostHealthID: DataTypes.STRING(255),
  onetime: { type: DataTypes.BOOLEAN, defaultValue: false },
  patientId: DataTypes.STRING(255),
  doctorId: DataTypes.STRING(255),
});

const MeetInvite = sequelize.define('meetInvite', {
  meetId: { type: DataTypes.INTEGER, allowNull: false },
  userUid: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
});

Meet.hasMany(MeetInvite);
MeetInvite.belongsTo(User);

module.exports = { Meet, MeetInvite };
