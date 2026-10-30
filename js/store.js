// localStorage 기반 저장소. 서버 없이 기기 안에만 저장한다.
const KEY = 'pullup:v1';

const defaults = () => ({
  profile: null,            // { stage, testedAt, hangSec, negSec, pullups }
  logs: [],                 // { date, exercise, value, unit }
  checkins: [],             // { date, sleepHours, sore }
  chat: [],                 // { role: 'coach'|'me', text, at }
  settings: { coachEndpoint: '', sound: true },
});

export function load() {
  try { return { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return defaults(); }
}
export function save(state) { localStorage.setItem(KEY, JSON.stringify(state)); }

export const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD (로컬)

export function addLog(state, exercise, value, unit) {
  state.logs.push({ date: today(), exercise, value: Math.round(value * 10) / 10, unit });
  save(state);
}
export function todaysLogs(state) { return state.logs.filter(l => l.date === today()); }
export function best(state, exercise) {
  return state.logs.filter(l => l.exercise === exercise).reduce((m, l) => Math.max(m, l.value), 0);
}
export function todaysCheckin(state) { return state.checkins.find(c => c.date === today()); }
