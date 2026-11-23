# 팀원 실행과 배포

2026-11-24 기준. 개인 설정이나 운영 키를 공유하지 않고 같은 코드를 실행하는 방법입니다. 계정 초대·요금제·기존 배포 보호 설정은 변경하지 않습니다.

## 로컬에서 먼저 확인

Node.js 24를 설치하고 저장소 루트에서 실행합니다.

```sh
git clone https://github.com/taehun0208/2026-cs-hackathon.git
cd 2026-cs-hackathon
npm ci
npm run dev
```

`http://127.0.0.1:3000`에서 코드·게임·회고를 확인합니다. 키나 DB 설정이 없으면 로컬 `.local/lab.sqlite`와 기본 힌트를 사용합니다. 이 경로에서는 `db:migrate`가 필요 없습니다. `.local`을 삭제하면 해당 로컬 서버 기록이 사라집니다.

```sh
npm test
npm run build
npm run typecheck
```

단위 테스트와 빌드는 실제 AI 키 없이 수행할 수 있습니다. GitHub `Check`도 Node.js 24에서 같은 검사를 실행하며 배포 권한이나 운영 비밀을 요구하지 않습니다. `main`·`develop` 대상 PR과 두 브랜치의 push에서 실행됩니다. 실제 AI 평가·운영 마이그레이션은 CI에 포함하지 않습니다.

## 개인 Vercel에 배포

기존 서비스의 기록·DB·키와 분리된 개인 시연용 배포를 만듭니다. Hobby의 한도와 사용 조건은 각 계정에서 확인하며, OpenAI API 사용료는 Vercel 무료 배포와 별도입니다.

1. 공개 GitHub 저장소를 **본인 계정으로 Fork**합니다. Fork는 원본과 별개의 저장소이며 이후 변경을 PR로 제안할 수 있습니다. [GitHub Fork 안내](https://docs.github.com/en/pull-requests/how-tos/work-with-forks/fork-a-repo)
2. Vercel에서 본인의 GitHub 계정을 연결하고 **본인 Fork를 Import**합니다. Framework는 Next.js, Root Directory는 저장소 루트, Node.js는 24.x입니다. 저장소의 `npm ci`·빌드 설정을 사용합니다.
3. 별도 Neon DB를 준비해 새 프로젝트에 연결합니다. 기존 운영 DB 주소를 복사하지 않습니다. Production과 Preview도 별도 DB 또는 Neon branch를 사용합니다. Preview를 검사하지 않을 경우 운영 DB를 Preview 환경에 연결하지 않습니다.
4. 아래 서버 환경 변수를 준비합니다. 모든 값에 `NEXT_PUBLIC_` 접두사를 붙이지 않습니다. AI를 사용하지 않을 때는 키를 생략하고 기본 힌트로 시연할 수 있습니다.
5. 새 DB 주소만 넣은 로컬 `.env.local`을 준비하고 `npm run db:migrate`를 실행합니다. `001`~`003` 마이그레이션이 이름 순서대로 적용됩니다. 이 명령은 설정된 DB의 스키마를 변경하므로 대상이 개인 DB인지 먼저 확인합니다. 연결 문자열을 화면 공유·로그·PR에 붙이지 않습니다.
6. Vercel의 Production Branch를 `main`으로 확인하고 배포합니다. 이후 검증한 변경을 PR로 `main`에 반영합니다. 환경 변수 변경도 새 배포가 필요합니다.
7. Production 도메인에서 새 기록 저장·새로고침 후 복원·기록 삭제를 확인합니다. 실제 AI 호출은 별도 비용이 드는 선택 검사입니다. Cron Jobs 실행 이력에서 정리 요청이 2xx인지 확인합니다.

| 변수 | 새 프로젝트에서 준비할 값 |
| --- | --- |
| `DATABASE_URL` 또는 `POSTGRES_URL` | 해당 환경의 별도 Neon 연결 주소. 둘 다 있으면 비어 있지 않은 `DATABASE_URL` 우선 |
| `OPENAI_API_KEY` | 맞춤 힌트가 필요할 때만 해당 운영자가 준비하는 서버 키 |
| `OPENAI_MODEL` | 기본 `gpt-4.1-mini`. 지원하지 않는 모델은 기본 힌트로 전환 |
| `AI_DAILY_BUDGET_USD` | 예시 `1`. `0`이면 실제 AI를 중단 |
| `AI_MONTHLY_BUDGET_USD` | 예시 `10`. 계정 전체 결제 상한과는 별도인 앱 원장 예산 |
| `CRON_SECRET` | Production에 32자 이상의 임의 비밀 값. Vercel 예약 요청의 인증에 사용 |

`.env.example`을 복사했다면 비어 있는 DB 변수는 그대로 두거나 지울 수 있습니다. 값 앞뒤 공백은 제거하고 선택하며, 유효하지 않은 연결 주소는 수정해야 합니다. Vercel Production에서는 DB 누락 시 SQLite로 대신 저장하지 않고 저장 API가 503을 반환합니다. 빌드 성공만으로 DB 연결·마이그레이션 성공을 판단하지 않습니다.

DB 스키마는 빌드 중 자동 변경하지 않습니다. CI나 모든 Preview 빌드에 운영 마이그레이션 명령을 넣지 않습니다. 각 DB/branch가 독립적이면 해당 대상마다 마이그레이션이 필요합니다.

## 권한 오류를 구분하는 방법

| 증상 | 확인할 곳과 다음 행동 |
| --- | --- |
| 사이트에 들어가자마자 Vercel 로그인·권한 화면 | 앱의 기록 오류가 아니라 배포 보호 화면일 수 있습니다. 학생에게는 README의 Production 도메인을 전달합니다. 배포별 생성 URL·Preview는 보호될 수 있으므로 소유자가 공유 범위를 확인합니다. [배포 보호 범위](https://vercel.com/docs/deployment-protection) |
| GitHub push는 되지만 Vercel이 커밋 작성자 권한을 거절 | GitHub 쓰기 권한이 기존 Hobby 프로젝트의 배포 권한을 주지는 않습니다. Hobby는 프로젝트 소유자와 연결된 커밋 작성자를 확인합니다. 무료 개인 시연은 본인 Fork·본인 프로젝트·본인 계정으로 작성한 실제 변경 커밋에서 진행합니다. 다른 사람의 작성자 정보로 바꾸지 않습니다. [공식 협업 오류 안내](https://vercel.com/docs/deployments/troubleshoot-project-collaboration) |
| 본인 프로젝트인데 작성자를 확인하지 못함 | Vercel의 Git provider 연결과 커밋에 사용한 본인 계정의 연결 정보를 확인합니다. 비밀키나 이메일 목록을 공개 이슈에 올리지 않습니다. [Git 연결·작성자 확인](https://vercel.com/docs/deployments/troubleshoot-project-collaboration) |
| Fork PR의 Preview가 승인 대기 | 외부 PR에 대한 Vercel Git Fork Protection일 수 있습니다. 소유자가 변경을 검토하고 승인할 항목입니다. 보호를 끄거나 운영 키를 Fork에 복사하는 방식으로 해결하지 않습니다. [공개 Fork 배포](https://vercel.com/docs/git#deploying-forks-of-public-git-repositories) |
| 홈은 열리지만 기록이 503으로 실패 | 해당 배포 환경의 DB 변수·접속 가능 여부·마이그레이션을 확인합니다. 앱은 초안을 기기에 남기며 다시 저장할 수 있습니다. Production/Preview 변수 범위도 확인합니다. |
| AI가 기본 힌트만 표시 | AI 동의, 키 설정·잔액·만료, 모델과 앱 예산을 확인합니다. 기본 힌트는 계속 사용할 수 있습니다. [AI 운영 예산](AI-BUDGET.md) |
| 정리 작업이 503 또는 401 | 503은 DB 오류 또는 32자 미만/누락된 `CRON_SECRET`, 401은 인증 불일치일 수 있습니다. Production 변수 설정 후 다시 배포하고 실행 이력을 확인합니다. [앱 정리 정책](RECORD-MANAGEMENT.md) |

현재 저장소는 하루 한 번 `0 3 * * *` UTC 정리를 예약합니다. Vercel Cron은 Production에서만 예약 실행되며, Hobby에서는 지정 시간대 안에서 실행 시각이 달라질 수 있습니다. 미리보기 정리 이력이 없다는 이유로 인증을 끄지 않습니다. 비밀 값을 변경한 뒤 새 배포와 첫 실행 결과를 확인합니다. [Cron 운영·인증](https://vercel.com/docs/schedules/cron-jobs/manage-cron-jobs)

운영 서비스와 개인 시연의 쿠키·기록은 서로 옮겨지지 않습니다. 별도 로그인이나 기기 간 기록 동기화 기능도 없습니다. 학생을 모집할 때는 실제 사용할 도메인 하나를 정하고, 개인 시연의 합성 확인 기록을 파일럿 성과에 섞지 않습니다.
