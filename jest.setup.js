/**
 * Jest Global Setup
 * Runs before all tests - starts the test database and initializes schema
 */
const { spawn } = require('child_process');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

module.exports = async () => {
  console.log('\n[jest:setup] Starting test database...');

  // Configure test database connection
  process.env.DATABASE_URL = 'postgresql://mutte:mutte@localhost:5433/mutte_test';
  process.env.NODE_ENV = 'test';
  process.env.ADMIN_API_KEY = 'test-admin-key';

  const scriptPath = path.join(__dirname, 'scripts', 'start-test-db.sh');
  
  return new Promise(async (resolve, reject) => {
    const proc = spawn('bash', [scriptPath], {
      stdio: 'inherit',
      cwd: __dirname,
    });

    proc.on('close', async (code) => {
      if (code === 0) {
        console.log('[jest:setup] Test database started successfully');
        
        // Initialize the database schema
        try {
          console.log('[jest:setup] Initializing database schema...');
          await initializeSchema();
          console.log('[jest:setup] Database schema initialized');
          resolve();
        } catch (err) {
          console.error('[jest:setup] Failed to initialize schema:', err);
          reject(err);
        }
      } else {
        console.error(`[jest:setup] Failed to start test database (exit code: ${code})`);
        reject(new Error(`Test database startup failed with exit code ${code}`));
      }
    });

    proc.on('error', (err) => {
      console.error('[jest:setup] Error starting test database:', err);
      reject(err);
    });
  });
};

async function initializeSchema() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    // Read and execute all migration files in order
    const migrationsDir = path.join(__dirname, 'db', 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');
      await pool.query(sql);
      console.log(`[jest:setup] Applied migration: ${file}`);
    }
  } finally {
    await pool.end();
  }
}
