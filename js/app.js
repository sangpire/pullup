import { load } from './store.js';
import * as V from './views.js';

const state = load();
const app = document.getElementById('app');
const tabs = document.querySelectorAll('#tabs button');

function go(tab) {
  tabs.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  if (!state.profile) return V.onboarding(app, state, () => go('home'));
  ({ home: V.home, coach: V.coach, progress: V.progress, settings: V.settings }[tab])(app, state, go);
  window.scrollTo(0, 0);
}
tabs.forEach(b => b.onclick = () => go(b.dataset.tab));
go('home');

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
