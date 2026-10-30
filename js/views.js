// 화면 렌더링. 프레임워크 없이 템플릿 문자열로 그린다.
import { STAGES, todaysPlan, stageFromTest, EX_LABEL, CAMERA_EX } from './program.js';
import { save, addLog, todaysLogs, todaysCheckin, best } from './store.js';
import { greeting, reply } from './coach.js';
import { startCamera } from './camera.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let stopCam = null;
function cleanup() { if (stopCam) { stopCam(); stopCam = null; } }

// ---------- 수준 테스트 ----------
export function onboarding(app, state, done) {
  cleanup();
  app.innerHTML = `
    <h1>철봉 한 개까지</h1>
    <p class="muted">지금 수준을 알면 딱 맞는 단계부터 시작할 수 있어요. 모르면 0으로 두세요.</p>
    <div class="card">
      <label>철봉에 몇 초 매달릴 수 있어요?</label><input id="t-hang" type="number" min="0" value="0" inputmode="numeric">
      <label>위에서 천천히 내려오기, 몇 초 버텨요?</label><input id="t-neg" type="number" min="0" value="0" inputmode="numeric">
      <label>철봉 몇 개 할 수 있어요?</label><input id="t-pull" type="number" min="0" value="0" inputmode="numeric">
    </div>
    <button class="btn" id="t-go">시작 단계 정하기</button>`;
  $('#t-go').onclick = () => {
    const t = { hangSec: +$('#t-hang').value || 0, negSec: +$('#t-neg').value || 0, pullups: +$('#t-pull').value || 0 };
    state.profile = { ...t, stage: stageFromTest(t), testedAt: Date.now() };
    if (t.hangSec) addLog(state, 'hang', t.hangSec, '초');
    if (t.negSec) addLog(state, 'negative', t.negSec, '초');
    save(state); done();
  };
}

// ---------- 홈 ----------
export function home(app, state, go) {
  cleanup();
  const { stage, plan, note, rest } = todaysPlan(state.profile.stage, todaysCheckin(state));
  const logs = todaysLogs(state);
  const doneSets = ex => logs.filter(l => l.exercise === ex).length;
  const pct = Math.round(((stage.id - 1) / STAGES.length) * 100);
  const h = new Date().getHours();
  app.innerHTML = `
    <p class="muted">${h < 12 ? '좋은 아침이에요' : h < 18 ? '좋은 오후예요' : '좋은 저녁이에요'}</p>
    <h1>한 개까지 ${STAGES.length - stage.id + 1}단계</h1>
    <div class="card">
      <div class="muted">현재 단계 ${stage.id} / ${STAGES.length}</div>
      <div style="font-size:22px;font-weight:700;margin:4px 0 10px">${stage.name}</div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="muted" style="margin-top:8px">다음 단계 조건: ${stage.goal}</div>
    </div>
    <h2>오늘의 10분</h2>
    ${rest ? '<div class="card">오늘은 쉬는 날이에요. 푹 자요.</div>' : plan.map(p => {
      const d = doneSets(p.ex) >= p.sets;
      return `<div class="card ex ${d ? 'done' : ''}" data-ex="${p.ex}" data-unit="${p.unit}" data-target="${p.target}">
        <span class="dot"></span><span class="name">${p.name}</span>
        <span class="muted">${p.target}${p.unit} × ${p.sets} (${Math.min(doneSets(p.ex), p.sets)}/${p.sets})</span></div>`;
    }).join('')}
    ${note || !todaysCheckin(state) ? `<div class="card soft">${note || '코치에게 오늘 컨디션을 알려주면 강도를 맞춰 줘요.'}</div>` : ''}
    ${rest ? '' : '<button class="btn" id="start">훈련 시작</button>'}`;
  app.querySelectorAll('.ex').forEach(el => el.onclick = () => workout(app, state, el.dataset.ex, go));
  const next = plan.find(p => doneSets(p.ex) < p.sets);
  const s = $('#start');
  if (s) s.onclick = () => next ? workout(app, state, next.ex, go) : alert('오늘 훈련 끝! 수고했어요 👏');
}

// ---------- 훈련 (카메라 또는 직접 입력) ----------
function beep() {
  try { const a = new AudioContext(), o = a.createOscillator(); o.frequency.value = 880; o.connect(a.destination); o.start(); o.stop(a.currentTime + .15); } catch {}
}

export function workout(app, state, ex, go) {
  cleanup();
  const plan = todaysPlan(state.profile.stage, todaysCheckin(state)).plan.find(p => p.ex === ex) || { name: EX_LABEL[ex], target: 1, unit: '회', sets: 1 };
  const cam = CAMERA_EX.includes(ex);
  const setNo = todaysLogs(state).filter(l => l.exercise === ex).length + 1;
  app.innerHTML = `
    <div class="row"><h1 style="margin:0">${plan.name}</h1><span class="muted">${setNo}/${plan.sets}세트</span></div>
    <p class="muted">목표 ${plan.target}${plan.unit}</p>
    ${cam ? `<div class="camera"><video playsinline muted></video><canvas></canvas>
      <div class="hud"><div class="big" id="val">–</div><div id="hint">카메라를 켜고 몸 전체와 손이 보이게 세워 두세요</div></div></div>
      <div style="display:flex;gap:10px;margin-top:14px"><button class="btn ghost" id="camon">카메라 켜기</button><button class="btn" id="save">세트 끝</button></div>
      <p class="muted">카메라가 어렵다면 아래에 직접 입력해도 돼요.</p>` : ''}
    <div class="card"><label>기록 (${plan.unit})</label><input id="manual" type="number" min="0" step="0.5" inputmode="decimal" placeholder="${plan.target}"></div>
    ${cam ? '' : '<button class="btn" id="save">세트 끝</button>'}
    <button class="btn ghost" id="back" style="margin-top:10px">홈으로</button>`;
  let measured = 0;
  if (cam) {
    $('#camon').onclick = async () => {
      $('#hint').textContent = '모델 불러오는 중…';
      try {
        stopCam = await startCamera($('video'), $('canvas'), ex, u => {
          measured = u.best;
          $('#val').textContent = `${u.value.toFixed(u.unit === '초' ? 1 : 0)}${u.unit}`;
          $('#hint').textContent = { none: '손과 몸이 보이게 해 주세요', hang: '매달리는 중', mid: '버티는 중', top: '턱이 철봉 위!' }[u.state];
        });
      } catch (e) { $('#hint').textContent = '카메라를 쓸 수 없어요. 직접 입력해 주세요.'; console.error(e); }
    };
  }
  $('#save').onclick = () => {
    const v = parseFloat($('#manual').value) || measured;
    if (!v) return alert('기록이 없어요. 카메라로 재거나 직접 입력해 주세요.');
    addLog(state, ex, v, plan.unit); cleanup(); if (state.settings.sound) beep();
    const stage = STAGES[state.profile.stage - 1];
    const helpers = { best: e => best(state, e) };
    if (stage.passes(helpers) && state.profile.stage < STAGES.length) {
      state.profile.stage++; save(state);
      alert(`🎉 다음 단계로! 이제 "${STAGES[state.profile.stage - 1].name}" 단계예요.`);
    } else if (ex === 'pullup' && v >= 1) alert('🎉 첫 한 개! 정말 해냈어요!');
    go('home');
  };
  $('#back').onclick = () => { cleanup(); go('home'); };
}

// ---------- 코치 ----------
export function coach(app, state) {
  cleanup();
  if (!state.chat.length || state.chat.at(-1).at < new Date().setHours(0, 0, 0, 0)) {
    const g = greeting(state); state.chat.push({ role: 'coach', text: g.text, at: Date.now(), chips: g.chips }); save(state);
  }
  const draw = (chips = state.chat.at(-1)?.chips || []) => {
    app.innerHTML = `<h1>코치</h1><div class="chat">${state.chat.slice(-30).map(m => `<div class="msg ${m.role}">${esc(m.text)}</div>`).join('')}</div>
      <div class="chips">${chips.map(c => `<button class="chip">${esc(c)}</button>`).join('')}</div>
      <form class="composer"><input id="say" placeholder="메시지 입력…" autocomplete="off"><button class="btn small">보내기</button></form>`;
    const send = async t => { if (!t.trim()) return; const r = await reply(state, t.trim()); state.chat.at(-1).chips = r.chips; save(state); draw(r.chips); };
    app.querySelectorAll('.chip').forEach(b => b.onclick = () => send(b.textContent));
    $('form', app).onsubmit = e => { e.preventDefault(); send($('#say').value); };
    window.scrollTo(0, document.body.scrollHeight);
  };
  draw();
}

// ---------- 기록 ----------
export function progress(app, state) {
  cleanup();
  const series = ex => {
    const byDay = {};
    state.logs.filter(l => l.exercise === ex).forEach(l => byDay[l.date] = Math.max(byDay[l.date] || 0, l.value));
    return Object.entries(byDay).sort().slice(-14);
  };
  const s = state.profile.stage;
  app.innerHTML = `<h1>성장 기록</h1>
    <div class="row"><span class="muted">매달리기 하루 최고(초)</span><b>최고 ${best(state, 'hang')}초</b></div>
    <div class="card"><canvas class="chart" id="chart"></canvas></div>
    <div class="row"><span class="muted">느리게 내려오기 최고</span><b>${best(state, 'negative')}초</b></div>
    <h2>단계</h2>
    <ul class="steps">${STAGES.map(st => `<li class="${st.id < s ? 'done' : st.id === s ? 'cur' : 'todo'}"><span class="s"></span>${st.name}${st.id === s ? ' ← 지금' : ''}</li>`).join('')}</ul>`;
  const data = series('hang'), c = $('#chart'), ctx = c.getContext('2d');
  c.width = c.clientWidth * 2; c.height = 360; ctx.scale(2, 2);
  const w = c.clientWidth, h = 180, max = Math.max(10, ...data.map(d => d[1]));
  if (!data.length) { ctx.fillStyle = '#8a8a8a'; ctx.font = '14px sans-serif'; ctx.fillText('아직 기록이 없어요', 12, 90); return; }
  ctx.strokeStyle = '#2F6FEB'; ctx.lineWidth = 3; ctx.beginPath();
  data.forEach(([, v], i) => { const x = 16 + i * (w - 32) / Math.max(1, data.length - 1), y = h - 16 - v / max * (h - 40); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.stroke();
}

// ---------- 설정 ----------
export function settings(app, state, go) {
  cleanup();
  app.innerHTML = `<h1>나</h1>
    <div class="card"><label>코치 LLM 엔드포인트 (선택)</label>
      <input id="ep" placeholder="https://your-worker.example.com/coach" value="${esc(state.settings.coachEndpoint)}">
      <p class="muted">비워 두면 무료 규칙 기반 코치로 동작해요. API 키는 여기 말고 서버에 두세요.</p>
      <label><input type="checkbox" id="snd" ${state.settings.sound ? 'checked' : ''} style="width:auto"> 세트 끝 알림음</label>
    </div>
    <button class="btn" id="sv">저장</button>
    <button class="btn ghost" id="retest" style="margin-top:10px">수준 테스트 다시 하기</button>
    <button class="btn ghost" id="reset" style="margin-top:10px">모든 기록 지우기</button>`;
  $('#sv').onclick = () => { state.settings.coachEndpoint = $('#ep').value.trim(); state.settings.sound = $('#snd').checked; save(state); alert('저장했어요'); };
  $('#retest').onclick = () => { state.profile = null; save(state); go('home'); };
  $('#reset').onclick = () => { if (confirm('정말 모든 기록을 지울까요?')) { localStorage.clear(); location.reload(); } };
}
