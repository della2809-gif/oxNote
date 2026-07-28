# xonote

모든 과목의 오답을 모아 AI가 원인을 분석해주고, 간격 반복(spaced repetition)으로 복습을 도와주는 시험 성장 플랫폼입니다.

## 스택

- [Next.js](https://nextjs.org) (App Router) + TypeScript + Tailwind CSS v4
- [Supabase](https://supabase.com) — Auth, Postgres, Storage, RLS
- [OpenAI API](https://platform.openai.com) (`gpt-4o`) — 오답 원인 분석, 사진/PDF 문제 인식

## 로컬 개발 설정

### 1. 저장소 클론 및 패키지 설치

```bash
npm install
```

### 2. Supabase 프로젝트 준비

1. [supabase.com](https://supabase.com)에서 새 프로젝트를 생성합니다.
2. `supabase/migrations/0001_init.sql`의 내용을 Supabase 대시보드의 SQL Editor에 붙여넣고 실행합니다. (profiles/subjects/notes/review_logs 테이블과 RLS 정책이 생성됩니다.)
3. 이어서 `supabase/migrations/0002_note_files.sql`도 실행합니다. (오답 원본 사진/PDF를 저장할 `note-files` Storage 버킷과 RLS 정책이 생성됩니다.)
4. Project Settings → API에서 `Project URL`과 `anon public` 키를 복사합니다.

### 3. 환경 변수 설정

`.env.example`을 `.env.local`로 복사한 뒤 값을 채웁니다.

```bash
cp .env.example .env.local
```

| 변수 | 설명 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon public 키 |
| `NEXT_PUBLIC_SITE_URL` | 인증 메일이 돌아올 서비스 주소 |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용 키. AI 사용량 예약·확정에만 사용하며 브라우저 노출 금지 |
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com)에서 발급한 API 키 |
| `OPENAI_MODEL` | (선택) 사용할 모델, 기본값 `gpt-4o` |
| `PAYMENT_CHECKOUT_URL` | (선택) 결제대행사에서 발급한 호스팅 결제 URL |

### 4. 개발 서버 실행

```bash
npm run dev
```

<http://localhost:3000> 에서 확인할 수 있습니다.

## 주요 기능

- **오답 입력 & AI 분석**: 문제/내 답/정답을 직접 입력하거나, 문제 사진(JPG/PNG/WEBP) 또는 PDF를 업로드하면 GPT가 내용을 읽어 오답 원인과 학습 포인트를 자동 분석 (`src/lib/analyze.ts`, `src/app/(app)/notes/actions.ts`, `src/app/(app)/notes/new/NoteForm.tsx`)
- **과목별 정리**: 과목을 등록하고 오답을 과목별로 필터링 (`src/app/(app)/subjects`)
- **간격 반복 복습**: Leitner 박스 방식(1→30일 간격)으로 복습 스케줄 자동 계산 (`src/lib/spaced-repetition.ts`)
- **성장 대시보드**: 전체/완전학습/복습대기 오답 수와 과목별 정답률 시각화 (`src/app/(app)/dashboard`)
- **유료화 기반**: Free/Pro 플랜, 월별 AI 크레딧, 파일·저장 한도, 사용량 계측 (`src/app/(app)/billing`)
- **운영자 화면**: 사용자·구독·AI 사용량·탈퇴 요청 관리 (`src/app/(app)/admin`)
- **계정 관리**: 내 데이터 JSON 내보내기, 탈퇴 요청, 이용약관·개인정보 처리방침 (`src/app/(app)/settings`)

## GitHub 저장소 연결 (xonote)

```bash
git add -A
git commit -m "Initial commit: xonote MVP"
git branch -M main
git remote add origin https://github.com/<your-username>/xonote.git
git push -u origin main
```

## Vercel 배포

1. [vercel.com/new](https://vercel.com/new)에서 GitHub의 `xonote` 저장소를 Import합니다.
2. Framework Preset은 Next.js가 자동 감지됩니다.
3. Environment Variables에 `.env.example`의 필수 변수를 등록하고 Node.js 22 이상을 사용합니다.
4. Deploy를 클릭하면 `xonote.vercel.app` (또는 커스텀 도메인)으로 배포됩니다.
5. Supabase 대시보드 → Authentication → URL Configuration에 배포된 Vercel 도메인을 Site URL / Redirect URLs로 추가합니다.

## 유료화 마이그레이션과 관리자 지정

1. `0001_init.sql`, `0002_note_files.sql`, `20260728060957_monetization_foundation.sql` 순서로 적용합니다.
2. 관리자 계정은 Supabase SQL Editor에서 `auth.users.raw_app_meta_data`에 `{"role":"admin"}`을 병합합니다. 사용자가 수정할 수 있는 `raw_user_meta_data`는 권한 판정에 사용하지 않습니다.
3. 관리자 역할을 변경한 뒤 해당 계정에서 로그아웃하고 다시 로그인해 JWT를 갱신합니다.
4. 실제 결제를 연결할 때 결제대행사 Webhook에서 `subscriptions`를 갱신하고 Webhook 서명과 이벤트 멱등성을 검증합니다.

> `/terms`와 `/privacy`는 개발 단계 초안입니다. 유료 출시 전에 사업자 정보, 환불 기준, 개인정보 국외 이전과 아동 이용 정책을 전문가와 최종 검토하세요.

## 프로젝트 구조

```
src/
  app/
    (auth)/         로그인, 회원가입
    (app)/          로그인 후 화면 (대시보드, 오답노트, 복습, 과목, 요금제, 설정, 관리자)
    api/analyze/    오답 분석 API 라우트
  lib/
    supabase/       Supabase 클라이언트 (browser/server/middleware)
    openai.ts       OpenAI 클라이언트
    analyze.ts      GPT 기반 오답 분석 (텍스트 입력 / 파일 업로드)
    spaced-repetition.ts  Leitner 복습 스케줄링 로직
    types.ts        DB 모델 타입
supabase/migrations/  DB 스키마 (SQL), Storage 버킷
```
