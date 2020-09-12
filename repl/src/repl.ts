import daytimeAlarm from "./../../app/src/daytimeAlarm"
//const testElem = document.querySelector("#test")

daytimeAlarm("14:35:50").onAlarm((s) => {
  console.log(s)
}).repeat()
