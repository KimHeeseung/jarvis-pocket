# Jarvis Pocket — 개인 Mac 비서

React Native Community CLI + Node.js. Expo를 사용하지 않습니다.

## 현재 실행 방식

`iPhone → Node 서버 → Mac의 codex exec → 작업 결과 → iPhone`

- `AI_BACKEND=codex`: Mac에서 ChatGPT 계정으로 로그인한 Codex가 대화, 파일 작성, 코드 수정, 테스트를 수행합니다. 이 대화의 기록·도구 전체가 그대로 복제되는 것은 아닙니다.
- 작업 폴더: `.env`의 `CODEX_WORKSPACE` (이 Mac의 현재 설정: `/Users/gimhuiseung/Documents`). 기존 프로젝트를 수정하려면 해당 프로젝트의 절대 경로로 변경하고 서버를 재시작하세요.
- Codex는 `workspace-write` 샌드박스로 실행됩니다. 추가 승인이 필요한 작업은 자동으로 권한을 늘리지 않으며, 미완료 사유를 앱에 표시합니다. 네트워크가 필요한 패키지 설치 및 외부 폴더 변경은 환경의 권한에 따라 제한될 수 있습니다.
- 화면 클릭·임의 앱 조작은 구현되어 있지 않습니다. Mac의 Codex에 실제 연결된 도구와 권한 범위에서만 실행할 수 있습니다.
- iOS 음성 입력: Apple 한국어 음성 인식. 지원하면 기기에서 처리하고, 그렇지 않으면 Apple 서비스를 사용합니다. OpenAI API 키는 필요하지 않습니다. 권한 허용 및 인터넷/한국어 인식 지원이 필요합니다.
- 음성 출력: iPhone TTS. 켜기/끄기 및 초기화 중 취소 처리. 작업 완료 결과도 대화창에 표시하고 앱이 열린 상태에서 읽습니다.
- 서버와 Mac이 꺼져 있으면 요청할 수 없습니다. 백그라운드 푸시 알림은 없습니다.

## Mac 실행

처음 받은 소스라면 `npm run setup`, `npm --prefix mobile install`, `npm --prefix mobile run configure:personal`을 실행합니다. 개인 연결 토큰과 `.env`는 배포 압축에 포함되지 않습니다.

1. Mac 터미널에서 `codex login status`를 확인합니다. 로그인되지 않았다면 `codex login`으로 로그인합니다.
2. 프로젝트의 **Start Jarvis.command**를 Finder에서 더블 클릭합니다. 또는 이 폴더에서 `npm start`를 실행합니다.
3. 서버와 PC 에이전트가 함께 실행됩니다. 터미널을 유지하세요. 종료는 Ctrl+C입니다.

모바일 폴더의 `npm start`는 Metro만 실행합니다. **프로젝트 루트의 `npm start`**가 실제 서버와 에이전트입니다.

Mac에서는 실행 중 유휴 절전을 방지합니다. 전원에 연결하고 덮개를 열어 두세요. 덮개 닫힘·재부팅 후 실행까지 보장하는 자동 시작 서비스는 설치하지 않았습니다.

Codex 앱 내부의 제한된 실행 환경에서 이 서버를 시작하면 중첩 샌드박스로 파일 작업이 막힐 수 있습니다. 실제 사용은 일반 Mac 터미널에서 시작하세요.

## 다른 Wi-Fi / 셀룰러에서 사용

1. Mac과 iPhone에 [Tailscale](https://tailscale.com/download)을 설치하고 **같은 계정으로 로그인**, 두 기기에서 VPN을 켭니다.
2. 위 Mac 서버를 실행합니다.
3. 프로젝트의 **Setup Remote.command**를 실행합니다. 또는 `npm run remote:setup`을 실행합니다.
4. HTTPS 활성화 안내가 나오면 Tailscale에서 활성화하고 다시 실행합니다.
5. Mac의 `https://….ts.net` 주소와 기존 토큰이 앱 기본값에 저장됩니다. 다음 단계에서 앱을 다시 빌드합니다.

[Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve)는 개인 Tailscale 망 안에서 HTTPS로 서버에 연결합니다. 공유기 포트 포워딩이나 공개 Funnel은 사용하지 않습니다. 기존 Serve 설정이 있으면 자동으로 덮어쓰지 않습니다. 이 스크립트는 현재 기본 포트 8787을 사용합니다.

같은 서버 토큰을 가진 기존 HTTP 연결은 새 HTTPS 기본값으로 자동 이전합니다. 수동으로 저장한 다른 서버 토큰은 유지합니다.

## iPhone 재빌드

1. `mobile/ios/JarvisPocket.xcworkspace`를 Xcode에서 엽니다.
2. 상단 실행 스킴을 **JarvisPocket-Personal**, 대상은 본인 iPhone으로 선택합니다.
3. Run(▶)으로 다시 설치합니다. 이 스킴은 **Release**로 빌드하므로 Metro에 접속하지 않고 실행합니다.
4. 음성 인식 및 마이크 권한을 허용합니다. Wi-Fi를 끄고 셀룰러 + Tailscale 상태에서 대화와 파일 생성을 확인합니다.

새 음성 인식 모듈과 TTS 네이티브 수정은 JS 새로고침만으로 반영되지 않습니다. Xcode 재빌드가 필요합니다. 개발용 `JarvisPocket` 스킴은 기존 Debug/Metro 방식으로 유지합니다. 개발 서명의 설치 유효기간이 끝나면 다시 서명/설치해야 합니다.

## 설정과 작업 보관

- `.env`: 앱 토큰, 에이전트 토큰, 백엔드, 작업 폴더. 토큰을 서로 다르게 유지합니다.
- `data/state.json`: 대화·요청·작업 상태. 서버는 하나만 실행합니다.
- `data/codex-results`: Codex 최종 결과 및 실행 기록. 이미 시작된 작업을 임의로 재실행하지 않도록 기록합니다.
- 오래 걸리는 작업은 8초마다 임대를 갱신합니다. 중단 후 완료 여부가 불명확하면 자동 중복 실행 대신 실패로 표시합니다. 파일 상태를 확인하고 새 요청을 보내세요.
- 작업별 실행 제한은 20분입니다. 취소/권한 부족/실패는 완료와 구분해 표시합니다.
- 사용자 메시지를 셸 문자열로 실행하지 않고 Codex의 표준 입력으로 전달합니다.

## 선택: API / 데모 백엔드

`AI_BACKEND=api`와 `DEMO_MODE=true`는 기존 연결 확인용 데모입니다. 파일 생성/목록만 제공합니다.

`AI_BACKEND=api`, `DEMO_MODE=false`, `OPENAI_API_KEY`를 서버 `.env`에 설정하면 Responses API 기반 대화 및 제한된 파일 도구를 사용합니다. API 키는 휴대폰에 넣지 않습니다. Android WAV 음성 인식은 이 서버 API 설정이 필요합니다. Codex 모드와 달리 API 사용은 별도 API 이용 조건/과금이 적용됩니다.

## 검증

```sh
npm test
npm --prefix mobile test -- --runInBand --watch=false --watchman=false
npm --prefix mobile run lint
npx --prefix mobile tsc --noEmit -p mobile/tsconfig.json
```

세부 검증 결과와 실기기 미검증 사항은 `VALIDATION.md`에 기록합니다.

공식 Codex 실행 문서: https://developers.openai.com/codex/noninteractive/

## 여러 프로젝트 작업

이 Mac은 Documents 전체를 기본 작업 범위로 사용하고 Desktop·Downloads를 추가 허용합니다. 새 앱은 Documents/Codex 아래 프로젝트별 폴더에 생성합니다. `CODEX_EXTRA_DIRS`는 추가 쓰기 폴더의 절대 경로 JSON 배열이고 `CODEX_PROJECTS_ROOT`는 새 프로젝트 기본 위치입니다. 변경 후 서버를 재시작하세요. macOS의 폴더 접근 허용이 별도로 표시될 수 있습니다. 시스템 폴더·다른 사용자 영역 접근, 모든 GUI 앱 조작까지 보장하는 설정은 아닙니다.
