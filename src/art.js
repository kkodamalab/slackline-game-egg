const drawings = {
  EGG: '<path d="M50 5C25 5 14 47 14 66c0 38 72 38 72 0C86 47 75 5 50 5Z" fill="#fff8de" stroke="#c8b887" stroke-width="3"/>',
  BALL: '<circle cx="50" cy="50" r="44" fill="#64b7e6" stroke="#2878a2" stroke-width="3"/><path d="M8 50h84M50 6c-28 24-28 64 0 88M50 6c28 24 28 64 0 88" fill="none" stroke="#ffda65" stroke-width="7"/>',
  APPLE: '<path d="M50 29C14 9 1 48 17 78c15 27 28 8 33 12 10 9 29 1 36-19 15-36-8-57-36-42Z" fill="#ef6862" stroke="#b9443f" stroke-width="3"/><path d="M50 30V10" stroke="#805b35" stroke-width="6"/><path d="M52 18Q55 0 79 6Q75 22 52 18" fill="#79ab4b"/>',
  CHICK: '<ellipse cx="50" cy="56" rx="39" ry="37" fill="#ffe26d" stroke="#c9a03b" stroke-width="3"/><path d="M38 21Q22 1 45 12Q58-3 58 20" fill="#ffe26d" stroke="#c9a03b" stroke-width="3"/><path d="M38 94l-8 3m32-3 8 3" stroke="#dc922e" stroke-width="5"/><path d="M43 64l7 9 7-9Z" fill="#ed9b34"/>',
};
export function objectSVG(type) {
  const face = type === 'BALL' ? '' : '<circle cx="37" cy="54" r="3" fill="#354637"/><circle cx="63" cy="54" r="3" fill="#354637"/>' + (type === 'CHICK' ? '' : '<path d="M43 65q7 8 14 0" fill="none" stroke="#354637" stroke-width="3" stroke-linecap="round"/>');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 105" aria-hidden="true">${drawings[type] ?? drawings.EGG}${face}</svg>`;
}
export function renderObject(element, type, image = null) {
  element.replaceChildren();
  if (image) { const img = document.createElement('img'); img.src = image; img.alt = '選んだ作品'; element.append(img); }
  else element.innerHTML = objectSVG(type);
}
