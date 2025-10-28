import { Router, Request, Response } from 'express';
import pool from '../db';
import { getUserByAuth } from './user';

const router = Router();

router.get('/models', async (req: Request, res: Response) => {
    try {
        const result = await pool.query(`SELECT * FROM models`);
        return res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error creating printer:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
})

router.get('/models/:id', async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const uuidRegex = /^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;
        if (!uuidRegex.test(id)) return res.status(400).json({ error: 'Invalid id (must be UUID)' });

        const result = await pool.query(`SELECT * FROM models WHERE id = $1`, [id]);
        return res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating printer:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
})

router.get('/user/:user_id/models', async (req: Request, res: Response) => {    
    const user_id = req.params.user_id as string;
    const uuidRegex = /^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;
    if (!uuidRegex.test(user_id)) return res.status(400).json({ error: 'Invalid user id (must be UUID)' });
    
    try {
        const result = await pool.query('SELECT * FROM models WHERE author_id = $1', [user_id]);
        return res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error creating printer:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
})

// Upload model
router.post('/models', async (req: Request, res: Response) => {

    // TODO: upload model file in S3 bucket and store url

    if (!req.auth) return res.status(401).json({ error: 'Missing Authorization header' });
    const auth_id = req.auth.id;
    console.log(auth_id);

    let author_id: string | null;
    try {
        const user = await getUserByAuth(auth_id);
        author_id = user?.id || null;
        if (!author_id) {
            return res.status(404).json({ error: 'User not found' });
        }
    } catch (err) {
        console.error('Error getting user by auth:', err);
        return res.status(500).json({ error: 'Failed to resolve author' });
    }

    const body = (req.body || {}) as {
        name?: string | null;
        file_url?: string;
        size_mb?: number | null;
    }

    const { file_url } = body;
    if (!file_url) return res.status(400).json({error: "Missing url"});

    const name = body.name ?? null;
    const size_mb = body.size_mb ?? null;

    try {
        const newModel = await pool.query(`
            INSERT INTO models 
            (name, file_url, author_id, size_mb) VALUES ($1, $2, $3, $4)
            RETURNING *`,
        [name, file_url, author_id, size_mb]);

        return res.status(201).json(newModel.rows[0]);
    } catch (error) {
        console.error('Error creating printer:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
})

export default router;