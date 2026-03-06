const STORAGE_KEYS = {
    liked: "amq_liked",
    disliked: "amq_disliked",
    learned: "amq_learned",
    settings: "amq_settings",
    volume: "amq_volume",
};

const DEFAULT_SETTINGS = {
    repeat: false,
    shuffle: false,
    server: "eudist.animemusicquiz.com",
    quality: "hq",
    namePref: "romaji",
    songType: "all",
    missingMedia: "include",
    dub: "include",
    rebroadcast: "include",
    minDiff: 0,
    maxDiff: 100,
    minYear: 1924,
    maxYear: new Date().getFullYear(),
};

let allSongs = [];
let filteredSongs = [];
let currentIndex = -1;
let shuffleHistory = [];
let shuffleFuture = [];
let likedSet = new Set();
let dislikedSet = new Set();
let learnedSet = new Set();
let settings = { ...DEFAULT_SETTINGS };
let currentMediaEl = null;
let currentVolume = 1.0;
let songCategory = "all";
let playlistTab = "all";
let playlistVisible = false;
let playlistPage = 1;
const PAGE_SIZE = 20;
let lastAnnSongIdBeforeFilter = null;

const jsonLoaderBtn = document.getElementById("jsonLoaderBtn");
const jsonFileInput = document.getElementById("jsonFileInput");
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const settingsBtn = document.getElementById("settingsBtn");
const settingsDrawer = document.getElementById("settingsDrawer");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");

const songIndexDisplay = document.getElementById("songIndexDisplay");
const songTotalDisplay = document.getElementById("songTotalDisplay");
const songIndexInput = document.getElementById("songIndexInput");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const repeatBtn = document.getElementById("repeatBtn");
const shuffleBtn = document.getElementById("shuffleBtn");
const likedBtn = document.getElementById("likedBtn");
const dislikedBtn = document.getElementById("dislikedBtn");
const learnedBtn = document.getElementById("learnedBtn");

const mediaShell = document.getElementById("mediaShell");
const mediaPlaceholder = document.getElementById("mediaPlaceholder");

const animeTitleMain = document.getElementById("animeTitleMain");
const animeTitleSub = document.getElementById("animeTitleSub");
const songNameLabel = document.getElementById("songNameLabel");
const songTypeLabel = document.getElementById("songTypeLabel");
const songSeasonLabel = document.getElementById("songSeasonLabel");
const songDiffLabel = document.getElementById("songDiffLabel");
const songArtistLabel = document.getElementById("songArtistLabel");
const songComposerLabel = document.getElementById("songComposerLabel");
const songArrangerLabel = document.getElementById("songArrangerLabel");

const playlistTabs = Array.from(
    document.querySelectorAll(".playlist-tab")
);
const togglePlaylistBtn = document.getElementById("togglePlaylistBtn");
const playlistContainer = document.getElementById("playlistContainer");
const playlistList = document.getElementById("playlistList");
const playlistSearchInput = document.getElementById(
    "playlistSearchInput"
);
const clearPlaylistBtn = document.getElementById("clearPlaylistBtn");
const pagePrevBtn = document.getElementById("pagePrevBtn");
const pageNextBtn = document.getElementById("pageNextBtn");
const pageInput = document.getElementById("pageInput");
const pageInfo = document.getElementById("pageInfo");

const serverSelect = document.getElementById("serverSelect");
const qualitySelect = document.getElementById("qualitySelect");
const namePrefSelect = document.getElementById("namePrefSelect");
const songTypeFilter = document.getElementById("songTypeFilter");
const missingMediaFilter = document.getElementById("missingMediaFilter");
const dubFilter = document.getElementById("dubFilter");
const rebroadcastFilter = document.getElementById("rebroadcastFilter");
const minDiffInput = document.getElementById("minDiffInput");
const maxDiffInput = document.getElementById("maxDiffInput");
const minYearInput = document.getElementById("minYearInput");
const maxYearInput = document.getElementById("maxYearInput");
const applyFiltersBtn = document.getElementById("applyFiltersBtn");

function loadPersistent() {
    try {
        const liked = JSON.parse(localStorage.getItem(STORAGE_KEYS.liked));
        const disliked = JSON.parse(
            localStorage.getItem(STORAGE_KEYS.disliked)
        );
        const learned = JSON.parse(localStorage.getItem(STORAGE_KEYS.learned));
        const st = JSON.parse(localStorage.getItem(STORAGE_KEYS.settings));
        const vol = localStorage.getItem(STORAGE_KEYS.volume);

        if (Array.isArray(liked)) likedSet = new Set(liked);
        if (Array.isArray(disliked)) dislikedSet = new Set(disliked);
        if (Array.isArray(learned)) learnedSet = new Set(learned);
        if (st && typeof st === "object") {
            settings = { ...DEFAULT_SETTINGS, ...st };
        }
        if (vol !== null) {
            const v = parseFloat(vol);
            if (!Number.isNaN(v)) currentVolume = Math.min(1, Math.max(0, v));
        }
    } catch (e) {
        console.warn("Failed to load persistent data", e);
    }
}

function savePersistent() {
    localStorage.setItem(
        STORAGE_KEYS.liked,
        JSON.stringify(Array.from(likedSet))
    );
    localStorage.setItem(
        STORAGE_KEYS.disliked,
        JSON.stringify(Array.from(dislikedSet))
    );
    localStorage.setItem(
        STORAGE_KEYS.learned,
        JSON.stringify(Array.from(learnedSet))
    );
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
    localStorage.setItem(STORAGE_KEYS.volume, String(currentVolume));
}

function applySettingsToUI() {
    serverSelect.value = settings.server;
    qualitySelect.value = settings.quality;
    namePrefSelect.value = settings.namePref;
    songTypeFilter.value = settings.songType;
    missingMediaFilter.value = settings.missingMedia;
    dubFilter.value = settings.dub;
    rebroadcastFilter.value = settings.rebroadcast;
    minDiffInput.value = settings.minDiff;
    maxDiffInput.value = settings.maxDiff;
    minYearInput.value = settings.minYear;
    maxYearInput.value = settings.maxYear;

    repeatBtn.classList.toggle("active", settings.repeat);
    shuffleBtn.classList.toggle("active", settings.shuffle);
}

function updateDocumentTitle(song) {
    if (!song) {
        document.title = "AMQ Song Player";
        return;
    }
    const mainName =
        settings.namePref === "romaji" ? song.animeRomaji : song.animeEnglish;
    const titleParts = [];
    if (mainName) titleParts.push(mainName);
    if (song.songName) titleParts.push(song.songName);
    if (song.artist) titleParts.push(song.artist);
    document.title = titleParts.join(" ・ ") || "AMQ Song Player";
}

function normalizeJson1Entry(entry) {
    const info = entry.songInfo || {};
    const annSongId = String(info.annSongId ?? entry.annSongId ?? "");
    const animeEN = info.animeNames?.english || "";
    const animeJP = info.animeNames?.romaji || "";
    const songName = info.songName || "";
    const artist = info.artist || "";
    const composer = info.composerInfo?.name || "";
    const arranger = info.arrangerInfo?.name || "";
    const typeNum = info.type ?? entry.type;
    const typeNumber = info.typeNumber ?? entry.typeNumber ?? 0;
    let songType = "Unknown";
    if (typeNum === 1) songType = "Opening";
    else if (typeNum === 2) songType = "Ending";
    else if (typeNum === 3) songType = "Insert";
    const typeLabel =
        songType === "Insert" ? "Insert" : `${songType} ${typeNumber || ""}`.trim();
    const vintage = info.vintage || "";
    let season = "";
    let year = 0;
    if (vintage) {
        const parts = vintage.split(" ");
        if (parts.length >= 2) {
            season = parts[0];
            const y = parseInt(parts[1], 10);
            if (!Number.isNaN(y)) year = y;
        }
    }
    let diff = info.animeDifficulty;
    if (diff === "Unrated" || diff == null) diff = 0;
    diff = Number(diff) || 0;
    const rebroadcast = !!info.rebroadcast;
    const dub = !!info.dub;
    const videoUrl = entry.videoUrl || "";
    let filename = "";
    if (videoUrl) {
        const idx = videoUrl.lastIndexOf("/");
        filename = idx >= 0 ? videoUrl.slice(idx + 1) : videoUrl;
    }
    return {
        sourceType: "json1",
        annSongId,
        animeEnglish: animeEN,
        animeRomaji: animeJP,
        songName,
        artist,
        composer,
        arranger,
        songType,
        songTypeLabel: typeLabel,
        season,
        year,
        difficulty: diff,
        rebroadcast,
        dub,
        hq: filename || null,
        mq: null,
        audio: filename || null,
        hasMedia: !!filename,
    };
}

function normalizeJson2Entry(entry) {
    const annSongId = String(entry.annSongId ?? "");
    const animeEN = entry.animeENName || "";
    const animeJP = entry.animeJPName || "";
    const songName = entry.songName || "";
    const artist = entry.songArtist || "";
    const composer = entry.songComposer || "";
    const arranger = entry.songArranger || "";
    const songType = entry.songType || "";
    const typeLabel = songType || "Unknown";
    const vintage = entry.animeVintage || "";
    let season = "";
    let year = 0;
    if (vintage) {
        const parts = vintage.split(" ");
        if (parts.length >= 2) {
            season = parts[0];
            const y = parseInt(parts[1], 10);
            if (!Number.isNaN(y)) year = y;
        }
    }
    let diff = entry.songDifficulty;
    if (diff == null) diff = 0;
    diff = Number(diff) || 0;
    const rebroadcast = !!entry.isRebroadcast;
    const dub = !!entry.isDub;
    const hq = entry.HQ || null;
    const mq = entry.MQ || null;
    const audio = entry.audio || entry.Audio || null;
    const hasMedia = !!(hq || mq || audio);
    return {
        sourceType: "json2",
        annSongId,
        animeEnglish: animeEN,
        animeRomaji: animeJP,
        songName,
        artist,
        composer,
        arranger,
        songType,
        songTypeLabel: typeLabel,
        season,
        year,
        difficulty: diff,
        rebroadcast,
        dub,
        hq,
        mq,
        audio,
        hasMedia,
    };
}

function detectAndNormalizeJson(data) {
    const songs = [];
    if (!data) return songs;
    if (Array.isArray(data)) {
        if (data.length === 0) return songs;
        const first = data[0];
        if (first.songInfo || first.videoUrl) {
            for (const entry of data) {
                songs.push(normalizeJson1Entry(entry));
            }
        } else {
            for (const entry of data) {
                songs.push(normalizeJson2Entry(entry));
            }
        }
    } else if (data.songs && Array.isArray(data.songs)) {
        for (const entry of data.songs) {
            songs.push(normalizeJson1Entry(entry));
        }
    }
    return songs;
}

function mergeSongs(newSongs) {
    const existingIds = new Set(allSongs.map((s) => s.annSongId));
    for (const s of newSongs) {
        if (!s.annSongId) continue;
        if (existingIds.has(s.annSongId)) continue;
        existingIds.add(s.annSongId);
        allSongs.push(s);
    }
}

function applyFilters() {
    const {
        songType,
        missingMedia,
        dub,
        rebroadcast,
        minDiff,
        maxDiff,
        minYear,
        maxYear,
    } = settings;

    const liked = likedSet;
    const disliked = dislikedSet;
    const learned = learnedSet;

    filteredSongs = allSongs.filter((s) => {
        if (songType !== "all") {
            if (songType === "opening" && !s.songType.includes("Opening")) return false;
            if (songType === "ending" && !s.songType.includes("Ending")) return false;
            if (songType === "insert" && !s.songType.includes("Insert")) return false;
        }

        if (songCategory !== "all") {
            const isLiked = liked.has(s.annSongId);
            const isDisliked = disliked.has(s.annSongId);
            const isLearned = learned.has(s.annSongId);
            if (songCategory === "liked" && !isLiked) return false;
            if (songCategory === "disliked" && !isDisliked) return false;
            if (songCategory === "learned" && !isLearned) return false;
            if (songCategory === "notlearned" && isLearned) return false;
        }

        if (missingMedia === "exclude" && !s.hasMedia) return false;
        if (missingMedia === "only" && s.hasMedia) return false;

        if (dub === "exclude" && s.dub) return false;
        if (dub === "only" && !s.dub) return false;

        if (rebroadcast === "exclude" && s.rebroadcast) return false;
        if (rebroadcast === "only" && !s.rebroadcast) return false;

        const d = s.difficulty ?? 0;
        if (d < minDiff || d > maxDiff) return false;

        const y = s.year || 0;
        if (y < minYear || y > maxYear) return false;

        return true;
    });

    songTotalDisplay.textContent = filteredSongs.length;
    if (filteredSongs.length === 0) {
        currentIndex = -1;
        updateSongDisplay();
        updatePlaylist();
        return;
    }

    if (lastAnnSongIdBeforeFilter) {
        const idx = filteredSongs.findIndex(
            (s) => s.annSongId === lastAnnSongIdBeforeFilter
        );
        if (idx >= 0) {
            currentIndex = idx;
        } else {
            currentIndex = 0;
        }
    } else {
        currentIndex = 0;
    }

    shuffleHistory = [];
    shuffleFuture = [];
    lastAnnSongIdBeforeFilter = filteredSongs[currentIndex].annSongId;
    updateSongDisplay(true);
    updatePlaylist();
}

function autopageToCurrentSong() {
    if (playlistSearchInput.value.trim() !== "") return;
    if (currentIndex < 0) return;

    const currentId = filteredSongs[currentIndex]?.annSongId;
    if (!currentId) return;

    // Use the playlist list (filteredSongs + tab + search)
    let list = filteredSongs.slice();

    // Apply playlist tab filters (liked, disliked, etc.)
    if (playlistTab === "liked") list = list.filter(s => likedSet.has(s.annSongId));
    if (playlistTab === "disliked") list = list.filter(s => dislikedSet.has(s.annSongId));
    if (playlistTab === "learned") list = list.filter(s => learnedSet.has(s.annSongId));
    if (playlistTab === "notlearned") list = list.filter(s => !learnedSet.has(s.annSongId));

    const idx = list.findIndex(s => s.annSongId === currentId);
    if (idx !== -1) {
        playlistPage = Math.floor(idx / PAGE_SIZE) + 1;
    }
}

function updateSongDisplay(autoplay = true, skipMedia = false) {
    const total = filteredSongs.length;
    songTotalDisplay.textContent = total;
    if (total === 0 || currentIndex < 0 || currentIndex >= total) {
        songIndexDisplay.textContent = 0;
        animeTitleMain.textContent = "—";
        animeTitleSub.textContent = "";
        songNameLabel.textContent = "Song: —";
        songTypeLabel.textContent = "Type: —";
        songSeasonLabel.textContent = "Season: —";
        songDiffLabel.textContent = "Difficulty: —";
        songArtistLabel.textContent = "Artist: —";
        songComposerLabel.textContent = "Composer: —";
        songArrangerLabel.textContent = "Arranger: —";
        clearMedia();
        updateDocumentTitle(null);
        updateLikeDislikeLearnedButtons(null);
        return;
    }

    const song = filteredSongs[currentIndex];
    songIndexDisplay.textContent = currentIndex + 1;

    const mainName =
        settings.namePref === "romaji" ? song.animeRomaji : song.animeEnglish;
    const subName =
        settings.namePref === "romaji" ? song.animeEnglish : song.animeRomaji;

    if (mainName && subName && mainName !== subName) {
        animeTitleMain.textContent = mainName;
        animeTitleSub.textContent = subName;
    } else {
        animeTitleMain.textContent = mainName || subName || "Unknown anime";
        animeTitleSub.textContent = "";
    }

    songNameLabel.textContent = `Song: ${song.songName || "Unknown"}`;
    songTypeLabel.textContent = `Type: ${song.songTypeLabel || "Unknown"} ${song.rebroadcast ? " (Rebroadcast)" : ""} ${song.dub ? " (Dub)" : ""}`;
    const seasonYear =
        (song.season || "Unknown") + " " + (song.year || "—");
    songSeasonLabel.textContent = `Season: ${seasonYear}`;
    songDiffLabel.textContent = `Difficulty: ${Number(song.difficulty.toFixed(2)) ?? 0}%`;

    songArtistLabel.textContent = `Artist: ${song.artist || "—"}`;
    songComposerLabel.textContent = `Composer: ${song.composer || "—"}`;
    songArrangerLabel.textContent = `Arranger: ${song.arranger || "—"}`;

    updateDocumentTitle(song);
    updateLikeDislikeLearnedButtons(song);
    if (!skipMedia) {
        loadMediaForSong(song, autoplay);
    }
    updatePlaylistHighlight();
}

function clearMedia() {
    if (currentMediaEl) {
        currentMediaEl.pause();
        currentMediaEl.src = "";
        currentMediaEl.removeAttribute("src");
        currentMediaEl.load();
        currentMediaEl.remove();
        currentMediaEl = null;
    }
    mediaPlaceholder.classList.remove("hidden");
}

function buildMediaUrl(song) {
    const base = `https://${settings.server}/`;
    if (song.sourceType === "json1") {
        if (!song.hq) return null;
        return base + song.hq;
    }
    const pref = settings.quality;
    const hq = song.hq;
    const mq = song.mq;
    const audio = song.audio;
    if (!hq && !mq && !audio) return null;

    function pick(order) {
        for (const key of order) {
            if (key === "hq" && hq) return base + hq;
            if (key === "mq" && mq) return base + mq;
            if (key === "audio" && audio) return base + audio;
        }
        return null;
    }

    if (pref === "hq") return pick(["hq", "mq", "audio"]);
    if (pref === "mq") return pick(["mq", "hq", "audio"]);
    if (pref === "audio") return pick(["audio", "mq", "hq"]);
    return pick(["hq", "mq", "audio"]);
}

function loadMediaForSong(song, autoplay = true) {
    clearMedia();
    const url = buildMediaUrl(song);
    if (!url) {
        mediaPlaceholder.classList.remove("hidden");
        mediaPlaceholder.innerHTML =
            "<strong>Missing Video/Audio media</strong>No media available for this entry.";
        return;
    }
    mediaPlaceholder.classList.add("hidden");

    const isAudio = url.toLowerCase().endsWith(".mp3");
    const el = document.createElement(isAudio ? "audio" : "video");
    el.controls = true;
    el.autoplay = true;
    el.preload = "auto";
    el.src = url;
    el.volume = currentVolume;
    el.addEventListener("volumechange", () => {
        currentVolume = el.muted ? currentVolume : el.volume;
        savePersistent();
    });
    el.addEventListener("ended", () => {
        if (settings.repeat) {
            el.currentTime = 0;
            el.play().catch(() => { });
        } else {
            goNext(true);
        }
    });
    mediaShell.appendChild(el);
    currentMediaEl = el;
    if (autoplay) {
        el.play().catch(() => { });
    }
}

function updateLikeDislikeLearnedButtons(song) {
    if (!song) {
        likedBtn.classList.remove("active");
        dislikedBtn.classList.remove("active");
        learnedBtn.classList.remove("active");
        return;
    }
    const id = song.annSongId;
    likedBtn.classList.toggle("active", likedSet.has(id));
    dislikedBtn.classList.toggle("active", dislikedSet.has(id));
    learnedBtn.classList.toggle("active", learnedSet.has(id));
}

function goToIndex(idx, fromUserInput = false) {
    const total = filteredSongs.length;
    if (total === 0) return;
    if (idx < 0) idx = 0;
    if (idx >= total) idx = total - 1;
    currentIndex = idx;
    lastAnnSongIdBeforeFilter = filteredSongs[currentIndex].annSongId;
    if (settings.shuffle && !fromUserInput) {
        shuffleHistory.push(currentIndex);
        shuffleFuture = [];
    }
    updateSongDisplay(true);
}

function goPrev(fromKey = false) {
    const total = filteredSongs.length;
    if (total === 0) return;
    if (settings.shuffle) {
        if (shuffleHistory.length > 1) {
            shuffleFuture.push(shuffleHistory.pop());
            const prevIndex = shuffleHistory[shuffleHistory.length - 1];
            currentIndex = prevIndex;
        } else {
            currentIndex = (currentIndex - 1 + total) % total;
            shuffleHistory.push(currentIndex);
        }
    } else {
        currentIndex = (currentIndex - 1 + total) % total;
    }
    lastAnnSongIdBeforeFilter = filteredSongs[currentIndex].annSongId;
    updateSongDisplay(true);
}

function goNext(fromEnded = false) {
    const total = filteredSongs.length;
    if (total === 0) return;
    if (settings.shuffle) {
        if (shuffleFuture.length > 0) {
            currentIndex = shuffleFuture.pop();
            shuffleHistory.push(currentIndex);
        } else {
            let nextIndex = currentIndex;
            if (total > 1) {
                do {
                    nextIndex = Math.floor(Math.random() * total);
                } while (nextIndex === currentIndex);
            }
            currentIndex = nextIndex;
            shuffleHistory.push(currentIndex);
        }
    } else {
        currentIndex = (currentIndex + 1) % total;
    }
    lastAnnSongIdBeforeFilter = filteredSongs[currentIndex].annSongId;
    updateSongDisplay(true);
}

function toggleRepeat() {
    settings.repeat = !settings.repeat;
    repeatBtn.classList.toggle("active", settings.repeat);
    savePersistent();
}

function toggleShuffle() {
    settings.shuffle = !settings.shuffle;
    shuffleBtn.classList.toggle("active", settings.shuffle);
    shuffleHistory = [];
    shuffleFuture = [];
    if (settings.shuffle && currentIndex >= 0) {
        shuffleHistory.push(currentIndex);
    }
    savePersistent();
}

function toggleLiked() {
    if (currentIndex < 0 || currentIndex >= filteredSongs.length) return;
    const id = filteredSongs[currentIndex].annSongId;
    if (likedSet.has(id)) {
        likedSet.delete(id);
    } else {
        likedSet.add(id);
        dislikedSet.delete(id);
    }
    savePersistent();
    updateLikeDislikeLearnedButtons(filteredSongs[currentIndex]);
    updatePlaylist();
}

function toggleDisliked() {
    if (currentIndex < 0 || currentIndex >= filteredSongs.length) return;
    const id = filteredSongs[currentIndex].annSongId;
    if (dislikedSet.has(id)) {
        dislikedSet.delete(id);
    } else {
        dislikedSet.add(id);
        likedSet.delete(id);
    }
    savePersistent();
    updateLikeDislikeLearnedButtons(filteredSongs[currentIndex]);
    updatePlaylist();
}

function toggleLearned() {
    if (currentIndex < 0 || currentIndex >= filteredSongs.length) return;
    const id = filteredSongs[currentIndex].annSongId;
    if (learnedSet.has(id)) {
        learnedSet.delete(id);
    } else {
        learnedSet.add(id);
    }
    savePersistent();
    updateLikeDislikeLearnedButtons(filteredSongs[currentIndex]);
    updatePlaylist();
}

function updatePlaylist() {
    const search = playlistSearchInput.value.trim().toLowerCase();
    let list = filteredSongs.slice();
    if (playlistTab === "liked") {
        list = list.filter((s) => likedSet.has(s.annSongId));
    } else if (playlistTab === "disliked") {
        list = list.filter((s) => dislikedSet.has(s.annSongId));
    } else if (playlistTab === "learned") {
        list = list.filter((s) => learnedSet.has(s.annSongId));
    } else if (playlistTab === "notlearned") {
        list = list.filter((s) => !learnedSet.has(s.annSongId));
    }

    if (search) {
        list = list.filter((s) => {
            const haystack = [
                s.animeEnglish,
                s.animeRomaji,
                s.songName,
                s.artist,
                s.annSongId,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            return haystack.includes(search);
        });
    }

    const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    if (playlistPage < 1) playlistPage = 1;
    if (playlistPage > totalPages) playlistPage = totalPages;

    const start = (playlistPage - 1) * PAGE_SIZE;
    const pageItems = list.slice(start, start + PAGE_SIZE);

    playlistList.innerHTML = "";
    for (const song of pageItems) {
        const item = document.createElement("div");
        item.className = "playlist-item";
        const idxInFiltered = filteredSongs.findIndex(
            (s) => s.annSongId === song.annSongId
        );
        if (idxInFiltered === currentIndex && idxInFiltered >= 0) {
            item.classList.add("active");
        }

        const main = document.createElement("div");
        main.className = "playlist-item-main";

        const title = document.createElement("div");
        title.className = "playlist-item-title";
        const mainName =
            settings.namePref === "romaji"
                ? song.animeRomaji
                : song.animeEnglish;
        const subName =
            settings.namePref === "romaji"
                ? song.animeEnglish
                : song.animeRomaji;
        const displayName =
            mainName || subName || "Unknown anime";
        title.textContent = displayName;

        const sub = document.createElement("div");
        sub.className = "playlist-item-sub";
        sub.textContent = `${song.songName || "Unknown"} • ${song.artist || "Unknown artist"
            }`;

        main.appendChild(title);
        main.appendChild(sub);

        const removeBtn = document.createElement("button");
        removeBtn.className = "playlist-remove-btn";
        removeBtn.textContent = "×";
        removeBtn.title = "Remove from playlist (does not delete from file)";

        item.appendChild(main);
        item.appendChild(removeBtn);

        item.addEventListener("click", (e) => {
            if (e.target === removeBtn) return;
            const idx = filteredSongs.findIndex(
                (s) => s.annSongId === song.annSongId
            );
            if (idx >= 0) {
                currentIndex = idx;
                lastAnnSongIdBeforeFilter = filteredSongs[currentIndex].annSongId;
                if (settings.shuffle) {
                    shuffleHistory.push(currentIndex);
                    shuffleFuture = [];
                }
                updateSongDisplay(true);
            }
        });

        removeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            allSongs = allSongs.filter((s) => s.annSongId !== song.annSongId);
            applyFilters();
        });

        playlistList.appendChild(item);
    }

    pageInfo.textContent = `Page ${totalPages === 0 ? 0 : playlistPage}/${totalPages}`;
}

function updatePlaylistHighlight() {
    const items = playlistList.querySelectorAll(".playlist-item");
    items.forEach((item) => item.classList.remove("active"));
    if (currentIndex < 0 || currentIndex >= filteredSongs.length) return;
    const currentId = filteredSongs[currentIndex].annSongId;
    items.forEach((item) => {
        const titleEl = item.querySelector(".playlist-item-title");
        if (!titleEl) return;
        const main = item.querySelector(".playlist-item-main");
        if (!main) return;
    });
    autopageToCurrentSong();
    updatePlaylist();
}

function togglePlaylistVisibility() {
    playlistVisible = !playlistVisible;
    if (playlistVisible) {
        playlistContainer.classList.remove("hidden");
    } else {
        playlistContainer.classList.add("hidden");
    }
}

function openSettingsDrawer() {
    settingsDrawer.classList.add("open");
}

function closeSettingsDrawer() {
    settingsDrawer.classList.remove("open");
}

function clampAndSwapRange() {
    let minDiff = parseFloat(minDiffInput.value);
    let maxDiff = parseFloat(maxDiffInput.value);
    let minYear = parseFloat(minYearInput.value);
    let maxYear = parseFloat(maxYearInput.value);

    if (Number.isNaN(minDiff)) minDiff = DEFAULT_SETTINGS.minDiff;
    if (Number.isNaN(maxDiff)) maxDiff = DEFAULT_SETTINGS.maxDiff;
    if (Number.isNaN(minYear)) minYear = DEFAULT_SETTINGS.minYear;
    if (Number.isNaN(maxYear)) maxYear = DEFAULT_SETTINGS.maxYear;

    minDiff = Math.max(0, Math.min(100, minDiff));
    maxDiff = Math.max(0, Math.min(100, maxDiff));
    minYear = Math.max(1924, Math.min(DEFAULT_SETTINGS.maxYear, minYear));
    maxYear = Math.max(1924, Math.min(DEFAULT_SETTINGS.maxYear, maxYear));

    if (minDiff > maxDiff) {
        const tmp = minDiff;
        minDiff = maxDiff;
        maxDiff = tmp;
    }
    if (minYear > maxYear) {
        const tmp = minYear;
        minYear = maxYear;
        maxYear = tmp;
    }

    minDiffInput.value = minDiff;
    maxDiffInput.value = maxDiff;
    minYearInput.value = minYear;
    maxYearInput.value = maxYear;

    return { minDiff, maxDiff, minYear, maxYear };
}

function applyFilterSettings() {
    const ranges = clampAndSwapRange();
    settings.minDiff = ranges.minDiff;
    settings.maxDiff = ranges.maxDiff;
    settings.minYear = ranges.minYear;
    settings.maxYear = ranges.maxYear;
    savePersistent();
    applyFilters();
}

jsonLoaderBtn.addEventListener("click", () => {
    jsonFileInput.value = "";
    jsonFileInput.click();
});

jsonFileInput.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    allSongs = [];
    filteredSongs = [];
    currentIndex = -1;
    shuffleHistory = [];
    shuffleFuture = [];
    lastAnnSongIdBeforeFilter = null;

    for (const file of files) {
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            const songs = detectAndNormalizeJson(data);
            mergeSongs(songs);
        } catch (err) {
            console.warn("Failed to parse JSON file", file.name, err);
        }
    }

    applyFilters();
});

exportBtn.addEventListener("click", () => {
    const payload = {
        liked: Array.from(likedSet),
        disliked: Array.from(dislikedSet),
        learned: Array.from(learnedSet),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "amq_lists_export.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
});

importBtn.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            const liked = Array.isArray(data.liked) ? data.liked : [];
            const disliked = Array.isArray(data.disliked) ? data.disliked : [];
            const learned = Array.isArray(data.learned) ? data.learned : [];
            likedSet = new Set(liked.map(String));
            dislikedSet = new Set(disliked.map(String));
            learnedSet = new Set(learned.map(String));
            savePersistent();
            updateSongDisplay(false);
            updatePlaylist();
        } catch (err) {
            console.warn("Failed to import lists", err);
        }
    });
    input.click();
});

settingsBtn.addEventListener("click", () => {
    if (settingsDrawer.classList.contains("open")) {
        closeSettingsDrawer();
    } else {
        openSettingsDrawer();
    }
});

closeSettingsBtn.addEventListener("click", () => {
    closeSettingsDrawer();
});

serverSelect.addEventListener("change", () => {
    settings.server = serverSelect.value;
    savePersistent();
    if (currentIndex >= 0) {
        updateSongDisplay(true);
    }
});

qualitySelect.addEventListener("change", () => {
    settings.quality = qualitySelect.value;
    savePersistent();
    if (currentIndex >= 0) {
        updateSongDisplay(true);
    }
});

namePrefSelect.addEventListener("change", () => {
    settings.namePref = namePrefSelect.value;
    savePersistent();
    updateSongDisplay(false, true);
    updatePlaylist();
});

songTypeFilter.addEventListener("change", () => {
    settings.songType = songTypeFilter.value;
    savePersistent();
    applyFilters();
});

missingMediaFilter.addEventListener("change", () => {
    settings.missingMedia = missingMediaFilter.value;
    savePersistent();
    applyFilters();
});

dubFilter.addEventListener("change", () => {
    settings.dub = dubFilter.value;
    savePersistent();
    applyFilters();
});

rebroadcastFilter.addEventListener("change", () => {
    settings.rebroadcast = rebroadcastFilter.value;
    savePersistent();
    applyFilters();
});

minDiffInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        clampAndSwapRange();
    }
});
maxDiffInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        clampAndSwapRange();
    }
});
minYearInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        clampAndSwapRange();
    }
});
maxYearInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        clampAndSwapRange();
    }
});

applyFiltersBtn.addEventListener("click", () => {
    applyFilterSettings();
});

songIndexInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        const total = filteredSongs.length;
        if (!total) return;
        let val = parseInt(songIndexInput.value, 10);
        if (Number.isNaN(val)) return;
        if (val < 1) val = 1;
        if (val > total) val = total;
        songIndexInput.value = "";
        goToIndex(val - 1, true);
    }
});

prevBtn.addEventListener("click", () => goPrev());
nextBtn.addEventListener("click", () => goNext());

repeatBtn.addEventListener("click", toggleRepeat);
shuffleBtn.addEventListener("click", toggleShuffle);
likedBtn.addEventListener("click", toggleLiked);
dislikedBtn.addEventListener("click", toggleDisliked);
learnedBtn.addEventListener("click", toggleLearned);

playlistTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
        playlistTabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        playlistTab = tab.dataset.tab;

        songCategory = playlistTab;

        applyFilters(); // refresh main player + filteredSongs

        playlistPage = 1;
        updatePlaylist();
    });
});

togglePlaylistBtn.addEventListener("click", () => {
    togglePlaylistVisibility();
});

playlistSearchInput.addEventListener("input", () => {
    const value = playlistSearchInput.value.trim();

    if (value.length > 0) {
        // User is typing → go to page 1
        playlistPage = 1;
    } else {
        // Search cleared → autopage to current song
        autopageToCurrentSong();
    }

    updatePlaylist();
});

clearPlaylistBtn.addEventListener("click", () => {
    allSongs = [];
    filteredSongs = [];
    currentIndex = -1;
    shuffleHistory = [];
    shuffleFuture = [];
    lastAnnSongIdBeforeFilter = null;
    updateSongDisplay(false);
    updatePlaylist();
});

pagePrevBtn.addEventListener("click", () => {
    playlistPage -= 1;
    if (playlistPage < 1) {
        const totalPages = Math.max(1, Math.ceil(filteredSongs.length / PAGE_SIZE));
        playlistPage = totalPages;
    }
    updatePlaylist();
});

pageNextBtn.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(filteredSongs.length / PAGE_SIZE));
    playlistPage += 1;
    if (playlistPage > totalPages) {
        playlistPage = 1;
    }
    updatePlaylist();
});

pageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        const val = parseInt(pageInput.value, 10);
        if (Number.isNaN(val)) return;
        const totalPages = Math.max(
            1,
            Math.ceil(allSongs.length / PAGE_SIZE)
        );
        let page = val;
        if (page < 1) page = 1;
        if (page > totalPages) page = totalPages;
        playlistPage = page;
        pageInput.value = "";
        updatePlaylist();
    }
});

document.addEventListener("keydown", (e) => {
    if (
        e.target.tagName === "INPUT" ||
        e.target.tagName === "TEXTAREA" ||
        e.target.isContentEditable
    ) {
        return;
    }
    if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev(true);
    } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
    } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        toggleRepeat();
    } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        toggleShuffle();
    } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        if (currentMediaEl) {
            currentMediaEl.muted = !currentMediaEl.muted;
        }
    } else if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        if (currentMediaEl) {
            if (currentMediaEl.paused) {
                currentMediaEl.play().catch(() => { });
            } else {
                currentMediaEl.pause();
            }
        }
    } else if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        togglePlaylistVisibility();
    } else if (e.key === "Tab") {
        e.preventDefault();
        if (settingsDrawer.classList.contains("open")) {
            closeSettingsDrawer();
        } else {
            openSettingsDrawer();
        }
    } else if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        toggleLiked();
    } else if (e.key === "d" || e.key === "D") {
        e.preventDefault();
        toggleDisliked();
    } else if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        toggleLearned();
    }
});

function init() {
    loadPersistent();
    applySettingsToUI();
    songTotalDisplay.textContent = 0;
    songIndexDisplay.textContent = 0;
    updatePlaylist();
}

init();