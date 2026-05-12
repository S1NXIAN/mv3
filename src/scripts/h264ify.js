/**
 * MV3 — H264ify Codec Shield
 * 
 * "Gold Standard" implementation that monkey-patches browser media APIs
 * to block VP8, VP9, and AV1, forcing the browser to fall back to H.264 (AVC).
 */

(function() {
  const BLOCKED_CODECS = ["vp8", "vp9", "av01", "av1"];
  const BLOCKED_CONTAINERS = ["video/webm"];

  const isBlocked = (type) => {
    if (!type || typeof type !== 'string') return false;
    const lowerType = type.toLowerCase();
    return BLOCKED_CODECS.some(c => lowerType.includes(c)) || 
           BLOCKED_CONTAINERS.some(c => lowerType.includes(c));
  };

  // 1. Monkey-patch HTMLVideoElement.canPlayType
  const originalCanPlayType = HTMLVideoElement.prototype.canPlayType;
  HTMLVideoElement.prototype.canPlayType = function(type) {
    if (isBlocked(type)) return "";
    return originalCanPlayType.apply(this, arguments);
  };

  // 2. Monkey-patch MediaSource.isTypeSupported
  if (window.MediaSource && typeof window.MediaSource.isTypeSupported === 'function') {
    const originalIsTypeSupported = window.MediaSource.isTypeSupported;
    window.MediaSource.isTypeSupported = function(type) {
      if (isBlocked(type)) return false;
      return originalIsTypeSupported.apply(this, arguments);
    };
  }

  // 3. Monkey-patch MediaCapabilities.decodingInfo (The Modern Standard)
  if (navigator.mediaCapabilities && navigator.mediaCapabilities.decodingInfo) {
    const originalDecodingInfo = navigator.mediaCapabilities.decodingInfo;
    navigator.mediaCapabilities.decodingInfo = function(config) {
      if (config && config.video && isBlocked(config.video.contentType)) {
        return Promise.resolve({
          supported: false,
          smooth: false,
          powerEfficient: false
        });
      }
      return originalDecodingInfo.apply(navigator.mediaCapabilities, arguments);
    };
  }

  console.log("[MV3 Bridge] H264ify Shield ACTIVE — VP8/VP9/AV1 Blocked.");
})();
