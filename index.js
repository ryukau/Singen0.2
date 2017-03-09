const TWO_PI = 2 * Math.PI

class RenderParameters {
  constructor(audioContext, overSampling) {
    this.audioContext = audioContext
    this.overSampling = overSampling
  }

  get sampleRate() {
    return this._sampleRate
  }

  get overSampling() {
    return this._overSampling
  }

  set overSampling(value) {
    this._overSampling = value
    this._sampleRate = this._overSampling * this.audioContext.sampleRate
  }
}

function play(audioContext, wave) {
  if (checkboxQuickSave.value) {
    save(wave)
  }

  var channel = wave.channels
  var frame = wave.frames
  var buffer = audioContext.createBuffer(channel, frame, audioContext.sampleRate)

  for (var i = 0; i < wave.channels; ++i) {
    var waveFloat32 = new Float32Array(wave.data[i])
    buffer.copyToChannel(waveFloat32, i, 0)
  }

  if (this.source !== undefined) {
    this.source.stop()
  }
  this.source = audioContext.createBufferSource()
  this.source.buffer = buffer
  this.source.connect(audioContext.destination)
  this.source.start()
}

function save(wave) {
  var buffer = Wave.toBuffer(wave, wave.channels)
  var header = Wave.fileHeader(audioContext.sampleRate, wave.channels,
    buffer.length)

  var blob = new Blob([header, buffer], { type: "application/octet-stream" })
  var url = window.URL.createObjectURL(blob)

  var a = document.createElement("a")
  a.style = "display: none"
  a.href = url
  a.download = "Singen0.1_" + Date.now() + ".wav"
  document.body.appendChild(a)
  a.click()

  // Firefoxでダウンロードできるようにするための遅延。
  setTimeout(() => {
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }, 100)
}

// length is time in seconds.
function makeWave(length, sampleRate) {
  var waveLength = Math.floor(sampleRate * length)
  var wave = new Array(waveLength).fill(0)
  for (var t = 0; t < wave.length; ++t) {
    wave[t] += oscillator.oscillate(t)
  }
  return wave
}

class TwoPoleLP {
  //
  // Two Poleとして紹介されていた差分方程式の
  // 定数 a1 と a2 に適当な値を入れたフィルタ。
  // y[n] = b0 * x[n] - a1 * y[n-1] - a2 * y[n-2]
  //
  // cutoff の値は [1, 10^8]
  // resonance の値は [0, 0.5]
  //
  constructor(sampleRate) {
    this.sampleRate = sampleRate
    this.y = new Array(3).fill(0)
    this._cutoff = 1e8
    this._resonance = 0

    this.a1 = null
    this.a2 = null
    this.refresh()
  }

  cutoff(value) {
    var clamped = Math.max(1, Math.min(value, 1e8))
    this._cutoff = Math.pow(10, clamped * 8)
    this.refresh()
  }

  resonance(value) {
    var clamped = 1 - Math.max(0, Math.min(value, 1))
    this._resonance = 0.5 * (1 - clamped * clamped * clamped)
    this.refresh()
  }

  refresh() {
    this.a1 = 100 * this.sampleRate * this._cutoff
    this.a2 = -this._resonance * this.a1
  }

  clear() {
    this.y.fill(0)
  }

  pass(input) {
    var numer = (input + this.a1 * this.y[1] + this.a2 * this.y[2])
    var denom = 1 + this.a1 + this.a2
    var output = numer / denom

    this.y.unshift(output)
    this.y.pop()

    return output
  }
}

class Delay {
  constructor(renderParameters) {
    this.renderParameters = renderParameters
    this.buffer = []
    this.index = 0
    this._feedback = 0.5
  }

  // value is time in seconds.
  set length(value) {
    var length = Math.floor(value * this.renderParameters.sampleRate / 1000)
    length = (length < 1) ? 1 : length
    this.buffer = new Array(length).fill(0)
  }

  set feedback(value) {
    this._feedback = Math.max(-0.99, Math.min(value, 0.99))
  }

  refresh() {
    this.buffer.fill(0)
    this.index = 0
  }

  pass(input) {
    var output = input + this.buffer[this.index] * this._feedback
    this.buffer[this.index] = output
    this.index = (this.index + 1) % this.buffer.length
    return output
  }
}

class Oscillator {
  // Require TWO_PI = 2 * Math.PI.
  constructor(renderParameters) {
    this.renderParameters = renderParameters

    this.gain = 1
    this.gainEnvelope = new Envelope(0.5, 0.5, 0.5, 0.5)
    this.pitchEnvelope = new Envelope(0.5, 0.5, 0.5, 0.5)
    this._pitchStart = 200
    this._pitchEnd = 30
    this._length = 960
    this._fmIndex = 16 / this.renderParameters.overSampling

    this.phase = 0

    this.twoPiRate = TWO_PI / this.renderParameters.sampleRate
    this.pitchDiff = this._pitchStart - this._pitchEnd
    this.pitchEndFixed = this._pitchEnd - 1
  }

  get length() {
    return this._length
  }

  set length(value) {
    this._length = (value < 0) ? 0
      : Math.floor(this.renderParameters.sampleRate * value)
  }

  set fmIndex(index) {
    this._fmIndex = index / this.renderParameters.overSampling
    console.log(this._fmIndex)
  }

  get pitchStart() {
    return Math.log2(this._pitchStart / 440) * 1200
  }

  set pitchStart(cent) {
    this._pitchStart = this.centToFrequency(cent)
    this.pitchDiff = this._pitchStart - this._pitchEnd
  }

  get pitchEnd() {
    return this.frequencyToCent(this._pitchEnd)
  }

  set pitchEnd(cent) {
    this._pitchEnd = this.centToFrequency(cent)
    this.pitchDiff = this._pitchStart - this._pitchEnd
    this.pitchEndFixed = this._pitchEnd - 1
  }

  // Pitch is represented by cents with center frequency at 440Hz.
  frequencyToCent(frequency) {
    return Math.log2(frequency / 440) * 1200
  }

  centToFrequency(cent) {
    return 440 * Math.pow(2, cent / 1200)
  }

  refresh(phase) {
    this.twoPiRate = TWO_PI / this.renderParameters.sampleRate
    this.phase = phase
    this.bufferOutput = 0
  }

  // time is number of audio samples.
  oscillate(time, modulation) {
    if (time > this._length || time < 0) {
      return 0
    }
    var envTime = time / this._length
    var gain = this.gain * this.gainEnvelope.decay(envTime)
    var output = gain * Math.sin(this.phase)
    var mod = this._fmIndex * modulation * output

    var pitchEnv = this.pitchEnvelope.decay(envTime)
    var pitch = this.pow(this.pitchDiff, pitchEnv)
    this.phase += this.twoPiRate * (pitch + this.pitchEndFixed) + mod
    this.bufferOutput = output

    return output
  }

  // 虚数になる場合でも値を返す。
  pow(base, exponent) {
    if (base === 0) {
      return (exponent === 1) ? 1 : 0
    }
    return Math.sign(base) * Math.pow(Math.abs(base), exponent)
  }
}

class OscillatorControl {
  constructor(parent, renderParameters, id, refreshFunc) {
    this.div = new Div(divMain.element, "OscillatorControl")
    this.div.element.className = "synthControls"

    this.oscillator = new Oscillator(renderParameters)

    this.headingOscillatorControls = new Heading(this.div.element, 6,
      "Oscillator" + id)
    this.gainTension = new EnvelopeView(this.div.element,
      256, 128, 0.2, 0.2, 0.8, 0.8, refresh)
    this.pitchTension = new EnvelopeView(this.div.element,
      256, 128, 0.2, 0.2, 0.8, 0.8, refresh)
    this.gain = new NumberInput(this.div.element, "Gain",
      0.5, 0, 1, 0.01, refresh)
    this.pitchStart = new NumberInput(this.div.element, "PitchStart",
      0, -6000, 6000, 1, refresh)
    this.pitchEnd = new NumberInput(this.div.element, "PitchEnd",
      0, -6000, 6000, 1, refresh)
    this.phase = new NumberInput(this.div.element, "Phase",
      0, 0, 1, 0.01, refresh)
  }

  show() {
    this.div.element.style.display = ""
  }

  hide() {
    this.div.element.style.display = "none"
  }

  refresh() {
    this.gainTension.draw()
    var { x1, y1, x2, y2 } = this.gainTension.value
    this.oscillator.gainEnvelope.set(x1, y1, x2, y2)

    this.pitchTension.draw()
    var { x1, y1, x2, y2 } = this.pitchTension.value
    this.oscillator.pitchEnvelope.set(x1, y1, x2, y2)

    this.oscillator.gain = this.gain.value
    this.oscillator.pitchStart = this.pitchStart.value
    this.oscillator.pitchEnd = this.pitchEnd.value
    // this.oscillator.gainEnvelope.tension = this.gainTension.value
    this.oscillator.refresh(this.phase.value * TWO_PI)
  }

  random() {
    this.gainTension.random()
    this.pitchTension.random()
    // this.gain.random()
    this.pitchStart.random()
    this.pitchEnd.random()
  }
}

class OscillatorGroup {
  constructor(parent, renderParameters, refreshFunc) {
    this.renderParameters = renderParameters
    this.refreshFunc = refreshFunc

    this.div = new Div(parent, "OscillatorGroup")
    this.controls = []
    for (var i = 0; i < 3; ++i) {
      this.push()
    }
    this.toggle(0)
  }

  push() {
    var index = this.controls.length
    this.buttonSelectOscillator = new Button(this.div.element,
      "Osc" + index, () => this.toggle(index))
    this.controls.push(
      new OscillatorControl(this.div.element, this.renderParameters,
        index, this.refreshFunc))
  }

  pop() {
    var child = this.controls.pop().div.element
    this.div.element.removeChild(child)
  }

  toggle(index) {
    for (let control of this.controls) {
      control.hide()
    }
    this.controls[index].show()
  }

  set length(length) {
    for (let control of this.controls) {
      control.oscillator.length = length
    }
  }

  set fmIndex(index) {
    for (let control of this.controls) {
      control.oscillator.fmIndex = index
    }
  }

  refresh() {
    for (var i = 0; i < this.controls.length; ++i) {
      this.controls[i].refresh()
    }
  }

  random() {
    for (var i = 0; i < this.controls.length; ++i) {
      this.controls[i].random()
    }
  }

  oscillate(time) {
    var out = 0
    for (var i = this.controls.length - 1; i >= 0; --i) {
      out = this.controls[i].oscillator.oscillate(time, out)
    }
    return out
  }
}

function random() {
  oscillator.random()
  refresh()
  play(audioContext, wave)
}

function refresh() {
  oscillator.length = inputLength.value
  oscillator.fmIndex = Math.pow(2, inputFmIndex.value)
  oscillator.refresh()

  var raw = makeWave(inputLength.value, renderParameters.sampleRate)
  if (checkboxResample.value) {
    wave.left = Resampler.pass(raw, renderParameters.sampleRate, audioContext.sampleRate)
  }
  else {
    wave.left = Resampler.reduce(raw, renderParameters.sampleRate, audioContext.sampleRate)
  }
  wave.declick(inputDeclickIn.value, inputDeclickOut.value)
  if (checkboxNormalize.value) {
    wave.normalize()
  }

  waveView.set(wave.left)
}


// Entry point.

var audioContext = new AudioContext()
var renderParameters = new RenderParameters(audioContext, 16)

var wave = new Wave(1)

var divMain = new Div(document.body, "main")
var headingTitle = new Heading(divMain.element, 1, document.title)

var description = new Description(divMain.element)
description.add("A", "B")

var divWaveform = new Div(divMain.element, "waveform")
var headingWaveform = new Heading(divWaveform.element, 6, "Waveform")
var waveView = new WaveView(divWaveform.element, 512, 256, wave.left, false)

var divRenderControls = new Div(divMain.element, "renderControls")
var buttonPlay = new Button(divRenderControls.element, "Play",
  () => play(audioContext, wave))
var buttonSave = new Button(divRenderControls.element, "Save",
  () => save(wave))
var buttonRandom = new Button(divRenderControls.element, "Random",
  () => random())
var checkboxQuickSave = new Checkbox(divRenderControls.element, "QuickSave",
  false, (checked) => { })

var divMiscControls = new Div(divMain.element, "MiscControls")
var headingRender = new Heading(divMiscControls.element, 6, "Render Settings")
var inputLength = new NumberInput(divMiscControls.element, "Length",
  0.2, 0.02, 1, 0.02, (value) => { refresh() })
var inputFmIndex = new NumberInput(divMiscControls.element, "FM Index",
  4, 0, 8, 0.05, (value) => { refresh() })
var tenMilliSecond = audioContext.sampleRate / 100
var inputDeclickIn = new NumberInput(divMiscControls.element, "DeclickIn",
  0, 0, tenMilliSecond, 1, refresh)
var inputDeclickOut = new NumberInput(divMiscControls.element, "DeclickOut",
  0, 0, tenMilliSecond, 1, refresh)
var checkboxNormalize = new Checkbox(divMiscControls.element, "Normalize",
  true, refresh)
var checkboxResample = new Checkbox(divMiscControls.element, "Resample",
  true, (checked) => {
    renderParameters.overSampling = checked ? 16 : 1
    refresh()
    play(audioContext, wave)
  }
)

var oscillator = new OscillatorGroup(divMain.element, renderParameters, () => { })


refresh()

// If startup is succeeded, remove "unsupported" paragaraph.
document.getElementById("unsupported").outerHTML = ""
