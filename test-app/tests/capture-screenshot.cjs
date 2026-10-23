// Visual artifacts are opt-in, including when browser checks are run manually.
module.exports = async function captureScreenshot(page, options) {
  if (!process.argv.includes('--screenshots')) return;
  if (options.path) require('node:fs').mkdirSync(require('node:path').dirname(options.path), {recursive:true});
  await page.screenshot(options);
};
