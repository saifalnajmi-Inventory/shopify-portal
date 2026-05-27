/**
 * GET    /api/users        — list all users
 * POST   /api/users        — create a new user
 * PUT    /api/users        — update user (role, name, password, active)
 * DELETE /api/users?id=..  — delete or deactivate user
 *
 * Requires: manage_users (client_admin+ and super_admin)
 */

import db from '../../lib/db'
import { withAuth, hashPassword, ROLE_LABELS } from '../../lib/auth'
import logger from '../../lib/logger'

/** Strip passwordHash from user before returning */
function safeUser(u) {
  const { passwordHash, ...rest } = u
  return { ...rest, roleLabel: ROLE_LABELS[u.role] || u.role }
}

async function handler(req, res) {
  const ctx = logger.fromReq(req)

  // ── LIST ──────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const users = await db.user.findMany({
      orderBy: [{ role: 'asc' }, { username: 'asc' }],
    })
    return res.status(200).json({ users: users.map(safeUser) })
  }

  // ── CREATE ────────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { username, name, password, role } = req.body || {}

    if (!username?.trim() || !password) {
      return res.status(400).json({ error: 'Username and password are required' })
    }

    const allowedRoles = ['viewer', 'manager', 'client_admin', 'super_admin']
    const targetRole   = allowedRoles.includes(role) ? role : 'viewer'

    // Only super_admin can create another super_admin
    if (targetRole === 'super_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super_admin can create another super_admin' })
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' })
    }

    try {
      const hash = await hashPassword(password)
      const user = await db.user.create({
        data: {
          username:     username.trim().toLowerCase(),
          name:         name?.trim() || null,
          passwordHash: hash,
          role:         targetRole,
          active:       true,
        },
      })

      // Audit log
      await db.auditLog.create({
        data: {
          userId:   req.user.id,
          username: req.user.username,
          action:   'create_user',
          detail:   `Created user: ${user.username} (${targetRole})`,
        },
      })

      logger.info('api/users', 'user_created', `User created: ${user.username}`, {
        ...ctx,
        targetUsername: user.username,
        targetRole:     targetRole,
      })
      return res.status(201).json({ ok: true, user: safeUser(user) })
    } catch (err) {
      if (err.code === 'P2002') {
        logger.warn('api/users', 'user_create_conflict', 'Username already exists', {
          ...ctx,
          attemptedUsername: username.trim().toLowerCase(),
        })
        return res.status(409).json({ error: 'Username already exists' })
      }
      logger.error('api/users', 'user_create_error', 'Unexpected error creating user', { ...ctx, error: err })
      throw err
    }
  }

  // ── UPDATE ────────────────────────────────────────────────────────────────────
  if (req.method === 'PUT') {
    const { id, name, role, password, active } = req.body || {}

    if (!id) return res.status(400).json({ error: 'User id required' })

    const target = await db.user.findUnique({ where: { id } })
    if (!target) return res.status(404).json({ error: 'User not found' })

    // Prevent demoting the last super_admin
    if (target.role === 'super_admin' && role && role !== 'super_admin') {
      const adminCount = await db.user.count({ where: { role: 'super_admin', active: true } })
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot demote the last super_admin' })
      }
    }

    // Only super_admin can change roles to/from super_admin
    if ((role === 'super_admin' || target.role === 'super_admin') && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super_admin can modify super_admin accounts' })
    }

    const updateData = {}
    if (name     !== undefined) updateData.name   = name?.trim() || null
    if (role     !== undefined) updateData.role   = role
    if (active   !== undefined) updateData.active = Boolean(active)
    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' })
      }
      updateData.passwordHash = await hashPassword(password)
    }

    const updated = await db.user.update({ where: { id }, data: updateData })

    await db.auditLog.create({
      data: {
        userId:   req.user.id,
        username: req.user.username,
        action:   'update_user',
        detail:   `Updated user: ${target.username} — fields: ${Object.keys(updateData).filter(k => k !== 'passwordHash').join(', ')}`,
      },
    })

    const changedFields = Object.keys(updateData).filter(k => k !== 'passwordHash')
    logger.info('api/users', 'user_updated', `User updated: ${target.username}`, {
      ...ctx,
      targetUsername: target.username,
      targetId:       target.id,
      changedFields,
      passwordChanged: !!password,
    })
    return res.status(200).json({ ok: true, user: safeUser(updated) })
  }

  // ── DELETE ────────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'User id required' })

    const target = await db.user.findUnique({ where: { id } })
    if (!target) return res.status(404).json({ error: 'User not found' })

    // Prevent deleting self
    if (target.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account' })
    }

    // Prevent deleting the last super_admin
    if (target.role === 'super_admin') {
      const adminCount = await db.user.count({ where: { role: 'super_admin', active: true } })
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot delete the last super_admin' })
      }
    }

    // Only super_admin can delete super_admin accounts
    if (target.role === 'super_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super_admin can delete super_admin accounts' })
    }

    await db.user.delete({ where: { id } })
    await db.auditLog.create({
      data: {
        userId:   req.user.id,
        username: req.user.username,
        action:   'delete_user',
        detail:   `Deleted user: ${target.username} (${target.role})`,
      },
    })

    logger.info('api/users', 'user_deleted', `User deleted: ${target.username}`, {
      ...ctx,
      targetUsername: target.username,
      targetId:       target.id,
      targetRole:     target.role,
    })
    return res.status(200).json({ ok: true })
  }

  res.status(405).end()
}

export default withAuth(handler, 'manage_users')
