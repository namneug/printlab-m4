import './styles/base.css';
import { createLabScene } from './game/scene';
import { createHud } from './ui/hud';

const app = document.getElementById('app');
if (!app) {
  throw new Error('ไม่พบ #app ใน index.html');
}

createLabScene(app);
createHud(document.body);
