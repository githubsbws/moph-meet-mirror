import { DataTypes } from "sequelize";
import { sequelize } from "../database";

export const User = sequelize.define('user', {
    uid: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey:true
    },
    username: {
        type: DataTypes.STRING(255),
        unique:true
    },
    display: DataTypes.STRING(255),
    isOnline: DataTypes.BOOLEAN
})

export const Organization = sequelize.define('organization', {
    orgid: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey:true
    },
    name: {
        type: DataTypes.STRING(255),
        unique:true
    },
    search: {
        type: DataTypes.STRING(255),    
    },
})

export const OrganizationMap = sequelize.define('organizationMap', {
    userUid: DataTypes.INTEGER.UNSIGNED,
    organizationOrgid: DataTypes.INTEGER.UNSIGNED,
})

export const UserAuth = sequelize.define('userAuth', {
    uid: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: false,
        primaryKey:true
    },
    type: DataTypes.STRING(16),
    password: DataTypes.TEXT,
    inUse: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
})

export const Role = sequelize.define('role', {
    name: {
        type: DataTypes.STRING(255),
        primaryKey:true
    },
}, {timestamps: false,})

export const RoleMap = sequelize.define('roleMap', {
    userUid: {
        type: DataTypes.INTEGER.UNSIGNED,
    },
    roleName: DataTypes.STRING(255),
})

export const TermAndCondition = sequelize.define('term', {
    name:DataTypes.STRING(255),
    text: DataTypes.TEXT,
})

export const TermAcception = sequelize.define('termAcception', {
    userUid:DataTypes.INTEGER.UNSIGNED,
    termId: DataTypes.INTEGER,
})


User.hasMany(RoleMap)
User.hasOne(UserAuth, { foreignKey: 'uid' })

RoleMap.belongsTo(Role)

OrganizationMap.belongsTo(User)
OrganizationMap.belongsTo(Organization)

TermAcception.belongsTo(User)
TermAcception.belongsTo(TermAndCondition)