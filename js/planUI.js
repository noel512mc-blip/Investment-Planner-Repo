function togglePlansPanel() {
  const p = document.getElementById('plansPanel');
  if (!p) return;
  if (p.classList.contains('open') && !activePlanId) return;
  const isOpen = p.classList.toggle('open');
  const toggleBtn = document.getElementById('plansToggleBtn');
  if (isOpen) {
    const inner = p.firstElementChild;
    p.style.maxHeight = (inner ? inner.scrollHeight + 24 : 200) + 'px';
    if (toggleBtn) {
      toggleBtn.style.display = activePlanId ? 'flex' : 'none';
      toggleBtn.style.transform = 'rotate(-90deg)';
    }
  } else {
    p.style.maxHeight = '0';
    if (toggleBtn) {
      toggleBtn.style.display = 'flex';
      toggleBtn.style.transform = 'rotate(90deg)';
    }
  }
  renderPlansPanel();
}

function closePlansPanel() {
  if (!activePlanId) return;
  const p = document.getElementById('plansPanel');
  if (!p) return;
  p.classList.remove('open');
  p.style.maxHeight = '0';
  const toggleBtn = document.getElementById('plansToggleBtn');
  if (toggleBtn) {
    toggleBtn.style.display = 'flex';
    toggleBtn.style.transform = 'rotate(90deg)';
  }
  renderPlansPanel();
}

function renderPlansBar() {
  const label = document.getElementById('planBarLabel');
  if (!label) return;
  const hasAnyPlan = Object.keys(plans).length > 0;
  if (!hasAnyPlan) {
    label.innerHTML = `<span style="color:var(--color-text-muted);">No plan yet — <button onclick="event.stopPropagation(); createNewPlan();" style="background:none;border:none;padding:0;font-size:14px;color:var(--accent);font-weight:600;cursor:pointer;text-decoration:underline dotted;">create one</button> to get started</span>`;
  } else {
    const name = activePlanId && plans[activePlanId] ? plans[activePlanId].name : '(none)';
    const people = document.querySelectorAll('.person-card').length;
    const years = document.getElementById('years')?.value;
    const meta = [
      `${people} ${people === 1 ? 'person' : 'people'}`,
      years ? `${years} years` : null
    ].filter(Boolean).join(' · ');
    label.innerHTML = `
      <div style="display:flex;align-items:center;gap:9px;">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
          fill="none" stroke="#94a3b8" stroke-width="1.8"
          stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <div style="line-height:1.25;">
          <div style="font-size:14px;font-weight:600;color:var(--color-text-title);">${escapeHTML(name)}</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:1px;">${meta}</div>
        </div>
      </div>`;
  }
}

function updateNewPlanBtnStyle() {
  const btn = document.querySelector('.new-plan-btn');
  if (!btn) return;
  btn.classList.toggle('no-plans', Object.keys(plans).length === 0);
}

function renderPlansPanel() {
  const list = document.getElementById('plansList');
  if (!list) return;
  list.innerHTML = '';
  updateNewPlanBtnStyle();

  for (const id in plans) {
    const acc = plans[id];
    const isDark = document.body.classList.contains('dark-mode');
    const item = document.createElement('div');
    item.style.display = 'flex';
    item.style.justifyContent = 'space-between';
    item.style.alignItems = 'center';
    item.style.padding = '8px';
    item.style.border = `1px solid ${isDark ? '#3d3d3d' : '#eef2f8'}`;
    item.style.borderRadius = '8px';
    item.style.marginBottom = '8px';

    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.alignItems = 'center';
    left.style.gap = '5px';
    left.style.minWidth = '0';
    left.style.flex = '1';

    const nameSpan = document.createElement('span');
    nameSpan.style.overflow = 'hidden';
    nameSpan.style.textOverflow = 'ellipsis';
    nameSpan.style.whiteSpace = 'nowrap';
    nameSpan.style.display = 'flex';
    nameSpan.style.alignItems = 'baseline';
    nameSpan.style.gap = '4px';
    if (acc.name.endsWith(' (imported)')) {
      const baseName = document.createTextNode(acc.name.slice(0, -10));
      const suffix = document.createElement('span');
      suffix.textContent = '(imported)';
      suffix.style.cssText = 'font-size:10px;font-weight:400;color:#94a3b8;flex-shrink:0;';
      nameSpan.appendChild(baseName);
      nameSpan.appendChild(suffix);
    } else {
      nameSpan.textContent = acc.name;
    }

    const editBtn = document.createElement('button');
    editBtn.textContent = '✏';
    editBtn.title = 'Rename';
    editBtn.style.cssText = `background:none;border:none;padding:0 2px;font-size:15px;cursor:pointer;opacity:0;transition:opacity ${ANIM.fast}ms;color:${isDark ? '#9ca3af' : '#94a3b8'};flex-shrink:0;`;
    editBtn.onclick = (e) => { e.stopPropagation(); startRename(id); };

    item.onmouseenter = () => { editBtn.style.opacity = '1'; };
    item.onmouseleave = () => { editBtn.style.opacity = '0'; };

    left.appendChild(nameSpan);
    left.appendChild(editBtn);

    if (id === activePlanId) {
      item.style.background = 'rgba(60,100,220,0.18)';
      item.style.border = '1px solid rgba(60,100,220,0.35)';
      nameSpan.style.fontWeight = '700';
      nameSpan.style.color = isDark ? '#ffffff' : '#1e293b';
    }

    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.gap = '10px';
    right.style.alignItems = 'center';

    const loadBtn = document.createElement('button');
    loadBtn.style.padding = '5px 20px';
    loadBtn.style.borderRadius = '6px';
    loadBtn.style.fontSize = '13px';
    loadBtn.style.background = isDark ? '#374151' : '#e2e8f0';
    loadBtn.style.color = isDark ? '#e2e8f0' : '#1e293b';
    if (id === activePlanId) {
      loadBtn.textContent = 'Active';
      loadBtn.disabled = true;
    } else {
      loadBtn.textContent = 'Load';
      loadBtn.onclick = (e) => { e.stopPropagation(); activePlanId = id; savePlansToStorage(); renderPlansBar(); loadPlan(id); };
    }

    const delBtn = document.createElement('button');
    delBtn.style.padding = '5px 10px';
    delBtn.style.borderRadius = '6px';
    delBtn.style.fontSize = '13px';
    delBtn.style.background = isDark ? '#374151' : '#e2e8f0';
    delBtn.style.color = isDark ? '#e2e8f0' : '#1e293b';
    delBtn.style.transition = `${ANIM.fast}ms`;
    delBtn.onmouseenter = () => {
      delBtn.style.background = isDark ? '#4b1c1c' : '#fee2e2';
      delBtn.style.color = isDark ? '#fca5a5' : '#dc2626';
    };
    delBtn.onmouseleave = () => {
      delBtn.style.background = isDark ? '#374151' : '#e2e8f0';
      delBtn.style.color = isDark ? '#e2e8f0' : '#1e293b';
    };
    delBtn.textContent = 'Delete';
    delBtn.onclick = (e) => { e.stopPropagation(); if (confirm('Delete plan "' + acc.name + '"?')) deletePlan(id); };

    const dupBtn = document.createElement('button');
    dupBtn.textContent = '⧉';
    dupBtn.title = 'Duplicate plan';
    dupBtn.style.padding = '5px 10px';
    dupBtn.style.borderRadius = '6px';
    dupBtn.style.fontSize = '13px';
    dupBtn.style.background = isDark ? '#374151' : '#e2e8f0';
    dupBtn.style.color = isDark ? '#e2e8f0' : '#1e293b';
    dupBtn.style.transition = `${ANIM.fast}ms`;
    dupBtn.onmouseenter = () => {
      dupBtn.style.background = isDark ? '#1e3a5f' : '#dbeafe';
      dupBtn.style.color = isDark ? '#93c5fd' : '#1d4ed8';
    };
    dupBtn.onmouseleave = () => {
      dupBtn.style.background = isDark ? '#374151' : '#e2e8f0';
      dupBtn.style.color = isDark ? '#e2e8f0' : '#1e293b';
    };
    dupBtn.onclick = (e) => { e.stopPropagation(); duplicatePlan(id); };

    if (id === activePlanId) {
      const shareBtn = document.createElement('button');
      shareBtn.title = 'Share plan';
      shareBtn.style.cssText = `
        display:flex;align-items:center;gap:5px;
        padding:5px 10px;border-radius:6px;font-size:12px;font-weight:600;
        background:transparent;
        color:var(--accent);
        border:1px solid color-mix(in srgb, var(--accent) 45%, transparent);
        cursor:pointer;transition:background var(--anim-fast),border-color var(--anim-fast);flex-shrink:0;
      `;
      shareBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2.2"
          stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
          <polyline points="16 6 12 2 8 6"/>
          <line x1="12" y1="2" x2="12" y2="15"/>
        </svg>
        Share
      `;
      shareBtn.onmouseenter = () => {
        shareBtn.style.background = 'color-mix(in srgb, var(--accent) 10%, transparent)';
        shareBtn.style.borderColor = 'var(--accent)';
      };
      shareBtn.onmouseleave = () => {
        shareBtn.style.background = 'transparent';
        shareBtn.style.borderColor = 'color-mix(in srgb, var(--accent) 45%, transparent)';
      };
      shareBtn.dataset.shareId = id;
      shareBtn.style.marginRight = '6px';
      shareBtn.onclick = (e) => { e.stopPropagation(); sharePlan(id); };
      right.appendChild(shareBtn);
    }

    right.appendChild(loadBtn);
    right.appendChild(dupBtn);
    right.appendChild(delBtn);

    item.appendChild(left);
    item.appendChild(right);

    list.appendChild(item);
  }
}