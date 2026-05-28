// public/js/menu.js
document.addEventListener('DOMContentLoaded', function() {
  const toggle = document.getElementById('menuToggle');
  const navbar = document.getElementById('navbar');
  if (toggle && navbar) {
    toggle.addEventListener('click', function() {
      navbar.classList.toggle('show');
    });
  }
});