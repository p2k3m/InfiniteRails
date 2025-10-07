        this.playWelcomeSound();
    playWelcomeSound() {
      if (!this.audio || typeof this.audio !== 'object') {
        return;
      }
      const { audio } = this;
      if (typeof audio.play !== 'function') {
        return;
      }
      let shouldPlay = true;
      if (typeof audio.has === 'function') {
        try {
          shouldPlay = Boolean(audio.has('welcome'));
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Welcome audio availability check failed.', error);
          }
          shouldPlay = true;
        }
      }
      if (!shouldPlay) {
        return;
      }
      try {
        audio.play('welcome', { volume: 0.6 });
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug('Unable to play welcome audio cue.', error);
        }
      }
    }

