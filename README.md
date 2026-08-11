# 리워드 쇼핑몰 V2

회원이 리워드를 적립하고 상품 구매에 사용할 수 있는 쇼핑몰입니다. 일반 쇼핑 기능에 회원·추천·출석·후기 리워드, 포인트/현금 혼합 결제, 관리자 운영, 유튜브 라이브 커머스 기능을 결합했습니다.

현재 서비스는 OpenAI Sites와 Cloudflare Workers 기반으로 운영되며, 데이터는 Cloudflare D1, 업로드 파일은 R2를 사용합니다. 앞으로의 소스 관리와 협업 기준은 GitHub입니다.

## 주요 기능

- 이메일/비밀번호 및 Google 회원가입·로그인
- 상품 목록, 상세, 옵션, 장바구니, 찜, 배송지, 주문
- 리워드 전액 결제와 계좌이체·카카오톡 송금 혼합 결제
- 출석, 추천인, 후기, 쿠폰, 구매 리워드
- 상품·주문·회원·리워드·카테고리·상담·팝업·공지 관리자 기능
- 관리자 역할 및 권한 분리
- 유튜브 라이브/재방송/Shorts와 방송 상품 연결
- 품번 중심 상품 카탈로그와 로컬 상품 이미지

## 실행 환경

- Node.js `>=22.13.0`
- npm
- Linux 또는 WSL 권장
  - 설치·빌드 스크립트가 Bash, `flock`, `curl`, GNU `timeout`을 사용합니다.

## 로컬 실행

```bash
npm ci
cp .env.example .env.local
npm run dev
```

개발 서버가 안내하는 로컬 주소로 접속합니다. 로컬 D1/R2 모의 환경은 `vite.config.ts`에서 구성합니다.

## 점검 명령

```bash
npm run build
npm test
npm run lint
```

DB 스키마를 변경한 경우:

```bash
npm run db:generate
```

## 기본 구조

```text
app/          페이지와 API 라우트
components/   고객·관리자 화면 컴포넌트
db/           Drizzle 스키마와 D1 연결
drizzle/      DB 마이그레이션
lib/          인증, 리워드, 결제, 상품 및 공통 로직
public/       정적 파일과 상품 이미지
scripts/      설치, 빌드, 검증 및 카탈로그 도구
tests/        회귀·통합 테스트
worker/       Cloudflare Worker 진입점
.openai/      Sites 프로젝트 연결 정보
```

`build/sites-vite-plugin.ts`는 생성물이 아니라 현재 빌드 구성에서 사용하는 소스 파일입니다. 일반 빌드 산출물은 `.gitignore`에 따라 커밋하지 않습니다.

## 프로젝트 문서

- [PROJECT.md](PROJECT.md): 목적, 구조, 정책 및 개발 규칙
- [CURRENT_STATUS.md](CURRENT_STATUS.md): 현재 구현 상태와 다음 작업
- [CHANGELOG.md](CHANGELOG.md): 확인 가능한 변경 이력
- [AGENTS.md](AGENTS.md): Work와 Codex가 따라야 할 작업 규칙
- [AI_MEMORY.md](AI_MEMORY.md): 장기 운영 방향과 핵심 기억

## GitHub 운영

GitHub 저장소가 연결된 이후에는 `main`을 기준 브랜치로 사용합니다. 모든 기능 변경은 최신 `main`에서 작업 브랜치를 만들고, 점검과 문서 갱신 후 Pull Request로 병합합니다.

GitHub 저장소 `zonesmise/reward-point-mall-v2`를 기준 원격 `origin`으로 사용합니다. 기존 Sites 내부 원격은 배포 이력 보존을 위해 `sites`라는 이름으로 유지합니다.

## 보안

- `.env`와 실제 비밀값을 커밋하지 않습니다.
- 운영 키는 Sites의 환경 변수/Secret으로 관리합니다.
- 초기 관리자 계정은 운영 전 반드시 비밀번호를 변경합니다.
- 관리자 인증, 결제, 리워드, DB 구조 변경은 사용자 승인과 회귀 테스트가 필요합니다.
