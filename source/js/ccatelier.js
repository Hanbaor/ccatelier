(() => {
  const initCCAtelier = () => {
    const navbar = document.querySelector('.navbar-container');
    const banner = document.querySelector('.home-banner-container');
    const description = banner?.querySelector('.description');

    if (description && !description.querySelector('.cc-hero-kicker')) {
      const kicker = document.createElement('div');
      kicker.className = 'cc-hero-kicker';
      kicker.innerHTML = `
        <span>PERSONAL ATELIER</span>
        <span aria-hidden="true" class="cc-beats">
          <i></i><i></i><i></i><i></i>
        </span>
        <span>4 / 4</span>
      `;
      description.prepend(kicker);
    }

    const syncNavbar = () => {
      if (!navbar) return;
      navbar.classList.toggle('cc-scrolled', window.scrollY > 18);
    };

    syncNavbar();
    window.addEventListener('scroll', syncNavbar, { passive: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCCAtelier, { once: true });
  } else {
    initCCAtelier();
  }
})();
