const { build } = require('esbuild');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'vendor', 'crossnote');
const crossnoteRoot = path.resolve(
  path.dirname(require.resolve('crossnote')),
  '../..',
);

// Monaco 0.55 includes a private copy of DOMPurify 3.2.7. Package overrides
// cannot replace it. Rebuild the browser entries and redirect that import to
// our pinned, reviewed sanitizer. Do not rewrite minified upstream bundles.
function sanitizerPlugin() {
  return {
    name: 'mpe-browser-sanitizer',
    setup(builder) {
      builder.onResolve({ filter: /dompurify\/dompurify\.js$/ }, () => ({
        path: require.resolve('dompurify'),
      }));
      builder.onResolve({ filter: /^dompurify$/ }, () => ({
        path: require.resolve('dompurify'),
      }));
      // CSS is unchanged: gulp copies the release's compiled styles, including
      // Tailwind utilities, fonts and images. Only replace JavaScript below.
      builder.onLoad({ filter: /\.css$/ }, () => ({
        contents: '',
        loader: 'css',
      }));
      builder.onResolve({ filter: /^[^./]/ }, async (args) => {
        if (
          args.pluginData?.resolved ||
          !args.importer.startsWith(source + path.sep)
        ) {
          return;
        }
        // Resolve upstream imports against the installed, locked Crossnote
        // dependencies. Dependency-internal imports keep esbuild's normal
        // browser-field resolution (not Node's require conditions).
        return builder.resolve(args.path, {
          resolveDir: crossnoteRoot,
          kind: args.kind,
          pluginData: { resolved: true },
        });
      });
    },
  };
}

async function buildCrossnoteBrowser() {
  const pkg = JSON.parse(
    await fs.readFile(path.join(crossnoteRoot, 'package.json'), 'utf8'),
  );
  if (pkg.version !== '0.9.41') {
    throw new Error(
      'Update the vendored browser source for this Crossnote version.',
    );
  }
  if (require('dompurify').version !== '3.4.14') {
    throw new Error('The browser rebuild requires DOMPurify 3.4.14.');
  }
  const result = await build({
    absWorkingDir: source,
    entryPoints: [
      'src/webview/preview.tsx',
      'src/webview/backlinks.tsx',
      'src/webview/graph-view.tsx',
      'src/server-app/server-app.tsx',
    ],
    bundle: true,
    minify: true,
    platform: 'browser',
    outbase: 'src',
    outdir: path.join(root, 'crossnote'),
    write: false,
    metafile: true,
    loader: { '.svg': 'dataurl', '.png': 'dataurl' },
    plugins: [sanitizerPlugin()],
  });
  if (
    Object.keys(result.metafile.inputs).some((file) =>
      /monaco-editor.*\/dompurify\/dompurify\.js$/.test(file),
    )
  ) {
    throw new Error(
      'The vulnerable Monaco sanitizer entered the browser bundle.',
    );
  }
  for (const file of result.outputFiles) {
    if (file.path.endsWith('.js')) {
      await fs.mkdir(path.dirname(file.path), { recursive: true });
      await fs.writeFile(file.path, file.contents);
    }
  }
  await fs.copyFile(
    path.join(source, 'LICENSE.md'),
    path.join(root, 'crossnote', 'LICENSE.md'),
  );
  console.log('Rebuilt Crossnote browser JavaScript with DOMPurify 3.4.14.');
}

module.exports = { buildCrossnoteBrowser, sanitizerPlugin };
