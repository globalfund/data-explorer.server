import fs from 'fs';
import path from 'path';

// Dedicated log file for "search returned no data" events, one JSON line
// each, rotated daily (logs/search-no-data-YYYY-MM-DD.log) to match the
// naming used by the other log files in `logs/`.
const LOG_DIR = path.join(__dirname, '..', '..', 'logs');

function logFilePath(date: Date): string {
  const day = date.toISOString().slice(0, 10);
  return path.join(LOG_DIR, `search-no-data-${day}.log`);
}

export function logSearchNoData(entry: Record<string, unknown>): void {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, {recursive: true});
    }
    fs.appendFile(
      logFilePath(new Date()),
      `${JSON.stringify(entry)}\n`,
      err => {
        if (err) {
          console.error('search-no-data logging failed', err);
        }
      },
    );
  } catch (err) {
    console.error('search-no-data logging failed', err);
  }
}
