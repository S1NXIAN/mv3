document.addEventListener("DOMContentLoaded", () => {
  const closeBtn = document.querySelector(".btn-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      window.close();
    });
  }

  document.querySelectorAll(".glitch-title").forEach(el => {
    MV3_UI.initRandomGlitch(el, el.textContent.trim());
  });

  const docRef = document.querySelector(".doc-ref");
  if (docRef) {
    MV3_UI.initRandomGlitch(docRef, "DOC.REF // MV3-774");
  }

  document.querySelectorAll('.flag-example').forEach(el => {
    MV3_UI.applyScrambleCopy(el, el.textContent.trim());
  });
});
