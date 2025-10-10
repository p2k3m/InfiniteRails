        const targetNavmeshOptions = {
          reason: target ? 'golem-target' : 'golem-escort',
          stage: target ? 'target' : 'escort',
          golemId: golem.id,
          zombieId: target?.id ?? null,
        };
        if (destination) {
          this.ensureNavigationMeshForActorPosition('golem', destination.x, destination.z, targetNavmeshOptions);
        }
