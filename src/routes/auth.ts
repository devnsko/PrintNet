import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'; // use env var in production

// Register user as auth
router.post('/register', async (req: Request, res: Response) => {
    const { email, password, nickname } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const client = await pool.connect();
    try {
        const existing = await client.query('SELECT id FROM auth WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const result = await client.query(
            `INSERT INTO auth (email, password_hash, nickname)
             VALUES ($1, $2, $3)
             RETURNING id, email, nickname, created_at`,
            [email, passwordHash, nickname || null]
        );

        const auth = result.rows[0];
        const token = jwt.sign({ id: auth.id }, JWT_SECRET, { expiresIn: '7d' });

        res.status(201).json({ auth: auth, token });
    } catch (err) {
        console.error('Error registering user:', err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
});

router.post('/login', async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    const client = await pool.connect();
    try {
        const result = await client.query(
            `SELECT id, email, password_hash, nickname FROM auth WHERE email = $1`,
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const auth = result.rows[0];
        const valid = await bcrypt.compare(password, auth.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: auth.id, email: auth.email, nickname: auth.nickname }, JWT_SECRET, { expiresIn: '7d' });

        res
        .cookie('printnettoken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'none', // lax
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        })
        .json({ auth: { id: auth.id, email: auth.email, nickname: auth.nickname } });
    } catch (err) {
        console.error('Error logging in:', err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
});

export default router;