import { Data, DataCollection, DataSubscription } from "josm"
import xtring from "xtring"; xtring()
import { setTimeout, clearTimeout } from "long-timeout"
import nthCheck from "nth-check";


const maxRetryCount = 10000

function apr(trei: (nextAlarm: Date, init: Date) => void) {
  return (test: (now: Date) => boolean = () => true) => (now: Date, init: Date) => {
    let itr = 0
    do {
      trei(now, init)
      if (itr >= maxRetryCount) throw new Error("Unable to find repeat day that gets approved")
      itr++
    } while (!test(now))
  }
}

function nthApr(trei: (nextAlarm: Date, init: Date) => void) {
  return (nth_test: number | string | ((now: Date) => boolean) = () => true) => {
    if (!(nth_test instanceof Function)) {
      if (typeof nth_test === "number") nth_test = nth_test.toString()
      const nthF = nthCheck(nth_test)
      let inc = 1
      nth_test = () => nthF(inc++)
    }

    return apr(trei)(nth_test as (now: Date) => boolean)
  }
    
}

export const Repeat = {
  daily: nthApr((now) => {
    now.setDate(now.getDate() + 1)
  }),
  weekly: nthApr((now) => {
    now.setDate(now.getDate() + 7)
  }),
  weekDays: apr((now) => {
    now.setDate(now.getDate() + 1)
    let weekDay = now.getDay()
    if (weekDay > 5) now.setDate(now.getDate() + 8 - weekDay)
  }),
  weekEnds: apr((now) => {
    now.setDate(now.getDate() + 1)
    let weekDay = now.getDay()
    if (weekDay < 6) now.setDate(now.getDate() + 6 - weekDay)
  }),
  monthly: nthApr((now, init) => {
    now.setDate(56 /* 28 * 2 */)  // Will always skip **one** month
    let month = now.getMonth()
    now.setDate(init.getDate())
    while(now.getMonth() !== month) {
      now.setDate(now.getDate() - 1)
    }
  }),
  yearly: nthApr((now, init) => {
    now.setDate(0)
    now.setMonth(20)
    let month = init.getMonth()
    now.setMonth(month)
    now.setDate(init.getDate())
    while(now.getMonth() !== month) {
      now.setDate(now.getDate() - 1)
    }
  })
}

const repeatDelayDefault = Repeat.daily()


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

  
  /**
   * Initiates (but does not start) a new DayTimeAlarm using the dayTime given.
   * @param dayTime The time of day (in the format "HH:MM:SS" or "HH:MM" or "HH") when the alarm should be triggered.
   */
  constructor(dayTime: string)
  /**
   * Initiates (but does not start) a new DayTimeAlarm using the dayTime given.
   * @param dayTime The time of day as Date (of which only the hours, minutes and seconds are read) when the alarm should be triggered.
   */
  constructor(dayTime: Date)
  constructor(dayTime: string | Date)
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

  /**
   * Whether or not the alarm has already passed today relative to the optional dayTime given (default is now).
   * @param dayTime The time of today (in the format "HH:MM:SS" or "HH:MM" or "HH") to be compared to.
   */
  hasAlarmPassedToday(dayTime?: string): boolean
  /**
   * Whether or not the alarm has already passed today relative to the optional dayTime given (default is now).
   * @param dayTime The time of today as Date (of which only the hours, minutes and seconds are read) to be compared to.
   */
  hasAlarmPassedToday(dayTime?: Date): boolean
  hasAlarmPassedToday(dayTime?: Date | string): boolean
  hasAlarmPassedToday(dayTime: Date | string = now()) {
    let n = dayTime instanceof Date ? dayTime : dayTimeToDate(dayTime)
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
      for (i = 0; i < maxRetryCount; i++) {
        d = new Date(base)
        d.setDate(d.getDate() + i)
        try {
          func(d, this.repeatInitTime)
        }
        catch(e) {
          console.error("DayTimeAlarm: Repeat: Encoutered error while executing repeat function:", e)
          console.error("DayTimeAlarm: Repeat: Will cancel repeat of this alarm.")
          this.once()
          return null
        }
        
        dDate = +dateify(d)
        if ((nowDate < dDate) || (nowDate === dDate && !alarmHasPassedToday)) break
      }

      if (i > 0) {
        console.warn(`DayTimeAlarm: Repeat: Given next day is in the past! Tried ${i} time(s) to evade the error by jumping one day into the future.`)
        if (i >= maxRetryCount) {
          console.error(`DayTimeAlarm: Repeat: Gave up error evasion. Canceling repeat.`)
          this.once()
          return null
        }
        else {
          console.warn(`DayTimeAlarm: Repeat: Was able to resolve the issue.`)
        }
      }

      return dDate
    }
    else return null
  }
  private repeatOn: Data<number | null> = this.repeatFunction.tunnel(this.repeatFunctionExecuter)
  private repeatInitTime: Date


  
  /**
   * Let the alarm repeat in a (highly customizable) given interval. The alarm will always trigger at the set dayTime, thus the minimum interval is daily.
   * @param when Customize the interval by instanciating the presets manually (e.g: Repeat.daily("2n+3")), or, for even more control, provide a function that takes the current date as argument (and the inital date as reference) and modifies it to represent the next date. A simple example would be:
   * ```
   * alarm.repeat(function daily(now: Date, init: Date) => {
   *   now.setDate(now.getDate() + 1)
   * })
   * ```
   */
  repeat(when?: (now: Date, initDate: Date) => void): Omit<this, "repeat" | "start">
  /**
   * Let the alarm repeat in a (highly customizable) given interval. The alarm will always trigger at the set dayTime, thus the minimum interval is daily.
   * @param when Use one of the interval presets like "daily" | "weekly" | "weekDays" | "weekEnds" | "monthly" | "yearly"
   */
  repeat(when?: (keyof typeof Repeat)): Omit<this, "repeat" | "start">
  /**
   * Let the alarm repeat in a (highly customizable) given interval. The alarm will always trigger at the set dayTime, thus the minimum interval is daily. 
   * @param when Giving null as a parameter will cancel the repeat.
   */
  repeat(when?: null): Omit<this, "repeat" | "start">
  repeat(when?: ((now: Date, initDate: Date) => void) | keyof typeof Repeat | null): Omit<this, "repeat" | "start">
  repeat(when: ((now: Date, initDate: Date) => void) | keyof typeof Repeat | null = repeatDelayDefault) {
    this.repeatInitTime = dateify(new Date)
    this.repeatFunction.set(typeof when === "string" ? Repeat[when]() : when)
    return this as Omit<this, "repeat" | "start">
  }
  
  /**
   * Cancel the repeat of the alarm. The next alarm will still trigger, but afterwards none.
   * To cancel the repeat, use `alarm.cancel()`.
   */
  once() {
    this.repeat(null)
    return this as Omit<this, "once" | "start">
  }


  private alarmCallbacks() {
    // console.log("Error of " + (+dayTimeInMs() - this.ms.get()))
    let s = this.toString()
    for (let cb of this.alarmCbs) {
      cb(s)
    }
    this.repeatOn.set(this.repeatFunctionExecuter(this.repeatFunction.get(), true))
  }
  private alarmCbs = []
  then(cb: (toString: string) => void) {
    return this.onAlarm(cb)
  }
  onAlarm(cb: (toString: string) => void) {
    this.alarmCbs.push(cb)
    return this
  }
  offAlarm(cb: (toString: string) => void) {
    this.alarmCbs.splice(this.alarmCbs.indexOf(cb), 1)
    return this
  }

  /**
   * Start the alarm
   * @param onAlarm 
   */
  start(onAlarm?: () => void) {
    if (onAlarm) this.onAlarm(onAlarm)
    this.running.set(true)
    return this as Omit<this, "start">
  }
  /**
   * Cancel the alarm with immediate effect.
   * To start the alarm again, use `alarm.start()`.
   */
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

/**
 * Initiates and starts a new DayTimeAlarm using the dayTime given.
 * @param dayTime The time of day (in the format "HH:MM:SS" or "HH:MM" or "HH") when the alarm should be triggered.
 */
export default function(dayTime: string): DayTimeAlarm
/**
 * Initiates and starts a new DayTimeAlarm using the dayTime given.
 * @param dayTime The time of day as Date (of which only the hours, minutes and seconds are read) when the alarm should be triggered.
 */
export default function(dayTime: Date): DayTimeAlarm
export default function(dayTime: string | Date): DayTimeAlarm
export default function(dayTime: string | Date) {
  return new DayTimeAlarm(dayTime).start()
}
