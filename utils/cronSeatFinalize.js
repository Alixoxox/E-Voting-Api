import cron from 'node-cron';
import { runAutoSeatChooser, runDailyElectionCheck } from './Services.js';

cron.schedule('0 0 * * *', async () => {
  await runDailyElectionCheck();
});
cron.schedule('0 0 * * *', async () => {
  console.log(" Cron triggered: auto seat chooser");
  await runAutoSeatChooser();
});
