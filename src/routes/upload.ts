import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// Sign upload to R2 bucket
router.post('/upload/sign', async (req: Request, res: Response) => {
    const filename = req.body.filename as string;
    const contentType = req.body.contentType as string;

    if (!filename || !contentType) {
        return res.status(400).json({ error: 'Missing filename or contentType in request body' });
    }

    try {
        const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
        const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
        const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
        const R2_BUCKET = process.env.R2_BUCKET;

        if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ACCOUNT_ID || !R2_BUCKET) {
            console.log('R2 credentials are not set in environment variables', {
                R2_ACCESS_KEY_ID,
                R2_SECRET_ACCESS_KEY,
                R2_ACCOUNT_ID,
                R2_BUCKET,
            });
            return res.status(500).json({ error: 'R2 credentials not configured' });
        }

        // generate a storage key for the object
        const key = `${Date.now()}_${filename.replace(/\s+/g, '_')}`;

        const client = new S3Client({
            region: 'auto',
            endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId: R2_ACCESS_KEY_ID,
                secretAccessKey: R2_SECRET_ACCESS_KEY,
            },
        });

        // create a presigned PUT URL
        const command = new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
            ContentType: contentType,
        });

        const signedUrl = await getSignedUrl(client, command, { expiresIn: 60 * 10 }); // 10 minutes

        const fileUrl = `https://${R2_BUCKET}.${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`;

        const insertResult = await pool.query(
            'INSERT INTO models(key, name, content_type, file_url, created_at) VALUES($1, $2, $3, $4, NOW()) RETURNING id',
            [key, filename, contentType, fileUrl]
        );
        const modelId = insertResult.rows[0]?.id;
        console.log('Created model entity with id:', modelId);

        res.json({ url: signedUrl, key, modelId });
    } catch (error) {
        console.error('Error signing upload:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;