import { DataTypes } from "sequelize";
import { sequelize } from "../database";
import { Patient } from "./patient";

export const IOTRecord = sequelize.define('iotRecord', {
    patientId: {
        type: DataTypes.STRING(255),
        allowNull:false
    },
    deviceID: {
        type: DataTypes.STRING(255),
        allowNull:false
    },
    type: {
        type: DataTypes.STRING(64),
        allowNull:false
    },
    key: {
        type: DataTypes.STRING(64),
        allowNull:false
    },
    value: {
        type: DataTypes.TEXT,
        allowNull:false
    },
    organization: DataTypes.STRING(255),
    createdAt: {
        type: DataTypes.DATE,
    }
})

IOTRecord.belongsTo(Patient, { foreignKey: 'patientId' })