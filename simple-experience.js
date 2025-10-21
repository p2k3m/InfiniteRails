        ? `Leaderboard unreachable (${summary}) — offline session active. We'll sync when services respond.`
          : 'Offline session active — runs saved locally. Cloud sync will resume when the connection returns.';
        ? `Leaderboard unreachable (${summary}). We'll keep your progress locally and sync once the service responds.`
          : 'Offline session active — progress saved locally. Cloud sync will resume automatically when you are back online.';
              ? `Leaderboard unreachable (${summary}) — offline session active. We'll sync when services respond.`
              ? `Leaderboard unreachable (${summary}). We'll keep your progress locally and retry automatically.`
              : 'Offline session active — progress saved locally. We will retry automatically when services return.',
