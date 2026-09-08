import './styles/base.css';
import './styles/shell.css';
import './styles/levels.css';
import { route, setGuard, startRouter } from './ui/router';
import { startScreen } from './ui/screens/start';
import { mapScreen } from './ui/screens/map';
import { levelScreen } from './ui/screens/level';
import { placeholderScreen } from './ui/screens/placeholder';
import { repairScreen } from './modes/repair';
import { dataScreen } from './ui/screens/data';
import { startQueue } from './telemetry/queue';
import { getSession, restoreSession } from './game/session';

const app = document.getElementById('app');
if (!app) {
  throw new Error('ไม่พบ #app ใน index.html');
}

route('/', startScreen);
route('/map', mapScreen);
route('/level/:id', levelScreen);
route('/data', dataScreen);
route('/explore', placeholderScreen('สำรวจสถาปัตยกรรม', 'eye'));
route('/repair', repairScreen);

setGuard((path) => (path !== '/' && !getSession() ? '/' : null));

restoreSession().finally(() => {
  startQueue();
  startRouter(app);
});
