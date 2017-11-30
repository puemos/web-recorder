# Speech to text recognition tool that's simplified the API

[![styled with prettier](https://img.shields.io/badge/styled_with-prettier-ff69b4.svg)](https://github.com/prettier/prettier)
[![Greenkeeper badge](https://badges.greenkeeper.io/puemos/web-recorder.svg)](https://greenkeeper.io/)
[![Travis](https://img.shields.io/travis/puemos/web-recorder.svg)](https://travis-ci.org/puemos/web-recorder)
[![Dev Dependencies](https://david-dm.org/puemos/web-recorder/dev-status.svg)](https://david-dm.org/puemos/web-recorder)

### Docs

https://puemos.github.io/web-recorder

### Example

[here](https://github.com/puemos/web-recorder/blob/master/examples/simple.html)

### Usage

```js
import { Recorder } from 'web-recorder'

function onGotStream(stream) {
  audioRecorder = new WebRecorder.Recorder(stream)

  audioRecorder.addEventListener('data', ev => {
    var blobUrl = URL.createObjectURL(ev.detail)

    const record = document.getElementById('record')
    record.src = blobUrl
  })
  audioRecorder.record()
}

function start() {
  navigator.getUserMedia(
    {
      audio: {
        advanced: [
          {
            echoCancelation: false
          }
        ]
      }
    },
    onGotStream,
    console.error
  )
}
function stop() {
  audioRecorder.stop()
}
```

### Features
