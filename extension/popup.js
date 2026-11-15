(() => {
  const DEFAULTS = { server: 'http://127.0.0.1:8787', enabled: true };
  const $ = id => document.getElementById(id);
  let checking = false;
  async function check() {
    if (checking) return;
    checking = true;
    const lines = [];
    try {
      const config = await chrome.storage.local.get(DEFAULTS);
      lines.push(`弹幕桥：${config.enabled ? '已启用' : '已停用'}`);
      try {
        const result = await chrome.runtime.sendMessage({ type: 'dafeiyu-request', action: 'health' });
        if (!result?.ok) throw new Error(result?.error || '后台未响应，请重新加载扩展');
        lines.push('本地服务：已连接 ✓');
      } catch (error) {
        lines.push(`本地服务：连接失败（${error.message}）`);
      }
      const candidates = await chrome.tabs.query({ url: ['https://live.douyin.com/*'] });
      const tabs = candidates.filter(tab => /^\/\d+\/?$/.test(new URL(tab.url).pathname));
      if (!tabs.length) lines.push('抖音网页：未打开。请在当前浏览器打开直播间；仅打开直播伴侣无效。');
      for (const tab of tabs) {
        try {
          const status = await chrome.tabs.sendMessage(tab.id, { type: 'dafeiyu-page-status' });
          if (!status?.ready) throw new Error('尚未启动');
          lines.push(`网页采集：运行中 · 已上报 ${status.caught || 0} 条 · 已回写 ${status.sent || 0} 条`);
          if (status.lastError) lines.push(`最近错误：${status.lastError}`);
        } catch {
          lines.push('网页采集：未运行，请刷新抖音直播间网页。');
        }
      }
    } catch (error) {
      lines.push(`检查失败：${error.message}`);
    } finally {
      $('stat').textContent = lines.join('\n');
      checking = false;
    }
  }
  chrome.storage.local.get(DEFAULTS, v => {
    $('server').value = v.server;
    $('enabled').checked = v.enabled !== false;
    check();
  });
  $('save').onclick = async () => {
    const server = $('server').value.trim().replace(/\/+$/, '') || DEFAULTS.server;
    try {
      const url = new URL(server);
      if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.username || url.password) throw new Error();
      await chrome.storage.local.set({ server: url.origin, enabled: $('enabled').checked });
      $('save').textContent = '已保存 ✓';
      setTimeout(() => ($('save').textContent = '保存设置'), 1200);
      await check();
    } catch {
      $('stat').textContent = '服务地址请填写 http://127.0.0.1:8787';
    }
  };
  $('check').onclick = check;
})();
