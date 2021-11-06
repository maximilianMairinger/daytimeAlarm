import daytimeAlarm from "./../../app/src/daytimeAlarm"
//const testElem = document.querySelector("#test")

const alarm = daytimeAlarm("02:21:59").onAlarm((s) => {
  console.log(s)
}).repeat()

console.log(alarm.hasAlarmPassedToday() ? "passed" : "not passed")
