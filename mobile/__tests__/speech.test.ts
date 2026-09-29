import Tts from 'react-native-tts';
import { createSpeech } from '../src/speech';
jest.mock('react-native-tts', () => ({
  stop: jest.fn().mockResolvedValue(true),
  speak: jest.fn().mockResolvedValue('id'),
  getInitStatus: jest.fn().mockResolvedValue(true),
  setDefaultLanguage: jest.fn().mockResolvedValue(true),
  setIgnoreSilentSwitch: jest.fn().mockResolvedValue(true),
}));
beforeEach(() => jest.clearAllMocks());
test('음성을 끌 때 네이티브 stop 실패를 처리한다', async () => {
  jest.mocked(Tts.stop).mockRejectedValueOnce(new Error('native stop'));
  const speech = createSpeech();
  speech.setEnabled(false);
  await Promise.resolve();
  await expect(speech.speak('안녕하세요')).resolves.toBeNull();
  expect(Tts.speak).not.toHaveBeenCalled();
});
test('초기화 도중 음성을 끄면 뒤늦게 재생하지 않는다', async () => {
  let ready!: () => void;
  jest.mocked(Tts.getInitStatus).mockReturnValueOnce(
    new Promise<void>(resolve => {
      ready = resolve;
    }) as never,
  );
  const speech = createSpeech();
  const pending = speech.speak('안녕하세요');
  speech.setEnabled(false);
  ready();
  await pending;
  expect(Tts.speak).not.toHaveBeenCalled();
});
test('speak 비동기 실패는 사용자에게 표시할 메시지로 반환한다', async () => {
  jest
    .mocked(Tts.speak)
    .mockReturnValueOnce(Promise.reject(new Error('native speak')) as never);
  await expect(createSpeech().speak('안녕하세요')).resolves.toContain(
    'native speak',
  );
});
