import moment from "moment"
import { sequelize } from "../database"
import { Meet, MeetInvite } from "../models/meeting"
import { User, Role, RoleMap, UserAuth, TermAcception, TermAndCondition, Organization, OrganizationMap } from "../models/user"
import { Model } from 'sequelize'
import { MedRecord, Patient } from "../models/patient"
import { IOTRecord } from "../models/iot"

export async function dbInit (force: boolean = true) {
    await User.sync({ force })
    await TermAndCondition.sync({ force })
    await Role.sync({ force })
    await RoleMap.sync({ force })
    await UserAuth.sync({ force })
    await Patient.sync({ force })
    await Meet.sync({ force })
    await MeetInvite.sync({ force })
    await TermAcception.sync({ force })
    await Organization.sync({ force })
    await OrganizationMap.sync({ force })
    await MedRecord.sync({ force })
    await IOTRecord.sync({ force })

    const roles = await (await Promise.all([Role.upsert({ name: 'admin' }), Role.upsert({ name: 'staff' }), Role.upsert({ name: 'patient' })])).map(r => r[0])

    // const admin = await createUser({
    //     username: 'admin',
    //     display: 'administrator',
    //     password: 'admin',
    //     roles: roles
    // })

    // const patientUser = await createUser({
    //     username: 'patient-01',
    //     display: 'นาย สมชาย แข็งแรงดี',
    //     password: 'patient',
    //     roles: [roles[2]]
    // })

    // await createUser({
    //     username: 'patient-02',
    //     display: 'นาย ทดสอบ แม่นแม่น',
    //     password: 'patient',
    //     roles: [roles[2]]
    // })

    // await createUser({
    //     username: 'patient-627',
    //     display: 'นาย จอร์น ไพส์',
    //     password: 'patient',
    //     roles: [roles[2]]
    // })

    // await createUser({
    //     username: 'patient-03',
    //     display: 'นาย นที นิวงศ์ศา',
    //     password: 'patient',
    //     roles: [roles[2]]
    // })

    // const patient = await Patient.create({
    //     id: 'e594d2df-71f0-42f3-9519-d8a2e48e15a3',
    //     uid: patientUser.dataValues.uid,
    //     prefix: 'นาย',
    //     name: 'สมชาย',
    //     lastname: 'แข็งแรงดี',
    //     idcard: '1000000000000',
    //     gender: 'Male',
    //     bloodType: 'B+',
    //     emergencyContact: 'สมศักดิ์ แข็งแรงดี',
    //     emergencyTel: '0890000000',
    // })

    // const writeTime = moment().startOf('year')

    // for (let i = 0; i < 9; i++) {
    //     await MedRecord.create({
    //         patientId: patient.dataValues.id,
    //         recordDate: writeTime.add(3, 'week').clone().toISOString(),
    //         title: `ผลการตรวจครั้งที่ ${i+1}`,
    //         author: `หมอเอิร์ธ`,
    //         organization: `โรงพยาบาลไทม์เมดดิคอลเซ็นเตอร์`,
    //         content: `ผลการตรวจคนไข้ดีขึ้น มีการปรับปริมาณการใช้ยา`,
    //         type: 'ตรวจทั่วไป'
    //     })
    // }


    // const time = moment().subtract(5, 'h')

    // for (let i = 0; i < 30; i++) {
    //     if (i % 4 === 0) time.add(1, 'd')
    //     if(time.day() === 0 || time.day() === 6) time.add('2', 'day')
    //     console.log('\n\n' + time.day())
    //     if (i % 10 === 0) {
    //         const meet = await Meet.create({
    //             title: `ประชุมโครงการเทเลเมด`,
    //             description: `คุยอัพเดทโครงการเทเลเมดประจำสัปดาห์`,
    //             starttime: time.clone().startOf('h'),
    //             endtime: time.add(2, 'h').clone().startOf('h'),
    //             inviteOnly: false
    //         })
    //         await MeetInvite.create({
    //             meetId: meet.dataValues.id,
    //             userUid: admin.dataValues.uid
    //         })
    //     } else {
    //         const meet = await Meet.create({
    //             title: `ตรวจโรค ${i+1}`,
    //             description: `หมอสิน`,
    //             starttime: time.clone().startOf('h'),
    //             endtime: time.add(2, 'h').clone().startOf('h'),
    //             inviteOnly: false,
    //             patientId: patient.dataValues.id,
    //             doctorId: admin.dataValues.uid
    //         })
    
    //         await MeetInvite.create({
    //             meetId: meet.dataValues.id,
    //             userUid: admin.dataValues.uid
    //         })
    //         await MeetInvite.create({
    //             meetId: meet.dataValues.id,
    //             userUid: patient.dataValues.uid
    //         })
    //     }
    // }

}

export async function createUser (createUser: { username: string, display: string, password: string, roles: Model<any, any>[] }) {
    const trx = await sequelize.transaction()
    try {
        const user = await User.create(createUser, { transaction: trx })
        await RoleMap.bulkCreate(createUser.roles.map(role => ({ userUid: user.dataValues.uid, roleName: role.dataValues.name })), { transaction: trx })
        await UserAuth.create({
            uid: user.dataValues.uid,
            type: 'basic',
            password: createUser.password
        }, { transaction: trx })
        const newUser = await User.findByPk(user.dataValues.uid, { include: RoleMap, transaction: trx })
        if (!newUser) throw new Error('created but not found')
        await trx.commit()
        return newUser
    } catch (error) {
        await trx.rollback()
        throw error
    }
}

if (require.main === module) {
    dbInit(true);
}