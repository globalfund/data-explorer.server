import {HttpErrors} from '@loopback/rest';
import puppeteer from 'puppeteer';
import {attachPuppeteerAuthorization, PuppeteerAuth} from './puppeteerAuth';

const NAVIGATION_TIMEOUT_MS = 60_000;

/**
 * Each export runs a full Chromium inside the API process, so cap how many
 * run at once per process and turn away requests when the wait gets long.
 */
const MAX_CONCURRENT_EXPORTS = Number(process.env.MAX_CONCURRENT_EXPORTS ?? 2);
const MAX_QUEUED_EXPORTS = 10;

let activeExports = 0;
const waitingExports: (() => void)[] = [];

const acquireExportSlot = async () => {
  if (activeExports < MAX_CONCURRENT_EXPORTS) {
    activeExports++;
    return;
  }
  if (waitingExports.length >= MAX_QUEUED_EXPORTS) {
    throw new HttpErrors.ServiceUnavailable(
      'Too many exports in progress. Please try again shortly.',
    );
  }
  // The releasing export hands its slot over, so the count stays the same.
  await new Promise<void>(resolve => waitingExports.push(resolve));
};

const releaseExportSlot = () => {
  const next = waitingExports.shift();
  if (next) {
    next();
  } else {
    activeExports--;
  }
};

export const EXPORT_FORMATS = ['pdf', 'png', 'svg'] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number];

type ExportResult = {
  data: Buffer;
  mimeType: string;
  fileName: string;
};

export const exportReport = async (
  reportId: string,
  format: ExportFormat,
  asset: boolean = false,
  auth: PuppeteerAuth = {},
): Promise<ExportResult> => {
  const frontendUrl = process.env.FRONTEND_URL;

  if (!frontendUrl) {
    throw new Error('FRONTEND_URL is missing. Example: http://localhost:3000');
  }

  const url = new URL(
    `/report-builder/${asset ? 'assets' : 'reports'}/${reportId}/export`,
    frontendUrl,
  ).toString();

  await acquireExportSlot();
  try {
    return await renderExport(url, reportId, format, asset, auth);
  } finally {
    releaseExportSlot();
  }
};

const renderExport = async (
  url: string,
  reportId: string,
  format: ExportFormat,
  asset: boolean,
  auth: PuppeteerAuth,
): Promise<ExportResult> => {
  const browser = await puppeteer.launch({
    headless: true,
  });

  try {
    const page = await browser.newPage();

    await attachPuppeteerAuthorization(page, auth);

    await page.setViewport({
      width: 1227,
      height: 900,
      deviceScaleFactor: 2, // better PNG quality
    });

    await page.goto(url, {
      waitUntil: 'networkidle0',
      timeout: NAVIGATION_TIMEOUT_MS,
    });

    // Optional: wait for your report root element if needed
    // await page.waitForSelector('#report-export-root');

    const dimensions = await page.evaluate(() => ({
      // @ts-ignore puppeteer knows these properties exist
      width: document.documentElement.scrollWidth,
      // @ts-ignore puppeteer knows these properties exist
      height: document.documentElement.scrollHeight,
    }));

    if (format === 'png') {
      const screenshot = await page.screenshot({
        type: 'png',
        fullPage: true,
      });

      return {
        data: Buffer.from(screenshot),
        mimeType: 'image/png',
        fileName: `${asset ? 'asset' : 'report'}-${reportId}.png`,
      };
    }

    if (format === 'pdf') {
      const pdf = await page.pdf({
        printBackground: true,
        width: `${dimensions.width}px`,
        height: `${dimensions.height}px`,
        margin: {
          top: '0px',
          right: '0px',
          bottom: '0px',
          left: '0px',
        },
      });

      return {
        data: Buffer.from(pdf),
        mimeType: 'application/pdf',
        fileName: `${asset ? 'asset' : 'report'}-${reportId}.pdf`,
      };
    }

    if (format === 'svg') {
      const screenshot = await page.screenshot({
        type: 'png',
        fullPage: true,
        encoding: 'base64',
      });

      const svg = `
<svg xmlns="http://www.w3.org/2000/svg"
     width="${dimensions.width}"
     height="${dimensions.height}"
     viewBox="0 0 ${dimensions.width} ${dimensions.height}">
  <image
    href="data:image/png;base64,${screenshot}"
    width="${dimensions.width}"
    height="${dimensions.height}"
    preserveAspectRatio="xMinYMin meet"
  />
</svg>`.trim();

      return {
        data: Buffer.from(svg, 'utf-8'),
        mimeType: 'image/svg+xml',
        fileName: `${asset ? 'asset' : 'report'}-${reportId}.svg`,
      };
    }

    throw new Error(`Unsupported format: ${format}`);
  } finally {
    await browser.close();
  }
};
