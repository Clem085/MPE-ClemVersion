import { MarkdownEngine, Notebook, NotebookConfig } from 'crossnote';
import {
  EffectivePreviewAppearance,
  appearanceConfig,
} from './preview-appearance';

type EngineInternals = MarkdownEngine & {
  filePath: string;
  notebook: Notebook & { config: NotebookConfig };
};

export function forcePrintBackground(
  yamlConfig: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...yamlConfig };
  for (const key of ['chrome', 'puppeteer']) {
    const current = result[key];
    result[key] = {
      ...(current && typeof current === 'object' && !Array.isArray(current)
        ? current
        : {}),
      printBackground: true,
    };
  }
  return result;
}

/** Create an export-only engine with an immutable appearance snapshot. */
export function createAppearanceExportEngine(
  engine: MarkdownEngine,
  appearance: EffectivePreviewAppearance,
): MarkdownEngine {
  const source = engine as EngineInternals;
  const notebook = Object.create(source.notebook) as Notebook & {
    config: NotebookConfig;
  };
  notebook.config = Object.freeze(
    appearanceConfig(source.notebook.config, appearance, appearance, true),
  ) as NotebookConfig;
  const exportEngine = new MarkdownEngine({
    notebook,
    filePath: source.filePath,
  });
  const parseMD = exportEngine.parseMD.bind(exportEngine);
  exportEngine.parseMD = async (...args: Parameters<typeof parseMD>) => {
    const result = await parseMD(...args);
    result.yamlConfig = forcePrintBackground(result.yamlConfig);
    return result;
  };
  return exportEngine;
}
