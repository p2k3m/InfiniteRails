      return {
        label: 'Empty',
        icon: '·',
      };
    }
    const source = ITEM_DEFINITIONS[id] || {};
    const labelSource = typeof source.label === 'string' ? source.label.trim() : '';
    const iconSource = typeof source.icon === 'string' ? source.icon.trim() : '';
    const descriptionSource = typeof source.description === 'string' ? source.description : '';
    return {
      ...source,
      label: labelSource || String(id),
      icon: iconSource || '⬜',
      description: descriptionSource,
      placeable: source.placeable === true,
    };
    const count = Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
        const quantity = Number.isFinite(slot?.quantity) ? Math.max(0, slot.quantity) : 0;
        if (slot?.item && quantity > 0) {
          button.textContent = `${def.icon} ${quantity}`;
          button.setAttribute('aria-label', formatInventoryLabel(slot.item, quantity));
          button.setAttribute('data-hint', `${hints.join(' — ')} (×${quantity})`);
        const itemId = typeof slot?.item === 'string' ? slot.item : null;
        const quantity = Number.isFinite(slot?.quantity) ? Math.max(0, slot.quantity) : 0;
        if (!itemId || quantity <= 0) return;
        aggregate.set(itemId, (aggregate.get(itemId) ?? 0) + quantity);
        const itemId = typeof item === 'string' ? item : null;
        const count = Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
        if (!itemId || count <= 0) return;
        aggregate.set(itemId, (aggregate.get(itemId) ?? 0) + count);
        const count = Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
        button.dataset.quantity = String(count);
        const label = formatInventoryLabel(item, count);
        hintParts.push(`Tap to queue • Carrying ×${count}`);
        const count = Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
        const label = formatInventoryLabel(item, count);
          const count = Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
          button.dataset.quantity = String(count);
          button.innerHTML = `<span>${escapeHtml(def.label)}</span><span class="quantity">×${count}</span>${summaryMarkup}`;
          const ariaLabel = `${def.label} ×${count}`;
          hintParts.push(`Tap to queue • Stored ×${count}`);
        const quantity = Number.isFinite(slot?.quantity) ? Math.max(0, slot.quantity) : 0;
        const label = slot?.item && quantity > 0 ? formatInventoryLabel(slot.item, quantity) : 'Empty slot';
