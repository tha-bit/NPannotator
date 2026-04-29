
(function () {
  const links = document.querySelectorAll('.sidebar-link');
  const sections = Array.from(links).map(l => {
    const id = l.getAttribute('href').slice(1);
    return document.getElementById(id);
  }).filter(Boolean);

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        links.forEach(l => {
          l.classList.toggle('active', l.getAttribute('href') === '#' + id);
        });
      }
    });
  }, {
    rootMargin: '-10% 0px -80% 0px',
    threshold: 0
  });

  sections.forEach(s => observer.observe(s));
})();
