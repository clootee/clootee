import { ExternalEnv } from '../helper/ExternalEnv';
import { RootManager } from './RootManager';
import { AntigravityBin } from '../helper/AntigravityBin';
import { EngineAccess } from '../helper/EngineAccess';
import { ProcessSpawner, SpawnHandle } from '../helper/ProcessSpawner';
import { RunAsUser } from '../helper/RunAsUser';
import { RunCallbacks } from '../logic_struct/ClaudeRunnerStruct';
import { Session } from '../models/Types';
import { EngineConfig } from './EngineConfig';
import { AntigravityProfile } from './AntigravityProfile';
import { Settings } from './Settings';
import { OpenLuxPrices } from './OpenLuxPrices';

export class AntigravityRunner {
  static execute(session: Session, cwd: string, prompt: string, cb: RunCallbacks): SpawnHandle {
    const executable = AntigravityBin.find(Settings.effectiveHomeDir());
    if (!executable) throw new Error('Antigravity CLI (agy) was not found');
    const config = EngineConfig.get().antigravity;
    const profile = AntigravityProfile.launch(config);
    const quote = config.provider === 'openlux' ? OpenLuxPrices.quote(config.model) : undefined;
    const apiKey = profile.env.GEMINI_API_KEY;
    const runAs = Settings.runAsUser();
    EngineAccess.ensureDir(cwd, runAs, true);
    const flags = ['--input-format', 'stream-json', '--output-format', 'stream-json', '--disable-slash-commands',
      '--dangerously-skip-permissions', ...profile.args];
    if (session.claudeSessionId) flags.push('--conversation', session.claudeSessionId);
    const { bin, args } = RunAsUser.wrap(executable, flags, runAs);
    const input = JSON.stringify({ event: 'user', message: { content: prompt } }) + '\n';
    let success = false;
    let response = '';
    let error = '';
    let stderr = '';
    let done = false;
    const finish = async (ok: boolean, reason?: string) => {
      if (done) return;
      done = true;
      if (quote) {
        const price = await quote;
        if (price) cb.onEvent?.({ kind: 'system', engine: 'antigravity', name: 'openlux_price', raw: price });
      }
      if (ok && response) cb.onFinal(response);
      cb.onDone(ok, reason?.split(apiKey).join('[redacted]'));
    };
    return ProcessSpawner.run(bin, args, cwd, {
      onLine(line) {
        let event;
        try { event = JSON.parse(line); } catch { return; }
        if (event?.event === 'init' && typeof event.conversation_id === 'string') {
          cb.onSessionId?.(event.conversation_id);
        } else if (event?.event === 'step_update') {
          const step = event.step_update;
          if (step?.step_type === 'agent_response' && typeof step.text_delta === 'string') {
            cb.onOutput(step.text_delta);
            cb.onEvent?.({ kind: 'text', engine: 'antigravity', text: step.text_delta });
          }
          else if (step?.step_type === 'thinking' && typeof step.text_delta === 'string') cb.onThinking(step.text_delta);
          else if (step?.state === 'ACTIVE' && step.step_type && step.step_type !== 'agent_response') cb.onTool(step.step_type, '');
        } else if (event?.event === 'result' && event.result) {
          const result = event.result;
          if (result.conversation_id) cb.onSessionId?.(result.conversation_id);
          success = result.status === 'SUCCESS' && !!result.conversation_id;
          response = String(result.response || '').trimEnd();
          error = String(result.error || '');
          cb.onEvent?.({ kind: 'result', engine: 'antigravity', raw: { usage: result.usage, status: result.status } });
        }
      },
      onStderr(chunk) { stderr = (stderr + chunk).slice(-2000); },
      onExit(code) {
        const ok = success && code === 0;
        finish(ok, ok ? undefined : error || stderr.trim() || 'Antigravity CLI exited without a successful result');
      },
      onError(err) { finish(false, err.message); }
    }, input, false, 0, { ...profile.env, ...ExternalEnv.build(RootManager.ensureExternalApi(session.rootId), session.id) });
  }
}
