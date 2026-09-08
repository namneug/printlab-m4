import './styles/base.css';
import './styles/shell.css';
import { route, setGuard, startRouter } from './ui/router';
import { startScreen } from './ui/screens/start';
import { mapScreen } from './ui/screens/map';
import { levelScreen } from './ui/screens/level';
import { placeholderScreen } from './ui/screens/placeholder';
import { getSession, restoreSession } from './game/session';

const app = document.getElementById('app');
if (!app) {
  throw new Error('ไม่พบ #app ใน index.html');
}

route('/', startScreen);
route('/map', mapScreen);
route('/level/:id', levelScreen);
route('/explore', placeholderScreen('สำรวจสถาปัตยกรรม', 'eye'));
route('/repair', placeholderScreen('โมดูลซ่อม', 'wrench'));

setGuard((path) => (path !== '/' && !getSession() ? '/' : null));

restoreSession().finally(() => startRouter(app));
