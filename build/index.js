const GAME_SIZE = 500
const BLOCK_SIZE = 10
const INITIAL_SNAKE_LENGTH = 4
const COLORS = [
  'red',
  'blue',
  'green',
  'black',
  'pink',
  'purple',
  'orange',
]
function colorForId(id) {
  const index = id - 1
  return COLORS[index % COLORS.length]
}

const host = '127.0.0.1:3012'
document.addEventListener('DOMContentLoaded', function() {
  const url = 'ws://' + host
  const ws = new WebSocket(url);

  ws.addEventListener('open', function() {
    function receiveAndRun({ data }) {
      if (data.startsWith('id:')) {
        const id = Number(data.substring(3))

        ws.removeEventListener('message', receiveAndRun)
        run(id, ws)
      }
    }
    ws.addEventListener('message', receiveAndRun)
  })
})

function run(id, ws) {
  const canvas = document.getElementById('root')
  canvas.height = GAME_SIZE
  canvas.width = GAME_SIZE
  const context = canvas.getContext('2d')

  const game = new Game(id, context, ws)
  game.addSnake(id)
  game.addArrowKeyHandlers()
  game.drawInitialSnake()
  game.createNewFood()

  let lastDrawTime = 0
  let timePerFrame = 100
  let playing = true
  function tick(tickStartTime) {
    if (!playing) return

    let valid = true
    if (tickStartTime - lastDrawTime > timePerFrame) {
      lastDrawTime = tickStartTime

      valid = game.moveSnake()
      if (game.snakeIsEating()) {
        timePerFrame -= 1
        game.feedSnake()
      }
    }

    if (!valid) {
      alert('You lose!')
      return
    }

    game.draw()
    window.requestAnimationFrame(tick)
  }
  window.requestAnimationFrame(tick)

  ws.addEventListener('message', function({ data }) {
    const message = Message.createMessage(data)
    if (!game.hasSnake(message.receivedId)) {
      game.addSnake(message.receivedId)
      game.sendSnake()
      game.sendFood()
    }

    if (message.isAddFoodMessage()) {
      game.drawForeignFood(message.receivedId, message.point)
    } else if (message.isDrawSnakeMessage()) {
      game.drawForeignSnake(message.receivedId, message.points)
    }
  })

  ws.addEventListener('close', function() {
    playing = false
    alert('Served closed socket')
  })
}

class Snake {
  constructor(id, segmentSize) {
    this.snake = []

    this.id = id
    this.segmentSize = segmentSize
    this.segmentsLeftToGrow = 0

    this.directionChangeQueue = []
    this.goRight()
  }

  initializeFrom(points) {
    this.snake = []
    points.forEach(point => this.add(point))
  }

  draw(context) {
    const color = colorForId(this.id)
    context.fillStyle = color
    this.snake.forEach(({ x, y }) => {
      context.fillRect(x, y, this.segmentSize, this.segmentSize)
    })
  }

  add(point) {
    this.snake.unshift(point)
  }

  removePoint() {
    return this.snake.pop()
  }

  calculateNewHead() {
    const currentHead = this.snake[0]
    if (this.goingUp) {
      return new Point(currentHead.x, currentHead.y - this.segmentSize)
    } else if (this.goingDown) {
      return new Point(currentHead.x, currentHead.y + this.segmentSize)
    } else if (this.goingLeft) {
      return new Point(currentHead.x - this.segmentSize, currentHead.y)
    } else {
      return new Point(currentHead.x + this.segmentSize, currentHead.y)
    }
  }

  growing() {
    return !!this.segmentsLeftToGrow
  }

  move() {
    const directionChange = this.directionChangeQueue.shift()
    if (directionChange) directionChange()

    let removedPoint
    if (this.growing()) {
      this.segmentsLeftToGrow--
    } else {
      removedPoint = this.removePoint()
    }

    this.add(this.calculateNewHead())
    return removedPoint
  }

  clearDirection() {
    this.goingRight = false
    this.goingLeft = false
    this.goingUp = false
    this.goingDown = false
  }

  goUp() {
    if (this.goingDown) return
    this.clearDirection()
    this.goingUp = true
  }

  goDown() {
    if (this.goingUp) return
    this.clearDirection()
    this.goingDown = true
  }

  goLeft() {
    if (this.goingRight) return
    this.clearDirection()
    this.goingLeft = true
  }

  goRight() {
    if (this.goingLeft) return
    this.clearDirection()
    this.goingRight = true
  }

  queueUp() {
    this.directionChangeQueue.push(this.goUp.bind(this))
  }

  queueDown() {
    this.directionChangeQueue.push(this.goDown.bind(this))
  }

  queueLeft() {
    this.directionChangeQueue.push(this.goLeft.bind(this))
  }

  queueRight() {
    this.directionChangeQueue.push(this.goRight.bind(this))
  }

  head() {
    return this.snake[0]
  }

  growBy(n) {
    this.segmentsLeftToGrow += n
  }

  at(point) {
    return this.head().key === point.key
  }

  points() {
    return this.snake
  }
}

const pointMask = (1 << 16) - 1
class Point {
  constructor(xOrKey, y) {
    if (y === undefined) {
      this.x = (xOrKey >> 16) & pointMask
      this.y = xOrKey & pointMask
      this.key = xOrKey
    } else {
      this.x = xOrKey
      this.y = y
      this.key = (this.x << 16) | this.y
    }
  }
}

class Game {
  constructor(id, context, ws) {
    this.id = id
    this.ws = ws
    this.context = context
    this.gameSpace = this.context.canvas.getBoundingClientRect()
    this.snakes = {}
    this.dangerPoints = {}
    this.foods = {}
  }

  addSnake(id) {
    this.snakes[id] = new Snake(id, BLOCK_SIZE, this.context)
  }

  hasSnake(id) {
    return !!this.snakes[id]
  }

  drawForeignFood(id, point) {
    if (this.foods[id]) delete this.dangerPoints[this.foods[id].key]
    this.foods[id] = point
    this.dangerPoints[point.key] = true
  }

  drawForeignSnake(id, points) {
    this.snakes[id].points().forEach(point => delete this.dangerPoints[point.key])
    this.snakes[id].initializeFrom(points)
    this.snakes[id].points().forEach(point => this.dangerPoints[point.key] = true)
  }

  drawInitialSnake() {
    const index = Number(this.id) - 1

    const initialPoints = []
    const y = index * 2 * BLOCK_SIZE
    for (let i = 0; i < INITIAL_SNAKE_LENGTH; ++i) {
      const x = i * BLOCK_SIZE
      initialPoints.push(new Point(x, y))
    }
    this.snakes[this.id].initializeFrom(initialPoints)
  }

  moveSnake() {
    const oldHead = this.snakes[this.id].head()
    const removedPoint = this.snakes[this.id].move()
    if (removedPoint) delete this.dangerPoints[removedPoint.key]

    if (this.snakeIsValid()) {
      this.dangerPoints[oldHead.key] = true
      this.sendSnake()
      return true
    }

    return false
  }

  draw() {
    this.context.clearRect(0, 0, this.context.canvas.width, this.context.canvas.height)
    Object.entries(this.foods).forEach(([id, food]) => this.drawFood(id, food))
    Object.values(this.snakes).forEach(snake => snake.draw(this.context))
  }

  sendSnake() {
    const points = this.snakes[this.id].points().map(point => point.key)
    const message = `snake,${this.id},${points.join(',')}`
    this.ws.send(message)
  }

  addArrowKeyHandlers() {
    const snake = this.snakes[this.id]
    window.addEventListener('keydown', function(e) {
      if (e.defaultPrevented) {
        return;
      }

      switch(e.code) {
        case "KeyS":
        case "ArrowDown":
          snake.queueDown()
          break
        case "KeyW":
        case "ArrowUp":
          snake.queueUp()
          break
        case "KeyA":
        case "ArrowLeft":
          snake.queueLeft()
          break
        case "KeyD":
        case "ArrowRight":
          snake.queueRight()
          break
      }

      e.preventDefault()
    }, true)
  }

  createNewFood() {
    let newFood = new Point(
      Math.floor(Math.random() * (this.gameSpace.width / BLOCK_SIZE)) * BLOCK_SIZE,
      Math.floor(Math.random() * (this.gameSpace.height / BLOCK_SIZE)) * BLOCK_SIZE,
    )
    while (this.dangerPoints[newFood.key] || this.snakes[this.id].at(newFood)) {
      newFood = new Point(
        Math.floor(Math.random() * (this.gameSpace.width / BLOCK_SIZE)) * BLOCK_SIZE,
        Math.floor(Math.random() * (this.gameSpace.height / BLOCK_SIZE)) * BLOCK_SIZE,
      )
    }
    this.foods[this.id] = newFood
    this.sendFood()
  }

  drawFood(id, point) {
    this.context.fillStyle = colorForId(id)
    this.context.fillRect(point.x, point.y, BLOCK_SIZE, BLOCK_SIZE)
  }

  sendFood() {
    const stateMessage = `food,${this.id},${this.foods[this.id].key}`
    this.ws.send(stateMessage)
  }

  feedSnake() {
    this.snakes[this.id].growBy(2)
    this.createNewFood()
  }

  snakeIsEating() {
    return this.snakes[this.id].at(this.foods[this.id])
  }

  snakeIsValid() {
    const { key, x, y } = this.snakes[this.id].head()
    const { width, height } = this.gameSpace
    const snakeHeadOutOfBounds = (x < 0 || y < 0) || (x >= width || y >= height)
    const snakeHitDangerPoint = !!this.dangerPoints[key]

    return !snakeHeadOutOfBounds && !snakeHitDangerPoint
  }
}

class Message {
  static createMessage(data) {
    if (data.startsWith('food,')) {
      return new AddFoodMessage(data)
    }
    if (data.startsWith('snake,')) {
      return new DrawSnakeMessage(data)
    }
    throw new Error(`Unknown data: ${data}`)
  }

  constructor(data) {
    this.splitData = data.split(',')
    this.action = this.splitData[0]
    this.receivedId = Number(this.splitData[1])
  }

  isAddFoodMessage() {
    return false
  }

  isDrawSnakeMessage() {
    return false
  }
}

class AddFoodMessage extends Message {
  constructor(data) {
    super(data)
    this.point = new Point(this.splitData[2])
  }

  isAddFoodMessage() {
    return true
  }
}

class DrawSnakeMessage extends Message {
  constructor(data) {
    super(data)
    this.points = this.splitData.slice(2).map(pointKey => new Point(Number(pointKey)))
  }

  isDrawSnakeMessage() {
    return true
  }
}
