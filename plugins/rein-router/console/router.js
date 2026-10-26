/* Magpie's native page kernel and UI kit; no duplicated provider editor. */
magpie.plugin('rein-router', ctx => {
  ctx.slots.add('page', {
    key: 'rein-router', title: 'OpenClaw Router',
    html: `<div class="rein-console"><header class="rein-heading"><div><p class="rein-eyebrow">OPENCLAW × MAGPIE</p><h1>模型配置一次，任务自动选路</h1><p>Provider 与模型在 Magpie 管理。这里配置 OpenClaw 如何使用它们。</p></div><span class="rein-status" id="rein-sync">尚未连接</span></header>
    <div class="rein-flow" aria-label="请求流程"><span>Discord / Slack</span><i>→</i><b>OpenClaw</b><i>→</i><span>Dynamic Router</span><i>→</i><b>Magpie Providers</b></div>
    <div id="rein-message" role="status" aria-live="polite"></div>
    <section class="rein-section"><div class="rein-section-head"><div><h2>1. Provider 与模型</h2><p>直接来自 Magpie。新增或移除模型后，每 5 秒自动同步。</p></div><button type="button" class="text" id="rein-providers">管理 Providers ↗</button></div><div id="rein-catalog"></div></section>
    <section class="rein-section"><div class="rein-section-head"><div><h2>2. 任务路由与思考强度</h2><p>选择适合的模型；推荐值只是起点，可按实际效果调整。</p></div><button type="button" class="text" id="rein-recommend">使用推荐策略</button></div><div id="rein-policy"></div></section>
    <section class="rein-section"><div class="rein-section-head"><div><h2>3. Dynamic Router</h2><p>Jev 判断任务类型、复杂度及是否需要上下文，再选择模型与思考强度。</p></div></div><div id="rein-dynamic"></div></section>
    <details class="rein-advanced"><summary>回退顺序与管理员编码任务</summary><div id="rein-fallbacks"></div><label class="rein-field">管理员身份（每行 channel/accountId/senderId）<textarea id="rein-admins" rows="3" placeholder="discord/default/YOUR_USER_ID"></textarea></label><p>管理员编码任务优先使用 high 思考强度；这里的身份配置不授予工具权限。</p></details>
    <footer class="rein-save"><div><strong>连接到现有 OpenClaw</strong><p>保存后自动合并配置。首次连接后启动或重启 OpenClaw，后续目录变更自动更新。</p></div><div class="rein-actions"><button type="button" id="rein-pause" class="text" hidden>暂停路由</button><button type="button" id="rein-save" class="text primary">保存并连接 OpenClaw</button></div></footer>
    <p class="rein-footnote">OpenClaw 就是你的 harness，无需连接 Magpie 的 Agents。手动选模型时使用 /model；自动模式使用 /model auto。</p></div>`,
    mount() { document.addEventListener('visibilitychange', () => { if (!document.hidden && !document.getElementById('view-rein-router').hidden && !dirty) void load(); }); },
    open() { return load(); },
  });
  let state, settings, policy, dirty = false;
  const refreshTimer = setInterval(() => {
    if (!document.hidden && !document.getElementById('view-rein-router').hidden && !dirty) void load();
  }, 5000);
  ctx.onDispose(() => clearInterval(refreshTimer));
  const $r = s => document.querySelector('#view-rein-router ' + s);
  const el = ctx.ui.el;
  const roleNames = { general: ['默认 / 需要上下文', '分类不确定、对话关联和多步骤任务'],
    quick: ['简单日常问答', '独立问题，无需历史上下文，优先节省 token'],
    research: ['检索与网页总结', '需要工具、资料检索与综合分析'], code: ['编码与复杂开发', '开发、调试、代码评审；管理员任务使用高强度'] };
  const messages = {
    router_catalog_empty: '还没有可用模型，请先在 Providers 添加并启用模型。',
    router_no_eligible_models: '请选择 Provider 的计费来源并确认额度设置。',
    router_capable_default_required: '默认策略需要支持 medium 或 high 的模型。请在 Providers 启用合适的模型，并确认计费设置后重新保存。',
    router_jev_key_required: '启用 Dynamic Router 前，请在此页面或项目私有配置文件中保存 Jev API Key；不使用 shell 环境变量。',
    router_coding_plan_scope: 'Coding Plan 仅用于编码路由；请为通用任务选择其他 Provider。',
    router_catalog_limit: '可用模型过多。请在 Magpie 缩小暴露给 OpenClaw 的模型目录（最多 60 个）。',
    router_config_changed_retry: 'OpenClaw 配置刚刚发生变化，请重新保存。',
    router_magpie_api_failed: 'Magpie 暂时不可用，请检查控制台终端。',
    router_sync_failed: '同步未完成，模型调用已暂停。请检查模型策略、计费设置与本地配置。',
  };
  const labelError = error => messages[error] ?? (/^router_policy_model_missing_/.test(error) ? '策略引用的模型已被移除，请选择一个当前可用的模型。' :
    /^router_policy_effort_invalid_/.test(error) ? '模型不再支持该思考强度，请重新选择。' : '未能保存配置，请检查当前模型和终端状态。');
  async function api(path, body) {
    const response = await fetch('/_rein/api/' + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error); return data;
  }
  function message(text, error = false) { const node = $r('#rein-message'); node.textContent = text; node.className = error ? 'rein-error' : 'rein-notice'; node.hidden = !text; }
  function changed() { dirty = true; $r('#rein-sync').textContent = '有未保存的更改'; $r('#rein-sync').classList.remove('connected'); $r('#rein-save').textContent = '保存并连接 OpenClaw'; }
  async function load() {
    if (dirty) return;
    try { state = await api('state'); settings = structuredClone(state.settings); policy = { ...state.recommendations, ...settings.policy }; render(); }
    catch (e) { message(labelError(e.message), true); }
  }
  function render() {
    $r('#rein-sync').textContent = state.error ? '同步暂停' : settings.enabled ? '已连接 · 自动同步' : '等待连接';
    $r('#rein-sync').classList.toggle('connected', settings.enabled && !state.error);
    message(state.error ? labelError(state.error) : '', Boolean(state.error));
    $r('#rein-providers').onclick = () => show('providers');
    $r('#rein-recommend').onclick = () => { policy = structuredClone(state.recommendations); changed(); renderPolicy(); };
    const box = $r('#rein-catalog'); box.replaceChildren();
    if (!state.catalog.length) box.append(el('p', 'rein-empty', '在 Providers 登录账号或添加 API Provider，并启用需要的模型。无需安装其他 Agent。'));
    const providers = [...new Set(state.catalog.map(m => m.providerId))];
    for (const id of providers) {
      const models = state.catalog.filter(m => m.providerId === id);
      settings.funding ??= {}; settings.funding[id] ??= { mode: 'subscription', confirmed: false };
      const funding = settings.funding[id];
      const card = el('div', 'rein-provider');
      const title = el('div', 'rein-provider-title'); title.append(el('strong', '', models[0].provider), el('span', 'rein-count', models.length + ' 个模型 · 自动同步'));
      card.append(title);
      const list = el('div', 'rein-model-list');
      for (const m of models) {
        const row = el('div', 'rein-model'); row.append(el('span', '', m.name), el('code', '', m.id),
          el('small', '', `${Math.round(m.contextWindow / 1024)}k context · ${m.efforts.join(' / ')}${m.limitsKnown ? '' : ' · 保守窗口'}`));
        list.append(row);
      }
      card.append(list);
      const fundingMenu = ctx.ui.menu([{ v: 'subscription', name: '订阅额度' }, { v: 'coding-plan', name: 'Coding Plan' }, { v: 'pay-as-you-go', name: 'API 按量付费' }],
        funding.mode, '计费来源', v => { funding.mode = v; funding.confirmed = false; changed(); render(); });
      card.append(ctx.ui.row('计费来源', '仅设置调用边界，账号和模型继续在 Providers 管理。', fundingMenu));
      card.append(ctx.ui.row('已确认此 Provider 的额度与额外用量设置', '新增模型继承此 Provider 的边界；新增 Provider 默认不启用。',
        ctx.ui.toggle(funding.confirmed, '确认 ' + models[0].provider + ' 计费设置', v => { funding.confirmed = v; changed(); })));
      if (models.some(m => m.hasFallback)) card.append(el('p', 'rein-error', '此 Provider 配有内部回退，请在 Providers 移除回退后再用于 OpenClaw。回退顺序在下方统一配置。'));
      box.append(card);
    }
    renderPolicy(); renderDynamic(); renderFallbacks();
    $r('#rein-admins').value = (settings.adminSenders ?? []).map(a => [a.channel,a.accountId,a.senderId].join('/')).join('\n');
    $r('#rein-admins').oninput = changed;
    $r('#rein-save').onclick = save;
    $r('#rein-pause').hidden = !settings.enabled;
    $r('#rein-pause').onclick = async () => {
      try {
        state = await api('settings', { settings: { ...settings, enabled: false } });
        settings = structuredClone(state.settings); dirty = false; render();
        message('路由已暂停。保存并连接 OpenClaw 可重新启用。');
      } catch (e) { message(labelError(e.message), true); }
    };
  }
  function renderPolicy() {
    const box = $r('#rein-policy'); box.replaceChildren();
    for (const [role, [title, description]] of Object.entries(roleNames)) {
      const row = el('div', 'rein-policy-row'); const text = el('div', 'who'); text.append(el('strong', '', title), el('p', '', description)); row.append(text);
      const pick = policy[role];
      const options = state.catalog.map(m => ({ v: m.id, name: `${m.provider} · ${m.name}` }));
      const controls = el('div', 'rein-policy-controls');
      const modelButton = ctx.ui.menu(options, pick?.model ?? '', '模型', value => {
        const m = state.catalog.find(m => m.id === value); policy[role] = { model: value, effort: m.efforts.at(-1) }; changed(); renderPolicy();
      });
      modelButton.setAttribute('aria-label', title + '模型'); controls.append(modelButton);
      const model = state.catalog.find(m => m.id === pick?.model);
      const effortButton = ctx.ui.menu((model?.efforts ?? ['off']).map(v => ({ v, name: v === 'off' ? 'off · 不启用思考' : v })), pick?.effort ?? 'off', '思考强度',
        value => { policy[role].effort = value; changed(); });
      effortButton.setAttribute('aria-label', title + '思考强度'); controls.append(effortButton); row.append(controls); box.append(row);
    }
  }
  function renderDynamic() {
    const box = $r('#rein-dynamic'); box.replaceChildren();
    box.append(ctx.ui.row('应用到 OpenClaw', '已有 Agent 的工具、会话及频道配置保持原样。',
      ctx.ui.menu([{ v: 'defaults', name: '默认模型 · 继承默认的 Agents' }, ...(state.agentTargets ?? []).map(v => ({ v, name: v }))], settings.targetAgent ?? 'defaults', '选择 Agent',
        v => { settings.targetAgent = v; changed(); })));
    box.append(ctx.ui.row('自动判断任务 · Jev', '启用后允许单独计费的 Jev 分类调用；不改变 LLM 额外付费设置。',
      ctx.ui.toggle(settings.dynamic === true, '启用 Dynamic Router 和 Jev 分类计费', v => { settings.dynamic = v; changed(); })));
    const keyRow = el('label', 'rein-field'); keyRow.append(el('span', '', 'Jev API Key'));
    const key = el('input'); key.type = 'password'; key.autocomplete = 'new-password'; key.id = 'rein-jev-key'; key.placeholder = state.jevKeyConfigured ? '已配置 · 留空保留现有 Key' : '输入 Key，将保存到当前项目的私有配置'; key.oninput = changed;
    keyRow.append(key); box.append(keyRow);
    box.append(ctx.ui.row('允许 LLM 额外按量付费', '默认关闭。关闭时，API 按量付费 Provider 不会进入路由目录。',
      ctx.ui.toggle(settings.allowPaidUsage === true, '允许 LLM 额外按量付费', v => { settings.allowPaidUsage = v; changed(); })));
  }
  function renderFallbacks() {
    const box = $r('#rein-fallbacks'); box.replaceChildren();
    const input = el('input'); input.value = (settings.fallbacks ?? []).join(', '); input.placeholder = '例如 general, code；留空表示不回退';
    input.setAttribute('aria-label', '回退路由顺序'); input.oninput = () => { settings.fallbacks = input.value.split(',').map(s => s.trim()).filter(Boolean); changed(); };
    const field = el('label', 'rein-field'); field.append(el('span', '', '自动模式的回退顺序（general / quick / research / code）'), input); box.append(field);
  }
  async function save() {
    const button = $r('#rein-save'); button.disabled = true; button.textContent = '正在同步…';
    try {
      const admins = $r('#rein-admins').value.trim();
      settings.adminSenders = admins ? admins.split('\n').map(line => { const [channel,accountId,senderId] = line.trim().split('/'); return { channel,accountId,senderId }; }) : [];
      settings.policy = policy; settings.enabled = true;
      const key = $r('#rein-jev-key').value;
      state = await api('settings', { settings, ...(key ? { jevApiKey: key } : {}) });
      dirty = false; settings = structuredClone(state.settings); render();
      message('已同步到 OpenClaw。首次连接请启动或重启 OpenClaw；在 Discord / Slack 选择 rein-magpie/auto。');
      button.textContent = '已保存 · 自动同步中';
    } catch (e) {
      try { const current = await api('state'); state = { ...current, settings }; render(); } catch {}
      message(labelError(e.message), true); button.textContent = '重新保存';
    }
    finally { button.disabled = false; }
  }
});
