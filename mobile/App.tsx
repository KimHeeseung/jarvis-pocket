import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Image,
  Platform,
  NativeModules,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as Keychain from 'react-native-keychain';
import { createSpeech } from './src/speech';
import BlobUtil from 'react-native-blob-util';
import {
  AudioManager,
  AudioRecorder,
  FileFormat,
  FilePreset,
} from 'react-native-audio-api';
import { Connection, Payload, State, request } from './src/api';
import { defaultConnection, resolveConnection } from './src/defaultConnection';
const service = 'jarvis-pocket-connection';
const initial: State = {
  pc: { online: false, lastSeen: null },
  demo: true,
  jobs: [],
  messages: [],
};
const labels = {
  queued: '연결 대기',
  running: '실행 중',
  done: '완료',
  failed: '실패',
};
const newId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random()
    .toString(36)
    .slice(2)}`;
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : '요청에 실패했습니다.';
function Jarvis() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [url, setUrl] = useState(defaultConnection.url);
  const [token, setToken] = useState(defaultConnection.token);
  const [tab, setTab] = useState<'talk' | 'jobs' | 'settings'>('talk');
  const [state, setState] = useState(initial);
  const [serverOnline, setServerOnline] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [voice, setVoice] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState<Payload | null>(null);
  const speech = useRef(createSpeech()).current;
  const recorder = useRef<AudioRecorder | null>(null);
  const audioLock = useRef(false);
  const finishedJobs = useRef<Set<string> | null>(null);
  const requestLock = useRef(false);
  const recordTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  useEffect(() => {
    let active = true;
    const apply = (saved: unknown) => {
      if (!active) {
        return;
      }
      const value = resolveConnection(saved);
      setConnection(value);
      setUrl(value.url);
      setToken(value.token);
    };
    Keychain.getGenericPassword({ service })
      .then(saved => apply(saved ? JSON.parse(saved.password) : null))
      .catch(() => apply(null));
    return () => {
      active = false;
      speech.stop();
    };
  }, [speech]);
  useEffect(() => {
    if (!connection) {
      return;
    }
    let active = true,
      refreshing = false;
    const refresh = async () => {
      if (refreshing || AppState.currentState !== 'active') {
        return;
      }
      refreshing = true;
      try {
        const data = await request<State>(connection, '/state');
        if (active) {
          const finished = data.jobs.filter(
            job => job.status === 'done' || job.status === 'failed',
          );
          if (finishedJobs.current) {
            const fresh = finished.find(
              job => !finishedJobs.current!.has(job.id),
            );
            if (fresh?.result && !audioLock.current) {
              speech.speak(fresh.result).then(failure => {
                if (active && failure) setError(failure);
              });
            }
          }
          finishedJobs.current = new Set(finished.map(job => job.id));
          setState(data);
          setServerOnline(true);
        }
      } catch {
        if (active) {
          setServerOnline(false);
        }
      } finally {
        refreshing = false;
      }
    };
    refresh();
    const timer = setInterval(refresh, 3000);
    const listener = AppState.addEventListener('change', next => {
      if (next === 'active') {
        refresh();
      }
    });
    return () => {
      active = false;
      clearInterval(timer);
      listener.remove();
    };
  }, [connection, speech]);
  const speak = useCallback(
    async (value: string) => {
      const failure = await speech.speak(value);
      if (failure) {
        setError(failure);
      }
    },
    [speech],
  );
  const send = useCallback(
    async (payload: Payload) => {
      if (!connection || requestLock.current) {
        return;
      }
      requestLock.current = true;
      setBusy(true);
      setError('');
      setRetry(null);
      try {
        const result = await request<{ text: string; reply: string }>(
          connection,
          '/message',
          payload,
        );
        setText('');
        setState(old => ({
          ...old,
          messages: [
            ...old.messages,
            { role: 'user', text: result.text, at: Date.now() },
            { role: 'assistant', text: result.reply, at: Date.now() },
          ],
        }));
        await speak(result.reply);
      } catch (e) {
        setError(errorText(e));
        setRetry(payload);
      } finally {
        requestLock.current = false;
        setBusy(false);
      }
    },
    [connection, speak],
  );
  const stopRecording = useCallback(
    async (submit: boolean) => {
      if (!recorder.current || audioLock.current) {
        return;
      }
      audioLock.current = true;
      if (recordTimer.current) {
        clearInterval(recordTimer.current);
        recordTimer.current = null;
      }
      setRecording(false);
      try {
        const result = await recorder.current.stop();
        await AudioManager.setAudioSessionActivity(false);
        if (result.status === 'error') {
          throw new Error(result.message);
        }
        const path = result.paths[0]?.replace(/^file:\/\//, '');
        if (!path) {
          throw new Error('녹음 파일을 찾을 수 없습니다.');
        }
        try {
          if (submit) {
            setBusy(true);
            if (Platform.OS === 'ios') {
              if (!NativeModules.JarvisSpeech) {
                throw new Error(
                  '음성 인식 업데이트를 적용하려면 Xcode에서 앱을 다시 빌드하세요.',
                );
              }
              const recognized: string =
                await NativeModules.JarvisSpeech.transcribe(path);
              await send({ requestId: newId(), text: recognized });
            } else {
              const audioBase64 = await BlobUtil.fs.readFile(path, 'base64');
              await send({
                requestId: newId(),
                audioBase64,
                audioFormat: 'wav',
              });
            }
          }
        } finally {
          await BlobUtil.fs.unlink(path).catch(() => {});
        }
      } catch (e) {
        setError(errorText(e));
      } finally {
        audioLock.current = false;
        setBusy(false);
      }
    },
    [send],
  );
  useEffect(() => {
    const listener = AppState.addEventListener('change', next => {
      if (next !== 'active' && recorder.current?.isRecording()) {
        stopRecording(false);
      }
    });
    return () => listener.remove();
  }, [stopRecording]);
  useEffect(
    () => () => {
      if (recordTimer.current) {
        clearInterval(recordTimer.current);
      }
      if (recorder.current?.isRecording()) {
        recorder.current.stop().catch(() => {});
      }
    },
    [],
  );
  const startRecording = async () => {
    if (audioLock.current || busy || !connection) {
      return;
    }
    audioLock.current = true;
    setError('');
    try {
      await speech.stop();
      const permission = await AudioManager.requestRecordingPermissions();
      if (permission !== 'Granted') {
        throw new Error('휴대폰 설정에서 마이크 권한을 허용해 주세요.');
      }
      AudioManager.setAudioSessionOptions({
        iosCategory: 'playAndRecord',
        iosMode: 'default',
        iosOptions: ['defaultToSpeaker'],
      });
      await AudioManager.setAudioSessionActivity(true);
      if (!recorder.current) {
        recorder.current = new AudioRecorder();
      }
      const output = recorder.current.enableFileOutput({
        format: FileFormat.Wav,
        preset: { ...FilePreset.Low, sampleRate: 16000 },
        channelCount: 1,
      });
      if (output.status === 'error') {
        throw new Error(output.message);
      }
      const result = await recorder.current.start();
      if (result.status === 'error') {
        throw new Error(result.message);
      }
      setRecording(true);
      setSeconds(0);
      const started = Date.now();
      recordTimer.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - started) / 1000);
        setSeconds(elapsed);
        if (elapsed >= 60) {
          stopRecording(true);
        }
      }, 250);
    } catch (e) {
      setError(errorText(e));
      await AudioManager.setAudioSessionActivity(false).catch(() => {});
    } finally {
      audioLock.current = false;
    }
  };
  const connect = async () => {
    setSaving(true);
    setError('');
    try {
      const normalized = url.trim().replace(/\/$/, '');
      if (!/^https?:\/\/[^\s]+$/.test(normalized)) {
        throw new Error(
          'http:// 또는 https://로 시작하는 서버 주소를 입력하세요.',
        );
      }
      const value = { url: normalized, token: token.trim() };
      const result = await request<State>(value, '/state');
      await Keychain.setGenericPassword('connection', JSON.stringify(value), {
        service,
      });
      setConnection(value);
      setState(result);
      setServerOnline(true);
      setRetry(null);
      setTab('talk');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.header}>
          <View style={s.identity}>
            <Image
              source={require('./assets/jarvis-icon.png')}
              style={s.avatar}
              accessibilityLabel="자비스 전용 아이콘"
            />
            <View>
              <Text style={s.brand}>자비스</Text>
              <Text style={s.dim}>나만의 개인 비서</Text>
            </View>
          </View>
          <View style={s.badge}>
            <View style={[s.dot, serverOnline && s.online]} />
            <Text style={s.dim}>{serverOnline ? '연결됨' : '서버 미연결'}</Text>
          </View>
        </View>
        {error ? (
          <View style={s.error}>
            <Text style={s.errorText}>{error}</Text>
            {retry ? (
              <Pressable
                onPress={() => send(retry)}
                disabled={busy || recording}
              >
                <Text style={s.accent}>같은 요청 재시도</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => setError('')}>
              <Text style={s.dim}>닫기</Text>
            </Pressable>
          </View>
        ) : null}
        {tab === 'talk' ? (
          <>
            <ScrollView
              ref={scroll}
              style={s.flex}
              contentContainerStyle={s.content}
              onContentSizeChange={() =>
                scroll.current?.scrollToEnd({ animated: true })
              }
              keyboardShouldPersistTaps="handled"
            >
              <Text style={s.eyebrow}>나만의 개인 비서</Text>
              <Text style={s.title}>무엇을 도와드릴까요?</Text>
              <Text style={s.subtitle}>
                {state.demo
                  ? '데모 모드 · 텍스트로 PC 연결을 먼저 확인하세요.'
                  : '편하게 말해 주세요. 제가 요청을 전달할게요.'}
              </Text>
              <View style={s.pc}>
                <Text style={s.pcIcon}>▣</Text>
                <View style={s.flex}>
                  <Text style={s.pcTitle}>내 PC</Text>
                  <Text style={s.dim}>
                    {!serverOnline
                      ? '서버 연결 후 상태 확인'
                      : state.pc.online
                      ? '작업을 받을 준비가 됐어요'
                      : '연결되면 대기 중인 작업을 실행해요'}
                  </Text>
                </View>
                <View
                  style={[s.dot, serverOnline && state.pc.online && s.online]}
                />
              </View>
              {!state.messages.length ? (
                <View style={s.suggestions}>
                  {[
                    'PC 상태 알려 줘',
                    '테스트 파일 만들어 줘',
                    '파일 목록 보여 줘',
                  ].map(value => (
                    <Pressable
                      key={value}
                      style={s.chip}
                      disabled={!connection || busy || recording}
                      onPress={() => send({ requestId: newId(), text: value })}
                    >
                      <Text style={s.message}>{value} ↗</Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                state.messages.map((m, index) => (
                  <View
                    key={`${m.at}-${index}`}
                    style={[
                      s.bubble,
                      m.role === 'user' ? s.userBubble : s.assistantBubble,
                    ]}
                  >
                    <Text style={s.messageLabel}>
                      {m.role === 'user' ? '나' : '자비스'}
                    </Text>
                    <Text selectable style={s.message}>
                      {m.text}
                    </Text>
                  </View>
                ))
              )}
              {busy ? (
                <View style={s.thinking}>
                  <ActivityIndicator color="#253B59" />
                  <Text style={s.dim}>요청을 처리하고 있어요…</Text>
                </View>
              ) : null}
            </ScrollView>
            <View style={s.composer}>
              <View style={s.voiceRow}>
                <Text style={s.dim}>
                  {recording
                    ? `듣고 있어요 · ${seconds} / 60초`
                    : '음성으로 답변 듣기'}
                </Text>
                {recording ? (
                  <Pressable onPress={() => stopRecording(false)}>
                    <Text style={s.accent}>녹음 취소</Text>
                  </Pressable>
                ) : (
                  <Switch
                    value={voice}
                    onValueChange={value => {
                      speech.setEnabled(value);
                      setVoice(value);
                    }}
                    trackColor={{ true: '#253B59', false: '#D9E1E5' }}
                    thumbColor="#FFFFFF"
                  />
                )}
              </View>
              <View style={s.inputRow}>
                <TextInput
                  style={s.input}
                  value={text}
                  onChangeText={setText}
                  placeholder="메시지를 입력하세요"
                  placeholderTextColor="#667985"
                  multiline
                  maxLength={10000}
                  editable={!busy && !recording}
                />
                <Pressable
                  accessibilityLabel="메시지 보내기"
                  disabled={!connection || busy || recording || !text.trim()}
                  style={[
                    s.send,
                    (!connection || busy || recording || !text.trim()) &&
                      s.disabled,
                  ]}
                  onPress={() => send({ requestId: newId(), text })}
                >
                  <Text style={s.sendText}>↑</Text>
                </Pressable>
              </View>
              <Pressable
                style={[
                  s.button,
                  recording && s.recordButton,
                  (!connection || busy || state.demo) && s.disabled,
                ]}
                disabled={!connection || busy || state.demo}
                onPress={() =>
                  recording ? stopRecording(true) : startRecording()
                }
              >
                <Text style={s.buttonText}>
                  {recording ? '■  말하기 끝 · 보내기' : '●  눌러서 말하기'}
                </Text>
              </Pressable>
            </View>
          </>
        ) : tab === 'jobs' ? (
          <ScrollView contentContainerStyle={s.content}>
            <Text style={s.title}>작업 기록</Text>
            <Text style={s.subtitle}>PC에서 실행한 결과를 확인하세요.</Text>
            {!state.jobs.length ? (
              <View style={s.empty}>
                <Text style={s.pcIcon}>☷</Text>
                <Text style={s.subtitle}>아직 요청한 작업이 없어요.</Text>
              </View>
            ) : (
              state.jobs.map(job => (
                <View style={s.job} key={job.id}>
                  <View style={s.jobTop}>
                    <Text style={s.pcTitle}>
                      {job.action.type === 'create_file'
                        ? '파일 생성'
                        : job.action.type === 'codex_task'
                        ? 'Mac Codex 작업'
                        : '파일 목록'}
                    </Text>
                    <Text
                      style={job.status === 'failed' ? s.errorText : s.accent}
                    >
                      {labels[job.status]}
                    </Text>
                  </View>
                  <Text style={s.jobName}>
                    {job.action.filename || '지정 작업 폴더'}
                  </Text>
                  <Text style={s.dim}>
                    {new Date(job.createdAt).toLocaleString('ko-KR')}
                  </Text>
                  <Text selectable style={s.result}>
                    {job.result ||
                      (job.status === 'queued'
                        ? 'PC 프로그램이 연결되면 자동으로 실행합니다.'
                        : 'PC에서 처리 중입니다.')}
                  </Text>
                </View>
              ))
            )}
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={s.content}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={s.title}>연결 설정</Text>
            <Text style={s.subtitle}>내 서버에 연결해 비서를 시작하세요.</Text>
            <Text style={s.fieldLabel}>서버 주소</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={s.field}
              value={url}
              onChangeText={setUrl}
              placeholder="https://jarvis.example.com"
              placeholderTextColor="#667985"
            />
            <Text style={s.fieldLabel}>앱 연결 토큰</Text>
            <TextInput
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              style={s.field}
              value={token}
              onChangeText={setToken}
              placeholder="서버 .env의 APP_TOKEN"
              placeholderTextColor="#667985"
            />
            <Text style={s.subtitle}>
              OpenAI API 키는 서버에서만 설정합니다. 이 화면에는 앱 연결 토큰을
              입력하세요.
            </Text>
            <Pressable
              disabled={saving || busy || recording}
              style={[s.button, (saving || busy || recording) && s.disabled]}
              testID="connect-button"
              onPress={connect}
            >
              <Text style={s.buttonText}>
                {saving ? '연결 확인 중…' : '연결하고 시작하기'}
              </Text>
            </Pressable>
            <View style={s.job}>
              <Text style={s.pcTitle}>PC가 꺼져 있다면?</Text>
              <Text style={s.subtitle}>
                서버가 켜져 있으면 요청을 보관합니다. PC와 서버를 같은
                컴퓨터에서 실행하면 컴퓨터가 꺼진 동안 앱도 서버에 연결할 수
                없습니다.
              </Text>
            </View>
          </ScrollView>
        )}
        <View style={s.tabs}>
          {(
            [
              ['talk', '대화'],
              ['jobs', '작업'],
              ['settings', '설정'],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === value }}
              key={value}
              style={s.tab}
              onPress={() => setTab(value)}
            >
              <Text style={tab === value ? s.accent : s.dim}>{label}</Text>
              <View style={[s.indicator, tab === value && s.online]} />
            </Pressable>
          ))}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <Jarvis />
    </SafeAreaProvider>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  flex: { flex: 1 },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderColor: '#E6ECEF',
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  avatar: { width: 48, height: 48, borderRadius: 16 },
  brand: {
    color: '#17263C',
    fontSize: 23,
    fontWeight: '800',
    letterSpacing: 0,
    marginBottom: 7,
  },
  accent: { color: '#253B59', fontSize: 13, fontWeight: '600' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#F3F6FA',
    padding: 9,
    borderRadius: 20,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#87959D' },
  online: { backgroundColor: '#253B59' },
  content: { padding: 24, paddingBottom: 30 },
  eyebrow: {
    fontSize: 10,
    color: '#253B59',
    letterSpacing: 2,
    marginBottom: 14,
    marginTop: 12,
  },
  title: {
    color: '#17263C',
    fontSize: 27,
    fontWeight: '700',
    letterSpacing: -1,
  },
  subtitle: { color: '#5D6D77', fontSize: 14, lineHeight: 23, marginTop: 10 },
  pc: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: '#E5EAF0',
    backgroundColor: '#FFFFFF',
    padding: 17,
    borderRadius: 17,
    marginTop: 25,
  },
  pcIcon: { color: '#253B59', fontSize: 30 },
  pcTitle: {
    color: '#24344A',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 5,
  },
  dim: { color: '#5D6D77', fontSize: 12, lineHeight: 18 },
  suggestions: { gap: 10, marginTop: 22 },
  chip: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E9ED',
    padding: 16,
  },
  bubble: { padding: 16, borderRadius: 17, marginTop: 16, maxWidth: '94%' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#EAF1FA' },
  assistantBubble: { alignSelf: 'flex-start', backgroundColor: '#F6F7F9' },
  messageLabel: {
    fontSize: 10,
    color: '#253B59',
    marginBottom: 7,
    letterSpacing: 1,
  },
  message: { color: '#24344A', fontSize: 15, lineHeight: 24 },
  thinking: { flexDirection: 'row', gap: 10, paddingTop: 20 },
  composer: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderColor: '#E6ECEF',
  },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: {
    flex: 1,
    color: '#24344A',
    padding: 14,
    borderRadius: 13,
    backgroundColor: '#F2F5F7',
    maxHeight: 100,
    minHeight: 48,
  },
  send: {
    backgroundColor: '#253B59',
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: { color: '#FFFFFF', fontSize: 28 },
  disabled: { opacity: 0.4 },
  button: {
    backgroundColor: '#253B59',
    padding: 17,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  recordButton: { backgroundColor: '#B74236' },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  tabs: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderColor: '#E6ECEF',
    paddingTop: 16,
    paddingBottom: 7,
  },
  tab: { flex: 1, alignItems: 'center', gap: 9 },
  indicator: { width: 20, height: 3, borderRadius: 3 },
  fieldLabel: {
    color: '#465C68',
    marginTop: 28,
    marginBottom: 10,
    fontSize: 13,
  },
  field: {
    backgroundColor: '#F7F9FA',
    borderWidth: 1,
    borderColor: '#DEE7EB',
    borderRadius: 12,
    padding: 15,
    color: '#24344A',
    fontSize: 14,
  },
  job: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DEE7EB',
    padding: 18,
    backgroundColor: '#F7F9FA',
    marginTop: 24,
  },
  jobTop: { flexDirection: 'row', justifyContent: 'space-between' },
  jobName: { color: '#24344A', fontSize: 16, marginVertical: 10 },
  result: { color: '#465C68', fontSize: 13, lineHeight: 21, marginTop: 15 },
  empty: { alignItems: 'center', paddingVertical: 60 },
  error: {
    backgroundColor: '#FFF1ED',
    padding: 14,
    gap: 8,
    marginHorizontal: 20,
    marginTop: 10,
    borderRadius: 12,
  },
  errorText: { color: '#A13828', lineHeight: 21, fontSize: 13 },
});
