        const worldLoadFailed = assetsVerified === false;
        const dimensionLoadFailed = dimensionTravelSucceeded === false;
        const transitionIncomplete = worldLoadFailed || dimensionLoadFailed;
        if (transitionIncomplete) {
                  allowIncompleteTransition: transitionGuard?.allowIncompleteTransition ?? null,
                  resetOnWorldFailure: transitionGuard?.resetOnWorldFailure ?? null,
                  resetOnDimensionFailure: transitionGuard?.resetOnDimensionFailure ?? null,
                  neverAllowIncompleteTransition: transitionGuard?.neverAllowIncompleteTransition ?? null,
