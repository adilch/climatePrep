/**
 * PDF rendering (spec K1/§3.7): the print-styled HTML (same content model as
 * the .docx, same server-rendered figures) is printed to PDF by Playwright's
 * chromium — already a project dependency for E2E tests, so no new runtime.
 *
 * Deploy note (spec §3.7 escape hatch): on Vercel swap this launcher for
 * puppeteer-core + @sparticuz/chromium behind the same buildPdf(html)
 * signature; nothing upstream changes.
 */

export async function buildPdf(html: string): Promise<Buffer> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "Letter",
      margin: { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" },
      displayHeaderFooter: true,
      headerTemplate: `<span></span>`,
      footerTemplate: `
        <div style="width:100%; font-size:7px; color:#94a3b8; text-align:center;
                    font-family: Consolas, monospace;">
          climatePrep — OGL–Canada data — page
          <span class="pageNumber"></span> of <span class="totalPages"></span>
        </div>`,
      printBackground: true,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
