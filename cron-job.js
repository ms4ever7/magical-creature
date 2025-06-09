const cron = require('node-cron');
const { exec } = require('child_process');

async function runTradingBot() {
  try {
    console.log('Running trading bot at:', new Date().toISOString());
    
    // Execute your main trading strategy
    exec('node coreStrategy.js', (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing coreStrategy.js: ${error}`);
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
    
    // Execute data fetch script
    exec('node fetchAndSaveData.js', (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing fetchAndSaveData.js: ${error}`);
        return;
      }
      if (stderr) {
        console.error(`stderr: ${stderr}`);
      }
      console.log(`Data fetch stdout: ${stdout}`);
    });
    
    console.log('Data fetch completed successfully');
  } catch (error) {
    console.error('Error running data fetch:', error);
  }
}

// Monthly data fetch - Run on the last day of each month at 11:59 PM UTC
cron.schedule('59 23 L * *', () => {
  console.log('📊 MONTHLY DATA FETCH - Triggered at:', new Date().toISOString());
  runDataFetch();
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

// Keep the process alive
process.stdin.resume();