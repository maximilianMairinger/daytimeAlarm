import { Data, DataCollection, DataSubscription } from "josm"

function currentDaytimeInMs() {
  let d = new Date()
  return d.getHours() * toMs.hour + d.getMinutes() * toMs.minute + d.getSeconds() * toMs.second + d.getMilliseconds()
}

type Metric = ["hour", "minute", "second"]
const metrics: Metric = ["hour", "minute", "second"]

const toMs = {
  day: 86400000,
  hour: 3600000,
  minute: 60000,
  second: 1000,
  milliSecond: 1
}

const humanizedDigits: {
  hour: 2,
  minute: 2,
  second: 2
} = {} as any
for (let metric of metrics) {
  humanizedDigits[metric] = 2
}


function constructToHumanizedMetric(metricName: string): (metric: number | string) => string
function constructToHumanizedMetric(digits: number): (metric: number | string) => string
function constructToHumanizedMetric(digits_metricName: number | string): (metric: number | string) => string {
  const digits = typeof digits_metricName === "number" ? digits_metricName : humanizedDigits[digits_metricName]
  return function toHumanizedMetric(metric: number | string) {
    let str = metric.toString()
    for (let i = str.length; i < digits; i++) {
      str = "0" + str
    }
    return str
  }
}

function splitDayTimeString(dayTime: string): { plain: { [key in Metric[number]]: Data<number> }, ms: { [key in Metric[number]]: Data<number> }, humanized: { [key in Metric[number]]: Data<string> } } {
  let splitDayTime = dayTime.split(":")
  let ret = {plain: {}, ms: {}, humanized: {}}
  for (let i = 0; i < metrics.length; i++) {
    const metric = metrics[i]
    const toMsFactor = toMs[metric]
    const pln = ret.plain[metric] = new Data(splitDayTime[i] ? +splitDayTime[i] : 0)
    ret.ms[metric] = pln.tunnel(time => time * toMsFactor)
    ret.humanized[metric] = pln.tunnel(constructToHumanizedMetric(metric))
  }

  return ret as any
}



export class DayTimeAlarm {
  private timeoutID: any
  private ms: Data<number>

  public hour: Data<number>
  public minute: Data<number>
  public second: Data<number>
  public running = new Data(false)

  private humanized: Data<string>

  constructor(dayTime: string) {
    const { plain, ms: {hour, minute, second}, humanized: {hour: humHour, minute: humMin, second: humSec} } = splitDayTimeString(dayTime)
    for (let metric in plain) {
      this[metric] = plain[metric]
    }
    this.humanized = new Data
    new DataCollection(humHour, humMin, humSec).get((...a) => {
      let str = ""
      for (let k of a) {
        str += k + ":"
      }
      this.humanized.set(str.substring(0, str.length-1))
    })

    this.ms = new Data

    new DataCollection(hour, minute, second).get((hourInMs, minuteInMs, secondInMs) => {
      this.ms.set(hourInMs + minuteInMs + secondInMs)
    })

    new DataCollection(this.running, this.ms).get((running, absMs) => {
      this.clearTimeout()
      if (running) {
        let ms = absMs - currentDaytimeInMs()
        if (ms < 0) ms += toMs.day
        this.timeoutID = setTimeout(this.alarmCallbacks.bind(this), ms)
      }
    }, false)

  }


  private alarmCallbacks() {
    let s = this.toString()
    for (let cb of this.alarmCbs) {
      cb(s)
    }
  }
  private alarmCbs = []
  onAlarm(cb: (toString: string) => void) {
    this.alarmCbs.push(cb)
    return this
  }
  offAlarm(cb: (toString: string) => void) {
    this.alarmCbs.splice(this.alarmCbs.indexOf(cb), 1)
    return this
  }

  
  start(onAlarm?: () => void) {
    if (onAlarm) this.onAlarm(onAlarm)
    this.running.set(true)
    return this as Omit<this, "start">
  }
  cancel() {
    this.running.set(false)
    return this as Omit<this, "cancel">
  }
  private clearTimeout() {
    if (this.timeoutID !== undefined) clearTimeout(this.timeoutID)
  }

  
  toString(): string
  toString(cb: (humanized: string) => void): DataSubscription<[string]>
  toString(cb?: (humanized: string) => void) {
    if (cb) return this.humanized.get(cb)
    return this.humanized.get()
  }
}

export default function(dayTime: string) {
  return new DayTimeAlarm(dayTime).start()
}
