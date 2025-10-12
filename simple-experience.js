  function deriveRateLimitIdentity({ googleId, sessionId } = {}) {
    const trimmedGoogleId = typeof googleId === 'string' ? googleId.trim() : '';
    if (trimmedGoogleId) {
      return `user:${trimmedGoogleId}`;
    }
    const trimmedSessionId = typeof sessionId === 'string' ? sessionId.trim() : '';
    if (trimmedSessionId) {
      return `session:${trimmedSessionId}`;
    }
    return 'anonymous';
  }

      return deriveRateLimitIdentity({
        googleId: this.playerGoogleId,
        sessionId: this.sessionId,
      });
