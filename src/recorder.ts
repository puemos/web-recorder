const Worker = require('worker-loader!./recorder.worker')

export class Recorder {
  private recording: boolean
  private bufferLen: number
  private context: AudioContext
  private scriptNode: ScriptProcessorNode
  private worker: Worker

  constructor(
    private source: GainNode,
    private currCallback: (blob?: any) => any = () => {
      return
    }
  ) {
    this.recording = false
    this.bufferLen = 4096

    this.onAudioProcess = this.onAudioProcess.bind(this)
  }
  setup() {
    this.worker = this.worker || Worker()

    this.context = this.source.context
    this.scriptNode = this.context.createScriptProcessor(this.bufferLen, 2, 2)
    this.source.connect(this.scriptNode)
    this.scriptNode.connect(this.context.destination)
    this.scriptNode.addEventListener('audioprocess', this.onAudioProcess)

    this.worker.addEventListener('message', this.onWorkerMessage)
    this.worker.postMessage({
      command: 'init',
      payload: {
        sampleRate: this.context.sampleRate
      }
    })
  }
  onWorkerMessage(ev: MessageEvent) {
    const blob = ev.data
    this.currCallback(blob)
  }
  onAudioProcess(ev: AudioProcessingEvent): void {
    if (!this.recording) {
      return
    }
    this.worker.postMessage({
      command: 'record',
      payload: {
        buffer: [
          ev.inputBuffer.getChannelData(0),
          ev.inputBuffer.getChannelData(1)
        ]
      }
    })
  }
  record() {
    this.setup()
    this.recording = true
  }

  stop() {
    this.worker.terminate()
    this.recording = false
    this.source.disconnect(this.scriptNode)
    this.scriptNode.disconnect(this.context.destination)
  }

  clear() {
    this.worker.postMessage({
      command: 'clear'
    })
  }

  getBuffer(cb: () => any) {
    this.currCallback = cb
    this.worker.postMessage({ command: 'getBuffer' })
  }

  exportWAV(cb: () => any, type: string = 'audio/wav') {
    this.currCallback = cb
    this.worker.postMessage({
      command: 'exportWAV',
      payload: { type }
    })
  }

  exportMonoWAV(cb: () => any, type: string) {
    this.currCallback = cb
    this.worker.postMessage({
      command: 'exportMonoWAV',
      payload: { type }
    })
  }
}

export default Recorder
