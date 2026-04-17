import 'dotenv/config'
import { sequelize } from './database'
import { dbInit } from './scripts/dbInit'
import express, { json, NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { RoleMap, User, UserAuth } from './models/user'
import { createHash, randomInt, randomUUID } from 'crypto'
import { tokenStorage } from './cache'
import cors from 'cors'
import { apiKeyAuth, auth } from './middlewares/auth'
import { Meet, MeetInvite } from './models/meeting'
import { Model, Op } from 'sequelize'
import moment from 'moment'
import { MedRecord, Patient } from './models/patient'
import { IOTRecord } from './models/iot'
import NodeCache from "node-cache"

const JITSI_JWTSecret = process.env.JWT_SECRET || 'supersecretkey'
const JITSI_APP_ID = 'moph-meet';
const JITSI_DOMAIN = 'https://moph-meetingroom.moph.go.th';

const sessionCache = new NodeCache();
const patientDeviceRecord = new NodeCache();

function urlSafe(value:string) {
    return value == undefined ? '' : value.replace(/[^a-z0-9_]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
}

async function main () {
    try {
        await sequelize.authenticate()
        dbInit(false)

        const app = express()

        app.use(json())
        app.use(cors())

        app.get('/api/health', async (req, res, next) => {
            res.json({ status: 'ok', timestamp: new Date().toISOString()})
        })

        
        app.post('/api/meet/reserved', apiKeyAuth(), async (req, res, next) => {
            try {
                const sessionID = randomUUID()
                const body = {
                    sessionID: sessionID,
                    sessionName: req.body.sessionName || sessionID,
                    starttime:  moment(req.body.startTime).toISOString(),
                    endtime:  moment(req.body.endTime).add(3, 'hour').toISOString(),
                    cid: req.body.cid,
                    displayName: req.body.displayName,
                    username: req.body.account_id || req.body.cid,
                }

                const payload = {
                    aud: JITSI_APP_ID,
                    iss: JITSI_APP_ID,
                    sub: JITSI_DOMAIN,
                    room: body.sessionID,
                    iat: new Date(body.starttime).getTime() / 1000,
                    exp: new Date(body.endtime).getTime() / 1000,
                    context: {
                        user: {
                            id: body.username,
                            name: body.displayName,
                            affiliation: 'owner'
                        },
                        features: {
                            livestreaming: true,
                            recording: true
                        }
                    }
                };

                const token = jwt.sign(payload, JITSI_JWTSecret, { algorithm: 'HS256' });
                sessionCache.set(sessionID, body, new Date(body.endtime).getTime() - new Date(body.starttime).getTime())
                res.json({
                    sessionID: sessionID,
                    meet: `${JITSI_DOMAIN}/${urlSafe(body.sessionName)}?jwt=${token}`
                })
            } catch (error) {
                console.error(error)
                res.status(400).json({status:400, message: 'invalidInput'})
            }
        })

        app.post('/api/meet/reserved/token', apiKeyAuth(), async (req, res, next) => {
            try {
                const sessionID = randomUUID()
                const tempSession = sessionCache.get<any>(req.body.sessionID)
                if (!tempSession) {
                    res.status(400).json({status:400, message: 'invalidSessionID'})
                    return
                }
                const body = {
                    sessionID: sessionID,
                    sessionName: tempSession.sessionName || sessionID,
                    starttime:  moment(tempSession.starttime).toISOString(),
                    endtime:  moment(tempSession.endtime).toISOString(),
                    cid: tempSession.cid,
                    displayName: req.body.displayName,
                    username: req.body.account_id || req.body.cid,
                }

                const payload = {
                    aud: JITSI_APP_ID,
                    iss: JITSI_APP_ID,
                    sub: JITSI_DOMAIN,
                    room: body.sessionID,
                    iat: new Date(body.starttime).getTime() / 1000,
                    exp: new Date(body.endtime).getTime() / 1000,
                    context: {
                        user: {
                            id: body.username,
                            name: body.displayName,
                            affiliation: 'member'
                        },
                        features: {
                            livestreaming: true,
                            recording: false
                        }
                    }
                };

                const token = jwt.sign(payload, JITSI_JWTSecret, { algorithm: 'HS256' });
                res.json({
                    sessionID: sessionID,
                    meet: `${JITSI_DOMAIN}/${urlSafe(body.sessionName)}?jwt=${token}`
                })
            } catch (error) {
                console.error(error)
                res.status(400).json({status:400, message: 'invalidInput'})
            }
        })

        app.post('/api/auth/providerID', async (req, res, next) => {
            try {
                const oauthProviderPayload = {
                    grant_type: 'authorization_code',
                    client_id: '01953bd5-fc1e-73d4-9142-7598d70c34dc',
                    client_secret: 'bdd0f24157ad7e0a8870a4ab6c683fd2d38c8e0b',
                    code: req.body.code,
                    redirect_uri: `https://moph-meet.moph.go.th/`
                }
                console.log('OAuth ProviderID Payload', oauthProviderPayload)
                const oauthProvider = await fetch(`https://moph.id.th/api/v1/token`, {
                    method: 'post',
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(oauthProviderPayload)
                })
                    .then(r => r.json())
                    .then(r => { console.log(r);  return r.data })
                    .catch(e => console.error(e))
                console.log('ProviderID Token', oauthProvider)

                if (!oauthProvider.access_token) {
                    res.status(401)
                    next(new Error('invalidProviderIDToken'))
                    return
                }
                if (oauthProvider.access_token == null){
                    let user = {
                        uid: req.body.code,
                        username: 'tmp user',
                        display: 'Temporary User',
                        isOnline: true,
                        roleMaps: [
                            { roleName: 'staff' },
                        ],
                        code: req.body.code
                    }
                    const token = createHash('sha256').update(new Date().toISOString() + JSON.stringify(user) + randomInt(1000)).digest('hex')
                    tokenStorage.set(token, user)
                    res.json({data:{
                        token: token,
                        user: { ...user, roleMaps: user.roleMaps },
                        // providerID: providerID.data,
                        // providerIDProfile: providerIDProfile.data
                    }
                    })
                    return
                }

                const providerID = await fetch('https://provider.id.th/api/v1/services/token', {
                    method: 'post',
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        client_id: "eb018ab6-3fce-45ac-9737-01bee3692319",
                        secret_key: "KnFB7XZO90vSbzqmVYXDNasktTeu0597",
                        token_by: "Health ID",
                        token: oauthProvider.access_token
                    })
                }).then(r => r.json())

                console.log('ProviderID User', providerID);

                const providerIDProfileHeaders = {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${providerID.data.access_token}`,
                        "client-id": "eb018ab6-3fce-45ac-9737-01bee3692319",
                        "secret-key": "KnFB7XZO90vSbzqmVYXDNasktTeu0597",
                    }

                console.table(providerIDProfileHeaders)
                const providerIDProfile = await fetch('https://provider.id.th/api/v1/services/profile?moph_center_token=1', {
                    method: 'get',
                    headers: providerIDProfileHeaders,
                }).then(r => r.json())

                console.log('providerIDProfile', providerIDProfile.data);

                if(!providerIDProfile.data || !providerIDProfile.data.account_id){
                    res.status(401)
                    next(new Error('invalidProviderIDProfile'))
                    return
                }
                
                let user = await User.findOne({
                    where: {
                        username: providerIDProfile.data.account_id
                    },
                    include: [
                        {
                            model: RoleMap, 
                            attributes: ['roleName']
                        }
                    ]
                })

                if (!user) {
                    const newUser = await User.create({
                        username: providerIDProfile.data.account_id,
                        display: `${providerIDProfile.data.name_th}`,
                        isOnline: true,
                    })

                    await RoleMap.create({
                        userUid: newUser.dataValues.uid,
                        roleName: 'staff',
                    })

                    user = await User.findOne({
                    where: {
                        username: providerIDProfile.data.account_id
                    },
                    include: [
                        {
                            model: RoleMap, 
                            attributes: ['roleName']
                        }
                    ]
                })
                }
                // const userAuth = await UserAuth.findByPk(user?.dataValues.uid)
                // if (userAuth?.dataValues.password !== req.body.password) throw new Error("invalidUsernameOrPassword");
                const token = createHash('sha256').update(new Date().toISOString() + JSON.stringify(user?.toJSON()) + randomInt(1000)).digest('hex')
                tokenStorage.set(token, user)
                res.json({data:{
                    token: token,
                    user: { ...user?.toJSON(), roleMaps: user?.dataValues.roleMaps },
                    providerID: providerID.data,
                    providerIDProfile: providerIDProfile.data
                }})
                return
            } catch (error) {
                console.error(error)
                res.status(401)
                next(new Error('invalidUsernameOrPassword'))
            }
        })

        app.post('/api/auth', async (req, res, next) => {
            try {
                const user = await User.findOne({
                    where: {
                        username: req.body.username
                    },
                    include: [
                        {
                            model: RoleMap,
                            attributes: ['roleName']
                        }
                    ]
                })
                const userAuth = await UserAuth.findByPk(user?.dataValues.uid)
                if (userAuth?.dataValues.password !== req.body.password) throw new Error("invalidUsernameOrPassword");
                const token = createHash('sha256').update(new Date().toISOString() + JSON.stringify(user?.toJSON()) + randomInt(1000)).digest('hex')
                tokenStorage.set(token, user)
                res.json({
                    token: token,
                    user: user?.toJSON()
                })
            } catch (error) {
                res.status(401)
                next(new Error('invalidUsernameOrPassword'))
            }
        })

        app.post('/api/auth/check', async (req, res, next) => {
            try {
                if (!tokenStorage.has(req.body.token)) { throw new Error("invalidToken"); }
                res.json({
                    token: req.body.token,
                })
            } catch (error) {
                res.status(401)
                next(new Error('invalidToken'))
            }
        })

        app.post('/api/logout', async (req, res, next) => {
            try {
                const logoutUser = tokenStorage.get<Model>(req.body.token)
                if (!logoutUser) throw new Error('invalidToken')

                await User.update({ isOnline: false }, { where: { uid: logoutUser.dataValues.uid } })
                
                tokenStorage.del(req.body.token)
                res.json({
                    token: req.body.token,
                    user: logoutUser
                })
            } catch (error) {
                res.status(401)
                next(new Error('invalidUsernameOrPassword'))
            }
        })

        app.get('/api/meets', auth(), async (req, res, next) => {
            console.log(res.locals.user)
            const meets = await Meet.findAll({
                where: {
                    '$userUid$': res.locals.user.dataValues.uid,
                    endtime: {
                        [Op.gte]: new Date().toISOString()
                    }
                },
                include: [MeetInvite],
            })
            const sorted = meets.sort((a, b) => moment(a.dataValues.starttime).diff(moment()) - moment(b.dataValues.starttime).diff(moment()))
            res.json(sorted)
        })

        app.get('/api/exam/:id', auth(), async (req, res, next) => {
            res.json(await Meet.findByPk(req.params.id, { include: [{ model: MeetInvite, include: [User] }, Patient] }))
        })

        app.get('/api/exam/:id', auth(), async (req, res, next) => {
            res.json(await Meet.findByPk(req.params.id, { include: [{ model: MeetInvite, include: [User] }, Patient] }))
        })

        app.get('/api/user/:keyword', auth(), async (req, res, next) => {
            res.json(await User.findAll({
                where: {
                    display: {
                        [Op.like]: `%${req.params.keyword}%`
                    }
                },
                include: [{
                    model: RoleMap,
                    attributes: ['roleName']
                }]
            }))
        })

        app.get('/api/patient/:id/iot/:deviceID/realtime', auth(), async (req, res, next) => {
            res.json(patientDeviceRecord.get(`${req.params.id}-${req.params.deviceID}`) || {})
        })

        app.get('/api/patient/:id/iot', auth(), async (req, res, next) => {
            res.json(await IOTRecord.findAll({
                attributes: ['deviceID', 'type', 'key', 'value', 'organization', 'createdAt',],
                where: {
                    patientId: req.params.id
                },
                order: [['createdAt', 'desc']]
            }))
        })

        app.post('/api/patient/:id/iot', auth(), async (req, res, next) => {
            try {
                const iot = await IOTRecord.create({
                    patientId: req.params.id,
                    deviceID: req.body.deviceID,
                    type: req.body.type,
                    key: req.body.key,
                    value: req.body.value,
                    organization: req.body.organization,
                    createdAt: moment().toISOString(true)
                })
                res.json(iot)
                patientDeviceRecord.set(`${req.params.id}-${req.body.deviceID}`, iot.toJSON(), 300)
                
            } catch (error) {
                console.error(error)
                res.status(400).json({status:400, message: 'invalidInput'})
            }
        })

        app.get('/api/patient/:id/med', auth(), async (req, res, next) => {
            res.json(await MedRecord.findAll({
                where: {
                    patientId: req.params.id
                },
                order: [['createdAt', 'desc']]
            }))
        })

        app.post('/api/patient/:id/med', auth(), async (req, res, next) => {
            res.json(await MedRecord.create({
                patientId: req.params.id,
                recordDate: req.body.recordDate,
                title: req.body.title,
                author: req.body.author,
                organization: req.body.organization,
                content: req.body.content,
                profile: req.body.profile,
                healthcheck: req.body.healthcheck,
                analysis: req.body.analysis,
                labtest: req.body.labtest,
                xraycontent: req.body.xraycontent,
            }))

            try {

                const patient = await Patient.findByPk(req.params.id)

                await fetch('http://45.154.24.212:3501/', {
                    method: 'post',
                    headers: {
                        'content-type': 'application/json'
                    },
                    body: JSON.stringify({
                        patientId: req.params.id,
                        patientName: `${patient?.dataValues.name} ${patient?.dataValues.lastname}`,
                        recordDate: req.body.recordDate,
                        title: req.body.title,
                        author: req.body.author,
                        organization: req.body.organization,
                        content: req.body.content,
                        profile: req.body.profile,
                        healthcheck: req.body.healthcheck,
                        analysis: req.body.analysis,
                        labtest: req.body.labtest,
                        xraycontent: req.body.xraycontent,
                    })
                })
                
            } catch (error) {
                console.error(error)
            }

        })

        app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
            if (res.statusCode == 200) res.status(400)
            console.error(new Date().toISOString(), err)
            res.json({
                error: res.statusCode,
                message: err.message
            })
        })

        app.listen(process.env.APP_PORT, () => {
            console.log(`\n\n =========== Server Ready =========== \n   call : http://0.0.0.0:${process.env.APP_PORT}`)
        })

    } catch (error) {
        console.error(error)
        process.exit(1)
    }
}

main()