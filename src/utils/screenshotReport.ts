import puppeteer from 'puppeteer';
import sharp from 'sharp';

export const screenshotReport = async (reportId: string) => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.setViewport({
    width: 1227,
    height: 900,
    deviceScaleFactor: 1,
  });

  await page.goto(
    `${process.env.FRONTEND_URL}/report-builder/reports/${reportId}/export?screenshot=true`,
    {
      waitUntil: 'networkidle0',
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
    .toFile(`public/report-thumbnail/${reportId}.png`);

  await browser.close();
};
