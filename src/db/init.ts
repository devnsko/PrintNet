import pool from './index';

async function initializeDatabase() {
  // Create extension and tables in a safe order inside a transaction.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Enable uuid generation functions (no-op if already enabled)
    await client.query("CREATE EXTENSION IF NOT EXISTS \"pgcrypto\";");

    // Auth 
    await client.query(`
        CREATE TABLE IF NOT EXISTS auth (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          nickname TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `);

    // Users first
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        auth_provider VARCHAR(50),
        auth_id VARCHAR(255) UNIQUE,
        nickname VARCHAR(100) NOT NULL,
        role VARCHAR(20) CHECK (role IN ('ADMIN', 'MEMBER')) DEFAULT 'MEMBER',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Models (references users)
    await client.query(`
      CREATE TABLE IF NOT EXISTS models (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(100),
          file_url TEXT NOT NULL,
          author_id UUID REFERENCES users(id),
          size_mb FLOAT,
          created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS filaments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        material TEXT,
        color TEXT,
        nozzle_temp INTEGER,
        bed_temp INTEGER,
        speed_multiplier INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Printers (may reference jobs later)
    await client.query(`
      CREATE TABLE IF NOT EXISTS printers (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(100),
          model VARCHAR(100),
          status VARCHAR(20) CHECK (status IN ('IDLE','PRINTING','ERROR','OFFLINE')) DEFAULT 'IDLE',
          is_active BOOLEAN DEFAULT TRUE,
          current_job_id UUID,
          queue_id UUID,
          last_updated TIMESTAMP DEFAULT NOW()
      );
    `);

    // Jobs (references models, printers, users)
    await client.query(`
      CREATE TABLE IF NOT EXISTS jobs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          model_id UUID REFERENCES models(id),
          printer_id UUID REFERENCES printers(id),
          user_id UUID REFERENCES users(id),
          filament_id UUID REFERENCES filaments(id),
          status VARCHAR(20) CHECK (status IN ('QUEUED','PRINTING','DONE','FAILED','CANCELLED')) DEFAULT 'QUEUED',
          start_time TIMESTAMP,
          estimated_time INTEGER,
          created_at TIMESTAMP DEFAULT NOW(),
          progress FLOAT DEFAULT 0
      );
    `);

    // Queues and queue_jobs
    await client.query(`
      CREATE TABLE IF NOT EXISTS queues (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          printer_id UUID UNIQUE REFERENCES printers(id),
          created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS queue_jobs (
          queue_id UUID REFERENCES queues(id),
          job_id UUID REFERENCES jobs(id),
          position INTEGER NOT NULL,
          PRIMARY KEY (queue_id, job_id)
      );
    `);

    // add the foreign key from printers.current_job_id -> jobs(id)
    await client.query(`
      ALTER TABLE printers
      DROP CONSTRAINT IF EXISTS printers_current_job_id_fkey,
      ADD CONSTRAINT printers_current_job_id_fkey FOREIGN KEY (current_job_id) REFERENCES jobs(id)
    ;
    `);

    await client.query('COMMIT');
    console.log('Database initialized successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error initializing database:', error);
    throw error;
  } finally {
    client.release();
  }
}

export default initializeDatabase;