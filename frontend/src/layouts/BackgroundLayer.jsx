import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { DEFAULT_BACKGROUNDS, getCategoryBackground, usesSolidBackground } from './backgrounds.js';

const imageCache = new Set();

export default function BackgroundLayer() {
  const location = useLocation();
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');
  const [category, setCategory] = useState(() => document.documentElement.dataset.category || '');
  const [visibleSource, setVisibleSource] = useState(DEFAULT_BACKGROUNDS.light);
  const [pendingSource, setPendingSource] = useState('');
  const [readySource, setReadySource] = useState('');
  const solidBackground = usesSolidBackground(location.pathname);
  const selected = location.pathname === '/catalogue' ? getCategoryBackground(category) : null;
  const source = (selected || DEFAULT_BACKGROUNDS)[theme] || DEFAULT_BACKGROUNDS[theme];

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setTheme(root.dataset.theme === 'dark' ? 'dark' : 'light');
      setCategory(root.dataset.category || '');
    });
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-category'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (solidBackground) return;
    for (const preload of Object.values(DEFAULT_BACKGROUNDS)) {
      if (imageCache.has(preload)) continue;
      const image = new Image();
      image.onload = () => imageCache.add(preload);
      image.src = preload;
    }
  }, [solidBackground]);

  useEffect(() => {
    if (source === visibleSource) return;
    if (imageCache.has(source)) { setVisibleSource(source); setPendingSource(''); setReadySource(''); return; }
    setPendingSource(source);
    setReadySource('');
  }, [source, theme, visibleSource]);

  function finishFade() {
    if (!readySource || readySource !== pendingSource) return;
    setVisibleSource(readySource);
    setPendingSource('');
    setReadySource('');
  }

  return <div className={`site-background${solidBackground ? ' site-background-solid' : ''}${theme === 'dark' ? ' site-background-dark' : ''}`} aria-hidden="true">
    {!solidBackground && <>
      <img src={visibleSource} alt="" />
      {pendingSource && <img className="site-background-next" data-ready={readySource === pendingSource} src={pendingSource} alt="" onLoad={() => { imageCache.add(pendingSource); setReadySource(pendingSource); }} onError={() => { setPendingSource(''); setReadySource(''); }} onTransitionEnd={finishFade} />}
    </>}
  </div>;
}
