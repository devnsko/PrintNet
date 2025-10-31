import { Router, Request, Response } from 'express';
import pool from '../db';
import { getUserByAuth } from './user';

const router = Router();

// List jobs
router.get('/jobs', async (req: Request, res: Response) => {
    try {
        const result = await pool.query('SELECT * FROM jobs ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching jobs:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get jobs by queue
router.get('/jobs/queue/:queueId', async (req: Request, res: Response) => {
    const queueId = req.params.queueId as string;
    try {
        const result = await pool.query(`
            SELECT * FROM jobs WHERE queue_id = $1 ORDER BY created_at DESC
        `, [queueId]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching jobs by queue:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get one job
router.get('/jobs/:id', async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const uuidRegex = /^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;
    if (!uuidRegex.test(id)) return res.status(400).json({ error: 'Invalid id (must be UUID)' });

    try {
        const result = await pool.query('SELECT * FROM jobs WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching job:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


router.get('/printers/:id/queue/list', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const uuidRegex = /^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;
  if (!uuidRegex.test(id)) return res.status(400).json({ error: 'Invalid id (must be UUID)' });
    
  try {
    const list = await pool.query(`
      SELECT * FROM jobs as j 
      WHERE j.id IN (SELECT job_id FROM queue_jobs AS qj 
      WHERE qj.queue_id = (SELECT q.id FROM queues AS q WHERE printer_id = $1))
      `, [id]);
    return res.status(200).json(list.rows);
  } catch (error) {
    console.error('Error deleting queue:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
})

// Create job
// or /jobs endpoint
router.post('/printers/:id/queue/add', async (req: Request, res: Response) => {
    const printer_id = req.params.id as string;
    const uuidRegex = /^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;
    
    const body = (req.body || {}) as {
        name?: string | null;
        model_id?: string;
        filament_material?: string | null;
        filament_color?: string | null;
        scheduled_time?: string | null; // expect ISO datetime string from frontend
    };

    const auth_id = req.auth?.id as string;


    const user = await getUserByAuth(auth_id);
    const user_id = user?.id || null;

    const { model_id } = body;

    if (!model_id || !printer_id || !user_id) {
        return res.status(400).json({ error: 'Missing required fields: model_id, printer_id, user_id' });
    }
    if (![model_id, printer_id, user_id].every(id => uuidRegex.test(id))) {
        return res.status(400).json({ error: 'model_id, printer_id and user_id must be valid UUIDs' });
    }

    const filament_material = body.filament_material ?? null;
    const filament_color = body.filament_color ?? null;
    const scheduled_time = body.scheduled_time ?? null;
    if (scheduled_time !== null) {
        // Expect ISO 8601 datetime string from frontend, e.g. "2025-10-30T12:34:56Z"
        const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+\-]\d{2}:\d{2})$/;
        if (typeof scheduled_time !== 'string' || !isoRegex.test(scheduled_time)) {
            return res.status(400).json({ error: 'scheduled_time must be a valid ISO 8601 datetime string' });
        }
    }

    const jobName = body.name ?? null;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Insert the filament if not exist in table filaments
        let filamentId: string | null = null;
        if (filament_material) {
            const filament = filament_material;

            let insertFilament = await client.query(
                `INSERT INTO filaments (material, color)
                 SELECT $1, $2
                 WHERE NOT EXISTS (
                     SELECT 1 FROM filaments WHERE material = $1 AND (color IS NOT DISTINCT FROM $2)
                 )
                 RETURNING id`,
                [filament_material, filament_color]
            );

            // If nothing was inserted, fetch existing id (handle NULL color correctly)
            if (insertFilament.rows.length === 0) {
                const existing = await client.query(
                    `SELECT id FROM filaments WHERE material = $1 AND (color IS NOT DISTINCT FROM $2) LIMIT 1`,
                    [filament_material, filament_color]
                );
                insertFilament = existing;
            }
            filamentId = insertFilament.rows[0]?.id ?? null;
            if (!filamentId) {
                const existing = await client.query(
                    `SELECT id FROM filaments WHERE material = $1`,
                    [filament]
                );
                filamentId = existing.rows[0]?.id ?? null;
            }
            if (filamentId) {
                console.log('Inserted or found filament with id:', filamentId);
            }
        } else {
            filamentId = null;
        }
        const insertJob = await client.query(
          `INSERT INTO jobs (name, model_id, printer_id, user_id, filament_id, scheduled_time, status)
           VALUES ($1, $2, $3, $4, $5, $6::timestamp,
               CASE WHEN $6 IS NOT NULL THEN 'SCHEDULED' ELSE 'QUEUED' END)
           RETURNING *`,
          [jobName, model_id, printer_id, user_id, filamentId, scheduled_time]
        );
        const job = insertJob.rows[0];

        // Ensure a queue exists for the printer and lock it to avoid races
        let queueRes = await client.query(
            `SELECT id FROM queues WHERE printer_id = $1 FOR UPDATE`,
            [printer_id]
        );

        let queueId: string;
        if (queueRes.rows.length === 0) {
            const createdQueue = await client.query(
                `INSERT INTO queues (printer_id) VALUES ($1) RETURNING id`,
                [printer_id]
            );
            queueId = createdQueue.rows[0].id;
        } else {
            queueId = queueRes.rows[0].id;
        }

        // Compute next position and insert into queue_jobs
        const posRes = await client.query(
            `SELECT COALESCE(MAX(position), 0) + 1 AS position FROM queue_jobs WHERE queue_id = $1`,
            [queueId]
        );
        const position = posRes.rows[0].position;

        const insertQueueJob = await client.query(
            `INSERT INTO queue_jobs (queue_id, job_id, position)
             VALUES ($1, $2, $3) RETURNING *`,
            [queueId, job.id, position]
        );

        await client.query('COMMIT');

        // Return created job and queue_job info
        res.status(201).json({
            job,
            queue_job: insertQueueJob.rows[0],
        });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error creating job:', error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
});

// Finish a job
router.post('/jobs/:id/finish', async (req: Request, res: Response) => {
    const { id } = req.params;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Get the job and related queue
        const jobRes = await client.query(
            `SELECT qj.queue_id, qj.position
             FROM queue_jobs qj
             JOIN jobs j ON qj.job_id = j.id
             WHERE j.id = $1`,
            [id]
        );

        if (jobRes.rows.length === 0) {
            return res.status(404).json({ error: 'Job not found in queue' });
        }

        const { queue_id, position } = jobRes.rows[0];

        // Mark job as completed
        await client.query(
            `UPDATE jobs SET status = 'completed', finished_at = NOW() WHERE id = $1`,
            [id]
        );

        // Remove from queue
        await client.query(
            `DELETE FROM queue_jobs WHERE job_id = $1`,
            [id]
        );

        // Shift down remaining jobs
        await client.query(
            `UPDATE queue_jobs
             SET position = position - 1
             WHERE queue_id = $1 AND position > $2`,
            [queue_id, position]
        );

        await client.query('COMMIT');
        res.json({ success: true, message: 'Job finished and queue updated' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
});

// Edit job
router.put('/jobs/:id', async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const uuidRegex = /^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;
    if (!uuidRegex.test(id)) return res.status(400).json({ error: 'Invalid id (must be UUID)' });
    
    const body = (req.body || {}) as {
        status?: string;
        progress?: number;
        start_time?: string;
    };

    const { status, progress, start_time } = body;
    
    try {
        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;

        if (status) {
            fields.push(`status = $${idx}`);
            values.push(status);
            idx++;
        }
        if (progress !== undefined) {
            fields.push(`progress = $${idx}`);
            values.push(progress);
            idx++;
        }
        if (start_time) {
            fields.push(`start_time = $${idx}`);
            values.push(start_time);
            idx++;
        }

        if (fields.length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        const result = await pool.query(`
            UPDATE jobs SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *
        `, [...values, id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error processing job update:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete job
router.delete('/jobs/:id', async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const uuidRegex = /^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;
    if (!uuidRegex.test(id)) return res.status(400).json({ error: 'Invalid id (must be UUID)' });

    try {
        const result = await pool.query('DELETE FROM jobs WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error deleting job:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


export default router;
