import puppeteer from 'puppeteer';

export const screenshotReport = async (reportId: string) => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.setViewport({
    width: 1227,
    height: 900,
    deviceScaleFactor: 1,
  });

  await page.goto(
    `${process.env.FRONTEND_URL}/report-builder/reports/${reportId}/export`,
    {
      waitUntil: 'networkidle0',
    },
  );

  await page.screenshot({
    path: `public/report-thumbnail/${reportId}.png`,
    fullPage: true,
  });

  await browser.close();
};
