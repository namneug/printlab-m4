import './styles/base.css';
import { createLabScene } from './game/scene';
import { loadPrinterModel } from './game/loader';
import { createHud } from './ui/hud';

const app = document.getElementById('app');
if (!app) {
  throw new Error('ไม่พบ #app ใน index.html');
}

const lab = createLabScene(app, {
  gridSize: 2,
  target: [0, 0.22, 0],
  cameraPos: [0.75, 0.55, 0.85],
  autoRotate: true,
});

loadPrinterModel().then((printer) => {
  lab.scene.add(printer.root);
});

createHud(document.body);
