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
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com)에서 발급한 API 키 |
| `OPENAI_MODEL` | (선택) 사용할 모델, 기본값 `gpt-4o` |

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
3. Environment Variables에 위 변수(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `OPENAI_API_KEY`)를 등록합니다.
4. Deploy를 클릭하면 `xonote.vercel.app` (또는 커스텀 도메인)으로 배포됩니다.
5. Supabase 대시보드 → Authentication → URL Configuration에 배포된 Vercel 도메인을 Site URL / Redirect URLs로 추가합니다.

## 프로젝트 구조

```
src/
  app/
    (auth)/         로그인, 회원가입
    (app)/          로그인 후 화면 (대시보드, 오답노트, 복습, 과목)
    api/analyze/    오답 분석 API 라우트
  lib/
    supabase/       Supabase 클라이언트 (browser/server/middleware)
    openai.ts       OpenAI 클라이언트
    analyze.ts      GPT 기반 오답 분석 (텍스트 입력 / 파일 업로드)
    spaced-repetition.ts  Leitner 복습 스케줄링 로직
    types.ts        DB 모델 타입
supabase/migrations/  DB 스키마 (SQL), Storage 버킷
```
