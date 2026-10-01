/* global suite, test, suiteSetup, suiteTeardown */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { build } = require('esbuild');
let api;
let outfile;
suite('preview appearance model', () => {
  suiteSetup(async () => {
    outfile = path.join(__dirname, '.preview-appearance.bundle.cjs');
    await build({
      stdin: {
        contents:
          "export * from './src/preview-appearance'; export * from './src/appearance-export';",
        resolveDir: path.join(__dirname, '..'),
        loader: 'ts',
      },
      bundle: true,
      platform: 'node',
      external: ['crossnote'],
      outfile,
    });
    api = require(outfile);
  });
  suiteTeardown(() => {
    if (outfile && fs.existsSync(outfile)) fs.unlinkSync(outfile);
  });
  test('System is the default user-only preference', () => {
    const setting =
      require('../package.json').contributes.configuration.properties[
        'markdown-preview-enhanced.previewAppearance'
      ];
    assert.strictEqual(setting.default, 'system');
    assert.strictEqual(setting.scope, 'application');
    assert.strictEqual(api.resolvePreviewAppearance(undefined, 'dark'), 'dark');
  });
  for (const host of ['light', 'dark']) {
    for (const preference of ['system', 'light', 'dark']) {
      test(`${preference} with a ${host} host`, () => {
        assert.strictEqual(
          api.resolvePreviewAppearance(preference, host),
          preference === 'system' ? host : preference,
        );
      });
    }
  }
  test('only accepts the three preference values', () => {
    for (const value of [null, {}, 'auto', 'Light', '<script>'])
      assert(!api.isPreviewAppearance(value));
    for (const value of ['system', 'light', 'dark'])
      assert(api.isPreviewAppearance(value));
  });
  test('paired styles and fallback share effective appearance without mutating input', () => {
    const original = {
      previewTheme: 'solarized-light.css',
      codeBlockTheme: 'auto.css',
      printBackground: false,
    };
    const dark = api.appearanceConfig(original, 'system', 'dark', true);
    assert.strictEqual(dark.previewTheme, 'solarized-dark.css');
    assert.strictEqual(dark.codeBlockTheme, 'solarized-dark.css');
    assert.strictEqual(dark.printBackground, true);
    assert.strictEqual(dark.puppeteerWaitForTimeout, 500);
    assert.strictEqual(dark.exportColorScheme, 'theme');
    assert.strictEqual(dark.mermaidTheme, 'base');
    assert.strictEqual(dark.mermaidConfig.themeVariables.background, '#0f172a');
    assert.match(dark.mermaidConfig.themeCSS, /\.node\.success/);
    assert.strictEqual(original.printBackground, false);
    assert.strictEqual(
      api.themeForAppearance('vscode.css', 'light'),
      'github-light.css',
    );
    assert.strictEqual(
      api.themeForAppearance('monokai.css', 'dark', true),
      'github-dark.css',
    );
    assert.strictEqual(
      api.themeForAppearance('github-dark.css', 'light', true),
      'github.css',
    );
  });

  test('author Mermaid configuration is layered above automatic defaults', () => {
    const result = api.appearanceConfig(
      {
        previewTheme: 'github-light.css',
        codeBlockTheme: 'auto.css',
        mermaidTheme: 'forest',
        mermaidConfig: {
          themeVariables: { primaryColor: '#123456' },
          themeCSS: '.node.action rect{fill:pink}',
        },
      },
      'dark',
      'light',
    );
    assert.strictEqual(result.mermaidTheme, 'forest');
    assert.strictEqual(
      result.mermaidConfig.themeVariables.primaryColor,
      '#123456',
    );
    assert.match(result.mermaidConfig.themeCSS, /fill:pink\}$/);
  });

  test('export engine owns a frozen effective-appearance snapshot', () => {
    const sourceConfig = {
      previewTheme: 'github-light.css',
      codeBlockTheme: 'auto.css',
      mermaidTheme: 'default',
      mermaidConfig: {},
      printBackground: false,
    };
    const notebook = { config: sourceConfig };
    const source = { filePath: '/tmp/appearance.md', notebook };
    const result = api.createAppearanceExportEngine(source, 'dark');
    assert.notStrictEqual(result.notebook, notebook);
    assert.strictEqual(result.notebook.config.previewTheme, 'github-dark.css');
    assert.strictEqual(
      result.notebook.config.codeBlockTheme,
      'github-dark.css',
    );
    assert.strictEqual(result.notebook.config.printBackground, true);
    assert(Object.isFrozen(result.notebook.config));
    assert.strictEqual(sourceConfig.previewTheme, 'github-light.css');
  });

  test('PDF backgrounds cannot be disabled by document export options', () => {
    const yaml = {
      chrome: { timeout: 25, printBackground: false },
      puppeteer: { landscape: true, printBackground: false },
    };
    const result = api.forcePrintBackground(yaml);
    assert.deepStrictEqual(result.chrome, {
      timeout: 25,
      printBackground: true,
    });
    assert.deepStrictEqual(result.puppeteer, {
      landscape: true,
      printBackground: true,
    });
    assert.strictEqual(yaml.chrome.printBackground, false);
  });
});
