import { Pool } from 'pg';
import { dbConfig } from '../config/database';

const pool = new Pool(dbConfig);

// Test the connection
pool.connect()
  .then(() => console.log('Connected to PostgreSQL'))
  .catch(err => console.error('Error connecting to PostgreSQL:', err));

export default pool;