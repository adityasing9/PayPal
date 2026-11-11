import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

async function getFreePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

export async function startFlaskAuthorizationService() {
  const port = await getFreePort();
  const directory = mkdtempSync(join(tmpdir(), 'intentlock-flask-v2-'));
  const serviceToken = 'integration-test-service-token';
  const script = [
    'import os',
    'from werkzeug.serving import make_server',
    'from intentlock.engine import IntentLockEngine',
    'from intentlock.workstream5_api_db.app import create_app',
    'engine = IntentLockEngine(db_path=os.environ["INTENTLOCK_DB_PATH"])',
    'server = make_server("127.0.0.1", int(os.environ["PORT"]), create_app(engine), threaded=True)',
    'print("READY " + engine.public_key_hex, flush=True)',
    'server.serve_forever()'
  ].join('\n');
  const child = spawn('python', ['-u', '-c', script], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      INTENTLOCK_DB_PATH: join(directory, 'engine.db'),
      INTENTLOCK_SERVICE_TOKEN: serviceToken,
      PORT: String(port)
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let output = '';
  let errorOutput = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (data) => {
    errorOutput += data;
  });
  let publicKey;
  try {
    publicKey = await new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error(`Flask authorization service did not start: ${errorOutput}`));
        }
      }, 15000);
      child.once('error', (error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(error);
        }
      });
      child.once('exit', (code) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error(`Flask authorization service exited (${code}): ${errorOutput}`));
        }
      });
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (data) => {
        output += data;
        const readyLine = output.split(/\r?\n/).find((line) => line.startsWith('READY '));
        if (readyLine && !settled) {
          settled = true;
          clearTimeout(timeout);
          resolve(readyLine.slice('READY '.length));
        }
      });
    });
  } catch (error) {
    if (child.exitCode === null && child.signalCode === null) {
      await new Promise((resolve) => {
        child.once('exit', resolve);
        child.kill();
      });
    }
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    publicKey,
    serviceToken,
    async stop() {
      if (child.exitCode === null && child.signalCode === null) {
        await new Promise((resolve) => {
          child.once('exit', resolve);
          child.kill();
        });
      }
      rmSync(directory, { recursive: true, force: true });
    }
  };
}
