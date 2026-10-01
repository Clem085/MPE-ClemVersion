const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourceRoot = path.join(root, 'vendor', 'crossnote');

function replaceOnce(source, search, replacement, file) {
  const first = source.indexOf(search);
  if (first < 0 || source.indexOf(search, first + search.length) >= 0) {
    throw new Error(`Crossnote appearance overlay anchor changed: ${file}`);
  }
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

function overlayContextMenu(source, file) {
  source = replaceOnce(
    source,
    "        case 'select-preview-theme-atom-dark':",
    `        case 'select-preview-appearance-system':
        case 'select-preview-appearance-light':
        case 'select-preview-appearance-dark': {
          postMessage('setPreviewAppearance', [
            sourceUri.current,
            id.replace('select-preview-appearance-', ''),
          ]);
          break;
        }
        case 'select-preview-theme-atom-dark':`,
    file,
  );
  source = replaceOnce(
    source,
    `          <Item id="reset-zoom" onClick={handleItemClick}>
            <span className="inline-flex flex-row items-center">
              <Icon path={mdiMagnify} size={0.8} className="mr-2"></Icon>
              {t('contextMenu.resetZoom')}
            </span>
          </Item>
        </Submenu>
        <Separator></Separator>
        <Submenu
          label={`,
    `          <Item id="reset-zoom" onClick={handleItemClick}>
            <span className="inline-flex flex-row items-center">
              <Icon path={mdiMagnify} size={0.8} className="mr-2"></Icon>
              {t('contextMenu.resetZoom')}
            </span>
          </Item>
        </Submenu>
        <Separator></Separator>
        {isVSCode && (<Submenu
          label={
            <span className="inline-flex flex-row items-center">
              <Icon path={mdiPaletteOutline} size={0.8} className="mr-2"></Icon>
              {t('contextMenu.previewAppearance')}
            </span>
          }
        >
          {(['system', 'light', 'dark'] as const).map((appearance) => {
            const selected = (config as typeof config & { previewAppearance?: string })
              .previewAppearance === appearance;
            const label = appearance === 'system'
              ? t('contextMenu.followSystem')
              : t('contextMenu.' + appearance);
            return (
              <Item
                key={appearance}
                id={'select-preview-appearance-' + appearance}
                onClick={handleItemClick}
                aria-checked={selected}
                role="menuitemradio"
              >
                <span className="inline-flex flex-row items-center">
                  <span className="mr-2 inline-block w-3" aria-hidden="true">
                    {selected ? '✓' : ''}
                  </span>
                  {label}
                </span>
              </Item>
            );
          })}
        </Submenu>)}
        <Submenu
          label={`,
    file,
  );
  return source;
}

function overlayPreview(source, file) {
  source = replaceOnce(
    source,
    "  const mermaidCache = useRef<Record<string, string>>({});",
    '  const mermaidCache = useRef<Record<string, string>>({});',
    file,
  );
  source = replaceOnce(
    source,
    `    ) as WebviewConfig;
  }, []);
  // Localize the webview UI`,
    `    ) as WebviewConfig;
  }, []);
  const appearance =
    (config as typeof config & { effectivePreviewAppearance?: 'light' | 'dark' })
      .effectivePreviewAppearance ?? 'light';
  useEffect(() => {
    document.documentElement.dataset.previewAppearance = appearance;
    document.body.dataset.previewAppearance = appearance;
  }, [appearance]);
  // Localize the webview UI`,
    file,
  );
  source = replaceOnce(
    source,
    "    const mermaid = window['mermaid']; // window.mermaid doesn't work, has to be written as window['mermaid']",
    `    const mermaid = window['mermaid']; // window.mermaid doesn't work, has to be written as window['mermaid']
    const configured = (config.mermaidConfig ?? {}) as Record<string, unknown>;
    mermaid.initialize({
      ...configured,
      startOnLoad: false,
      theme: config.mermaidTheme ?? configured.theme ?? 'base',
    });`,
    file,
  );
  source = source.replaceAll(
    "if (code in mermaidCache.current)",
    "if (appearance + '\\n' + code in mermaidCache.current)",
  );
  source = source.replaceAll(
    'mermaidCache.current[code]',
    "mermaidCache.current[appearance + '\\n' + code]",
  );
  source = replaceOnce(
    source,
    '          newCache[code] = svg;',
    "          newCache[appearance + '\\n' + code] = svg;",
    file,
  );
  source = replaceOnce(source, '  }, []);\n\n  const runCodeChunk', '  }, [appearance, config.mermaidConfig]);\n\n  const runCodeChunk', file);
  source = replaceOnce(
    source,
    "          previewElement.current.setAttribute(\n            'class',",
    `          previewElement.current.dataset.previewAppearance = appearance;
          document.documentElement.dataset.previewAppearance = appearance;
          previewElement.current.setAttribute(
            'class',`,
    file,
  );
  source = replaceOnce(
    source,
    '      enablePreviewZenMode,\n    ],',
    '      enablePreviewZenMode,\n      appearance,\n    ],',
    file,
  );
  source = replaceOnce(
    source,
    `    if (!isPresentationMode) {
      const isDarkColorScheme = window.matchMedia(
        '(prefers-color-scheme: dark)',
      ).matches;

      postMessage('webviewFinishLoading', [
        {
          uri: sourceUri.current,
          systemColorScheme: isDarkColorScheme ? 'dark' : 'light',
        },
      ]);`,
    `    if (!isPresentationMode) {
      postMessage('webviewFinishLoading', [{ uri: sourceUri.current }]);`,
    file,
  );
  return source;
}

async function loadAppearanceOverlay(file) {
  let source = await fs.readFile(file, 'utf8');
  const relative = path.relative(sourceRoot, file).split(path.sep).join('/');
  if (relative === 'src/webview/components/ContextMenu.tsx') {
    source = overlayContextMenu(source, relative);
  } else if (relative === 'src/webview/containers/preview.ts') {
    source = overlayPreview(source, relative);
  } else if (relative.startsWith('src/webview/locales/') && relative.endsWith('.json')) {
    const locale = path.basename(relative, '.json');
    const translations = {
      en: ['Preview Appearance', 'Follow System'],
      az: ['Önizləmə görünüşü', 'Sistemi izlə'],
      es: ['Apariencia de la vista previa', 'Seguir el sistema'],
      fr: ["Apparence de l’aperçu", 'Suivre le système'],
      ja: ['プレビューの外観', 'システムに従う'],
      ko: ['미리 보기 모양', '시스템 설정 따르기'],
      nl: ['Voorbeeldweergave', 'Systeem volgen'],
      'pt-br': ['Aparência da pré-visualização', 'Seguir o sistema'],
      tr: ['Önizleme görünümü', 'Sistemi izle'],
      'zh-cn': ['预览外观', '跟随系统'],
      'zh-tw': ['預覽外觀', '跟隨系統'],
    };
    const [appearance, system] = translations[locale] ?? translations.en;
    const messages = JSON.parse(source);
    messages['contextMenu.previewAppearance'] = appearance;
    messages['contextMenu.followSystem'] = system;
    source = JSON.stringify(messages);
  }
  return source;
}

module.exports = { loadAppearanceOverlay };
