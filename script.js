const API_BASE = "https://api.coingecko.com/api/v3";
let priceChart   = null;
let currentCoinId = null;
let allCoins     = [];
let previousPrices = new Map();
let watchlist    = new Set(JSON.parse(localStorage.getItem("cryptointel-watchlist") || "[]"));

// ===== THEME MANAGEMENT =====
const themeManager = {
  init() {
    const savedTheme = localStorage.getItem("cryptointel-theme") || "dark";
    this.setTheme(savedTheme);
    
    const toggleBtn = document.getElementById("theme-toggle");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", (e) => {
        this.toggle();
        createRipple(e);
      });
    }
  },
  toggle() {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "light" ? "dark" : "light";
    this.setTheme(next);
    showToast(`Switched to ${next} theme`, "info");
  },
  setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("cryptointel-theme", theme);
    if (priceChart) this.updateChartTheme(theme);
  },
  updateChartTheme(theme) {
    if (currentCoinId) {
      fetchCoinDetails(currentCoinId, document.querySelector(".time-btn.active")?.dataset.days || 7);
    }
  }
};

// ===== TOAST SYSTEM =====
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  
  const icon = type === "success" ? "⭐" : type === "info" ? "ℹ️" : "🔔";
  
  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${message}</span>
  `;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add("hide");
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

// ===== RIPPLE EFFECT =====
function createRipple(event) {
  const button = event.currentTarget;
  const circle = document.createElement("span");
  const diameter = Math.max(button.clientWidth, button.clientHeight);
  const radius = diameter / 2;

  circle.style.width = circle.style.height = `${diameter}px`;
  circle.style.left = `${event.clientX - button.offsetLeft - radius}px`;
  circle.style.top = `${event.clientY - button.offsetTop - radius}px`;
  circle.classList.add("ripple");

  const ripple = button.getElementsByClassName("ripple")[0];
  if (ripple) ripple.remove();

  button.appendChild(circle);
}

// ===== UTILS =====
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function animateValue(obj, start, end, duration) {
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    const easedProgress = 1 - Math.pow(1 - progress, 4); // Quart Out
    const current = start + (end - start) * easedProgress;
    obj.innerHTML = `₹${current.toLocaleString("en-IN", { maximumFractionDigits: (end < 1 ? 4 : 2) })}`;
    if (progress < 1) {
      window.requestAnimationFrame(step);
    }
  };
  window.requestAnimationFrame(step);
}

// ===== DOM =====
const coinsGrid      = document.getElementById("coins-grid");
const modal          = document.getElementById("detail-modal");
const modalBackdrop  = document.getElementById("modal-backdrop");
const closeModalBtn  = document.getElementById("close-modal");
const modalLoader    = document.getElementById("modal-loader");
const modalData      = document.getElementById("modal-data");
const searchInput    = document.getElementById("search-input");
const searchDropdown = document.getElementById("search-results");
const sortSelect     = document.getElementById("sort-select");
const refreshBtn     = document.getElementById("refresh-btn");

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener("keydown", (e) => {
  // Prevent shortcuts when typing in inputs
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
    if (e.key === "Escape") e.target.blur();
    return;
  }

  const key = e.key.toUpperCase();
  if (e.key === "/") {
    e.preventDefault();
    searchInput.focus();
  } else if (key === "R") {
    refreshBtn.click();
  } else if (key === "D") {
    themeManager.toggle();
  }
});

// ===== INIT =====
themeManager.init();
init();

async function init() {
  showSkeletons(8);
  try {
    const newCoins = await fetchCoins();
    detectPriceChanges(newCoins);
    allCoins = newCoins;
    
    renderInsightsPanel(allCoins);
    renderMarketBanner(allCoins);
    renderWatchlistSection();
    renderCoins(allCoins);
    updateLastUpdated();
  } catch (err) {
    console.error("Failed to load:", err);
    showEmptyState();
  } finally {
    document.getElementById("main-loader")?.classList.add("hidden");
  }
}

// ===== FETCH COINS =====
async function fetchCoins() {
  const res = await fetch(
    `${API_BASE}/coins/markets?vs_currency=inr&order=market_cap_desc&per_page=20&page=1&sparkline=true`
  );
  if (!res.ok) throw new Error("API " + res.status);
  return await res.json();
}

// ===== PRICE CHANGE DETECTION =====
function detectPriceChanges(newCoins) {
  newCoins.forEach(coin => {
    const prev = previousPrices.get(coin.id);
    if (prev !== undefined && prev !== coin.current_price) {
      coin._prevPrice = prev;
      coin._priceAction = coin.current_price > prev ? "up" : "down";
    }
    previousPrices.set(coin.id, coin.current_price);
  });
}

// ===== SMART INSIGHTS =====
function renderInsightsPanel(coins) {
  const panel = document.getElementById("insights-panel");
  if (!panel) return;

  const sortedByChange = [...coins].sort((a, b) => (b.price_change_percentage_24h || 0) - (a.price_change_percentage_24h || 0));
  const topGainer = sortedByChange[0];
  const topLoser  = sortedByChange[sortedByChange.length - 1];
  const volatile  = [...coins].sort((a, b) => Math.abs(b.price_change_percentage_24h || 0) - Math.abs(a.price_change_percentage_24h || 0))[0];

  const createCard = (label, coin, icon) => {
    const chg = coin.price_change_percentage_24h || 0;
    const isPos = chg >= 0;
    return `
      <div class="insight-card">
        <div>
          <span class="insight-label">${label}</span>
          <span class="insight-coin-name">${coin.name}</span>
        </div>
        <div class="insight-value">
          <span class="insight-stat ${isPos ? "positive" : "negative"}">
            ${isPos ? "+" : ""}${chg.toFixed(2)}%
          </span>
          <span>${icon}</span>
        </div>
      </div>
    `;
  };

  panel.innerHTML = `
    ${createCard("Top Gainer", topGainer, "🚀")}
    ${createCard("Top Loser", topLoser, "📉")}
    ${createCard("Most Volatile", volatile, "⚡")}
  `;
}

// ===== SPARKLINE SVG GENERATOR =====
function generateSparklineSVG(prices, isPositive) {
  if (!prices || prices.length === 0) return "";
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min;
  const width = 140;
  const height = 40;
  
  const points = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * width;
    const y = range === 0 ? height / 2 : height - ((p - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  
  const color = isPositive ? "#4ade80" : "#f87171";
  
  return `
    <svg width="100%" height="100%" viewbox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <path d="M ${points.join(" L ")}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `;
}

// ===== MARKET DIRECTION BANNER =====
function renderMarketBanner(coins) {
  const bar = document.getElementById("summary-bar");
  if (!bar) return;

  const avgChange = coins.reduce((s, c) => s + (c.price_change_percentage_24h || 0), 0) / coins.length;
  const isBullish = avgChange >= 0;

  bar.innerHTML = `
    <div class="market-summary ${isBullish ? "bullish-bg" : "bearish-bg"}">
      <span id="market-direction-icon">${isBullish ? "▲" : "⚠️"}</span>
      <span>${isBullish ? "📈" : "📉"}</span>
      <span>${isBullish ? "Bullish momentum detected" : "Downward pressure observed"}
        (Avg ${avgChange >= 0 ? "+" : ""}${avgChange.toFixed(2)}%)</span>
    </div>
  `;
}

// ===== WATCHLIST SECTION =====
function renderWatchlistSection() {
  const wrapper = document.getElementById("watchlist-wrapper");
  const grid    = document.getElementById("watchlist-grid");
  if (!wrapper || !grid) return;

  const starred = allCoins.filter(c => watchlist.has(c.id));
  
  if (!starred.length) {
    wrapper.classList.remove("hidden");
    grid.innerHTML = `
      <div class="empty-watchlist-mini">
        <div class="empty-graphic">⭐</div>
        <p>No coins in your watchlist yet. Tap the star on any card to add it!</p>
      </div>
    `;
    return;
  }

  wrapper.classList.remove("hidden");
  grid.innerHTML = starred.map((coin, i) => buildCardHTML(coin, i)).join("");
  attachCardEvents(grid);
}

// ===== TREND LOGIC =====
function getTrend(change) {
  if (change >=  3)    return { cls: "trend-bullish", label: "🟢 BULLISH", msg: "+ Strong Uptrend" };
  if (change >=  0.5)  return { cls: "trend-bullish", label: "🟢 BULLISH", msg: "+ Upward Drift" };
  if (change >= -0.5)  return { cls: "trend-neutral",  label: "⚪ NEUTRAL",  msg: "- Consolidating" };
  if (change >= -2)    return { cls: "trend-bearish", label: "🔴 BEARISH", msg: "- Minor Drift" };
  return                      { cls: "trend-bearish", label: "🔴 BEARISH", msg: "- Rapid Decline" };
}

// ===== FORMAT (Indian) =====
function formatCap(n) {
  const cr = n / 1e7;
  if (cr >= 1e5) return (cr / 1e5).toFixed(2) + "LCr";
  if (cr >= 1)   return cr.toFixed(2) + "Cr";
  return "₹" + n.toLocaleString("en-IN");
}

function formatBig(n) {
  if (n >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (n >= 1e9)  return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6)  return (n / 1e6).toFixed(2) + "M";
  return n.toLocaleString("en-IN");
}

// ===== BUILD CARD =====
function buildCardHTML(coin, i) {
  const chg       = coin.price_change_percentage_24h ?? 0;
  const isPos     = chg >= 0;
  const trend     = getTrend(chg);
  const isStarred = watchlist.has(coin.id);
  const sparkline = generateSparklineSVG(coin.sparkline_in_7d?.price, isPos);
  
  const flashCls = coin._priceAction === "up" ? "up-flash" : coin._priceAction === "down" ? "down-flash" : "";
  const hoverCls = isPos ? "bullish-hover" : "bearish-hover";

  return `
    <div class="coin-card ${hoverCls}" style="animation-delay:${i * 0.04}s" data-id="${coin.id}" data-prices='${JSON.stringify(coin.sparkline_in_7d?.price || [])}'>

      <div class="card-overlay">
        <button class="overlay-btn overlay-btn-primary" onclick="event.stopPropagation(); handleViewDetails('${coin.id}')">View Details</button>
        <button class="overlay-btn overlay-btn-outline" onclick="event.stopPropagation(); handleQuickWatchlist('${coin.id}', this, event)">
          ${isStarred ? "Starred" : "Watchlist"}
        </button>
      </div>

      <div class="card-header">
        <div class="card-identity">
          <img src="${coin.image}" alt="${coin.name}" loading="lazy"
               onerror="this.style.visibility='hidden'">
          <div class="card-title">
            <span class="name">${coin.name}</span>
            <span class="symbol">${coin.symbol.toUpperCase()}</span>
          </div>
        </div>
        <div class="card-actions">
          <span class="change-badge ${isPos ? "positive" : "negative"}">
            ${isPos ? "▲" : "▼"} ${Math.abs(chg).toFixed(2)}%
          </span>
          <button class="star-btn ${isStarred ? "active" : ""}"
                  data-id="${coin.id}"
                  title="${isStarred ? "Remove from watchlist" : "Add to watchlist"}"
                  onclick="event.stopPropagation(); handleToggleWatchlist('${coin.id}', this, event)">★</button>
        </div>
      </div>

      <div class="card-body">
        <div class="price ${flashCls}" data-price-value="${coin.current_price}">
          <span class="trend-arrow ${isPos ? "up" : "down"}">${isPos ? "↑" : "↓"}</span>
          <span class="price-text">₹${coin.current_price.toLocaleString("en-IN")}</span>
        </div>
        <div class="mcap">Market Cap: ${formatCap(coin.market_cap)}</div>
      </div>

      <div class="sparkline-container">
        <div class="sparkline-tooltip"></div>
        ${sparkline}
      </div>

      <div class="card-separator"></div>

      <div class="card-trend-container">
        <span class="trend-badge-ui ${trend.cls}">${trend.label}</span>
        <span class="trend-msg">${trend.msg}</span>
      </div>

    </div>
  `;
}

// ===== RENDER COINS =====
function renderCoins(coins) {
  if (!coins || coins.length === 0) { showEmptyState(); return; }

  coinsGrid.style.opacity = "0";
  coinsGrid.innerHTML = coins.map((coin, i) => buildCardHTML(coin, i)).join("");
  
  // Animate dynamic prices
  coins.forEach(coin => {
    if (coin._prevPrice) {
      const el = coinsGrid.querySelector(`[data-id="${coin.id}"] .price-text`);
      if (el) animateValue(el, coin._prevPrice, coin.current_price, 800);
    }
  });

  attachCardEvents(coinsGrid);
  attachSparklineTooltips(coinsGrid);

  requestAnimationFrame(() => {
    coinsGrid.style.transition = "opacity 0.4s var(--transition-elite)";
    coinsGrid.style.opacity = "1";
  });
}

function attachCardEvents(container) {
  container.querySelectorAll(".coin-card").forEach(card => {
    card.addEventListener("click", () => {
      card.classList.add("card-clicked");
      setTimeout(() => card.classList.remove("card-clicked"), 200);
      openModal(card.dataset.id);
    });
  });
}

// ===== SPARKLINE TOOLTIPS =====
function attachSparklineTooltips(container) {
  container.querySelectorAll(".sparkline-container").forEach(wrapper => {
    const tooltip = wrapper.querySelector(".sparkline-tooltip");
    const card    = wrapper.closest(".coin-card");
    const prices  = JSON.parse(card.dataset.prices || "[]");

    if (!prices.length) return;

    wrapper.addEventListener("mousemove", (e) => {
      const rect = wrapper.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percent = x / rect.width;
      const index = Math.floor(percent * (prices.length - 1));
      const price = prices[index];

      if (price !== undefined) {
        tooltip.textContent = "₹" + price.toLocaleString("en-IN", { maximumFractionDigits: 2 });
        tooltip.style.left = `${x}px`;
      }
    });
  });
}

// ===== WATCHLIST TOGGLE =====
function handleToggleWatchlist(id, btn, event) {
  createRipple(event);
  const coin = allCoins.find(c => c.id === id);
  const name = coin ? coin.name : "Asset";

  if (watchlist.has(id)) {
    watchlist.delete(id);
    btn.classList.remove("active");
    showToast(`Removed ${name} from watchlist`, "info");
  } else {
    watchlist.add(id);
    btn.classList.add("active");
    showToast(`Added ${name} to watchlist`, "success");
  }
  
  localStorage.setItem("cryptointel-watchlist", JSON.stringify([...watchlist]));
  renderWatchlistSection();
}

// Quick action buttons use this
function handleQuickWatchlist(id, btn, event) {
  handleToggleWatchlist(id, btn, event);
  const isStarred = watchlist.has(id);
  btn.textContent = isStarred ? "Starred" : "Watchlist";
}

function handleViewDetails(id) {
  openModal(id);
}

// ===== SKELETON LOADERS =====
function showSkeletons(count = 8) {
  coinsGrid.innerHTML = Array(count).fill(0).map(() => `
    <div class="coin-card skel-card">
      <div class="card-header">
        <div class="card-identity">
          <div class="skel skel-circle"></div>
          <div>
            <div class="skel skel-line" style="width:90px;margin-bottom:7px"></div>
            <div class="skel skel-line" style="width:45px;height:10px"></div>
          </div>
        </div>
        <div class="skel skel-badge"></div>
      </div>
      <div class="skel skel-line" style="width:65%;height:26px;margin:6px 0 10px;border-radius:6px"></div>
      <div class="skel skel-line" style="width:42%;height:11px;margin-bottom:18px"></div>
      <div class="skel skel-line" style="width:100%;height:1px;margin-bottom:16px"></div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div class="skel skel-badge"></div>
        <div class="skel skel-line" style="width:90px;height:12px"></div>
      </div>
    </div>
  `).join("");
}

// ===== EMPTY STATE =====
function showEmptyState() {
  coinsGrid.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">📡</div>
      <h3>No data available</h3>
      <p>Could not reach the market. Check your connection and try again.</p>
      <button class="retry-btn" onclick="init()">↺ &nbsp;Retry</button>
    </div>
  `;
}

// ===== LAST UPDATED =====
function updateLastUpdated() {
  const el = document.getElementById("last-updated");
  if (el) el.textContent = "Last updated: " +
    new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ===== SORT =====
sortSelect.addEventListener("change", () => {
  const val    = sortSelect.value;
  let sorted   = [...allCoins];
  if      (val === "price_desc")  sorted.sort((a, b) => b.current_price - a.current_price);
  else if (val === "price_asc")   sorted.sort((a, b) => a.current_price - b.current_price);
  else if (val === "change_desc") sorted.sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h);
  else if (val === "change_asc")  sorted.sort((a, b) => a.price_change_percentage_24h - b.price_change_percentage_24h);
  else sorted.sort((a, b) => a.market_cap_rank - b.market_cap_rank);
  renderCoins(sorted);
});

// ===== REFRESH =====
if (refreshBtn) {
  refreshBtn.addEventListener("click", (e) => {
    createRipple(e);
    refreshBtn.classList.add("spinning");
    init().then(() => {
      showToast("Market data refreshed", "info");
    }).finally(() => setTimeout(() => refreshBtn.classList.remove("spinning"), 800));
  });
}

// ===== LIVE SEARCH =====
const handleSearch = debounce(() => {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) { searchDropdown.classList.add("hidden"); return; }

  const results = allCoins.filter(c =>
    c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q)
  );

  if (!results.length) {
    searchDropdown.innerHTML = `<div class="search-empty">No results for "<strong>${q}</strong>"</div>`;
    searchDropdown.classList.remove("hidden");
    return;
  }

  searchDropdown.innerHTML = results.slice(0, 7).map(coin => {
    const chg = coin.price_change_percentage_24h ?? 0;
    return `
      <div class="search-item" data-id="${coin.id}">
        <img src="${coin.image}" alt="${coin.name}">
        <div class="search-item-info">
          <span class="search-item-name">${coin.name}</span>
          <span class="search-item-symbol">${coin.symbol.toUpperCase()}</span>
        </div>
        <div class="search-item-right">
          <span class="search-item-price">₹${coin.current_price.toLocaleString("en-IN")}</span>
          <span class="search-item-change ${chg >= 0 ? "positive" : "negative"}">${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%</span>
        </div>
      </div>
    `;
  }).join("");

  searchDropdown.querySelectorAll(".search-item").forEach(item => {
    item.addEventListener("click", () => {
      openModal(item.dataset.id);
      searchDropdown.classList.add("hidden");
      searchInput.value = "";
    });
  });

  searchDropdown.classList.remove("hidden");
}, 250);

searchInput.addEventListener("input", handleSearch);

document.addEventListener("click", e => {
  if (!e.target.closest(".search-container")) searchDropdown.classList.add("hidden");
});

// ===== MODAL =====
function openModal(id) {
  currentCoinId = id;
  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  modalLoader.classList.remove("hidden");
  modalData.classList.add("hidden");
  fetchCoinDetails(id, 7);
}

function closeModal() {
  modal.classList.add("hidden");
  document.body.style.overflow = "auto";
}

closeModalBtn.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", closeModal);
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

// ===== COIN DETAILS =====
async function fetchCoinDetails(id, days = 7) {
  try {
    const [coinRes, chartRes] = await Promise.all([
      fetch(`${API_BASE}/coins/${id}`),
      fetch(`${API_BASE}/coins/${id}/market_chart?vs_currency=inr&days=${days}`)
    ]);
    const coin      = await coinRes.json();
    const chartData = await chartRes.json();

    document.getElementById("detail-name").textContent    = coin.name;
    document.getElementById("detail-symbol").textContent  = coin.symbol.toUpperCase();
    const iconEl = document.getElementById("detail-icon");
    if (iconEl) iconEl.src = coin.image?.small || "";

    const price  = coin.market_data.current_price.inr;
    const change = coin.market_data.price_change_percentage_24h;

    document.getElementById("detail-price").textContent = "₹" + price.toLocaleString("en-IN");
    const changeEl = document.getElementById("detail-change");
    changeEl.textContent = (change >= 0 ? "▲ +" : "▼ ") + change.toFixed(2) + "%";
    changeEl.className   = "detail-change " + (change >= 0 ? "positive" : "negative");

    document.getElementById("detail-mcap").textContent = "₹" + coin.market_data.market_cap.inr.toLocaleString("en-IN");
    document.getElementById("detail-vol").textContent  = "₹" + coin.market_data.total_volume.inr.toLocaleString("en-IN");

    const prices = chartData.prices.map(p => p[1]);
    const labels = chartData.prices.map(p =>
      new Date(p[0]).toLocaleDateString("en-IN", { month: "short", day: "numeric" })
    );

    renderChart(labels, prices, change >= 0);
    updateAnalytics(prices);

    modalLoader.classList.add("hidden");
    modalData.classList.remove("hidden");
  } catch (err) {
    console.error("Modal error:", err);
  }
}

// ===== CHART =====
function renderChart(labels, data, isPositive = true) {
  const ctx   = document.getElementById("price-chart");
  const color = isPositive ? "#22c55e" : "#ef4444";
  const bg    = isPositive ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)";
  if (priceChart) priceChart.destroy();
  priceChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{ data, borderColor: color, backgroundColor: bg, fill: true,
                   tension: 0.4, pointRadius: 0, borderWidth: 2 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 600 },
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#4B5563", font: { size: 10 }, maxTicksLimit: 7 },
             grid: { display: false }, border: { display: false } },
        y: { ticks: { color: "#6B7280", font: { size: 11 }, callback: v => "₹" + formatBig(v) },
             grid: { color: "rgba(255,255,255,0.04)" }, border: { display: false } }
      }
    }
  });
}

// ===== ANALYTICS =====
function updateAnalytics(prices) {
  const high   = Math.max(...prices);
  const low    = Math.min(...prices);
  const change = ((prices.at(-1) - prices[0]) / prices[0]) * 100;
  document.getElementById("stat-high").textContent = "₹" + high.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  document.getElementById("stat-low").textContent  = "₹" + low.toLocaleString("en-IN",  { maximumFractionDigits: 2 });
  const el = document.getElementById("stat-change");
  el.textContent = (change >= 0 ? "+" : "") + change.toFixed(2) + "%";
  el.style.color = change >= 0 ? "#4ade80" : "#f87171";
}

// ===== TIME FILTER BUTTONS =====
document.querySelectorAll(".time-btn").forEach(btn => {
  btn.addEventListener("click", (e) => {
    createRipple(e);
    document.querySelectorAll(".time-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    fetchCoinDetails(currentCoinId, btn.dataset.days);
  });
});

// ===== SIDEBAR NAV =====
document.querySelectorAll(".nav-item").forEach(item => {
  item.addEventListener("click", e => {
    e.preventDefault();
    createRipple(e);
    document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
    item.classList.add("active");

    const view            = item.dataset.view;
    const watchlistWrapper = document.getElementById("watchlist-wrapper");
    const summaryBar      = document.getElementById("summary-bar");
    const dashboardHeader = document.querySelector(".dashboard-header");
    const coinsGridEl     = document.getElementById("coins-grid");
    const insightsPanel    = document.getElementById("insights-panel");

    if (view === "watchlist") {
      watchlistWrapper?.classList.remove("hidden");
      if (summaryBar)      summaryBar.style.display      = "none";
      if (dashboardHeader) dashboardHeader.style.display = "none";
      if (coinsGridEl)     coinsGridEl.style.display     = "none";
      if (insightsPanel)    insightsPanel.style.display    = "none";
    } else {
      watchlistWrapper?.classList.add("hidden");
      if (summaryBar)      summaryBar.style.display      = "";
      if (dashboardHeader) dashboardHeader.style.display = "";
      if (coinsGridEl)     coinsGridEl.style.display     = "";
      if (insightsPanel)    insightsPanel.style.display    = "";
    }
  });
});

// ===== LIVE CLOCK =====
function updateClock() {
  const el = document.getElementById("sidebar-time");
  if (el) el.textContent = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}
updateClock();
setInterval(updateClock, 30000);