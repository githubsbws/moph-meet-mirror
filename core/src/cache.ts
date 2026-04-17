import NodeCache from "node-cache";
import { Model } from "sequelize";

export const tokenStorage = new NodeCache({ stdTTL: 6*60*60, deleteOnExpire:true, checkperiod:120, useClones:false  });

tokenStorage.on('set', async (key: string, user: Model) => {
    await user.update({ isOnline: true })
    console.log(`user "${user.dataValues.username}"(${user.dataValues.uid}) logged in`)
})

tokenStorage.on('del', async (key: string, user: Model) => {
    await user.update({ isOnline: false })
    console.log(`user "${user.dataValues.username}"(${user.dataValues.uid}) logged out`)
})