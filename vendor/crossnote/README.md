# Crossnote browser source snapshot

This directory contains the unchanged source inputs needed to rebuild the four
browser JavaScript entries from Crossnote **0.9.41**, tag commit
`3038b2251d1b830bb826918d75dfd620dc3c471d`:

- `src/webview/preview.tsx`
- `src/webview/backlinks.tsx`
- `src/webview/graph-view.tsx`
- `src/server-app/server-app.tsx`

Source: <https://github.com/shd101wyy/crossnote/tree/0.9.41>.
The upstream license is preserved in `LICENSE.md`. `UPSTREAM.json` records the
source archive SHA-256 and each copied file's SHA-256. The snapshot is a build
input, not a complete standalone Crossnote checkout: type-only imports outside
the browser dependency graph are not included. These files are excluded from
the extension's lint/format passes so they remain byte-identical to upstream.

## Why source is included

The npm package ships prebuilt browser bundles containing Monaco's private
DOMPurify 3.2.7 copy. A pnpm override alone cannot fix that embedded code.
`scripts/build-crossnote-browser.cjs` rebuilds these entries, redirects Monaco's
private sanitizer import to the pinned DOMPurify 3.4.14 package, and checks that
the old source did not enter the build. Other imports resolve against the
installed, locked Crossnote dependencies.

Only JavaScript is replaced. CSS is copied byte-for-byte from the matching
release, including its compiled Tailwind rules. The build fails if the installed
Crossnote version differs from this snapshot. `gulp copy-files` waits for all
copies before rebuilding, including during watch builds. Builds are offline
after the frozen pnpm install; no source downloads or install scripts are needed
to reconstruct these assets. This directory is excluded from the VSIX.

## Updating the snapshot

Review the replacement Crossnote release first. Download the exact tag archive
from `https://codeload.github.com/shd101wyy/crossnote/tar.gz/refs/tags/0.9.41`,
verify the archive hash in `UPSTREAM.json`, and compare the copied files against
the archive. To update to a different release, collect the four entry points'
local source dependencies using esbuild's `metafile.inputs`, preserve the new
license and compiler configuration, and regenerate the file hashes. Review any
new dependencies and update the version guard and CSS parity tests together.

See `docs/dependency-security.md` for the mitigation scope and verification.
