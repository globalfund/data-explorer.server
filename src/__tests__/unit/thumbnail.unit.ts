import {expect, sinon} from '@loopback/testlab';
import {EventEmitter} from 'events';
import puppeteer from 'puppeteer';
import {isExpiredAuthorization} from '../../utils/puppeteerAuth';
import {
  assertItemLoaded,
  screenshotReport,
  ThumbnailUnavailableError,
  trackItemRequest,
} from '../../utils/screenshotReport';

const bearer = (payload: object) =>
  `Bearer header.${Buffer.from(JSON.stringify(payload)).toString(
    'base64url',
  )}.signature`;
const inSeconds = (seconds: number) => Math.floor(Date.now() / 1000) + seconds;

const response = (
  url: string,
  status: number,
  {method = 'GET', resourceType = 'fetch'} = {},
) => ({
  url: () => url,
  status: () => status,
  request: () => ({method: () => method, resourceType: () => resourceType}),
});

describe('thumbnail rendering', () => {
  afterEach(() => sinon.restore());

  describe('isExpiredAuthorization', () => {
    it('reads the expiry of a JWT', () => {
      expect(
        isExpiredAuthorization(bearer({exp: inSeconds(-60)})),
      ).to.be.true();
      expect(
        isExpiredAuthorization(bearer({exp: inSeconds(60)})),
      ).to.be.false();
    });

    it("leaves tokens it can't read to the API", () => {
      expect(isExpiredAuthorization('Bearer opaque-token')).to.be.false();
      expect(isExpiredAuthorization(bearer({sub: 'user'}))).to.be.false();
      expect(isExpiredAuthorization('Bearer a.not-json.c')).to.be.false();
      expect(isExpiredAuthorization(undefined)).to.be.false();
    });
  });

  describe('trackItemRequest', () => {
    it("records only the page's own request for the item", () => {
      const page = new EventEmitter();
      const status = trackItemRequest(page, '/report/abc');

      page.emit(
        'response',
        response('https://api.test/report/abc', 204, {method: 'OPTIONS'}),
      );
      page.emit('response', response('https://api.test/report/other', 500));
      page.emit(
        'response',
        response('https://app.test/report-builder/reports/abc/export', 200, {
          resourceType: 'document',
        }),
      );
      expect(status()).to.be.undefined();

      page.emit('response', response('https://api.test/report/abc', 401));
      expect(status()).to.equal(401);
    });
  });

  describe('assertItemLoaded', () => {
    it('lets a loaded item through', () => {
      expect(() => assertItemLoaded(200, '/report/abc')).to.not.throw();
    });

    it("gives up on an item the job's token can't show", () => {
      for (const status of [401, 403, 404, undefined]) {
        expect(() => assertItemLoaded(status, '/report/abc')).to.throw(
          ThumbnailUnavailableError,
        );
      }
    });

    it('leaves a server error to be retried', () => {
      let error: unknown;
      try {
        assertItemLoaded(500, '/report/abc');
      } catch (e) {
        error = e;
      }
      expect(error).to.be.instanceOf(Error);
      expect(error).to.not.be.instanceOf(ThumbnailUnavailableError);
      expect((error as Error).message).to.match(/returned 500/);
    });
  });

  describe('screenshotReport', () => {
    it('drops a job whose token expired without starting a browser', async () => {
      const launch = sinon.stub(puppeteer, 'launch');
      await expect(
        screenshotReport('abc', false, {
          authorization: bearer({exp: inSeconds(-60)}),
          apiOrigin: 'https://api.test',
        }),
      ).to.be.rejectedWith(ThumbnailUnavailableError);
      expect(launch.called).to.be.false();
    });
  });
});
