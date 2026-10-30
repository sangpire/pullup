// 0개에서 한 개까지 가는 6단계 사다리.
// 각 단계는 오늘의 운동 목록과 다음 단계로 넘어가는 기준을 가진다.
export const STAGES = [
  { id: 1, name: '매달리기', goal: '매달리기 30초',
    plan: [{ ex: 'hang', name: '매달리기', sets: 3, target: 15, unit: '초' }],
    passes: s => s.best('hang') >= 30 },
  { id: 2, name: '어깨 당기기', goal: '매달리기 40초 + 어깨 당기기 10회',
    plan: [{ ex: 'hang', name: '매달리기', sets: 3, target: 25, unit: '초' },
           { ex: 'scap', name: '어깨 당기기', sets: 3, target: 8, unit: '회' }],
    passes: s => s.best('hang') >= 40 && s.best('scap') >= 10 },
  { id: 3, name: '호주식 당기기', goal: '호주식 당기기 12회',
    plan: [{ ex: 'row', name: '호주식 당기기(낮은 철봉)', sets: 3, target: 8, unit: '회' },
           { ex: 'hang', name: '매달리기', sets: 2, target: 30, unit: '초' }],
    passes: s => s.best('row') >= 12 },
  { id: 4, name: '느리게 내려오기', goal: '내려오기 5초 × 여러 번',
    plan: [{ ex: 'negative', name: '느리게 내려오기', sets: 4, target: 5, unit: '초' },
           { ex: 'scap', name: '어깨 당기기', sets: 2, target: 10, unit: '회' }],
    passes: s => s.best('negative') >= 8 },
  { id: 5, name: '밴드 보조', goal: '밴드 보조 철봉 5회',
    plan: [{ ex: 'band', name: '밴드 보조 철봉', sets: 3, target: 4, unit: '회' },
           { ex: 'negative', name: '느리게 내려오기', sets: 2, target: 8, unit: '초' }],
    passes: s => s.best('band') >= 5 || s.best('pullup') >= 1 },
  { id: 6, name: '한 개!', goal: '맨몸 철봉 1회',
    plan: [{ ex: 'pullup', name: '철봉 시도', sets: 3, target: 1, unit: '회' },
           { ex: 'negative', name: '느리게 내려오기', sets: 2, target: 10, unit: '초' }],
    passes: s => s.best('pullup') >= 1 },
];

// 수준 테스트 결과로 시작 단계를 정한다.
export function stageFromTest({ hangSec, negSec, pullups }) {
  if (pullups >= 1) return 6;
  if (negSec >= 5) return 5;
  if (hangSec >= 40) return 4;
  if (hangSec >= 30) return 3;
  if (hangSec >= 15) return 2;
  return 1;
}

// 컨디션(잠, 근육통)에 따라 오늘 볼륨을 조절한다. 규칙은 코드로, 말투만 LLM이.
export function todaysPlan(stageId, checkin) {
  const stage = STAGES[stageId - 1];
  let factor = 1, note = '';
  if (checkin) {
    if (checkin.sore === 'pain') { factor = 0; note = '통증이 있으면 오늘은 쉬어요.'; }
    else if (checkin.sleepHours < 6 || checkin.sore === 'sore') { factor = 0.6; note = '컨디션에 맞춰 강도를 낮췄어요.'; }
  }
  const plan = stage.plan.map(p => ({ ...p, sets: Math.max(factor ? 1 : 0, Math.round(p.sets * factor)) }));
  return { stage, plan, note, rest: factor === 0 };
}

export const EX_LABEL = { hang: '매달리기', scap: '어깨 당기기', row: '호주식 당기기', negative: '느리게 내려오기', band: '밴드 보조', pullup: '철봉' };
export const CAMERA_EX = ['hang', 'negative', 'pullup']; // 카메라로 자동 측정되는 운동
