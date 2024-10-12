import express from 'express'
import http from 'http'
import cors from 'cors'
import { Server } from 'socket.io'

const app = express()
const port = process.env.PORT || 3000

app.use(cors())

const server = http.createServer(app)

const origin = ['https://tencandles-3915dxj5a-philipp-dmitrovs-projects.vercel.app', 'https://tencandles-vtt-seven.vercel.app']

if (process.env.NODE_ENV === 'development') {
  origin.push('http://localhost:5173')
}

const io = new Server(server, {
  cors: {
    origin,
    methods: ['GET', 'POST'],
  },
})

type User = { id: string; name: string; room: string; isGm: boolean; socketId: string }

const users: User[] = []

app.get('/', (req, res) => {
  res.send('hello world')
})

io.on('connection', (socket) => {
  console.log('connected', socket.id)

  socket.on('userJoined', ({ room, user }) => {
    socket.join(room)

    // existingUser should only be truthy during local dev
    const existingUser = users.find((u) => u.id === user.id)
    if (existingUser) {
      existingUser.socketId === socket.id
    } else {
      users.push({ ...user, room, socketId: socket.id })
    }

    console.log(`${user.isGm ? 'GM' : 'player'}: ${user.name} joined room: ${room}`)

    const usersInRoom = users.filter((p) => p.room === room)

    io.to(room).emit('usersUpdated', {
      updatedUsers: usersInRoom,
      toastText: `${user.name} has joined the room as ${user.isGm ? 'the GM. To invite other players, send them this page’s URL' : 'a player'
        }.`,
      isToastInfinite: user.isGm,
    })
  })

  socket.on('passInitialState', ({ room, dicePools, candles, areCardsLocked }) => {
    io.sockets.in(room).emit('passedInitialState', { dicePools, candles, areCardsLocked })
  })

  socket.on('updateGm', ({ room, oldGm, newGm }: { room: string; oldGm: User; newGm: User }) => {
    let errorMsg

    const _oldGm = users.find((u) => u.id === oldGm.id)
    if (!_oldGm) {
      errorMsg = `User with name: ${oldGm.name} and id: ${oldGm.id} not found`
    }
    const _newGm = users.find((u) => u.id === newGm.id)
    if (!_newGm) {
      errorMsg = `User with name: ${newGm.name} and id: ${newGm.id} not found`
    }
    if (errorMsg) {
      console.error(errorMsg)
      return io
        .to(room)
        .emit('error', { message: `There was a problem reassigning the GM. Error message - ${errorMsg}` })
    }

    _oldGm!.isGm = false
    _newGm!.isGm = true

    console.log(`${_newGm!.name} is now the GM in room: ${room}`)

    const usersInRoom = users.filter((p) => p.room === room)

    io.to(room).emit('usersUpdated', {
      updatedUsers: usersInRoom,
      toastText: `${_newGm!.name} is now the GM.`,
    })
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

  socket.on('dieDragStart', ({ username, room, dieId, dicePool }) => {
    io.sockets.in(room).emit('dieDragStarted', { dicePool, username, dieId })
  })

  socket.on('dieDragEnd', ({ username, room, dieId, prevDicePool, newDicePool }) => {
    io.sockets.in(room).emit('dieDragEnded', { prevDicePool, newDicePool, username, dieId })
  })

  socket.on('transferCard', ({ newUsername, oldUsername, room, card }) => {
    io.sockets.in(room).emit('cardTransferred', { newUsername, oldUsername, card })
  })

  socket.on('changeLock', ({ isLocked, room }) => {
    io.sockets.in(room).emit('lockChanged', isLocked)
  })

  socket.on('updatePeerUserCards', ({ room, userId, cards, toastText }) => {
    io.sockets.in(room).emit('peerUserCardsUpdated', { userId, cards, toastText })
  })

  socket.on('revealBrink', ({ room, userId }) => {
    io.sockets.in(room).emit('brinkRevealed', { userId })
  })

  socket.on('disconnecting', (reason) => {
    let room
    socket.rooms.forEach((r) => {
      if (r !== socket.id) room = r
    })

    let removedUser
    let newGm

    const index = users.findIndex((u) => u.socketId === socket.id)
    if (index > -1) {
      ;[removedUser] = users.splice(index, 1)
      console.log(`User: ${removedUser.name} with socketId: ${socket.id} left room: ${room}`)

      if (removedUser.isGm) {
        newGm = users.find((u) => u.room === room)
        if (newGm) {
          newGm.isGm = true
          console.log(`User: ${newGm.name} is now the GM in room: ${room}`)
        }
      }
    } else {
      console.log(
        `Tried to remove user with socketId: ${socket.id} from room: ${room}, but it didn't exist in the users array`
      )
    }
    const usersInRoom = users.filter((u) => u.room === room)

    io.to(room).emit('usersUpdated', {
      updatedUsers: usersInRoom,
      toastText: removedUser
        ? `${removedUser.name} has left the room.${newGm ? ` ${newGm.name} is now the GM.` : ''}`
        : null,
    })
  })
})

app.get('/users', (req, res) => {
  const { room } = req.query
  res.send(users.filter((u) => u.room === room))
})

server.listen(port, () => {
  console.log(`Server running on port ${port}!`)
})
