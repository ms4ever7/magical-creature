import cron from 'node-cron';
import { exec, spawn } from 'child_process';

async function runTradingBot() {
  try {
    console.log('Running trading bot at:', new Date().toISOString());
    
    // Execute your main trading strategy
    exec('npx tsx coreStrategy.ts', (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing coreStrategy.ts: ${error}`);
        return;
      }
      if (stderr) {
        console.error(`stderr: ${stderr}`);
      }
      console.log(`stdout: ${stdout}`);
    });
    
    console.log('Trading bot completed successfully');
  } catch (error) {
    console.error('Error running trading bot:', error);
  }
}

async function runDataFetch() {
  try {
    console.log('Running data fetch at:', new Date().toISOString());
    
    const child = spawn('npx', ['tsx', 'fetchAndSaveData.ts'], {
      stdio: 'inherit' // This will show logs in real-time
    });
    
    child.on('close', (code) => {
      console.log(`Data fetch finished with code: ${code}`);
      if (code === 0) {
        console.log('✅ Data fetch completed successfully');
      } else {
        console.error(`❌ Data fetch failed with exit code: ${code}`);
      }
    });
    
    child.on('error', (error) => {
      console.error(`Error executing fetchAndSaveData.ts: ${error}`);
    });
    
  } catch (error) {
    console.error('Error running data fetch:', error);
  }
}

function isLastDayOfMonth(date) {
  const tomorrow = new Date(date);
  tomorrow.setDate(date.getDate() + 1);
  return tomorrow.getDate() === 1;
}

// Monthly data fetch - Run on the last day of each month at 11:59 PM UTC
cron.schedule('59 23 28-31 * *', () => {
  const today = new Date();
  if (isLastDayOfMonth(today)) {
    console.log('📊 MONTHLY DATA FETCH - Last day of month triggered at:', new Date().toISOString());
    runDataFetch();
  }
}, {
  timezone: "UTC"
});


// Schedule to run at 12:01 AM UTC every day (2:01 AM Poland time)
cron.schedule('1 0 * * *', () => {
  console.log('Cron job triggered at 12:01 AM UTC (2:01 AM Poland time)');
  runTradingBot();
}, {
  timezone: "UTC"
});

cron.schedule('* * * * *', () => {
  console.log(`Test cron job triggered at ${new Date().toISOString()}`);
  runTradingBot();  // Replace with your actual bot logic
}, {
  timezone: "UTC"
});

// Keep the process alive
process.stdin.resume();