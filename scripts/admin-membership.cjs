/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
// Offline administrator preparation only. Never sends requests or embeds Management API credentials.
const fs = require('node:fs')
const addMonths = (date, months) => {
  const result = new Date(date)
  const day = result.getUTCDate()
  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() + months)
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)
  ).getUTCDate()
  result.setUTCDate(Math.min(day, lastDay))
  return result.getTime()
}
const prepareMembership = (metadata, request, now = Date.now()) => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
    throw Error('app_metadata must be an object')
  if (!Number.isSafeInteger(now) || now <= 0) throw Error('Invalid administrator timestamp')
  if (!['activate', 'renew', 'change', 'revoke'].includes(request.action))
    throw Error('Unknown administrator action')
  if (typeof request.operator !== 'string' || !request.operator.trim())
    throw Error('Administrator identity is required')
  const result = JSON.parse(JSON.stringify(metadata))
  const previous = result.dra_membership
  const until = typeof previous?.valid_until === 'string' ? Date.parse(previous.valid_until) : NaN
  const active =
    previous?.status === 'active' &&
    ['plus', 'pro'].includes(previous.plan) &&
    Number.isSafeInteger(until) &&
    until > now
  if (request.action === 'activate' && active)
    throw Error('Existing membership is active; use renew or change')
  if (request.action !== 'revoke') {
    if (!['plus', 'pro'].includes(request.plan)) throw Error('Plus or Pro plan is required')
    if (!Number.isInteger(request.months) || request.months < 1 || request.months > 12)
      throw Error('Months must be between 1 and 12')
    if (request.action === 'renew' && previous?.plan !== request.plan)
      throw Error('Use change to switch plans')
    if (request.action === 'change' && !active)
      throw Error('Use activate for an inactive membership')
    const start = request.action === 'renew' && active ? until : now
    result.dra_membership = {
      plan: request.plan,
      status: 'active',
      valid_until: new Date(addMonths(start, request.months)).toISOString()
    }
  } else {
    result.dra_membership = { ...(previous || {}), status: 'canceled' }
  }
  const history = result.dra_membership_history
  if (history !== undefined && !Array.isArray(history))
    throw Error('Existing membership history is malformed; review before changing')
  result.dra_membership_history = [
    ...(history || []),
    {
      at: new Date(now).toISOString(),
      operator: request.operator.trim(),
      action: request.action,
      previous: previous || null,
      next: result.dra_membership
    }
  ]
  return result
}
module.exports = { prepareMembership, addMonths }
if (require.main === module) {
  try {
    const args = Object.fromEntries(
      process.argv
        .slice(2)
        .reduce(
          (pairs, value, index, all) =>
            index % 2 === 0 ? [...pairs, [value.replace(/^--/, ''), all[index + 1]]] : pairs,
          []
        )
    )
    if (!args.input || !args.output)
      throw Error(
        'Required: --input app-metadata.json --output reviewed-app-metadata.json --action activate|renew|change|revoke --operator administrator; paid grants also require --plan plus|pro --months 1..12'
      )
    const metadata = JSON.parse(fs.readFileSync(args.input, 'utf8'))
    const result = prepareMembership(metadata, {
      action: args.action,
      plan: args.plan,
      months: Number(args.months),
      operator: args.operator
    })
    // Refuse overwrite: review a concrete proposal before manually applying it in Auth0.
    fs.writeFileSync(args.output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
    console.log(
      'Administrator proposal prepared. No account was modified and no payment was taken.'
    )
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
