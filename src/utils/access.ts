import {HttpErrors} from '@loopback/rest';
import _ from 'lodash';

/**
 * Fields that only the server may set. Clients must never be able to change
 * ownership or visibility (`public`/`baseline` items are listed for every user).
 */
const SERVER_MANAGED_FIELDS = [
  'id',
  'owner',
  'public',
  'baseline',
  'createdDate',
  'updatedDate',
];

export const omitServerManagedFields = <T extends object>(
  body: T,
  extraFields: string[] = [],
): T => _.omit(body, [...SERVER_MANAGED_FIELDS, ...extraFields]) as T;

type ServiceError = {error: string};

const isServiceError = (value: unknown): value is ServiceError =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as ServiceError).error === 'string' &&
  !('id' in value);

/**
 * rb-core-middleware services report access failures by returning `{error}`
 * instead of throwing, which would otherwise reach the client as a 200/204.
 */
export const assertServiceResult = <T>(result: T): Exclude<T, ServiceError> => {
  if (isServiceError(result)) {
    if (/unauthori[sz]ed|forbidden/i.test(result.error)) {
      throw new HttpErrors.Forbidden(result.error);
    }
    throw new HttpErrors.BadRequest(result.error);
  }
  return result as Exclude<T, ServiceError>;
};

export const assertOwner = (entity: {owner?: string}, userId: string) => {
  if (entity.owner !== userId) {
    throw new HttpErrors.Forbidden('Forbidden: You do not own this item');
  }
};

const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export const isSafeId = (value: unknown): value is string =>
  typeof value === 'string' && SAFE_ID_PATTERN.test(value);

/**
 * Ids are interpolated into file paths and upstream URLs, so only allow plain
 * identifiers (Mongo ids, dataset names like `gf_allocations`).
 */
export const assertSafeId = (value: unknown, label = 'id'): string => {
  if (!isSafeId(value)) {
    throw new HttpErrors.BadRequest(`Invalid ${label}`);
  }
  return value;
};
