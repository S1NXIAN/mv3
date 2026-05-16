/**
 * ui-utils.js - Shared UI effects and helpers for MV3 Bridge
 */

self.MV3_UI = (function() {
  const GLITCH_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*";
  const GLITCH_ITERATIONS = 6;
  const GLITCH_INTERVAL_MS = 30;
  const GLITCH_RESCHEDULE_MIN_MS = 3000;
  const GLITCH_RESCHEDULE_RANGE_MS = 7000;
  const GLITCH_INITIAL_MIN_MS = 2000;
  const GLITCH_INITIAL_RANGE_MS = 3000;
  const SCRAMBLE_INTERVAL_IN_MS = 45;
  const SCRAMBLE_INTERVAL_OUT_MS = 25;
  const CLIPBOARD_REVERT_MS = 1000;

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

        if (iterations > GLITCH_ITERATIONS) {
          clearInterval(interval);
          element.textContent = finalString;
          element.classList.remove("is-glitching");

          timeouts.push(setTimeout(triggerGlitch, GLITCH_RESCHEDULE_MIN_MS + Math.random() * GLITCH_RESCHEDULE_RANGE_MS));
        }
      }, GLITCH_INTERVAL_MS);
    }

    timeouts.push(setTimeout(triggerGlitch, GLITCH_INITIAL_MIN_MS + Math.random() * GLITCH_INITIAL_RANGE_MS));
    return timeouts;
  }

  /**
   * Applies a scramble effect and copies text to clipboard.
   * @param {HTMLElement} element 
   * @param {textToCopy} textToCopy 
   * @param {Function} onError 
   */
  function applyScrambleCopy(element, textToCopy, onError) {
    if (!textToCopy) return;
    if (element.dataset.mv3ScrambleBound) return;
    element.dataset.mv3ScrambleBound = "true";
    element.style.cursor = "pointer";
    const handler = () => {
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
              }, SCRAMBLE_INTERVAL_OUT_MS);
            }, CLIPBOARD_REVERT_MS);
          }
        }, SCRAMBLE_INTERVAL_IN_MS);
      }).catch(() => {
        if (onError) onError("ERR: CLIPBOARD_FAIL");
      });
    };
    element.addEventListener("click", handler, { once: true });
  }

  return {
    initRandomGlitch,
    applyScrambleCopy
  };
})();
