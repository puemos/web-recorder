import { EventTarget } from './EventTarget'

const worker = require('worker-loader?inline=true!./workers/recorder.worker')

export class Recorder extends EventTarget {
  private recording: boolean
  private bufferLen: number
  private context: AudioContext
  private scriptNode: ScriptProcessorNode
  private worker: Worker

  constructor(private source: GainNode) {
    super()
    this.recording = false
    this.bufferLen = 4096

    this.onAudioProcess = this.onAudioProcess.bind(this)
    this.onWorkerMessage = this.onWorkerMessage.bind(this)
  }
  setup() {
    this.worker = this.worker || worker()

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
    this.dispatchEvent(new CustomEvent('started'))
  }

  onWorkerMessage(ev: MessageEvent) {
    const { command, payload } = ev.data
    switch (command) {
      case 'audioBlob':
        this.dispatchEvent(new CustomEvent('ended', { detail: payload }))
        this.stop()
        break

      default:
        break
    }
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
    this.exportMonoWAV()
  }

  abort() {
    this.kill()
    this.dispatchEvent(new CustomEvent('stopped'))
  }

  kill() {
    this.recording = false
    this.source.disconnect(this.scriptNode)
    this.scriptNode.disconnect(this.context.destination)
    this.worker.terminate()
  }

  clear() {
    this.worker.postMessage({
      command: 'clear'
    })
  }

  getBuffer() {
    this.worker.postMessage({ command: 'getBuffer' })
  }

  exportWAV(type: string = 'audio/wav') {
    this.worker.postMessage({
      command: 'exportWAV',
      payload: { type }
    })
  }

  exportMonoWAV(type: string = 'audio/wav') {
    this.worker.postMessage({
      command: 'exportMonoWAV',
      payload: { type }
    })
  }
}

export default Recorder
