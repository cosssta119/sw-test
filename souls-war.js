        // =====================================================
        // KONFIGURACJA I ZMIENNE GLOBALNE
        // =====================================================
        const firebaseConfig = {
            apiKey: "AIzaSyAZSC5B3HfX1AxOKFR06ixlFh0cgdwKY7M",
            authDomain: "souls-online-war.firebaseapp.com",
            databaseURL: "https://souls-online-war-default-rtdb.europe-west1.firebasedatabase.app",
            projectId: "souls-online-war",
            storageBucket: "souls-online-war.firebasestorage.app",
            messagingSenderId: "700986594564",
            appId: "1:700986594564:web:114ff3c81a42edb1d2ac51"
        };
        
        // Opakowanie localStorage dla wartości JSON (arrays/objects).
        // Stringi/boole zostawiamy surowe — tam wrapper nic nie daje.
        const storage = {
            getJson: (key, fallback = null) => {
                const raw = localStorage.getItem(key);
                return raw === null ? fallback : JSON.parse(raw);
            },
            setJson: (key, val) => localStorage.setItem(key, JSON.stringify(val)),
            getBool: (key, fallback = false) => {
                const raw = localStorage.getItem(key);
                return raw === null ? fallback : raw === 'true';
            },
            setBool: (key, val) => localStorage.setItem(key, val),
        };

        // Migracja: 4 klucze preferencji UI bez prefiksu → souls_* (jednorazowo przy starcie)
        ['addFormSectionsReversed', 'enemyRowsReversed', 'searchRowsReversed', 'addFormStacked'].forEach(oldKey => {
            const raw = localStorage.getItem(oldKey);
            if (raw !== null && localStorage.getItem('souls_' + oldKey) === null) {
                localStorage.setItem('souls_' + oldKey, raw);
                localStorage.removeItem(oldKey);
            }
        });

        let db, formationsRef, heroesRef, petsRef, heroSkillsRef, petSkillsRef, synonymsRef, bookBonusesRef, bookMetaRef;
        let allFormations = [];
        let allBookBonuses = [];         // cache /bookBonuses (Księga bonusów; live przez .on; pusto → DEFAULT_BOOK_BONUSES)
        let allBookMeta = [];            // cache /bookMeta (definicje ksiąg; live przez .on; scalane z DEFAULT_BOOK_META)
        let editingBookId = null;        // id edytowanego bonusu Księgi (null = tryb dodawania)
        let editingBookMetaKey = null;   // klucz edytowanej księgi (null = tryb dodawania nowej)
        let allSynonyms = [];            // cache /synonyms (słownik synonimów wyszukiwarki; live przez .on)
        let editingSynId = null;         // id edytowanego wiersza słownika (null = tryb dodawania)
        let allHeroSkills = {};          // cache /heroSkills (lazy-load przy 1. wejściu na zakładkę Bohaterowie)
        let heroSkillsLoaded = false;    // czy już pobrano (kolejne wejścia nie odpytują Firebase)
        let allPetSkills = {};           // cache /petSkills (analogicznie do heroSkills)
        let petSkillsLoaded = false;
        // Galeria screenów (zakładka Screeny): drzewo folderów + pliki w Firebase Storage
        let allScreenFolders = [], allScreenshots = [];
        let screensCurrentFolder = null; // null = korzeń galerii
        let screensLightboxId = null;    // aktualnie otwarty screen w lightboxie (do pobierania)
        const screensFullLoaded = new Set(); // URL-e pełnych obrazów już w cache przeglądarki — bez migotania miniatury przy powrocie/odświeżeniu
        let screensSearch = '';          // filtr szukajki galerii (po nazwie/opisie, globalnie)
        let screensHelpOpen = storage.getBool('souls_screens_help_open', false); // panel „❔ jak to działa"
        let screensViewShots = [];       // lista screenów aktualnie wyświetlanych (folder lub wynik szukajki) — kontekst nawigacji ‹ ›
        let screenFoldersRef = null, screenshotsRef = null, screensStorageRef = null;
        let screenMoveCtx = null;        // { kind:'folder'|'shot', id } lub { kind:'bulk', ids:[...] } — kontekst modala „Przenieś"
        let screensSort = storage.getJson('souls_screens_sort', 'date-desc');    // sortowanie siatki: date-desc|date-asc|name-asc|name-desc
        let screensTile = storage.getJson('souls_screens_tile', 'normal');       // rozmiar kafelków: large|normal|list
        let screensSelectMode = false;   // tryb zaznaczania wielu screenów (akcje masowe)
        let screensSelected = new Set(); // zaznaczone ID screenów (tylko screeny, nie foldery)
        let screenDrag = null;           // { kind, id } — element aktualnie przeciągany (drag&drop do folderu)
        let screensFavOnly = false;      // filtr „⭐ tylko ulubione" (widok globalny)
        let screensRecursive = false;    // pokaż screeny z podfolderów bieżącego folderu
        let screensTagFilter = new Set();// wybrane tagi (AND) — filtr wielotagowy
        let screensRenderLimit = 0;      // ile screenów renderujemy w siatce (paginacja „pokaż więcej" — chroni DOM przy dużych folderach)
        let screensFolderLimit = 0;      // analogicznie dla FOLDERÓW (Heroes ma ~150 podfolderów) — paginacja kafelków folderów
        let screensViewSig = '';         // sygnatura bieżącego widoku (folder+filtry+sort) — zmiana resetuje limity renderowania
        // Inkrementalne listenery galerii (child_added/changed/removed) zamiast .on('value') — przy dużej galerii NIE re-syncujemy
        // całych metadanych przy każdej zmianie, tylko różnice. Źródłem prawdy są Mapy po id; tablice allScreen* budujemy z nich (debounce).
        const screenshotsById = new Map(), screenFoldersById = new Map();
        let screenCountByFolder = new Map(); // folderId(|null=korzeń) -> liczba screenów; utrzymywane przy rebuildzie; O(1) liczniki (siatka + chipy bohatera)
        let screensCacheTimer = null, screensDirty = { shots: false, folders: false };
        // Foldery bohaterów w Galerii (zarządzane, nie do edycji/usunięcia). Kategorie rozszerzalne — na razie tylko Mastery.
        const HEROES_ROOT_NAME = 'Heroes';
        const HERO_GALLERY_CATEGORIES = [{ key: 'mastery', label: 'Mastery', icon: '⭐' }];
        let screenFavorites = storage.getJson('souls_screen_favorites', []); // per-user ulubione screeny (ids)
        let isOnline = false, isAdmin = false;
        let headerClickCount = 0, headerClickTimer = null;
        let favorites = storage.getJson('souls_favorites', []);
        let currentLang = localStorage.getItem('souls_lang') || 'pl';
        let currentDbFilter = 'all';
		let currentDbSort = 'id-desc';
		// Globalna konfiguracja gildii (Firebase /config/settings) — wspólna dla wszystkich graczy.
		// DEFAULT_CONFIG = bezpieczny backup, gdy node nie istnieje lub ma złe wartości.
		const DEFAULT_CONFIG = {
			newFormationDays: 7,        // próg badge „NOWE"
			defaultMinMatch: 3,         // domyślny próg trafności wyszukiwania
			warResultLimit: 20,         // ile kombinacji pokazuje Planer Wojny (konfigurowalne, clamp 5–100)
			defaultSearchSort: 'relevance', // domyślne sortowanie wyników
			defaultDbFilter: 'all',     // domyślny filtr bazy na starcie
			defaultPackageMinSupport: 5,// domyślne „min. wystąpień" w pakietach
			defaultPackageWindow: 'all',// domyślne okno czasowe pakietów
			screensCompress: true,      // Galeria: kompresja screenów przy wgrywaniu (oszczędza miejsce/transfer Storage)
			// Widoczność zakładek: 'all' = wszyscy (też admin), 'admin' = tylko admin. Domyślne = obecny stan apki.
			// Zakładka 'admin' jest zawsze admin-only (poza tą mapą, niekonfigurowalna).
			tabVisibility: { search: 'all', database: 'all', view: 'all', add: 'all', settings: 'admin', war: 'all', kreator: 'all', defense: 'admin', heroes: 'all', screens: 'admin' },
			// Umiejscowienie: 'bar' = w pasku, 'more' = w menu „⋯ Więcej", 'hidden' = ukryta. Domyślnie wszystko w pasku.
			// Przycisk „Więcej" pojawia się dopiero gdy ≥2 widoczne zakładki są w „Więcej".
			tabPlacement: { search: 'bar', database: 'bar', view: 'bar', add: 'bar', settings: 'bar', war: 'bar', kreator: 'bar', defense: 'bar', admin: 'bar', heroes: 'bar', screens: 'bar' },
			// Kolejność zakładek (Admin zawsze przypięty na końcu, poza tą listą). Domyślnie = obecny układ.
			tabOrder: ['search', 'database', 'view', 'add', 'war', 'kreator', 'heroes', 'defense', 'screens', 'settings'],
		};
		let appConfig = { ...DEFAULT_CONFIG };
		let configRef = null;
		let configInitApplied = false; // domyślne „widoku" (filtr/pakiety) stosujemy tylko raz, przy pierwszym załadowaniu
			let navConfigReady = false;    // odsłaniamy dolny pasek dopiero gdy dotrze config z Firebase (lub fallback) — koniec FOUC zakładek
		let currentSearchSort = DEFAULT_CONFIG.defaultSearchSort; // 'relevance' | 'newest'
		let userTouchedSort = false; // user ręcznie zmienił sortowanie w tej sesji → nie nadpisujemy globalnym domyślnym
		let lastSearch = null; // { results, searchHeroes } — cache do przełącznika sortowania bez ponownego szukania
		let searchMinMatch = storage.getJson('souls_search_min_match', DEFAULT_CONFIG.defaultMinMatch); // per-user override (1 = wszystkie)
        let quickSelectTarget = null, activeAddField = null, activeSearchField = null, editingFormationId = null;
		let currentTheme = localStorage.getItem('souls_theme') || 'dark';
		let isGuildAuthenticated = false;
		let searchHistory = storage.getJson('souls_search_history', []);
		let warSearchHistory = storage.getJson('souls_war_history', []);
		let selectedForCompare = [];
		let excludedHeroes = storage.getJson('souls_excluded_heroes', []);
		let hideExcludedResults = storage.getBool('souls_hide_excluded', true);
		let pinnedCombos = storage.getJson('souls_pinned_combos', []);
		let currentFormation = null;
		
		// Nawigacja między formacjami w podglądzie
		let navFormationIds = []; // Lista ID formacji do nawigowania
		let navCurrentIndex = -1; // Aktualny indeks w liście nawigacji
		
		// Ostatnio przeglądane formacje
		let recentlyViewed = storage.getJson('souls_recently_viewed', []);
		const MAX_RECENTLY_VIEWED = 10;

		// ========== KONFIGURACJA ZABEZPIECZEŃ ==========
		const GUILD_PASSWORD_ENABLED = true; // Zmień na true aby włączyć hasło na wejście
		// ===============================================

		// Hashe haseł (SHA-256) — WERSJA TESTOWA (sandbox)
		// Hasło gildii: "sandbox"
		const GUILD_PASSWORD_HASH = 'b7ad567477c83756aab9a542b2be04f77dbae25115d85f22070d74d8cc4779dc';
		const ADMIN_PASSWORD_HASH = '73e27fdb26c47415340900ae682ca124348f26663db2f797fb7cee6232126ac5';
        
        // Fallback bohaterów — używane tylko jeśli Firebase /heroes jest pusty/offline.
        // Źródłem prawdy jest Firebase; tę listę aktualizujemy ręcznie tylko okazjonalnie.
        let heroes = Object.entries({
            Dark:   "Dmitri Roze Nebula Zeke Benzel Lilith Bahzam Zagrako",
            Light:  "Lumen Akmon Leovalt Lena Ulion Nuel Solina Taros",
            Undead: "Muerte Melantha Nox Ripper Fleta Ash Dextor Carmen Zenon Amanda Void Harfa",
            Elf:    "Serena Oneiric Elara CoCo Babu Sander Tania Galan Aolmond LuLu Fiona Abala Chiron",
            Fire:   "Bella Lupico Paopao Jack Dolucos Aruru Kaion Paru Naru Telfer Lagou",
            Human:  "Morra Scarlet Kyle Adora Rakan Olga Idina Ken Calix Odelia Milia Richelle Liandra"
        }).flatMap(([race, names]) => names.split(' ').map(name => ({ name, race })));
        
        let pets = ["Gladis","Nasrune","Romanelle","Tianum","Hamm","Spooky","Mystet","Bloombell","Silbren","Vailo","Estelle","Banavi","Moko","Katatsu"];
        
        // =====================================================
        // TŁUMACZENIA
        // =====================================================
        
        // Słownik translations.pl/en → wydzielony do souls-war-i18n.js (ładowany <script>-em PRZED tym plikiem).
        // `translations` jest globalne; t() i applyTranslations używają go bez zmian. Nowe napisy dodawaj w tamtym pliku.
        
        const t = (key, params) => {
            let str = translations[currentLang][key] || translations['pl'][key] || key;
            if (params) Object.entries(params).forEach(([k, v]) => str = str.replaceAll(`{${k}}`, v));
            return str;
        };
        
        // =====================================================
        // FUNKCJE POMOCNICZE
        // =====================================================
        
        const $ = id => document.getElementById(id);
        const normalize = str => (str || '').trim().toLowerCase();
        // Wyszukanie bohatera po nazwie (case-insensitive, BEZ trim — zgodnie z dotychczasowym dopasowaniem)
        const findHero = name => heroes.find(h => h.name.toLowerCase() === name.toLowerCase());
        // Escape stringa do wstawienia w atrybut onclick="fn('...')"
        const jsStr = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const getPetName = p => typeof p === 'string' ? p : p.name;

        // Helpery menedżerów wykluczeń (search / war / kreator)
        const findCanonicalHeroName = name => {
            const n = normalize(name);
            const hero = heroes.find(h => normalize(h.name) === n);
            return hero ? hero.name : name;
        };
        const isHeroInList = (list, name) => {
            const n = normalize(name);
            return list.some(h => normalize(h) === n);
        };
		
		// Hashowanie SHA-256

        // ═══════════════════════════════════════════════════════════
        // AUTH — hasła, login, logout, admin mode
        // ═══════════════════════════════════════════════════════════

		// Hashowanie SHA-256
		async function hashPassword(password) {
			const encoder = new TextEncoder();
			const data = encoder.encode(password);
			const hashBuffer = await crypto.subtle.digest('SHA-256', data);
			const hashArray = Array.from(new Uint8Array(hashBuffer));
			return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
		}

		// Sprawdź czy użytkownik ma dostęp do gildii
		async function checkGuildAccess() {
			// Jeśli hasło wyłączone - zawsze przepuść
			if (!GUILD_PASSWORD_ENABLED) {
				isGuildAuthenticated = true;
				return true;
			}
			
			const savedHash = localStorage.getItem('souls_guild_access');
			if (savedHash === GUILD_PASSWORD_HASH) {
				isGuildAuthenticated = true;
				$('guild-password-modal').classList.add('hidden');
				return true;
			}
			$('guild-password-modal').classList.remove('hidden');
			$('loading').classList.add('hidden');
			return false;
		}

		// Próba logowania do gildii
		async function tryGuildLogin() {
			const password = $('guild-password').value;
			if (!password) {
				showGuildError(t('guild.wrongPassword'));
				return;
			}
			
			const hash = await hashPassword(password);
			
			if (hash === GUILD_PASSWORD_HASH) {
				localStorage.setItem('souls_guild_access', hash);
				isGuildAuthenticated = true;
				$('guild-password-modal').classList.add('hidden');
				$('loading').classList.remove('hidden');
				location.reload();
			} else {
				showGuildError(t('guild.wrongPassword'));
				$('guild-password').value = '';
			}
		}

		function showGuildError(msg) {
			const err = $('guild-error');
			err.textContent = msg;
			err.style.display = 'block';
			setTimeout(() => err.style.display = 'none', 3000);
		}

        function headerClick() {
            headerClickCount++;
            clearTimeout(headerClickTimer);
            if (headerClickCount >= 5) {
                headerClickCount = 0;
                isAdmin ? showToast(t('admin.alreadyLogged')) : $('admin-modal').classList.remove('hidden');
            } else headerClickTimer = setTimeout(() => headerClickCount = 0, 2000);
        }

		async function tryAdminLogin() {
			const password = $('admin-password').value;
			if (!password) {
				showToast('❌ ' + t('admin.wrongPassword'), true);
				return;
			}
			
			const hash = await hashPassword(password);
			
			if (hash === ADMIN_PASSWORD_HASH) {
				isAdmin = true;
				localStorage.setItem('souls_admin', hash);
				closeAdminModal();
				enableAdminMode();
				showToast('🔓 ' + t('admin.loggedIn'));
			} else {
				showToast('❌ ' + t('admin.wrongPassword'), true);
				$('admin-password').value = '';
			}
		}

        function closeAdminModal() {
            $('admin-modal').classList.add('hidden');
            $('admin-password').value = '';
        }

		// Konfigurowalne zakładki (kolejność = w panelu). 'admin' zawsze admin-only (locked).
		const TAB_ICONS = { search: '🔍', database: '📚', view: '👁️', add: '➕', settings: '⚙️', war: '⚔️', kreator: '🎯', defense: '🛡️', admin: '👑', heroes: '📖', screens: '🖼️' };
		const TAB_I18N = { search: 'nav.search', database: 'nav.database', view: 'nav.preview', add: 'nav.add', settings: 'nav.import', war: 'nav.war', kreator: 'nav.kreator', defense: 'nav.defense', admin: 'nav.admin', heroes: 'nav.heroes', screens: 'nav.screens' };
		const tabLabel = tab => `${TAB_ICONS[tab]} ${t(TAB_I18N[tab])}`;

		let moreTabsActive = []; // zakładki aktualnie pokazane w menu „⋯ Więcej"
		// Robocze kopie konfiguracji w formularzu admina (edytowane przed Zapisz, żeby reorder nie gubił zmian)
		let configTabOrder = null, configTabVisibility = null, configTabPlacement = null, draggedTab = null, configTabDirty = false;

		// Walidacja/uzupełnienie kolejności: tylko znane zakładki (bez admina), brakujące dołożone wg domyślnej.
		function sanitizeTabOrder(arr) {
			const base = DEFAULT_CONFIG.tabOrder, out = [];
			(Array.isArray(arr) ? arr : []).forEach(t => { if (t !== 'admin' && base.includes(t) && !out.includes(t)) out.push(t); });
			base.forEach(t => { if (t !== 'admin' && !out.includes(t)) out.push(t); });
			return out;
		}
		// Pełna kolejność do wyświetlenia: kolejność z configu + Admin zawsze na końcu.
		function orderedTabs() { return [...(appConfig.tabOrder || DEFAULT_CONFIG.tabOrder), 'admin']; }

		// Stan zakładki: kto widzi (audience) + gdzie (placement) → czy w ogóle widoczna.
		// 'hidden' chowa dla wszystkich (admin może odkryć przez panel — zakładka Admin jest zablokowana).
		function tabState(tab) {
			const vis = tab === 'admin' ? 'admin' : (appConfig.tabVisibility?.[tab] || 'all');
			const placement = tab === 'admin' ? 'bar' : (appConfig.tabPlacement?.[tab] || 'bar'); // Admin zawsze 'bar' — nie da się go ukryć/przenieść (nawet ręczną edycją bazy)
			const audienceOK = vis === 'all' || isAdmin;
			return { visible: audienceOK && placement !== 'hidden', placement };
		}

		// Pokazuje/ukrywa + ustawia kolejność przycisków dolnego menu wg appConfig i stanu admina.
		// Przycisk „Więcej" pojawia się tylko gdy ≥2 widoczne zakładki są w „Więcej" (przy 1 chowanie nie ma sensu).
		function applyTabVisibility() {
			const order = orderedTabs();
			const moreCandidates = order.filter(tab => { const s = tabState(tab); return s.visible && s.placement === 'more'; });
			const useMore = moreCandidates.length >= 2;
			moreTabsActive = useMore ? moreCandidates : [];

			const nav = document.querySelector('.bottom-nav');
			order.forEach(tab => {
				const btn = $('nav-' + tab);
				if (!btn) return;
				const s = tabState(tab);
				const inMore = useMore && s.placement === 'more';
				btn.style.display = (s.visible && !inMore) ? 'flex' : 'none';
				if (nav) nav.appendChild(btn); // ustaw kolejność w pasku
			});
			const moreBtn = $('nav-more');
			if (moreBtn) {
				moreBtn.style.display = useMore ? 'flex' : 'none';
				if (nav) nav.appendChild(moreBtn); // „Więcej" zawsze ostatni
			}
			renderMoreMenu();
			if (!useMore) closeMoreMenu();
			if (navConfigReady) nav?.classList.remove('nav-initializing'); // odsłoń dopiero po dotarciu configu (nie przy domyślnym układzie)
		}

		// ── Kolejność zakładek w „Widoczność zakładek": ▲▼ + drag&drop (mysz) ──
		function moveTab(tab, dir) {
			if (!configTabOrder) return;
			const i = configTabOrder.indexOf(tab), j = i + dir;
			if (i < 0 || j < 0 || j >= configTabOrder.length) return;
			[configTabOrder[i], configTabOrder[j]] = [configTabOrder[j], configTabOrder[i]]; configTabDirty = true;
			renderTabvisList();
		}
		function dragTabStart(e, tab) { draggedTab = tab; e.dataTransfer.effectAllowed = 'move'; e.currentTarget.classList.add('dragging'); }
		function dragTabOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
		function dragTabEnd() { document.querySelectorAll('.tabvis-reorder.dragging').forEach(el => el.classList.remove('dragging')); draggedTab = null; }
		function dragTabDrop(e, targetTab) {
			e.preventDefault();
			if (!draggedTab || !configTabOrder || draggedTab === targetTab) return;
			const from = configTabOrder.indexOf(draggedTab), to = configTabOrder.indexOf(targetTab);
			if (from < 0 || to < 0) return;
			configTabOrder.splice(from, 1);
			let tIdx = configTabOrder.indexOf(targetTab);
			if (from < to) tIdx += 1;
			configTabOrder.splice(tIdx, 0, draggedTab); configTabDirty = true;
			renderTabvisList();
		}

		// Buduje listę „Widoczność zakładek" z roboczych kopii (configTab*), Admin przypięty na końcu.
		function renderTabvisList() {
			const tvList = $('tabvis-list');
			if (!tvList) return;
			const order = configTabOrder || sanitizeTabOrder(appConfig.tabOrder);
			let html = order.map((tab, i) => {
				const val = (configTabVisibility || appConfig.tabVisibility || {})[tab] || 'all';
				const place = (configTabPlacement || appConfig.tabPlacement || {})[tab] || 'bar';
				return `<div class="admin-config-row">
					<div class="tabvis-reorder" draggable="true" ondragstart="dragTabStart(event,'${tab}')" ondragover="dragTabOver(event)" ondrop="dragTabDrop(event,'${tab}')" ondragend="dragTabEnd(event)">
						<span class="tabvis-handle" title="${t('admin.dragHint')}">⠿</span>
						<button class="btn-icon" onclick="moveTab('${tab}',-1)"${i === 0 ? ' disabled' : ''}>▲</button>
						<button class="btn-icon" onclick="moveTab('${tab}',1)"${i === order.length - 1 ? ' disabled' : ''}>▼</button>
					</div>
					<label ondragover="dragTabOver(event)" ondrop="dragTabDrop(event,'${tab}')">${tabLabel(tab)}</label>
					<select class="admin-config-select" onchange="configTabVisibility['${tab}']=this.value;configTabDirty=true">
						<option value="all"${val === 'all' ? ' selected' : ''}>${t('admin.visAll')}</option>
						<option value="admin"${val === 'admin' ? ' selected' : ''}>${t('admin.visAdmin')}</option>
					</select>
					<select class="admin-config-select" onchange="configTabPlacement['${tab}']=this.value;configTabDirty=true">
						<option value="bar"${place === 'bar' ? ' selected' : ''}>${t('admin.placeBar')}</option>
						<option value="more"${place === 'more' ? ' selected' : ''}>${t('admin.placeMore')}</option>
						<option value="hidden"${place === 'hidden' ? ' selected' : ''}>${t('admin.placeHidden')}</option>
					</select>
				</div>`;
			}).join('');
			html += `<div class="admin-config-row">
				<div class="tabvis-reorder"><span class="tabvis-pinned" title="${t('admin.tabLockedHint')}">📌</span></div>
				<label>${tabLabel('admin')}</label>
				<span class="tabvis-locked" title="${t('admin.tabLockedHint')}">🔒 ${t('admin.tabLocked')}</span>
			</div>`;
			tvList.innerHTML = html;
		}

		function renderMoreMenu() {
			const menu = $('more-menu');
			if (!menu) return;
			menu.innerHTML = moreTabsActive.map(tab =>
				`<button class="more-menu-item" onclick="switchTab('${tab}'); closeMoreMenu();">${tabLabel(tab)}</button>`
			).join('');
		}

		function toggleMoreMenu(e) {
			if (e) e.stopPropagation();
			const menu = $('more-menu');
			if (!menu) return;
			const willOpen = menu.classList.contains('hidden');
			menu.classList.toggle('hidden', !willOpen);
			if (willOpen) setTimeout(() => document.addEventListener('click', closeMoreMenuOutside), 10);
			else document.removeEventListener('click', closeMoreMenuOutside);
		}
		function closeMoreMenu() {
			$('more-menu')?.classList.add('hidden');
			document.removeEventListener('click', closeMoreMenuOutside);
		}
		function closeMoreMenuOutside(e) {
			if (!e.target.closest('#more-menu') && !e.target.closest('#nav-more')) closeMoreMenu();
		}

		function enableAdminMode() {
			isAdmin = true;
			$('admin-badge').style.display = 'inline';
			applyTabVisibility();
			// Pokaż opcję "formacja bazowa" w formularzu dodawania
			const baseOption = $('add-base-option');
			if (baseOption) baseOption.style.display = 'block';
			renderHeroesList();
			renderPetsList();
			renderConfigForm(true);
			styleRaceSelect($('new-hero-race'));
			filterDatabase();
			// jeśli admin odblokował będąc na zakładce Bohaterowie — pokaż od razu edycję słownika
			if ($('tab-heroes')?.classList.contains('active')) { renderHeroesSynonyms(); renderSearchExamples(); }
		}

		function adminLogout() {
			isAdmin = false;
			heroesExamplesEditMode = false; // wyjdź z trybu edycji przykładów
			localStorage.removeItem('souls_admin');
			$('admin-badge').style.display = 'none';
			applyTabVisibility();
			// Ukryj opcję "formacja bazowa" w formularzu dodawania
			const baseOption = $('add-base-option');
			if (baseOption) baseOption.style.display = 'none';
			switchTab('search');
			filterDatabase();
			showToast('🚪 ' + t('admin.loggedOut'));
		}


        // ═══════════════════════════════════════════════════════════
        // UI CORE — theme, i18n, toast, online status, nawigacja tabów
        // ═══════════════════════════════════════════════════════════

		function initTheme() {
			if (currentTheme === 'light') {
				document.documentElement.setAttribute('data-theme', 'light');
				updateThemeButton('light');
			} else {
				document.documentElement.removeAttribute('data-theme');
				updateThemeButton('dark');
			}
		}

		function toggleTheme() {
			if (currentTheme === 'dark') {
				currentTheme = 'light';
				document.documentElement.setAttribute('data-theme', 'light');
			} else {
				currentTheme = 'dark';
				document.documentElement.removeAttribute('data-theme');
			}
			
			localStorage.setItem('souls_theme', currentTheme);
			updateThemeButton(currentTheme);
			showToast(currentTheme === 'light' ? '☀️ Tryb dzienny' : '🌙 Tryb nocny');
		}

		function updateThemeButton(theme) {
			const btn = $('theme-toggle');
			if (!btn) return;
			
			const icon = btn.querySelector('.theme-icon');
			if (icon) {
				icon.textContent = theme === 'light' ? '☀️' : '🌙';
			}
			btn.title = theme === 'light' ? 'Przełącz na tryb nocny' : 'Przełącz na tryb dzienny';
		}

        // TŁUMACZENIA
        function setLanguage(lang) {
            currentLang = lang;
            localStorage.setItem('souls_lang', lang);
            document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
            document.querySelector(`.lang-btn[onclick="setLanguage('${lang}')"]`).classList.add('active');
            applyTranslations();
            filterDatabase();
            generateQuickTags();
            generateAddFormTags();
            const lookupId = $('lookup-id').value;
            if (lookupId && $('tab-view').classList.contains('active')) showFormation(parseInt(lookupId));
        }

        function applyTranslations() {
            document.querySelectorAll('[data-i18n]').forEach(el => el.textContent = t(el.getAttribute('data-i18n')));
            document.querySelectorAll('[data-i18n-placeholder]').forEach(el => el.placeholder = t(el.getAttribute('data-i18n-placeholder')));
            document.querySelectorAll('[data-i18n-title]').forEach(el => el.title = t(el.getAttribute('data-i18n-title')));
            setOnlineStatus(isOnline);
        }

        // UI
        function setOnlineStatus(online) {
            isOnline = online;
            $('status-dot').className = `status-dot ${online ? 'online' : 'offline'}`;
            $('status-text').textContent = t(online ? 'status.online' : 'status.offline');
            const info = $('connection-info');
            if (info) info.innerHTML = `<strong>${online ? '🟢' : '🔴'} ${t(online ? 'status.online' : 'status.offline')}:</strong> ${t(online ? 'settings.online' : 'settings.offline')}`;
        }

        // Render listy Bazy wg aktualnego filtra (lista albo widok Pakietów). Czyści flagę „brudne".
        let dbRenderDirty = false; // zmiana formacji poza zakładką Baza → oznacz do przerenderowania przy wejściu (nie rebuilduj DOM w tle)
        function renderDatabaseView() {
            dbRenderDirty = false;
            if (currentDbFilter === 'packages') renderPackagesView(); else filterDatabase();
        }

        function updateUI() {
            const total = allFormations.length;
            let baseCount = 0;
            for (const f of allFormations) if (f.isBase) baseCount++; // jedno przejście zamiast 2× filter (updateUI leci na każdą zmianę formacji)
            $('total-count').textContent = total;
            $('db-stat-total').textContent = total;
            $('db-stat-base').textContent = baseCount;
            $('db-stat-user').textContent = total - baseCount;
            // Render Bazy tylko gdy zakładka aktywna; inaczej oznacz „brudne" i odłóż do wejścia (switchTab) — bez rebuildu DOM w tle przy każdym live-update gildii.
            if ($('tab-database')?.classList.contains('active')) renderDatabaseView();
            else dbRenderDirty = true;
            // Tagi Szukajki liczą wrogów z formacji → odświeżamy je tutaj.
            // Tagi War/Kreator/Dodaj zależą TYLKO od heroes/pets → generują je listenery heroes/pets (nie przebudowujemy ich na każdą zmianę formacji, bo to najczęstszy event).
            generateQuickTags();
        }

        function showToast(msg, isError = false) {
            const toast = $('toast');
            toast.textContent = msg;
            toast.className = `toast show${isError ? ' error' : ''}`;
            setTimeout(() => toast.classList.remove('show'), 3000);
        }

		function switchTab(name) {
			document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
			document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
			document.querySelector(`.nav-btn[onclick="switchTab('${name}')"]`)?.classList.add('active');
			$(`tab-${name}`)?.classList.add('active');
			// Jeśli zakładka jest w menu „Więcej", podświetl przycisk Więcej
			$('nav-more')?.classList.toggle('active', moreTabsActive.includes(name));
			closeMoreMenu();

			// Pokaż/ukryj sekcję wykluczonych na wybranych zakładkach
			const excludedSection = $('excluded-section');
			if (excludedSection) {
				const showOnTabs = ['search', 'database', 'view'];
				if (showOnTabs.includes(name)) {
					excludedSection.classList.add('visible');
					excludedSection.style.display = 'block';
				} else {
					excludedSection.classList.remove('visible');
					excludedSection.style.display = 'none';
				}
			}

			// Baza: jeśli w tle przyszły zmiany formacji (dbRenderDirty) — dorenderuj teraz, przy wejściu.
			if (name === 'database' && dbRenderDirty) renderDatabaseView();
			// Defense: zawsze rerenduj bieżący pod-widok przy wejściu (świeże liczniki/listy)
			if (name === 'defense') switchDefenseView(currentDefenseView);
			if (name === 'settings') renderImportStats();
			if (name === 'heroes') applyHeroesMode(); // Bohaterowie albo Księga (wg zapisanego trybu)
			if (name === 'screens') renderScreensTab();

		}

		// Formatuj datę do czytelnego formatu (z godziną jeśli != 00:00)
		function formatDate(isoString) {
			if (!isoString) return null;
			const date = new Date(isoString);
			const dateStr = date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
			
			// Pokaż godzinę tylko jeśli nie jest 00:00
			const hours = date.getHours();
			const minutes = date.getMinutes();
			if (hours === 0 && minutes === 0) {
				return dateStr;
			}
			const timeStr = date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
			return `${dateStr}, ${timeStr}`;
		}


        // ═══════════════════════════════════════════════════════════
        // SHARED HELPERS — formularze, matching, autocomplete, field-nav
        // ═══════════════════════════════════════════════════════════

        // Pobierz wartości z wielu pól
        function getFieldValues(prefix, count, suffix = '') {
            const values = [];
            for (let i = 1; i <= count; i++) {
                const el = $(`${prefix}${i}${suffix}`);
                if (el) values.push(el.value.trim());
            }
            return values;
        }

        // Ustaw/wyczyść walidację inputa
        function setValidation(input, isValid) {
            if (isValid === null) {
                input.classList.remove('invalid-hero', 'valid-hero');
            } else {
                input.classList.toggle('invalid-hero', !isValid);
                input.classList.toggle('valid-hero', isValid);
            }
        }

        // Waliduj bohatera/peta
        function validateInput(input) {
            const val = input.value.trim().toLowerCase();
            if (!val) { setValidation(input, null); return; }
            
            const type = input.dataset.type;
            let isValid = false;
            
            if (type === 'hero') {
                isValid = heroes.some(h => h.name.toLowerCase() === val);
            } else if (type === 'pet') {
                isValid = pets.some(p => getPetName(p).toLowerCase() === val);
            }
            
            setValidation(input, isValid);
        }

        // Funkcja pomocnicza do matchowania bohaterów z wagą
        function heroMatchScore(search, target) {
            if (!search || !target) return 0;
            if (search === target) return 1.0;  // pełne dopasowanie
            // Częściowe dopasowanie tylko dla min. 3 znaków
            if (search.length >= 3 && target.startsWith(search)) return 0.9;
            if (target.length >= 3 && search.startsWith(target)) return 0.9;
            return 0;
        }

        // Wspólny scoring formacji — używany przez searchFormations i findMatchingFormations.
        // query: { heroes (compact normalized), heroesRaw? (8-slot z pozycjami), pet? (normalized) }
        // opts.withPositionBonus: +0.3 za każdego bohatera trafionego na tym samym indeksie slotu
        function scoreFormation(formation, query, opts = {}) {
            const enemyHeroes = formation.enemy.map(h => h ? normalize(h) : '');
            const enemyPet = normalize(formation.enemyPet);
            const withPositionBonus = !!opts.withPositionBonus;

            const matchedHeroes = [];
            let positionBonus = 0;

            query.heroes.forEach(searchHero => {
                if (!searchHero) return;
                let matched = false;

                enemyHeroes.forEach((formationHero, formationIdx) => {
                    if (!formationHero) return;
                    if (heroMatchScore(searchHero, formationHero) > 0) {
                        matched = true;
                        if (withPositionBonus && query.heroesRaw) {
                            const rawIdx = query.heroesRaw.findIndex(h => h && normalize(h) === searchHero);
                            if (rawIdx === formationIdx) positionBonus += 0.3;
                        }
                    }
                });

                if (matched) matchedHeroes.push(searchHero);
            });

            const petMatched = !!(query.pet && heroMatchScore(query.pet, enemyPet) > 0);
            const baseScore = matchedHeroes.length + (petMatched ? 1 : 0);
            const maxScore = query.heroes.length + (query.pet ? 1 : 0);

            return {
                score: baseScore + positionBonus,
                baseScore,
                positionBonus,
                matchedHeroes,
                petMatched,
                maxScore,
            };
        }

		// Funkcja debounce - opóźnia wykonanie
		function debounce(func, wait) {
			let timeout;
			return function(...args) {
				clearTimeout(timeout);
				timeout = setTimeout(() => func.apply(this, args), wait);
			};
		}

		function getTimeAgo(date) {
			const now = new Date();
			const diff = Math.floor((now - date) / 1000); // sekundy
			
			if (diff < 60) return 'przed chwilą';
			if (diff < 3600) return `${Math.floor(diff / 60)} min temu`;
			if (diff < 86400) return `${Math.floor(diff / 3600)} godz. temu`;
			if (diff < 604800) return `${Math.floor(diff / 86400)} dni temu`;
			return date.toLocaleDateString('pl-PL');
		}

		// Czy formacja jest "nowa" (dodana w ostatnich N dniach wg dateAdded; N = globalny appConfig.newFormationDays).
		// Bazowe/bez daty → false (Date.parse(undefined) → NaN, porównanie z NaN daje false).
		const MS_PER_DAY = 86400000;
		function isNewFormation(f) {
			if (!f) return false;
			return (Date.now() - Date.parse(f.dateAdded)) < appConfig.newFormationDays * MS_PER_DAY;
		}

		// Aktualizuj kolor inputa na podstawie rasy bohatera
		function updateInputHeroColor(input, isPet = false) {
			// Usuń wszystkie klasy kolorów
			input.classList.remove('hero-race-dark', 'hero-race-light', 'hero-race-human', 
				'hero-race-fire', 'hero-race-elf', 'hero-race-undead', 'hero-race-pet');
			
			const value = input.value.trim();
			if (!value) return;
			
			if (isPet) {
				// Dla petów - zawsze złoty kolor
				input.classList.add('hero-race-pet');
				return;
			}
			
			// Znajdź bohatera i jego rasę
			const hero = heroes.find(h => normalize(h.name) === normalize(value));
			if (hero && hero.race) {
				const raceClass = `hero-race-${hero.race.toLowerCase()}`;
				input.classList.add(raceClass);
			}
		}

		function setupAutocomplete() {
			document.querySelectorAll('input[data-type]').forEach(input => {
				const list = $('list-' + input.id);
				const type = input.dataset.type;

				const isWarField = input.id.startsWith('war-');
				let dynamicList = null;
				
				if (isWarField && !list) {
					dynamicList = document.createElement('div');
					dynamicList.className = 'autocomplete-list';
					dynamicList.id = 'list-' + input.id;
					input.parentNode.style.position = 'relative';
					input.parentNode.appendChild(dynamicList);
				}
				
				const targetList = list || dynamicList;
				if (!targetList) return;
				
				// Zmienna do śledzenia zaznaczonego elementu
				let selectedIndex = -1;
				
				function updateSelection() {
					const items = targetList.querySelectorAll('.autocomplete-item');
					items.forEach((item, idx) => {
						item.classList.toggle('selected', idx === selectedIndex);
					});
					// Scroll do widoczności
					if (selectedIndex >= 0 && items[selectedIndex]) {
						items[selectedIndex].scrollIntoView({ block: 'nearest' });
					}
				}
				
				function selectItem(value) {
					input.value = value;
					targetList.classList.remove('show');
					selectedIndex = -1;
					
					// Obsługa pól wykluczeń - automatyczne dodanie
					if (input.id === 'war-excluded-input') {
						addWarExcludedHero(value);
						input.value = '';
						return;
					}
					if (input.id === 'kreator-excluded-input') {
						addKreatorExcludedHero(value);
						input.value = '';
						return;
					}
					
					// Aktualizuj kolor inputa dla War Planner, Kreator i Obrony (add + edit)
					if (input.id.startsWith('war-') || input.id.startsWith('kreator-')) {
						const isPet = input.id.includes('-pet');
						updateInputHeroColor(input, isPet);
					}
					if (input.id.startsWith('defense-')) updateInputHeroColor(input, input.dataset.type === 'pet');
					
					// Walidacja dla formularza dodawania
					if (input.id.startsWith('add-') && !['add-name', 'add-comment'].includes(input.id)) {
						setValidation(input, true);
					}
					updateAddFormTagsSelection();
					updateSearchTagsSelection();
					updateWarTagsSelection();
					updateKreatorTagsSelection();
					
					// 🆕 UNIWERSALNE AUTO-PRZESKAKIWANIE
					const sectionKey = getFieldSection(input.id);
					if (sectionKey) {
						const nextFieldId = getNextEmptyField(input.id);
						if (nextFieldId) {
							setTimeout(() => {
								const nextField = $(nextFieldId);
								if (nextField) {
									nextField.focus();
									// Aktualizuj aktywne pole w zależności od sekcji
									if (input.id.startsWith('add-')) {
										activeAddField = nextFieldId;
									}
									if (input.id.startsWith('kreator-')) {
										activeKreatorField = nextFieldId;
									}
									if (input.id.startsWith('war-')) {
										activeWarField = nextFieldId;
									}
								}
							}, 50);
						}
					}
				}
				
				input.addEventListener('input', () => {
					selectedIndex = -1; // Reset selection on input
					
					if (input.id.startsWith('add-') && !['add-name', 'add-comment'].includes(input.id)) {
						validateInput(input);
						updateAddFormTagsSelection();
					}
					if (input.id.startsWith('search-')) updateSearchTagsSelection();
					if (input.id.startsWith('war-')) {
						updateWarTagsSelection();
						updateInputHeroColor(input, input.id.includes('-pet'));
					}
					if (input.id.startsWith('kreator-')) {
						updateKreatorTagsSelection();
						updateInputHeroColor(input, input.id.includes('-pet'));
					}
					if (input.id.startsWith('defense-')) updateInputHeroColor(input, input.dataset.type === 'pet');

					const val = input.value.toLowerCase();
					if (val.length < 1) { targetList.classList.remove('show'); return; }
					
					const items = type === 'pet' ? pets : heroes;
					const filtered = type === 'pet' ? items.filter(p => p.toLowerCase().startsWith(val)).slice(0, 6) :
						items.filter(h => h.name.toLowerCase().startsWith(val)).slice(0, 6);
					
					if (!filtered.length) { targetList.classList.remove('show'); return; }
					
					targetList.innerHTML = filtered.map(item => type === 'pet' ?
						`<div class="autocomplete-item" data-value="${item}">${item}</div>` :
						`<div class="autocomplete-item race-${item.race.toLowerCase()}" data-value="${item.name}">${item.name} <span class="race">(${raceLabel(item.race)})</span></div>`
					).join('');
					
					targetList.classList.add('show');
					
					// Kliknięcie w element
					targetList.querySelectorAll('.autocomplete-item').forEach((item, idx) => {
						item.addEventListener('click', () => selectItem(item.dataset.value));
						item.addEventListener('mouseenter', () => {
							selectedIndex = idx;
							updateSelection();
						});
					});
				});
				
				// Obsługa klawiszy
				input.addEventListener('keydown', e => {
					const items = targetList.querySelectorAll('.autocomplete-item');
					const isListVisible = targetList.classList.contains('show') && items.length > 0;
					
					if (e.key === 'ArrowDown') {
						if (isListVisible) {
							e.preventDefault();
							selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
							updateSelection();
						}
					} else if (e.key === 'ArrowUp') {
						if (isListVisible) {
							e.preventDefault();
							selectedIndex = Math.max(selectedIndex - 1, 0);
							updateSelection();
						}
					} else if (e.key === 'Enter') {
						if (isListVisible && selectedIndex >= 0 && items[selectedIndex]) {
							e.preventDefault();
							e.stopPropagation();
							selectItem(items[selectedIndex].dataset.value);
						}
						// Jeśli nic nie zaznaczone, pozwól na domyślne zachowanie (np. szukaj)
					} else if (e.key === 'Escape') {
						targetList.classList.remove('show');
						selectedIndex = -1;
					} else if (e.key === 'Tab') {
						// Tab też wybiera jeśli coś zaznaczone
						if (isListVisible && selectedIndex >= 0 && items[selectedIndex]) {
							selectItem(items[selectedIndex].dataset.value);
						}
					}
				});
				
				input.addEventListener('blur', () => setTimeout(() => {
					targetList.classList.remove('show');
					selectedIndex = -1;
					if (input.id.startsWith('search-')) updateSearchTagsSelection();
					if (input.id.startsWith('add-') && !['add-name', 'add-comment'].includes(input.id)) updateAddFormTagsSelection();
				}, 200));
			});
		}

		const FORM_FIELD_CONFIG = {
			// Wyszukiwarka
			search: {
				fields: ['search-pos1', 'search-pos2', 'search-pos3', 'search-pos4', 'search-pos5', 'search-pos6', 'search-pos7', 'search-pos8', 'search-pet'],
				tabId: 'tab-search'
			},
			// Dodawanie - przeciwnik
			'add-enemy': {
				fields: ['add-enemy1', 'add-enemy2', 'add-enemy3', 'add-enemy4', 'add-enemy5', 'add-enemy6', 'add-enemy7', 'add-enemy8', 'add-enemyPet'],
				nextSection: 'add-my',
				tabId: 'tab-add'
			},
			// Dodawanie - twój skład
			'add-my': {
				fields: ['add-my1', 'add-my2', 'add-my3', 'add-my4', 'add-my5', 'add-my6', 'add-my7', 'add-my8', 'add-myPet'],
				tabId: 'tab-add'
			},
			// Edycja - przeciwnik
			'edit-enemy': {
				fields: ['edit-enemy1', 'edit-enemy2', 'edit-enemy3', 'edit-enemy4', 'edit-enemy5', 'edit-enemy6', 'edit-enemy7', 'edit-enemy8', 'edit-enemyPet'],
				nextSection: 'edit-my',
				tabId: 'edit-modal'
			},
			// Edycja - twój skład
			'edit-my': {
				fields: ['edit-my1', 'edit-my2', 'edit-my3', 'edit-my4', 'edit-my5', 'edit-my6', 'edit-my7', 'edit-my8', 'edit-myPet'],
				tabId: 'edit-modal'
			},
			// Planer wojny - wróg 1
			'war-e1': {
				fields: ['war-e1-h1', 'war-e1-h2', 'war-e1-h3', 'war-e1-h4', 'war-e1-h5', 'war-e1-h6', 'war-e1-h7', 'war-e1-h8', 'war-e1-pet'],
				nextSection: 'war-e2',
				tabId: 'tab-war'
			},
			// Planer wojny - wróg 2
			'war-e2': {
				fields: ['war-e2-h1', 'war-e2-h2', 'war-e2-h3', 'war-e2-h4', 'war-e2-h5', 'war-e2-h6', 'war-e2-h7', 'war-e2-h8', 'war-e2-pet'],
				nextSection: 'war-e3',
				tabId: 'tab-war'
			},
			// Planer wojny - wróg 3
			'war-e3': {
				fields: ['war-e3-h1', 'war-e3-h2', 'war-e3-h3', 'war-e3-h4', 'war-e3-h5', 'war-e3-h6', 'war-e3-h7', 'war-e3-h8', 'war-e3-pet'],
				tabId: 'tab-war'
			},
			// Kreator - skład 1
			'kreator-1': {
				fields: ['kreator-1-h1', 'kreator-1-h2', 'kreator-1-h3', 'kreator-1-h4', 'kreator-1-h5', 'kreator-1-h6', 'kreator-1-h7', 'kreator-1-h8', 'kreator-1-pet'],
				nextSection: 'kreator-2',
				tabId: 'tab-kreator'
			},
			// Kreator - skład 2
			'kreator-2': {
				fields: ['kreator-2-h1', 'kreator-2-h2', 'kreator-2-h3', 'kreator-2-h4', 'kreator-2-h5', 'kreator-2-h6', 'kreator-2-h7', 'kreator-2-h8', 'kreator-2-pet'],
				nextSection: 'kreator-3',
				tabId: 'tab-kreator'
			},
			// Kreator - skład 3
			'kreator-3': {
				fields: ['kreator-3-h1', 'kreator-3-h2', 'kreator-3-h3', 'kreator-3-h4', 'kreator-3-h5', 'kreator-3-h6', 'kreator-3-h7', 'kreator-3-h8', 'kreator-3-pet'],
				tabId: 'tab-kreator'
			},
			// Obrona - dodawanie nowego składu obronnego
			'defense-add': {
				fields: ['defense-my1', 'defense-my2', 'defense-my3', 'defense-my4', 'defense-my5', 'defense-my6', 'defense-my7', 'defense-my8', 'defense-myPet'],
				tabId: 'tab-defense'
			},
			// Obrona - edycja składu (modal)
			'defense-edit': {
				fields: ['defense-edit-my1', 'defense-edit-my2', 'defense-edit-my3', 'defense-edit-my4', 'defense-edit-my5', 'defense-edit-my6', 'defense-edit-my7', 'defense-edit-my8', 'defense-edit-myPet'],
				tabId: 'defense-edit-modal'
			}
		};

		// =====================================================
		// AUTO-PRZESKAKIWANIE I SKRÓTY KLAWISZOWE - UNIWERSALNE
		// =====================================================

		// Konfiguracja pól dla każdej sekcji

		// Określ sekcję na podstawie ID pola
		function getFieldSection(fieldId) {
			if (fieldId.startsWith('search-')) return 'search';
			if (fieldId.startsWith('add-enemy')) return 'add-enemy';
			if (fieldId.startsWith('add-my')) return 'add-my';
			if (fieldId.startsWith('edit-enemy')) return 'edit-enemy';
			if (fieldId.startsWith('edit-my')) return 'edit-my';
			if (fieldId.startsWith('war-e1')) return 'war-e1';
			if (fieldId.startsWith('war-e2')) return 'war-e2';
			if (fieldId.startsWith('war-e3')) return 'war-e3';
			if (fieldId.startsWith('kreator-1')) return 'kreator-1';
			if (fieldId.startsWith('kreator-2')) return 'kreator-2';
			if (fieldId.startsWith('kreator-3')) return 'kreator-3';
			if (fieldId.startsWith('defense-edit-my')) return 'defense-edit';
			if (fieldId.startsWith('defense-my')) return 'defense-add';
			return null;
		}

		// Znajdź następne puste pole
		function getNextEmptyField(currentFieldId) {
			const sectionKey = getFieldSection(currentFieldId);
			if (!sectionKey) return null;
			
			const config = FORM_FIELD_CONFIG[sectionKey];
			if (!config) return null;
			
			// Dla sekcji z odwracanymi rzędami użyj dynamicznej kolejności
			let fields;
			if (sectionKey === 'add-enemy') {
				fields = getEnemyFieldsInOrder();
			} else if (sectionKey === 'search') {
				fields = getSearchFieldsInOrder();
			} else {
				fields = config.fields;
			}
			
			const currentIndex = fields.indexOf(currentFieldId);
			if (currentIndex === -1) return null;
			
			// Szukaj następnego pustego w tej sekcji
			for (let i = currentIndex + 1; i < fields.length; i++) {
				const field = $(fields[i]);
				if (field && !field.value.trim()) {
					return fields[i];
				}
			}
			
			// Jeśli jest następna sekcja, szukaj tam
			if (config.nextSection) {
				const nextConfig = FORM_FIELD_CONFIG[config.nextSection];
				if (nextConfig) {
					for (const fieldId of nextConfig.fields) {
						const field = $(fieldId);
						if (field && !field.value.trim()) {
							return fieldId;
						}
					}
				}
			}
			
			return null;
		}

		// Skocz do konkretnej pozycji (1-8 lub 9 dla peta)
		function jumpToPosition(num) {
			const activeEl = document.activeElement;
			if (!activeEl || !activeEl.id) return;
			
			const sectionKey = getFieldSection(activeEl.id);
			if (!sectionKey) return;
			
			const config = FORM_FIELD_CONFIG[sectionKey];
			if (!config) return;
			
			// num 1-8 = pozycje, num 9 = pet
			const targetIndex = num === 9 ? 8 : num - 1;
			
			if (targetIndex >= 0 && targetIndex < config.fields.length) {
				const target = $(config.fields[targetIndex]);
				if (target) {
					target.focus();
					target.select();
				}
			}
		}

		// Pobierz wszystkie pola dla danej zakładki (do Tab navigation)
		function getAllFieldsForTab(tabId) {
			const fields = [];
			
			if (tabId === 'tab-search') {
				fields.push(...getSearchFieldsInOrder());
			} else if (tabId === 'tab-add') {
				fields.push('add-name');
				fields.push(...getEnemyFieldsInOrder());
				fields.push(...FORM_FIELD_CONFIG['add-my'].fields);
				fields.push('add-comment');
			} else if (tabId === 'tab-war') {
				fields.push(...FORM_FIELD_CONFIG['war-e1'].fields);
				fields.push(...FORM_FIELD_CONFIG['war-e2'].fields);
				fields.push(...FORM_FIELD_CONFIG['war-e3'].fields);
			}
			
			return fields;
		}


        // ═══════════════════════════════════════════════════════════
        // RACE ORDER + QUICK TAGS
        // ═══════════════════════════════════════════════════════════

        // =====================================================
        // QUICK TAGS - UNIWERSALNA FUNKCJA
        // =====================================================
        
        // Domyślna kolejność ras (konfigurowalna)
        const DEFAULT_RACE_ORDER = ['Human', 'Fire', 'Elf', 'Undead', 'Dark', 'Light'];
        let RACE_ORDER = storage.getJson('souls_race_order', null) || [...DEFAULT_RACE_ORDER];
        const RACE_EMOJI = { Dark: '🌑', Light: '☀️', Human: '👤', Fire: '🔥', Elf: '🌿', Undead: '💀' };
        // Display labels — pozwala renomować rasę w UI bez ruszania danych/CSS/Firebase.
        // Klucz = identyfikator wewnętrzny (jak w hero.race), wartość = co user widzi.
        const RACE_LABEL = { Fire: 'Horde' };
        const raceLabel = race => RACE_LABEL[race] || race;

        // Funkcje zarządzania kolejnością ras
        function moveRaceUp(race) {
            const idx = RACE_ORDER.indexOf(race);
            if (idx > 0) {
                [RACE_ORDER[idx - 1], RACE_ORDER[idx]] = [RACE_ORDER[idx], RACE_ORDER[idx - 1]];
                saveRaceOrder();
                refreshAllTags();
            }
        }

        function moveRaceDown(race) {
            const idx = RACE_ORDER.indexOf(race);
            if (idx < RACE_ORDER.length - 1) {
                [RACE_ORDER[idx], RACE_ORDER[idx + 1]] = [RACE_ORDER[idx + 1], RACE_ORDER[idx]];
                saveRaceOrder();
                refreshAllTags();
            }
        }

        function resetRaceOrder() {
            RACE_ORDER = [...DEFAULT_RACE_ORDER];
            saveRaceOrder();
            refreshAllTags();
            showToast('Przywrócono domyślną kolejność');
        }

        function saveRaceOrder() {
            storage.setJson('souls_race_order', RACE_ORDER);
        }

        function refreshAllTags() {
            // Zapamiętaj które panele konfiguracji są otwarte (po id kontenera-rodzica)
            const openPanels = [];
            document.querySelectorAll('.race-order-config.show').forEach(config => {
                const parentContainer = config.parentElement;
                if (parentContainer && parentContainer.id) {
                    openPanels.push(parentContainer.id);
                }
            });
            
            generateQuickTags();
            generateAddFormTags();
            generateWarTags();
            generateKreatorTags();
            
            // Przywróć otwarte panele
            openPanels.forEach(containerId => {
                const container = $(containerId);
                if (container) {
                    const config = container.querySelector('.race-order-config');
                    if (config) {
                        config.classList.add('show');
                        renderRaceOrderConfigIn(config);
                    }
                }
            });
        }

		function buildTagsHTML(raceGroups, petsData, clickHandler, petClickHandler, showCounts = false) {
			let html = `<div class="quick-tags-expand-all">
				<button class="expand-all-btn" onclick="toggleAllTags(this.closest('.search-form-tags, .add-form-tags, .war-form-tags, .kreator-form-tags'))">▼ ${t('quickTags.expandAll')}</button>
				<button class="race-order-toggle" onclick="toggleRaceOrderConfig(this)" title="Zmień kolejność ras">⚙️</button>
			</div>
			<div class="race-order-config"></div>`;
			
			RACE_ORDER.forEach(race => {
				if (raceGroups[race]?.length) {
					html += `<div class="quick-tags-section"><div class="quick-tags-header" onclick="toggleQuickTagSection(this)"><span class="toggle-icon">▶</span>${RACE_EMOJI[race]} ${raceLabel(race)} (${raceGroups[race].length})</div><div class="quick-tags-content"><div class="quick-tags">${raceGroups[race].map(h => `<span class="quick-tag tag-${race.toLowerCase()}" onclick="${clickHandler}('${h.name || h}', event)"${showCounts && h.count ? ` title="${h.count}x"` : ''}>${h.name || h}</span>`).join('')}</div></div></div>`;
				}
			});
			
			if (petsData?.length) {
				html += `<div class="quick-tags-section"><div class="quick-tags-header" onclick="toggleQuickTagSection(this)"><span class="toggle-icon">▶</span>🐾 ${t('quickTags.pets')} (${petsData.length})</div><div class="quick-tags-content"><div class="quick-tags">${petsData.map(p => `<span class="quick-tag tag-pet" onclick="${petClickHandler}('${p.name || p}')"${showCounts && p.count ? ` title="${p.count}x"` : ''}>${p.name || p}</span>`).join('')}</div></div></div>`;
			}
			
			return html;
		}

		function toggleRaceOrderConfig(btn) {
			const container = btn.closest('.search-form-tags, .add-form-tags, .war-form-tags, .kreator-form-tags');
			const config = container?.querySelector('.race-order-config');
			if (config) {
				config.classList.toggle('show');
				if (config.classList.contains('show')) {
					renderRaceOrderConfigIn(config);
				}
			}
		}

		function renderRaceOrderConfigIn(container) {
			container.innerHTML = RACE_ORDER.map((race, idx) => `
				<div class="race-order-item">
					<span class="race-order-label">${RACE_EMOJI[race]} ${raceLabel(race)}</span>
					<div class="race-order-buttons">
						<button class="btn btn-tiny" onclick="moveRaceUp('${race}')" ${idx === 0 ? 'disabled' : ''}>▲</button>
						<button class="btn btn-tiny" onclick="moveRaceDown('${race}')" ${idx === RACE_ORDER.length - 1 ? 'disabled' : ''}>▼</button>
					</div>
				</div>
			`).join('') + `
				<div style="margin-top: 8px; text-align: center;">
					<button class="btn btn-small btn-secondary" onclick="resetRaceOrder()">↺ Domyślna kolejność</button>
				</div>
			`;
		}

        function generateQuickTags() {
            if (!allFormations.length) return;
            
            const heroCounts = {}, petCounts = {};
            const heroRaceMap = {};
            heroes.forEach(h => heroRaceMap[h.name.toLowerCase()] = h.race);
            
            allFormations.forEach(f => {
                f.enemy.filter(h => h).forEach(h => heroCounts[h] = (heroCounts[h] || 0) + 1);
                if (f.enemyPet) petCounts[f.enemyPet] = (petCounts[f.enemyPet] || 0) + 1;
            });
            
            const raceGroups = { Dark: [], Light: [], Human: [], Fire: [], Elf: [], Undead: [] };
            Object.entries(heroCounts).forEach(([name, count]) => {
                const race = heroRaceMap[name.toLowerCase()];
                if (race && raceGroups[race]) raceGroups[race].push({ name, count });
            });
            RACE_ORDER.forEach(r => raceGroups[r].sort((a, b) => a.name.localeCompare(b.name)));
            
            const petsData = Object.entries(petCounts).sort((a, b) => a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count }));
            
            $('quick-tags-container').innerHTML = buildTagsHTML(raceGroups, petsData, 'addToSearch', 'addPetToSearch', true);
            updateSearchTagsSelection();
        }

        function generateAddFormTags() {
            const container = $('add-form-tags-container');
            if (!container) return;
            
            const raceGroups = { Dark: [], Light: [], Human: [], Fire: [], Elf: [], Undead: [] };
            heroes.forEach(h => raceGroups[h.race]?.push(h.name));
            RACE_ORDER.forEach(r => raceGroups[r].sort((a, b) => a.localeCompare(b)));
            
            container.innerHTML = buildTagsHTML(raceGroups, pets, "addTagToActiveField", "addTagToActiveField");
            updateAddFormTagsSelection();
        }

        function generateWarTags() {
            const container = $('war-quick-tags-container');
            if (!container) return;
            
            const raceGroups = { Dark: [], Light: [], Human: [], Fire: [], Elf: [], Undead: [] };
            heroes.forEach(h => raceGroups[h.race]?.push(h.name));
            RACE_ORDER.forEach(r => raceGroups[r].sort((a, b) => a.localeCompare(b)));
            
            // Dla wojny - własna funkcja addToWar
            container.innerHTML = buildTagsHTML(raceGroups, pets, "addToWar", "addPetToWar", false);
        }

        // Wykluczeni bohaterowie w Kreatorze (definiowane wcześnie, bo generateKreatorTags używa tego)
        let kreatorExcludedHeroes = storage.getJson('souls_kreator_excluded_heroes', []);

        function generateKreatorTags() {
            const container = $('kreator-quick-tags-container');
            if (!container) return;
            
            // Filtruj wykluczonych bohaterów
            const excludedNormalized = (kreatorExcludedHeroes || []).map(h => normalize(h));
            const filteredHeroes = heroes.filter(h => !excludedNormalized.includes(normalize(h.name)));
            
            const raceGroups = { Dark: [], Light: [], Human: [], Fire: [], Elf: [], Undead: [] };
            filteredHeroes.forEach(h => raceGroups[h.race]?.push(h.name));
            RACE_ORDER.forEach(r => raceGroups[r].sort((a, b) => a.localeCompare(b)));
            
            // Dla kreatora - własna funkcja addToKreator
            let html = buildTagsHTML(raceGroups, pets, "addToKreator", "addPetToKreator", false);
            container.innerHTML = html;
            
            // Rozwiń wszystkie tagi
            setTimeout(() => {
                container.querySelectorAll('.quick-tags-header').forEach(h => {
                    h.classList.add('expanded');
                    h.nextElementSibling.classList.add('show');
                });
                const btn = container.querySelector('.expand-all-btn');
                if (btn) btn.textContent = `▲ ${t('quickTags.collapseAll')}`;
            }, 100);
        }

        function toggleQuickTagSection(header) {
            header.classList.toggle('expanded');
            header.nextElementSibling.classList.toggle('show');
        }

        function toggleAllTags(container) {
            const sections = container.querySelectorAll('.quick-tags-section');
            const btn = container.querySelector('.expand-all-btn');
            const allExpanded = container.querySelectorAll('.quick-tags-header.expanded').length === sections.length;
            
            sections.forEach(s => {
                s.querySelector('.quick-tags-header').classList.toggle('expanded', !allExpanded);
                s.querySelector('.quick-tags-content').classList.toggle('show', !allExpanded);
            });
            btn.textContent = allExpanded ? `▼ ${t('quickTags.expandAll')}` : `▲ ${t('quickTags.collapseAll')}`;
        }


        // ═══════════════════════════════════════════════════════════
        // TAB: SEARCH — wyszukiwarka, wykluczeni, historia
        // ═══════════════════════════════════════════════════════════

		// Odwrócenie kolejności rzędów w wyszukiwarce
		function loadSearchRowsPreference() {
			// Domyślnie true (6-7-8 na górze)
			const reversed = storage.getBool('souls_searchRowsReversed', true);
			const container = $('search-rows-container');
			const btn = $('btn-flip-search-rows');
			if (container && reversed) {
				container.classList.add('reversed');
			}
			if (btn && reversed) {
				btn.classList.add('active');
			}
		}

		function toggleSearchRowsOrder() {
			const container = $('search-rows-container');
			const btn = $('btn-flip-search-rows');
			if (!container) return;
			
			container.classList.toggle('reversed');
			btn?.classList.toggle('active');
			
			const isReversed = container.classList.contains('reversed');
			storage.setBool('souls_searchRowsReversed', isReversed);
			
			const msg = isReversed 
				? t('layout.top678')
				: t('layout.top123');
			showToast(msg);
		}

		// Zwraca pola wyszukiwarki w kolejności wizualnej
		function getSearchFieldsInOrder() {
			const reversed = storage.getBool('souls_searchRowsReversed', true);

			if (reversed) {
				return [
					'search-pos6', 'search-pos7', 'search-pos8',
					'search-pos4', 'search-pos5',
					'search-pos1', 'search-pos2', 'search-pos3',
					'search-pet'
				];
			} else {
				return FORM_FIELD_CONFIG.search.fields;
			}
		}

        // =====================================================
        // WYSZUKIWARKA
        // =====================================================
		function addToSearch(heroName, event) {
			// Ctrl+klik = dodaj do wykluczonych
			if (event && event.ctrlKey) {
				addExcludedHero(heroName);
				return;
			}
			
			// Sprawdź czy już jest - jeśli tak, usuń (toggle)
			for (let i = 1; i <= 8; i++) {
				const input = $(`search-pos${i}`);
				if (input.value.trim().toLowerCase() === heroName.toLowerCase()) {
					input.value = '';
					updateSearchTagsSelection();
					updateSearchCounter();
					return;
				}
			}
			
			// Jeśli jest aktywne pole, dodaj tam
			if (activeSearchField) {
				const activeInput = $(activeSearchField);
				if (activeInput && activeInput.id.startsWith('search-pos')) {
					activeInput.value = heroName;
					updateSearchTagsSelection();
					updateSearchCounter();
					return;
				}
			}
			
			// W przeciwnym razie dodaj do pierwszego wolnego
			for (let i = 1; i <= 8; i++) {
				const input = $(`search-pos${i}`);
				if (!input.value.trim()) {
					input.value = heroName;
					updateSearchTagsSelection();
					updateSearchCounter();
					return;
				}
			}
			showToast(t('search.allSlotsFull'), true);
		}

		function addPetToSearch(petName) {
			const petInput = $('search-pet');
			
			// Toggle - jeśli ten sam pet, usuń
			if (petInput.value.trim().toLowerCase() === petName.toLowerCase()) {
				petInput.value = '';
			} 
			// Jeśli pole pet jest aktywne LUB puste, wpisz
			else if (activeSearchField === 'search-pet' || !petInput.value.trim()) {
				petInput.value = petName;
			} 
			else {
				showToast(t('search.petSlotFull'), true);
				return;
			}
			updateSearchTagsSelection();
			updateSearchCounter();
		}

        function updateSearchCounter() {
            const heroCount = getFieldValues('search-pos', 8).filter(v => v).length;
            let count = heroCount;
            if ($('search-pet').value.trim()) count++;
            
            let counter = $('search-counter');
            if (count > 0) {
                if (!counter) {
                    counter = document.createElement('div');
                    counter.id = 'search-counter';
                    counter.className = 'search-counter';
                    $('quick-tags-container').parentNode.insertBefore(counter, $('quick-tags-container').nextSibling);
                }
                counter.innerHTML = `${t('search.selected')}: <strong>${count}</strong> / 6${heroCount > 5 ? ` <span style="color:#e0a030;font-size:0.78rem;font-weight:600;margin-left:8px;">⚠️ ${t('search.maxHeroes')}</span>` : ''}`;
            } else counter?.remove();
        }

        function updateSearchTagsSelection() {
            const values = [...getFieldValues('search-pos', 8), $('search-pet')?.value.trim()].filter(v => v).map(normalize);
            document.querySelectorAll('#quick-tags-container .quick-tag').forEach(tag => {
                tag.classList.toggle('selected', values.includes(tag.textContent.toLowerCase()));
            });
        }

		function searchFormations() {
			saveSearchToHistory();
			
			const searchHeroes = [...new Set(getFieldValues('search-pos', 8).filter(v => v).map(normalize))];
			const searchPet = normalize($('search-pet').value);
			
			if (!searchHeroes.length && !searchPet) { showToast(t('search.enterAtLeastOne'), true); return; }
			if (!allFormations.length) { showToast(t('search.dataLoading'), true); return; }

			const query = { heroes: searchHeroes, pet: searchPet || null };
			const results = allFormations.map(f => {
				const r = scoreFormation(f, query);
				return r.score > 0
					? { formation: f, matchedHeroes: r.matchedHeroes, petMatched: r.petMatched, score: r.score, maxScore: r.maxScore }
					: null;
			}).filter(Boolean);

			displayResults(results, searchHeroes);
		}

		// Sortowanie wyników: 'relevance' (trafność, tie-break po id) lub 'newest' (najnowsze po id, tie-break po score)
		function sortSearchResults(results) {
			const sorted = [...results];
			if (currentSearchSort === 'newest') {
				sorted.sort((a, b) => (b.formation.id - a.formation.id) || (b.score - a.score));
			} else {
				sorted.sort((a, b) => (b.score - a.score) || (b.formation.id - a.formation.id));
			}
			return sorted;
		}

		function setSearchSort(mode) {
			currentSearchSort = mode;
			userTouchedSort = true;
			if (lastSearch) displayResults(lastSearch.results, lastSearch.searchHeroes);
		}

		function setSearchMinMatch(n) {
			searchMinMatch = n;
			storage.setJson('souls_search_min_match', n);
			if (lastSearch) displayResults(lastSearch.results, lastSearch.searchHeroes);
		}

		function displayResults(results, searchHeroes) {
			// Reset selekcji przy nowym wyszukiwaniu
			selectedForCompare = [];
			// Zapamiętaj surowe wyniki, żeby przełącznik sortowania mógł je przerenderować bez ponownego szukania
			lastSearch = { results, searchHeroes };

			if (!results.length) {
				$('results-section').innerHTML = `<div class="empty-state"><p>${t('search.noResults')}</p></div>`;
				return;
			}

			// Sortuj wg aktywnego trybu, potem filtruj wykluczonych
			let displayedResults = sortSearchResults(results);
			let hiddenCount = 0;

			if (hideExcludedResults && excludedHeroes.length > 0) {
				displayedResults = displayedResults.filter(r => !isFormationExcluded(r.formation).excluded);
				hiddenCount = results.length - displayedResults.length;
			}

			// Filtruj po min. trafności. Próg nie może przekroczyć liczby wpisanych postaci (maxScore),
			// więc krótkie wyszukiwania nigdy nie zostają puste przez sam próg.
			const maxTyped = results[0].maxScore;
			const effectiveMin = Math.min(searchMinMatch, maxTyped);
			let belowMin = 0;
			if (effectiveMin > 1) {
				const before = displayedResults.length;
				displayedResults = displayedResults.filter(r => (r.matchedHeroes.length + (r.petMatched ? 1 : 0)) >= effectiveMin);
				belowMin = before - displayedResults.length;
			}

			// Przyciski progu (1 = wszystkie). Pokazujemy tylko gdy wpisano >1 postać; cap na 5 (reguła gry).
			let minMatchBtns = '';
			if (maxTyped > 1) {
				for (let n = 1; n <= Math.min(maxTyped, 5); n++) {
					const label = n === 1 ? t('search.minMatchAll') : `${n}+`;
					minMatchBtns += `<button class="sort-btn ${effectiveMin === n ? 'active' : ''}" onclick="setSearchMinMatch(${n})">${label}</button>`;
				}
			}

			let html = `<div class="results-header">
				<div class="results-header-top">
					<h3>${t('search.results')}</h3>
					<div class="results-sort">
						<button class="sort-btn ${currentSearchSort === 'relevance' ? 'active' : ''}" onclick="setSearchSort('relevance')" title="${t('sort.relevanceHint')}">🎯 ${t('sort.relevance')}</button>
						<button class="sort-btn ${currentSearchSort === 'newest' ? 'active' : ''}" onclick="setSearchSort('newest')" title="${t('sort.newestHint')}">🕐 ${t('sort.newest')}</button>
					</div>
				</div>
				<div class="results-meta">
					<span class="results-count">${t('search.found')}: ${displayedResults.length}${hiddenCount > 0 ? ` <span style="color:#f44336;">(+${hiddenCount} 🚫)</span>` : ''}${belowMin > 0 ? ` <span style="color:var(--text-muted);" title="${t('search.belowThresholdHint')}">(+${belowMin} 🔽)</span>` : ''}</span>
					${minMatchBtns ? `<div class="results-filter"><span class="results-filter-label">${t('search.minMatch')}:</span>${minMatchBtns}</div>` : ''}
				</div>
			</div>`;

			if (!displayedResults.length) {
				const reason = belowMin > 0
					? `<p style="font-size:0.8rem;color:var(--text-muted);margin-top:10px;">${t('search.allBelowThreshold', {n: effectiveMin})}</p>`
					: (hiddenCount > 0 ? `<p style="font-size:0.8rem;color:var(--text-muted);margin-top:10px;">${t('excluded.hiddenInResults', {n: hiddenCount})}</p>` : '');
				html += `<div class="empty-state"><p>${t('search.noResults')}</p>${reason}</div>`;
				$('results-section').innerHTML = html;
				updateCompareButton();
				return;
			}
			
			html += displayedResults.map(r => {
				const f = r.formation;
				const enemyDisplay = f.enemy.filter(h => h).map(h => r.matchedHeroes.some(mh => normalize(h) === mh || normalize(h).startsWith(mh)) ? `<span class="matched-hero">${h}</span>` : h).join(', ');
				const petDisplay = r.petMatched ? `<span class="matched-hero">${f.enemyPet}</span>` : (f.enemyPet || '—');
				const missingHeroes = searchHeroes.filter(sh => !r.matchedHeroes.includes(sh));
				
				// Sprawdź wykluczone (dla trybu "pokaż wszystkie")
				const exclusionCheck = isFormationExcluded(f);
				const hasExcluded = !hideExcludedResults && exclusionCheck.excluded;

				return `
					<div class="result-card ${hasExcluded ? 'has-excluded' : ''}" id="result-card-${f.id}">
						<div class="result-card-checkbox">
							<input type="checkbox" id="compare-${f.id}" onchange="toggleCompareSelection(${f.id})" title="${t('compare.select')}">
						</div>
						<div class="result-card-content" onclick="showFormation(${f.id})">
							<div class="result-card-header">
								<span class="result-id">ID: ${f.id}${f.isBase ? '' : ` <span class="badge user-badge">${t('badge.user')}</span>`}${isNewFormation(f) ? ` <span class="badge new-badge">${t('badge.new')}</span>` : ''}</span>
								<span class="match-score match-${Math.min(Math.floor(r.score), 6)}">${r.score}/${r.maxScore}</span>
							</div>
							<div class="result-name">${escapeHtml(f.name)}</div>
							<div class="result-heroes">${t('search.enemy')}: ${enemyDisplay} + ${petDisplay}</div>
							<div class="result-heroes result-my-heroes">⚔️ Kontra: ${f.my.filter(h => h).map(h => `<span class="my-hero">${h}</span>`).join(', ') || '—'}${f.myPet ? ` + <span class="my-pet">${f.myPet}</span>` : ''}</div>
							${missingHeroes.length ? `<div class="result-missing">❌ ${t('search.missing')}: ${missingHeroes.join(', ')}</div>` : ''}
							${f.comment ? `<div class="result-comment clamped" onclick="event.stopPropagation(); this.classList.toggle('clamped')" title="${t('search.toggleComment')}"><span class="comment-icon">💬</span>${escapeHtml(f.comment)}</div>` : ''}
							${hasExcluded ? `<div class="result-excluded-heroes">🚫 ${t('exclude.has')}: ${exclusionCheck.heroes.join(', ')}</div>` : ''}
						</div>
					</div>`;
			}).join('');
			
			$('results-section').innerHTML = html;
			updateCompareButton();
		}

        function clearSearch() {
            for (let i = 1; i <= 8; i++) $(`search-pos${i}`).value = '';
            $('search-pet').value = '';
            lastSearch = null;
            renderSearchEmptyState();
            document.querySelectorAll('.quick-tag.selected').forEach(t => t.classList.remove('selected'));
            $('search-counter')?.remove();
        }

        // Stan pustego ekranu wyszukiwarki — z opcją powtórzenia ostatniego wyszukiwania
        function renderSearchEmptyState() {
            const section = $('results-section');
            if (!section) return;
            const last = searchHistory[0];
            const lastFilled = (last?.heroes || []).filter(v => v);
            const lastBtn = (last && (lastFilled.length || last.pet))
                ? `<button class="btn btn-secondary repeat-search-btn" onclick="loadSearchFromHistory(0)">🔁 ${t('search.repeatLast')}: ${lastFilled.slice(0, 3).join(', ')}${last.pet ? ` 🐾${last.pet}` : ''}</button>`
                : '';
            section.innerHTML = `<div class="empty-state"><p>${t('search.emptyState')}</p>${lastBtn}</div>`;
        }

		// =====================================================
		// WYKLUCZANIE BOHATERÓW
		// =====================================================
		// prefix: '' (search), 'war', 'kreator'
		function toggleExcludedSection(prefix = '') {
			const p = prefix ? prefix + '-' : '';
			$(`${p}excluded-content`).classList.toggle('show');
			$(`${p}excluded-toggle-icon`).classList.toggle('expanded');
		}

		function renderExcludedHeroes() {
			const container = $('excluded-chips');
			const countEl = $('excluded-count');

			countEl.textContent = `(${excludedHeroes.length})`;
			
			if (excludedHeroes.length === 0) {
				container.innerHTML = `<div class="excluded-empty" data-i18n="exclude.empty">${t('exclude.empty')}</div>`;
				return;
			}
			
			container.innerHTML = excludedHeroes.map(hero => `
				<div class="excluded-chip">
					<span>${hero}</span>
					<button class="excluded-chip-remove" onclick="removeExcludedHero('${hero}')" title="${t('common.delete')}">✕</button>
				</div>
			`).join('');
		}

		function addExcludedHero(name) {
			if (!name) return;

			const properName = findCanonicalHeroName(name);

			if (isHeroInList(excludedHeroes, properName)) {
				showToast(t('excluded.alreadyExcluded'), true);
				return;
			}

			excludedHeroes.push(properName);
			storage.setJson('souls_excluded_heroes', excludedHeroes);

			renderExcludedHeroes();
			showToast(`🚫 ${t('excluded.added')}: ${properName}`);

			const input = $('excluded-input');
			if (input) input.value = '';

			filterDatabase();
		}

		function removeExcludedHero(name) {
			const n = normalize(name);
			excludedHeroes = excludedHeroes.filter(h => normalize(h) !== n);
			storage.setJson('souls_excluded_heroes', excludedHeroes);

			renderExcludedHeroes();
			showToast(`✅ ${t('excluded.removed')}: ${name}`);

			filterDatabase();
		}

		function clearExcludedHeroes() {
			if (excludedHeroes.length === 0) return;

			if (!confirm(t('excluded.confirmClear'))) return;

			excludedHeroes = [];
			storage.setJson('souls_excluded_heroes', excludedHeroes);

			renderExcludedHeroes();
			showToast(t('excluded.cleared'));

			filterDatabase();
		}

		function onExcludeSettingChange() {
			hideExcludedResults = $('exclude-hide-results').checked;
			storage.setBool('souls_hide_excluded', hideExcludedResults);
			
			// Odśwież aktywną zakładkę
			filterDatabase();
		}

		function isFormationExcluded(formation) {
			if (excludedHeroes.length === 0) return { excluded: false, heroes: [] };
			
			const myHeroes = formation.my.filter(h => h).map(h => normalize(h));
			const excludedInFormation = excludedHeroes.filter(ex => 
				myHeroes.includes(normalize(ex))
			);
			
			return {
				excluded: excludedInFormation.length > 0,
				heroes: excludedInFormation
			};
		}

		function setupExcludedAutocomplete() {
			const input = $('excluded-input');
			const list = $('list-excluded-input');
			
			if (!input || !list) return;
			
			input.addEventListener('input', () => {
				const val = input.value.toLowerCase();
				if (val.length < 1) { 
					list.classList.remove('show'); 
					return; 
				}
				
				// Filtruj bohaterów (bez już wykluczonych)
				const filtered = heroes
					.filter(h => h.name.toLowerCase().startsWith(val))
					.filter(h => !excludedHeroes.some(ex => ex.toLowerCase() === h.name.toLowerCase()))
					.slice(0, 6);
				
				if (!filtered.length) { 
					list.classList.remove('show'); 
					return; 
				}
				
				list.innerHTML = filtered.map(h => 
					`<div class="autocomplete-item race-${h.race.toLowerCase()}" data-value="${h.name}">${h.name} <span class="race">(${raceLabel(h.race)})</span></div>`
				).join('');
				
				list.classList.add('show');
				
				list.querySelectorAll('.autocomplete-item').forEach(item => {
					item.addEventListener('click', () => {
						addExcludedHero(item.dataset.value);
						list.classList.remove('show');
					});
				});
			});
			
			input.addEventListener('keydown', e => {
				if (e.key === 'Enter') {
					e.preventDefault();
					const val = input.value.trim();
					if (val) {
						addExcludedHero(val);
					}
				}
			});
			
			input.addEventListener('blur', () => {
				setTimeout(() => list.classList.remove('show'), 200);
			});
		}

		// HISTORIA WYSZUKIWAŃ
		function toggleSearchHistory() {
			const dropdown = $('search-history-dropdown');
			dropdown.classList.toggle('hidden');
			
			if (!dropdown.classList.contains('hidden')) {
				renderSearchHistory();
				// Zamknij przy kliknięciu poza
				setTimeout(() => {
					document.addEventListener('click', closeSearchHistoryOnClickOutside);
				}, 10);
			} else {
				document.removeEventListener('click', closeSearchHistoryOnClickOutside);
			}
		}

		function closeSearchHistoryOnClickOutside(e) {
			const dropdown = $('search-history-dropdown');
			const wrapper = e.target.closest('.search-history-wrapper');
			
			if (!wrapper && !dropdown.classList.contains('hidden')) {
				dropdown.classList.add('hidden');
				document.removeEventListener('click', closeSearchHistoryOnClickOutside);
			}
		}

		function saveSearchToHistory() {
			// Zapisz PEŁNĄ tablicę 8 pozycji (z pustymi stringami)
			const heroes = [];
			for (let i = 1; i <= 8; i++) {
				heroes.push($(`search-pos${i}`)?.value.trim() || '');
			}
			const pet = $('search-pet').value.trim();
			
			// Nie zapisuj pustych wyszukiwań
			const filledHeroes = heroes.filter(v => v);
			if (!filledHeroes.length && !pet) return;
			
			const entry = {
				heroes: heroes, // Pełna tablica z pozycjami
				pet: pet,
				timestamp: new Date().toISOString()
			};
			
			// Sprawdź czy takie samo wyszukiwanie już istnieje (porównuj tylko wypełnione)
			const existingIndex = searchHistory.findIndex(h => {
				const existingFilled = (h.heroes || []).filter(v => v).sort();
				return JSON.stringify(existingFilled) === JSON.stringify(filledHeroes.sort()) && h.pet === pet;
			});
			
			// Jeśli istnieje, usuń stare
			if (existingIndex > -1) {
				searchHistory.splice(existingIndex, 1);
			}
			
			// Dodaj na początek
			searchHistory.unshift(entry);
			
			// Ogranicz do 10 wpisów
			if (searchHistory.length > 10) {
				searchHistory = searchHistory.slice(0, 10);
			}
			
			storage.setJson('souls_search_history', searchHistory);
		}

		function renderSearchHistory() {
			const list = $('search-history-list');
			
			if (!searchHistory.length) {
				list.innerHTML = `<div class="search-history-empty">${t('search.historyEmpty')}</div>`;
				return;
			}
			
			list.innerHTML = searchHistory.map((entry, idx) => {
				// Wyświetl tylko wypełnionych bohaterów (dla czytelności)
				const filledHeroes = (entry.heroes || []).filter(v => v);
				const heroesText = filledHeroes.length ? filledHeroes.join(', ') : '—';
				const petText = entry.pet ? `🐾 ${entry.pet}` : '';
				const timeAgo = getTimeAgo(new Date(entry.timestamp));
				
				return `
					<div class="search-history-item" onclick="loadSearchFromHistory(${idx})">
						<button class="search-history-item-remove" onclick="event.stopPropagation(); removeSearchHistoryItem(${idx})" title="${t('common.delete')}">✕</button>
						<div class="search-history-item-heroes">👹 ${heroesText}</div>
						${petText ? `<div class="search-history-item-pet">${petText}</div>` : ''}
						<div class="search-history-item-time">🕐 ${timeAgo}</div>
					</div>
				`;
			}).join('');
		}

		function loadSearchFromHistory(idx) {
			const entry = searchHistory[idx];
			if (!entry) return;
			
			// Wyczyść wszystkie pola
			for (let i = 1; i <= 8; i++) {
				$(`search-pos${i}`).value = '';
			}
			$('search-pet').value = '';
			
			// Wypełnij bohaterami na WŁAŚCIWYCH pozycjach
			const heroes = entry.heroes || [];
			for (let i = 0; i < 8; i++) {
				if (heroes[i]) {
					$(`search-pos${i + 1}`).value = heroes[i];
				}
			}
			
			// Wypełnij peta
			if (entry.pet) {
				$('search-pet').value = entry.pet;
			}
			
			// Zamknij dropdown
			$('search-history-dropdown').classList.add('hidden');
			document.removeEventListener('click', closeSearchHistoryOnClickOutside);
			
			// Aktualizuj UI
			updateSearchTagsSelection();
			updateSearchCounter();
			
			// Uruchom wyszukiwanie
			searchFormations();
		}

		function removeSearchHistoryItem(idx) {
			searchHistory.splice(idx, 1);
			storage.setJson('souls_search_history', searchHistory);
			renderSearchHistory();
			showToast(t('common.formationDeleted'));
		}

		function clearSearchHistory() {
			if (!confirm(t('search.historyConfirmClear'))) return;
			
			searchHistory = [];
			storage.setJson('souls_search_history', searchHistory);
			renderSearchHistory();
			showToast(t('common.historyCleared'));
		}


        // ═══════════════════════════════════════════════════════════
        // TAB: DATABASE — filtry, sortowanie, ulubione, porównywanie, quick select
        // ═══════════════════════════════════════════════════════════

        // =====================================================
        // BAZA DANYCH
        // =====================================================
        function setDbFilter(filter) {
            currentDbFilter = filter;
            document.querySelectorAll('.filter-btn[data-filter]').forEach(b => b.classList.toggle('active', b.dataset.filter === filter));
            // Przełączenie między widokiem formacji a widokiem pakietów
            const isPackages = filter === 'packages';
            const sortBar = $('db-sort-bar');
            const dbList = $('database-list');
            const pkgBar = $('packages-config-bar');
            const pkgList = $('packages-list');
            if (sortBar) sortBar.style.display = isPackages ? 'none' : '';
            if (dbList) dbList.style.display = isPackages ? 'none' : '';
            if (pkgBar) pkgBar.style.display = isPackages ? 'flex' : 'none';
            if (pkgList) pkgList.style.display = isPackages ? 'block' : 'none';
            if (isPackages) renderPackagesView();
            else filterDatabase();
        }

        // ─── Pakiety bohaterów (frequent itemsets) ──────────────

        let packageOptions = { minSize: 3, mode: 'exact', source: 'enemy', window: 'all', minSupport: 5 };

        function setPackageOption(key, value) {
            packageOptions[key] = value;
            // Update active state na wszystkich grupach przycisków pakietowych
            document.querySelectorAll('.pkg-btn[data-pkg-size]').forEach(b => b.classList.toggle('active', String(b.dataset.pkgSize) === String(packageOptions.minSize)));
            document.querySelectorAll('.pkg-btn[data-pkg-mode]').forEach(b => b.classList.toggle('active', b.dataset.pkgMode === packageOptions.mode));
            document.querySelectorAll('.pkg-btn[data-pkg-source]').forEach(b => b.classList.toggle('active', b.dataset.pkgSource === packageOptions.source));
            document.querySelectorAll('.pkg-btn[data-pkg-window]').forEach(b => b.classList.toggle('active', String(b.dataset.pkgWindow) === String(packageOptions.window)));
            renderPackagesView();
        }

        // Enumeracja podzbiorów tablicy o danym rozmiarze (kombinacje, bez powtórzeń, bez kolejności)
        function enumerateSubsets(arr, k, callback) {
            const n = arr.length;
            if (k > n || k < 1) return;
            const idx = new Array(k);
            (function recurse(start, depth) {
                if (depth === k) {
                    callback(idx.map(i => arr[i]));
                    return;
                }
                for (let i = start; i < n; i++) {
                    idx[depth] = i;
                    recurse(i + 1, depth + 1);
                }
            })(0, 0);
        }

        // Główny algorytm: zbiera zbiory bohaterów spełniające kryteria.
        // Zwraca [{ heroes: ['Death','Bahzam','Lilith'], count: 38, size: 3 }, ...] posortowane malejąco po count.
        function findHeroPackages() {
            const { minSize, mode, source, window, minSupport } = packageOptions;
            // 1. Filtruj formacje po oknie czasowym
            let formations = allFormations;
            if (window !== 'all') {
                const cutoff = Date.now() - Number(window) * MS_PER_DAY;
                formations = formations.filter(f => f.dateAdded && new Date(f.dateAdded).getTime() >= cutoff);
            }

            // 2. Wyciągnij sety bohaterów per formacja (znormalizowane + posortowane dla determinizmu)
            const heroSets = formations.map(f => {
                const set = new Set();
                if (source === 'enemy' || source === 'both') {
                    (f.enemy || []).forEach(h => { if (h) set.add(h); });
                }
                if (source === 'my' || source === 'both') {
                    (f.my || []).forEach(h => { if (h) set.add(h); });
                }
                return [...set].sort((a, b) => a.localeCompare(b));
            }).filter(s => s.length >= minSize);

            // 3. Licz wystąpienia podzbiorów
            const counts = new Map(); // key = 'A|B|C', value = count
            for (const hs of heroSets) {
                if (mode === 'exact') {
                    if (hs.length >= minSize) {
                        enumerateSubsets(hs, minSize, subset => {
                            const key = subset.join('|');
                            counts.set(key, (counts.get(key) || 0) + 1);
                        });
                    }
                } else {
                    // at-least: enumerate all sizes from minSize to hs.length
                    for (let k = minSize; k <= hs.length; k++) {
                        enumerateSubsets(hs, k, subset => {
                            const key = subset.join('|');
                            counts.set(key, (counts.get(key) || 0) + 1);
                        });
                    }
                }
            }

            // 4. Przefiltruj po minSupport
            let packages = [];
            for (const [key, count] of counts.entries()) {
                if (count >= minSupport) {
                    const heroes = key.split('|');
                    packages.push({ heroes, count, size: heroes.length });
                }
            }

            // 5. Dla "at-least" wytnij niemaksymalne (zbiory zdominowane przez większy z tym samym/lepszym count)
            if (mode === 'atleast') {
                // posortuj po size DESC, count DESC dla optymalizacji
                packages.sort((a, b) => b.size - a.size || b.count - a.count);
                const accepted = [];
                for (const p of packages) {
                    const heroSet = new Set(p.heroes);
                    let dominated = false;
                    for (const acc of accepted) {
                        if (acc.size > p.size && acc.count >= p.count) {
                            // czy acc zawiera wszystkie p.heroes?
                            if (p.heroes.every(h => acc.heroes.includes(h))) { dominated = true; break; }
                        }
                    }
                    if (!dominated) accepted.push(p);
                }
                packages = accepted;
            }

            // 6. Sort finalny: malejąco po count, potem malejąco po size, potem alfabetycznie
            packages.sort((a, b) => b.count - a.count || b.size - a.size || a.heroes[0].localeCompare(b.heroes[0]));

            return { packages, totalFormations: heroSets.length };
        }

        // Wyznacz emoji dominującej rasy w pakiecie. Parametr nazwany `names`, żeby nie zacieniał globalnej `heroes`.
        function packageDominantEmoji(names) {
            const counts = {};
            names.forEach(name => {
                const hero = heroes.find(x => x.name.toLowerCase() === name.toLowerCase());
                if (hero?.race) counts[hero.race] = (counts[hero.race] || 0) + 1;
            });
            let topRace = null, topCount = 0;
            Object.entries(counts).forEach(([race, c]) => { if (c > topCount) { topRace = race; topCount = c; } });
            return topRace ? (RACE_EMOJI[topRace] || '🧩') : '🧩';
        }

        function renderPackagesView() {
            const listEl = $('packages-list');
            const statsEl = $('packages-stats');
            if (!listEl) return;
            const { packages, totalFormations } = findHeroPackages();

            if (statsEl) statsEl.textContent = t('packages.stats').replace('{n}', packages.length).replace('{total}', totalFormations);

            if (packages.length === 0) {
                listEl.innerHTML = `<div class="empty-state"><p>${t('packages.empty')}</p></div>`;
                return;
            }

            // Limit do 100 najczęstszych — przy większych ilościach scroll się nie skończy
            const shown = packages.slice(0, 100);
            const moreInfo = packages.length > 100 ? `<div style="text-align: center; color: var(--text-muted); font-size: 0.75rem; padding: 10px;">... (${packages.length - 100} kolejnych pakietów)</div>` : '';

            listEl.innerHTML = shown.map(p => {
                const emoji = packageDominantEmoji(p.heroes);
                const tagsHtml = p.heroes.map(h => {
                    const hero = heroes.find(x => x.name.toLowerCase() === h.toLowerCase());
                    const rc = hero ? `tag-${hero.race.toLowerCase()}` : '';
                    return `<span class="quick-tag ${rc}" style="cursor: default;">${escapeHtml(h)}</span>`;
                }).join('');
                return `
                    <div class="package-card">
                        <div class="package-card-header">
                            <span class="package-card-emoji">${emoji}</span>
                            <span class="package-card-size">${p.size}</span>
                            <span class="package-card-count"><strong>${p.count}</strong>${t('packages.occurrences')}</span>
                        </div>
                        <div class="package-card-heroes">${tagsHtml}</div>
                    </div>`;
            }).join('') + moreInfo;
        }

		function setDbSort(sort) {
			currentDbSort = sort;
			document.querySelectorAll('.sort-btn[data-sort]').forEach(b => b.classList.toggle('active', b.dataset.sort === sort));
			filterDatabase();
		}

		function sortFormations(formations) {
			const sorted = [...formations];
			
			switch (currentDbSort) {
				case 'id-asc':
					sorted.sort((a, b) => a.id - b.id);
					break;
				case 'id-desc':
					sorted.sort((a, b) => b.id - a.id);
					break;
				case 'name-asc':
					sorted.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pl'));
					break;
				case 'name-desc':
					sorted.sort((a, b) => (b.name || '').localeCompare(a.name || '', 'pl'));
					break;
				case 'date-desc':
					sorted.sort((a, b) => {
						const dateA = a.dateAdded ? new Date(a.dateAdded) : new Date(0);
						const dateB = b.dateAdded ? new Date(b.dateAdded) : new Date(0);
						return dateB - dateA;
					});
					break;
				case 'date-asc':
					sorted.sort((a, b) => {
						const dateA = a.dateAdded ? new Date(a.dateAdded) : new Date(0);
						const dateB = b.dateAdded ? new Date(b.dateAdded) : new Date(0);
						return dateA - dateB;
					});
					break;
			}
			
			return sorted;
		}

		function filterDatabase() {
			const searchTerm = normalize($('db-search')?.value || '');
			let formations = allFormations;
			
			if (currentDbFilter === 'base') formations = formations.filter(f => f.isBase);
			else if (currentDbFilter === 'user') formations = formations.filter(f => !f.isBase);
			else if (currentDbFilter === 'favorites') formations = formations.filter(f => favorites.includes(f.id));
			
			// Szukaj po nazwie, bohaterach (my+enemy+pety) i komentarzu
			if (searchTerm) formations = formations.filter(f => {
				if (normalize(f.name).includes(searchTerm)) return true;
				if (f.comment && normalize(f.comment).includes(searchTerm)) return true;
				return [...(f.my || []), ...(f.enemy || []), f.myPet, f.enemyPet]
					.some(h => h && normalize(h).includes(searchTerm));
			});

			// Filtruj według wykluczonych bohaterów
			let hiddenCount = 0;
			if (hideExcludedResults && excludedHeroes.length > 0) {
				const beforeCount = formations.length;
				formations = formations.filter(f => !isFormationExcluded(f).excluded);
				hiddenCount = beforeCount - formations.length;
			}
			
			// Sortowanie
			formations = sortFormations(formations);
			
			// Pokaż info o ukrytych
			let headerInfo = '';
			if (hiddenCount > 0) {
				headerInfo = `<div style="text-align:center;font-size:0.75rem;color:#f44336;margin-bottom:10px;">🚫 ${hiddenCount} ${t('excluded.hiddenCountLabel')}</div>`;
			}
			
			$('database-list').innerHTML = headerInfo + (formations.length ? formations.map(f => {
				const exclusionCheck = isFormationExcluded(f);
				const hasExcluded = !hideExcludedResults && exclusionCheck.excluded;
				
				return `
				<div class="db-item ${hasExcluded ? 'has-excluded' : ''}" onclick="showFormation(${f.id})">
					<div class="db-item-info">
						<div class="db-item-header"><span class="db-item-id">#${f.id}</span><span class="badge ${f.isBase ? 'base-badge' : 'user-badge'}">${t(f.isBase ? 'badge.base' : 'badge.user')}</span>${isNewFormation(f) ? `<span class="badge new-badge">${t('badge.new')}</span>` : ''}</div>
						<div class="db-item-name">${escapeHtml(f.name)}</div>
						<div class="db-item-details"><div>⚔️ ${f.my.filter(h => h).join(', ') || '—'} + ${f.myPet || '—'}</div><div>👹 ${f.enemy.filter(h => h).join(', ') || '—'} + ${f.enemyPet || '—'}</div></div>
						${f.comment ? `<div class="result-comment clamped" onclick="event.stopPropagation(); this.classList.toggle('clamped')" title="${t('search.toggleComment')}"><span class="comment-icon">💬</span>${escapeHtml(f.comment)}</div>` : ''}
						${hasExcluded ? `<div style="font-size:0.65rem;color:#f44336;margin-top:3px;">🚫 ${exclusionCheck.heroes.join(', ')}</div>` : ''}
					</div>
					<div class="db-item-date">${formatDate(f.dateAdded) ? `📅 ${formatDate(f.dateAdded)}` : ''}</div>
					<div class="db-item-actions">
						<button class="btn btn-small ${isFavorite(f.id) ? 'btn-favorite-active' : ''}" onclick="toggleFavorite(${f.id}, event)">${isFavorite(f.id) ? '⭐' : '☆'}</button>
						<button class="btn btn-small" onclick="event.stopPropagation(); showFormation(${f.id})">👁️</button>
						${isAdmin ? `<button class="btn btn-small btn-admin" onclick="event.stopPropagation(); openEditModal(${f.id})">✏️</button>` : ''}
						${isAdmin ? `<button class="btn btn-small btn-danger" onclick="event.stopPropagation(); deleteFormation(${f.id})">🗑️</button>` : ''}
					</div>
				</div>`
			}).join('') : `<div class="empty-state"><p>${t('database.noFormations')}</p></div>`);
		}

        // =====================================================
        // ULUBIONE
        // =====================================================
        
        const isFavorite = id => favorites.includes(id);

        function toggleFavorite(id, event) {
            event?.stopPropagation();
            const idx = favorites.indexOf(id);
            if (idx > -1) favorites.splice(idx, 1);
            else favorites.push(id);
            storage.setJson('souls_favorites', favorites);
            showToast(t(idx > -1 ? 'common.removedFromFavorites' : 'common.addedToFavorites'));
            filterDatabase();
        }

        function toggleFavoritePreview(id) {
            toggleFavorite(id);
            showFormation(id);
        }

		function toggleCompareSelection(id) {
			const checkbox = $(`compare-${id}`);
			const card = $(`result-card-${id}`);
			
			if (checkbox.checked) {
				if (selectedForCompare.length >= 3) {
					checkbox.checked = false;
					showToast(t('war.max3'), true);
					return;
				}
				selectedForCompare.push(id);
				card?.classList.add('selected-for-compare');
			} else {
				selectedForCompare = selectedForCompare.filter(x => x !== id);
				card?.classList.remove('selected-for-compare');
			}
			
			updateCompareButton();
		}

		function updateCompareButton() {
			const btn = $('compare-btn');
			const countBadge = $('compare-count');
			
			if (btn) {
				btn.style.display = selectedForCompare.length >= 2 ? 'block' : 'none';
			}
			if (countBadge) {
				countBadge.textContent = selectedForCompare.length;
			}
		}

		function openCompareModal() {
			if (selectedForCompare.length < 2) {
				showToast(t('war.min2'), true);
				return;
			}
			
			const formations = selectedForCompare.map(id => allFormations.find(f => f.id === id)).filter(Boolean);
			if (formations.length < 2) return;
			
			renderCompareModal(formations);
			$('compare-modal').classList.remove('hidden');
		}

		function closeCompareModal() {
			$('compare-modal').classList.add('hidden');
		}

		function renderCompareModal(formations) {
			const colsClass = formations.length === 2 ? 'cols-2' : 'cols-3';
			
			// Zbierz wszystkich bohaterów z każdego składu
			const allHeroesPerFormation = formations.map(f => ({
				enemy: f.enemy.map(h => normalize(h || '')),
				my: f.my.map(h => normalize(h || '')),
				enemyFlat: f.enemy.filter(h => h).map(normalize),
				myFlat: f.my.filter(h => h).map(normalize),
				enemyPet: normalize(f.enemyPet || ''),
				myPet: normalize(f.myPet || '')
			}));
			
			let html = `
				<div class="compare-legend">
					<div class="compare-legend-item">
						<span class="compare-legend-dot match"></span>
						<span>${t('compare.match')}</span>
					</div>
					<div class="compare-legend-item">
						<span class="compare-legend-dot moved"></span>
						<span>${t('compare.moved')}</span>
					</div>
					<div class="compare-legend-item">
						<span class="compare-legend-dot unique"></span>
						<span>${t('compare.unique')}</span>
					</div>
				</div>
				<div class="compare-grid ${colsClass}">
			`;
			
			formations.forEach((f, fIdx) => {
				html += `
					<div class="compare-card">
						<div class="compare-card-header">
							<span class="compare-card-id">#${f.id} ${f.isBase ? '👑' : ''}</span>
							<span class="compare-card-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
						</div>
						<div class="compare-card-body">
							<div class="battle-section enemy">
								<div class="battle-title enemy-title"><span class="title-icon">👹</span>${t('preview.enemy')}</div>
								<div style="text-align:center">${renderComparePet(f.enemyPet, 'enemy', fIdx, allHeroesPerFormation)}</div>
								${renderCompareBattleGrid(f.enemy, true, 'enemy', fIdx, allHeroesPerFormation)}
							</div>
							
							<div class="vs-separator"><span class="vs-badge">VS</span></div>
							
							<div class="battle-section player">
								${renderCompareBattleGrid(f.my, false, 'my', fIdx, allHeroesPerFormation)}
								<div style="text-align:center">${renderComparePet(f.myPet, 'my', fIdx, allHeroesPerFormation)}</div>
								<div class="battle-title player-title"><span class="title-icon">⚔️</span>${t('preview.yourTeam')}</div>
							</div>
							
							${f.comment ? `<div class="compare-comment">💬 ${escapeHtml(f.comment)}</div>` : ''}
						</div>
					</div>
				`;
			});
			
			html += `</div>`;
			
			$('compare-content').innerHTML = html;
		}

		function renderCompareBattleGrid(arr, isEnemy, type, formationIdx, allData) {
			const slot = (pos) => {
				const name = arr[pos] || '';
				
				if (!name) {
					return `<div class="battle-slot empty"></div>`;
				}
				
				const normalizedName = normalize(name);
				const diffClass = getHeroDiffClass(normalizedName, pos, type, formationIdx, allData);
				
				const hero = findHero(name);
				const rc = hero ? `race-${hero.race.toLowerCase()}` : '';

				return `<div class="battle-slot filled ${rc} ${diffClass} slot-clickable" onclick="event.stopPropagation();showHeroSkills('${jsStr(name)}')"><span class="hero-name">${name}</span></div>`;
			};
			
			if (isEnemy) {
				return `<div class="battle-grid">
					<div class="battle-row">${slot(5)}${slot(6)}${slot(7)}</div>
					<div class="battle-row">${slot(3)}${slot(4)}</div>
					<div class="battle-row">${slot(0)}${slot(1)}${slot(2)}</div>
				</div>`;
			} else {
				return `<div class="battle-grid">
					<div class="battle-row">${slot(0)}${slot(1)}${slot(2)}</div>
					<div class="battle-row">${slot(3)}${slot(4)}</div>
					<div class="battle-row">${slot(5)}${slot(6)}${slot(7)}</div>
				</div>`;
			}
		}

		function getHeroDiffClass(heroName, position, type, formationIdx, allData) {
			if (!heroName) return '';
			
			// Sprawdź inne formacje
			let samePositionInAll = true;
			let existsElsewhere = false;
			
			for (let i = 0; i < allData.length; i++) {
				if (i === formationIdx) continue;
				
				const otherPositions = allData[i][type]; // tablica pozycji
				const otherFlat = allData[i][type + 'Flat']; // płaska lista bohaterów
				
				// Czy ten bohater jest na tej samej pozycji w innym składzie?
				if (otherPositions[position] !== heroName) {
					samePositionInAll = false;
				}
				
				// Czy ten bohater jest GDZIEKOLWIEK w innym składzie?
				if (otherFlat.includes(heroName)) {
					existsElsewhere = true;
				}
			}
			
			// ZIELONY: ten sam bohater na tej samej pozycji we wszystkich składach
			if (samePositionInAll) {
				return 'compare-match';
			}
			
			// POMARAŃCZOWY: bohater istnieje w innym składzie ale na innej pozycji
			if (existsElsewhere) {
				return 'compare-moved';
			}
			
			// CZERWONY: bohater jest tylko w tym składzie
			return 'compare-unique';
		}

		function renderComparePet(petName, type, formationIdx, allData) {
			if (!petName) {
				return `<div class="battle-pet empty"><span class="pet-icon">🐾</span><span>${t('preview.noPet')}</span></div>`;
			}
			
			const normalizedPet = normalize(petName);
			const petKey = type + 'Pet';
			
			// Sprawdź czy pet jest taki sam we wszystkich
			let sameInAll = true;
			let existsElsewhere = false;
			
			for (let i = 0; i < allData.length; i++) {
				if (i === formationIdx) continue;
				
				const otherPet = allData[i][petKey];
				
				if (otherPet !== normalizedPet) {
					sameInAll = false;
				}
				
				if (otherPet === normalizedPet) {
					existsElsewhere = true;
				}
			}
			
			let diffClass = '';
			if (sameInAll) {
				diffClass = 'compare-match';
			} else if (existsElsewhere) {
				diffClass = 'compare-moved'; // Ten sam pet ale nie wszędzie
			} else {
				diffClass = 'compare-unique';
			}
			
			return `<div class="battle-pet filled ${diffClass} slot-clickable" onclick="event.stopPropagation();showPetSkills('${jsStr(petName)}')"><span class="pet-icon">🐾</span><span>${petName}</span></div>`;
		}

        function openQuickSelect(targetId, label) {
            quickSelectTarget = targetId;
            $('quick-select-target').innerHTML = `${t('quickSelect.selectFor')}: <strong>${label}</strong>`;
            
            const isPet = targetId.includes('Pet');
            const raceGroups = { Dark: [], Light: [], Human: [], Fire: [], Elf: [], Undead: [] };
            if (!isPet) heroes.forEach(h => raceGroups[h.race]?.push(h.name));
            RACE_ORDER.forEach(r => raceGroups[r].sort((a, b) => a.localeCompare(b)));
            
            $('quick-select-tags').innerHTML = isPet ? 
                `<div class="quick-tags-section"><div class="quick-tags-header expanded" onclick="toggleQuickTagSection(this)"><span class="toggle-icon">▶</span> 🐾 ${t('quickTags.pets')}</div><div class="quick-tags-content show"><div class="quick-tags">${pets.map(p => `<span class="quick-tag tag-pet" onclick="selectQuickItem('${getPetName(p)}')">${getPetName(p)}</span>`).join('')}</div></div></div>` :
                RACE_ORDER.filter(r => raceGroups[r].length).map(r => `<div class="quick-tags-section"><div class="quick-tags-header expanded" onclick="toggleQuickTagSection(this)"><span class="toggle-icon">▶</span>${RACE_EMOJI[r]} ${raceLabel(r)} (${raceGroups[r].length})</div><div class="quick-tags-content show"><div class="quick-tags">${raceGroups[r].map(n => `<span class="quick-tag tag-${r.toLowerCase()}" onclick="selectQuickItem('${n}')">${n}</span>`).join('')}</div></div></div>`).join('');
            
            $('quick-select-modal').classList.remove('hidden');
        }

        function selectQuickItem(value) {
            if (quickSelectTarget) $(quickSelectTarget).value = value;
            closeQuickSelect();
        }

        function closeQuickSelect() {
            $('quick-select-modal').classList.add('hidden');
            quickSelectTarget = null;
        }


        // ═══════════════════════════════════════════════════════════
        // TAB: VIEW — podgląd formacji, nawigacja, edycja, usuwanie
        // ═══════════════════════════════════════════════════════════

        function lookupById() {
            const id = parseInt($('lookup-id').value.trim());
            if (!id || id < 1) { showToast(t('preview.invalidId'), true); return; }
            showFormation(id);
        }

		function showFormation(id) {
			const f = allFormations.find(x => x.id === id);
			currentFormation = f;
			if (!f) {
				$('formation-display').innerHTML = `<div class="empty-state"><p>${t('preview.notFound')} #${id}</p></div>`;
				return;
			}
			
			switchTab('view');
			
			// Aktualizuj pole input
			const lookupInput = $('lookup-id');
			if (lookupInput) lookupInput.value = id;
			
			// Dodaj do ostatnio przeglądanych
			addToRecentlyViewed(id, f.name);
			
			// NAWIGACJA: ZAWSZE cała baza posortowana po ID
			navFormationIds = allFormations.map(x => x.id).sort((a, b) => a - b);
			navCurrentIndex = navFormationIds.indexOf(id);
			
			// Aktualizuj przyciski nawigacji
			updateFormationNav(id);
			
			const isFav = isFavorite(id);
			
			// Znajdź podobne formacje (ten sam przeciwnik, inna kontra)
			const similarHtml = buildSimilarFormations(f);
			
			$('formation-display').innerHTML = `
				<div class="formation-preview" id="formation-preview-export">
					<div class="preview-header">
						<div class="preview-title"><span class="preview-id">#${f.id}</span>${escapeHtml(f.name)}<span class="formation-type-badge ${f.isBase ? 'base' : 'user'}">${t(f.isBase ? 'badge.base' : 'badge.user')}</span></div>
						<div class="preview-actions">
							<button class="btn btn-small btn-secondary" onclick="exportSingleFormationAsText()">📋 Kopiuj skład tekstowo</button>
							<button class="btn btn-small btn-secondary" onclick="copyFormationLink(${id})" title="Kopiuj link">🔗</button>
							${isAdmin ? `<button class="btn btn-small btn-admin" onclick="openEditModal(${id})">✏️</button>` : ''}
							<button class="btn btn-small ${isFav ? 'btn-favorite-active' : 'btn-secondary'}" onclick="toggleFavoritePreview(${id})">${isFav ? '⭐' : '☆'}</button>
						</div>
					</div>
					<div class="preview-meta">
						${formatDate(f.dateAdded) ? `<span class="preview-meta-item">📅 ${t('preview.added')}: ${formatDate(f.dateAdded)}</span>` : ''}
						${formatDate(f.lastEdited) ? `<span class="preview-meta-item">✏️ ${t('preview.edited')}: ${formatDate(f.lastEdited)}</span>` : ''}
					</div>
					<div class="battle-section enemy">
						<div class="battle-title enemy-title"><span class="title-icon">👹</span>${t('preview.enemy')}</div>
						<div style="text-align:center">${renderBattlePet(f.enemyPet)}</div>
						${renderBattleGrid(f.enemy, true)}
						<div class="battle-arrows animated"><div class="battle-arrow down"></div></div>
					</div>
					<div class="vs-separator"><span class="vs-badge">VS</span></div>
					<div class="battle-section player">
						<div class="battle-arrows animated"><div class="battle-arrow up"></div></div>
						${renderBattleGrid(f.my, false)}
						<div style="text-align:center">${renderBattlePet(f.myPet)}</div>
						<div class="battle-title player-title"><span class="title-icon">⚔️</span>${t('preview.yourTeam')}</div>
					</div>
					${f.comment ? `<div class="preview-comment"><span class="comment-icon">💬</span>${escapeHtml(f.comment)}</div>` : ''}
				</div>
				${similarHtml}`;
		}

        function addToRecentlyViewed(id, name) {
            // Usuń jeśli już jest (przeniesie na początek)
            recentlyViewed = recentlyViewed.filter(item => item.id !== id);
            
            // Dodaj na początek
            recentlyViewed.unshift({ id, name, timestamp: Date.now() });
            
            // Ogranicz do max
            if (recentlyViewed.length > MAX_RECENTLY_VIEWED) {
                recentlyViewed = recentlyViewed.slice(0, MAX_RECENTLY_VIEWED);
            }
            
            // Zapisz
            storage.setJson('souls_recently_viewed', recentlyViewed);
            
            // Odśwież widok
            renderRecentlyViewed();
        }

		function renderRecentlyViewed() {
			const container = $('recently-viewed-list');
			const countEl = $('rv-count');
			if (!container) return;
			
			// Aktualizuj licznik
			if (countEl) countEl.textContent = `(${recentlyViewed.length})`;
			
			if (recentlyViewed.length === 0) {
				container.innerHTML = `<div style="color: var(--text-muted); padding: 10px; text-align: center; width: 100%;">${t('preview.noRecent')}</div>`;
				return;
			}
			
			container.innerHTML = recentlyViewed.map(item => `
				<div class="recently-viewed-item" onclick="showFormation(${item.id})" title="${item.name}">
					<span class="rv-id">#${item.id}</span>${item.name.substring(0, 15)}${item.name.length > 15 ? '..' : ''}
				</div>
			`).join('');
			
			// Przywróć stan rozwinięcia
			const wasExpanded = storage.getBool('souls_rv_expanded');
			if (wasExpanded) {
				container.classList.add('show');
				$('rv-toggle-icon')?.classList.add('expanded');
			}
		}

        function clearRecentlyViewed() {
            if (!confirm(t('preview.confirmClearViewed'))) return;
            recentlyViewed = [];
            storage.setJson('souls_recently_viewed', recentlyViewed);
            renderRecentlyViewed();
            showToast(t('preview.viewedCleared'));
        }

		function toggleRecentlyViewed() {
			const list = $('recently-viewed-list');
			const icon = $('rv-toggle-icon');
			
			list.classList.toggle('show');
			icon.classList.toggle('expanded');
			
			// Zapisz stan
			storage.setBool('souls_rv_expanded', list.classList.contains('show'));
		}

        // PODOBNE FORMACJE
		function buildSimilarFormations(formation) {
			const similar = findSimilarFormations(formation);
			
			const headerText = t('preview.otherCounters');
			const emptyText = t('preview.noOtherCounters');
			
			return `
				<div class="similar-formations-section">
					<div class="similar-formations-header">
						<span>🔄</span>
						<span>${headerText}</span>
						<span style="font-size: 0.75rem; color: var(--text-muted);">(${similar.length})</span>
					</div>
					<div class="similar-formations-list">
						${similar.length === 0 
							? `<div style="text-align: center; color: var(--text-muted); padding: 15px; font-size: 0.85rem;">${emptyText}</div>`
							: similar.map(f => `
								<div class="similar-formation-item" onclick="showFormation(${f.id})">
									<div class="similar-formation-info">
										<div class="similar-formation-name">${escapeHtml(f.name)}</div>
										<div class="similar-formation-heroes">⚔️ ${f.my.filter(h => h).join(', ') || '—'} + ${f.myPet || '—'}</div>
									</div>
									<span class="similar-formation-id">#${f.id}</span>
								</div>
							`).join('')}
					</div>
				</div>
			`;
		}

        function findSimilarFormations(formation) {
            const enemyKey = getEnemyKey(formation);
            
            return allFormations.filter(f => {
                // Nie pokazuj tej samej formacji
                if (f.id === formation.id) return false;

                // Sprawdź czy przeciwnik jest identyczny
                const otherEnemyKey = getEnemyKey(f);
                return enemyKey === otherEnemyKey;
            }).sort((a, b) => b.id - a.id); // najnowsze (najwyższe ID) na górze
        }

        function getEnemyKey(formation) {
            // Tworzymy unikalny klucz dla przeciwnika (sortowane dla spójności)
            const enemyHeroes = formation.enemy.filter(h => h).map(h => normalize(h)).sort();
            const enemyPet = normalize(formation.enemyPet);
            return enemyHeroes.join('|') + '||' + enemyPet;
        }

		function updateFormationNav(currentId) {
			const total = navFormationIds.length;
			const idx = navFormationIds.indexOf(currentId);
			
			const prevBtn = $('nav-prev-btn');
			const nextBtn = $('nav-next-btn');
			const counter = $('nav-counter');
			
			if (prevBtn) {
				prevBtn.disabled = idx <= 0;
			}
			if (nextBtn) {
				nextBtn.disabled = idx >= total - 1;
			}
			if (counter) {
				if (total > 0 && idx >= 0) {
					counter.innerHTML = `<strong>${idx + 1}</strong> / ${total}`;
				} else {
					counter.innerHTML = '';
				}
			}
		}

        function navigateFormation(direction) {
            if (navFormationIds.length === 0 || navCurrentIndex === -1) return;
            
            const newIndex = navCurrentIndex + direction;
            if (newIndex < 0 || newIndex >= navFormationIds.length) return;
            
            const newId = navFormationIds[newIndex];
            showFormation(newId);
        }

        // Przechowuj aktualne wyniki wojny
        let currentWarResults = null;

        function renderBattleGrid(arr, isEnemy) {
            const slot = i => {
                const name = arr[i] || '';
                if (!name) return `<div class="battle-slot empty"></div>`;
                const hero = findHero(name);
                const rc = hero ? `race-${hero.race.toLowerCase()}` : '';
                return `<div class="battle-slot filled ${rc} slot-clickable" onclick="event.stopPropagation();showHeroSkills('${jsStr(name)}')"><span class="hero-name">${name}</span></div>`;
            };
            
            return isEnemy ? `<div class="battle-grid"><div class="battle-row">${slot(5)}${slot(6)}${slot(7)}</div><div class="battle-row">${slot(3)}${slot(4)}</div><div class="battle-row">${slot(0)}${slot(1)}${slot(2)}</div></div>` :
                `<div class="battle-grid"><div class="battle-row">${slot(0)}${slot(1)}${slot(2)}</div><div class="battle-row">${slot(3)}${slot(4)}</div><div class="battle-row">${slot(5)}${slot(6)}${slot(7)}</div></div>`;
        }

        function renderBattlePet(name) {
            return name ? `<div class="battle-pet filled slot-clickable" onclick="event.stopPropagation();showPetSkills('${jsStr(name)}')"><span class="pet-icon">🐾</span><span>${name}</span></div>` :
                `<div class="battle-pet empty"><span class="pet-icon">🐾</span><span>${t('preview.noPet')}</span></div>`;
        }

		function copyFormationLink(id) {
			const url = `${window.location.origin}${window.location.pathname}?formation=${id}`;
			navigator.clipboard.writeText(url).then(() => {
				showToast(t('clipboard.linkCopied'));
			}).catch(() => {
				// Fallback dla starszych przeglądarek
				const input = document.createElement('input');
				input.value = url;
				document.body.appendChild(input);
				input.select();
				document.execCommand('copy');
				document.body.removeChild(input);
				showToast(t('clipboard.linkCopied'));
			});
		}

		function exportSingleFormationAsText() {
			const f = currentFormation;
			if (!f) {
				showToast('Najpierw wybierz formację', true);
				return;
			}
			
			const myHeroes = f.my || [];
			const myPet = f.myPet || '';
			
			let text = `Skład #${f.id}\n`;
			text += formatFormationAsText(myHeroes, myPet);
			
			navigator.clipboard.writeText(text.trim()).then(() => {
				showToast('📋 Skład skopiowany!');
			}).catch(() => {
				const textarea = document.createElement('textarea');
				textarea.value = text.trim();
				document.body.appendChild(textarea);
				textarea.select();
				document.execCommand('copy');
				document.body.removeChild(textarea);
				showToast('📋 Skład skopiowany!');
			});
		}

		// =====================================================
		// EDYCJA FORMACJI
		// =====================================================
		function openEditModal(id) {
			if (!isAdmin) { showToast(t('common.adminRequired') || 'Tylko admin może edytować!', true); return; }
			
			const f = allFormations.find(x => x.id === id);
			if (!f) { showToast(t('preview.notFound'), true); return; }
			
			editingFormationId = id;
			
			// Wypełnij formularz danymi
			$('edit-id').textContent = id;
			$('edit-name').value = f.name || '';
			$('edit-comment').value = f.comment || '';
			
			// Checkbox isBase
			const isBaseCheckbox = $('edit-isBase');
			if (isBaseCheckbox) isBaseCheckbox.checked = f.isBase || false;
			
			// Twój skład
			for (let i = 1; i <= 8; i++) {
				const el = $(`edit-my${i}`);
				if (el) el.value = f.my[i - 1] || '';
			}
			$('edit-myPet').value = f.myPet || '';
			
			// Skład przeciwnika
			for (let i = 1; i <= 8; i++) {
				const el = $(`edit-enemy${i}`);
				if (el) el.value = f.enemy[i - 1] || '';
			}
			$('edit-enemyPet').value = f.enemyPet || '';
			
			$('edit-modal').classList.remove('hidden');
		}

		function closeEditModal() {
			$('edit-modal').classList.add('hidden');
			editingFormationId = null;
		}

		async function saveEditFormation() {
			if (!isAdmin || !editingFormationId) return;
			if (!isOnline) { showToast(t('common.noConnection'), true); return; }
			
			let name = $('edit-name').value.trim();
			
			// Jeśli brak nazwy, wygeneruj automatycznie
			if (!name) {
				const now = new Date();
				const dateStr = now.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
				const timeStr = now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
				name = `${dateStr} ${timeStr}`;
			}
			
			// Pobierz dane z formularza
			const my = [];
			for (let i = 1; i <= 8; i++) {
				my.push($(`edit-my${i}`)?.value.trim() || '');
			}
			
			const enemy = [];
			for (let i = 1; i <= 8; i++) {
				enemy.push($(`edit-enemy${i}`)?.value.trim() || '');
			}
			
			const myPet = $('edit-myPet').value.trim();
			const enemyPet = $('edit-enemyPet').value.trim();
			const comment = $('edit-comment').value.trim();
			
			// Checkbox isBase
			const isBase = $('edit-isBase')?.checked || false;
			
			try {
				await formationsRef.child(String(editingFormationId)).update({
					name,
					my,
					myPet,
					enemy,
					enemyPet,
					comment,
					isBase,
					lastEdited: new Date().toISOString()
				});
				
				showToast(`✅ Zaktualizowano formację #${editingFormationId}${isBase ? ' (BAZA)' : ''}`);
				closeEditModal();
				
				// Odśwież podgląd jeśli jest otwarty
				if (Number($('lookup-id').value) === editingFormationId) {
					showFormation(editingFormationId);
				}
				// Odśwież listę w bazie danych
				filterDatabase();
			} catch (e) {
				showToast(`${t('common.error')}: ${e.message}`, true);
			}
		}

        // =====================================================
        // USUWANIE
        // =====================================================
		async function deleteFormation(id) {
			const f = allFormations.find(x => x.id === id);
			if (!f) return;
			if (!isAdmin) { showToast(t('common.adminRequired') || 'Tylko admin może usuwać formacje!', true); return; }
			if (!confirm(`${t('common.confirmDelete')} #${id}: "${f.name}"?`)) return;
            
            try {
                await formationsRef.child(String(id)).remove();
                showToast(t('common.formationDeleted'));
            } catch (e) { showToast(`${t('common.error')}: ${e.message}`, true); }
        }


        // ═══════════════════════════════════════════════════════════
        // TAB: ADD — formularz, duplikaty, layout preferencje
        // ═══════════════════════════════════════════════════════════

        // Załaduj preferencję przy starcie
        function loadSectionOrderPreference() {
            const reversed = storage.getBool('souls_addFormSectionsReversed');
            const container = $('add-form-sections');
            if (container && reversed) {
                container.classList.add('reversed');
            }
        }

        // Zamień kolejność sekcji
        function swapAddFormSections() {
            const container = $('add-form-sections');
            if (!container) return;
            
            container.classList.toggle('reversed');
            
            // Zapisz preferencję
            const isReversed = container.classList.contains('reversed');
            storage.setBool('souls_addFormSectionsReversed', isReversed);
            
            // Pokaż informację
            const msg = isReversed 
                ? t('ordering.yourTeamFirst')
                : t('ordering.enemyFirst');
            showToast(msg);
        }

		// Odwrócenie kolejności rzędów w sekcji przeciwnika
		function loadEnemyRowsPreference() {
			// Domyślnie true (6-7-8 na górze), chyba że użytkownik wybrał inaczej
			const reversed = storage.getBool('souls_enemyRowsReversed', true);
			const container = $('enemy-rows-container');
			const btn = $('btn-flip-enemy-rows');
			if (container && reversed) {
				container.classList.add('reversed');
			}
			if (btn && reversed) {
				btn.classList.add('active');
			}
		}

		function toggleEnemyRowsOrder() {
			const container = $('enemy-rows-container');
			const btn = $('btn-flip-enemy-rows');
			if (!container) return;
			
			container.classList.toggle('reversed');
			btn?.classList.toggle('active');
			
			const isReversed = container.classList.contains('reversed');
			storage.setBool('souls_enemyRowsReversed', isReversed);
			
			const msg = isReversed 
				? t('layout.top678')
				: t('layout.top123');
			showToast(msg);
		}

		// Zwraca pola przeciwnika w kolejności wizualnej (uwzględnia odwrócenie rzędów)
		function getEnemyFieldsInOrder() {
			const reversed = storage.getBool('souls_enemyRowsReversed', true);

			if (reversed) {
				// 6-7-8 na górze → kolejność: 6,7,8 → 4,5 → 1,2,3 → Pet
				return [
					'add-enemy6', 'add-enemy7', 'add-enemy8',
					'add-enemy4', 'add-enemy5',
					'add-enemy1', 'add-enemy2', 'add-enemy3',
					'add-enemyPet'
				];
			} else {
				// 1-2-3 na górze → standardowa kolejność
				return FORM_FIELD_CONFIG['add-enemy'].fields;
			}
		}

		// Przełączanie układu: obok siebie vs góra-dół
		function loadFormLayoutPreference() {
			const stacked = storage.getBool('souls_addFormStacked');
			const container = $('add-form-sections');
			const btn = $('btn-layout-toggle');
			const text = $('layout-toggle-text');
			if (container && stacked) {
				container.classList.add('stacked');
			}
			if (btn && stacked) {
				btn.classList.add('active');
			}
			if (text) {
				text.textContent = stacked 
					? t('layout.sideBySide')
					: t('layout.stacked');
			}
		}

		function toggleFormLayout() {
			const container = $('add-form-sections');
			const btn = $('btn-layout-toggle');
			const text = $('layout-toggle-text');
			if (!container) return;
			
			container.classList.toggle('stacked');
			btn?.classList.toggle('active');
			
			const isStacked = container.classList.contains('stacked');
			storage.setBool('souls_addFormStacked', isStacked);
			
			if (text) {
				text.textContent = isStacked 
					? t('layout.sideBySide')
					: t('layout.stacked');
			}
			
			const msg = isStacked 
				? t('layout.stackedLabel')
				: t('layout.sideBySideLabel');
			showToast(msg);
		}

        function addTagToActiveField(value, type) {
            if (!activeAddField) { showToast(t('search.clickFieldFirst'), true); return; }
            
            const input = $(activeAddField);
            if (!input) return;
            
            const isPetField = activeAddField.includes('Pet');
            const isHeroTag = !pets.includes(value);
            
            if (isPetField && isHeroTag) { showToast(t('search.fieldIsPet'), true); return; }
            if (!isPetField && !isHeroTag) { showToast(t('search.selectPetField'), true); return; }
            
            const isMySection = activeAddField.includes('add-my');
            const sectionFields = isPetField ? [isMySection ? 'add-myPet' : 'add-enemyPet'] : 
                (isMySection ? [1,2,3,4,5,6,7,8].map(i => `add-my${i}`) : [1,2,3,4,5,6,7,8].map(i => `add-enemy${i}`));
            
            for (const fieldId of sectionFields) {
                const field = $(fieldId);
                if (field?.value.trim().toLowerCase() === value.toLowerCase()) {
                    field.value = '';
                    setValidation(field, null);
                    updateAddFormTagsSelection();
                    return;
                }
            }
            
            input.value = value;
            setValidation(input, true);
            updateAddFormTagsSelection();
			
			    // 🆕 AUTO-PRZESKAKIWANIE po kliknięciu taga
				if (activeAddField) {
					const nextFieldId = getNextEmptyField(activeAddField);
					if (nextFieldId) {
						setTimeout(() => {
							const nextField = $(nextFieldId);
							if (nextField) {
								nextField.focus();
								activeAddField = nextFieldId;
								// Aktualizuj indicator
								const indicator = $('active-field-indicator');
								const nameEl = $('active-field-name');
								if (indicator && nameEl) {
									const fieldId = nextFieldId.replace('add-', '');
									let fieldName = fieldId;
									if (fieldId.startsWith('enemy')) {
										const num = fieldId.replace('enemy', '').replace('Pet', '');
										fieldName = fieldId.includes('Pet') ? t('fields.enemyPet') : `${t('fields.enemy')} ${num}`;
									} else if (fieldId.startsWith('my')) {
										const num = fieldId.replace('my', '').replace('Pet', '');
										fieldName = fieldId.includes('Pet') ? t('fields.yourPet') : `${t('fields.your')} ${num}`;
									}
									nameEl.textContent = fieldName;
								}
							}
						}, 50);
					}
				}
        }

        function updateAddFormTagsSelection() {
            const isMySection = activeAddField ? activeAddField.includes('add-my') : true;
            const activeValues = [];
            
            const prefix = isMySection ? 'add-my' : 'add-enemy';
            for (let i = 1; i <= 8; i++) {
                const val = $(`${prefix}${i}`)?.value.trim().toLowerCase();
                if (val) activeValues.push(val);
            }
            const pet = $(`${prefix}Pet`)?.value.trim().toLowerCase();
            if (pet) activeValues.push(pet);
            
            document.querySelectorAll('#add-form-tags-container .quick-tag').forEach(tag => {
                tag.classList.toggle('selected', activeValues.includes(tag.textContent.toLowerCase()));
            });
            
            updateAddFormCounter();
        }

        function updateAddFormCounter() {
            // Liczymy tylko wypełnione pola (max 5 heroes + 1 pet = 6 na każdą stronę)
            let myHeroes = 0, myPet = 0, enemyHeroes = 0, enemyPet = 0;
            
            for (let i = 1; i <= 8; i++) {
                if ($(`add-my${i}`)?.value.trim()) myHeroes++;
                if ($(`add-enemy${i}`)?.value.trim()) enemyHeroes++;
            }
            if ($('add-myPet')?.value.trim()) myPet = 1;
            if ($('add-enemyPet')?.value.trim()) enemyPet = 1;
            
            const myTotal = Math.min(myHeroes, 5) + myPet; // Max 5 bohaterów + 1 pet
            const enemyTotal = Math.min(enemyHeroes, 5) + enemyPet;
            
            let counter = $('add-form-counter');
            if (myHeroes > 0 || enemyHeroes > 0 || myPet || enemyPet) {
                if (!counter) {
                    counter = document.createElement('div');
                    counter.id = 'add-form-counter';
                    counter.className = 'search-counter';
                    counter.style.cssText = 'display:block;width:100%;margin-bottom:15px;';
                    $('add-form-tags-container')?.parentNode.insertBefore(counter, $('add-form-tags-container'));
                }
                const yourLabel = t('add.yourTeam');
                const enemyLabel = t('fields.enemy');
                counter.innerHTML = `⚔️ ${yourLabel}: <strong>${myTotal}</strong>/6 &nbsp;│&nbsp; 👹 ${enemyLabel}: <strong>${enemyTotal}</strong>/6`;
            } else counter?.remove();
        }

		async function saveFormation() {
			if (!isOnline) { showToast(t('common.noConnection'), true); return; }
			
			let name = $('add-name').value.trim();
			
			const my = getFieldValues('add-my', 8);
			const enemy = getFieldValues('add-enemy', 8);
			const myPet = $('add-myPet').value.trim();
			const enemyPet = $('add-enemyPet').value.trim();
			
			if (!my.filter(h => h).length && !enemy.filter(h => h).length) { 
				showToast(t('add.addAtLeastOne'), true); 
				return; 
			}
			
			if (my.filter(h => h).length > 5 || enemy.filter(h => h).length > 5) { showToast(t('add.tooManyHeroes'), true); return; }
			const allHeroNames = heroes.map(h => h.name.toLowerCase());
			const invalidHeroes = [...my, ...enemy].filter(h => h && !allHeroNames.includes(h.toLowerCase()));
			if (invalidHeroes.length) { 
				showToast(`${t('add.unknownHeroes')}: ${invalidHeroes.slice(0, 3).join(', ')}`, true); 
				return; 
			}
			
			const allPetNames = pets.map(p => getPetName(p).toLowerCase());
			const invalidPets = [myPet, enemyPet].filter(p => p && !allPetNames.includes(p.toLowerCase()));
			if (invalidPets.length) { 
				showToast(`${t('add.unknownPets')}: ${invalidPets.join(', ')}`, true); 
				return; 
			}
			
			// 🔍 SPRAWDŹ DUPLIKATY
			const existingDuplicate = checkForExactDuplicate(my, myPet, enemy, enemyPet);
			if (existingDuplicate) {
				showDuplicateWarning(existingDuplicate, { name, my, myPet, enemy, enemyPet });
				return;
			}
			
			// Kontynuuj zapis
			await performSaveFormation(name, my, myPet, enemy, enemyPet);
		}

		async function performSaveFormation(name, my, myPet, enemy, enemyPet) {
			// Auto-nazwa jeśli pusta
			if (!name) {
				const now = new Date();
				name = now.toLocaleString('pl-PL', { 
					day: '2-digit', 
					month: '2-digit', 
					year: 'numeric',
					hour: '2-digit',
					minute: '2-digit'
				}).replace(',', '');
			}
			
			const newId = allFormations.length ? Math.max(...allFormations.map(f => f.id)) + 1 : 1;
			const isBase = isAdmin && $('add-isBase')?.checked || false;
			
			try {
				await formationsRef.child(String(newId)).set({
					id: newId, 
					name, 
					my, 
					myPet, 
					enemy, 
					enemyPet,
					comment: $('add-comment').value.trim(),
					isBase: isBase,
					dateAdded: new Date().toISOString()
				});
				showToast(`${t('add.saved')} #${newId}${isBase ? ' (BAZA)' : ''}!`);
				clearAddForm();
				hideDuplicateWarning();
			} catch (e) { 
				showToast(`${t('common.error')}: ${e.message}`, true); 
			}
		}

		async function forceSaveFormation() {
			if (!window.pendingFormation) return;
			
			const { name, my, myPet, enemy, enemyPet } = window.pendingFormation;
			await performSaveFormation(name, my, myPet, enemy, enemyPet);
		}

		function showDuplicateWarning(existing, newData) {
			// Usuń stare ostrzeżenie jeśli istnieje
			hideDuplicateWarning();
			
			const warningHtml = `
				<div class="duplicate-warning" id="duplicate-warning">
					<h4>⚠️ ${t('duplicates.warningTitle')}</h4>
					<p>${t('duplicates.warningText')}</p>
					<div style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 8px; margin: 10px 0;">
						<strong>#${existing.id}</strong> - "${escapeHtml(existing.name)}"
						${existing.isBase ? '<span style="color: var(--accent-gold);"> 👑 BAZA</span>' : ''}
					</div>
					<div class="duplicate-warning-actions">
						<button class="btn btn-secondary" onclick="hideDuplicateWarning()">
							❌ ${t('duplicates.cancel')}
						</button>
						<button class="btn btn-danger" onclick="forceSaveFormation()">
							⚠️ ${t('duplicates.saveAnyway')}
						</button>
					</div>
				</div>
			`;
			
			// Zapisz dane do późniejszego użycia
			window.pendingFormation = newData;
			
			// Wstaw ostrzeżenie przed przyciskiem zapisu
			const saveBtn = document.querySelector('#tab-add .btn-success');
			if (saveBtn) {
				saveBtn.insertAdjacentHTML('beforebegin', warningHtml);
			}
		}

		function hideDuplicateWarning() {
			const warning = $('duplicate-warning');
			if (warning) warning.remove();
			window.pendingFormation = null;
		}

		function checkForExactDuplicate(my, myPet, enemy, enemyPet) {
			const myClean = my.filter(h => h).map(h => normalize(h)).sort();
			const enemyClean = enemy.filter(h => h).map(h => normalize(h)).sort();
			const myPetClean = normalize(myPet);
			const enemyPetClean = normalize(enemyPet);
			
			for (const f of allFormations) {
				const fMyClean = f.my.filter(h => h).map(h => normalize(h)).sort();
				const fEnemyClean = f.enemy.filter(h => h).map(h => normalize(h)).sort();
				const fMyPetClean = normalize(f.myPet);
				const fEnemyPetClean = normalize(f.enemyPet);
				
				// Sprawdź czy identyczne
				const myMatch = myClean.length === fMyClean.length && 
								myClean.every((h, i) => h === fMyClean[i]);
				const enemyMatch = enemyClean.length === fEnemyClean.length && 
								  enemyClean.every((h, i) => h === fEnemyClean[i]);
				const petsMatch = myPetClean === fMyPetClean && enemyPetClean === fEnemyPetClean;
				
				if (myMatch && enemyMatch && petsMatch) {
					return f; // Znaleziono duplikat
				}
			}
			
			return null; // Brak duplikatu
		}

		function clearAddForm() {
			$('add-name').value = '';
			$('add-comment').value = '';
			for (let i = 1; i <= 8; i++) {
				[$(`add-my${i}`), $(`add-enemy${i}`)].forEach(el => { if (el) { el.value = ''; setValidation(el, null); } });
			}
			[$('add-myPet'), $('add-enemyPet')].forEach(el => { if (el) { el.value = ''; setValidation(el, null); } });
			// Reset checkbox
			const isBaseCheckbox = $('add-isBase');
			if (isBaseCheckbox) isBaseCheckbox.checked = false;
			updateAddFormTagsSelection();
		}


        // ═══════════════════════════════════════════════════════════
        // TAB: WAR + WAR-PREVIEW — planer wojny, pinned combos, historia
        // ═══════════════════════════════════════════════════════════

        const cleanVal = v => (v || '').replace(/"/g, '').trim();

        // =====================================================
        // PLANER WOJNY - 3 SKŁADY
        // =====================================================
		function getWarEnemyTeam(enemyNum) {
			// Zachowaj pełną tablicę 8 pozycji (z pustymi stringami)
			const heroesRaw = [];
			const heroesNorm = [];
			
			for (let i = 1; i <= 8; i++) {
				const val = $(`war-e${enemyNum}-h${i}`)?.value.trim() || '';
				heroesRaw.push(val); // Oryginalna nazwa z pozycją
				if (val) heroesNorm.push(normalize(val)); // Do matchowania
			}
			
			const petRaw = $(`war-e${enemyNum}-pet`)?.value.trim() || '';
			
			return { 
				heroes: [...new Set(heroesNorm)],      // Do matchowania (bez pustych, lowercase, bez duplikatów)
				heroesRaw: heroesRaw,    // Do wyświetlania (z pozycjami, oryginalne nazwy)
				pet: petRaw ? normalize(petRaw) : null,  // Do matchowania
				petRaw: petRaw           // Do wyświetlania
			};
		}

        function findMatchingFormations(enemyTeam, minMatch = 1) {
            const query = {
                heroes: enemyTeam.heroes,
                heroesRaw: enemyTeam.heroesRaw,
                pet: enemyTeam.pet,
            };
            const results = [];
            allFormations.forEach(f => {
                const r = scoreFormation(f, query, { withPositionBonus: true });
                if (r.baseScore >= minMatch) {
                    results.push({
                        formation: f,
                        score: r.score,
                        baseScore: r.baseScore,
                        maxScore: r.maxScore,
                        matchedHeroes: r.matchedHeroes,
                        petMatched: r.petMatched,
                        positionBonus: r.positionBonus,
                    });
                }
            });
            return results.sort((a, b) => b.score - a.score);
        }

        function countHeroConflicts(formations) {
            const heroCount = {};
            const petCount = {};
            const displayName = {}; // znormalizowany klucz -> ładna pisownia (kanoniczna z bazy lub oryginał)
            const conflicts = [];

            formations.forEach((f, idx) => {
                f.formation.my.filter(h => h).forEach(hero => {
                    const h = normalize(hero);
                    if (!heroCount[h]) heroCount[h] = [];
                    heroCount[h].push(idx);
                    if (!displayName[h]) displayName[h] = findHero(hero)?.name || hero;
                });
                // Sprawdź też pety
                if (f.formation.myPet) {
                    const p = normalize(f.formation.myPet);
                    if (!petCount[p]) petCount[p] = [];
                    petCount[p].push(idx);
                    if (!displayName[p]) displayName[p] = f.formation.myPet;
                }
            });

            // Znajdź konflikty (bohaterowie użyci więcej niż raz)
            Object.entries(heroCount).forEach(([hero, indices]) => {
                if (indices.length > 1) {
                    conflicts.push({ hero, display: displayName[hero], usedIn: indices, count: indices.length, type: 'hero' });
                }
            });

            // Znajdź konflikty petów
            Object.entries(petCount).forEach(([pet, indices]) => {
                if (indices.length > 1) {
                    conflicts.push({ hero: pet, display: displayName[pet], usedIn: indices, count: indices.length, type: 'pet' });
                }
            });
            
            return {
                total: conflicts.reduce((sum, c) => sum + c.count - 1, 0),
                details: conflicts
            };
        }

		// ===== FILTR PODOBIEŃSTWA =====
		// DOMYŚLNA WARTOŚĆ SUWAKA PO ZAZNACZENIU CHECKBOX - ZMIEŃ TUTAJ:
		const SIMILARITY_DEFAULT_VALUE = 60; // Możesz zmienić na 40, 50, 70, 80, 90

		function toggleWarConflictFree(checked) { storage.setBool('souls_war_conflict_free', checked); }

		function toggleSimilarityFilter(enabled) {
			const container = $('similarity-slider-container');
			const slider = $('war-similarity-threshold');
			if (container) {
				container.style.display = enabled ? 'block' : 'none';
			}
			if (enabled && slider) {
				slider.value = SIMILARITY_DEFAULT_VALUE;
				updateSimilarityLabel(SIMILARITY_DEFAULT_VALUE);
			}
		}

		function updateSimilarityLabel(value) {
			const label = $('similarity-value');
			const hint = $('similarity-hint');
			if (label) label.textContent = value + '%';
			if (hint) hint.textContent = `Ukrywa kombinacje z >${value}% tymi samymi bohaterami`;
		}

		// ===== WYKLUCZANIE BOHATERÓW W PLANERZE WOJNY =====
		let warExcludedHeroes = storage.getJson('souls_war_excluded_heroes', []);
		let warHideExcluded = storage.getBool('souls_war_hide_excluded', true);

		function initWarExcluded() {
			renderWarExcludedChips();
			updateWarExcludedCount();
			const checkbox = $('war-hide-excluded');
			if (checkbox) checkbox.checked = warHideExcluded;
			
			// Obsługa inputa
			const input = $('war-excluded-input');
			if (input) {
				input.addEventListener('keydown', (e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						addWarExcludedHero(input.value.trim());
						input.value = '';
					}
				});
			}
		}

		function initWarFields() {
			if ($('war-conflict-free')) $('war-conflict-free').checked = storage.getBool('souls_war_conflict_free', false);
			// Dodaj listenery do wszystkich pól Wojny
			for (let e = 1; e <= 3; e++) {
				for (let h = 1; h <= 8; h++) {
					const input = $(`war-e${e}-h${h}`);
					if (input) {
						input.addEventListener('focus', () => { activeWarField = `war-e${e}-h${h}`; });
						input.addEventListener('input', () => { updateWarTagsSelection(); });
						// Nie czyścimy activeWarField w blur - focus na inne pole i tak ustawi nową wartość
					}
				}
				const petInput = $(`war-e${e}-pet`);
				if (petInput) {
					petInput.addEventListener('input', () => { updateWarTagsSelection(); });
				}
			}
		}

		function addWarExcludedHero(heroName) {
			if (!heroName) return;

			const finalName = findCanonicalHeroName(heroName);

			if (isHeroInList(warExcludedHeroes, finalName)) {
				showToast(t('war.exclude.alreadyExcluded'), true);
				return;
			}

			warExcludedHeroes.push(finalName);
			storage.setJson('souls_war_excluded_heroes', warExcludedHeroes);
			renderWarExcludedChips();
			updateWarExcludedCount();
			showToast(t('war.exclude.excludedFrom', { name: finalName }));
		}

		function removeWarExcludedHero(heroName) {
			const n = normalize(heroName);
			warExcludedHeroes = warExcludedHeroes.filter(h => normalize(h) !== n);
			storage.setJson('souls_war_excluded_heroes', warExcludedHeroes);
			renderWarExcludedChips();
			updateWarExcludedCount();
		}

		function clearWarExcludedHeroes() {
			if (!warExcludedHeroes.length) return;
			if (!confirm(t('war.exclude.confirmClear'))) return;
			warExcludedHeroes = [];
			storage.setJson('souls_war_excluded_heroes', warExcludedHeroes);
			renderWarExcludedChips();
			updateWarExcludedCount();
			showToast(t('war.exclude.cleared'));
		}

		function renderWarExcludedChips() {
			const container = $('war-excluded-chips');
			if (!container) return;
			
			if (!warExcludedHeroes.length) {
				container.innerHTML = `<span id="war-excluded-empty" style="color: var(--text-muted); font-size: 0.75rem; font-style: italic; width: 100%; text-align: center;">${t('war.exclude.empty')}</span>`;
				return;
			}

			container.innerHTML = warExcludedHeroes.map(hero => `
				<span class="excluded-chip" style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; background: rgba(244, 67, 54, 0.2); border: 1px solid rgba(244, 67, 54, 0.4); border-radius: 12px; font-size: 0.75rem; color: #f44336;">
					${hero}
					<button onclick="removeWarExcludedHero('${hero.replace(/'/g, "\\'")}')" style="background: none; border: none; color: #f44336; cursor: pointer; font-size: 0.8rem; padding: 0 2px; opacity: 0.7;" title="${t('common.remove')}">✕</button>
				</span>
			`).join('');
		}

		function updateWarExcludedCount() {
			const countEl = $('war-excluded-count');
			if (countEl) countEl.textContent = `(${warExcludedHeroes.length})`;
		}

		function onWarExcludeSettingChange() {
			warHideExcluded = $('war-hide-excluded')?.checked ?? true;
			storage.setBool('souls_war_hide_excluded', warHideExcluded);
		}

		function isWarFormationExcluded(formation) {
			if (!warExcludedHeroes.length) return { excluded: false, heroes: [] };
			
			const myHeroes = (formation.my || []).filter(h => h).map(h => normalize(h));
			const myPet = formation.myPet ? normalize(formation.myPet) : null;
			
			const excludedFound = warExcludedHeroes.filter(ex => {
				const normalizedEx = normalize(ex);
				return myHeroes.includes(normalizedEx) || (myPet && myPet === normalizedEx);
			});
			
			return {
				excluded: excludedFound.length > 0,
				heroes: excludedFound
			};
		}

        // ===== TAGI DLA WOJNY =====
        let activeWarField = null;

        function addToWar(heroName, event) {
            // Ctrl+klik = wyklucz bohatera z wyników
            if (event && event.ctrlKey) {
                addWarExcludedHero(heroName);
                return;
            }
            
            // Znajdź wszystkie pola wroga na zakładce Wojna
            const allFields = [];
            for (let e = 1; e <= 3; e++) {
                for (let h = 1; h <= 8; h++) {
                    allFields.push(`war-e${e}-h${h}`);
                }
            }
            
            // Sprawdź czy już jest - jeśli tak, usuń (toggle)
            for (const fieldId of allFields) {
                const input = $(fieldId);
                if (input && input.value.trim().toLowerCase() === heroName.toLowerCase()) {
                    input.value = '';
                    input.classList.remove('hero-race-dark', 'hero-race-light', 'hero-race-human', 
                        'hero-race-fire', 'hero-race-elf', 'hero-race-undead');
                    updateWarTagsSelection();
                    return;
                }
            }
            
            // Funkcja wpisująca do pola i przeskakująca dalej
            function fillFieldAndJump(fieldId) {
                const input = $(fieldId);
                if (!input) return false;
                input.value = heroName;
                updateInputHeroColor(input, false);
                updateWarTagsSelection();
                const nextField = getNextEmptyWarField(fieldId);
                if (nextField) {
                    setTimeout(() => {
                        $(nextField)?.focus();
                        activeWarField = nextField;
                    }, 10);
                }
                return true;
            }
            
            // Jeśli jest aktywne pole
            if (activeWarField) {
                const activeInput = $(activeWarField);
                // Jeśli aktywne pole jest puste - wpisz tam
                if (activeInput && !activeInput.value.trim()) {
                    fillFieldAndJump(activeWarField);
                    return;
                }
                // Jeśli aktywne pole jest zajęte - znajdź następne puste PO nim
                const nextEmpty = getNextEmptyWarField(activeWarField);
                if (nextEmpty) {
                    fillFieldAndJump(nextEmpty);
                    return;
                }
            }
            
            // Brak aktywnego pola lub wszystkie po nim zajęte - szukaj od początku
            for (const fieldId of allFields) {
                const input = $(fieldId);
                if (input && !input.value.trim()) {
                    fillFieldAndJump(fieldId);
                    return;
                }
            }
            showToast(t('search.allSlotsFull'), true);
        }

        function addPetToWar(petName) {
            const petFields = ['war-e1-pet', 'war-e2-pet', 'war-e3-pet'];
            
            // Toggle - jeśli już jest, usuń
            for (const fieldId of petFields) {
                const input = $(fieldId);
                if (input && input.value.trim().toLowerCase() === petName.toLowerCase()) {
                    input.value = '';
                    input.classList.remove('hero-race-pet');
                    updateWarTagsSelection();
                    return;
                }
            }
            
            // Dodaj do pierwszego wolnego pola pet
            for (const fieldId of petFields) {
                const input = $(fieldId);
                if (input && !input.value.trim()) {
                    input.value = petName;
                    input.classList.add('hero-race-pet');
                    updateWarTagsSelection();
                    return;
                }
            }
            showToast(t('kreator.petSlotsFull'), true);
        }

        function getNextEmptyWarField(currentFieldId) {
            const allFields = [];
            for (let e = 1; e <= 3; e++) {
                for (let h = 1; h <= 8; h++) {
                    allFields.push(`war-e${e}-h${h}`);
                }
            }
            const currentIdx = allFields.indexOf(currentFieldId);
            for (let i = currentIdx + 1; i < allFields.length; i++) {
                const input = $(allFields[i]);
                if (input && !input.value.trim()) return allFields[i];
            }
            return null;
        }

        function updateWarTagsSelection() {
            const container = $('war-quick-tags-container');
            if (!container) return;
            
            // Zbierz wszystkie wartości z pól
            const values = new Set();
            for (let e = 1; e <= 3; e++) {
                for (let h = 1; h <= 8; h++) {
                    const val = $(`war-e${e}-h${h}`)?.value.trim().toLowerCase();
                    if (val) values.add(val);
                }
                const pet = $(`war-e${e}-pet`)?.value.trim().toLowerCase();
                if (pet) values.add(pet);
            }
            
            // Zaznacz tagi
            container.querySelectorAll('.quick-tag').forEach(tag => {
                const tagValue = tag.textContent.trim().toLowerCase();
                tag.classList.toggle('selected', values.has(tagValue));
            });
        }

        function findWarFormations() {
			// Zapisz do historii
			saveWarToHistory();
            const enemy1 = getWarEnemyTeam(1);
            const enemy2 = getWarEnemyTeam(2);
            const enemy3 = getWarEnemyTeam(3);
            
            // Sprawdź czy filtrowanie włączone i pobierz próg
            const filterEnabled = $('war-similarity-enabled')?.checked ?? false;
            const similarityThreshold = filterEnabled ? (parseInt($('war-similarity-threshold')?.value || 60) / 100) : 0;
            const filterSimilar = filterEnabled && similarityThreshold > 0;
            
            // Sprawdź czy wprowadzono przynajmniej po jednym bohaterze
            if (!enemy1.heroes.length && !enemy2.heroes.length && !enemy3.heroes.length) {
                showToast('Wpisz przynajmniej jednego bohatera w każdym składzie!', true);
                return;
            }
            
            // Stałe rankingu Wojny (wyniesione z inline — zmiana tu = zmiana zachowania rankingu)
            const WAR_POOL_SIZE = 50;          // ile kontr/wroga wchodzi do iloczynu (ranking i tak utnie do WAR_RESULT_LIMIT)
            const WAR_RESULT_LIMIT = Math.min(100, Math.max(5, appConfig.warResultLimit || 20)); // konfigurowalne (panel admina), clamp 5–100
            const CONFLICT_PENALTY_MULT = 8;   // mnożnik kary za konflikty bohaterów
            const CONFLICT_PENALTY_EXP = 1.5;  // wykładnik kary (superlinearny)
            const WAR_TIE_EPSILON = 0.1;       // próg „remisu" score przy sortowaniu
            // Znajdź pasujące formacje dla każdego wroga
            const matches1 = findMatchingFormations(enemy1, 1).slice(0, WAR_POOL_SIZE);
            const matches2 = findMatchingFormations(enemy2, 1).slice(0, WAR_POOL_SIZE);
            const matches3 = findMatchingFormations(enemy3, 1).slice(0, WAR_POOL_SIZE);
            
            if (!matches1.length || !matches2.length || !matches3.length) {
                $('war-results-section').innerHTML = `
                    <div class="empty-state">
                        <p>❌ Nie znaleziono pasujących formacji dla wszystkich wrogów.</p>
                        <p style="font-size: 0.8rem; margin-top: 10px;">
                            Wróg 1: ${matches1.length} formacji<br>
                            Wróg 2: ${matches2.length} formacji<br>
                            Wróg 3: ${matches3.length} formacji
                        </p>
                    </div>`;
                return;
            }
            
            // Funkcja do obliczania "odcisku" kombinacji (zestaw bohaterów)
            const getComboFingerprint = (combo) => {
                const heroes = new Set();
                combo.formations.forEach(m => {
                    m.formation.my.filter(h => h).forEach(h => heroes.add(normalize(h)));
                });
                return heroes;
            };
            
            // Funkcja sprawdzająca podobieństwo (Jaccard)
            const isSimilar = (fp1, fp2) => {
                const arr1 = [...fp1];
                const intersection = arr1.filter(h => fp2.has(h)).length;
                const union = new Set([...fp1, ...fp2]).size;
                return union > 0 && (intersection / union) >= similarityThreshold;
            };
            
            // Pre-normalizacja bohaterów/petów per kontra (raz, nie w pętli 125k×) — tańsze liczenie konfliktów
            const prep = arr => arr.forEach(m => {
                m._myNorm = m.formation.my.filter(h => h).map(normalize);
                m._petNorm = m.formation.myPet ? normalize(m.formation.myPet) : null;
            });
            prep(matches1); prep(matches2); prep(matches3);

            // Szybka suma konfliktów bez budowania obiektów: |A∩B|+|A∩C|+|B∩C| - |A∩B∩C| (+ analogicznie pety)
            const warConflictTotal = (m1, m2, m3) => {
                const a = m1._myNorm, b = m2._myNorm, c = m3._myNorm;
                const inter = (x, y) => { let n = 0; for (const e of x) if (y.includes(e)) n++; return n; };
                let triple = 0; for (const e of a) if (b.includes(e) && c.includes(e)) triple++;
                let total = inter(a, b) + inter(a, c) + inter(b, c) - triple;
                const p1 = m1._petNorm, p2 = m2._petNorm, p3 = m3._petNorm;
                if (p1 || p2 || p3) {
                    const pab = (p1 && p1 === p2) ? 1 : 0, pac = (p1 && p1 === p3) ? 1 : 0, pbc = (p2 && p2 === p3) ? 1 : 0;
                    const ptri = (p1 && p1 === p2 && p2 === p3) ? 1 : 0;
                    total += pab + pac + pbc - ptri;
                }
                return total;
            };

            // KROK 1: Generuj WSZYSTKIE kombinacje (bez filtrowania)
            let allCombinations = [];
            
            for (const m1 of matches1) {
                for (const m2 of matches2) {
                    if (m1.formation.id === m2.formation.id) continue;
                    
                    for (const m3 of matches3) {
                        if (m1.formation.id === m3.formation.id || m2.formation.id === m3.formation.id) continue;
                        
                        const conflicts = warConflictTotal(m1, m2, m3);
                        const totalScore = m1.score + m2.score + m3.score;
                        const totalBaseScore = (m1.baseScore || m1.score) + (m2.baseScore || m2.score) + (m3.baseScore || m3.score);
                        const maxPossible = m1.maxScore + m2.maxScore + m3.maxScore;
                        const percent = maxPossible > 0 ? (totalBaseScore / maxPossible) * 100 : 0;
                        const rankScore = percent - Math.pow(conflicts, CONFLICT_PENALTY_EXP) * CONFLICT_PENALTY_MULT;

                        allCombinations.push({
                            formations: [m1, m2, m3],
                            conflicts,
                            totalScore,
                            totalBaseScore,
                            avgScore: totalBaseScore / 3,
                            maxPossible,
                            rankScore
                        });
                    }
                }
            }
            
			// Filtr „tylko grywalne" (bez konfliktów) — per-user, domyślnie off
			if ($('war-conflict-free')?.checked) {
				allCombinations = allCombinations.filter(c => c.conflicts === 0);
				if (!allCombinations.length) {
					$('war-results-section').innerHTML = `<div class="empty-state"><p>${t('war.noConflictFree')}</p></div>`;
					return;
				}
			}
			// KROK 2: Sortuj WSZYSTKIE po jakości (najlepsze na górze)
			allCombinations.sort((a, b) => {
				// rankScore (percent − kara za konflikty) policzony raz przy generowaniu kombinacji
				if (Math.abs(a.rankScore - b.rankScore) > WAR_TIE_EPSILON) return b.rankScore - a.rankScore;
				return a.conflicts - b.conflicts;
			});
            
			// KROK 3: Filtruj podobne (jeśli włączone) - z posortowanej listy zostają NAJLEPSZE
			let top;
			if (filterSimilar) {
				top = [];
				const fingerprints = [];
				
				for (const combo of allCombinations) {
					if (top.length >= WAR_RESULT_LIMIT) break; // Early exit - mamy już komplet unikalnych
					
					const fp = getComboFingerprint(combo);
					let isDuplicate = false;
					
					// Porównaj tylko z już zaakceptowanymi (max 20)
					for (const existingFp of fingerprints) {
						if (isSimilar(fp, existingFp)) {
							isDuplicate = true;
							break;
						}
					}
					
					if (!isDuplicate) {
						top.push(combo);
						fingerprints.push(fp);
					}
				}
			} else {
				top = allCombinations.slice(0, WAR_RESULT_LIMIT);
			}
            
            // Szczegóły konfliktów liczymy dopiero dla wyświetlanych kombinacji (tanio, ~20 szt.)
            top.forEach(c => { if (!c.conflictDetails) c.conflictDetails = countHeroConflicts(c.formations).details; });
            displayWarResults(top, [enemy1, enemy2, enemy3]);
        }

		function displayWarResults(results, enemies) {
			if (!results.length) {
				$('war-results-section').innerHTML = `
					<div class="empty-state">
						<p>❌ Nie znaleziono żadnych kombinacji.</p>
					</div>`;
				return;
			}
			
			// Filtruj wyniki według wykluczonych bohaterów
			let displayedResults = results;
			let hiddenCount = 0;
			
			if (warExcludedHeroes.length > 0) {
				if (warHideExcluded) {
					// Ukryj formacje z wykluczonymi
					displayedResults = results.filter(combo => {
						// Sprawdź wszystkie 3 formacje w kombinacji
						for (const m of combo.formations) {
							if (isWarFormationExcluded(m.formation).excluded) {
								return false;
							}
						}
						return true;
					});
					hiddenCount = results.length - displayedResults.length;
				}
			}
			
			if (!displayedResults.length) {
				$('war-results-section').innerHTML = `
					<div class="empty-state">
						<p>❌ Nie znaleziono kombinacji bez wykluczonych bohaterów.</p>
						<p style="font-size:0.8rem;color:var(--text-muted);margin-top:10px;">
							${hiddenCount} kombinacji ukrytych z powodu wykluczonych bohaterów.<br>
							Odznacz "Ukryj formacje z wykluczonymi" aby je zobaczyć.
						</p>
					</div>`;
				return;
			}
			
			// Zapisz wyniki i enemies do globalnej zmiennej
			window.warResults = displayedResults.map(r => ({ ...r, enemies }));
			
			// Oblicz statystyki ogólne
			const perfectCount = displayedResults.filter(r => r.conflicts === 0).length;
			const avgScore = (displayedResults.reduce((sum, r) => sum + (r.totalBaseScore || r.totalScore), 0) / displayedResults.length).toFixed(1);
			const maxPossibleScore = enemies.reduce((sum, e) => sum + e.heroes.length + (e.pet ? 1 : 0), 0);
			
			let html = `
				<div class="war-summary-box">
					<h3>🎯 Propozycje składów</h3>
					<div class="war-summary-stats">
						<div class="war-stat">
							<span class="war-stat-value">${displayedResults.length}${hiddenCount > 0 ? ` <span style="font-size:0.7rem;color:#f44336;">(+${hiddenCount} 🚫)</span>` : ''}</span>
							<span class="war-stat-label">kombinacji</span>
						</div>
						<div class="war-stat">
							<span class="war-stat-value ${perfectCount > 0 ? 'green' : 'orange'}">${perfectCount}</span>
							<span class="war-stat-label">idealnych</span>
						</div>
						<div class="war-stat">
							<span class="war-stat-value">${avgScore}/${maxPossibleScore}</span>
							<span class="war-stat-label">śr. trafień</span>
						</div>
					</div>
					<div class="war-legend">
						<span class="legend-item"><span class="dot green"></span> Idealne (0 konfliktów)</span>
						<span class="legend-item"><span class="dot yellow"></span> Dobre (1-2 konflikty)</span>
						<span class="legend-item"><span class="dot orange"></span> Do rozważenia (3+ konfliktów)</span>
					</div>
				</div>
				<p style="font-size:0.75rem;color:var(--text-muted);margin:15px 0;text-align:center;">
					Kliknij w propozycję aby zobaczyć szczegółowy podgląd
				</p>`;
			
			displayedResults.forEach((combo, idx) => {
				// Sprawdź czy ma wykluczone (dla trybu "pokaż wszystkie")
				let hasExcluded = false;
				let excludedInCombo = [];
				if (!warHideExcluded && warExcludedHeroes.length > 0) {
					for (const m of combo.formations) {
						const check = isWarFormationExcluded(m.formation);
						if (check.excluded) {
							hasExcluded = true;
							excludedInCombo.push(...check.heroes);
						}
					}
					excludedInCombo = [...new Set(excludedInCombo)]; // Unikalne
				}
				
				const cardClass = combo.conflicts === 0 ? 'perfect' : combo.conflicts <= 2 ? 'good' : 'conflicts';
				const badgeClass = combo.conflicts === 0 ? 'perfect' : combo.conflicts <= 2 ? 'good' : 'bad';
				const badgeText = combo.conflicts === 0 ? '✓ IDEALNE' : `${combo.conflicts} konflikt${combo.conflicts === 1 ? '' : combo.conflicts < 5 ? 'y' : 'ów'}`;
				
				// Zbierz wszystkie konfliktowe bohaterów
				const conflictHeroes = new Set();
				combo.conflictDetails.forEach(c => conflictHeroes.add(c.hero));
				
				// Oblicz ogólną ocenę (0-100%)
				const maxPossible = combo.formations.reduce((sum, m) => sum + m.maxScore, 0);
				const totalBase = combo.totalBaseScore || combo.formations.reduce((sum, m) => sum + (m.baseScore || m.score), 0);
				const scorePercent = maxPossible > 0 ? Math.round((totalBase / maxPossible) * 100) : 0;
				const scoreClass = scorePercent >= 80 ? 'high' : scorePercent >= 50 ? 'medium' : 'low';
				
				html += `
					<div class="war-result-card ${cardClass}" onclick="showWarPreview(${idx})">
						<div class="war-result-header">
							<div class="war-result-header-left">
								<span class="war-result-rank">#${idx + 1}</span>
								<button class="btn-pin" onclick="event.stopPropagation(); pinWarCombo(${idx})" title="Przypnij ten skład">
									📌
								</button>
								<button class="btn-pin" onclick="event.stopPropagation(); copyWarComboToKreator(${idx})" title="Przenieś do Kreatora" style="background: rgba(76, 175, 80, 0.2); border-color: rgba(76, 175, 80, 0.5);">
									📝
								</button>
							</div>
							<div class="war-result-badges">
								<span class="war-score-badge ${scoreClass}">${scorePercent}% trafień</span>
								<span class="war-conflict-badge ${badgeClass}">${badgeText}</span>
							</div>
						</div>
						<div class="war-formations-grid">
							${combo.formations.map((m, i) => {
								const f = m.formation;
								const myHeroes = f.my.filter(h => h);
								const enemy = enemies[i];
								const displayScore = m.baseScore !== undefined ? m.baseScore : Math.floor(m.score);
								const scoreClass = displayScore >= 4 ? 'high' : displayScore >= 2 ? 'medium' : 'low';
								const matchPercent = m.maxScore > 0 ? Math.round((displayScore / m.maxScore) * 100) : 0;
								
								return `
									<div class="war-formation-box">
										<h4>
											⚔️ Walka ${i + 1}
											<span class="formation-id">#${f.id}</span>
										</h4>
										<div class="war-formation-section">
											<span class="war-section-label">Twój skład:</span>
											<div class="heroes-list">
												${myHeroes.slice(0, 5).map(h => {
													const isConflict = conflictHeroes.has(normalize(h));
													const heroData = heroes.find(hr => normalize(hr.name) === normalize(h));
													const raceClass = heroData?.race ? `hero-${heroData.race.toLowerCase()}` : '';
													return isConflict 
														? `<span class="hero-conflict">${h}</span>` 
														: `<span class="${raceClass}">${h}</span>`;
												}).join(', ') || '—'}${myHeroes.length > 5 ? '...' : ''}${f.myPet ? ` <span class="pet-inline">+ 🐾 <span class="hero-pet">${f.myPet}</span></span>` : ''}
											</div>
										</div>
										<div class="war-formation-section">
											<span class="war-section-label">Wróg z bazy:</span>
											<div class="heroes-list enemy-heroes">
												${f.enemy.filter(h => h).slice(0, 5).map(h => {
													const heroData = heroes.find(hr => normalize(hr.name) === normalize(h));
													const raceClass = heroData?.race ? `hero-${heroData.race.toLowerCase()}` : '';
													return `<span class="${raceClass}">${h}</span>`;
												}).join(', ') || '—'}${f.enemy.filter(h => h).length > 5 ? '...' : ''}${f.enemyPet ? ` <span class="pet-inline">+ 🐾 <span class="hero-pet">${f.enemyPet}</span></span>` : ''}
											</div>
										</div>
										<div class="war-vs-enemy">
											<div class="war-match-bar ${scoreClass}">
												${Array.from({ length: 10 }, (_, s) => `<span class="war-match-seg ${s < Math.round(matchPercent / 10) ? 'on' : ''}"></span>`).join('')}
											</div>
											<span class="war-match-score ${scoreClass}">${displayScore}/${m.maxScore}</span>
										</div>
									</div>`;
							}).join('')}
						</div>
						${combo.conflictDetails.length ? `
							<div class="war-conflicts-summary">
								⚠️ <strong>Konflikty:</strong> ${combo.conflictDetails.map(c => 
									`<span class="conflict-hero">${c.display || c.hero}</span>`
								).join(', ')}
							</div>` : ''}
						${hasExcluded ? `
							<div class="war-excluded-summary" style="margin-top: 8px; padding: 6px 10px; background: rgba(244, 67, 54, 0.1); border: 1px solid rgba(244, 67, 54, 0.3); border-radius: 6px; font-size: 0.75rem; color: #f44336;">
								🚫 <strong>Wykluczone:</strong> ${excludedInCombo.join(', ')}
							</div>` : ''}
					</div>`;
			});
			
			$('war-results-section').innerHTML = html;
		}

		function pinWarCombo(comboIndex) {
			const combo = window.warResults?.[comboIndex];
			if (!combo) return;
			
			const defaultName = `Skład #${pinnedCombos.length + 1}`;
			const name = prompt('Nazwa dla tego składu:', defaultName);
			if (name === null) return; // anulowano
			
			const pinned = {
				id: Date.now(),
				name: name || defaultName,
				enemies: combo.enemies,
				formations: combo.formations.map(f => ({
					formationId: f.formation.id,
					formationName: f.formation.name,
					enemy: [...f.formation.enemy],
					my: [...f.formation.my],
					enemyPet: f.formation.enemyPet,
					myPet: f.formation.myPet,
					score: f.score,
					baseScore: f.baseScore !== undefined ? f.baseScore : Math.floor(f.score),
					maxScore: f.maxScore
				})),
				conflicts: combo.conflicts,
				conflictDetails: combo.conflictDetails,
				totalScore: combo.totalScore,
				totalBaseScore: combo.totalBaseScore || combo.formations.reduce((sum, f) => sum + (f.baseScore !== undefined ? f.baseScore : Math.floor(f.score)), 0),
				savedAt: new Date().toISOString()
			};
			
			pinnedCombos.unshift(pinned);
			if (pinnedCombos.length > 20) pinnedCombos = pinnedCombos.slice(0, 20);
			storage.setJson('souls_pinned_combos', pinnedCombos);
			
			renderPinnedCombos();
			showToast('📌 Skład przypięty!');
		}

		// Przenieś wynik z Wojny do Kreatora
		function copyWarComboToKreator(comboIndex) {
			const combo = window.warResults?.[comboIndex];
			if (!combo) return;
			
			// Wyczyść Kreator bez pytania
			for (let s = 1; s <= 3; s++) {
				for (let h = 1; h <= 8; h++) {
					const input = $(`kreator-${s}-h${h}`);
					if (input) {
						input.value = '';
						input.classList.remove('hero-race-dark', 'hero-race-light', 'hero-race-human', 
							'hero-race-fire', 'hero-race-elf', 'hero-race-undead', 'hero-race-pet');
					}
				}
				const petInput = $(`kreator-${s}-pet`);
				if (petInput) {
					petInput.value = '';
					petInput.classList.remove('hero-race-pet');
				}
			}
			
			// Ustaw liczbę składów na 3
			setKreatorCount(3);
			
			// Wypełnij składy danymi z combo
			combo.formations.forEach((match, idx) => {
				const skladNum = idx + 1;
				const f = match.formation;
				
				// Wypełnij bohaterów (my = twój skład)
				f.my.forEach((hero, heroIdx) => {
					const input = $(`kreator-${skladNum}-h${heroIdx + 1}`);
					if (input && hero) {
						input.value = hero;
						updateInputHeroColor(input, false);
					}
				});
				
				// Wypełnij peta
				const petInput = $(`kreator-${skladNum}-pet`);
				if (petInput && f.myPet) {
					petInput.value = f.myPet;
					updateInputHeroColor(petInput, true);
				}
			});
			
			// Aktualizuj tagi
			updateKreatorTagsSelection();
			
			// Przełącz na zakładkę Kreator
			showTab('tab-kreator');
			
			showToast('📝 Skład przeniesiony do Kreatora!');
		}

		// Przenieś aktualnie oglądany skład do Kreatora (z podglądu wojny)
		function copyCurrentWarComboToKreator() {
			if (window.currentWarComboIndex !== undefined && window.warResults?.[window.currentWarComboIndex]) {
				copyWarComboToKreator(window.currentWarComboIndex);
				return;
			}
			
			// Jeśli to z przypiętego składu - użyj currentWarCombo bezpośrednio
			const combo = window.currentWarCombo;
			if (!combo) {
				showToast('Brak składu do przeniesienia', true);
				return;
			}
			
			// Wyczyść Kreator
			for (let s = 1; s <= 3; s++) {
				for (let h = 1; h <= 8; h++) {
					const input = $(`kreator-${s}-h${h}`);
					if (input) {
						input.value = '';
						input.classList.remove('hero-race-dark', 'hero-race-light', 'hero-race-human', 
							'hero-race-fire', 'hero-race-elf', 'hero-race-undead', 'hero-race-pet');
					}
				}
				const petInput = $(`kreator-${s}-pet`);
				if (petInput) {
					petInput.value = '';
					petInput.classList.remove('hero-race-pet');
				}
			}
			
			setKreatorCount(3);
			
			// Wypełnij składy
			combo.formations.forEach((match, idx) => {
				const skladNum = idx + 1;
				const f = match.formation || match; // obsłuż oba formaty
				const myHeroes = f.my || [];
				const myPet = f.myPet || '';
				
				myHeroes.forEach((hero, heroIdx) => {
					const input = $(`kreator-${skladNum}-h${heroIdx + 1}`);
					if (input && hero) {
						input.value = hero;
						updateInputHeroColor(input, false);
					}
				});
				
				const petInput = $(`kreator-${skladNum}-pet`);
				if (petInput && myPet) {
					petInput.value = myPet;
					updateInputHeroColor(petInput, true);
				}
			});
			
			updateKreatorTagsSelection();
			showTab('tab-kreator');
			showToast('📝 Skład przeniesiony do Kreatora!');
		}

		// Przypnij aktualnie oglądany skład (z podglądu wojny)
		function pinCurrentWarCombo() {
			// Jeśli mamy indeks z warResults, użyj standardowej funkcji
			if (window.currentWarComboIndex !== undefined && window.warResults?.[window.currentWarComboIndex]) {
				pinWarCombo(window.currentWarComboIndex);
				return;
			}
			
			// W przeciwnym razie (np. z przypiętego składu) - stwórz nowy pin z currentWarCombo
			const combo = window.currentWarCombo;
			if (!combo) {
				showToast('Brak składu do przypięcia', true);
				return;
			}
			
			const defaultName = `Skład #${pinnedCombos.length + 1}`;
			const name = prompt('Nazwa dla tego składu:', defaultName);
			if (name === null) return;
			
			const pinned = {
				id: Date.now(),
				name: name || defaultName,
				enemies: combo.enemies,
				formations: combo.formations.map(f => ({
					formationId: f.formation.id,
					formationName: f.formation.name,
					enemy: [...f.formation.enemy],
					my: [...f.formation.my],
					enemyPet: f.formation.enemyPet,
					myPet: f.formation.myPet,
					score: f.score,
					baseScore: f.baseScore !== undefined ? f.baseScore : Math.floor(f.score),
					maxScore: f.maxScore
				})),
				conflicts: combo.conflicts,
				conflictDetails: combo.conflictDetails || [],
				totalScore: combo.totalScore || combo.formations.reduce((sum, f) => sum + f.score, 0),
				totalBaseScore: combo.formations.reduce((sum, f) => sum + (f.baseScore !== undefined ? f.baseScore : Math.floor(f.score)), 0),
				savedAt: new Date().toISOString()
			};
			
			pinnedCombos.unshift(pinned);
			if (pinnedCombos.length > 20) pinnedCombos = pinnedCombos.slice(0, 20);
			storage.setJson('souls_pinned_combos', pinnedCombos);
			
			renderPinnedCombos();
			showToast('📌 Skład przypięty!');
		}

		function unpinCombo(id) {
			if (!confirm('Czy na pewno chcesz odpiąć ten skład?')) return;
			
			pinnedCombos = pinnedCombos.filter(p => p.id !== id);
			storage.setJson('souls_pinned_combos', pinnedCombos);
			
			renderPinnedCombos();
			showToast('Skład odpięty');
		}

		function renderPinnedCombos() {
			const container = $('pinned-combos-list');
			const section = $('pinned-combos-section');
			if (!container || !section) return;
			
			if (pinnedCombos.length === 0) {
				section.style.display = 'none';
				return;
			}
			
			section.style.display = 'block';
			
			container.innerHTML = pinnedCombos.map(pinned => {
				const conflictClass = pinned.conflicts === 0 ? 'perfect' : pinned.conflicts <= 2 ? 'good' : 'bad';
				const timeAgo = getTimeAgo(new Date(pinned.savedAt));
				
				// Oblicz % dopasowania
				const maxPossible = pinned.formations.reduce((sum, f) => sum + f.maxScore, 0);
				const totalBase = pinned.totalBaseScore || pinned.formations.reduce((sum, f) => sum + (f.baseScore || f.score), 0);
				const percent = maxPossible > 0 ? Math.round((totalBase / maxPossible) * 100) : 0;
				
				return `
					<div class="pinned-combo-card">
						<div class="pinned-combo-header">
							<span class="pinned-combo-name">📌 ${pinned.name}</span>
							<span class="pinned-combo-time">${timeAgo}</span>
						</div>
						<div class="pinned-combo-stats">
							<span class="pinned-stat ${conflictClass}">
								${pinned.conflicts === 0 ? '✓ Idealne' : `${pinned.conflicts} konflikt${pinned.conflicts === 1 ? '' : pinned.conflicts < 5 ? 'y' : 'ów'}`}
							</span>
							<span class="pinned-stat">${percent}% trafień</span>
						</div>
						<div class="pinned-combo-formations">
							${pinned.formations.map((f, i) => `
								<div class="pinned-formation">
									<strong>Walka ${i+1}</strong> (#${f.formationId}): 
									${f.my.filter(h => h).slice(0, 4).join(', ')}${f.my.filter(h => h).length > 4 ? '...' : ''}
								</div>
							`).join('')}
						</div>
						<div class="pinned-combo-actions">
							<button class="btn btn-small btn-secondary" onclick="loadPinnedCombo(${pinned.id})">
								👁️ Podgląd
							</button>
							<button class="btn btn-small btn-danger" onclick="unpinCombo(${pinned.id})">
								✕ Odepnij
							</button>
						</div>
					</div>
				`;
			}).join('');
		}

		function loadPinnedCombo(id) {
			const pinned = pinnedCombos.find(p => p.id === id);
			if (!pinned) return;
			
			// Przekształć pinnedCombo do formatu window.currentWarCombo
			window.currentWarCombo = {
				formations: pinned.formations.map(f => ({
					formation: {
						id: f.formationId,
						name: f.formationName,
						enemy: f.enemy,
						my: f.my,
						enemyPet: f.enemyPet,
						myPet: f.myPet
					},
					score: f.score,
					baseScore: f.baseScore !== undefined ? f.baseScore : f.score,
					maxScore: f.maxScore,
					matchedHeroes: []
				})),
				conflicts: pinned.conflicts,
				conflictDetails: pinned.conflictDetails || [],
				enemies: pinned.enemies || []
			};
			
			currentWarResults = pinned.formations.map(f => ({
				formation: {
					id: f.formationId,
					name: f.formationName,
					enemy: f.enemy,
					my: f.my,
					enemyPet: f.enemyPet,
					myPet: f.myPet
				}
			}));
			window.currentWarComboIndex = undefined; // Reset - to jest z pinezki
			switchTab('war-preview');
			renderWarPreview();
		}

		function clearAllPinnedCombos() {
			if (!confirm('Czy na pewno chcesz usunąć WSZYSTKIE przypięte składy?')) return;
			
			pinnedCombos = [];
			storage.setJson('souls_pinned_combos', pinnedCombos);
			renderPinnedCombos();
			showToast('Wszystkie pinezki usunięte');
		}

		function saveWarPlannerToStorage() {
			const data = {
				enemies: [],
				savedAt: new Date().toISOString()
			};
			
			for (let e = 1; e <= 3; e++) {
				const enemy = { heroes: [], pet: '' };
				for (let h = 1; h <= 8; h++) {
					enemy.heroes.push($(`war-e${e}-h${h}`)?.value.trim() || '');
				}
				enemy.pet = $(`war-e${e}-pet`)?.value.trim() || '';
				data.enemies.push(enemy);
			}
			
			// Zapisz tylko jeśli jest cokolwiek wypełnione
			const hasData = data.enemies.some(e => e.heroes.some(h => h) || e.pet);
			if (hasData) {
				storage.setJson('souls_war_planner', data);
				updateWarAutosaveInfo();
			}
		}

		function updateWarAutosaveInfo() {
			const info = $('war-autosave-info');
			if (!info) return;
			
			const saved = localStorage.getItem('souls_war_planner');
			if (!saved) {
				info.innerHTML = '';
				return;
			}
			
			try {
				const data = JSON.parse(saved);
				const savedDate = new Date(data.savedAt);
				const timeAgo = getTimeAgo(savedDate);
				const filledCount = data.enemies.filter(e => e.heroes.some(h => h) || e.pet).length;
				info.innerHTML = `💾 Ostatni zapis: ${timeAgo} (${filledCount}/3 walki)`;
			} catch (e) {
				info.innerHTML = '';
			}
		}

		function setupWarPlannerAutosave() {
			// Nasłuchuj zmian we wszystkich polach war planner
			for (let e = 1; e <= 3; e++) {
				for (let h = 1; h <= 8; h++) {
					const el = $(`war-e${e}-h${h}`);
					if (el) {
						el.addEventListener('input', debounce(saveWarPlannerToStorage, 500));
						el.addEventListener('blur', saveWarPlannerToStorage);
						el.addEventListener('input', () => updateInputHeroColor(el));
						el.addEventListener('blur', () => updateInputHeroColor(el));
						// Koloruj przy starcie jeśli jest wartość
						updateInputHeroColor(el);
					}
				}
				const petEl = $(`war-e${e}-pet`);
				if (petEl) {
					petEl.addEventListener('input', debounce(saveWarPlannerToStorage, 500));
					petEl.addEventListener('blur', saveWarPlannerToStorage);
					petEl.addEventListener('input', () => updateInputHeroColor(petEl, true));
					petEl.addEventListener('blur', () => updateInputHeroColor(petEl, true));
					// Koloruj przy starcie jeśli jest wartość
					updateInputHeroColor(petEl, true);
				}
			}
			
			// Pokaż info o ostatnim zapisie
			updateWarAutosaveInfo();
		}

		function clearWarPlanner(keepStorage = false) {
			for (let e = 1; e <= 3; e++) {
				for (let h = 1; h <= 8; h++) {
					const el = $(`war-e${e}-h${h}`);
					if (el) {
						el.value = '';
						el.classList.remove('hero-race-dark', 'hero-race-light', 'hero-race-human', 
							'hero-race-fire', 'hero-race-elf', 'hero-race-undead', 'hero-race-pet');
					}
				}
				const pet = $(`war-e${e}-pet`);
				if (pet) {
					pet.value = '';
					pet.classList.remove('hero-race-pet');
				}
			}
			updateWarTagsSelection();
			$('war-results-section').innerHTML = `
				<div class="empty-state">
					<p>Wpisz składy 3 wrogów i kliknij "Znajdź optymalne składy"</p>
				</div>`;
			window.warResults = null;
			
			// Nie czyść storage - użytkownik może chcieć wczytać ponownie
			// Ale zaktualizuj info
			updateWarAutosaveInfo();
		}

		function toggleWarHistory() {
			const dropdown = $('war-history-dropdown');
			dropdown.classList.toggle('hidden');
			
			if (!dropdown.classList.contains('hidden')) {
				renderWarHistory();
				setTimeout(() => {
					document.addEventListener('click', closeWarHistoryOnClickOutside);
				}, 10);
			} else {
				document.removeEventListener('click', closeWarHistoryOnClickOutside);
			}
		}

		function closeWarHistoryOnClickOutside(e) {
			const dropdown = $('war-history-dropdown');
			const wrapper = e.target.closest('.search-history-wrapper');
			
			if (!wrapper && !dropdown.classList.contains('hidden')) {
				dropdown.classList.add('hidden');
				document.removeEventListener('click', closeWarHistoryOnClickOutside);
			}
		}

		function saveWarToHistory() {
			const enemies = [];
			let hasAnyData = false;
			
			for (let e = 1; e <= 3; e++) {
				const enemy = { heroes: [], pet: '' };
				for (let h = 1; h <= 8; h++) {
					const val = $(`war-e${e}-h${h}`)?.value.trim() || '';
					enemy.heroes.push(val); // Zachowaj pozycję (nawet puste)
					if (val) hasAnyData = true;
				}
				enemy.pet = $(`war-e${e}-pet`)?.value.trim() || '';
				if (enemy.pet) hasAnyData = true;
				enemies.push(enemy);
			}
			
			if (!hasAnyData) return;
			
			const entry = {
				enemies: enemies,
				timestamp: new Date().toISOString()
			};
			
			// Sprawdź czy takie samo wyszukiwanie już istnieje
			const existingIndex = warSearchHistory.findIndex(h => {
				return JSON.stringify(h.enemies) === JSON.stringify(enemies);
			});
			
			if (existingIndex > -1) {
				warSearchHistory.splice(existingIndex, 1);
			}
			
			warSearchHistory.unshift(entry);
			
			// Limit do 15 wpisów
			if (warSearchHistory.length > 15) {
				warSearchHistory = warSearchHistory.slice(0, 15);
			}
			
			storage.setJson('souls_war_history', warSearchHistory);
		}

		function renderWarHistory() {
			const list = $('war-history-list');
			
			if (!warSearchHistory.length) {
				list.innerHTML = `<div class="search-history-empty">${t('search.historyEmpty')}</div>`;
				return;
			}
			
			list.innerHTML = warSearchHistory.map((entry, idx) => {
				const timeAgo = getTimeAgo(new Date(entry.timestamp));
				
				// Generuj podgląd 3 składów
				const enemiesHtml = entry.enemies.map((enemy, eIdx) => {
					const heroesText = enemy.heroes.filter(h => h).slice(0, 3).join(', ');
					const moreCount = enemy.heroes.filter(h => h).length - 3;
					const petText = enemy.pet ? `+ 🐾${enemy.pet}` : '';
					
					if (!heroesText && !enemy.pet) return '';
					
					return `
						<div class="war-history-enemy">
							<strong>W${eIdx + 1}:</strong>
							<span class="heroes">${heroesText || '—'}${moreCount > 0 ? ` +${moreCount}` : ''}</span>
							${petText ? `<span class="pet">${petText}</span>` : ''}
						</div>
					`;
				}).filter(h => h).join('');
				
				if (!enemiesHtml) return '';
				
				return `
					<div class="search-history-item" onclick="loadWarFromHistory(${idx})">
						<button class="search-history-item-remove" onclick="event.stopPropagation(); removeWarHistoryItem(${idx})" title="${t('common.delete')}">✕</button>
						<div class="war-history-item-enemies">
							${enemiesHtml}
						</div>
						<div class="search-history-item-time">🕐 ${timeAgo}</div>
					</div>
				`;
			}).filter(h => h).join('');
			
			if (!list.innerHTML.trim()) {
				list.innerHTML = `<div class="search-history-empty">${t('search.historyEmpty')}</div>`;
			}
		}

		function loadWarFromHistory(idx) {
			const entry = warSearchHistory[idx];
			if (!entry) return;
			
			// Wypełnij wszystkie pola
			for (let e = 1; e <= 3; e++) {
				const enemy = entry.enemies[e - 1];
				if (!enemy) continue;
				
				for (let h = 1; h <= 8; h++) {
					const el = $(`war-e${e}-h${h}`);
					if (el) {
						el.value = enemy.heroes[h - 1] || '';
						updateInputHeroColor(el);
					}
				}
				
				const petEl = $(`war-e${e}-pet`);
				if (petEl) {
					petEl.value = enemy.pet || '';
					updateInputHeroColor(petEl, true);
				}
			}
			
			updateWarTagsSelection();
			
			// Zamknij dropdown
			$('war-history-dropdown').classList.add('hidden');
			document.removeEventListener('click', closeWarHistoryOnClickOutside);
			
			// Aktualizuj info
			updateWarAutosaveInfo();
			
			const timeAgo = getTimeAgo(new Date(entry.timestamp));
			showToast(`📜 ${t('search.loadedFromHistory')} (${timeAgo})`);
		}

		function removeWarHistoryItem(idx) {
			warSearchHistory.splice(idx, 1);
			storage.setJson('souls_war_history', warSearchHistory);
			renderWarHistory();
			showToast(t('common.formationDeleted'));
		}

		function clearWarHistory() {
			if (!confirm(t('war.historyConfirmClear'))) return;
			
			warSearchHistory = [];
			storage.setJson('souls_war_history', warSearchHistory);
			renderWarHistory();
			showToast(t('common.historyCleared'));
		}

        function showWarPreview(comboIndex) {
            const combo = window.warResults?.[comboIndex];
            if (!combo) return;
            window.currentWarCombo = combo;
            window.currentWarComboIndex = comboIndex; // Zapisz indeks dla przypinania
            // Zapisz wyniki dla eksportu
            currentWarResults = combo.formations;
            switchTab('war-preview');
            renderWarPreview();
        }

		function renderWarPreview() {
			const combo = window.currentWarCombo;
			if (!combo) {
				$('war-preview-content').innerHTML = `<div class="empty-state"><p>${t('war.selectCombo')}</p></div>`;
				return;
			}
			
			// Zbierz wszystkich bohaterów użytych w "TWÓJ SKŁAD" aby wykryć konflikty
			const allMyHeroes = {};
			const allMyPets = {};
			const conflictDisplay = {}; // znormalizowany klucz -> ładna pisownia
			combo.formations.forEach((match, idx) => {
				match.formation.my.filter(h => h).forEach(hero => {
					const h = normalize(hero);
					if (!allMyHeroes[h]) allMyHeroes[h] = [];
					allMyHeroes[h].push(idx);
					if (!conflictDisplay[h]) conflictDisplay[h] = findHero(hero)?.name || hero;
				});
				// Sprawdź też pety
				if (match.formation.myPet) {
					const p = normalize(match.formation.myPet);
					if (!allMyPets[p]) allMyPets[p] = [];
					allMyPets[p].push(idx);
					if (!conflictDisplay[p]) conflictDisplay[p] = match.formation.myPet;
				}
			});
			
			// Znajdź konflikty (bohaterowie użyci więcej niż raz)
			const conflictHeroes = new Set();
			Object.entries(allMyHeroes).forEach(([hero, indices]) => {
				if (indices.length > 1) conflictHeroes.add(hero);
			});
			
			// Znajdź konflikty petów
			const conflictPets = new Set();
			Object.entries(allMyPets).forEach(([pet, indices]) => {
				if (indices.length > 1) conflictPets.add(pet);
			});
			
			// Oblicz statystyki globalne
			const totalScore = combo.formations.reduce((sum, m) => sum + (m.baseScore !== undefined ? m.baseScore : Math.floor(m.score)), 0);
			const maxPossibleScore = combo.formations.reduce((sum, m) => sum + m.maxScore, 0);
			const totalPercent = maxPossibleScore > 0 ? Math.round((totalScore / maxPossibleScore) * 100) : 0;
			const totalConflicts = combo.conflicts || 0;
			
			const percentClass = totalPercent >= 80 ? 'green' : totalPercent >= 50 ? 'orange' : 'red';
			const conflictBadgeClass = totalConflicts === 0 ? 'perfect' : totalConflicts <= 2 ? 'good' : 'bad';
			const conflictBadgeText = totalConflicts === 0 
				? `✓ ${t('war.noConflicts')}` 
				: `${totalConflicts} ${t('war.conflictsCount')}`;
			
			const summaryBox = `
				<!-- Podsumowanie kombinacji (na dole, dyskretne) -->
				<div class="war-preview-summary">
					<div class="war-preview-summary-header">
						<span class="war-preview-summary-title">📊 ${t('war.combinationSummary')}</span>
						<div class="war-preview-summary-badges">
							<span class="war-preview-total-badge ${conflictBadgeClass}">${conflictBadgeText}</span>
						</div>
					</div>
					<div class="war-preview-stats">
						<div class="war-preview-stat">
							<span class="war-preview-stat-value ${percentClass}">${totalPercent}%</span>
							<span class="war-preview-stat-label">${t('war.totalMatch')}</span>
						</div>
						<div class="war-preview-stat">
							<span class="war-preview-stat-value">${totalScore}/${maxPossibleScore}</span>
							<span class="war-preview-stat-label">${t('war.heroesMatched')}</span>
						</div>
						<div class="war-preview-stat">
							<span class="war-preview-stat-value ${totalConflicts === 0 ? 'green' : 'red'}">${totalConflicts}</span>
							<span class="war-preview-stat-label">${t('war.conflicts')}</span>
						</div>
					</div>
					<div class="war-preview-per-battle">
						${combo.formations.map((m, i) => `
							<span class="war-preview-battle-score">
								<strong>${t('war.battle')} ${i + 1}:</strong> ${m.baseScore !== undefined ? m.baseScore : Math.floor(m.score)}/${m.maxScore}
							</span>
						`).join('')}
					</div>
				</div>
				
			`;
			
			let html = '';

			// Karty porównania dla każdej walki
			combo.formations.forEach((match, idx) => {
				const f = match.formation;
				const searchedEnemy = combo.enemies[idx];
				
				// Analiza dopasowania
				const analysis = analyzeWarMatch(searchedEnemy, f);
				
				const displayScore = match.baseScore !== undefined ? match.baseScore : Math.floor(match.score);
				const scorePercent = match.maxScore > 0 ? Math.round((displayScore / match.maxScore) * 100) : 0;
				const scoreClass = scorePercent >= 80 ? 'high' : scorePercent >= 50 ? 'medium' : 'low';
				const cardClass = analysis.missing.length === 0 ? 'perfect-match' : 'has-missing';
				
				html += `
					<div class="war-compare-card ${cardClass}">
						<div class="war-compare-header">
							<div>
								<span class="war-compare-title">⚔️ ${t('war.battle')} ${idx + 1}</span>
								<span class="war-compare-id">#${f.id} ${f.isBase ? '👑' : ''}</span>
							</div>
							<span class="war-compare-score ${scoreClass}">${scorePercent}% ${t('war.match')}</span>
						</div>
						
						<div class="war-compare-body">
							<!-- STREFA: Wróg (szukany vs baza) -->
							<div class="war-enemy-zone">
									<div class="war-zone-label enemy">🎯 ${t('war.enemyZone')}</div>
									<div class="war-compare-grid">
								<div class="war-compare-side">
									<div class="war-compare-side-title searched">🔍 ${t('war.searchedEnemy')}</div>
									<div style="text-align:center">
										${renderWarPetComparison(searchedEnemy.petRaw, f.enemyPet, 'searched')}
									</div>
									<div class="compact-grid">
										${renderWarSearchedGrid(searchedEnemy.heroesRaw, analysis, f.enemy)}
									</div>
								</div>
								
								<div class="war-compare-vs">➜</div>
								
								<div class="war-compare-side">
									<div class="war-compare-side-title database">📚 ${t('war.databaseEnemy')}</div>
									<div style="text-align:center">
										${renderWarPetComparison(f.enemyPet, searchedEnemy.pet, 'database')}
									</div>
									<div class="compact-grid">
										${renderWarDatabaseGrid(f.enemy, analysis, searchedEnemy.heroesRaw)}
									</div>
								</div>
							</div>
							
							<!-- Separator - Twój skład -->
							</div><!-- /strefa: Wróg -->
								<div class="war-your-team-separator">
								<span class="war-your-team-badge">⚔️ ${t('war.yourTeam')} — ${t('war.counterLabel')}</span>
							</div>

							<!-- Twój skład z konfliktami - ładniejszy -->
							<div class="war-your-team-section">
								${renderWarMyTeamGrid(f.my, conflictHeroes)}
								<div style="text-align: center;">
									${renderWarMyTeamPet(f.myPet, conflictPets)}
								</div>
							</div>
							
							<!-- Mini legenda kolorów -->
							<div class="war-mini-legend">
								<span><i class="frame-miss"></i>${t('war.legendMissing')}</span>
								<span><i class="frame-extra"></i>${t('war.legendExtra')}</span>
								<span><i class="moved"></i>${t('war.legendMoved')}</span>
								<span><i class="c"></i>${t('war.legendConflict')}</span>
							</div>
							
							<!-- Komentarz -->
							${f.comment ? `
								<div class="war-comment-section">
									<div class="war-comment-label">💬 ${t('war.comment')}</div>
									<div class="war-comment-text">${escapeHtml(f.comment)}</div>
								</div>
							` : `
								<div class="war-comment-section">
									<div class="war-comment-empty">💬 ${t('war.noComment')}</div>
								</div>
							`}
							
							<!-- Przyciski akcji -->
							<div class="war-card-actions">
								<button class="btn btn-small btn-secondary" onclick="showFormation(${f.id})">
									👁️ ${t('war.fullPreview')}
								</button>
								<button class="btn btn-small btn-secondary" onclick="copyFormationTeam(${f.id})">
									📋 ${t('war.copyTeam')}
								</button>
								<button class="btn btn-small ${isFavorite(f.id) ? 'btn-favorite-active' : 'btn-secondary'}" onclick="toggleFavoriteFromWar(${f.id}, this)">
									${isFavorite(f.id) ? '⭐' : '☆'}
								</button>
							</div>
						</div>
					</div>
				`;
			});
			
			// Konflikty (renderowane na GÓRZE, nad walkami)
			let conflictsBox = '';
			const hasHeroConflicts = conflictHeroes.size > 0;
			const hasPetConflicts = conflictPets.size > 0;
			
			if (hasHeroConflicts || hasPetConflicts) {
				const conflictList = [];
				Object.entries(allMyHeroes).forEach(([hero, indices]) => {
					if (indices.length > 1) {
						conflictList.push({
							name: conflictDisplay[hero] || hero,
							battles: indices.map(i => i + 1),
							type: 'hero'
						});
					}
				});
				Object.entries(allMyPets).forEach(([pet, indices]) => {
					if (indices.length > 1) {
						conflictList.push({
							name: conflictDisplay[pet] || pet,
							battles: indices.map(i => i + 1),
							type: 'pet'
						});
					}
				});
				
				conflictsBox = `
					<div class="war-conflicts-box has-conflicts">
						<h3 class="war-conflicts-title bad">⚠️ ${t('war.conflictsTitle')}</h3>
						<div>
							${conflictList.map(c => `
								<span class="war-conflict-item">
									${c.type === 'pet' ? '🐾 ' : ''}${c.name} <span class="battles">(${t('war.battles')} ${c.battles.join(', ')})</span>
								</span>
							`).join('')}
						</div>
						<p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 10px;">
							${t('war.conflictsHint')}
						</p>
					</div>
				`;
			} else {
				conflictsBox = `
					<div class="war-conflicts-box no-conflicts">
						<h3 class="war-conflicts-title good">✅ ${t('war.noConflictsTitle')}</h3>
						<p style="font-size: 0.8rem; color: var(--text-muted);">
							${t('war.noConflictsDesc')}
						</p>
					</div>
				`;
			}
			
			// Kolejność: konflikty (góra) → walki → podsumowanie (dół)
			$('war-preview-content').innerHTML = conflictsBox + html + summaryBox;
		}

		// Analiza dopasowania między szukanym a bazą
		function analyzeWarMatch(searched, formation) {
			const searchedHeroes = searched.heroesRaw.filter(h => h); // Oryginalne nazwy
			const searchedHeroesNorm = searchedHeroes.map(normalize);
			const dbHeroes = formation.enemy.filter(h => h);
			const dbHeroesNorm = dbHeroes.map(normalize);
			
			const matched = [];
			const missing = [];
			const extra = [];
			
			// Znajdź trafione i brakujące
			searchedHeroes.forEach(sh => {
				const normSh = normalize(sh);
				const found = dbHeroesNorm.some(dh => dh === normSh || dh.startsWith(normSh) || normSh.startsWith(dh));
				if (found) {
					matched.push(sh); // Oryginalna nazwa
				} else {
					missing.push(sh);
				}
			});
			
			// Znajdź dodatkowe w bazie
			dbHeroes.forEach(dh => {
				const normDh = normalize(dh);
				const found = searchedHeroesNorm.some(sh => normDh === sh || normDh.startsWith(sh) || sh.startsWith(normDh));
				if (!found) {
					extra.push(dh); // Oryginalna nazwa z bazy
				}
			});
			
			// Pet
			const searchedPet = searched.petRaw || '';
			const dbPet = formation.enemyPet || '';
			const petMatched = searchedPet && dbPet && 
				(normalize(searchedPet) === normalize(dbPet) || 
				 normalize(searchedPet).startsWith(normalize(dbPet)) || 
				 normalize(dbPet).startsWith(normalize(searchedPet)));
			
			return {
				matched,
				missing,
				extra,
				searchedHeroesNorm,
				dbHeroesNorm,
				petMatched,
				searchedPet,
				dbPet
			};
		}

		// Renderuj siatkę szukanego wroga - z zachowaniem pozycji
		function renderWarSearchedGrid(heroesRaw, analysis, otherArr) {
			const slot = (idx) => {
				const name = heroesRaw[idx] || '';
				if (!name) return `<div class="compact-slot empty">—</div>`;
				
				const isMatched = analysis.matched.some(m => normalize(m) === normalize(name));
				const isMissing = analysis.missing.some(m => normalize(m) === normalize(name));
				
				const hero = findHero(name);
				const race = hero?.race?.toLowerCase() || '';
				
				let classes = 'compact-slot filled';
				if (race) classes += ` race-${race}`;
				const nm = normalize(name);
				const otherNm = (otherArr && otherArr[idx]) ? normalize(otherArr[idx]) : '';
				const samePos = otherNm && (otherNm === nm || otherNm.startsWith(nm) || nm.startsWith(otherNm));
				if (isMatched) classes += ' war-matched';
				if (isMatched && !samePos) classes += ' war-moved';
				if (isMissing) classes += ' war-missing';
				
				// Kapitalizuj nazwę (pierwsza duża)
				const displayName = hero ? hero.name : (name.charAt(0).toUpperCase() + name.slice(1).toLowerCase());

				return `<div class="${classes} slot-clickable" onclick="event.stopPropagation();showHeroSkills('${jsStr(hero ? hero.name : name)}')">${displayName}</div>`;
			};
			
			return `
				<div class="compact-row">${slot(5)}${slot(6)}${slot(7)}</div>
				<div class="compact-row">${slot(3)}${slot(4)}</div>
				<div class="compact-row">${slot(0)}${slot(1)}${slot(2)}</div>
			`;
		}

		// Renderuj siatkę wroga z bazy
		function renderWarDatabaseGrid(heroesArr, analysis, otherArr) {
			const slot = (idx) => {
				const name = heroesArr[idx] || '';
				if (!name) return `<div class="compact-slot empty">—</div>`;
				
				const normName = normalize(name);
				const isMatched = analysis.searchedHeroesNorm.some(sh => normName === sh || normName.startsWith(sh) || sh.startsWith(normName));
				const isExtra = analysis.extra.some(e => normalize(e) === normName);
				
				const hero = findHero(name);
				const race = hero?.race?.toLowerCase() || '';
				
				let classes = 'compact-slot filled';
				if (race) classes += ` race-${race}`;
				const otherNm = (otherArr && otherArr[idx]) ? normalize(otherArr[idx]) : '';
				const samePos = otherNm && (otherNm === normName || otherNm.startsWith(normName) || normName.startsWith(otherNm));
				if (isMatched) classes += ' war-matched';
				if (isMatched && !samePos) classes += ' war-moved';
				if (isExtra) classes += ' war-extra';

				return `<div class="${classes} slot-clickable" onclick="event.stopPropagation();showHeroSkills('${jsStr(name)}')">${name}</div>`;
			};
			
			return `
				<div class="compact-row">${slot(5)}${slot(6)}${slot(7)}</div>
				<div class="compact-row">${slot(3)}${slot(4)}</div>
				<div class="compact-row">${slot(0)}${slot(1)}${slot(2)}</div>
			`;
		}

		// Renderuj siatkę "Twój skład" - większa i z kolorami ras
		function renderWarMyTeamGrid(heroesArr, conflictSet) {
			const slot = (idx) => {
				const name = heroesArr[idx] || '';
				if (!name) return `<div class="war-your-team-slot empty">—</div>`;
				
				const normName = normalize(name);
				const isConflict = conflictSet.has(normName);
				
				const hero = findHero(name);
				const race = hero?.race?.toLowerCase() || '';
				
				let classes = 'war-your-team-slot filled';
				if (race) classes += ` race-${race}`;
				if (isConflict) classes += ' conflict';

				return `<div class="${classes} slot-clickable" onclick="event.stopPropagation();showHeroSkills('${jsStr(name)}')">${name}</div>`;
			};
			
			return `
				<div class="war-your-team-grid">
					<div class="war-your-team-row">${slot(0)}${slot(1)}${slot(2)}</div>
					<div class="war-your-team-row">${slot(3)}${slot(4)}</div>
					<div class="war-your-team-row">${slot(5)}${slot(6)}${slot(7)}</div>
				</div>
			`;
		}

		// Renderuj pet dla "Twój skład"
		function renderWarMyTeamPet(petName, conflictPets) {
			if (!petName) {
				return `<div class="war-your-team-pet empty">🐾 —</div>`;
			}
			const isConflict = conflictPets && conflictPets.has(normalize(petName));
			const conflictClass = isConflict ? ' conflict' : '';
			return `<div class="war-your-team-pet${conflictClass} slot-clickable" onclick="event.stopPropagation();showPetSkills('${jsStr(petName)}')">🐾 ${petName}</div>`;
		}

		// Renderuj porównanie petów - z oryginalnymi nazwami
		function renderWarPetComparison(petName, otherPet, side) {
			if (!petName) {
				return `<div class="compact-pet empty">🐾 —</div>`;
			}
			
			const normPet = normalize(petName);
			const normOther = normalize(otherPet || '');
			
			// Znajdź prawidłową nazwę peta
			const petData = pets.find(p => p.toLowerCase() === normPet);
			const displayName = petData || (petName.charAt(0).toUpperCase() + petName.slice(1).toLowerCase());
			
			let petClass = 'filled';
			const samePet = normOther && (normPet === normOther || normPet.startsWith(normOther) || normOther.startsWith(normPet));
			if (samePet) {
				petClass += ' war-matched';      // ten sam pet
			} else if (side === 'searched') {
				petClass += ' war-missing';       // pet u szukanego, inny/brak w bazie
			} else {
				petClass += ' war-extra';         // pet w bazie, inny/brak u szukanego
			}
			
			return `<div class="compact-pet ${petClass} slot-clickable" onclick="event.stopPropagation();showPetSkills('${jsStr(petData || petName)}')">🐾 ${displayName}</div>`;
		}

		// Kopiuj skład do schowka
		function copyFormationTeam(id) {
			const formation = allFormations.find(f => f.id === id);
			if (!formation) return;
			
			const myHeroes = formation.my.filter(h => h).join(', ');
			const pet = formation.myPet ? ` + ${formation.myPet}` : '';
			const text = `${myHeroes}${pet}`;
			
			navigator.clipboard.writeText(text).then(() => {
				showToast(t('clipboard.teamCopied'));
			}).catch(() => {
				showToast(t('clipboard.copyFailed'), true);
			});
		}

		// Toggle ulubione z podglądu wojny
		function toggleFavoriteFromWar(id, btn) {
			toggleFavorite(id, event);
			if (btn) {
				const isFav = isFavorite(id);
				btn.innerHTML = isFav ? '⭐' : '☆';
				btn.className = `btn btn-small ${isFav ? 'btn-favorite-active' : 'btn-secondary'}`;
			}
		}

        function exportWarPlanAsText() {
            const combo = window.currentWarCombo;
            if (!combo || !combo.formations) {
                showToast(t('war.selectPlanFirst'), true);
                return;
            }
            
            let text = '';
            
            combo.formations.forEach((match, idx) => {
                const f = match.formation;
                const myHeroes = f.my || [];
                const myPet = f.myPet || '';
                
                text += `Walka ${idx + 1}\n`;
                text += formatFormationAsText(myHeroes, myPet);
                text += '\n';
            });
            
            // Kopiuj do schowka
            navigator.clipboard.writeText(text.trim()).then(() => {
                showToast(t('clipboard.formationCopied'));
            }).catch(() => {
                const textarea = document.createElement('textarea');
                textarea.value = text.trim();
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                showToast(t('clipboard.formationCopied'));
            });
        }

        // Wspólna funkcja formatowania składu jako tekst
        function formatFormationAsText(heroes, pet) {
            const row1 = [heroes[0] || 'x', heroes[1] || 'x', heroes[2] || 'x'];
            const row2 = [heroes[3] || 'x', heroes[4] || 'x'];
            const row3 = [heroes[5] || 'x', heroes[6] || 'x', heroes[7] || 'x'];
            
            const maxLen = Math.max(
                ...row1.map(h => h.length),
                ...row2.map(h => h.length),
                ...row3.map(h => h.length),
                1
            );
            
            const pad = (str) => str.padEnd(maxLen, ' ');
            
            let text = '';
            text += `${pad(row1[0])}  ${pad(row1[1])}  ${row1[2]}\n`;
            text += `   ${pad(row2[0])}  ${row2[1]}\n`;
            text += `${pad(row3[0])}  ${pad(row3[1])}  ${row3[2]}\n`;
            
            if (pet) {
                text += `Pet: ${pet}\n`;
            }
            
            return text;
        }

        // ═══════════════════════════════════════════════════════════
        // TAB: KREATOR — ręczny builder 3 składów, zapisane
        // ═══════════════════════════════════════════════════════════

		function initKreatorExcluded() {
			renderKreatorExcludedChips();
			updateKreatorExcludedCount();
			
			// Obsługa inputa
			const input = $('kreator-excluded-input');
			if (input) {
				input.addEventListener('keydown', (e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						addKreatorExcludedHero(input.value.trim());
						input.value = '';
					}
				});
			}
		}

		function addKreatorExcludedHero(heroName) {
			if (!heroName) return;

			const finalName = findCanonicalHeroName(heroName);

			if (isHeroInList(kreatorExcludedHeroes, finalName)) {
				showToast(t('kreator.hide.alreadyHidden'), true);
				return;
			}

			kreatorExcludedHeroes.push(finalName);
			storage.setJson('souls_kreator_excluded_heroes', kreatorExcludedHeroes);
			renderKreatorExcludedChips();
			updateKreatorExcludedCount();
			generateKreatorTags();
			showToast(t('kreator.hide.hiddenFrom', { name: finalName }));
		}

		function removeKreatorExcludedHero(heroName) {
			const n = normalize(heroName);
			kreatorExcludedHeroes = kreatorExcludedHeroes.filter(h => normalize(h) !== n);
			storage.setJson('souls_kreator_excluded_heroes', kreatorExcludedHeroes);
			renderKreatorExcludedChips();
			updateKreatorExcludedCount();
			generateKreatorTags();
		}

		function clearKreatorExcludedHeroes() {
			if (!kreatorExcludedHeroes.length) return;
			if (!confirm(t('kreator.hide.confirmClear'))) return;
			kreatorExcludedHeroes = [];
			storage.setJson('souls_kreator_excluded_heroes', kreatorExcludedHeroes);
			renderKreatorExcludedChips();
			updateKreatorExcludedCount();
			generateKreatorTags();
			showToast(t('kreator.hide.cleared'));
		}

		function renderKreatorExcludedChips() {
			const container = $('kreator-excluded-chips');
			if (!container) return;
			
			if (!kreatorExcludedHeroes.length) {
				container.innerHTML = `<span id="kreator-excluded-empty" style="color: var(--text-muted); font-size: 0.75rem; font-style: italic; width: 100%; text-align: center;">${t('kreator.hide.empty')}</span>`;
				return;
			}

			container.innerHTML = kreatorExcludedHeroes.map(hero => `
				<span class="excluded-chip" style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; background: rgba(244, 67, 54, 0.2); border: 1px solid rgba(244, 67, 54, 0.4); border-radius: 12px; font-size: 0.75rem; color: #f44336;">
					${hero}
					<button onclick="removeKreatorExcludedHero('${hero.replace(/'/g, "\\'")}')" style="background: none; border: none; color: #f44336; cursor: pointer; font-size: 0.8rem; padding: 0 2px; opacity: 0.7;" title="${t('common.remove')}">✕</button>
				</span>
			`).join('');
		}

		function updateKreatorExcludedCount() {
			const countEl = $('kreator-excluded-count');
			if (countEl) countEl.textContent = `(${kreatorExcludedHeroes.length})`;
		}

        // ===== TAGI DLA KREATORA =====
        let activeKreatorField = null;

        function addToKreator(heroName, event) {
            // Ctrl+klik = ukryj bohatera
            if (event && event.ctrlKey) {
                addKreatorExcludedHero(heroName);
                return;
            }
            
            // Znajdź wszystkie pola w kreatorze (tylko widoczne składy)
            const allFields = [];
            for (let s = 1; s <= kreatorCount; s++) {
                for (let h = 1; h <= 8; h++) {
                    allFields.push(`kreator-${s}-h${h}`);
                }
            }
            
            // Sprawdź czy już jest - jeśli tak, usuń (toggle)
            for (const fieldId of allFields) {
                const input = $(fieldId);
                if (input && input.value.trim().toLowerCase() === heroName.toLowerCase()) {
                    input.value = '';
                    input.classList.remove('hero-race-dark', 'hero-race-light', 'hero-race-human', 
                        'hero-race-fire', 'hero-race-elf', 'hero-race-undead');
                    updateKreatorTagsSelection();
                    return;
                }
            }
            
            // Funkcja wpisująca do pola i przeskakująca dalej
            function fillFieldAndJump(fieldId) {
                const input = $(fieldId);
                if (!input) return false;
                input.value = heroName;
                updateInputHeroColor(input, false);
                updateKreatorTagsSelection();
                const nextField = getNextEmptyKreatorField(fieldId);
                if (nextField) {
                    setTimeout(() => {
                        $(nextField)?.focus();
                        activeKreatorField = nextField;
                    }, 10);
                }
                return true;
            }
            
            // Jeśli jest aktywne pole
            if (activeKreatorField) {
                const activeInput = $(activeKreatorField);
                // Jeśli aktywne pole jest puste - wpisz tam
                if (activeInput && !activeInput.value.trim()) {
                    fillFieldAndJump(activeKreatorField);
                    return;
                }
                // Jeśli aktywne pole jest zajęte - znajdź następne puste PO nim
                const nextEmpty = getNextEmptyKreatorField(activeKreatorField);
                if (nextEmpty) {
                    fillFieldAndJump(nextEmpty);
                    return;
                }
            }
            
            // Brak aktywnego pola lub wszystkie po nim zajęte - szukaj od początku
            for (const fieldId of allFields) {
                const input = $(fieldId);
                if (input && !input.value.trim()) {
                    fillFieldAndJump(fieldId);
                    return;
                }
            }
            showToast(t('search.allSlotsFull'), true);
        }

        function addPetToKreator(petName) {
            const petFields = [];
            for (let s = 1; s <= kreatorCount; s++) {
                petFields.push(`kreator-${s}-pet`);
            }
            
            // Toggle - jeśli już jest, usuń
            for (const fieldId of petFields) {
                const input = $(fieldId);
                if (input && input.value.trim().toLowerCase() === petName.toLowerCase()) {
                    input.value = '';
                    input.classList.remove('hero-race-pet');
                    updateKreatorTagsSelection();
                    return;
                }
            }
            
            // Dodaj do pierwszego wolnego pola pet
            for (const fieldId of petFields) {
                const input = $(fieldId);
                if (input && !input.value.trim()) {
                    input.value = petName;
                    input.classList.add('hero-race-pet');
                    updateKreatorTagsSelection();
                    return;
                }
            }
            showToast(t('kreator.petSlotsFull'), true);
        }

        function getNextEmptyKreatorField(currentFieldId) {
            const allFields = [];
            for (let s = 1; s <= kreatorCount; s++) {
                for (let h = 1; h <= 8; h++) {
                    allFields.push(`kreator-${s}-h${h}`);
                }
            }
            const currentIdx = allFields.indexOf(currentFieldId);
            for (let i = currentIdx + 1; i < allFields.length; i++) {
                const input = $(allFields[i]);
                if (input && !input.value.trim()) return allFields[i];
            }
            return null;
        }

        function updateKreatorTagsSelection() {
            const container = $('kreator-quick-tags-container');
            if (!container) return;
            
            // Zbierz wszystkie wartości z pól
            const values = new Set();
            for (let s = 1; s <= kreatorCount; s++) {
                for (let h = 1; h <= 8; h++) {
                    const val = $(`kreator-${s}-h${h}`)?.value.trim().toLowerCase();
                    if (val) values.add(val);
                }
                const pet = $(`kreator-${s}-pet`)?.value.trim().toLowerCase();
                if (pet) values.add(pet);
            }
            
            // Zaznacz tagi
            container.querySelectorAll('.quick-tag').forEach(tag => {
                const tagValue = tag.textContent.trim().toLowerCase();
                tag.classList.toggle('selected', values.has(tagValue));
            });
        }

		// =====================================================
		// KREATOR SKŁADÓW
		// =====================================================
		
		let kreatorCount = 3;
		let kreatorSaved = storage.getJson('souls_kreator_saved', []);

		function setKreatorCount(count) {
			kreatorCount = count;
			const grid = $('kreator-grid');
			
			// Aktualizuj przyciski
			for (let i = 1; i <= 3; i++) {
				const btn = $(`kreator-count-${i}`);
				if (btn) {
					btn.classList.remove('btn-success');
					if (i === count) btn.classList.add('btn-success');
				}
			}
			
			// Pokaż/ukryj sekcje
			$('kreator-section-1').style.display = 'block';
			$('kreator-section-2').style.display = count >= 2 ? 'block' : 'none';
			$('kreator-section-3').style.display = count >= 3 ? 'block' : 'none';
			
			// Zmień grid
			grid.classList.remove('count-1', 'count-2');
			if (count === 1) grid.classList.add('count-1');
			if (count === 2) grid.classList.add('count-2');
		}

		function getKreatorFormation(idx) {
			const heroes = [];
			for (let h = 1; h <= 8; h++) {
				heroes.push($(`kreator-${idx}-h${h}`)?.value.trim() || '');
			}
			const pet = $(`kreator-${idx}-pet`)?.value.trim() || '';
			return { heroes, pet };
		}

		function copyKreatorAsText() {
			let text = '';
			let hasContent = false;
			
			for (let i = 1; i <= kreatorCount; i++) {
				const formation = getKreatorFormation(i);
				const filledHeroes = formation.heroes.filter(h => h);
				
				if (filledHeroes.length > 0 || formation.pet) {
					hasContent = true;
					if (kreatorCount > 1) {
						text += `${t('kreator.formation')} ${i}\n`;
					}
					text += formatFormationAsText(formation.heroes, formation.pet);
					text += '\n';
				}
			}
			
			if (!hasContent) {
				showToast(t('add.addAtLeastOne'), true);
				return;
			}
			
			navigator.clipboard.writeText(text.trim()).then(() => {
				showToast(t('kreator.copied'));
			}).catch(() => {
				const textarea = document.createElement('textarea');
				textarea.value = text.trim();
				document.body.appendChild(textarea);
				textarea.select();
				document.execCommand('copy');
				document.body.removeChild(textarea);
				showToast(t('kreator.copied'));
			});
		}

		function saveKreatorToMemory() {
			const formations = [];
			let hasContent = false;
			
			for (let i = 1; i <= kreatorCount; i++) {
				const formation = getKreatorFormation(i);
				if (formation.heroes.some(h => h) || formation.pet) {
					hasContent = true;
				}
				formations.push(formation);
			}
			
			if (!hasContent) {
				showToast(t('add.addAtLeastOne'), true);
				return;
			}
			
			if (formations.some(f => f.heroes.filter(h => h).length > 5)) { showToast(t('add.tooManyHeroes'), true); return; }
			const defaultName = `${t('kreator.formation')} ${kreatorSaved.length + 1}`;
			const name = prompt(t('kreator.savePrompt'), defaultName);
			if (name === null) return;
			
			const saved = {
				id: Date.now(),
				name: name || defaultName,
				count: kreatorCount,
				formations: formations,
				timestamp: new Date().toISOString()
			};
			
			kreatorSaved.unshift(saved);
			if (kreatorSaved.length > 20) kreatorSaved = kreatorSaved.slice(0, 20);
			
			storage.setJson('souls_kreator_saved', kreatorSaved);
			renderKreatorSaved();
			showToast(t('kreator.saved'));
		}

		function loadKreatorSaved(id) {
			const saved = kreatorSaved.find(s => s.id === id);
			if (!saved) return;
			
			// Ustaw liczbę składów
			setKreatorCount(saved.count);
			
			// Wypełnij pola
			saved.formations.forEach((formation, idx) => {
				const formIdx = idx + 1;
				formation.heroes.forEach((hero, hIdx) => {
					const el = $(`kreator-${formIdx}-h${hIdx + 1}`);
					if (el) {
						el.value = hero;
						updateInputHeroColor(el, false);
					}
				});
				const petEl = $(`kreator-${formIdx}-pet`);
				if (petEl) {
					petEl.value = formation.pet || '';
					updateInputHeroColor(petEl, true);
				}
			});
			
			updateKreatorTagsSelection();
			showToast(`${t('kreator.loaded')}: ${saved.name}`);
		}

		function deleteKreatorSaved(id, event) {
			event.stopPropagation();
			if (!confirm(t('kreator.confirmDelete'))) return;
			
			kreatorSaved = kreatorSaved.filter(s => s.id !== id);
			storage.setJson('souls_kreator_saved', kreatorSaved);
			renderKreatorSaved();
			showToast(t('kreator.deleted'));
		}

		function clearAllKreatorSaved() {
			if (!kreatorSaved.length) return;
			if (!confirm(t('kreator.confirmDeleteAll'))) return;
			
			kreatorSaved = [];
			storage.setJson('souls_kreator_saved', kreatorSaved);
			renderKreatorSaved();
			showToast(t('kreator.allDeleted'));
		}

		function clearKreator() {
			for (let i = 1; i <= 3; i++) {
				for (let h = 1; h <= 8; h++) {
					const el = $(`kreator-${i}-h${h}`);
					if (el) {
						el.value = '';
						el.classList.remove('hero-race-dark', 'hero-race-light', 'hero-race-human', 
							'hero-race-fire', 'hero-race-elf', 'hero-race-undead');
					}
				}
				const petEl = $(`kreator-${i}-pet`);
				if (petEl) {
					petEl.value = '';
					petEl.classList.remove('hero-race-pet');
				}
			}
			updateKreatorTagsSelection();
			showToast(t('kreator.cleared'));
		}

		function renderKreatorSaved() {
			const section = $('kreator-saved-section');
			const list = $('kreator-saved-list');
			
			if (!kreatorSaved.length) {
				section.style.display = 'none';
				return;
			}
			
			section.style.display = 'block';
			list.innerHTML = kreatorSaved.map(saved => {
				const preview = saved.formations
					.map((f, idx) => {
						const heroes = f.heroes.filter(h => h);
						if (!heroes.length && !f.pet) return '';
						return `<div style="margin-top:4px;"><strong>${t('kreator.formation')} ${idx + 1}:</strong> ${escapeHtml(heroes.join(', ')) || '-'}${f.pet ? ` + ${escapeHtml(f.pet)}` : ''}</div>`;
					})
					.filter(p => p)
					.join('');
				
				return `
					<div class="kreator-saved-item" onclick="loadKreatorSaved(${saved.id})">
						<div class="kreator-saved-item-header">
							<span class="kreator-saved-item-name">${escapeHtml(saved.name)}</span>
							<div style="display:flex;align-items:center;gap:8px;">
								<span class="kreator-saved-item-date">${getTimeAgo(new Date(saved.timestamp))}</span>
								<button class="btn btn-small btn-secondary" onclick="deleteKreatorSaved(${saved.id}, event)" title="Usuń">🗑️</button>
							</div>
						</div>
						<div class="kreator-saved-item-content">${preview}</div>
					</div>
				`;
			}).join('');
		}

		function initKreator() {
			setKreatorCount(3); // Domyślnie 3 składy
			renderKreatorSaved();
			initKreatorFields();
			initKreatorExcluded();
		}

		function initKreatorFields() {
			// Dodaj listenery do wszystkich pól Kreatora
			for (let s = 1; s <= 3; s++) {
				for (let h = 1; h <= 8; h++) {
					const input = $(`kreator-${s}-h${h}`);
					if (input) {
						input.addEventListener('focus', () => { activeKreatorField = `kreator-${s}-h${h}`; });
						input.addEventListener('input', () => { 
							updateKreatorTagsSelection(); 
							updateInputHeroColor(input, false);
						});
						input.addEventListener('blur', () => { updateInputHeroColor(input, false); });
					}
				}
				const petInput = $(`kreator-${s}-pet`);
				if (petInput) {
					petInput.addEventListener('input', () => { 
						updateKreatorTagsSelection(); 
						updateInputHeroColor(petInput, true);
					});
					petInput.addEventListener('blur', () => { updateInputHeroColor(petInput, true); });
				}
			}
		}


        // ═══════════════════════════════════════════════════════════
        // TAB: HEROES — podgląd umiejętności bohaterów (read-only)
        // ═══════════════════════════════════════════════════════════
        // Dane skilli (/heroSkills) są lazy-load przy 1. wejściu (loadHeroSkills) —
        // świadomie NIE trzymamy stałego .on('value'), żeby nie obciążać startu apki.

        // ─── Pod-widok „Księga" (Book of Heroes/Light/Darkness) w zakładce Bohaterowie ───
        // Statyczne bonusy pasywne z gry, edytowalne przez admina (Firebase /bookBonuses, live przez .on).
        // Wyszukiwanie w duchu Bohaterów: spacja=ORAZ, |=ALBO, -=wyklucz, "fraza", pole:x (book/race/row/name/desc)
        // + rozwijanie synonimów (acc→accuracy itd.). Przy pustym /bookBonuses działa na DEFAULT_BOOK_BONUSES.
        let heroesMode = storage.getJson('souls_heroes_mode', 'heroes'); // 'heroes' | 'book'
        if (heroesMode !== 'book') heroesMode = 'heroes';
        let bookSearchQuery = '', bookFilterBooks = new Set(); // filtr ksiąg (pusty = wszystkie)
        let bookHelpOpen = storage.getBool('souls_book_help', false);

        // Domyślne 3 księgi (fallback). Nowe księgi / zmiany admin robi w UI → Firebase /bookMeta.
        const DEFAULT_BOOK_META = [
            { key: 'heroes',   label: 'Book of Heroes',   icon: '📕', color: '#d9a441', order: 0 },
            { key: 'light',    label: 'Book of Light',    icon: '📗', color: '#e5d9a8', order: 1 },
            { key: 'darkness', label: 'Book of Darkness', icon: '📘', color: '#8f7bd6', order: 2 },
        ];
        // Lista ksiąg = domyślne ⊕ nadpisania/nowe z /bookMeta ⊕ osierocone klucze obecne w bonusach. Sort po order.
        function getBooks() {
            const map = new Map();
            DEFAULT_BOOK_META.forEach(b => map.set(b.key, { ...b }));
            allBookMeta.forEach(b => { if (b && b.key) map.set(b.key, { ...(map.get(b.key) || {}), ...b }); });
            for (const bo of getBookBonuses()) {
                if (bo.book && !map.has(bo.book)) map.set(bo.book, { key: bo.book, label: bo.book, icon: '📖', color: 'var(--border)', order: 90 });
            }
            return Array.from(map.values()).sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.key).localeCompare(String(b.key)));
        }
        function bookMeta(key) { return getBooks().find(b => b.key === key) || { key, label: key || '', icon: '📖', color: 'var(--border)', order: 99 }; }
        function bookMetaRecord(key) { return allBookMeta.find(b => b.key === key) || null; } // rekord w /bookMeta (do edycji/usuwania; null = tylko domyślna)
        // Aliasy pól scope'owanych w szukajce Księgi (pole:term)
        const BOOK_FIELD_ALIAS = {
            book: 'book', ks: 'book', ksiega: 'book', 'księga': 'book',
            name: 'name', n: 'name', nazwa: 'name',
            desc: 'desc', d: 'desc', opis: 'desc', effect: 'desc', efekt: 'desc',
            race: 'race', rasa: 'race',
            row: 'row', rzad: 'row', 'rząd': 'row',
        };
        // Słowa ras/rzędów rozpoznawane w treści bonusu (do scope'a race:/row: i chipów).
        const BOOK_RACE_WORDS = ['human', 'horde', 'elf', 'undead', 'light', 'darkness', 'dark'];
        const BOOK_ROW_WORDS = ['first', 'second', 'third'];
        const BOOK_HELP = [
            ['Elf Undead',        'oba słowa muszą wystąpić (ORAZ)'],
            ['crit|dodge',        'którekolwiek (ALBO)'],
            ['atk -light',        'jest „atk", ale bez „light"'],
            ['"crit rate"',       'dokładna fraza'],
            ['book:light',        'tylko z Księgi Światła'],
            ['race:elf',          'bonusy dotyczące Elfów'],
            ['row:second',        'bonusy dla drugiego rzędu'],
        ];

        // 37 domyślnych bonusów (fallback + seed do bazy przyciskiem admina). order = globalny numer 1..37.
        const DEFAULT_BOOK_BONUSES = [
            { book: 'heroes', order: 1,  name: "Human's Resilience",        desc: "For each Human in the combat, the Physical Resistance of all allies increase by 2%." },
            { book: 'heroes', order: 2,  name: "Horde's Agility",           desc: "For each Horde in the combat, the Crit Rate of all allies increase by 2.5%." },
            { book: 'heroes', order: 3,  name: "Elf's Protection",          desc: "For each Elf in the combat, the Magic Resistance of all allies increase by 2.5%." },
            { book: 'heroes', order: 4,  name: "Undead's Curse",            desc: "For each Undead in the combat, the Lifesteal Rate of all allies increase by 2.5%." },
            { book: 'heroes', order: 5,  name: "Subterranean Shield",       desc: "Reduce total damage received from Cave Boss by 10%." },
            { book: 'heroes', order: 6,  name: "Relic Guardian",            desc: "Increase total Healing received at the Sanctum by 10%." },
            { book: 'heroes', order: 7,  name: "Undead's Frenzy",           desc: "Every time an enemy dies, ATK of Undead heroes increase by 3.5% (Stacks up to 4 times)" },
            { book: 'heroes', order: 8,  name: "Elf's Analytical Insight",  desc: "Every time an Elf hero uses Active Skill, their ATK increase by 2.5% (Stacks up to 4 times)" },
            { book: 'heroes', order: 9,  name: "Horde's Fury",              desc: "Every time an ally dies, ATK of Horde heroes increase by 3.5% (Stacks up to 4 times)" },
            { book: 'heroes', order: 10, name: "Human's Valor",             desc: "ATK of Human heroes increase by 1.5% every round (Stacks up to 8 times)" },
            { book: 'heroes', order: 11, name: "Human's Focus",             desc: "For each Human in the combat, the Accuracy of all allies increase by 3.5%." },
            { book: 'heroes', order: 12, name: "Horde's Agility",           desc: "For each Horde in the combat, the Dodge Rate of all allies increase by 2.5%." },
            { book: 'heroes', order: 13, name: "Elf's Wisdom",              desc: "For each Elf in the combat, the Magic Damage inflicted on enemies increase by 3%." },
            { book: 'heroes', order: 14, name: "Undead's Zeal",             desc: "For each Undead in the combat, the Physical Damage inflicted on enemies increase by 2.5%." },
            { book: 'heroes', order: 15, name: "Adventurer's Luck",         desc: "Increase total damage dealt to enemies at the Sanctum by 10%." },
            { book: 'heroes', order: 16, name: "Monster Hunter",            desc: "Increase total damage dealt to Cave Boss by 10%." },
            { book: 'heroes', order: 17, name: "Power of Defense",          desc: "At the start of battle, all heroes' DEF increases by 7%." },
            { book: 'heroes', order: 18, name: "Power of Destruction",      desc: "At the start of battle, all heroes' ATK increases by 7%." },
            { book: 'heroes', order: 19, name: "Life Force",                desc: "At the start of battle, increases all heroes' HP by 7%." },
            { book: 'light',  order: 20, name: "Blessing of Light",         desc: "For each Light in the combat, the critical defense of all allies increases by 5%." },
            { book: 'light',  order: 21, name: "Rear Guard",                desc: "If there is at least 1 ally on the first row, DEF of all allies on the second and third rows increase by 10%." },
            { book: 'light',  order: 22, name: "Light Power",               desc: "ATK of Light heroes increases by 14% at the beginning of combat, and decreases by 1% after each round." },
            { book: 'light',  order: 23, name: "Stealth",                   desc: "Dodge Rate of all heroes in the second row increase by 8%." },
            { book: 'light',  order: 24, name: "Light Protection",          desc: "For each Light in the combat, the DEF of all allies increase by 6%." },
            { book: 'light',  order: 25, name: "Fortification",             desc: "For all heroes in the third row, when HP is below 50%, damage received decreases by 10%." },
            { book: 'light',  order: 26, name: "Harmony of Light",          desc: "Light heroes obtain 10 energy at the beginning of each round." },
            { book: 'light',  order: 27, name: "Guardian",                  desc: "Reduces damage received by Light and Dark race heroes by 5%." },
            { book: 'light',  order: 28, name: "Guardian Angel",            desc: "Reduces all heroes' damage taken by 5%" },
            { book: 'darkness', order: 29, name: "Power of Darkness",       desc: "For each Darkness in the combat, the ATK of all allies increase by 3%." },
            { book: 'darkness', order: 30, name: "Charge",                  desc: "ATK of all heroes in the first row increase by 3% every 2 rounds." },
            { book: 'darkness', order: 31, name: "Darkness Abilities",      desc: "Every time an ally or an enemy dies, ATK of Darkness heroes increase by 2.5% (Stacks up to 8 times)" },
            { book: 'darkness', order: 32, name: "Precision Aim",           desc: "Accuracy of all heroes in the second row increase by 12%." },
            { book: 'darkness', order: 33, name: "Darkness Destruction",    desc: "For each Darkness hero in the combat, the Crit Damage of all allies increase by 5%." },
            { book: 'darkness', order: 34, name: "Rear Guard Enhancement",  desc: "Penetration of all heroes in the third row increase by 10%." },
            { book: 'darkness', order: 35, name: "Darkness Trickery",       desc: "Crit Rate of Darkness heroes increase by 5% at the start of battle." },
            { book: 'darkness', order: 36, name: "Obliteration",            desc: "At the start of battle, increases the ATK of Light and Dark heroes by 5%." },
            { book: 'darkness', order: 37, name: "Critical Strike",         desc: "At the start of battle, increases all heroes' Crit Damage by 10%." },
        ];

        let heroesFilterRaces = new Set(), heroesFilterRoles = new Set(), heroesFilterStats = new Set(), heroesSearchQuery = ''; // wielokrotny wybór (pusty zbiór = wszystkie)
        let heroesFilterExclusive = false; // filtr: pokaż tylko bohaterów z uzupełnionym Exclusive Equipment
        let heroCompareMode = false, heroCompareSel = []; // tryb porównywania: wybór 2–3 bohaterów
        let heroesFuzzy = storage.getBool('souls_heroes_fuzzy', false); // tolerancja literówek w wyszukiwarce (przełącznik)
        let heroesTile = storage.getJson('souls_heroes_tile', 'normal'); // rozmiar kafelków bohaterów/petów: small|normal|large
        if (!['small', 'normal', 'large'].includes(heroesTile)) heroesTile = 'normal';
        function setHeroesTile(v) { heroesTile = v; storage.setJson('souls_heroes_tile', v); applyHeroesTile(); }
        function applyHeroesTile() {
            ['small', 'normal', 'large'].forEach(s => $('heroes-tile-' + s)?.classList.toggle('active', heroesTile === s));
            const g = $('heroes-grid'); if (g) g.className = 'heroes-grid tiles-' + heroesTile;
        }
        const ENGRAVING_TIERS = ['10', '20', '30', '40']; // poziomy grawerunku (na razie wypełniony tylko +40)
        const EXCLUSIVE_TIERS = ['1', '2', '3', '4']; // poziomy ekwipunku ekskluzywnego (1lvl..4lvl)
        // Ikony klas/typów — emoji dobrane pod grę (Dealer=miecze, Tank=tarcza, Healer=serce, Support=iskra;
        // STR=mięsień, AGI=łuk jak w grze, INT=kula). Łatwa podmiana na grafiki gdyby pojawiło się dobre źródło.
        const ROLE_ICON = { Dealer: '🗡️', Tank: '🛡️', Healer: '➕', Support: '💠' };
        const STAT_ICON = { STR: '🔨', AGI: '🏹', INT: '🪄' };
        const roleLabel = r => `${ROLE_ICON[r] || ''} ${t('role.' + r)}`.trim();
        const statLabel = s => s ? `${STAT_ICON[s] || ''} ${escSkill(s)}`.trim() : '';
        // Znaczek „zweryfikowany" (jak niebieski ptaszek na social media) — gdy obj.verified === true.
        const verifiedBadge = obj => obj && obj.verified ? `<span class="verified-badge" title="${escSkill(t('heroes.verified'))}">✓</span>` : '';
        // Stan zwinięcia poziomów grawerunku w Podglądzie (per-poziom, zapamiętywany). Domyślnie tylko +40 rozwinięty.
        let engravingExpanded = Object.assign({ '10': false, '20': false, '30': false, '40': true }, storage.getJson('souls_engraving_expanded', {}));
        // Stan zwinięcia poziomów ekwipunku ekskluzywnego (per-poziom). Domyślnie tylko 4lvl rozwinięty.
        let exclusiveExpanded = Object.assign({ '1': false, '2': false, '3': false, '4': true }, storage.getJson('souls_exclusive_expanded', {}));
        // Normalizuje pole exclusive do mapy poziomów { '1':..,'4':.. }. Wstecznie zgodne ze starym kształtem
        // { name, desc } (żywe Firebase do czasu re-importu) — legacy `desc` traktujemy jak 4lvl (domyślnie otwarty).
        function exclusiveLevels(excl) {
            if (!excl) return {};
            if (excl.levels) return excl.levels;
            if (excl.desc) return { '4': excl.desc };
            return {};
        }

        // Escape HTML — skille to tekst z gry, zabezpieczamy wstrzyknięcie. \n zostają (CSS pre-line je renderuje).
        const escSkill = s => String(s == null ? '' : s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

        // Przykłady wyszukiwania po treści skilla (pokazywane gdy pole puste).
        const HEROES_SEARCH_EXAMPLES = ['Shock', 'Silence', 'Stun', 'Heal', 'Energy', 'Crit', 'Shield', 'Dodge', 'Bleed'];
        let heroesExamplesEditMode = false; // admin: tryb edycji przykładów szukajki (× usuń / klik = zmień nazwę)
        // Lista przykładów: z /config/settings (edytowalna przez admina) albo domyślna, gdy nigdy nie ustawiono.
        function heroExamples() { return appConfig.heroSearchExamples != null ? appConfig.heroSearchExamples : HEROES_SEARCH_EXAMPLES; }
        // ── Zaawansowane wyszukiwanie skilli: bloki + parser mini-języka zapytań + dopasowanie per-skill ──
        // Aliasy pól do scopingu (active:, passive: …) → kanoniczne pole bloku. Pusty scope = szukaj wszędzie.
        const HERO_FIELD_ALIAS = {
            active: 'active', aktywna: 'active', aktywne: 'active',
            passive: 'passive', passives: 'passive', pasywna: 'passive', pasywne: 'passive', pasywka: 'passive',
            awaken: 'awaken', przebudzenie: 'awaken',
            engraving: 'engraving', eng: 'engraving', grawerunek: 'engraving',
            exclusive: 'exclusive', excl: 'exclusive', ekwipunek: 'exclusive',
            energy: 'energy', energia: 'energy',
            name: 'name', nazwa: 'name', role: 'meta', rola: 'meta', stat: 'meta'
        };
        // Rozbij skille bohatera na bloki { field, text } — dopasowanie leci PER BLOK (słowa muszą trafić w JEDEN skill).
        function heroSkillBlocks(name, s) {
            const b = [];
            if (name) b.push({ field: 'name', text: String(name) });
            if (s) {
                if (s.active) b.push({ field: 'active', text: `${s.active.name || ''} ${s.active.desc || ''}` });
                (s.passives || []).forEach(x => b.push({ field: 'passive', text: `${x.name || ''} ${x.desc || ''}` }));
                if (s.awaken) b.push({ field: 'awaken', text: `${s.awaken.name || ''} ${s.awaken.desc || ''}` });
                if (s.engraving) Object.values(s.engraving).forEach(v => v && b.push({ field: 'engraving', text: String(v) }));
                if (s.exclusive) b.push({ field: 'exclusive', text: `${s.exclusive.name || ''} ${Object.values(exclusiveLevels(s.exclusive)).filter(Boolean).join(' ')}` });
                const meta = [s.role, s.stat].filter(Boolean).join(' ');
                if (meta) b.push({ field: 'meta', text: meta });
            }
            b.forEach(x => x.lc = x.text.toLowerCase());
            return b;
        }
        function petSkillBlocks(name, s) {
            const b = [];
            if (name) b.push({ field: 'name', text: String(name) });
            if (s) {
                if (s.active) b.push({ field: 'active', text: `${s.active.name || ''} ${s.active.desc || ''}` });
                if (s.passive) b.push({ field: 'passive', text: `${s.passive.name || ''} ${s.passive.desc || ''}` });
                if (s.energy) b.push({ field: 'energy', text: String(s.energy) });
            }
            b.forEach(x => x.lc = x.text.toLowerCase());
            return b;
        }
        // ── Słownik synonimów (dane w Firebase /synonyms, edytowalne przez admina w UI) ──
        // Każda grupa: { forms: [...] } — formy równoważne (wpisanie dowolnej szuka wszystkich, symetrycznie),
        //   opcjonalnie + expand: [...] — dodatkowe terminy szukane TYLKO gdy wpiszesz formę (asymetria:
        //   „cc" znajdzie stun/silence…, ale samo „stun" nie ciągnie reszty).
        // Krótkie skróty (≤3 znaki) dopasowują się CAŁYM SŁOWEM („cc" nie trafi w „accuracy"); dłuższe/pełne
        // formy podłańcuchem (łapią odmianę, np. „resistances").
        // DEFAULT_SYNONYMS = fallback gdy /synonyms w bazie puste (dopóki admin nie zapisze do bazy przyciskiem).
        const DEFAULT_SYNONYMS = [
            { forms: ['acc', 'accuracy'] },
            { forms: ['res', 'resistance'] },
            { forms: ['atk', 'attack'] },
            { forms: ['def', 'defense'] },
            { forms: ['spd', 'speed'] },
            { forms: ['dmg', 'damage'] },
            { forms: ['hot', 'heal over time'] },
            { forms: ['dot', 'damage over time'] },
            { forms: ['cc', 'crowd control'], expand: ['stun', 'silence', 'freeze', 'shock'] }
        ];
        // Efektywny słownik: dane z bazy jeśli są, inaczej domyślne (żeby szukajka działała od razu).
        function getSynonymGroups() { return allSynonyms.length ? allSynonyms : DEFAULT_SYNONYMS; }
        let SYNONYM_INDEX = new Map();
        function rebuildSynonymIndex() {
            const m = new Map();
            for (const g of getSynonymGroups()) {
                const forms = (g.forms || []).map(x => String(x).toLowerCase()).filter(Boolean);
                const all = forms.concat((g.expand || []).map(x => String(x).toLowerCase()).filter(Boolean));
                for (const f of forms) m.set(f, all); // tylko `forms` są kluczami (triggerami); `expand` — nie
            }
            SYNONYM_INDEX = m;
        }
        rebuildSynonymIndex();
        function findSynonymGroup(text) { return SYNONYM_INDEX.get(text) || null; }
        // Dopasowanie „całym słowem": trafienie musi mieć nie-alfanumeryczne granice (albo brzeg tekstu).
        function wordishHit(hay, needle) {
            let from = 0;
            while (true) {
                const i = hay.indexOf(needle, from);
                if (i < 0) return false;
                const before = i === 0 ? '' : hay[i - 1];
                const after = i + needle.length >= hay.length ? '' : hay[i + needle.length];
                if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return true;
                from = i + 1;
            }
        }
        // Scal sąsiadujące słowa w jeden token, gdy tworzą wielosłowową formę synonimu (np. „damage over time" → 1 token),
        // żeby wpisanie pełnej frazy trigerowało grupę TAK SAMO jak skrót (słownik działa w obie strony). Najdłuższe formy najpierw.
        function mergeSynonymPhrases(tokens) {
            const multi = [...SYNONYM_INDEX.keys()].filter(k => k.includes(' ')).map(f => ({ form: f, words: f.split(' ') })).sort((a, b) => b.words.length - a.words.length);
            if (!multi.length) return tokens;
            const out = [];
            let i = 0;
            while (i < tokens.length) {
                const tk = tokens[i];
                let matched = null;
                if (!tk.or && !tk.neg && !tk.field && !tk.quoted && tk.text && !tk.text.includes(' ')) {
                    for (const m of multi) {
                        if (i + m.words.length > tokens.length) continue;
                        let ok = true;
                        for (let j = 0; j < m.words.length; j++) {
                            const t2 = tokens[i + j];
                            if (t2.or || t2.neg || t2.field || t2.quoted || t2.text !== m.words[j]) { ok = false; break; }
                        }
                        if (ok) { matched = m; break; }
                    }
                }
                if (matched) { out.push({ neg: false, field: null, text: matched.form, quoted: false }); i += matched.words.length; }
                else { out.push(tk); i++; }
            }
            return out;
        }
        // Parser: "a b" = AND w jednym skillu, "fraza" = dokładna fraza (całe słowa), a|b = OR, -x = bez, pole:x = scope.
        function parseHeroQuery(raw) {
            const str = String(raw || ''), tokens = [];
            let i = 0;
            while (i < str.length) {
                const c = str[i];
                if (c === ' ' || c === '\t' || c === '\n') { i++; continue; }
                if (c === '|') { tokens.push({ or: true }); i++; continue; }
                let neg = false;
                if (str[i] === '-' && str[i + 1] && str[i + 1] !== ' ') { neg = true; i++; }
                let field = null;
                const fm = /^([a-zżźćńółęąś]+):/i.exec(str.slice(i));
                if (fm && HERO_FIELD_ALIAS[fm[1].toLowerCase()]) { field = HERO_FIELD_ALIAS[fm[1].toLowerCase()]; i += fm[0].length; }
                let text = '', quoted = false;
                if (str[i] === '"') { quoted = true; i++; while (i < str.length && str[i] !== '"') text += str[i++]; if (str[i] === '"') i++; }
                else { while (i < str.length && str[i] !== ' ' && str[i] !== '\t' && str[i] !== '|') text += str[i++]; }
                text = text.trim();
                if (text) tokens.push({ neg, field, text: text.toLowerCase(), quoted });
            }
            // token {or:true} dokleja następną klauzulę jako alternatywę poprzedniej (grupa OR)
            const clauses = [];
            let pendingOr = false;
            for (const tk of mergeSynonymPhrases(tokens)) {
                if (tk.or) { pendingOr = true; continue; }
                // boundary = całe słowo: dla cudzysłowu (dokładna fraza) ORAZ dla synonimów (skróty typu „cc").
                const alt = { field: tk.field, text: tk.text, boundary: tk.quoted };
                if (pendingOr && clauses.length) clauses[clauses.length - 1].alts.push(alt);
                else clauses.push({ neg: tk.neg, alts: [alt] });
                pendingOr = false;
            }
            // rozwiń synonimy: term należący do grupy → OR wszystkich form (dopasowanie całym słowem)
            for (const cl of clauses) {
                const out = [], seen = new Set();
                for (const a of cl.alts) {
                    const grp = a.text && findSynonymGroup(a.text);
                    // krótkie skróty (≤3 znaki) = całe słowo (żeby „cc" nie łapało „accuracy"); pełne formy podłańcuchem (łapią odmianę)
                    const list = grp ? grp.map(form => ({ field: a.field, text: form, boundary: a.boundary || (form.length <= 3 && !form.includes(' ')) })) : [a];
                    for (const x of list) { const k = x.field + ' ' + x.text; if (!seen.has(k)) { seen.add(k); out.push(x); } }
                }
                cl.alts = out;
            }
            const positives = clauses.filter(c => !c.neg), negatives = clauses.filter(c => c.neg);
            return {
                empty: clauses.length === 0,
                unscoped: positives.filter(c => c.alts.every(a => !a.field)), // współwystępują w jednym skillu
                scoped: positives.filter(c => c.alts.some(a => a.field)),     // każda w bloku swojego pola
                negatives,
                terms: positives.flatMap(c => c.alts.map(a => a.text)).filter(Boolean)
            };
        }
        // Odległość edycyjna z ograniczeniem (early-exit gdy przekroczy max) — do tolerancji literówek.
        function withinEdit(a, b, max) {
            const la = a.length, lb = b.length;
            if (Math.abs(la - lb) > max) return false;
            let prev = Array.from({ length: lb + 1 }, (_, i) => i);
            for (let i = 1; i <= la; i++) {
                const cur = [i];
                let best = i;
                for (let j = 1; j <= lb; j++) {
                    const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                    cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
                    if (cur[j] < best) best = cur[j];
                }
                if (best > max) return false; // cały wiersz > max → nie da się już zejść ≤ max
                prev = cur;
            }
            return prev[lb] <= max;
        }
        // Fuzzy: pojedyncze słowo (≥4 znaki) trafia jeśli któreś słowo bloku jest w odległości ≤1 od szukanej frazy.
        // Sprawdzamy też prefiks słowa (inflekcja: „increases" vs literówka „incrase" → prefiks „increase" ≤1).
        function fuzzyHit(term, blk) {
            if (term.includes(' ') || term.length < 4) return false; // frazy i krótkie słowa — bez fuzzy
            if (!blk.words) blk.words = blk.lc.split(/[^a-z0-9]+/).filter(w => w.length >= 3);
            const tl = term.length;
            return blk.words.some(w => {
                if (withinEdit(w, term, 1)) return true;
                if (w.length > tl) for (let L = tl - 1; L <= tl + 1; L++) if (L > 0 && L <= w.length && withinEdit(w.slice(0, L), term, 1)) return true;
                return false;
            });
        }
        // Czy pojedyncza alternatywa trafia w blok? boundary (cudzysłów/synonim) = całe słowo, bez fuzzy;
        // zwykły term = podłańcuch, z opcjonalną tolerancją literówek (heroesFuzzy).
        function altHitsBlock(a, blk) {
            if (!a.text || (a.field && a.field !== blk.field)) return false;
            if (a.boundary) return wordishHit(blk.lc, a.text);
            return blk.lc.includes(a.text) || (heroesFuzzy && fuzzyHit(a.text, blk));
        }
        // Czy klauzula (grupa OR) trafia w dany blok? (respektuje scope pola i tolerancję literówek)
        function clauseHitsBlock(clause, blk) {
            return clause.alts.some(a => altHitsBlock(a, blk));
        }
        // Dopasowanie bohatera/peta. Zwraca { ok, block } — block = skill do podpowiedzi/podświetlenia.
        function matchBlocks(blocks, parsed) {
            for (const c of parsed.negatives) if (blocks.some(b => clauseHitsBlock(c, b))) return { ok: false, block: null };
            let best = null;
            if (parsed.unscoped.length) {
                best = blocks.find(b => parsed.unscoped.every(c => clauseHitsBlock(c, b))); // wszystkie w JEDNYM skillu
                if (!best) return { ok: false, block: null };
            }
            for (const c of parsed.scoped) {
                const hit = blocks.find(b => clauseHitsBlock(c, b));
                if (!hit) return { ok: false, block: null };
                if (!best) best = hit;
            }
            return { ok: true, block: best };
        }
        // Fragment treści wokół pierwszego trafienia któregokolwiek słowa (podpowiedź na kafelku).
        function matchSnippet(text, terms) {
            const lc = text.toLowerCase();
            let idx = -1, len = 0;
            for (const term of terms) { const j = lc.indexOf(term); if (j >= 0 && (idx < 0 || j < idx)) { idx = j; len = term.length; } }
            if (idx < 0) return '';
            const start = Math.max(0, idx - 18), end = Math.min(text.length, idx + len + 34);
            return (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
        }
        // Podświetl trafione słowa (escape'uje HTML; matchujemy na surowym tekście, więc encje nie kolidują).
        const HL_OPEN = String.fromCharCode(1), HL_CLOSE = String.fromCharCode(2);
        function highlightHTML(text, terms) {
            const uniq = Array.from(new Set((terms || []).filter(Boolean))).sort((a, b) => b.length - a.length);
            let marked = String(text == null ? '' : text);
            for (const term of uniq) {
                const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                marked = marked.replace(re, m => HL_OPEN + m + HL_CLOSE);
            }
            return escSkill(marked).split(HL_OPEN).join('<mark class="hero-hl">').split(HL_CLOSE).join('</mark>');
        }

        // Lookup skilli bohatera po nazwie (case-insensitive). Zwraca obiekt lub null.
        function getHeroSkills(name) {
            if (!name) return null;
            if (allHeroSkills[name]) return allHeroSkills[name];
            const n = normalize(name);
            const key = Object.keys(allHeroSkills).find(k => normalize(k) === n);
            return key ? allHeroSkills[key] : null;
        }

        // Lookup skilli peta po nazwie (case-insensitive). Zwraca obiekt lub null.
        function getPetSkills(name) {
            if (!name) return null;
            if (allPetSkills[name]) return allPetSkills[name];
            const n = normalize(name);
            const key = Object.keys(allPetSkills).find(k => normalize(k) === n);
            return key ? allPetSkills[key] : null;
        }

        // Lazy-load /heroSkills i /petSkills (raz; potem cache). force = wymuszenie (np. po imporcie).
        async function loadHeroSkills(force) {
            if (heroSkillsLoaded && !force) return;
            if (!heroSkillsRef) return;
            try {
                const snap = await heroSkillsRef.once('value');
                allHeroSkills = snap.val() || {};
                heroSkillsLoaded = true;
            } catch (e) {
                console.error('heroSkills load error:', e);
                allHeroSkills = {};
            }
        }
        async function loadPetSkills(force) {
            if (petSkillsLoaded && !force) return;
            if (!petSkillsRef) return;
            try {
                const snap = await petSkillsRef.once('value');
                allPetSkills = snap.val() || {};
                petSkillsLoaded = true;
            } catch (e) {
                console.error('petSkills load error:', e);
                allPetSkills = {};
            }
        }

        // Wejście na zakładkę: dociągnij dane (raz) i wyrenderuj listę (bohaterowie + pety).
        async function renderHeroesTab() {
            if (!heroSkillsLoaded || !petSkillsLoaded) {
                const grid = $('heroes-grid');
                if (grid) grid.innerHTML = `<div class="heroes-empty">${t('heroes.loading')}</div>`;
                await Promise.all([loadHeroSkills(), loadPetSkills()]);
            }
            $('heroes-fuzzy-toggle')?.classList.toggle('active', heroesFuzzy);
            renderHeroesFilters();
            renderSearchExamples();
            renderHeroesHelp();
            renderHeroesSynonyms();
            renderHeroesGrid();
            applyHeroesTile();
        }

        // ═══ Pod-widok „Księga" ═══════════════════════════════════
        // Przełącznik trybu Bohaterowie ↔ Księga (stan w localStorage).
        function setHeroesMode(mode) {
            heroesMode = (mode === 'book') ? 'book' : 'heroes';
            storage.setJson('souls_heroes_mode', heroesMode);
            applyHeroesMode();
        }
        function applyHeroesMode() {
            const isBook = heroesMode === 'book';
            const hWrap = $('heroes-mode-heroes'), bWrap = $('heroes-mode-book');
            if (hWrap) hWrap.style.display = isBook ? 'none' : '';
            if (bWrap) bWrap.style.display = isBook ? '' : 'none';
            $('heroes-mode-btn-heroes')?.classList.toggle('active', !isBook);
            $('heroes-mode-btn-book')?.classList.toggle('active', isBook);
            if (isBook) renderBookTab(); else renderHeroesTab();
        }

        // Lista bonusów: z bazy jeśli są, inaczej domyślne (syntetyczne id 'def-N', nieedytowalne do seedu).
        function getBookBonuses() {
            if (allBookBonuses.length) return allBookBonuses;
            return DEFAULT_BOOK_BONUSES.map(b => ({ ...b, id: 'def-' + b.order }));
        }
        const bookFromDb = () => allBookBonuses.length > 0;

        // Tokenizer zapytania Księgi (mirror parseHeroQuery: |=OR, -=neg, "fraza", pole:term z BOOK_FIELD_ALIAS,
        // rozwijanie synonimów). Zwraca płaskie klauzule — dopasowanie w bookMatches (AND w obrębie CAŁEGO bonusu).
        function parseBookQuery(raw) {
            const str = String(raw || ''), tokens = [];
            let i = 0;
            while (i < str.length) {
                const c = str[i];
                if (c === ' ' || c === '\t' || c === '\n') { i++; continue; }
                if (c === '|') { tokens.push({ or: true }); i++; continue; }
                let neg = false;
                if (str[i] === '-' && str[i + 1] && str[i + 1] !== ' ') { neg = true; i++; }
                let field = null;
                const fm = /^([a-zżźćńółęąś]+):/i.exec(str.slice(i));
                if (fm && BOOK_FIELD_ALIAS[fm[1].toLowerCase()]) { field = BOOK_FIELD_ALIAS[fm[1].toLowerCase()]; i += fm[0].length; }
                let text = '', quoted = false;
                if (str[i] === '"') { quoted = true; i++; while (i < str.length && str[i] !== '"') text += str[i++]; if (str[i] === '"') i++; }
                else { while (i < str.length && str[i] !== ' ' && str[i] !== '\t' && str[i] !== '|') text += str[i++]; }
                text = text.trim();
                if (text) tokens.push({ neg, field, text: text.toLowerCase(), quoted });
            }
            const clauses = [];
            let pendingOr = false;
            for (const tk of mergeSynonymPhrases(tokens)) {
                if (tk.or) { pendingOr = true; continue; }
                const alt = { field: tk.field, text: tk.text, boundary: tk.quoted };
                if (pendingOr && clauses.length) clauses[clauses.length - 1].alts.push(alt);
                else clauses.push({ neg: tk.neg, alts: [alt] });
                pendingOr = false;
            }
            for (const cl of clauses) {
                const out = [], seen = new Set();
                for (const a of cl.alts) {
                    const grp = a.text && findSynonymGroup(a.text);
                    const list = grp ? grp.map(form => ({ field: a.field, text: form, boundary: a.boundary || (form.length <= 3 && !form.includes(' ')) })) : [a];
                    for (const x of list) { const k = x.field + ' ' + x.text; if (!seen.has(k)) { seen.add(k); out.push(x); } }
                }
                cl.alts = out;
            }
            const positives = clauses.filter(c => !c.neg), negatives = clauses.filter(c => c.neg);
            return { empty: clauses.length === 0, positives, negatives, terms: positives.flatMap(c => c.alts.map(a => a.text)).filter(Boolean) };
        }
        // Tekst pól bonusu (name/desc/book + wykryte rasy/rzędy). Cache w _bf (świeży obiekt przy każdym snapshocie).
        function bookFields(b) {
            if (b._bf) return b._bf;
            const name = (b.name || '').toLowerCase();
            const desc = (b.desc || '').toLowerCase();
            const bookTxt = (b.book + ' ' + bookMeta(b.book).label).toLowerCase();
            const race = BOOK_RACE_WORDS.filter(w => desc.includes(w)).join(' ');
            const row = BOOK_ROW_WORDS.filter(w => desc.includes(w + ' row')).join(' ');
            return (b._bf = { name, desc, book: bookTxt, race, row, combined: name + ' ' + desc + ' ' + bookTxt });
        }
        function bookAltHits(a, f) {
            if (!a.text) return false;
            const target = a.field ? (f[a.field] || '') : f.combined;
            return a.boundary ? wordishHit(target, a.text) : target.includes(a.text);
        }
        // Bonus pasuje: każda pozytywna klauzula (OR-grupa) trafia gdzieś w bonusie, żadna negatywna nie trafia.
        function bookMatches(b, parsed) {
            const f = bookFields(b);
            for (const c of parsed.negatives) if (c.alts.some(a => bookAltHits(a, f))) return false;
            for (const c of parsed.positives) if (!c.alts.some(a => bookAltHits(a, f))) return false;
            return true;
        }

        function renderBookTab() { renderBookHelp(); renderHeroesSynonyms(); renderBookFilters(); renderBookGrid(); }
        function setBookSearch(v) { bookSearchQuery = v; renderBookGrid(); }
        function setBookExample(q) { bookSearchQuery = q; const inp = $('book-search'); if (inp) inp.value = q; renderBookGrid(); }
        function toggleBookFilter(key) { bookFilterBooks.has(key) ? bookFilterBooks.delete(key) : bookFilterBooks.add(key); renderBookFilters(); renderBookGrid(); }
        function clearBookFilters() { bookFilterBooks.clear(); renderBookFilters(); renderBookGrid(); }
        function toggleBookHelp() { bookHelpOpen = !bookHelpOpen; storage.setBool('souls_book_help', bookHelpOpen); $('book-help-toggle')?.classList.toggle('active', bookHelpOpen); renderBookHelp(); }

        function renderBookHelp() {
            const el = $('book-search-help');
            if (!el) return;
            $('book-help-toggle')?.classList.toggle('active', bookHelpOpen);
            if (!bookHelpOpen) { el.innerHTML = ''; return; }
            const rows = BOOK_HELP.map(([q, d]) =>
                `<div style="display:flex;gap:8px;align-items:baseline;padding:2px 0;">`
                + `<code onclick="setBookExample('${jsStr(q)}')" style="cursor:pointer;background:var(--bg-input);border:1px solid var(--border);border-radius:5px;padding:1px 6px;color:var(--accent-gold);white-space:nowrap;">${escapeHtml(q)}</code>`
                + `<span style="color:var(--text-muted);font-size:0.78rem;">${escapeHtml(d)}</span></div>`).join('');
            el.innerHTML = `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:8px 10px;margin-bottom:8px;">${rows}</div>`;
        }

        function renderBookFilters() {
            const wrap = $('book-filter-chips');
            if (!wrap) return;
            const counts = {};
            getBookBonuses().forEach(b => { counts[b.book] = (counts[b.book] || 0) + 1; });
            // chipy tylko dla ksiąg z ≥1 bonusem (pusta nowa księga pojawi się dopiero gdy dostanie bonus)
            let html = getBooks().filter(m => counts[m.key]).map(m => `<button class="heroes-chip book-chip${bookFilterBooks.has(m.key) ? ' active' : ''}" onclick="toggleBookFilter('${jsStr(m.key)}')">${m.icon} ${escapeHtml(m.label)} (${counts[m.key]})</button>`).join('');
            if (bookFilterBooks.size) html += `<button class="heroes-chip heroes-chip-clear" onclick="clearBookFilters()">✕ ${t('heroes.clearFilters')}</button>`;
            if (isAdmin) {
                html += `<button class="heroes-chip book-admin-chip" onclick="openBookEdit(null)">➕ ${t('book.addBonus')}</button>`;
                html += `<button class="heroes-chip book-admin-chip" onclick="openBookMetaModal()">📚 ${t('book.manageBooks')}</button>`;
                if (!bookFromDb()) html += `<button class="heroes-chip book-admin-chip" onclick="seedDefaultBookBonuses()">💾 ${t('book.seedDefaults')}</button>`;
            }
            wrap.innerHTML = html;
        }

        function bookCardHTML(b, parsed) {
            const terms = parsed.empty ? [] : parsed.terms;
            const nameHtml = terms.length ? highlightHTML(b.name, terms) : escSkill(b.name);
            const descHtml = terms.length ? highlightHTML(b.desc, terms) : escSkill(b.desc);
            const admin = (isAdmin && bookFromDb())
                ? `<div class="book-card-actions"><button class="book-card-btn" onclick="openBookEdit('${jsStr(b.id)}')" title="${t('book.editBtn')}">✏️</button><button class="book-card-btn" onclick="deleteBookBonus('${jsStr(b.id)}')" title="${t('book.deleteBtn')}">🗑️</button></div>`
                : '';
            return `<div class="book-card" style="border-left-color:${bookMeta(b.book).color}">`
                + `<div class="book-card-top"><span class="book-card-name">${nameHtml}</span>${admin}</div>`
                + `<div class="book-card-desc">${descHtml}</div></div>`;
        }

        function renderBookGrid() {
            const grid = $('book-grid');
            if (!grid) return;
            const parsed = parseBookQuery(bookSearchQuery);
            let list = getBookBonuses();
            if (bookFilterBooks.size) list = list.filter(b => bookFilterBooks.has(b.book));
            if (!parsed.empty) list = list.filter(b => bookMatches(b, parsed));
            const cnt = $('book-count');
            if (cnt) cnt.textContent = t('book.count', { n: list.length });
            const groups = {};
            list.forEach(b => { (groups[b.book] = groups[b.book] || []).push(b); });
            const section = (label, count, cards) => `<div class="quick-tags-section"><div class="quick-tags-header expanded" onclick="toggleBookSection(this)">`
                + `<span class="toggle-icon">▶</span>${label} (${count})</div>`
                + `<div class="quick-tags-content show"><div class="book-cards">${cards}</div></div></div>`;
            const html = getBooks().filter(m => groups[m.key]).map(m =>
                section(`${m.icon} ${escapeHtml(m.label)}`, groups[m.key].length,
                    groups[m.key].sort((a, b) => a.order - b.order).map(b => bookCardHTML(b, parsed)).join(''))).join('');
            if (!html) { grid.innerHTML = `<div class="heroes-empty">${t('book.none')}</div>`; return; }
            grid.innerHTML = `<button class="expand-all-btn" onclick="toggleAllBookGroups(this)">▲ ${t('heroes.collapseAll')}</button>` + html;
            requestAnimationFrame(equalizeBookCards);
        }
        // Wyrównaj wysokość WSZYSTKICH kafelków Księgi do najwyższego (widocznego) — CSS grid równa tylko w obrębie
        // jednej siatki/wiersza, a księgi to osobne sekcje. Mierzymy po layoutcie, resetujemy przed pomiarem.
        function equalizeBookCards() {
            const grid = $('book-grid');
            if (!grid) return;
            const cards = Array.from(grid.querySelectorAll('.book-card'));
            cards.forEach(c => { c.style.minHeight = ''; });
            let max = 0;
            for (const c of cards) if (c.offsetParent !== null && c.offsetHeight > max) max = c.offsetHeight; // tylko widoczne (rozwinięte sekcje)
            if (max > 0) cards.forEach(c => { c.style.minHeight = max + 'px'; });
        }
        // Zwijanie sekcji/„zwiń wszystkie" w Księdze — jak w Bohaterach, ale z przeliczeniem wyrównania po zmianie widoczności.
        function toggleBookSection(header) { toggleQuickTagSection(header); requestAnimationFrame(equalizeBookCards); }
        function toggleAllBookGroups(btn) { toggleAllHeroGroups(btn); requestAnimationFrame(equalizeBookCards); }
        // Przelicz wyrównanie przy zmianie szerokości okna (zmienia się liczba kolumn → wysokość kafelków).
        let _bookEqTimer = null;
        window.addEventListener('resize', () => {
            if (heroesMode !== 'book' || !$('tab-heroes')?.classList.contains('active')) return;
            clearTimeout(_bookEqTimer);
            _bookEqTimer = setTimeout(equalizeBookCards, 150);
        });

        // ─── Księga: edycja admina (Firebase /bookBonuses) ───
        function openBookEdit(id) {
            if (!isAdmin) return;
            editingBookId = id;
            const b = id ? getBookBonuses().find(x => x.id === id) : null;
            $('book-edit-title').textContent = b ? t('book.editTitle') : t('book.addTitle');
            const sel = $('be-book');
            sel.innerHTML = getBooks().map(m => `<option value="${escapeHtml(m.key)}">${m.icon} ${escapeHtml(m.label)}</option>`).join('');
            sel.value = b ? b.book : (getBooks()[0]?.key || 'heroes');
            $('be-name').value = b ? b.name : '';
            $('be-desc').value = b ? b.desc : '';
            $('book-edit-modal').classList.add('show');
            setTimeout(() => autoSizeTextarea($('be-desc')), 0);
        }
        function closeBookEdit() { $('book-edit-modal')?.classList.remove('show'); editingBookId = null; }
        // Kolejny „order" w danej księdze (auto-append; order to tylko wewnętrzny klucz sortowania, nie pokazujemy go).
        function nextBookOrder(book) {
            const orders = getBookBonuses().filter(b => b.book === book).map(b => b.order || 0);
            return (orders.length ? Math.max(...orders) : 0) + 1;
        }
        function saveBookEdit() {
            if (!isAdmin || !bookBonusesRef) return;
            const name = $('be-name').value.trim();
            if (!name) { showToast(t('book.needName'), true); return; }
            const book = $('be-book').value || 'heroes';
            const desc = $('be-desc').value.trim();
            let p;
            if (editingBookId && !String(editingBookId).startsWith('def-')) {
                const cur = getBookBonuses().find(x => x.id === editingBookId);
                // edycja: zachowaj order; zmiana księgi → dołóż na koniec nowej
                const order = (cur && cur.book === book) ? (cur.order || 0) : nextBookOrder(book);
                p = bookBonusesRef.child(editingBookId).update({ book, name, desc, order });
            } else {
                const ref = bookBonusesRef.push();
                p = ref.set({ id: ref.key, book, name, desc, order: nextBookOrder(book) });
            }
            p.then(() => { closeBookEdit(); showToast(t('book.saved')); }).catch(() => showToast(t('book.saveFail'), true));
        }
        function deleteBookBonus(id) {
            if (!isAdmin || !bookBonusesRef || String(id).startsWith('def-')) return;
            if (!confirm(t('book.deleteConfirm'))) return;
            bookBonusesRef.child(id).remove().catch(() => showToast(t('book.saveFail'), true));
        }
        // Zapisz domyślne 37 bonusów do bazy (żeby stały się edytowalne) — analogicznie do seedDefaultSynonyms.
        function seedDefaultBookBonuses() {
            if (!isAdmin || !bookBonusesRef || bookFromDb()) return;
            const updates = {};
            for (const b of DEFAULT_BOOK_BONUSES) {
                const key = bookBonusesRef.push().key;
                updates[key] = { ...b, id: key };
            }
            bookBonusesRef.update(updates).then(() => showToast(t('book.seeded'))).catch(() => showToast(t('book.saveFail'), true));
        }

        // ─── Księga: zarządzanie księgami (Firebase /bookMeta) ───
        function openBookMetaModal() { if (!isAdmin) return; resetBookMetaForm(); renderBookMetaList(); $('book-meta-modal').classList.add('show'); }
        function closeBookMetaModal() { $('book-meta-modal')?.classList.remove('show'); editingBookMetaKey = null; }
        function resetBookMetaForm() {
            editingBookMetaKey = null;
            const k = $('bm-key'); if (k) { k.value = ''; k.disabled = false; }
            if ($('bm-icon')) $('bm-icon').value = '📖';
            if ($('bm-label')) $('bm-label').value = '';
            if ($('bm-color')) $('bm-color').value = '#d9a441';
        }
        function renderBookMetaList() {
            const el = $('book-meta-list'); if (!el) return;
            const counts = {};
            getBookBonuses().forEach(b => { counts[b.book] = (counts[b.book] || 0) + 1; });
            el.innerHTML = getBooks().map(m => {
                const n = counts[m.key] || 0;
                const isDefault = DEFAULT_BOOK_META.some(d => d.key === m.key);
                const delAttr = n ? `disabled title="${t('book.metaHasBonuses')}"` : (bookMetaRecord(m.key) ? '' : `disabled title="${t('book.metaDefaultOnly')}"`);
                return `<div class="book-meta-row">
                    <span class="book-meta-swatch" style="background:${m.color}"></span>
                    <span class="book-meta-info">${m.icon} <b>${escapeHtml(m.label)}</b> <span style="color:var(--text-muted)">(${escapeHtml(m.key)} · ${n} ${t('book.bonusesShort')}${isDefault ? ' · ' + t('book.defaultTag') : ''})</span></span>
                    <span class="book-meta-acts">
                        <button class="book-card-btn" onclick="editBookMetaRow('${jsStr(m.key)}')" title="${t('book.editBtn')}">✏️</button>
                        <button class="book-card-btn" onclick="deleteBookMeta('${jsStr(m.key)}')" ${delAttr}>🗑️</button>
                    </span></div>`;
            }).join('');
        }
        function editBookMetaRow(key) {
            const m = bookMeta(key); if (!m) return;
            editingBookMetaKey = key;
            const k = $('bm-key'); if (k) { k.value = m.key; k.disabled = true; }
            $('bm-icon').value = m.icon || '📖';
            $('bm-label').value = m.label || '';
            $('bm-color').value = /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : '#d9a441';
        }
        function saveBookMeta() {
            if (!isAdmin || !bookMetaRef) return;
            const key = editingBookMetaKey || normalize($('bm-key').value).replace(/[^a-z0-9]+/g, '');
            if (!key) { showToast(t('book.metaNeedKey'), true); return; }
            const label = $('bm-label').value.trim();
            if (!label) { showToast(t('book.metaNeedLabel'), true); return; }
            // order: przy edycji zachowaj istniejący; nowa księga → na koniec listy
            const existingMeta = getBooks().find(b => b.key === key);
            const order = editingBookMetaKey && existingMeta ? (existingMeta.order || 0) : ((Math.max(0, ...getBooks().map(b => b.order || 0))) + 1);
            const rec = { key, label, icon: ($('bm-icon').value.trim() || '📖'), color: $('bm-color').value || '#d9a441', order };
            const existing = bookMetaRecord(key);
            let p;
            if (existing) { p = bookMetaRef.child(existing.id).update(rec); }
            else { const ref = bookMetaRef.push(); p = ref.set({ ...rec, id: ref.key }); }
            p.then(() => { showToast(t('book.metaSaved')); resetBookMetaForm(); }).catch(() => showToast(t('book.saveFail'), true));
        }
        function deleteBookMeta(key) {
            if (!isAdmin || !bookMetaRef) return;
            if (getBookBonuses().some(b => b.book === key)) { showToast(t('book.metaHasBonuses'), true); return; }
            const existing = bookMetaRecord(key);
            if (!existing) { showToast(t('book.metaDefaultOnly'), true); return; } // domyślna bez rekordu — nic do usunięcia
            if (!confirm(t('book.metaDeleteConfirm'))) return;
            bookMetaRef.child(existing.id).remove().catch(() => showToast(t('book.saveFail'), true));
        }

        // Chipy filtrów: rasy (z /heroes, kolejność RACE_ORDER) + klasy (z /heroSkills) — wielokrotny wybór.
        // Rebuild za każdym razem (tanie, łapie zmianę języka i stan zaznaczeń).
        function renderHeroesFilters() {
            const raceWrap = $('heroes-race-chips'), roleWrap = $('heroes-role-chips');
            if (raceWrap) {
                const races = RACE_ORDER.filter(r => heroes.some(h => h.race === r));
                raceWrap.innerHTML = races.map(r => `<button class="heroes-chip race-${r.toLowerCase()}${heroesFilterRaces.has(r) ? ' active' : ''}" onclick="toggleHeroesRace('${r}')">${RACE_EMOJI[r] || ''} ${escSkill(raceLabel(r))}</button>`).join('');
            }
            if (roleWrap) {
                const roles = ['Tank', 'Dealer', 'Support', 'Healer'].filter(role => Object.values(allHeroSkills).some(s => s && s.role === role));
                roleWrap.innerHTML = roles.map(r => `<button class="heroes-chip role-chip${heroesFilterRoles.has(r) ? ' active' : ''}" onclick="toggleHeroesRole('${r}')">${roleLabel(r)}</button>`).join('');
            }
            const statWrap = $('heroes-stat-chips');
            if (statWrap) {
                const stats = ['STR', 'AGI', 'INT'].filter(st => Object.values(allHeroSkills).some(s => s && s.stat === st));
                statWrap.innerHTML = stats.map(st => `<button class="heroes-chip stat-chip${heroesFilterStats.has(st) ? ' active' : ''}" onclick="toggleHeroesStat('${st}')">${statLabel(st)}</button>`).join('');
            }
            const exclWrap = $('heroes-exclusive-chips');
            if (exclWrap) {
                const clear = (heroesFilterRaces.size || heroesFilterRoles.size || heroesFilterStats.size || heroesFilterExclusive)
                    ? `<button class="heroes-chip heroes-chip-clear" onclick="clearHeroesFilters()">✕ ${t('heroes.clearFilters')}</button>` : '';
                exclWrap.innerHTML = `<button class="heroes-chip excl-chip${heroesFilterExclusive ? ' active' : ''}" onclick="toggleHeroesExclusive()">${t('skills.exclusive')}</button>` + clear;
            }
        }

        function toggleHeroesRace(r) { heroesFilterRaces.has(r) ? heroesFilterRaces.delete(r) : heroesFilterRaces.add(r); renderHeroesFilters(); renderHeroesGrid(); }
        function toggleHeroesRole(r) { heroesFilterRoles.has(r) ? heroesFilterRoles.delete(r) : heroesFilterRoles.add(r); renderHeroesFilters(); renderHeroesGrid(); }
        function toggleHeroesStat(st) { heroesFilterStats.has(st) ? heroesFilterStats.delete(st) : heroesFilterStats.add(st); renderHeroesFilters(); renderHeroesGrid(); }
        function toggleHeroesExclusive() { heroesFilterExclusive = !heroesFilterExclusive; renderHeroesFilters(); renderHeroesGrid(); }
        function clearHeroesFilters() { heroesFilterRaces.clear(); heroesFilterRoles.clear(); heroesFilterStats.clear(); heroesFilterExclusive = false; renderHeroesFilters(); renderHeroesGrid(); }
        function setHeroesSearch(v) { heroesSearchQuery = v; renderSearchExamples(); renderHeroesGrid(); }
        function setHeroesSearchExample(term) {
            const inp = $('heroes-search'); if (inp) inp.value = term;
            heroesSearchQuery = term; renderSearchExamples(); renderHeroesGrid();
        }
        // Wiersz pod szukajką: gdy pole puste → przykłady (klik wypełnia); gdy coś wpisane → przycisk „wyczyść".
        function renderSearchExamples() {
            const el = $('heroes-search-examples');
            if (!el) return;
            if (heroesSearchQuery) {
                el.style.display = 'flex';
                el.innerHTML = `<button class="heroes-chip heroes-chip-clear" onclick="clearHeroesSearch()">✕ ${t('heroes.clearSearch')}</button>`;
                return;
            }
            const examples = heroExamples();
            if (!examples.length && !isAdmin) { el.style.display = 'none'; return; } // brak przykładów i nie admin → chowamy
            el.style.display = 'flex';
            const edit = isAdmin && heroesExamplesEditMode;
            let html = `<span class="hse-ex-label">🔎 ${t('heroes.searchExamples')}</span>`;
            html += examples.map((x, i) => edit
                ? `<span class="hse-ex-chip hse-ex-editing"><span class="hse-ex-text" onclick="renameHeroExample(${i})" title="${t('heroes.exampleRename')}">${escapeHtml(x)}</span><button class="hse-ex-del" onclick="deleteHeroExample(${i})" title="${t('heroes.exampleDelete')}">×</button></span>`
                : `<button class="hse-ex-chip" onclick="setHeroesSearchExample('${jsStr(x)}')">${escapeHtml(x)}</button>`
            ).join('');
            if (isAdmin) {
                html += `<button class="hse-ex-chip hse-ex-add" onclick="addHeroExample()" title="${t('heroes.exampleAdd')}">+</button>`;
                html += `<button class="hse-ex-chip hse-ex-toggle${heroesExamplesEditMode ? ' active' : ''}" onclick="toggleHeroesExamplesEdit()" title="${t('heroes.exampleEditMode')}">${heroesExamplesEditMode ? '✓' : '✏️'}</button>`;
            }
            el.innerHTML = html;
        }
        function toggleHeroesExamplesEdit() { heroesExamplesEditMode = !heroesExamplesEditMode; renderSearchExamples(); }
        async function saveHeroExamples(arr) {
            if (!isAdmin || !configRef) return;
            if (!isOnline) { showToast(t('common.noConnection'), true); return; }
            try { await configRef.child('heroSearchExamples').set(arr); } // /config/settings ma reguły write — bez nowej reguły Firebase
            catch (e) { showToast(t('common.error') + ': ' + e.message, true); }
        }
        async function addHeroExample() {
            if (!isAdmin) return;
            const v = (prompt(t('heroes.exampleAddPrompt')) || '').trim();
            if (!v) return;
            const list = [...heroExamples()];
            if (list.some(x => x.toLowerCase() === v.toLowerCase())) { showToast('⚠️ ' + t('heroes.exampleExists'), true); return; }
            list.push(v);
            await saveHeroExamples(list);
        }
        async function renameHeroExample(i) {
            if (!isAdmin) return;
            const list = [...heroExamples()];
            if (i < 0 || i >= list.length) return;
            const v = (prompt(t('heroes.exampleRenamePrompt'), list[i]) || '').trim();
            if (!v || v === list[i]) return;
            if (list.some((x, j) => j !== i && x.toLowerCase() === v.toLowerCase())) { showToast('⚠️ ' + t('heroes.exampleExists'), true); return; }
            list[i] = v;
            await saveHeroExamples(list);
        }
        async function deleteHeroExample(i) {
            if (!isAdmin) return;
            const list = [...heroExamples()];
            if (i < 0 || i >= list.length) return;
            list.splice(i, 1);
            await saveHeroExamples(list);
        }
        function clearHeroesSearch() {
            const inp = $('heroes-search'); if (inp) inp.value = '';
            heroesSearchQuery = ''; renderSearchExamples(); renderHeroesGrid();
        }
        // Rozwijana legenda składni zaawansowanego wyszukiwania (przykłady klikalne wypełniają pole).
        const HEROES_HELP = [
            { ex: 'crit increase', key: 'heroes.helpAnd' },
            { ex: '"crit rate"', key: 'heroes.helpPhrase' },
            { ex: 'stun|silence', key: 'heroes.helpOr' },
            { ex: 'crit -heal', key: 'heroes.helpNot' },
            { ex: 'active:stun', key: 'heroes.helpField' }
        ];
        function renderHeroesHelp() {
            const el = $('heroes-search-help');
            if (!el) return;
            const open = storage.getBool('souls_heroes_help_open', false);
            const rows = HEROES_HELP.map(h => {
                const on = jsStr(h.ex).replace(/"/g, '&quot;');
                return `<div class="hero-help-row"><button class="hero-help-ex" onclick="setHeroesSearchExample('${on}')">${escSkill(h.ex)}</button>`
                    + `<span class="hero-help-desc">${escSkill(t(h.key))}</span></div>`;
            }).join('');
            el.innerHTML = `<div class="hero-help-body${open ? ' open' : ''}"><div class="hero-help-title">${escSkill(t('heroes.helpTitle'))}</div>`
                + rows + `<div class="hero-help-note">${escSkill(t('heroes.helpFields'))}</div></div>`;
            $('heroes-help-toggle')?.classList.toggle('active', open);
        }
        function toggleHeroesHelp() {
            storage.setBool('souls_heroes_help_open', !storage.getBool('souls_heroes_help_open', false));
            renderHeroesHelp();
        }
        // Kafelek „Słownik synonimów" obok szukajki — lista grup (klik = szuka). Admin edytuje wiersze (dane w /synonyms).
        // Panel „Słownik synonimów" — świadomy trybu: renderuje do aktywnego widoku (Bohaterowie LUB Księga),
        // czyści drugi. Ten sam słownik /synonyms i te same funkcje CRUD; tylko klik-termin szuka w odpowiednim polu.
        // Jeden panel na raz → inputy edycji (syn-forms/expand-input) nie dublują ID.
        function renderHeroesSynonyms() {
            const book = heroesMode === 'book';
            const el = $(book ? 'book-synonyms' : 'heroes-synonyms');
            const other = $(book ? 'heroes-synonyms' : 'book-synonyms');
            if (other) other.innerHTML = '';
            if (!el) return;
            const onTerm = book ? 'setBookExample' : 'setHeroesSearchExample';
            const open = storage.getBool('souls_heroes_syn_open', false);
            const groups = getSynonymGroups();
            const dbEmpty = allSynonyms.length === 0;
            const rows = groups.map(g => {
                const on = jsStr((g.forms && g.forms[0]) || '').replace(/"/g, '&quot;');
                const label = (g.forms || []).join('  =  ') + (g.expand && g.expand.length ? '  →  ' + g.expand.join(', ') : '');
                const acts = (isAdmin && g.id)
                    ? `<span class="hero-syn-actions"><button class="hero-syn-act" onclick="editSynonymRow('${jsStr(g.id)}')" title="${escSkill(t('skills.edit'))}">✏️</button>`
                        + `<button class="hero-syn-act" onclick="deleteSynonymRow('${jsStr(g.id)}')" title="${escSkill(t('syn.delete'))}">🗑️</button></span>`
                    : '';
                return `<div class="hero-syn-row"><button class="hero-syn-term" onclick="${onTerm}('${on}')">${escSkill(label)}</button>${acts}</div>`;
            }).join('') || `<div class="hero-help-note">—</div>`;
            let adminUI = '';
            if (isAdmin && dbEmpty) {
                adminUI = `<div class="hero-syn-admin"><div class="hero-help-note">${escSkill(t('syn.fallbackNote'))}</div>`
                    + `<button class="btn btn-small" onclick="seedDefaultSynonyms()">📥 ${escSkill(t('syn.seed'))}</button></div>`;
            } else if (isAdmin) {
                const editing = editingSynId != null;
                adminUI = `<div class="hero-syn-admin">`
                    + `<input id="syn-forms-input" class="hse-input" placeholder="${escSkill(t('syn.formsPh'))}">`
                    + `<input id="syn-expand-input" class="hse-input" placeholder="${escSkill(t('syn.expandPh'))}">`
                    + `<div class="hero-syn-admin-btns"><button class="btn btn-small" onclick="saveSynonymRow()">${editing ? escSkill(t('syn.update')) : '➕ ' + escSkill(t('syn.add'))}</button>`
                    + (editing ? `<button class="btn btn-small btn-secondary" onclick="cancelSynonymEdit()">${escSkill(t('syn.cancel'))}</button>` : '')
                    + `</div><div class="hero-help-note">${escSkill(t('syn.formatNote'))}</div></div>`;
            }
            el.innerHTML = `<button class="hero-syn-chip${open ? ' active' : ''}" onclick="toggleHeroesSynonyms()">📖 ${escSkill(t('heroes.synTitle'))} (${groups.length})</button>`
                + `<div class="hero-syn-body${open ? ' open' : ''}">${rows}${adminUI}<div class="hero-help-note">${escSkill(t('heroes.synNote'))}</div></div>`;
            // przywróć wartości do inputów w trybie edycji (innerHTML je zeruje)
            if (isAdmin && editingSynId != null) {
                const g = allSynonyms.find(x => x.id === editingSynId);
                if (g) { const fi = $('syn-forms-input'), ei = $('syn-expand-input'); if (fi) fi.value = (g.forms || []).join(', '); if (ei) ei.value = (g.expand || []).join(', '); }
            }
        }
        function toggleHeroesSynonyms() {
            storage.setBool('souls_heroes_syn_open', !storage.getBool('souls_heroes_syn_open', false));
            renderHeroesSynonyms();
        }
        // ── CRUD słownika synonimów (admin; dane w Firebase /synonyms) ──
        function parseSynInput(v) { return String(v || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean); }
        function saveSynonymRow() {
            if (!isAdmin || !synonymsRef) return;
            const forms = parseSynInput($('syn-forms-input')?.value);
            const expand = parseSynInput($('syn-expand-input')?.value);
            if (!forms.length) { showToast(t('syn.needForms')); return; }
            const rec = { forms };
            if (expand.length) rec.expand = expand;
            const p = editingSynId ? synonymsRef.child(editingSynId).set(rec) : synonymsRef.push(rec);
            editingSynId = null;
            Promise.resolve(p).then(() => showToast(t('syn.saved'))).catch(() => showToast(t('syn.writeFail')));
        }
        function editSynonymRow(id) { editingSynId = id; renderHeroesSynonyms(); }
        function cancelSynonymEdit() { editingSynId = null; renderHeroesSynonyms(); }
        function deleteSynonymRow(id) {
            if (!isAdmin || !synonymsRef) return;
            if (!confirm(t('syn.confirmDel'))) return;
            if (editingSynId === id) editingSynId = null;
            synonymsRef.child(id).remove().catch(() => showToast(t('syn.writeFail')));
        }
        // Zapisz domyślny słownik (DEFAULT_SYNONYMS) do bazy, żeby stał się edytowalny.
        function seedDefaultSynonyms() {
            if (!isAdmin || !synonymsRef) return;
            if (!confirm(t('syn.confirmSeed'))) return;
            const updates = {};
            for (const g of DEFAULT_SYNONYMS) {
                const key = synonymsRef.push().key;
                updates[key] = g.expand ? { forms: g.forms, expand: g.expand } : { forms: g.forms };
            }
            synonymsRef.update(updates).then(() => showToast(t('syn.seeded'))).catch(() => showToast(t('syn.writeFail')));
        }

        // Siatka kafelków pogrupowana po rasie + sekcja Pety na dole — sekcje ZWIJANE (mechanika jak w Tagach,
        // ale własny przycisk/etykiety bez słowa „tagi"). Kolejność ras = RACE_ORDER (jak w Tagach).
        function renderHeroesGrid() {
            const grid = $('heroes-grid');
            if (!grid) return;
            grid.className = 'heroes-grid tiles-' + heroesTile; // rozmiar kafelków (S/M/L)
            const parsed = parseHeroQuery(heroesSearchQuery);
            let list = heroes.slice();
            if (heroesFilterRaces.size) list = list.filter(h => heroesFilterRaces.has(h.race));
            if (heroesFilterRoles.size) list = list.filter(h => { const s = getHeroSkills(h.name); return s && heroesFilterRoles.has(s.role); });
            if (heroesFilterStats.size) list = list.filter(h => { const s = getHeroSkills(h.name); return s && heroesFilterStats.has(s.stat); });
            if (heroesFilterExclusive) list = list.filter(h => { const s = getHeroSkills(h.name); return s && s.exclusive && Object.values(exclusiveLevels(s.exclusive)).some(Boolean); });
            if (!parsed.empty) list = list.filter(h => matchBlocks(heroSkillBlocks(h.name, getHeroSkills(h.name)), parsed).ok);
            const cnt = $('heroes-count');
            if (cnt) cnt.textContent = t('heroes.count', { n: list.length });
            const groups = {};
            list.forEach(h => { (groups[h.race] = groups[h.race] || []).push(h); });
            const order = RACE_ORDER.filter(r => groups[r]).concat(Object.keys(groups).filter(r => !RACE_ORDER.includes(r)));
            const section = (label, count, tiles) => `<div class="quick-tags-section"><div class="quick-tags-header expanded" onclick="toggleQuickTagSection(this)">`
                + `<span class="toggle-icon">▶</span>${label} (${count})</div>`
                + `<div class="quick-tags-content show"><div class="heroes-race-tiles">${tiles}</div></div></div>`;
            let html = order.map(race => section(`${RACE_EMOJI[race] || '🧙'} ${escSkill(raceLabel(race))}`, groups[race].length,
                groups[race].sort((a, b) => a.name.localeCompare(b.name)).map(h => heroTileHTML(h, parsed)).join(''))).join('');
            // sekcja Pety — gdy brak filtra rasy/roli/exclusive (pety ich nie mają); szukajka działa po nazwie I treści skilla
            if (!heroesFilterRaces.size && !heroesFilterRoles.size && !heroesFilterStats.size && !heroesFilterExclusive) {
                let petList = Array.from(new Set([...pets, ...Object.keys(allPetSkills)]));
                if (!parsed.empty) petList = petList.filter(p => matchBlocks(petSkillBlocks(p, getPetSkills(p)), parsed).ok);
                petList.sort((a, b) => a.localeCompare(b));
                if (petList.length) html += section(`🐾 ${t('quickTags.pets')}`, petList.length, petList.map(p => petTileHTML(p, parsed)).join(''));
            }
            // Pasek porównania (tryb compare) — zawsze widoczny gdy tryb włączony
            let compareBar = '';
            if (heroCompareMode) {
                const chips = heroCompareSel.length
                    ? heroCompareSel.map(n => `<span class="hcb-chip" onclick="onHeroTileClick('${jsStr(n)}')">${escSkill(n)} ✕</span>`).join('')
                    : `<span class="hcb-hint">${t('heroes.compareHint')}</span>`;
                compareBar = `<div class="heroes-compare-bar"><span class="hcb-label">⚖️ ${heroCompareSel.length}/3</span>${chips}`
                    + `<button class="btn btn-small" ${heroCompareSel.length < 2 ? 'disabled' : ''} onclick="showHeroCompare()">${t('heroes.compareBtn')}</button>`
                    + (heroCompareSel.length ? `<button class="btn btn-small btn-secondary" onclick="clearHeroCompare()">${t('heroes.clearFilters')}</button>` : '') + `</div>`;
            }
            if (!html) { grid.innerHTML = compareBar + `<div class="heroes-empty">${t('heroes.none')}</div>`; return; }
            // przycisk zwiń/rozwiń wszystko WEWNĄTRZ kontenera; domyślnie rozwinięte → „Zwiń wszystkie"
            grid.innerHTML = compareBar + `<button class="expand-all-btn" onclick="toggleAllHeroGroups(this)">▲ ${t('heroes.collapseAll')}</button>` + html;
        }

        // Zwiń/rozwiń wszystkie grupy w zakładce Bohaterowie (własne etykiety, bez słowa „tagi").
        function toggleAllHeroGroups(btn) {
            const grid = btn.closest('.heroes-grid');
            const sections = grid.querySelectorAll('.quick-tags-section');
            const allExpanded = grid.querySelectorAll('.quick-tags-header.expanded').length === sections.length;
            sections.forEach(s => {
                s.querySelector('.quick-tags-header').classList.toggle('expanded', !allExpanded);
                s.querySelector('.quick-tags-content').classList.toggle('show', !allExpanded);
            });
            btn.textContent = allExpanded ? `▼ ${t('heroes.expandAll')}` : `▲ ${t('heroes.collapseAll')}`;
        }

        // Snippet trafienia w treści skilla (gdy trafienie jest w skillu, nie w nazwie) — podpowiedź na kafelku
        // z podświetlonymi słowami. `blocks` = bloki bohatera/peta, `parsed` = sparsowane zapytanie.
        function tileMatchHTML(parsed, blocks) {
            if (parsed.empty) return '';
            const { ok, block } = matchBlocks(blocks, parsed);
            if (!ok || !block || block.field === 'name') return ''; // trafienie tylko w nazwie → bez snippetu
            // przy trafieniu fuzzy nie ma dokładnego indeksu słowa → pokaż początek skilla jako kontekst
            const snip = matchSnippet(block.text, parsed.terms) || (block.text.length > 60 ? block.text.slice(0, 60).trim() + '…' : block.text);
            return snip ? `<span class="hero-tile-match">${highlightHTML(snip, parsed.terms)}</span>` : '';
        }

        function petTileHTML(name, parsed) {
            const s = getPetSkills(name);
            const sub = s ? `<span class="hero-tile-role">${t('petTab.pet')}</span>` : `<span class="hero-tile-nodata">${t('heroes.noData')}</span>`;
            return `<button class="hero-tile race-pet${s ? '' : ' no-data'}" onclick="onPetTileClick('${jsStr(name)}')">`
                + `<span class="hero-tile-emoji">🐾</span><span class="hero-tile-name">${escSkill(name)}${verifiedBadge(s)}</span>${sub}${tileMatchHTML(parsed, petSkillBlocks(name, s))}</button>`;
        }

        function heroTileHTML(h, parsed) {
            const s = getHeroSkills(h.name);
            const rc = `race-${String(h.race || '').toLowerCase()}`;
            const sel = heroCompareMode && heroCompareSel.includes(h.name) ? ' selected' : '';
            const sub = s && s.role
                ? `<span class="hero-tile-role">${roleLabel(s.role)}${s.stat ? ' · ' + statLabel(s.stat) : ''}</span>`
                : `<span class="hero-tile-nodata">${t('heroes.noData')}</span>`;
            return `<button class="hero-tile ${rc}${s ? '' : ' no-data'}${sel}" onclick="onHeroTileClick('${jsStr(h.name)}')">`
                + `<span class="hero-tile-emoji">${RACE_EMOJI[h.race] || '🧙'}</span>`
                + `<span class="hero-tile-name">${escSkill(h.name)}${verifiedBadge(s)}</span>${sub}${tileMatchHTML(parsed, heroSkillBlocks(h.name, s))}</button>`;
        }

        // Aktualne słowa do podświetlenia w modalu (z pola szukajki) — puste gdy zapytanie puste.
        function heroesHlTerms() { return parseHeroQuery(heroesSearchQuery).terms; }
        function onPetTileClick(name) { showPetSkills(name, heroesHlTerms()); }

        // Klik w kafelek: w trybie porównania zaznacza (max 3), inaczej otwiera skille.
        function onHeroTileClick(name) {
            if (!heroCompareMode) { showHeroSkills(name, heroesHlTerms()); return; }
            const i = heroCompareSel.indexOf(name);
            if (i >= 0) heroCompareSel.splice(i, 1);
            else { if (heroCompareSel.length >= 3) { showToast(t('heroes.compareMax')); return; } heroCompareSel.push(name); }
            renderHeroesGrid();
        }
        function toggleHeroCompareMode() {
            heroCompareMode = !heroCompareMode;
            if (!heroCompareMode) heroCompareSel = [];
            $('heroes-compare-toggle')?.classList.toggle('active', heroCompareMode);
            renderHeroesGrid();
        }
        function clearHeroCompare() { heroCompareSel = []; renderHeroesGrid(); }
        // Przełącznik tolerancji literówek (persystowany) — po zmianie przerysuj wyniki.
        function toggleHeroesFuzzy() {
            heroesFuzzy = !heroesFuzzy;
            storage.setBool('souls_heroes_fuzzy', heroesFuzzy);
            $('heroes-fuzzy-toggle')?.classList.toggle('active', heroesFuzzy);
            renderHeroesGrid();
        }

        // Modal porównania — reużywa szerokiego #hero-skills-modal; kolumny obok siebie (1 bohater = 1 kolumna).
        function showHeroCompare() {
            if (heroCompareSel.length < 2) { showToast(t('heroes.compareMin')); return; }
            const modal = $('hero-skills-modal');
            if (!modal) return;
            $('hero-skills-title').innerHTML = `<div class="hsk-titletext"><span class="hsk-name">⚖️ ${t('heroes.compareTitle')} (${heroCompareSel.length})</span></div>`;
            $('hero-skills-body').innerHTML = `<div class="compare-cols">${heroCompareSel.map(heroSkillColumnHTML).join('')}</div>`;
            modal.classList.add('show');
        }
        // Pojedyncza kolumna bohatera (nagłówek + sekcje skilli pionowo) — używane w porównywarce.
        function heroSkillColumnHTML(name) {
            const hero = findHero(name), s = getHeroSkills(name);
            const race = hero ? hero.race : '';
            const meta = s && s.role ? `${roleLabel(s.role)}${s.stat ? ' · ' + statLabel(s.stat) : ''}` : (s && s.stat ? statLabel(s.stat) : '');
            const raceTxt = race ? `${RACE_EMOJI[race] || ''} <span class="hsk-race" style="color:var(--race-${race.toLowerCase()})">${escSkill(raceLabel(race))}</span>` : '';
            const item = sk => `<div class="skill-item"><div class="skill-name">${escSkill(sk.name)}</div>`
                + (sk.desc ? `<div class="skill-desc">${escSkill(sk.desc)}</div>` : '') + `</div>`;
            const na = `<div class="skill-item skill-na">${t('skills.unavailable')}</div>`;
            const sec = (key, inner) => `<div class="skill-section"><h4 class="skill-col-title">${t(key)}</h4>${inner}</div>`;
            const engFilled = ENGRAVING_TIERS.filter(tr => s && s.engraving && s.engraving[tr]);
            const engInner = engFilled.length
                ? engFilled.map(tr => `<div class="skill-item"><div class="skill-name">+${tr}</div><div class="skill-desc">${escSkill(s.engraving[tr])}</div></div>`).join('')
                : na;
            const exclLv = s && s.exclusive ? exclusiveLevels(s.exclusive) : {};
            const exclName = s && s.exclusive && s.exclusive.name;
            const exclFilled = EXCLUSIVE_TIERS.filter(tr => exclLv[tr]);
            const exclInner = (exclName || exclFilled.length)
                ? (exclName ? `<div class="skill-item"><div class="skill-name">${escSkill(exclName)}</div></div>` : '')
                    + exclFilled.map(tr => `<div class="skill-item"><div class="skill-name">${tr}lvl</div><div class="skill-desc">${escSkill(exclLv[tr])}</div></div>`).join('')
                : na;
            return `<div class="compare-col">`
                + `<div class="compare-col-head"><span class="hsk-name">${escSkill(name)}${verifiedBadge(s)}</span>`
                + ((raceTxt || meta) ? `<span class="hsk-meta">${raceTxt}${raceTxt && meta ? ' · ' : ''}${meta}</span>` : '') + `</div>`
                + sec('skills.active', s && s.active ? item(s.active) : na)
                + sec('skills.passive', s && s.passives && s.passives.length ? s.passives.map(item).join('') : na)
                + sec('skills.awaken', s && s.awaken ? item(s.awaken) : na)
                + sec('skills.engraving', engInner)
                + sec('skills.exclusive', exclInner)
                + `</div>`;
        }

        // Podświetlenie treści w modalu gdy przyszło z szukajki (hl = słowa); inaczej zwykły escape.
        function hlx(text, hl) { return hl && hl.length ? highlightHTML(text, hl) : escSkill(text == null ? '' : text); }

        let hskModalHero = null; // bohater aktualnie otwarty w modalu skilli (do odświeżania paska Galerii; null = pet/zamknięte)
        // Modal z kartą skilli — wywoływany z kafelka ORAZ z klikalnych nazw w formacjach.
        // hl (opcjonalne) = słowa do podświetlenia (przekazywane tylko z zakładki Bohaterowie).
        function showHeroSkills(name, hl) {
            const modal = $('hero-skills-modal');
            if (!modal) return;
            if (!heroSkillsLoaded) {
                const titleEl = $('hero-skills-title'), body = $('hero-skills-body');
                if (titleEl) titleEl.textContent = name;
                if (body) body.innerHTML = `<div class="heroes-empty">${t('heroes.loading')}</div>`;
                modal.classList.add('show');
                loadHeroSkills().then(() => renderHeroSkillsModal(name, hl));
                return;
            }
            renderHeroSkillsModal(name, hl);
            modal.classList.add('show');
        }

        // Render zawartości modalu (kolumny obok siebie: Active | Pasywne | Przebudzenie | Grawerunek | Exclusive).
        // Exclusive i poziomy grawerunku są ZAWSZE pokazane — brak danych = „Niedostępne".
        function renderHeroSkillsModal(name, hl) {
            hskModalHero = name;
            const titleEl = $('hero-skills-title'), body = $('hero-skills-body');
            const hero = findHero(name);
            const s = getHeroSkills(name);
            const race = hero ? hero.race : '';
            const emoji = RACE_EMOJI[race] || '🧙';
            const meta = s && s.role ? `${roleLabel(s.role)}${s.stat ? ' · ' + statLabel(s.stat) : ''}` : (s && s.stat ? statLabel(s.stat) : '');
            const raceTxt = race ? `${emoji} <span class="hsk-race" style="color:var(--race-${race.toLowerCase()})">${escSkill(raceLabel(race))}</span>` : '';
            const editBtn = isAdmin ? `<button class="hsk-edit-btn" onclick="openHeroSkillsEdit('${jsStr(name)}')" title="${escSkill(t('skills.edit'))}" aria-label="${escSkill(t('skills.edit'))}">✏️</button>` : '';
            if (titleEl) titleEl.innerHTML = `<div class="hsk-titletext"><span class="hsk-name">${escSkill(name)}${verifiedBadge(s)}</span>`
                + ((raceTxt || meta) ? `<span class="hsk-meta">${raceTxt}${raceTxt && meta ? ' · ' : ''}${meta}</span>` : '') + `</div>${editBtn}`;
            if (!body) return;
            const item = sk => `<div class="skill-item"><div class="skill-name">${hlx(sk.name, hl)}</div>`
                + (sk.desc ? `<div class="skill-desc">${hlx(sk.desc, hl)}</div>` : '') + `</div>`;
            const na = `<div class="skill-item skill-na">${t('skills.unavailable')}</div>`;
            const col = (key, inner) => `<div class="skill-col"><h4 class="skill-col-title">${t(key)}</h4>${inner}</div>`;
            const engHtml = ENGRAVING_TIERS.map(tier => {
                const v = s && s.engraving && s.engraving[tier];
                const open = engravingExpanded[tier];
                return `<div class="skill-item eng-tier${open ? ' open' : ''}${v ? '' : ' skill-na'}">`
                    + `<div class="skill-name eng-tier-head" onclick="toggleEngravingTier(this,'${tier}')"><span class="toggle-icon">▶</span> +${tier}</div>`
                    + `<div class="skill-desc eng-tier-body">${v ? hlx(v, hl) : t('skills.unavailable')}</div></div>`;
            }).join('');
            const exclLv = s && s.exclusive ? exclusiveLevels(s.exclusive) : {};
            const exclName = s && s.exclusive && s.exclusive.name;
            const exclTiers = EXCLUSIVE_TIERS.map(tier => {
                const v = exclLv[tier];
                const open = exclusiveExpanded[tier];
                return `<div class="skill-item eng-tier${open ? ' open' : ''}${v ? '' : ' skill-na'}">`
                    + `<div class="skill-name eng-tier-head" onclick="toggleExclusiveTier(this,'${tier}')"><span class="toggle-icon">▶</span> ${tier}lvl</div>`
                    + `<div class="skill-desc eng-tier-body">${v ? hlx(v, hl) : t('skills.unavailable')}</div></div>`;
            }).join('');
            const exclHtml = (exclName || Object.keys(exclLv).length)
                ? (exclName ? `<div class="skill-item excl-name"><div class="skill-name">${hlx(exclName, hl)}</div></div>` : '') + exclTiers
                : na;
            body.innerHTML = heroGalleryBarHtml(name)
                + `<div class="skill-cols">`
                + col('skills.active', s && s.active ? item(s.active) : na)
                + col('skills.passive', s && s.passives && s.passives.length ? s.passives.map(item).join('') : na)
                + col('skills.awaken', s && s.awaken ? item(s.awaken) : na)
                + col('skills.engraving', engHtml)
                + col('skills.exclusive', exclHtml)
                + `</div>`;
        }
        function closeHeroSkills() { hskModalHero = null; $('hero-skills-modal')?.classList.remove('show'); }

        // ── Podgląd bohatera ↔ Galeria: pasek chipów per kategoria (⭐ Mastery…) z licznikiem screenów ──
        // Widoczny tylko dla mających dostęp do Galerii (config); dla graczy bez dostępu wraca '' (brak martwych linków).
        function canSeeGallery() {
            if (isAdmin) return true;
            const vis = appConfig.tabVisibility?.screens || 'all';
            const place = appConfig.tabPlacement?.screens || 'bar';
            return vis === 'all' && place !== 'hidden';
        }
        function heroGalleryBarHtml(heroName) {
            if (!canSeeGallery()) return '';
            const hk = normalize(heroName);
            const chips = HERO_GALLERY_CATEGORIES.map(cat => {
                const folder = heroCatFolder(hk, cat.key);
                const n = folder ? screenCount(folder.id) : 0;
                const target = folder ? `'${jsStr(folder.id)}'` : 'null';
                const label = `${cat.icon} ${escSkill(cat.label)} · ${n > 0 ? n : t('heroGallery.empty')}`;
                return `<button class="hero-gal-chip${n > 0 ? ' has' : ''}" onclick="openHeroGalleryFolder(${target})">${label}</button>`;
            }).join('');
            return `<div class="hero-gallery-bar" id="hero-gallery-bar"><span class="hero-gallery-label">🖼️ ${t('heroGallery.section')}</span>${chips}</div>`;
        }
        // Skok z podglądu bohatera do folderu kategorii w Galerii.
        function openHeroGalleryFolder(catId) {
            if (!canSeeGallery()) return;
            if (!catId) { if (isAdmin) showToast(t('heroGallery.notSeeded'), true); return; } // folder jeszcze niezseedowany
            closeHeroSkills();
            switchTab('screens');
            screensGoTo(catId);
        }
        // Po zmianie screenów odśwież liczniki paska, jeśli podgląd bohatera otwarty.
        function refreshOpenHeroGalleryBar() {
            if (!hskModalHero) return;
            const modal = $('hero-skills-modal');
            if (!modal || !modal.classList.contains('show')) return;
            const bar = $('hero-gallery-bar');
            if (bar) bar.outerHTML = heroGalleryBarHtml(hskModalHero);
        }

        // Zwiń/rozwiń poziom grawerunku w Podglądzie + zapamiętaj wybór (per-poziom) w localStorage.
        function toggleEngravingTier(el, tier) {
            const open = el.closest('.eng-tier').classList.toggle('open');
            engravingExpanded[tier] = open;
            storage.setJson('souls_engraving_expanded', engravingExpanded);
        }
        // Zwiń/rozwiń poziom ekwipunku ekskluzywnego w Podglądzie + zapamiętaj wybór (per-poziom).
        function toggleExclusiveTier(el, tier) {
            const open = el.closest('.eng-tier').classList.toggle('open');
            exclusiveExpanded[tier] = open;
            storage.setJson('souls_exclusive_expanded', exclusiveExpanded);
        }

        // ── Pety: ten sam modal co bohaterowie, ale 3 kolumny (Active | Pasywne | Ładowanie energii) ──
        function showPetSkills(name, hl) {
            const modal = $('hero-skills-modal');
            if (!modal) return;
            if (!petSkillsLoaded) {
                const titleEl = $('hero-skills-title'), body = $('hero-skills-body');
                if (titleEl) titleEl.textContent = name;
                if (body) body.innerHTML = `<div class="heroes-empty">${t('heroes.loading')}</div>`;
                modal.classList.add('show');
                loadPetSkills().then(() => renderPetSkillsModal(name, hl));
                return;
            }
            renderPetSkillsModal(name, hl);
            modal.classList.add('show');
        }
        function renderPetSkillsModal(name, hl) {
            hskModalHero = null; // pet — brak paska Galerii
            const titleEl = $('hero-skills-title'), body = $('hero-skills-body');
            const s = getPetSkills(name);
            const editBtn = isAdmin ? `<button class="hsk-edit-btn" onclick="openPetSkillsEdit('${jsStr(name)}')" title="${escSkill(t('skills.edit'))}" aria-label="${escSkill(t('skills.edit'))}">✏️</button>` : '';
            if (titleEl) titleEl.innerHTML = `<div class="hsk-titletext"><span class="hsk-name">🐾 ${escSkill(name)}${verifiedBadge(s)}</span><span class="hsk-meta">${t('petTab.pet')}</span></div>${editBtn}`;
            if (!body) return;
            const item = sk => `<div class="skill-item"><div class="skill-name">${hlx(sk.name, hl)}</div>`
                + (sk.desc ? `<div class="skill-desc">${hlx(sk.desc, hl)}</div>` : '') + `</div>`;
            const na = `<div class="skill-item skill-na">${t('skills.unavailable')}</div>`;
            const col = (key, inner) => `<div class="skill-col"><h4 class="skill-col-title">${t(key)}</h4>${inner}</div>`;
            const energy = s && s.energy ? `<div class="skill-item"><div class="skill-desc">${hlx(s.energy, hl)}</div></div>` : na;
            body.innerHTML = `<div class="skill-cols">`
                + col('skills.active', s && s.active ? item(s.active) : na)
                + col('skills.passive', s && s.passive ? item(s.passive) : na)
                + col('skills.energy', energy)
                + `</div>`;
        }

        // Auto-wysokość textarea = pełna treść (do limitu). scrollHeight działa dopiero gdy element jest widoczny.
        function autoSizeTextarea(el) { if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight + 2, 420) + 'px'; }

        // ── Edycja umiejętności (tylko admin) ──
        let editingSkillHero = null;
        function openHeroSkillsEdit(name) {
            if (!isAdmin) return;
            editingSkillHero = name;
            const s = getHeroSkills(name) || {};
            const set = (id, val) => { const el = $(id); if (el) el.value = val || ''; };
            set('hse-role', s.role); set('hse-stat', s.stat);
            set('hse-active-name', s.active && s.active.name); set('hse-active-desc', s.active && s.active.desc);
            for (let i = 0; i < 3; i++) { const p = (s.passives || [])[i] || {}; set(`hse-pass${i}-name`, p.name); set(`hse-pass${i}-desc`, p.desc); }
            set('hse-awaken-name', s.awaken && s.awaken.name); set('hse-awaken-desc', s.awaken && s.awaken.desc);
            ENGRAVING_TIERS.forEach(tier => set(`hse-eng${tier}`, s.engraving && s.engraving[tier]));
            set('hse-excl-name', s.exclusive && s.exclusive.name);
            const exclLv = exclusiveLevels(s.exclusive);
            EXCLUSIVE_TIERS.forEach(tier => set(`hse-excl${tier}`, exclLv[tier]));
            const vcb = $('hse-verified'); if (vcb) vcb.checked = !!s.verified;
            $('hero-skills-edit-title').textContent = name;
            $('hero-skills-edit-modal').classList.add('show');
            // auto-rozwinięcie pól: pokaż całość długich opisów od razu (scrollHeight liczy się dopiero po wyświetleniu)
            document.querySelectorAll('#hero-skills-edit-modal .hse-textarea').forEach(autoSizeTextarea);
        }
        function closeHeroSkillsEdit() { $('hero-skills-edit-modal')?.classList.remove('show'); editingSkillHero = null; }
        async function saveHeroSkillsEdit() {
            if (!editingSkillHero || !isAdmin) return;
            if (!isOnline) { showToast(t('common.noConnection'), true); return; }
            const name = editingSkillHero;
            const gv = id => ($(id)?.value || '').trim();
            const sk = (n, d) => (n || d) ? { name: n, desc: d } : null;
            const obj = {};
            const role = gv('hse-role'), stat = gv('hse-stat');
            if (role) obj.role = role;
            if (stat) obj.stat = stat;
            const active = sk(gv('hse-active-name'), gv('hse-active-desc')); if (active) obj.active = active;
            const passives = [];
            for (let i = 0; i < 3; i++) { const p = sk(gv(`hse-pass${i}-name`), gv(`hse-pass${i}-desc`)); if (p) passives.push(p); }
            if (passives.length) obj.passives = passives;
            const awaken = sk(gv('hse-awaken-name'), gv('hse-awaken-desc')); if (awaken) obj.awaken = awaken;
            const eng = {};
            ENGRAVING_TIERS.forEach(tier => { const d = gv(`hse-eng${tier}`); if (d) eng[tier] = d; });
            if (Object.keys(eng).length) obj.engraving = eng;
            const exclName = gv('hse-excl-name');
            const exclLevels = {};
            EXCLUSIVE_TIERS.forEach(tier => { const d = gv(`hse-excl${tier}`); if (d) exclLevels[tier] = d; });
            if (exclName || Object.keys(exclLevels).length) {
                obj.exclusive = {};
                if (exclName) obj.exclusive.name = exclName;
                if (Object.keys(exclLevels).length) obj.exclusive.levels = exclLevels;
            }
            if ($('hse-verified')?.checked) obj.verified = true;
            try {
                await heroSkillsRef.child(name).set(Object.keys(obj).length ? obj : null);
                if (Object.keys(obj).length) allHeroSkills[name] = obj; else delete allHeroSkills[name];
                closeHeroSkillsEdit();
                renderHeroSkillsModal(name);
                if ($('tab-heroes')?.classList.contains('active')) renderHeroesGrid();
                showToast(`✅ ${t('skills.saved')}`);
            } catch (e) { showToast(`${t('common.error')}: ${e.message}`, true); }
        }

        // ── Edycja peta (tylko admin) ──
        let editingPetSkill = null;
        function openPetSkillsEdit(name) {
            if (!isAdmin) return;
            editingPetSkill = name;
            const s = getPetSkills(name) || {};
            const set = (id, val) => { const el = $(id); if (el) el.value = val || ''; };
            set('pse-active-name', s.active && s.active.name); set('pse-active-desc', s.active && s.active.desc);
            set('pse-passive-name', s.passive && s.passive.name); set('pse-passive-desc', s.passive && s.passive.desc);
            set('pse-energy', s.energy);
            const vcb = $('pse-verified'); if (vcb) vcb.checked = !!s.verified;
            $('pet-skills-edit-title').textContent = name;
            $('pet-skills-edit-modal').classList.add('show');
            document.querySelectorAll('#pet-skills-edit-modal .hse-textarea').forEach(autoSizeTextarea);
        }
        function closePetSkillsEdit() { $('pet-skills-edit-modal')?.classList.remove('show'); editingPetSkill = null; }
        async function savePetSkillsEdit() {
            if (!editingPetSkill || !isAdmin) return;
            if (!isOnline) { showToast(t('common.noConnection'), true); return; }
            const name = editingPetSkill;
            const gv = id => ($(id)?.value || '').trim();
            const sk = (n, d) => (n || d) ? { name: n, desc: d } : null;
            const obj = {};
            const active = sk(gv('pse-active-name'), gv('pse-active-desc')); if (active) obj.active = active;
            const passive = sk(gv('pse-passive-name'), gv('pse-passive-desc')); if (passive) obj.passive = passive;
            const energy = gv('pse-energy'); if (energy) obj.energy = energy;
            if ($('pse-verified')?.checked) obj.verified = true;
            try {
                await petSkillsRef.child(name).set(Object.keys(obj).length ? obj : null);
                if (Object.keys(obj).length) allPetSkills[name] = obj; else delete allPetSkills[name];
                closePetSkillsEdit();
                renderPetSkillsModal(name);
                if ($('tab-heroes')?.classList.contains('active')) renderHeroesGrid();
                showToast(`✅ ${t('skills.saved')}`);
            } catch (e) { showToast(`${t('common.error')}: ${e.message}`, true); }
        }


        // ═══════════════════════════════════════════════════════════
        // TAB: DEFENSE — składy obronne gildii + gracze + przypięcia
        // ═══════════════════════════════════════════════════════════

        // Stan zakładki Obrona (cache + widoki).
        let defenseFormationsRef = null, defensePlayersRef = null, defenseAssignmentsRef = null;
        let allDefenseFormations = [];   // { id, my[8], myPet, name, comment, createdAt, fingerprint }
        let allDefensePlayers = [];      // { id, name, createdAt, deletedAt }
        let allDefenseAssignments = [];  // { id, playerId, formationId, assignedAt, unassignedAt }
        let currentDefenseView = 'players';
        let currentDefensePlayerId = null;
        let pendingAssignFormationId = null;
        let editingDefenseFormationId = null;
        let currentDefenseSort = 'id-desc'; // id-desc | id-asc | date-desc | date-asc | users-desc | users-asc

        // Fingerprint slot-by-slot — pozwala wykryć identyczne składy (te same hero NA tych samych pozycjach + ten sam pet).
        function defenseFingerprint(my, pet) {
            const slots = [];
            for (let i = 0; i < 8; i++) slots.push(normalize(my[i] || ''));
            return slots.join('|') + '||' + normalize(pet || '');
        }

        // Set fingerprint — ten sam zestaw bohaterów + ten sam pet, niezależnie od pozycji.
        // Liczymy go w locie (a nie zapisujemy do bazy), bo set jest pochodną slotów — i tak musimy
        // przepuścić każdą formację przez `defenseFingerprint` przy zapisie.
        function defenseSetFingerprint(my, pet) {
            const heroes = (my || [])
                .map(h => normalize(h || ''))
                .filter(Boolean)
                .sort();
            return heroes.join('|') + '||' + normalize(pet || '');
        }

        function findDefenseFormationByFingerprint(fp) {
            return allDefenseFormations.find(f => f.fingerprint === fp) || null;
        }

        // Aktywne (nie odpięte i nie do skasowanego gracza) przypięcia danego gracza.
        function getActiveAssignmentsForPlayer(playerId) {
            return allDefenseAssignments.filter(a => a.playerId === playerId && !a.unassignedAt);
        }

        // Wszystkie aktywne przypięcia danego składu — z odfiltrowaniem skasowanych graczy.
        function getActiveAssignmentsForFormation(formationId) {
            const livePlayerIds = new Set(allDefensePlayers.filter(p => !p.deletedAt).map(p => p.id));
            return allDefenseAssignments.filter(a => a.formationId === formationId && !a.unassignedAt && livePlayerIds.has(a.playerId));
        }

        // Aktywne przypięcia *innych* składów o tym samym set fingerprincie (te same 5 hero + ten sam pet,
        // ale inna kolejność slotów). Wyklucza sam `formationId` — chcemy "inne ustawienia", nie self.
        function getActiveAssignmentsForSameSet(formationId) {
            const self = getDefenseFormation(formationId);
            if (!self) return [];
            const setFp = defenseSetFingerprint(self.my, self.myPet);
            const otherFormationIds = allDefenseFormations
                .filter(f => f.id !== formationId && defenseSetFingerprint(f.my, f.myPet) === setFp)
                .map(f => f.id);
            if (otherFormationIds.length === 0) return [];
            const livePlayerIds = new Set(allDefensePlayers.filter(p => !p.deletedAt).map(p => p.id));
            const otherIdSet = new Set(otherFormationIds);
            return allDefenseAssignments.filter(a =>
                otherIdSet.has(a.formationId) && !a.unassignedAt && livePlayerIds.has(a.playerId));
        }

        function getDefensePlayer(playerId) {
            return allDefensePlayers.find(p => p.id === playerId) || null;
        }

        function getDefenseFormation(formationId) {
            return allDefenseFormations.find(f => f.id === formationId) || null;
        }

        // Generator ID — Firebase push() byłby ładniejszy, ale trzymamy się stylu istniejących formacji.
        function nextDefenseId(collection) {
            return collection.length ? Math.max(...collection.map(x => x.id)) + 1 : 1;
        }

        // ─── Akcje: gracze ───────────────────────────────────────

        async function addDefensePlayer() {
            if (!isAdmin) return;
            const input = $('defense-new-player-name');
            const name = (input?.value || '').trim();
            if (!name) { showToast('❌ ' + t('defense.playerNameRequired'), true); return; }

            const exists = allDefensePlayers.some(p => !p.deletedAt && p.name.toLowerCase() === name.toLowerCase());
            if (exists) { showToast('⚠️ ' + t('defense.playerExists'), true); return; }

            if (!defensePlayersRef) { showToast('❌ ' + t('common.noConnection'), true); return; }

            const id = nextDefenseId(allDefensePlayers);
            try {
                await defensePlayersRef.child(String(id)).set({
                    id, name, createdAt: new Date().toISOString()
                });
                input.value = '';
                showToast('✅ ' + t('defense.playerAdded') + ': ' + name);
                renderDefensePlayersList();
                refreshDefenseAssignDropdown();
            } catch (e) {
                showToast(t('common.error') + ': ' + e.message, true);
            }
        }

        async function deleteDefensePlayer() {
            if (!isAdmin || !currentDefensePlayerId) return;
            const player = getDefensePlayer(currentDefensePlayerId);
            if (!player) return;
            const msg = t('defense.confirmDeletePlayer').replace('{name}', player.name);
            if (!confirm(msg)) return;

            try {
                await defensePlayersRef.child(String(player.id)).update({
                    deletedAt: new Date().toISOString()
                });
                // Soft-delete: aktywne przypięcia oznaczamy jako odpięte (zostaje historia)
                const active = getActiveAssignmentsForPlayer(player.id);
                const now = new Date().toISOString();
                await Promise.all(active.map(a =>
                    defenseAssignmentsRef.child(String(a.id)).update({ unassignedAt: now })
                ));
                showToast('🗑️ ' + t('defense.playerDeleted'));
                switchDefenseView('players');
            } catch (e) {
                showToast(t('common.error') + ': ' + e.message, true);
            }
        }

        // ─── Akcje: składy ───────────────────────────────────────

        // Zwraca { ok: true, formation, reused } LUB { ok: false } po toast-błędzie.
        // Wyciągnięte z saveDefenseFormation żeby zadziałało też przy przypisaniu od razu.
        async function persistDefenseFormation({ name, my, myPet, comment }) {
            if (!defenseFormationsRef) { showToast('❌ ' + t('common.noConnection'), true); return { ok: false }; }

            const hasAnyHero = my.some(h => h && h.trim());
            if (!hasAnyHero && !myPet) { showToast('❌ ' + t('defense.formationEmpty'), true); return { ok: false }; }

            // Walidacja istnienia bohaterów/petów (twardo, jak w add).
            const unknownHero = my.find(h => h && !heroes.some(x => x.name.toLowerCase() === h.toLowerCase()));
            if (unknownHero) { showToast('❌ ' + t('defense.unknownHero') + ': ' + unknownHero, true); return { ok: false }; }
            if (myPet && !pets.some(p => getPetName(p).toLowerCase() === myPet.toLowerCase())) {
                showToast('❌ ' + t('defense.unknownPet') + ': ' + myPet, true); return { ok: false };
            }
            if (my.filter(h => h && h.trim()).length > 5) { showToast('❌ ' + t('defense.tooManyHeroes'), true); return { ok: false }; }

            const fp = defenseFingerprint(my, myPet);
            const existing = findDefenseFormationByFingerprint(fp);
            if (existing) {
                showToast('ℹ️ ' + t('defense.formationReused') + ' #' + existing.id);
                return { ok: true, formation: existing, reused: true };
            }

            const id = nextDefenseId(allDefenseFormations);
            const record = {
                id,
                my,
                myPet: myPet || '',
                name: (name || '').trim() || `Skład #${id}`,
                comment: (comment || '').trim(),
                createdAt: new Date().toISOString(),
                fingerprint: fp
            };
            try {
                await defenseFormationsRef.child(String(id)).set(record);
                showToast('💾 ' + t('defense.formationSaved') + ' #' + id);
                return { ok: true, formation: record, reused: false };
            } catch (e) {
                showToast(t('common.error') + ': ' + e.message, true);
                return { ok: false };
            }
        }

        async function saveDefenseFormation() {
            if (!isAdmin) return;
            const name = $('defense-add-name').value.trim();
            const comment = $('defense-add-comment').value.trim();
            const my = [];
            for (let i = 1; i <= 8; i++) my.push(($(`defense-my${i}`).value || '').trim());
            const myPet = ($('defense-myPet').value || '').trim();
            const assignPlayerId = $('defense-add-assign-player').value;

            const result = await persistDefenseFormation({ name, my, myPet, comment });
            if (!result.ok) return;

            if (assignPlayerId) {
                const ok = await assignDefenseFormation(result.formation.id, Number(assignPlayerId));
                if (!ok) return; // Toast już pokazany; nie zerujemy formularza, żeby user mógł poprawić
            }
            clearDefenseAddForm();
        }

        function clearDefenseAddForm() {
            $('defense-add-name').value = '';
            $('defense-add-comment').value = '';
            for (let i = 1; i <= 8; i++) {
                const el = $(`defense-my${i}`);
                if (el) { el.value = ''; setValidation(el, null); updateInputHeroColor(el, false); }
            }
            const petEl = $('defense-myPet');
            if (petEl) { petEl.value = ''; setValidation(petEl, null); updateInputHeroColor(petEl, true); }
            $('defense-add-assign-player').value = '';
        }

        // ─── Edycja składu (z auto-migracją przypięć) ──────────

        function openDefenseEditModal(formationId) {
            if (!isAdmin) return;
            const f = getDefenseFormation(formationId);
            if (!f) return;
            editingDefenseFormationId = formationId;
            $('defense-edit-id').textContent = formationId;
            $('defense-edit-name').value = f.name || '';
            $('defense-edit-comment').value = f.comment || '';
            for (let i = 1; i <= 8; i++) {
                const el = $(`defense-edit-my${i}`);
                if (el) { el.value = f.my[i - 1] || ''; setValidation(el, null); updateInputHeroColor(el, false); }
            }
            $('defense-edit-myPet').value = f.myPet || '';
            setValidation($('defense-edit-myPet'), null);
            updateInputHeroColor($('defense-edit-myPet'), true);
            updateDefenseEditImpact();
            $('defense-edit-modal').classList.remove('hidden');
        }

        function closeDefenseEditModal() {
            $('defense-edit-modal').classList.add('hidden');
            editingDefenseFormationId = null;
        }

        // Live podgląd "co się stanie po zapisie" — czytamy z formularza i mówimy user-friendly co planujemy.
        function updateDefenseEditImpact() {
            const el = $('defense-edit-impact');
            if (!el || !editingDefenseFormationId) return;
            const old = getDefenseFormation(editingDefenseFormationId);
            if (!old) { el.textContent = ''; return; }

            const newMy = [];
            for (let i = 1; i <= 8; i++) newMy.push(($(`defense-edit-my${i}`).value || '').trim());
            const newPet = ($('defense-edit-myPet').value || '').trim();
            const newName = ($('defense-edit-name').value || '').trim();
            const newComment = ($('defense-edit-comment').value || '').trim();

            const oldFp = old.fingerprint;
            const newFp = defenseFingerprint(newMy, newPet);

            if (oldFp === newFp) {
                const metaChanged = (newName !== (old.name || '')) || (newComment !== (old.comment || ''));
                el.textContent = metaChanged ? '📝 ' + t('defense.editImpactMetaOnly') : '— ' + t('defense.editImpactNoChange');
                return;
            }
            // sloty zmienione
            const existing = findDefenseFormationByFingerprint(newFp);
            const action = existing
                ? t('defense.editImpactActionReuse').replace('{id}', existing.id)
                : t('defense.editImpactActionNew');
            const activeCount = getActiveAssignmentsForFormation(old.id).length;
            el.textContent = '⚠️ ' + t('defense.editImpactSlots').replace('{action}', action).replace('{n}', activeCount);
        }

        async function saveDefenseEditModal() {
            if (!isAdmin || !editingDefenseFormationId) return;
            const old = getDefenseFormation(editingDefenseFormationId);
            if (!old) return;

            const newName = $('defense-edit-name').value.trim();
            const newComment = $('defense-edit-comment').value.trim();
            const newMy = [];
            for (let i = 1; i <= 8; i++) newMy.push(($(`defense-edit-my${i}`).value || '').trim());
            const newPet = ($('defense-edit-myPet').value || '').trim();

            // Walidacja (jak przy persistDefenseFormation)
            const hasAnyHero = newMy.some(h => h && h.trim());
            if (!hasAnyHero && !newPet) { showToast('❌ ' + t('defense.formationEmpty'), true); return; }
            const unknownHero = newMy.find(h => h && !heroes.some(x => x.name.toLowerCase() === h.toLowerCase()));
            if (unknownHero) { showToast('❌ ' + t('defense.unknownHero') + ': ' + unknownHero, true); return; }
            if (newPet && !pets.some(p => getPetName(p).toLowerCase() === newPet.toLowerCase())) {
                showToast('❌ ' + t('defense.unknownPet') + ': ' + newPet, true); return;
            }
            if (newMy.filter(h => h && h.trim()).length > 5) { showToast('❌ ' + t('defense.tooManyHeroes'), true); return; }

            const oldFp = old.fingerprint;
            const newFp = defenseFingerprint(newMy, newPet);

            // CASE A: tylko metadane — update in place
            if (oldFp === newFp) {
                const metaChanged = (newName !== (old.name || '')) || (newComment !== (old.comment || ''));
                if (!metaChanged) { showToast('ℹ️ ' + t('defense.editNoChange')); closeDefenseEditModal(); return; }
                try {
                    await defenseFormationsRef.child(String(old.id)).update({
                        name: newName || old.name,
                        comment: newComment
                    });
                    showToast('💾 ' + t('defense.editMetaSaved'));
                    closeDefenseEditModal();
                } catch (e) {
                    showToast(t('common.error') + ': ' + e.message, true);
                }
                return;
            }

            // CASE B: sloty/pet zmienione — migracja
            // B1: znajdź lub utwórz docelowy rekord
            let target = findDefenseFormationByFingerprint(newFp);
            const reused = !!target;
            try {
                if (!target) {
                    const newId = nextDefenseId(allDefenseFormations);
                    target = {
                        id: newId,
                        my: newMy,
                        myPet: newPet || '',
                        name: newName || `Skład #${newId}`,
                        comment: newComment,
                        createdAt: new Date().toISOString(),
                        fingerprint: newFp
                    };
                    await defenseFormationsRef.child(String(newId)).set(target);
                    // wpchnij lokalnie, żeby kolejne lookupy w tej funkcji (allDefenseFormations) widziały nowy rekord
                    // zanim listener z .on('value') asynchronicznie podmieni cache
                    allDefenseFormations.push(target);
                }
            } catch (e) {
                showToast(t('common.error') + ': ' + e.message, true); return;
            }

            // B2: aktywne przypięcia starego (tylko żywi gracze)
            const livePlayerIds = new Set(allDefensePlayers.filter(p => !p.deletedAt).map(p => p.id));
            const activeOld = allDefenseAssignments.filter(a =>
                a.formationId === old.id && !a.unassignedAt && livePlayerIds.has(a.playerId)
            );

            const successful = [];
            const conflicted = []; // { player, reason }

            for (const oldA of activeOld) {
                // "Symulujemy" odpięcie starego: liczymy aktywne bez tego konkretnego przypięcia
                const playerActiveOthers = getActiveAssignmentsForPlayer(oldA.playerId)
                    .filter(a => a.id !== oldA.id);

                // Już pinned do target (rzadkie, ale możliwe gdy reused === true)
                if (playerActiveOthers.some(a => a.formationId === target.id)) {
                    conflicted.push({ player: getDefensePlayer(oldA.playerId), reason: 'already' });
                    continue;
                }
                if (playerActiveOthers.length >= 3) {
                    conflicted.push({ player: getDefensePlayer(oldA.playerId), reason: 'max' });
                    continue;
                }
                // Konflikt heroes/pet z innymi aktywnymi gracza
                const existHeroes = new Set();
                const existPets = new Set();
                for (const a of playerActiveOthers) {
                    const f = getDefenseFormation(a.formationId);
                    if (!f) continue;
                    f.my.forEach(h => { if (h) existHeroes.add(h.toLowerCase()); });
                    if (f.myPet) existPets.add(f.myPet.toLowerCase());
                }
                let conflict = false;
                for (const h of target.my) {
                    if (h && existHeroes.has(h.toLowerCase())) {
                        conflicted.push({ player: getDefensePlayer(oldA.playerId), reason: 'hero:' + h });
                        conflict = true; break;
                    }
                }
                if (conflict) continue;
                if (target.myPet && existPets.has(target.myPet.toLowerCase())) {
                    conflicted.push({ player: getDefensePlayer(oldA.playerId), reason: 'pet:' + target.myPet });
                    continue;
                }
                successful.push(oldA);
            }

            // B3: wykonaj — odpięcie starych + przypięcie do target
            const now = new Date().toISOString();
            let nextId = nextDefenseId(allDefenseAssignments);
            const writes = [];
            for (const oldA of successful) {
                writes.push(defenseAssignmentsRef.child(String(oldA.id)).update({ unassignedAt: now }));
                const id = nextId++;
                const newAssignment = { id, playerId: oldA.playerId, formationId: target.id, assignedAt: now };
                writes.push(defenseAssignmentsRef.child(String(id)).set(newAssignment));
                // wpychamy lokalnie, żeby kolejne iteracje pętli (jeśli ten sam gracz miał 2x — niemożliwe ale safe)
                // i kolejne walidacje widziały świeży stan
                allDefenseAssignments.push(newAssignment);
                const idxOld = allDefenseAssignments.findIndex(a => a.id === oldA.id);
                if (idxOld >= 0) allDefenseAssignments[idxOld] = { ...allDefenseAssignments[idxOld], unassignedAt: now };
            }
            try {
                await Promise.all(writes);
            } catch (e) {
                showToast(t('common.error') + ': ' + e.message, true);
                return;
            }

            // B4: summary
            const okN = successful.length;
            const total = activeOld.length;
            const msgKey = reused ? 'defense.editMigratedReused' : 'defense.editMigratedNew';
            showToast('🔄 ' + t(msgKey)
                .replace('{id}', target.id)
                .replace('{ok}', okN)
                .replace('{total}', total));
            if (conflicted.length > 0) {
                const names = conflicted.map(c => c.player?.name || '?').join(', ');
                showToast('⚠️ ' + t('defense.editConflicts')
                    .replace('{names}', names)
                    .replace('{id}', old.id), true);
            }
            closeDefenseEditModal();
        }

        async function deleteDefenseFormation(formationId) {
            if (!isAdmin) return;
            const f = getDefenseFormation(formationId);
            if (!f) return;
            const activeCount = getActiveAssignmentsForFormation(formationId).length;
            if (activeCount > 0) {
                showToast('⚠️ ' + t('defense.cannotDeleteFormationInUse').replace('{n}', activeCount), true);
                return;
            }
            if (!confirm(t('defense.confirmDeleteFormation').replace('{id}', formationId))) return;

            try {
                // Skasuj wszystkie przypięcia (też historyczne odpięte) tego składu, bo inaczej zostawią sieroty.
                const orphanAssignments = allDefenseAssignments.filter(a => a.formationId === formationId);
                await Promise.all(orphanAssignments.map(a => defenseAssignmentsRef.child(String(a.id)).remove()));
                await defenseFormationsRef.child(String(formationId)).remove();
                showToast('🗑️ ' + t('defense.formationDeleted'));
            } catch (e) {
                showToast(t('common.error') + ': ' + e.message, true);
            }
        }

        // ─── Akcje: przypisania ──────────────────────────────────

        // Reguły: max 3 aktywne, żaden hero/pet się nie powtarza, ten sam skład nie przypięty 2x.
        function validateDefenseAssignment(formationId, playerId) {
            const formation = getDefenseFormation(formationId);
            if (!formation) return { ok: false, msg: t('common.error') };
            const active = getActiveAssignmentsForPlayer(playerId);

            if (active.some(a => a.formationId === formationId)) {
                return { ok: false, msg: t('defense.alreadyAssigned') };
            }
            if (active.length >= 3) {
                return { ok: false, msg: t('defense.maxAssignmentsReached') };
            }

            const existingHeroes = new Set();
            const existingPets = new Set();
            for (const a of active) {
                const f = getDefenseFormation(a.formationId);
                if (!f) continue;
                f.my.forEach(h => { if (h) existingHeroes.add(h.toLowerCase()); });
                if (f.myPet) existingPets.add(f.myPet.toLowerCase());
            }
            for (const h of formation.my) {
                if (h && existingHeroes.has(h.toLowerCase())) {
                    return { ok: false, msg: t('defense.duplicateHeroes').replace('{name}', h) };
                }
            }
            if (formation.myPet && existingPets.has(formation.myPet.toLowerCase())) {
                return { ok: false, msg: t('defense.duplicatePet').replace('{name}', formation.myPet) };
            }
            return { ok: true };
        }

        async function assignDefenseFormation(formationId, playerId) {
            if (!isAdmin) return false;
            const check = validateDefenseAssignment(formationId, playerId);
            if (!check.ok) { showToast('⚠️ ' + check.msg, true); return false; }

            const id = nextDefenseId(allDefenseAssignments);
            try {
                await defenseAssignmentsRef.child(String(id)).set({
                    id, playerId, formationId, assignedAt: new Date().toISOString()
                });
                showToast('🔗 ' + t('defense.assignSuccess'));
                return true;
            } catch (e) {
                showToast(t('common.error') + ': ' + e.message, true);
                return false;
            }
        }

        async function unassignDefenseFormation(assignmentId) {
            if (!isAdmin) return;
            if (!confirm(t('defense.confirmUnassign'))) return;
            try {
                await defenseAssignmentsRef.child(String(assignmentId)).update({
                    unassignedAt: new Date().toISOString()
                });
                showToast('✂️ ' + t('defense.unassignSuccess'));
            } catch (e) {
                showToast(t('common.error') + ': ' + e.message, true);
            }
        }

        // ─── Modal: przypisz skład → gracz ───────────────────────

        function openDefenseAssignModal(formationId) {
            if (!isAdmin) return;
            const f = getDefenseFormation(formationId);
            if (!f) return;
            pendingAssignFormationId = formationId;
            $('defense-assign-formation-name').textContent = f.name + ' (#' + formationId + ')';
            const select = $('defense-assign-player-select');
            const livePlayers = allDefensePlayers.filter(p => !p.deletedAt);
            select.innerHTML = livePlayers.length
                ? livePlayers.map(p => `<option value="${p.id}">${p.name}</option>`).join('')
                : `<option value="" disabled>${t('defense.noPlayers')}</option>`;
            $('defense-assign-modal').classList.remove('hidden');
        }

        function closeDefenseAssignModal() {
            $('defense-assign-modal').classList.add('hidden');
            pendingAssignFormationId = null;
        }

        async function confirmDefenseAssign() {
            const select = $('defense-assign-player-select');
            const playerId = Number(select.value);
            if (!playerId || !pendingAssignFormationId) return;
            const ok = await assignDefenseFormation(pendingAssignFormationId, playerId);
            if (ok) closeDefenseAssignModal();
        }

        // ─── Sub-tab routing ─────────────────────────────────────

        function switchDefenseView(view, playerId = null) {
            currentDefenseView = view;
            if (view === 'player' && playerId != null) currentDefensePlayerId = playerId;

            document.querySelectorAll('.defense-subnav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
            document.querySelectorAll('.defense-view').forEach(el => el.style.display = 'none');

            const viewId = view === 'player' ? 'defense-view-player' : `defense-view-${view}`;
            const el = $(viewId);
            if (el) el.style.display = 'block';

            if (view === 'players') renderDefensePlayersList();
            else if (view === 'formations') renderDefenseFormations();
            else if (view === 'add') refreshDefenseAssignDropdown();
            else if (view === 'player') renderDefensePlayerDetail();
        }

        // ─── Render: lista graczy ────────────────────────────────

        function renderDefensePlayersList() {
            const list = $('defense-players-list');
            if (!list) return;
            const livePlayers = allDefensePlayers.filter(p => !p.deletedAt).sort((a, b) => a.name.localeCompare(b.name, 'pl'));
            const activeAssignments = allDefenseAssignments.filter(a => !a.unassignedAt);

            $('defense-stat-players').textContent = livePlayers.length;
            $('defense-stat-formations').textContent = allDefenseFormations.length;
            $('defense-stat-assigned').textContent = activeAssignments.filter(a => livePlayers.some(p => p.id === a.playerId)).length;

            if (livePlayers.length === 0) {
                list.innerHTML = `<div class="empty-state"><p>${t('defense.noPlayers')}</p></div>`;
                return;
            }

            list.innerHTML = livePlayers.map(p => {
                const count = getActiveAssignmentsForPlayer(p.id).length;
                const badgeClass = count === 0 ? 'empty' : (count === 3 ? 'full' : '');
                return `
                    <div class="defense-player-card" onclick="switchDefenseView('player', ${p.id})">
                        <div class="defense-player-card-name">${escapeHtml(p.name)}</div>
                        <div class="defense-player-card-meta">
                            <span>📅 ${formatDate(p.createdAt) || '—'}</span>
                            <span class="defense-player-card-badge ${badgeClass}">${count}/3</span>
                        </div>
                    </div>`;
            }).join('');
        }

        // ─── Render: lista składów ───────────────────────────────

        function setDefenseSort(sort) {
            currentDefenseSort = sort;
            document.querySelectorAll('.sort-btn[data-defense-sort]').forEach(b =>
                b.classList.toggle('active', b.dataset.defenseSort === sort));
            renderDefenseFormations();
        }

        // ─── Zaawansowana szukajka Składów obronnych ───────────────
        // Mini-język (prostszy niż w Bohaterach — bez pól/skilli, tylko obecność):
        //   spacja = ORAZ (wszystkie muszą trafić), `a|b` = ALBO (grupa alternatyw),
        //   `-x` = wyklucz, `"fraza"` = nazwa wielowyrazowa.
        // Każdy term dopasowuje się do bohatera/peta ORAZ nazwy/komentarza składu.
        function parseDefenseQuery(raw) {
            const q = (raw || '').toLowerCase().trim();
            if (!q) return null;
            const tokens = q.match(/"[^"]*"|\S+/g) || [];
            const include = []; // grupy OR: [[a,b], [c]] → (a|b) AND (c)
            const exclude = [];
            for (let tok of tokens) {
                let neg = false;
                if (tok[0] === '-' && tok.length > 1) { neg = true; tok = tok.slice(1); }
                const alts = tok.split('|').map(s => s.replace(/"/g, '').trim()).filter(Boolean);
                if (!alts.length) continue;
                if (neg) exclude.push(...alts);
                else include.push(alts);
            }
            return (include.length || exclude.length) ? { include, exclude } : null;
        }

        function defenseTermMatch(f, term) {
            return f.my.some(h => normalize(h).includes(term))
                || normalize(f.myPet).includes(term)
                || normalize(f.name).includes(term)
                || normalize(f.comment).includes(term);
        }

        function matchDefenseQuery(f, parsed) {
            for (const group of parsed.include) {
                if (!group.some(term => defenseTermMatch(f, term))) return false; // AND między grupami, OR w grupie
            }
            for (const term of parsed.exclude) {
                if (defenseTermMatch(f, term)) return false;
            }
            return true;
        }

        function renderDefenseFormations() {
            const list = $('defense-formations-list');
            if (!list) return;
            const parsedQuery = parseDefenseQuery($('defense-formation-search')?.value);

            // Liczba aktywnych przypięć dla każdego składu (jednorazowo, żeby sortowanie po users było tanie).
            // Liczymy też "same-set other arrangement" — ile graczy używa innych składów o tym samym secie.
            // Sortowanie users-*: najpierw po exact, potem same-set jako tiebreaker (np. exact 2 + same-set 2
            // wyświetli się wyżej niż exact 1 + same-set 3 — dokładne ustawienie ma priorytet).
            const usersCount = new Map();
            const sameSetCount = new Map();
            for (const f of allDefenseFormations) {
                usersCount.set(f.id, getActiveAssignmentsForFormation(f.id).length);
                sameSetCount.set(f.id, getActiveAssignmentsForSameSet(f.id).length);
            }

            const sorters = {
                'id-desc':    (a, b) => b.id - a.id,
                'id-asc':     (a, b) => a.id - b.id,
                'date-desc':  (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
                'date-asc':   (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
                'users-desc': (a, b) =>
                    usersCount.get(b.id) - usersCount.get(a.id) ||
                    sameSetCount.get(b.id) - sameSetCount.get(a.id) ||
                    b.id - a.id,
                'users-asc':  (a, b) =>
                    usersCount.get(a.id) - usersCount.get(b.id) ||
                    sameSetCount.get(a.id) - sameSetCount.get(b.id) ||
                    a.id - b.id,
            };
            let formations = [...allDefenseFormations].sort(sorters[currentDefenseSort] || sorters['id-desc']);
            if (parsedQuery) {
                formations = formations.filter(f => matchDefenseQuery(f, parsedQuery));
            }

            if (formations.length === 0) {
                list.innerHTML = `<div class="empty-state"><p>${t('defense.noFormations')}</p></div>`;
                return;
            }

            list.innerHTML = formations.map(f => {
                const active = getActiveAssignmentsForFormation(f.id);
                const sameSet = getActiveAssignmentsForSameSet(f.id);
                const usersHtml = active.length === 0
                    ? `<span style="color: var(--text-muted); font-style: italic;">${t('defense.usersZero')}</span>`
                    : active.map(a => {
                        const p = getDefensePlayer(a.playerId);
                        if (!p) return '';
                        return `<span class="defense-formation-row-user-chip" onclick="switchDefenseView('player', ${p.id})" title="${t('defense.assignedAt')}: ${formatDate(a.assignedAt)}">${escapeHtml(p.name)}</span>`;
                    }).join('');
                // Chipy graczy używających tego samego setu w innym ustawieniu — z #id docelowego składu w tytule.
                const sameSetHtml = sameSet.length === 0 ? '' : `
                    <div class="defense-formation-row-users" style="margin-top: 4px;">
                        <span style="font-size: 0.7rem; color: var(--text-muted); display: block; margin-bottom: 4px;">🔀 ${t('defense.sameSetOtherArrangement')} (${sameSet.length}):</span>
                        ${sameSet.map(a => {
                            const p = getDefensePlayer(a.playerId);
                            if (!p) return '';
                            return `<span class="defense-formation-row-user-chip" style="opacity: 0.75;" onclick="switchDefenseView('player', ${p.id})" title="${t('defense.sameSetOtherArrangement')} · #${a.formationId}">${escapeHtml(p.name)} <span style="color: var(--text-muted);">#${a.formationId}</span></span>`;
                        }).join('')}
                    </div>`;
                const sameSetBadge = sameSet.length === 0 ? '' :
                    ` <span style="color: var(--text-muted); font-weight: 400;">(+${sameSet.length} ${t('defense.sameSetShort')})</span>`;
                return `
                    <div class="defense-formation-row">
                        <div class="defense-formation-row-header">
                            <div>
                                <div class="defense-formation-row-name">${escapeHtml(f.name)} <span style="color: var(--text-muted); font-weight: 400;">#${f.id}</span></div>
                                <div class="defense-formation-row-meta">
                                    <span>📅 ${t('defense.formationCreatedAt')}: ${formatDate(f.createdAt) || '—'}</span>
                                    <span>👥 ${t('defense.usersCount')}: <strong>${active.length}</strong>${sameSetBadge}</span>
                                </div>
                            </div>
                            <div class="defense-formation-row-actions">
                                <button class="btn btn-small btn-success" onclick="openDefenseAssignModal(${f.id})">🔗 ${t('defense.assignConfirm')}</button>
                                <button class="btn btn-small btn-admin" onclick="openDefenseEditModal(${f.id})" title="${t('defense.editBtn')}">✏️</button>
                                <button class="btn btn-small btn-danger" onclick="deleteDefenseFormation(${f.id})" title="${t('defense.deleteFormation')}">🗑️</button>
                            </div>
                        </div>
                        ${renderDefenseMiniFormation(f.my, f.myPet)}
                        ${f.comment ? `<div class="defense-formation-row-meta" style="margin-bottom: 6px;">💬 ${escapeHtml(f.comment)}</div>` : ''}
                        <div class="defense-formation-row-users">${usersHtml}</div>
                        ${sameSetHtml}
                    </div>`;
            }).join('');
        }

        // ─── Render: dropdown w formularzu „Dodaj" ───────────────

        function refreshDefenseAssignDropdown() {
            const sel = $('defense-add-assign-player');
            if (!sel) return;
            const prev = sel.value;
            const livePlayers = allDefensePlayers.filter(p => !p.deletedAt).sort((a, b) => a.name.localeCompare(b.name, 'pl'));
            sel.innerHTML = `<option value="">${t('defense.noAssign')}</option>` +
                livePlayers.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
            if (prev && livePlayers.some(p => String(p.id) === prev)) sel.value = prev;
        }

        // ─── Render: widok gracza (3 składy obok siebie + historia) ───

        function renderDefensePlayerDetail() {
            const player = getDefensePlayer(currentDefensePlayerId);
            if (!player) {
                $('defense-player-content').innerHTML = `<div class="empty-state"><p>${t('preview.notFound')}</p></div>`;
                return;
            }
            $('defense-player-name').textContent = player.name;

            const active = getActiveAssignmentsForPlayer(player.id)
                .sort((a, b) => new Date(a.assignedAt) - new Date(b.assignedAt));

            // Trzymamy zawsze 3 sloty (puste do dolepienia kolejnego składu).
            const slots = [];
            for (let i = 0; i < 3; i++) slots.push(active[i] || null);

            const slotsHtml = `
                <div class="defense-player-slots">
                    ${slots.map((a, idx) => {
                        if (!a) {
                            return `<div class="defense-player-slot empty">
                                <div>${t('defense.slot')} ${idx + 1}</div>
                                <div style="margin-top: 8px;">${t('defense.emptySlot')}</div>
                            </div>`;
                        }
                        const f = getDefenseFormation(a.formationId);
                        if (!f) return `<div class="defense-player-slot empty"><div>?</div></div>`;
                        // Inni gracze używający tego samego składu (poza tym widokiem)
                        const otherUsers = getActiveAssignmentsForFormation(f.id)
                            .filter(o => o.playerId !== player.id);
                        // Inni gracze używający tego samego setu ale w innym ustawieniu — z #id docelowego składu w chipie.
                        // Walidacja zapewnia, że self-gracz nie może być w tej grupie (powtórka hero/peta blokowana).
                        const sameSetUsers = getActiveAssignmentsForSameSet(f.id);
                        const noneHere = otherUsers.length === 0 && sameSetUsers.length === 0;
                        const othersHtml = noneHere
                            ? `<div class="defense-player-slot-meta" style="font-style: italic;">👤 ${t('defense.uniqueToPlayer')}</div>`
                            : `<div class="defense-player-slot-others">
                                ${otherUsers.length === 0 ? '' : `
                                <span style="font-size: 0.7rem; color: var(--text-muted); display: block; margin-bottom: 4px;">👥 ${t('defense.alsoUsedBy')} (${otherUsers.length}):</span>
                                <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                                    ${otherUsers.map(o => {
                                        const p = getDefensePlayer(o.playerId);
                                        if (!p) return '';
                                        return `<span class="defense-formation-row-user-chip" onclick="switchDefenseView('player', ${p.id})" title="${t('defense.assignedAt')}: ${formatDate(o.assignedAt)}">${escapeHtml(p.name)}</span>`;
                                    }).join('')}
                                </div>`}
                                ${sameSetUsers.length === 0 ? '' : `
                                <span style="font-size: 0.7rem; color: var(--text-muted); display: block; margin: ${otherUsers.length === 0 ? '0' : '6px 0 4px 0'};">🔀 ${t('defense.sameSetOtherArrangement')} (${sameSetUsers.length}):</span>
                                <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                                    ${sameSetUsers.map(o => {
                                        const p = getDefensePlayer(o.playerId);
                                        if (!p) return '';
                                        return `<span class="defense-formation-row-user-chip" style="opacity: 0.75;" onclick="switchDefenseView('player', ${p.id})" title="${t('defense.sameSetOtherArrangement')} · #${o.formationId}">${escapeHtml(p.name)} <span style="color: var(--text-muted);">#${o.formationId}</span></span>`;
                                    }).join('')}
                                </div>`}
                            </div>`;
                        return `
                            <div class="defense-player-slot">
                                <div class="defense-player-slot-header">
                                    <span class="defense-player-slot-title">${t('defense.slot')} ${idx + 1} · #${f.id}</span>
                                </div>
                                <div style="font-weight: 600; color: var(--accent-gold); font-size: 0.85rem;">${escapeHtml(f.name)}</div>
                                ${renderDefenseMiniFormation(f.my, f.myPet)}
                                ${renderSpeedSection(a.id, f, a.speeds)}
                                <div class="defense-player-slot-meta">
                                    📅 ${t('defense.assignedAt')}: ${formatDate(a.assignedAt) || '—'}<br>
                                    🛠️ ${t('defense.formationCreatedAt')}: ${formatDate(f.createdAt) || '—'}
                                </div>
                                ${f.comment ? `<div class="defense-player-slot-meta">💬 ${escapeHtml(f.comment)}</div>` : ''}
                                ${othersHtml}
                                <div class="defense-player-slot-actions">
                                    <button class="btn btn-small btn-secondary" onclick="unassignDefenseFormation(${a.id})">✂️ ${t('defense.unassignBtn')}</button>
                                </div>
                            </div>`;
                    }).join('')}
                </div>`;

            // Historia: wszystkie przypięcia gracza, od najnowszego
            const history = allDefenseAssignments
                .filter(a => a.playerId === player.id)
                .sort((a, b) => new Date(b.assignedAt) - new Date(a.assignedAt));

            const historyHtml = `
                <div class="defense-history-section">
                    <div class="defense-history-title">📜 ${t('defense.historyTitle')}</div>
                    ${history.length === 0
                        ? `<div style="color: var(--text-muted); font-size: 0.8rem;">${t('defense.historyEmpty')}</div>`
                        : history.map(a => {
                            const f = getDefenseFormation(a.formationId);
                            const isActive = !a.unassignedAt;
                            const statusCls = isActive ? 'status-active' : 'status-unpinned';
                            const statusLbl = isActive ? t('defense.historyActive') : t('defense.historyUnpinned');
                            return `
                                <div class="defense-history-row">
                                    <div><strong>${f ? escapeHtml(f.name) : '?'}</strong> <span style="color: var(--text-muted);">#${a.formationId}</span></div>
                                    <div>📅 ${formatDate(a.assignedAt) || '—'} ${a.unassignedAt ? '→ ' + (formatDate(a.unassignedAt) || '—') : ''}</div>
                                    <div class="${statusCls}">${statusLbl}</div>
                                </div>`;
                        }).join('')}
                </div>`;

            $('defense-player-content').innerHTML = slotsHtml + historyHtml;
        }

        // ─── Speed per assignment ───────────────────────────────

        // Zapisuje tablicę speeds (8 elementów lub null) na assignmencie.
        // Pet pominięty — w grze nie ma speeda.
        async function setAssignmentSpeeds(assignmentId, speeds) {
            if (!isAdmin) return;
            const a = allDefenseAssignments.find(x => x.id === assignmentId);
            if (!a) return;
            try {
                await defenseAssignmentsRef.child(String(assignmentId)).update({ speeds });
                showToast('⚡ ' + t('defense.speedSaved'));
            } catch (e) {
                showToast(t('common.error') + ': ' + e.message, true);
            }
        }

        // Toggle edytor speeda w slocie. Edytor jest inline w samym kafelku slotu — nie modal.
        function toggleSpeedEditor(assignmentId) {
            const editor = $(`speed-editor-${assignmentId}`);
            const display = $(`speed-display-${assignmentId}`);
            if (!editor || !display) return;
            const isOpen = editor.style.display !== 'none';
            editor.style.display = isOpen ? 'none' : 'block';
            display.style.display = isOpen ? 'block' : 'none';
        }

        async function saveSpeedEditor(assignmentId) {
            const speeds = [];
            for (let i = 0; i < 8; i++) {
                const el = $(`speed-input-${assignmentId}-${i}`);
                if (!el) { speeds.push(null); continue; }
                const raw = el.value.trim();
                if (!raw) { speeds.push(null); continue; }
                const n = parseInt(raw, 10);
                if (isNaN(n) || n <= 0) {
                    showToast('❌ ' + t('defense.speedInvalidNumber') + ' (poz. ' + (i + 1) + ')', true);
                    return;
                }
                speeds.push(n);
            }
            const allNull = speeds.every(s => s === null);
            await setAssignmentSpeeds(assignmentId, allNull ? null : speeds);
            // Listener z .on('value') pociągnie świeże dane i rerenderuje
        }

        // Renderuje pasek timeline + przycisk edycji + ukryty panel edycji (8 inputów obok nazw bohaterów).
        function renderSpeedSection(assignmentId, formation, speeds) {
            const filled = (speeds || []).map((s, i) => ({ slot: i, hero: formation.my[i], speed: s }))
                .filter(x => x.speed != null && x.hero);
            const total = formation.my.filter(h => h).length;
            const filledCount = filled.length;

            // Pasek timeline (jak są jakieś speedy) lub link "+ Dodaj"
            const timelineHtml = filledCount === 0
                ? `<span style="font-size: 0.7rem; color: var(--text-muted); font-style: italic;">⚡ ${t('defense.speedEmpty')}</span>
                   <button class="btn btn-tiny btn-secondary" onclick="toggleSpeedEditor(${assignmentId})" style="margin-left: 6px;">${t('defense.speedAdd')}</button>`
                : (() => {
                    const sorted = [...filled].sort((a, b) => b.speed - a.speed);
                    const chips = sorted.map(x => {
                        const hero = findHero(x.hero);
                        const rc = hero ? `race-${hero.race.toLowerCase()}` : '';
                        return `<span class="defense-speed-chip"><span class="${rc}">${escapeHtml(x.hero)}</span> <strong>${x.speed}</strong></span>`;
                    }).join('<span class="defense-speed-arrow">→</span>');
                    const partial = filledCount < total
                        ? `<span style="font-size: 0.65rem; color: var(--text-muted); margin-left: 6px;">(${t('defense.speedPartial').replace('{n}', filledCount).replace('{total}', total)})</span>`
                        : '';
                    return `<div class="defense-speed-timeline">⚡ ${chips}${partial}
                              <button class="btn btn-tiny btn-secondary" onclick="toggleSpeedEditor(${assignmentId})" title="${t('defense.speedEdit')}" style="margin-left: 6px;">✏️</button>
                            </div>`;
                })();

            // Panel edycji — 8 inputów obok 8 nazw, pet pominięty
            const editorRows = formation.my.map((h, i) => {
                if (!h) return '';
                const currentVal = (speeds && speeds[i] != null) ? speeds[i] : '';
                const hero = heroes.find(x => x.name.toLowerCase() === h.toLowerCase());
                const rc = hero ? `race-${hero.race.toLowerCase()}` : '';
                return `<div class="defense-speed-row">
                            <span class="${rc}" style="font-size: 0.75rem; flex: 1;">${escapeHtml(h)}</span>
                            <input type="number" min="1" id="speed-input-${assignmentId}-${i}" value="${currentVal}" placeholder="—" class="defense-speed-input">
                        </div>`;
            }).join('');

            return `
                <div id="speed-display-${assignmentId}" class="defense-speed-display">${timelineHtml}</div>
                <div id="speed-editor-${assignmentId}" class="defense-speed-editor" style="display: none;">
                    <div style="font-size: 0.7rem; color: var(--text-muted); margin-bottom: 6px;">⚡ ${t('defense.speedTitle')} (pet pominięty)</div>
                    ${editorRows}
                    <div style="display: flex; gap: 4px; margin-top: 6px;">
                        <button class="btn btn-tiny btn-success" onclick="saveSpeedEditor(${assignmentId})">💾 ${t('defense.speedSave')}</button>
                        <button class="btn btn-tiny btn-secondary" onclick="toggleSpeedEditor(${assignmentId})">${t('defense.speedCancel')}</button>
                    </div>
                </div>`;
        }


        // ─── Helpery ─────────────────────────────────────────────

        function escapeHtml(str) {
            return String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
        }

        // Mini-grid składu obronnego (3-2-3 + pet) — kompaktowa wizualizacja do listy i kafelków gracza.
        function renderDefenseMiniFormation(my, pet) {
            const slot = i => {
                const name = my[i] || '';
                if (!name) return `<div class="defense-mini-slot empty"></div>`;
                const hero = findHero(name);
                const rc = hero ? `race-${hero.race.toLowerCase()}` : '';
                return `<div class="defense-mini-slot slot-clickable" onclick="event.stopPropagation();showHeroSkills('${jsStr(name)}')"><span class="${rc}">${escapeHtml(name)}</span></div>`;
            };
            const petHtml = pet
                ? `<div class="defense-mini-pet slot-clickable" onclick="event.stopPropagation();showPetSkills('${jsStr(pet)}')">🐾 ${escapeHtml(pet)}</div>`
                : `<div class="defense-mini-pet empty">🐾 —</div>`;
            return `
                <div class="defense-mini-grid">
                    <div class="defense-mini-row">${slot(0)}${slot(1)}${slot(2)}</div>
                    <div class="defense-mini-row">${slot(3)}${slot(4)}</div>
                    <div class="defense-mini-row">${slot(5)}${slot(6)}${slot(7)}</div>
                    ${petHtml}
                </div>`;
        }

        // Pełny rerender po jakimkolwiek update — tanio, bo dane gildii są małe.
        function rerenderDefenseCurrent() {
            if (currentDefenseView === 'players') renderDefensePlayersList();
            else if (currentDefenseView === 'formations') renderDefenseFormations();
            else if (currentDefenseView === 'player') renderDefensePlayerDetail();
            else if (currentDefenseView === 'add') refreshDefenseAssignDropdown();
        }


        // ═══════════════════════════════════════════════════════════
        // TAB: SETTINGS + ADMIN — import/export CSV, zarządzanie bazą, duplikaty
        // ═══════════════════════════════════════════════════════════

        // =====================================================
        // IMPORT / EKSPORT
        // =====================================================
		function exportToCSV(scope) {
			const src = scope === 'favorites' ? allFormations.filter(f => favorites.includes(f.id))
				: scope === 'user' ? allFormations.filter(f => !f.isBase)
				: scope === 'base' ? allFormations.filter(f => f.isBase)
				: allFormations;
			const headers = [
				'Lp', 'Nazwa',
				'moja1', 'moja2', 'moja3', 'moja4', 'moja5', 'moja6', 'moja7', 'moja8', 'mojPet',
				'enemy1', 'enemy2', 'enemy3', 'enemy4', 'enemy5', 'enemy6', 'enemy7', 'enemy8', 'enemyPet',
				'Komentarz', 'CzyBazowa'
			];
			
			const escapeCSV = (val) => {
				const str = String(val || '');
				// Jeśli zawiera przecinek, średnik, cudzysłów lub nową linię - owijamy w cudzysłowy
				if (str.includes(';') || str.includes(',') || str.includes('"') || str.includes('\n')) {
					return `"${str.replace(/"/g, '""')}"`;
				}
				return str;
			};
			
			const rows = src.map(f => {
				// Upewnij się że my i enemy mają 8 elementów
				const myArr = [...(f.my || [])];
				const enemyArr = [...(f.enemy || [])];
				while (myArr.length < 8) myArr.push('');
				while (enemyArr.length < 8) enemyArr.push('');
				
				return [
					f.id,
					escapeCSV(f.name),
					...myArr.map(h => escapeCSV(h)),
					escapeCSV(f.myPet),
					...enemyArr.map(h => escapeCSV(h)),
					escapeCSV(f.enemyPet),
					escapeCSV(f.comment),
					f.isBase ? '1' : '0'
				].join(';');
			});
			
			const blob = new Blob(['\ufeff' + [headers.join(';'), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
			const a = document.createElement('a');
			a.href = URL.createObjectURL(blob);
			a.download = `TABELA_${new Date().toISOString().slice(0,10)}.csv`;
			a.click();
			showToast(`${t('settings.exported')} ${src.length} ${t('status.formations')}`);
		}

        // Fingerprint formacji do dedupu (zgodny z checkForExactDuplicate): posortowane nazwy + pety, case-insensitive.
        function formationFingerprint(my, myPet, enemy, enemyPet) {
            const norm = arr => (arr || []).filter(h => h).map(h => String(h).toLowerCase().trim()).sort().join('|');
            return norm(my) + '#' + String(myPet || '').toLowerCase().trim() + '##' + norm(enemy) + '#' + String(enemyPet || '').toLowerCase().trim();
        }

        // Pełna kopia zapasowa do JSON: formacje + bohaterowie + pety + cała Obrona. Read-only (bezpieczne).
        function exportBackupJSON() {
            const backup = {
                _meta: { app: 'souls-war', version: 1, exportedAt: new Date().toISOString() },
                formations: allFormations,
                heroes: heroes,
                pets: pets,
                defenseFormations: allDefenseFormations,
                defensePlayers: allDefensePlayers,
                defenseAssignments: allDefenseAssignments
            };
            const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8;' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `souls-war-backup_${new Date().toISOString().slice(0,10)}.json`;
            a.click();
            localStorage.setItem('souls_last_backup', new Date().toISOString());
            renderImportStats();
            showToast(`💾 ${t('settings.backupDone')} (${allFormations.length} + ${allDefenseFormations.length})`);
        }

        // Przywracanie z kopii JSON — DODAJE tylko nowe rekordy (pomija istniejące po ID/fingerprincie/nazwie),
        // zachowuje oryginalne ID (więc referencje Obrony zostają spójne), NIGDY nic nie kasuje/nadpisuje.
        async function restoreBackupJSON(event) {
            const file = event.target.files[0];
            if (!file) return;
            if (!isOnline) { showToast(t('common.noConnection'), true); return; }
            const reader = new FileReader();
            reader.onload = async e => {
                try {
                    const data = JSON.parse(e.target.result);
                    if (!data || typeof data !== 'object' || (data._meta && data._meta.app && data._meta.app !== 'souls-war')) { showToast(t('settings.restoreBad'), true); return; }
                    if (!data.formations && !data.defenseFormations && !data.heroes && !data.pets) { showToast(t('settings.restoreBad'), true); return; }
                    const arr = x => Array.isArray(x) ? x : [];
                    const F = arr(data.formations), H = arr(data.heroes), P = arr(data.pets),
                          DF = arr(data.defenseFormations), DP = arr(data.defensePlayers), DA = arr(data.defenseAssignments);
                    const fIds = new Set(allFormations.map(f => f.id));
                    const fFps = new Set(allFormations.map(f => formationFingerprint(f.my, f.myPet, f.enemy, f.enemyPet)));
                    const hNames = new Set(heroes.map(h => String(h.name || '').toLowerCase()));
                    const pNames = new Set(pets.map(p => String(typeof p === 'string' ? p : (p && p.name) || '').toLowerCase()));
                    const dfIds = new Set(allDefenseFormations.map(x => x.id));
                    const dpIds = new Set(allDefensePlayers.map(x => x.id));
                    const daIds = new Set(allDefenseAssignments.map(x => x.id));
                    const newF = F.filter(f => f && f.id != null && !fIds.has(f.id) && !fFps.has(formationFingerprint(f.my, f.myPet, f.enemy, f.enemyPet)));
                    const validKey = k => k && !/[.#$\[\]\/]/.test(String(k)); // klucze Firebase nie mogą mieć . # $ [ ] /
                    const newH = H.filter(h => h && validKey(h.name) && !hNames.has(String(h.name).toLowerCase()));
                    const newP = P.filter(p => { const n = typeof p === 'string' ? p : (p && p.name); return validKey(n) && !pNames.has(String(n).toLowerCase()); });
                    const newDF = DF.filter(x => x && x.id != null && !dfIds.has(x.id));
                    const newDP = DP.filter(x => x && x.id != null && !dpIds.has(x.id));
                    const newDA = DA.filter(x => x && x.id != null && !daIds.has(x.id));
                    const total = newF.length + newH.length + newP.length + newDF.length + newDP.length + newDA.length;
                    if (!total) { showToast(t('settings.restoreNothing')); return; }
                    pendingRestore = { newF, newH, newP, newDF, newDP, newDA, total };
                    showRestoreDiff();
                } catch (err) {
                    console.error('Restore error:', err);
                    showToast(`${t('common.error')}: ${err.message}`, true);
                }
            };
            reader.readAsText(file);
            event.target.value = '';
        }

        // Import umiejętności → /heroSkills lub /petSkills (kind: 'hero'|'pet'). Osobny nod — NIE rusza /heroes/pets/formacji.
        // MERGE: brakujące dodaje automatycznie; istniejące identyczne zostawia; różniące się → diff do decyzji usera.
        let pendingSkillsImport = null;
        async function importSkillsFile(event, kind) {
            const file = event.target.files[0];
            if (!file) return;
            if (!isOnline) { showToast(t('common.noConnection'), true); return; }
            const isPet = kind === 'pet';
            const reader = new FileReader();
            reader.onload = async e => {
                try {
                    const data = JSON.parse(e.target.result);
                    if (!data || typeof data !== 'object' || Array.isArray(data)) { showToast(t('settings.skillsBadFile'), true); return; }
                    if (isPet) await loadPetSkills(); else await loadHeroSkills(); // aktualny stan bazy do porównania
                    const cache = isPet ? allPetSkills : allHeroSkills;
                    const matcher = isPet ? (n => pets.some(p => normalize(p) === normalize(n))) : (n => !!findHero(n));
                    const validKey = k => k && !/[.#$\[\]\/]/.test(String(k)); // klucze Firebase nie mogą mieć . # $ [ ] /
                    const entries = Object.entries(data).filter(([k, v]) => validKey(k) && v && typeof v === 'object');
                    if (!entries.length) { showToast(t('settings.skillsBadFile'), true); return; }
                    const isNew = [], changed = [];
                    entries.forEach(([k, v]) => {
                        const cur = cache[k];
                        if (cur === undefined) isNew.push([k, v]);
                        else if (JSON.stringify(cur) !== JSON.stringify(v)) changed.push([k, v]);
                    });
                    const unmatched = entries.filter(([k]) => !matcher(k)).map(([k]) => k); // klucze bez bohatera/peta w żywej bazie
                    if (!isNew.length && !changed.length) { showToast(t('settings.skillsUpToDate')); return; }
                    pendingSkillsImport = { isNew, changed, unmatched, kind };
                    showSkillsImportDiff();
                } catch (err) {
                    console.error('Import skilli error:', err);
                    showToast(`${t('common.error')}: ${err.message}`, true);
                }
            };
            reader.readAsText(file);
            event.target.value = '';
        }
        function importHeroSkillsJSON(event) { return importSkillsFile(event, 'hero'); }
        function importPetSkillsJSON(event) { return importSkillsFile(event, 'pet'); }

        // Eksport /heroSkills i /petSkills do JSON (ten sam format co import — symetrycznie). Read-only.
        function downloadJSONFile(obj, filename) {
            const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json;charset=utf-8;' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            a.click();
        }
        async function exportHeroSkillsJSON() {
            if (!isOnline) { showToast(t('common.noConnection'), true); return; }
            await loadHeroSkills();
            const n = Object.keys(allHeroSkills).length;
            if (!n) { showToast(t('settings.skillsExportEmpty'), true); return; }
            downloadJSONFile(allHeroSkills, 'heroSkills.json');
            showToast(`💾 ${t('settings.skillsExported', { n })}`);
        }
        async function exportPetSkillsJSON() {
            if (!isOnline) { showToast(t('common.noConnection'), true); return; }
            await loadPetSkills();
            const n = Object.keys(allPetSkills).length;
            if (!n) { showToast(t('settings.skillsExportEmpty'), true); return; }
            downloadJSONFile(allPetSkills, 'petSkills.json');
            showToast(`💾 ${t('settings.skillsExported', { n })}`);
        }

        // Podgląd importu skilli: nowe (auto-dodane) + różnice (checkboxy do nadpisania) + ostrzeżenie o niedopasowanych.
        function showSkillsImportDiff() {
            const p = pendingSkillsImport;
            if (!p) return;
            const none = `<div class="hsk-diff-none">${t('settings.diffNone')}</div>`;
            const newList = p.isNew.length ? p.isNew.map(([k]) => `<div>➕ ${escSkill(k)}</div>`).join('') : none;
            const changedList = p.changed.length
                ? p.changed.map(([k], i) => `<label class="hsk-diff-row"><input type="checkbox" class="hsk-diff-chk" data-i="${i}" checked> ⚠️ ${escSkill(k)}</label>`).join('')
                : none;
            const warn = p.unmatched.length ? `<div class="hsk-diff-warn">⚠️ ${p.unmatched.length} ${t('settings.skillsUnmatched')}: ${escSkill(p.unmatched.join(', '))}</div>` : '';
            $('skills-import-body').innerHTML =
                `<div class="hsk-diff-sec"><h4>➕ ${t('settings.skillsNew')} (${p.isNew.length})</h4>${newList}</div>`
                + `<div class="hsk-diff-sec"><h4>⚠️ ${t('settings.skillsChanged')} (${p.changed.length})</h4>${changedList}</div>`
                + warn;
            if ($('skills-import-confirm')) $('skills-import-confirm').textContent = `✓ ${t('settings.skillsApply')}`;
            $('skills-import-modal').classList.add('show');
        }
        function closeSkillsImport() { $('skills-import-modal')?.classList.remove('show'); pendingSkillsImport = null; }
        async function confirmSkillsImport() {
            const p = pendingSkillsImport;
            if (!p) return;
            const chosen = [];
            document.querySelectorAll('#skills-import-body .hsk-diff-chk').forEach(chk => { if (chk.checked) chosen.push(p.changed[+chk.dataset.i]); });
            const toWrite = p.isNew.concat(chosen); // nowe zawsze + zaznaczone różnice
            const kind = p.kind;
            $('skills-import-modal').classList.remove('show');
            pendingSkillsImport = null;
            if (!toWrite.length) { showToast(t('settings.skillsNothing')); return; }
            const ref = kind === 'pet' ? petSkillsRef : heroSkillsRef;
            try {
                const writes = toWrite.map(([k, v]) => () => ref.child(k).set(v));
                for (let i = 0; i < writes.length; i += 200) await Promise.all(writes.slice(i, i + 200).map(fn => fn()));
                if (kind === 'pet') await loadPetSkills(true); else await loadHeroSkills(true); // odśwież cache
                if ($('tab-heroes')?.classList.contains('active')) renderHeroesGrid();
                showToast(`✅ ${t('settings.skillsImported', { n: toWrite.length })}`);
            } catch (err) {
                console.error('Import skilli error:', err);
                showToast(`${t('common.error')}: ${err.message}`, true);
            }
        }

        // ── Zakładka Import: statystyki, podgląd diff restore, Obrona CSV ──
        let pendingRestore = null;

        // Liczniki bazy + etykieta ostatniej kopii (wołane przy wejściu na zakładkę Import).
        function renderImportStats() {
            const base = allFormations.filter(f => f.isBase).length;
            const fav = allFormations.filter(f => favorites.includes(f.id)).length;
            if ($('stat-formations')) $('stat-formations').textContent = allFormations.length.toLocaleString('pl-PL');
            if ($('stat-formations-sub')) $('stat-formations-sub').textContent = `${t('settings.statBase')} ${base} · ${t('settings.statUser')} ${allFormations.length - base} · ⭐ ${fav}`;
            const players = allDefensePlayers.filter(p => !p.deletedAt).length;
            const pins = allDefenseAssignments.filter(a => !a.unassignedAt).length;
            if ($('stat-defense')) $('stat-defense').textContent = allDefenseFormations.length;
            if ($('stat-defense-sub')) $('stat-defense-sub').textContent = `${t('settings.statPlayers')} ${players} · ${t('settings.statPins')} ${pins}`;
            if ($('stat-heroes')) $('stat-heroes').textContent = heroes.length;
            if ($('stat-pets')) $('stat-pets').textContent = pets.length;
            const last = localStorage.getItem('souls_last_backup');
            if ($('last-backup-label')) $('last-backup-label').textContent = last ? `${t('settings.lastBackup')}: ${formatDate(last)}` : t('settings.noBackup');
        }

        // Podgląd diff przed przywróceniem (modal). pendingRestore ustawia restoreBackupJSON.
        function showRestoreDiff() {
            if (!pendingRestore) return;
            const p = pendingRestore;
            const esc = s => String(s == null ? '' : s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
            const cat = (label, items, render) => {
                const shown = items.slice(0, 30).map(render).join('');
                const more = items.length > 30 ? `<div style="color:var(--text-muted)">… +${items.length - 30}</div>` : '';
                const body = items.length ? shown + more : `<div style="color:var(--text-muted)">${t('settings.diffNone')}</div>`;
                return `<div class="diff-cat"><div class="diff-cat-head" onclick="this.parentElement.classList.toggle('open')"><span class="admin-toggle-icon">▶</span> ${label} <span class="c">+${items.length}</span></div><div class="diff-list">${body}</div></div>`;
            };
            let html = cat(t('settings.statFormations'), p.newF, f => `<div>#${esc(f.id)} — ${esc(f.name)}</div>`);
            html += cat(t('settings.statHeroes'), p.newH, h => `<div>${esc(h.name)}</div>`);
            html += cat(t('settings.statPets'), p.newP, x => `<div>${esc(typeof x === 'string' ? x : x && x.name)}</div>`);
            html += cat(t('settings.statDefense'), p.newDF, x => `<div>${esc(x.name || '#' + x.id)}</div>`);
            html += cat(t('settings.statPlayers'), p.newDP, x => `<div>${esc(x.name || '#' + x.id)}</div>`);
            html += cat(t('settings.statPins'), p.newDA, x => `<div>#${esc(x.id)}</div>`);
            $('restore-diff-body').innerHTML = html;
            if ($('restore-confirm-btn')) $('restore-confirm-btn').innerHTML = `✓ ${t('settings.restoreBtn')} (+${p.total})`;
            $('restore-diff-modal').classList.add('show');
        }
        function closeRestoreDiff() { $('restore-diff-modal').classList.remove('show'); pendingRestore = null; }
        async function confirmRestore() {
            if (!pendingRestore) return;
            const p = pendingRestore;
            $('restore-diff-modal').classList.remove('show');
            try {
                const writes = [];
                p.newF.forEach(f => writes.push(() => formationsRef.child(String(f.id)).set(f)));
                p.newH.forEach(h => writes.push(() => heroesRef.child(h.name).set({ name: h.name, race: h.race || 'Human' })));
                p.newP.forEach(x => { const n = typeof x === 'string' ? x : x.name; writes.push(() => petsRef.child(n).set({ name: n })); });
                p.newDF.forEach(x => writes.push(() => defenseFormationsRef.child(String(x.id)).set(x)));
                p.newDP.forEach(x => writes.push(() => defensePlayersRef.child(String(x.id)).set(x)));
                p.newDA.forEach(x => writes.push(() => defenseAssignmentsRef.child(String(x.id)).set(x)));
                for (let i = 0; i < writes.length; i += 200) await Promise.all(writes.slice(i, i + 200).map(fn => fn()));
                if (p.newH.length) ensureHeroFolders(false, p.newH); // dosej foldery galerii dla dodanych bohaterów
                showToast(`♻️ ${t('settings.restoreDone')} (+${p.total})`);
            } catch (err) { console.error('Restore error:', err); showToast(`${t('common.error')}: ${err.message}`, true); }
            pendingRestore = null;
        }

        // Eksport składów Obrony do CSV (same kompozycje; pełna Obrona z przypięciami siedzi w kopii JSON).
        function exportDefenseCSV() {
            const headers = ['id', 'name', 'my1', 'my2', 'my3', 'my4', 'my5', 'my6', 'my7', 'my8', 'myPet', 'comment'];
            const esc = v => { const s = String(v == null ? '' : v); return /[;,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
            const rows = allDefenseFormations.map(f => {
                const my = [...(f.my || [])]; while (my.length < 8) my.push('');
                return [f.id, esc(f.name), ...my.map(esc), esc(f.myPet), esc(f.comment)].join(';');
            });
            const blob = new Blob(['﻿' + [headers.join(';'), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `OBRONA_${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            showToast(`${t('settings.exported')} ${allDefenseFormations.length}`);
        }

        async function importDefenseCSV(event) {
            const file = event.target.files[0];
            if (!file) return;
            if (!isOnline) { showToast(t('common.noConnection'), true); return; }
            const reader = new FileReader();
            reader.onload = async e => {
                try {
                    const text = e.target.result;
                    const sep = ((text.split(/\r?\n/, 1)[0]) || '').includes(';') ? ';' : ',';
                    const rows = parseCSV(text, sep).filter(r => r.some(c => c.trim() !== ''));
                    if (rows.length < 2) { showToast(t('settings.importEmpty'), true); return; }
                    const seen = new Set(allDefenseFormations.map(f => f.fingerprint));
                    const existingIds = new Set(allDefenseFormations.map(f => f.id));
                    let maxId = allDefenseFormations.length ? Math.max(...allDefenseFormations.map(f => f.id)) : 0;
                    const toAdd = []; let skipped = 0, dupes = 0;
                    for (let i = 1; i < rows.length; i++) {
                        const v = rows[i];
                        if (v.length < 11) { skipped++; continue; }
                        const b = (v[0] || '').match(/^\d+$/) ? 1 : 0;
                        const my = v.slice(b + 1, b + 9).map(cleanVal);
                        const myPet = cleanVal(v[b + 9]);
                        const comment = cleanVal(v[b + 10]);
                        const fp = defenseFingerprint(my, myPet);
                        if (seen.has(fp)) { dupes++; continue; }
                        seen.add(fp);
                        while (existingIds.has(++maxId));
                        existingIds.add(maxId);
                        toAdd.push({ id: maxId, my, myPet, name: cleanVal(v[b]) || `Import #${maxId}`, comment, createdAt: new Date().toISOString(), fingerprint: fp });
                    }
                    if (!toAdd.length) { showToast(`${t('settings.importNothing')} (${dupes} ${t('settings.importDupes')}, ${skipped} ${t('settings.importSkipped')})`, true); return; }
                    if (!confirm(`${t('settings.importConfirm')} ${toAdd.length}\n${dupes} ${t('settings.importDupes')}, ${skipped} ${t('settings.importSkipped')}`)) return;
                    await Promise.all(toAdd.map(f => defenseFormationsRef.child(String(f.id)).set(f)));
                    showToast(`${t('settings.imported')} ${toAdd.length}`);
                } catch (err) { console.error('Defense import error:', err); showToast(`${t('common.error')}: ${err.message}`, true); }
            };
            reader.readAsText(file);
            event.target.value = '';
        }

        // Pełny parser CSV (RFC-4180): obsługuje cudzysłowy, podwojone "" i znaki nowej linii wewnątrz pól.
        function parseCSV(text, sep) {
            const rows = [];
            let row = [], field = '', inQuotes = false;
            for (let i = 0; i < text.length; i++) {
                const c = text[i];
                if (inQuotes) {
                    if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
                    else field += c;
                } else if (c === '"') inQuotes = true;
                else if (c === sep) { row.push(field); field = ''; }
                else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
                else if (c !== '\r') field += c;
            }
            if (field !== '' || row.length) { row.push(field); rows.push(row); }
            return rows;
        }

		async function importFromCSV(event) {
			const file = event.target.files[0];
			if (!file) return;
			if (!isOnline) { showToast(t('common.noConnection'), true); return; }
			
			const reader = new FileReader();
			reader.onload = async e => {
				try {
					const sep = ((e.target.result.split(/\r?\n/, 1)[0]) || '').includes(';') ? ';' : ',';
						const lines = parseCSV(e.target.result, sep).filter(r => r.some(c => c.trim() !== ''));
					if (lines.length < 2) { showToast(t('settings.importEmpty'), true); return; }
					
					// separator wyznaczony wyżej przy parsowaniu (parseCSV)
					const headers = (lines[0] || []).map(h => h.toLowerCase().trim());
					
					// Sprawdź czy mamy nowy format (z komentarzem) czy stary
					const hasComment = headers.includes('komentarz') || headers.length >= 22;
					
					let imported = 0, skipped = 0, dupes = 0;
						const seen = new Set(allFormations.map(f => formationFingerprint(f.my, f.myPet, f.enemy, f.enemyPet)));
						const toAdd = [];
					let maxId = allFormations.length ? Math.max(...allFormations.map(f => f.id)) : 0;
					const existingIds = allFormations.map(f => f.id);
					
					for (let i = 1; i < lines.length; i++) {
						const vals = lines[i];
						if (vals.length < 20) { skipped++; continue; }
						
						// Określ czy pierwsza kolumna to ID
						const startIdx = vals[0].match(/^\d+$/) ? 1 : 0;
						
						// Generuj nowe unikalne ID
						while (existingIds.includes(++maxId));
						existingIds.push(maxId);
						
						// Parsuj pola
						const myHeroes = vals.slice(startIdx + 1, startIdx + 9).map(cleanVal);
						const myPet = cleanVal(vals[startIdx + 9]);
						const enemyHeroes = vals.slice(startIdx + 10, startIdx + 18).map(cleanVal);
						const enemyPet = cleanVal(vals[startIdx + 18]);
						const __fp = formationFingerprint(myHeroes, myPet, enemyHeroes, enemyPet);
						if (seen.has(__fp)) { dupes++; continue; }
						seen.add(__fp);
						
						// Komentarz i isBase (jeśli dostępne)
						let comment = '';
						let isBase = false;
						
						if (hasComment && vals.length >= startIdx + 21) {
							comment = cleanVal(vals[startIdx + 19]);
							isBase = cleanVal(vals[startIdx + 20]) === '1';
						}
						
						toAdd.push({
							id: maxId,
							name: cleanVal(vals[startIdx]) || `Import #${maxId}`,
							my: myHeroes,
							myPet: myPet,
							enemy: enemyHeroes,
							enemyPet: enemyPet,
							comment: comment,
							isBase: isBase,
							dateAdded: new Date().toISOString()
						});
						imported++;
					}
					
					if (!toAdd.length) { showToast(`${t('settings.importNothing')} (${dupes} ${t('settings.importDupes')}, ${skipped} ${t('settings.importSkipped')})`, true); return; }
						if (!confirm(`${t('settings.importConfirm')} ${toAdd.length}\n${dupes} ${t('settings.importDupes')}, ${skipped} ${t('settings.importSkipped')}`)) return;
						await Promise.all(toAdd.map(f => formationsRef.child(String(f.id)).set(f)));
						let msg = `${t('settings.imported')} ${toAdd.length} ${t('status.formations')}!`;
					if (dupes > 0) msg += ` (${dupes} ${t('settings.importDupes')})`;
						if (skipped > 0) msg += ` (${skipped} ${t('settings.importSkipped')})`;
					showToast(msg);
					
				} catch (e) { 
					console.error('Import error:', e);
					showToast(`${t('common.error')}: ${e.message}`, true); 
				}
			};
			reader.readAsText(file);
			event.target.value = '';
		}

        // Zwijanie/rozwijanie sekcji panelu admina (Bohaterowie / Pety) — domyślnie rozwinięte
        function toggleAdminSection(key) {
            const body = $(key + '-body'), icon = $(key + '-toggle');
            if (!body) return;
            const willShow = body.style.display === 'none';
            body.style.display = willShow ? '' : 'none';
            if (icon) icon.textContent = willShow ? '▼' : '▶';
        }

        // Koloruje zamknięty <select> rasy kolorem aktualnie wybranej opcji
        function styleRaceSelect(sel) { if (sel) sel.style.color = sel.options[sel.selectedIndex]?.style.color || ''; }

        // Stała kolejność ras w panelu admina (życzenie: Dark, Light, Human, Horde, Elf, Undead)
        const ADMIN_RACE_ORDER = ['Dark', 'Light', 'Human', 'Fire', 'Elf', 'Undead'];
        let editingHeroName = null; // bohater aktualnie w trybie inline-edycji (po nazwie)

        function renderHeroesList() {
            $('admin-heroes-count').textContent = heroes.length;
            // Jednolita szerokość kafelka = najdłuższa nazwa (+ miejsce na ✏️🗑️ i padding)
            const maxLen = heroes.reduce((m, h) => Math.max(m, h.name.length), 4);
            $('heroes-list').style.setProperty('--tile-w', (maxLen + 9) + 'ch');
            const byRace = {};
            heroes.forEach(h => { (byRace[h.race] = byRace[h.race] || []).push(h); });

            // Rasy w ustalonej kolejności + ewentualne nieznane na końcu
            const races = [...ADMIN_RACE_ORDER.filter(r => byRace[r]),
                           ...Object.keys(byRace).filter(r => !ADMIN_RACE_ORDER.includes(r))];

            // Pasek: seed/synchronizacja folderów galerii bohaterów (Heroes → per-bohater → Mastery).
            const seedRow = `<div class="admin-seed-row"><button class="btn-secondary admin-seed-btn" onclick="ensureHeroFolders(true)">🦸 ${t('heroGallery.syncBtn')}</button><span class="admin-seed-hint">${t('heroGallery.syncHint')}</span></div>`;
            $('heroes-list').innerHTML = seedRow + (races.map(r => {
                const rc = r.toLowerCase();
                const list = byRace[r].slice().sort((a, b) => a.name.localeCompare(b.name, 'pl'));
                const tiles = list.map(h => h.name === editingHeroName
                    ? renderHeroEditRow(h, rc)
                    : `<div class="admin-tile" style="background:color-mix(in srgb, var(--race-${rc}) 13%, var(--bg-card)); border-color:var(--race-${rc})">
                            <span class="admin-tile-name">${escapeHtml(h.name)}</span>
                            <div class="admin-tile-actions">
                                <button class="btn-icon" onclick="startHeroEdit('${jsStr(h.name)}')" title="${t('admin.editHero')}">✏️</button>
                                <button class="btn-icon btn-icon-danger" onclick="deleteHero('${jsStr(h.name)}')" title="${t('admin.confirmDeleteHero')}">🗑️</button>
                            </div>
                        </div>`
                ).join('');
                return `<div class="admin-race-group">
                    <div class="admin-race-header" style="color:var(--race-${rc})">${RACE_EMOJI[r] || ''} ${raceLabel(r)} (${list.length})</div>
                    <div class="admin-tile-grid">${tiles}</div>
                </div>`;
            }).join('') || `<p style="color:var(--text-muted);text-align:center;">${t('database.noFormations')}</p>`);
        }

        function renderHeroEditRow(h, rc) {
            const opts = ADMIN_RACE_ORDER.map(opt =>
                `<option value="${opt}" style="color:var(--race-${opt.toLowerCase()})"${opt === h.race ? ' selected' : ''}>${raceLabel(opt)}</option>`).join('');
            return `<div class="admin-tile editing" style="border-color:var(--race-${rc})">
                <input type="text" id="edit-hero-name" class="admin-hero-edit-name" value="${escapeHtml(h.name)}" autocomplete="off">
                <select id="edit-hero-race" class="admin-hero-edit-race" onchange="styleRaceSelect(this)">${opts}</select>
                <div class="admin-tile-actions">
                    <button class="btn-icon btn-icon-save" onclick="saveHeroEdit('${jsStr(h.name)}')" title="${t('common.save')}">✔️</button>
                    <button class="btn-icon" onclick="cancelHeroEdit()" title="${t('common.cancel')}">✖️</button>
                </div>
            </div>`;
        }

        function startHeroEdit(name) { editingHeroName = name; renderHeroesList(); styleRaceSelect($('edit-hero-race')); $('edit-hero-name')?.focus(); }
        function cancelHeroEdit() { editingHeroName = null; renderHeroesList(); }

        // Rename bohatera propagujemy do /formations (my+enemy) i /defenseFormations (my + nowy fingerprint),
        // żeby nie zostały sieroty referencji. Zwraca liczbę zmienionych rekordów.
        // Fingerprint obrony aktualizujemy in-place bezpiecznie: rename to bijekcja nazw (oldName→newName
        // jednolicie), a blokada heroExists gwarantuje że newName nie koliduje z innym bohaterem — więc
        // dwa różne składy nie mogą skleić się w ten sam fingerprint.
        async function propagateHeroRename(oldName, newName) {
            const lo = oldName.toLowerCase();
            let count = 0;
            const fUpdates = {};
            allFormations.forEach(f => {
                let changed = false;
                const my = (f.my || []).map(x => (x && x.toLowerCase() === lo) ? (changed = true, newName) : x);
                const enemy = (f.enemy || []).map(x => (x && x.toLowerCase() === lo) ? (changed = true, newName) : x);
                if (changed) { fUpdates[`${f.id}/my`] = my; fUpdates[`${f.id}/enemy`] = enemy; count++; }
            });
            if (Object.keys(fUpdates).length) await formationsRef.update(fUpdates);

            if (defenseFormationsRef) {
                const dUpdates = {};
                allDefenseFormations.forEach(df => {
                    let changed = false;
                    const my = (df.my || []).map(x => (x && x.toLowerCase() === lo) ? (changed = true, newName) : x);
                    if (changed) {
                        dUpdates[`${df.id}/my`] = my;
                        dUpdates[`${df.id}/fingerprint`] = defenseFingerprint(my, df.myPet);
                        count++;
                    }
                });
                if (Object.keys(dUpdates).length) await defenseFormationsRef.update(dUpdates);
            }
            // Foldery galerii bohatera trzymają się przez heroKey — przy rename przepisz heroKey (+ nazwę folderu bohatera).
            if (screenFoldersRef) {
                const oldKey = normalize(oldName), newKey = normalize(newName), sUpdates = {};
                allScreenFolders.forEach(f => {
                    if (f.heroKey === oldKey && (f.kind === 'hero' || f.kind === 'heroCat')) {
                        sUpdates[`${f.id}/heroKey`] = newKey;
                        if (f.kind === 'hero') sUpdates[`${f.id}/name`] = newName;
                    }
                });
                if (Object.keys(sUpdates).length) await screenFoldersRef.update(sUpdates);
            }
            return count;
        }

        async function saveHeroEdit(oldName) {
            if (!isOnline) { showToast(t('common.noConnection'), true); return; }
            const old = heroes.find(h => h.name === oldName);
            if (!old) { cancelHeroEdit(); return; }

            const newName = $('edit-hero-name').value.trim();
            const newRace = $('edit-hero-race').value;
            if (!newName) { showToast(t('admin.enterHeroName'), true); return; }
            if (/[.#$\[\]\/]/.test(newName)) { showToast(t('admin.invalidKey'), true); return; }

            const nameChanged = newName !== oldName;
            if (nameChanged && heroes.some(h => h.name !== oldName && h.name.toLowerCase() === newName.toLowerCase())) {
                showToast(t('admin.heroExists'), true); return;
            }
            if (!nameChanged && newRace === old.race) { cancelHeroEdit(); return; }

            try {
                if (!nameChanged) {
                    // tylko zmiana rasy — bezpieczne, nie dotyka formacji
                    await heroesRef.child(oldName).update({ race: newRace });
                    showToast(`✅ ${t('admin.heroSaved')}`);
                } else {
                    if (!confirm(t('admin.renameConfirm'))) return;
                    const affected = await propagateHeroRename(oldName, newName);
                    await heroesRef.child(newName).set({ name: newName, race: newRace });
                    await heroesRef.child(oldName).remove();
                    showToast(`✅ ${t('admin.heroSaved')} (${affected} ${t('status.formations')})`);
                }
                editingHeroName = null;
            } catch (e) { showToast(`${t('common.error')}: ${e.message}`, true); }
        }

        let editingPetName = null; // pet aktualnie w trybie inline-edycji

        function renderPetsList() {
            $('pets-count').textContent = pets.length;
            // Jednolita szerokość kafelka = najdłuższa nazwa (+ ikona 🐾, ✏️🗑️ i padding)
            const maxLen = pets.reduce((m, p) => Math.max(m, p.length), 4);
            $('pets-list').style.setProperty('--tile-w', (maxLen + 11) + 'ch');
            const sorted = pets.slice().sort((a, b) => a.localeCompare(b, 'pl'));
            const petTiles = sorted.map(p => p === editingPetName
                ? `<div class="admin-tile editing" style="border-color:var(--accent-gold)">
                        <span class="admin-pet-icon">🐾</span>
                        <input type="text" id="edit-pet-name" class="admin-hero-edit-name" value="${escapeHtml(p)}" autocomplete="off">
                        <div class="admin-tile-actions">
                            <button class="btn-icon btn-icon-save" onclick="savePetEdit('${jsStr(p)}')" title="${t('common.save')}">✔️</button>
                            <button class="btn-icon" onclick="cancelPetEdit()" title="${t('common.cancel')}">✖️</button>
                        </div>
                    </div>`
                : `<div class="admin-tile" style="background:color-mix(in srgb, var(--accent-gold) 12%, var(--bg-card)); border-color:var(--accent-gold)">
                        <span class="admin-tile-name">🐾 ${escapeHtml(p)}</span>
                        <div class="admin-tile-actions">
                            <button class="btn-icon" onclick="startPetEdit('${jsStr(p)}')" title="${t('admin.editPet')}">✏️</button>
                            <button class="btn-icon btn-icon-danger" onclick="deletePet('${jsStr(p)}')" title="${t('admin.confirmDeletePet')}">🗑️</button>
                        </div>
                    </div>`
            ).join('');
            $('pets-list').innerHTML = petTiles
                ? `<div class="admin-tile-grid">${petTiles}</div>`
                : `<p style="color:var(--text-muted);text-align:center;">${t('database.noFormations')}</p>`;
        }

        function startPetEdit(name) { editingPetName = name; renderPetsList(); $('edit-pet-name')?.focus(); }
        function cancelPetEdit() { editingPetName = null; renderPetsList(); }

        // Rename peta propagujemy do /formations (myPet/enemyPet) i /defenseFormations (myPet + nowy fingerprint).
        async function propagatePetRename(oldName, newName) {
            const lo = oldName.toLowerCase();
            let count = 0;
            const fUpdates = {};
            allFormations.forEach(f => {
                let changed = false;
                let myPet = f.myPet, enemyPet = f.enemyPet;
                if (myPet && myPet.toLowerCase() === lo) { myPet = newName; changed = true; }
                if (enemyPet && enemyPet.toLowerCase() === lo) { enemyPet = newName; changed = true; }
                if (changed) { fUpdates[`${f.id}/myPet`] = myPet; fUpdates[`${f.id}/enemyPet`] = enemyPet; count++; }
            });
            if (Object.keys(fUpdates).length) await formationsRef.update(fUpdates);

            if (defenseFormationsRef) {
                const dUpdates = {};
                allDefenseFormations.forEach(df => {
                    if (df.myPet && df.myPet.toLowerCase() === lo) {
                        dUpdates[`${df.id}/myPet`] = newName;
                        dUpdates[`${df.id}/fingerprint`] = defenseFingerprint(df.my, newName);
                        count++;
                    }
                });
                if (Object.keys(dUpdates).length) await defenseFormationsRef.update(dUpdates);
            }
            return count;
        }

        async function savePetEdit(oldName) {
            if (!isOnline) { showToast(t('common.noConnection'), true); return; }
            if (!pets.includes(oldName)) { cancelPetEdit(); return; }

            const newName = $('edit-pet-name').value.trim();
            if (!newName) { showToast(t('admin.enterPetName'), true); return; }
            if (/[.#$\[\]\/]/.test(newName)) { showToast(t('admin.invalidKey'), true); return; }
            if (newName === oldName) { cancelPetEdit(); return; }
            if (pets.some(p => p.toLowerCase() === newName.toLowerCase())) {
                showToast(t('admin.petExists'), true); return;
            }

            try {
                if (!confirm(t('admin.renamePetConfirm'))) return;
                const affected = await propagatePetRename(oldName, newName);
                await petsRef.child(newName).set({ name: newName });
                await petsRef.child(oldName).remove();
                showToast(`✅ ${t('admin.petSaved')} (${affected} ${t('status.formations')})`);
                editingPetName = null;
            } catch (e) { showToast(`${t('common.error')}: ${e.message}`, true); }
        }

        // Wstaw aktualne wartości globalnej konfiguracji do pól w panelu admina
        function renderConfigForm(force) {
            if ($('config-new-days')) $('config-new-days').value = appConfig.newFormationDays;
            if ($('config-min-match')) $('config-min-match').value = appConfig.defaultMinMatch;
            if ($('config-war-result')) $('config-war-result').value = appConfig.warResultLimit;
            if ($('config-default-sort')) $('config-default-sort').value = appConfig.defaultSearchSort;
            if ($('config-db-filter')) $('config-db-filter').value = appConfig.defaultDbFilter;
            if ($('config-pkg-support')) $('config-pkg-support').value = appConfig.defaultPackageMinSupport;
            if ($('config-pkg-window')) $('config-pkg-window').value = appConfig.defaultPackageWindow;
            if ($('config-screens-compress')) $('config-screens-compress').checked = appConfig.screensCompress !== false;

            // Robocze kopie (edytowane w formularzu do czasu Zapisz; reorder ich nie gubi).
            // Nie nadpisuj edycji w toku: przy odświeżeniu z listenera Firebase pomiń przeseedowanie,
            // gdy admin ma niezapisane zmiany zakładek (configTabDirty). force=true (świeże wejście do
            // panelu admina) zawsze przeseeduje. Zapis (saveConfig) zeruje flagę → echo listenera odświeża.
            if (force || !configTabDirty) {
                configTabOrder = sanitizeTabOrder(appConfig.tabOrder);
                configTabVisibility = { ...DEFAULT_CONFIG.tabVisibility, ...(appConfig.tabVisibility || {}) };
                configTabPlacement = { ...DEFAULT_CONFIG.tabPlacement, ...(appConfig.tabPlacement || {}) };
                configTabDirty = false;
                renderTabvisList();
            }
        }

        // Zapis globalnej konfiguracji do Firebase /config/settings (działa dla wszystkich graczy)
        async function saveConfig() {
            if (!isOnline) { showToast(t('common.noConnection'), true); return; }
            const days = parseInt($('config-new-days')?.value, 10);
            let minMatch = parseInt($('config-min-match')?.value, 10);
            const sort = $('config-default-sort')?.value;
            const dbFilter = $('config-db-filter')?.value;
            const pkgSup = parseInt($('config-pkg-support')?.value, 10);
            const pkgWindow = $('config-pkg-window')?.value;
            let warResult = parseInt($('config-war-result')?.value, 10);
            warResult = Math.min(100, Math.max(5, warResult > 0 ? warResult : 20));
            if (!(days > 0)) { showToast(t('admin.configInvalidDays'), true); return; }
            if (!(minMatch > 0)) { showToast(t('admin.configInvalidMin'), true); return; }
            if (!(pkgSup > 0)) { showToast(t('admin.configInvalidMin'), true); return; }
            minMatch = Math.min(5, minMatch); // próg trafności ≤ 5 (max bohaterów w grze)
            try {
                // Z roboczych kopii (configTab*), z fallbackiem na domyślne
                const tabVisibility = {};
                Object.keys(DEFAULT_CONFIG.tabVisibility).forEach(k => {
                    const v = (configTabVisibility || {})[k];
                    tabVisibility[k] = (v === 'admin' || v === 'all') ? v : DEFAULT_CONFIG.tabVisibility[k];
                });
                const tabPlacement = {};
                Object.keys(DEFAULT_CONFIG.tabPlacement).forEach(k => {
                    const v = (configTabPlacement || {})[k];
                    tabPlacement[k] = ['bar', 'more', 'hidden'].includes(v) ? v : DEFAULT_CONFIG.tabPlacement[k];
                });
                const tabOrder = sanitizeTabOrder(configTabOrder);
                await configRef.update({
                    newFormationDays: days,
                    defaultMinMatch: minMatch,
                    defaultSearchSort: (sort === 'newest' ? 'newest' : 'relevance'),
                    defaultDbFilter: ['all', 'base', 'user', 'favorites'].includes(dbFilter) ? dbFilter : 'all',
                    defaultPackageMinSupport: pkgSup,
                    defaultPackageWindow: ['all', '30', '90'].includes(pkgWindow) ? pkgWindow : 'all',
                    tabVisibility,
                    tabPlacement,
                    tabOrder,
                    warResultLimit: warResult,
                    screensCompress: $('config-screens-compress') ? $('config-screens-compress').checked : true
                });
                configTabDirty = false; // zapisano → pozwól listenerowi przeseedować robocze kopie ze świeżego configu
                showToast(`✅ ${t('admin.configSaved')}`);
            } catch (e) { showToast(`${t('common.error')}: ${e.message}`, true); }
        }

        async function addHero() {
            const name = $('new-hero-name').value.trim();
            const race = $('new-hero-race').value;
            if (!name) { showToast(t('admin.enterHeroName'), true); return; }
            if (/[.#$\[\]\/]/.test(name)) { showToast(t('admin.invalidKey'), true); return; }
            if (heroes.some(h => h.name.toLowerCase() === name.toLowerCase())) { showToast(t('admin.heroExists'), true); return; }
            try {
                await heroesRef.child(name).set({ name, race });
                ensureHeroFolders(false, [{ name }]); // auto-utwórz folder galerii bohatera (+ Mastery)
                $('new-hero-name').value = '';
                showToast(`${t('admin.heroAdded')}: ${name}`);
            } catch (e) { showToast(`${t('common.error')}: ${e.message}`, true); }
        }

        async function deleteHero(name) {
            if (!confirm(`${t('admin.confirmDeleteHero')} "${name}"?`)) return;
            try { await heroesRef.child(name).remove(); showToast(`${t('admin.heroDeleted')}: ${name}`); }
            catch (e) { showToast(`${t('common.error')}: ${e.message}`, true); }
        }

        async function addPet() {
            const name = $('new-pet-name').value.trim();
            if (!name) { showToast(t('admin.enterPetName'), true); return; }
            if (/[.#$\[\]\/]/.test(name)) { showToast(t('admin.invalidKey'), true); return; }
            if (pets.some(p => p.toLowerCase() === name.toLowerCase())) { showToast(t('admin.petExists'), true); return; }
            try {
                await petsRef.child(name).set({ name });
                $('new-pet-name').value = '';
                showToast(`${t('admin.petAdded')}: ${name}`);
            } catch (e) { showToast(`${t('common.error')}: ${e.message}`, true); }
        }

        async function deletePet(name) {
            if (!confirm(`${t('admin.confirmDeletePet')} "${name}"?`)) return;
            try { await petsRef.child(name).remove(); showToast(`${t('admin.heroDeleted')}: ${name}`); }
            catch (e) { showToast(`${t('common.error')}: ${e.message}`, true); }
        }

		function scanDuplicates() {
			const duplicates = findDuplicates();
			renderDuplicatesModal(duplicates);
			$('duplicates-modal').classList.remove('hidden');
		}

		function closeDuplicatesModal() {
			$('duplicates-modal').classList.add('hidden');
		}

		function findDuplicates() {
			const results = {
				identical: [],      // 5/5 enemy + 5/5 my + oba pety
				almostIdentical: [] // 5/5 enemy + 5/5 my (pety mogą się różnić)
			};
			
			// Bucketowanie: dwie formacje to duplikat TYLKO przy identycznym zestawie enemy I my
			// (compareFormations zwraca 'none' inaczej) → porównujemy parami wyłącznie w obrębie kubełka.
			// Wynik identyczny jak pełne O(n²), ale ~O(n). Pety POZA kluczem (almostIdentical = ten sam
			// enemy+my, różne pety) — inaczej zgubilibyśmy „prawie identyczne".
			const buckets = new Map();
			for (const f of allFormations) {
				const key = f.enemy.filter(h => h).map(normalize).sort().join('|') + '@@' + f.my.filter(h => h).map(normalize).sort().join('|');
				if (!buckets.has(key)) buckets.set(key, []);
				buckets.get(key).push(f);
			}
			for (const group of buckets.values()) {
				if (group.length < 2) continue;
				for (let i = 0; i < group.length; i++) {
					for (let j = i + 1; j < group.length; j++) {
						const similarity = compareFormations(group[i], group[j]);
						if (similarity.type === 'identical') {
							addToGroup(results.identical, group[i], group[j], similarity);
						} else if (similarity.type === 'almostIdentical') {
							addToGroup(results.almostIdentical, group[i], group[j], similarity);
						}
					}
				}
			}
			
			return results;
		}

		function compareFormations(a, b) {
			// Porównaj enemy
			const enemyA = a.enemy.filter(h => h).map(h => normalize(h)).sort();
			const enemyB = b.enemy.filter(h => h).map(h => normalize(h)).sort();
			const enemyMatch = enemyA.length === enemyB.length && enemyA.every((h, i) => h === enemyB[i]);
			
			// Porównaj my
			const myA = a.my.filter(h => h).map(h => normalize(h)).sort();
			const myB = b.my.filter(h => h).map(h => normalize(h)).sort();
			const myMatch = myA.length === myB.length && myA.every((h, i) => h === myB[i]);
			
			// Porównaj pety
			const enemyPetSame = normalize(a.enemyPet) === normalize(b.enemyPet);
			const myPetSame = normalize(a.myPet) === normalize(b.myPet);
			
			// Określ typ
			if (enemyMatch && myMatch) {
				if (enemyPetSame && myPetSame) {
					return { type: 'identical' };
				}
				return { type: 'almostIdentical' };
			}
			
			return { type: 'none' };
		}

		function addToGroup(groups, a, b, similarity) {
			// Szukaj istniejącej grupy zawierającej a lub b
			let foundGroup = null;
			for (const group of groups) {
				if (group.formations.some(f => f.id === a.id || f.id === b.id)) {
					foundGroup = group;
					break;
				}
			}
			
			if (foundGroup) {
				if (!foundGroup.formations.some(f => f.id === a.id)) foundGroup.formations.push(a);
				if (!foundGroup.formations.some(f => f.id === b.id)) foundGroup.formations.push(b);
			} else {
				groups.push({
					formations: [a, b],
					similarity: similarity
				});
			}
		}

		function renderDuplicatesModal(duplicates) {
			const totalGroups = duplicates.identical.length + duplicates.almostIdentical.length;
			
			if (totalGroups === 0) {
				$('duplicates-results').innerHTML = `
					<div class="duplicates-empty">
						<div class="duplicates-empty-icon">✅</div>
						<h3>${t('duplicates.noDuplicates')}</h3>
						<p style="color: var(--text-muted);">${t('duplicates.allUnique')}</p>
					</div>
				`;
				return;
			}
			
			let html = `
				<div class="duplicates-summary">
					<strong>${t('duplicates.found')}: ${totalGroups} ${t('duplicates.groups')}</strong><br>
					<span style="font-size: 0.8rem; color: var(--text-muted);">
						🔴 ${t('duplicates.identical')}: ${duplicates.identical.length} | 
						🟠 ${t('duplicates.almostIdentical')}: ${duplicates.almostIdentical.length}
					</span>
				</div>
			`;
			
			if (duplicates.identical.length > 0) {
				html += `<h4 style="color: #d32f2f; margin: 20px 0 10px;">🔴 ${t('duplicates.identical')} (100%)</h4>`;
				html += renderDuplicateGroups(duplicates.identical, 'identical');
			}
			
			if (duplicates.almostIdentical.length > 0) {
				html += `<h4 style="color: #f57c00; margin: 20px 0 10px;">🟠 ${t('duplicates.almostIdentical')}</h4>`;
				html += renderDuplicateGroups(duplicates.almostIdentical, 'almostIdentical');
			}
			
			$('duplicates-results').innerHTML = html;
		}

		function renderDuplicateGroups(groups, type) {
			return groups.map((group, groupIndex) => {
				const first = group.formations[0];
				const enemyList = first.enemy.filter(h => h).join(', ') || '—';
				const myList = first.my.filter(h => h).join(', ') || '—';
				
				return `
					<div class="duplicate-group ${type}">
						<div class="duplicate-group-header">
							<strong>👹 ${t('duplicates.enemy')}:</strong> ${enemyList} ${first.enemyPet ? '+ ' + first.enemyPet : ''}<br>
							<strong>⚔️ ${t('duplicates.counter')}:</strong> ${myList} ${first.myPet ? '+ ' + first.myPet : ''}
						</div>
						${group.formations.map(f => `
							<div class="duplicate-item">
								<div class="duplicate-item-info">
									<span class="duplicate-item-name">${escapeHtml(f.name)}</span>
									<span class="duplicate-item-id">#${f.id} ${f.isBase ? '👑 BAZA' : ''}</span>
								</div>
								<div class="duplicate-item-actions">
									<button class="btn btn-small" onclick="openDuplicatePreview(${f.id})" title="${t('duplicates.preview')}">👁️</button>
									<button class="btn btn-small btn-danger" onclick="deleteDuplicateFormation(${f.id})" title="${t('common.delete')}">🗑️</button>
								</div>
							</div>
						`).join('')}
					</div>
				`;
			}).join('');
		}

		function openDuplicatePreview(id) {
			const f = allFormations.find(x => x.id === id);
			if (!f) return;
			
			$('dup-preview-title').innerHTML = `👁️ #${f.id} - ${escapeHtml(f.name)} ${f.isBase ? '<span style="color: var(--accent-gold);">👑 BAZA</span>' : ''}`;
			
			$('dup-preview-content').innerHTML = `
				<div class="formation-preview" style="margin-top: 15px;">
					<div class="battle-section enemy">
						<div class="battle-title enemy-title"><span class="title-icon">👹</span>${t('preview.enemy')}</div>
						<div style="text-align:center">${renderBattlePet(f.enemyPet)}</div>
						${renderBattleGrid(f.enemy, true)}
					</div>
					
					<div class="vs-separator"><span class="vs-badge">VS</span></div>
					
					<div class="battle-section player">
						${renderBattleGrid(f.my, false)}
						<div style="text-align:center">${renderBattlePet(f.myPet)}</div>
						<div class="battle-title player-title"><span class="title-icon">⚔️</span>${t('preview.yourTeam')}</div>
					</div>
					
					${f.comment ? `<div class="preview-comment"><span class="comment-icon">💬</span>${escapeHtml(f.comment)}</div>` : ''}
				</div>
				
				<div style="margin-top: 20px; display: flex; gap: 10px; justify-content: center;">
					<button class="btn btn-secondary" onclick="closeDuplicatePreviewModal()">✖️ ${t('common.close')}</button>
					<button class="btn btn-danger" onclick="closeDuplicatePreviewModal(); deleteDuplicateFormation(${f.id});">🗑️ ${t('common.delete')}</button>
				</div>
			`;
			
			$('duplicate-preview-modal').classList.remove('hidden');
		}

		function closeDuplicatePreviewModal() {
			$('duplicate-preview-modal').classList.add('hidden');
		}

		async function deleteDuplicateFormation(id) {
			const f = allFormations.find(x => x.id === id);
			if (!f) return;
			
			if (!confirm(`${t('duplicates.confirmDelete')} #${id} "${f.name}"?`)) return;
			
			try {
				await formationsRef.child(String(id)).remove();
				showToast(`🗑️ ${t('database.deleted')} #${id}`);
				// Odśwież wyniki skanera
				scanDuplicates();
			} catch (e) {
				showToast(`${t('common.error')}: ${e.message}`, true);
			}
		}


        // ═══════════════════════════════════════════════════════════
        // TAB: SCREENS — galeria screenów w folderach (Firebase Storage)
        // ═══════════════════════════════════════════════════════════
        // Model: /screenFolders/{id} = {id,name,parentId,createdAt} — drzewo po parentId (null=korzeń).
        //        /screenshots/{id}   = {id,folderId,url,storagePath,title,comment,uploadedAt}.
        // Pliki (obrazy) siedzą w Firebase Storage pod screenshots/{id}; RTDB trzyma tylko metadane + URL.
        const SCREENS_MAX_DIM = 1600, SCREENS_JPEG_Q = 0.85, SCREENS_MAX_BYTES = 10 * 1024 * 1024;
        const SCREENS_THUMB_DIM = 320, SCREENS_THUMB_Q = 0.7; // miniatura do siatki
        const SCREENS_TITLE_MAX = 60, SCREENS_COMMENT_MAX = 300, SCREENS_TAG_MAX = 32, SCREENS_TAGS_MAX = 8; // limity tekstu
        const SCREENS_PAGE = 200, SCREENS_UPLOAD_CONCURRENCY = 3; // paginacja siatki + ile plików wgrywamy równolegle
        let lbScale = 1, lbTx = 0, lbTy = 0; // stan zoom/pan lightboxa

        // ── Rebuild cache z Map (debounce; scala bursty child_* w jeden przebieg) ──
        function scheduleScreensCache(kind) {
            screensDirty[kind] = true;
            if (screensCacheTimer) clearTimeout(screensCacheTimer);
            screensCacheTimer = setTimeout(applyScreensCache, 60);
        }
        function applyScreensCache() {
            screensCacheTimer = null;
            if (screensDirty.folders) { allScreenFolders = [...screenFoldersById.values()]; screensDirty.folders = false; }
            if (screensDirty.shots) {
                allScreenshots = [...screenshotsById.values()];
                screenCountByFolder = new Map();
                for (const s of allScreenshots) { const k = s.folderId || null; screenCountByFolder.set(k, (screenCountByFolder.get(k) || 0) + 1); }
                screensDirty.shots = false;
            }
            if ($('tab-screens')?.classList.contains('active')) renderScreensTab();
            refreshOpenHeroGalleryBar(); // odśwież liczniki „⭐ Mastery" jeśli podgląd bohatera otwarty
        }
        function screenCount(folderId) { return screenCountByFolder.get(folderId || null) || 0; }

        // ── Foldery bohaterów (zarządzane) — lookup po heroKey/kategorii + idempotentny seed ──
        function heroesRootFolder() { return allScreenFolders.find(f => f.kind === 'heroesRoot') || null; }
        function heroFolder(heroKey) { return allScreenFolders.find(f => f.kind === 'hero' && f.heroKey === heroKey) || null; }
        function heroCatFolder(heroKey, catKey) { return allScreenFolders.find(f => f.kind === 'heroCat' && f.heroKey === heroKey && f.category === catKey) || null; }
        // Serializacja: wywołania idą w łańcuchu, żeby dwa równoległe (np. podwójny klik „Synchronizuj" albo add+sync)
        // nie czytały tego samego nieaktualnego cache i nie tworzyły duplikatów folderów.
        let ensureHeroFoldersChain = Promise.resolve();
        function ensureHeroFolders(announce, heroList) {
            const run = () => ensureHeroFoldersImpl(announce, heroList);
            ensureHeroFoldersChain = ensureHeroFoldersChain.then(run, run);
            return ensureHeroFoldersChain;
        }
        // Tworzy brakujące foldery: Heroes → per-bohater → podfoldery kategorii. Idempotentne (tylko brakujące),
        // JEDEN batchowy update (klucze z push().key bez zapisu) → jeden re-sync zamiast setek. heroList domyślnie = heroes
        // (przy dodaniu bohatera podajemy [{name}] zanim cache się odświeży, żeby nie było wyścigu).
        async function ensureHeroFoldersImpl(announce, heroList) {
            if (!isAdmin || !screenFoldersRef) return;
            const list = heroList || heroes;
            const updates = {}, now = new Date().toISOString();
            const gen = () => screenFoldersRef.push().key;
            let root = heroesRootFolder();
            const rootId = root ? root.id : gen();
            if (!root) updates[rootId] = { id: rootId, name: HEROES_ROOT_NAME, parentId: null, createdAt: now, managed: true, kind: 'heroesRoot' };
            let created = 0;
            for (const h of list) {
                const hk = normalize(h.name);
                if (!hk) continue;
                let hf = heroFolder(hk);
                const hfId = hf ? hf.id : gen();
                if (!hf) { updates[hfId] = { id: hfId, name: h.name, parentId: rootId, createdAt: now, managed: true, kind: 'hero', heroKey: hk }; created++; }
                for (const cat of HERO_GALLERY_CATEGORIES) {
                    if (heroCatFolder(hk, cat.key)) continue;
                    const cid = gen();
                    updates[cid] = { id: cid, name: cat.label, parentId: hfId, createdAt: now, managed: true, kind: 'heroCat', heroKey: hk, category: cat.key };
                    created++;
                }
            }
            if (!Object.keys(updates).length) { if (announce) showToast(t('heroGallery.syncNone')); return; }
            try {
                await screenFoldersRef.update(updates);
                // Zaktualizuj cache NATYCHMIAST (nie czekaj na child_added+debounce) — kolejne wywołania widzą nowe foldery → brak duplikatów.
                Object.entries(updates).forEach(([id, f]) => screenFoldersById.set(id, f));
                allScreenFolders = [...screenFoldersById.values()];
                if ($('tab-screens')?.classList.contains('active')) renderScreensTab();
                refreshOpenHeroGalleryBar();
                if (announce) showToast('✅ ' + t('heroGallery.syncDone', { n: created }));
            } catch (e) { showToast(t('common.error') + ': ' + e.message, true); }
        }

        // ── odczyty drzewa z cache (allScreenFolders/allScreenshots) ──
        function screenFolderChildren(parentId) {
            // Foldery zarządzane (Heroes itp.) zawsze przed zwykłymi; w obrębie grupy alfabetycznie.
            return allScreenFolders.filter(f => (f.parentId || null) === (parentId || null))
                .sort((a, b) => ((b.managed ? 1 : 0) - (a.managed ? 1 : 0)) || (a.name || '').localeCompare(b.name || ''));
        }
        function screenshotsInFolder(folderId) {
            return allScreenshots.filter(s => (s.folderId || null) === (folderId || null))
                .sort((a, b) => String(b.uploadedAt || '').localeCompare(String(a.uploadedAt || '')));
        }
        function findScreenFolder(id) { return allScreenFolders.find(f => f.id === id) || null; }
        function findScreenshot(id) { return allScreenshots.find(s => s.id === id) || null; }

        // Ścieżka korzeń→folder (lista folderów) do breadcrumbów. Guard chroni przed pętlą parentId.
        function screenFolderPath(folderId) {
            const path = [], guard = new Set();
            let cur = folderId ? findScreenFolder(folderId) : null;
            while (cur && !guard.has(cur.id)) { guard.add(cur.id); path.unshift(cur); cur = cur.parentId ? findScreenFolder(cur.parentId) : null; }
            return path;
        }
        // ID folderu + wszystkich jego podfolderów (rekurencyjnie).
        function screenFolderSubtree(folderId) {
            const stack = [folderId], out = [folderId];
            while (stack.length) {
                const p = stack.pop();
                allScreenFolders.filter(f => (f.parentId || null) === p).forEach(f => { stack.push(f.id); out.push(f.id); });
            }
            return out;
        }

        function screensGoTo(folderId) {
            screensCurrentFolder = folderId || null;
            screensSearch = '';
            screensTagFilter.clear();
            screensFavOnly = false;
            const si = $('screens-search'); if (si) si.value = '';
            renderScreensTab();
        }

        function renderScreensTab() {
            const bar = $('screens-admin-bar');
            if (bar) bar.style.display = isAdmin ? 'grid' : 'none';
            const upRow = $('screens-upload-row');
            if (upRow) upRow.style.display = isAdmin ? 'block' : 'none';
            if (!isAdmin && screensSelectMode) { screensSelectMode = false; screensSelected.clear(); }
            renderScreensBreadcrumb();
            renderScreensHelp();
            renderScreensTagBar();
            renderScreensToolbar();
            renderScreensGrid();
        }

        // Panel „❔ jak to działa" — sekcje admina tylko dla admina.
        function toggleScreensHelp() {
            screensHelpOpen = !screensHelpOpen;
            storage.setBool('souls_screens_help_open', screensHelpOpen);
            renderScreensHelp();
        }
        function renderScreensHelp() {
            const el = $('screens-help');
            if (!el) return;
            $('screens-help-toggle')?.classList.toggle('active', screensHelpOpen);
            if (!screensHelpOpen) { el.style.display = 'none'; el.innerHTML = ''; return; }
            el.style.display = 'block';
            el.innerHTML = t('screens.helpView') + (isAdmin ? t('screens.helpAdmin') : '');
        }

        // Pasek klikalnych tagów (unikalne ze wszystkich screenów) — klik filtruje przez szukajkę.
        function renderScreensTagBar() {
            const el = $('screens-tags');
            if (!el) return;
            const tags = [...new Set(allScreenshots.flatMap(s => s.tags || []))].sort((a, b) => a.localeCompare(b));
            let html = tags.map(tg =>
                `<button class="screen-tag-chip${screensTagFilter.has(tg.toLowerCase()) ? ' active' : ''}" onclick="toggleScreenTagFilter('${jsStr(tg)}')">🏷️ ${escapeHtml(tg)}</button>`
            ).join('');
            if (screensTagFilter.size > 1) html += `<span class="screen-tag-and">${t('screens.tagAnd')}</span>`; // przypomnienie: AND
            if (screensTagFilter.size) html += `<button class="screen-tag-chip screen-tag-clear" onclick="clearScreenTagFilter()">✕ ${t('screens.clearTags')}</button>`;
            el.innerHTML = html;
        }
        // Wielotagowy filtr (AND) — klik przełącza tag w zbiorze.
        function toggleScreenTagFilter(tag) {
            const k = tag.toLowerCase();
            if (screensTagFilter.has(k)) screensTagFilter.delete(k); else screensTagFilter.add(k);
            renderScreensTagBar();
            renderScreensGrid();
        }
        function clearScreenTagFilter() { screensTagFilter.clear(); renderScreensTagBar(); renderScreensGrid(); }

        function renderScreensBreadcrumb() {
            const el = $('screens-breadcrumb');
            if (!el) return;
            // data-folder na okruszkach = cel drag&drop (upuść kafelek, by przenieść do tego poziomu). '' = korzeń.
            const back = screensCurrentFolder ? (findScreenFolder(screensCurrentFolder)?.parentId || '') : '';
            let html = screensCurrentFolder ? `<button class="screens-crumb screens-back" data-folder="${escapeHtml(back)}" onclick="screensGoBack()">← ${t('screens.back')}</button>` : '';
            html += `<button class="screens-crumb" data-folder="" onclick="screensGoTo(null)">🖼️ ${t('screens.root')}</button>`;
            screenFolderPath(screensCurrentFolder).forEach(f => {
                html += `<span class="screens-crumb-sep">›</span><button class="screens-crumb" data-folder="${escapeHtml(f.id)}" onclick="screensGoTo('${jsStr(f.id)}')">${escapeHtml(f.name)}</button>`;
            });
            // W folderze bohatera/Mastery → skrót „🦸 {bohater}" otwierający jego podgląd (modal wchodzi nad galerią; chip Mastery wraca do folderu).
            const heroName = screenFolderHeroName(screensCurrentFolder);
            if (heroName) html += `<button class="screens-crumb screens-hero-link" onclick="showHeroSkills('${jsStr(heroName)}')" title="${escapeHtml(t('heroGallery.backToHero', { name: heroName }))}">🦸 ${escapeHtml(heroName)}</button>`;
            el.innerHTML = html;
        }
        // Nazwa bohatera przypisanego do folderu (hero/heroCat) — po heroKey; źródłem nazwy jest folder bohatera (żywa nazwa po rename).
        function screenFolderHeroName(folderId) {
            const f = findScreenFolder(folderId);
            if (!f || !f.heroKey) return null;
            const hf = heroFolder(f.heroKey);
            return hf ? hf.name : (heroes.find(h => normalize(h.name) === f.heroKey)?.name || null);
        }
        // Wstecz = do folderu-rodzica bieżącego (albo do korzenia).
        function screensGoBack() {
            const cur = findScreenFolder(screensCurrentFolder);
            screensGoTo(cur ? (cur.parentId || null) : null);
        }

        // Etykieta lokalizacji folderu (ścieżka „A / B") — do wyników szukajki. Korzeń → nazwa galerii.
        function screenFolderLabel(folderId) {
            if (!folderId) return t('screens.root');
            const path = screenFolderPath(folderId);
            return path.length ? path.map(f => escapeHtml(f.name)).join(' / ') : t('screens.root');
        }

        function setScreensSearch(v) { screensSearch = (v || '').trim().toLowerCase(); renderScreensTagBar(); renderScreensGrid(); }

        // Sortowanie screenów w siatce wg screensSort (data/nazwa). Foldery zawsze alfabetycznie.
        function sortScreenshots(shots) {
            const arr = shots.slice();
            if (screensSort === 'date-asc') arr.sort((a, b) => String(a.uploadedAt || '').localeCompare(String(b.uploadedAt || '')));
            else if (screensSort === 'name-asc') arr.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
            else if (screensSort === 'name-desc') arr.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
            else arr.sort((a, b) => String(b.uploadedAt || '').localeCompare(String(a.uploadedAt || ''))); // date-desc (domyślne)
            return arr;
        }
        function renderScreensGrid() {
            const grid = $('screens-grid');
            if (!grid) return;
            grid.className = 'screens-grid tiles-' + screensTile + (screensSelectMode ? ' select-mode' : '');
            const selecting = isAdmin && screensSelectMode;
            const dragA = isAdmin ? ' draggable="true"' : ''; // drag&drop kafelka do folderu (desktop)
            // W trybie zaznaczania chowamy przyciski akcji (klik = zaznacz), pokazujemy checkbox.
            const actions = (kind, id) => (!isAdmin || selecting) ? '' : `<div class="screen-card-actions">
                    <button title="✏️" onclick="event.stopPropagation(); ${kind === 'folder' ? 'renameScreenFolder' : 'renameScreenshot'}('${jsStr(id)}')">✏️</button>
                    <button title="📁" onclick="event.stopPropagation(); openScreenMove('${kind}','${jsStr(id)}')">📁</button>
                    <button title="🗑️" onclick="event.stopPropagation(); ${kind === 'folder' ? 'deleteScreenFolder' : 'deleteScreenshot'}('${jsStr(id)}')">🗑️</button>
                </div>`;
            const selBox = id => selecting ? `<div class="screen-sel-box${screensSelected.has(id) ? ' checked' : ''}">${screensSelected.has(id) ? '✓' : ''}</div>` : '';
            // ⭐ Ulubione (dla wszystkich, per-user) — ukryte w trybie zaznaczania.
            const favBtn = s => selecting ? '' : (on => `<button class="screen-fav${on ? ' on' : ''}" title="${t('screens.favTitle')}" onclick="event.stopPropagation(); toggleScreenFav('${jsStr(s.id)}')">${on ? '⭐' : '☆'}</button>`)(screenFavorites.includes(s.id));
            // Foldery zarządzane (bohaterów) — inna ikona (🦸 / ikona kategorii), bez drag i bez akcji edycji/usuwania.
            const folderIcon = f => f.kind === 'heroCat' ? ((HERO_GALLERY_CATEGORIES.find(c => c.key === f.category) || {}).icon || '📁')
                : (f.kind === 'hero' || f.kind === 'heroesRoot') ? '🦸' : '📁';
            const folderCard = (f, subLabel) => `<div class="screen-folder-card${f.managed ? ' managed' : ''}" data-kind="folder" data-id="${escapeHtml(f.id)}"${f.managed ? '' : dragA} onclick="screenCardClick('folder','${jsStr(f.id)}',event)">
                    ${f.managed ? `<div class="screen-folder-lock" title="${escapeHtml(t('heroGallery.protected'))}">🔒</div>` : actions('folder', f.id)}
                    <div class="screen-folder-icon">${folderIcon(f)}</div>
                    <div class="screen-folder-name">${escapeHtml(f.name)}</div>
                    <div class="screen-folder-count">${subLabel}</div>
                </div>`;
            const shotCard = (s, locLabel) => `<div class="screen-thumb-card${screensSelected.has(s.id) ? ' selected' : ''}" data-kind="shot" data-id="${escapeHtml(s.id)}"${dragA} onclick="screenCardClick('shot','${jsStr(s.id)}',event)">
                    ${selBox(s.id)}${favBtn(s)}${actions('shot', s.id)}
                    <img class="screen-thumb-img" loading="lazy" decoding="async" src="${escapeHtml(s.thumbUrl || s.url)}" alt="${escapeHtml(s.title || '')}">
                    <div class="screen-thumb-name">${escapeHtml(s.title || '') || '—'}</div>
                    ${(s.tags && s.tags.length) ? `<div class="screen-thumb-tags">${s.tags.slice(0, 3).map(tg => `<span class="screen-tag">${escapeHtml(tg)}</span>`).join('')}</div>` : ''}
                    ${locLabel ? `<div class="screen-thumb-loc">📁 ${locLabel}</div>` : ''}
                    <div class="screen-thumb-meta">${typeof s.size === 'number' ? fmtBytes(s.size) + ' | ' : ''}${(s.uploadedAt || '').slice(0, 10)}</div>
                </div>`;

            // Paginacja: zmiana widoku (folder/filtry/sort) resetuje limit renderowania; „pokaż więcej" go zwiększa.
            const sig = JSON.stringify([screensCurrentFolder, screensSearch, [...screensTagFilter].sort(), screensFavOnly, screensRecursive, screensSort]);
            if (sig !== screensViewSig) { screensViewSig = sig; screensRenderLimit = SCREENS_PAGE; screensFolderLimit = SCREENS_PAGE; }
            // Render kafelków folderów z limitem (Heroes ma ~150 dzieci) + „pokaż więcej".
            const foldersHtml = (folders, labelFn) => {
                const shown = folders.slice(0, screensFolderLimit);
                let html = shown.map(f => folderCard(f, labelFn(f))).join('');
                const more = folders.length - shown.length;
                if (more > 0) html += `<button class="screens-show-more" onclick="screensShowMoreFolders()">${t('screens.showMoreFolders', { n: more })}</button>`;
                return html;
            };
            // Render listy screenów z limitem + przycisk „pokaż więcej" (chroni DOM przy dużych folderach; nawigacja ‹ › i tak leci po pełnym screensViewShots).
            const shotsHtml = (shots, locFn) => {
                const shown = shots.slice(0, screensRenderLimit);
                let html = shown.map(s => shotCard(s, locFn(s))).join('');
                const more = shots.length - shown.length;
                if (more > 0) html += `<button class="screens-show-more" onclick="screensShowMore()">${t('screens.showMore', { n: more })}</button>`;
                return html;
            };

            // ── Widok globalny: szukajka / tagi (AND) / ulubione — płaska lista z CAŁEJ galerii ──
            if (screensSearch || screensTagFilter.size || screensFavOnly) {
                const folders = screensSearch ? allScreenFolders.filter(f => (f.name || '').toLowerCase().includes(screensSearch))
                    .sort((a, b) => (a.name || '').localeCompare(b.name || '')) : [];
                const shots = sortScreenshots(allScreenshots.filter(screenMatchesFilters));
                screensViewShots = shots;
                updateScreensCount(folders.length, shots.length);
                grid.innerHTML = (!folders.length && !shots.length)
                    ? `<div class="screens-empty">${t('screens.searchNoResults')}</div>`
                    : foldersHtml(folders, f => screenFolderLabel(f.id)) + shotsHtml(shots, s => screenFolderLabel(s.folderId));
                return;
            }

            // ── Normalny widok bieżącego folderu (opcjonalnie rekurencyjnie po podfolderach) ──
            const folders = screenFolderChildren(screensCurrentFolder);
            let shots;
            if (screensRecursive) {
                const ids = new Set(screenFolderSubtree(screensCurrentFolder));
                shots = sortScreenshots(allScreenshots.filter(s => ids.has(s.folderId || null)));
            } else {
                shots = sortScreenshots(screenshotsInFolder(screensCurrentFolder));
            }
            screensViewShots = shots;
            updateScreensCount(folders.length, shots.length);
            if (!folders.length && !shots.length) {
                grid.innerHTML = `<div class="screens-empty">${t(isAdmin ? 'screens.emptyAdmin' : 'screens.empty')}</div>`;
                return;
            }
            // Liczniki: screeny z globalnej Map (screenCount), podfoldery jednym przejściem (folderów mało/średnio).
            const childCountByParent = new Map();
            allScreenFolders.forEach(f => { const k = f.parentId || null; childCountByParent.set(k, (childCountByParent.get(k) || 0) + 1); });
            grid.innerHTML = foldersHtml(folders, f => t('screens.folderCount', { n: screenCount(f.id) + (childCountByParent.get(f.id) || 0) }))
                + shotsHtml(shots, s => screensRecursive ? screenFolderLabel(s.folderId) : '');
        }
        // „Pokaż więcej" — dorenderuj kolejną porcję screenów / folderów w bieżącym widoku.
        function screensShowMore() { screensRenderLimit += SCREENS_PAGE; renderScreensGrid(); }
        function screensShowMoreFolders() { screensFolderLimit += SCREENS_PAGE; renderScreensGrid(); }
        // Czy screen przechodzi aktywne filtry globalne (szukajka + tagi AND + ulubione).
        function screenMatchesFilters(s) {
            if (screensSearch) {
                const q = screensSearch;
                if (!((s.title || '').toLowerCase().includes(q) || (s.comment || '').toLowerCase().includes(q) || (s.tags || []).some(tg => tg.toLowerCase().includes(q)))) return false;
            }
            if (screensTagFilter.size) {
                const have = new Set((s.tags || []).map(x => x.toLowerCase()));
                for (const tg of screensTagFilter) if (!have.has(tg)) return false;
            }
            if (screensFavOnly && !screenFavorites.includes(s.id)) return false;
            return true;
        }
        // ── Ulubione + rekurencja (przełączniki paska narzędzi) ──
        function toggleScreenFav(id) {
            const i = screenFavorites.indexOf(id);
            if (i >= 0) screenFavorites.splice(i, 1); else screenFavorites.push(id);
            storage.setJson('souls_screen_favorites', screenFavorites);
            renderScreensGrid();
            renderScreensToolbar();
            if (screensLightboxId === id) openScreenLightbox(id); // odśwież gwiazdkę w podglądzie
        }
        function toggleScreensFavView() { screensFavOnly = !screensFavOnly; renderScreensToolbar(); renderScreensGrid(); }
        function toggleScreensRecursive() { screensRecursive = !screensRecursive; renderScreensToolbar(); renderScreensGrid(); }

        // ── Pasek narzędzi Galerii: rozmiar kafelków, sortowanie, licznik, tryb zaznaczania ──
        function renderScreensToolbar() {
            ['large', 'normal', 'small', 'list'].forEach(sz => $('screens-tile-' + sz)?.classList.toggle('active', screensTile === sz));
            const sortSel = $('screens-sort'); if (sortSel) sortSel.value = screensSort;
            $('screens-select-toggle')?.classList.toggle('active', screensSelectMode);
            const favBtn = $('screens-fav-toggle');
            if (favBtn) { favBtn.classList.toggle('active', screensFavOnly); favBtn.textContent = screenFavorites.length ? '⭐' + screenFavorites.length : '⭐'; }
            $('screens-recursive-toggle')?.classList.toggle('active', screensRecursive);
            renderScreensStorage();
            renderScreensBulkBar();
        }
        function setScreensTile(v) { screensTile = v; storage.setJson('souls_screens_tile', v); renderScreensToolbar(); renderScreensGrid(); }
        function setScreensSort(v) { screensSort = v; storage.setJson('souls_screens_sort', v); renderScreensGrid(); }
        // Licznik: bieżący folder + całość galerii (+ przybliżony rozmiar dla screenów, które mają zapisany size).
        function fmtBytes(b) { return b >= 1073741824 ? (b / 1073741824).toFixed(2) + ' GB' : b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b >= 1024 ? Math.round(b / 1024) + ' KB' : b + ' B'; }
        // Wskaźnik zużycia Firebase Storage (admin) — chroni darmowy tier 5 GB. Rozmiar z pola size (stare screeny bez niego → „+").
        const SCREENS_STORAGE_LIMIT = 5 * 1073741824; // 5 GB
        function renderScreensStorage() {
            const el = $('screens-storage'); if (!el) return;
            if (!isAdmin) { el.style.display = 'none'; el.innerHTML = ''; return; }
            const sized = allScreenshots.filter(s => typeof s.size === 'number');
            const bytes = sized.reduce((a, s) => a + (s.size || 0), 0);
            const pct = Math.min(100, bytes / SCREENS_STORAGE_LIMIT * 100);
            const partial = sized.length < allScreenshots.length;
            const level = pct >= 95 ? 'crit' : pct >= 80 ? 'warn' : 'ok';
            el.style.display = 'flex';
            el.innerHTML = `<span class="screens-storage-txt"${partial ? ` title="${t('screens.storagePartial')}"` : ''}>💾 ${fmtBytes(bytes)}${partial ? '+' : ''} / 5 GB · ${pct.toFixed(pct < 10 ? 1 : 0)}%</span>
                <div class="screens-storage-track"><div class="screens-storage-fill ${level}" style="width:${Math.max(1.5, pct)}%"></div></div>${partial ? `<button id="screens-backfill-btn" class="screens-backfill-btn" onclick="backfillScreenSizes()" title="${t('screens.backfill')}">🔄</button>` : ''}`;
        }
        // Jednorazowe uzupełnienie brakujących size ze Storage — czyta metadane (bez pobierania obrazka).
        async function backfillScreenSizes() {
            if (!isAdmin || !screensStorageRef) return;
            const missing = allScreenshots.filter(s => typeof s.size !== 'number' && s.storagePath);
            if (!missing.length) return;
            const btn = $('screens-backfill-btn'); if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
            let done = 0, fail = 0;
            for (const s of missing) {
                try {
                    const meta = await screensStorageRef.child(s.storagePath).getMetadata();
                    if (typeof meta.size === 'number') { await screenshotsRef.child(s.id).update({ size: meta.size }); s.size = meta.size; done++; }
                    else fail++;
                } catch (e) { fail++; }
            }
            showToast('✅ ' + t('screens.backfillDone', { n: done }) + (fail ? ' · ' + t('screens.backfillFail', { n: fail }) : ''));
            renderScreensToolbar();
        }
        function updateScreensCount(nFolders, nShots) {
            const el = $('screens-count'); if (!el) return;
            // Krótko i czytelnie: 🖼️ screeny · 📁 foldery (w bieżącym widoku). Szczegóły w tooltipie.
            const parts = [];
            if (nShots) parts.push('🖼️ ' + nShots);
            if (nFolders) parts.push('📁 ' + nFolders);
            el.textContent = parts.join(' · ');
            el.title = t('screens.countTotal', { s: allScreenshots.length, f: allScreenFolders.length });
        }

        // ── Zaznaczanie wielu screenów + akcje masowe (admin) ──
        function toggleScreensSelect() {
            if (!isAdmin) return;
            screensSelectMode = !screensSelectMode;
            if (!screensSelectMode) screensSelected.clear();
            renderScreensToolbar();
            renderScreensGrid();
        }
        // Klik w kafelek: folder zawsze wchodzi; screen w trybie zaznaczania = przełącz zaznaczenie, inaczej lightbox.
        function screenCardClick(kind, id, ev) {
            if (kind === 'folder') { screensGoTo(id); return; }
            if (isAdmin && screensSelectMode) { toggleScreenSelected(id); return; }
            openScreenLightbox(id);
        }
        function toggleScreenSelected(id) {
            if (screensSelected.has(id)) screensSelected.delete(id); else screensSelected.add(id);
            renderScreensGrid();
            renderScreensBulkBar();
        }
        function screensSelectAllShots() { screensViewShots.forEach(s => screensSelected.add(s.id)); renderScreensGrid(); renderScreensBulkBar(); }
        function screensDeselectAll() { screensSelected.clear(); renderScreensGrid(); renderScreensBulkBar(); }
        function renderScreensBulkBar() {
            const bar = $('screens-bulk-bar'); if (!bar) return;
            if (!isAdmin || !screensSelectMode) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
            const n = screensSelected.size, d = n ? '' : ' disabled';
            bar.style.display = 'flex';
            bar.innerHTML = `<span class="bulk-count">${t('screens.selectedN', { n })}</span>
                <button class="screens-bulk-btn" onclick="screensSelectAllShots()">${t('screens.selectAll')}</button>
                <button class="screens-bulk-btn" onclick="screensDeselectAll()">${t('screens.deselect')}</button>
                <button class="screens-bulk-btn"${d} onclick="bulkMoveScreens()">📁 ${t('screens.bulkMove')}</button>
                <button class="screens-bulk-btn"${d} onclick="bulkTagScreens()">🏷️ ${t('screens.bulkTag')}</button>
                <button class="screens-bulk-btn danger"${d} onclick="bulkDeleteScreens()">🗑️ ${t('screens.bulkDelete')}</button>
                <button class="screens-bulk-btn" onclick="toggleScreensSelect()">✕ ${t('screens.selectExit')}</button>`;
        }
        function bulkMoveScreens() {
            const ids = [...screensSelected]; if (!isAdmin || !ids.length) return;
            screenMoveCtx = { kind: 'bulk', ids };
            renderScreenMoveList();
            $('screens-move-modal')?.classList.remove('hidden');
        }
        async function bulkDeleteScreens() {
            const ids = [...screensSelected]; if (!isAdmin || !ids.length) return;
            if (!confirm(t('screens.bulkDeleteConfirm', { n: ids.length }))) return;
            let done = 0;
            for (const id of ids) {
                const s = findScreenshot(id); if (!s) continue;
                try { await deleteScreenStorageFiles(s); await screenshotsRef.child(id).remove(); done++; } catch (e) {}
            }
            screensSelected.clear();
            showToast('🗑️ ' + t('screens.bulkDeleted', { n: done }));
            renderScreensTab();
        }
        async function bulkTagScreens() {
            const ids = [...screensSelected]; if (!isAdmin || !ids.length) return;
            const raw = prompt(t('screens.bulkTagPrompt')); if (raw === null) return;
            const add = [...new Set(raw.split(',').map(x => x.trim()).filter(Boolean))];
            if (!add.length) return;
            if (add.some(tg => tg.length > SCREENS_TAG_MAX)) { showToast('⚠️ ' + t('screens.tagTooLong', { n: SCREENS_TAG_MAX }), true); return; }
            let done = 0, skipped = 0;
            for (const id of ids) {
                const s = findScreenshot(id); if (!s) continue;
                const merged = [...new Set([...(s.tags || []), ...add])];
                if (merged.length > SCREENS_TAGS_MAX) { skipped++; continue; } // przekroczyłby limit — pomiń
                try { await screenshotsRef.child(id).update({ tags: merged }); s.tags = merged; done++; } catch (e) {}
            }
            showToast('🏷️ ' + t('screens.bulkTagged', { n: done }) + (skipped ? ' · ' + t('screens.bulkTagSkipped', { n: skipped }) : ''));
            renderScreensTagBar();
            renderScreensGrid();
        }
        // Upuszczenie przeciąganego kafelka na folder (drag&drop). targetFolderId '' → korzeń.
        async function dropScreenOnFolder(drag, targetFolderId) {
            if (!isAdmin || !drag) return;
            targetFolderId = targetFolderId || null;
            if (drag.kind === 'folder') {
                if (findScreenFolder(drag.id)?.managed) { showToast('🔒 ' + t('heroGallery.protected'), true); return; } // zarządzanego folderu nie przenosimy
                if (drag.id === targetFolderId) return;
                if (screenFolderSubtree(drag.id).includes(targetFolderId)) { showToast('⚠️ ' + t('screens.moveIntoSelf'), true); return; }
                const f = findScreenFolder(drag.id);
                if (!f || (f.parentId || null) === targetFolderId) return; // już tam
                if (screenFolderChildren(targetFolderId).some(o => o.id !== drag.id && (o.name || '').toLowerCase() === (f.name || '').toLowerCase())) {
                    showToast('⚠️ ' + t('screens.folderExists'), true); return;
                }
                try { await screenFoldersRef.child(drag.id).update({ parentId: targetFolderId }); showToast('✅ ' + t('screens.moved')); }
                catch (e) { showToast(t('common.error') + ': ' + e.message, true); }
            } else {
                const s = findScreenshot(drag.id);
                if (!s || (s.folderId || null) === targetFolderId) return; // już tam
                try { await screenshotsRef.child(drag.id).update({ folderId: targetFolderId }); showToast('✅ ' + t('screens.moved')); }
                catch (e) { showToast(t('common.error') + ': ' + e.message, true); }
            }
        }

        // ── Lightbox ──
        function openScreenLightbox(id) {
            const s = findScreenshot(id);
            if (!s) return;
            screensLightboxId = id;
            resetLbZoom();
            setLightboxImage(s, id); // miniatura natychmiast (z cache siatki) → pełny obraz doczytuje się w tle
            const meta = [];
            const penTitle = isAdmin ? `<button class="lb-edit-mini" title="${t('screens.renameShotPrompt')}" onclick="renameScreenshot('${jsStr(id)}')">✏️</button>` : '';
            // C: przenieś prosto z podglądu (modal wchodzi nad lightbox — patrz #screens-move-modal z-index)
            const penMove = isAdmin ? `<button class="lb-edit-mini" title="${t('screens.moveTitle')}" onclick="openScreenMove('shot','${jsStr(id)}')">📁</button>` : '';
            const favOn = screenFavorites.includes(id); // ⭐ dla wszystkich
            const favLb = `<button class="lb-edit-mini lb-fav${favOn ? ' on' : ''}" title="${t('screens.favTitle')}" onclick="toggleScreenFav('${jsStr(id)}')">${favOn ? '⭐' : '☆'}</button>`;
            meta.push(`<div class="lb-title-row"><span class="lb-title">${escapeHtml(s.title || '—')}</span>${favLb}${penTitle}${penMove}</div>`);
            if (s.comment || isAdmin) {
                const penCmt = isAdmin ? `<button class="lb-edit-mini" title="${t('screens.commentPrompt')}" onclick="editScreenshotComment('${jsStr(id)}')">✏️</button>` : '';
                const cmt = s.comment
                    ? `<span class="lb-comment">${escapeHtml(s.comment)}</span>`
                    : `<span class="lb-comment lb-comment-empty">${t('screens.noComment')}</span>`;
                meta.push(`<div class="lb-comment-row">${cmt}${penCmt}</div>`);
            }
            if ((s.tags && s.tags.length) || isAdmin) {
                const penTags = isAdmin ? `<button class="lb-edit-mini" title="${t('screens.tagsPrompt')}" onclick="editScreenshotTags('${jsStr(id)}')">🏷️✏️</button>` : '';
                const chips = (s.tags && s.tags.length)
                    ? s.tags.map(tg => `<span class="screen-tag">${escapeHtml(tg)}</span>`).join('')
                    : `<span class="lb-comment-empty">${t('screens.noTags')}</span>`;
                meta.push(`<div class="lb-tags-row">${chips}${penTags}</div>`);
            }
            $('screens-lightbox-meta').innerHTML = meta.join('');
            const multi = screensViewShots.length > 1;
            document.querySelectorAll('.screens-lightbox-nav').forEach(b => b.style.display = multi ? 'block' : 'none');
            $('screens-lightbox').classList.remove('hidden');
            preloadNeighborScreens(); // sąsiedzi (‹ › / swipe) doczytani w tle → natychmiastowa nawigacja
        }
        // Ustawia obraz lightboxa: jeśli pełny już w cache → od razu; inaczej miniatura (jest w cache siatki, więc widać ją natychmiast)
        // jako placeholder + pełny doczytywany w tle i podmieniany. Znika „pusta" sekunda czekania na duży plik ze Storage.
        function setLightboxImage(s, id) {
            const img = $('screens-lightbox-img');
            if (!img) return;
            const full = s.url, thumb = s.thumbUrl || s.url;
            if (full === thumb || screensFullLoaded.has(full)) { // brak miniatury albo pełny już wczytany → bez migotania
                img.classList.remove('lb-loading');
                img.src = full;
                return;
            }
            img.classList.add('lb-loading'); // lekki blur maskuje niską rozdzielczość miniatury do czasu wyostrzenia
            img.src = thumb;
            const pre = new Image();
            pre.onload = () => {
                screensFullLoaded.add(full);
                if (screensLightboxId === id) { img.src = full; img.classList.remove('lb-loading'); }
            };
            pre.onerror = () => { if (screensLightboxId === id) img.classList.remove('lb-loading'); };
            pre.src = full;
        }
        // Prefetch pełnych obrazów sąsiadów (poprzedni/następny) w tle → swipe/‹ › natychmiast.
        function preloadNeighborScreens() {
            const shots = screensViewShots;
            if (!shots || shots.length < 2) return;
            const idx = shots.findIndex(x => x.id === screensLightboxId);
            if (idx < 0) return;
            [1, -1].forEach(d => {
                const n = shots[(idx + d + shots.length) % shots.length];
                if (n && n.url && !screensFullLoaded.has(n.url)) {
                    const im = new Image();
                    im.onload = () => screensFullLoaded.add(n.url);
                    im.src = n.url;
                }
            });
        }
        function closeScreenLightbox() {
            $('screens-lightbox')?.classList.add('hidden');
            const img = $('screens-lightbox-img');
            if (img) img.src = '';
            screensLightboxId = null;
            resetLbZoom();
        }
        // ── Zoom/pan lightboxa (scroll, dblclick, drag; touch: pinch/pan/swipe w setupScreensInteractions) ──
        function applyLbTransform() {
            const img = $('screens-lightbox-img');
            if (!img) return;
            img.style.transform = `translate(${lbTx}px, ${lbTy}px) scale(${lbScale})`;
            img.classList.toggle('zoomed', lbScale > 1);
        }
        function resetLbZoom() { lbScale = 1; lbTx = 0; lbTy = 0; applyLbTransform(); }
        // Pobranie: próba fetch→blob (prawdziwe „zapisz"), fallback do otwarcia w nowej karcie (np. gdy CORS bucketu blokuje fetch).
        async function downloadScreenshot(id) {
            const s = findScreenshot(id || screensLightboxId);
            if (!s) return;
            const fname = (s.title || 'screen').replace(/[\\/:*?"<>|]+/g, '_') + '.jpg';
            try {
                const resp = await fetch(s.url);
                if (!resp.ok) throw new Error('fetch ' + resp.status);
                const blob = await resp.blob();
                const objUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = objUrl; a.download = fname;
                document.body.appendChild(a); a.click(); a.remove();
                setTimeout(() => URL.revokeObjectURL(objUrl), 2000);
            } catch (e) {
                window.open(s.url, '_blank'); // fallback — użytkownik zapisuje ręcznie
            }
        }
        // Nawigacja ‹ › po screenach bieżącego folderu (zawija się na końcach).
        function lightboxNav(dir) {
            const shots = screensViewShots;
            if (!shots || shots.length < 2) return;
            const idx = shots.findIndex(s => s.id === screensLightboxId);
            if (idx < 0) return;
            const next = shots[(idx + dir + shots.length) % shots.length];
            if (next) openScreenLightbox(next.id);
        }
        // Edycja opisu screena (admin) — prompt; optymistycznie odświeża lightbox.
        async function editScreenshotComment(id) {
            if (!isAdmin) return;
            const s = findScreenshot(id);
            if (!s) return;
            const comment = prompt(t('screens.commentPrompt'), s.comment || '');
            if (comment === null) return; // anulowano
            if (comment.trim().length > SCREENS_COMMENT_MAX) { showToast('⚠️ ' + t('screens.commentTooLong', { n: SCREENS_COMMENT_MAX }), true); return; }
            try {
                await screenshotsRef.child(id).update({ comment: comment.trim() });
                s.comment = comment.trim();
                if (screensLightboxId === id) openScreenLightbox(id);
            } catch (e) { showToast(t('common.error') + ': ' + e.message, true); }
        }
        // Edycja tagów (admin) — lista po przecinku; unikalne, bez pustych.
        async function editScreenshotTags(id) {
            if (!isAdmin) return;
            const s = findScreenshot(id);
            if (!s) return;
            const raw = prompt(t('screens.tagsPrompt'), (s.tags || []).join(', '));
            if (raw === null) return; // anulowano
            const tags = [...new Set(raw.split(',').map(x => x.trim()).filter(Boolean))];
            if (tags.length > SCREENS_TAGS_MAX) { showToast('⚠️ ' + t('screens.tooManyTags', { n: SCREENS_TAGS_MAX }), true); return; }
            if (tags.some(tg => tg.length > SCREENS_TAG_MAX)) { showToast('⚠️ ' + t('screens.tagTooLong', { n: SCREENS_TAG_MAX }), true); return; }
            try {
                await screenshotsRef.child(id).update({ tags });
                s.tags = tags;
                renderScreensTagBar();
                if (screensLightboxId === id) openScreenLightbox(id);
            } catch (e) { showToast(t('common.error') + ': ' + e.message, true); }
        }

        // Globalne interakcje Galerii: wklej ze schowka (Ctrl+V), drag&drop plików, klawisze lightboxa.
        function setupScreensInteractions() {
            document.addEventListener('paste', e => {
                if (!isAdmin || !$('tab-screens')?.classList.contains('active')) return;
                const files = [];
                for (const it of (e.clipboardData?.items || [])) {
                    if (it.kind === 'file' && (it.type || '').startsWith('image/')) { const f = it.getAsFile(); if (f) files.push(f); }
                }
                if (files.length) { e.preventDefault(); handleScreenUpload(files); }
            });
            document.addEventListener('keydown', e => {
                const lb = $('screens-lightbox');
                if (!lb || lb.classList.contains('hidden')) return;
                if (e.key === 'ArrowLeft') lightboxNav(-1);
                else if (e.key === 'ArrowRight') lightboxNav(1);
                else if (e.key === 'Escape') closeScreenLightbox();
            });
            const grid = $('screens-grid');
            if (grid) {
                const hasFiles = e => Array.from(e.dataTransfer?.types || []).includes('Files');
                // Drop plików z pulpitu = upload (tylko gdy faktycznie ciągniemy pliki, nie wewnętrzny kafelek).
                grid.addEventListener('dragover', e => { if (isAdmin && hasFiles(e)) { e.preventDefault(); grid.classList.add('drag-over'); } });
                grid.addEventListener('dragleave', e => { if (e.target === grid) grid.classList.remove('drag-over'); });
                grid.addEventListener('drop', e => {
                    grid.classList.remove('drag-over');
                    if (!isAdmin) return;
                    const files = Array.from(e.dataTransfer?.files || []).filter(f => (f.type || '').startsWith('image/'));
                    if (files.length) { e.preventDefault(); handleScreenUpload(files); }
                });

                // ── Wewnętrzny drag&drop: przeciągnij kafelek (screen/folder) na folder lub okruszek ──
                grid.addEventListener('dragstart', e => {
                    const card = e.target.closest('[data-kind]');
                    if (!card || !isAdmin) return;
                    screenDrag = { kind: card.dataset.kind, id: card.dataset.id };
                    e.dataTransfer.effectAllowed = 'move';
                    try { e.dataTransfer.setData('text/plain', card.dataset.id); } catch (_) {}
                    card.classList.add('dragging');
                });
                grid.addEventListener('dragend', () => {
                    screenDrag = null;
                    grid.querySelectorAll('.dragging, .drop-target').forEach(el => el.classList.remove('dragging', 'drop-target'));
                });
                grid.addEventListener('dragover', e => {
                    if (!screenDrag) return;
                    const folder = e.target.closest('.screen-folder-card');
                    if (!folder || (screenDrag.kind === 'folder' && folder.dataset.id === screenDrag.id)) return;
                    e.preventDefault();
                    folder.classList.add('drop-target');
                });
                grid.addEventListener('dragleave', e => {
                    const folder = e.target.closest('.screen-folder-card');
                    if (folder && !folder.contains(e.relatedTarget)) folder.classList.remove('drop-target');
                });
                grid.addEventListener('drop', e => {
                    if (!screenDrag) return;
                    const folder = e.target.closest('.screen-folder-card');
                    if (!folder) return;
                    e.preventDefault(); e.stopPropagation();
                    folder.classList.remove('drop-target');
                    dropScreenOnFolder(screenDrag, folder.dataset.id);
                    screenDrag = null;
                });
            }
            // Okruszki jako cele drop (przenieś w górę drzewa / do korzenia).
            const crumbs = $('screens-breadcrumb');
            if (crumbs) {
                crumbs.addEventListener('dragover', e => {
                    if (!screenDrag) return;
                    const c = e.target.closest('.screens-crumb');
                    if (!c || c.dataset.folder === undefined) return;
                    e.preventDefault();
                    c.classList.add('drop-target');
                });
                crumbs.addEventListener('dragleave', e => {
                    const c = e.target.closest('.screens-crumb');
                    if (c) c.classList.remove('drop-target');
                });
                crumbs.addEventListener('drop', e => {
                    if (!screenDrag) return;
                    const c = e.target.closest('.screens-crumb');
                    if (!c || c.dataset.folder === undefined) return;
                    e.preventDefault();
                    c.classList.remove('drop-target');
                    dropScreenOnFolder(screenDrag, c.dataset.folder);
                    screenDrag = null;
                });
            }

            // ── Zoom/pan/swipe na obrazie lightboxa ──
            const lbImg = $('screens-lightbox-img');
            if (lbImg) {
                const touchDist = ts => Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY);
                // Desktop: scroll = zoom, dblclick = toggle, drag = pan (gdy powiększone)
                lbImg.addEventListener('wheel', e => {
                    e.preventDefault();
                    const ns = Math.min(5, Math.max(1, lbScale * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
                    if (ns === 1) resetLbZoom(); else { lbScale = ns; applyLbTransform(); }
                }, { passive: false });
                lbImg.addEventListener('dblclick', e => {
                    e.preventDefault();
                    if (lbScale > 1) resetLbZoom(); else { lbScale = 2.5; applyLbTransform(); }
                });
                let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
                lbImg.addEventListener('mousedown', e => {
                    if (lbScale <= 1) return;
                    dragging = true; sx = e.clientX; sy = e.clientY; ox = lbTx; oy = lbTy; e.preventDefault();
                });
                window.addEventListener('mousemove', e => {
                    if (!dragging) return;
                    lbTx = ox + (e.clientX - sx); lbTy = oy + (e.clientY - sy); applyLbTransform();
                });
                window.addEventListener('mouseup', () => { dragging = false; });
                // Touch: pinch = zoom, drag = pan (gdy powiększone), swipe = nawigacja (gdy 1×)
                let tsx = 0, tsy = 0, sd = 0, ss = 1, pox = 0, poy = 0, panning = false, swiping = false;
                lbImg.addEventListener('touchstart', e => {
                    if (e.touches.length === 2) { sd = touchDist(e.touches); ss = lbScale; panning = false; swiping = false; }
                    else if (e.touches.length === 1) {
                        tsx = e.touches[0].clientX; tsy = e.touches[0].clientY; pox = lbTx; poy = lbTy;
                        panning = lbScale > 1; swiping = lbScale <= 1;
                    }
                }, { passive: false });
                lbImg.addEventListener('touchmove', e => {
                    if (e.touches.length === 2 && sd > 0) {
                        e.preventDefault();
                        lbScale = Math.min(5, Math.max(1, ss * touchDist(e.touches) / sd)); applyLbTransform();
                    } else if (e.touches.length === 1 && panning) {
                        e.preventDefault();
                        lbTx = pox + (e.touches[0].clientX - tsx); lbTy = poy + (e.touches[0].clientY - tsy); applyLbTransform();
                    }
                }, { passive: false });
                lbImg.addEventListener('touchend', e => {
                    if (swiping && e.changedTouches.length) {
                        const dx = e.changedTouches[0].clientX - tsx, dy = e.changedTouches[0].clientY - tsy;
                        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) lightboxNav(dx < 0 ? 1 : -1);
                        else if (dy > 80 && Math.abs(dy) > Math.abs(dx)) closeScreenLightbox(); // swipe w dół = zamknij
                    }
                    if (lbScale <= 1) resetLbZoom();
                    swiping = false; panning = false;
                });
            }
        }

        // ── Foldery: dodaj / zmień nazwę / usuń (admin) ──
        async function createScreenFolder() {
            if (!isAdmin || !screenFoldersRef) return;
            const name = (prompt(t('screens.folderNamePrompt')) || '').trim();
            if (!name) return;
            if (name.length > SCREENS_TITLE_MAX) { showToast('⚠️ ' + t('screens.titleTooLong', { n: SCREENS_TITLE_MAX }), true); return; }
            const parent = screensCurrentFolder || null;
            if (screenFolderChildren(parent).some(f => (f.name || '').toLowerCase() === name.toLowerCase())) {
                showToast('⚠️ ' + t('screens.folderExists'), true); return;
            }
            try {
                const ref = screenFoldersRef.push();
                await ref.set({ id: ref.key, name, parentId: parent, createdAt: new Date().toISOString() });
            } catch (e) { showToast(t('common.error') + ': ' + e.message, true); }
        }
        async function renameScreenFolder(id) {
            if (!isAdmin) return;
            const f = findScreenFolder(id);
            if (!f) return;
            if (f.managed) { showToast('🔒 ' + t('heroGallery.protected'), true); return; }
            const name = (prompt(t('screens.renameFolderPrompt'), f.name) || '').trim();
            if (!name || name === f.name) return;
            if (name.length > SCREENS_TITLE_MAX) { showToast('⚠️ ' + t('screens.titleTooLong', { n: SCREENS_TITLE_MAX }), true); return; }
            if (screenFolderChildren(f.parentId || null).some(o => o.id !== id && (o.name || '').toLowerCase() === name.toLowerCase())) {
                showToast('⚠️ ' + t('screens.folderExists'), true); return;
            }
            try { await screenFoldersRef.child(id).update({ name }); }
            catch (e) { showToast(t('common.error') + ': ' + e.message, true); }
        }
        async function renameScreenshot(id) {
            if (!isAdmin) return;
            const s = findScreenshot(id);
            if (!s) return;
            const raw = prompt(t('screens.renameShotPrompt'), s.title || '');
            if (raw === null) return; // anulowano — NIE czyścimy nazwy (pusty string z „Anuluj" wcześniej kasował nazwę)
            const title = raw.trim();
            if (title === (s.title || '')) return;
            if (title.length > SCREENS_TITLE_MAX) { showToast('⚠️ ' + t('screens.titleTooLong', { n: SCREENS_TITLE_MAX }), true); return; }
            try {
                await screenshotsRef.child(id).update({ title });
                s.title = title;
                if (screensLightboxId === id) openScreenLightbox(id);
            } catch (e) { showToast(t('common.error') + ': ' + e.message, true); }
        }
        // Kasuje pliki screena ze Storage: pełny + miniatura (oba opcjonalne, błędy ignorowane).
        async function deleteScreenStorageFiles(s) {
            if (!screensStorageRef) return;
            for (const p of [s.storagePath, s.thumbPath]) {
                if (p) { try { await screensStorageRef.child(p).delete(); } catch (e) {} }
            }
        }
        async function deleteScreenshot(id) {
            if (!isAdmin) return;
            const s = findScreenshot(id);
            if (!s) return;
            if (!confirm(t('screens.deleteShotConfirm'))) return;
            try {
                await deleteScreenStorageFiles(s);
                await screenshotsRef.child(id).remove();
                showToast('🗑️ ' + t('screens.deleted'));
            } catch (e) { showToast(t('common.error') + ': ' + e.message, true); }
        }
        async function deleteScreenFolder(id) {
            if (!isAdmin) return;
            const f = findScreenFolder(id);
            if (!f) return;
            if (f.managed) { showToast('🔒 ' + t('heroGallery.protected'), true); return; }
            const subtree = screenFolderSubtree(id);                 // folder + podfoldery (ID)
            const shots = allScreenshots.filter(s => subtree.includes(s.folderId));
            if (!confirm(t('screens.deleteFolderConfirm', { name: f.name, n: shots.length }))) return;
            try {
                await Promise.all(shots.map(async s => {
                    await deleteScreenStorageFiles(s);
                    await screenshotsRef.child(s.id).remove();
                }));
                await Promise.all(subtree.map(fid => screenFoldersRef.child(fid).remove()));
                if (subtree.includes(screensCurrentFolder)) screensGoTo(f.parentId || null);
                showToast('🗑️ ' + t('screens.deleted'));
            } catch (e) { showToast(t('common.error') + ': ' + e.message, true); }
        }

        // ── Przenoszenie (modal z drzewem folderów) ──
        function openScreenMove(kind, id) {
            if (!isAdmin) return;
            if (kind === 'folder' && findScreenFolder(id)?.managed) { showToast('🔒 ' + t('heroGallery.protected'), true); return; }
            screenMoveCtx = { kind, id };
            renderScreenMoveList();
            $('screens-move-modal')?.classList.remove('hidden');
        }
        function closeScreenMove() { $('screens-move-modal')?.classList.add('hidden'); screenMoveCtx = null; }
        function renderScreenMoveList() {
            const list = $('screens-move-list');
            if (!list || !screenMoveCtx) return;
            const { kind, id } = screenMoveCtx;
            const titleEl = $('screens-move-title');
            if (titleEl) titleEl.textContent = kind === 'bulk' ? t('screens.moveBulkTitle', { n: screenMoveCtx.ids.length }) : t('screens.moveTitle');
            const blocked = kind === 'folder' ? new Set(screenFolderSubtree(id)) : new Set(); // folder nie może trafić do siebie/poddrzewa
            const cur = kind === 'folder' ? (findScreenFolder(id)?.parentId || null) : kind === 'shot' ? (findScreenshot(id)?.folderId || null) : undefined; // bulk: brak jednego „bieżącego"
            const rows = [moveRow(null, '🖼️ ' + t('screens.moveRoot'), 0, cur === null, false)];
            const walk = (parentId, depth) => {
                screenFolderChildren(parentId).forEach(f => {
                    rows.push(moveRow(f.id, '📁 ' + escapeHtml(f.name), depth, cur === f.id, blocked.has(f.id)));
                    walk(f.id, depth + 1);
                });
            };
            walk(null, 1);
            // Feature 1: utwórz nowy folder (w bieżąco przeglądanym miejscu) i od razu tu przenieś.
            const newBtn = `<button class="screens-move-new" onclick="createFolderAndMove()">➕ ${t('screens.newFolderHere', { loc: screenFolderLabel(screensCurrentFolder) })}</button>`;
            list.innerHTML = newBtn + rows.join('');
            function moveRow(targetId, label, depth, isCurrent, isBlocked) {
                const disabled = isCurrent || isBlocked;
                const target = targetId === null ? 'null' : `'${jsStr(targetId)}'`;
                return `<button class="screens-move-item" style="padding-left:${8 + depth * 16}px"${disabled ? ' disabled' : ''} onclick="doScreenMove(${target})">${label}${isCurrent ? ' ✓' : ''}</button>`;
            }
        }
        // Tworzy folder w bieżąco przeglądanym folderze i przenosi do niego aktualny kontekst (screen/folder/bulk).
        async function createFolderAndMove() {
            if (!isAdmin || !screenMoveCtx) return;
            const parent = screensCurrentFolder || null;
            const name = (prompt(t('screens.folderNamePrompt')) || '').trim();
            if (!name) return;
            if (name.length > SCREENS_TITLE_MAX) { showToast('⚠️ ' + t('screens.titleTooLong', { n: SCREENS_TITLE_MAX }), true); return; }
            if (screenFolderChildren(parent).some(f => (f.name || '').toLowerCase() === name.toLowerCase())) { showToast('⚠️ ' + t('screens.folderExists'), true); return; }
            try {
                const ref = screenFoldersRef.push();
                await ref.set({ id: ref.key, name, parentId: parent, createdAt: new Date().toISOString() });
                await doScreenMove(ref.key); // przenosi bieżący kontekst do nowego folderu i zamyka modal
            } catch (e) { showToast(t('common.error') + ': ' + e.message, true); }
        }
        async function doScreenMove(targetFolderId) {
            if (!isAdmin || !screenMoveCtx) return;
            const { kind, id } = screenMoveCtx;
            try {
                if (kind === 'bulk') {
                    let done = 0;
                    for (const sid of screenMoveCtx.ids) {
                        try { await screenshotsRef.child(sid).update({ folderId: targetFolderId }); done++; } catch (e) {}
                    }
                    screensSelected.clear();
                    closeScreenMove();
                    showToast('✅ ' + t('screens.bulkMoved', { n: done }));
                    renderScreensTab();
                    return;
                }
                if (kind === 'folder') {
                    if (findScreenFolder(id)?.managed) { closeScreenMove(); return; } // zarządzanego folderu nie przenosimy
                    if (screenFolderSubtree(id).includes(targetFolderId)) { closeScreenMove(); return; } // nigdy do własnego poddrzewa
                    const f = findScreenFolder(id);
                    if (f && screenFolderChildren(targetFolderId).some(o => o.id !== id && (o.name || '').toLowerCase() === (f.name || '').toLowerCase())) {
                        showToast('⚠️ ' + t('screens.folderExists'), true); return;
                    }
                    await screenFoldersRef.child(id).update({ parentId: targetFolderId });
                } else {
                    await screenshotsRef.child(id).update({ folderId: targetFolderId });
                }
                closeScreenMove();
                showToast('✅ ' + t('screens.moved'));
            } catch (e) { showToast(t('common.error') + ': ' + e.message, true); }
        }

        // ── Upload z opcjonalną kompresją (canvas) ──
        // Dekoduje plik obrazu RAZ do elementu <img> (do wielokrotnego rysowania w różnych rozmiarach — pełny + miniatura z jednego dekodowania).
        function decodeImageFile(file) {
            return new Promise((resolve, reject) => {
                const img = new Image();
                const url = URL.createObjectURL(file);
                img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
                img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); };
                img.src = url;
            });
        }
        // Rysuje już zdekodowany obraz do JPEG-a o zadanym maksymalnym boku.
        function imageToBlob(img, maxDim, quality) {
            return new Promise((resolve, reject) => {
                let width = img.width, height = img.height;
                if (width > maxDim || height > maxDim) {
                    if (width >= height) { height = Math.round(height * maxDim / width); width = maxDim; }
                    else { width = Math.round(width * maxDim / height); height = maxDim; }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width; canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/jpeg', quality);
            });
        }
        // Kompresja pojedynczego rozmiaru (dekoduje raz) — zachowana dla ewentualnych innych wywołań.
        async function compressImage(file, maxDim = SCREENS_MAX_DIM, quality = SCREENS_JPEG_Q) {
            return imageToBlob(await decodeImageFile(file), maxDim, quality);
        }
        async function handleScreenUpload(fileList) {
            if (!isAdmin || !screensStorageRef || !screenshotsRef) return;
            const files = Array.from(fileList || []).filter(Boolean);
            if (!files.length) return;
            const status = $('screens-upload-status');
            const compress = appConfig.screensCompress !== false;
            const targetFolder = screensCurrentFolder || null;
            // B: pokaż dokąd lecą screeny (nazwa folderu, niezaescape'owana — status/toast to tekst).
            const folderLabel = targetFolder ? screenFolderPath(targetFolder).map(f => f.name).join(' / ') : t('screens.root');
            const CACHE = 'public, max-age=604800'; // przeglądarka trzyma obraz tydzień → powtórne wejścia bez transferu
            let done = 0, finished = 0; const skipped = [];
            const updateStatus = () => { if (status) status.textContent = t('screens.uploadingProgress', { done: finished, n: files.length, folder: folderLabel }); };
            updateStatus();
            // Przetwarza jeden plik: dekoduje RAZ, kompresuje pełny+miniaturę i wysyła oba do Storage równolegle.
            const processOne = async (file) => {
                if (!/^image\//.test(file.type || '')) { skipped.push(t('screens.notImage', { name: file.name })); return; }
                let fullBlob = file, thumbBlob = null;
                if (compress) {
                    try {
                        const img = await decodeImageFile(file); // jedno dekodowanie → oba rozmiary
                        [fullBlob, thumbBlob] = await Promise.all([
                            imageToBlob(img, SCREENS_MAX_DIM, SCREENS_JPEG_Q),
                            imageToBlob(img, SCREENS_THUMB_DIM, SCREENS_THUMB_Q),
                        ]);
                    } catch (e) { fullBlob = file; thumbBlob = null; }
                }
                if (fullBlob.size > SCREENS_MAX_BYTES) { skipped.push(t('screens.tooBig', { name: file.name })); return; }
                const ref = screenshotsRef.push();
                const id = ref.key;
                const path = `screenshots/${id}`;
                // Pełny obraz i miniatura lecą do Storage równolegle (miniatura opcjonalna — błąd nie blokuje wgrania).
                const fullPromise = screensStorageRef.child(path).put(fullBlob, { contentType: fullBlob.type || 'image/jpeg', cacheControl: CACHE })
                    .then(snap => snap.ref.getDownloadURL());
                let thumbPromise = Promise.resolve({ thumbUrl: null, thumbPath: null });
                if (thumbBlob) {
                    const thumbPath = `screenshots/${id}_thumb`;
                    thumbPromise = screensStorageRef.child(thumbPath).put(thumbBlob, { contentType: 'image/jpeg', cacheControl: CACHE })
                        .then(snap => snap.ref.getDownloadURL()).then(thumbUrl => ({ thumbUrl, thumbPath }))
                        .catch(() => ({ thumbUrl: null, thumbPath: null }));
                }
                const [url, thumb] = await Promise.all([fullPromise, thumbPromise]);
                await ref.set({ id, folderId: targetFolder, url, storagePath: path, thumbUrl: thumb.thumbUrl, thumbPath: thumb.thumbPath, size: fullBlob.size, title: file.name.replace(/\.[^.]+$/, '').slice(0, SCREENS_TITLE_MAX), comment: '', tags: [], uploadedAt: new Date().toISOString() });
                done++;
            };
            // Pula robocza: kilka plików naraz (cap) zamiast jeden-po-drugim — mocno skraca wgrywanie paczki.
            let next = 0;
            const worker = async () => {
                while (next < files.length) {
                    const file = files[next++];
                    try { await processOne(file); }
                    catch (e) { showToast('⚠️ ' + t('screens.uploadErr', { msg: e.message || String(e) }), true); }
                    finished++; updateStatus();
                }
            };
            await Promise.all(Array.from({ length: Math.min(SCREENS_UPLOAD_CONCURRENCY, files.length) }, worker));
            if (status) status.textContent = '';
            if (done) showToast('✅ ' + t('screens.uploadedTo', { n: done, folder: folderLabel }));
            skipped.forEach(m => showToast('⚠️ ' + m, true));
        }


        // ═══════════════════════════════════════════════════════════
        // FIREBASE INIT — realtime listenery formacji/heroes/pets
        // ═══════════════════════════════════════════════════════════

        // FIREBASE
        try {
            firebase.initializeApp(firebaseConfig);
            db = firebase.database();
            formationsRef = db.ref('formations');
            heroesRef = db.ref('heroes');
            petsRef = db.ref('pets');
            heroSkillsRef = db.ref('heroSkills');
            petSkillsRef = db.ref('petSkills');
            synonymsRef = db.ref('synonyms');
            bookBonusesRef = db.ref('bookBonuses');
            bookMetaRef = db.ref('bookMeta');

            formationsRef.on('value', snap => {
                allFormations = snap.val() ? Object.values(snap.val()).sort((a, b) => a.id - b.id) : [];
                updateUI();
                $('loading').classList.add('hidden');
                setOnlineStatus(true);
            }, () => { setOnlineStatus(false); $('loading').classList.add('hidden'); });
            
            heroesRef.on('value', snap => {
                if (snap.val()) {
                    heroes = Object.values(snap.val()).sort((a, b) => a.name.localeCompare(b.name));
                    if (isAdmin) renderHeroesList();
                    // Nowy/zmieniony bohater pojawia się od razu w zakładce Bohaterowie (z „brak danych" dopóki admin nie uzupełni skilli)
                    if ($('tab-heroes')?.classList.contains('active')) renderHeroesGrid();
                    // Regeneruj tagi zależne od heroes (War/Kreator/Dodaj + grupowanie Szukajki po rasie) — updateUI już ich nie rusza
                    generateWarTags();
                    generateKreatorTags();
                    generateAddFormTags();
                    generateQuickTags();
                }
            });

            petsRef.on('value', snap => {
                if (snap.val()) {
                    pets = Object.values(snap.val()).map(getPetName).sort();
                    if (isAdmin) renderPetsList();
                    if ($('tab-heroes')?.classList.contains('active')) renderHeroesGrid(); // nowy pet pojawia się od razu w sekcji Pety
                    // Regeneruj tagi zależne od pets (War/Kreator/Dodaj + pety w Szukajce) — updateUI już ich nie rusza
                    generateWarTags();
                    generateKreatorTags();
                    generateAddFormTags();
                    generateQuickTags();
                }
            });
            
            // ─── Słownik synonimów (live; przy pustym /synonyms szukajka używa DEFAULT_SYNONYMS) ───
            synonymsRef.on('value', snap => {
                const v = snap.val();
                allSynonyms = v ? Object.entries(v).map(([id, g]) => ({ id, forms: (g && g.forms) || [], expand: (g && g.expand) || [] })) : [];
                rebuildSynonymIndex();
                if ($('tab-heroes')?.classList.contains('active')) {
                    renderHeroesSynonyms(); // mode-aware (panel Bohaterów albo Księgi)
                    if (heroesMode === 'book') renderBookGrid(); else renderHeroesGrid();
                }
            }, () => {});

            // ─── Księga bonusów (live; przy pustym /bookBonuses szukajka używa DEFAULT_BOOK_BONUSES) ───
            // WYMAGA reguły Firebase: "bookBonuses": { ".read": true, ".write": true } — bez niej seed/edycja cicho odpadają.
            bookBonusesRef.on('value', snap => {
                const v = snap.val();
                allBookBonuses = v ? Object.entries(v).map(([id, x]) => ({ ...x, id })) : [];
                const ord = {}; getBooks().forEach(m => { ord[m.key] = m.order || 0; });
                allBookBonuses.sort((a, b) => (ord[a.book] ?? 90) - (ord[b.book] ?? 90) || (a.order || 0) - (b.order || 0));
                if (heroesMode === 'book' && $('tab-heroes')?.classList.contains('active')) renderBookTab();
            }, () => {});
            // ─── Definicje ksiąg (live). WYMAGA reguły: "bookMeta": { ".read": true, ".write": true } ───
            bookMetaRef.on('value', snap => {
                const v = snap.val();
                allBookMeta = v ? Object.entries(v).map(([id, x]) => ({ ...x, id })) : [];
                if (heroesMode === 'book' && $('tab-heroes')?.classList.contains('active')) renderBookTab();
                if ($('book-meta-modal')?.classList.contains('show')) renderBookMetaList();
            }, () => {});

            // ─── Defense (obrona gildii) ───
            defenseFormationsRef = db.ref('defenseFormations');
            defensePlayersRef = db.ref('defensePlayers');
            defenseAssignmentsRef = db.ref('defenseAssignments');

            defenseFormationsRef.on('value', snap => {
                allDefenseFormations = snap.val() ? Object.values(snap.val()).sort((a, b) => a.id - b.id) : [];
                if (isAdmin) rerenderDefenseCurrent();
            });
            defensePlayersRef.on('value', snap => {
                allDefensePlayers = snap.val() ? Object.values(snap.val()).sort((a, b) => a.id - b.id) : [];
                if (isAdmin) rerenderDefenseCurrent();
            });
            defenseAssignmentsRef.on('value', snap => {
                allDefenseAssignments = snap.val() ? Object.values(snap.val()).sort((a, b) => a.id - b.id) : [];
                if (isAdmin) rerenderDefenseCurrent();
            });

            // ─── Galeria screenów (Firebase Storage + RTDB /screenFolders + /screenshots) ───
            screenFoldersRef = db.ref('screenFolders');
            screenshotsRef = db.ref('screenshots');
            try { if (firebase.storage) screensStorageRef = firebase.storage().ref(); }
            catch (e) { console.error('Storage init error:', e); }

            // id ZAWSZE z klucza Firebase (nie z pola) — odporne na rozjazd zapisanego 'id' vs klucza.
            // Inkrementalnie (child_*): przy zmianie leci tylko delta, nie cały zrzut. Bursty (start, seed ~300 folderów)
            // scalane debounce'em w jeden rebuild, żeby uniknąć O(n²) przy setkach eventów na starcie.
            screenFoldersRef.on('child_added', s => { screenFoldersById.set(s.key, { ...s.val(), id: s.key }); scheduleScreensCache('folders'); });
            screenFoldersRef.on('child_changed', s => { screenFoldersById.set(s.key, { ...s.val(), id: s.key }); scheduleScreensCache('folders'); });
            screenFoldersRef.on('child_removed', s => { screenFoldersById.delete(s.key); scheduleScreensCache('folders'); });
            screenshotsRef.on('child_added', s => { screenshotsById.set(s.key, { ...s.val(), id: s.key }); scheduleScreensCache('shots'); });
            screenshotsRef.on('child_changed', s => { screenshotsById.set(s.key, { ...s.val(), id: s.key }); scheduleScreensCache('shots'); });
            screenshotsRef.on('child_removed', s => { screenshotsById.delete(s.key); scheduleScreensCache('shots'); });

            // ─── Globalna konfiguracja gildii ───
            // Pod-węzeł 'config/settings' (a nie całe /config), bo reguły Firebase trzymają
            // /config zamknięte, a /config/adminPassword osobno — settings ma własną regułę read/write.
            configRef = db.ref('config/settings');
            configRef.on('value', snap => {
                const c = snap.val() || {};
                const days = Number(c.newFormationDays);
                const minMatch = Number(c.defaultMinMatch);
                const pkgSup = Number(c.defaultPackageMinSupport);
                appConfig.newFormationDays = days > 0 ? days : DEFAULT_CONFIG.newFormationDays;
                appConfig.defaultMinMatch = minMatch > 0 ? minMatch : DEFAULT_CONFIG.defaultMinMatch;
                const warRes = Number(c.warResultLimit);
                appConfig.warResultLimit = (warRes >= 5 && warRes <= 100) ? warRes : DEFAULT_CONFIG.warResultLimit;
                appConfig.defaultSearchSort = (c.defaultSearchSort === 'newest' || c.defaultSearchSort === 'relevance')
                    ? c.defaultSearchSort : DEFAULT_CONFIG.defaultSearchSort;
                appConfig.defaultDbFilter = ['all', 'base', 'user', 'favorites'].includes(c.defaultDbFilter)
                    ? c.defaultDbFilter : DEFAULT_CONFIG.defaultDbFilter;
                appConfig.defaultPackageMinSupport = pkgSup > 0 ? pkgSup : DEFAULT_CONFIG.defaultPackageMinSupport;
                appConfig.defaultPackageWindow = ['all', '30', '90'].includes(String(c.defaultPackageWindow))
                    ? String(c.defaultPackageWindow) : DEFAULT_CONFIG.defaultPackageWindow;
                appConfig.screensCompress = (c.screensCompress === false) ? false : true; // domyślnie TAK
                // Przykłady szukajki Bohaterów: array (edytowalny) albo null = domyślne (HEROES_SEARCH_EXAMPLES)
                appConfig.heroSearchExamples = Array.isArray(c.heroSearchExamples) ? c.heroSearchExamples.filter(x => typeof x === 'string') : null;
                if ($('tab-heroes')?.classList.contains('active')) renderSearchExamples(); // live przy zmianie przez innego admina
                const tv = c.tabVisibility || {};
                appConfig.tabVisibility = {};
                Object.keys(DEFAULT_CONFIG.tabVisibility).forEach(k => {
                    appConfig.tabVisibility[k] = (tv[k] === 'admin' || tv[k] === 'all') ? tv[k] : DEFAULT_CONFIG.tabVisibility[k];
                });
                const tp = c.tabPlacement || {};
                appConfig.tabPlacement = {};
                Object.keys(DEFAULT_CONFIG.tabPlacement).forEach(k => {
                    const v = tp[k];
                    // migracja starego boola (true = 'more') + walidacja stringa
                    appConfig.tabPlacement[k] = (v === 'bar' || v === 'more' || v === 'hidden') ? v : (v === true ? 'more' : 'bar');
                });
                appConfig.tabOrder = sanitizeTabOrder(c.tabOrder);
                navConfigReady = true; // prawdziwy config dotarł → wolno odsłonić pasek (z poprawnym układem)
                applyTabVisibility();

                // Live: globalne domyślne tam, gdzie użytkownik nie ma własnego wyboru
                if (storage.getJson('souls_search_min_match', null) === null) searchMinMatch = appConfig.defaultMinMatch;
                if (!userTouchedSort) currentSearchSort = appConfig.defaultSearchSort;

                // Domyślne „widoku" (filtr bazy + pakiety) stosujemy tylko raz, przy pierwszym załadowaniu
                if (!configInitApplied) {
                    configInitApplied = true;
                    packageOptions.minSupport = appConfig.defaultPackageMinSupport;
                    packageOptions.window = appConfig.defaultPackageWindow;
                    if ($('packages-min-support')) $('packages-min-support').value = packageOptions.minSupport;
                    document.querySelectorAll('.pkg-btn[data-pkg-window]').forEach(b =>
                        b.classList.toggle('active', String(b.dataset.pkgWindow) === String(packageOptions.window)));
                    setDbFilter(appConfig.defaultDbFilter);
                }

                renderConfigForm();
                if (allFormations.length) filterDatabase();              // odśwież badge NOWE w bazie
                if (lastSearch) displayResults(lastSearch.results, lastSearch.searchHeroes); // odśwież aktywne wyniki
            });

            // Fallback: gdyby config nie dotarł (offline/wolny Firebase), odsłoń pasek z domyślnymi po 2.5s
            setTimeout(() => { if (!navConfigReady) { navConfigReady = true; applyTabVisibility(); } }, 2500);

            db.ref('.info/connected').on('value', snap => setOnlineStatus(snap.val() === true));
        } catch (e) {
            console.error('Firebase error:', e);
            setOnlineStatus(false);
            $('loading').classList.add('hidden');
        }

        // =====================================================
        // INICJALIZACJA
        // =====================================================
		document.addEventListener('DOMContentLoaded', async () => {
			// Listener dla Enter przy haśle gildii
			$('guild-password')?.addEventListener('keydown', e => { if (e.key === 'Enter') tryGuildLogin(); });
			
			// Sprawdź hasło gildii PRZED wszystkim
			const hasAccess = await checkGuildAccess();
			if (!hasAccess) return;
			
			initTheme();
			loadSectionOrderPreference();
			loadEnemyRowsPreference();
			loadSearchRowsPreference();
			loadFormLayoutPreference();
			setupAutocomplete();
			
            if (localStorage.getItem('souls_admin') === ADMIN_PASSWORD_HASH) enableAdminMode();
            applyTranslations();
            
            document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
            document.querySelector(`.lang-btn[onclick="setLanguage('${currentLang}')"]`)?.classList.add('active');
            
            $('admin-password').addEventListener('keydown', e => { if (e.key === 'Enter') tryAdminLogin(); });

            setupScreensInteractions(); // Galeria: Ctrl+V, drag&drop, klawisze lightboxa
            
			document.querySelectorAll('#tab-search input[data-type]').forEach(input => {
				input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); searchFormations(); } });
				input.addEventListener('focus', () => { activeSearchField = input.id; });
				input.addEventListener('blur', () => { setTimeout(() => { activeSearchField = null; }, 200); });
			});
            
            $('lookup-id').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); lookupById(); } });
            
			$('quick-select-modal').addEventListener('click', e => { if (e.target === $('quick-select-modal')) closeQuickSelect(); });
			$('edit-modal')?.addEventListener('click', e => { if (e.target === $('edit-modal')) closeEditModal(); });
			$('defense-assign-modal')?.addEventListener('click', e => { if (e.target === $('defense-assign-modal')) closeDefenseAssignModal(); });
			$('defense-edit-modal')?.addEventListener('click', e => { if (e.target === $('defense-edit-modal')) closeDefenseEditModal(); });
			document.addEventListener('keydown', e => {
				if (e.key === 'Escape') {
					if (!$('quick-select-modal').classList.contains('hidden')) closeQuickSelect();
					if (!$('edit-modal').classList.contains('hidden')) closeEditModal();
					if (!$('defense-assign-modal').classList.contains('hidden')) closeDefenseAssignModal();
					if (!$('defense-edit-modal').classList.contains('hidden')) closeDefenseEditModal();
				}
			});

			// Defense: Enter w polu nazwy gracza = dodaj
			$('defense-new-player-name')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addDefensePlayer(); } });

			// Defense edit modal: live impact preview na zmianę któregokolwiek pola
			['defense-edit-name', 'defense-edit-comment', 'defense-edit-myPet',
				'defense-edit-my1','defense-edit-my2','defense-edit-my3','defense-edit-my4',
				'defense-edit-my5','defense-edit-my6','defense-edit-my7','defense-edit-my8'
			].forEach(id => $(id)?.addEventListener('input', updateDefenseEditImpact));
            
			// Inicjalizacja wykluczonych
			renderExcludedHeroes();
			setupExcludedAutocomplete();

			const excludeCheckbox = $('exclude-hide-results');
			if (excludeCheckbox) {
				excludeCheckbox.checked = hideExcludedResults;
			}

			// Pokaż sekcję wykluczonych na startowej zakładce
			const excludedSection = $('excluded-section');
			if (excludedSection) {
				excludedSection.style.display = 'block';
			}
			
			// Inicjalizacja wykluczonych dla planera wojny
			initWarExcluded();
			initWarFields();
			
			// Inicjalizacja kreatora
			initKreator();
			
			// Inicjalizacja ostatnio przeglądanych
			renderRecentlyViewed();

			// Startowy pusty ekran wyszukiwarki (z opcją powtórzenia ostatniego)
			renderSearchEmptyState();

			// Widoczność zakładek wg domyślnych (config dociągnie i ew. nadpisze)
			applyTabVisibility();

			// Zamykanie modali kliknięciem poza content
			$('duplicates-modal')?.addEventListener('click', e => {
				if (e.target === $('duplicates-modal')) closeDuplicatesModal();
			});

			$('duplicate-preview-modal')?.addEventListener('click', e => {
				if (e.target === $('duplicate-preview-modal')) closeDuplicatePreviewModal();
			});
			
			$('compare-modal')?.addEventListener('click', e => {
				if (e.target === $('compare-modal')) closeCompareModal();
			});
			
			// Obsługa linków bezpośrednich ?formation=ID
			const urlParams = new URLSearchParams(window.location.search);
			const formationId = urlParams.get('formation');
			if (formationId) {
				const id = parseInt(formationId);
				if (id > 0) {
					// Poczekaj aż dane się załadują
					const checkData = setInterval(() => {
						if (allFormations.length > 0) {
							clearInterval(checkData);
							showFormation(id);
						}
					}, 100);
					// Timeout po 5 sekundach
					setTimeout(() => clearInterval(checkData), 5000);
				}
			}
			
            const tabAdd = $('tab-add');
            if (tabAdd) {
                tabAdd.addEventListener('focusin', e => {
                    if (e.target.tagName === 'INPUT' && e.target.id.startsWith('add-')) {
                        activeAddField = e.target.id;
                        const indicator = $('active-field-indicator');
                        const nameEl = $('active-field-name');
                        if (indicator && nameEl) {
                            const fieldId = e.target.id.replace('add-', '');
                            let fieldName = fieldId;
                            if (fieldId.startsWith('enemy')) {
                                const num = fieldId.replace('enemy', '').replace('Pet', '');
                                fieldName = fieldId.includes('Pet') ? t('fields.enemyPet') : `${t('fields.enemy')} ${num}`;
                            } else if (fieldId.startsWith('my')) {
                                const num = fieldId.replace('my', '').replace('Pet', '');
                                fieldName = fieldId.includes('Pet') ? t('fields.yourPet') : `${t('fields.your')} ${num}`;
                            }
                            nameEl.textContent = fieldName;
                            indicator.classList.add('show');
                            updateAddFormTagsSelection();
                        }
                    }
                });
                
				tabAdd.addEventListener('keydown', e => {
								if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
									e.preventDefault();
									document.querySelectorAll('.autocomplete-list.show').forEach(l => l.classList.remove('show'));
									saveFormation();
								}
							});
						}
						
						// Setup autosave dla War Planner
						setupWarPlannerAutosave();
						
						// Renderuj przypięte składy
						renderPinnedCombos();
					});
					
		// =====================================================
		// OBSŁUGA KLAWISZY STRZAŁEK DLA NAWIGACJI
		// =====================================================
		document.addEventListener('keydown', function(e) {
			// Sprawdź czy zakładka Podgląd jest aktywna
			const viewTab = $('tab-view');
			if (!viewTab || !viewTab.classList.contains('active')) return;
			
			// Nie reaguj jeśli focus jest na input/textarea
			const activeEl = document.activeElement;
			if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
				return;
			}
			
			// Nie reaguj jeśli nie ma listy do nawigacji
			if (navFormationIds.length === 0) return;
			
			// Strzałka w lewo - poprzednia formacja
			if (e.key === 'ArrowLeft') {
				e.preventDefault();
				navigateFormation(-1);
			}
			
			// Strzałka w prawo - następna formacja
			if (e.key === 'ArrowRight') {
				e.preventDefault();
				navigateFormation(1);
			}
		});
		
		// =====================================================
		// UNIWERSALNE SKRÓTY KLAWISZOWE
		// =====================================================
		document.addEventListener('keydown', function(e) {
			const activeEl = document.activeElement;
			if (!activeEl) return;
			
			// Ctrl + 1-8 = skocz do pozycji 1-8
			// Ctrl + 9 = skocz do peta
			if (e.ctrlKey && !e.shiftKey && !e.altKey) {
				const num = parseInt(e.key);
				if (num >= 1 && num <= 9) {
					// Sprawdź czy jesteśmy w odpowiednim polu
					const sectionKey = getFieldSection(activeEl.id);
					if (sectionKey) {
						e.preventDefault();
						jumpToPosition(num);
						return;
					}
				}
			}
		});

		// Ulepszona nawigacja Tab
		document.addEventListener('keydown', function(e) {
			if (e.key !== 'Tab') return;
			
			const activeEl = document.activeElement;
			if (!activeEl || !activeEl.id) return;
			
			// Sprawdź w której zakładce jesteśmy
			let tabId = null;
			let allFields = [];
			
			if ($('tab-search')?.classList.contains('active') && activeEl.id.startsWith('search-')) {
				tabId = 'tab-search';
				allFields = getAllFieldsForTab('tab-search');
			} else if ($('tab-add')?.classList.contains('active') && activeEl.id.startsWith('add-')) {
				tabId = 'tab-add';
				allFields = getAllFieldsForTab('tab-add');
			} else if ($('tab-war')?.classList.contains('active') && activeEl.id.startsWith('war-')) {
				tabId = 'tab-war';
				allFields = getAllFieldsForTab('tab-war');
			} else if (!$('edit-modal')?.classList.contains('hidden') && activeEl.id.startsWith('edit-')) {
				// Modal edycji
				allFields = [
					'edit-name',
					...FORM_FIELD_CONFIG['edit-enemy'].fields,
					...FORM_FIELD_CONFIG['edit-my'].fields,
					'edit-comment'
				];
			}
			
			if (allFields.length === 0) return;
			
			const currentIndex = allFields.indexOf(activeEl.id);
			if (currentIndex === -1) return;
			
			let nextIndex;
			if (e.shiftKey) {
				nextIndex = currentIndex > 0 ? currentIndex - 1 : allFields.length - 1;
			} else {
				nextIndex = currentIndex < allFields.length - 1 ? currentIndex + 1 : 0;
			}
			
			const nextField = $(allFields[nextIndex]);
			if (nextField) {
				e.preventDefault();
				nextField.focus();
				if (nextField.type === 'text' || nextField.type === 'number') {
					nextField.select();
				}
			}
		});
