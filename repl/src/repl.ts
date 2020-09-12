import daytimeAlarm from "./../../app/src/daytimeAlarm"
//const testElem = document.querySelector("#test")

daytimeAlarm("15:35:20").onAlarm((s) => {
  console.log(s)
}).repeat((w) => w.setTime(0))
