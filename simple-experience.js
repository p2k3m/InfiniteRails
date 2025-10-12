  const RATE_LIMIT_HEADER_GOOGLE_ID = 'X-Rate-Limit-Google-Id';
        const headers = { Accept: 'application/json' };
        if (typeof this.playerGoogleId === 'string' && this.playerGoogleId.trim().length) {
          headers[RATE_LIMIT_HEADER_GOOGLE_ID] = this.playerGoogleId.trim();
        }
          headers,
        if (typeof this.playerGoogleId === 'string' && this.playerGoogleId.trim().length) {
          requestInit.headers[RATE_LIMIT_HEADER_GOOGLE_ID] = this.playerGoogleId.trim();
        }
