# 토스 프론트 · LineageOS · Wi-Fi 연결 확인

확인일: 2026-11-14. 현재 단계는 자료·PC 환경 확인이다. 단말기에서 설치나 연결을 확인한 결과가 아니다.

## 확인 결과

| 구성 | 확인한 근거 | 남은 확인 |
| --- | --- | --- |
| 토스 기본 OS + 공식 플러그인 | 공식 WebSocket SDK에 단말기 서버 start/open/send가 있고 파트너 시스템 연동도 안내한다 | 앱 등록·단말기 적용 권한, 펌웨어별 SDK 동작, 네트워크 접근 |
| 공식 플러그인으로 자유로운 음성 JARVIS | 공식 FAQ는 마이크/getUserMedia를 SDK 지원 범위로 제공하지 않는다고 명시한다 | 이 경로로 음성 단말기 완성을 약속할 수 없음 |
| PLF02WH + LineageOS 18.1 | PLF02WH 전용 비공식 빌더와 직접 설치 성공 기록이 공개돼 있다 | 사용자 기기의 정확한 모델·현재 OS·백업·복구 방법, 마이크·스피커·터치·Wi-Fi 실제 동작 |
| 다른 모델·세대 | 위 빌더는 PLF00WH와 2세대에 사용할 수 없다고 명시한다 | 해당 모델의 별도 검증 자료 필요 |

따라서 OS 교체가 무조건 불가능하다고 단정할 근거는 없다. 반대로 이 사용자 기기에 설치할 수 있다고 확정한 상태도 아니다. LineageOS 공식 지원과 위 비공식 프로젝트를 구분한다.

## 최초 설치와 사용 중 연결을 구분

- 공개된 PLF02WH 설치 기록은 Windows PC, Rockchip 도구, Micro USB 데이터 연결을 사용한다. 이 기록은 Wi-Fi만으로 최초 OS를 설치하는 방법을 증명하지 않는다.
- 설치 뒤에는 단말기를 화면·입출력 장치로 쓰고 PC에서 JARVIS를 실행하는 Wi-Fi 구성을 검토할 수 있다. 실제 지원 여부는 단말기의 브라우저·앱·마이크·스피커 동작으로 확인해야 한다.
- 현재 JARVIS는 127.0.0.1 전용이다. 같은 Wi-Fi에 연결하는 것만으로 PC 주소에서 열리는 상태가 아니다.
- 네트워크 연결 추가는 최신 사용자 요청 범위에 포함된다. 기존 FR-013의 기기 내부 접속 제한을 실제 구현 때 명시적으로 개정해야 한다.
- PC 서버를 준비할 때는 기기별 연결 승인, 인증, 전송 암호화, 허용 주소를 먼저 정한다. 기존 PC 관리 화면과 토큰을 인증 없이 LAN에 그대로 공개하는 설계는 사용하지 않는다.

## 이번 PC 읽기 전용 확인

- PATH에서 adb와 fastboot를 찾지 못했다. 다른 폴더에 설치돼 있는지까지 확인한 결과는 아니다.
- Windows의 Wi-Fi 연결 프로필은 Public이다. 프로필·방화벽 설정은 변경하지 않았다.
- Tailscale 인터페이스가 존재한다. 단말기 앱 설치·계정 연결·사용 가능 여부를 검증한 결과는 아니다.
- 실제 토스 단말기의 IP·모델·OS·디버깅 상태는 확보하지 않았다. 네트워크 검색이나 ADB 연결은 시도하지 않았다.

## 다음 작업 조건

1. 사용자에게 요청한 라벨의 정확한 모델명과 현재 OS 버전을 확인한다. 일련번호·매장번호는 필요 없다.
2. PLF02WH가 맞으면 비공식 빌더의 전체 소스·입력 출처·검증 방식, 본인 기기 원본 백업과 복구 가능성을 확인한다. 공개 설치 기록은 부팅·초기 설정 성공까지만 주장하며 모든 하드웨어 동작을 보증하지 않는다.
3. 정확한 이미지·대상·백업·복구 계획이 준비되면 OS 설치의 실제 변경과 영향을 별도로 검토한다. 모델이 다르거나 백업이 없으면 위 설치 기록을 그대로 적용하지 않는다.
4. 일반 Android 환경에서 브라우저 또는 앱이 동작하는 것이 확인되면 PC의 선택형 네트워크 접속과 단말기 화면을 구현·테스트한다. 실기 전에는 로컬 시험 결과와 실기 검증을 분리해 기록한다.

현재 기기 정보가 없어 OS 변경과 JARVIS의 실제 Wi-Fi 적용은 대기 중이다. 비공식 빌더·이미지 실행, 단말기 변경, 계정 연결, 네트워크 공개는 수행하지 않았다.

## 근거

- [토스 FAQ](https://docs.tossplace.com/faq.html): WebSocket 연동, 마이크 제한, 로컬 개발 URL 직접 연결 미제공, ACL·CORS.
- [토스 WebSocket API](https://docs.tossplace.com/reference/plugin-sdk/front/websocket.html): 단말기 서버 start/open/send.
- [토스 파트너 시스템 연동](https://docs.tossplace.com/guide/front-integration/plugin/develop/partner-integration-guide.html): 자체 서버와 플러그인의 네트워크 통신 구조.
- [LineageOS 기기 지원 안내](https://blob.lineageos.org/preview/wiki/506566/devices/): 다른 기기용 이미지를 사용할 수 없으며 모델별 지원 확인이 필요하다. 확인 당시 공식 목록에서 Toss Front용 항목은 찾지 못했다.
- [PLF02WH 비공식 빌더](https://github.com/kyseong00/toss-front-lineageos-builder): LineageOS 18.1 + Pico GApps, 본인 기기의 순정 super.img 입력 필요. 검토한 Build-PLF02WH.ps1의 Git blob은 6961c85c01704d3d7c72df924a15ae895e92fafa이다. 이 값은 펌웨어 파일의 SHA-256이 아니다.
- [PLF02WH 설치 경험 기록](https://github.com/FLOVER124/toss-front-plf02wh-lineageos-guide): 2026-10-27 설치 사례, 별도 파일 일부 준비 예정, 모델·보드·펌웨어별 검증 한계.
