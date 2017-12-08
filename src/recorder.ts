import { EventTarget } from './EventTarget'
import { IConfig } from './workers/recorder.worker'

const worker = require('worker-loader?inline=true!./workers/recorder.worker')

const audioContext: AudioContext = new AudioContext()

export class Recorder extends EventTarget {
  private recording: boolean
  private ready: boolean
  private bufferLen: number
  private context: AudioContext
  private scriptProcessorNode: ScriptProcessorNode
  private analyserNode: AnalyserNode
  private gainNode: GainNode
  private worker: Worker
  private source: GainNode
  private exportInterval: number
  private intervalId: number
  private audioTracks: MediaStreamTrack[]
  private analyserData: Float32Array
  private maxVolume: number

  constructor(private stream: MediaStream, private mono: boolean = false) {
    super()
    this.recording = false
    this.ready = false
    this.bufferLen = 4096

    this.onAudioProcess = this.onAudioProcess.bind(this)
    this.onWorkerMessage = this.onWorkerMessage.bind(this)
  }

  start(exportInterval: number = 0) {
    if (exportInterval > 0) {
      this.intervalId = setInterval(() => {
        if (this.ready) {
          this.exportWAV()
        }
      }, exportInterval)
    }

    if (!this.ready) {
      this.setup()
    }
    this.dispatchEvent(new CustomEvent('start'))
    this.recording = true
  }

  pause() {
    this.recording = false
    if (this.intervalId) {
      clearInterval(this.intervalId)
    }
    this.exportWAV()
  }

  reset() {
    this.recording = false
    if (this.intervalId) {
      clearInterval(this.intervalId)
    }
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

    this.scriptProcessorNode = audioContext.createScriptProcessor(
      this.bufferLen,
      2,
      2
    )
    this.scriptProcessorNode.connect(audioContext.destination)
    this.scriptProcessorNode.addEventListener(
      'audioprocess',
      this.onAudioProcess
    )

    const audioInput = audioContext.createMediaStreamSource(this.stream)

    this.source = audioContext.createGain()

    this.audioTracks = this.stream.getAudioTracks()

    this.analyserNode = audioContext.createAnalyser()
    this.analyserNode.fftSize = 2048
    this.analyserNode.minDecibels = -90
    this.analyserNode.maxDecibels = -30
    this.analyserNode.connect(this.scriptProcessorNode)
    this.analyserData = new Float32Array(this.analyserNode.frequencyBinCount)

    this.gainNode = audioContext.createGain()
    this.gainNode.gain.setValueAtTime(0.0, audioContext.currentTime)
    this.gainNode.connect(audioContext.destination)
    this.gainNode.connect(audioContext.destination)

    this.source.connect(this.gainNode)
    this.source.connect(this.scriptProcessorNode)
    this.source.connect(this.analyserNode)

    const config: IConfig = {
      sampleRate: audioContext.sampleRate,
      numChannels: this.mono ? 1 : this.stream.getAudioTracks().length
    }

    this.worker.postMessage({
      command: 'init',
      payload: config
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
    this.analyserNode.getFloatFrequencyData(this.analyserData)
    this.maxVolume = Math.max(...Array.from(this.analyserData))
    this.isQuiet()
  }
  private isQuiet() {
    const isMicQuiet = this.maxVolume < -75 // this.volumeThreshold
    console.log(this.maxVolume, isMicQuiet)
  }
  private kill() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
    }
    this.audioTracks.forEach((mediaStreamTrack: MediaStreamTrack) => {
      mediaStreamTrack.stop()
    })
    this.source.disconnect(this.scriptProcessorNode)
    this.scriptProcessorNode.disconnect(audioContext.destination)
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
