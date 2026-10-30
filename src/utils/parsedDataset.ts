import {HttpErrors} from '@loopback/rest';
import fs from 'fs/promises';
import {isSafeId} from './access';

export type ParsedDataset = {
  dataset: Record<string, any>[];
  dataTypes: Record<string, any>;
};

type CacheEntry = {
  mtimeMs: number;
  sizeBytes: number;
  data: Promise<ParsedDataset>;
};

/**
 * Parsed files are kept in memory up to this many MB of JSON on disk, per API
 * process. The largest datasets are 100-260 MB on disk (several times that once
 * parsed) and pm2 runs one process per CPU, so those are read on each request
 * instead of being cached.
 */
const CACHE_BUDGET_BYTES =
  Number(process.env.PARSED_DATASET_CACHE_MB ?? 50) * 1024 * 1024;

// Insertion order doubles as LRU order: hits are re-inserted at the end.
const cache = new Map<string, CacheEntry>();
// Files over the budget are not cached, but concurrent requests for the same
// file (e.g. several charts on one report) still share a single parse.
const inFlight = new Map<string, CacheEntry>();

const cachedBytes = () =>
  [...cache.values()].reduce((total, entry) => total + entry.sizeBytes, 0);

const getFilePath = (datasetId: string) => {
  const directory = process.env.PARSED_DATA_FILES_PATH
    ? process.env.PARSED_DATA_FILES_PATH
    : '../data-explorer.backend/parsed-data-files/';
  return `${directory}${datasetId}.json`;
};

const parseFile = async (filePath: string): Promise<ParsedDataset> =>
  JSON.parse(await fs.readFile(filePath, 'utf8'));

/**
 * Reads a parsed dataset file. Callers must treat the result as read-only:
 * it can be shared with other requests.
 */
export const readParsedDataset = async (
  datasetId: string,
): Promise<ParsedDataset> => {
  if (!isSafeId(datasetId)) {
    throw new HttpErrors.BadRequest('Invalid datasetId');
  }
  const filePath = getFilePath(datasetId);

  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new HttpErrors.NotFound(`Dataset ${datasetId} not found`);
    }
    throw error;
  }

  for (const entries of [cache, inFlight]) {
    const entry = entries.get(datasetId);
    if (entry?.mtimeMs === stat.mtimeMs) {
      if (entries === cache) {
        cache.delete(datasetId);
        cache.set(datasetId, entry);
      }
      return entry.data;
    }
  }

  const entry: CacheEntry = {
    mtimeMs: stat.mtimeMs,
    sizeBytes: stat.size,
    data: parseFile(filePath),
  };
  inFlight.set(datasetId, entry);

  try {
    await entry.data;
  } finally {
    if (inFlight.get(datasetId) === entry) inFlight.delete(datasetId);
  }

  if (entry.sizeBytes <= CACHE_BUDGET_BYTES) {
    cache.delete(datasetId);
    cache.set(datasetId, entry);
    while (cachedBytes() > CACHE_BUDGET_BYTES) {
      cache.delete(cache.keys().next().value as string);
    }
  }
  return entry.data;
};

/** For tests. */
export const clearParsedDatasetCache = () => {
  cache.clear();
  inFlight.clear();
};
