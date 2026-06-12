// Vercel serverless entry — wraps the same handler as the standalone server.
// vercel.json rewrites every path here; req.url keeps the original path.

import { handler } from '../server/index.js'
import { init } from '../server/db.js'

let ready

export default async function vercelHandler(req, res) {
  ready ||= init()
  await ready
  return handler(req, res)
}
