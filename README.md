# 철봉 코치 (pullup)

철봉을 하나도 못 하는 사람이 **첫 한 개**를 하도록 돕는 웹앱(PWA). 빌드 없이 정적 파일만으로 동작합니다.

## 기능 (초벌)
- **수준 테스트**: 매달리기 시간, 내려오기 시간, 철봉 개수로 시작 단계 결정
- **6단계 사다리**: 매달리기 → 어깨 당기기 → 호주식 당기기 → 느리게 내려오기 → 밴드 보조 → 한 개
- **오늘의 10분**: 아침 컨디션(잠, 근육통)에 따라 세트 수 자동 조절, 기준 달성 시 다음 단계 제안
- **카메라 카운트**: MediaPipe Pose Landmarker로 브라우저 안에서 자세 인식 (영상은 기기 밖으로 안 나감)
  - 매달리기: 손이 어깨 위 + 팔꿈치 150° 이상인 동안 타이머
  - 느리게 내려오기: 턱이 손목 위 → 팔이 다 펴질 때까지 시간
  - 철봉: 팔 편 상태에서 턱이 손목 위로 올라가면 1회
- **코치 대화**: 기본은 무료 규칙 기반, 설정에 엔드포인트를 넣으면 LLM
- **성장 기록**: 매달리기 최고 기록 그래프, 단계 진행, 최근 기록
- 기록은 모두 브라우저 `localStorage`에만 저장

## 실행
카메라는 HTTPS 또는 localhost에서만 켜집니다.
```bash
python3 -m http.server 8000   # http://localhost:8000
```
GitHub Pages: Settings → Pages → Branch `main` / root 로 배포하면 폰에서 바로 열고 홈 화면에 추가할 수 있어요.

## 코치 LLM 연결 (선택)
API 키를 브라우저에 두지 않도록, `{ system, messages }`를 받아 `{ reply }`를 돌려주는 작은 서버를 둡니다. Cloudflare Worker 예시:
```js
export default {
  async fetch(req, env) {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const { system, messages } = await req.json();
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: env.MODEL || 'gpt-4o-mini', max_tokens: 200,
        messages: [{ role: 'system', content: system }, ...messages] }),
    });
    const j = await r.json();
    return Response.json({ reply: j.choices?.[0]?.message?.content ?? '' }, { headers: cors });
  },
};
```
작은 모델 + 짧은 답변(max_tokens 200) + 최근 12개 메시지만 보내서 비용을 낮춥니다. 운동 계획은 코드(`js/program.js`)가 정하고 LLM은 말투와 동기 부여만 맡습니다.

## 구조
```
index.html, style.css, manifest.webmanifest, sw.js
js/app.js      라우팅
js/views.js    화면
js/program.js  단계·계획·컨디션 조절 규칙
js/camera.js   자세 인식과 운동별 측정기
js/coach.js    코치 대화 (규칙 / LLM)
js/store.js    localStorage 저장
```

## 다음 할 일
- [ ] 실제 철봉 앞에서 카메라 임계값(팔꿈치 각도, 가시성) 튜닝
- [ ] 측면/정면 촬영 각도 안내
- [ ] 리마인더(웹 푸시), 첫 한 개 영상 자동 저장
- [ ] 형·친구와 기록 공유 챌린지
