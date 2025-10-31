(function bootstrapManifest(globalScope) {
  const scope =
    typeof globalScope === 'object' && globalScope !== null
      ? globalScope
      : typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
          ? globalThis
          : null;
  if (!scope) {
    return;
  }

  const consoleRef = scope.console || (typeof console !== 'undefined' ? console : null);

  const ensureTrailingSlash = (value) => {
    if (typeof value !== 'string') {
      return '';
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }
    return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
  };

  const normaliseAssetRecord = (entry, absoluteBase) => {
    if (entry && typeof entry === 'object' && typeof entry.url === 'string') {
      const url = entry.url.trim();
      if (url) {
        return {
          path: typeof entry.path === 'string' && entry.path.trim() ? entry.path.trim() : url,
          url,
          original: typeof entry.original === 'string' ? entry.original : url,
          query: typeof entry.query === 'string' ? entry.query : null,
        };
      }
    }

    if (typeof entry !== 'string') {
      return null;
    }

    const trimmed = entry.trim();
    if (!trimmed) {
      return null;
    }

    const [pathAndQuery] = trimmed.split('#', 1);
    const [rawPath, rawQuery = ''] = pathAndQuery.split('?', 2);
    const path = rawPath || trimmed;

    let url = trimmed;
    if (absoluteBase) {
      try {
        url = new URL(trimmed, absoluteBase).toString();
      } catch (error) {
        try {
          const normalisedBase = ensureTrailingSlash(absoluteBase);
          url = `${normalisedBase}${trimmed.replace(/^\/+/, '')}`;
        } catch (_) {
          url = trimmed;
        }
      }
    }

    return {
      path,
      url,
      original: trimmed,
      query: rawQuery || null,
    };
  };

  const resolveAbsoluteBase = (base) => {
    const locationRef = scope.location || {};
    const protocol = typeof locationRef.protocol === 'string' ? locationRef.protocol : 'https:';
    const href = typeof locationRef.href === 'string' ? locationRef.href : `${protocol}//localhost/`;

    if (typeof base !== 'string') {
      try {
        return ensureTrailingSlash(new URL('./', href).toString());
      } catch (error) {
        return ensureTrailingSlash('./');
      }
    }

    const trimmed = base.trim();
    if (!trimmed) {
      try {
        return ensureTrailingSlash(new URL('./', href).toString());
      } catch (error) {
        return ensureTrailingSlash('./');
      }
    }

    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
      return ensureTrailingSlash(trimmed);
    }

    if (trimmed.startsWith('//')) {
      return ensureTrailingSlash(`${protocol}${trimmed}`);
    }

    try {
      return ensureTrailingSlash(new URL(trimmed, href).toString());
    } catch (error) {
      try {
        return ensureTrailingSlash(new URL(trimmed, `${protocol}//localhost/`).toString());
      } catch (_) {
        return ensureTrailingSlash(trimmed);
      }
    }
  };

  const applyManifest = (rawManifest) => {
    if (!rawManifest || typeof rawManifest !== 'object') {
      return false;
    }

    const rawBase = typeof rawManifest.assetBaseUrl === 'string' ? rawManifest.assetBaseUrl : './';
    const manifestBase = ensureTrailingSlash(rawBase || './');
    const absoluteBase = resolveAbsoluteBase(manifestBase);

    const rawAssets = Array.isArray(rawManifest.assets) ? rawManifest.assets : [];
    const assets = rawAssets
      .map((entry) => normaliseAssetRecord(entry, absoluteBase))
      .filter((record) => record && typeof record.url === 'string' && record.url.trim().length);

    if (!assets.length) {
      if (consoleRef && typeof consoleRef.warn === 'function') {
        consoleRef.warn('Manifest bootstrap could not resolve any asset entries.', {
          assetBaseUrl: manifestBase,
        });
      }
    }

    const manifest = {
      ...rawManifest,
      assetBaseUrl: manifestBase,
      resolvedAssetBaseUrl: absoluteBase,
      assets,
      hydratedAt: new Date().toISOString(),
    };

    scope.__INFINITE_RAILS_ASSET_MANIFEST__ = manifest;
    scope.ASSET_MANIFEST = manifest;

    const appConfig = scope.APP_CONFIG || (scope.APP_CONFIG = {});
    const resolvedRoot = ensureTrailingSlash(absoluteBase);
    if (typeof appConfig.assetRoot !== 'string' || !appConfig.assetRoot.trim()) {
      appConfig.assetRoot = resolvedRoot;
    }
    if (typeof appConfig.assetBaseUrl !== 'string' || !appConfig.assetBaseUrl.trim()) {
      appConfig.assetBaseUrl = resolvedRoot;
    }

    scope.__INFINITE_RAILS_MANIFEST_BOOTSTRAPPED__ = true;
    return true;
  };

  if (scope.__INFINITE_RAILS_ASSET_MANIFEST__ && applyManifest(scope.__INFINITE_RAILS_ASSET_MANIFEST__)) {
    return;
  }

  const documentRef = scope.document || null;
  if (documentRef && typeof documentRef.getElementById === 'function') {
    const inline = documentRef.getElementById('assetManifest');
    if (inline && typeof inline.textContent === 'string') {
      try {
        const parsed = JSON.parse(inline.textContent);
        if (applyManifest(parsed)) {
          return;
        }
      } catch (error) {
        if (consoleRef && typeof consoleRef.warn === 'function') {
          consoleRef.warn('Manifest bootstrap failed to parse inline manifest JSON.', error);
        }
      }
    }
  }

  if (typeof scope.XMLHttpRequest !== 'function') {
    if (consoleRef && typeof consoleRef.warn === 'function') {
      consoleRef.warn('Manifest bootstrap unavailable — XMLHttpRequest is not supported in this environment.');
    }
    return;
  }

  try {
    const request = new scope.XMLHttpRequest();
    request.open('GET', 'asset-manifest.json', false);
    request.send(null);
    if (request.status >= 200 && request.status < 300) {
      try {
        const parsed = JSON.parse(request.responseText);
        if (applyManifest(parsed)) {
          return;
        }
      } catch (error) {
        if (consoleRef && typeof consoleRef.error === 'function') {
          consoleRef.error('Manifest bootstrap failed to parse asset-manifest.json.', error);
        }
      }
    } else if (consoleRef && typeof consoleRef.warn === 'function') {
      const failureDetails = {
        status: request.status,
        statusText: request.statusText,
      };
      consoleRef.warn('Manifest bootstrap request for asset-manifest.json failed.', failureDetails);

      if (request.status === 403 && typeof consoleRef.error === 'function') {
        consoleRef.error(
          'CloudFront returned HTTP 403 for asset-manifest.json — ensure the distribution can read from the origin bucket. See docs/cdn-permissions-runbook.md for recovery steps.',
          failureDetails,
        );
      }
    }
  } catch (error) {
    if (consoleRef && typeof consoleRef.error === 'function') {
      consoleRef.error('Manifest bootstrap encountered an unexpected error while loading asset-manifest.json.', error);
    }
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : undefined);
