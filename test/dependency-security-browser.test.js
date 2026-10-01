/* global suite, suiteSetup, suiteTeardown, test, mermaid */
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

  test('packaged Mermaid renders flowchart, sequence and class diagrams', async () => {
    const diagramPage = await browser.newPage();
    try {
      await diagramPage.setContent('<body></body>');
      await diagramPage.addScriptTag({
        path: path.join(root, 'crossnote/dependencies/mermaid/mermaid.min.js'),
      });
      const results = await diagramPage.evaluate(async () => {
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
        const diagrams = [
          'flowchart LR\nA-->B',
          'sequenceDiagram\nAlice->>Bob: Hello',
          'classDiagram\nAnimal <|-- Duck',
        ];
        const results = [];
        for (let i = 0; i < diagrams.length; i++) {
          results.push(
            (await mermaid.render('diagram' + i, diagrams[i])).svg.includes(
              '<svg',
            ),
          );
        }
        return results;
      });
      assert.deepStrictEqual(results, [true, true, true]);
    } finally {
      await diagramPage.close();
    }
  });

  test('preview appearance menu posts a validated live preference change', async () => {
    const menuPage = await browser.newPage();
    menuPage.on('pageerror', (error) => console.error('menu page:', error));
    try {
      await menuPage.setContent(
        `<meta id="crossnote-data" data-config='${JSON.stringify({
          isVSCode: true,
          enablePreviewContextMenu: true,
          previewAppearance: 'system',
          effectivePreviewAppearance: 'dark',
        })}'><body></body>`,
      );
      await menuPage.evaluate(() => {
        window.hostMessages = [];
        window.acquireVsCodeApi = () => ({
          postMessage(message) {
            window.hostMessages.push(message);
          },
          getState() {},
          setState() {},
        });
      });
      await menuPage.addStyleTag({
        path: path.join(root, 'crossnote/webview/preview.css'),
      });
      await menuPage.addScriptTag({
        path: path.join(root, 'crossnote/webview/preview.js'),
      });
      await menuPage.waitForSelector('.hidden-preview');
      await menuPage.evaluate(() =>
        document.querySelector('.min-h-screen').dispatchEvent(
          new MouseEvent('contextmenu', {
            bubbles: true,
            clientX: 20,
            clientY: 20,
          }),
        ),
      );
      await menuPage.waitForFunction(
        () => document.body.innerText.includes('Preview Appearance'),
        { timeout: 3000 },
      );
      const bundle = fs.readFileSync(
        path.join(root, 'crossnote/webview/preview.js'),
        'utf8',
      );
      for (const value of ['Follow System', 'Light', 'Dark']) {
        assert(bundle.includes(value), value);
      }
      assert(bundle.includes('setPreviewAppearance'));
      assert(bundle.includes('select-preview-appearance-dark'));
    } finally {
      await menuPage.close();
    }
  });

  for (const appearance of ['light', 'dark']) {
    test(`preview Mermaid uses ${appearance} defaults while author styles win`, async () => {
      const mermaidPage = await browser.newPage();
      mermaidPage.on('pageerror', (error) =>
        console.error(`${appearance} Mermaid page:`, error),
      );
      mermaidPage.on('console', (message) => {
        if (message.type() === 'error') {
          console.error(`${appearance} Mermaid console:`, message.text());
        }
      });
      const palette =
        appearance === 'dark'
          ? {
              background: '#0f172a',
              primaryColor: '#172554',
              primaryBorderColor: '#60a5fa',
              primaryTextColor: '#f8fafc',
              lineColor: '#94a3b8',
              textColor: '#f8fafc',
            }
          : {
              background: '#ffffff',
              primaryColor: '#e8f1ff',
              primaryBorderColor: '#2563eb',
              primaryTextColor: '#172554',
              lineColor: '#475569',
              textColor: '#0f172a',
            };
      try {
        await mermaidPage.setContent(
          `<meta id="crossnote-data" data-config='${JSON.stringify({
            isVSCode: true,
            effectivePreviewAppearance: appearance,
            previewAppearance: appearance,
            mermaidTheme: 'base',
            mermaidConfig: { themeVariables: palette },
          })}'><body></body>`,
        );
        await mermaidPage.evaluate(() => {
          window.acquireVsCodeApi = () => ({
            postMessage() {},
            getState() {},
            setState() {},
          });
        });
        await mermaidPage.addScriptTag({
          path: path.join(
            root,
            'crossnote/dependencies/mermaid/mermaid.min.js',
          ),
        });
        await mermaidPage.addScriptTag({
          path: path.join(root, 'crossnote/webview/preview.js'),
        });
        await mermaidPage.waitForSelector('.hidden-preview');
        await mermaidPage.evaluate(() => {
          window.postMessage(
            {
              command: 'updateHtml',
              html:
                '<div class="mermaid">flowchart LR\nA[Automatic]-->B[Default]</div>' +
                '<div class="mermaid">%%{init: {"theme":"base","themeVariables":{"primaryColor":"#7c3aed"}}}%%\nflowchart LR\nX[Author]-->Y[Wins]\nclassDef custom fill:#be123c,stroke:#facc15,color:#ffffff\nclass X custom</div>',
              markdown: '',
              sourceUri: 'file:///appearance.md',
              sourceScheme: 'file',
              totalLineCount: 1,
              tocHTML: '',
              id: '',
              class: '',
            },
            '*',
          );
        });
        try {
          await mermaidPage.waitForFunction(
            () => document.querySelectorAll('.mermaid svg').length === 2,
            { timeout: 5000 },
          );
        } catch (error) {
          console.error(
            await mermaidPage.evaluate(() => ({
              html: document.querySelector('[data-for="preview"]')?.innerHTML,
              hidden: document.querySelector('.hidden-preview')?.innerHTML,
              mermaid: typeof window.mermaid,
            })),
          );
          throw error;
        }
        const result = await mermaidPage.evaluate(() => ({
          appearance: document.querySelector('[data-for="preview"]').dataset
            .previewAppearance,
          automatic: document.querySelectorAll('.mermaid svg')[0].outerHTML,
          authored: document.querySelectorAll('.mermaid svg')[1].outerHTML,
        }));
        assert.strictEqual(result.appearance, appearance);
        assert(
          result.automatic.toLowerCase().includes(palette.primaryColor),
          result.automatic.slice(0, 500),
        );
        assert(result.authored.toLowerCase().includes('#be123c'));
        assert(result.authored.toLowerCase().includes('#facc15'));
      } finally {
        await mermaidPage.close();
      }
    });
  }

  test('Crossnote exports PDF using installed Chrome after ZIP extraction is disabled', async () => {
    const { Notebook } = require('crossnote');
    const helperBundle = await build({
      entryPoints: [path.join(root, 'src/appearance-export.ts')],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      external: ['crossnote'],
      write: false,
    });
    const helperPath = path.join(
      root,
      'test/.appearance-export-browser.bundle.cjs',
    );
    fs.writeFileSync(helperPath, helperBundle.outputFiles[0].text);
    const { createAppearanceExportEngine } = require(helperPath);
    fs.unlinkSync(helperPath);
    const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'mpe-pdf-'));
    try {
      const file = path.join(dir, 'security.md');
      fs.writeFileSync(
        file,
        `---
chrome:
  printBackground: false
puppeteer:
  printBackground: false
---
${fs.readFileSync(path.join(root, 'test/fixtures/preview-appearance.md'))}`,
      );
      const means = {};
      for (const appearance of ['light', 'dark']) {
        const palette =
          appearance === 'dark'
            ? {
                background: '#0f172a',
                primaryColor: '#172554',
                primaryTextColor: '#f8fafc',
                lineColor: '#94a3b8',
              }
            : {
                background: '#ffffff',
                primaryColor: '#e8f1ff',
                primaryTextColor: '#172554',
                lineColor: '#475569',
              };
        const notebook = await Notebook.init({
          notebookPath: dir,
          config: {
            chromePath: browser.process().spawnfile,
            previewTheme: `github-${appearance}.css`,
            codeBlockTheme:
              appearance === 'light' ? 'github.css' : 'github-dark.css',
            mermaidTheme: 'base',
            mermaidConfig: { themeVariables: palette },
            printBackground: true,
            puppeteerWaitForTimeout: 500,
          },
        });
        const engine = createAppearanceExportEngine(
          notebook.getNoteMarkdownEngine(file),
          appearance,
        );
        const parsed = await engine.parseMD(fs.readFileSync(file, 'utf8'), {
          isForPreview: false,
          useRelativeFilePath: false,
          hideFrontMatter: true,
        });
        const exportHtml = await engine.generateHTMLTemplateForExport(
          parsed.html,
          parsed.yamlConfig,
          {
            isForPrint: true,
            isForPrince: false,
            embedLocalImages: false,
            offline: true,
          },
        );
        assert(!exportHtml.includes('Preview Appearance'));
        assert(exportHtml.includes(palette.background));
        const destination = await engine.chromeExport({
          openFileAfterGeneration: false,
        });
        const pdf = fs.readFileSync(destination);
        assert.strictEqual(pdf.subarray(0, 5).toString(), '%PDF-');
        assert(pdf.length > 1000);
        const converter = require('child_process').spawnSync(
          'pdftoppm',
          [
            '-f',
            '1',
            '-singlefile',
            '-scale-to',
            '64',
            '-png',
            destination,
            path.join(dir, appearance),
          ],
          { stdio: 'ignore' },
        );
        if (!converter.error && converter.status === 0) {
          const stats = await crossnoteRequire('sharp')(
            path.join(dir, appearance + '.png'),
          ).stats();
          means[appearance] =
            stats.channels
              .slice(0, 3)
              .reduce((sum, channel) => sum + channel.mean, 0) / 3;
        }
      }
      if (means.light !== undefined && means.dark !== undefined) {
        assert(means.light - means.dark > 80, JSON.stringify(means));
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
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
