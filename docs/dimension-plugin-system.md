# Dimension Plugin System

The dimension plugin slot (`dimension-pack`) now supports hot-swappable data and logic
modules. Plugins can override themes, loot tables, lifecycle hooks, and runtime
augmentations without requiring a full page reload.

Re-registering a plugin with the same `id` is safe—if the descriptor changes
(for example, a new version or updated resource generator), the registry
reactivates the module and propagates the refreshed resources to every active
`SimpleExperience` instance.

## Lifecycle hooks

Provide lifecycle callbacks via `resources.lifecycleHooks`:

```js
registry.register({
  id: 'custom-pack',
  slot: 'dimension-pack',
  resources() {
    return {
      themes: [/* … */],
      lifecycleHooks: {
        enter: [({ experience, nextDimension }) => console.log('enter', nextDimension?.id)],
        exit: [({ previousDimension }) => console.log('exit', previousDimension?.id)],
        ready: [({ experience }) => experience.showHint('Ready!')],
      },
    };
  },
});
```

Hooks receive `(payload, context)` arguments. The context exposes the active
experience, plugin detail, and raw resource bag, allowing plugins to coordinate
behaviour across multiple instances.

## Experience augmentations

Use `resources.experienceAugmentations` to register richer logic modules. Each
augmentation runs once per active `SimpleExperience` instance and can add
additional event handlers or teardown logic:

```js
return {
  experienceAugmentations: [
    ({ experience, registerLifecycleHook, addCleanup }) => {
      const off = registerLifecycleHook('ready', () => experience.playAudioCue('arrival'));
      addCleanup(off);
    },
  ],
};
```

Augmentations can return a cleanup function or object (`dispose`, `teardown`,
etc.) that will automatically be invoked when a new plugin replaces the module
or when the experience is destroyed.

## Manual updates

The public helper `SimpleExperience.applyDimensionPluginResources(resources, detail)`
remains available for manually applying plugin payloads. Pass the new `lifecycleHooks`
and `experienceAugmentations` fields alongside data overrides to hot-patch logic at
runtime.
