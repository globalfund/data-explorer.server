import puppeteer from 'puppeteer';
import sharp from 'sharp';
import {
  attachPuppeteerAuthorization,
  isExpiredAuthorization,
  PuppeteerAuth,
} from './puppeteerAuth';

const NAVIGATION_TIMEOUT_MS = 60_000;

/**
 * The report or asset can't be shown with the job's token (expired, no
 * access, or it was deleted), so trying again won't help.
 */
export class ThumbnailUnavailableError extends Error {}

const UNAVAILABLE_STATUSES = new Set([401, 403, 404]);

interface ResponseLike {
  url(): string;
  status(): number;
  request(): {method(): string; resourceType(): string};
}

interface PageLike {
  on(event: 'response', handler: (response: ResponseLike) => void): unknown;
}

/**
 * Records the status of the page's own request for the item (`/report/{id}`
 * or `/asset/{id}`), which decides whether the page shows it or an error.
 */
export const trackItemRequest = (page: PageLike, itemPath: string) => {
  let status: number | undefined;
  page.on('response', response => {
    const request = response.request();
    if (
      request.method() !== 'GET' ||
      !['xhr', 'fetch'].includes(request.resourceType())
    ) {
      return;
    }
    try {
      if (new URL(response.url()).pathname.endsWith(itemPath)) {
        status = response.status();
      }
    } catch {
      // Not an HTTP URL, so not the item's request.
    }
  });
  return () => status;
};

/** Throws unless the item loaded, so an error page never becomes a thumbnail. */
export const assertItemLoaded = (
  status: number | undefined,
  itemPath: string,
) => {
  if (status !== undefined && status < 400) return;
  const message = `Cannot render thumbnail: ${itemPath} ${
    status === undefined ? 'was never requested' : `returned ${status}`
  }`;
  if (status === undefined || UNAVAILABLE_STATUSES.has(status)) {
    throw new ThumbnailUnavailableError(message);
  }
  throw new Error(message);
};

export const screenshotReport = async (
  reportId: string,
  asset: boolean = false,
  auth: PuppeteerAuth = {},
) => {
  // A job that waited long for a worker would only render the error page.
  if (isExpiredAuthorization(auth.authorization)) {
    throw new ThumbnailUnavailableError(
      'Cannot render thumbnail: the token it was queued with has expired',
    );
  }

  const browser = await puppeteer.launch();

  // Always close the browser: a failed job would otherwise leave a Chromium
  // process behind on every attempt.
  try {
    const page = await browser.newPage();

    await attachPuppeteerAuthorization(page, auth);
    const itemPath = `/${asset ? 'asset' : 'report'}/${reportId}`;
    const itemStatus = trackItemRequest(page, itemPath);

    await page.setViewport({
      width: 1227,
      height: 900,
      deviceScaleFactor: 1,
    });

    await page.goto(
      `${process.env.FRONTEND_URL}/report-builder/${
        asset ? 'assets' : 'reports'
      }/${reportId}/export?screenshot=true`,
      {
        waitUntil: 'networkidle0',
        timeout: NAVIGATION_TIMEOUT_MS,
      },
    );

    // Keep the current thumbnail rather than replace it with an error page.
    assertItemLoaded(itemStatus(), itemPath);

    const screenshotBuffer = await page.screenshot({
      type: 'png',
      fullPage: true,
    });

    await sharp(screenshotBuffer)
      .resize({
        width: 400, // thumbnail width
        withoutEnlargement: true,
      })
      .png({
        compressionLevel: 9,
        palette: true,
      })
      .toFile(`public/${asset ? 'asset' : 'report'}-thumbnail/${reportId}.png`);
  } finally {
    await browser.close();
  }
};
