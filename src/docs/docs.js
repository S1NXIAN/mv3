document.addEventListener("DOMContentLoaded", () => {
  const closeBtn = document.querySelector(".btn-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      window.close();
    });
  }

  document.querySelectorAll('.flag-example').forEach(el => {
    el.addEventListener("click", () => {
      navigator.clipboard.writeText(el.textContent.trim());
    });
  });
});
