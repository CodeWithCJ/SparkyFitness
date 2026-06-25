import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { fetch as expoFetch } from 'expo/fetch';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Button from '../components/ui/Button';
import FormInput from '../components/FormInput';
import Icon from '../components/Icon';
import { getActiveServerConfig, proxyHeadersToRecord } from '../services/storage';
import { getAuthHeaders } from '../services/api/authService';
import { normalizeUrl } from '../services/api/apiClient';
import { useActiveAiServiceSetting } from '../hooks';
import { addLog } from '../services/LogService';
import type { RootStackScreenProps } from '../types/navigation';

/**
 * Dev-only "Layer B" probe for the chatbot streaming endpoint (`/api/chat/stream`).
 *
 * It hits the server with `expo/fetch` and reads `response.body` chunk by chunk,
 * timestamping each arrival. The goal is to prove that streaming actually works
 * over the React Native bridge before committing to assistant-ui:
 *   - expo/fetch  -> chunks arrive incrementally (response.body is a real stream)
 *   - global fetch -> response.body is unavailable, so the whole reply is buffered
 *
 * If the expo/fetch run shows multiple chunks spread over time, the streaming
 * endpoint is good and the non-streaming endpoint does not need fixing.
 */

const DEFAULT_PROMPT =
  'Count slowly from 1 to 10. Put each number on its own line.';

const MAX_LOG_LINES = 300;

type ProbeImpl = 'expo' | 'global';

// Minimal shapes shared by expo/fetch's FetchResponse and RN's global Response,
// so we can drive both through one reader loop without pulling in DOM lib types.
type StreamReader = {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  cancel?(reason?: unknown): Promise<void> | void;
};
type ReadableLike = { getReader(): StreamReader };
interface ProbeResponse {
  status: number;
  headers: { get(name: string): string | null };
  body: ReadableLike | null;
  text(): Promise<string>;
}

type Verdict =
  | { kind: 'streaming'; chunks: number; firstMs: number; spreadMs: number; totalMs: number }
  | { kind: 'single'; firstMs: number; totalMs: number }
  | { kind: 'buffered'; bytes: number; totalMs: number }
  | { kind: 'empty'; totalMs: number }
  | { kind: 'error'; message: string };

export default function StreamProbeScreen({
  navigation,
}: RootStackScreenProps<'StreamProbe'>) {
  const insets = useSafeAreaInsets();
  const accentPrimary = useCSSVariable('--color-accent-primary') as string;

  const { data: activeSetting } = useActiveAiServiceSetting({ staleTime: 0 });

  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [serviceConfigId, setServiceConfigId] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [authMode, setAuthMode] = useState<string>('');
  const [running, setRunning] = useState<ProbeImpl | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Prefill the target details from the active server config + AI setting.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const config = await getActiveServerConfig();
      if (cancelled || !config) return;
      setServerUrl(normalizeUrl(config.url));
      setAuthMode(config.authType === 'session' ? 'session token' : 'API key');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Only auto-fill once; don't clobber a value the user is editing.
    if (activeSetting?.id) {
      setServiceConfigId((current) => current || activeSetting.id);
    }
  }, [activeSetting?.id]);

  const push = (line: string) => {
    setLines((prev) => {
      const next = [...prev, line];
      return next.length > MAX_LOG_LINES ? next.slice(next.length - MAX_LOG_LINES) : next;
    });
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  };

  const stop = () => {
    abortRef.current?.abort();
  };

  const runProbe = async (impl: ProbeImpl) => {
    if (running) return;

    const config = await getActiveServerConfig();
    if (!config) {
      push('No active server config. Configure a server in Settings first.');
      return;
    }
    if (!serviceConfigId.trim()) {
      push('No service_config_id. Configure an AI provider in the web app first.');
      return;
    }

    setLines([]);
    setVerdict(null);
    setRunning(impl);

    const controller = new AbortController();
    abortRef.current = controller;

    const baseUrl = normalizeUrl(config.url);
    const url = `${baseUrl}/api/chat/stream`;
    const headers = {
      'Content-Type': 'application/json',
      ...proxyHeadersToRecord(config.proxyHeaders),
      ...getAuthHeaders(config),
    };
    const body = JSON.stringify({
      messages: [{ role: 'user', parts: [{ type: 'text', text: prompt }] }],
      service_config_id: serviceConfigId.trim(),
    });
    const init = { method: 'POST', headers, body, signal: controller.signal };

    push(`POST ${url}`);
    push(`fetch impl: ${impl === 'expo' ? 'expo/fetch' : 'global fetch (control)'}`);

    const start = Date.now();
    try {
      let res: ProbeResponse;
      if (impl === 'expo') {
        res = (await expoFetch(
          url,
          init as Parameters<typeof expoFetch>[1]
        )) as unknown as ProbeResponse;
      } else {
        res = (await fetch(url, init as RequestInit)) as unknown as ProbeResponse;
      }

      const contentType = res.headers.get('content-type') ?? '(none)';
      push(`status ${res.status} · content-type ${contentType} · +${Date.now() - start}ms`);

      if (!String(res.status).startsWith('2')) {
        const text = await res.text();
        push(`error body: ${text.slice(0, 500)}`);
        finish({ kind: 'error', message: `HTTP ${res.status}` }, impl);
        return;
      }

      let reader: StreamReader | undefined;
      try {
        reader = res.body?.getReader();
      } catch {
        reader = undefined;
      }

      if (!reader) {
        // Global RN fetch lands here: no readable body, so the reply is buffered.
        const text = await res.text();
        push(
          `response.body is not a readable stream — BUFFERED ${text.length} chars at once after +${Date.now() - start}ms`
        );
        finish({ kind: 'buffered', bytes: text.length, totalMs: Date.now() - start }, impl);
        return;
      }

      const decoder = new TextDecoder();
      let chunkIndex = 0;
      let lastT = start;
      let firstMs = 0;
      let lastMs = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value || value.byteLength === 0) continue;
        const now = Date.now();
        const rel = now - start;
        const gap = now - lastT;
        lastT = now;
        if (chunkIndex === 0) firstMs = rel;
        lastMs = rel;
        const text = decoder.decode(value, { stream: true }).replace(/\n/g, '\\n');
        push(`+${rel}ms (Δ${gap}ms) #${chunkIndex} ${value.byteLength}B: ${text.slice(0, 160)}`);
        chunkIndex++;
      }

      const totalMs = Date.now() - start;
      if (chunkIndex === 0) {
        finish({ kind: 'empty', totalMs }, impl);
      } else if (chunkIndex === 1) {
        finish({ kind: 'single', firstMs, totalMs }, impl);
      } else {
        finish(
          { kind: 'streaming', chunks: chunkIndex, firstMs, spreadMs: lastMs - firstMs, totalMs },
          impl
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (controller.signal.aborted) {
        push('aborted');
        finish({ kind: 'error', message: 'aborted' }, impl);
      } else {
        push(`exception: ${message}`);
        finish({ kind: 'error', message }, impl);
      }
    }
  };

  const finish = (result: Verdict, impl: ProbeImpl) => {
    setVerdict(result);
    setRunning(null);
    abortRef.current = null;
    addLog(
      `[StreamProbe] ${impl} -> ${result.kind}`,
      result.kind === 'error' ? 'ERROR' : 'INFO',
      [JSON.stringify(result)]
    );
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View className="flex-row items-center mb-4">
          <Button
            variant="ghost"
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className="py-0 px-0 mr-2"
          >
            <Icon name="chevron-back" size={22} color={accentPrimary} />
          </Button>
          <Text className="text-2xl font-bold text-text-primary">Stream Probe</Text>
        </View>

        <Text className="text-text-muted text-[13px] mb-4">
          Hits /api/chat/stream and reads the response body chunk by chunk. Run with
          expo/fetch (should stream incrementally) and with global fetch (control —
          should buffer the whole reply).
        </Text>

        {/* Target */}
        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <Text className="text-sm font-semibold text-text-primary mb-1">Target</Text>
          <Text className="text-text-muted text-[13px]" numberOfLines={1}>
            {serverUrl || '(no active server)'}/api/chat/stream
          </Text>
          <Text className="text-text-muted text-[13px] mb-3">auth: {authMode || '…'}</Text>

          <Text className="text-sm text-text-primary mb-1">service_config_id</Text>
          <FormInput
            value={serviceConfigId}
            onChangeText={setServiceConfigId}
            placeholder="active AI service config id"
            autoCapitalize="none"
            autoCorrect={false}
            className="px-3 py-2 mb-3"
          />

          <Text className="text-sm text-text-primary mb-1">Prompt</Text>
          <FormInput
            value={prompt}
            onChangeText={setPrompt}
            multiline
            className="px-3 py-2 min-h-20"
          />
        </View>

        {/* Actions */}
        <View className="flex-row gap-2 mb-4">
          <Button
            variant="primary"
            className="flex-1 py-3 rounded-lg"
            onPress={() => runProbe('expo')}
            disabled={running !== null}
          >
            <Text className="text-white text-base font-bold text-center">
              {running === 'expo' ? 'Running…' : 'Run (expo/fetch)'}
            </Text>
          </Button>
          <Button
            variant="secondary"
            className="flex-1 py-3 rounded-lg"
            onPress={() => runProbe('global')}
            disabled={running !== null}
          >
            <Text className="text-text-primary text-base font-bold text-center">
              {running === 'global' ? 'Running…' : 'Run (global)'}
            </Text>
          </Button>
        </View>
        <View className="flex-row gap-2 mb-4">
          <Button
            variant="outline"
            className="flex-1 py-2 rounded-lg"
            onPress={stop}
            disabled={running === null}
          >
            <Text className="text-text-primary text-sm font-semibold text-center">Stop</Text>
          </Button>
          <Button
            variant="outline"
            className="flex-1 py-2 rounded-lg"
            onPress={() => {
              setLines([]);
              setVerdict(null);
            }}
            disabled={running !== null}
          >
            <Text className="text-text-primary text-sm font-semibold text-center">Clear</Text>
          </Button>
        </View>

        {/* Verdict */}
        {verdict && (
          <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
            <Text className="text-sm font-semibold text-text-primary mb-1">Verdict</Text>
            <Text className="text-base text-text-primary">{verdictLabel(verdict)}</Text>
          </View>
        )}

        {/* Raw chunk log */}
        {lines.length > 0 && (
          <View className="bg-surface rounded-xl p-4 shadow-sm">
            <Text className="text-sm font-semibold text-text-primary mb-2">Chunks</Text>
            {lines.map((line, i) => (
              <Text
                key={i}
                className="text-text-secondary text-[11px] mb-1"
                style={{ fontFamily: 'Courier' }}
              >
                {line}
              </Text>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function verdictLabel(v: Verdict): string {
  switch (v.kind) {
    case 'streaming':
      return `✅ STREAMING — ${v.chunks} chunks, first at +${v.firstMs}ms, spread ${v.spreadMs}ms, done ${v.totalMs}ms`;
    case 'single':
      return `⚠️ SINGLE CHUNK — first/only chunk at +${v.firstMs}ms (${v.totalMs}ms). Tiny reply or upstream buffering.`;
    case 'buffered':
      return `❌ BUFFERED — no readable stream, ${v.bytes} chars delivered at once (${v.totalMs}ms). Expected for global fetch.`;
    case 'empty':
      return `⚠️ EMPTY — stream opened but no bytes (${v.totalMs}ms).`;
    case 'error':
      return `❌ ERROR — ${v.message}`;
  }
}
