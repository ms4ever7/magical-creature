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

// Schedule to run at 12:01 AM UTC every day (2:01 AM Poland time)
cron.schedule('1 0 * * *', () => {
  console.log('Cron job triggered at 12:01 AM UTC (2:01 AM Poland time)');
  runTradingBot();
}, {
  timezone: "UTC"
});

// Keep the process alive
process.stdin.resume();