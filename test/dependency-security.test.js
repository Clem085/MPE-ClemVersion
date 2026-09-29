/* global suite, test */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRequire } = require('module');
const { createHash } = require('crypto');
const crossnoteRequire = createRequire(require.resolve('crossnote'));
const root = path.resolve(__dirname, '..');

suite('dependency security mitigations', function () {
  this.timeout(30000);

  test('patched browser ZIP extraction fails closed in both module formats', async () => {
    const puppeteerRequire = createRequire(
      crossnoteRequire.resolve('puppeteer-core'),
    );
    const directory = path.dirname(
      puppeteerRequire.resolve('@puppeteer/browsers'),
    );
    for (const format of ['cjs', 'esm']) {
      const { unpackArchive } = await import(
        require('url').pathToFileURL(
          path.resolve(directory, '..', format, 'fileUtil.js'),
        ).href
      );
      await assert.rejects(
        unpackArchive('/nonexistent/browser.zip', os.tmpdir()),
        /MPE disables browser ZIP extraction/,
      );
    }
    for (const file of [
      'out/native/extension.js',
      'out/native/crossnote-serve.js',
      'out/web/extension.js',
    ]) {
      const js = fs.readFileSync(path.join(root, file), 'utf8');
      assert(!js.includes('node_modules/extract-zip/'), file);
      assert(js.includes('MPE disables browser ZIP extraction'), file);
    }
  });

  test('production qs preserves request serialization and rejects buffer spoofing', () => {
    const qiniuRequire = createRequire(crossnoteRequire.resolve('qiniu'));
    const urllibRequire = createRequire(qiniuRequire.resolve('urllib'));
    const qs = urllibRequire('qs');
    assert.strictEqual(
      qs.stringify({ a: { b: 'x y' }, items: ['one', 'two'] }),
      'a%5Bb%5D=x%20y&items%5B0%5D=one&items%5B1%5D=two',
    );
    assert.doesNotThrow(() =>
      qs.stringify(qs.parse('constructor[isBuffer]=x', { plainObjects: true })),
    );
  });

  test('SOCKS IP parser retains address conversion and fixes IPv6 classifications', () => {
    let dependencyRequire = crossnoteRequire;
    for (const dependency of [
      'puppeteer-core',
      '@puppeteer/browsers',
      'proxy-agent',
      'socks-proxy-agent',
      'socks',
    ]) {
      dependencyRequire = createRequire(dependencyRequire.resolve(dependency));
    }
    const { Address4, Address6 } = dependencyRequire('ip-address');
    assert.strictEqual(new Address4('127.0.0.1').correctForm(), '127.0.0.1');
    assert.strictEqual(new Address6('fe90::1').isLinkLocal(), true);
    assert.strictEqual(new Address6('fec0::1').isLinkLocal(), false);
    assert.strictEqual(new Address6('64:ff9b:1::1').isPrivate(), true);
    assert.strictEqual(new Address6('2001:4860:4860::8888').isPrivate(), false);
  });

  test('Lodash security fixes retain the Chevrotain parser API', async () => {
    const mermaidRequire = createRequire(crossnoteRequire.resolve('mermaid'));
    const chevrotainPath = mermaidRequire.resolve('chevrotain');
    const chevrotainRequire = createRequire(chevrotainPath);
    const lodash = await import(
      require('url').pathToFileURL(chevrotainRequire.resolve('lodash-es')).href
    );
    assert.strictEqual(
      lodash.template('Hello <%= name %>')({ name: 'MPE' }),
      'Hello MPE',
    );
    assert.throws(() =>
      lodash.template('x', { imports: { 'x) { throw 1; } //': 1 } }),
    );
    const marker = '__mpeSecurityMarker';
    Object.prototype[marker] = true;
    try {
      lodash.unset({}, [['__proto__'], marker]);
      assert.strictEqual(Object.prototype[marker], true);
    } finally {
      delete Object.prototype[marker];
    }
    const { createToken, Lexer, CstParser } = await import(
      require('url').pathToFileURL(chevrotainPath).href
    );
    const Word = createToken({ name: 'Word', pattern: /[a-z]+/ });
    class Parser extends CstParser {
      constructor() {
        super([Word]);
        this.RULE('word', () => this.CONSUME(Word));
        this.performSelfAnalysis();
      }
    }
    const parser = new Parser();
    parser.input = new Lexer([Word], {
      positionTracking: 'onlyOffset',
    }).tokenize('markdown').tokens;
    assert.strictEqual(parser.word().children.Word[0].image, 'markdown');
    assert.deepStrictEqual(parser.errors, []);
    parser.input = [];
    parser.word();
    assert.strictEqual(parser.errors.length, 1);
  });

  test('vendored browser inputs match the reviewed upstream snapshot', () => {
    const directory = path.join(root, 'vendor/crossnote');
    const manifest = JSON.parse(
      fs.readFileSync(path.join(directory, 'UPSTREAM.json'), 'utf8'),
    );
    for (const [file, hash] of Object.entries(manifest.files)) {
      assert.strictEqual(
        createHash('sha256')
          .update(fs.readFileSync(path.join(directory, file)))
          .digest('hex'),
        hash,
        file,
      );
    }
  });

  test('shipped browser bundles exclude the private Monaco sanitizer', () => {
    for (const entry of [
      'webview/preview',
      'webview/backlinks',
      'webview/graph-view',
      'server-app/server-app',
    ]) {
      const js = fs.readFileSync(
        path.join(root, 'crossnote', entry + '.js'),
        'utf8',
      );
      assert(!js.includes('DOMPurify 3.2.7'), entry);
      if (entry === 'webview/preview') {
        assert(
          js.includes('DOMPurify 3.4.14'),
          'reviewed sanitizer must be bundled',
        );
      }
    }
  });

  test('browser rebuild preserves the release CSS byte for byte', () => {
    const upstream = path.resolve(
      path.dirname(require.resolve('crossnote')),
      '..',
    );
    for (const entry of ['webview/preview', 'server-app/server-app']) {
      assert.deepStrictEqual(
        fs.readFileSync(path.join(root, 'crossnote', entry + '.css')),
        fs.readFileSync(path.join(upstream, entry + '.css')),
      );
    }
    assert.deepStrictEqual(
      fs.readFileSync(path.join(root, 'crossnote/LICENSE.md')),
      fs.readFileSync(path.join(root, 'vendor/crossnote/LICENSE.md')),
    );
  });

  test('native extension and server bundles contain the decoder mitigation', () => {
    for (const entry of ['extension.js', 'crossnote-serve.js']) {
      const js = fs.readFileSync(path.join(root, 'out/native', entry), 'utf8');
      for (const operation of [
        'VipsForeignLoadNsgif',
        'VipsForeignLoadTiff',
        'VipsForeignLoadVips',
        'VipsForeignLoadHeif',
      ]) {
        assert(js.includes(operation), `${entry}: ${operation}`);
      }
    }
  });

  for (const format of ['gif', 'tiff', 'avif']) {
    test(`Sharp rejects valid ${format} input from buffers and files`, async () => {
      const sharp = crossnoteRequire('sharp');
      // Encoding a small, known image remains allowed. This creates valid
      // inputs so a decoder rejection cannot be confused with corrupt data.
      const input = await sharp({
        create: { width: 2, height: 2, channels: 3, background: '#123456' },
      })
        .toFormat(format)
        .toBuffer();
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpe-sharp-'));
      try {
        const file = path.join(dir, 'image.' + format);
        fs.writeFileSync(file, input);
        for (const value of [input, file]) {
          await assert.rejects(
            sharp(value).png().toBuffer(),
            /unsupported image format|blocked/i,
          );
        }
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  }

  test('Sharp still rasterizes SVG and decodes PNG, JPEG and WebP', async () => {
    const sharp = crossnoteRequire('sharp');
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2">' +
        '<rect width="2" height="2" fill="red"/></svg>',
    );
    for (const format of ['png', 'jpeg', 'webp']) {
      const encoded = await sharp(svg).toFormat(format).toBuffer();
      const { info } = await sharp(encoded)
        .png()
        .toBuffer({ resolveWithObject: true });
      assert.strictEqual(info.width, 2);
      assert.strictEqual(info.height, 2);
      assert.strictEqual(info.format, 'png');
    }
  });

  test('Sharp rejects a valid native VIPS file', async () => {
    const sharp = crossnoteRequire('sharp');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpe-vips-'));
    try {
      const file = path.join(dir, 'image.v');
      await sharp({
        create: { width: 2, height: 2, channels: 3, background: '#123456' },
      }).toFile(file);
      await assert.rejects(
        sharp(file).png().toBuffer(),
        /unsupported image format|blocked/i,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
