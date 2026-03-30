const dom = {
  megaJsonInput: document.getElementById("megaJsonInput"),
  termsCheckbox: document.getElementById("termsCheckbox"),
  loadMegaBtn: document.getElementById("loadMegaBtn"),
  toggleLoaderBtn: document.getElementById("toggleLoaderBtn"),
  loaderSection: document.getElementById("loaderSection"),
  statusText: document.getElementById("statusText"),
  viewer: document.getElementById("viewer"),
  appNav: document.getElementById("appNav"),
  breadcrumbs: document.getElementById("breadcrumbs"),
  routeContent: document.getElementById("routeContent"),
};

const state = {
  megaJson: null,
  model: null,
};

const DEFAULT_OBFUSCATION_KEY = "buzzpoints-default-obfuscation-key-v1";
const packetWords = ["packet", "round"];

function setStatus(message, kind = "info") {
  if (!dom.statusText) {
    return;
  }

  dom.statusText.textContent = message;
  dom.statusText.classList.remove("status-ok", "status-error");
  if (kind === "ok") dom.statusText.classList.add("status-ok");
  if (kind === "error") dom.statusText.classList.add("status-error");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function cleanName(name) {
  if (!name) return "Unknown";
  return String(name).replaceAll(/\(([a-zA-Z0-9]+)\)/g, "").replaceAll("\u00a0", " ").trim();
}

function cleanPacketName(name) {
  if (!name) return "";
  return String(name)
    .replaceAll(".json", "")
    .replaceAll("copy", "")
    .replaceAll(/\((\d+)\)/g, "")
    .trim();
}

function stripTags(value) {
  if (!value) return "";
  return String(value)
    .replace(/(<([^>]+)>)/gi, "")
    .replaceAll(/\&nbsp;/g, " ")
    .replaceAll(/\&amp;/g, "&")
    .trim();
}

function shortenAnswerline(answerline) {
  if (!answerline) return "";
  return String(answerline)
    .split("[")[0]
    .replace(/ *\([^)]*\)/g, "")
    .replaceAll(/\&nbsp;/g, " ")
    .replaceAll(/\&amp;/g, "&")
    .trim();
}

function formatDecimal(value) {
  if (!Number.isFinite(value)) return "0.00";
  return value.toFixed(2);
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "0.0%";
  return `${value.toFixed(1)}%`;
}

function routeLink(path, label) {
  return `<a href="#/${path}">${escapeHtml(label)}</a>`;
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function base64ToBytes(base64String) {
  const binary = atob(base64String);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function xorBytes(inputBytes, keyBytes) {
  const output = new Uint8Array(inputBytes.length);

  for (let i = 0; i < inputBytes.length; i += 1) {
    output[i] = inputBytes[i] ^ keyBytes[i % keyBytes.length];
  }

  return output;
}

function isEncryptedMegaContainer(input) {
  return Boolean(
    input &&
      typeof input === "object" &&
      input.encoding === "xor-base64-v1" &&
      typeof input.payload === "string"
  );
}

function decryptMegaContainer(input) {
  const keyBytes = new TextEncoder().encode(DEFAULT_OBFUSCATION_KEY);

  try {
    const encryptedBytes = base64ToBytes(input.payload);
    const decodedBytes = xorBytes(encryptedBytes, keyBytes);
    const decodedText = new TextDecoder().decode(decodedBytes);
    return JSON.parse(decodedText);
  } catch (error) {
    throw new Error("Unable to decrypt file. This file may be invalid or use an unsupported encoding version.");
  }
}

function toTitleCase(text) {
  return text
    .toLowerCase()
    .split(" ")
    .map((word) => (word ? `${word[0].toUpperCase()}${word.slice(1)}` : ""))
    .join(" ");
}

function parsePacketMetadata(packetName, index) {
  let packetNumber = index;
  let packetDescriptor = "";
  const packetIntegers = (packetName.match(/\d+/g) || []).map((v) => Number(v));
  const cleaned = packetName.toLowerCase();
  const parts = cleaned.split(/[-–—_,.:|\s+]/);

  if (packetWords.some((word) => cleaned.includes(word))) {
    const wordIndex = parts.findIndex((part) => packetWords.some((word) => part.includes(word)));
    packetDescriptor = toTitleCase(parts[wordIndex + 1] || "");
    const candidate = Number((packetDescriptor.match(/\d+/g) || [])[0]);
    if (candidate > 0 && candidate < 25) {
      packetDescriptor = String(candidate);
      packetNumber = candidate;
    }
  } else if (packetIntegers.length > 0) {
    packetNumber = packetIntegers.find((v) => v > 0 && v < 25) || index;
    packetDescriptor = String(packetNumber);
  } else if (packetName.length < 3) {
    packetDescriptor = packetName;
  } else {
    packetDescriptor = String(index);
  }

  return {
    descriptor: packetDescriptor || String(index),
    number: packetNumber,
  };
}

function parseCategoryFromMetadata(metadata) {
  if (!metadata) {
    return {
      category: "Unknown",
      subcategory: "",
      categoryMain: "Unknown",
    };
  }

  const normalized = String(metadata).replaceAll("&gt;", ">");
  let rawCategory = normalized;

  if (normalized.includes(",")) {
    rawCategory = normalized.split(",").slice(1).join(",").trim();
  }

  if (rawCategory.includes(">")) {
    rawCategory = rawCategory.split(">")[0].trim();
  }

  rawCategory = rawCategory.replace(/Editor:.*/i, "").trim();

  const parts = rawCategory.split(" - ").map((part) => part.trim()).filter(Boolean);
  const category = parts[0] || "Unknown";
  const subcategory = parts[1] || "";

  return {
    category,
    subcategory,
    categoryMain: subcategory ? `${category} - ${subcategory}` : category,
  };
}

function inferRoundNumber(fileName, fallback) {
  const match = String(fileName || "").match(/round[_\s-]*(\d+)/i);
  if (match) return Number(match[1]);
  return fallback;
}

async function parseJsonFile(file) {
  const text = await file.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON in ${file.name}: ${error.message}`);
  }
}

function normalizeMegaJson(input) {
  if (!input || typeof input !== "object") {
    throw new Error("Mega JSON must be an object.");
  }

  const packets = Array.isArray(input.packets) ? input.packets : [];
  const qbjs = Array.isArray(input.qbjs) ? input.qbjs : [];

  if (!packets.length || !qbjs.length) {
    throw new Error("Mega JSON must include non-empty packets[] and qbjs[] arrays.");
  }

  return {
    schemaVersion: input.schemaVersion || 1,
    createdAt: input.createdAt || new Date().toISOString(),
    tournamentName: input.tournamentName || "",
    questionSetName: input.questionSetName || "",
    roundPacketMap: input.roundPacketMap && typeof input.roundPacketMap === "object" ? input.roundPacketMap : {},
    location: input.location || "",
    level: input.level || "",
    startDate: input.startDate || "",
    endDate: input.endDate || "",
    difficulty: input.difficulty || "",
    format: input.format || "powers",
    packets,
    qbjs,
  };
}

function buildPacketIndex(packets) {
  const packetList = [];
  const packetByName = new Map();

  packets.forEach((entry, index) => {
    const packetData = entry?.data || entry?.content || entry;
    const packetFileName = entry?.fileName || entry?.name || `Packet-${index + 1}.json`;
    const packetName = cleanPacketName(packetFileName);
    const packetKey = packetName.toLowerCase();
    const metadata = parsePacketMetadata(packetName, index + 1);

    const tossupsByNumber = new Map();
    const bonusesByNumber = new Map();

    (packetData?.tossups || []).forEach((tossup, tossupIndex) => {
      const questionNumber = tossupIndex + 1;
      const answer = tossup?.answer || "";
      const metaInfo = parseCategoryFromMetadata(tossup?.metadata);
      tossupsByNumber.set(questionNumber, {
        questionNumber,
        question: tossup?.question || "",
        answer,
        answerPrimary: shortenAnswerline(stripTags(answer)),
        metadata: tossup?.metadata || "",
        category: metaInfo.category,
        subcategory: metaInfo.subcategory,
        categoryMain: metaInfo.categoryMain,
      });
    });

    (packetData?.bonuses || []).forEach((bonus, bonusIndex) => {
      const metaInfo = parseCategoryFromMetadata(bonus?.metadata);
      bonusesByNumber.set(bonusIndex + 1, {
        questionNumber: bonusIndex + 1,
        leadin: bonus?.leadin || "",
        answers: bonus?.answers || [],
        parts: bonus?.parts || [],
        metadata: bonus?.metadata || "",
        category: metaInfo.category,
        subcategory: metaInfo.subcategory,
        categoryMain: metaInfo.categoryMain,
      });
    });

    const packet = {
      name: packetName,
      key: packetKey,
      descriptor: metadata.descriptor,
      number: metadata.number,
      tossupsByNumber,
      bonusesByNumber,
    };

    packetList.push(packet);
    packetByName.set(packetKey, packet);
  });

  return { packetList, packetByName };
}

function findPacketForGame(rawPacketName, packetIndex, fallbackIndex) {
  if (!packetIndex.packetList.length) return null;

  const cleaned = cleanPacketName(rawPacketName || "").toLowerCase();

  if (cleaned && packetIndex.packetByName.has(cleaned)) {
    return packetIndex.packetByName.get(cleaned);
  }

  if (cleaned) {
    for (const packet of packetIndex.packetList) {
      if (packet.key.includes(cleaned) || cleaned.includes(packet.key)) {
        return packet;
      }
    }

    const guessed = parsePacketMetadata(cleaned, fallbackIndex + 1);
    const byDescriptor = packetIndex.packetList.find((packet) => packet.descriptor.toLowerCase() === guessed.descriptor.toLowerCase());
    if (byDescriptor) return byDescriptor;

    const byNumber = packetIndex.packetList.find((packet) => packet.number === guessed.number);
    if (byNumber) return byNumber;
  }

  return packetIndex.packetList[fallbackIndex % packetIndex.packetList.length] || null;
}

function renderMetricGrid(metrics) {
  return `<div class="metric-grid">${metrics
    .map((metric) => `<article class="metric"><strong>${escapeHtml(metric.value)}</strong><span>${escapeHtml(metric.label)}</span></article>`)
    .join("")}</div>`;
}

function renderTable(columns, rows, options = {}) {
  if (!rows.length) return `<div class="empty-state">No rows available.</div>`;

  const header = columns
    .map((column, index) => `<th data-sort-index="${index}">${escapeHtml(column)}</th>`)
    .join("");
  const body = rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("");
  const defaultSortCol = Number.isFinite(options.defaultSortColumn) ? options.defaultSortColumn : "";
  const defaultSortDir = options.defaultSortDirection === "desc" ? "desc" : "asc";

  return `
    <div class="table-wrap">
      <table class="sortable-table" data-default-sort-col="${defaultSortCol}" data-default-sort-dir="${defaultSortDir}">
        <thead><tr>${header}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

function parseSortableValue(value) {
  const text = String(value || "").trim().toLowerCase();
  const cleaned = text.replaceAll(/,/g, "").replaceAll(/%/g, "");
  if (/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return Number(cleaned);
  }
  return text;
}

function compareSortValues(a, b, direction) {
  const directionMultiplier = direction === "desc" ? -1 : 1;

  if (typeof a.value === "number" && typeof b.value === "number") {
    if (a.value === b.value) {
      return (a.index - b.index) * directionMultiplier;
    }
    return (a.value - b.value) * directionMultiplier;
  }

  const textCompare = String(a.value).localeCompare(String(b.value), undefined, {
    numeric: true,
    sensitivity: "base",
  });

  if (textCompare === 0) {
    return (a.index - b.index) * directionMultiplier;
  }

  return textCompare * directionMultiplier;
}

function sortTable(table, columnIndex, direction) {
  const tbody = table.querySelector("tbody");
  if (!tbody) {
    return;
  }

  const rows = Array.from(tbody.querySelectorAll("tr"));
  const sortableRows = rows.map((row, index) => {
    const cell = row.children[columnIndex];
    const cellText = cell ? cell.textContent : "";
    return {
      row,
      index,
      value: parseSortableValue(cellText),
    };
  });

  sortableRows.sort((a, b) => compareSortValues(a, b, direction));

  tbody.innerHTML = "";
  sortableRows.forEach((item) => tbody.appendChild(item.row));

  table.querySelectorAll("th").forEach((th) => th.classList.remove("sort-asc", "sort-desc"));
  const activeHeader = table.querySelector(`th[data-sort-index="${columnIndex}"]`);
  if (activeHeader) {
    activeHeader.classList.add(direction === "desc" ? "sort-desc" : "sort-asc");
  }

  table.dataset.sortedCol = String(columnIndex);
  table.dataset.sortedDir = direction;
}

function setupSortableTables() {
  const tables = dom.routeContent.querySelectorAll("table.sortable-table");

  tables.forEach((table) => {
    const headers = table.querySelectorAll("th[data-sort-index]");

    headers.forEach((header) => {
      header.addEventListener("click", () => {
        const columnIndex = Number(header.getAttribute("data-sort-index"));
        const isSameColumn = table.dataset.sortedCol === String(columnIndex);
        const nextDirection = isSameColumn && table.dataset.sortedDir === "asc" ? "desc" : "asc";
        sortTable(table, columnIndex, nextDirection);
      });
    });

    const defaultSortCol = table.getAttribute("data-default-sort-col");
    if (defaultSortCol !== null && defaultSortCol !== "") {
      sortTable(table, Number(defaultSortCol), table.getAttribute("data-default-sort-dir") === "desc" ? "desc" : "asc");
    }
  });
}

function parseRoute() {
  const hash = window.location.hash || "#/home";
  const clean = hash.replace(/^#\/?/, "").replace(/\/+$/, "");
  return clean ? clean.split("/") : ["home"];
}

function renderBreadcrumbs(items) {
  dom.breadcrumbs.innerHTML = items
    .map((item, index) => {
      const current = item.path ? routeLink(item.path, item.label) : `<span>${escapeHtml(item.label)}</span>`;
      const sep = index < items.length - 1 ? "<span>/</span>" : "";
      return `${current}${sep}`;
    })
    .join("");
}

function buildModel(megaJson) {
  const packetIndex = buildPacketIndex(megaJson.packets);
  const qbjEntries = megaJson.qbjs.map((entry, index) => ({
    fileName: entry?.fileName || entry?.name || `Game-${index + 1}.qbj`,
    data: entry?.data || entry?.content || entry,
  }));
  const roundPacketMap = megaJson.roundPacketMap || {};

  const tournament = {
    id: 1,
    name: megaJson.tournamentName || "Tournament",
    slug: slugify(megaJson.tournamentName || "tournament"),
    location: megaJson.location || "",
    level: megaJson.level || "",
    startDate: megaJson.startDate || "",
    endDate: megaJson.endDate || "",
  };

  const questionSet = {
    id: 1,
    name: megaJson.questionSetName || megaJson.tournamentName || "Question Set",
    slug: slugify(megaJson.questionSetName || megaJson.tournamentName || "set"),
    difficulty: megaJson.difficulty || "",
    format: megaJson.format || "powers",
  };

  const teams = new Map();
  const players = new Map();
  const tossups = new Map();
  const bonuses = new Map();
  const categories = new Map();
  const rounds = new Set();
  const games = [];
  const gameTeamStats = new Map();
  const playerSlugs = new Set();
  const tossupSlugs = new Set();
  const bonusSlugs = new Set();
  const unmatchedPackets = [];

  function getUniqueSlug(baseSlug, slugSet, fallbackPrefix) {
    const base = baseSlug || `${fallbackPrefix}-${slugSet.size + 1}`;
    let slug = base;
    let i = 2;
    while (slugSet.has(slug)) {
      slug = `${base}-${i}`;
      i += 1;
    }
    slugSet.add(slug);
    return slug;
  }

  function getOrCreateTeam(teamName) {
    const name = cleanName(teamName || "Unknown Team");
    if (!teams.has(name)) {
      teams.set(name, {
        id: teams.size + 1,
        name,
        slug: slugify(name) || `team-${teams.size + 1}`,
        games: new Set(),
        tuh: 0,
        tossupPoints: 0,
        bonusPoints: 0,
        totalPoints: 0,
        bonusesHeard: 0,
        powers: 0,
        superpowers: 0,
        gets: 0,
        negs: 0,
        rebounds: 0,
        firstBuzzes: 0,
        topThreeBuzzes: 0,
        earliestBuzz: null,
        positiveBuzzCount: 0,
        positiveBuzzTotal: 0,
      });
    }
    return teams.get(name);
  }

  function getOrCreatePlayer(teamName, playerName) {
    const cleanTeam = cleanName(teamName || "Unknown Team");
    const cleanPlayer = cleanName(playerName || "Unknown Player");
    const key = `${cleanTeam}::${cleanPlayer}`;

    if (!players.has(key)) {
      players.set(key, {
        id: players.size + 1,
        name: cleanPlayer,
        slug: getUniqueSlug(slugify(cleanPlayer), playerSlugs, "player"),
        teamName: cleanTeam,
        games: new Set(),
        tuh: 0,
        points: 0,
        ppg: 0,
        pp20tuh: 0,
        powers: 0,
        superpowers: 0,
        gets: 0,
        negs: 0,
        rebounds: 0,
        firstBuzzes: 0,
        topThreeBuzzes: 0,
        earliestBuzz: null,
        positiveBuzzCount: 0,
        positiveBuzzTotal: 0,
        buzzes: [],
      });
    }

    return players.get(key);
  }

  function getOrCreateCategory(name) {
    const key = name || "Unknown";
    if (!categories.has(key)) {
      categories.set(key, {
        name: key,
        heard: 0,
        conversions: 0,
        powers: 0,
        superpowers: 0,
        negs: 0,
        positiveBuzzes: 0,
        positiveBuzzTotal: 0,
      });
    }
    return categories.get(key);
  }

  function getOrCreateTossup(packet, questionNumber, tossupInfo) {
    const key = `${packet.key}::${questionNumber}`;
    if (!tossups.has(key)) {
      tossups.set(key, {
        id: tossups.size + 1,
        key,
        slug: getUniqueSlug(slugify(tossupInfo.answerPrimary || ""), tossupSlugs, "tossup"),
        round: 0,
        packetName: packet.name,
        packetDescriptor: packet.descriptor,
        packetNumber: packet.number,
        questionNumber,
        question: tossupInfo.question || "",
        answer: tossupInfo.answer || "",
        answerPrimary: tossupInfo.answerPrimary || "",
        metadata: tossupInfo.metadata || "",
        categoryMain: tossupInfo.categoryMain || "Unknown",
        heard: 0,
        conversions: 0,
        powers: 0,
        superpowers: 0,
        negs: 0,
        firstBuzzes: 0,
        topThreeBuzzes: 0,
        positiveBuzzes: 0,
        positiveBuzzTotal: 0,
        instances: [],
      });
    }
    return tossups.get(key);
  }

  function getOrCreateBonus(packet, questionNumber, bonusInfo) {
    const key = `${packet.key}::${questionNumber}`;
    if (!bonuses.has(key)) {
      const answerSeed = (bonusInfo.answers || []).map((v) => shortenAnswerline(stripTags(v)).slice(0, 25)).join(" ");
      bonuses.set(key, {
        id: bonuses.size + 1,
        key,
        slug: getUniqueSlug(slugify(answerSeed), bonusSlugs, "bonus"),
        round: 0,
        packetName: packet.name,
        packetDescriptor: packet.descriptor,
        packetNumber: packet.number,
        questionNumber,
        leadin: bonusInfo.leadin || "",
        answers: bonusInfo.answers || [],
        parts: bonusInfo.parts || [],
        metadata: bonusInfo.metadata || "",
        categoryMain: bonusInfo.categoryMain || "Unknown",
        heard: 0,
        totalPoints: 0,
        easyGets: 0,
        mediumGets: 0,
        hardGets: 0,
        instances: [],
      });
    }
    return bonuses.get(key);
  }

  qbjEntries.forEach((entry, gameIndex) => {
    const gameData = entry.data;
    const roundNumber = inferRoundNumber(entry.fileName, gameIndex + 1);
    const mappedPacket = roundPacketMap[String(roundNumber)] || roundPacketMap[roundNumber];
    const packet = findPacketForGame(mappedPacket || gameData?.packets, packetIndex, gameIndex);

    if (!packet) {
      unmatchedPackets.push(`${entry.fileName} (round ${roundNumber})`);
      return;
    }

    const matchTeams = (gameData?.match_teams || []).map((item) => item?.team).filter(Boolean);
    if (matchTeams.length < 2) return;

    const teamOneName = cleanName(matchTeams[0]?.name || "Team One");
    const teamTwoName = cleanName(matchTeams[1]?.name || "Team Two");
    const tossupsRead = Number(gameData?.tossups_read) || (gameData?.match_questions || []).length || 20;

    const game = {
      id: games.length + 1,
      round: roundNumber,
      packetName: packet.name,
      packetDescriptor: packet.descriptor,
      tossupsRead,
      teamOneName,
      teamTwoName,
    };

    rounds.add(roundNumber);
    games.push(game);

    const teamOne = getOrCreateTeam(teamOneName);
    const teamTwo = getOrCreateTeam(teamTwoName);
    teamOne.games.add(game.id);
    teamTwo.games.add(game.id);
    teamOne.tuh += tossupsRead;
    teamTwo.tuh += tossupsRead;

    gameTeamStats.set(`${game.id}::${teamOneName}`, {
      gameId: game.id,
      round: roundNumber,
      packetName: packet.name,
      teamName: teamOneName,
      teamSlug: teamOne.slug,
      opponentName: teamTwoName,
      opponentSlug: slugify(teamTwoName),
      tossupsRead,
      tossupPoints: 0,
      bonusPoints: 0,
      powers: 0,
      superpowers: 0,
      gets: 0,
      negs: 0,
    });

    gameTeamStats.set(`${game.id}::${teamTwoName}`, {
      gameId: game.id,
      round: roundNumber,
      packetName: packet.name,
      teamName: teamTwoName,
      teamSlug: teamTwo.slug,
      opponentName: teamOneName,
      opponentSlug: slugify(teamOneName),
      tossupsRead,
      tossupPoints: 0,
      bonusPoints: 0,
      powers: 0,
      superpowers: 0,
      gets: 0,
      negs: 0,
    });

    matchTeams.forEach((teamInfo) => {
      const name = cleanName(teamInfo?.name || "Unknown Team");
      const team = getOrCreateTeam(name);
      team.games.add(game.id);

      (teamInfo?.players || []).forEach((playerInfo) => {
        const player = getOrCreatePlayer(name, playerInfo?.name || "Unknown Player");
        player.games.add(game.id);
      });
    });

    (gameData?.match_questions || []).forEach((matchQuestion, index) => {
      const questionNumber = Number(matchQuestion?.tossup_question?.question_number) || index + 1;
      const tossupInfo = packet.tossupsByNumber.get(questionNumber) || {
        question: "",
        answer: "",
        metadata: "",
        answerPrimary: "",
        categoryMain: "Unknown",
      };

      const tossup = getOrCreateTossup(packet, questionNumber, tossupInfo);
      if (!tossup.round || roundNumber < tossup.round) tossup.round = roundNumber;

      const category = getOrCreateCategory(tossupInfo.categoryMain || "Unknown");
      tossup.heard += 1;
      category.heard += 1;

      const buzzes = Array.isArray(matchQuestion?.buzzes) ? matchQuestion.buzzes : [];
      let firstPositive = null;
      let firstPositiveIndex = -1;
      let negCount = 0;
      const buzzLog = [];

      buzzes.forEach((buzz, buzzIndex) => {
        const teamName = cleanName(buzz?.team?.name || "Unknown Team");
        const playerName = cleanName(buzz?.player?.name || "Unknown Player");
        const value = Number(buzz?.result?.value ?? buzz?.value ?? 0);
        const buzzPosition = Number(buzz?.buzz_position?.word_index ?? buzz?.buzz_position ?? 0);

        const team = getOrCreateTeam(teamName);
        const player = getOrCreatePlayer(teamName, playerName);
        const opponentName = teamName === game.teamOneName ? game.teamTwoName : game.teamOneName;

        player.games.add(game.id);
        team.games.add(game.id);

        player.points += value;
        team.tossupPoints += value;
        team.totalPoints += value;

        const gameStats = gameTeamStats.get(`${game.id}::${teamName}`);
        if (gameStats) gameStats.tossupPoints += value;

        buzzLog.push({
          round: game.round,
          packetDescriptor: game.packetDescriptor,
          questionNumber,
          teamName,
          teamSlug: team.slug,
          playerName,
          playerSlug: player.slug,
          opponentName,
          opponentSlug: slugify(opponentName),
          buzzPosition,
          value,
        });

        player.buzzes.push({
          round: game.round,
          packetName: game.packetName,
          packetDescriptor: game.packetDescriptor,
          questionNumber,
          buzzPosition,
          value,
          opponentName,
          opponentSlug: slugify(opponentName),
        });

        if (value > 0) {
          player.positiveBuzzCount += 1;
          player.positiveBuzzTotal += buzzPosition;
          team.positiveBuzzCount += 1;
          team.positiveBuzzTotal += buzzPosition;

          if (buzzPosition > 0 && (!player.earliestBuzz || buzzPosition < player.earliestBuzz)) {
            player.earliestBuzz = buzzPosition;
          }

          if (buzzPosition > 0 && (!team.earliestBuzz || buzzPosition < team.earliestBuzz)) {
            team.earliestBuzz = buzzPosition;
          }

          if (buzzPosition > 0 && buzzPosition <= 3) {
            player.topThreeBuzzes += 1;
            team.topThreeBuzzes += 1;
          }
        }

        if (value >= 20) {
          player.superpowers += 1;
          team.superpowers += 1;
          player.gets += 1;
          team.gets += 1;
          if (gameStats) {
            gameStats.superpowers += 1;
            gameStats.gets += 1;
          }
        } else if (value >= 15) {
          player.powers += 1;
          team.powers += 1;
          player.gets += 1;
          team.gets += 1;
          if (gameStats) {
            gameStats.powers += 1;
            gameStats.gets += 1;
          }
        } else if (value > 0) {
          player.gets += 1;
          team.gets += 1;
          if (gameStats) gameStats.gets += 1;
        }

        if (value < 0) {
          player.negs += 1;
          team.negs += 1;
          negCount += 1;
          if (gameStats) gameStats.negs += 1;
        }

        if (value > 0 && !firstPositive) {
          firstPositive = {
            teamName,
            playerName,
            teamSlug: team.slug,
            playerSlug: player.slug,
            value,
            buzzPosition,
          };
          firstPositiveIndex = buzzIndex;
          player.firstBuzzes += 1;
          team.firstBuzzes += 1;
        }
      });

      if (firstPositive && firstPositive.buzzPosition > 0 && firstPositive.buzzPosition <= 3) {
        tossup.topThreeBuzzes += 1;
      }

      if (firstPositive) {
        tossup.firstBuzzes += 1;
      }

      if (firstPositiveIndex >= 0) {
        const hadOpponentNegBefore = buzzes
          .slice(0, firstPositiveIndex)
          .some((buzz) => {
            const value = Number(buzz?.result?.value ?? buzz?.value ?? 0);
            const teamName = cleanName(buzz?.team?.name || "Unknown Team");
            return value < 0 && teamName !== firstPositive.teamName;
          });

        if (hadOpponentNegBefore) {
          const reboundTeam = getOrCreateTeam(firstPositive.teamName);
          const reboundPlayer = getOrCreatePlayer(firstPositive.teamName, firstPositive.playerName);
          reboundTeam.rebounds += 1;
          reboundPlayer.rebounds += 1;
        }
      }

      tossup.negs += negCount;
      category.negs += negCount;

      if (firstPositive) {
        tossup.conversions += 1;
        tossup.positiveBuzzes += 1;
        tossup.positiveBuzzTotal += firstPositive.buzzPosition;

        category.conversions += 1;
        category.positiveBuzzes += 1;
        category.positiveBuzzTotal += firstPositive.buzzPosition;

        if (firstPositive.value >= 20) {
          tossup.superpowers += 1;
          category.superpowers += 1;
        } else if (firstPositive.value >= 15) {
          tossup.powers += 1;
          category.powers += 1;
        }
      }

      tossup.instances.push({
        round: game.round,
        packetName: game.packetName,
        packetDescriptor: game.packetDescriptor,
        questionNumber,
        tossupSlug: tossup.slug,
        question: tossup.question,
        answer: tossup.answer,
        answerPrimary: tossup.answerPrimary,
        categoryMain: tossup.categoryMain,
        categorySlug: slugify(tossup.categoryMain),
        firstBuzzTeam: firstPositive ? firstPositive.teamName : "",
        firstBuzzPlayer: firstPositive ? firstPositive.playerName : "",
        buzzes: buzzLog,
      });

      if (matchQuestion?.bonus && Array.isArray(matchQuestion.bonus.parts)) {
        const bonusQ = Number(matchQuestion?.bonus?.question?.question_number) || questionNumber;
        const bonusInfo = packet.bonusesByNumber.get(bonusQ) || {
          leadin: matchQuestion?.bonus?.question?.question || "",
          answers: (matchQuestion?.bonus?.parts || []).map((part) => part?.answer || ""),
          parts: (matchQuestion?.bonus?.parts || []).map((part) => part?.text || ""),
          metadata: "",
          categoryMain: tossup.categoryMain,
        };
        const bonus = getOrCreateBonus(packet, bonusQ, bonusInfo);
        if (!bonus.round || roundNumber < bonus.round) bonus.round = roundNumber;

        if (firstPositive) {
          const directedTeam = getOrCreateTeam(firstPositive.teamName);
          const directedGameStats = gameTeamStats.get(`${game.id}::${firstPositive.teamName}`);
          const opponentName = firstPositive.teamName === game.teamOneName ? game.teamTwoName : game.teamOneName;

          const partScores = matchQuestion.bonus.parts.map((part) => Number(part?.controlled_points ?? part?.value ?? 0));
          const totalBonus = partScores.reduce((sum, score) => sum + score, 0);

          directedTeam.bonusesHeard += 1;
          directedTeam.bonusPoints += totalBonus;
          directedTeam.totalPoints += totalBonus;
          if (directedGameStats) directedGameStats.bonusPoints += totalBonus;

          bonus.heard += 1;
          bonus.totalPoints += totalBonus;
          if ((partScores[0] || 0) > 0) bonus.easyGets += 1;
          if ((partScores[1] || 0) > 0) bonus.mediumGets += 1;
          if ((partScores[2] || 0) > 0) bonus.hardGets += 1;

          bonus.instances.push({
            round: game.round,
            packetName: game.packetName,
            packetDescriptor: game.packetDescriptor,
            questionNumber: bonusQ,
            bonusSlug: bonus.slug,
            category: bonus.categoryMain,
            categorySlug: slugify(bonus.categoryMain),
            teamName: directedTeam.name,
            teamSlug: directedTeam.slug,
            opponentName,
            opponentSlug: slugify(opponentName),
            partOne: partScores[0] || 0,
            partTwo: partScores[1] || 0,
            partThree: partScores[2] || 0,
            total: totalBonus,
          });
        }
      }
    });
  });

  const playerList = Array.from(players.values()).map((player) => {
    let tuh = 0;
    player.games.forEach((gameId) => {
      const game = games.find((entry) => entry.id === gameId);
      if (game && (game.teamOneName === player.teamName || game.teamTwoName === player.teamName)) {
        tuh += game.tossupsRead;
      }
    });

    const gamesPlayed = player.games.size || 1;
    return {
      ...player,
      tuh,
      ppg: player.points / gamesPlayed,
      pp20tuh: tuh ? (player.points * 20) / tuh : 0,
      averageBuzz: player.positiveBuzzCount ? player.positiveBuzzTotal / player.positiveBuzzCount : 0,
      earliestBuzz: player.earliestBuzz || "",
    };
  });

  const teamList = Array.from(teams.values()).map((team) => {
    const gamesPlayed = team.games.size || 1;
    return {
      ...team,
      ppg: team.totalPoints / gamesPlayed,
      ppb: team.bonusesHeard ? team.bonusPoints / team.bonusesHeard : 0,
      averageBuzz: team.positiveBuzzCount ? team.positiveBuzzTotal / team.positiveBuzzCount : 0,
      earliestBuzz: team.earliestBuzz || "",
    };
  });

  const tossupList = Array.from(tossups.values()).map((tossup) => {
    const heard = tossup.heard || 1;
    return {
      ...tossup,
      conversionRate: (tossup.conversions / heard) * 100,
      powerRate: (tossup.powers / heard) * 100,
      superpowerRate: (tossup.superpowers / heard) * 100,
      negRate: (tossup.negs / heard) * 100,
      averageBuzz: tossup.positiveBuzzes ? tossup.positiveBuzzTotal / tossup.positiveBuzzes : 0,
    };
  });

  const bonusList = Array.from(bonuses.values()).map((bonus) => {
    const heard = bonus.heard || 1;
    return {
      ...bonus,
      ppb: bonus.heard ? bonus.totalPoints / bonus.heard : 0,
      easyConversion: (bonus.easyGets / heard) * 100,
      mediumConversion: (bonus.mediumGets / heard) * 100,
      hardConversion: (bonus.hardGets / heard) * 100,
      answerSummary: bonus.answers.map((answer) => shortenAnswerline(stripTags(answer))).join(" / "),
    };
  });

  const categoryList = Array.from(categories.values()).map((category) => {
    const heard = category.heard || 1;
    return {
      ...category,
      conversionRate: (category.conversions / heard) * 100,
      powerRate: (category.powers / heard) * 100,
      superpowerRate: (category.superpowers / heard) * 100,
      negRate: (category.negs / heard) * 100,
      averageBuzz: category.positiveBuzzes ? category.positiveBuzzTotal / category.positiveBuzzes : 0,
    };
  });

  const summary = {
    tournamentName: tournament.name,
    gameCount: games.length,
    roundCount: rounds.size,
    packetCount: packetIndex.packetList.length,
    teamCount: teamList.length,
    playerCount: playerList.length,
    tossupCount: tossupList.length,
    bonusesHeard: teamList.reduce((sum, team) => sum + team.bonusesHeard, 0),
  };

  const gameLog = Array.from(gameTeamStats.values()).map((entry) => ({
    ...entry,
    total: entry.tossupPoints + entry.bonusPoints,
  }));

  return {
    summary,
    tournament,
    questionSet,
    hasBonuses: bonusList.length > 0 || packetIndex.packetList.some((packet) => packet.bonusesByNumber.size > 0),
    tournaments: [tournament],
    questionSets: [questionSet],
    teams: teamList.sort((a, b) => b.ppg - a.ppg),
    players: playerList.sort((a, b) => b.pp20tuh - a.pp20tuh),
    tossups: tossupList.sort((a, b) => a.round - b.round || a.questionNumber - b.questionNumber),
    bonuses: bonusList.sort((a, b) => a.round - b.round || a.questionNumber - b.questionNumber),
    categories: categoryList.sort((a, b) => b.heard - a.heard),
    games,
    gameLog,
    unmatchedPackets,
  };
}

function getSetSummaryStats() {
  const model = state.model;
  const totalHeard = model.tossups.reduce((sum, tossup) => sum + tossup.heard, 0);
  const totalConversions = model.tossups.reduce((sum, tossup) => sum + tossup.conversions, 0);
  const totalPowers = model.tossups.reduce((sum, tossup) => sum + tossup.powers, 0);
  const totalSuperpowers = model.tossups.reduce((sum, tossup) => sum + tossup.superpowers, 0);
  const totalNegs = model.tossups.reduce((sum, tossup) => sum + tossup.negs, 0);
  const bonusPoints = model.teams.reduce((sum, team) => sum + team.bonusPoints, 0);
  const bonusesHeard = model.teams.reduce((sum, team) => sum + team.bonusesHeard, 0);

  return {
    conversionRate: totalHeard ? (totalConversions / totalHeard) * 100 : 0,
    powerRate: totalHeard ? (totalPowers / totalHeard) * 100 : 0,
    superpowerRate: totalHeard ? (totalSuperpowers / totalHeard) * 100 : 0,
    negRate: totalHeard ? (totalNegs / totalHeard) * 100 : 0,
    ppb: bonusesHeard ? bonusPoints / bonusesHeard : 0,
  };
}

function getTossupCategoryRows() {
  return state.model.categories.map((category) => ({
    category: category.name,
    categorySlug: slugify(category.name),
    heard: category.heard,
    conversionRate: category.conversionRate,
    powerRate: category.powerRate,
    superpowerRate: category.superpowerRate,
    negRate: category.negRate,
    averageBuzz: category.averageBuzz,
  }));
}

function getBonusCategoryRows() {
  const agg = new Map();

  state.model.bonuses.forEach((bonus) => {
    const key = bonus.categoryMain || "Unknown";
    if (!agg.has(key)) {
      agg.set(key, {
        category: key,
        categorySlug: slugify(key),
        heard: 0,
        totalPoints: 0,
        easyGets: 0,
        mediumGets: 0,
        hardGets: 0,
      });
    }

    const row = agg.get(key);
    row.heard += bonus.heard;
    row.totalPoints += bonus.totalPoints;
    row.easyGets += bonus.easyGets;
    row.mediumGets += bonus.mediumGets;
    row.hardGets += bonus.hardGets;
  });

  return Array.from(agg.values()).map((row) => ({
    ...row,
    ppb: row.heard ? row.totalPoints / row.heard : 0,
    easyConversion: row.heard ? (row.easyGets / row.heard) * 100 : 0,
    mediumConversion: row.heard ? (row.mediumGets / row.heard) * 100 : 0,
    hardConversion: row.heard ? (row.hardGets / row.heard) * 100 : 0,
  })).sort((a, b) => b.heard - a.heard);
}

function getCategoryTossupPlayerRows(categorySlug) {
  const target = decodeURIComponent(categorySlug || "").toLowerCase();
  const rows = new Map();

  state.model.tossups.forEach((tossup) => {
    tossup.instances.forEach((instance) => {
      if ((instance.categorySlug || "") !== target) {
        return;
      }

      const firstPositive = instance.buzzes.find((buzz) => buzz.value > 0);

      instance.buzzes.forEach((buzz, index) => {
        const key = buzz.playerSlug;
        if (!rows.has(key)) {
          rows.set(key, {
            name: buzz.playerName,
            slug: buzz.playerSlug,
            teamName: buzz.teamName,
            teamSlug: buzz.teamSlug,
            powers: 0,
            superpowers: 0,
            gets: 0,
            negs: 0,
            rebounds: 0,
            points: 0,
            earliestBuzz: null,
            positiveBuzzCount: 0,
            positiveBuzzTotal: 0,
            firstBuzzes: 0,
            topThreeBuzzes: 0,
          });
        }

        const row = rows.get(key);
        row.points += buzz.value;

        if (buzz.value >= 20) {
          row.superpowers += 1;
          row.gets += 1;
        } else if (buzz.value >= 15) {
          row.powers += 1;
          row.gets += 1;
        } else if (buzz.value > 0) {
          row.gets += 1;
        } else if (buzz.value < 0) {
          row.negs += 1;
        }

        if (buzz.value > 0) {
          row.positiveBuzzCount += 1;
          row.positiveBuzzTotal += buzz.buzzPosition;
          if (buzz.buzzPosition > 0 && (!row.earliestBuzz || buzz.buzzPosition < row.earliestBuzz)) {
            row.earliestBuzz = buzz.buzzPosition;
          }
          if (buzz.buzzPosition > 0 && buzz.buzzPosition <= 3) {
            row.topThreeBuzzes += 1;
          }
        }

        if (firstPositive && firstPositive.playerSlug === buzz.playerSlug) {
          row.firstBuzzes += 1;
        }

        if (buzz.value > 0) {
          const hadOpponentNegBefore = instance.buzzes
            .slice(0, index)
            .some((prior) => prior.value < 0 && prior.teamSlug !== buzz.teamSlug);
          if (hadOpponentNegBefore) {
            row.rebounds += 1;
          }
        }
      });
    });
  });

  return Array.from(rows.values())
    .map((row) => ({
      ...row,
      averageBuzz: row.positiveBuzzCount ? row.positiveBuzzTotal / row.positiveBuzzCount : 0,
      earliestBuzz: row.earliestBuzz || "",
    }))
    .sort((a, b) => b.points - a.points);
}

function getCategoryBonusTeamRows(categorySlug) {
  const target = decodeURIComponent(categorySlug || "").toLowerCase();
  const rows = new Map();

  state.model.bonuses.forEach((bonus) => {
    bonus.instances.forEach((instance) => {
      if ((instance.categorySlug || "") !== target) {
        return;
      }

      const key = instance.teamSlug;
      if (!rows.has(key)) {
        rows.set(key, {
          name: instance.teamName,
          teamSlug: instance.teamSlug,
          heard: 0,
          totalPoints: 0,
          easyGets: 0,
          mediumGets: 0,
          hardGets: 0,
        });
      }

      const row = rows.get(key);
      row.heard += 1;
      row.totalPoints += instance.total;
      if (instance.partOne > 0) row.easyGets += 1;
      if (instance.partTwo > 0) row.mediumGets += 1;
      if (instance.partThree > 0) row.hardGets += 1;
    });
  });

  return Array.from(rows.values())
    .map((row) => ({
      ...row,
      ppb: row.heard ? row.totalPoints / row.heard : 0,
      easyConversion: row.heard ? (row.easyGets / row.heard) * 100 : 0,
      mediumConversion: row.heard ? (row.mediumGets / row.heard) * 100 : 0,
      hardConversion: row.heard ? (row.hardGets / row.heard) * 100 : 0,
    }))
    .sort((a, b) => b.heard - a.heard);
}

function getTeamBonusRows(teamSlug) {
  const rows = [];

  state.model.bonuses.forEach((bonus) => {
    bonus.instances.forEach((instance) => {
      if (instance.teamSlug !== teamSlug) {
        return;
      }

      const partLabel = [
        instance.partOne > 0 ? "E" : "",
        instance.partTwo > 0 ? "M" : "",
        instance.partThree > 0 ? "H" : "",
      ].join("");

      rows.push({
        round: instance.round,
        category: instance.category,
        categorySlug: instance.categorySlug,
        opponentName: instance.opponentName,
        opponentSlug: instance.opponentSlug,
        easyPart: bonus.parts[0] || "",
        mediumPart: bonus.parts[1] || "",
        hardPart: bonus.parts[2] || "",
        easyResult: instance.partOne > 0,
        mediumResult: instance.partTwo > 0,
        hardResult: instance.partThree > 0,
        total: instance.total,
        parts: partLabel,
        bonusSlug: bonus.slug,
      });
    });
  });

  return rows.sort((a, b) => a.round - b.round);
}

function getPlayerBuzzRows(playerSlug) {
  const rows = [];

  state.model.tossups.forEach((tossup) => {
    tossup.instances.forEach((instance) => {
      const positiveBuzzes = [...instance.buzzes]
        .filter((buzz) => buzz.value > 0)
        .sort((a, b) => a.buzzPosition - b.buzzPosition);

      const firstPositive = positiveBuzzes[0] || null;

      instance.buzzes.forEach((buzz, index) => {
        if (buzz.playerSlug !== playerSlug) {
          return;
        }

        const rank = buzz.value > 0
          ? positiveBuzzes.findIndex((candidate) =>
            candidate.playerSlug === buzz.playerSlug && candidate.buzzPosition === buzz.buzzPosition
          ) + 1
          : 0;

        const rebound = buzz.value > 0
          ? instance.buzzes
            .slice(0, index)
            .some((prior) => prior.value < 0 && prior.teamSlug !== buzz.teamSlug)
          : false;

        rows.push({
          round: instance.round,
          packetDescriptor: instance.packetDescriptor,
          questionNumber: instance.questionNumber,
          category: instance.categoryMain,
          categorySlug: instance.categorySlug,
          answer: instance.answerPrimary,
          questionSlug: instance.tossupSlug,
          buzzPosition: buzz.buzzPosition,
          value: buzz.value,
          firstBuzz: firstPositive && firstPositive.playerSlug === buzz.playerSlug ? 1 : 0,
          topThreeBuzz: buzz.value > 0 && buzz.buzzPosition > 0 && buzz.buzzPosition <= 3 ? 1 : 0,
          buzzRank: rank,
          rebound: rebound ? 1 : 0,
        });
      });
    });
  });

  return rows.sort((a, b) => a.round - b.round || a.questionNumber - b.questionNumber);
}

function getTeamBySlug(slug) {
  return state.model.teams.find((team) => team.slug === slug);
}

function getTeamSlugByName(name) {
  const team = state.model.teams.find((entry) => entry.name === name);
  return team ? team.slug : slugify(name);
}

function getPlayerBySlug(slug) {
  return state.model.players.find((player) => player.slug === slug);
}

function getDefaultPlayerBuzzPath(base, parentSlug, playerSlug) {
  if (base === "set") {
    return `set/${parentSlug}/player/${playerSlug}/buzz`;
  }

  return `set/${state.model.questionSet.slug}/player/${playerSlug}/buzz`;
}

function getDefaultPlayerBuzzPathFromBase(basePath, playerSlug) {
  const parts = String(basePath || "").split("/");
  if (parts[0] === "set" && parts[1]) {
    return `set/${parts[1]}/player/${playerSlug}/buzz`;
  }

  return `set/${state.model.questionSet.slug}/player/${playerSlug}/buzz`;
}

function getTossupBySlug(slug) {
  return state.model.tossups.find((tossup) => tossup.slug === slug);
}

function getBonusBySlug(slug) {
  return state.model.bonuses.find((bonus) => bonus.slug === slug);
}

function getTournamentTossup(round, questionNumber) {
  return state.model.tossups.find((tossup) =>
    tossup.instances.some((instance) => Number(instance.round) === Number(round) && Number(instance.questionNumber) === Number(questionNumber))
  );
}

function getTournamentBonus(round, questionNumber) {
  return state.model.bonuses.find((bonus) =>
    bonus.instances.some((instance) => Number(instance.round) === Number(round) && Number(instance.questionNumber) === Number(questionNumber))
  );
}

function renderQuestionWordsMarkup(questionText) {
  const words = stripTags(questionText || "")
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) {
    return `<p class="tossup-question-text">(question unavailable)</p>`;
  }

  return `
    <p id="tossupQuestionWords" class="tossup-question-text">
      ${words
        .map(
          (word, index) =>
            `<span class="question-word" data-word-index="${index + 1}">${escapeHtml(word)}</span>`
        )
        .join(" ")}
    </p>
  `;
}

function renderTossupBuzzTable(allBuzzes, basePath) {
  if (!allBuzzes.length) {
    return `<div class="empty-state">No buzz rows available.</div>`;
  }

  const rowsHtml = allBuzzes
    .map((buzz) => {
      const buzzPos = Number(buzz.buzzPosition) || 0;
      const buzzValue = Number(buzz.value) || 0;
      const playerPath = getDefaultPlayerBuzzPathFromBase(basePath, buzz.playerSlug);

      return `
        <tr class="buzz-hover-row" data-buzz-position="${escapeHtml(buzzPos)}" data-buzz-value="${escapeHtml(buzzValue)}">
          <td>${routeLink(playerPath, buzz.playerName)}</td>
          <td>${routeLink(`${basePath}/team/${buzz.teamSlug}`, buzz.teamName)}</td>
          <td>${routeLink(`${basePath}/team/${buzz.opponentSlug}`, buzz.opponentName)}</td>
          <td>${escapeHtml(buzzPos)}</td>
          <td>${escapeHtml(buzzValue)}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="table-wrap">
      <table class="sortable-table" data-default-sort-col="3" data-default-sort-dir="asc">
        <thead>
          <tr>
            <th data-sort-index="0">Player</th>
            <th data-sort-index="1">Team</th>
            <th data-sort-index="2">Opponent</th>
            <th data-sort-index="3">Buzz Position</th>
            <th data-sort-index="4">Value</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;
}

function clearTossupWordHighlight() {
  dom.routeContent
    .querySelectorAll(".question-word.highlight-pos, .question-word.highlight-neg")
    .forEach((element) => {
      element.classList.remove("highlight-pos", "highlight-neg");
    });
}

function wireTossupBuzzHoverInteractions() {
  const rows = dom.routeContent.querySelectorAll(".buzz-hover-row");
  if (!rows.length) {
    return;
  }

  rows.forEach((row) => {
    row.addEventListener("mouseenter", () => {
      clearTossupWordHighlight();

      const buzzPosition = Number(row.getAttribute("data-buzz-position") || 0);
      if (!Number.isFinite(buzzPosition) || buzzPosition <= 0) {
        return;
      }

      const word = dom.routeContent.querySelector(`.question-word[data-word-index="${buzzPosition}"]`);
      if (!word) {
        return;
      }

      const buzzValue = Number(row.getAttribute("data-buzz-value") || 0);
      word.classList.add(buzzValue < 0 ? "highlight-neg" : "highlight-pos");
    });

    row.addEventListener("mouseleave", clearTossupWordHighlight);
  });
}

function renderHomePage() {
  const model = state.model;
  const warning = model.unmatchedPackets.length
    ? `<div class="empty-state">Warning: ${escapeHtml(model.unmatchedPackets.length)} QBJ file(s) had packet matching fallbacks.</div>`
    : "";

  return `
    <section class="route-block">
      <p>
        Welcome to Buzzpoints! Use the headers above to ${routeLink("set", "view stats by question set")} or ${routeLink("tournament", "view stats by tournament")}.
      </p>
      <p>This client-only edition uses your uploaded mega JSON in-browser.</p>
      <br />
      ${warning}
    </section>
  `;
}

function renderSetListPage() {
  const summary = getSetSummaryStats();
  const model = state.model;

  return `
    <section class="route-block">
      <h2>Recent Question Sets</h2>
      ${renderTable(
        ["Question", "Difficulty", "Debut", "Editions", "Mirrors", "Conv. %", "Power %", "Neg %", "PPB"],
        model.questionSets.map((set) => [
          routeLink(`set/${set.slug}`, set.name),
          escapeHtml(set.difficulty || ""),
          escapeHtml(model.tournament.startDate || ""),
          escapeHtml(1),
          escapeHtml(1),
          escapeHtml(formatPercent(summary.conversionRate)),
          escapeHtml(formatPercent(summary.powerRate)),
          escapeHtml(formatPercent(summary.negRate)),
          escapeHtml(formatDecimal(summary.ppb)),
        ])
      )}
    </section>
  `;
}

function renderSetDetailPage(setSlug) {
  const model = state.model;
  if (setSlug !== model.questionSet.slug) return `<div class="empty-state">Set not found.</div>`;

  const summary = getSetSummaryStats();
  const bonusCategories = getBonusCategoryRows();

  return `
    <section class="route-block">
      ${renderTable(
        ["Difficulty", "Debut", "Editions", "Mirrors", "Conv. %", "Power %", "Neg %", "PPB"],
        [[
          escapeHtml(model.questionSet.difficulty || ""),
          escapeHtml(model.tournament.startDate || ""),
          escapeHtml(1),
          escapeHtml(1),
          escapeHtml(formatPercent(summary.conversionRate)),
          escapeHtml(formatPercent(summary.powerRate)),
          escapeHtml(formatPercent(summary.negRate)),
          escapeHtml(formatDecimal(summary.ppb)),
        ]]
      )}
    </section>

    <section class="route-block">
      <h2>${routeLink(`set/${setSlug}/tossup`, "Tossups")}</h2>
      ${renderTable(
        ["Category", "Heard", "Conv", "Power", "Super", "Neg", "Avg Buzz"],
        model.categories.map((category) => [
          routeLink(`set/${setSlug}/category-tossup/${slugify(category.name)}`, category.name),
          escapeHtml(category.heard),
          escapeHtml(formatPercent(category.conversionRate)),
          escapeHtml(formatPercent(category.powerRate)),
          escapeHtml(formatPercent(category.superpowerRate)),
          escapeHtml(formatPercent(category.negRate)),
          escapeHtml(formatDecimal(category.averageBuzz)),
        ])
      )}
    </section>

    <section class="route-block">
      <h2>${routeLink(`set/${setSlug}/bonus`, "Bonuses")}</h2>
      ${renderTable(
        ["Category", "Heard", "PPB", "E %", "M %", "H %"],
        bonusCategories.map((category) => [
          routeLink(`set/${setSlug}/category-bonus/${category.categorySlug}`, category.category),
          escapeHtml(category.heard),
          escapeHtml(formatDecimal(category.ppb)),
          escapeHtml(formatPercent(category.easyConversion)),
          escapeHtml(formatPercent(category.mediumConversion)),
          escapeHtml(formatPercent(category.hardConversion)),
        ])
      )}
    </section>
  `;
}

function renderTournamentListPage() {
  const model = state.model;
  return `
    <section class="route-block">
      <h2>Recent Tournaments</h2>
      ${renderTable(
        ["Tournament", "Question Set", "Location", "Level", "Date"],
        model.tournaments.map((tournament) => [
          routeLink(`tournament/${tournament.slug}`, tournament.name),
          escapeHtml(model.questionSet.name),
          escapeHtml(tournament.location || ""),
          escapeHtml(tournament.level || ""),
          escapeHtml(tournament.startDate || ""),
        ])
      )}
    </section>
  `;
}

function renderTournamentDetailPage(tournamentSlug) {
  const model = state.model;
  if (tournamentSlug !== model.tournament.slug) return `<div class="empty-state">Tournament not found.</div>`;
  const bonusCategories = getBonusCategoryRows();

  return `
    <section class="route-block">
      ${renderTable(
        ["Tournament", "Date", "Level", "Location", "Set", "Difficulty"],
        [[
          escapeHtml(model.tournament.name),
          escapeHtml(model.tournament.startDate || ""),
          escapeHtml(model.tournament.level || ""),
          escapeHtml(model.tournament.location || ""),
          escapeHtml(model.questionSet.name),
          escapeHtml(model.questionSet.difficulty || ""),
        ]]
      )}
    </section>

    <section class="route-block">
      <h2>${routeLink(`tournament/${tournamentSlug}/tossup`, "Tossups")}</h2>
      ${renderTable(
        ["Packet", "Q", "Answer", "Category", "Heard", "Conv", "Power", "Super", "Neg", "Avg Buzz"],
        model.tossups.map((tossup) => [
          escapeHtml(tossup.packetDescriptor || tossup.packetName),
          escapeHtml(tossup.questionNumber),
          escapeHtml(tossup.answerPrimary || "(answer unavailable)"),
          escapeHtml(tossup.categoryMain),
          escapeHtml(tossup.heard),
          escapeHtml(formatPercent(tossup.conversionRate)),
          escapeHtml(formatPercent(tossup.powerRate)),
          escapeHtml(formatPercent(tossup.superpowerRate)),
          escapeHtml(formatPercent(tossup.negRate)),
          escapeHtml(formatDecimal(tossup.averageBuzz)),
        ])
      )}
    </section>

    <section class="route-block">
      <h2>${routeLink(`tournament/${tournamentSlug}/bonus`, "Bonuses")}</h2>
      ${renderTable(
        ["Category", "Heard", "PPB", "E %", "M %", "H %"],
        bonusCategories.map((category) => [
          routeLink(`tournament/${tournamentSlug}/category-bonus/${category.categorySlug}`, category.category),
          escapeHtml(category.heard),
          escapeHtml(formatDecimal(category.ppb)),
          escapeHtml(formatPercent(category.easyConversion)),
          escapeHtml(formatPercent(category.mediumConversion)),
          escapeHtml(formatPercent(category.hardConversion)),
        ])
      )}
    </section>
  `;
}

function renderTeamListPage(base, parentSlug) {
  const model = state.model;
  return `
    <section class="route-block">
      <h2>Teams</h2>
      ${renderTable(
        ["Team", "Powers", "Gets", "Negs", "Rebounds", "Points", "Earliest Buzz", "Avg. Buzz", "First Buzzes", "Top 3 Buzzes", "Bonuses", "PPB"],
        model.teams.map((team) => [
          routeLink(`${base}/${parentSlug}/team/${team.slug}`, team.name),
          escapeHtml(team.powers),
          escapeHtml(team.gets),
          escapeHtml(team.negs),
          escapeHtml(team.rebounds),
          escapeHtml(team.totalPoints),
          escapeHtml(team.earliestBuzz || ""),
          escapeHtml(formatDecimal(team.averageBuzz)),
          escapeHtml(team.firstBuzzes),
          escapeHtml(team.topThreeBuzzes),
          escapeHtml(team.bonusesHeard),
          escapeHtml(formatDecimal(team.ppb)),
        ])
      )}
    </section>
  `;
}

function renderPlayerListPage(base, parentSlug) {
  const model = state.model;
  return `
    <section class="route-block">
      <h2>Players</h2>
      ${renderTable(
        ["Player", "Team", "Powers", "Gets", "Negs", "Rebounds", "Points", "Earliest Buzz", "Avg. Buzz", "First Buzzes", "Top 3 Buzzes"],
        model.players.map((player) => [
          routeLink(getDefaultPlayerBuzzPath(base, parentSlug, player.slug), player.name),
          routeLink(`${base}/${parentSlug}/team/${getTeamSlugByName(player.teamName)}`, player.teamName),
          escapeHtml(player.powers),
          escapeHtml(player.gets),
          escapeHtml(player.negs),
          escapeHtml(player.rebounds),
          escapeHtml(player.points),
          escapeHtml(player.earliestBuzz || ""),
          escapeHtml(formatDecimal(player.averageBuzz)),
          escapeHtml(player.firstBuzzes),
          escapeHtml(player.topThreeBuzzes),
        ])
      )}
    </section>
  `;
}

function renderTeamDetailPage(base, parentSlug, teamSlug) {
  const model = state.model;
  const team = getTeamBySlug(teamSlug);
  if (!team) return `<div class="empty-state">Team not found.</div>`;

  const roster = model.players.filter((player) => player.teamName === team.name);
  const logRows = model.gameLog
    .filter((entry) => entry.teamSlug === team.slug)
    .sort((a, b) => a.round - b.round || a.gameId - b.gameId);

  const playerLinks = roster
    .map((player) => routeLink(getDefaultPlayerBuzzPath(base, parentSlug, player.slug), player.name))
    .join(" | ");
  const bonusPath = base === "set"
    ? `set/${parentSlug}/team/${team.slug}/bonus`
    : `set/${state.model.questionSet.slug}/team/${team.slug}/bonus`;

  return `
    <section class="route-block">
      <h2 class="detail-title"><b>${escapeHtml(team.name)}</b><br />${playerLinks}</h2>
      <div class="detail-actions">${routeLink(bonusPath, "View Bonuses")}</div>
    </section>

    <section class="route-block">
      <h2>Roster</h2>
      ${renderTable(
        ["Player", "Games", "TUH", "Pts", "PP20TUH", "Open"],
        roster.map((player) => [
          escapeHtml(player.name),
          escapeHtml(player.games.size),
          escapeHtml(player.tuh),
          escapeHtml(player.points),
          escapeHtml(formatDecimal(player.pp20tuh)),
          routeLink(getDefaultPlayerBuzzPath(base, parentSlug, player.slug), "Detail"),
        ])
      )}
    </section>

    <section class="route-block">
      <h2>Game Log</h2>
      ${renderTable(
        ["Round", "Packet", "Opponent", "TUH", "TU Pts", "Bonus Pts", "Total", "Gets", "Negs"],
        logRows.map((entry) => [
          escapeHtml(entry.round),
          escapeHtml(entry.packetName),
          routeLink(`${base}/${parentSlug}/team/${entry.opponentSlug}`, entry.opponentName),
          escapeHtml(entry.tossupsRead),
          escapeHtml(entry.tossupPoints),
          escapeHtml(entry.bonusPoints),
          escapeHtml(entry.total),
          escapeHtml(entry.gets),
          escapeHtml(entry.negs),
        ])
      )}
    </section>
  `;
}

function renderPlayerDetailPage(base, parentSlug, playerSlug) {
  const player = getPlayerBySlug(playerSlug);
  if (!player) return `<div class="empty-state">Player not found.</div>`;

  const buzzRows = [...player.buzzes].sort((a, b) => a.round - b.round || a.questionNumber - b.questionNumber);
  const buzzPath = base === "set"
    ? `set/${parentSlug}/player/${player.slug}/buzz`
    : `set/${state.model.questionSet.slug}/player/${player.slug}/buzz`;

  return `
    <section class="route-block">
      <h2 class="detail-title"><b>${escapeHtml(player.name)}</b><br />${routeLink(`${base}/${parentSlug}/team/${getTeamSlugByName(player.teamName)}`, player.teamName)}</h2>
      <div class="detail-actions">${routeLink(buzzPath, "View Buzzes")}</div>
    </section>

    <section class="route-block">
      <h2>Buzz Log</h2>
      ${renderTable(
        ["Round", "Packet", "Q", "Opponent", "Buzz Position", "Value"],
        buzzRows.map((buzz) => [
          escapeHtml(buzz.round),
          escapeHtml(buzz.packetDescriptor || buzz.packetName),
          escapeHtml(buzz.questionNumber),
          routeLink(`${base}/${parentSlug}/team/${buzz.opponentSlug}`, buzz.opponentName),
          escapeHtml(buzz.buzzPosition),
          escapeHtml(buzz.value),
        ])
      )}
    </section>
  `;
}

function renderCategoryTossupListPage(base, parentSlug) {
  const rows = getTossupCategoryRows();

  return `
    <section class="route-block">
      <h2>Tossup Categories</h2>
      ${renderTable(
        ["Category", "Heard", "Conv. %", "Power %", "Superpower %", "Neg %", "Avg. Buzz"],
        rows.map((row) => [
          routeLink(`${base}/${parentSlug}/category-tossup/${row.categorySlug}`, row.category),
          escapeHtml(row.heard),
          escapeHtml(formatPercent(row.conversionRate)),
          escapeHtml(formatPercent(row.powerRate)),
          escapeHtml(formatPercent(row.superpowerRate)),
          escapeHtml(formatPercent(row.negRate)),
          escapeHtml(formatDecimal(row.averageBuzz)),
        ])
      )}
    </section>
  `;
}

function renderCategoryTossupDetailPage(base, parentSlug, categorySlug) {
  const rows = getCategoryTossupPlayerRows(categorySlug);
  const categoryName =
    state.model.categories.find((category) => slugify(category.name) === categorySlug)?.name ||
    decodeURIComponent(categorySlug || "").replaceAll("-", " ");

  return `
    <section class="route-block">
      <h2 class="detail-title"><b>${escapeHtml(categoryName || "N/A")}</b></h2>
      ${renderTable(
        ["Player", "Team", "Powers", "Superpowers", "Gets", "Negs", "Rebounds", "Points", "Earliest Buzz", "Avg. Buzz", "First Buzzes", "Top 3 Buzzes"],
        rows.map((row) => [
          routeLink(getDefaultPlayerBuzzPath(base, parentSlug, row.slug), row.name),
          routeLink(`${base}/${parentSlug}/team/${row.teamSlug}`, row.teamName),
          escapeHtml(row.powers),
          escapeHtml(row.superpowers),
          escapeHtml(row.gets),
          escapeHtml(row.negs),
          escapeHtml(row.rebounds),
          escapeHtml(row.points),
          escapeHtml(row.earliestBuzz || ""),
          escapeHtml(formatDecimal(row.averageBuzz)),
          escapeHtml(row.firstBuzzes),
          escapeHtml(row.topThreeBuzzes),
        ])
      )}
    </section>
  `;
}

function renderCategoryBonusListPage(base, parentSlug) {
  const rows = getBonusCategoryRows();

  return `
    <section class="route-block">
      <h2>Bonus Categories</h2>
      ${renderTable(
        ["Category", "Heard", "PPB", "E %", "M %", "H %"],
        rows.map((row) => [
          routeLink(`${base}/${parentSlug}/category-bonus/${row.categorySlug}`, row.category),
          escapeHtml(row.heard),
          escapeHtml(formatDecimal(row.ppb)),
          escapeHtml(formatPercent(row.easyConversion)),
          escapeHtml(formatPercent(row.mediumConversion)),
          escapeHtml(formatPercent(row.hardConversion)),
        ])
      )}
    </section>
  `;
}

function renderCategoryBonusDetailPage(base, parentSlug, categorySlug) {
  const rows = getCategoryBonusTeamRows(categorySlug);
  const categoryName =
    getBonusCategoryRows().find((category) => category.categorySlug === categorySlug)?.category ||
    decodeURIComponent(categorySlug || "").replaceAll("-", " ");

  return `
    <section class="route-block">
      <h2 class="detail-title"><b>${escapeHtml(categoryName || "N/A")}</b></h2>
      ${renderTable(
        ["Team", "Heard", "PPB", "E %", "M %", "H %"],
        rows.map((row) => [
          routeLink(`${base}/${parentSlug}/team/${row.teamSlug}`, row.name),
          escapeHtml(row.heard),
          escapeHtml(formatDecimal(row.ppb)),
          escapeHtml(formatPercent(row.easyConversion)),
          escapeHtml(formatPercent(row.mediumConversion)),
          escapeHtml(formatPercent(row.hardConversion)),
        ])
      )}
    </section>
  `;
}

function renderSetTeamBonusPage(setSlug, teamSlug) {
  const team = getTeamBySlug(teamSlug);
  if (!team) {
    return `<div class="empty-state">Team not found.</div>`;
  }

  const rows = getTeamBonusRows(teamSlug);
  const roster = state.model.players.filter((player) => player.teamName === team.name);
  const playerLinks = roster
    .map((player) => routeLink(getDefaultPlayerBuzzPath("set", setSlug, player.slug), player.name))
    .join(" | ");

  return `
    <section class="route-block">
      <h2 class="detail-title"><b>${escapeHtml(team.name)}</b><br />${playerLinks}</h2>
      <div class="detail-actions">${routeLink(`set/${setSlug}/team/${teamSlug}`, "View Categories")}</div>
      ${renderTable(
        ["Round", "Category", "Opponent", "Easy", "", "Medium", "", "Hard", "", "Total", "Parts"],
        rows.map((row) => [
          escapeHtml(row.round),
          routeLink(`set/${setSlug}/category-bonus/${row.categorySlug}`, row.category),
          routeLink(`set/${setSlug}/team/${row.opponentSlug}`, row.opponentName),
          routeLink(`set/${setSlug}/bonus/${row.bonusSlug}`, shortenAnswerline(stripTags(row.easyPart))),
          escapeHtml(row.easyResult ? "✓" : "✕"),
          routeLink(`set/${setSlug}/bonus/${row.bonusSlug}`, shortenAnswerline(stripTags(row.mediumPart))),
          escapeHtml(row.mediumResult ? "✓" : "✕"),
          routeLink(`set/${setSlug}/bonus/${row.bonusSlug}`, shortenAnswerline(stripTags(row.hardPart))),
          escapeHtml(row.hardResult ? "✓" : "✕"),
          escapeHtml(row.total),
          escapeHtml(row.parts),
        ])
      )}
    </section>
  `;
}

function renderSetPlayerBuzzPage(setSlug, playerSlug) {
  const player = getPlayerBySlug(playerSlug);
  if (!player) {
    return `<div class="empty-state">Player not found.</div>`;
  }

  const rows = getPlayerBuzzRows(playerSlug);

  return `
    <section class="route-block">
      <h2 class="detail-title"><b>${escapeHtml(player.name)}</b><br />${routeLink(`set/${setSlug}/team/${getTeamSlugByName(player.teamName)}`, player.teamName)}</h2>
      <div class="detail-actions">${routeLink(`set/${setSlug}/player/${playerSlug}`, "View Category Stats")}</div>
      ${renderTable(
        ["Round", "Packet", "#", "Category", "Answer", "Buzzpoint", "Value", "First", "Top 3", "Rank", "Rebound"],
        rows.map((row) => [
          escapeHtml(row.round),
          escapeHtml(row.packetDescriptor || ""),
          escapeHtml(row.questionNumber),
          routeLink(`set/${setSlug}/category-tossup/${row.categorySlug}`, row.category),
          routeLink(`set/${setSlug}/tossup/${row.questionSlug}`, row.answer),
          escapeHtml(row.buzzPosition),
          escapeHtml(row.value),
          escapeHtml(row.firstBuzz > 0 ? "✓" : ""),
          escapeHtml(row.topThreeBuzz > 0 ? "✓" : ""),
          escapeHtml(row.buzzRank > 0 ? row.buzzRank : ""),
          escapeHtml(row.rebound > 0 ? "✓" : ""),
        ])
      )}
    </section>
  `;
}

function renderSetTossupListPage(setSlug) {
  const model = state.model;
  return `
    <section class="route-block">
      <h2>Tossups</h2>
      ${renderTable(
        ["Packet", "#", "Category", "Answer", "Heard", "Conv. %", "Power %", "Neg %", "First Buzz", "Avg. Buzz"],
        model.tossups.map((tossup) => [
          escapeHtml(tossup.packetDescriptor || tossup.packetName),
          escapeHtml(tossup.questionNumber),
          escapeHtml(tossup.categoryMain),
          routeLink(`set/${setSlug}/tossup/${tossup.slug}`, tossup.answerPrimary || "(answer unavailable)"),
          escapeHtml(tossup.heard),
          escapeHtml(formatPercent(tossup.conversionRate)),
          escapeHtml(formatPercent(tossup.powerRate)),
          escapeHtml(formatPercent(tossup.negRate)),
          escapeHtml(tossup.firstBuzzes),
          escapeHtml(formatDecimal(tossup.averageBuzz)),
        ])
      )}
    </section>
  `;
}

function renderTournamentTossupListPage(tournamentSlug) {
  const model = state.model;
  return `
    <section class="route-block">
      <h2>Tossups</h2>
      ${renderTable(
        ["Round", "Packet", "#", "Category", "Answer", "Heard", "Conv. %", "Power %", "Neg %", "First Buzz", "Avg. Buzz"],
        model.tossups.map((tossup) => [
          escapeHtml(tossup.round),
          escapeHtml(tossup.packetDescriptor || tossup.packetName),
          escapeHtml(tossup.questionNumber),
          escapeHtml(tossup.categoryMain),
          routeLink(`tournament/${tournamentSlug}/tossup/${tossup.round}/${tossup.questionNumber}`, tossup.answerPrimary || "(answer unavailable)"),
          escapeHtml(tossup.heard),
          escapeHtml(formatPercent(tossup.conversionRate)),
          escapeHtml(formatPercent(tossup.powerRate)),
          escapeHtml(formatPercent(tossup.negRate)),
          escapeHtml(tossup.firstBuzzes),
          escapeHtml(formatDecimal(tossup.averageBuzz)),
        ])
      )}
    </section>
  `;
}

function renderTossupDetailContent(tossup, basePath, backPath) {
  const allBuzzes = tossup.instances.flatMap((instance) =>
    instance.buzzes.map((buzz) => ({ ...buzz, round: instance.round, packetDescriptor: instance.packetDescriptor, questionNumber: instance.questionNumber }))
  );

  return `
    <section class="route-block">
      <h2>${escapeHtml(tossup.answerPrimary || "Tossup")}</h2>
      <p class="subline">${routeLink(backPath, "Back to tossups")}</p>
      ${renderMetricGrid([
        { label: "Heard", value: tossup.heard },
        { label: "Conversion", value: formatPercent(tossup.conversionRate) },
        { label: "Power", value: formatPercent(tossup.powerRate) },
        { label: "Neg", value: formatPercent(tossup.negRate) },
        { label: "First Buzzes", value: tossup.firstBuzzes },
        { label: "Avg. Buzz", value: formatDecimal(tossup.averageBuzz) },
      ])}
      <p><b>Category:</b> ${escapeHtml(tossup.categoryMain)}</p>
      <p><b>Question:</b></p>
      ${renderQuestionWordsMarkup(tossup.question || "")}
      <p><b>Answer:</b> ${escapeHtml(stripTags(tossup.answer || tossup.answerPrimary || ""))}</p>
    </section>

    <section class="route-block">
      <h2>Buzzes</h2>
      ${renderTossupBuzzTable(allBuzzes, basePath)}
    </section>
  `;
}

function renderSetTossupDetailPage(setSlug, tossupSlug) {
  const tossup = getTossupBySlug(tossupSlug);
  if (!tossup) return `<div class="empty-state">Tossup not found.</div>`;
  return renderTossupDetailContent(tossup, `set/${setSlug}`, `set/${setSlug}/tossup`);
}

function renderTournamentTossupDetailPage(tournamentSlug, round, questionNumber) {
  const tossup = getTournamentTossup(round, questionNumber);
  if (!tossup) return `<div class="empty-state">Tossup not found.</div>`;
  return renderTossupDetailContent(tossup, `tournament/${tournamentSlug}`, `tournament/${tournamentSlug}/tossup`);
}

function renderSetBonusListPage(setSlug) {
  const model = state.model;
  return `
    <section class="route-block">
      <h2>Bonuses</h2>
      ${renderTable(
        ["Packet", "#", "Category", "Answers", "Heard", "PPB", "E %", "M %", "H %"],
        model.bonuses.map((bonus) => [
          escapeHtml(bonus.packetDescriptor || bonus.packetName),
          escapeHtml(bonus.questionNumber),
          escapeHtml(bonus.categoryMain),
          routeLink(`set/${setSlug}/bonus/${bonus.slug}`, bonus.answerSummary || "(answers unavailable)"),
          escapeHtml(bonus.heard),
          escapeHtml(formatDecimal(bonus.ppb)),
          escapeHtml(formatPercent(bonus.easyConversion)),
          escapeHtml(formatPercent(bonus.mediumConversion)),
          escapeHtml(formatPercent(bonus.hardConversion)),
        ])
      )}
    </section>
  `;
}

function renderTournamentBonusListPage(tournamentSlug) {
  const model = state.model;
  return `
    <section class="route-block">
      <h2>Bonuses</h2>
      ${renderTable(
        ["Round", "Packet", "#", "Category", "Answers", "Heard", "PPB", "E %", "M %", "H %"],
        model.bonuses.map((bonus) => [
          escapeHtml(bonus.round),
          escapeHtml(bonus.packetDescriptor || bonus.packetName),
          escapeHtml(bonus.questionNumber),
          escapeHtml(bonus.categoryMain),
          routeLink(`tournament/${tournamentSlug}/bonus/${bonus.round}/${bonus.questionNumber}`, bonus.answerSummary || "(answers unavailable)"),
          escapeHtml(bonus.heard),
          escapeHtml(formatDecimal(bonus.ppb)),
          escapeHtml(formatPercent(bonus.easyConversion)),
          escapeHtml(formatPercent(bonus.mediumConversion)),
          escapeHtml(formatPercent(bonus.hardConversion)),
        ])
      )}
    </section>
  `;
}

function renderBonusDetailContent(bonus, basePath, backPath) {
  const easyPart = bonus.parts[0] || "";
  const mediumPart = bonus.parts[1] || "";
  const hardPart = bonus.parts[2] || "";
  const easyAnswer = bonus.answers[0] || "";
  const mediumAnswer = bonus.answers[1] || "";
  const hardAnswer = bonus.answers[2] || "";

  return `
    <section class="route-block">
      <h2>${escapeHtml(bonus.answerSummary || "Bonus")}</h2>
      <p class="subline">${routeLink(backPath, "Back to bonuses")}</p>
      ${renderMetricGrid([
        { label: "Heard", value: bonus.heard },
        { label: "PPB", value: formatDecimal(bonus.ppb) },
        { label: "Easy %", value: formatPercent(bonus.easyConversion) },
        { label: "Medium %", value: formatPercent(bonus.mediumConversion) },
        { label: "Hard %", value: formatPercent(bonus.hardConversion) },
      ])}
      <p><b>Category:</b> ${escapeHtml(bonus.categoryMain)}</p>
      <p><b>Leadin:</b> ${escapeHtml(stripTags(bonus.leadin || ""))}</p>
      <p><b>Part 1:</b> ${escapeHtml(stripTags(easyPart))} | <b>Answer:</b> ${escapeHtml(stripTags(easyAnswer))}</p>
      <p><b>Part 2:</b> ${escapeHtml(stripTags(mediumPart))} | <b>Answer:</b> ${escapeHtml(stripTags(mediumAnswer))}</p>
      <p><b>Part 3:</b> ${escapeHtml(stripTags(hardPart))} | <b>Answer:</b> ${escapeHtml(stripTags(hardAnswer))}</p>
    </section>

    <section class="route-block">
      <h2>Directs</h2>
      ${renderTable(
        ["Round", "Packet", "Team", "Opponent", "Part 1", "Part 2", "Part 3", "Total"],
        bonus.instances.map((instance) => [
          escapeHtml(instance.round),
          escapeHtml(instance.packetDescriptor || ""),
          routeLink(`${basePath}/team/${instance.teamSlug}`, instance.teamName),
          routeLink(`${basePath}/team/${instance.opponentSlug}`, instance.opponentName),
          escapeHtml(instance.partOne),
          escapeHtml(instance.partTwo),
          escapeHtml(instance.partThree),
          escapeHtml(instance.total),
        ])
      )}
    </section>
  `;
}

function renderSetBonusDetailPage(setSlug, bonusSlug) {
  const bonus = getBonusBySlug(bonusSlug);
  if (!bonus) return `<div class="empty-state">Bonus not found.</div>`;
  return renderBonusDetailContent(bonus, `set/${setSlug}`, `set/${setSlug}/bonus`);
}

function renderTournamentBonusDetailPage(tournamentSlug, round, questionNumber) {
  const bonus = getTournamentBonus(round, questionNumber);
  if (!bonus) return `<div class="empty-state">Bonus not found.</div>`;
  return renderBonusDetailContent(bonus, `tournament/${tournamentSlug}`, `tournament/${tournamentSlug}/bonus`);
}

function renderNotFound() {
  return `
    <section class="route-block">
      <h2>Page Not Found</h2>
      <div class="empty-state">The requested route is not available for this loaded data.</div>
    </section>
  `;
}

function renderAppNav(route) {
  const top = route[0] || "home";
  const model = state.model;

  const mainButtons = [{ label: "Home", path: "home", main: true }];
  const menuItems = [];

  if (!model) {
    mainButtons.push({ label: "Question Sets", path: "set", main: true });
    mainButtons.push({ label: "Tournaments", path: "tournament", main: true });
  } else if (top === "set" && route[1] === model.questionSet.slug) {
    mainButtons.push({ label: "Question Sets", path: "set", main: true });
    mainButtons.push({ label: model.questionSet.name, path: `set/${model.questionSet.slug}`, main: true });

    menuItems.push({ label: "Tossups", path: `set/${model.questionSet.slug}/tossup` });
    if (model.hasBonuses) menuItems.push({ label: "Bonuses", path: `set/${model.questionSet.slug}/bonus` });
    menuItems.push({ label: "Players", path: `set/${model.questionSet.slug}/player` });
    menuItems.push({ label: "Teams", path: `set/${model.questionSet.slug}/team` });
    menuItems.push({ label: "Categories (Tossup)", path: `set/${model.questionSet.slug}/category-tossup` });
    if (model.hasBonuses) menuItems.push({ label: "Categories (Bonus)", path: `set/${model.questionSet.slug}/category-bonus` });
  } else if (top === "tournament" && route[1] === model.tournament.slug) {
    mainButtons.push({ label: model.questionSet.name, path: `set/${model.questionSet.slug}`, main: true });
    mainButtons.push({ label: model.tournament.name, path: `tournament/${model.tournament.slug}`, main: true });

    menuItems.push({ label: "Tossups", path: `tournament/${model.tournament.slug}/tossup` });
    if (model.hasBonuses) menuItems.push({ label: "Bonuses", path: `tournament/${model.tournament.slug}/bonus` });
    menuItems.push({ label: "Players", path: `tournament/${model.tournament.slug}/player` });
    menuItems.push({ label: "Teams", path: `tournament/${model.tournament.slug}/team` });
    menuItems.push({ label: "Categories (Tossup)", path: `tournament/${model.tournament.slug}/category-tossup` });
    if (model.hasBonuses) menuItems.push({ label: "Categories (Bonus)", path: `tournament/${model.tournament.slug}/category-bonus` });
  } else {
    mainButtons.push({ label: "Question Sets", path: "set", main: true });
    mainButtons.push({ label: "Tournaments", path: "tournament", main: true });
  }

  const links = [...mainButtons, ...menuItems.map((item) => ({ ...item, main: false }))];
  const currentPath = (window.location.hash || "#/home").replace(/^#\//, "");

  dom.appNav.innerHTML = links
    .map((item) => {
      const active =
        (top === "home" && item.path === "home") ||
        currentPath === item.path ||
        currentPath.startsWith(`${item.path}/`);
      const classes = `${item.main ? "main-link " : ""}${active ? "active" : ""}`.trim();
      return `<a href="#/${item.path}" class="${classes}">${escapeHtml(item.label)}</a>`;
    })
    .join("");
}

function renderRoute() {
  if (!state.model) {
    renderAppNav(parseRoute());
    return;
  }

  const route = parseRoute();
  const model = state.model;
  renderAppNav(route);

  let html = "";
  let breadcrumbs = [{ label: "Home", path: "home" }];

  if (route[0] === "home") {
    html = renderHomePage();
  } else if (route[0] === "set") {
    breadcrumbs = [{ label: "Home", path: "home" }, { label: "Sets", path: "set" }];

    if (route.length === 1) {
      html = renderSetListPage();
    } else if (route[1] === model.questionSet.slug) {
      breadcrumbs.push({ label: model.questionSet.name, path: `set/${model.questionSet.slug}` });

      if (route.length === 2) {
        html = renderSetDetailPage(route[1]);
      } else if (route[2] === "category-tossup") {
        breadcrumbs.push({ label: "Categories (Tossup)", path: `set/${model.questionSet.slug}/category-tossup` });
        if (route.length === 3) {
          html = renderCategoryTossupListPage("set", model.questionSet.slug);
        } else {
          breadcrumbs.push({ label: decodeURIComponent(route[3] || "") });
          html = renderCategoryTossupDetailPage("set", model.questionSet.slug, route[3]);
        }
      } else if (route[2] === "category-bonus") {
        breadcrumbs.push({ label: "Categories (Bonus)", path: `set/${model.questionSet.slug}/category-bonus` });
        if (route.length === 3) {
          html = renderCategoryBonusListPage("set", model.questionSet.slug);
        } else {
          breadcrumbs.push({ label: decodeURIComponent(route[3] || "") });
          html = renderCategoryBonusDetailPage("set", model.questionSet.slug, route[3]);
        }
      } else if (route[2] === "tossup") {
        breadcrumbs.push({ label: "Tossups", path: `set/${model.questionSet.slug}/tossup` });
        if (route.length === 3) {
          html = renderSetTossupListPage(model.questionSet.slug);
        } else {
          const tossup = getTossupBySlug(route[3]);
          if (tossup) breadcrumbs.push({ label: tossup.answerPrimary || "Tossup" });
          html = renderSetTossupDetailPage(model.questionSet.slug, route[3]);
        }
      } else if (route[2] === "bonus") {
        breadcrumbs.push({ label: "Bonuses", path: `set/${model.questionSet.slug}/bonus` });
        if (route.length === 3) {
          html = renderSetBonusListPage(model.questionSet.slug);
        } else {
          const bonus = getBonusBySlug(route[3]);
          if (bonus) breadcrumbs.push({ label: bonus.answerSummary || "Bonus" });
          html = renderSetBonusDetailPage(model.questionSet.slug, route[3]);
        }
      } else if (route[2] === "team") {
        breadcrumbs.push({ label: "Teams", path: `set/${model.questionSet.slug}/team` });
        if (route.length === 3) {
          html = renderTeamListPage("set", model.questionSet.slug);
        } else if (route.length === 5 && route[4] === "bonus") {
          const team = getTeamBySlug(route[3]);
          if (team) {
            breadcrumbs.push({ label: team.name, path: `set/${model.questionSet.slug}/team/${route[3]}` });
          }
          breadcrumbs.push({ label: "Bonuses" });
          html = renderSetTeamBonusPage(model.questionSet.slug, route[3]);
        } else {
          const team = getTeamBySlug(route[3]);
          if (team) breadcrumbs.push({ label: team.name });
          html = renderTeamDetailPage("set", model.questionSet.slug, route[3]);
        }
      } else if (route[2] === "player") {
        breadcrumbs.push({ label: "Players", path: `set/${model.questionSet.slug}/player` });
        if (route.length === 3) {
          html = renderPlayerListPage("set", model.questionSet.slug);
        } else if (route.length === 5 && route[4] === "buzz") {
          const player = getPlayerBySlug(route[3]);
          if (player) {
            breadcrumbs.push({ label: player.name, path: `set/${model.questionSet.slug}/player/${route[3]}` });
          }
          breadcrumbs.push({ label: "Buzzes" });
          html = renderSetPlayerBuzzPage(model.questionSet.slug, route[3]);
        } else {
          const player = getPlayerBySlug(route[3]);
          if (player) breadcrumbs.push({ label: player.name });
          html = renderPlayerDetailPage("set", model.questionSet.slug, route[3]);
        }
      } else {
        html = renderNotFound();
      }
    } else {
      html = renderNotFound();
    }
  } else if (route[0] === "tournament") {
    breadcrumbs = [{ label: "Home", path: "home" }, { label: "Tournaments", path: "tournament" }];

    if (route.length === 1) {
      html = renderTournamentListPage();
    } else if (route[1] === model.tournament.slug) {
      breadcrumbs.push({ label: model.tournament.name, path: `tournament/${model.tournament.slug}` });

      if (route.length === 2) {
        html = renderTournamentDetailPage(route[1]);
      } else if (route[2] === "category-tossup") {
        breadcrumbs.push({ label: "Categories (Tossup)", path: `tournament/${model.tournament.slug}/category-tossup` });
        if (route.length === 3) {
          html = renderCategoryTossupListPage("tournament", model.tournament.slug);
        } else {
          breadcrumbs.push({ label: decodeURIComponent(route[3] || "") });
          html = renderCategoryTossupDetailPage("tournament", model.tournament.slug, route[3]);
        }
      } else if (route[2] === "category-bonus") {
        breadcrumbs.push({ label: "Categories (Bonus)", path: `tournament/${model.tournament.slug}/category-bonus` });
        if (route.length === 3) {
          html = renderCategoryBonusListPage("tournament", model.tournament.slug);
        } else {
          breadcrumbs.push({ label: decodeURIComponent(route[3] || "") });
          html = renderCategoryBonusDetailPage("tournament", model.tournament.slug, route[3]);
        }
      } else if (route[2] === "tossup") {
        breadcrumbs.push({ label: "Tossups", path: `tournament/${model.tournament.slug}/tossup` });
        if (route.length === 3) {
          html = renderTournamentTossupListPage(model.tournament.slug);
        } else {
          const tossup = getTournamentTossup(route[3], route[4]);
          if (tossup) breadcrumbs.push({ label: tossup.answerPrimary || "Tossup" });
          html = renderTournamentTossupDetailPage(model.tournament.slug, route[3], route[4]);
        }
      } else if (route[2] === "bonus") {
        breadcrumbs.push({ label: "Bonuses", path: `tournament/${model.tournament.slug}/bonus` });
        if (route.length === 3) {
          html = renderTournamentBonusListPage(model.tournament.slug);
        } else {
          const bonus = getTournamentBonus(route[3], route[4]);
          if (bonus) breadcrumbs.push({ label: bonus.answerSummary || "Bonus" });
          html = renderTournamentBonusDetailPage(model.tournament.slug, route[3], route[4]);
        }
      } else if (route[2] === "team") {
        breadcrumbs.push({ label: "Teams", path: `tournament/${model.tournament.slug}/team` });
        if (route.length === 3) {
          html = renderTeamListPage("tournament", model.tournament.slug);
        } else {
          const team = getTeamBySlug(route[3]);
          if (team) breadcrumbs.push({ label: team.name });
          html = renderTeamDetailPage("tournament", model.tournament.slug, route[3]);
        }
      } else if (route[2] === "player") {
        breadcrumbs.push({ label: "Players", path: `tournament/${model.tournament.slug}/player` });
        if (route.length === 3) {
          html = renderPlayerListPage("tournament", model.tournament.slug);
        } else {
          const player = getPlayerBySlug(route[3]);
          if (player) breadcrumbs.push({ label: player.name });
          html = renderPlayerDetailPage("tournament", model.tournament.slug, route[3]);
        }
      } else {
        html = renderNotFound();
      }
    } else {
      html = renderNotFound();
    }
  } else {
    html = renderNotFound();
  }

  dom.breadcrumbs.classList.add("hidden");
  renderBreadcrumbs(breadcrumbs);
  dom.routeContent.innerHTML = html;
  setupSortableTables();
  wireTossupBuzzHoverInteractions();
}

function activateModel(megaJson) {
  const model = buildModel(megaJson);
  state.megaJson = megaJson;
  state.model = model;
  dom.viewer.classList.remove("hidden");
  dom.loaderSection.classList.add("hidden");
  dom.toggleLoaderBtn.textContent = "Load a different tournament JSON";

  if (!window.location.hash) {
    window.location.hash = "#/home";
  } else {
    renderRoute();
  }

  if (model.unmatchedPackets.length) {
    setStatus(`Loaded with warnings: ${model.unmatchedPackets.length} QBJ file(s) used fallback packet matching.`, "error");
  } else {
    setStatus("Mega JSON loaded. Navigate via Home / Question Sets / Tournaments.", "ok");
  }
}

async function loadMegaJsonFromFile(file) {
  const parsed = await parseJsonFile(file);
  const sourceData = isEncryptedMegaContainer(parsed)
    ? decryptMegaContainer(parsed)
    : parsed;
  const megaJson = normalizeMegaJson(sourceData);
  activateModel(megaJson);
}

function toggleLoader(forceOpen = false) {
  if (forceOpen) {
    dom.loaderSection.classList.remove("hidden");
    return;
  }

  dom.loaderSection.classList.toggle("hidden");
}

function wireEvents() {
  renderAppNav(parseRoute());

  dom.toggleLoaderBtn.addEventListener("click", () => {
    toggleLoader();
  });

  dom.loadMegaBtn.addEventListener("click", async () => {
    try {
      if (!dom.termsCheckbox?.checked) {
        throw new Error("You must acknowledge the terms before loading tournament data.");
      }

      const file = dom.megaJsonInput.files[0];
      if (!file) throw new Error("Please select a mega JSON file first.");
      setStatus("Loading mega JSON...");
      await loadMegaJsonFromFile(file);
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  window.addEventListener("hashchange", renderRoute);
}

wireEvents();
