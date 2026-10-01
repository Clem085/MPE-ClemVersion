import type { CodeBlockTheme, NotebookConfig, PreviewTheme } from 'crossnote';

export type PreviewAppearancePreference = 'system' | 'light' | 'dark';
export type EffectivePreviewAppearance = 'light' | 'dark';

const MERMAID_PALETTES = {
  light: {
    background: '#ffffff',
    primaryColor: '#e8f1ff',
    primaryBorderColor: '#2563eb',
    primaryTextColor: '#172554',
    lineColor: '#475569',
    textColor: '#0f172a',
    secondaryColor: '#fff7ed',
    tertiaryColor: '#ecfdf5',
  },
  dark: {
    background: '#0f172a',
    primaryColor: '#172554',
    primaryBorderColor: '#60a5fa',
    primaryTextColor: '#f8fafc',
    lineColor: '#94a3b8',
    textColor: '#f8fafc',
    secondaryColor: '#431407',
    tertiaryColor: '#064e3b',
  },
} as const;

const MERMAID_SEMANTIC_CSS = {
  light:
    '.node.action rect,.node.action polygon{fill:#e8f1ff;stroke:#2563eb;color:#172554}' +
    '.node.action .label,.node.action text{color:#172554;fill:#172554}' +
    '.node.decision rect,.node.decision polygon{fill:#fff7ed;stroke:#c2410c;color:#7c2d12}' +
    '.node.decision .label,.node.decision text{color:#7c2d12;fill:#7c2d12}' +
    '.node.success rect,.node.success polygon{fill:#ecfdf5;stroke:#047857;color:#064e3b}' +
    '.node.success .label,.node.success text{color:#064e3b;fill:#064e3b}' +
    '.node.stop rect,.node.stop polygon,.node.error rect,.node.error polygon{fill:#fef2f2;stroke:#b91c1c;color:#7f1d1d}' +
    '.node.stop .label,.node.stop text,.node.error .label,.node.error text{color:#7f1d1d;fill:#7f1d1d}',
  dark:
    '.node.action rect,.node.action polygon{fill:#172554;stroke:#60a5fa;color:#f8fafc}' +
    '.node.action .label,.node.action text{color:#f8fafc;fill:#f8fafc}' +
    '.node.decision rect,.node.decision polygon{fill:#431407;stroke:#fb923c;color:#fff7ed}' +
    '.node.decision .label,.node.decision text{color:#fff7ed;fill:#fff7ed}' +
    '.node.success rect,.node.success polygon{fill:#064e3b;stroke:#34d399;color:#ecfdf5}' +
    '.node.success .label,.node.success text{color:#ecfdf5;fill:#ecfdf5}' +
    '.node.stop rect,.node.stop polygon,.node.error rect,.node.error polygon{fill:#450a0a;stroke:#f87171;color:#fef2f2}' +
    '.node.stop .label,.node.stop text,.node.error .label,.node.error text{color:#fef2f2;fill:#fef2f2}',
} as const;

export function isPreviewAppearance(
  value: unknown,
): value is PreviewAppearancePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function resolvePreviewAppearance(
  preference: PreviewAppearancePreference = 'system',
  hostAppearance: EffectivePreviewAppearance = 'light',
): EffectivePreviewAppearance {
  return preference === 'system' ? hostAppearance : preference;
}

export function themeForAppearance(
  theme: string,
  appearance: EffectivePreviewAppearance,
  code = false,
): string {
  const family =
    /^(atom|github|one|solarized)(?:-light|-dark)?\.css$/.exec(theme)?.[1] ??
    'github';
  return family === 'github' && code && appearance === 'light'
    ? 'github.css'
    : `${family}-${appearance}.css`;
}

export function appearanceConfig(
  config: Partial<NotebookConfig>,
  preference: PreviewAppearancePreference,
  hostAppearance: EffectivePreviewAppearance,
  forExport = false,
) {
  const effective = resolvePreviewAppearance(preference, hostAppearance);
  const previewTheme = themeForAppearance(
    config.previewTheme ?? '',
    effective,
  ) as PreviewTheme;
  const codeBlockTheme = themeForAppearance(
    config.codeBlockTheme === 'auto.css'
      ? previewTheme
      : (config.codeBlockTheme ?? previewTheme),
    effective,
    true,
  ) as CodeBlockTheme;
  const configuredMermaid = (config.mermaidConfig ?? {}) as Record<
    string,
    unknown
  >;
  const configuredVariables =
    (configuredMermaid.themeVariables as Record<string, unknown> | undefined) ??
    {};
  return {
    ...config,
    previewTheme,
    codeBlockTheme,
    mermaidTheme:
      config.mermaidTheme && config.mermaidTheme !== 'default'
        ? config.mermaidTheme
        : 'base',
    mermaidConfig: {
      ...configuredMermaid,
      themeVariables: {
        ...MERMAID_PALETTES[effective],
        ...configuredVariables,
      },
      themeCSS:
        MERMAID_SEMANTIC_CSS[effective] +
        String(configuredMermaid.themeCSS ?? ''),
    },
    previewAppearance: preference,
    effectivePreviewAppearance: effective,
    ...(forExport
      ? {
          // PDF uses this concrete theme, never the export machine's preference.
          exportColorScheme: 'theme' as const,
          printBackground: true,
          puppeteerWaitForTimeout: Math.max(
            Number(config.puppeteerWaitForTimeout ?? 0),
            500,
          ),
        }
      : {}),
  };
}
