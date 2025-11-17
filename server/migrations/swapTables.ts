import { swapTables } from './migrateVitalsData';

(async () => {
  try {
    await swapTables();
    process.exit(0);
  } catch (error) {
    console.error('Table swap failed:', error);
    process.exit(1);
  }
})();
