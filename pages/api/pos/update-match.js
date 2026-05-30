/**
 * POST /api/pos/update-match
 * Updates the status of a PosMatch row (confirm / reject / reset to pending).
 * Auth: super_admin only.
 */

import db          from '../../../lib/db'
import { withAuth } from '../../../lib/auth'

const ALLOWED_STATUSES = ['confirmed', 'rejected', 'pending']

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const user            = req.user   // set by withAuth
  const { matchId, status } = req.body

  if (!matchId)                        return res.status(400).json({ error: 'matchId required' })
  if (!ALLOWED_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' })

  try {
    const updated = await db.posMatch.update({
      where: { id: matchId },
      data: {
        status,
        confirmedBy: status === 'confirmed' ? user.username : null,
        confirmedAt: status === 'confirmed' ? new Date()    : null,
      },
    })
    return res.status(200).json({ ok: true, match: updated })
  } catch (err) {
    console.error('[POS UPDATE MATCH]', err)
    return res.status(500).json({ error: err.message })
  }
}

export default withAuth(handler, 'manage_settings')
