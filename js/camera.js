// 폰/노트북 카메라로 자세를 인식해 매달리기·내려오기 시간과 철봉 횟수를 잰다.
// MediaPipe Pose Landmarker(웹, 기기 안에서 실행)를 사용한다.
//
// 흐름: 카운트다운(3초) 동안 서 있는 자세를 '기준'으로 잡는다.
//       그 뒤 손이 머리 위 + 팔 펴짐 + 엉덩이/발이 기준보다 올라감(발이 뜸) 일 때만 '매달림'으로 본다.
//       그래서 손만 들고 서 있으면 시간이 올라가지 않는다.
const VISION = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const L = { nose: 0, lSh: 11, rSh: 12, lEl: 13, rEl: 14, lWr: 15, rWr: 16, lHip: 23, rHip: 24, lAn: 27, rAn: 28 };

export const COUNTDOWN_MS = 3000;
const LIFT = 0.04;        // 기준보다 이만큼(화면 높이 비율) 올라가야 발이 뜬 것으로 본다
const ON_MS = 300;        // 이만큼 연속으로 매달려야 시작
const OFF_MS = 500;       // 이만큼 연속으로 놓아야 끝 (깜빡임 방지)

let landmarker;
async function getLandmarker() {
  if (landmarker) return landmarker;
  const { FilesetResolver, PoseLandmarker } = await import(`${VISION}/vision_bundle.mjs`);
  const fileset = await FilesetResolver.forVisionTasks(`${VISION}/wasm`);
  landmarker = await PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' }, runningMode: 'VIDEO', numPoses: 1,
  });
  return landmarker;
}

function angle(a, b, c) { // b에서의 각도(도)
  const ab = [a.x - b.x, a.y - b.y], cb = [c.x - b.x, c.y - b.y];
  const cos = (ab[0] * cb[0] + ab[1] * cb[1]) / (Math.hypot(...ab) * Math.hypot(...cb) + 1e-6);
  return Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
}
const vis = (p, i) => (p[i]?.visibility ?? 1) > 0.5;
const avgY = (p, a, b) => (vis(p, a) && vis(p, b)) ? (p[a].y + p[b].y) / 2 : null;

// 서 있는 자세의 기준 높이 (엉덩이, 발목)
export function bodyLevel(p) { return { hip: avgY(p, L.lHip, L.rHip), ankle: avgY(p, L.lAn, L.rAn) }; }

// 한 프레임을 자세 상태로 바꾼다. base가 있으면 발이 떴는지도 본다.
// none: 안 보임 / stand: 바닥에 서 있음(손을 들었어도) / hang: 팔 편 매달림 / mid: 당기는 중 / top: 턱이 철봉 위
export function classify(p, base) {
  if (![L.nose, L.lSh, L.rSh, L.lEl, L.rEl, L.lWr, L.rWr].every(i => vis(p, i))) return 'none';
  const wristY = (p[L.lWr].y + p[L.rWr].y) / 2, shY = (p[L.lSh].y + p[L.rSh].y) / 2;
  if (wristY > shY) return 'stand';                          // 손이 어깨 아래
  if (base) {
    const now = bodyLevel(p);
    const liftedHip = base.hip != null && now.hip != null && now.hip < base.hip - LIFT;
    const liftedAnkle = base.ankle != null && now.ankle != null && now.ankle < base.ankle - LIFT;
    if (!liftedHip && !liftedAnkle) return 'stand';          // 손만 들고 서 있음
  }
  const elbow = (angle(p[L.lSh], p[L.lEl], p[L.lWr]) + angle(p[L.rSh], p[L.rEl], p[L.rWr])) / 2;
  if (p[L.nose].y < wristY) return 'top';
  if (elbow > 145) return 'hang';
  return 'mid';
}

// 모드별 측정기. 디바운스로 순간적인 인식 실패를 무시한다.
export function makeCounter(mode) {
  const s = { value: 0, best: 0, reps: 0, active: false };
  let onSince = null, offSince = null, start = null, wasTop = false, negStart = null;
  s.tick = (state, t) => {
    const onBar = state === 'hang' || state === 'mid' || state === 'top';
    if (mode === 'hang') {
      if (onBar) { offSince = null; onSince ??= t; if (!s.active && t - onSince >= ON_MS) { s.active = true; start = onSince; } }
      else { onSince = null; offSince ??= t; if (s.active && t - offSince >= OFF_MS) s.active = false; }
      if (s.active) { s.value = ((offSince ?? t) - start) / 1000; s.best = Math.max(s.best, s.value); } // 놓은 순간에서 멈춤
    } else if (mode === 'negative') {
      if (state === 'top') negStart = t;
      else if (state === 'mid' && negStart) s.value = (t - negStart) / 1000;
      else if ((state === 'hang' || !onBar) && negStart) { s.value = (t - negStart) / 1000; s.best = Math.max(s.best, s.value); negStart = null; }
      s.active = negStart != null;
    } else { // pullup
      if (state === 'top') wasTop = true;
      if (state === 'hang' && wasTop) { s.reps++; wasTop = false; }
      s.value = s.best = s.reps; s.active = onBar;
    }
    return s;
  };
  return s;
}

// 카메라 시작. 반환: { stop(), reset() }. reset은 기록을 지우고 카운트다운부터 다시 한다.
// onUpdate({ phase:'loading'|'countdown'|'tracking', left, value, best, unit, state, active })
export async function startCamera(video, canvas, mode, onUpdate) {
  onUpdate({ phase: 'loading' });
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 }, audio: false });
  video.srcObject = stream; await video.play();
  const lm = await getLandmarker();
  const ctx = canvas.getContext('2d');
  const unit = mode === 'pullup' ? '회' : '초';
  let running = true, counter, cdStart, samples, base;

  const reset = () => { counter = makeCounter(mode); cdStart = performance.now(); samples = []; base = null; };
  reset();

  const loop = () => {
    if (!running) return;
    const t = performance.now();
    const r = lm.detectForVideo(video, t);
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const p = r.landmarks?.[0];
    if (p) {
      ctx.fillStyle = base ? '#2E9E5B' : '#E8A33D';
      for (const i of Object.values(L)) if (vis(p, i)) ctx.beginPath(), ctx.arc(p[i].x * canvas.width, p[i].y * canvas.height, 6, 0, 7), ctx.fill();
    }
    if (!base) {
      // 카운트다운: 마지막 1초 동안 서 있는 자세를 모아 기준으로
      const left = COUNTDOWN_MS - (t - cdStart);
      if (p && left < 1000) { const b = bodyLevel(p); if (b.hip != null || b.ankle != null) samples.push(b); }
      if (left <= 0) {
        if (samples.length) {
          const med = k => { const v = samples.map(s => s[k]).filter(x => x != null).sort((a, b) => a - b); return v.length ? v[v.length >> 1] : null; };
          base = { hip: med('hip'), ankle: med('ankle') };
        } else cdStart = t; // 몸이 안 보였으면 카운트다운 다시
      }
      onUpdate({ phase: 'countdown', left: Math.max(0, left), seen: !!p, unit });
    } else {
      const state = p ? classify(p, base) : 'none';
      const s = counter.tick(state, t);
      onUpdate({ phase: 'tracking', value: s.value, best: s.best, active: s.active, unit, state });
    }
    requestAnimationFrame(loop);
  };
  loop();
  return {
    stop: () => { running = false; stream.getTracks().forEach(s => s.stop()); },
    reset,
  };
}
