import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppState, TextInput } from 'react-native';
import * as Keychain from 'react-native-keychain';
import App from '../App';
import { request } from '../src/api';
jest.mock('../src/api', () => ({ request: jest.fn() }));
jest.mock('../src/personal-connection.json', () => ({
  url: 'http://192.168.1.10:8787',
  token: 'test-personal-token-12345678901234567890',
}));
jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn().mockResolvedValue(false),
  setGenericPassword: jest.fn().mockResolvedValue(true),
}));
jest.mock('react-native-tts', () => ({
  stop: jest.fn(),
  speak: jest.fn(),
  getInitStatus: jest.fn().mockResolvedValue(true),
  setDefaultLanguage: jest.fn(),
  setIgnoreSilentSwitch: jest.fn(),
}));
jest.mock('react-native-blob-util', () => ({
  fs: { readFile: jest.fn(), unlink: jest.fn() },
}));
jest.mock('react-native-audio-api', () => ({
  AudioManager: {},
  AudioRecorder: jest.fn(),
  FileFormat: {},
  FilePreset: {},
}));
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
const state = {
  pc: { online: false, lastSeen: null },
  demo: true,
  jobs: [],
  messages: [],
};
const api = jest.mocked(request);
let tree: Renderer.ReactTestRenderer;
beforeEach(() => {
  jest.clearAllMocks();
  AppState.currentState = 'active';
  jest.mocked(Keychain.getGenericPassword).mockResolvedValue(false);
});
afterEach(async () => {
  if (tree) {
    await act(async () => tree.unmount());
  }
});
test('자동 연결 실패 후 설정에서 서버 인증 실패를 안내한다', async () => {
  api.mockRejectedValue(new Error('연결 토큰을 확인하세요.'));
  await act(async () => {
    tree = Renderer.create(<App />);
  });
  const settings = tree.root
    .findAll(
      node =>
        node.props.accessibilityRole === 'tab' &&
        typeof node.props.onPress === 'function',
    )
    .filter(
      (node, index, all) =>
        all.findIndex(other => other.props.onPress === node.props.onPress) ===
        index,
    )[2];
  await act(async () => {
    settings.props.onPress();
  });
  expect(JSON.stringify(tree.toJSON())).toContain('연결 설정');
  const fields = tree.root.findAllByType(TextInput);
  await act(async () => {
    fields[1].props.onChangeText('wrong-token');
  });
  const button = tree.root.findAll(
    node =>
      node.props.testID === 'connect-button' &&
      typeof node.props.onPress === 'function',
  )[0];
  await act(async () => {
    await button.props.onPress();
  });
  expect(JSON.stringify(tree.toJSON())).toContain('연결 토큰을 확인하세요.');
});
test('입력 없이 개인 서버에 자동 연결하고 PC 상태를 표시한다', async () => {
  api.mockResolvedValue(state);
  await act(async () => {
    tree = Renderer.create(<App />);
  });
  expect(api).toHaveBeenCalledWith(
    {
      url: 'http://192.168.1.10:8787',
      token: 'test-personal-token-12345678901234567890',
    },
    '/state',
  );
  expect(JSON.stringify(tree.toJSON())).toContain(
    '연결되면 대기 중인 작업을 실행해요',
  );
  const jobs = tree.root
    .findAll(
      node =>
        node.props.accessibilityRole === 'tab' &&
        typeof node.props.onPress === 'function',
    )
    .filter(
      (node, index, all) =>
        all.findIndex(other => other.props.onPress === node.props.onPress) ===
        index,
    )[1];
  await act(async () => {
    jobs.props.onPress();
  });
  expect(JSON.stringify(tree.toJSON())).toContain('아직 요청한 작업이 없어요.');
});

test('기존 localhost 설정은 개인 서버 기본값으로 교체한다', async () => {
  jest
    .mocked(Keychain.getGenericPassword)
    .mockResolvedValue({
      username: 'connection',
      password: JSON.stringify({ url: 'http://localhost:8787', token: '' }),
      service: 'jarvis-pocket-connection',
      storage: 'test',
    } as never);
  api.mockResolvedValue(state);
  await act(async () => {
    tree = Renderer.create(<App />);
  });
  expect(api).toHaveBeenCalledWith(
    expect.objectContaining({ url: 'http://192.168.1.10:8787' }),
    '/state',
  );
});
