/**
 * Jest Global Teardown
 * Runs after all tests - stops the test database
 */
const { spawn } = require('child_process');
const path = require('path');

module.exports = async () => {
  console.log('\n[jest:teardown] Stopping test database...');

  const scriptPath = path.join(__dirname, 'scripts', 'stop-test-db.sh');

  return new Promise((resolve) => {
    const process = spawn('bash', [scriptPath], {
      stdio: 'inherit',
      cwd: __dirname,
    });

    process.on('close', (code) => {
      if (code === 0) {
        console.log('[jest:teardown] Test database stopped successfully');
      } else {
        console.warn(`[jest:teardown] Stop script exited with code: ${code}`);
      }
      resolve();
    });

    process.on('error', (err) => {
      console.warn('[jest:teardown] Error stopping test database:', err);
      resolve(); // Don't reject - allow tests to complete even if teardown fails
    });
  });
};
