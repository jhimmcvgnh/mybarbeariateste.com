/**
 * Shop Customizer Script
 * Dynamically syncs and updates the chosen Barbershop Name across the website.
 */

(function () {
  'use strict';

  const DEFAULT_SHOP_NAME = 'Lomax Barbers';

  function getActiveShopName() {
    if (window.AuthService && window.AuthService.isLoggedIn()) {
      const user = window.AuthService.getCurrentUser();
      if (user && user.shopName && user.shopName.trim()) {
        return user.shopName.trim();
      }
    }
    return DEFAULT_SHOP_NAME;
  }

  function applyShopName(name) {
    const targetName = name || getActiveShopName();

    // 1. Update all elements explicitly tagged with [data-barber-name] (includes navbar brand text)
    const taggedElements = document.querySelectorAll('[data-barber-name]');
    taggedElements.forEach(el => {
      el.textContent = targetName;
    });

    // 2. Update Hero H1 Heading (specifically top-left hero)
    const heroHeadings = document.querySelectorAll('.elementor-element-11664d0 .elementor-heading-title, h1.elementor-heading-title');
    heroHeadings.forEach(h1 => {
      h1.textContent = targetName;
    });

    // 3. Update Document Title
    document.title = `${targetName} - Barbearia Especializada | Cortes & Barba`;
  }

  function syncBookingLinks() {
    const slug = (window.BarberDB && typeof window.BarberDB.getBarbeariaSlug === 'function') 
      ? window.BarberDB.getBarbeariaSlug() 
      : (localStorage.getItem('barber_active_slug') || '');
      
    const bookLinks = document.querySelectorAll('a[href*="agendamento"]');
    bookLinks.forEach(a => {
      const currentHref = a.getAttribute('href');
      if (slug && currentHref && !currentHref.includes('?barbearia=') && !currentHref.includes('?slug=')) {
        const base = currentHref.split('?')[0];
        const sep = base.endsWith('/') ? '' : '/';
        a.setAttribute('href', `${base}${sep}?barbearia=${encodeURIComponent(slug)}`);
      }
    });
  }

  // Listen for auth changes and custom events
  window.addEventListener('authStateChanged', function () {
    applyShopName();
    syncBookingLinks();
  });

  window.addEventListener('shopNameUpdated', function (e) {
    if (e.detail && e.detail.shopName) {
      applyShopName(e.detail.shopName);
      syncBookingLinks();
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    applyShopName();
    syncBookingLinks();
  });
})();
