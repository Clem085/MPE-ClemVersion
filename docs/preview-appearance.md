# Preview appearance

Markdown Preview Enhanced has one appearance preference for interactive preview,
Mermaid, and Chrome PDF output:

- **System** (default) follows the active VS Code color theme, including changes
  made while a preview is open.
- **Light** and **Dark** force that appearance until changed again.

Right-click inside a rendered Markdown preview and choose **Preview Appearance**.
The selection is stored in the user's application settings, so workspace files
cannot silently change a personal display preference. In Remote WSL and SSH,
the VS Code client's active theme is authoritative rather than the remote
machine's desktop settings.

The selected appearance chooses matching preview and syntax-highlight themes.
Atom, GitHub, One, and Solarized retain their theme family; an unpaired theme
uses the GitHub light/dark pair. Existing global and workspace `style.less`
rules load afterward and remain available for explicit customization.

Mermaid receives light or dark site defaults. Diagram-local Mermaid front
matter and `%%{init: ...}%%` configuration is applied by Mermaid over those site
defaults. `themeVariables`, `classDef`, `style`, and explicit fill, stroke, and
color declarations therefore keep their author-defined values. The automatic
semantic classes `action`, `decision`, `success`, `stop`, and `error` are
available when an author assigns them; MPE does not infer meaning from labels.

Chrome PDF export creates a separate rendering-engine snapshot using the
preview's effective appearance at the moment export begins. It always enables
print backgrounds and waits at least 500 ms for asynchronous diagram rendering.
Changing appearance during export affects the preview and later exports, not the
PDF already in progress. Preview context-menu controls are React webview UI and
are never included in the export document.

The legacy `previewColorScheme` setting is deprecated. `exportColorScheme` and
`printBackground` remain available to older and non-Chrome export paths, but do
not create an independent appearance for preview-matched Chrome PDF export.

Use `test/fixtures/preview-appearance.md` for manual checks. Verify System under
both light and dark VS Code themes, forced Light and Dark, the two Mermaid
examples, and a PDF export for each effective appearance.
