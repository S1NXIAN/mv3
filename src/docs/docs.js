/**
 * flags.js - Logic for the Flags Documentation page
 */

document.addEventListener("DOMContentLoaded", () => {
  // Bind close button
  const closeBtn = document.querySelector(".btn-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      window.close();
    });
  }

  // Apply the HUD glitch effect to the headers
  document.querySelectorAll(".glitch-title").forEach(el => {
    MV3_UI.initRandomGlitch(el, el.textContent.trim());
  });
  
  const docRef = document.querySelector(".doc-ref");
  if (docRef) {
    MV3_UI.initRandomGlitch(docRef, "DOC.REF // MV3-774");
  }

  // Initialize click-to-copy on all flag examples
  document.querySelectorAll('.flag-example').forEach(el => {
    MV3_UI.applyScrambleCopy(el, el.textContent.trim());
  });
});
