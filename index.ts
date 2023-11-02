import express from 'express'
import http from 'http'
import cors from 'cors'
import { Server } from 'socket.io'

const app = express()
const port = process.env.PORT || 3000

app.use(cors())

const server = http.createServer(app)

const origin = ['https://tencandles-vtt.vercel.app']

if (process.env.NODE_ENV === 'development') {
  origin.push('http://localhost:5173')
}

const io = new Server(server, {
  cors: {
    origin,
    methods: ['GET', 'POST'],
  },
})

const users: { name: string; room: string; isGm: boolean; socketId: string }[] = []

app.get('/', (req, res) => {
  res.send('hello world')
})

io.on('connection', (socket) => {
  console.log('connected', socket.id)

  socket.on('userJoined', ({ room, username, isGm }) => {
    socket.join(room)

    // existingUser should only be truthy during local dev
    const existingUser = users.find((user) => user.name === username)
    if (existingUser) {
      existingUser.socketId === socket.id
    } else {
      users.push({ name: username, room, isGm, socketId: socket.id })
    }

    console.log(`${isGm ? 'GM' : 'player'}: ${username} joined room: ${room}`)

    const usersInRoom = users.filter((p) => p.room === room)

    io.to(room).emit('usersUpdated', {
      updatedUsers: usersInRoom,
      toastText: `${username} has joined the game as ${isGm ? 'the GM' : 'a player'}.`,
    })
  })

  socket.on('passInitialDicePoolsAndCandles', ({ room, dicePools, candles }) => {
    io.sockets.in(room).emit('passedInitialDicePoolsAndCandles', { dicePools, candles })
  })

  socket.on('candleChange', ({ room, username, index, isLit }) => {
    io.sockets.in(room).emit('candleChanged', { username, index, isLit })
  })

  socket.on('roll', ({ dicePool, diceCount, room, username }) => {
    const dice: number[] = []

    for (let i = 0; i < diceCount; i++) {
      dice.push(Math.floor(Math.random() * 6 + 1))
    }
    console.log(`${username} rolled the ${dicePool} and got ${dice.join()}`)

    io.sockets.in(room).emit('rolled', { dicePool, dice, username })
  })

  socket.on('dragStart', ({ username, room, dieId, dicePool }) => {
    io.sockets.in(room).emit('dragStarted', { dicePool, username, dieId })
  })

  socket.on('dragEnd', ({ username, room, dieId, prevDicePool, newDicePool }) => {
    io.sockets.in(room).emit('dragEnded', { prevDicePool, newDicePool, username, dieId })
  })

  socket.on('disconnecting', (reason) => {
    let room
    socket.rooms.forEach((r) => {
      if (r !== socket.id) room = r
    })

    let removedUser

    const index = users.findIndex((u) => u.socketId === socket.id)
    if (index > -1) {
      ;[removedUser] = users.splice(index, 1)
      console.log(`Player: ${removedUser.name} with socketId: ${socket.id} left room: ${room}`)
    } else {
      console.log(
        `Tried to remove user with socketId: ${socket.id} from room: ${room}, but it didn't exist in the users array`
      )
    }
    const usersInRoom = users.filter((u) => u.room === room)

    io.to(room).emit('usersUpdated', {
      updatedUsers: usersInRoom,
      toastText: removedUser ? `${removedUser.name} has left the game.` : null,
    })
  })
})

app.get('/user', (req, res) => {
  const { username, room } = req.query
  res.send({ doesUserExist: !!users.find((u) => u.room === room && u.name === username) })
})

app.get('/room', (req, res) => {
  const { room } = req.query
  res.send({ doesRoomExist: !!users.find((u) => u.room === room) })
})

server.listen(port, () => {
  console.log(`Server running on port ${port}!`)
})
