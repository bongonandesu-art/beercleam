const DEFAULT_ITEMS = [
  { name: "スポンジ通し", days: 7, signal: true },
  { name: "フィルター洗浄", days: 14, signal: true }
];

let appData = null;
let currentMode = "M1";

document.addEventListener("DOMContentLoaded", init);

async function init() {
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("sw.js");
    } catch (e) {
      console.warn("Service Worker registration failed:", e);
    }
  }

  appData = await dbGet("appData");

  if (!appData) {
    renderSetup();
  } else {
    renderMain();
  }
}

function renderSetup() {
  const app = document.getElementById("app");

  app.innerHTML = `
    <section class="setup-wrap">
      <h1>初期設定</h1>

      <div class="form-card">
        <h2>店舗</h2>
        <div class="field">
          <label for="shopName">店舗名</label>
          <input id="shopName" type="text" placeholder="例：○○店">
        </div>
      </div>

      <div class="form-card">
        <h2>ビールサーバー</h2>
        <p class="small-label">初期状態は1台・2項目です。サーバー名は自由に入力できます。</p>
        <div id="beerServers"></div>
        <button class="secondary-button" type="button" onclick="addServer('beer')">＋ ビールサーバーを追加</button>
      </div>

      <div class="form-card">
        <h2>サワーサーバー</h2>
        <p class="small-label">卓番号・卓名は自由入力。入力した順番で表示します。</p>
        <div id="sourServers"></div>
        <button class="secondary-button" type="button" onclick="addServer('sour')">＋ サワーサーバーを追加</button>
      </div>

      <div class="setup-actions">
        <button type="button" onclick="saveSetup()">初期設定を保存する</button>
      </div>
    </section>
  `;

  addServer("beer", "ビールサーバー1");
  addServer("sour", "A1");
}

function addServer(type, name = "") {
  const container = document.getElementById(type === "beer" ? "beerServers" : "sourServers");
  if (!container) return;

  const serverIndex = container.children.length + 1;
  const defaultName = name || (type === "beer" ? `ビールサーバー${serverIndex}` : "");

  const card = document.createElement("div");
  card.className = "form-card";
  card.dataset.type = type;
  card.innerHTML = `
    <div class="field">
      <label>名称</label>
      <input class="server-name-input" type="text" value="${escapeAttr(defaultName)}"
             placeholder="${type === "beer" ? "例：厨房手前" : "例：A1"}">
    </div>
    <div class="field">
      <label>項目</label>
      <div class="item-configs"></div>
      <button class="secondary-button" type="button" onclick="addItem(this)">＋ 項目を追加</button>
    </div>
  `;

  container.appendChild(card);

  addItem(card.querySelector("button"), DEFAULT_ITEMS[0]);
  addItem(card.querySelector("button"), DEFAULT_ITEMS[1]);
}

function addItem(button, preset = null) {
  const configs = button.parentElement.querySelector(".item-configs");

  if (configs.children.length >= 3) {
    alert("項目は最大3項目です。");
    return;
  }

  const item = document.createElement("div");
  item.className = "item-config";

  const p = preset || { name: "", days: 14, signal: true };

  item.innerHTML = `
    <input class="item-name-input" type="text" value="${escapeAttr(p.name)}" placeholder="項目名">
    <input class="item-days-input" type="number" min="1" value="${Number(p.days) || 14}" title="締切日数">
    <label class="small-label">
      <input class="item-signal-input" type="checkbox" ${p.signal ? "checked" : ""}> 信号
    </label>
  `;

  configs.appendChild(item);
}

async function saveSetup() {
  const shopName = document.getElementById("shopName").value.trim();

  if (!shopName) {
    alert("店舗名を入力してください。");
    return;
  }

  const collect = (type, containerId) => {
    const cards = [...document.getElementById(containerId).children];
    return cards.map(card => {
      const name = card.querySelector(".server-name-input").value.trim();
      const itemRows = [...card.querySelectorAll(".item-config")];

      const items = itemRows
        .map(row => ({
          name: row.querySelector(".item-name-input").value.trim(),
          days: Math.max(1, Number(row.querySelector(".item-days-input").value) || 14),
          signal: row.querySelector(".item-signal-input").checked,
          lastCleanedAt: null
        }))
        .filter(x => x.name);

      return {
        id: crypto.randomUUID(),
        type,
        name,
        items
      };
    }).filter(server => server.name && server.items.length);
  };

  const beerServers = collect("beer", "beerServers");
  const sourServers = collect("sour", "sourServers");

  if (beerServers.length === 0 || sourServers.length === 0) {
    alert("ビールサーバーとサワーサーバーを、それぞれ1台以上登録してください。");
    return;
  }

  appData = {
    version: 1,
    shopName,
    beerServers,
    sourServers,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await dbSet("appData", appData);
  renderMain();
}

function renderMain() {
  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="fixed-controls">
      <nav class="tabs" aria-label="メインメニュー">
        <button class="tab active" data-mode="M1" onclick="switchMode('M1')">M1.締切表示</button>
        <button class="tab" data-mode="M2" onclick="switchMode('M2')">M2.項目入口</button>
        <button class="tab" data-mode="M3" onclick="switchMode('M3')">M3.サーバー入口</button>
      </nav>
      <div class="action-row">
        <button class="primary-button" type="button" onclick="saveSelected()">保存</button>
        <button class="secondary-button" type="button" onclick="clearSelection()">選択クリヤー</button>
      </div>
    </div>
    <section id="content" class="page"></section>
  `;

  renderM1();
}

function switchMode(mode) {
  currentMode = mode;
  document.querySelectorAll(".tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.mode === mode);
  });

  if (mode === "M1") renderM1();
  if (mode === "M2") renderM2();
  if (mode === "M3") renderM3();
}

function allServers() {
  return [
    ...appData.beerServers.map(s => ({ ...s, type: "beer" })),
    ...appData.sourServers.map(s => ({ ...s, type: "sour" }))
  ];
}

function deadlineFor(item) {
  if (!item.lastCleanedAt) return null;
  const base = new Date(item.lastCleanedAt);
  base.setHours(0, 0, 0, 0);
  base.setDate(base.getDate() + Number(item.days));
  return base;
}

function signalFor(item) {
  if (!item.signal || !item.lastCleanedAt) return null;

  const deadline = deadlineFor(item);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diff = Math.round((deadline - today) / 86400000);

  // 締切まで2日以内：黄色。締切日当日・超過：赤。
  if (diff <= 0) return "red";
  if (diff <= 2) return "yellow";
  return null;
}

function deadlineText(item) {
  const d = deadlineFor(item);
  if (!d) return "未設定";
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function renderM1() {
  const content = document.getElementById("content");
  const servers = allServers();

  if (!servers.length) {
    content.innerHTML = `<div class="empty-state">サーバーが登録されていません。</div>`;
    return;
  }

  content.innerHTML = "";

  for (const type of ["beer", "sour"]) {
    const group = servers.filter(s => s.type === type);
    if (!group.length) continue;

    const title = document.createElement("div");
    title.className = "section-title";
    title.textContent = type === "beer" ? "ビール" : "サワー";
    content.appendChild(title);

    // サーバーカードは、カード内で最も早い締切を基準に並べる。
    const sorted = [...group].sort((a, b) => earliestDeadline(a) - earliestDeadline(b));

    sorted.forEach(server => {
      const card = document.createElement("article");
      card.className = `server-card ${type}`;

      const itemHtml = server.items.map((item, index) => {
        const signal = signalFor(item);
        return `
          <div class="item-row">
            <div class="item-label">
              <label>
                <input type="checkbox"
                  data-server-id="${server.id}"
                  data-item-index="${index}">
                ${signal ? `<span class="signal ${signal}" aria-label="${signal === "red" ? "赤信号" : "黄色信号"}"></span>` : ""}
                <span class="item-name">${escapeHtml(item.name)}</span>
              </label>
            </div>
            <div class="deadline">${deadlineText(item)}</div>
          </div>
        `;
      }).join("");

      card.innerHTML = `
        <div class="server-name">${escapeHtml(server.name)}</div>
        ${itemHtml}
      `;

      content.appendChild(card);
    });
  }
}

function earliestDeadline(server) {
  const dates = server.items
    .map(deadlineFor)
    .filter(Boolean)
    .map(d => d.getTime());

  return dates.length ? Math.min(...dates) : Number.MAX_SAFE_INTEGER;
}

function renderM2() {
  document.getElementById("content").innerHTML = `
    <div class="empty-state">
      <strong>M2.項目入口</strong><br>
      v0.1では入口の画面骨格を用意しています。<br>
      項目を選ぶ → 対象サーバーを☑ → 保存、の機能は次段階で実装します。
    </div>
  `;
}

function renderM3() {
  document.getElementById("content").innerHTML = `
    <div class="empty-state">
      <strong>M3.サーバー入口</strong><br>
      v0.1では入口の画面骨格を用意しています。<br>
      サーバーを選ぶ → 項目を☑ → 保存、の機能は次段階で実装します。
    </div>
  `;
}

async function saveSelected() {
  const checks = [...document.querySelectorAll('input[type="checkbox"][data-server-id]:checked')];

  if (!checks.length) {
    alert("保存する項目を選択してください。");
    return;
  }

  const ok = await showConfirm(`${checks.length}件保存しますか？`);
  if (!ok) return;

  const now = new Date().toISOString();

  for (const check of checks) {
    const server = allServers().find(s => s.id === check.dataset.serverId);
    if (!server) continue;

    const index = Number(check.dataset.itemIndex);
    const item = server.items[index];
    if (!item) continue;

    item.lastCleanedAt = now;

    // v0.1では最新作業日だけを保持。
    // v1.0で履歴配列へ拡張する前提。
  }

  appData.updatedAt = now;
  await dbSet("appData", appData);

  renderMain();
}

function clearSelection() {
  document.querySelectorAll('input[type="checkbox"][data-server-id]').forEach(cb => {
    cb.checked = false;
  });
}

function showConfirm(message) {
  return new Promise(resolve => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h2>保存</h2>
        <p>${escapeHtml(message)}</p>
        <div class="modal-actions">
          <button class="secondary-button" type="button" data-cancel>キャンセル</button>
          <button class="primary-button" type="button" data-ok>OK</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    backdrop.querySelector("[data-cancel]").onclick = () => {
      backdrop.remove();
      resolve(false);
    };

    backdrop.querySelector("[data-ok]").onclick = () => {
      backdrop.remove();
      resolve(true);
    };
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
