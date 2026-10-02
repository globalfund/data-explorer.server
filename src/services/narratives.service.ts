import axios, {AxiosError} from 'axios';
import {
  isCountryBundle,
  isPageBundle,
  isPageIdentity,
} from './narrative-contracts';
export {isCountryBundle, isPageBundle} from './narrative-contracts';

export type NarrativeServiceErrorCode =
  | 'invalidRequest'
  | 'notFound'
  | 'unavailable'
  | 'timeout'
  | 'upstreamAuth'
  | 'upstreamError'
  | 'invalidUpstream';

export class NarrativeServiceError extends Error {
  constructor(
    public readonly code: NarrativeServiceErrorCode,
    public readonly statusCode: number,
  ) {
    super(code);
    this.name = 'NarrativeServiceError';
  }
}

const COUNTRY_CODE = /^[A-Z]{3}$/;
const LOCALE = 'en';
export class NarrativesService {
  async get(country: string, locale: string): Promise<unknown> {
    if (!COUNTRY_CODE.test(country) || locale !== LOCALE)
      throw new NarrativeServiceError('invalidRequest', 400);
    return this.read(`countries/${country}/narratives`, {locale}, value =>
      isCountryBundle(value, country, locale),
    );
  }

  async getPage(
    pageType: string,
    pageId: string,
    locale = LOCALE,
    scopeKey = 'default',
  ): Promise<unknown> {
    if (!isPageIdentity(pageType, pageId, locale, scopeKey))
      throw new NarrativeServiceError('invalidRequest', 400);
    const params: Record<string, string> = {locale};
    params['scope_key'] = scopeKey;
    return this.read(
      `pages/${pageType}/${encodeURIComponent(pageId)}/narratives`,
      params,
      value => isPageBundle(value, pageType, pageId, locale, scopeKey),
    );
  }

  private async read(
    path: string,
    params: Record<string, string>,
    validate: (value: unknown) => boolean,
  ): Promise<unknown> {
    const baseUrl = process.env.NARRATIVE_API_URL;
    if (!baseUrl || !/^https?:\/\/[^\s/]+(?:\/[^\s?]*)?$/.test(baseUrl))
      throw new NarrativeServiceError('unavailable', 503);
    const url = `${baseUrl.replace(/\/$/, '')}/narrative-engine/${path}`;
    try {
      const response = await axios.get(url, {
        params,
        headers: process.env.NARRATIVE_API_KEY
          ? {Authorization: process.env.NARRATIVE_API_KEY}
          : undefined,
        timeout: 5000,
        maxRedirects: 0,
        maxContentLength: 2_000_000,
        maxBodyLength: 2_000_000,
        validateStatus: () => true,
      });
      if (response.status === 404)
        throw new NarrativeServiceError('notFound', 404);
      if (response.status === 401 || response.status === 403)
        throw new NarrativeServiceError('upstreamAuth', 502);
      if (response.status < 200 || response.status >= 300)
        throw new NarrativeServiceError('upstreamError', 502);
      if (!validate(response.data))
        throw new NarrativeServiceError('invalidUpstream', 502);
      return response.data;
    } catch (error) {
      if (error instanceof NarrativeServiceError) throw error;
      const axiosError = error as AxiosError;
      if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT')
        throw new NarrativeServiceError('timeout', 504);
      throw new NarrativeServiceError('upstreamError', 502);
    }
  }
}
