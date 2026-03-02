// ---------- Constants & helpers ----------

const STORAGE_KEYS = {
    SETTINGS: "amq_solo_settings",
    HIDDEN: "amq_solo_hidden",
    VOLUME: "amq_solo_volume",
    MUTED: "amq_solo_muted",
    REPEAT: "amq_solo_repeat",
    SHUFFLE: "amq_solo_shuffle",
};

const DEFAULT_SETTINGS = (() => {
    const currentYear = new Date().getFullYear();
    return {
        server: "EU", // EU, NAE, NAW
        quality: "HQ", // HQ, MQ, AUDIO
        titlePref: "romaji", // romaji, english
        songType: "all", // all, op, ed, ins
        missingMedia: "include", // include, exclude, only
        dub: "include", // include, exclude, only
        rebroadcast: "include", // include, exclude, only
        diffMin: 0,
        diffMax: 100,
        yearMin: 1924,
        yearMax: currentYear,
    };
})();

const SERVER_URLS = {
    EU: "https://eudist.animemusicquiz.com",
    NAE: "https://naedist.animemusicquiz.com",
    NAW: "https://nawdist.animemusicquiz.com",
};

const QUALITY_ORDER = {
    HQ: ["HQ", "MQ", "AUDIO"],
    MQ: ["MQ", "HQ", "AUDIO"],
    AUDIO: ["AUDIO", "MQ", "HQ"],
};

const SONGS_PER_PAGE = 20;

function loadJSONSafe(str) {
    try {
        return JSON.parse(str);
    } catch {
        return null;
    }
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function isNumber(n) {
    return typeof n === "number" && !isNaN(n);
}

function parseVintage(vintage) {
    // "Fall 2020" -> { season: "Fall", year: 2020 }
    if (!vintage || typeof vintage !== "string") {
        return { season: "", year: null };
    }
    const parts = vintage.trim().split(/\s+/);
    if (parts.length >= 2) {
        const year = parseInt(parts[parts.length - 1], 10);
        const season = parts.slice(0, parts.length - 1).join(" ");
        return { season, year: isNaN(year) ? null : year };
    }
    const year = parseInt(vintage, 10);
    return { season: "", year: isNaN(year) ? null : year };
}

function mapTypeJson1(type, typeNumber) {
    if (type === 1) return "Opening " + (typeNumber || "");
    if (type === 2) return "Ending " + (typeNumber || "");
    if (type === 3) return "Insert";
    return "";
}

function normalizeSongFromJson1(entry) {
    const info = entry.songInfo || {};
    const annSongId = info.annSongId ?? entry.annSongId;
    const animeENName = info.animeNames?.english || "";
    const animeJPName = info.animeNames?.romaji || "";
    const songName = info.songName || "";
    const songArtist = info.artist || "";
    const songComposer = info.composerInfo?.name || "";
    const songArranger = info.arrangerInfo?.name || "";
    const songType = mapTypeJson1(info.type, info.typeNumber);
    const vintage = info.vintage || "";
    const { season, year } = parseVintage(vintage);
    const songDifficulty = info.animeDifficulty ?? null;
    const isRebroadcast = !!info.rebroadcast;
    const isDub = !!info.dub;
    const videoUrl = entry.videoUrl || null;

    let media = { HQ: null, MQ: null, AUDIO: null };
    if (videoUrl) {
        const url = videoUrl.trim();
        const filename = url.split("/").pop();
        const ext = filename ? filename.split(".").pop().toLowerCase() : "";
        media.sourceType = ext === "mp3" ? "audio" : "video";
        media.filename = filename;
        media.rawUrl = url;
    } else {
        media.sourceType = null;
        media.filename = null;
        media.rawUrl = null;
    }

    return {
        annSongId,
        animeENName,
        animeJPName,
        songName,
        songArtist,
        songComposer,
        songArranger,
        songType,
        vintage,
        season,
        year,
        songDifficulty,
        isRebroadcast,
        isDub,
        media,
        format: 1,
    };
}

function normalizeSongFromJson2(entry) {
    const annSongId = entry.annSongId;
    const animeENName = entry.animeENName || "";
    const animeJPName = entry.animeJPName || "";
    const songName = entry.songName || "";
    const songArtist = entry.songArtist || "";
    const songComposer = entry.songComposer || "";
    const songArranger = entry.songArranger || "";
    const songType = entry.songType || "";
    const vintage = entry.animeVintage || "";
    const { season, year } = parseVintage(vintage);
    const songDifficulty = entry.songDifficulty ?? null;
    const isRebroadcast = !!entry.isRebroadcast;
    const isDub = !!entry.isDub;

    const media = {
        HQ: entry.HQ || null,
        MQ: entry.MQ || null,
        AUDIO: entry.audio || entry.Audio || entry.audioFile || entry.AudioFile || entry.audio || null,
        sourceType: null,
        filename: null,
        rawUrl: null,
    };

    return {
        annSongId,
        animeENName,
        animeJPName,
        songName,
        songArtist,
        songComposer,
        songArranger,
        songType,
        vintage,
        season,
        year,
        songDifficulty,
        isRebroadcast,
        isDub,
        media,
        format: 2,
    };
}

function detectAndNormalizeJson(data) {
    const songs = [];

    function pushIfNotDup(song) {
        if (!song || song.annSongId == null) return;
        if (songs.some((s) => s.annSongId === song.annSongId)) return;
        songs.push(song);
    }

    if (Array.isArray(data)) {
        // Could be pure json2 array
        if (data.length && data[0].annSongId && data[0].songName && data[0].songArtist) {
            data.forEach((e) => pushIfNotDup(normalizeSongFromJson2(e)));
        } else {
            // maybe array of json1 songs?
            data.forEach((e) => {
                if (e.songInfo) pushIfNotDup(normalizeSongFromJson1(e));
            });
        }
    } else if (data && typeof data === "object") {
        // json1 room object
        if (Array.isArray(data.songs)) {
            data.songs.forEach((e) => pushIfNotDup(normalizeSongFromJson1(e)));
        }
    }

    return songs;
}

function buildMediaUrl(song, settings) {
    const serverBase = SERVER_URLS[settings.server] || SERVER_URLS.EU;

    if (song.format === 1) {
        if (!song.media.filename) return null;
        const filename = song.media.filename;
        return {
            url: serverBase + "/" + filename,
            type: song.media.sourceType === "audio" ? "audio" : "video",
        };
    }

    // format 2
    const order = QUALITY_ORDER[settings.quality] || QUALITY_ORDER.HQ;
    let chosen = null;
    for (const q of order) {
        const key = q === "AUDIO" ? "AUDIO" : q;
        const file = song.media[key];
        if (file) {
            chosen = { quality: q, file };
            break;
        }
    }
    if (!chosen) return null;

    const filename = chosen.file;
    const ext = filename.split(".").pop().toLowerCase();
    const type = ext === "mp3" ? "audio" : "video";
    return {
        url: serverBase + "/" + filename,
        type,
    };
}

function formatSongType(song) {
    if (!song.songType) return "";
    return song.songType;
}

function formatSeasonYear(song) {
    if (!song.year && !song.season) return "";
    if (song.season && song.year) return song.season + " " + song.year;
    if (song.year) return String(song.year);
    return song.season;
}

function formatDifficulty(song) {
    if (!isNumber(song.songDifficulty)) return "";
    return "Diff " + song.songDifficulty.toFixed(1);
}

function formatSongLabel(song, settings) {
    const prefFirst = settings.titlePref === "english" ? song.animeENName : song.animeJPName;
    const prefSecond = settings.titlePref === "english" ? song.animeJPName : song.animeENName;
    const main = prefFirst || prefSecond || "Unknown anime";
    const sub = prefFirst && prefSecond && prefFirst !== prefSecond ? prefSecond : "";
    return { main, sub };
}

// ---------- State ----------

const state = {
    allSongs: [],
    filteredSongs: [],
    currentIndex: -1,
    settings: { ...DEFAULT_SETTINGS },
    hiddenIds: new Set(),
    playlistVisible: false,
    pageIndex: 0,
    shuffleHistory: [],
    shuffleIndex: -1,
    mediaElement: null,
};

// ---------- Persistence ----------

function loadSettings() {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            state.settings = { ...DEFAULT_SETTINGS, ...parsed };
        } catch {
            state.settings = { ...DEFAULT_SETTINGS };
        }
    } else {
        state.settings = { ...DEFAULT_SETTINGS };
    }

    const hiddenRaw = localStorage.getItem(STORAGE_KEYS.HIDDEN);
    if (hiddenRaw) {
        try {
            const arr = JSON.parse(hiddenRaw);
            if (Array.isArray(arr)) {
                state.hiddenIds = new Set(arr);
            }
        } catch {
            state.hiddenIds = new Set();
        }
    }

    const volRaw = localStorage.getItem(STORAGE_KEYS.VOLUME);
    if (volRaw != null) {
        const v = parseFloat(volRaw);
        if (!isNaN(v)) {
            state.volume = clamp(v, 0, 1);
        }
    } else {
        state.volume = 1;
    }

    const mutedRaw = localStorage.getItem(STORAGE_KEYS.MUTED);
    state.muted = mutedRaw === "true";

    const repeatRaw = localStorage.getItem(STORAGE_KEYS.REPEAT);
    state.repeat = repeatRaw === "true";

    const shuffleRaw = localStorage.getItem(STORAGE_KEYS.SHUFFLE);
    state.shuffle = shuffleRaw === "true";
}

function saveSettings() {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(state.settings));
}

function saveHidden() {
    localStorage.setItem(STORAGE_KEYS.HIDDEN, JSON.stringify(Array.from(state.hiddenIds)));
}

function saveVolume() {
    localStorage.setItem(STORAGE_KEYS.VOLUME, String(state.volume));
}

function saveMuted() {
    localStorage.setItem(STORAGE_KEYS.MUTED, state.muted ? "true" : "false");
}

function saveRepeat() {
    localStorage.setItem(STORAGE_KEYS.REPEAT, state.repeat ? "true" : "false");
}

function saveShuffle() {
    localStorage.setItem(STORAGE_KEYS.SHUFFLE, state.shuffle ? "true" : "false");
}

// ---------- Filtering ----------

function songMatchesFilters(song) {
    const s = state.settings;

    // Hidden
    if (state.hiddenIds.has(song.annSongId)) return false;

    // Song type
    if (s.songType === "op") {
        if (!(song.songType && (song.songType.includes("Opening") || song.songType.includes("OP") || song.format === 1 && song.songType.startsWith("Opening")))) {
            return false;
        }
    } else if (s.songType === "ed") {
        if (!(song.songType && (song.songType.includes("Ending") || song.songType.includes("ED") || song.format === 1 && song.songType.startsWith("Ending")))) {
            return false;
        }
    } else if (s.songType === "ins") {
        if (!(song.songType && song.songType.toLowerCase().includes("insert"))) {
            return false;
        }
    }

    // Missing media
    const mediaUrl = buildMediaUrl(song, s);
    const hasMedia = !!mediaUrl;
    if (s.missingMedia === "exclude" && !hasMedia) return false;
    if (s.missingMedia === "only" && hasMedia) return false;

    // Dub
    if (s.dub === "exclude" && song.isDub) return false;
    if (s.dub === "only" && !song.isDub) return false;

    // Rebroadcast
    if (s.rebroadcast === "exclude" && song.isRebroadcast) return false;
    if (s.rebroadcast === "only" && !song.isRebroadcast) return false;

    // Difficulty
    if (isNumber(song.songDifficulty)) {
        if (song.songDifficulty < s.diffMin || song.songDifficulty > s.diffMax) return false;
    }

    // Year
    if (song.year != null) {
        if (song.year < s.yearMin || song.year > s.yearMax) return false;
    }

    return true;
}

function applyFiltersAndMaintainCurrent() {
    const prevSong = state.filteredSongs[state.currentIndex] || null;
    const prevAnnSongId = prevSong ? prevSong.annSongId : null;

    // Apply filters
    state.filteredSongs = state.allSongs.filter(songMatchesFilters);

    let newIndex = -1;

    // Try to restore previous song if it still exists
    if (prevAnnSongId != null) {
        newIndex = state.filteredSongs.findIndex(s => s.annSongId === prevAnnSongId);
    }

    // If previous song is gone, choose next/previous depending on context
    if (newIndex === -1 && state.filteredSongs.length > 0) {

        // Case 1: list was empty before → always go to first song
        if (prevAnnSongId == null) {
            newIndex = 0;

            // Case 2: hiding a song → use next or previous
        } else if (state.currentIndex < state.filteredSongs.length) {
            newIndex = state.currentIndex; // next song
        } else {
            newIndex = state.filteredSongs.length - 1; // previous song
        }
    }

    state.currentIndex = newIndex;

    // Reset shuffle history whenever the list changes
    resetShuffleHistory();

    // If we have a valid song, load it
    if (state.currentIndex >= 0) {
        ensurePageForCurrent();
        renderAll();
        playCurrentSong(true);
        return;
    }

    // No songs left
    renderAll();
    clearMedia();
}

// ---------- Media ----------

function clearMedia() {
    const wrapper = document.getElementById("mediaWrapper");
    wrapper.innerHTML = "";
    const placeholder = document.createElement("div");
    placeholder.className = "media-placeholder";
    placeholder.textContent = "No song loaded.";
    wrapper.appendChild(placeholder);
    state.mediaElement = null;
}

function createMediaElement(urlInfo) {
    const wrapper = document.getElementById("mediaWrapper");
    wrapper.innerHTML = "";

    if (!urlInfo) {
        const placeholder = document.createElement("div");
        placeholder.className = "media-placeholder";
        placeholder.textContent = "Missing Video/Audio media.";
        wrapper.appendChild(placeholder);
        state.mediaElement = null;
        return;
    }

    let el;
    if (urlInfo.type === "audio") {
        el = document.createElement("audio");
        el.controls = true;
    } else {
        el = document.createElement("video");
        el.controls = true;
    }
    el.src = urlInfo.url;
    el.autoplay = true;
    el.preload = "auto";
    el.style.backgroundColor = "#000";

    el.volume = state.volume != null ? state.volume : 1;
    el.muted = !!state.muted;

    el.addEventListener("volumechange", () => {
        state.volume = el.volume;
        state.muted = el.muted;
        saveVolume();
        saveMuted();
    });

    el.addEventListener("ended", () => {
        if (state.repeat) {
            el.currentTime = 0;
            el.play();
        } else {
            goNext(true);
        }
    });

    wrapper.appendChild(el);
    state.mediaElement = el;
}

function playCurrentSong(autoplay = true) {
    if (state.currentIndex < 0 || state.currentIndex >= state.filteredSongs.length) {
        clearMedia();
        return;
    }
    const song = state.filteredSongs[state.currentIndex];
    const urlInfo = buildMediaUrl(song, state.settings);
    createMediaElement(urlInfo);

    if (state.mediaElement) {
        state.mediaElement.autoplay = true;
        if (autoplay) {
            state.mediaElement.play().catch(() => { });
        }
    }

    updateSongInfo();
    updateSongCounter();
    updatePlaylistUI();
    updateDocumentTitle();
}

function togglePlayPause() {
    if (!state.mediaElement) return;
    if (state.mediaElement.paused) {
        state.mediaElement.play().catch(() => { });
    } else {
        state.mediaElement.pause();
    }
}

function toggleMute() {
    state.muted = !state.muted;
    if (state.mediaElement) {
        state.mediaElement.muted = state.muted;
    }
    saveMuted();
}

function setVolume(v) {
    state.volume = clamp(v, 0, 1);
    if (state.mediaElement) {
        state.mediaElement.volume = state.volume;
    }
    saveVolume();
}

// ---------- Navigation ----------

function resetShuffleHistory() {
    state.shuffleHistory = [];
    state.shuffleIndex = -1;
}

function goToIndex(idx, fromUser = false) {
    if (state.filteredSongs.length === 0) {
        state.currentIndex = -1;
        renderAll();
        clearMedia();
        return;
    }
    if (idx < 0) idx = 0;
    if (idx >= state.filteredSongs.length) idx = state.filteredSongs.length - 1;

    if (state.shuffle && fromUser) {
        // When user directly jumps, treat as new shuffle start
        resetShuffleHistory();
    }

    state.currentIndex = idx;
    ensurePageForCurrent();
    playCurrentSong(true);
}

function goNext(fromAuto = false) {
    if (state.filteredSongs.length === 0) return;

    if (state.shuffle) {
        if (fromAuto || !fromAuto) {
            if (state.shuffleIndex < state.shuffleHistory.length - 1) {
                state.shuffleIndex++;
                state.currentIndex = state.shuffleHistory[state.shuffleIndex];
            } else {
                let nextIndex;
                if (state.filteredSongs.length === 1) {
                    nextIndex = 0;
                } else {
                    do {
                        nextIndex = Math.floor(Math.random() * state.filteredSongs.length);
                    } while (nextIndex === state.currentIndex && state.filteredSongs.length > 1);
                }
                state.currentIndex = nextIndex;
                state.shuffleHistory.push(nextIndex);
                state.shuffleIndex = state.shuffleHistory.length - 1;
            }
        }
    } else {
        let idx = state.currentIndex + 1;
        if (idx >= state.filteredSongs.length) idx = 0;
        state.currentIndex = idx;
    }

    ensurePageForCurrent();
    playCurrentSong(true);
}

function goPrev() {
    if (state.filteredSongs.length === 0) return;

    if (state.shuffle) {
        if (state.shuffleIndex > 0) {
            state.shuffleIndex--;
            state.currentIndex = state.shuffleHistory[state.shuffleIndex];
        } else {
            // no history, just go previous in list
            let idx = state.currentIndex - 1;
            if (idx < 0) idx = state.filteredSongs.length - 1;
            state.currentIndex = idx;
            resetShuffleHistory();
        }
    } else {
        let idx = state.currentIndex - 1;
        if (idx < 0) idx = state.filteredSongs.length - 1;
        state.currentIndex = idx;
    }

    ensurePageForCurrent();
    playCurrentSong(true);
}

function ensurePageForCurrent() {
    if (state.currentIndex < 0) {
        state.pageIndex = 0;
        return;
    }
    const page = Math.floor(state.currentIndex / SONGS_PER_PAGE);
    state.pageIndex = page;
}

// ---------- Hidden entries ----------

function hideCurrentSong() {
    if (state.currentIndex < 0 || state.currentIndex >= state.filteredSongs.length) return;
    const song = state.filteredSongs[state.currentIndex];
    state.hiddenIds.add(song.annSongId);
    saveHidden();

    const allIndex = state.allSongs.findIndex((s) => s.annSongId === song.annSongId);
    if (allIndex >= 0) {
        // nothing else needed; filter will remove it
    }

    const wasLast = state.currentIndex === state.filteredSongs.length - 1;
    applyFiltersAndMaintainCurrent();
    if (state.filteredSongs.length === 0) {
        clearMedia();
    } else {
        if (wasLast && state.currentIndex === -1) {
            state.currentIndex = state.filteredSongs.length - 1;
            playCurrentSong(true);
        }
    }
    renderHiddenList();
}

function unhideSong(annSongId) {
    state.hiddenIds.delete(annSongId);
    saveHidden();
    applyFiltersAndMaintainCurrent();
    renderHiddenList();
}

function clearAllHidden() {
    if (!Array.from(state.hiddenIds).length) return;
    state.hiddenIds.clear();
    saveHidden();
    applyFiltersAndMaintainCurrent();
    renderHiddenList();
}

// ---------- Playlist ----------

function removeSongFromPlaylist(annSongId) {
    const idxAll = state.allSongs.findIndex((s) => s.annSongId === annSongId);
    if (idxAll >= 0) {
        state.allSongs.splice(idxAll, 1);
    }
    const currentSong = state.filteredSongs[state.currentIndex] || null;
    const currentId = currentSong ? currentSong.annSongId : null;

    applyFiltersAndMaintainCurrent();

    if (currentId != null) {
        const newIndex = state.filteredSongs.findIndex((s) => s.annSongId === currentId);
        if (newIndex >= 0) {
            state.currentIndex = newIndex;
            ensurePageForCurrent();
            playCurrentSong(true);
        } else if (state.filteredSongs.length > 0) {
            state.currentIndex = 0;
            ensurePageForCurrent();
            playCurrentSong(true);
        } else {
            clearMedia();
        }
    } else if (state.filteredSongs.length > 0) {
        state.currentIndex = 0;
        ensurePageForCurrent();
        playCurrentSong(true);
    } else {
        clearMedia();
    }
}

function clearPlaylist() {
    state.allSongs = [];
    state.filteredSongs = [];
    state.currentIndex = -1;
    resetShuffleHistory();
    renderAll();
    clearMedia();
}

// ---------- Settings UI ----------

function setPillGroupActive(groupEl, value) {
    const pills = groupEl.querySelectorAll(".pill");
    pills.forEach((p) => {
        if (p.dataset.value === value) p.classList.add("active");
        else p.classList.remove("active");
    });
}

function initSettingsUI() {
    const s = state.settings;

    setPillGroupActive(document.getElementById("serverGroup"), s.server);
    setPillGroupActive(document.getElementById("qualityGroup"), s.quality);
    setPillGroupActive(document.getElementById("titlePrefGroup"), s.titlePref);
    setPillGroupActive(document.getElementById("songTypeGroup"), s.songType);
    setPillGroupActive(document.getElementById("missingMediaGroup"), s.missingMedia);
    setPillGroupActive(document.getElementById("dubGroup"), s.dub);
    setPillGroupActive(document.getElementById("rebroadcastGroup"), s.rebroadcast);

    document.getElementById("diffMinInput").value = s.diffMin;
    document.getElementById("diffMaxInput").value = s.diffMax;
    document.getElementById("yearMinInput").value = s.yearMin;
    document.getElementById("yearMaxInput").value = s.yearMax;

    updateRepeatButton();
    updateShuffleButton();
}

function updateRepeatButton() {
    const btn = document.getElementById("repeatBtn");
    if (state.repeat) btn.classList.add("active");
    else btn.classList.remove("active");
}

function updateShuffleButton() {
    const btn = document.getElementById("shuffleBtn");
    if (state.shuffle) btn.classList.add("active");
    else btn.classList.remove("active");
}

function normalizeRangeInputs() {
    const s = state.settings;
    const diffMinEl = document.getElementById("diffMinInput");
    const diffMaxEl = document.getElementById("diffMaxInput");
    const yearMinEl = document.getElementById("yearMinInput");
    const yearMaxEl = document.getElementById("yearMaxInput");

    let dMin = parseFloat(diffMinEl.value);
    let dMax = parseFloat(diffMaxEl.value);
    if (isNaN(dMin)) dMin = 0;
    if (isNaN(dMax)) dMax = 100;
    dMin = clamp(dMin, 0, 100);
    dMax = clamp(dMax, 0, 100);
    if (dMin > dMax) {
        const tmp = dMin;
        dMin = dMax;
        dMax = tmp;
    }

    const currentYear = new Date().getFullYear();
    let yMin = parseInt(yearMinEl.value, 10);
    let yMax = parseInt(yearMaxEl.value, 10);
    if (isNaN(yMin)) yMin = 1924;
    if (isNaN(yMax)) yMax = currentYear;
    yMin = clamp(yMin, 1924, currentYear);
    yMax = clamp(yMax, 1924, currentYear);
    if (yMin > yMax) {
        const tmp = yMin;
        yMin = yMax;
        yMax = tmp;
    }

    diffMinEl.value = dMin;
    diffMaxEl.value = dMax;
    yearMinEl.value = yMin;
    yearMaxEl.value = yMax;

    s.diffMin = dMin;
    s.diffMax = dMax;
    s.yearMin = yMin;
    s.yearMax = yMax;
    saveSettings();
}

// ---------- Rendering ----------

function updateSongCounter() {
    const el = document.getElementById("songCounter");
    const total = state.filteredSongs.length;
    const idx = state.currentIndex >= 0 ? state.currentIndex + 1 : 0;
    el.textContent = idx + " / " + total;
}

function updateSongInfo() {
    const titleMainEl = document.getElementById("animeTitleMain");
    const titleSubEl = document.getElementById("animeTitleSub");
    const metaEl = document.getElementById("songMeta");

    if (state.currentIndex < 0 || state.currentIndex >= state.filteredSongs.length) {
        titleMainEl.textContent = "—";
        titleSubEl.textContent = "";
        metaEl.innerHTML = "";
        return;
    }

    const song = state.filteredSongs[state.currentIndex];
    const label = formatSongLabel(song, state.settings);
    titleMainEl.textContent = label.main;
    titleSubEl.textContent = label.sub;

    const metaParts = [];

    if (song.songName) metaParts.push(`<span>${song.songName}</span>`);
    if (song.songArtist) metaParts.push(`<span>Artist: ${song.songArtist}</span>`);
    if (song.songComposer) metaParts.push(`<span>Composer: ${song.songComposer}</span>`);
    if (song.songArranger) metaParts.push(`<span>Arranger: ${song.songArranger}</span>`);
    const st = formatSongType(song);
    if (st) metaParts.push(`<span>${st}</span>`);
    const sy = formatSeasonYear(song);
    if (sy) metaParts.push(`<span>${sy}</span>`);
    const diff = formatDifficulty(song);
    if (diff) metaParts.push(`<span>${diff}</span>`);

    metaEl.innerHTML = metaParts.join("");
}

function updatePlaylistUI() {
    const listEl = document.getElementById("playlistList");
    listEl.innerHTML = "";

    const total = state.filteredSongs.length;
    const totalPages = total === 0 ? 1 : Math.ceil(total / SONGS_PER_PAGE);
    const page = clamp(state.pageIndex, 0, totalPages - 1);
    state.pageIndex = page;

    const start = page * SONGS_PER_PAGE;
    const end = Math.min(start + SONGS_PER_PAGE, total);

    for (let i = start; i < end; i++) {
        const song = state.filteredSongs[i];
        const item = document.createElement("div");
        item.className = "playlist-item";
        if (i === state.currentIndex) item.classList.add("active");

        const label = formatSongLabel(song, state.settings);

        const main = document.createElement("div");
        main.className = "playlist-item-main";

        const title = document.createElement("div");
        title.className = "playlist-item-title";
        title.textContent = label.main;

        const sub = document.createElement("div");
        sub.className = "playlist-item-sub";
        const bits = [];
        if (song.songName) bits.push(song.songName);
        if (song.songArtist) bits.push(song.songArtist)
        sub.textContent = bits.join(" • ");

        main.appendChild(title);
        main.appendChild(sub);

        const removeBtn = document.createElement("button");
        removeBtn.className = "playlist-item-remove";
        removeBtn.textContent = "✕";
        removeBtn.title = "Remove from playlist";

        removeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            removeSongFromPlaylist(song.annSongId);
        });

        item.appendChild(main);
        item.appendChild(removeBtn);

        item.addEventListener("click", () => {
            const idx = state.filteredSongs.findIndex((s) => s.annSongId === song.annSongId);
            if (idx >= 0) {
                goToIndex(idx, true);
            }
        });

        listEl.appendChild(item);
    }

    document.getElementById("pageInfo").textContent = (total === 0 ? 0 : page + 1) + " / " + (total === 0 ? 0 : totalPages);
    document.getElementById("playlistCountInfo").textContent = total + " songs";

    const body = document.getElementById("playlistBody");
    body.classList.toggle("hidden", !state.playlistVisible);
}

function renderHiddenList() {
    const listEl = document.getElementById("hiddenList");
    listEl.innerHTML = "";
    const hiddenIds = Array.from(state.hiddenIds);
    if (hiddenIds.length === 0) {
        const empty = document.createElement("div");
        empty.className = "hidden-item";
        empty.textContent = "No hidden entries.";
        listEl.appendChild(empty);
        return;
    }

    hiddenIds.forEach((id) => {
        const song = state.allSongs.find((s) => s.annSongId === id);
        const item = document.createElement("div");
        item.className = "hidden-item";

        const label = document.createElement("div");
        label.textContent = song ? (song.animeENName || song.animeJPName || "Unknown") : "Unknown";

        const btn = document.createElement("button");
        btn.className = "btn btn-icon";
        btn.textContent = "Unhide";
        btn.addEventListener("click", () => unhideSong(id));

        item.appendChild(label);
        item.appendChild(btn);
        listEl.appendChild(item);
    });
}

function updateDocumentTitle() {
    if (state.currentIndex < 0 || state.currentIndex >= state.filteredSongs.length) {
        document.title = "Anime Media Player";
        return;
    }
    const song = state.filteredSongs[state.currentIndex];
    const prefFirst = state.settings.titlePref === "english" ? song.animeENName : song.animeJPName;
    const prefSecond = state.settings.titlePref === "english" ? song.animeJPName : song.animeENName;
    const animeTitle = prefFirst || prefSecond || "Unknown anime";
    const parts = [animeTitle];
    if (song.songName) parts.push(song.songName);
    if (song.songArtist) parts.push(song.songArtist);
    document.title = parts.join(" - ");
}

function renderAll() {
    updateSongCounter();
    updateSongInfo();
    updatePlaylistUI();
    renderHiddenList();
}

// ---------- Event wiring ----------

function setupEvents() {
    const fileInput = document.getElementById("jsonLoader");
    fileInput.addEventListener("change", async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;

        const allSongs = [];
        for (const file of files) {
            const text = await file.text();
            const data = loadJSONSafe(text);
            if (!data) continue;
            const songs = detectAndNormalizeJson(data);
            songs.forEach((s) => {
                if (!allSongs.some((x) => x.annSongId === s.annSongId)) {
                    allSongs.push(s);
                }
            });
        }

        if (!allSongs.length) return;

        state.allSongs = allSongs;
        state.currentIndex = 0;
        resetShuffleHistory();
        applyFiltersAndMaintainCurrent();
        ensurePageForCurrent();
        renderAll();
        if (state.currentIndex >= 0) {
            playCurrentSong(true);
        }
        fileInput.value = "";
    });

    document.getElementById("prevBtn").addEventListener("click", () => goPrev());
    document.getElementById("nextBtn").addEventListener("click", () => goNext(false));
    document.getElementById("hideBtn").addEventListener("click", () => hideCurrentSong());

    document.getElementById("repeatBtn").addEventListener("click", () => {
        state.repeat = !state.repeat;
        saveRepeat();
        updateRepeatButton();
    });

    document.getElementById("shuffleBtn").addEventListener("click", () => {
        state.shuffle = !state.shuffle;
        saveShuffle();
        updateShuffleButton();
        resetShuffleHistory();
        if (state.currentIndex >= 0) {
            state.shuffleHistory.push(state.currentIndex);
            state.shuffleIndex = 0;
        }
    });

    const songIndexInput = document.getElementById("songIndexInput");
    songIndexInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            const val = parseInt(songIndexInput.value, 10);
            if (isNaN(val)) {
                songIndexInput.value = "";
                return;
            }
            if (state.filteredSongs.length === 0) {
                songIndexInput.value = "";
                return;
            }
            let idx = val - 1;
            if (idx < 0) idx = 0;
            if (idx >= state.filteredSongs.length) idx = state.filteredSongs.length - 1;
            songIndexInput.value = "";
            goToIndex(idx, true);
        }
    });

    document.getElementById("playlistToggle").addEventListener("click", () => {
        state.playlistVisible = !state.playlistVisible;
        updatePlaylistUI();
    });

    document.getElementById("clearPlaylistBtn").addEventListener("click", () => {
        clearPlaylist();
    });

    document.getElementById("pagePrevBtn").addEventListener("click", () => {
        const total = state.filteredSongs.length;
        if (!total) return;
        const totalPages = Math.ceil(total / SONGS_PER_PAGE);
        let page = state.pageIndex - 1;
        if (page < 0) page = 0;
        state.pageIndex = page;
        updatePlaylistUI();
    });

    document.getElementById("pageNextBtn").addEventListener("click", () => {
        const total = state.filteredSongs.length;
        if (!total) return;
        const totalPages = Math.ceil(total / SONGS_PER_PAGE);
        let page = state.pageIndex + 1;
        if (page >= totalPages) page = totalPages - 1;
        state.pageIndex = page;
        updatePlaylistUI();
    });

    const pageInput = document.getElementById("pageInput");
    pageInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            const total = state.filteredSongs.length;
            if (!total) {
                pageInput.value = "";
                return;
            }
            const totalPages = Math.ceil(total / SONGS_PER_PAGE);
            let val = parseInt(pageInput.value, 10);
            if (isNaN(val)) {
                pageInput.value = "";
                return;
            }
            if (val < 1) val = 1;
            if (val > totalPages) val = totalPages;
            state.pageIndex = val - 1;
            pageInput.value = "";
            updatePlaylistUI();
        }
    });

    // Settings drawer
    const settingsDrawer = document.getElementById("settingsDrawer");
    document.getElementById("settingsToggle").addEventListener("click", () => {
        settingsDrawer.classList.toggle("open");
    });
    document.getElementById("settingsCloseBtn").addEventListener("click", () => {
        settingsDrawer.classList.remove("open");
    });

    // Pill groups
    function bindPillGroup(id, key) {
        const group = document.getElementById(id);
        group.addEventListener("click", (e) => {
            const pill = e.target.closest(".pill");
            if (!pill) return;
            const value = pill.dataset.value;
            state.settings[key] = value;
            saveSettings();
            setPillGroupActive(group, value);

            if (key === "server" || key === "quality") {
                // media-related, apply immediately
                if (state.currentIndex >= 0) {
                    playCurrentSong(false);
                }
            } else if (key === "titlePref") {
                updateSongInfo();
                updatePlaylistUI();
                updateDocumentTitle();
            } else {
                // filters
                applyFiltersAndMaintainCurrent();
            }
        });
    }

    bindPillGroup("serverGroup", "server");
    bindPillGroup("qualityGroup", "quality");
    bindPillGroup("titlePrefGroup", "titlePref");
    bindPillGroup("songTypeGroup", "songType");
    bindPillGroup("missingMediaGroup", "missingMedia");
    bindPillGroup("dubGroup", "dub");
    bindPillGroup("rebroadcastGroup", "rebroadcast");

    // Range inputs
    ["diffMinInput", "diffMaxInput", "yearMinInput", "yearMaxInput"].forEach((id) => {
        const el = document.getElementById(id);
        el.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                normalizeRangeInputs();
            }
        });
    });

    document.getElementById("applyRangeBtn").addEventListener("click", () => {
        normalizeRangeInputs();
        applyFiltersAndMaintainCurrent();
    });

    // Hidden
    document.getElementById("clearHiddenBtn").addEventListener("click", () => {
        clearAllHidden();
    });

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
        const tag = e.target.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea") return;

        if (e.key === "ArrowLeft") {
            e.preventDefault();
            goPrev();
        } else if (e.key === "ArrowRight") {
            e.preventDefault();
            goNext(false);
        } else if (e.key === "h" || e.key === "H") {
            e.preventDefault();
            hideCurrentSong();
        } else if (e.key === "r" || e.key === "R") {
            e.preventDefault();
            state.repeat = !state.repeat;
            saveRepeat();
            updateRepeatButton();
        } else if (e.key === "s" || e.key === "S") {
            e.preventDefault();
            state.shuffle = !state.shuffle;
            saveShuffle();
            updateShuffleButton();
            resetShuffleHistory();
            if (state.currentIndex >= 0) {
                state.shuffleHistory.push(state.currentIndex);
                state.shuffleIndex = 0;
            }
        } else if (e.key === "m" || e.key === "M") {
            e.preventDefault();
            toggleMute();
        } else if (e.key === " ") {
            e.preventDefault();
            togglePlayPause();
        } else if (e.key === "p" || e.key === "P") {
            e.preventDefault();
            state.playlistVisible = !state.playlistVisible;
            updatePlaylistUI();
        } else if (e.key === "Tab") {
            e.preventDefault();
            settingsDrawer.classList.toggle("open");
        }
    });

    // Basic volume wheel on media wrapper
    document.getElementById("mediaWrapper").addEventListener("wheel", (e) => {
        if (!state.mediaElement) return;
        e.preventDefault();

        const delta = e.deltaY > 0 ? 0.05 : -0.05;
        let newVol = state.volume + delta;

        // Clamp between 0 and 1
        newVol = Math.min(1, Math.max(0, newVol));

        // Fix: prevent browser from jumping to 1 when increasing from 0
        if (state.volume === 0 && newVol > 0) {
            state.mediaElement.muted = false;
            state.muted = false;
            saveMuted();
        }

        setVolume(newVol);
    });
}

// ---------- Init ----------

function init() {
    loadSettings();
    initSettingsUI();
    renderAll();
    setupEvents();
}

init();