(function() {
  const BLOCKED_CODECS = [
    "vp8", "vp9", "vp09",
    "av01", "av1", "av1c",
    "vp8l"
  ];
  const BLOCKED_PROFILES = [
    "av01.0.05M",
    "av01.0.08M",
    "av01.0.12M",
    "av01.0.13M",
    "av01.0.17M",
    "av01.0.20M",
    "av01.0.32M",
    "av01.0.41M"
  ];
  const BLOCKED_CONTAINERS = ["video/webm"];

  const isBlocked = (type) => {
    if (!type || typeof type !== 'string') return false;
    const lowerType = type.toLowerCase();
    if (BLOCKED_CONTAINERS.some(c => lowerType.includes(c))) return true;
    if (BLOCKED_PROFILES.some(p => lowerType.includes(p))) return true;
    return BLOCKED_CODECS.some(c => {
      const regex = new RegExp(`(^|[,\\s])${c}([,\\s]|$)`, 'i');
      return regex.test(lowerType);
    });
  };

  const originalCanPlayType = HTMLMediaElement.prototype.canPlayType;
  HTMLMediaElement.prototype.canPlayType = function(type) {
    if (isBlocked(type)) return "";
    return originalCanPlayType.apply(this, arguments);
  };

  if (window.MediaSource && typeof window.MediaSource.isTypeSupported === 'function') {
    const originalIsTypeSupported = window.MediaSource.isTypeSupported;
    window.MediaSource.isTypeSupported = function(type) {
      if (isBlocked(type)) return false;
      return originalIsTypeSupported.apply(this, arguments);
    };
  }

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
})();
