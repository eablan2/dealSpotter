/* ── State ── */
let allDeals = [];
let cart = JSON.parse(localStorage.getItem('dealCart') || '{}');
let activeCategory = 'All';
let searchQuery = '';
let sortMode = 'default';
let selectedStore = JSON.parse(localStorage.getItem('selectedStore') || 'null');

/* ── DOM refs ── */
const dealsGrid    = document.getElementById('dealsGrid');
const searchInput  = document.getElementById('searchInput');
const categoryTabs = document.getElementById('categoryTabs');
const sortSelect   = document.getElementById('sortSelect');
const cartSidebar  = document.getElementById('cartSidebar');
const cartList     = document.getElementById('cartList');
const cartEmpty    = document.getElementById('cartEmpty');
const cartFooter   = document.getElementById('cartFooter');
const cartBadge    = document.getElementById('cartBadge');
const cartToggle   = document.getElementById('cartToggle');
const closeCart    = document.getElementById('closeCart');
const refreshBtn   = document.getElementById('refreshBtn');
const statusBanner = document.getElementById('statusBanner');
const storePicker  = document.getElementById('storePicker');

// Create overlay for mobile cart
const overlay = document.createElement('div');
overlay.className = 'cart-overlay';
document.body.appendChild(overlay);

/* ── Load Stores ── */
async function loadStores() {
  try {
    const res = await fetch('/api/stores');
    const stores = await res.json();
    storePicker.innerHTML = stores.map(s =>
      `<option value="${s.id}" data-postal="${s.postalCode}" data-address="${s.address}" data-store-id="${s.jewelStoreId || ''}">${s.label}</option>`
    ).join('');

    // Restore saved selection or default to first
    const saved = selectedStore;
    const match = saved && stores.find(s => s.id === saved.id);
    const active = match || stores[0];
    if (active) {
      storePicker.value = active.id;
      selectedStore = active;
      localStorage.setItem('selectedStore', JSON.stringify(active));
    }
  } catch (e) {
    console.error('Could not load stores', e);
  }
}

storePicker.addEventListener('change', () => {
  const opt = storePicker.selectedOptions[0];
  selectedStore = { id: opt.value, postalCode: opt.dataset.postal, address: opt.dataset.address, jewelStoreId: opt.dataset.storeId };
  localStorage.setItem('selectedStore', JSON.stringify(selectedStore));
  loadDeals(true);
});

/* ── Fetch Deals ── */
async function loadDeals(forceRefresh = false) {
  if (!selectedStore) return;

  dealsGrid.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Fetching deals for ${selectedStore.address}…</p></div>`;
  setStats({ deals: '—', savings: '—', source: '—' });

  if (forceRefresh) {
    await fetch('/api/deals/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postal_code: selectedStore.postalCode })
    }).catch(() => {});
  }

  try {
    const res = await fetch(`/api/deals?postal_code=${selectedStore.postalCode}`);
    const data = await res.json();
    allDeals = data.deals || [];

    if (data.note) {
      const storeLine = selectedStore ? ` · Store #${selectedStore.jewelStoreId || ''}` : '';
      showBanner(data.note + storeLine, data.source === 'demo' ? 'warn' : 'info');
    }

    buildCategoryTabs();
    renderDeals();
    updateStats(data.source);
  } catch (e) {
    dealsGrid.innerHTML = `<div class="empty-state"><h3>Could not load deals</h3><p>Make sure the server is running.</p></div>`;
  }
}

/* ── Stats ── */
function updateStats(source) {
  document.getElementById('statDealsNum').textContent = allDeals.length;

  // Count deals that have a numeric price
  const withPrice = allDeals.filter(d => d.price && !isNaN(d.price));
  const avgSavingsText = withPrice.length > 0 ? `${withPrice.length} priced` : 'N/A';
  document.getElementById('statSavingsNum').textContent = avgSavingsText;

  const badge = document.getElementById('statSourceBadge');
  badge.textContent = source === 'live' ? 'LIVE' : 'DEMO';
  badge.className = `stat-num source-badge ${source === 'live' ? 'source-live' : 'source-demo'}`;

  updateCartStats();
}

function setStats({ deals, savings, source }) {
  document.getElementById('statDealsNum').textContent = deals;
  document.getElementById('statSavingsNum').textContent = savings;
  document.getElementById('statSourceBadge').textContent = source;
}

function updateCartStats() {
  document.getElementById('statCartNum').textContent = `$${getCartTotal().toFixed(2)}`;
}

/* ── Banner ── */
function showBanner(msg, type = 'info') {
  statusBanner.textContent = msg;
  statusBanner.className = `status-banner status-${type}`;
  statusBanner.style.display = 'block';
}

/* ── Categories ── */
function buildCategoryTabs() {
  const cats = ['All', ...new Set(allDeals.map(d => d.category).filter(Boolean).sort())];
  categoryTabs.innerHTML = cats.map(cat =>
    `<button class="tab${cat === activeCategory ? ' active' : ''}" data-cat="${cat}">${cat}</button>`
  ).join('');
  categoryTabs.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeCategory = btn.dataset.cat;
      categoryTabs.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderDeals();
    });
  });
}

/* ── Filter & Sort ── */
function getFilteredDeals() {
  let deals = [...allDeals];

  if (activeCategory !== 'All') {
    deals = deals.filter(d => d.category === activeCategory);
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    deals = deals.filter(d =>
      d.name.toLowerCase().includes(q) ||
      (d.description && d.description.toLowerCase().includes(q))
    );
  }

  switch (sortMode) {
    case 'price-asc':
      deals.sort((a, b) => (a.price ?? 9999) - (b.price ?? 9999)); break;
    case 'price-desc':
      deals.sort((a, b) => (b.price ?? 0) - (a.price ?? 0)); break;
    case 'name-asc':
      deals.sort((a, b) => a.name.localeCompare(b.name)); break;
    case 'savings':
      deals.sort((a, b) => (b.savings ? 1 : 0) - (a.savings ? 1 : 0)); break;
  }

  return deals;
}

/* ── Render Deals Grid ── */
function renderDeals() {
  const deals = getFilteredDeals();

  if (deals.length === 0) {
    dealsGrid.innerHTML = `<div class="empty-state"><h3>No deals found</h3><p>Try a different search or category.</p></div>`;
    return;
  }

  dealsGrid.innerHTML = deals.map(deal => dealCardHTML(deal)).join('');

  // Attach card events
  dealsGrid.querySelectorAll('.add-btn').forEach(btn => {
    btn.addEventListener('click', () => addToCart(btn.dataset.id));
  });
  dealsGrid.querySelectorAll('.qty-btn[data-action="inc"]').forEach(btn => {
    btn.addEventListener('click', () => changeQty(btn.dataset.id, 1));
  });
  dealsGrid.querySelectorAll('.qty-btn[data-action="dec"]').forEach(btn => {
    btn.addEventListener('click', () => changeQty(btn.dataset.id, -1));
  });
}

function categoryEmoji(cat) {
  const map = {
    'Meat & Seafood': '🥩', 'Dairy & Eggs': '🥛', 'Produce': '🥦',
    'Bakery': '🍞', 'Beverages': '🥤', 'Frozen': '🧊',
    'Pantry': '🥫', 'Household': '🧹', 'Alcohol': '🍺', 'Other': '🏷'
  };
  return map[cat] || '🏷';
}

function dealCardHTML(deal) {
  const inCart = !!cart[deal.id];
  const qty = inCart ? cart[deal.id].qty : 0;
  const imgHtml = deal.imageUrl
    ? `<img src="${deal.imageUrl}" alt="${deal.name}" loading="lazy" />`
    : `<div class="deal-img-placeholder">${categoryEmoji(deal.category)}</div>`;

  return `
    <div class="deal-card${inCart ? ' in-cart' : ''}" id="card-${deal.id}">
      <div class="deal-img">
        ${imgHtml}
        <span class="deal-cat-chip">${deal.category || 'General'}</span>
      </div>
      <div class="deal-body">
        <div class="deal-name">${deal.name}</div>
        ${deal.description ? `<div class="deal-desc">${deal.description}</div>` : ''}
        <div class="deal-price-row">
          <span class="deal-price">${deal.priceText}</span>
          ${deal.originalPrice ? `<span class="deal-original">${deal.originalPrice}</span>` : ''}
          ${deal.savings ? `<span class="deal-savings">${deal.savings}</span>` : ''}
        </div>
      </div>
      <div class="deal-footer">
        <button class="add-btn${inCart ? ' added' : ''}" data-id="${deal.id}"
          style="${inCart ? 'display:none' : ''}">
          + Add to Cart
        </button>
        <div class="qty-control${inCart ? ' show' : ''}" id="qty-${deal.id}">
          <button class="qty-btn qty-remove" data-id="${deal.id}" data-action="dec">−</button>
          <span class="qty-num" id="qtyNum-${deal.id}">${qty}</span>
          <button class="qty-btn" data-id="${deal.id}" data-action="inc">+</button>
        </div>
      </div>
    </div>`;
}

/* ── Cart Logic ── */
function addToCart(id) {
  const deal = allDeals.find(d => d.id === id);
  if (!deal) return;
  cart[id] = { ...deal, qty: 1 };
  saveCart();
  updateCard(id);
  renderCartSidebar();
  updateCartStats();
}

function changeQty(id, delta) {
  if (!cart[id]) return;
  cart[id].qty += delta;
  if (cart[id].qty <= 0) {
    delete cart[id];
    saveCart();
    updateCard(id);
    renderCartSidebar();
    updateCartStats();
    return;
  }
  saveCart();
  const qtyEl = document.getElementById(`qtyNum-${id}`);
  if (qtyEl) qtyEl.textContent = cart[id].qty;
  renderCartSidebar();
  updateCartStats();
}

function updateCard(id) {
  const card = document.getElementById(`card-${id}`);
  if (!card) return;
  const inCart = !!cart[id];
  const addBtn = card.querySelector('.add-btn');
  const qtyCtrl = card.querySelector('.qty-control');
  const qtyNum = card.querySelector('.qty-num');

  card.classList.toggle('in-cart', inCart);
  if (addBtn) addBtn.style.display = inCart ? 'none' : '';
  if (qtyCtrl) qtyCtrl.classList.toggle('show', inCart);
  if (qtyNum && inCart) qtyNum.textContent = cart[id].qty;
}

function getCartTotal() {
  return Object.values(cart).reduce((sum, item) => {
    const price = item.price ?? 0;
    return sum + price * item.qty;
  }, 0);
}

function getCartItemCount() {
  return Object.values(cart).reduce((sum, item) => sum + item.qty, 0);
}

function saveCart() {
  localStorage.setItem('dealCart', JSON.stringify(cart));
  const count = getCartItemCount();
  cartBadge.textContent = count;
  cartBadge.classList.toggle('show', count > 0);
}

/* ── Render Cart Sidebar ── */
function renderCartSidebar() {
  const items = Object.values(cart);
  const isEmpty = items.length === 0;

  cartEmpty.style.display = isEmpty ? '' : 'none';
  cartFooter.style.display = isEmpty ? 'none' : '';

  if (isEmpty) {
    cartList.innerHTML = '';
    return;
  }

  cartList.innerHTML = items.map(item => {
    const lineTotal = item.price ? `$${(item.price * item.qty).toFixed(2)}` : '—';
    return `
      <li class="cart-item" id="ci-${item.id}">
        <div class="cart-item-info">
          <div class="cart-item-name">${item.name}</div>
          <div class="cart-item-price">${item.priceText}</div>
        </div>
        <div class="cart-item-qty">
          <button class="cart-qty-btn" data-id="${item.id}" data-action="dec">−</button>
          <span class="cart-qty-num">${item.qty}</span>
          <button class="cart-qty-btn" data-id="${item.id}" data-action="inc">+</button>
        </div>
        <div class="cart-item-total">${lineTotal}</div>
        <button class="cart-remove" data-id="${item.id}" title="Remove">✕</button>
      </li>`;
  }).join('');

  const total = getCartTotal();
  const count = getCartItemCount();
  document.getElementById('cartSubtotal').textContent = `$${total.toFixed(2)}`;
  document.getElementById('cartTotal').textContent = `$${total.toFixed(2)}`;
  document.getElementById('cartItemCount').textContent = count;

  // Cart sidebar events
  cartList.querySelectorAll('.cart-qty-btn[data-action="dec"]').forEach(btn =>
    btn.addEventListener('click', () => changeQty(btn.dataset.id, -1)));
  cartList.querySelectorAll('.cart-qty-btn[data-action="inc"]').forEach(btn =>
    btn.addEventListener('click', () => changeQty(btn.dataset.id, 1)));
  cartList.querySelectorAll('.cart-remove').forEach(btn =>
    btn.addEventListener('click', () => {
      delete cart[btn.dataset.id];
      saveCart();
      updateCard(btn.dataset.id);
      renderCartSidebar();
      updateCartStats();
    }));
}

/* ── Cart Sidebar Toggle ── */
function openCart() {
  cartSidebar.classList.add('open');
  overlay.classList.add('show');
}
function closeCartFn() {
  cartSidebar.classList.remove('open');
  overlay.classList.remove('show');
}

cartToggle.addEventListener('click', () => {
  if (window.innerWidth <= 900) {
    openCart();
  } else {
    cartSidebar.classList.toggle('hidden');
  }
});
closeCart.addEventListener('click', closeCartFn);
overlay.addEventListener('click', closeCartFn);

/* ── Refresh ── */
refreshBtn.addEventListener('click', async () => {
  refreshBtn.disabled = true;
  refreshBtn.querySelector('.btn-icon').classList.add('spinning');
  await loadDeals(true);
  refreshBtn.disabled = false;
  refreshBtn.querySelector('.btn-icon').classList.remove('spinning');
});

/* ── Search & Sort ── */
searchInput.addEventListener('input', e => {
  searchQuery = e.target.value.trim();
  renderDeals();
});
sortSelect.addEventListener('change', e => {
  sortMode = e.target.value;
  renderDeals();
});

/* ── Clear Cart ── */
document.getElementById('clearCartBtn').addEventListener('click', () => {
  cart = {};
  saveCart();
  // Refresh all cards in grid
  allDeals.forEach(d => updateCard(d.id));
  renderCartSidebar();
  updateCartStats();
});

/* ── Init ── */
saveCart();
renderCartSidebar();
loadStores().then(() => loadDeals());
