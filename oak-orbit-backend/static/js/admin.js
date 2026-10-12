/* Admin console. Self-contained module, works embedded in index.html (inside
   #admin-root) and standalone on admin.html. Uses the same server session as
   the main site -- a user must be signed in with role "admin". */
(() => {
  const CATS = ['Tech', 'Home', 'Style', 'Beauty', 'Sports', 'Kitchen'];
  const STATUSES = ['Processing', 'Shipped', 'Delivered', 'Cancelled'];
  const ST_CLS = { Processing: 'warn', Shipped: 'info', Delivered: 'ok', Cancelled: 'bad' };
  const NAV = [['dash', 'Dashboard', '▦'], ['orders', 'Orders', '☰'], ['products', 'Products', '◫'], ['users', 'Users', '☺'], ['sellers', 'Sellers', '⌂'], ['reviews', 'Reviews', '★'], ['promos', 'Promotions', '%'], ['settings', 'Settings', '⚙'], ['log', 'Activity', '⏱']];
  const TITLE = { dash: 'Dashboard', orders: 'Orders', products: 'Products', users: 'Users', sellers: 'Sellers', reviews: 'Reviews', promos: 'Promotions', settings: 'Settings', log: 'Activity log' };

  let root, embedded = false, tab = 'dash', F = {}, pImgs = [], data = {}, me = null;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => '$' + (+n || 0).toFixed(2);
  const num = n => (+n || 0).toLocaleString('en-US');
  const day = t => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const dtm = t => new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const $ = sel => root.querySelector(sel);

  function flash(m, err) {
    const t = root && root.querySelector('#adm-toast'); if (!t) return;
    t.textContent = m; t.className = 'adm-toast on' + (err ? ' err' : '');
    clearTimeout(flash.T); flash.T = setTimeout(() => t.classList.remove('on'), 2200);
  }
  function arm(t, fn) {            // two-step confirm button (native confirm() can be blocked)
    if (t.dataset.armed) { fn(); return; }
    t.dataset.armed = '1'; const o = t.textContent; t.textContent = 'Sure?';
    setTimeout(() => { t.dataset.armed = ''; t.textContent = o; }, 2500);
  }

  const thumb = p => { const s = (p.imgs || [])[0]; return `<div class="a-th">${s ? `<img src="${s}" alt="">` : esc(p.e || '🛍️')}</div>`; };
  const badge = (t, k) => `<span class="a-badge ${k || ''}">${esc(t)}</span>`;
  const fSearch = (k, ph) => `<input class="a-in a-search" data-f="${k}" value="${esc(F[k] || '')}" placeholder="${esc(ph)}" aria-label="${esc(ph)}">`;
  const fSelect = (k, opts, all) => `<select class="a-in" data-f="${k}" aria-label="${esc(all)}"><option value="">${esc(all)}</option>${opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${F[k] === v ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;
  const tbl = (heads, rows, empty) => `<div class="a-tw"><table class="a-t"><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td colspan="${heads.length}" class="a-empty">${empty}</td></tr>`}</tbody></table></div>`;
  function bars(rows) {
    const mx = Math.max(1, ...rows.map(r => r.value));
    return `<ul class="a-hb">${rows.map(r => `<li><span>${esc(r.label)}</span><div><i style="width:${r.value / mx * 100}%"></i></div><b>${money(r.value)}</b></li>`).join('')}</ul>`;
  }

  function modal(html) { $('#adm-modal').innerHTML = `<div class="a-mb" role="dialog" aria-modal="true">${html}</div>`; $('#adm-modal').classList.remove('hide'); }
  function closeModal() { $('#adm-modal').classList.add('hide'); $('#adm-modal').innerHTML = ''; }

  /* ---------------- data loading ---------------- */
  async function loadTab(t) {
    const qs = o => Object.entries(o).filter(([, v]) => v).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
    if (t === 'dash') data.dash = await api.get('/api/admin/dashboard');
    if (t === 'orders') data.orders = (await api.get('/api/admin/orders?' + qs({ q: F.oq, status: F.os }))).orders;
    if (t === 'products') data.products = (await api.get('/api/admin/products?' + qs({ q: F.pq, category: F.pc, seller: F.ps }))).products;
    if (t === 'users') data.users = (await api.get('/api/admin/users?' + qs({ q: F.uq, role: F.ur }))).users;
    if (t === 'sellers') data.sellers = (await api.get('/api/admin/sellers')).sellers;
    if (t === 'reviews') data.reviews = (await api.get('/api/admin/reviews')).reviews;
    if (t === 'promos') data.promos = (await api.get('/api/admin/promos')).promos;
    if (t === 'settings') data.settings = (await api.get('/api/settings')).settings;
    if (t === 'log') data.log = (await api.get('/api/admin/log')).log;
  }

  /* ---------------- views ---------------- */
  function heroHtml() {
    const nm = (me.name || 'Admin').split(' ')[0], k = data.dash.kpis;
    return `<section class="a-hero"><div><small>Welcome back</small><h2>Hi, ${esc(nm)} 👋</h2><p>${k.pendingOrders} order${k.pendingOrders === 1 ? '' : 's'} waiting to ship. Here is how the store is doing.</p><div class="a-ha"><button class="a-btn pri2" data-act="p-new">+ Add product</button><button class="a-btn ghostw" data-nav="orders">View orders</button><button class="a-btn ghostw" data-nav="users">Manage users</button></div></div><div class="a-stack" aria-hidden="true"><i>🎧</i><i>🪴</i><i>👟</i><i>☕</i></div></section>`;
  }
  function dashView() {
    const k = data.dash.kpis, sc = data.dash.statusCounts;
    const kpis = [['Revenue', money(k.revenue)], ['Orders', num(k.orders)], ['Pending', num(k.pendingOrders)], ['Avg order value', money(k.avgOrderValue)], ['Users', num(k.users)], ['Products', num(k.products)]];
    return heroHtml()
      + `<div class="a-kpis">${kpis.map(([a, b]) => `<div class="a-kpi"><span>${a}</span><b>${b}</b></div>`).join('')}</div>
<div class="a-g2"><section class="a-card"><h3>Revenue, last 14 days</h3>${bars(data.dash.revenueSeries)}</section>
<section class="a-card"><h3>Orders by status</h3>${Object.keys(sc).length ? `<ul class="a-lg">${STATUSES.filter(s => sc[s]).map(s => `<li><i style="background:var(--a-${(ST_CLS[s] || 'mut')})"></i>${s}<b>${sc[s]}</b></li>`).join('')}</ul>` : '<p class="a-mut">No orders yet.</p>'}</section></div>
<div class="a-g2"><section class="a-card"><h3>Recent orders</h3>${data.dash.recentOrders.length ? `<ul class="a-tp">${data.dash.recentOrders.map(o => `<li><span>${esc(o.id)}<small>${esc(o.email || '')}</small></span>${badge(o.status, ST_CLS[o.status])}<b>${money(o.total)}</b></li>`).join('')}</ul>` : '<p class="a-mut">No orders yet.</p>'}</section>
<section class="a-card"><h3>Recent activity</h3>${data.dash.recentActivity.length ? `<ul class="a-tp">${data.dash.recentActivity.map(l => `<li><span>${esc(l.m)}<small>${esc(l.w)}</small></span><small>${dtm(l.t)}</small></li>`).join('')}</ul>` : '<p class="a-mut">Nothing logged yet.</p>'}</section></div>`;
  }

  function ordersView() {
    return `<div class="a-bar">${fSearch('oq', 'Search order, name or email')}${fSelect('os', STATUSES, 'All statuses')}</div>`
      + tbl(['Order', 'Date', 'Customer', 'Items', 'Total', 'Status', ''], data.orders.map(o => `<tr><td><b>${esc(o.id)}</b></td><td>${day(o.ts)}</td><td>${esc(o.buyerName || o.email)}<small>${esc(o.email)}</small></td><td>${(o.lines || []).reduce((a, l) => a + l.q, 0)}</td><td>${money(o.total)}</td><td>${badge(o.status, ST_CLS[o.status])}</td><td class="a-r"><button class="a-btn sm" data-act="o-view" data-id="${esc(o.id)}">View</button></td></tr>`), 'No orders match.');
  }
  function openOrder(id) {
    const o = data.orders.find(x => x.id === id); if (!o) return;
    modal(`<div class="a-mh"><h3>Order ${esc(o.id)}</h3><button class="a-x" data-act="mclose" aria-label="Close">✕</button></div>
<div class="a-cols"><div><small class="a-k">Customer</small><p>${esc(o.buyerName || o.email)}<br>${esc(o.email)}</p></div><div><small class="a-k">Placed</small><p>${dtm(o.ts)}</p></div><div><small class="a-k">Total</small><p><b>${money(o.total)}</b>${o.promo ? ' · code ' + esc(o.promo) : ''}</p></div></div>
${tbl(['Item', 'Seller', 'Qty', 'Amount'], (o.lines || []).map(l => `<tr><td>${esc(l.n)}</td><td>${esc(l.seller)}</td><td>${l.q}</td><td>${money(l.p * l.q)}</td></tr>`), 'No line items.')}
<label class="a-l">Status<select class="a-in" id="o-st">${STATUSES.map(x => `<option ${x === o.status ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
<div class="a-mf"><button class="a-btn" data-act="mclose">Close</button><button class="a-btn pri" data-act="o-save" data-id="${esc(o.id)}">Save changes</button></div>`);
  }
  async function saveOrder(id) {
    try { await api.put('/api/admin/orders/' + encodeURIComponent(id), { status: $('#o-st').value }); await loadTab('orders'); closeModal(); render(); flash('Order updated'); }
    catch (e) { flash(e.error || 'Could not update order', true); }
  }

  function productsView() {
    return `<div class="a-bar">${fSearch('pq', 'Search products')}${fSelect('pc', CATS, 'All categories')}<span class="a-sp"></span><button class="a-btn pri" data-act="p-new">+ Add product</button></div>`
      + tbl(['', 'Product', 'Category', 'Price', 'Stock', 'Seller', 'Rating', 'Status', ''], data.products.map(p => `<tr><td>${thumb(p)}</td><td><b>${esc(p.n)}</b><small>#${p.id}</small></td><td>${esc(p.c)}</td><td>${money(p.p)}</td><td>${p.stock <= 5 ? badge(p.stock + ' left', p.stock ? 'warn' : 'bad') : p.stock}</td><td>${esc(p.shop)}</td><td>${p.reviewCount ? p.rating + ' ★ (' + p.reviewCount + ')' : '-'}</td><td>${p.hidden ? badge('Hidden', 'bad') : badge('Active', 'ok')}</td><td class="a-r"><button class="a-btn sm" data-act="p-edit" data-id="${p.id}">Edit</button> <button class="a-btn sm" data-act="p-toggle" data-id="${p.id}">${p.hidden ? 'Show' : 'Hide'}</button> <button class="a-btn sm danger" data-act="p-del" data-id="${p.id}">Delete</button></td></tr>`), 'No products match.');
  }
  const prevHtml = () => pImgs.map((s, k) => `<div class="a-pv"><img src="${s}" alt=""><button type="button" data-act="p-rmimg" data-id="${k}" aria-label="Remove photo">✕</button></div>`).join('');
  function openProduct(id) {
    const p = id ? data.products.find(x => x.id === id) : null;
    pImgs = p ? (p.imgs || []).slice() : [];
    modal(`<div class="a-mh"><h3>${p ? 'Edit product' : 'Add product'}</h3><button class="a-x" data-act="mclose" aria-label="Close">✕</button></div>
<input type="hidden" id="pm-id" value="${p ? p.id : ''}"><div class="a-fg">
<label class="a-l wide">Name<input class="a-in" id="pm-n" maxlength="80" value="${esc(p ? p.n : '')}"></label>
<label class="a-l">Category<select class="a-in" id="pm-c">${CATS.map(c => `<option ${p && p.c === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
<label class="a-l">Price ($)<input class="a-in" id="pm-p" type="number" min="0.5" step="0.01" value="${p ? p.p : ''}"></label>
<label class="a-l">Old price<input class="a-in" id="pm-o" type="number" min="0" step="0.01" value="${p && p.o ? p.o : ''}"></label>
<label class="a-l">Stock<input class="a-in" id="pm-k" type="number" min="0" step="1" value="${p ? p.stock : 10}"></label>
<label class="a-l">Visibility<select class="a-in" id="pm-h"><option value="0">Active</option><option value="1" ${p && p.hidden ? 'selected' : ''}>Hidden</option></select></label>
<label class="a-l wide">Description<textarea class="a-in" id="pm-d" rows="3" maxlength="600">${esc(p ? p.d : '')}</textarea></label>
<div class="wide"><label class="a-l">Photos (up to 5)<input class="a-in" id="pm-i" type="file" accept="image/*" multiple></label><div class="a-prev" id="pm-prev">${prevHtml()}</div></div></div>
<div class="a-err" id="pm-m" role="alert"></div><div class="a-mf"><button class="a-btn" data-act="mclose">Cancel</button><button class="a-btn pri" data-act="p-save">Save product</button></div>`);
  }
  async function saveProductAdmin() {
    const g = i => $('#' + i).value.trim(), m = t => { $('#pm-m').textContent = t; }, id = +g('pm-id'), n = g('pm-n'), price = parseFloat(g('pm-p')), old = parseFloat(g('pm-o')), stock = parseInt(g('pm-k'), 10) || 0, d = g('pm-d');
    if (n.length < 3) return m('Enter a product name (at least 3 characters).');
    if (!(price > 0)) return m('Enter a valid price.');
    if (old && old <= price) return m('Old price must be higher than the price.');
    if (d.length < 10) return m('Add a description (at least 10 characters).');
    const payload = { n, c: g('pm-c'), p: price, o: old || null, stock, d, hidden: g('pm-h') === '1', imgs: pImgs.slice() };
    try {
      if (id) await api.put('/api/products/' + id, payload); else await api.post('/api/products', Object.assign({ asStore: true }, payload));
      await loadTab('products'); closeModal(); render(); flash(id ? 'Product updated' : 'Product added');
    } catch (e) { m(e.error || 'Could not save product.'); }
  }
  async function toggleProduct(id) {
    const p = data.products.find(x => x.id === id);
    try { await api.put('/api/admin/products/' + id + '/hide', { hidden: !p.hidden }); await loadTab('products'); render(); }
    catch (e) { flash(e.error || 'Could not update product', true); }
  }
  async function deleteProductAdmin(id) {
    try { await api.del('/api/admin/products/' + id); await loadTab('products'); render(); flash('Product deleted'); }
    catch (e) { flash(e.error || 'Could not delete product', true); }
  }

  function usersView() {
    return `<div class="a-bar">${fSearch('uq', 'Search name or email')}${fSelect('ur', ['buyer', 'seller', 'admin'], 'All roles')}</div>`
      + tbl(['User', 'Role', 'Status', 'Joined', ''], data.users.map(u => {
        const self = u.email === me.email;
        return `<tr><td><div class="a-who"><i>${esc((u.name || '?').slice(0, 1).toUpperCase())}</i><div><b>${esc(u.name)}</b><small>${esc(u.email)}</small></div></div></td><td>${badge(u.role, u.role === 'admin' ? 'info' : u.role === 'seller' ? 'warn' : '')}</td><td>${u.status === 'suspended' ? badge('Suspended', 'bad') : badge('Active', 'ok')}</td><td>${day(u.created)}</td><td class="a-r"><button class="a-btn sm" data-act="u-view" data-id="${u.id}">View</button>${self ? '' : ` <button class="a-btn sm" data-act="u-susp" data-id="${u.id}">${u.status === 'suspended' ? 'Activate' : 'Suspend'}</button>`}</td></tr>`;
      }), 'No users match.');
  }
  function openUser(id) {
    const u = data.users.find(x => x.id === id); if (!u) return;
    const locked = u.email === me.email;
    modal(`<div class="a-mh"><h3>${esc(u.name)}</h3><button class="a-x" data-act="mclose" aria-label="Close">✕</button></div>
<div class="a-cols"><div><small class="a-k">Email</small><p>${esc(u.email)}</p></div><div><small class="a-k">Joined</small><p>${dtm(u.created)}</p></div><div><small class="a-k">Shop</small><p>${esc(u.shop || '-')}</p></div></div>
<label class="a-l">Role<select class="a-in" id="um-r" ${locked ? 'disabled' : ''}>${['buyer', 'seller', 'admin'].map(r => `<option ${r === u.role ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
<div class="a-err" id="um-m" role="status"></div>
<div class="a-mf">${locked ? '' : `<button class="a-btn" data-act="u-susp" data-id="${u.id}">${u.status === 'suspended' ? 'Activate' : 'Suspend'}</button>`}<button class="a-btn" data-act="u-pw" data-id="${u.id}">Reset password</button><span class="a-sp"></span><button class="a-btn pri" data-act="u-save" data-id="${u.id}">Save</button></div>`);
  }
  async function saveUser(id) {
    const role = $('#um-r').value;
    try { await api.put('/api/admin/users/' + id, { role }); await loadTab('users'); closeModal(); render(); flash('User updated'); }
    catch (e) { $('#um-m').textContent = e.error || 'Could not save.'; }
  }
  async function toggleSuspend(id) {
    const u = data.users.find(x => x.id === id);
    try { await api.put('/api/admin/users/' + id, { status: u.status === 'suspended' ? 'active' : 'suspended' }); await loadTab('users'); closeModal(); render(); }
    catch (e) { flash(e.error || 'Could not update user', true); }
  }
  async function resetPw(id) {
    const pw = prompt('New password (min 8 characters):'); if (!pw) return;
    try { await api.put('/api/admin/users/' + id, { password: pw }); flash('Password reset'); }
    catch (e) { flash(e.error || 'Could not reset password', true); }
  }

  function sellersView() {
    return tbl(['Store', 'Owner', 'Products', 'Units sold', 'Revenue'], data.sellers.map(s => `<tr><td><b>${esc(s.shop || s.name)}</b></td><td>${esc(s.email)}</td><td>${s.productCount}</td><td>${s.unitsSold}</td><td>${money(s.revenue)}</td></tr>`), 'No sellers yet.');
  }

  function reviewsView() {
    return tbl(['Product', 'Author', 'Rating', 'Comment', ''], data.reviews.map(r => `<tr><td>${esc(r.productName)}</td><td>${esc(r.userName)}<small>${esc(r.userEmail || '')}</small></td><td>${'★'.repeat(r.stars)}</td><td>${esc((r.text || '').slice(0, 80))}</td><td class="a-r"><button class="a-btn sm danger" data-act="rv-del" data-id="${r.id}">Delete</button></td></tr>`), 'No reviews yet.');
  }

  function promosView() {
    return `<div class="a-bar"><button class="a-btn pri" data-act="pr-new">+ New promo code</button></div>`
      + tbl(['Code', 'Discount', 'Status', ''], data.promos.map(p => `<tr><td><b>${esc(p.code)}</b></td><td>${p.pct}%</td><td>${p.active ? badge('Active', 'ok') : badge('Disabled', 'bad')}</td><td class="a-r"><button class="a-btn sm" data-act="pr-toggle" data-id="${p.id}">${p.active ? 'Disable' : 'Enable'}</button> <button class="a-btn sm danger" data-act="pr-del" data-id="${p.id}">Delete</button></td></tr>`), 'No promo codes yet.');
  }
  function openPromo() {
    modal(`<div class="a-mh"><h3>New promo code</h3><button class="a-x" data-act="mclose" aria-label="Close">✕</button></div>
<label class="a-l">Code<input class="a-in" id="pr-c" maxlength="20" placeholder="SAVE20" style="text-transform:uppercase"></label>
<label class="a-l">Discount %<input class="a-in" id="pr-p" type="number" min="1" max="90" value="10"></label>
<div class="a-err" id="pr-m" role="alert"></div>
<div class="a-mf"><button class="a-btn" data-act="mclose">Cancel</button><button class="a-btn pri" data-act="pr-save">Create</button></div>`);
  }
  async function savePromo() {
    const code = $('#pr-c').value.trim(), pct = +$('#pr-p').value;
    try { await api.post('/api/admin/promos', { code, pct }); await loadTab('promos'); closeModal(); render(); flash('Promo created'); }
    catch (e) { $('#pr-m').textContent = e.error || 'Could not create promo.'; }
  }
  async function togglePromo(id) {
    const p = data.promos.find(x => x.id === id);
    try { await api.put('/api/admin/promos/' + id, { active: !p.active }); await loadTab('promos'); render(); }
    catch (e) { flash(e.error || 'Could not update promo', true); }
  }
  async function deletePromo(id) {
    try { await api.del('/api/admin/promos/' + id); await loadTab('promos'); render(); flash('Promo deleted'); }
    catch (e) { flash(e.error || 'Could not delete promo', true); }
  }

  function settingsView() {
    const s = data.settings;
    return `<section class="a-card wide"><h3>Store settings</h3><div class="a-fg">
<label class="a-l">Standard shipping ($)<input class="a-in" id="st-ship" type="number" min="0" step="0.5" value="${s.ship}"></label>
<label class="a-l">Express shipping ($)<input class="a-in" id="st-express" type="number" min="0" step="0.5" value="${s.express}"></label>
<label class="a-l">Free shipping over ($)<input class="a-in" id="st-free" type="number" min="0" step="1" value="${s.free}"></label>
<label class="a-l">Seller commission (%)<input class="a-in" id="st-commission" type="number" min="0" max="100" step="1" value="${s.commission}"></label>
<label class="a-l wide">Announcement bar<input class="a-in" id="st-ann" maxlength="200" value="${esc(s.ann)}"></label>
<label class="a-l">Support email<input class="a-in" id="st-email" value="${esc(s.email)}"></label>
</div><div class="a-err" id="st-m" role="status"></div><button class="a-btn pri" data-act="st-save" style="margin-top:12px">Save settings</button></section>`;
  }
  async function saveSettings() {
    const g = id => $('#' + id).value;
    try {
      await api.put('/api/admin/settings', { ship: +g('st-ship'), express: +g('st-express'), free: +g('st-free'), commission: +g('st-commission'), ann: g('st-ann'), email: g('st-email') });
      await loadTab('settings'); render(); flash('Settings saved');
    } catch (e) { $('#st-m').textContent = e.error || 'Could not save settings.'; }
  }

  function logView() {
    return tbl(['When', 'Who', 'Event'], data.log.map(l => `<tr><td>${dtm(l.t)}</td><td>${esc(l.w)}</td><td>${esc(l.m)}</td></tr>`), 'Nothing logged yet.');
  }

  const VIEWS = { dash: dashView, orders: ordersView, products: productsView, users: usersView, sellers: sellersView, reviews: reviewsView, promos: promosView, settings: settingsView, log: logView };

  /* ---------------- shell + gate ---------------- */
  function gateHtml(errorMsg) {
    return `<div class="adm-gate"><form class="a-mb" data-form="gate" style="max-width:380px;margin:60px auto"><h2>Admin sign in</h2><p class="a-mut">Sign in with an administrator account.</p>
<label class="a-l">Email<input class="a-in" id="g-e" type="email" autocomplete="email"></label>
<label class="a-l">Password<input class="a-in" id="g-p" type="password" autocomplete="current-password"></label>
<div class="a-err" id="g-m" role="alert">${errorMsg ? esc(errorMsg) : ''}</div>
<button class="a-btn pri full" type="submit">Sign in</button></form></div>`;
  }

  async function render() {
    const app = $('#adm-app'); if (!app) return;
    if (!me || me.role !== 'admin') { app.innerHTML = gateHtml(); return; }
    try { await loadTab(tab); } catch (e) { app.innerHTML = `<p class="a-err">Could not load data from the server.</p>`; return; }
    app.innerHTML = `<div class="adm"><aside class="adm-side"><div class="adm-brand">Oak&amp;Orbit <small>Admin</small></div>
<nav>${NAV.map(([k, l, i]) => `<button class="${tab === k ? 'on' : ''}" data-nav="${k}"><i>${i}</i>${l}</button>`).join('')}</nav>
<div class="adm-me"><i>${esc((me.name || '?')[0].toUpperCase())}</i><div><b>${esc(me.name)}</b><small>${esc(me.email)}</small></div></div>
${embedded ? '<button class="a-btn" data-act="close">Close panel</button>' : ''}</aside>
<main class="adm-main"><div class="adm-top"><h1>${TITLE[tab]}</h1></div><div class="adm-body">${VIEWS[tab]()}</div></main></div>`;
  }

  /* ---------------- actions ---------------- */
  const ACT = {
    'mclose': closeModal,
    'close': () => close(),
    'o-view': (t, id) => openOrder(id),
    'o-save': (t, id) => saveOrder(id),
    'p-new': () => openProduct(null),
    'p-edit': (t, id) => openProduct(+id),
    'p-save': saveProductAdmin,
    'p-toggle': (t, id) => toggleProduct(+id),
    'p-del': (t, id) => arm(t, () => deleteProductAdmin(+id)),
    'p-rmimg': (t, id) => { pImgs.splice(+id, 1); $('#pm-prev').innerHTML = prevHtml(); },
    'u-view': (t, id) => openUser(+id),
    'u-save': (t, id) => saveUser(+id),
    'u-susp': (t, id) => arm(t, () => toggleSuspend(+id)),
    'u-pw': (t, id) => resetPw(+id),
    'rv-del': (t, id) => arm(t, async () => { try { await api.del('/api/admin/reviews/' + id); await loadTab('reviews'); render(); flash('Review deleted'); } catch (e) { flash(e.error || 'Could not delete', true); } }),
    'pr-new': openPromo,
    'pr-save': savePromo,
    'pr-toggle': (t, id) => togglePromo(+id),
    'pr-del': (t, id) => arm(t, () => deletePromo(+id)),
    'st-save': saveSettings,
  };

  function onClick(e) {
    const t = e.target.closest('[data-act],[data-nav]');
    if (!t) { if (e.target.id === 'adm-modal') closeModal(); return; }
    if (t.dataset.nav) { tab = t.dataset.nav; F = {}; render(); return; }
    const f = ACT[t.dataset.act]; if (f) f(t, t.dataset.id);
  }
  function onInput(e) { const t = e.target; if (t.dataset.f && t.tagName === 'INPUT') { F[t.dataset.f] = t.value; render(); } }
  async function onChange(e) {
    const t = e.target;
    if (t.dataset.f && t.tagName === 'SELECT') { F[t.dataset.f] = t.value; render(); return; }
    if (t.id === 'pm-i') {
      try { const n = await Promise.all([...t.files].filter(f => f.type.startsWith('image/')).slice(0, Math.max(0, 5 - pImgs.length)).map(f => shrink(f))); pImgs = [...pImgs, ...n].slice(0, 5); } catch (x) { flash('Could not read that image.', true); }
      t.value = ''; $('#pm-prev').innerHTML = prevHtml();
    }
  }
  async function onSubmit(e) {
    const f = e.target; if (f.dataset.form !== 'gate') return; e.preventDefault();
    const em = $('#g-e').value.trim().toLowerCase(), pw = $('#g-p').value, m = $('#g-m');
    try {
      const res = await api.post('/api/auth/login', { email: em, password: pw });
      if (res.user.role !== 'admin') { m.textContent = 'This account is not an administrator.'; return; }
      me = res.user;
      if (typeof setUser === 'function') await setUser(me);
      render();
    } catch (err) { m.textContent = err.error || 'Incorrect email or password.'; }
  }

  async function mount(r, emb) {
    root = r; embedded = !!emb;
    root.innerHTML = '<div id="adm-app"></div><div class="adm-modal hide" id="adm-modal"></div><div class="adm-toast" id="adm-toast" role="status"></div>';
    root.addEventListener('click', onClick); root.addEventListener('input', onInput); root.addEventListener('change', onChange); root.addEventListener('submit', onSubmit);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && root && !$('#adm-modal').classList.contains('hide')) closeModal(); });
    try { const res = await api.get('/api/auth/me'); me = res.user; } catch (e) { me = null; }
    if (!embedded) render();
  }
  function open() { root.classList.remove('hide'); document.documentElement.style.overflow = 'hidden'; tab = 'dash'; F = {}; api.get('/api/auth/me').then(r => { me = r.user; render(); }); }
  function close() { root.classList.add('hide'); document.documentElement.style.overflow = ''; if (typeof go === 'function') go('home'); }

  window.AdminApp = { mount, open, close };
  document.addEventListener('DOMContentLoaded', () => { const r = document.getElementById('admin-root'); if (r && r.dataset.mode === 'standalone') mount(r, false); });
})();
