import bcrypt from 'bcryptjs'
import { createInterface } from 'readline'

const rl = createInterface({
  input: process.stdin,
  output: process.stderr,
})

rl.question('Enter password: ', async (password) => {
  if (!password) {
    console.error('Password cannot be empty')
    process.exit(1)
  }

  const hash = await bcrypt.hash(password, 10)
  console.log(hash)
  rl.close()
})
