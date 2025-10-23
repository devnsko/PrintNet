import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// List printers
router.get('/printers', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM printers ORDER BY id');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching printers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get one
router.get('/printers/:id', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const uuidRegex = /^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;
  if (!uuidRegex.test(id)) return res.status(400).json({ error: 'Invalid id (must be UUID)' });

  try {
    const result = await pool.query('SELECT * FROM printers WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching printer:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Create
router.post('/printers', async (req: Request, res: Response) => {
  const body = (req.body || {}) as {
    name?: string;
    model?: string | null;
    status?: string;
    is_active?: boolean;
    current_job_id?: string | null;
    queue_id?: string | null;
  };

  const { name } = body;
  if (!name) return res.status(400).json({ error: 'Missing name' });

  const model = body.model ?? null;
  const status = body.status ?? 'IDLE';
  const is_active = body.is_active ?? true;
  const current_job_id = body.current_job_id ?? null;
  const queue_id = body.queue_id ?? null;

  const allowedStatuses = ['IDLE', 'PRINTING', 'ERROR', 'OFFLINE'];
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Allowed: ${allowedStatuses.join(', ')}` });
  }

  try {
    const newPrinter = await pool.query(
      `INSERT INTO printers
        (name, model, status, is_active, current_job_id, queue_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, model, status, is_active, current_job_id, queue_id]
    );

    const newQueue = await pool.query(
      `INSERT INTO queues (printer_id) VALUES ($1) RETURNING *`,
      [newPrinter.rows[0].id]
    );

    const result = await pool.query(
      `UPDATE printers SET queue_id = $1 WHERE id = $2 RETURNING *`,
      [newQueue.rows[0].id, newPrinter.rows[0].id]
    )

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating printer:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update
router.put('/printers/:id', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const uuidRegex = /^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;
  if (!uuidRegex.test(id)) return res.status(400).json({ error: 'Invalid id (must be UUID)' });

  const body = (req.body || {}) as {
    id?: unknown;
    name?: string;
    model?: string | null;
    status?: string;
    is_active?: boolean | string;
    current_job_id?: string | null;
    queue_id?: string | null;
  };

  // Prevent updating id if provided in body
  const { id: _ignore, ...raw } = body;

  // Allowed updateable fields
  const allowedFields = ['name', 'model', 'status', 'is_active', 'current_job_id', 'queue_id'] as const;
  const updates: Record<string, any> = {};
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(raw, field)) {
      updates[field] = (raw as any)[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  // Validate status
  const allowedStatuses = ['IDLE', 'PRINTING', 'ERROR', 'OFFLINE'];
  if (updates.status !== undefined && !allowedStatuses.includes(updates.status)) {
    return res.status(400).json({ error: `Invalid status. Allowed: ${allowedStatuses.join(', ')}` });
  }

  // Validate name/model lengths if provided
  if (updates.name !== undefined) {
    if (typeof updates.name !== 'string' || updates.name.length === 0 || updates.name.length > 100) {
      return res.status(400).json({ error: 'Invalid name (must be 1-100 chars)' });
    }
  }
  if (updates.model !== undefined && updates.model !== null) {
    if (typeof updates.model !== 'string' || updates.model.length > 100) {
      return res.status(400).json({ error: 'Invalid model (max 100 chars or null)' });
    }
  }

  // Validate / coerce is_active
  if (updates.is_active !== undefined) {
    if (typeof updates.is_active === 'string') {
      const lower = updates.is_active.toLowerCase();
      if (lower === 'true') updates.is_active = true;
      else if (lower === 'false') updates.is_active = false;
      else return res.status(400).json({ error: 'Invalid is_active (must be boolean)' });
    } else if (typeof updates.is_active !== 'boolean') {
      return res.status(400).json({ error: 'Invalid is_active (must be boolean)' });
    }
  }

  // Validate UUID fields (allow null)
  for (const f of ['current_job_id', 'queue_id'] as const) {
    if (updates[f] !== undefined && updates[f] !== null) {
      if (typeof updates[f] !== 'string' || !uuidRegex.test(updates[f])) {
        return res.status(400).json({ error: `Invalid ${f} (must be UUID or null)` });
      }
    }
  }

  try {
    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const [key, value] of Object.entries(updates)) {
      setClauses.push(`${key} = $${idx}`);
      values.push(value);
      idx++;
    }

    // update last_updated timestamp
    setClauses.push(`last_updated = NOW()`);

    values.push(id); // last param is id

    const sql = `UPDATE printers SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`;
    const result = await pool.query(sql, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error updating printer:', error);
    // optional: map foreign key or constraint errors to 400
    if (error.code === '23503') { // foreign key violation
      return res.status(400).json({ error: 'Foreign key constraint violation' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete
router.delete('/printers/:id', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const uuidRegex = /^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;
  if (!uuidRegex.test(id)) return res.status(400).json({ error: 'Invalid id (must be UUID)' });

  try {
    const result = await pool.query(
      'DELETE FROM printers WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error deleting printer:', error);
    if (error.code === '23503') { // foreign key violation
      return res.status(400).json({ error: 'Foreign key constraint violation' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
