// Built-in photo wallpapers (Unsplash License, via Lorem Picsum). The first one is the default.
import fjord from './assets/wallpapers/fjord.jpg';
import valley from './assets/wallpapers/valley.jpg';
import canyon from './assets/wallpapers/canyon.jpg';
import summit from './assets/wallpapers/summit.jpg';
import aurora from './assets/wallpapers/aurora.jpg';
import coast from './assets/wallpapers/coast.jpg';
import highland from './assets/wallpapers/highland.jpg';

export const WALLPAPERS = [
  { id: 'fjord', name: '피오르', src: fjord, credit: 'Alexey Topolyanskiy' },
  { id: 'valley', name: '계곡', src: valley, credit: 'Christian Joudrey' },
  { id: 'canyon', name: '협곡', src: canyon, credit: 'Philippe Wuyts' },
  { id: 'summit', name: '설산', src: summit, credit: 'Go Wild' },
  { id: 'aurora', name: '오로라', src: aurora, credit: 'Vashishtha Jogi' },
  { id: 'coast', name: '해안', src: coast, credit: 'Joseph Barrientos' },
  { id: 'highland', name: '고원', src: highland, credit: 'Andrew Ridley' },
];

export function wallpaperSrc(setting) {
  if (setting?.id === 'custom' && setting.src) return setting.src;
  return (WALLPAPERS.find((w) => w.id === setting?.id) || WALLPAPERS[0]).src;
}

// Uploaded photos are shrunk to screen size before saving so the app stays light.
export function shrinkImage(file, max = 2560) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url); resolve(canvas.toDataURL('image/jpeg', 0.86));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 읽을 수 없습니다.')); };
    img.src = url;
  });
}
