# Dependency security review and targeted mitigations

Reviewed on 2026-09-29 with Node 18.17.1 and pnpm 10.28.0. No Git commits are
created by this work. This review is not a certification that the dependency
tree is free of vulnerabilities.

## Browser sanitizer

Crossnote 0.9.41's primary preview sanitizer already uses DOMPurify 3.4.14, but
Monaco 0.55.1 embeds its own DOMPurify 3.2.7 source. Both copies were present in
the release preview JavaScript. The lockfile override replaces Monaco's package
dependency; rebuilding the browser JavaScript with a resolver redirect replaces
the separately embedded copy. Neither step substitutes for the other.

The build consumes the upstream source snapshot under `vendor/crossnote` and
the existing locked dependencies. Preview, backlinks, graph and server-app
JavaScript are rebuilt. The original CSS is retained and tested for byte parity.
The build rejects a Crossnote version mismatch or inclusion of Monaco's old
sanitizer source. Runtime tests cover both the actual Monaco wrapper and the
actual preview sanitizer, plus a host update through the rebuilt preview bundle.

The browser regression includes the rawtext-attribute case from
[GHSA-v2wj-7wpq-c8vv](https://github.com/advisories/GHSA-v2wj-7wpq-c8vv), executable
attributes/URLs/scripts, ordinary markup, sandboxed iframes and MathML.
This does not prove that every possible sanitization context is safe.

## Sharp mitigation and compatibility

Keep Sharp 0.34.5 to preserve the extension's Node 18 runtime floor. Sharp
0.35.4, which fixes both reported native dependency advisories, requires Node
20.9 or later. Raising the VS Code floor is outside this change.

`patches/sharp@0.34.5.patch` applies the maintainers' recommended decoder blocks
as soon as Sharp initializes, before it exports its constructor:

- `VipsForeignLoadNsgif` (GIF)
- `VipsForeignLoadTiff` (TIFF)
- `VipsForeignLoadVips` (native VIPS)
- `VipsForeignLoadHeif` (HEIF/AVIF)

References:

- [libvips advisory](https://github.com/advisories/GHSA-f88m-g3jw-g9cj)
- [libheif advisory](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c)
- [Sharp operation blocking API](https://sharp.pixelplumbing.com/api-utility/#block)

The pnpm patch is reapplied by frozen installs; no manual node_modules edit is
required. Blocking parent operations covers their file and buffer variants. The
tests encode benign images first, then verify that decoding is rejected. They
also verify that SVG rasterization and PNG/JPEG/WebP decoding still work.

This deliberately removes affected formats from **Sharp conversion**, not from
normal browser image display. Chrome PDF export still uses Chromium. Audit tools
will continue to flag Sharp's version because a local runtime mitigation does
not upgrade its native libraries. This is a mitigation, not a native-library fix.

## Verification

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm check:all
pnpm test:security:browser
pnpm audit
```

The separate browser suite requires a local Chrome/Chromium executable. Set
`CHROME_PATH` to its absolute path if discovery fails. It uses Crossnote's
existing Puppeteer dependency and does not download a browser or disable its
sandbox. Run it on the extension host's machine in Remote WSL, with a Linux
Chrome/Chromium installation there.

Local results on Node 18.17.1: frozen install and build passed, 122 unit tests
passed, both Chrome integration tests passed, and `check:all` passed with the
same 46 ESLint warnings as the baseline. The browser checks are also included
in the test and release workflows, before packaging. Windows and WSL runs have
not been performed.

`pnpm exec tsc --noEmit` has a pre-existing module-resolution error at
`src/crossnote-serve-cli.ts:13` for `crossnote/cli`. `check:all` does not include
TypeScript. The baseline also has 46 ESLint warnings. Neither is suppressed or
fixed by this security change.

## Remaining scope

The original audit reported 49 findings (17 high, 26 moderate, 6 low), including
19 findings on development-tool paths. After this change, the audit reports
31 findings (17 high, 12 moderate, 2 low); the 18 findings for DOMPurify 3.2.7
are removed. Sharp remains flagged despite its runtime mitigation.
Parser/linkifier findings beneath
`markdown-it-html5-embed` concern a parser that the plugin does not import.
Lodash findings beneath Mermaid's Chevrotain dependency were not tied to an
affected API call. Puppeteer's archive-extraction and IP-classification findings
were not tied to Crossnote's launch-installed-Chrome export path. These are
reachability assessments, not package-wide fixes.

Crossnote's separately prebuilt Mermaid asset contains DOMPurify 3.4.12; it is
not rebuilt by this targeted Monaco change. No exploitation of its sanitizer
configuration was demonstrated. The source snapshot and sanitizer redirect must
be reviewed when upgrading Crossnote or Monaco. Windows and Remote WSL still
need native-platform validation; local tests do not stand in for those runs.
