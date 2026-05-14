/**
 * ui-utils.js - Shared UI effects and helpers for MV3 Bridge
 */

self.MV3_UI = (function() {
  const GLITCH_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*";

  /**
   * Triggers a glitch effect on an element.
   * @param {HTMLElement} element 
   * @param {string} finalString 
   * @returns {number[]} Array of timeout IDs
   */
  function initRandomGlitch(element, finalString) {
    const timeouts = [];

    function triggerGlitch() {
      element.classList.add("is-glitching");
      let iterations = 0;
      const interval = setInterval(() => {
        element.textContent = finalString.split("").map((letter, index) => {
          if (Math.random() > 0.5) return finalString[index];
          return GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
        }).join("");
        iterations++;

        if (iterations > 6) {
          clearInterval(interval);
          element.textContent = finalString;
          element.classList.remove("is-glitching");

          timeouts.push(setTimeout(triggerGlitch, 3000 + Math.random() * 7000));
        }
      }, 30);
    }

    timeouts.push(setTimeout(triggerGlitch, 2000 + Math.random() * 3000));
    return timeouts;
  }

  /**
   * Applies a scramble effect and copies text to clipboard.
   * @param {HTMLElement} element 
   * @param {string} textToCopy 
   * @param {Function} onError 
   */
  function applyScrambleCopy(element, textToCopy, onError) {
    if (!textToCopy) return;
    element.style.cursor = "pointer";
    element.addEventListener("click", () => {
      if (element.classList.contains("url-glitch")) return;

      navigator.clipboard.writeText(textToCopy).then(() => {
        const original = element.dataset.original || element.textContent;
        element.dataset.original = original;
        element.classList.add("url-glitch");

        const finalString = "COPIED_TO_CLIPBOARD";
        let iterationsIn = 0;

        const intervalIn = setInterval(() => {
          element.textContent = finalString.split("").map((letter, index) => {
            if (index < iterationsIn) return finalString[index];
            return GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
          }).join("");

          iterationsIn += 1;
          if (iterationsIn > finalString.length) {
            clearInterval(intervalIn);
            element.textContent = finalString;

            setTimeout(() => {
              let iterationsOut = 0;
              const intervalOut = setInterval(() => {
                element.textContent = original.split("").map((letter, index) => {
                  if (index < iterationsOut) return original[index];
                  return GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
                }).join("");

                iterationsOut += 1;
                if (iterationsOut > original.length + 1) {
                  clearInterval(intervalOut);
                  element.textContent = original;
                  element.classList.remove("url-glitch");
                }
              }, 25);
            }, 1000);
          }
        }, 45);
      }).catch(() => {
        if (onError) onError("ERR: CLIPBOARD_FAIL");
      });
    });
  }

  return {
    initRandomGlitch,
    applyScrambleCopy
  };
})();
