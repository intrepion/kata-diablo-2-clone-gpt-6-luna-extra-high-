(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const mapCanvas = document.getElementById("minimap");
  const mapCtx = mapCanvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  const WORLD = { width: 2240, height: 1450 };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const rand = (min, max) => min + Math.random() * (max - min);
  const choice = (values) => values[Math.floor(Math.random() * values.length)];
  const $ = (id) => document.getElementById(id);

  const state = {
    started: false,
    paused: false,
    panel: false,
    panelTab: "inventory",
    dead: false,
    complete: false,
    kills: 0,
    bossSpawned: false,
    level: 1,
    xp: 0,
    nextXp: 100,
    gold: 0,
    potions: 2,
    mana: 60,
    maxMana: 60,
    health: 100,
    maxHealth: 100,
    attack: 12,
    defense: 3,
    target: null,
    moveTarget: null,
    facing: -Math.PI / 2,
    lastTime: 0,
    elapsed: 0,
    sound: true,
    audio: null,
    toastTimer: 0,
    camera: { x: 0, y: 0 },
    cooldowns: { bolt: 0, spin: 0 },
    inventory: [],
    equipment: { weapon: null, armor: null },
    keys: new Set(),
    mouse: { x: W / 2, y: H / 2 },
    player: {
      x: 220, y: 730, radius: 17, speed: 184, attackTimer: 0,
      attackFlash: 0, rollTime: 0, invulnerable: 0, hurtFlash: 0,
    },
    enemies: [],
    projectiles: [],
    drops: [],
    texts: [],
    particles: [],
    journal: [],
  };

  let uid = 1;
  const enemySeed = [
    ["fallen", 468, 636], ["fallen", 575, 754], ["fallen", 790, 536],
    ["fallen", 902, 445], ["fallen", 1020, 628], ["fallen", 1190, 502],
    ["fallen", 1400, 735], ["fallen", 1552, 657], ["fallen", 1675, 477],
    ["skeleton", 632, 847], ["skeleton", 944, 735], ["skeleton", 1134, 426],
    ["skeleton", 1356, 478], ["skeleton", 1644, 786],
    ["shaman", 690, 495], ["shaman", 1230, 775], ["shaman", 1515, 492],
  ];
  for (const [kind, x, y] of enemySeed) state.enemies.push(makeEnemy(kind, x, y));

  const names = {
    weapon: ["Rusted Falchion", "Ashwood Maul", "Pilgrim's Edge", "Moorland Cleaver", "Ironbound Blade"],
    armor: ["Hidebound Mantle", "Roadwarden's Coat", "Ashen Vest", "Riveted Jack", "Moorwalker Wraps"],
  };
  const weaponGlyphs = ["⚔", "†", "╱", "ϟ"];
  const armorGlyphs = ["♢", "◈", "▱", "◉"];
  const environment = makeEnvironment();

  function makeEnemy(kind, x, y) {
    const stats = {
      fallen: { name: "Fallen", hp: 38, damage: 8, speed: 64, xp: 24, radius: 14, color: "#a84c40" },
      skeleton: { name: "Bonewalker", hp: 52, damage: 11, speed: 51, xp: 32, radius: 16, color: "#b7a88a" },
      shaman: { name: "Grave Shaman", hp: 43, damage: 9, speed: 39, xp: 40, radius: 15, color: "#9d5547" },
      bloodhorn: { name: "The Bloodhorn", hp: 320, damage: 21, speed: 49, xp: 190, radius: 31, color: "#843d38" },
    }[kind];
    return { id: uid++, kind, x, y, ...stats, maxHp: stats.hp, aggro: false, attackTimer: rand(.4, 1.1), hurt: 0, dead: false, bob: rand(0, 6) };
  }

  function makeEnvironment() {
    let seed = 67213;
    const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const props = [];
    for (let i = 0; i < 230; i++) {
      const x = 35 + random() * (WORLD.width - 70);
      const y = 25 + random() * (WORLD.height - 50);
      const nearRoad = Math.abs(y - roadY(x)) < 120;
      const roll = random();
      const type = nearRoad ? (roll < .48 ? "shrub" : "stone") : (roll < .48 ? "tree" : roll < .7 ? "shrub" : "stone");
      props.push({ type, x, y, size: type === "tree" ? 36 + random() * 20 : 8 + random() * 17, tint: random(), rotation: random() * Math.PI * 2 });
    }
    for (let i = 0; i < 950; i++) {
      props.push({ type: "tuft", x: random() * WORLD.width, y: random() * WORLD.height, size: 1 + random() * 3, tint: random() });
    }
    return props;
  }

  function roadY(x) {
    const points = [[0, 745], [420, 720], [730, 565], [1110, 580], [1420, 700], [1780, 706], [2240, 620]];
    let i = 0;
    while (i < points.length - 2 && x > points[i + 1][0]) i++;
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const t = clamp((x - x1) / (x2 - x1), 0, 1);
    return y1 + (y2 - y1) * t;
  }

  function startGame() {
    if (state.started) return;
    state.started = true;
    $("intro-screen").classList.add("dismissed");
    showToast("THE MOOR IS YOURS TO RECLAIM");
    addJournal("Left the encampment. The old road runs east.");
    if (state.sound) playSound(420, .12, "triangle", .04);
    renderUI();
  }

  function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("visible");
    state.toastTimer = 2.1;
  }

  function addJournal(message) {
    state.journal.unshift({ message, time: "JUST NOW" });
    state.journal = state.journal.slice(0, 6);
    const host = $("journal-list");
    host.innerHTML = state.journal.map((entry) => `<div class="journal-entry"><i class="journal-dot"></i><span>${entry.message}</span><time>${entry.time}</time></div>`).join("");
  }

  function setPanel(open, tab = state.panelTab) {
    state.panel = open;
    state.panelTab = tab;
    $("game-panel").classList.toggle("open", open);
    $("game-panel").setAttribute("aria-hidden", String(!open));
    $("panel-backdrop").classList.toggle("open", open);
    $("inventory-view").hidden = tab !== "inventory";
    $("character-view").hidden = tab !== "character";
    $("panel-title").textContent = tab === "inventory" ? "INVENTORY" : "CHARACTER";
    $("panel-eyebrow").textContent = tab === "inventory" ? "YOUR BELONGINGS" : "THE WAYFARER";
    document.querySelectorAll("[data-panel-tab]").forEach((button) => button.classList.toggle("selected", button.dataset.panelTab === tab));
    renderInventory();
  }

  function renderInventory() {
    const host = $("inventory-view");
    $("bag-count").textContent = `${state.inventory.length} / 12`;
    if (state.inventory.length === 0) {
      host.innerHTML = `<div class="empty-bag">Your pack is empty.<br>Slay demons and press <b>F</b> near their spoils to collect them.</div>`;
    } else {
      host.innerHTML = state.inventory.map((item, index) => {
        const action = item.type === "potion" ? "USE" : state.equipment[item.type] === item ? "EQUIPPED" : "EQUIP";
        return `<button class="item-row rarity-${item.rarity}" data-item="${index}"><span class="item-icon">${item.glyph}</span><span><span class="item-name">${item.name}</span><span class="item-desc">${item.description}</span></span><span class="item-action">${action}</span></button>`;
      }).join("");
    }
    host.querySelectorAll("[data-item]").forEach((button) => button.addEventListener("click", () => useItem(Number(button.dataset.item))));
    renderCharacter();
    renderUI();
  }

  function renderCharacter() {
    const host = $("character-view");
    host.innerHTML = `<div class="char-hero"><div class="hero-portrait"><span>W</span></div><strong>WANDERER</strong><span>WAYFARER · LEVEL ${state.level}</span></div><div class="char-stats"><div class="char-stat"><span>Health</span><b>${Math.ceil(state.health)} / ${state.maxHealth}</b></div><div class="char-stat"><span>Spirit</span><b>${Math.ceil(state.mana)} / ${state.maxMana}</b></div><div class="char-stat"><span>Attack</span><b>${state.attack}</b></div><div class="char-stat"><span>Defense</span><b>${state.defense}</b></div><div class="char-stat"><span>Experience</span><b>${state.xp} / ${state.nextXp}</b></div><div class="char-stat"><span>Demons slain</span><b>${state.kills}</b></div></div>`;
  }

  function useItem(index) {
    const item = state.inventory[index];
    if (!item) return;
    if (item.type === "potion") {
      if (state.potions >= 5) return showToast("YOUR BELT IS FULL");
      state.potions++;
      state.inventory.splice(index, 1);
      showToast("HEALING POTION ADDED TO YOUR BELT");
      playSound(620, .12, "sine", .04);
    } else {
      const previous = state.equipment[item.type];
      if (previous) state.inventory.push(previous);
      state.equipment[item.type] = item;
      state.inventory.splice(index, 1);
      recalculateStats();
      showToast(`${item.name.toUpperCase()} EQUIPPED`);
      playSound(360, .1, "triangle", .04);
    }
    renderInventory();
  }

  function recalculateStats() {
    state.attack = 12 + (state.level - 1) * 2 + (state.equipment.weapon?.power || 0);
    state.defense = 3 + (state.level - 1) + (state.equipment.armor?.power || 0);
    $("attack-stat").textContent = state.attack;
    $("defense-stat").textContent = state.defense;
    const weapon = $("weapon-slot");
    const armor = $("armor-slot");
    weapon.title = state.equipment.weapon ? `${state.equipment.weapon.name} · +${state.equipment.weapon.power} attack` : "Weapon · Roadworn blade";
    armor.title = state.equipment.armor ? `${state.equipment.armor.name} · +${state.equipment.armor.power} defense` : "Armor · Wayfarer's coat";
    weapon.querySelector("i").style.background = state.equipment.weapon ? rarityColor(state.equipment.weapon.rarity) : "#877252";
    armor.querySelector("i").style.background = state.equipment.armor ? rarityColor(state.equipment.armor.rarity) : "#877252";
    renderCharacter();
  }

  function rarityColor(rarity) { return rarity === "rare" ? "#d5ae57" : rarity === "magic" ? "#8aa8d6" : "#b9afa3"; }

  function renderUI() {
    $("health-value").textContent = Math.ceil(state.health);
    $("mana-value").textContent = Math.ceil(state.mana);
    $("health-fill").style.height = `${clamp(state.health / state.maxHealth, 0, 1) * 100}%`;
    $("mana-fill").style.height = `${clamp(state.mana / state.maxMana, 0, 1) * 100}%`;
    $("mana-regeneration").textContent = `${Math.ceil(state.mana)} / ${state.maxMana}`;
    $("level-label").textContent = state.level;
    $("side-level").textContent = state.level;
    $("xp-label").textContent = `${state.xp} / ${state.nextXp}`;
    $("xp-fill").style.width = `${clamp(state.xp / state.nextXp, 0, 1) * 100}%`;
    $("potion-count").textContent = `${state.potions} potion${state.potions === 1 ? "" : "s"}`;
    $("potion-hotkey-count").textContent = state.potions;
    $("gold-value").textContent = state.gold.toLocaleString();
    $("side-gold").textContent = state.gold.toLocaleString();
    $("quest-short").innerHTML = state.bossSpawned ? "Defeat the Bloodhorn <b>ELITE</b>" : `Slay demons <b>${state.kills} / 12</b>`;
    $("quest-progress").textContent = state.bossSpawned ? "ELITE" : `${state.kills} / 12`;
    $("quest-objective").textContent = state.bossSpawned ? "Slay the Bloodhorn" : "Slay demons";
    $("objective-check").classList.toggle("done", state.complete);
    $("quest-complete-note").hidden = !state.complete;
    if (state.complete) {
      $("quest-objective").textContent = "The road is clear";
      $("quest-progress").textContent = "COMPLETE";
      $("quest-short").innerHTML = "The road is clear <b>✓</b>";
    }
    $("bag-count").textContent = `${state.inventory.length} / 12`;
    document.querySelectorAll("[data-item]").forEach((button) => {
      const item = state.inventory[Number(button.dataset.item)];
      if (item) button.querySelector(".item-action").textContent = item.type === "potion" ? "USE" : state.equipment[item.type] === item ? "EQUIPPED" : "EQUIP";
    });
  }

  function makeItem(type, boss = false) {
    if (type === "potion") return { id: uid++, type, rarity: "common", name: "Healing Potion", description: "Adds one potion to your belt", glyph: "✚" };
    const roll = Math.random();
    const rarity = boss ? "rare" : roll > .91 ? "rare" : roll > .55 ? "magic" : "common";
    const power = (type === "weapon" ? 3 : 2) + (rarity === "rare" ? 5 : rarity === "magic" ? 2 : 0) + (boss ? 3 : 0);
    const adjective = rarity === "rare" ? "Gilded" : rarity === "magic" ? choice(["Serrated", "Umbral", "Stout", "Runed"]) : "Worn";
    return {
      id: uid++, type, rarity, power,
      name: `${adjective} ${choice(names[type])}`,
      description: type === "weapon" ? `One-handed weapon · +${power} attack` : `Chest armor · +${power} defense`,
      glyph: choice(type === "weapon" ? weaponGlyphs : armorGlyphs),
    };
  }

  function spawnLoot(enemy) {
    const count = enemy.kind === "bloodhorn" ? 3 : 1 + (Math.random() < .24 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const offsetX = rand(-22, 22), offsetY = rand(-17, 17);
      if (i === 0 && Math.random() < .66) {
        const amount = enemy.kind === "bloodhorn" ? 160 + Math.floor(rand(0, 80)) : 8 + Math.floor(rand(1, 25));
        state.drops.push({ id: uid++, type: "gold", name: `${amount} gold`, amount, x: enemy.x + offsetX, y: enemy.y + offsetY, age: 0 });
      } else if (Math.random() < .22 && state.potions < 5) {
        state.drops.push({ id: uid++, ...makeItem("potion"), x: enemy.x + offsetX, y: enemy.y + offsetY, age: 0 });
      } else {
        const type = Math.random() < .5 ? "weapon" : "armor";
        const item = makeItem(type, enemy.kind === "bloodhorn");
        state.drops.push({ id: uid++, ...item, x: enemy.x + offsetX, y: enemy.y + offsetY, age: 0 });
      }
    }
  }

  function collectLoot() {
    const player = state.player;
    const nearby = state.drops.filter((drop) => distance(player, drop) < 72).sort((a, b) => distance(player, a) - distance(player, b));
    if (!nearby.length) return showToast("NO LOOT WITHIN REACH");
    const drop = nearby[0];
    if (drop.type !== "gold" && drop.type !== "potion" && state.inventory.length >= 12) return showToast("YOUR PACK IS FULL");
    state.drops = state.drops.filter((entry) => entry !== drop);
    if (drop.type === "gold") {
      state.gold += drop.amount;
      showToast(`◈ ${drop.amount} GOLD`);
      addJournal(`Collected ${drop.amount} gold from the old road.`);
      playSound(740, .09, "sine", .04);
    } else if (drop.type === "potion") {
      if (state.potions < 5) {
        state.potions++;
        showToast("HEALING POTION ADDED TO YOUR BELT");
      } else {
        state.inventory.push(drop);
        showToast("HEALING POTION ADDED TO YOUR PACK");
      }
      playSound(540, .12, "sine", .04);
    } else {
      state.inventory.push(drop);
      showToast(`${drop.name.toUpperCase()} FOUND`);
      addJournal(`Found ${drop.name} among the spoils.`);
      playSound(500, .18, "triangle", .045);
    }
    renderUI();
    if (state.panel) renderInventory();
  }

  function gainXp(amount) {
    state.xp += amount;
    while (state.xp >= state.nextXp) {
      state.xp -= state.nextXp;
      state.level++;
      state.nextXp = Math.floor(state.nextXp * 1.42 + 28);
      state.maxHealth += 14;
      state.maxMana += 6;
      state.health = Math.min(state.maxHealth, state.health + 32);
      state.mana = Math.min(state.maxMana, state.mana + 20);
      recalculateStats();
      showToast(`LEVEL ${state.level} — THE ROAD HARDENS YOU`);
      addJournal(`Reached level ${state.level}. Your strength grows.`);
      playSound(660, .3, "triangle", .06);
    }
    renderUI();
  }

  function damageEnemy(enemy, amount, color = "#f0d29a") {
    if (!enemy || enemy.dead) return;
    enemy.hp -= amount;
    enemy.hurt = .16;
    state.texts.push({ x: enemy.x + rand(-8, 8), y: enemy.y - enemy.radius - 8, text: `${Math.ceil(amount)}`, color, life: .72, vy: -28 });
    for (let i = 0; i < 5; i++) state.particles.push({ x: enemy.x, y: enemy.y, vx: rand(-55, 55), vy: rand(-60, 18), life: rand(.2, .42), color: enemy.kind === "skeleton" ? "#d9d0b6" : "#c34c3c", size: rand(1, 3) });
    if (enemy.hp <= 0) killEnemy(enemy);
  }

  function killEnemy(enemy) {
    if (enemy.dead) return;
    enemy.dead = true;
    if (enemy.kind !== "bloodhorn") {
      state.kills++;
      if (state.kills >= 12 && !state.bossSpawned) spawnBoss();
    }
    gainXp(enemy.xp);
    spawnLoot(enemy);
    addJournal(enemy.kind === "bloodhorn" ? "The Bloodhorn fell. The old road is quiet." : `${enemy.name} fell. The road is a little safer.`);
    playSound(enemy.kind === "skeleton" ? 170 : 115, .16, "triangle", .055);
    if (enemy.kind === "bloodhorn") {
      state.complete = true;
      $("boss-banner").classList.remove("visible");
      showToast("THE BLOODHORN HAS FALLEN · QUEST COMPLETE");
      $("quest-description").textContent = "The Bloodhorn is dead. The old road is quiet—for now.";
      $("tip-text").textContent = "The old road is quiet. For now.";
    }
    renderUI();
  }

  function spawnBoss() {
    state.bossSpawned = true;
    const boss = makeEnemy("bloodhorn", 1990, 640);
    boss.aggro = true;
    boss.attackTimer = 1.5;
    state.enemies.push(boss);
    $("boss-banner").classList.add("visible");
    $("quest-description").textContent = "Something massive stirs beyond the old road. Put an end to it.";
    $("tip-text").textContent = "A great shadow has risen at the end of the old road.";
    showToast("THE BLOODHORN EMERGES FROM THE OLD ROAD");
    addJournal("The Bloodhorn has emerged beyond the old road.");
    playSound(78, .65, "sawtooth", .08);
  }

  function attack() {
    if (!state.started || state.paused || state.panel || state.dead || state.complete) return;
    const player = state.player;
    const target = state.target && !state.target.dead ? state.target : nearestEnemy(player, 235);
    if (!target) {
      showToast("NO HOSTILE IN SIGHT");
      return;
    }
    state.target = target;
    const d = distance(player, target);
    if (d > 53) {
      state.moveTarget = { x: target.x, y: target.y };
      return;
    }
    player.facing = Math.atan2(target.y - player.y, target.x - player.x);
    player.attackFlash = .2;
    const damage = state.attack * rand(.9, 1.12);
    damageEnemy(target, damage);
    playSound(255 + Math.random() * 70, .07, "triangle", .035);
    player.attackTimer = .44;
  }

  function nearestEnemy(origin, range = Infinity) {
    let closest = null;
    let closestDist = range;
    for (const enemy of state.enemies) {
      if (enemy.dead) continue;
      const d = distance(origin, enemy);
      if (d < closestDist) { closestDist = d; closest = enemy; }
    }
    return closest;
  }

  function castBolt() {
    if (!canAct()) return;
    if (state.cooldowns.bolt > 0) return showToast("EMBER BOLT IS NOT READY");
    if (state.mana < 8) return showToast("NOT ENOUGH SPIRIT");
    state.mana -= 8;
    state.cooldowns.bolt = .7;
    const enemy = state.target && !state.target.dead ? state.target : nearestEnemy(state.player, 460);
    const aim = enemy ? Math.atan2(enemy.y - state.player.y, enemy.x - state.player.x) : state.player.facing;
    state.player.facing = aim;
    state.projectiles.push({ x: state.player.x + Math.cos(aim) * 20, y: state.player.y + Math.sin(aim) * 20, vx: Math.cos(aim) * 430, vy: Math.sin(aim) * 430, life: 1.1, damage: 23 + state.level * 3, kind: "ember", radius: 9 });
    state.player.attackFlash = .16;
    playSound(490, .13, "sawtooth", .04);
    renderUI();
  }

  function castSpin() {
    if (!canAct()) return;
    if (state.cooldowns.spin > 0) return showToast("WHIRLWIND IS NOT READY");
    if (state.mana < 16) return showToast("NOT ENOUGH SPIRIT");
    state.mana -= 16;
    state.cooldowns.spin = 3.5;
    state.player.attackFlash = .48;
    const targets = state.enemies.filter((enemy) => !enemy.dead && distance(state.player, enemy) < 95);
    targets.forEach((enemy) => damageEnemy(enemy, (state.attack + 13) * rand(.92, 1.08), "#f4dcab"));
    for (let i = 0; i < 22; i++) {
      const angle = (Math.PI * 2 * i) / 22;
      state.particles.push({ x: state.player.x + Math.cos(angle) * 54, y: state.player.y + Math.sin(angle) * 54, vx: Math.cos(angle) * 35, vy: Math.sin(angle) * 35, life: .36, color: i % 2 ? "#d8c48e" : "#d48a55", size: 2 });
    }
    playSound(205, .23, "sawtooth", .055);
    renderUI();
  }

  function evade() {
    if (!canAct()) return;
    const p = state.player;
    let dx = 0, dy = 0;
    if (state.keys.has("KeyW") || state.keys.has("ArrowUp")) dy--;
    if (state.keys.has("KeyS") || state.keys.has("ArrowDown")) dy++;
    if (state.keys.has("KeyA") || state.keys.has("ArrowLeft")) dx--;
    if (state.keys.has("KeyD") || state.keys.has("ArrowRight")) dx++;
    if (dx === 0 && dy === 0) { dx = Math.cos(p.facing); dy = Math.sin(p.facing); }
    const mag = Math.hypot(dx, dy) || 1;
    p.x = clamp(p.x + (dx / mag) * 105, 20, WORLD.width - 20);
    p.y = clamp(p.y + (dy / mag) * 105, 20, WORLD.height - 20);
    p.facing = Math.atan2(dy, dx);
    p.rollTime = .32;
    p.invulnerable = .42;
    state.moveTarget = null;
    playSound(160, .11, "triangle", .04);
  }

  function drinkPotion() {
    if (!state.started || state.paused || state.panel || state.dead) return;
    if (state.potions < 1) return showToast("YOUR BELT IS EMPTY");
    if (state.health >= state.maxHealth) return showToast("YOU ARE ALREADY AT FULL HEALTH");
    state.potions--;
    const restored = Math.min(48 + state.level * 4, state.maxHealth - state.health);
    state.health += restored;
    state.texts.push({ x: state.player.x, y: state.player.y - 35, text: `+${Math.ceil(restored)}`, color: "#8fc185", life: .9, vy: -26 });
    showToast("HEALTH RESTORED");
    playSound(510, .21, "sine", .055);
    renderUI();
  }

  function canAct() { return state.started && !state.paused && !state.panel && !state.dead && !state.complete; }

  function damagePlayer(amount, fromX, fromY) {
    if (state.player.invulnerable > 0 || state.dead) return;
    const damage = Math.max(2, Math.ceil(amount - state.defense * .42));
    state.health = Math.max(0, state.health - damage);
    state.player.hurtFlash = .22;
    state.player.invulnerable = .45;
    state.texts.push({ x: state.player.x, y: state.player.y - 30, text: `-${damage}`, color: "#e87966", life: .8, vy: -25 });
    if (fromX !== undefined) {
      const angle = Math.atan2(state.player.y - fromY, state.player.x - fromX);
      state.player.x = clamp(state.player.x + Math.cos(angle) * 12, 20, WORLD.width - 20);
      state.player.y = clamp(state.player.y + Math.sin(angle) * 12, 20, WORLD.height - 20);
    }
    playSound(100, .13, "square", .04);
    renderUI();
    if (state.health <= 0) fallInBattle();
  }

  function fallInBattle() {
    state.dead = true;
    $("pause-overlay").hidden = false;
    $("pause-overlay").querySelector("small").textContent = "THE MOOR CLAIMED YOU";
    $("pause-overlay").querySelector("h2").textContent = "FALLEN";
    $("resume-button").textContent = "RISE AND RETURN  →";
    $("resume-button").querySelector("span")?.remove();
  }

  function revive() {
    state.dead = false;
    state.paused = false;
    state.health = Math.ceil(state.maxHealth * .55);
    state.mana = Math.ceil(state.maxMana * .5);
    state.player.x = 220;
    state.player.y = 730;
    state.player.invulnerable = 2;
    state.target = null;
    state.moveTarget = null;
    state.gold = Math.floor(state.gold * .9);
    $("pause-overlay").hidden = true;
    $("pause-overlay").querySelector("small").textContent = "THE MOOR WAITS";
    $("pause-overlay").querySelector("h2").textContent = "PAUSED";
    $("resume-button").innerHTML = "RETURN TO THE MOOR <span>→</span>";
    showToast("YOU RETURN TO THE ENCAMPMENT");
    renderUI();
  }

  function togglePause() {
    if (!state.started || state.panel || state.dead) return;
    state.paused = !state.paused;
    $("pause-overlay").hidden = !state.paused;
  }

  function doMove(delta) {
    const p = state.player;
    let dx = 0, dy = 0;
    if (state.keys.has("KeyW") || state.keys.has("ArrowUp")) dy--;
    if (state.keys.has("KeyS") || state.keys.has("ArrowDown")) dy++;
    if (state.keys.has("KeyA") || state.keys.has("ArrowLeft")) dx--;
    if (state.keys.has("KeyD") || state.keys.has("ArrowRight")) dx++;
    if (dx || dy) {
      state.moveTarget = null;
      const mag = Math.hypot(dx, dy);
      dx /= mag; dy /= mag;
      p.x += dx * p.speed * delta;
      p.y += dy * p.speed * delta;
      p.facing = Math.atan2(dy, dx);
    } else if (state.moveTarget) {
      dx = state.moveTarget.x - p.x;
      dy = state.moveTarget.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 7) state.moveTarget = null;
      else {
        dx /= d; dy /= d;
        p.x += dx * p.speed * delta;
        p.y += dy * p.speed * delta;
        p.facing = Math.atan2(dy, dx);
      }
    }
    p.x = clamp(p.x, 18, WORLD.width - 18);
    p.y = clamp(p.y, 18, WORLD.height - 18);
  }

  function update(delta) {
    if (state.toastTimer > 0) {
      state.toastTimer -= delta;
      if (state.toastTimer <= 0) $("toast").classList.remove("visible");
    }
    if (!state.started || state.paused || state.panel || state.dead) return;
    state.elapsed += delta;
    const p = state.player;
    p.attackTimer = Math.max(0, p.attackTimer - delta);
    p.attackFlash = Math.max(0, p.attackFlash - delta);
    p.rollTime = Math.max(0, p.rollTime - delta);
    p.invulnerable = Math.max(0, p.invulnerable - delta);
    p.hurtFlash = Math.max(0, p.hurtFlash - delta);
    state.cooldowns.bolt = Math.max(0, state.cooldowns.bolt - delta);
    state.cooldowns.spin = Math.max(0, state.cooldowns.spin - delta);
    state.mana = Math.min(state.maxMana, state.mana + delta * 3.5);
    doMove(delta);

    if (state.target?.dead) state.target = null;
    if (state.target) {
      const d = distance(p, state.target);
      if (d > 53) {
        const angle = Math.atan2(state.target.y - p.y, state.target.x - p.x);
        p.facing = angle;
        p.x += Math.cos(angle) * p.speed * delta;
        p.y += Math.sin(angle) * p.speed * delta;
      } else if (p.attackTimer <= 0) attack();
      p.x = clamp(p.x, 18, WORLD.width - 18);
      p.y = clamp(p.y, 18, WORLD.height - 18);
    }

    for (const enemy of state.enemies) {
      if (enemy.dead) continue;
      enemy.hurt = Math.max(0, enemy.hurt - delta);
      enemy.attackTimer -= delta;
      const d = distance(enemy, p);
      const aggroRadius = enemy.kind === "bloodhorn" ? 850 : enemy.kind === "shaman" ? 295 : 235;
      if (d < aggroRadius) enemy.aggro = true;
      if (!enemy.aggro) continue;
      const range = enemy.kind === "shaman" ? 208 : enemy.kind === "bloodhorn" ? 60 : 39;
      if (d > range) {
        const angle = Math.atan2(p.y - enemy.y, p.x - enemy.x);
        enemy.x += Math.cos(angle) * enemy.speed * delta;
        enemy.y += Math.sin(angle) * enemy.speed * delta;
      } else if (enemy.attackTimer <= 0) {
        enemy.attackTimer = enemy.kind === "bloodhorn" ? 1.15 : enemy.kind === "shaman" ? 1.75 : 1.18;
        if (enemy.kind === "shaman") {
          const angle = Math.atan2(p.y - enemy.y, p.x - enemy.x);
          state.projectiles.push({ x: enemy.x, y: enemy.y - 8, vx: Math.cos(angle) * 205, vy: Math.sin(angle) * 205, life: 2, damage: enemy.damage, kind: "curse", radius: 7 });
          playSound(130, .08, "sine", .025);
        } else {
          state.texts.push({ x: p.x + rand(-4, 4), y: p.y - 31, text: "", color: "#e77260", life: .22, vy: -8 });
          damagePlayer(enemy.damage, enemy.x, enemy.y);
        }
      }
    }
    updateProjectiles(delta);
    updateEffects(delta);
    updateCamera();
    if (Math.floor(state.elapsed * 4) !== Math.floor((state.elapsed - delta) * 4)) renderUI();
  }

  function updateProjectiles(delta) {
    for (const projectile of state.projectiles) {
      projectile.x += projectile.vx * delta;
      projectile.y += projectile.vy * delta;
      projectile.life -= delta;
      if (projectile.kind === "ember") {
        for (const enemy of state.enemies) {
          if (!enemy.dead && Math.hypot(projectile.x - enemy.x, projectile.y - enemy.y) < enemy.radius + projectile.radius) {
            damageEnemy(enemy, projectile.damage, "#ffbb76");
            projectile.life = 0;
            break;
          }
        }
      } else if (Math.hypot(projectile.x - state.player.x, projectile.y - state.player.y) < 24) {
        damagePlayer(projectile.damage, projectile.x, projectile.y);
        projectile.life = 0;
      }
    }
    state.projectiles = state.projectiles.filter((projectile) => projectile.life > 0);
  }

  function updateEffects(delta) {
    for (const text of state.texts) { text.life -= delta; text.y += text.vy * delta; }
    state.texts = state.texts.filter((text) => text.life > 0);
    for (const particle of state.particles) { particle.life -= delta; particle.x += particle.vx * delta; particle.y += particle.vy * delta; particle.vx *= .96; particle.vy += 24 * delta; }
    state.particles = state.particles.filter((particle) => particle.life > 0);
    for (const drop of state.drops) drop.age += delta;
  }

  function updateCamera() {
    state.camera.x = clamp(state.player.x - W / 2, 0, WORLD.width - W);
    state.camera.y = clamp(state.player.y - H / 2, 0, WORLD.height - H);
    $("coordinates").textContent = `WILDS · ${String(Math.floor(state.player.x / 100)).padStart(2, "0")}, ${String(Math.floor(state.player.y / 100)).padStart(2, "0")}`;
  }

  function render() {
    const camera = state.camera;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#3c4034");
    sky.addColorStop(.45, "#555342");
    sky.addColorStop(1, "#302f27");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(-camera.x, -camera.y);
    drawRoad();
    for (const prop of environment) if (prop.type === "tuft" && onScreen(prop.x, prop.y, 20)) drawTuft(prop);
    for (const prop of environment) if (prop.type !== "tuft" && onScreen(prop.x, prop.y, 80)) drawProp(prop);
    drawSceneryMarkers();
    const objects = [];
    state.enemies.forEach((enemy) => { if (!enemy.dead && onScreen(enemy.x, enemy.y, 70)) objects.push({ y: enemy.y, draw: () => drawEnemy(enemy) }); });
    state.drops.forEach((drop) => { if (onScreen(drop.x, drop.y, 24)) objects.push({ y: drop.y, draw: () => drawDrop(drop) }); });
    objects.push({ y: state.player.y, draw: () => drawPlayer() });
    objects.sort((a, b) => a.y - b.y).forEach((object) => object.draw());
    state.projectiles.forEach(drawProjectile);
    state.particles.forEach(drawParticle);
    state.texts.forEach(drawText);
    ctx.restore();
    drawAtmosphere();
    drawMinimap();
    updateSkillStates();
    requestAnimationFrame(render);
  }

  function onScreen(x, y, pad = 0) {
    return x > state.camera.x - pad && x < state.camera.x + W + pad && y > state.camera.y - pad && y < state.camera.y + H + pad;
  }

  function drawRoad() {
    const points = [[0, 745], [330, 730], [500, 690], [730, 565], [1030, 570], [1220, 615], [1420, 700], [1730, 716], [1980, 680], [2240, 620]];
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length - 1; i++) { const mx = (points[i][0] + points[i + 1][0]) / 2; const my = (points[i][1] + points[i + 1][1]) / 2; ctx.quadraticCurveTo(points[i][0], points[i][1], mx, my); }
    ctx.lineTo(points.at(-1)[0], points.at(-1)[1]);
    ctx.strokeStyle = "#24251f"; ctx.lineWidth = 170; ctx.stroke();
    ctx.strokeStyle = "#7d7860"; ctx.lineWidth = 151; ctx.stroke();
    ctx.strokeStyle = "#91876c"; ctx.lineWidth = 134; ctx.stroke();
    ctx.globalAlpha = .26; ctx.strokeStyle = "#514f40"; ctx.lineWidth = 118; ctx.stroke(); ctx.globalAlpha = 1;
    ctx.setLineDash([2, 19]); ctx.strokeStyle = "#aea180"; ctx.globalAlpha = .2; ctx.lineWidth = 3; ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  }

  function drawTuft(prop) {
    ctx.save(); ctx.translate(prop.x, prop.y); ctx.globalAlpha = .28 + prop.tint * .32;
    ctx.strokeStyle = prop.tint > .6 ? "#a09a6f" : "#272d21"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-prop.size, -prop.size * 2); ctx.moveTo(1, 0); ctx.lineTo(prop.size * .6, -prop.size * 1.7); ctx.moveTo(0, 0); ctx.lineTo(prop.size * 1.1, -prop.size * 1.2); ctx.stroke(); ctx.restore();
  }

  function drawProp(prop) {
    ctx.save(); ctx.translate(prop.x, prop.y); ctx.rotate(prop.rotation);
    if (prop.type === "tree") {
      const s = prop.size;
      ctx.fillStyle = "#171a15aa"; ctx.beginPath(); ctx.ellipse(7, 3, s * .72, s * .34, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#3a3024"; ctx.fillRect(-4, -s * .55, 8, s * .62);
      const g = ctx.createRadialGradient(-s * .18, -s * .7, 2, 0, -s * .65, s);
      g.addColorStop(0, prop.tint > .5 ? "#73704d" : "#5a6045"); g.addColorStop(.55, prop.tint > .5 ? "#3e4938" : "#394333"); g.addColorStop(1, "#20271f");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(-s * .9, -s * .62); ctx.lineTo(-s * .65, -s * 1.28); ctx.lineTo(-s * .24, -s * 1.02); ctx.lineTo(0, -s * 1.62); ctx.lineTo(s * .3, -s * 1.03); ctx.lineTo(s * .82, -s * 1.33); ctx.lineTo(s * .9, -s * .61); ctx.lineTo(s * .64, -s * .12); ctx.lineTo(-s * .58, -s * .12); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#99906b30"; ctx.lineWidth = 1; ctx.stroke();
    } else if (prop.type === "shrub") {
      ctx.fillStyle = "#272a20"; ctx.beginPath(); ctx.ellipse(0, 0, prop.size, prop.size * .5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = prop.tint > .5 ? "#6a6241" : "#434735";
      for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(Math.cos(i * 1.35) * prop.size * .45, -prop.size * .18 + Math.sin(i * 1.4) * 3, prop.size * .36, 0, Math.PI * 2); ctx.fill(); }
    } else {
      ctx.fillStyle = "#242620"; ctx.beginPath(); ctx.ellipse(3, 3, prop.size * .9, prop.size * .48, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = prop.tint > .5 ? "#8b826b" : "#5c6058"; ctx.beginPath(); ctx.moveTo(-prop.size, 0); ctx.lineTo(-prop.size * .55, -prop.size * .65); ctx.lineTo(prop.size * .25, -prop.size * .75); ctx.lineTo(prop.size, -.1 * prop.size); ctx.lineTo(prop.size * .52, prop.size * .32); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#b7aa8a55"; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
  }

  function drawSceneryMarkers() {
    // A broken wagon marks the road's middle; pale stones lead toward the Bloodhorn.
    const wag = { x: 1090, y: 618 };
    if (onScreen(wag.x, wag.y, 100)) {
      ctx.save(); ctx.translate(wag.x, wag.y); ctx.rotate(-.18);
      ctx.fillStyle = "#28221c"; ctx.fillRect(-33, -30, 66, 18); ctx.strokeStyle = "#7d6543"; ctx.lineWidth = 3; ctx.strokeRect(-33, -30, 66, 18);
      ctx.strokeStyle = "#473a2b"; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(-21, -5, 11, 0, Math.PI * 2); ctx.arc(23, -4, 11, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "#743b31"; ctx.globalAlpha = .45; ctx.beginPath(); ctx.ellipse(39, 1, 19, 5, -.2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    if (state.bossSpawned && onScreen(1990, 640, 140)) {
      ctx.save(); ctx.globalAlpha = .19 + Math.sin(state.elapsed * 2) * .04; ctx.fillStyle = "#813c32"; ctx.beginPath(); ctx.ellipse(1990, 650, 112, 55, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }

  function drawShadow(x, y, rx, ry) {
    ctx.fillStyle = "#11130fc2"; ctx.beginPath(); ctx.ellipse(x + 3, y + 5, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  }

  function drawPlayer() {
    const p = state.player;
    const bob = Math.sin(state.elapsed * 9) * (state.moveTarget || state.keys.size ? 1.6 : .4);
    drawShadow(p.x, p.y, 18, 8);
    ctx.save(); ctx.translate(p.x, p.y + bob);
    if (p.invulnerable > 0 && Math.floor(state.elapsed * 16) % 2) ctx.globalAlpha = .6;
    if (p.rollTime > 0) ctx.rotate(p.facing + Math.PI / 2);
    if (p.hurtFlash > 0) ctx.globalAlpha = .64;
    // boots and travel-worn cloak
    ctx.fillStyle = "#22201d"; ctx.fillRect(-9, -2, 6, 12); ctx.fillRect(3, -2, 6, 12);
    const cloak = ctx.createLinearGradient(-12, -19, 13, 8); cloak.addColorStop(0, "#b09a72"); cloak.addColorStop(.55, "#675a43"); cloak.addColorStop(1, "#352e26");
    ctx.fillStyle = cloak; ctx.beginPath(); ctx.moveTo(-12, -11); ctx.quadraticCurveTo(-15, -2, -11, 9); ctx.lineTo(0, 6); ctx.lineTo(11, 9); ctx.quadraticCurveTo(15, -3, 10, -12); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#d4bc8b66"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = "#beaa86"; ctx.beginPath(); ctx.ellipse(0, -15, 8, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#38302a"; ctx.beginPath(); ctx.moveTo(-9, -16); ctx.quadraticCurveTo(0, -31, 10, -16); ctx.lineTo(7, -13); ctx.lineTo(-7, -13); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#d6b47d"; ctx.fillRect(1, -17, 5, 1);
    ctx.save(); ctx.translate(6, -6); ctx.rotate(p.facing + (p.attackFlash > 0 ? -0.8 : .55));
    ctx.strokeStyle = "#d4bd8c"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -22); ctx.stroke();
    ctx.strokeStyle = "#8f7751"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-4, -12); ctx.lineTo(4, -12); ctx.stroke();
    ctx.fillStyle = "#c6b58f"; ctx.beginPath(); ctx.moveTo(0, -31); ctx.lineTo(4, -20); ctx.lineTo(0, -17); ctx.lineTo(-4, -20); ctx.closePath(); ctx.fill(); ctx.restore();
    if (p.attackFlash > 0) {
      ctx.strokeStyle = `rgba(227,202,145,${p.attackFlash * 3})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -3, 28, p.facing - .8, p.facing + .8); ctx.stroke();
    }
    ctx.restore();
    if (p.hurtFlash > 0) { ctx.fillStyle = `rgba(190,52,42,${p.hurtFlash * .38})`; ctx.beginPath(); ctx.arc(p.x, p.y - 11, 23, 0, Math.PI * 2); ctx.fill(); }
  }

  function drawEnemy(enemy) {
    const { x, y, radius, kind } = enemy;
    const bob = Math.sin(state.elapsed * 5 + enemy.bob) * 1.2;
    drawShadow(x, y, radius * 1.1, radius * .45);
    if (state.target === enemy) {
      ctx.strokeStyle = "#d3b76d"; ctx.lineWidth = 1.4; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.ellipse(x, y + 4, radius + 8, radius * .52 + 5, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#dcc790"; ctx.beginPath(); ctx.arc(x, y - radius - 34, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.save(); ctx.translate(x, y + bob);
    if (enemy.hurt > 0) ctx.globalAlpha = .55;
    if (kind === "fallen") drawFallen(enemy);
    else if (kind === "skeleton") drawSkeleton(enemy);
    else if (kind === "shaman") drawShaman(enemy);
    else drawBloodhorn(enemy);
    ctx.restore();
    if (kind === "bloodhorn") {
      ctx.fillStyle = "#160f0d"; ctx.fillRect(x - 57, y - radius - 28, 114, 6);
      ctx.fillStyle = "#a7463a"; ctx.fillRect(x - 56, y - radius - 27, 112 * clamp(enemy.hp / enemy.maxHp, 0, 1), 4);
      ctx.textAlign = "center"; ctx.font = "700 13px 'Barlow Condensed', sans-serif"; ctx.fillStyle = "#e6d5bd"; ctx.fillText("THE BLOODHORN", x, y - radius - 36);
    } else if (state.target === enemy || enemy.hp < enemy.maxHp) {
      ctx.fillStyle = "#171411"; ctx.fillRect(x - 20, y - radius - 12, 40, 4);
      ctx.fillStyle = kind === "skeleton" ? "#c9b88d" : "#b75245"; ctx.fillRect(x - 19, y - radius - 11, 38 * clamp(enemy.hp / enemy.maxHp, 0, 1), 2);
      if (state.target === enemy) { ctx.textAlign = "center"; ctx.font = "10px 'DM Sans', sans-serif"; ctx.fillStyle = "#ded2c1"; ctx.fillText(enemy.name, x, y - radius - 17); }
    }
  }

  function drawFallen(enemy) {
    const x = 0, y = 0, r = enemy.radius;
    ctx.fillStyle = "#3b2824"; ctx.fillRect(-7, 0, 5, 11); ctx.fillRect(3, 0, 5, 11);
    const body = ctx.createLinearGradient(-r, -r, r, 6); body.addColorStop(0, "#c16653"); body.addColorStop(1, "#79362f");
    ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, -7, r * .78, r * .9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ad7660"; ctx.beginPath(); ctx.arc(0, -18, r * .52, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#c74434"; ctx.beginPath(); ctx.arc(-4, -19, 1.6, 0, Math.PI * 2); ctx.arc(4, -19, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#332820"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(7, -7); ctx.lineTo(15, 3); ctx.stroke();
  }

  function drawSkeleton(enemy) {
    ctx.strokeStyle = "#b7aa8d"; ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-7, -2); ctx.lineTo(-9, 8); ctx.moveTo(6, -2); ctx.lineTo(8, 8); ctx.moveTo(-10, -4); ctx.lineTo(10, -4); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.moveTo(-9, -1); ctx.lineTo(-14, 4); ctx.moveTo(8, -1); ctx.lineTo(14, 3); ctx.stroke();
    ctx.fillStyle = "#c9bca0"; ctx.beginPath(); ctx.arc(0, -16, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#27251f"; ctx.beginPath(); ctx.arc(-3, -16, 1.7, 0, Math.PI * 2); ctx.arc(3, -16, 1.7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#443d30"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-3, -11); ctx.lineTo(3, -11); ctx.stroke();
    ctx.strokeStyle = "#a59372"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(13, -1); ctx.lineTo(13, -26); ctx.stroke();
  }

  function drawShaman() {
    ctx.fillStyle = "#342e2a"; ctx.beginPath(); ctx.moveTo(-13, -4); ctx.lineTo(-9, -23); ctx.lineTo(0, -28); ctx.lineTo(10, -23); ctx.lineTo(14, -4); ctx.lineTo(0, 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#8f5847"; ctx.beginPath(); ctx.ellipse(0, -15, 8, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#261b17"; ctx.beginPath(); ctx.moveTo(-10, -18); ctx.lineTo(0, -30); ctx.lineTo(11, -18); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#d58259"; ctx.beginPath(); ctx.arc(0, -15, 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#684f37"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(14, -3); ctx.lineTo(19, -31); ctx.stroke();
    ctx.fillStyle = "#c89657"; ctx.beginPath(); ctx.arc(19, -32, 4, 0, Math.PI * 2); ctx.fill();
  }

  function drawBloodhorn() {
    ctx.fillStyle = "#372622"; ctx.fillRect(-16, 5, 11, 17); ctx.fillRect(7, 5, 11, 17);
    const body = ctx.createLinearGradient(-28, -24, 26, 18); body.addColorStop(0, "#a95243"); body.addColorStop(.55, "#71352f"); body.addColorStop(1, "#392522");
    ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(-25, 7); ctx.lineTo(-22, -21); ctx.lineTo(-11, -30); ctx.lineTo(10, -29); ctx.lineTo(24, -18); ctx.lineTo(28, 10); ctx.lineTo(14, 17); ctx.lineTo(-13, 17); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#bd8061"; ctx.beginPath(); ctx.ellipse(0, -33, 13, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#a14437"; ctx.beginPath(); ctx.moveTo(-11, -39); ctx.lineTo(-27, -60); ctx.lineTo(-23, -34); ctx.lineTo(-11, -30); ctx.moveTo(11, -39); ctx.lineTo(28, -59); ctx.lineTo(24, -33); ctx.lineTo(11, -29); ctx.fill();
    ctx.fillStyle = "#eab16d"; ctx.beginPath(); ctx.arc(-5, -34, 2.2, 0, Math.PI * 2); ctx.arc(6, -34, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#2c1a18"; ctx.beginPath(); ctx.moveTo(-5, -24); ctx.lineTo(0, -21); ctx.lineTo(6, -24); ctx.fill();
    ctx.strokeStyle = "#d09266"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-23, -15); ctx.lineTo(-36, -4); ctx.moveTo(22, -15); ctx.lineTo(34, -7); ctx.stroke();
  }

  function drawDrop(drop) {
    const bob = Math.sin(state.elapsed * 4 + drop.id) * 2;
    const x = drop.x, y = drop.y + bob;
    ctx.globalAlpha = .28; ctx.fillStyle = drop.rarity === "rare" ? "#e1bc61" : drop.type === "gold" ? "#d0ae5d" : "#90a9b1"; ctx.beginPath(); ctx.ellipse(x, y + 3, 17, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    if (drop.type === "gold") {
      ctx.fillStyle = "#d6b55f"; ctx.beginPath(); ctx.ellipse(x, y, 7, 4, -.2, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#ffe39b"; ctx.beginPath(); ctx.arc(x - 2, y - 1, 1.4, 0, Math.PI * 2); ctx.fill();
    } else if (drop.type === "potion") {
      ctx.fillStyle = "#9a423a"; ctx.beginPath(); ctx.moveTo(x - 5, y - 5); ctx.lineTo(x + 5, y - 5); ctx.lineTo(x + 6, y + 4); ctx.lineTo(x + 3, y + 8); ctx.lineTo(x - 4, y + 8); ctx.lineTo(x - 6, y + 4); ctx.closePath(); ctx.fill(); ctx.fillStyle = "#c8b890"; ctx.fillRect(x - 2, y - 9, 4, 4);
    } else {
      ctx.fillStyle = drop.rarity === "rare" ? "#d5ae57" : drop.rarity === "magic" ? "#8aa8d6" : "#c2b7a5";
      ctx.beginPath(); ctx.moveTo(x, y - 10); ctx.lineTo(x + 7, y - 1); ctx.lineTo(x + 4, y + 8); ctx.lineTo(x - 4, y + 8); ctx.lineTo(x - 7, y - 1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#272420"; ctx.font = "9px sans-serif"; ctx.textAlign = "center"; ctx.fillText(drop.glyph, x, y + 3);
    }
    if (distance(state.player, drop) < 74) {
      ctx.font = "8px 'DM Sans', sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "#e8d9b9"; ctx.shadowColor = "#000"; ctx.shadowBlur = 4; ctx.fillText(`${drop.name}  [F]`, x, y - 15); ctx.shadowBlur = 0;
    }
  }

  function drawProjectile(projectile) {
    if (projectile.kind === "ember") {
      const g = ctx.createRadialGradient(projectile.x, projectile.y, 1, projectile.x, projectile.y, 13); g.addColorStop(0, "#fff5bd"); g.addColorStop(.28, "#ffb462"); g.addColorStop(1, "#df462800");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(projectile.x, projectile.y, 13, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = "#ba5948"; ctx.shadowColor = "#e15c46"; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(projectile.x, projectile.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    }
  }

  function drawParticle(particle) {
    ctx.globalAlpha = clamp(particle.life * 3, 0, 1); ctx.fillStyle = particle.color; ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  }

  function drawText(text) {
    if (!text.text) return;
    ctx.globalAlpha = clamp(text.life * 1.8, 0, 1); ctx.font = "700 13px 'Barlow Condensed', sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = text.color; ctx.shadowColor = "#100d0b"; ctx.shadowBlur = 4; ctx.fillText(text.text, text.x, text.y); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }

  function drawAtmosphere() {
    ctx.save();
    const gradient = ctx.createRadialGradient(W * .48, H * .5, 90, W * .48, H * .5, 490);
    gradient.addColorStop(0, "#11120d00"); gradient.addColorStop(.65, "#10110d22"); gradient.addColorStop(1, "#080a08a1");
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, W, H);
    if (state.started && state.elapsed < 4 && !state.paused) {
      ctx.fillStyle = `rgba(9,8,7,${Math.max(0, 1 - state.elapsed / 4) * .35})`; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  function drawMinimap() {
    const mw = mapCanvas.width, mh = mapCanvas.height;
    mapCtx.fillStyle = "#313529"; mapCtx.fillRect(0, 0, mw, mh);
    mapCtx.strokeStyle = "#77745d"; mapCtx.globalAlpha = .62; mapCtx.lineWidth = 11;
    mapCtx.beginPath();
    for (let x = 0; x <= WORLD.width; x += 20) {
      const px = x / WORLD.width * mw, py = roadY(x) / WORLD.height * mh;
      if (x === 0) mapCtx.moveTo(px, py); else mapCtx.lineTo(px, py);
    }
    mapCtx.stroke(); mapCtx.globalAlpha = 1;
    for (const prop of environment) {
      if (prop.type === "tree") { mapCtx.fillStyle = "#1d241c"; mapCtx.fillRect(prop.x / WORLD.width * mw, prop.y / WORLD.height * mh, 2, 2); }
    }
    for (const enemy of state.enemies) {
      if (enemy.dead) continue;
      mapCtx.fillStyle = enemy.kind === "bloodhorn" ? "#e37458" : "#ba594a";
      mapCtx.beginPath(); mapCtx.arc(enemy.x / WORLD.width * mw, enemy.y / WORLD.height * mh, enemy.kind === "bloodhorn" ? 4 : 2.3, 0, Math.PI * 2); mapCtx.fill();
    }
    for (const drop of state.drops) {
      mapCtx.fillStyle = drop.type === "gold" ? "#d5bd6c" : "#a5b5b8";
      mapCtx.fillRect(drop.x / WORLD.width * mw - 1, drop.y / WORLD.height * mh - 1, 2, 2);
    }
    mapCtx.fillStyle = "#e4d5ad"; mapCtx.beginPath(); mapCtx.arc(state.player.x / WORLD.width * mw, state.player.y / WORLD.height * mh, 3.2, 0, Math.PI * 2); mapCtx.fill();
    mapCtx.strokeStyle = "#f2e5c188"; mapCtx.lineWidth = 1; mapCtx.beginPath(); mapCtx.arc(state.player.x / WORLD.width * mw, state.player.y / WORLD.height * mh, 6, 0, Math.PI * 2); mapCtx.stroke();
  }

  function updateSkillStates() {
    $("skill-bolt").classList.toggle("cooling", state.cooldowns.bolt > 0 || state.mana < 8);
    $("skill-spin").classList.toggle("cooling", state.cooldowns.spin > 0 || state.mana < 16);
  }

  function playSound(frequency, duration, type = "sine", volume = .04) {
    if (!state.sound) return;
    try {
      if (!state.audio) state.audio = new (window.AudioContext || window.webkitAudioContext)();
      if (state.audio.state === "suspended") state.audio.resume();
      const oscillator = state.audio.createOscillator();
      const gain = state.audio.createGain();
      oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, state.audio.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(35, frequency * .63), state.audio.currentTime + duration);
      gain.gain.setValueAtTime(volume, state.audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, state.audio.currentTime + duration);
      oscillator.connect(gain); gain.connect(state.audio.destination); oscillator.start(); oscillator.stop(state.audio.currentTime + duration);
    } catch (_) { /* Audio is an optional browser capability. */ }
  }

  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * W / rect.width, y: (event.clientY - rect.top) * H / rect.height };
  }

  function pointerDown(event) {
    if (event.button !== 0 || !state.started || state.panel || state.paused || state.dead) return;
    const point = pointerPosition(event);
    state.mouse = point;
    const worldPoint = { x: point.x + state.camera.x, y: point.y + state.camera.y };
    const enemy = state.enemies.filter((entry) => !entry.dead && distance(worldPoint, entry) < entry.radius + 13).sort((a, b) => distance(worldPoint, a) - distance(worldPoint, b))[0];
    const drop = state.drops.find((entry) => distance(worldPoint, entry) < 19);
    if (enemy) {
      state.target = enemy;
      state.moveTarget = null;
      if (distance(state.player, enemy) < 53 && state.player.attackTimer <= 0) attack();
    } else if (drop && distance(state.player, drop) < 72) {
      collectLoot();
    } else {
      state.target = null;
      state.moveTarget = worldPoint;
    }
  }

  function keyDown(event) {
    const code = event.code;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(code)) event.preventDefault();
    state.keys.add(code);
    if (event.repeat) return;
    if (code === "Escape") {
      if (state.panel) setPanel(false);
      else if (state.paused) togglePause();
      else togglePause();
    } else if (code === "KeyI") {
      if (state.started) setPanel(!state.panel, "inventory");
    } else if (code === "KeyC") {
      if (state.started) setPanel(!state.panel, "character");
    } else if (code === "KeyF") collectLoot();
    else if (code === "KeyQ") castBolt();
    else if (code === "KeyE") castSpin();
    else if (code === "KeyR") drinkPotion();
    else if (code === "Space") evade();
  }

  function keyUp(event) { state.keys.delete(event.code); }

  $("start-button").addEventListener("click", startGame);
  $("resume-button").addEventListener("click", () => state.dead ? revive() : togglePause());
  $("close-panel").addEventListener("click", () => setPanel(false));
  $("panel-backdrop").addEventListener("click", () => setPanel(false));
  document.querySelectorAll("[data-panel-tab]").forEach((button) => button.addEventListener("click", () => setPanel(true, button.dataset.panelTab)));
  $("open-character").addEventListener("click", () => setPanel(true, "character"));
  $("open-inventory").addEventListener("click", () => setPanel(true, "inventory"));
  $("mobile-inventory").addEventListener("click", () => setPanel(true, "inventory"));
  $("help-button").addEventListener("click", () => {
    const hints = $("controls-hint");
    hints.innerHTML = "<span><kbd>WASD</kbd> MOVE</span><span><kbd>CLICK</kbd> MOVE / STRIKE</span><span><kbd>Q</kbd> EMBER BOLT</span><span><kbd>E</kbd> WHIRLWIND</span><span><kbd>SPACE</kbd> EVADE</span><span><kbd>R</kbd> POTION</span><span><kbd>F</kbd> LOOT</span>";
    hints.classList.add("visible");
    clearTimeout(window.__hintTimer);
    window.__hintTimer = setTimeout(() => hints.classList.remove("visible"), 5000);
  });
  $("sound-toggle").addEventListener("click", () => {
    state.sound = !state.sound;
    $("sound-toggle").innerHTML = `♫ <span>Sound ${state.sound ? "on" : "off"}</span>`;
    if (state.sound) playSound(530, .12, "sine", .04);
  });
  $("skill-bolt").addEventListener("click", castBolt);
  $("skill-spin").addEventListener("click", castSpin);
  $("skill-bolt").addEventListener("pointerdown", (event) => event.stopPropagation());
  $("skill-spin").addEventListener("pointerdown", (event) => event.stopPropagation());
  $("game-panel").addEventListener("pointerdown", (event) => event.stopPropagation());
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointermove", (event) => { state.mouse = pointerPosition(event); });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  document.addEventListener("keydown", keyDown);
  document.addEventListener("keyup", keyUp);
  window.addEventListener("blur", () => state.keys.clear());

  function frame(timestamp) {
    if (!state.lastTime) state.lastTime = timestamp;
    const delta = Math.min((timestamp - state.lastTime) / 1000, .04);
    state.lastTime = timestamp;
    update(delta);
    requestAnimationFrame(frame);
  }
  recalculateStats();
  renderUI();
  updateCamera();
  requestAnimationFrame(frame);
  requestAnimationFrame(render);
})();
