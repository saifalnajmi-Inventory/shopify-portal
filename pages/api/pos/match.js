/**
 * POST /api/pos/match
 * Manually triggers the background match engine.
 * Normally auto-called by /api/pos/sync — this is for manual re-runs.
 *
 * Auth: manage_settings permission (super_admin / client_admin)
 */

import { withAuth }  from '../../../lib/auth'
import { runPosMatch } from '../../../lib/posMatch'

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const result = await runPosMatch()
    return res.status(200).json({ ok: true, ...result })
  } catch (err) {
    console.error('[POS MATCH]', err)
    return res.status(500).json({ error: err.message })
  }
}

export default withAuth(handler, 'manage_settings')
