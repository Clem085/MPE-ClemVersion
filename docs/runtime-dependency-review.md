# Packaged extension dependency review — 2026-09-29

This follow-up supersedes the remaining-scope assessment in
[the initial security review](dependency-security.md). It covers Crossnote
0.9.41 on Node 18.17.1, pnpm 10.28.0, and the actual generated VSIX. It is not a
certification that all Markdown inputs or third-party code are safe.

## Result

The fresh baseline was **32 findings (17 high, 13 moderate, 2 low)**, rather than
31: the registry now also reports GHSA-253c-mchw-3w2r for the inactive legacy
Markdown parser. After remediation: **26 (16 high, 8 moderate, 2 low)**.

- **17 findings are development-only**: 10 high, 5 moderate, 2 low.
- **9 findings remain in production dependency metadata**: 6 high, 3 moderate.
  Five concern a parser/linkifier absent from the generated bundles; two concern
  ZIP extraction removed from the bundles; two concern Sharp native decoders,
  for which the existing blocking mitigation is retained.
- No unmitigated HIGH from the reported audit was demonstrated reachable in the
  inspected shipped extension. This conclusion is specific to the inspected
  artifacts and APIs; it is not a claim of zero runtime vulnerabilities.

## Changes and compatibility evidence

| Dependency          | Before → after                   | Advisories addressed                                                                                                                                                   | Compatibility and runtime effect                                                                                                                                                                                                                                                                                                                                                        |
| ------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| lodash-es           | 4.17.23 → 4.18.1                 | [template imports injection](https://github.com/advisories/GHSA-r5fr-rjxr-66jc), [prototype traversal](https://github.com/advisories/GHSA-f23m-r3pf-42rh)              | Same major and exported API; benign templates, malicious imports rejection, prototype protection, and a real Chevrotain lexer/parser pass. An exact-version override is necessary because Chevrotain and its helper packages pin 4.17.23. It applies only to that version, not arbitrary future Lodash versions. Does **not** rewrite the separately prebuilt Mermaid asset; see below. |
| ip-address          | 10.5.0 → 10.5.1                  | [IPv6 link-local classification](https://github.com/advisories/GHSA-rpw4-54j3-4h4q), [NAT64 private classification](https://github.com/advisories/GHSA-2vr4-cq9g-pvrc) | Patch within SOCKS' existing range; Node >=12. Address4 conversion and Address6 boundary/classification tests pass through the actual SOCKS dependency. Corrects classifications; bundled version changes. No override.                                                                                                                                                                 |
| qs                  | 6.15.3 → 6.16.0                  | [array-limit bypass](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx), [isBuffer denial of service](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g)               | Same major within urllib's range; Node 18 compatible. Representative nested request serialization and constructor/isBuffer regression pass. Bundled version changes; no override.                                                                                                                                                                                                       |
| @puppeteer/browsers | 2.13.2 → 2.13.2 plus local patch | extract-zip [symlink traversal](https://github.com/advisories/GHSA-jmr9-qjv8-65gv), [archive traversal](https://github.com/advisories/GHSA-7pqw-9j4j-h8q3)             | Both CJS and ESM ZIP installation paths fail closed before importing extract-zip. This intentionally disables browser ZIP installation, which MPE does not expose. Installed-browser launching retains its API; real Crossnote Chrome PDF export passes. extract-zip stays installed and audited but is absent from all shipped JS build graphs.                                        |

`qs` is **not dev-only**. The audit's displayed development path missed the
production path `crossnote → qiniu → urllib → qs`. urllib uses its serializer
for requests. This review found no normal-preview path into the affected query
parser, but upgraded the shipped dependency nonetheless.

No Crossnote API change is needed. Registry queries found **0.9.41 remains the
latest Crossnote release**. Crossnote itself stays pinned, as do Mermaid 12.0.0,
Puppeteer-core 24.43.1, Chevrotain 11.1.2 and cheerio 1.0.0. Chevrotain 11.2.0
still pins the affected Lodash; its latest major requires Node 22. Latest
Puppeteer/browser tooling also requires Node 22.12. Those broad upgrades would
break this extension's supported Node 18 host. extract-zip's latest published
version remains 2.0.1, with no fixed release for the reported advisories.

## Actual shipped code and reachability

| Surface                 | Evidence and resulting assessment                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Normal Markdown preview | Bundled host parser is markdown-it 14.3.1 with linkify-it 5.0.2. The html5-embed plugin uses the host parser and does not import its own markdown-it 8.4.2 / linkify-it 2.2.0. Their five findings remain installed but those versions contribute no bundled code. Do not force a legacy parser across major versions just to change audit output.                                               |
| Mermaid                 | The copied release asset contains subsets of lodash-es 4.17.23 and 4.18.1. The exact matching upstream source map contains none of `template.js`, `unset.js`, `omit.js`, `_baseUnset.js` or `_parent.js`, the affected entry points/helpers. Thus the installed Lodash fix is not falsely presented as a rebuild of this asset. Actual flowchart, sequence and class rendering passes in Chrome. |
| Images                  | Normal image display uses the webview browser. Sharp conversion is a separate host path. Existing Sharp 0.34.5 blocks GIF, TIFF, native VIPS and HEIF/AVIF loaders before exporting its constructor. Both reported HIGH native-library advisories remain version-level findings. Valid affected images are rejected; SVG/PNG/JPEG/WebP tests pass in the workspace.                              |
| PDF export              | Crossnote launches a configured/discovered installed Chrome through Puppeteer-core, rather than downloading or extracting a browser. A real Markdown-to-PDF export passes after the extraction patch. IP/qs fixed versions contribute to host bundles; the vulnerable ZIP extractor no longer does.                                                                                              |
| Untrusted Markdown      | The reviewed legacy parser/linkifier and ZIP-extractor paths are absent from packaged JS. Browser sanitization regression tests and real preview host-update tests pass. Sharp's affected loaders are blocked if its runtime is available. This does not establish safety for every code-chunk setting, remote resource, external tool or Chromium version.                                      |

The Mermaid asset SHA-256 is
`28fca7ae6ebc7ed7bb63bde63136a74bfef14f296a57e403657eeb8b32836073`, identical to
Mermaid 12.0.0's published `dist/mermaid.min.js`. The corresponding published
source map was used for function-level inspection. The prebuilt asset's
DOMPurify 3.4.12 remains a separate limitation recorded in the initial review;
it is not changed by this dependency pass.

Sharp 0.35.4 fixes the reported native issues but requires Node >=20.9. Keep the
existing mitigation rather than raise the VS Code floor. See the
[libvips](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) and
[libheif](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) advisories.

**Existing packaging limitation:** both baseline and final VSIX contain Sharp's
JavaScript wrapper but no `.node`, `.so`, `.dll` or `.dylib` binaries and no
node_modules. A standalone installation therefore lacks the native Sharp
runtime; workspace conversion tests do not prove packaged conversion works.
Fixing native packaging across supported platforms is separate work. Do not
remove decoder protections when addressing it. Ordinary browser images and
Chrome PDF export do not require Sharp conversion.

## Remaining audit findings

| Classification                                  | Package versions                                                                      | Findings            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------- |
| Development only                                | minimatch 3.0.4, braces 2.3.2, js-yaml 3.13.1, fast-uri 3.1.6                         | 10 high, 2 moderate |
| Development only                                | micromatch 3.1.10, decode-uri-component 0.2.2, morgan 1.12.0, debug 3.2.6, diff 3.5.0 | 3 moderate, 2 low   |
| Production metadata; absent from bundle         | markdown-it 8.4.2, linkify-it 2.2.0                                                   | 3 moderate, 2 high  |
| Production metadata; extraction removed         | extract-zip 2.0.1                                                                     | 2 high              |
| Production wrapper; decoder mitigation retained | sharp 0.34.5                                                                          | 2 high              |

Mocha/Gulp/tooling remediation is deliberately deferred. Bundled debug is
4.4.3, not the development-only vulnerable 3.2.6. A dependency's label in
package.json, or exclusion of node_modules alone, is insufficient evidence:
bundled JS was checked too.

## Verification and artifact inspection

All required commands were run on Node 18.17.1 / pnpm 10.28.0:

- `pnpm install --frozen-lockfile`: passed, including persisted patches.
- `pnpm audit`: completed with the 26 findings above (expected nonzero exit).
- `pnpm build`: passed.
- `pnpm test`: 126 passing.
- `pnpm check:all`: passed, retaining the baseline 46 ESLint warnings.
- `pnpm test:security:browser`: 4 passing, including preview, sanitizers,
  Mermaid and real Chrome PDF export.

Packaging used isolated vsce 3.9.2 on Node 20.20.2, without adding it to the
project, with `package --no-dependencies`. Its prepublish install/build still
ran on the project's Node 18. Both VSIX archives were inspected. There were
no node_modules, tests, vendored source, patches or build scripts in the final
archive.

For this review, esbuild was instrumented to emit metafiles for all seven JS
outputs. Only inputs with positive `bytesInOutput` count as bundled. Each
output was compared byte-for-byte to its archived VSIX entry. All seven match.
The vulnerable legacy parser, linkifier, ZIP extractor and development-only
versions listed above are absent from those contributions. Static dependency
assets were considered separately, including the source-mapped Mermaid asset.

The local artifact is `/tmp/mpe-vsix-review/mpe-after.vsix`; build, audit,
packaging logs and metafiles are alongside it. These scratch artifacts are not
committed. Checks were performed on Linux, not Windows or Remote WSL. This is
not a full Extension Development Host acceptance run. The pre-existing standalone
`tsc --noEmit` module-resolution issue described in the initial review remains;
`check:all` runs ESLint and Prettier, not TypeScript.

Preview-appearance implementation has not started.
