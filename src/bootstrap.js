const params = new URLSearchParams(location.search);
if (params.has('player') || params.has('room')) {
  document.body.classList.add('controller-view');
  document.getElementById('host-app').hidden = true;
  document.getElementById('controller-app').hidden = false;
  if (params.get('player') !== 'A' || !/^[A-Za-z0-9_-]{1,128}$/.test(params.get('room') ?? '')) {
    document.getElementById('controller-connection').textContent = '接続URLが正しくありません。PCのQRコードを読み直してください。';
  } else {
    const { startController } = await import('./controller.js?v=20260922-host-controller');
    startController(params.get('room'), { test: params.get('controllerTest') === '1' });
  }
} else await import('./app.js?v=20260922-host-controller');
