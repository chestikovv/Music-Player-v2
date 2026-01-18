let playlists = { "Избранное": [] };
let activePlaylist = "Избранное";
let currentTrackIndex = -1;
let isRepeat = false;

const audio = document.getElementById('audio-core');
const progress = document.getElementById('progress-slider');
const volumeSlider = document.getElementById('volume-slider');
const songList = document.getElementById('songs-container');

// --- Инициализация IndexedDB ---
const dbName = "GrigMusicDB";
let db;

const request = indexedDB.open(dbName, 1);
request.onupgradeneeded = (e) => {
    db = e.target.result;
    if (!db.objectStoreNames.contains('songs')) {
        db.createObjectStore('songs', { keyPath: 'id', autoIncrement: true });
    }
};

request.onsuccess = (e) => {
    db = e.target.result;
    loadData(); 
};

// --- Сохранение и загрузка данных ---

function loadData() {
    // 1. Загружаем Акцентный цвет
    const savedColor = localStorage.getItem('grig_accent_color') || '#ff2d75';
    changeAccentColor(savedColor);

    // 2. Загружаем структуру плейлистов
    const savedStructure = localStorage.getItem('playlist_structure');
    if (savedStructure) {
        const names = JSON.parse(savedStructure);
        names.forEach(name => {
            if (!playlists[name]) playlists[name] = [];
        });
    }

    // 3. Загружаем Громкость
    const savedVolume = localStorage.getItem('player_volume');
    if (savedVolume !== null) {
        audio.volume = savedVolume;
        volumeSlider.value = savedVolume * 100;
    } else {
        audio.volume = 0.7;
        volumeSlider.value = 70;
    }

    // 4. Загружаем треки из DB
    const transaction = db.transaction(['songs'], 'readonly');
    const store = transaction.objectStore('songs');
    store.getAll().onsuccess = (e) => {
        const allSongs = e.target.result;
        allSongs.forEach(track => {
            if (playlists[track.playlist]) {
                track.url = URL.createObjectURL(track.file);
                if (track.coverBlob) {
                    track.cover = URL.createObjectURL(track.coverBlob);
                }
                playlists[track.playlist].push(track);
            }
        });
        render();
    };
}

// --- ФУНКЦИЯ ЦВЕТА ---
function changeAccentColor(color) {
    document.documentElement.style.setProperty('--accent', color);
    localStorage.setItem('grig_accent_color', color);
    document.getElementById('accent-color-input').value = color;
}

document.getElementById('accent-color-input').oninput = (e) => changeAccentColor(e.target.value);

function saveStructure() {
    localStorage.setItem('playlist_structure', JSON.stringify(Object.keys(playlists)));
}

// --- Рендеринг ---

function render() {
    const pContainer = document.getElementById('playlist-list');
    pContainer.innerHTML = '';
    Object.keys(playlists).forEach(name => {
        const el = document.createElement('div');
        el.className = `item ${name === activePlaylist ? 'active' : ''}`;
        el.textContent = name;
        el.onclick = () => { 
            activePlaylist = name; 
            currentTrackIndex = -1;
            document.getElementById('current-playlist-name').textContent = `Плейлист: ${name}`;
            render(); 
        };
        pContainer.appendChild(el);
    });

    songList.innerHTML = '';
    const currentList = playlists[activePlaylist] || [];
    currentList.forEach((track, index) => {
        const el = document.createElement('div');
        el.className = `item ${index === currentTrackIndex ? 'active' : ''}`;
        el.draggable = true;
        el.innerHTML = `
            <span>${track.name}</span>
            <span class="del" onclick="deleteTrack(event, ${index})">✕</span>
        `;
        el.onclick = () => playTrack(index);
        
        // Внутренняя сортировка
        el.ondragstart = (e) => e.dataTransfer.setData('text/track-index', index);
        el.ondragover = (e) => e.preventDefault();
        el.ondrop = (e) => {
            e.preventDefault();
            const from = e.dataTransfer.getData('text/track-index');
            if (from !== "") reorderTracks(parseInt(from), index);
        };
        songList.appendChild(el);
    });
}

// --- Управление ---

function playTrack(index) {
    const list = playlists[activePlaylist];
    if (!list || index < 0 || index >= list.length) return;
    currentTrackIndex = index;
    const track = list[index];
    
    audio.src = track.url;
    document.getElementById('current-track-title').textContent = track.name;
    document.getElementById('main-cover').src = track.cover || 'https://via.placeholder.com';
    
    audio.play();
    updateIcon(true);
    render();
}

const handleAudioFiles = (files) => {
    Array.from(files).forEach(file => {
        if (file.type.startsWith('audio/')) {
            const trackData = {
                name: file.name.replace(/\.[^/.]+$/, ""),
                file: file, 
                playlist: activePlaylist,
                cover: 'https://via.placeholder.com',
                coverBlob: null
            };

            const transaction = db.transaction(['songs'], 'readwrite');
            const store = transaction.objectStore('songs');
            const req = store.add(trackData);

            req.onsuccess = (e) => {
                trackData.id = e.target.result;
                trackData.url = URL.createObjectURL(file);
                playlists[activePlaylist].push(trackData);
                render();
            };
        }
    });
};

// --- DRAG & DROP ФАЙЛОВ ---
songList.addEventListener('dragover', (e) => {
    e.preventDefault();
    songList.classList.add('active-drag');
});
songList.addEventListener('dragleave', () => songList.classList.remove('active-drag'));
songList.addEventListener('drop', (e) => {
    e.preventDefault();
    songList.classList.remove('active-drag');
    if (e.dataTransfer.files.length > 0) {
        handleAudioFiles(e.dataTransfer.files);
    }
});

volumeSlider.oninput = () => {
    const val = volumeSlider.value / 100;
    audio.volume = val;
    localStorage.setItem('player_volume', val);
};

document.getElementById('audio-input').onchange = (e) => handleAudioFiles(e.target.files);

document.getElementById('cover-input').onchange = (e) => {
    if (currentTrackIndex === -1) return;
    const file = e.target.files[0];
    if (!file) return;

    const track = playlists[activePlaylist][currentTrackIndex];
    track.coverBlob = file;
    track.cover = URL.createObjectURL(file);
    document.getElementById('main-cover').src = track.cover;

    const transaction = db.transaction(['songs'], 'readwrite');
    transaction.objectStore('songs').put(track);
};

function deleteTrack(e, idx) {
    e.stopPropagation();
    const track = playlists[activePlaylist][idx];
    if (track.id) {
        const transaction = db.transaction(['songs'], 'readwrite');
        transaction.objectStore('songs').delete(track.id);
    }
    playlists[activePlaylist].splice(idx, 1);
    if(idx === currentTrackIndex) { audio.pause(); audio.src = ''; currentTrackIndex = -1; }
    render();
}

function createNewPlaylist() {
    const n = prompt("Название плейлиста:");
    if (n && !playlists[n]) {
        playlists[n] = [];
        activePlaylist = n;
        saveStructure();
        render();
    }
}

function deleteActivePlaylist() {
    if (Object.keys(playlists).length > 1) {
        const toDelete = activePlaylist;
        const transaction = db.transaction(['songs'], 'readwrite');
        const store = transaction.objectStore('songs');
        playlists[toDelete].forEach(t => { if(t.id) store.delete(t.id); });
        delete playlists[toDelete];
        activePlaylist = Object.keys(playlists)[0];
        saveStructure();
        render();
    }
}

audio.ontimeupdate = () => {
    progress.value = (audio.currentTime / audio.duration) * 100 || 0;
    const m = Math.floor(audio.currentTime / 60);
    const s = Math.floor(audio.currentTime % 60);
    document.getElementById('time-current').textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
};
progress.oninput = () => audio.currentTime = (progress.value / 100) * audio.duration;

function togglePlay() { 
    if(!audio.src) return;
    audio.paused ? audio.play() : audio.pause(); 
    updateIcon(!audio.paused); 
}
function updateIcon(p) {
    document.getElementById('svg-play').style.display = p ? 'none' : 'block';
    document.getElementById('svg-pause').style.display = p ? 'block' : 'none';
}
function toggleRepeat() { 
    isRepeat = !isRepeat; 
    document.getElementById('repeat-btn').style.color = isRepeat ? "var(--accent)" : "var(--dim)"; 
}
audio.onended = () => {
    if (isRepeat) { audio.currentTime = 0; audio.play(); }
    else nextTrack();
};

function nextTrack() { if(playlists[activePlaylist].length) playTrack((currentTrackIndex + 1) % playlists[activePlaylist].length); }
function prevTrack() { if(playlists[activePlaylist].length) playTrack((currentTrackIndex - 1 + playlists[activePlaylist].length) % playlists[activePlaylist].length); }
function togglePanel(id) { document.getElementById(id).classList.toggle('open'); }

function reorderTracks(f, t) {
    const l = playlists[activePlaylist];
    const item = l.splice(f, 1)[0];
    l.splice(t, 0, item);
    currentTrackIndex = (currentTrackIndex === f) ? t : currentTrackIndex;
    render();
}
