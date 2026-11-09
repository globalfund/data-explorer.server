import IORedis, {RedisOptions} from 'ioredis';

// Empty env values mean "not set" rather than an empty username/password.
const optionalEnv = (value: string | undefined) => (value ? value : undefined);

const connectionOptions = (): RedisOptions => ({
  host: process.env.REDIS_HOST ?? '127.0.0.1',
  port: Number(process.env.REDIS_PORT ?? 6379),
  username: optionalEnv(process.env.REDIS_USERNAME),
  password: optionalEnv(process.env.REDIS_PASSWORD),
});

/**
 * Workers block on Redis and BullMQ requires them to retry forever.
 */
export const createWorkerConnection = () =>
  new IORedis({...connectionOptions(), maxRetriesPerRequest: null});

/**
 * Used inside API requests (queueing, rate limiting). Commands fail fast while
 * Redis is unreachable instead of waiting in ioredis' offline queue, which
 * would hang the request until the client times out.
 */
export const createRequestConnection = () => {
  const connection = new IORedis({
    ...connectionOptions(),
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  });
  // Without a listener ioredis reports every failed reconnect as unhandled.
  connection.on('error', error => {
    console.error(`Redis (API requests) error: ${error.message}`);
  });
  return connection;
};

let requestConnection: IORedis | undefined;

export const getRequestConnection = () =>
  (requestConnection ??= createRequestConnection());

/**
 * Resolves once the request connection is usable, or rejects after
 * `timeoutMs`. BullMQ otherwise waits for Redis indefinitely, and on the first
 * call after boot the lazily created connection is still connecting.
 */
export const getReadyRequestConnection = async (timeoutMs = 3000) => {
  const connection = getRequestConnection();
  if (connection.status === 'ready') return connection;

  await new Promise<void>((resolve, reject) => {
    const onReady = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      connection.off('ready', onReady);
      reject(new Error(`Redis not ready after ${timeoutMs}ms`));
    }, timeoutMs);
    connection.once('ready', onReady);
  });
  return connection;
};
