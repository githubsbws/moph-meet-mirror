import { getData } from "./getData";
const config = useRuntimeConfig()

function getRandomInt(min:number,max:number) {
    return min + Math.floor(Math.random() * (max - min));
}
  
async function imageBlobToBase64(blob: Blob) {
    return new Promise((onSuccess, onError) => {
      try {
        const reader = new FileReader();
        reader.onload = function () {
          onSuccess(this.result);
        };
        reader.readAsDataURL(blob);
      } catch (e) {
        onError(e);
      }
    });
  }

export const drivers: {
    [key: string]: (
        dev: Ref<{ organize: string, name: string, connector: string, type: string, id: string, values: { [key: string]: string }, img?:string }>,
        patientID: string
    ) => Promise<void>
} = {
    "default": async (dev,patientID) => {
        console.log('connect to', dev, patientID)

        setInterval(async () => {
            
            const data = await getData(`/api/patient/${patientID}/iot/${dev.value.id}/realtime`, {
                method: 'get'
            })
    
            dev.value.values = {
                '': data.value
            }
            
        }, 5*1000);
    },
    "vEKG": async (dev,patientID) => {
        // dev.value.values = {
        //     "BP": '',
        //     "Pulse": ``,
        //     "RR": ''
        // }
        
        setInterval(() => {
            dev.value.values = {
                // "BP": `${getRandomInt(100, 130)} / ${getRandomInt(70, 90)}`,
                // "Pulse": `${getRandomInt(60, 100)}`,
                // "RR": `${getRandomInt(12, 20)}`
                "Connected": "Yes",
                "Alert": "No"
            }
            dev.value.img = '/images/placeholders/norm.png'
        }, 1000);

        setInterval(async () => {
            // for (const [key,value] of Object.entries(dev.value.values)) {
            //     const body = {
            //         "deviceID": dev.value.id,
            //         "type": dev.value.type,
            //         "key": key,
            //         "value": value,
            //         "organization": dev.value.organize
            //     }

            //     getData(`/api/patient/${patientID}/iot`, {
            //         method: 'post',
            //         body: JSON.stringify(body)
            //     })
            // }

            if (dev.value.img) {
                const res = await fetch(dev.value.img);
                const blob = await res.blob();
                const uri = await imageBlobToBase64(blob);
    
                const body = {
                    "deviceID": dev.value.id,
                    "type": dev.value.type,
                    "key": 'img',
                    "value": uri,
                    "organization": dev.value.organize
                }
                
    
                getData(`/api/patient/${patientID}/iot`, {
                    method: 'post',
                    body: JSON.stringify(body)
                })
            }
            
        }, 60*1000);
    },
    "vScale": async (dev,patientID) => {
        dev.value.values = {
            "weight": '80',
            "height": '120'
        }

        for (const [key,value] of Object.entries(dev.value.values)) {
            const body = {
                "deviceID": dev.value.id,
                "type": dev.value.type,
                "key": key,
                "value": value,
                "organization": dev.value.organize
            }

            getData(`/api/patient/${patientID}/iot`, {
                method: 'post',
                body: JSON.stringify(body)
            })
        }
            
    },
    "vThermometer": async (dev,patientID) => {
        dev.value.values = {
            "temp": '',
        }

        setInterval(() => {
            dev.value.values = {
                "temp": `37.${getRandomInt(0, 99)}`
            }
        }, 500);

        setInterval(() => {
            for (const [key,value] of Object.entries(dev.value.values)) {
                const body = {
                    "deviceID": dev.value.id,
                    "type": dev.value.type,
                    "key": key,
                    "value": value,
                    "organization": dev.value.organize
                }

                getData(`/api/patient/${patientID}/iot`, {
                    method: 'post',
                    body: JSON.stringify(body)
                })
            }
            
        }, 20*1000);  
    },
    "vPulseOximeter": async (dev,patientID) => {
        dev.value.values = {
            "spO2": '',
        }

        setInterval(() => {
            dev.value.values = {
                "spO2": `99.${getRandomInt(0, 99)}`
            }
        }, 500);

        setInterval(() => {
            for (const [key,value] of Object.entries(dev.value.values)) {
                const body = {
                    "deviceID": dev.value.id,
                    "type": dev.value.type,
                    "key": key,
                    "value": value,
                    "organization": dev.value.organize
                }

                getData(`/api/patient/${patientID}/iot`, {
                    method: 'post',
                    body: JSON.stringify(body)
                })
            }
            
        }, 20*1000);  
    },
    "vBGM": async (dev,patientID) => {
        dev.value.values = {
            "Mg/dL": '',
        }

        setInterval(() => {
            dev.value.values = {
                "Mg/dL": `${getRandomInt(70, 103)}`
            }
        }, 500);

        setInterval(() => {
            for (const [key,value] of Object.entries(dev.value.values)) {
                const body = {
                    "deviceID": dev.value.id,
                    "type": dev.value.type,
                    "key": key,
                    "value": value,
                    "organization": dev.value.organize
                }

                getData(`/api/patient/${patientID}/iot`, {
                    method: 'post',
                    body: JSON.stringify(body)
                })
            }
            
        }, 60*1000);  
    },
    "vNST": async (dev,patientID) => {
        dev.value.values = {
            "FHR1": `123`,
            "TOCO": `0`
        }
        setInterval(() => {

            let fhr = parseInt(dev.value.values.FHR1) 
            let diff = getRandomInt(-15, +15)
            console.log(fhr, diff)
            fhr = fhr + diff
            if (fhr + diff > 160) fhr = 160
            else if (fhr - diff < 110) fhr = 110

            dev.value.values = {
                "FHR1": `${fhr}`,
                "TOCO": `${getRandomInt(5, 25)}`
            }
        }, 500);

        setInterval(() => {
            const body = {
                "deviceID": dev.value.id,
                "type": dev.value.type,
                "key": 'NST',
                "value": `${dev.value.values.FHR1} BPM / ${dev.value.values.TOCO} mmHg`,
                "organization": dev.value.organize
            }

            getData(`/api/patient/${patientID}/iot`, {
                method: 'post',
                body: JSON.stringify(body)
            })
            
        }, 60*1000);
    },
    "vBloodPressure": async (dev,patientID) => {
        dev.value.values = {
            "SYS": '',
            "DIA": '',
            "MAP": '',
            "PR": '',
        }
        setInterval(() => {
            dev.value.values = {
                // "BP": `${getRandomInt(100, 130)} / ${getRandomInt(70, 90)}`,
                // "Pulse": `${getRandomInt(60, 100)}`,
                // "RR": `${getRandomInt(12, 20)}`
                "SYS": `${getRandomInt(100, 120)}`,
                "DIA": `${getRandomInt(70, 80)}`,
                "MAP": `${getRandomInt(70, 100)}`,
                "PR": `${getRandomInt(60, 100)}`,
            }
        }, 1000);

        setInterval(() => {
            const body = {
                "deviceID": dev.value.id,
                "type": "Blood Pressure",
                "key": "vBP",
                "value": `${dev.value.values.SYS} / ${dev.value.values.DIA}, ${dev.value.values.PR}bpm`,
                "organization": dev.value.organize
            }

            getData(`/api/patient/${patientID}/iot`, {
                method: 'post',
                body: JSON.stringify(body)
            })            
        }, 5 * 60*1000);
    },
    
    

}

export async function scanDevice () {
    return [
        { organize: 'HJ Prototype', name: 'Yuwell YG-990',connector: 'bluetooth', type: 'Blood Pressure', id: 'yg990-00001'},
        { organize: 'ไทม์เมดดิคอลเซ็นเตอร์', name: 'vEKG', connector: 'network', type: 'ekg', id: 'ekg-v-demo' },
        { organize: 'ไทม์เมดดิคอลเซ็นเตอร์', name: 'vScale', connector: 'serial', type: 'scale', id: 'scale-v-demo' },
        { organize: 'ไทม์เมดดิคอลเซ็นเตอร์', name: 'vThermometer', connector: 'usb', type: 'thermometer', id: 'thermometer-v-demo' },
        { organize: 'ไทม์เมดดิคอลเซ็นเตอร์', name: 'vPulseOximeter', connector: 'bluetooth', type: 'pulseOximeter', id: 'pulse-oximeter-v-demo' },
        { organize: 'ไทม์เมดดิคอลเซ็นเตอร์', name: 'vBGM', connector: 'bluetooth', type: 'bgm', id: 'bgm-v-demo' },
        { organize: 'ไทม์เมดดิคอลเซ็นเตอร์', name: 'vNST', connector: 'network', type: 'nst', id: 'nst-v-demo' },
        { organize: 'ไทม์เมดดิคอลเซ็นเตอร์', name: 'vBloodPressure', connector: 'bluetooth', type: 'Blood Pressure', id: 'bpm-v-demo' },
    ]
}

export async function linkDevice (dev: Ref<{ organize: string, name: string, connector: string, type: string, id: string, values:{[key:string]: string} }>, patientID: string) {
    try {
        const selectedFunction = drivers[dev.value.name]
        if (selectedFunction) selectedFunction(dev, patientID)
        else drivers.default(dev, patientID)
    } catch (error) {
        console.error('Device not support')
    }
}

