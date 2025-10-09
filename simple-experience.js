      this.inventoryOverflowActive = false;
      if (this.audio && typeof this.audio.play === 'function') {
        this.audio.play('playerDefeat', {
          volume: 0.6,
          rate: 0.88 + Math.random() * 0.1,
        });
      }
        const hadOverflow = this.inventoryOverflowActive === true;
        const hasOverflow = satchelOnly > 0;
        if (hasOverflow) {
        if (hasOverflow && !hadOverflow && this.audio && typeof this.audio.play === 'function') {
          this.audio.play('inventoryOverflow', { volume: 0.55 });
        }
        this.inventoryOverflowActive = hasOverflow;
        if (this.audio && typeof this.audio.play === 'function') {
          this.audio.play('craftError', { volume: 0.52 });
        }
