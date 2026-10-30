# 철봉 코치 (pullup)

철봉을 하나도 못 하는 사람이 **한 개**를 할 수 있게 돕는 웹앱(PWA) 초벌 버전입니다.
빌드 도구 없이 정적 파일만으로 동작하므로 GitHub Pages에 바로 올릴 수 있습니다.

## 기능
- **수준 테스트**: 매달리기·내려오기·철봉 개수로 시작 단계를 정합니다.
- **6단계 사다리**: 매달리기 → 어깨 당기기 → 호주식 당기기 → 느리게 내려오기 → 밴드 보조 → 한 개!
  기록이 기준을 넘으면 자동으로 다음 단계로 올라갑니다.
- **오늘의 10분**: 단계별 운동과 세트. 컨디션(잠, 근육통)에 따라 강도를 자동 조절합니다.
- **카메라 카운트**: MediaPipe Pose Landmarker(웹, 기기 안에서 실행)로 매달리기·내려오기 시간과 철봉 횟수를 잽니다. 영상은 서버로 가지 않습니다.
- **코치 대화**: 기본은 무료 규칙 기반. 설정에 LLM 엔드포인트를 넣으면 자유 대화를 LLM이 맡습니다.
- **성장 기록**: 매달리기 그래프와 단계 진행.
- 모든 데이터는 기기 `localStorage`에만 저장됩니다.

## 실행
```bash
python3 -m http.server 8000   # 또는 npx serve
# http://localhost:8000
```
카메라는 HTTPS 또는 localhost에서만 동작합니다.

## GitHub Pages 배포
Settings → Pages → Source: `Deploy from a branch`, Branch: `main` / `(root)`.
몇 분 뒤 `https://sangpire.github.io/pullup/` 에서 열립니다. 폰에서 열고 "홈 화면에 추가"하면 앱처럼 씁니다.

## 코치 LLM 연결 (선택)
API 키를 브라우저에 두지 않도록 작은 서버(예: Cloudflare Worker)를 둡니다.
요청: `POST { system, messages:[{role:'user'|'assistant', text}], context }` → 응답: `{ reply }`

```js
// Cloudflare Worker 예시 (OpenAI 호환 API). 키는 env.LLM_KEY 시크릿으로.
export default {
  async fetch(req, env) {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const { system, messages, context } = await req.json();
    const r = await fetch(env.LLM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_KEY}` },
      body: JSON.stringify({
        model: env.LLM_MODEL, max_tokens: 200,
        messages: [{ role: 'system', content: `${system}\n상태: ${JSON.stringify(context)}` },
                   ...messages.map(m => ({ role: m.role, content: m.text }))],
      }),
    });
    const j = await r.json();
    return Response.json({ reply: j.choices?.[0]?.message?.content ?? '' }, { headers: cors });
  },
};
```
작은 모델로 하루 짧은 체크인이면 사용자당 비용이 매우 낮습니다. 단계 계산·카메라 측정은 LLM을 쓰지 않습니다.

## 구조
```
index.html, style.css, manifest.webmanifest, sw.js, icons/
js/app.js      탭 라우팅
js/views.js    화면 (수준 테스트, 홈, 훈련, 코치, 기록, 설정)
js/program.js  6단계 프로그램, 컨디션 조절 규칙
js/camera.js   MediaPipe 자세 인식, 매달리기/내려오기/횟수 측정
js/coach.js    규칙 기반 코치 + 선택적 LLM
js/store.js    localStorage 저장
```

## 다음에 해 볼 것
- 카메라 판정 임계값 실제 영상으로 튜닝 (특히 정면/측면 각도)
- 세트 사이 휴식 타이머, 리마인더 알림
- 형·친구와 기록 공유 / 같이 하는 챌린지
- '첫 한 개' 순간 자동 녹화
