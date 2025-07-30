import cron from 'node-cron';
import { exec, spawn } from 'child_process';

async function runTradingBot() {
  return new Promise((resolve, reject) => {
    try {
      console.log('Running trading bot at:', new Date().toISOString());
      
      // Use yarn tsx since you have yarn.lock
      const child = spawn('yarn', ['tsx', 'coreStrategy.ts'], {
        stdio: 'inherit',
        cwd: process.cwd()
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Trading bot completed successfully');
          resolve();
        } else {
          console.error(`❌ Trading bot failed with exit code: ${code}`);
          reject(new Error(`Trading bot failed with exit code: ${code}`));
        }
      });
      
      child.on('error', (error) => {
        console.error(`Error executing coreStrategy.ts: ${error}`);
        reject(error);
      });
      
    } catch (error) {
      console.error('Error running trading bot:', error);
      reject(error);
    }
  });
}

async function runDataFetch() {
  return new Promise((resolve, reject) => {
    try {
      console.log('Running data fetch at:', new Date().toISOString());
      
      const child = spawn('yarn', ['tsx', 'fetchAndSaveData.ts'], {
        stdio: 'inherit',
        cwd: process.cwd()
      });
      
      child.on('close', (code) => {
        console.log(`Data fetch finished with code: ${code}`);
        if (code === 0) {
          console.log('✅ Data fetch completed successfully');
          resolve();
        } else {
          console.error(`❌ Data fetch failed with exit code: ${code}`);
          reject(new Error(`Data fetch failed with exit code: ${code}`));
        }
      });
      
      child.on('error', (error) => {
        console.error(`Error executing fetchAndSaveData.ts: ${error}`);
        reject(error);
      });
      
    } catch (error) {
      console.error('Error running data fetch:', error);
      reject(error);
    }
  });
}

function isLastDayOfMonth(date) {
  const tomorrow = new Date(date);
  tomorrow.setDate(date.getDate() + 1);
  return tomorrow.getDate() === 1;
}

// Add graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, gracefully shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, gracefully shutting down...');
  process.exit(0);
});

// Monthly data fetch - Run on the last day of each month at 11:59 PM UTC
cron.schedule('59 23 28-31 * *', async () => {
  const today = new Date();
  if (isLastDayOfMonth(today)) {
    console.log('📊 MONTHLY DATA FETCH - Last day of month triggered at:', new Date().toISOString());
    try {
      await runDataFetch();
    } catch (error) {
      console.error('Monthly data fetch failed:', error);
    }
  }
}, {
  timezone: "UTC"
});

// Schedule to run at 12:01 AM UTC every day (2:01 AM Poland time)
cron.schedule('1 0 * * *', async () => {
  console.log('Cron job triggered at 12:01 AM UTC (2:01 AM Poland time)');
  try {
    await runTradingBot();
  } catch (error) {
    console.error('Daily trading bot failed:', error);
  }
}, {
  timezone: "UTC"
});

console.log('🚀 Cron scheduler started successfully');
console.log('📅 Daily trading bot: 12:01 AM UTC (2:01 AM Poland time)');
console.log('📊 Monthly data fetch: Last day of month at 11:59 PM UTC');

// Keep the process alive
process.stdin.resume();