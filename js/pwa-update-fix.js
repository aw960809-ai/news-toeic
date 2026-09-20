/* V96.8.1.2 PWA update check fix */
(function () {
  const CURRENT_VERSION = '96.8.1';

  function setState(state, message) {
    const box = document.getElementById('pwaUpdateStatus');
    const btn = document.getElementById('pwaUpdateCheckBtn');

    if (box) {
      const icon =
        state === 'checking' ? '◌' :
        state === 'ok' ? '✓' :
        state === 'update' ? '↑' : '!';

      box.className = 'pwa-update-status ' + state;
      box.innerHTML =
        '<span>' + icon + '</span><b>' + message + '</b>';
    }

    if (btn) {
      btn.disabled = state === 'checking';
      btn.textContent =
        state === 'checking'
          ? '◌ 檢查中…'
          : '↻ 檢查程式更新';
    }
  }

  async function fixedUpdateCheck() {
    if (!('serviceWorker' in navigator)) {
      setState('error', '此瀏覽器不支援程式更新');
      return false;
    }

    setState('checking', '正在連線正式站檢查版本…');

    try {
      const url = new URL('./sw.js', location.href);
      url.searchParams.set('update_probe', Date.now());

      const res = await fetch(url.href, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });

      if (!res.ok) {
        throw new Error('HTTP ' + res.status);
      }

      const source = await res.text();

      const match = source.match(
        /const\s+PWA_VERSION\s*=\s*['"]([^'"]+)['"]/
      );

      if (!match) {
        throw new Error('找不到遠端版本號');
      }

      const remoteVersion = match[1];

      if (remoteVersion === CURRENT_VERSION) {
        const now = new Date().toLocaleTimeString(
          'zh-TW',
          { hour: '2-digit', minute: '2-digit' }
        );

        setState(
          'ok',
          '目前已是最新版本 V' +
            CURRENT_VERSION +
            ' · ' +
            now
        );

        return true;
      }

      setState(
        'update',
        '發現新版本 V' +
          remoteVersion +
          '，正在準備更新…'
      );

      const registration =
        await navigator.serviceWorker.getRegistration() ||
        await navigator.serviceWorker.ready;

      if (!registration) {
        throw new Error('找不到 Service Worker registration');
      }

      await registration.update();

      if (registration.waiting) {
        setState(
          'update',
          '新版本 V' +
            remoteVersion +
            ' 已下載，重新開啟 App 即可套用'
        );
      } else {
        setState(
          'update',
          '已偵測 V' +
            remoteVersion +
            '，重新開啟 App 後套用'
        );
      }

      return true;

    } catch (err) {
      console.error('PWA update check:', err);

      setState(
        'error',
        navigator.onLine === false
          ? '目前離線，無法檢查更新'
          : '檢查更新失敗：' +
            (err && err.message
              ? err.message
              : 'unknown')
      );

      return false;
    }
  }

  window.pwaCheckForUpdate = fixedUpdateCheck;
})();
