const GAME_SIZE = 900
const BLOCK_SIZE = 1
const SNAKE_COLOR = 'green'
const FOOD_COLOR = 'red'

document.addEventListener('DOMContentLoaded', function() {
  const canvas = document.getElementById('root')
  const gameScreen = new GameScreen(canvas, GAME_SIZE, FOOD_COLOR)

  const snake = new Snake(60, 0, 0, BLOCK_SIZE, SNAKE_COLOR, gameScreen.context)
  document.addEventListener('keydown', function(e) {
    if (e.code === 'ArrowUp' || e.code === 'KeyW') {
      snake.transitionUp()
    } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      snake.transitionDown()
    } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
      snake.transitionLeft()
    } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
      snake.transitionRight()
    }
  })


  let lastDrawTime = 0
  let timePerFrame = 1
  function tick(tickStartTime) {
    if (tickStartTime - lastDrawTime > timePerFrame) {
      lastDrawTime = tickStartTime

      snake.move()
      if (snake.isAt(gameScreen.food)) {
        snake.growBy(2)
        timePerFrame -= 1
        gameScreen.createNewFood()
      }
    }

    if (gameScreen.validateSnake(snake)) {
      window.requestAnimationFrame(tick)
    } else {
      alert('You lose!')
      window.location.reload()
    }
  }
  window.requestAnimationFrame(tick)
})

class Snake {
  constructor(length, x, y, segmentSize, color, context) {
    this.vx = 1
    this.vy = 0
    this.segmentSize = segmentSize
    this.color = color
    this.context = context
    this.segmentsLeftToGrow = 0

    this.initializeFrom(length, x, y)
  }

  initializeFrom(length, x, y) {
    this.snake = []
    this.nonHeadPointKeys = {}

    // Build from tail to head so head is at 0
    for (let i = length; i > 0; --i) {
      const point = new Point(
        x + (i * this.vx * this.segmentSize),
        y + (i * this.vy * this.segmentSize),
      )
      this.snake.push(point)

      this.addPoint(point)
      this.nonHeadPointKeys[point.key] = true
    }

    this.headIdx = 0
    delete this.nonHeadPointKeys[this.head().key]
  }

  move() {
    if (this.transitioningUp) {
      this.goUp()
    } else if (this.transitioningDown) {
      this.goDown()
    } else if (this.transitioningLeft) {
      this.goLeft()
    } else if (this.transitioningRight) {
      this.goRight()
    }
    const currentHead = this.snake[this.headIdx]
    this.nonHeadPointKeys[currentHead.key] = true

    const newHead = new Point(
      currentHead.x + (this.vx * this.segmentSize),
      currentHead.y + (this.vy * this.segmentSize),
    )

    if (this.segmentsLeftToGrow > 0) {
      const newSnake = [newHead]
      for (let i = this.headIdx; i < this.snake.length; ++i) {
        newSnake.push(this.snake[i])
      }
      for (let i = 0; i < this.headIdx; ++i) {
        newSnake.push(this.snake[i])
      }
      this.snake = newSnake
      this.segmentsLeftToGrow--
      this.headIdx = 0
    } else {
      const tailIdx = (this.headIdx + this.snake.length - 1) % this.snake.length
      this.removePoint(this.snake[tailIdx])

      delete this.nonHeadPointKeys[this.snake[tailIdx].key]
      this.snake[tailIdx] = newHead
      this.headIdx = tailIdx
    }

    this.addPoint(newHead)
  }

  transitionUp() {
    this.transitioningUp = true
  }
  transitionDown() {
    this.transitioningDown = true
  }
  transitionLeft() {
    this.transitioningLeft = true
  }
  transitionRight() {
    this.transitioningRight = true
  }

  goUp() {
    this.transitioningUp = false
    if (this.vy === 1) return

    this.vx = 0
    this.vy = -1
  }

  goDown() {
    this.transitioningDown = false
    if (this.vy === -1) return

    this.vx = 0
    this.vy = 1
  }

  goLeft() {
    this.transitioningLeft = false
    if (this.vx === 1) return

    this.vx = -1
    this.vy = 0
  }

  goRight() {
    this.transitioningRight = false
    if (this.vx === -1) return

    this.vx = 1
    this.vy = 0
  }

  head() {
    return this.snake[this.headIdx]
  }

  growBy(n) {
    this.segmentsLeftToGrow += n
  }

  isAt(point) {
    return this.head().key === point.key
  }

  addPoint(point) {
    this.context.fillStyle = this.color
    this.context.fillRect(point.x, point.y, this.segmentSize, this.segmentSize)
  }

  removePoint(point) {
    this.context.clearRect(point.x, point.y, this.segmentSize, this.segmentSize)
  }

  valid() {
    return !this.nonHeadPointKeys[this.head().key]
  }
}

const maxPow = 15
class Point {
  constructor(x, y) {
    this.x = x
    this.y = y
    this.key = x << maxPow | y
  }
}

class GameScreen {
  constructor(canvas, size, foodColor) {
    this.canvas = canvas
    this.canvas.height = size
    this.canvas.width = size
    this.gameSpace = canvas.getBoundingClientRect()
    this.context = canvas.getContext('2d')

    this.foodColor = foodColor
    this.createNewFood()
  }

  createNewFood() {
    this.food = new Point(
      Math.floor(Math.random() * (this.canvas.width / BLOCK_SIZE)) * BLOCK_SIZE,
      Math.floor(Math.random() * (this.canvas.height / BLOCK_SIZE)) * BLOCK_SIZE,
    )
    this.drawFood()
  }

  drawFood() {
    this.context.fillStyle = this.foodColor
    this.context.fillRect(this.food.x, this.food.y, BLOCK_SIZE, BLOCK_SIZE)
  }

  validateSnake(snake) {
    const { x, y } = snake.head()
    const { width, height } = this.gameSpace
    const snakeHeadOutOfBounds = (x < 0 || y < 0) || (x >= width || y >= height)

    return !snakeHeadOutOfBounds && snake.valid()
  }
}
