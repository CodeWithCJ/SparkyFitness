<p align="center">
  <a href="../../README.md">English</a> ·
  <a href="README_zh-CN.md">简体中文</a> ·
  <a href="README_zh-TW.md">繁體中文</a> ·
  <a href="README_ja.md">日本語</a> ·
  <b>한국어</b> ·
  <a href="README_hi.md">हिन्दी</a> ·
  <a href="README_th.md">ไทย</a> ·
  <a href="README_fr.md">Français</a> ·
  <a href="README_de.md">Deutsch</a> ·
  <a href="README_es.md">Español</a> ·
  <a href="README_it.md">Italiano</a> ·
  <a href="README_ru.md">Русский</a> ·
  <a href="README_pt-BR.md">Português (Brasil)</a> ·
  <a href="README_nl.md">Nederlands</a> ·
  <a href="README_pl.md">Polski</a> ·
  <a href="README_ar.md">العربية</a> ·
  <a href="README_fa.md">فارسی</a> ·
  <a href="README_tr.md">Türkçe</a> ·
  <a href="README_vi.md">Tiếng Việt</a> ·
  <a href="README_id.md">Bahasa Indonesia</a>
</p>

# SparkyFitness

MyFitnessPal, Flo, Hevy, Shotsy 등을 대체하는 셀프 호스팅 방식의 프라이버시 우선 앱입니다. 영양, 운동, 신체 지표, 건강 데이터를 기록하면서 데이터에 대한 완전한 통제권을 유지하세요.
<img width="5120" height="2880" alt="이미지" src="https://github.com/user-attachments/assets/d8b09f48-cb4d-41a6-b678-ac93e551f257" />


SparkyFitness는 다음으로 구성된 셀프 호스팅 피트니스 트래킹 플랫폼입니다.

- 백엔드 서버(API + 데이터 저장소)
- 웹 기반 프론트엔드
- iOS 및 Android용 네이티브 모바일 앱

타사 서비스에 의존하지 않고, 직접 관리하는 인프라에서 건강 데이터를 저장하고 관리합니다.

## 핵심 기능

- 영양, 운동, 수분 섭취, 수면, 단식, 기분, 신체 치수 기록
- 목표 설정 및 일일 체크인
- 인터랙티브 차트와 장기 리포트
- 여러 사용자 프로필 및 가족 접근
- 라이트 및 다크 테마
- OIDC, TOTP, Passkey, MFA 등

## SparkyFitness 비교

**SparkyFitness는 오픈 소스가 아닌 소스 공개(source-available) 소프트웨어입니다** — [라이선스](../../LICENSE)는 비상업적 용도이며, 상업적으로 사용하려면 허가가 필요합니다.

대부분의 앱은 한 가지 기능만 합니다. 괜찮은 영양 관리 앱 하나에 연간 40~100달러가 들고, SparkyFitness가 다루는 모든 것을 갖추려면 1인당 서너 개의 구독이 필요하며, 그래도 이를 아우르는 하나의 리포트는 얻을 수 없습니다. SparkyFitness는 이 모든 것을 하나의 앱에서, 무료로, 온 가족을 위해 제공합니다.

<sub>미국 정가 기준, 2026년 8월 14일. [전체 비용 내역 →](https://codewithcj.github.io/SparkyFitness/features/comparison)</sub>

| | **SparkyFitness** | wger | MyFitnessPal | Cronometer | Hevy | Zero | Flo | Garmin Connect | Google Health |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 셀프 호스팅, 데이터는 온전히 내 것 | ⭐ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 구독 없음, 광고 없음 | ✅ | ✅ | ❌ | 🟡 | 🟡 | ❌ | ❌ | ✅ | 🟡 |
| 영양, 근력 운동, 수면, 단식, 생리 주기, 복약을 한곳에서\* | ⭐ | 🟡 | 🟡 | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| 전체 기록 및 사용자 지정 기간 리포트 | ✅ 무료 | 🟡 | 💰 | 💰 | 💰 | 💰 | 💰 | ✅ | 💰 |
| 웨어러블 및 건강 플랫폼 동기화 | ✅ 8개 이상 서비스 | ❌ | ✅ | ⭐ | ✅ | 🟡 | 🟡 | 🟡 | ✅ |
| 세분화된 권한의 가족 공유 | ⭐ 7가지 권한 | ❌ | ❌ | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| CSV 가져오기 및 무료 데이터 내보내기 | ✅ | 🟡 | 💰 | ✅ | ✅ | 🟡 | 🟡 | 🟡 | ❌ |
| MCP 서버 + 원하는 LLM 사용 | ⭐ | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

⭐ 탁월 &nbsp;•&nbsp; ✅ 지원 &nbsp;•&nbsp; 🟡 부분 지원 &nbsp;•&nbsp; 💰 유료 요금제 전용 &nbsp;•&nbsp; ❌ 미지원

<sub>\* 수면 단계, HRV, 혈당은 워치, 휴대폰 또는 측정기에서 가져옵니다. SparkyFitness는 이를 직접 측정하지 않고 저장, 분석하고 차트로 보여줍니다.</sub>

> **이 표는 비교 대상인 프로젝트 자신이 작성한 것이므로, 그 점을 감안해서 읽어 주세요.** 2026년 8월 14일에 공식 문서, 저장소, 스토어 정보와 대조해 확인했으며, 일부 내용은 이미 오래되었을 수 있습니다. 잘못되었거나 다른 프로젝트에 불공정한 항목이 있다면 [issue를 열어 주세요](https://github.com/CodeWithCJ/SparkyFitness/issues) — SparkyFitness가 *더 나빠* 보이게 만드는 수정도 똑같이 환영합니다.

**[전체 비교 보기 →](https://codewithcj.github.io/SparkyFitness/features/comparison)** — 셀프 호스팅, 영양, 전문 분야, 기기 생태계 카테고리에 걸친 17개 앱과, 각 앱이 우리보다 나은 점까지 정리했습니다.

## 건강 및 기기 연동

SparkyFitness는 여러 건강 및 피트니스 플랫폼에서 데이터를 동기화할 수 있습니다.

- **Apple Health** (iOS)
- **Google Health Connect** (Android)
- **Google Health API** 
- **Fitbit**
- **Garmin Connect**
- **Withings**
- **Polar Flow** 
- **Oura**
- **Hevy**
- **OpenFoodFacts**
- **USDA**
- **Fatsecret**
- **Nutritionix**
- **Mealie**
- **Tandoor**
- **Strava** (일부만 테스트됨)
- **COROS**
- **Norish**
- **Yazio** (비공식 API 사용)
- **Swiss Food Database**
- **Canadian Nutrient File (Health Canada)**
- **Swedish Food Agency (Livsmedelsverket)**
- **Free Exercise DB** (Github)
- **Wger**

연동 기능은 걸음 수, 운동, 수면 같은 활동 데이터와 체중, 신체 치수 같은 건강 지표를 SparkyFitness 서버로 자동 동기화합니다.

## 선택형 AI 기능 (베타)

SparkyAI는 데이터를 기록하고 진행 상황을 확인할 수 있는 대화형 인터페이스를 제공합니다.

- 채팅으로 음식, 운동, 신체 지표, 걸음 수 기록
- 음식 사진을 업로드하면 식사 자동 기록
- 후속 질문을 위해 대화 기록 유지

참고: AI 기능은 현재 베타 단계입니다.

## 설치

SparkyFitness를 실행하는 두 가지 방법 중 하나를 선택하세요.

### 1. 셀프 호스팅

Docker Compose를 사용해 몇 분 만에 SparkyFitness 서버를 실행하세요.

```bash
# 1. 새 폴더 만들기
mkdir sparkyfitness && cd sparkyfitness

# 2. docker-compose.yml 다운로드
curl -L -o docker-compose.yml https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/docker-compose.prod.yml

# 3. .env 설정 준비 (하나를 선택하세요):
# 옵션 A (권장): 브라우저에서 클릭 한 번으로 보안 키가 포함된 맞춤 .env 생성:
# 👉 https://codewithcj.github.io/SparkyFitness/install/env-generator

# 옵션 B: 최소 템플릿 — 값 5개만 입력하고, 나머지는 모두
# docker-compose가 이미 적용하는 기본값을 사용합니다. 대부분의 셀프 호스팅 설치에 충분합니다.
curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.simple.example

# 옵션 C: 전체 레퍼런스 — 지원되는 모든 변수가 기본값과 함께
# 주석 처리되어 있습니다. SSO, SMTP, 외부 데이터베이스, 리버스 프록시를 쓰려면 여기서 시작하세요.
# curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.example

# 4. 플레이스홀더 교체 (옵션 A를 사용했다면 건너뛰세요 — 생성기가
# 이미 채워 두었습니다). 그대로 두면 서버가 시작을 거부하며,
# 그렇지 않으면 데이터베이스가 공개된 비밀번호로 초기화됩니다.
#   SPARKY_FITNESS_DB_PASSWORD        강력한 비밀번호 아무거나
#   SPARKY_FITNESS_API_ENCRYPTION_KEY openssl rand -hex 32     (16진수 64자)
#   BETTER_AUTH_SECRET                openssl rand -base64 32  (44자)
#   SPARKY_FITNESS_FRONTEND_URL       앱에 접속할 URL

# 5. 앱 시작
docker compose pull && docker compose up -d

# http://localhost:3004 에서 애플리케이션에 접속
```

_참고: 전체 설정 옵션, 리버스 프록시, 다른 설치 방법은 [문서 사이트](https://codewithcj.github.io/SparkyFitness/)를 방문하세요._

### 2. 클라우드 (비기술 사용자용)

기술에 익숙하지 않고 직접 서버에서 SparkyFitness를 운영하고 싶지 않다면, 다음 제공업체 중 하나를 이용해 클라우드에 호스팅 인스턴스를 배포할 수 있습니다.

<a href="https://www.pikapods.com/pods?run=sparkyfitness">
  <img src="https://www.pikapods.com/static/run-button.svg" height="70" width="150" alt="PikaPods에서 실행">
</a>
<br>
<a href="https://zenith.hosting/host/sparkyfitness?ref=gh">
  <img src="https://cdn.zenith.hosting/buttons/deploy-with-zenith.svg" height="70" width="150" alt="Zenith로 배포">
</a>


> **참고:** 이들은 독립적인 타사 서비스입니다. 각 제공업체의 기능을 살펴보고 필요에 가장 잘 맞는 곳을 선택하시기 바랍니다.
 

## 🎥 동영상 튜토리얼

[![동영상 보기](https://img.youtube.com/vi/B13IiL2DeQc/maxresdefault.jpg)](https://www.youtube.com/watch?v=B13IiL2DeQc)

SparkyFitness(셀프 호스팅 피트니스 트래커) 설치 방법을 보여주는 2분짜리 빠른 튜토리얼입니다.

## 문서

전체 설치 가이드, 설정 옵션, 개발 문서는 [문서 사이트](https://codewithcj.github.io/SparkyFitness/)를 방문하세요.

### 바로가기

- **[설치 가이드](https://codewithcj.github.io/SparkyFitness/install/docker-compose)** - 배포 및 설정
- **[인터랙티브 .env 생성기](https://codewithcj.github.io/SparkyFitness/install/env-generator)** - 클라이언트 측 `.env` 설정 빌더
- **[기능 개요](https://codewithcj.github.io/SparkyFitness/features)** - 전체 기능 문서
- **[개발 워크플로](https://codewithcj.github.io/SparkyFitness/developer/getting-started)** - 개발자 가이드 및 기여 절차
- **[iOS 앱 정보](https://github.com/CodeWithCJ/SparkyFitness/wiki/Apple-Health-Integration)** 및 **[Android 앱 정보](https://github.com/CodeWithCJ/SparkyFitness/wiki/Android-Mobile-App)**

### 도움이 필요하신가요?

- Github issues/discussion에 글을 남겨 주세요.
- 더 빠른 답변과 다른 커뮤니티 멤버의 도움을 원하시면 **[Discord에 참여하세요](https://discord.gg/vcnMT5cPEA)**

## 스타 히스토리

<a href="https://www.star-history.com/?repos=CodeWithCJ%2FSparkyFitness&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&theme=dark&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <img alt="스타 히스토리 차트" src="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
 </picture>
</a>

## 번역


**[Weblate 번역](https://weblate.sparkyfitness.com/engage/sparkyfitness)**

<a href="http://weblate.sparkyfitness.com/engage/sparkyfitness/"><img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/svg-badge.svg" alt="번역 현황"></a>



<a href="https://weblate.sparkyfitness.com/engage/sparkyfitness">
<img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/multi-auto.svg" alt="번역 현황" />
</a>

## 저장소 활동

![저장소 활동](https://repobeats.axiom.co/api/embed/828203d3070ff56c8873c727b6873b684c4ed399.svg "Repobeats 분석 이미지")

## 기여자

<a href="https://github.com/CodeWithCJ/SparkyFitness/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=CodeWithCJ/SparkyFitness" width="100%" alt="SparkyFitness 기여자"/>
</a>

## ⚠️ 알려진 문제 / 베타 기능 ⚠️

SparkyFitness는 활발히 개발 중입니다.
릴리스 간에 호환성을 깨는 변경이 발생할 수 있습니다.

- 컨테이너 자동 업데이트는 권장하지 않습니다
- 업그레이드 전에 항상 릴리스 노트를 확인하세요

다음 기능은 현재 베타 단계이며 충분히 테스트되지 않았을 수 있습니다. 버그나 미완성 기능이 있을 수 있습니다.

- AI 챗봇
- 가족 및 친구 접근
- API 문서

*이 문서는 영어 README의 번역본입니다. 내용이 다를 경우 [영어 버전](../../README.md)을 기준으로 합니다.*
