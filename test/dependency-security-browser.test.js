/* global suite, suiteSetup, suiteTeardown, test */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const { build } = require('esbuild');
const { sanitizerPlugin } = require('../scripts/build-crossnote-browser.cjs');
const crossnoteRequire = createRequire(require.resolve('crossnote'));
const root = path.resolve(__dirname, '..');

suite('browser sanitizer integration', function () {
  this.timeout(60000);
  let browser;
  let page;

  suiteSetup(async () => {
    const paths = crossnoteRequire('chrome-paths');
    const command = process.env.CHROME_PATH || paths.chrome || paths.chromium;
    const executablePath =
      command &&
      (path.isAbsolute(command)
        ? command
        : (process.env.PATH || '')
            .split(path.delimiter)
            .map((dir) => path.join(dir, command))
            .find((file) => fs.existsSync(file)));
    assert(
      executablePath && fs.existsSync(executablePath),
      'Set CHROME_PATH to run browser security tests',
    );
    browser = await crossnoteRequire('puppeteer-core').launch({
      executablePath,
      headless: true,
    });
    page = await browser.newPage();
  });

  suiteTeardown(async () => {
    if (browser) await browser.close();
  });

  test('Monaco and preview sanitizers remove executable content and retain markup', async () => {
    const monaco = crossnoteRequire.resolve(
      'monaco-editor/esm/vs/base/browser/domSanitize.js',
    );
    const preview = path.join(
      root,
      'vendor/crossnote/src/webview/lib/sanitize.ts',
    );
    const output = await build({
      stdin: {
        contents: `import {safeSetInnerHtml} from ${JSON.stringify(monaco)};
          import {sanitizeHtml} from ${JSON.stringify(preview)};
          globalThis.securityTest = {safeSetInnerHtml, sanitizeHtml};`,
        resolveDir: root,
      },
      bundle: true,
      platform: 'browser',
      write: false,
      plugins: [sanitizerPlugin()],
    });
    await page.setContent('<div id="sink"></div>');
    await page.addScriptTag({ content: output.outputFiles[0].text });
    const result = await page.evaluate(() => {
      const sink = document.getElementById('sink');
      const payload =
        '<p><strong>Keep me</strong><a href="https://example.com">link</a></p>' +
        '<img src="missing" onerror="globalThis.injected=true">' +
        '<a href="javascript:globalThis.injected=true">bad</a>' +
        '<script>globalThis.injected=true</script>';
      const inspect = () => ({
        text: sink.querySelector('strong')?.textContent,
        link: sink.querySelector('a')?.getAttribute('href'),
        executable: !!sink.querySelector(
          'script, [onerror], [href^="javascript:"]',
        ),
      });
      globalThis.securityTest.safeSetInnerHtml(sink, payload);
      const monaco = inspect();
      sink.innerHTML = globalThis.securityTest.sanitizeHtml(payload);
      const preview = inspect();
      // GHSA-v2wj-7wpq-c8vv: rawtext closing tags inside attribute values
      // must not survive to be reinterpreted in a different HTML context.
      const rawtext = '<img title="</noscript><img src=x onerror=alert(1)>">';
      globalThis.securityTest.safeSetInnerHtml(sink, rawtext);
      const monacoRawtext = !!sink.querySelector('[title]');
      sink.innerHTML = globalThis.securityTest.sanitizeHtml(rawtext);
      const previewRawtext = !!sink.querySelector('[title]');
      sink.innerHTML = globalThis.securityTest.sanitizeHtml(
        '<iframe src="https://example.com" srcdoc="<script>alert(1)</script>"></iframe>' +
          '<math><semantics><mi>x</mi><annotation encoding="application/x-tex">x</annotation></semantics></math>',
      );
      return {
        monaco,
        preview,
        monacoRawtext,
        previewRawtext,
        sandbox: sink.querySelector('iframe').getAttribute('sandbox'),
        srcdoc: sink.querySelector('iframe').hasAttribute('srcdoc'),
        math: sink.querySelector('annotation')?.textContent,
        injected: !!globalThis.injected,
      };
    });
    for (const output of [result.monaco, result.preview]) {
      assert.deepStrictEqual(output, {
        text: 'Keep me',
        link: 'https://example.com',
        executable: false,
      });
    }
    assert.strictEqual(result.sandbox, '');
    assert.strictEqual(result.srcdoc, false);
    assert.strictEqual(result.math, 'x');
    assert.strictEqual(result.injected, false);
    assert.strictEqual(result.monacoRawtext, false);
    assert.strictEqual(result.previewRawtext, false);
  });

  test('rebuilt preview mounts and processes a real host update', async () => {
    const errors = [];
    const onError = (error) => errors.push(error.message);
    const previewPage = await browser.newPage();
    previewPage.on('pageerror', onError);
    try {
      await previewPage.setContent(
        '<meta id="crossnote-data" data-config=\'{"isVSCode":true,"enablePreviewZenMode":true}\'><body></body>',
      );
      await previewPage.evaluate(() => {
        window.acquireVsCodeApi = () => ({
          postMessage() {},
          getState() {},
          setState() {},
        });
      });
      await previewPage.addStyleTag({
        path: path.join(root, 'crossnote/webview/preview.css'),
      });
      await previewPage.addScriptTag({
        path: path.join(root, 'crossnote/webview/preview.js'),
      });
      await previewPage.waitForSelector('.hidden-preview');
      await previewPage.evaluate(() => {
        window.postMessage(
          {
            command: 'updateHtml',
            html: '<h1>Security smoke test</h1><p><strong>Rendered</strong></p><img src="missing" onerror="globalThis.injected=true">',
            markdown: '# Security smoke test',
            sourceUri: 'file:///security-test.md',
            sourceScheme: 'file',
            totalLineCount: 3,
            tocHTML: '',
            id: '',
            class: '',
          },
          '*',
        );
      });
      await previewPage.waitForFunction(() =>
        [
          ...document.querySelectorAll(
            '.markdown-preview:not(.hidden-preview) h1',
          ),
        ].some((el) => el.textContent === 'Security smoke test'),
      );
      assert.strictEqual(
        await previewPage.evaluate(() => !!window.injected),
        false,
      );
      assert.deepStrictEqual(errors, []);
    } finally {
      await previewPage.close();
    }
  });
});
