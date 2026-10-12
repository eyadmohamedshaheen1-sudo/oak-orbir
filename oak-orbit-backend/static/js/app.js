/* Oak & Orbit -- core app logic. Talks to the Flask API via api.js instead of
   localStorage. Loaded after marketplace.js (roles/seller/reviews helpers)
   and api.js (fetch wrapper). */

let P = [];                 // currently loaded product list (server-filtered)
let CATS = ['Tech', 'Home', 'Style', 'Beauty', 'Sports', 'Kitchen'];
let cart = JSON.parse(sessionStorage.getItem('oo_cart') || '{}');
let cat = 'All', user = null, resetEmail = null, showWish = false, promo = 0, promoCode = '', myStar = 0;
let wish = [];
let cfg = { ship: 5, express: 15, free: 50, ann: '' };

const $ = id => document.getElementById(id);
const money = n => '$' + (+n || 0).toFixed(2);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const bad = (id, t) => { const m = $(id); m.className = 'msg e'; m.textContent = t; };
const okE = e => /^\S+@\S+\.\S+$/.test(e);

function toast(t) { const e = $('toast'); e.textContent = t; e.classList.add('on'); setTimeout(() => e.classList.remove('on'), 1800); }
function saveCart() { sessionStorage.setItem('oo_cart', JSON.stringify(cart)); }

/* ---------- routing ---------- */
async function go(v) {
  const gate = { account: 'in', checkout: 'in', seller: 'seller', admin: 'admin' }[v];
  if (gate && !user) { toast('Sign in to continue'); v = 'login'; }
  else if ((gate === 'seller' && !isSeller()) || (gate === 'admin' && !isAdmin())) { toast('You do not have access to that page'); v = 'home'; }
  else if (v === 'admin') { AdminApp.open(); return; }
  ['home', 'login', 'register', 'forgot', 'checkout', 'done', 'account', 'product', 'seller'].forEach(x => $('v-' + x).classList.toggle('hide', x !== v));
  if (v === 'checkout') renderCo();
  if (v === 'account') await renderAcc();
  if (v === 'seller') await renderSeller();
  if (v === 'forgot') { $('f-forgot').classList.remove('hide'); $('f-reset').classList.add('hide'); }
  if (v === 'login' && user) return go('home');
  scrollTo(0, 0);
}

/* ---------- catalog ---------- */
async function loadProducts() {
  const params = new URLSearchParams();
  if ($('q').value.trim()) params.set('q', $('q').value.trim());
  if (cat !== 'All') params.set('category', cat);
  if ($('sort').value) params.set('sort', $('sort').value);
  const res = await api.get('/api/products?' + params.toString());
  P = res.products;
  CATS = res.categories;
}

const off = p => p.o > p.p ? Math.round((1 - p.p / p.o) * 100) : 0;
const was = p => p.o;
const pic = p => (p.imgs && p.imgs.length) ? `<img src="${p.imgs[0]}" alt="${esc(p.n)}" loading="lazy">` : (p.e || '🛍️');

function renderShop() {
  const cats = ['All', ...CATS];
  $('catnav').innerHTML = cats.map(c => `<button data-c="${c}" class="${c === cat ? 'on' : ''}">${c === 'All' ? 'All products' : c}</button>`).join('');
  $('shop').innerHTML = '<h2 style="margin-right:12px">' + (showWish ? 'Saved items' : 'All products') + '</h2>' + cats.map(c => `<button class="chip" aria-pressed="${c === cat}" data-c="${c}">${c}</button>`).join('');
  const list = showWish ? P.filter(p => wish.includes(p.id)) : P;
  $('grid').innerHTML = list.length ? list.map(p => `<article class="card" data-p="${p.id}"><button class="heart" data-h="${p.id}" aria-label="Save to wishlist">${wish.includes(p.id) ? '♥' : '♡'}</button><div class="thumb" data-p="${p.id}" style="background:${p.bg || '#eee'}">${pic(p)}${off(p) ? `<span class="badge">-${off(p)}%</span>` : ''}</div><div class="b"><small>${esc(p.c)}</small><h3>${esc(p.n)}</h3><div class="rt"><span class="st" style="--w:${p.rating / 5 * 100}%">★★★★★</span><small>${p.rating} (${p.reviewCount})</small></div><div class="price">${money(p.p)}${off(p) ? ` <s>${money(was(p))}</s>` : ''}</div></div></article>`).join('')
    : '<p style="color:var(--mut);padding:24px 0">No products match.</p>';
}

function renderCart() {
  const ids = Object.keys(cart);
  $('cc').textContent = ids.reduce((s, i) => s + cart[i], 0);
  $('cl').innerHTML = ids.length ? ids.map(i => {
    const p = P.find(x => x.id == i); if (!p) return '';
    return `<div class="item"><div class="t" style="background:${p.bg || '#eee'}">${pic(p)}</div><div style="flex:1"><b>${esc(p.n)}</b><div>${money(p.p)}</div></div><div class="qty"><button data-q="-1" data-i="${i}" aria-label="Decrease">−</button> ${cart[i]} <button data-q="1" data-i="${i}" aria-label="Increase">+</button></div></div>`;
  }).join('') : '<p style="color:var(--mut)">Your cart is empty.</p>';
  const total = ids.reduce((s, i) => { const p = P.find(x => x.id == i); return s + (p ? cart[i] * p.p : 0); }, 0);
  $('ct').textContent = money(total);
  saveCart();
}

function checkout() {
  if (!Object.keys(cart).length) return toast('Your cart is empty');
  if (!user) { cartDlg.close(); go('login'); return toast('Sign in to checkout'); }
  cartDlg.close(); go('checkout');
}

function list() { return P; } // kept for compatibility with other modules

/* ---------- auth forms ---------- */
async function setUser(u) {
  user = u;
  $('acct').textContent = u ? 'Hi, ' + u.name.split(' ')[0] : 'Sign in';
  $('acct').onclick = () => go(u ? 'account' : 'login');
  const d = $('dash'), staff = !!u && u.role !== 'buyer';
  d.classList.toggle('hide', !staff);
  if (staff) {
    d.textContent = u.role === 'admin' ? 'Admin' : 'My store';
    d.onclick = () => { if (u.role === 'admin') go('admin'); else { resetForm(); go('seller'); } };
  }
  if (u) {
    try { const w = await api.get('/api/wishlist'); wish = w.productIds; } catch (e) { wish = []; }
  } else {
    wish = [];
  }
  $('wc').textContent = wish.length;
}

$('f-login').onsubmit = async e => {
  e.preventDefault();
  const em = $('l-e').value.trim().toLowerCase(), pw = $('l-p').value;
  if (!okE(em)) return bad('m-login', 'Enter a valid email address.');
  if (!pw) return bad('m-login', 'Enter your password.');
  try {
    const res = await api.post('/api/auth/login', { email: em, password: pw });
    await setUser(res.user);
    go(res.user.role === 'seller' ? 'seller' : res.user.role === 'admin' ? 'admin' : 'home');
    toast('Welcome back, ' + res.user.name.split(' ')[0]);
    renderShop();
  } catch (err) { bad('m-login', err.error || 'Something went wrong.'); }
};

$('f-reg').onsubmit = async e => {
  e.preventDefault();
  const n = $('r-n').value.trim(), em = $('r-e').value.trim().toLowerCase(), pw = $('r-p').value;
  if (n.length < 2) return bad('m-reg', 'Enter your full name.');
  if (!okE(em)) return bad('m-reg', 'Enter a valid email address.');
  if (pw.length < 8) return bad('m-reg', 'Password must be at least 8 characters.');
  if (pw !== $('r-c').value) return bad('m-reg', 'Passwords do not match.');
  const role = document.querySelector('[name=r-role]:checked').value, shop = $('r-s').value.trim();
  if (role === 'seller' && shop.length < 2) return bad('m-reg', 'Enter your store name.');
  try {
    const res = await api.post('/api/auth/register', { name: n, email: em, password: pw, role, shop });
    await setUser(res.user);
    go(role === 'seller' ? 'seller' : 'home');
    toast('Account created. Welcome, ' + n.split(' ')[0] + '!');
    renderShop();
  } catch (err) { bad('m-reg', err.error || 'Something went wrong.'); }
};

$('f-forgot').onsubmit = async e => {
  e.preventDefault();
  const em = $('f-e').value.trim().toLowerCase();
  if (!okE(em)) return bad('m-forgot', 'Enter a valid email address.');
  resetEmail = em;
  try {
    const res = await api.post('/api/auth/forgot', { email: em });
    $('reset-info').textContent = res.message + (res.demo_code ? ' Demo code: ' + res.demo_code : '');
    $('f-forgot').classList.add('hide'); $('f-reset').classList.remove('hide');
  } catch (err) { bad('m-forgot', err.error || 'Something went wrong.'); }
};

$('f-reset').onsubmit = async e => {
  e.preventDefault();
  try {
    await api.post('/api/auth/reset', { email: resetEmail, code: $('x-c').value.trim(), password: $('x-p').value });
    $('x-c').value = $('x-p').value = ''; go('login'); toast('Password updated. Sign in with your new password.');
  } catch (err) { bad('m-reset', err.error || 'Something went wrong.'); }
};

/* ---------- checkout ---------- */
function totals() {
  const ids = Object.keys(cart);
  const s = ids.reduce((a, i) => { const p = P.find(x => x.id == i); return a + (p ? cart[i] * p.p : 0); }, 0);
  const d = s * promo;
  const sh = $('c-s').value === 'x' ? cfg.express : (s >= cfg.free ? 0 : cfg.ship);
  return { s, d, sh, t: s - d + sh };
}
function renderCo() {
  $('c-s').options[0].text = 'Standard, 3-5 days (' + (cfg.ship ? '$' + cfg.ship : 'free') + ', free over $' + cfg.free + ')';
  $('c-s').options[1].text = 'Express, 1-2 days ($' + cfg.express + ')';
  const t = totals();
  $('co-sum').innerHTML = Object.keys(cart).map(i => {
    const p = P.find(x => x.id == i); if (!p) return '';
    return `<div class="sum"><span>${p.e || '🛍️'} ${esc(p.n)} × ${cart[i]}</span><span>${money(p.p * cart[i])}</span></div>`;
  }).join('') + `<div class="sum"><span>Subtotal</span><span>${money(t.s)}</span></div>` +
    (t.d ? `<div class="sum"><span>Discount</span><span>-${money(t.d)}</span></div>` : '') +
    `<div class="sum"><span>Shipping</span><span>${t.sh ? money(t.sh) : 'Free'}</span></div>` +
    `<div class="sum tot"><span>Total</span><span>${money(t.t)}</span></div>`;
}
async function applyPromo() {
  const code = $('c-p').value.trim().toUpperCase();
  try {
    const res = await api.get('/api/promo/' + encodeURIComponent(code));
    promo = res.promo.pct / 100; promoCode = res.promo.code;
    toast('Promo applied: ' + res.promo.pct + '% off');
  } catch (e) { promo = 0; promoCode = ''; toast('That promo code is not valid'); }
  renderCo();
}
$('f-co').onsubmit = async e => {
  e.preventDefault();
  const g = i => $(i).value.trim();
  if (g('c-n').length < 2 || g('c-a').length < 5 || !g('c-c') || g('c-z').length < 3) return bad('m-co', 'Complete your shipping details.');
  if (g('c-k').replace(/ /g, '').length < 13) return bad('m-co', 'Enter a valid card number.');
  if (g('c-x').length !== 5 || g('c-x')[2] !== '/' || g('c-v').length < 3) return bad('m-co', 'Check the expiry (MM/YY) and CVC.');
  const cartItems = Object.keys(cart).map(i => ({ id: +i, qty: cart[i] }));
  try {
    const res = await api.post('/api/orders', {
      cart: cartItems, name: g('c-n'), address: g('c-a'), city: g('c-c'), zip: g('c-z'),
      delivery: $('c-s').value, card: g('c-k'), expiry: g('c-x'), cvc: g('c-v'), promo: promoCode,
    });
    cart = {}; promo = 0; promoCode = ''; renderCart();
    $('done-id').textContent = res.order.id; $('m-co').textContent = '';
    e.target.reset();
    await loadProducts(); renderShop();
    go('done');
  } catch (err) { bad('m-co', err.error || 'Something went wrong.'); }
};

/* ---------- event wiring ---------- */
document.addEventListener('click', e => {
  const t = e.target;
  if (t.dataset.c) { cat = t.dataset.c; showWish = false; if ($('v-home').classList.contains('hide')) go('home'); loadProducts().then(renderShop); }
  if (t.dataset.a2) addToCart(+t.dataset.a2, +$('pq').textContent);
  if (t.dataset.qq) { const e2 = $('pq'); e2.textContent = Math.min(10, Math.max(1, +e2.textContent + +t.dataset.qq)); }
  if (t.dataset.h !== undefined) toggleWish(+t.dataset.h);
  if (t.dataset.p) openP(+t.dataset.p);
  if (t.dataset.s) { myStar = +t.dataset.s; document.querySelectorAll('.stars button').forEach(b => b.classList.toggle('on', +b.dataset.s <= myStar)); }
  if (t.dataset.a) addToCart(+t.dataset.a, 1);
  if (t.dataset.q) { const i = t.dataset.i; cart[i] = (cart[i] || 0) + +t.dataset.q; if (cart[i] < 1) delete cart[i]; renderCart(); }
  if (t.dataset.t) { const i = $(t.dataset.t); i.type = i.type === 'password' ? 'text' : 'password'; t.textContent = i.type === 'password' ? 'Show' : 'Hide'; }
});

async function toggleWish(id) {
  if (!user) { toast('Sign in to save items'); return go('login'); }
  try {
    const res = await api.post('/api/wishlist/' + id + '/toggle');
    wish = res.saved ? [...wish, id] : wish.filter(x => x !== id);
    $('wc').textContent = wish.length;
    renderShop();
    toast(res.saved ? 'Saved for later' : 'Removed from saved');
  } catch (e) { toast(e.error || 'Something went wrong.'); }
}

function addToCart(id, n) {
  const p = P.find(x => x.id === id);
  if (!p || p.hidden) return;
  const have = cart[id] || 0;
  if (have + n > p.stock) return toast(p.stock ? 'Only ' + p.stock + ' in stock' : 'Out of stock');
  cart[id] = have + n;
  renderCart();
  toast(n > 1 ? n + ' items added to cart' : 'Added to cart');
}

let qTimer;
$('q').oninput = () => { clearTimeout(qTimer); qTimer = setTimeout(() => { if ($('v-home').classList.contains('hide')) go('home'); loadProducts().then(renderShop); }, 250); };
$('sort').onchange = () => loadProducts().then(renderShop);
$('c-s').onchange = renderCo;

/* ---------- boot ---------- */
async function boot() {
  try {
    const [meRes, prodRes, setRes] = await Promise.all([
      api.get('/api/auth/me'), api.get('/api/products'), api.get('/api/settings'),
    ]);
    P = prodRes.products; CATS = prodRes.categories; cfg = setRes.settings;
    await setUser(meRes.user);
  } catch (e) {
    console.error('Startup failed', e);
    toast('Could not reach the server.');
  }
  const annEl = document.querySelector('.ann');
  if (cfg.ann && annEl) annEl.textContent = cfg.ann;
  initMarket();
  AdminApp.mount($('admin-root'), true);
  renderShop();
  renderCart();
}
boot();