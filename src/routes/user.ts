import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

router.get('/auth/me', async (req: Request, res: Response) => {
    if (!req.auth || typeof req.auth.id !== "string") {
        return res.status(401).json({ error: "Invalid or missing authentication" });
    }

    const auth_id = req.auth.id;

    const result = await pool.query(`
    INSERT INTO users (auth_id, nickname)
    VALUES ($1, (SELECT nickname FROM auth WHERE id = $1))
    ON CONFLICT (auth_id)
    DO UPDATE SET nickname = EXCLUDED.nickname
    RETURNING id, nickname, role;
    `, [auth_id]);

    return res.status(200).json(result.rows[0]);

});

router.get('/users/:id', async (req: Request, res: Response) => {
    const user_id = req.params.id as string; // fixed param name
    const uuidRegex = /^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;
    if (!uuidRegex.test(user_id)) return res.status(400).json({ error: 'Invalid user id (must be UUID)' });

    const user = await pool.query('SELECT * FROM users WHERE id = $1', [user_id]); // fixed column name
    if (user.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
    }
    return res.status(200).json(user.rows[0]);
});

export async function getUserByAuth(auth_id: string) {
    const uuidRegex = /^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;
    if (!uuidRegex.test(auth_id)) throw new Error('Invalid auth id (must be UUID)');

    const user = await pool.query(
        `SELECT * FROM users WHERE auth_id = $1`,
        [auth_id]
    );

    if (user.rows.length === 0) {
        const newUser = await pool.query(`
            INSERT INTO users (auth_id, nickname)
            SELECT a.id, a.nickname
            FROM auth a
            WHERE a.id = $1
            RETURNING *
        `, [auth_id]);
        return newUser.rows[0];
    }
    return user.rows[0];
}

export default router;