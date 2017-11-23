// https://gist.github.com/amiika/5525347
const ctx: Worker = self as any

let recLength: number = 0
let recBuffersL: Float32Array[] = []
let recBuffersR: Float32Array[] = []
let sampleRate: number

function init(sampleRate: number): void {
  sampleRate = sampleRate
}
function floatTo16BitPCM(
  output: DataView,
  offset: number,
  input: Float32Array
) {
  for (let i = 0; i < input.length; i += 1, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]))
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
}

function writeString(view: DataView, offset: number, type: string) {
  for (let i = 0; i < type.length; i += 1) {
    view.setUint8(offset + i, type.charCodeAt(i))
  }
}
function encodeWAV(samples: Float32Array, mono = false): DataView {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)

  /* RIFF identifier */
  writeString(view, 0, 'RIFF')
  /* file length */
  view.setUint32(4, 32 + samples.length * 2, true)
  /* RIFF type */
  writeString(view, 8, 'WAVE')
  /* format chunk identifier */
  writeString(view, 12, 'fmt ')
  /* format chunk length */
  view.setUint32(16, 16, true)
  /* sample format (raw) */
  view.setUint16(20, 1, true)
  /* channel count */
  view.setUint16(22, mono ? 1 : 2, true)
  /* sample rate */
  view.setUint32(24, sampleRate, true)
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * 4, true)
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, 4, true)
  /* bits per sample */
  view.setUint16(34, 16, true)
  /* data chunk identifier */
  writeString(view, 36, 'data')
  /* data chunk length */
  view.setUint32(40, samples.length * 2, true)

  floatTo16BitPCM(view, 44, samples)

  return view
}
function record(inputBuffer: Float32Array[]) {
  recBuffersL.push(inputBuffer[0])
  recBuffersR.push(inputBuffer[1])
  recLength += inputBuffer[0].length
}
function interleave(inputL: Float32Array, inputR: Float32Array): Float32Array {
  const length = inputL.length + inputR.length
  const result = new Float32Array(length)

  let index = 0
  let inputIndex = 0

  while (index < length) {
    result[(index += 1)] = inputL[inputIndex]
    result[(index += 1)] = inputR[inputIndex]
    inputIndex += 1
  }
  return result
}
function mergeBuffers(
  recBuffers: Float32Array[],
  recLength: number
): Float32Array {
  const result = new Float32Array(recLength)
  let offset = 0
  for (let i = 0; i < recBuffers.length; i += 1) {
    result.set(recBuffers[i], offset)
    offset += recBuffers[i].length
  }
  return result
}
function exportWAV(type: string) {
  const bufferL = mergeBuffers(recBuffersL, recLength)
  const bufferR = mergeBuffers(recBuffersR, recLength)
  const interleaved = interleave(bufferL, bufferR)
  const dataview = encodeWAV(interleaved)
  const audioBlob = new Blob([dataview], { type })

  ctx.postMessage(audioBlob)
}

function exportMonoWAV(type: string) {
  const bufferL = mergeBuffers(recBuffersL, recLength)
  const dataview = encodeWAV(bufferL, true)
  const audioBlob = new Blob([dataview], { type })
  ctx.postMessage(audioBlob)
}
function getBuffer() {
  const buffers = []
  buffers.push(mergeBuffers(recBuffersL, recLength))
  buffers.push(mergeBuffers(recBuffersR, recLength))
  ctx.postMessage(buffers)
}

function clear() {
  recLength = 0
  recBuffersL = []
  recBuffersR = []
}

ctx.onmessage = (ev: MessageEvent) => {
  const { command, payload } = ev.data
  switch (command) {
    case 'init':
      init(payload.sampleRate)
      break
    case 'record':
      record(ev.data.buffer)
      break
    case 'exportWAV':
      exportWAV(ev.data.type)
      break
    case 'getBuffer':
      getBuffer()
      break
    case 'clear':
      clear()
      break
  }
}
