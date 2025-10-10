      this.inventoryOverflowActive = false;
      if (this.audio && typeof this.audio.play === 'function') {
        this.audio.play('playerDefeat', { volume: 0.7 });
      }
        const overflowActive = satchelOnly > 0;
        const previouslyActive = this.inventoryOverflowActive === true;
        this.inventoryOverflowActive = overflowActive;
        if (overflowActive) {
          if (!previouslyActive && this.audio && typeof this.audio.play === 'function') {
            this.audio.play('inventoryOverflow', { volume: 0.6 });
          }
      } else {
        this.inventoryOverflowActive = false;
        if (this.audio && typeof this.audio.play === 'function') {
          this.audio.play('craftError', { volume: 0.55 });
        }
