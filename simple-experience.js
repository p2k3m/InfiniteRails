        interactive: {
          present: false,
          chestCount: 0,
          groups: { chestsAttached: false },
        },
      const chestGroup = this.chestGroup || null;
      const chestCount = Array.isArray(chestGroup?.children) ? chestGroup.children.length : 0;
      summary.interactive.chestCount = chestCount;
      summary.interactive.groups.chestsAttached = chestGroup ? isAttachedToScene(chestGroup) : false;
      summary.interactive.present =
        chestCount > 0 && summary.interactive.groups.chestsAttached;

      if (!summary.interactive.present) summary.missing.push('interactive');
      const summaryKeyMap = {
        steve: 'steve',
        ground: 'ground',
        block: 'blocks',
        mob: 'mobs',
        interactive: 'interactive',
      };
        interactive: 'interactive-objects',
