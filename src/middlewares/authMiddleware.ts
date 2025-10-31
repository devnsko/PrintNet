import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

export function requireAuth(req: Request & { auth?: any }, res: Response, next: NextFunction) {
    console.log('Incoming Cookies:', req.cookies);
    const token = req.cookies?.printnettoken;

    console.log('Cookie Token:', token);

    if (!token) {
        return res.status(401).json({ error: 'Missing authentication cookie' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
        req.auth = decoded;
        next();
    } catch (err) {
        console.error('JWT verification failed:', err);
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}


export function mockAuth(req: Request & { auth?: any }, res: Response, next: NextFunction) {
    const decoded = { id: 'd519c7ed-7ee7-429f-948a-2f5942e5ccab', nickname: 'batman' };
    req.auth = decoded;
    next();
}
