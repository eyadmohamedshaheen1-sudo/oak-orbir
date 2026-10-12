/* Marketplace layer: roles (buyer / seller / admin), product detail + reviews,
   account page, seller dashboard. Loaded BEFORE app.js; app.js calls
   initMarket() once the DOM and shared state ($, user, cart...) exist. */

let sImgs = [], rImgs = [], curP = 0, curReviews = [];

/* ---------- helpers ---------- */
const isAdmin = () => !!user && user.role === 'admin';
const isSeller = () => !!user && (user.role === 'seller' || user.role === 'admin');
const pimgs = p => (p && p.imgs) || [];
const soldBy = p => p.seller ? (p.shop || 'Marketplace seller') : 'Oak&Orbit';
const canEdit = p => !!p && !!user && (isAdmin() || p.seller === user.email);
const viewOpen = id => !document.getElementById('v-' + id).classList.contains('hide');
const DESC = { Tech: 'Built for everyday use and backed by a one-year warranty.', Home: 'Made to last and designed to look good in any room.', Style: 'Crafted from quality materials for daily wear.', Beauty: 'Gentle on skin and tested for everyday use.', Sports: 'Built to keep up with your training.', Kitchen: 'Makes cooking faster, easier and more fun.' };

function confirmClick(t, fn) {            // two-step button instead of confirm() (dialogs can be blocked)
  if (t.dataset.armed) { fn(); return; }
  t.dataset.armed = '1';
  const o = t.textContent;
  t.textContent = 'Sure?';
  setTimeout(() => { t.dataset.armed = ''; t.textContent = o; }, 2500);
}

/* ---------- images (resized in the browser before upload) ---------- */
function shrink(file, maxPx = 720, q = 0.72) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onerror = rej;
    r.onload = () => {
      const im = new Image();
      im.onerror = rej;
      im.onload = () => {
        const k = Math.min(1, maxPx / Math.max(im.width, im.height)), c = document.createElement('canvas');
        c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', q));
      };
      im.src = r.result;
    };
    r.readAsDataURL(file);
  });
}
async function pickImages(input, max) {
  const files = [...input.files].filter(f => f.type.startsWith('image/')).slice(0, Math.max(0, max));
  return Promise.all(files.map(f => shrink(f)));
}

/* ---------- product page ---------- */
async function openP(i) {
  let p;
  try { p = (await api.get('/api/products/' + i)).product; } catch (e) { return go('home'); }
  curP = i;
  const rating = p.rating, imgs = pimgs(p), left = p.stock,
    rel = P.filter(x => !x.hidden && x.c === p.c && x.id !== i).slice(0, 3);
  $('pp').innerHTML = `<nav class="crumb"><button class="lk" data-go="home">Home</button> / <button class="lk" data-c="${esc(p.c)}">${esc(p.c)}</button> / <span>${esc(p.n)}</span></nav>
<div class="pg"><div><div class="pimg" id="pmain" style="background:${p.bg || '#eee'}">${pic(p)}</div>${imgs.length > 1 ? `<div class="gal">${imgs.map((s, k) => `<button data-gi="${k}" aria-label="Photo ${k + 1}"><img src="${s}" alt=""></button>`).join('')}</div>` : ''}</div>
<div class="pinfo"><small>${esc(p.c)}</small><h1>${esc(p.n)}</h1>
<p class="rate"><span class="st" style="--w:${rating / 5 * 100}%">★★★★★</span><b>${rating}</b><small>(${p.reviewCount} ${p.reviewCount === 1 ? 'review' : 'reviews'})</small></p>
<div class="pprice">${money(p.p)}${off(p) ? ` <s class="was">${money(was(p))}</s> <span class="save">Save ${off(p)}%</span>` : ''}</div>
<p class="lead">${esc(p.d)}${p.seller ? '' : ' ' + (DESC[p.c] || '')}</p>
<ul class="facts"><li>${left === 0 ? 'Out of stock' : left && left <= 5 ? 'Only ' + left + ' left' : 'In stock'}</li><li>Sold by ${esc(soldBy(p))}</li><li>Delivery in 2-4 days</li><li>Free shipping over $50</li><li>30-day returns</li></ul>
<div class="buy"><div class="qtyb"><button data-qq="-1" aria-label="Decrease quantity">−</button><span id="pq">1</span><button data-qq="1" aria-label="Increase quantity">+</button></div><button class="btn alt" data-a2="${p.id}" ${left === 0 ? 'disabled' : ''}>${left === 0 ? 'Out of stock' : 'Add to cart'}</button><button class="nav-btn" data-h="${p.id}">${wish.includes(p.id) ? '♥ Saved' : '♡ Save'}</button></div>
<table class="spec"><tr><td>Category</td><td>${esc(p.c)}</td></tr><tr><td>Seller</td><td>${esc(soldBy(p))}</td></tr><tr><td>SKU</td><td>OO-${1000 + p.id}</td></tr><tr><td>Warranty</td><td>12 months</td></tr></table></div></div>
<div class="rvs" id="rv-box"></div>
${rel.length ? `<h3 style="margin:40px 0 14px">You may also like</h3><div class="two" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr))">${rel.map(x => `<div class="mini" data-p="${x.id}"><span style="background:${x.bg || '#eee'}">${pic(x)}</span><b>${esc(x.n)}</b><small>${money(x.p)}</small></div>`).join('')}</div>` : ''}`;
  await renderRv(i, p);
  go('product');
}

/* ---------- reviews (stars + comment + photos) ---------- */
const canDelRv = r => !!user && (user.role === 'admin' || (!!r.userEmail && r.userEmail === user.email));

async function renderRv(i, p) {
  myStar = 0; rImgs = [];
  const res = await api.get('/api/products/' + i + '/reviews');
  curReviews = res.reviews;
  const items = curReviews.length ? curReviews.map(r => `<div class="rv"><div class="rvh"><b>${esc(r.userName)}</b> <span>${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</span> <small>${new Date(r.ts).toLocaleDateString('en-US')}</small>${canDelRv(r) ? `<button class="lk" data-dr="${r.id}">Delete</button>` : ''}</div><p style="margin:4px 0 0">${esc(r.text)}</p>${(r.imgs || []).length ? `<div class="rimgs">${r.imgs.map(s => `<img data-zoom src="${s}" alt="Review photo">`).join('')}</div>` : ''}</div>`).join('')
    : '<p style="color:var(--mut)">No reviews yet. Be the first to share your thoughts.</p>';
  let form;
  if (!user) form = `<p style="margin-top:14px"><button class="lk" data-go="login">Sign in</button> to write a review.</p>`;
  else if (p.seller === user.email) form = '<p style="margin-top:14px;color:var(--mut)">You cannot review your own product.</p>';
  else if (curReviews.some(r => r.userEmail === user.email)) form = '<p style="margin-top:14px;color:var(--mut)">You have already reviewed this product. Delete your review above to write a new one.</p>';
  else form = `<h3 style="margin:18px 0 6px">Write a review</h3><div class="stars" role="group" aria-label="Your rating">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-s="${n}" aria-label="${n} stars">★</button>`).join('')}</div><label for="rv-t">Your comment</label><textarea id="rv-t" rows="3" maxlength="400" placeholder="What did you like or dislike?"></textarea><label for="rv-i">Add photos (optional, up to 3)</label><input id="rv-i" type="file" accept="image/*" multiple><div class="prev" id="rv-prev"></div><div class="msg" id="m-rv" role="alert"></div><button class="btn" data-rsub="${i}">Submit review</button>`;
  $('rv-box').innerHTML = `<h3 style="margin:6px 0">Reviews (${curReviews.length})</h3>` + items + form;
}

async function submitReview(i) {
  const tx = $('rv-t').value.trim();
  if (!myStar) return bad('m-rv', 'Choose a star rating.');
  if (tx.length < 3) return bad('m-rv', 'Write a short comment.');
  try {
    await api.post('/api/products/' + i + '/reviews', { stars: myStar, text: tx, imgs: rImgs.slice() });
    await loadProducts(); renderShop();
    await openP(i);
    $('rv-box').scrollIntoView({ block: 'center' });
    toast('Thanks for your review!');
  } catch (err) { bad('m-rv', err.error || 'Something went wrong.'); }
}
async function delReview(id) {
  try {
    await api.del('/api/reviews/' + id);
    await loadProducts(); renderShop();
    if (viewOpen('product')) { await openP(curP); $('rv-box').scrollIntoView({ block: 'center' }); }
    toast('Review deleted');
  } catch (e) { toast(e.error || 'You cannot delete this review'); }
}

/* ---------- account ---------- */
async function renderAcc() {
  const res = await api.get('/api/orders');
  const myOrders = res.orders, role = user.role;
  $('acc-h').textContent = 'Hello, ' + user.name;
  const saved = wish.map(i => P.find(p => p.id === i)).filter(Boolean).map(p => esc(p.n)).join(', ');
  $('acc-b').innerHTML = `<p style="color:var(--mut)">${esc(user.email)} <span class="tag">${role === 'admin' ? 'Admin' : role === 'seller' ? 'Seller' : 'Buyer'}</span></p>`
    + (role !== 'buyer' ? `<button class="btn alt" style="margin-top:8px" data-oo="${role === 'admin' ? 'goAdmin' : 'goSeller'}">${role === 'admin' ? 'Open admin panel' : 'Manage my store'}</button>` : '')
    + '<h3 style="margin:20px 0 6px">Order history</h3>'
    + (myOrders.length ? myOrders.map(o => `<div class="ord"><b>${o.id}</b> · ${new Date(o.ts).toLocaleDateString('en-US')} · ${money(o.total)} <span class="tag">${o.status}</span><br><small>${o.lines.map(l => esc(l.n) + ' × ' + l.q).join(', ')}</small></div>`).join('') : '<p style="color:var(--mut)">No orders yet. Your purchases will show up here.</p>')
    + `<h3 style="margin:20px 0 6px">Saved items</h3><p>${saved || 'Nothing saved yet.'}</p><button class="btn" style="margin-top:16px" data-oo="signOut">Sign out</button>`;
}

async function signOut() {
  try { await api.post('/api/auth/logout'); } catch (e) {}
  await setUser(null);
  go('home');
  toast('Signed out');
}

/* ---------- seller dashboard ---------- */
function renderPrev() {
  $('pf-prev').innerHTML = sImgs.map((s, k) => `<div class="pv"><img src="${s}" alt=""><button type="button" data-rmi="${k}" aria-label="Remove photo">✕</button></div>`).join('');
}
function resetForm() {
  $('f-prod').reset(); $('pf-id').value = ''; sImgs = []; renderPrev();
  $('pf-h').textContent = 'Add a product'; $('pf-cancel').classList.add('hide'); $('m-prod').textContent = '';
}
async function renderSeller() {
  const sel = $('pf-c');
  if (!sel.options.length) sel.innerHTML = CATS.map(c => `<option>${c}</option>`).join('');
  $('sl-h').textContent = isAdmin() ? 'Add or edit products' : (user.shop || 'My store');
  const [prodRes, salesRes, statsRes] = await Promise.all([
    api.get('/api/seller/products'), api.get('/api/seller/sales'), api.get('/api/seller/stats'),
  ]);
  const mine = prodRes.products, sales = salesRes.sales, stats = statsRes;
  $('sl-stats').innerHTML = [['Products', stats.productCount], ['Units sold', stats.unitsSold], ['Revenue', money(stats.revenue)]].map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join('');
  $('sl-list').innerHTML = mine.length ? mine.map(p => `<div class="item"><div class="t" style="background:${p.bg || '#eee'}">${pic(p)}</div><div style="flex:1"><b>${esc(p.n)}</b><div>${money(p.p)} · ${p.stock} in stock</div></div><button class="nav-btn" data-ep="${p.id}">Edit</button> <button class="nav-btn" data-dp="${p.id}">Delete</button></div>`).join('')
    : '<p style="color:var(--mut)">No products yet. Add your first one with the form.</p>';
  $('sl-sales').innerHTML = sales.length ? sales.slice(0, 10).map(s => `<div class="ord"><b>${esc(s.n)}</b> × ${s.q} · ${money(s.p * s.q)}<br><small>${s.orderId} · ${new Date(s.ts).toLocaleDateString('en-US')} · ${s.status}</small></div>`).join('')
    : '<p style="color:var(--mut)">No sales yet.</p>';
  window._mySellerProducts = mine; // used by editProd/delProd below
}
async function editProd(id) {
  const p = (window._mySellerProducts || []).find(x => x.id === id);
  if (!p || !canEdit(p)) return toast('You cannot edit this product');
  resetForm(); go('seller');
  $('pf-id').value = id; $('pf-n').value = p.n; $('pf-c').value = p.c; $('pf-p').value = p.p;
  $('pf-o').value = p.o || ''; $('pf-k').value = p.stock; $('pf-d').value = p.d || '';
  sImgs = pimgs(p).slice(); renderPrev();
  $('pf-h').textContent = 'Edit product'; $('pf-cancel').classList.remove('hide'); scrollTo(0, 0);
}
async function saveProduct(e) {
  e.preventDefault();
  const g = i => $(i).value.trim(), n = g('pf-n'), price = parseFloat(g('pf-p')), old = parseFloat(g('pf-o')),
    stock = g('pf-k') === '' ? 0 : parseInt(g('pf-k'), 10), d = g('pf-d'), id = +g('pf-id');
  if (n.length < 3) return bad('m-prod', 'Enter a product name (at least 3 characters).');
  if (!(price > 0)) return bad('m-prod', 'Enter a valid price.');
  if (old && old <= price) return bad('m-prod', 'Old price must be higher than the current price.');
  if (isNaN(stock) || stock < 0) return bad('m-prod', 'Stock must be 0 or more.');
  if (d.length < 10) return bad('m-prod', 'Add a short description (at least 10 characters).');
  if (!id && !sImgs.length) return bad('m-prod', 'Add at least one photo.');
  const payload = { n, c: g('pf-c'), p: price, o: old || null, stock, d, imgs: sImgs.slice() };
  try {
    if (id) { if (!canEdit((window._mySellerProducts || []).find(x => x.id === id))) return bad('m-prod', 'You cannot edit this product.'); await api.put('/api/products/' + id, payload); }
    else await api.post('/api/products', payload);
    await loadProducts(); renderShop(); resetForm(); await renderSeller();
    toast(id ? 'Product updated' : 'Product published');
  } catch (err) { bad('m-prod', err.error || 'Something went wrong.'); }
}
async function delProd(id) {
  try {
    await api.del('/api/products/' + id);
    delete cart[id]; renderCart();
    await loadProducts(); renderShop();
    toast('Product deleted');
    if (viewOpen('seller')) await renderSeller();
  } catch (e) { toast(e.error || 'You cannot delete this product'); }
}

/* ---------- wiring (called once from app.js) ---------- */
function initMarket() {
  $('f-prod').onsubmit = saveProduct;
  $('pf-cancel').onclick = resetForm;
  $('lb').onclick = () => $('lb').close();
  document.querySelectorAll('[name=r-role]').forEach(r => r.onchange = () =>
    $('r-shopw').classList.toggle('hide', document.querySelector('[name=r-role]:checked').value !== 'seller'));

  document.addEventListener('change', async e => {
    const t = e.target;
    if (t.id === 'rv-i') {
      try { rImgs = await pickImages(t, 3); } catch (x) { toast('Could not read that image.'); }
      $('rv-prev').innerHTML = rImgs.map(s => `<div class="pv"><img src="${s}" alt=""></div>`).join('');
    }
    if (t.id === 'pf-i') {
      try { sImgs = [...sImgs, ...(await pickImages(t, 5 - sImgs.length))].slice(0, 5); } catch (x) { toast('Could not read that image.'); }
      t.value = ''; renderPrev();
    }
  });

  document.addEventListener('click', e => {
    const t = e.target, d = t.dataset, g = t.closest('[data-gi]');
    if (d.rsub) submitReview(+d.rsub);
    if (d.dr !== undefined) confirmClick(t, () => delReview(+d.dr));
    if (g) { const p = P.find(x => x.id === curP); $('pmain').innerHTML = `<img src="${pimgs(p)[+g.dataset.gi]}" alt="${esc(p ? p.n : '')}">`; }
    if ('zoom' in d) { $('lb-img').src = t.src; $('lb').showModal(); }
    if (d.rmi !== undefined) { sImgs.splice(+d.rmi, 1); renderPrev(); }
    if (d.ep) editProd(+d.ep);
    if (d.dp) confirmClick(t, () => delProd(+d.dp));
  });
}