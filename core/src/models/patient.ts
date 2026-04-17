import { DataTypes, UUIDV4 } from "sequelize";
import { sequelize } from "../database";
import { User } from "./user";
import { Meet } from "./meeting";

export const Patient = sequelize.define('patient', {
    id: {
        type: DataTypes.STRING(255),
        primaryKey: true,
        autoIncrement: false,
        defaultValue: UUIDV4
    },
    uid: {
        type: DataTypes.INTEGER.UNSIGNED,
    },
    prefix: DataTypes.STRING(255),
    name: DataTypes.STRING(255),
    idcard: DataTypes.STRING(16),
    lastname: DataTypes.STRING(255),
    gender: DataTypes.STRING(8),
    bloodType: DataTypes.STRING(2),
    emergencyContact: DataTypes.STRING(255),
    emergencyTel: DataTypes.STRING(255),
})

export const MedRecord = sequelize.define('medRecord', {
    patientId: DataTypes.STRING(255),
    recordDate: DataTypes.DATE,
    title: DataTypes.STRING(255),
    author: DataTypes.STRING(255),
    organization: DataTypes.STRING(255),
    type: DataTypes.STRING(255),
    content: DataTypes.TEXT,
    profile: DataTypes.TEXT,
    healthcheck: DataTypes.TEXT,
    analysis: DataTypes.TEXT,
    labtest: DataTypes.TEXT,
    xraycontent: DataTypes.TEXT,
})

Patient.belongsTo(User, { foreignKey: 'uid' })
Meet.belongsTo(Patient, { foreignKey: 'patientId' })
MedRecord.belongsTo(Patient, { foreignKey: 'patientId' })