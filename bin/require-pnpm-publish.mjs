const userAgent = process.env.npm_config_user_agent ?? ''
const packageName = process.env.npm_package_name ?? 'RPGJS Solo packages'

if (!userAgent.startsWith('pnpm/')) {
  throw new Error(
    `Publish ${packageName} with pnpm publish so workspace dependencies are rewritten for registry consumers.`
  )
}
