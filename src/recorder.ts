import { EventTarget } from './EventTarget'

const worker = require('worker-loader?inline=true!./workers/recorder.worker')

const audioContext: AudioContext = new AudioContext()

export class Recorder extends EventTarget {
  private recording: boolean
  private ready: boolean
  private bufferLen: number
  private context: AudioContext
  private scriptNode: ScriptProcessorNode
  private worker: Worker
  private source: GainNode

  constructor(private stream: MediaStream) {
    super()
    this.recording = false
    this.ready = false
    this.bufferLen = 4096

    this.onAudioProcess = this.onAudioProcess.bind(this)
    this.onWorkerMessage = this.onWorkerMessage.bind(this)
  }

  start() {
    if (!this.ready) {
      this.setup()
    }
    this.dispatchEvent(new CustomEvent('start'))
    this.recording = true
  }

  pause() {
    this.recording = false
    this.exportWAV()
  }

  reset() {
    this.recording = false
    this.worker.postMessage({
      command: 'clear'
    })
    this.dispatchEvent(new CustomEvent('reset'))
  }

  abort() {
    this.kill()
  }

  getBuffer() {
    this.worker.postMessage({ command: 'getBuffer' })
  }

  private setup() {
    // Init the worker
    this.worker = this.worker || worker()
    this.worker.addEventListener('message', this.onWorkerMessage)

    // Create and connect to the source
    this.source = audioContext.createGain()
    const audioInput = audioContext.createMediaStreamSource(this.stream)
    const analyserNode = audioContext.createAnalyser()
    analyserNode.fftSize = 2048
    this.source.connect(analyserNode)

    const zeroGain = audioContext.createGain()
    zeroGain.gain.value = 0.0
    this.source.connect(zeroGain)
    zeroGain.connect(audioContext.destination)

    this.scriptNode = audioContext.createScriptProcessor(this.bufferLen, 2, 2)
    this.source.connect(this.scriptNode)
    this.scriptNode.connect(audioContext.destination)
    this.scriptNode.addEventListener('audioprocess', this.onAudioProcess)

    this.worker.postMessage({
      command: 'init',
      payload: {
        sampleRate: audioContext.sampleRate
      }
    })
    this.ready = true

    this.dispatchEvent(new CustomEvent('ready'))
  }

  private onWorkerMessage(ev: MessageEvent) {
    const { command, payload } = ev.data
    switch (command) {
      case 'exportWAV':
        this.dispatchEvent(new CustomEvent('data', { detail: payload }))
        break

      default:
        break
    }
  }
  private onAudioProcess(ev: AudioProcessingEvent): void {
    if (!this.recording) {
      return
    }
    this.dispatchEvent(
      new CustomEvent('audioprocess', { detail: ev.inputBuffer })
    )
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

  private kill() {
    this.stream.stop()
    this.source.disconnect(this.scriptNode)
    this.scriptNode.disconnect(audioContext.destination)
    this.worker.terminate()
    this.dispatchEvent(new CustomEvent('stop'))
  }

  private exportWAV(type: string = 'audio/wav') {
    this.worker.postMessage({
      command: 'exportWAV',
      payload: { type }
    })
  }

  private exportMonoWAV(type: string = 'audio/wav') {
    this.worker.postMessage({
      command: 'exportMonoWAV',
      payload: { type }
    })
  }
}

export default Recorder
