        actor.navChunkKey = navmesh.key ?? actor.navChunkKey ?? null;
        if (typeof this.handleNavmeshFailureForMob === 'function') {
          const listKey =
            actorType === 'zombie'
              ? 'zombies'
              : actorType === 'golem'
                ? 'golems'
                : `${actorType}s`;
        heightOffset: 1.1,
