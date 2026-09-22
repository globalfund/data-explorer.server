import {get, param, response} from '@loopback/rest';
import {
  NarrativeServiceError,
  NarrativesService,
} from '../services/narratives.service';

export class NarrativesController {
  constructor(private readonly narrativesService = new NarrativesService()) {}

  @get('/location/{code}/narratives')
  @response(200, {description: 'Saved country narrative bundle'})
  async getNarratives(
    @param.path.string('code') code: string,
    @param.query.string('locale', {required: false}) locale = 'en',
  ): Promise<unknown> {
    try {
      return await this.narrativesService.get(code, locale);
    } catch (error) {
      if (!(error instanceof NarrativeServiceError)) throw error;
      const messages: Record<string, string> = {
        invalidRequest: 'Invalid narrative request',
        notFound: 'Narrative not found',
        unavailable: 'Narrative service unavailable',
        timeout: 'Narrative service timed out',
        upstreamAuth: 'Narrative service authentication failed',
        upstreamError: 'Narrative service request failed',
        invalidUpstream: 'Narrative service returned invalid content',
      };
      const responseError = new Error(messages[error.code]) as Error & {
        statusCode: number;
      };
      responseError.statusCode = error.statusCode;
      throw responseError;
    }
  }
}
