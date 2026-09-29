import Tts from 'react-native-tts';

export function createSpeech() {
  let generation = 0;
  let enabled = true;
  const stop = async () => {
    generation++;
    try {
      await Tts.stop(false);
    } catch {
      // Stopping must also be safe before the native engine is ready.
    }
  };
  return {
    stop,
    setEnabled(value: boolean) {
      enabled = value;
      if (!value) {
        stop();
      }
    },
    async speak(text: string): Promise<string | null> {
      if (!enabled) {
        return null;
      }
      const current = ++generation;
      try {
        await Tts.getInitStatus();
        await Tts.setDefaultLanguage('ko-KR');
        await Tts.setIgnoreSilentSwitch('ignore');
        if (!enabled || current !== generation) {
          return null;
        }
        await Tts.stop(false);
        if (!enabled || current !== generation) {
          return null;
        }
        await Tts.speak(text.slice(0, 2000));
        return null;
      } catch (error) {
        if (!enabled || current !== generation) {
          return null;
        }
        const detail = error instanceof Error ? error.message : String(error);
        return `답변은 받았지만 음성 재생에 실패했습니다: ${detail}`;
      }
    },
  };
}
