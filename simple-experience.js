      const fetchStartedAt = this.getHighResTimestamp();
      let requestStatus = 'error';
      let statusCode = null;
        statusCode = Number.isFinite(response?.status) ? response.status : null;
          requestStatus = 'rate-limit';
          requestStatus = 'error';
        requestStatus = 'ok';
    } catch (error) {
      const caughtStatus = Number.isFinite(error?.status) ? error.status : null;
      const summary = this.formatBackendEndpointSummary({ method: 'GET', endpoint: url, status: caughtStatus });
      console.warn('Failed to load scoreboard data', {
        error,
        endpoint: url,
        status: caughtStatus,
        summary,
      });
      this.handleLeaderboardOffline(error, {
        source: 'load',
        reason: 'score-fetch',
        message:
          summary && summary.length
            ? `Leaderboard unreachable (${summary}) — progress saved locally.`
            : undefined,
        hint:
          summary && summary.length
            ? `Leaderboard unreachable (${summary}). We'll display cached runs until the service returns.`
            : undefined,
        endpoint: url,
        method: 'GET',
        status: caughtStatus ?? undefined,
      });
      if (!this.scoreboardHydrated) {
        this.renderScoreboard();
        this.scoreboardHydrated = true;
      }
      if (!statusCode && caughtStatus !== null) {
        statusCode = caughtStatus;
      }
    } finally {
        const completedAt = this.getHighResTimestamp();
        const durationMs =
          Number.isFinite(fetchStartedAt) && Number.isFinite(completedAt)
            ? Math.max(0, completedAt - fetchStartedAt)
            : null;
        if (Number.isFinite(durationMs) && typeof this.emitGameEvent === 'function') {
          this.emitGameEvent('network-ping', {
            label: 'scoreboard',
            durationMs,
            status: requestStatus,
            statusCode,
            endpoint: url,
            timestamp: Date.now(),
          });
        }
