/* global suite, test, suiteSetup, suiteTeardown, setup */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const { recorder, stubPlugin, setConfiguration } = require('./vscode-stub');

suite('preview appearance host integration', function () {
  this.timeout(30000);
  let bundle;
  let output;

  suiteSetup(async () => {
    const result = await esbuild.build({
      stdin: {
        contents:
          "export { initExtensionCommon } from './src/extension-common';",
        resolveDir: path.join(__dirname, '..'),
        loader: 'ts',
      },
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node18',
      write: false,
      logLevel: 'silent',
      plugins: [stubPlugin()],
    });
    output = path.join(__dirname, '.preview-appearance-integration.bundle.cjs');
    fs.writeFileSync(output, result.outputFiles[0].text);
    bundle = require(output);
  });

  suiteTeardown(() => {
    if (output && fs.existsSync(output)) fs.unlinkSync(output);
  });

  setup(async () => {
    recorder.reset();
    setConfiguration({
      previewAppearance: 'system',
      markdownFileExtensions: ['.md'],
    });
    await bundle.initExtensionCommon({
      subscriptions: [],
      globalState: {
        get: (_key, fallback) => fallback,
        update: async () => {},
      },
      extensionUri: { scheme: 'file', authority: '', path: '/extension' },
    });
  });

  test('persists menu choices globally and rejects malformed values', async () => {
    const command = recorder.commands.get('_crossnote.setPreviewAppearance');
    assert(command);
    await command('file:///note.md', 'dark');
    assert.deepStrictEqual(recorder.configurationUpdates.at(-1), {
      section: 'previewAppearance',
      value: 'dark',
      target: 1,
    });
    const count = recorder.configurationUpdates.length;
    await command('file:///note.md', '<script>');
    assert.strictEqual(recorder.configurationUpdates.length, count);
  });

  test('subscribes to active VS Code appearance changes', () => {
    assert.strictEqual(recorder.colorThemeHandlers.length, 1);
  });
});
