import jwt from 'jsonwebtoken';

export function requireAuth(req: any, res: any, next: any) {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ error: 'Missing Authorization header' });

    const token = auth.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
        req.auth = decoded;
        next();
    } catch {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}
