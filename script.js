const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const startButton = document.getElementById('startButton');
const introModal = document.getElementById('introModal');
const mobileControls = document.getElementById('mobileControls');
const heartsEl = document.getElementById('hearts');
const bubblesEl = document.getElementById('bubbles');
const timeEl = document.getElementById('timeOfDay');
const dimensionInfoEl = document.getElementById('dimensionInfo');
const portalProgressEl = document.getElementById('portalProgress');
const hotbarEl = document.getElementById('hotbar');
const extendedInventoryEl = document.getElementById('extendedInventory');
const toggleExtendedBtn = document.getElementById('toggleExtended');
const craftQueueEl = document.getElementById('craftQueue');
const craftTargetEl = document.getElementById('craftTarget');
const craftButton = document.getElementById('craftButton');
const clearCraftButton = document.getElementById('clearCraft');
const recipeListEl = document.getElementById('recipeList');
const recipeSearchEl = document.getElementById('recipeSearch');
const eventLogEl = document.getElementById('eventLog');
const portalProgressBar = document.createElement('span');
portalProgressEl.appendChild(portalProgressBar);

const TILE_TYPES = {
  grass: { base: '#1d934d', accent: '#91ffb7', walkable: true },
  water: { base: '#113060', accent: '#49f2ff', walkable: false },
  sand: { base: '#d3a65c', accent: '#f5d9a8', walkable: true },
  tree: { base: '#20633a', accent: '#49f25f', walkable: false, resource: 'wood' },
  stone: { base: '#6f7e8f', accent: '#d4ecff', walkable: true, resource: 'stone' },
  rock: { base: '#3f4c52', accent: '#cbd6de', walkable: true, resource: 'rock' },
  ore: { base: '#4c5b68', accent: '#49f2ff', walkable: true, resource: 'spark-crystal' },
  rail: { base: '#1c2435', accent: '#49f2ff', walkable: true },
  railVoid: { base: '#05080f', accent: '#151c2a', walkable: false },
  portalFrame: { base: '#3b4b7a', accent: '#9dc7ff', walkable: true },
  portalDormant: { base: '#1a1f39', accent: '#7b6bff', walkable: true },
  portal: { base: '#2e315b', accent: '#7b6bff', walkable: true },
  tar: { base: '#251c23', accent: '#5f374d', walkable: true, resource: 'tar' },
  marble: { base: '#f6f2ed', accent: '#f7b733', walkable: true, resource: 'marble' },
  marbleEcho: { base: '#d8d4ff', accent: '#f7b733', walkable: true },
  netherite: { base: '#402020', accent: '#ff8249', walkable: true, resource: 'netherite' },
  lava: { base: '#6f2211', accent: '#ff8249', walkable: false },
  canyon: { base: '#483c30', accent: '#b08d64', walkable: true, resource: 'rock' },
  crystal: { base: '#1d2e5c', accent: '#49f2ff', walkable: true, resource: 'pattern-crystal' },
  void: { base: '#010308', accent: '#0a101f', walkable: false },
  village: { base: '#275b6d', accent: '#79f2ff', walkable: true },
  chest: { base: '#3d2a14', accent: '#f7b733', walkable: false, resource: 'chest' },
};

const ITEM_DEFS = {
  wood: { name: 'Wood', stack: 99, description: 'Harvested from trees; fuels basic tools.' },
  stone: { name: 'Stone Chunk', stack: 99, description: 'Solid stone for early crafting.' },
  rock: { name: 'Heavy Rock', stack: 99, description: 'Dense rock for Rock portals.' },
  'spark-crystal': { name: 'Spark Crystal', stack: 99, description: 'Charges igniters and rails.' },
  tar: { name: 'Tar Sac', stack: 99, description: 'Sticky tar used for slowing traps.' },
  marble: { name: 'Marble Inlay', stack: 99, description: 'Refined marble for elegant tech.' },
  netherite: { name: 'Netherite Shard', stack: 99, description: 'Volatile shard from collapsing rails.' },
  stick: { name: 'Stick', stack: 99, description: 'Basic shaft for tools.' },
  torch: { name: 'Torch', stack: 20, description: 'Lights portals and wards zombies.' },
  'stone-pickaxe': { name: 'Stone Pickaxe', stack: 1, description: 'Required to mine dense nodes.' },
  'tar-blade': { name: 'Tar Blade', stack: 1, description: 'Slows enemies on hit.' },
  'marble-echo': { name: 'Echo Core', stack: 1, description: 'Stores reverberating actions.' },
  'portal-igniter': { name: 'Portal Igniter', stack: 1, description: 'Activates portal frames.' },
  'rail-key': { name: 'Rail Key', stack: 1, description: 'Unlocks sealed chests on rails.' },
  'heavy-plating': { name: 'Heavy Plating', stack: 10, description: 'Armor plating from rock golems.' },
  'pattern-crystal': { name: 'Pattern Crystal', stack: 99, description: 'Used to sync stone rails.' },
  'eternal-ingot': { name: 'Eternal Ingot', stack: 1, description: 'Victory relic from the Netherite dimension.' },
};

const RECIPES = [
  {
    id: 'stick',
    name: 'Stick',
    sequence: ['wood'],
    output: { item: 'stick', quantity: 2 },
    unlock: 'origin',
  },
  {
    id: 'stone-pickaxe',
    name: 'Stone Pickaxe',
    sequence: ['stick', 'stick', 'stone'],
    output: { item: 'stone-pickaxe', quantity: 1 },
    unlock: 'origin',
  },
  {
    id: 'torch',
    name: 'Torch',
    sequence: ['stick', 'tar'],
    output: { item: 'torch', quantity: 2 },
    unlock: 'rock',
  },
  {
    id: 'portal-igniter',
    name: 'Portal Igniter',
    sequence: ['tar', 'spark-crystal', 'stick'],
    output: { item: 'portal-igniter', quantity: 1 },
    unlock: 'stone',
  },
  {
    id: 'rail-key',
    name: 'Rail Key',
    sequence: ['pattern-crystal', 'stick', 'pattern-crystal'],
    output: { item: 'rail-key', quantity: 1 },
    unlock: 'stone',
  },
  {
    id: 'tar-blade',
    name: 'Tar Blade',
    sequence: ['tar', 'stone', 'tar'],
    output: { item: 'tar-blade', quantity: 1 },
    unlock: 'tar',
  },
  {
    id: 'marble-echo',
    name: 'Echo Core',
    sequence: ['marble', 'spark-crystal', 'marble'],
    output: { item: 'marble-echo', quantity: 1 },
    unlock: 'marble',
  },
  {
    id: 'heavy-plating',
    name: 'Heavy Plating',
    sequence: ['rock', 'stone', 'rock'],
    output: { item: 'heavy-plating', quantity: 1 },
    unlock: 'rock',
  },
];

const DIMENSION_SEQUENCE = ['origin', 'rock', 'stone', 'tar', 'marble', 'netherite'];

const DIMENSIONS = {
  origin: {
    id: 'origin',
    name: 'Grassland Threshold',
    description:
      'A peaceful island afloat in void. Gather wood and stone, craft tools, and prepare the first portal.',
    palette: ['#1d934d', '#49f2ff'],
    rules: {
      moveDelay: 0.15,
    },
    generator: (state) => generateOriginIsland(state),
  },
  rock: {
    id: 'rock',
    name: 'Rock Dimension',
    description:
      'Gravity tugs harder. Slippery slopes will slide you downward. Mine heavy ore guarded by golems.',
    palette: ['#483c30', '#b08d64'],
    rules: {
      moveDelay: 0.18,
      onMove: (state, from, to, dir) => {
        if (to?.data?.slope && !state.player.isSliding) {
          state.player.isSliding = true;
          const slideDir = to.data.slope;
          setTimeout(() => {
            attemptMove(slideDir.dx, slideDir.dy, true);
            state.player.isSliding = false;
          }, 120);
        }
      },
    },
    generator: (state) => generateRockCanyon(state),
    rewards: [{ item: 'rock', quantity: 1 }, { item: 'heavy-plating', quantity: 0 }],
  },
  stone: {
    id: 'stone',
    name: 'Stone Dimension',
    description:
      'Rails materialize in rhythm. Time your crossings to harvest pattern crystals from glowing seams.',
    palette: ['#1c2435', '#49f2ff'],
    rules: {
      moveDelay: 0.16,
      update: (state, delta) => {
        state.railTimer += delta;
        if (state.railTimer >= 1.4) {
          state.railTimer = 0;
          state.railPhase = (state.railPhase + 1) % 2;
        }
      },
      isWalkable: (tile, state) => {
        if (tile?.type === 'rail') {
          return state.railPhase === tile.data.phase;
        }
        return undefined;
      },
    },
    generator: (state) => generateStonePattern(state),
  },
  tar: {
    id: 'tar',
    name: 'Tar Dimension',
    description:
      'Everything is heavy. Movement slows and tar slugs trail you. Harvest tar sacs carefully.',
    palette: ['#251c23', '#5f374d'],
    rules: {
      moveDelay: 0.28,
      onMove: (state) => {
        state.player.tarStacks = Math.min((state.player.tarStacks || 0) + 1, 4);
        state.player.tarSlowTimer = 2.4;
      },
    },
    generator: (state) => generateTarBog(state),
  },
  marble: {
    id: 'marble',
    name: 'Marble Dimension',
    description:
      'Every action echoes. Five seconds later, your past self repeats it. Build portals with mirrored discipline.',
    palette: ['#f6f2ed', '#f7b733'],
    rules: {
      moveDelay: 0.18,
      onAction: (state, action) => {
        state.echoQueue.push({ at: state.elapsed + 5, action });
      },
      update: (state) => {
        if (!state.echoQueue.length) return;
        const now = state.elapsed;
        while (state.echoQueue.length && state.echoQueue[0].at <= now) {
          const echo = state.echoQueue.shift();
          echo.action(true);
          logEvent('Echo repeats your action.');
        }
      },
    },
    generator: (state) => generateMarbleGarden(state),
  },
  netherite: {
    id: 'netherite',
    name: 'Netherite Dimension',
    description:
      'Rails crumble behind you. Sprint ahead, align collapsing tracks, and claim the Eternal Ingot.',
    palette: ['#402020', '#ff8249'],
    rules: {
      moveDelay: 0.14,
      onMove: (state, from, to) => {
        if (!from) return;
        const tile = getTile(from.x, from.y);
        if (tile && tile.type !== 'void') {
          setTimeout(() => {
            const checkTile = getTile(from.x, from.y);
            if (checkTile && checkTile.type !== 'portal' && checkTile.type !== 'portalFrame') {
              checkTile.type = 'railVoid';
            }
          }, 400);
        }
      },
    },
    generator: (state) => generateNetheriteCollapse(state),
  },
};

const state = {
  width: 16,
  height: 12,
  tileWidth: canvas.width / 16,
  tileHeight: canvas.height / 12,
  world: [],
  dimension: DIMENSIONS.origin,
  dimensionHistory: ['origin'],
  elapsed: 0,
  dayLength: 180,
  railPhase: 0,
  railTimer: 0,
  portals: [],
  zombies: [],
  lootables: [],
  chests: [],
  lastMoveAt: 0,
  moveDelay: 0.15,
  baseMoveDelay: 0.15,
  hooks: {
    onMove: [],
    onAction: [],
    update: [],
    isWalkable: [],
  },
  echoQueue: [],
  craftSequence: [],
  knownRecipes: new Set(['stick', 'stone-pickaxe']),
  unlockedDimensions: new Set(['origin']),
  player: {
    x: 8,
    y: 6,
    facing: { x: 0, y: 1 },
    hearts: 10,
    maxHearts: 10,
    air: 10,
    maxAir: 10,
    selectedSlot: 0,
    inventory: Array.from({ length: 10 }, () => null),
    satchel: [],
    effects: {},
    hasIgniter: false,
    tarStacks: 0,
    tarSlowTimer: 0,
  },
  pressedKeys: new Set(),
  isRunning: false,
  victory: false,
};

function generateOriginIsland(state) {
  const grid = [];
  for (let y = 0; y < state.height; y++) {
    const row = [];
    for (let x = 0; x < state.width; x++) {
      const dist = Math.hypot(x - state.width / 2, y - state.height / 2);
      if (dist > state.width / 2.1) {
        row.push({ type: 'void', data: {} });
        continue;
      }
      if (Math.random() < 0.08) {
        row.push({ type: 'water', data: {} });
        continue;
      }
      const tile = { type: 'grass', data: {} };
      if (Math.random() < 0.12) {
        tile.type = 'tree';
        tile.resource = 'wood';
        tile.data = { yield: 3 };
      } else if (Math.random() < 0.06) {
        tile.type = 'stone';
        tile.resource = 'stone';
        tile.data = { yield: 2 };
      } else if (Math.random() < 0.04) {
        tile.type = 'rock';
        tile.resource = 'rock';
        tile.data = { yield: 1 };
      }
      row.push(tile);
    }
    grid.push(row);
  }
  placeStructure(grid, createRailLoop(state));
  return grid;
}

function generateRockCanyon(state) {
  const grid = [];
  for (let y = 0; y < state.height; y++) {
    const row = [];
    for (let x = 0; x < state.width; x++) {
      const tile = { type: 'canyon', data: {} };
      if (Math.random() < 0.14) {
        tile.type = 'stone';
        tile.resource = 'rock';
        tile.data = { yield: 2 };
      }
      if (Math.random() < 0.08) {
        tile.data.slope = choose([
          { dx: 1, dy: 0 },
          { dx: -1, dy: 0 },
          { dx: 0, dy: 1 },
        ]);
      }
      row.push(tile);
    }
    grid.push(row);
  }
  placeStructure(grid, createResourceCluster('ore', 3));
  return grid;
}

function generateStonePattern(state) {
  const grid = [];
  for (let y = 0; y < state.height; y++) {
    const row = [];
    for (let x = 0; x < state.width; x++) {
      const tile = { type: 'rail', data: { phase: (x + y) % 2 } };
      if (Math.random() < 0.1) {
        tile.type = 'crystal';
        tile.resource = 'pattern-crystal';
        tile.walkable = true;
      }
      row.push(tile);
    }
    grid.push(row);
  }
  return grid;
}

function generateTarBog(state) {
  const grid = [];
  for (let y = 0; y < state.height; y++) {
    const row = [];
    for (let x = 0; x < state.width; x++) {
      const tile = { type: 'tar', data: {} };
      if (Math.random() < 0.1) {
        tile.type = 'lava';
        tile.hazard = true;
      }
      if (Math.random() < 0.05) {
        tile.type = 'tar';
        tile.resource = 'tar';
        tile.data = { yield: 2 };
      }
      row.push(tile);
    }
    grid.push(row);
  }
  return grid;
}

function generateMarbleGarden(state) {
  const grid = [];
  for (let y = 0; y < state.height; y++) {
    const row = [];
    for (let x = 0; x < state.width; x++) {
      const tile = { type: 'marble', data: {} };
      if ((x + y) % 3 === 0) {
        tile.type = 'marbleEcho';
      }
      if (Math.random() < 0.08) {
        tile.resource = 'marble';
        tile.data = { yield: 1 };
      }
      row.push(tile);
    }
    grid.push(row);
  }
  return grid;
}

function generateNetheriteCollapse(state) {
  const grid = [];
  for (let y = 0; y < state.height; y++) {
    const row = [];
    for (let x = 0; x < state.width; x++) {
      const tile = { type: 'rail', data: { phase: 0 } };
      if (Math.random() < 0.12) {
        tile.type = 'netherite';
        tile.resource = 'netherite';
        tile.data = { yield: 1 };
      }
      if (Math.random() < 0.08) {
        tile.type = 'lava';
        tile.hazard = true;
      }
      row.push(tile);
    }
    grid.push(row);
  }
  const chestY = Math.floor(state.height / 2);
  const chestX = state.width - 3;
  if (grid[chestY]) {
    grid[chestY][chestX] = { type: 'chest', resource: 'chest', data: { loot: 'eternal-ingot', locked: false } };
    if (grid[chestY][chestX - 1]) grid[chestY][chestX - 1] = { type: 'rail', data: { phase: 0 } };
    if (grid[chestY][chestX - 2]) grid[chestY][chestX - 2] = { type: 'rail', data: { phase: 1 } };
  }
  return grid;
}

function placeStructure(grid, structure) {
  if (!structure) return;
  const { tiles, width, height } = structure;
  const maxX = grid[0].length - width - 1;
  const maxY = grid.length - height - 1;
  const startX = Math.floor(Math.random() * Math.max(maxX, 1));
  const startY = Math.floor(Math.random() * Math.max(maxY, 1));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = tiles[y][x];
      if (!tile) continue;
      grid[startY + y][startX + x] = tile;
    }
  }
}

function createRailLoop(state) {
  const width = 6;
  const height = 4;
  const tiles = Array.from({ length: height }, () => Array(width).fill(null));
  for (let x = 0; x < width; x++) {
    tiles[0][x] = { type: 'rail', data: { phase: x % 2 } };
    tiles[height - 1][x] = { type: 'rail', data: { phase: (x + 1) % 2 } };
  }
  for (let y = 0; y < height; y++) {
    tiles[y][0] = { type: 'rail', data: { phase: y % 2 } };
    tiles[y][width - 1] = { type: 'rail', data: { phase: (y + 1) % 2 } };
  }
  tiles[1][2] = { type: 'chest', resource: 'chest', data: { locked: true, required: 'rail-key' } };
  return { tiles, width, height };
}

function createResourceCluster(type, size = 4) {
  const tiles = [];
  const width = size + 2;
  const height = size + 2;
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        row.push({ type: 'canyon', data: {} });
      } else {
        row.push({ type, resource: 'spark-crystal', data: { yield: 1 } });
      }
    }
    tiles.push(row);
  }
  return { tiles, width, height };
}

function choose(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function addItemToInventory(itemId, quantity = 1) {
  const def = ITEM_DEFS[itemId];
  if (!def) return false;
  for (let i = 0; i < state.player.inventory.length; i++) {
    const slot = state.player.inventory[i];
    if (slot && slot.item === itemId) {
      const addable = Math.min(quantity, def.stack - slot.quantity);
      if (addable > 0) {
        slot.quantity += addable;
        quantity -= addable;
      }
    }
    if (quantity === 0) break;
  }
  for (let i = 0; i < state.player.inventory.length && quantity > 0; i++) {
    if (!state.player.inventory[i]) {
      const addable = Math.min(quantity, def.stack);
      state.player.inventory[i] = { item: itemId, quantity: addable };
      quantity -= addable;
    }
  }
  if (quantity > 0) {
    state.player.satchel.push({ item: itemId, quantity });
  }
  updateInventoryUI();
  return true;
}

function removeItem(itemId, quantity = 1) {
  for (let i = 0; i < state.player.inventory.length; i++) {
    const slot = state.player.inventory[i];
    if (!slot || slot.item !== itemId) continue;
    const removable = Math.min(quantity, slot.quantity);
    slot.quantity -= removable;
    quantity -= removable;
    if (slot.quantity <= 0) {
      state.player.inventory[i] = null;
    }
    if (quantity === 0) break;
  }
  if (quantity === 0) {
    updateInventoryUI();
    return true;
  }
  for (let i = 0; i < state.player.satchel.length && quantity > 0; i++) {
    const bundle = state.player.satchel[i];
    if (bundle.item !== itemId) continue;
    const removable = Math.min(quantity, bundle.quantity);
    bundle.quantity -= removable;
    quantity -= removable;
    if (bundle.quantity <= 0) {
      state.player.satchel.splice(i, 1);
      i--;
    }
  }
  updateInventoryUI();
  return quantity === 0;
}

function hasItem(itemId, quantity = 1) {
  let total = 0;
  for (const slot of state.player.inventory) {
    if (slot?.item === itemId) total += slot.quantity;
  }
  for (const bundle of state.player.satchel) {
    if (bundle.item === itemId) total += bundle.quantity;
  }
  return total >= quantity;
}

function updateInventoryUI() {
  hotbarEl.innerHTML = '';
  state.player.inventory.forEach((slot, index) => {
    const el = document.createElement('div');
    el.className = 'inventory-slot';
    if (index === state.player.selectedSlot) el.classList.add('active');
    if (slot) {
      el.innerHTML = `<span>${ITEM_DEFS[slot.item]?.name ?? slot.item}</span><span class="quantity">${slot.quantity}</span>`;
    } else {
      el.innerHTML = '<span>—</span>';
    }
    el.addEventListener('click', () => {
      state.player.selectedSlot = index;
      updateInventoryUI();
    });
    hotbarEl.appendChild(el);
  });

  extendedInventoryEl.innerHTML = '';
  const combined = mergeInventory();
  combined.forEach((bundle) => {
    const el = document.createElement('div');
    el.className = 'inventory-slot';
    el.innerHTML = `<span>${ITEM_DEFS[bundle.item]?.name ?? bundle.item}</span><span class="quantity">${bundle.quantity}</span>`;
    el.addEventListener('click', () => addToCraftSequence(bundle.item));
    extendedInventoryEl.appendChild(el);
  });
}

function mergeInventory() {
  const map = new Map();
  [...state.player.inventory, ...state.player.satchel].forEach((entry) => {
    if (!entry) return;
    map.set(entry.item, (map.get(entry.item) ?? 0) + entry.quantity);
  });
  return Array.from(map.entries()).map(([item, quantity]) => ({ item, quantity }));
}

function updateStatusBars() {
  heartsEl.innerHTML = '';
  const hearts = document.createElement('div');
  hearts.className = 'meter';
  for (let i = 0; i < state.player.maxHearts; i++) {
    const el = document.createElement('span');
    el.className = 'heart';
    if (i >= state.player.hearts) {
      el.classList.add('empty');
    }
    hearts.appendChild(el);
  }
  heartsEl.appendChild(hearts);

  bubblesEl.innerHTML = '';
  const bubbles = document.createElement('div');
  bubbles.className = 'meter';
  for (let i = 0; i < state.player.maxAir; i++) {
    const el = document.createElement('span');
    el.className = 'bubble';
    if (i >= state.player.air) {
      el.classList.add('empty');
    }
    bubbles.appendChild(el);
  }
  bubblesEl.appendChild(bubbles);

  const ratio = (state.elapsed % state.dayLength) / state.dayLength;
  const track = document.createElement('div');
  track.className = 'time-track';
  const label = document.createElement('span');
  label.textContent = ratio < 0.5 ? 'Daylight' : 'Nightfall';
  const bar = document.createElement('div');
  bar.className = 'bar';
  bar.style.setProperty('--progress', ratio.toFixed(2));
  track.append(label, bar);
  timeEl.innerHTML = '';
  timeEl.appendChild(track);
}

function updateDimensionOverlay() {
  const info = state.dimension;
  const tasks = [];
  if (!state.unlockedDimensions.has('rock')) {
    tasks.push('Craft a Stone Pickaxe and harvest dense rock.');
  } else if (!state.unlockedDimensions.has('stone')) {
    tasks.push('Assemble a Rock portal frame and ignite it.');
  }
  if (state.dimension.id === 'netherite' && !state.victory) {
    tasks.push('Keep moving! Rails collapse moments after contact.');
  }
  if (state.player.effects.hasEternalIngot) {
    tasks.push('Find your way back to the Grassland Threshold to seal your run.');
  }
  dimensionInfoEl.innerHTML = `
    <strong>${info.name}</strong>
    <span>${info.description}</span>
    ${tasks.length ? `<span>Objectives:</span><ul>${tasks.map((t) => `<li>${t}</li>`).join('')}</ul>` : ''}
  `;
}

function logEvent(message) {
  const li = document.createElement('li');
  li.textContent = message;
  eventLogEl.prepend(li);
  while (eventLogEl.children.length > 12) {
    eventLogEl.removeChild(eventLogEl.lastChild);
  }
}

function startGame() {
  introModal.style.display = 'none';
  state.isRunning = true;
  loadDimension('origin');
  updateInventoryUI();
  updateRecipesList();
  updateCraftQueue();
  updateStatusBars();
  updateDimensionOverlay();
  requestAnimationFrame(loop);
  logEvent('You awaken on a floating island.');
  addItemToInventory('wood', 2);
  addItemToInventory('stone', 1);
}

function loadDimension(id, fromId = null) {
  const dim = DIMENSIONS[id];
  if (!dim) return;
  state.dimension = dim;
  state.unlockedDimensions.add(id);
  state.world = dim.generator(state);
  state.player.x = Math.floor(state.width / 2);
  state.player.y = Math.floor(state.height / 2);
  state.player.facing = { x: 0, y: 1 };
  state.portals = [];
  state.zombies = [];
  state.baseMoveDelay = dim.rules.moveDelay ?? 0.18;
  state.moveDelay = state.baseMoveDelay;
  state.hooks.onMove = [];
  state.hooks.update = [];
  state.hooks.onAction = [];
  state.hooks.isWalkable = [];
  if (dim.rules.onMove) state.hooks.onMove.push(dim.rules.onMove);
  if (dim.rules.update) state.hooks.update.push(dim.rules.update);
  if (dim.rules.onAction) state.hooks.onAction.push(dim.rules.onAction);
  if (dim.rules.isWalkable) state.hooks.isWalkable.push(dim.rules.isWalkable);
  if (id === 'stone') {
    state.railPhase = 0;
    state.railTimer = 0;
  }
  if (id === 'marble') {
    state.echoQueue = [];
  }
  state.player.tarStacks = 0;
  state.player.tarSlowTimer = 0;
  state.player.isSliding = false;
  if (fromId && id !== 'origin' && id !== 'netherite') {
    spawnReturnPortal(fromId, id);
  }
  if (id === 'origin' && fromId && hasItem('eternal-ingot')) {
    state.victory = true;
    logEvent('Victory! You returned with the Eternal Ingot.');
  }
  updateDimensionOverlay();
  updateRecipesList();
  updatePortalProgress();
  logEvent(`Entered ${dim.name}.`);
}

function loop(timestamp) {
  if (!state.prevTimestamp) state.prevTimestamp = timestamp;
  const delta = (timestamp - state.prevTimestamp) / 1000;
  state.prevTimestamp = timestamp;
  if (state.isRunning) {
    update(delta);
    draw();
  }
  requestAnimationFrame(loop);
}

function update(delta) {
  state.elapsed += delta;
  for (const hook of state.hooks.update) {
    hook(state, delta);
  }
  if (state.player.tarStacks > 0) {
    state.player.tarSlowTimer = Math.max((state.player.tarSlowTimer ?? 0) - delta, 0);
    if (state.player.tarSlowTimer === 0) {
      state.player.tarStacks = Math.max(0, state.player.tarStacks - 1);
      if (state.player.tarStacks > 0) {
        state.player.tarSlowTimer = 1.1;
      }
    }
  }
  const dayProgress = (state.elapsed % state.dayLength) / state.dayLength;
  const isNight = dayProgress > 0.5;
  if (isNight && state.zombies.length < 4) {
    spawnZombie();
  }
  updateZombies(delta);
  handleAir(delta);
  processEchoQueue();
  updateStatusBars();
  updatePortalProgress();
}

function processEchoQueue() {
  if (!state.echoQueue.length) return;
  if (state.dimension.id !== 'marble') {
    state.echoQueue.length = 0;
    return;
  }
  // queue handled in marble update hook
}

function handleAir(delta) {
  const tile = getTile(state.player.x, state.player.y);
  if (tile?.type === 'water') {
    state.player.air = Math.max(0, state.player.air - delta * 2);
    if (state.player.air === 0) {
      applyDamage(0.5 * delta * 5);
    }
  } else {
    state.player.air = clamp(state.player.air + delta * 3, 0, state.player.maxAir);
  }
}

function spawnZombie() {
  const spawnEdges = [
    { x: Math.floor(Math.random() * state.width), y: 0 },
    { x: Math.floor(Math.random() * state.width), y: state.height - 1 },
    { x: 0, y: Math.floor(Math.random() * state.height) },
    { x: state.width - 1, y: Math.floor(Math.random() * state.height) },
  ];
  const spawn = choose(spawnEdges);
  state.zombies.push({ x: spawn.x, y: spawn.y, speed: 0.8, cooldown: 0 });
  logEvent('A zombie claws onto the rails.');
}

function updateZombies(delta) {
  state.zombies.forEach((zombie) => {
    zombie.cooldown -= delta;
    if (zombie.cooldown > 0) return;
    const dx = Math.sign(state.player.x - zombie.x);
    const dy = Math.sign(state.player.y - zombie.y);
    if (Math.abs(dx) > Math.abs(dy)) {
      if (isWalkable(zombie.x + dx, zombie.y)) zombie.x += dx;
      else if (isWalkable(zombie.x, zombie.y + dy)) zombie.y += dy;
    } else {
      if (isWalkable(zombie.x, zombie.y + dy)) zombie.y += dy;
      else if (isWalkable(zombie.x + dx, zombie.y)) zombie.x += dx;
    }
    zombie.cooldown = 0.5;
    if (zombie.x === state.player.x && zombie.y === state.player.y) {
      applyDamage(0.5);
      logEvent('Zombie strike! Lose 0.5 heart.');
    }
  });
  state.zombies = state.zombies.filter((z) => {
    const tile = getTile(z.x, z.y);
    return tile && tile.type !== 'void' && tile.type !== 'railVoid';
  });
}

function applyDamage(amount) {
  state.player.hearts = clamp(state.player.hearts - amount, 0, state.player.maxHearts);
  if (state.player.hearts <= 0 && !state.victory) {
    logEvent('You collapse. Echoes rebuild the realm...');
    loadDimension('origin');
    state.player.hearts = state.player.maxHearts;
    state.player.air = state.player.maxAir;
  }
}

function getTile(x, y) {
  if (x < 0 || y < 0 || x >= state.width || y >= state.height) return null;
  return state.world[y][x];
}

function isWalkable(x, y) {
  const tile = getTile(x, y);
  if (!tile) return false;
  for (const hook of state.hooks.isWalkable) {
    const result = hook(tile, state);
    if (typeof result === 'boolean') return result;
  }
  const def = TILE_TYPES[tile.type];
  if (tile.type === 'tree' || tile.type === 'chest') return false;
  if (tile.type === 'water' || tile.type === 'lava' || tile.type === 'void' || tile.type === 'railVoid') return false;
  if (tile.type === 'portalFrame') return true;
  if (tile.type === 'portal') return true;
  if (def?.walkable !== undefined) return def.walkable;
  return true;
}

function attemptMove(dx, dy, ignoreCooldown = false) {
  const now = performance.now();
  const delay = (state.baseMoveDelay ?? 0.18) + (state.player.tarStacks || 0) * 0.04;
  if (!ignoreCooldown && now - state.lastMoveAt < delay * 1000) return;
  const nx = state.player.x + dx;
  const ny = state.player.y + dy;
  if (!isWalkable(nx, ny)) {
    state.player.facing = { x: dx, y: dy };
    return;
  }
  const from = { x: state.player.x, y: state.player.y };
  state.player.x = nx;
  state.player.y = ny;
  state.player.facing = { x: dx, y: dy };
  state.lastMoveAt = now;
  const tile = getTile(nx, ny);
  if (tile?.hazard) {
    applyDamage(0.5);
    logEvent('Hazard burns you!');
  }
  for (const hook of state.hooks.onMove) {
    hook(state, from, { x: nx, y: ny }, { dx, dy });
  }
}

function interact(useAlt = false, echoed = false) {
  const facingX = state.player.x + state.player.facing.x;
  const facingY = state.player.y + state.player.facing.y;
  const frontTile = getTile(facingX, facingY);
  const currentTile = getTile(state.player.x, state.player.y);
  const tile = frontTile ?? currentTile;
  const tx = frontTile ? facingX : state.player.x;
  const ty = frontTile ? facingY : state.player.y;
  if (!tile) return;
  if (tile.type === 'portalDormant') {
    logEvent('The frame is inert. Ignite it to stabilise.');
    return;
  }
  if (tile.type === 'portal' && !state.victory) {
    enterPortalAt(tx, ty);
    return;
  }
  if (tile.type === 'portalFrame') {
    ignitePortal(tx, ty);
    return;
  }
  if (tile.type === 'chest') {
    openChest(tile);
    return;
  }
  if (tile.resource) {
    harvestResource(tile, tx, ty, echoed);
    return;
  }
  if (!echoed) {
    for (const hook of state.hooks.onAction) {
      hook(state, (fromEcho) => interact(useAlt, true));
    }
  }
}

function harvestResource(tile, x, y, echoed) {
  if (tile.data?.yield === undefined) tile.data.yield = 1;
  if (tile.data.yield <= 0) {
    logEvent('Resource depleted.');
    return;
  }
  const itemId = tile.resource;
  if (itemId === 'chest') {
    openChest(tile);
    return;
  }
  if (itemId === 'stone' && !hasItem('stone-pickaxe')) {
    logEvent('You need a Stone Pickaxe.');
    return;
  }
  tile.data.yield -= 1;
  addItemToInventory(itemId, 1);
  logEvent(`Gathered ${ITEM_DEFS[itemId]?.name ?? itemId}.`);
  if (tile.data.yield <= 0 && tile.type !== 'tar') {
    tile.type = 'grass';
    tile.resource = null;
  }
  if (!echoed) {
    for (const hook of state.hooks.onAction) {
      hook(state, (fromEcho) => harvestResource(tile, x, y, true));
    }
  }
}

function enterPortalAt(x, y) {
  const portal = state.portals.find((p) =>
    p.tiles.some((t) => t.x === x && t.y === y)
  );
  if (!portal) {
    logEvent('Portal hums but is not linked.');
    return;
  }
  if (!portal.active) {
    logEvent('Portal is dormant. Ignite it first.');
    return;
  }
  if (portal.destination === 'netherite' && state.dimension.id === 'netherite') {
    state.victory = true;
    addItemToInventory('eternal-ingot', 1);
    logEvent('You seize the Eternal Ingot! Return home victorious.');
    return;
  }
  if (state.dimension.id === portal.origin && portal.destination) {
    loadDimension(portal.destination, portal.origin);
    return;
  }
  if (state.dimension.id === portal.destination && portal.origin) {
    loadDimension(portal.origin, portal.destination);
    return;
  }
}

function ignitePortal(x, y) {
  if (!hasItem('portal-igniter') && !hasItem('torch')) {
    logEvent('You need a Portal Igniter or Torch.');
    return;
  }
  const frame = state.portals.find((portal) => portal.frame.some((f) => f.x === x && f.y === y));
  if (!frame) {
    logEvent('Frame incomplete.');
    return;
  }
  if (frame.active) {
    logEvent('Portal already active.');
    return;
  }
  frame.active = true;
  if (hasItem('portal-igniter')) removeItem('portal-igniter', 1);
  else removeItem('torch', 1);
  frame.tiles.forEach(({ x: tx, y: ty }) => {
    const tile = getTile(tx, ty);
    if (tile) tile.type = 'portal';
  });
  logEvent(`${frame.label} shimmers to life.`);
  updatePortalProgress();
}

function buildPortal(material) {
  const itemId = material;
  const requirement = 12;
  if (!hasItem(itemId, requirement)) {
    logEvent(`Need ${requirement} ${ITEM_DEFS[itemId]?.name ?? itemId}.`);
    return;
  }
  const framePositions = computePortalFrame(state.player.x, state.player.y, state.player.facing);
  if (!framePositions) {
    logEvent('Not enough space for portal frame.');
    return;
  }
  removeItem(itemId, requirement);
  const portal = {
    material,
    frame: framePositions.frame,
    tiles: framePositions.portal,
    active: false,
    label: `${DIMENSIONS[material]?.name ?? material} Portal`,
    origin: state.dimension.id,
    destination: material,
  };
  portal.frame.forEach(({ x, y }) => {
    const tile = getTile(x, y);
    if (tile) tile.type = 'portalFrame';
  });
  portal.tiles.forEach(({ x, y }) => {
    const tile = getTile(x, y);
    if (tile) tile.type = 'portalDormant';
  });
  state.portals.push(portal);
  logEvent(`Constructed ${portal.label}. Ignite to travel.`);
}

function spawnReturnPortal(targetDimension, currentDimension) {
  const cx = clamp(Math.floor(state.width / 2), 3, state.width - 4);
  const cy = clamp(Math.floor(state.height / 2), 2, state.height - 4);
  const frame = [];
  const tiles = [];
  for (let dy = -1; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (!isWithinBounds(x, y)) continue;
      if (dx === -2 || dx === 2 || dy === -1 || dy === 2) {
        frame.push({ x, y });
      } else if (!(dx === 0 && (dy === 0 || dy === 1))) {
        tiles.push({ x, y });
      }
    }
  }
  frame.forEach(({ x, y }) => {
    const tile = getTile(x, y);
    if (tile) tile.type = 'portalFrame';
  });
  tiles.forEach(({ x, y }) => {
    const tile = getTile(x, y);
    if (tile) tile.type = 'portal';
  });
  state.portals.push({
    material: targetDimension,
    frame,
    tiles,
    active: true,
    origin: currentDimension,
    destination: targetDimension,
    label: `Return to ${DIMENSIONS[targetDimension]?.name ?? targetDimension}`,
  });
  logEvent('A stabilised return gate anchors nearby.');
}

function computePortalFrame(px, py, facing) {
  const orientation = Math.abs(facing.x) > Math.abs(facing.y) ? 'vertical' : 'horizontal';
  const frame = [];
  const portal = [];
  if (orientation === 'vertical') {
    for (let dy = -1; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = px + dx;
        const y = py + dy;
        if (!isWithinBounds(x, y)) return null;
        if (dx === -2 || dx === 2 || dy === -1 || dy === 2) {
          frame.push({ x, y });
        } else if (!(dx === 0 && (dy === 0 || dy === 1))) {
          portal.push({ x, y });
        }
      }
    }
  } else {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -1; dx <= 2; dx++) {
        const x = px + dx;
        const y = py + dy;
        if (!isWithinBounds(x, y)) return null;
        if (dy === -2 || dy === 2 || dx === -1 || dx === 2) {
          frame.push({ x, y });
        } else if (!(dy === 0 && (dx === 0 || dx === 1))) {
          portal.push({ x, y });
        }
      }
    }
  }
  return { frame, portal };
}

function isWithinBounds(x, y) {
  return x >= 1 && y >= 1 && x < state.width - 1 && y < state.height - 1;
}

function updatePortalProgress() {
  if (!state.dimension) return;
  const currentIndex = DIMENSION_SEQUENCE.indexOf(state.dimension.id);
  const total = DIMENSION_SEQUENCE.length - 1;
  const ratio = clamp(currentIndex / total, 0, 1);
  portalProgressEl.style.display = 'block';
  portalProgressBar.style.width = `${ratio * 100}%`;
}

function addToCraftSequence(itemId) {
  state.craftSequence.push(itemId);
  updateCraftQueue();
}

function updateCraftQueue() {
  craftTargetEl.innerHTML = '';
  if (!state.craftSequence.length) {
    craftTargetEl.classList.add('empty');
  } else {
    craftTargetEl.classList.remove('empty');
  }
  state.craftSequence.forEach((item) => {
    const el = document.createElement('span');
    el.className = 'queue-item';
    el.textContent = ITEM_DEFS[item]?.name ?? item;
    craftTargetEl.appendChild(el);
  });
}

function attemptCraft() {
  if (!state.craftSequence.length) return;
  const recipe = RECIPES.find((r) =>
    r.sequence.length === state.craftSequence.length &&
    r.sequence.every((item, idx) => item === state.craftSequence[idx]) &&
    state.unlockedDimensions.has(r.unlock)
  );
  if (!recipe) {
    logEvent('Sequence fizzles. No recipe matched.');
    state.craftSequence = [];
    updateCraftQueue();
    return;
  }
  const canCraft = recipe.sequence.every((itemId) => hasItem(itemId));
  if (!canCraft) {
    logEvent('Missing ingredients for this recipe.');
    return;
  }
  recipe.sequence.forEach((itemId) => removeItem(itemId, 1));
  addItemToInventory(recipe.output.item, recipe.output.quantity);
  state.knownRecipes.add(recipe.id);
  logEvent(`${recipe.name} crafted.`);
  if (recipe.output.item === 'portal-igniter') {
    state.player.hasIgniter = true;
  }
  state.craftSequence = [];
  updateCraftQueue();
}

function updateRecipesList() {
  recipeListEl.innerHTML = '';
  const query = recipeSearchEl.value?.toLowerCase() ?? '';
  RECIPES.forEach((recipe) => {
    if (!state.unlockedDimensions.has(recipe.unlock)) return;
    if (query && !recipe.name.toLowerCase().includes(query)) return;
    const card = document.createElement('div');
    card.className = 'recipe-card';
    card.innerHTML = `
      <strong>${recipe.name}</strong>
      <span>${recipe.sequence.map((item) => ITEM_DEFS[item]?.name ?? item).join(' → ')}</span>
      <span>Creates ${ITEM_DEFS[recipe.output.item]?.name ?? recipe.output.item} ×${recipe.output.quantity}</span>
    `;
    card.addEventListener('click', () => {
      state.craftSequence = [...recipe.sequence];
      updateCraftQueue();
    });
    recipeListEl.appendChild(card);
  });
}

function openChest(tile) {
  if (tile.data?.locked && !hasItem(tile.data.required)) {
    logEvent('Chest locked. Requires Rail Key.');
    return;
  }
  tile.type = 'grass';
  tile.resource = null;
  const lootTable = [
    { item: 'stick', qty: 2 },
    { item: 'spark-crystal', qty: 1 },
    { item: 'tar', qty: 1 },
    { item: 'pattern-crystal', qty: 1 },
    { item: 'rock', qty: 2 },
  ];
  const loot = tile.data?.loot
    ? { item: tile.data.loot, qty: tile.data.quantity ?? 1 }
    : choose(lootTable);
  addItemToInventory(loot.item, loot.qty);
  if (loot.item === 'eternal-ingot') {
    state.player.effects.hasEternalIngot = true;
    logEvent('The Eternal Ingot pulses with limitless energy! Return home.');
  } else {
    logEvent(`Chest yields ${ITEM_DEFS[loot.item]?.name ?? loot.item} ×${loot.qty}.`);
  }
  updateDimensionOverlay();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      drawTile(x, y, state.world[y][x]);
    }
  }
  drawPortals();
  drawZombies();
  drawPlayer();
}

function drawTile(x, y, tile) {
  const tx = x * state.tileWidth;
  const ty = y * state.tileHeight;
  const type = TILE_TYPES[tile?.type] ?? TILE_TYPES.grass;
  const base = type.base ?? '#1c1f2d';
  const accent = type.accent ?? '#49f2ff';
  const gradient = ctx.createLinearGradient(tx, ty, tx + state.tileWidth, ty + state.tileHeight);
  gradient.addColorStop(0, shadeColor(base, -12));
  gradient.addColorStop(1, shadeColor(base, 12));
  ctx.fillStyle = gradient;
  ctx.fillRect(tx, ty, state.tileWidth, state.tileHeight);
  if (tile?.type === 'rail') {
    ctx.strokeStyle = state.railPhase === (tile.data?.phase ?? 0) ? accent : 'rgba(73,242,255,0.15)';
    ctx.lineWidth = 3;
    ctx.strokeRect(tx + 8, ty + 8, state.tileWidth - 16, state.tileHeight - 16);
    ctx.lineWidth = 1;
  }
  if (tile?.type === 'portalFrame') {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.strokeRect(tx + 6, ty + 6, state.tileWidth - 12, state.tileHeight - 12);
  }
  if (tile?.type === 'portalDormant' || tile?.type === 'portal') {
    const radial = ctx.createRadialGradient(
      tx + state.tileWidth / 2,
      ty + state.tileHeight / 2,
      4,
      tx + state.tileWidth / 2,
      ty + state.tileHeight / 2,
      state.tileWidth / 2
    );
    const alphaInner = tile.type === 'portal' ? 1 : 0.55;
    const alphaOuter = tile.type === 'portal' ? 0.25 : 0.08;
    radial.addColorStop(0, `rgba(73,242,255,${alphaInner})`);
    radial.addColorStop(1, `rgba(73,242,255,${alphaOuter})`);
    ctx.fillStyle = radial;
    ctx.fillRect(tx + 4, ty + 4, state.tileWidth - 8, state.tileHeight - 8);
  }
  if (tile?.resource && tile.type !== 'portal') {
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.45;
    ctx.fillRect(tx + 10, ty + 10, state.tileWidth - 20, state.tileHeight - 20);
    ctx.globalAlpha = 1;
  }
  if (tile?.type === 'lava') {
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.25;
    ctx.fillRect(tx, ty, state.tileWidth, state.tileHeight);
    ctx.globalAlpha = 1;
  }
}

function shadeColor(hex, percent) {
  const f = parseInt(hex.slice(1), 16);
  const t = percent < 0 ? 0 : 255;
  const p = Math.abs(percent) / 100;
  const R = f >> 16;
  const G = (f >> 8) & 0x00ff;
  const B = f & 0x0000ff;
  const newR = Math.round((t - R) * p) + R;
  const newG = Math.round((t - G) * p) + G;
  const newB = Math.round((t - B) * p) + B;
  return `rgb(${newR}, ${newG}, ${newB})`;
}

function drawPlayer() {
  const px = state.player.x * state.tileWidth;
  const py = state.player.y * state.tileHeight;
  ctx.fillStyle = '#f7b733';
  ctx.fillRect(px + 12, py + 8, state.tileWidth - 24, state.tileHeight - 16);
  ctx.fillStyle = '#0b1324';
  ctx.fillRect(px + 22, py + 16, 6, 6);
}

function drawZombies() {
  ctx.fillStyle = '#6cff9d';
  state.zombies.forEach((z) => {
    const zx = z.x * state.tileWidth;
    const zy = z.y * state.tileHeight;
    ctx.fillRect(zx + 14, zy + 14, state.tileWidth - 28, state.tileHeight - 28);
  });
}

function drawPortals() {
  state.portals.forEach((portal) => {
    portal.tiles.forEach(({ x, y }, index) => {
      const tx = x * state.tileWidth;
      const ty = y * state.tileHeight;
      const pulse = portal.active ? 0.4 + 0.2 * Math.sin(state.elapsed * 2 + index) : 0.15;
      ctx.strokeStyle = `rgba(73,242,255,${pulse})`;
      ctx.strokeRect(tx + 6, ty + 6, state.tileWidth - 12, state.tileHeight - 12);
    });
  });
}

function handleKeyDown(event) {
  if (event.repeat) return;
  switch (event.key.toLowerCase()) {
    case 'w':
    case 'arrowup':
      attemptMove(0, -1);
      break;
    case 'a':
    case 'arrowleft':
      attemptMove(-1, 0);
      break;
    case 's':
    case 'arrowdown':
      attemptMove(0, 1);
      break;
    case 'd':
    case 'arrowright':
      attemptMove(1, 0);
      break;
    case ' ':
      interact();
      break;
    case 'q':
      placeBlock();
      break;
    case 'r':
      promptPortalBuild();
      break;
    case 'e':
      toggleExtended();
      break;
    case 'f':
      interact();
      break;
    case '1':
    case '2':
    case '3':
    case '4':
    case '5':
    case '6':
    case '7':
    case '8':
    case '9':
    case '0': {
      const index = (parseInt(event.key, 10) + 9) % 10;
      state.player.selectedSlot = index;
      updateInventoryUI();
      break;
    }
    default:
      break;
  }
}

function placeBlock() {
  const slot = state.player.inventory[state.player.selectedSlot];
  if (!slot) {
    logEvent('Select a block to place.');
    return;
  }
  const blockItems = ['wood', 'stone', 'rock', 'tar', 'marble', 'netherite'];
  if (!blockItems.includes(slot.item)) {
    logEvent('Cannot place this item.');
    return;
  }
  const tx = state.player.x + state.player.facing.x;
  const ty = state.player.y + state.player.facing.y;
  if (!isWithinBounds(tx, ty)) return;
  const tile = getTile(tx, ty);
  if (!tile || tile.type !== 'grass') {
    logEvent('Need an empty tile to place.');
    return;
  }
  tile.type = blockItems.includes(slot.item) ? slot.item : 'grass';
  removeItem(slot.item, 1);
  logEvent(`${ITEM_DEFS[slot.item].name} placed.`);
}

function promptPortalBuild() {
  const available = ['rock', 'stone', 'tar', 'marble', 'netherite'].filter((material) =>
    hasItem(material, 12) && DIMENSIONS[material]
  );
  if (!available.length) {
    logEvent('Collect more block resources to build a portal.');
    return;
  }
  const material = available[0];
  buildPortal(material);
}

function toggleExtended() {
  extendedInventoryEl.classList.toggle('open');
  toggleExtendedBtn.textContent = extendedInventoryEl.classList.contains('open') ? 'Close Satchel' : 'Open Satchel';
}

function updateFromMobile(action) {
  switch (action) {
    case 'up':
      attemptMove(0, -1);
      break;
    case 'down':
      attemptMove(0, 1);
      break;
    case 'left':
      attemptMove(-1, 0);
      break;
    case 'right':
      attemptMove(1, 0);
      break;
    case 'action':
      interact();
      break;
    case 'portal':
      promptPortalBuild();
      break;
    default:
      break;
  }
}

function updateDimensionUnlocks() {
  state.unlockedDimensions.forEach((dim) => {
    const dimensionIndex = DIMENSION_SEQUENCE.indexOf(dim);
    const nextDim = DIMENSION_SEQUENCE[dimensionIndex + 1];
    if (nextDim) {
      state.unlockedDimensions.add(nextDim);
    }
  });
}

function handleVictory() {
  if (!state.victory) return;
  logEvent('Return through your portals to complete the run!');
}

function initEventListeners() {
  document.addEventListener('keydown', handleKeyDown);
  craftButton.addEventListener('click', attemptCraft);
  clearCraftButton.addEventListener('click', () => {
    state.craftSequence = [];
    updateCraftQueue();
  });
  recipeSearchEl.addEventListener('input', updateRecipesList);
  toggleExtendedBtn.addEventListener('click', toggleExtended);
  mobileControls.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => updateFromMobile(button.dataset.action));
  });
}

startButton.addEventListener('click', startGame);
initEventListeners();

function drawGridOverlay() {
  ctx.strokeStyle = 'rgba(73,242,255,0.05)';
  for (let x = 0; x <= state.width; x++) {
    ctx.beginPath();
    ctx.moveTo(x * state.tileWidth, 0);
    ctx.lineTo(x * state.tileWidth, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= state.height; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * state.tileHeight);
    ctx.lineTo(canvas.width, y * state.tileHeight);
    ctx.stroke();
  }
}

setTimeout(() => {
  drawGridOverlay();
}, 100);
