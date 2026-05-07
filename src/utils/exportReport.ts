import puppeteer from 'puppeteer';

export type ExportFormat = 'pdf' | 'png' | 'svg';

type ExportResult = {
  data: Buffer;
  mimeType: string;
  fileName: string;
};

export const exportReport = async (
  reportId: string,
  format: ExportFormat,
): Promise<ExportResult> => {
  const frontendUrl = process.env.FRONTEND_URL;

  if (!frontendUrl) {
    throw new Error('FRONTEND_URL is missing. Example: http://localhost:3000');
  }

  const url = new URL(
    `/report-builder/reports/${reportId}/export`,
    frontendUrl,
  ).toString();

  const browser = await puppeteer.launch({
    headless: true,
  });

  try {
    const page = await browser.newPage();

    await page.setViewport({
      width: 1227,
      height: 900,
      deviceScaleFactor: 2, // better PNG quality
    });

    await page.goto(url, {
      waitUntil: 'networkidle2',
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
        fileName: `report-${reportId}.png`,
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
        fileName: `report-${reportId}.pdf`,
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
        fileName: `report-${reportId}.svg`,
      };
    }

    throw new Error(`Unsupported format: ${format}`);
  } finally {
    await browser.close();
  }
};
