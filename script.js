      probeBackendEndpoint({
        url: configuredUsersUrl,
        method: 'GET',
        label: 'GET /users',
        allowStatuses: new Set(),
      }),
