import {
  globalInterceptor,
  Interceptor,
  InvocationContext,
  InvocationResult,
  Provider,
  ValueOrPromise,
} from '@loopback/core';
import {Request, RestBindings} from '@loopback/rest';
import _ from 'lodash';

// Returns true when a controller result has nothing to show the user.
// Handles the global search shape ({data: [{name, results: []}]}) and the
// list/table shapes ({count: 0, data: []} or {data: []}).
function isNoDataResult(result: any): boolean {
  if (!_.isPlainObject(result)) {
    return false;
  }
  if (typeof result.count === 'number') {
    return result.count === 0;
  }
  if (!Array.isArray(result.data)) {
    return false;
  }
  if (
    result.data.length > 0 &&
    result.data.every((item: any) => Array.isArray(item?.results))
  ) {
    return result.data.every((item: any) => item.results.length === 0);
  }
  return result.data.length === 0;
}

/**
 * Logs every request with a non-empty "q" search param that comes back
 * with no data, as one JSON line, e.g.
 * {"event":"search_no_data","endpoint":"/global-search","q":"covid",...}
 */
@globalInterceptor('', {tags: {name: 'searchNoData'}})
export class SearchNoDataInterceptor implements Provider<Interceptor> {
  value() {
    return this.intercept.bind(this);
  }

  async intercept(
    invocationCtx: InvocationContext,
    next: () => ValueOrPromise<InvocationResult>,
  ) {
    const result = await next();
    try {
      const req = await invocationCtx.get<Request>(RestBindings.Http.REQUEST, {
        optional: true,
      });
      const q = _.toString(req?.query.q).trim();
      if (req && q.length > 0 && isNoDataResult(result)) {
        console.log(
          JSON.stringify({
            event: 'search_no_data',
            timestamp: new Date().toISOString(),
            endpoint: req.path,
            q,
            // other filters sent with the search, e.g. geographies, components
            params: _.omit(req.query, 'q'),
            // set when the upstream data API call failed (see handleDataApiError)
            error:
              typeof result.message === 'string' ? result.message : undefined,
          }),
        );
      }
    } catch (err) {
      console.error('search-no-data logging failed', err);
    }
    return result;
  }
}
