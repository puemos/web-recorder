import { EventTarget } from './EventTarget'
import { IConfig } from './workers/recorder.worker'

export interface IOptionsMaybe {
  mono?: boolean
  quietThresholdTime?: number
  volumeThreshold?: number
}
export interface IOptions {
  mono: boolean
  quietThresholdTime: number
  volumeThreshold: number
}

declare function require(name: string): any

const worker = require('worker-loader?inline=true!./workers/recorder.worker')

AudioContext = (window as any).webkitAudioContext || AudioContext

const audioContext: AudioContext = new AudioContext()

export class Recorder extends EventTarget {
  private recording: boolean
  private ready: boolean
  private bufferLen: number
  private options: IOptions
  private quietTime: number
  private maxVolume: number
  private worker: Worker
  private analyserData: Float32Array
  private scriptProcessorNode?: ScriptProcessorNode
  private analyserNode?: AnalyserNode
  private context?: AudioContext
  private gainNode?: GainNode
  private source?: MediaStreamAudioSourceNode
  private exportInterval?: number
  private audioTracks?: MediaStreamTrack[]

  constructor(private stream: MediaStream, options: IOptionsMaybe = {}) {
    super()

    this.recording = false
    this.ready = false
    this.bufferLen = 4096
    this.quietTime = 0
    this.maxVolume = 99
    this.worker = worker()
    this.analyserData = new Float32Array()
    this.options = {
      mono: options.mono || true,
      quietThresholdTime: options.quietThresholdTime || 5,
      volumeThreshold: options.volumeThreshold || -60
    }

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

  stop() {
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
    this.dispatchEvent(new CustomEvent('stop'))
    this.kill()
  }

  getBuffer() {
    this.worker.postMessage({ command: 'getBuffer' })
  }

  private setup() {
    // Init the worker
    this.worker.addEventListener('message', this.onWorkerMessage)

    this.scriptProcessorNode = audioContext.createScriptProcessor(this.bufferLen, 2, 2)
    this.scriptProcessorNode.connect(audioContext.destination)
    this.scriptProcessorNode.addEventListener('audioprocess', this.onAudioProcess)

    this.source = audioContext.createMediaStreamSource(this.stream)

    this.audioTracks = this.stream.getAudioTracks()

    this.analyserNode = audioContext.createAnalyser()
    this.analyserNode.fftSize = 2048
    this.analyserNode.minDecibels = -90
    this.analyserNode.maxDecibels = -30
    this.analyserNode.connect(this.scriptProcessorNode)
    this.analyserData = new Float32Array(this.analyserNode.frequencyBinCount)

    this.gainNode = audioContext.createGain()
    // no feedback
    this.gainNode.gain.setValueAtTime(0.0, audioContext.currentTime)
    this.gainNode.connect(audioContext.destination)

    this.source.connect(this.gainNode)
    this.source.connect(this.scriptProcessorNode)
    this.source.connect(this.analyserNode)

    const config: IConfig = {
      sampleRate: audioContext.sampleRate,
      numChannels: this.options.mono ? 1 : this.stream.getAudioTracks().length
    }

    this.worker.postMessage({
      command: 'init',
      payload: config
    })

    this.ready = true
    this.quietTime = audioContext.currentTime

    this.dispatchEvent(new CustomEvent('ready'))
  }

  private onWorkerMessage(ev: MessageEvent) {
    const { command, payload } = ev.data
    switch (command) {
      case 'exportWAV':
        this.dispatchEvent(new CustomEvent('data', { detail: payload }))
        this.kill()
        break

      default:
        break
    }
  }
  private onAudioProcess(ev: AudioProcessingEvent): void {
    if (!this.recording) {
      return
    }
    this.dispatchEvent(new CustomEvent('audioprocess', { detail: ev.inputBuffer }))
    this.worker.postMessage({
      command: 'record',
      payload: {
        buffer: [ev.inputBuffer.getChannelData(0), ev.inputBuffer.getChannelData(1)]
      }
    })
    if (this.analyserNode) {
      this.analyserNode.getFloatFrequencyData(this.analyserData)
    }
    this.maxVolume = Math.max(...Array.from(this.analyserData))
    this.isQuiet()
  }
  private isQuiet() {
    const now = audioContext.currentTime
    const delta = now - this.quietTime
    const isMicQuiet = this.maxVolume < this.options.volumeThreshold

    if (delta > this.options.quietThresholdTime && isMicQuiet) {
      this.stop()
    }
    if (!isMicQuiet) {
      this.quietTime = audioContext.currentTime
    }
  }
  private kill() {
    if (this.audioTracks) {
      this.audioTracks.forEach((mediaStreamTrack: MediaStreamTrack) => {
        mediaStreamTrack.stop()
      })
    }
    if (this.source && this.scriptProcessorNode) {
      this.source.disconnect(this.scriptProcessorNode)
    }
    if (this.scriptProcessorNode) {
      this.scriptProcessorNode.disconnect(audioContext.destination)
    }
    this.worker.terminate()
    this.dispatchEvent(new CustomEvent('end'))
  }

  private exportWAV(type: string = 'audio/wav') {
    this.worker.postMessage({
      command: 'exportWAV',
      payload: { type }
    })
  }
}

export default Recorder
