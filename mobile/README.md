# Jarvis Pocket 모바일 앱

React Native Community CLI 프로젝트입니다. Expo를 사용하지 않습니다.

설치, 서버 연결, API 설정, iOS/Android 실행 안내는 상위 폴더의 [README.md](../README.md)를 참고하세요.

```bash
npm ci
npm start
# 새 터미널:
npm run android
# 또는 iOS pod 설치 후:
npm run ios
```

## Audio API / Worklets 호환 패치

현재 고정 버전 `react-native-audio-api@0.13.3`은 `executeSync()`를 호출하지만
`react-native-worklets@0.12.2`의 대응 C++ API는 `runSync()`입니다.
`scripts/patch-audio-worklets.cjs`가 두 호출을 교체하며 `npm install`/`npm ci`의
postinstall로 자동 적용됩니다. 다른 버전으로 업그레이드할 때는 패치를 재검토하세요.
이미 설치된 프로젝트에는 `npm run postinstall`로 다시 적용할 수 있습니다.
Xcode에서 Product → Clean Build Folder 후 다시 빌드하세요.

같은 postinstall 스크립트는 Xcode 16.x의 SDK에서 인식하지 못하는
`AVAudioSessionCategoryOptionAllowBluetoothHFP`도 처리합니다. iOS 26 이상
SDK에서는 새 이름을, 이전 SDK에서는 동일한 HFP 입력 용도의
`AVAudioSessionCategoryOptionAllowBluetooth`를 선택합니다.
