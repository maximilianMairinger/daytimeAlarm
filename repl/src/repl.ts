import daytimeAlarm from "./../../app/src/daytimeAlarm"
//const testElem = document.querySelector("#test")

daytimeAlarm("1:52").onAlarm((s) => {
  console.log("aaaa", s)
})
