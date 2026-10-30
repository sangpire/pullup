// 코치 대화.
// 기본은 규칙 기반(무료, 오프라인). 설정에 coachEndpoint를 넣으면 LLM 서버로 대화한다.
// 엔드포인트 계약: POST { system, messages:[{role,text}], context } -> { reply }
// API 키는 브라우저에 두지 말고 서버(예: Cloudflare Worker)에 둔다.
import { save, today, todaysCheckin, best } from './store.js';
import { STAGES } from './program.js';

export function greeting(state) {
  const c = todaysCheckin(state);
  if (!c) return { text: '오늘 컨디션부터 볼게요. 어젯밤 몇 시간 잤어요?', chips: ['5시간 이하', '6시간', '7시간', '8시간 이상'] };
  return { text: '오늘도 왔네요! 궁금한 거나 오늘 느낌을 말해 줘요.', chips: ['오늘 뭐 해요?', '언제쯤 한 개 할 수 있어요?'] };
}

function sleepFrom(t) { const m = t.match(/(\d+)/); return m ? Number(m[1]) : null; }

// 규칙 기반 응답. 상태를 바꾸는 체크인 흐름을 담당한다.
function ruleReply(state, text) {
  let c = todaysCheckin(state);
  if (!c && sleepFrom(text) !== null) {
    c = { date: today(), sleepHours: sleepFrom(text), sore: null };
    state.checkins.push(c); save(state);
    return { text: `${c.sleepHours}시간이요. 어깨나 팔은 어때요?`, chips: ['괜찮아요', '조금 뻐근해요', '아파요'] };
  }
  if (c && c.sore === null) {
    c.sore = /아파|통증/.test(text) ? 'pain' : /뻐근|근육통|조금/.test(text) ? 'sore' : 'ok';
    save(state);
    if (c.sore === 'pain') return { text: '아프면 오늘은 쉬어요. 쉬는 것도 훈련이에요. 내일 다시 봐요.', chips: [] };
    if (c.sore === 'sore' || c.sleepHours < 6) return { text: '오늘은 강도를 조금 낮춰 뒀어요. 홈에서 시작해요!', chips: [] };
    return { text: '좋아요, 계획대로 가요. 홈에서 시작해요!', chips: [] };
  }
  if (/언제|얼마나/.test(text)) {
    const left = STAGES.length - (state.profile?.stage || 1);
    return { text: `지금 속도면 단계가 ${left}개 남았어요. 주 3회 꾸준히 하면 보통 몇 주 안에 한 단계씩 올라가요.`, chips: [] };
  }
  if (/뭐|오늘/.test(text)) return { text: '홈 화면에 오늘의 10분이 있어요. 끝나면 기록이 자동으로 쌓여요.', chips: [] };
  return { text: `좋아요. 지금 매달리기 최고 기록은 ${best(state, 'hang')}초예요. 계속 가 봐요!`, chips: [] };
}

export async function reply(state, text) {
  state.chat.push({ role: 'me', text, at: Date.now() });
  let out = ruleReply(state, text);
  const ep = state.settings.coachEndpoint;
  // 체크인 흐름은 규칙으로 처리하고, 자유 대화만 LLM에 맡긴다.
  const freeTalk = todaysCheckin(state)?.sore != null && !/^\d/.test(text);
  if (ep && freeTalk) {
    try {
      const res = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        system: '너는 철봉 0개에서 1개를 목표로 하는 사람을 돕는 다정하고 짧게 말하는 코치야. 한국어로 2~3문장. 통증은 쉬라고 해.',
        messages: state.chat.slice(-12).map(m => ({ role: m.role === 'me' ? 'user' : 'assistant', text: m.text })),
        context: { stage: state.profile?.stage, checkin: todaysCheckin(state), bestHang: best(state, 'hang'), bestNegative: best(state, 'negative') },
      }) });
      const j = await res.json();
      if (j.reply) out = { text: j.reply, chips: [] };
    } catch (e) { console.warn('coach endpoint 실패, 규칙 응답 사용', e); }
  }
  state.chat.push({ role: 'coach', text: out.text, at: Date.now() });
  save(state);
  return out;
}
