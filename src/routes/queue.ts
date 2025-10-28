import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// List queues
router.get('/queues', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM queues ORDER BY id');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching queues:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/printers/:id/queue', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const uuidRegex = /^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;
  if (!uuidRegex.test(id)) return res.status(400).json({ error: 'Invalid id (must be UUID)' });
    
  try {
    const queue = await pool.query('SELECT * FROM queues as q WHERE q.printer_id = (SELECT p.id FROM printers AS p WHERE p.id = $1)' , [id]);
    if(queue.rows.length === 0) {
      const newQueue = await pool.query(`
        INSERT INTO queues (printer_id) VALUES ($1) RETURNING *`,
      [id]);
      return res.status(201).json(newQueue.rows[0]);
    } 
    res.status(200).json(queue.rows[0]);
  } catch (error) {
    console.error('Error deleting queue:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
})

router.get('/queues/:id', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const uuidRegex = /^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;
  if (!uuidRegex.test(id)) return res.status(400).json({ error: 'Invalid id (must be UUID)' });
  
  try {
    const result = await pool.query('SELECT * FROM queues WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching queue:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/queues', async (req: Request, res: Response) => {
  const body = (req.body || {}) as {
    printer_id?: string;
  };

    const { printer_id } = body;
    if (!printer_id) return res.status(400).json({ error: 'Missing printer_id' });

  try {
    const result = await pool.query(
      `INSERT INTO queues (printer_id) VALUES ($1) RETURNING *`,
      [printer_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating queue:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/queues/:id', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const uuidRegex = /^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;
  if (!uuidRegex.test(id)) return res.status(400).json({ error: 'Invalid id (must be UUID)' });

  try {
    const result = await pool.query('DELETE FROM queues WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json({ message: 'Queue deleted successfully' });
  } catch (error) {
    console.error('Error deleting queue:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;