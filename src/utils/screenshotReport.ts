import puppeteer from 'puppeteer';
import sharp from 'sharp';
import {attachPuppeteerAuthorization, PuppeteerAuth} from './puppeteerAuth';

const NAVIGATION_TIMEOUT_MS = 60_000;

export const screenshotReport = async (
  reportId: string,
  asset: boolean = false,
  auth: PuppeteerAuth = {},
) => {
  const browser = await puppeteer.launch();

  // Always close the browser: a failed job would otherwise leave a Chromium
  // process behind on every attempt.
  try {
    const page = await browser.newPage();

    await attachPuppeteerAuthorization(page, auth);

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
