import { Data, DataCollection, DataSubscription } from "josm"
import xtring from "xtring"; xtring()

function currentDaytimeInMs() {
  let d = now()
  return d.getHours() * toMs.hour + d.getMinutes() * toMs.minute + d.getSeconds() * toMs.second + d.getMilliseconds()
}

function nowInMs() {
  return +now()
}

function now() {
  return new Date
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

function formalizeGetMetric(metric: string) {
  return `get${metric.capitalize()}s`
}

function splitDayTimeString(dayTime: string | Date): { plain: { [key in Metric[number]]: Data<number> }, ms: { [key in Metric[number]]: Data<number> }, humanized: { [key in Metric[number]]: Data<string> } } {
  let splitDayTime: [hour: number, minute: number, second: number]
  if (dayTime instanceof Date) {
    splitDayTime = [] as any
    for (let metric of metrics) {
      splitDayTime.push(dayTime[formalizeGetMetric(metric)]())
    }
  }
  else splitDayTime = dayTime.split(":").map(e => +e) as [hour: number, minute: number, second: number]
  
  let ret = {plain: {}, ms: {}, humanized: {}}
  for (let i = 0; i < metrics.length; i++) {
    const metric = metrics[i]
    const toMsFactor = toMs[metric]
    const pln = ret.plain[metric] = new Data(splitDayTime[i] ? splitDayTime[i] : 0)
    ret.ms[metric] = pln.tunnel(time => time * toMsFactor)
    ret.humanized[metric] = pln.tunnel(constructToHumanizedMetric(metric))
  }

  return ret as any
}


const repeatAlias = {
  daily: (now: Date) => now.setDate(now.getDate() + 1)
}


export class DayTimeAlarm {
  private timeoutID: any
  private ms: Data<number>

  public hour: Data<number>
  public minute: Data<number>
  public second: Data<number>
  public running = new Data(false)

  private humanized: Data<string>

  constructor(dayTime: string | Date) {
    const { plain, ms: {hour, minute, second}, humanized: {hour: humHour, minute: humMin, second: humSec} } = splitDayTimeString(dayTime)
    for (let metric in plain) {
      this[metric] = plain[metric]
    }
    this.humanized = new Data
    new DataCollection(humHour, humMin, humSec).get((...a) => {
      let str = ""
      for (let i = 0; i < a.length - 1; i++) {
        str += a[i] + ":"
      }
      this.humanized.set(str + a[a.length - 1])
    })

    this.ms = new Data

    new DataCollection(hour, minute, second).get((hourInMs, minuteInMs, secondInMs) => {
      this.ms.set(hourInMs + minuteInMs + secondInMs)
    })

    new DataCollection(this.running, this.ms, this.repeatOn).get((running, absMs, repeatOn) => {
      this.clearTimeout()
      if (running) {
        let ms: number
        if (repeatOn === null) {
          ms = absMs - currentDaytimeInMs()
          if (ms < 0) ms += toMs.day
        }
        else {
          ms = repeatOn - nowInMs() + absMs
          if (ms < 0) {
            let date = new Date(repeatOn)
            console.warn(`DayTimeAlarm: Repeat: Given next day ${date.getDate()}.${date.getMonth()}.${date.getFullYear()} is in the past!?`)
            return
          }
        }
        
        this.timeoutID = setTimeout(this.alarmCallbacks.bind(this), ms)
      }
    }, false)

  }

  hasAlarmPassedToday() {
    let n = now()
    if (this.hour.get() < n.getHours()) return true
    if (this.hour.get() === n.getHours()) {
      if (this.minute.get() < n.getMinutes()) return true
      if (this.minute.get() === n.getMinutes()) {
        if (this.second.get() <= n.getSeconds()) return true
      }
    }
    return false
  }

  private repeatFunction: Data<((now: Date) => (Date | unknown)) | null> = new Data(null)
  private repeatFunctionExecuter = (func: null | ((now: Date) => (Date | unknown)), fromCurrentDay = false) => {
    if (func) {
      let d = now()
      if (!fromCurrentDay) d.setDate(d.getDate() - 1)
      let q = func(d)
      if (q instanceof Date) d = q
      d.setHours(0)
      d.setMinutes(0)
      d.setSeconds(0)
      d.setMilliseconds(0)
      return +d
    }
    else return null
  }
  private repeatOn: Data<number | null> = this.repeatFunction.tunnel(this.repeatFunctionExecuter)
  
  repeat(when: ((now: Date) => (Date | unknown)) | keyof typeof repeatAlias | null = repeatAlias.daily) {
    this.repeatFunction.set(typeof when === "string" ? repeatAlias[when] : when)
    return this as Omit<this, "repeat" | "start">
  }
  

  once() {
    this.repeat(null)
    return this as Omit<this, "once" | "start">
  }


  private alarmCallbacks() {
    let s = this.toString()
    for (let cb of this.alarmCbs) {
      cb(s)
    }
    this.repeatOn.set(this.repeatFunctionExecuter(this.repeatFunction.get(), true))
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
    return this as Omit<this, "cancel" | "once" | "repeat">
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

export default function(dayTime: string | Date) {
  return new DayTimeAlarm(dayTime).start()
}
