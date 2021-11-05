import { Data, DataCollection, DataSubscription } from "josm"
import xtring from "xtring"; xtring()
import { setTimeout } from "long-timeout"


const repeatAlias = {
  daily: (now: Date) => {now.setDate(now.getDate() + 1)},
  weekDays: (now: Date) => {
    now.setDate(now.getDate() + 1)
    let weekDay = now.getDay()
    if (weekDay > 5) now.setDate(now.getDate() + 8 - weekDay)
  },
  weekEnds: (now: Date) => {
    now.setDate(now.getDate() + 1)
    let weekDay = now.getDay()
    if (weekDay < 6) now.setDate(now.getDate() + 6 - weekDay)
  },
  monthly: (now: Date, init: Date) => {
    now.setDate(56 /* 28 * 2 */)  // Will always skip **one** month
    let month = now.getMonth()
    now.setDate(init.getDate())
    while(now.getMonth() !== month) {
      now.setDate(now.getDate() - 1)
    }
  },
  yearly(now: Date, init: Date) {
    now.setDate(0)
    now.setMonth(20)
    let month = init.getMonth()
    now.setMonth(month)
    now.setDate(init.getDate())
    while(now.getMonth() !== month) {
      now.setDate(now.getDate() - 1)
    }
  }
}


function dayTimeInMs(d = now()) {
  return d.getHours() * toMs.hour + d.getMinutes() * toMs.minute + d.getSeconds() * toMs.second + d.getMilliseconds()
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

function splitDayTime(dayTime: string) {
  return dayTime.split(":").map(e => +e) as [hour: number, minute: number, second: number]
}

function splitDayTimeString(dayTime: string | Date): { plain: { [key in Metric[number]]: Data<number> }, ms: { [key in Metric[number]]: Data<number> }, humanized: { [key in Metric[number]]: Data<string> } } {
  let dayTimeSplit: [hour: number, minute: number, second: number]
  if (dayTime instanceof Date) {
    dayTimeSplit = [] as any
    for (let metric of metrics) {
      dayTimeSplit.push(dayTime[formalizeGetMetric(metric)]())
    }
  }
  else dayTimeSplit = splitDayTime(dayTime)
  
  let ret = {plain: {}, ms: {}, humanized: {}}
  for (let i = 0; i < metrics.length; i++) {
    const metric = metrics[i]
    const toMsFactor = toMs[metric]
    const pln = ret.plain[metric] = new Data(dayTimeSplit[i] ? dayTimeSplit[i] : 0)
    ret.ms[metric] = pln.tunnel(time => time * toMsFactor)
    ret.humanized[metric] = pln.tunnel(constructToHumanizedMetric(metric))
  }

  return ret as any
}

function dateify(d: Date) {
  d.setHours(0)
  d.setMinutes(0)
  d.setSeconds(0)
  d.setMilliseconds(0)
  return d
}

function dayTimeToDate(dayTime: string) {
  let d = now()
  d.setTime(0)
  let split = splitDayTime(dayTime)
  d.setHours(split[0])
  d.setMinutes(split[1])
  d.setSeconds(split[2])
  return d
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
          ms = absMs - dayTimeInMs()
          if (ms < 0) ms += toMs.day
        }
        else {
          ms = repeatOn - +now() + absMs
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

  hasAlarmPassedToday(date_dayTime: Date | string = now()) {
    let n = date_dayTime instanceof Date ? date_dayTime : dayTimeToDate(date_dayTime)
    if (this.hour.get() < n.getHours()) return true
    if (this.hour.get() === n.getHours()) {
      if (this.minute.get() < n.getMinutes()) return true
      if (this.minute.get() === n.getMinutes()) {
        if (this.second.get() <= n.getSeconds()) return true
      }
    }
    return false
  }

  private repeatFunction: Data<((now: Date, initDate: Date) => void) | null> = new Data(null)
  private repeatFunctionExecuter = (func: null | ((now: Date, initDate: Date) => void), surelyPassed = false) => {
    if (func) {
      let base = now()
      let alarmHasPassedToday = this.hasAlarmPassedToday(base)
      if (!surelyPassed && !alarmHasPassedToday) base.setDate(base.getDate() - 1)
      let nowDate = +dateify(base)


      let d: Date
      let dDate: number
      let i: number
      for (i = 0; i < 1000; i++) {
        d = new Date(base)
        d.setDate(d.getDate() + i)
        func(d, this.repeatInitTime)
        dDate = +dateify(d)
        if ((nowDate < dDate) || (nowDate === dDate && !alarmHasPassedToday)) break
      }

      if (i > 0) {
        console.warn(`DayTimeAlarm: Repeat: Given next day is in the past! Tried ${i} time(s) to evade the error by jumping one day into the future.`)
        if (i === 1000) {
          console.error(`DayTimeAlarm: Repeat: Gave up error evasion. Canceling repeat.`)
          return null
        }
      }

      return dDate
    }
    else return null
  }
  private repeatOn: Data<number | null> = this.repeatFunction.tunnel(this.repeatFunctionExecuter)
  private repeatInitTime: Date

  repeat(when: ((now: Date, initDate: Date) => void) | keyof typeof repeatAlias | null = repeatAlias.daily) {
    this.repeatInitTime = dateify(new Date)
    this.repeatFunction.set(typeof when === "string" ? repeatAlias[when] : when)
    return this as Omit<this, "repeat" | "start">
  }
  

  once() {
    this.repeat(null)
    return this as Omit<this, "once" | "start">
  }


  private alarmCallbacks() {
    console.log(+dayTimeInMs() - this.ms.get())
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
