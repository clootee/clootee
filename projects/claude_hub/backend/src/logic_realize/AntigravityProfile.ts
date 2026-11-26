import { execFile } from 'child_process';
import { promisify } from 'util';
import { AntigravityBin } from '../helper/AntigravityBin';
import { HttpJson } from '../helper/HttpJson';
import { RunAsUser } from '../helper/RunAsUser';
import { PROVIDERS, validateGeminiConfig } from '../logic_struct/EngineConfigStruct';
import { EngineProviderConfig, ModelOption } from '../models/Types';
import { Settings } from './Settings';

type Discovery = Pick<EngineProviderConfig, 'provider' | 'apiKey' | 'baseUrl' | 'modelsUrl'>;
const googleBase = PROVIDERS.gemini.geminiBase!;

export class AntigravityProfile {
  private static base(c: Discovery): string {
    const base = c.provider === 'official' ? process.env.GOOGLE_GEMINI_BASE_URL || googleBase
      : c.provider === 'custom' ? c.baseUrl : PROVIDERS[c.provider]?.geminiBase;
    if (!base) throw new Error('Antigravity requires a Gemini-compatible endpoint');
    const url = this.url(base);
    return url.href.replace(/\/+$/, '').replace(/\/v1beta$/, '');
  }

  private static url(value: string): URL {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash)
      throw new Error('Invalid Gemini API URL');
    return url;
  }

  static launch(c: EngineProviderConfig) {
    validateGeminiConfig(c);
    const key = c.provider === 'official' ? process.env.GEMINI_API_KEY : c.apiKey;
    if (!key) throw new Error('Antigravity CLI requires a Gemini API key');
    const env = { GEMINI_API_KEY: key, GOOGLE_GEMINI_BASE_URL: this.base(c) };
    const settings: Record<string, unknown> = { modelProvider: 'gemini' };
    const args: string[] = [];
    if (c.model) {
      const model = c.model.replace(/^models\//, '');
      if (c.provider !== 'official') {
        settings.customModelsConfig = { customModels: { [model]: {
          modelId: model, label: model, modelName: 'gemini-api://' + model,
          apiProvider: 'API_PROVIDER_GOOGLE_GEMINI', modelFeatures: { supportsToolCalls: true }
        } } };
      }
      args.push('--model', model);
    }
    if (c.effort) args.push('--effort', c.effort);
    args.push('--settings', JSON.stringify(settings));
    return { args, env };
  }

  static async models(c: Discovery): Promise<{models: ModelOption[]}> {
    if (c.provider === 'official') {
      const bin = AntigravityBin.find(Settings.effectiveHomeDir());
      if (!bin) throw new Error('Antigravity CLI (agy) was not found');
      const command = RunAsUser.wrap(bin, ['models'], Settings.runAsUser());
      const { stdout } = await promisify(execFile)(command.bin, command.args, { windowsHide: true, timeout: 10000 });
      return { models: stdout.split(/\r?\n/).filter(line => line.includes('\t')).map(line => {
        const [id, label] = line.trim().split('\t');
        return { id, label, source: 'catalog' };
      }) };
    }
    if (!c.apiKey) throw new Error('Gemini API key required');
    validateGeminiConfig({ ...c, model: '' });
    const base = this.base(c);
    const url = this.url(c.provider === 'custom' && c.modelsUrl ? c.modelsUrl : base + '/v1beta/models');
    const models = new Set<string>();
    const tokens = new Set<string>();
    for (;;) {
      const r = await HttpJson.get(url.href, { 'x-goog-api-key': c.apiKey });
      if (r.status < 200 || r.status >= 300) throw new Error('Gemini model list returned HTTP ' + r.status);
      for (const item of r.json?.models || r.json?.data || []) {
        if (item.supportedGenerationMethods && !item.supportedGenerationMethods.includes('generateContent')) continue;
        const name = item.name || item.id;
        if (typeof name === 'string' && name) models.add(name.replace(/^models\//, ''));
      }
      const next = r.json?.nextPageToken;
      if (!next || tokens.has(next)) break;
      tokens.add(next);
      url.searchParams.set('pageToken', next);
    }
    return { models: [...models].map(id => ({ id, source: 'api' })) };
  }
}
