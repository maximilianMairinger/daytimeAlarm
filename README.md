# Daytime alarm

Set an (recurring) alarm at a daytime.

## Installation

```shell
 $ npm i daytime-alarm
```

## Usage

```ts
import daytimeAlarm from "daytime-alarm"

// Alarm hits next time the clock shows 15:35:30
let alarm = daytimeAlarm("15:35:30").onAlarm((time) => {
  console.log("Alarm" + time)   // "Alarm 15:35:30"
})
```

### On / Off

```ts
alarm.cancel()

post("/activateAlarm", () => {
  alarm.start()
})
```

### Repeat

```ts
alarm.repeat("daily")

post("/noLongerRepeat", () => {
  alarm.once()
})
```

## Contribute

All feedback is appreciated. Create a pull request or write an issue.
