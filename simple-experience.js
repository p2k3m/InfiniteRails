      const body = typeof document !== 'undefined' ? document.body : null;
      if (body && !body.classList.contains('game-active')) {
        body.classList.add('game-active');
      }
        hudRootEl.classList.remove('renderer-unavailable');
