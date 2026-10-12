/* Click delegation that replaces all inline onclick="..." handlers,
   so the strict CSP (script-src 'self') can stay on. */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-go],[data-oo]');
  if (!el) return;
  if (el.dataset.go) { go(el.dataset.go); return; }
  switch (el.dataset.oo) {
    case 'wish': showWish = !showWish; go('home'); renderShop(); break;
    case 'openCart': cartDlg.showModal(); break;
    case 'closeCart': cartDlg.close(); break;
    case 'shopScroll': document.getElementById('shop').scrollIntoView({ behavior: 'smooth' }); break;
    case 'sell': go('register'); document.querySelector('[name=r-role][value=seller]').click(); break;
    case 'admin': AdminApp.open(); break;
    case 'applyPromo': applyPromo(); break;
    case 'checkout': checkout(); break;
    case 'goAdmin': go('admin'); break;
    case 'goSeller': resetForm(); go('seller'); break;
    case 'signOut': signOut(); break;
  }
});