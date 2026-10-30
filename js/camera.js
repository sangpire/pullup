// 폰/노트북 카메라로 자세를 인식해 매달리기·내려오기 시간과 철봉 횟수를 잰다.
// MediaPipe Pose Landmarker(웹, 기기 안에서 실행)를 사용한다.
const VISION = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const L = { nose: 0, lSh: 11, rSh: 12, lEl: 13, rEl: 14, lWr: 15, rWr: 16 };

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

// 한 프레임의 랜드마크를 자세 상태로 바꾼다.
export function classify(p) {
  const vis = i => (p[i]?.visibility ?? 1) > 0.5;
  if (![L.nose, L.lSh, L.rSh, L.lEl, L.rEl, L.lWr, L.rWr].every(vis)) return 'none';
  const wristY = (p[L.lWr].y + p[L.rWr].y) / 2, shY = (p[L.lSh].y + p[L.rSh].y) / 2;
  if (wristY > shY) return 'none';                       // 손이 어깨 아래 = 철봉을 잡지 않음
  const elbow = (angle(p[L.lSh], p[L.lEl], p[L.lWr]) + angle(p[L.rSh], p[L.rEl], p[L.rWr])) / 2;
  if (p[L.nose].y < wristY) return 'top';                // 턱(코)이 손목보다 위
  if (elbow > 150) return 'hang';                        // 팔을 편 매달리기
  return 'mid';
}

// 모드별 측정기. onUpdate({ value, label, state })
export function makeCounter(mode, onUpdate) {
  let hangStart = null, bestHang = 0, reps = 0, wasTop = false, negStart = null, lastNeg = 0;
  return (state, t) => {
    if (mode === 'hang') {
      if (state === 'hang' || state === 'mid') { hangStart ??= t; bestHang = Math.max(bestHang, (t - hangStart) / 1000); }
      else hangStart = null;
      onUpdate({ value: hangStart ? (t - hangStart) / 1000 : bestHang, best: bestHang, unit: '초', state });
    } else if (mode === 'negative') {
      if (state === 'top') negStart = t;
      else if (state === 'mid' && negStart) lastNeg = (t - negStart) / 1000;
      else if (state === 'hang' && negStart) { lastNeg = (t - negStart) / 1000; negStart = null; }
      onUpdate({ value: lastNeg, best: lastNeg, unit: '초', state });
    } else { // pullup
      if (state === 'top' && !wasTop) wasTop = true;
      if (state === 'hang' && wasTop) { reps++; wasTop = false; }
      onUpdate({ value: reps, best: reps, unit: '회', state });
    }
  };
}

export async function startCamera(video, canvas, mode, onUpdate) {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 }, audio: false });
  video.srcObject = stream; await video.play();
  const lm = await getLandmarker();
  const ctx = canvas.getContext('2d');
  const tick = makeCounter(mode, onUpdate);
  let running = true;
  const loop = () => {
    if (!running) return;
    const t = performance.now();
    const r = lm.detectForVideo(video, t);
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const p = r.landmarks?.[0];
    if (p) {
      ctx.fillStyle = '#2E9E5B';
      for (const i of Object.values(L)) ctx.beginPath(), ctx.arc(p[i].x * canvas.width, p[i].y * canvas.height, 6, 0, 7), ctx.fill();
      tick(classify(p), t);
    } else tick('none', t);
    requestAnimationFrame(loop);
  };
  loop();
  return () => { running = false; stream.getTracks().forEach(s => s.stop()); };
}
