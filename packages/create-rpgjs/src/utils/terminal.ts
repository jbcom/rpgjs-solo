const RESET = '\u001b[0m'
const BOLD = '\u001b[1m'
const DIM = '\u001b[2m'
const CYAN = '\u001b[36m'
const GREEN = '\u001b[32m'
const RED = '\u001b[31m'
const YELLOW = '\u001b[33m'

const supportsColor = process.stdout.isTTY && process.env.NO_COLOR !== '1'

function color(code, text) {
  if (!supportsColor) return text
  return `${code}${text}${RESET}`
}

export const ui = {
  title(text) {
    console.log(`\n${color(BOLD + CYAN, text)}\n`)
  },
  info(text) {
    console.log(color(CYAN, text))
  },
  success(text) {
    console.log(color(GREEN, `✔ ${text}`))
  },
  warn(text) {
    console.log(color(YELLOW, `⚠ ${text}`))
  },
  error(text) {
    console.error(color(RED, `✖ ${text}`))
  },
  muted(text) {
    console.log(color(DIM, text))
  }
}

export function spinner(label) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  let index = 0
  let timer = null

  return {
    start() {
      if (!process.stdout.isTTY) {
        console.log(`${label}...`)
        return
      }
      process.stdout.write(`${frames[0]} ${label}`)
      timer = setInterval(() => {
        index = (index + 1) % frames.length
        process.stdout.write(`\r${frames[index]} ${label}`)
      }, 80)
    },
    stop(text = label) {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
      if (process.stdout.isTTY) {
        process.stdout.write(`\r${color(GREEN, `✔ ${text}`)}\n`)
      } else {
        console.log(text)
      }
    },
    fail(text = label) {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
      if (process.stdout.isTTY) {
        process.stdout.write(`\r${color(RED, `✖ ${text}`)}\n`)
      } else {
        console.log(text)
      }
    }
  }
}
