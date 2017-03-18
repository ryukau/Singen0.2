class Envelope {
  constructor(x1, y1, x2, y2) {
    this.easing = bezier(x1, y1, x2, y2)
    this.x1 = x1
    this.y1 = y1
    this.x2 = x2
    this.y2 = y2
  }

  set(x1, y1, x2, y2) {
    this.easing = bezier(x1, y1, x2, y2)
  }

  attack(value) {
    return this.easing(value)
  }

  decay(value) {
    return 1 - this.easing(value)
  }

  // clamp(value) {
  //   return Math.max(0, Math.min(value, 1))
  // }

  // Return lookup table of envelope.
  // This will be used by interface.
  makeTable(length) {
    var table = new Array(length)
    var denom = length - 1
    for (var i = 0; i < table.length; ++i) {
      table[i] = this.decay(i / denom)
    }
    return table
  }
}

class EnvelopeView extends Canvas {
  constructor(parent, width, height, x1, y1, x2, y2, refreshFunc) {
    super(parent, width, height)
    this.refreshFunc = refreshFunc

    this.pointRadius = 8
    // this.points = [
    //   new Vec2(x1 * this.width, y1 * this.height),
    //   new Vec2(x2 * this.width, y2 * this.height)
    // ]
    this.setControlPoints(x1, y1, x2, y2)
    this.startPoint = new Vec2(0, 0)
    this.endPoint = new Vec2(this.width, this.height)

    this.grabbed = null
    this.element.addEventListener("load", (event) => this.onLoad(event), false)
    this.element.addEventListener("mousedown", (event) => this.onMouseDown(event), false)
    this.element.addEventListener("mousemove", (event) => this.onMouseMove(event), false)
    this.element.addEventListener("mouseup", (event) => this.onMouseUp(event), false)
  }

  clampX(value) {
    return Math.max(0, Math.min(value, 1))
  }

  get value() {
    return {
      x1: this.clampX(this.points[0].x / this.width),
      y1: this.points[0].y / this.height,
      x2: this.clampX(this.points[1].x / this.width),
      y2: this.points[1].y / this.height,
    }
  }

  setControlPoints(x1, y1, x2, y2) {
    this.points = [
      new Vec2(x1 * this.width, y1 * this.height),
      new Vec2(x2 * this.width, y2 * this.height)
    ]
  }

  getMousePosition() {
    var rect = event.target.getBoundingClientRect()
    return new Vec2(event.clientX - rect.left, event.clientY - rect.top)
  }

  getMouseMove() {
    console.log(event)
    return new Vec2(event.movementX, event.movementY)
  }

  onLoad(event) {
    this.grabbed = null
  }

  grabPoint(mousePosition) {
    for (var i = 0; i < this.points.length; ++i) {
      var point = this.points[i]
      if (Vec2.sub(point, mousePosition).length() <= this.pointRadius) {
        return point
      }
    }
    return null
  }

  onMouseDown(event) {
    var mousePosition = this.getMousePosition()
    this.grabbed = this.grabPoint(mousePosition)
    if (this.grabbed !== null) {
      this.element.requestPointerLock()
    }
  }

  onMouseMove(event) {
    if (this.grabbed === null) {
      return
    }
    this.grabbed.add(this.getMouseMove())
    this.grabbed.x = Math.max(0, Math.min(this.grabbed.x, this.width))
    this.grabbed.y = Math.max(0, Math.min(this.grabbed.y, this.height))
    this.draw()
  }

  onMouseUp(event) {
    this.grabbed = null
    this.refresh()
    document.exitPointerLock();
  }

  refresh() {
    this.refreshFunc()
  }

  random() {
    for (var i = 0; i < this.points.length; ++i) {
      this.points[i].x = this.width * Math.random()
      this.points[i].y = this.height * Math.random()
    }
    this.draw()
  }

  draw() {
    this.clearWhite()

    this.context.strokeStyle = "#333333"
    this.context.beginPath()
    this.context.moveTo(this.startPoint.x, this.startPoint.y)
    this.context.bezierCurveTo(
      this.points[0].x, this.points[0].y,
      this.points[1].x, this.points[1].y,
      this.endPoint.x, this.endPoint.y
    )
    this.context.stroke()

    this.context.strokeStyle = "#cccccc"
    this.drawLine(this.startPoint, this.points[0])
    this.drawLine(this.endPoint, this.points[1])

    this.context.fillStyle = "#aaaaff"
    this.context.strokeStyle = "#333333"
    for (var i = 0; i < this.points.length; ++i) {
      this.drawCircle(this.points[i], this.pointRadius)
    }
  }
}