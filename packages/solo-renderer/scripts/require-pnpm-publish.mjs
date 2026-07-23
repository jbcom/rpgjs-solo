const userAgent = process.env.npm_config_user_agent ?? ''

if (!userAgent.startsWith('pnpm/')) {
  throw new Error(
    'Publish @jbcom/rpgjs-solo-renderer with pnpm publish so workspace dependencies are rewritten for registry consumers.'
  )
}
