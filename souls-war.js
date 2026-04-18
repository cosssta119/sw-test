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
        };

        let db, formationsRef, heroesRef, petsRef;
        let allFormations = [];
        let isOnline = false, isAdmin = false;
        let headerClickCount = 0, headerClickTimer = null;
        let favorites = storage.getJson('souls_favorites', []);
        let currentLang = localStorage.getItem('souls_lang') || 'pl';
        let currentDbFilter = 'all';
		let currentDbSort = 'date-desc';
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
            Elf:    "Serena Oneiric Elara CoCo Babu Sander Tania Galan Aolmond LuLu Fiona Abala",
            Fire:   "Bella Lupico Paopao Jack Dolucos Aruru Kaion Paru Naru Telfer Lagou",
            Human:  "Morra Scarlet Kyle Adora Rakan Olga Idina Ken Calix Odelia Milia Richelle Liandra"
        }).flatMap(([race, names]) => names.split(' ').map(name => ({ name, race })));
        
        let pets = ["Gladis","Nasrune","Romanelle","Tianum","Hamm","Spooky","Mystet","Bloombell","Silbren","Vailo","Estelle","Banavi","Moko"];
        
        // =====================================================
        // TŁUMACZENIA
        // =====================================================
        
        const translations = {
            pl: {
                'loading': 'Ładowanie danych...', 'common.loading': 'Ładowanie...', 'common.cancel': 'Anuluj', 'common.clear': 'Wyczyść',
                'header.subtitle': 'Wyszukiwarka kontr-formacji', 'status.connecting': 'Łączenie...', 'status.online': 'Online', 'status.offline': 'Offline', 'status.formations': 'formacji',
                'nav.search': 'Szukaj', 'nav.database': 'Baza', 'nav.preview': 'Podgląd', 'nav.add': 'Dodaj', 'nav.import': 'Import',
                'search.title': 'Szukaj kontr-formacji', 'search.subtitle': 'Wpisz skład przeciwnika (lub wybierz tagami)', 'search.btn': 'SZUKAJ', 'search.clear': 'Wyczyść',
                'search.emptyState': 'Wpisz postacie przeciwnika i kliknij "Szukaj"', 'search.results': 'Wyniki', 'search.found': 'Znaleziono', 'search.noResults': 'Nie znaleziono pasujących formacji',
                'search.enemy': 'Przeciwnik', 'search.missing': 'Brak', 'search.allSlotsFull': 'Wszystkie pola zajęte!', 'search.petSlotFull': 'Pole Pet już zajęte!',
                'search.enterAtLeastOne': 'Wpisz przynajmniej jedną postać!', 'search.selected': 'Wybrano',
                'database.title': 'Pełna baza formacji', 'database.statsAll': 'Wszystkich', 'database.statsBase': 'Bazowych', 'database.statsUser': 'Dodanych',
                'database.filterAll': 'Wszystkie', 'database.filterBase': 'Bazowe', 'database.filterUser': 'Dodane', 'database.filterFavorites': 'Ulubione',
                'database.searchPlaceholder': '🔍 Szukaj...', 'database.noFormations': 'Brak formacji',
                'preview.title': 'Podgląd formacji', 'preview.idPlaceholder': 'Wpisz ID (np. 12)', 'preview.showBtn': 'POKAŻ',
                'preview.emptyState': 'Wpisz ID aby zobaczyć układ formacji', 'preview.notFound': 'Nie znaleziono formacji',
                'preview.enemy': 'PRZECIWNIK', 'preview.yourTeam': 'TWÓJ SKŁAD', 'preview.noPet': 'Brak peta', 'preview.invalidId': 'Wpisz prawidłowy numer ID!',
                'preview.recentlyViewed': 'Ostatnio przeglądane', 'preview.noRecent': 'Brak historii',
                'search.searchInComments': 'Szukaj też w komentarzach',
                'add.title': 'Dodaj nową formację', 'add.nameLabel': 'Nazwa formacji', 'add.namePlaceholder': 'np. Nick 01-01-2026 W1 / Kontra Dark-Undead v1',
                'add.yourTeam': 'Twój skład', 'add.enemyTeam': 'Skład przeciwnika', 'add.swapSections': 'Zamień kolejność','add.commentLabel': 'Komentarz (opcjonalnie)',
                'add.commentPlaceholder': 'np. Unikać Death, Silbren u przeciwnika, kolejność speed: xxx > yyy > zzz, Pao runa PR, itp.', 'add.saveBtn': 'ZAPISZ FORMACJĘ',
                'add.enterName': 'Podaj nazwę formacji!', 'add.addAtLeastOne': 'Dodaj przynajmniej jedną postać!',
                'add.unknownHeroes': 'Nieznani bohaterowie', 'add.unknownPets': 'Nieznane pety', 'add.saved': 'Zapisano formację',
                'settings.title': 'Import / Eksport', 'settings.status': 'Status', 'settings.checking': 'Sprawdzanie połączenia...',
                'settings.online': 'Połączono z bazą danych.', 'settings.offline': 'Brak połączenia z bazą.',
                'settings.exportTitle': 'Eksport do CSV', 'settings.exportDesc': 'Pobierz wszystkie formacje jako plik CSV', 'settings.exportBtn': 'Eksportuj CSV',
                'settings.importTitle': 'Import z CSV', 'settings.importDesc': 'Wczytaj formacje z pliku CSV (ten sam format co eksport)', 'settings.importBtn': 'Importuj CSV',
                'settings.syncTitle': 'Synchronizacja', 'settings.refreshBtn': 'Odśwież dane', 'settings.exported': 'Wyeksportowano', 'settings.imported': 'Zaimportowano',
                'admin.title': 'Panel Administratora', 'admin.enterPassword': 'Wpisz hasło administratora', 'admin.passwordPlaceholder': 'Hasło...', 'admin.login': 'ZALOGUJ',
                'admin.panelTitle': 'Panel Administratora', 'admin.modeActive': 'Tryb Admin aktywny', 'admin.modeDesc': 'Możesz zarządzać bohaterami, petami i usuwać dowolne formacje.',
                'admin.heroes': 'Bohaterowie', 'admin.pets': 'Pety', 'admin.heroNamePlaceholder': 'Nazwa bohatera', 'admin.petNamePlaceholder': 'Nazwa peta',
                'admin.manageFormations': 'Zarządzanie formacjami', 'admin.deleteAllUser': 'Usuń wszystkie formacje użytkowników',
                'admin.session': 'Sesja', 'admin.logout': 'Wyloguj z trybu Admin', 'admin.loggedIn': 'Zalogowano jako Administrator!', 'admin.loggedOut': 'Wylogowano z trybu Admin',
                'admin.wrongPassword': 'Nieprawidłowe hasło!', 'admin.alreadyLogged': 'Już jesteś zalogowany jako Admin',
                'admin.heroAdded': 'Dodano bohatera', 'admin.heroDeleted': 'Usunięto', 'admin.heroExists': 'Bohater już istnieje!',
                'admin.petAdded': 'Dodano peta', 'admin.petExists': 'Pet już istnieje!', 'admin.enterHeroName': 'Podaj nazwę bohatera!', 'admin.enterPetName': 'Podaj nazwę peta!',
                'admin.confirmDeleteHero': 'Usunąć bohatera', 'admin.confirmDeletePet': 'Usunąć peta', 'admin.confirmDeleteAllUser': 'Na pewno usunąć WSZYSTKIE formacje dodane przez użytkowników?',
                'admin.deletedUserFormations': 'Usunięto formacji użytkowników',
                'admin.loadingBase': 'Ładowanie bazy... To może chwilę potrwać.', 'admin.loadedBase': 'Załadowano formacji!',
                'quickSelect.title': 'Szybki wybór', 'quickSelect.selectFor': 'Wybierz dla',
                'quickTags.expandAll': 'Rozwiń wszystkie tagi', 'quickTags.collapseAll': 'Zwiń wszystkie tagi', 'quickTags.pets': 'Pety',
                'common.error': 'Błąd', 'common.noConnection': 'Brak połączenia z bazą!', 'common.formationDeleted': 'Formacja usunięta!',
                'common.cannotDeleteBase': 'Nie możesz usunąć formacji bazowej!', 'common.confirmDelete': 'Usunąć formację',
                'common.addedToFavorites': 'Dodano do ulubionych ⭐', 'common.removedFromFavorites': 'Usunięto z ulubionych',
				'common.adminRequired': 'Tylko admin może usuwać formacje!', 'database.sortLabel': 'Sortuj:',
				'edit.title': 'Edytuj formację', 'edit.saveBtn': 'ZAPISZ ZMIANY', 'add.markAsBase': 'Oznacz jako formację BAZOWĄ',
				'add.baseHint': 'Formacje bazowe są oznaczone jako "BAZA".', 'preview.added': 'Dodano', 'preview.edited': 'Edytowano',
				'guild.title': 'Strona gildii', 'guild.enterPassword': 'Wpisz hasło gildii aby wejść',
				'guild.passwordPlaceholder': 'Hasło gildii...', 'guild.enter': 'WEJDŹ', 'guild.wrongPassword': 'Nieprawidłowe hasło!',
				'admin.tools': 'Narzędzia', 'admin.scanDuplicates': 'Skanuj duplikaty',
				'duplicates.title': 'Skaner duplikatów', 'duplicates.noDuplicates': 'Brak duplikatów!',
				'duplicates.allUnique': 'Wszystkie formacje są unikalne.', 'duplicates.found': 'Znaleziono',
				'duplicates.groups': 'grup', 'duplicates.identical': 'Identyczne', 'duplicates.almostIdentical': 'Prawie identyczne',
				'duplicates.enemy': 'Przeciwnik', 'duplicates.counter': 'Kontra',
				'duplicates.confirmDelete': 'Czy na pewno usunąć formację', 'admin.deleteAllConfirm1': 'Czy na pewno chcesz usunąć',
				'admin.deleteAllConfirm2': 'Wpisz liczbę formacji do usunięcia aby potwierdzić', 'admin.formations': 'formacji',
				'admin.deleteAllCancelled': 'Anulowano usuwanie', 'admin.deletedAll': 'Usunięto',
				'admin.noUserFormations': 'Brak formacji użytkowników do usunięcia!', 'duplicates.preview': 'Podgląd',
				'duplicates.warningTitle': 'Znaleziono identyczną formację!', 'duplicates.warningText': 'Ta kombinacja przeciwnika i kontry już istnieje w bazie:',
				'duplicates.cancel': 'Anuluj', 'duplicates.saveAnyway': 'Zapisz mimo to',
				'common.close': 'Zamknij', 'common.delete': 'Usuń', 'database.deleted': 'Usunięto',
				'search.history': 'Ostatnie wyszukiwania', 'search.historyEmpty': 'Brak historii', 'war.history': 'Historia planera',
				'compare.title': 'Porównanie składów',
				'compare.btn': 'Porównaj',
				'compare.select': 'Zaznacz do porównania',
				'compare.match': 'Zgodne (ta sama pozycja)',
				'compare.moved': 'Inna pozycja',
				'compare.unique': 'Tylko w tym składzie',
				'exclude.title': 'Wyklucz bohaterów',
				'exclude.empty': 'Brak wykluczonych',
				'exclude.addPlaceholder': 'Dodaj bohatera...',
				'exclude.hint': '💡 Ctrl+klik na tag = wyklucz',
				'exclude.hideResults': 'Ukryj formacje z wykluczonymi',
				'exclude.has': 'Zajęci',
				'war.combinationSummary': 'Podsumowanie kombinacji',
				'war.totalMatch': 'Dopasowanie',
				'war.heroesMatched': 'Trafień',
				'war.conflicts': 'Konflikty',
				'war.noConflicts': 'Brak konfliktów',
				'war.conflictsCount': 'konfliktów',
				'war.battle': 'Walka',
				'war.match': 'trafień',
				'war.searchedEnemy': 'Szukany wróg',
				'war.databaseEnemy': 'Wróg z bazy',
				'war.yourTeam': 'TWÓJ SKŁAD',
				'war.comment': 'Komentarz',
				'war.noComment': 'Brak komentarza',
				'war.fullPreview': 'Pełny podgląd',
				'war.copyTeam': 'Kopiuj skład',
				'war.conflictsTitle': 'Konflikty',
				'war.battles': 'walki',
				'war.conflictsHint': 'Te postacie/pety są użyte w więcej niż jednej walce. Musisz wybrać alternatywne formacje.',
				'war.noConflictsTitle': 'Brak konfliktów!',
				'war.noConflictsDesc': 'Żaden bohater ani pet nie powtarza się między składami. Ta kombinacja jest gotowa do użycia.',
				'war.legendMatched': 'Trafione',
				'war.legendMissing': 'Brakuje',
				'war.legendExtra': 'Dodatkowe w bazie',
				'war.legendConflict': 'Konflikt (użyty wielokrotnie)',
				'war.selectCombo': 'Wybierz kombinację z planera wojny',
				'war.history': 'Historia planera',
				'common.historyCleared': 'Historia wyczyszczona',
				'excluded.alreadyExcluded': 'Bohater już wykluczony!',
				'excluded.added': 'Wykluczono',
				'excluded.removed': 'Usunięto z wykluczonych',
				'excluded.confirmClear': 'Wyczyścić wszystkich wykluczonych?',
				'excluded.cleared': '🗑️ Wyczyszczono wykluczonych',
				'excluded.hiddenInResults': '{n} ukrytych z powodu wykluczonych bohaterów',
				'excluded.hiddenCountLabel': 'ukrytych (wykluczone)',
				'search.foundInComment': 'Znaleziono w komentarzu',
				'search.historyConfirmClear': 'Wyczyścić całą historię wyszukiwań?',
				'search.loadedFromHistory': 'Wczytano z historii',
				'search.clickFieldFirst': 'Najpierw kliknij w pole!',
				'search.fieldIsPet': 'To pole jest na Peta!',
				'search.selectPetField': 'Wybierz pole Pet!',
				'war.historyConfirmClear': 'Wyczyścić całą historię planera?',
				'war.max3': 'Maksymalnie 3 składy!',
				'war.min2': 'Zaznacz minimum 2 składy!',
				'war.selectPlanFirst': 'Najpierw wybierz plan wojny',
				'preview.confirmClearViewed': 'Wyczyścić historię przeglądanych?',
				'preview.viewedCleared': '🗑️ Historia wyczyszczona',
				'preview.otherCounters': 'Inne kontry na tego przeciwnika',
				'preview.noOtherCounters': 'Brak innych kontr',
				'preview.prev': 'Poprzedni',
				'preview.next': 'Następny',
				'preview.show': 'POKAŻ',
				'clipboard.formationCopied': '📋 Skład skopiowany do schowka!',
				'clipboard.teamCopied': '📋 Skład skopiowany!',
				'clipboard.copyFailed': '❌ Błąd kopiowania',
				'clipboard.linkCopied': '🔗 Link skopiowany!',
				'ordering.yourTeamFirst': 'Kolejność: Najpierw twój skład',
				'ordering.enemyFirst': 'Kolejność: Najpierw przeciwnik',
				'layout.top678': 'Układ: 6-7-8 na górze',
				'layout.top123': 'Układ: 1-2-3 na górze',
				'layout.sideBySide': 'Obok siebie',
				'layout.stacked': 'Góra-dół',
				'layout.sideBySideLabel': 'Układ: Obok siebie',
				'layout.stackedLabel': 'Układ: Góra-dół',
				'fields.enemy': 'Przeciwnik',
				'fields.enemyPet': 'Przeciwnik Pet',
				'fields.your': 'Twój',
				'fields.yourPet': 'Twój Pet',
				'war.exclude.alreadyExcluded': 'Ten bohater jest już wykluczony',
				'war.exclude.confirmClear': 'Czy na pewno wyczyścić wszystkich wykluczonych?',
				'war.exclude.cleared': 'Lista wykluczonych wyczyszczona',
				'war.exclude.excludedFrom': '🚫 {name} wykluczony z planera',
				'war.exclude.empty': 'Brak wykluczonych',
				'kreator.hide.alreadyHidden': 'Ten bohater jest już ukryty',
				'kreator.hide.confirmClear': 'Czy na pewno wyczyścić wszystkich ukrytych?',
				'kreator.hide.cleared': 'Lista ukrytych wyczyszczona',
				'kreator.hide.hiddenFrom': '🚫 {name} ukryty w tagach',
				'kreator.hide.empty': 'Brak ukrytych',
				'common.remove': 'Usuń',
                'badge.base': 'BAZA', 'badge.user': 'DODANA'
            },
            en: {
                'loading': 'Loading data...', 'common.loading': 'Loading...', 'common.cancel': 'Cancel', 'common.clear': 'Clear',
                'header.subtitle': 'Counter-formation finder', 'status.connecting': 'Connecting...', 'status.online': 'Online', 'status.offline': 'Offline', 'status.formations': 'formations',
                'nav.search': 'Search', 'nav.database': 'Database', 'nav.preview': 'Preview', 'nav.add': 'Add', 'nav.import': 'Import',
                'search.title': 'Search counter-formations', 'search.subtitle': 'Enter enemy composition (or use tags)', 'search.btn': 'SEARCH', 'search.clear': 'Clear',
                'search.emptyState': 'Enter enemy heroes and click "Search"', 'search.results': 'Results', 'search.found': 'Found', 'search.noResults': 'No matching formations found',
                'search.enemy': 'Enemy', 'search.missing': 'Missing', 'search.allSlotsFull': 'All slots are full!', 'search.petSlotFull': 'Pet slot is full!',
                'search.enterAtLeastOne': 'Enter at least one hero!', 'search.selected': 'Selected',
                'database.title': 'Full formation database', 'database.statsAll': 'Total', 'database.statsBase': 'Base', 'database.statsUser': 'Added',
                'database.filterAll': 'All', 'database.filterBase': 'Base', 'database.filterUser': 'Added', 'database.filterFavorites': 'Favorites',
                'database.searchPlaceholder': '🔍 Search...', 'database.noFormations': 'No formations',
                'preview.title': 'Formation preview', 'preview.idPlaceholder': 'Enter ID (e.g. 12)', 'preview.showBtn': 'SHOW',
                'preview.emptyState': 'Enter ID to see formation layout', 'preview.notFound': 'Formation not found',
                'preview.enemy': 'ENEMY', 'preview.yourTeam': 'YOUR TEAM', 'preview.noPet': 'No pet', 'preview.invalidId': 'Enter a valid ID number!',
                'preview.recentlyViewed': 'Recently viewed', 'preview.noRecent': 'No history',
                'search.searchInComments': 'Also search in comments',
                'add.title': 'Add new formation', 'add.nameLabel': 'Formation name', 'add.namePlaceholder': 'e.g. Nick 01-01-2026 W1 / Counter Dark-Undead v1',
                'add.yourTeam': 'Your team', 'add.enemyTeam': 'Enemy team', 'add.swapSections': 'Swap order', 'add.commentLabel': 'Comment (optional)',
                'add.commentPlaceholder': 'e.g. Avoid Death, Silbren on enemy, speed order: xxx > yyy > zzz, Pao rune PR, etc.', 'add.saveBtn': 'SAVE FORMATION',
                'add.enterName': 'Enter formation name!', 'add.addAtLeastOne': 'Add at least one hero!',
                'add.unknownHeroes': 'Unknown heroes', 'add.unknownPets': 'Unknown pets', 'add.saved': 'Formation saved',
                'settings.title': 'Import / Export', 'settings.status': 'Status', 'settings.checking': 'Checking connection...',
                'settings.online': 'Connected to database.', 'settings.offline': 'No database connection.',
                'settings.exportTitle': 'Export to CSV', 'settings.exportDesc': 'Download all formations as CSV file', 'settings.exportBtn': 'Export CSV',
                'settings.importTitle': 'Import from CSV', 'settings.importDesc': 'Load formations from CSV file (same format as export)', 'settings.importBtn': 'Import CSV',
                'settings.syncTitle': 'Synchronization', 'settings.refreshBtn': 'Refresh data', 'settings.exported': 'Exported', 'settings.imported': 'Imported',
                'admin.title': 'Administrator Panel', 'admin.enterPassword': 'Enter administrator password', 'admin.passwordPlaceholder': 'Password...', 'admin.login': 'LOGIN',
                'admin.panelTitle': 'Administrator Panel', 'admin.modeActive': 'Admin mode active', 'admin.modeDesc': 'You can manage heroes, pets and delete any formations.',
                'admin.heroes': 'Heroes', 'admin.pets': 'Pets', 'admin.heroNamePlaceholder': 'Hero name', 'admin.petNamePlaceholder': 'Pet name',
                'admin.manageFormations': 'Manage formations', 'admin.deleteAllUser': 'Delete all user formations',
                'admin.session': 'Session', 'admin.logout': 'Logout from Admin mode', 'admin.loggedIn': 'Logged in as Administrator!', 'admin.loggedOut': 'Logged out from Admin mode',
                'admin.wrongPassword': 'Wrong password!', 'admin.alreadyLogged': 'Already logged in as Admin',
                'admin.heroAdded': 'Hero added', 'admin.heroDeleted': 'Deleted', 'admin.heroExists': 'Hero already exists!',
                'admin.petAdded': 'Pet added', 'admin.petExists': 'Pet already exists!', 'admin.enterHeroName': 'Enter hero name!', 'admin.enterPetName': 'Enter pet name!',
                'admin.confirmDeleteHero': 'Delete hero', 'admin.confirmDeletePet': 'Delete pet', 'admin.confirmDeleteAllUser': 'Are you sure you want to delete ALL user formations?',
                'admin.deletedUserFormations': 'Deleted user formations',
                'admin.loadingBase': 'Loading base... This may take a moment.', 'admin.loadedBase': 'Loaded formations!',
                'quickSelect.title': 'Quick select', 'quickSelect.selectFor': 'Select for',
                'quickTags.expandAll': 'Expand all', 'quickTags.collapseAll': 'Collapse all', 'quickTags.pets': 'Pets',
                'common.error': 'Error', 'common.noConnection': 'No database connection!', 'common.formationDeleted': 'Formation deleted!',
                'common.cannotDeleteBase': 'Cannot delete base formation!', 'common.confirmDelete': 'Delete formation',
                'common.addedToFavorites': 'Added to favorites ⭐', 'common.removedFromFavorites': 'Removed from favorites',
				'common.adminRequired': 'Only admin can delete formations!', 'database.sortLabel': 'Sort:',
				'edit.title': 'Edit formation', 'edit.saveBtn': 'SAVE CHANGES', 'add.markAsBase': 'Mark as BASE formation',
				'add.baseHint': 'Base formations are marked as "BASE".', 'preview.added': 'Added', 'preview.edited': 'Edited',
				'guild.title': 'Guild page', 'guild.enterPassword': 'Enter guild password to access',
				'guild.passwordPlaceholder': 'Guild password...', 'guild.enter': 'ENTER', 'guild.wrongPassword': 'Wrong password!',
				'admin.tools': 'Tools', 'admin.scanDuplicates': 'Scan duplicates',
				'duplicates.title': 'Duplicates scanner', 'duplicates.noDuplicates': 'No duplicates found!',
				'duplicates.allUnique': 'All formations are unique.', 'duplicates.found': 'Found',
				'duplicates.groups': 'groups', 'duplicates.identical': 'Identical', 'duplicates.almostIdentical': 'Almost identical',
				'duplicates.enemy': 'Enemy', 'duplicates.counter': 'Counter',
				'duplicates.confirmDelete': 'Are you sure you want to delete formation', 'admin.deleteAllConfirm1': 'Are you sure you want to delete',
				'admin.deleteAllConfirm2': 'Type the number of formations to confirm', 'admin.formations': 'formations',
				'admin.deleteAllCancelled': 'Deletion cancelled', 'admin.deletedAll': 'Deleted',
				'admin.noUserFormations': 'No user formations to delete!', 'duplicates.preview': 'Preview',
				'duplicates.warningTitle': 'Identical formation found!', 'duplicates.warningText': 'This enemy and counter combination already exists:',
				'duplicates.cancel': 'Cancel', 'duplicates.saveAnyway': 'Save anyway',
				'common.close': 'Close', 'common.delete': 'Delete', 'database.deleted': 'Deleted',
				'search.history': 'Ostatnie wyszukiwania','search.historyEmpty': 'Brak historii', 'war.history': 'Planner history',
				'compare.title': 'Compare formations',
				'compare.btn': 'Compare',
				'compare.select': 'Select to compare',
				'compare.match': 'Match (same position)',
				'compare.moved': 'Different position',
				'compare.unique': 'Only in this formation',
				'exclude.title': 'Exclude heroes',
				'exclude.empty': 'No excluded heroes',
				'exclude.addPlaceholder': 'Add hero...',
				'exclude.hint': '💡 Ctrl+click on tag = exclude',
				'exclude.hideResults': 'Hide formations with excluded',
				'exclude.has': 'Excluded',
				'war.combinationSummary': 'Combination summary',
				'war.totalMatch': 'Match',
				'war.heroesMatched': 'Hits',
				'war.conflicts': 'Conflicts',
				'war.noConflicts': 'No conflicts',
				'war.conflictsCount': 'conflicts',
				'war.battle': 'Battle',
				'war.match': 'match',
				'war.searchedEnemy': 'Searched enemy',
				'war.databaseEnemy': 'Database enemy',
				'war.yourTeam': 'YOUR TEAM',
				'war.comment': 'Comment',
				'war.noComment': 'No comment',
				'war.fullPreview': 'Full preview',
				'war.copyTeam': 'Copy team',
				'war.conflictsTitle': 'Conflicts',
				'war.battles': 'battles',
				'war.conflictsHint': 'These heroes/pets are used in more than one battle. You need to choose alternative formations.',
				'war.noConflictsTitle': 'No conflicts!',
				'war.noConflictsDesc': 'No hero or pet is repeated between teams. This combination is ready to use.',
				'war.legendMatched': 'Matched',
				'war.legendMissing': 'Missing',
				'war.legendExtra': 'Extra in database',
				'war.legendConflict': 'Conflict (used multiple times)',
				'war.selectCombo': 'Select a combination from war planner',
				'war.history': 'Planner history',
				'common.historyCleared': 'History cleared',
				'excluded.alreadyExcluded': 'Hero already excluded!',
				'excluded.added': 'Excluded',
				'excluded.removed': 'Removed from excluded',
				'excluded.confirmClear': 'Clear all excluded heroes?',
				'excluded.cleared': '🗑️ Cleared excluded',
				'excluded.hiddenInResults': '{n} hidden due to excluded heroes',
				'excluded.hiddenCountLabel': 'hidden (excluded)',
				'search.foundInComment': 'Found in comment',
				'search.historyConfirmClear': 'Clear all search history?',
				'search.loadedFromHistory': 'Loaded from history',
				'search.clickFieldFirst': 'Click a field first!',
				'search.fieldIsPet': 'This field is for Pet!',
				'search.selectPetField': 'Select a Pet field!',
				'war.historyConfirmClear': 'Clear all planner history?',
				'war.max3': 'Maximum 3 formations!',
				'war.min2': 'Select at least 2 formations!',
				'war.selectPlanFirst': 'Select war plan first',
				'preview.confirmClearViewed': 'Clear viewing history?',
				'preview.viewedCleared': '🗑️ History cleared',
				'preview.otherCounters': 'Other counters for this enemy',
				'preview.noOtherCounters': 'No other counters',
				'preview.prev': 'Previous',
				'preview.next': 'Next',
				'preview.show': 'SHOW',
				'clipboard.formationCopied': '📋 Formation copied to clipboard!',
				'clipboard.teamCopied': '📋 Team copied!',
				'clipboard.copyFailed': '❌ Copy failed',
				'clipboard.linkCopied': '🔗 Link copied!',
				'ordering.yourTeamFirst': 'Order: Your team first',
				'ordering.enemyFirst': 'Order: Enemy first',
				'layout.top678': 'Layout: 6-7-8 on top',
				'layout.top123': 'Layout: 1-2-3 on top',
				'layout.sideBySide': 'Side by side',
				'layout.stacked': 'Stacked',
				'layout.sideBySideLabel': 'Layout: Side by side',
				'layout.stackedLabel': 'Layout: Stacked (top-bottom)',
				'fields.enemy': 'Enemy',
				'fields.enemyPet': 'Enemy Pet',
				'fields.your': 'Your',
				'fields.yourPet': 'Your Pet',
				'war.exclude.alreadyExcluded': 'This hero is already excluded',
				'war.exclude.confirmClear': 'Clear all excluded heroes?',
				'war.exclude.cleared': 'Excluded list cleared',
				'war.exclude.excludedFrom': '🚫 {name} excluded from planner',
				'war.exclude.empty': 'No excluded',
				'kreator.hide.alreadyHidden': 'This hero is already hidden',
				'kreator.hide.confirmClear': 'Clear all hidden?',
				'kreator.hide.cleared': 'Hidden list cleared',
				'kreator.hide.hiddenFrom': '🚫 {name} hidden from tags',
				'kreator.hide.empty': 'None hidden',
				'common.remove': 'Remove',
                'badge.base': 'BASE', 'badge.user': 'ADDED'
            }
        };
        
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
		
		// =====================================================
        // ZAMIANA KOLEJNOŚCI SEKCJI W FORMULARZU DODAWANIA
        // =====================================================
        
        // Załaduj preferencję przy starcie
        function loadSectionOrderPreference() {
            const reversed = storage.getBool('addFormSectionsReversed');
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
            localStorage.setItem('addFormSectionsReversed', isReversed);
            
            // Pokaż informację
            const msg = isReversed 
                ? t('ordering.yourTeamFirst')
                : t('ordering.enemyFirst');
            showToast(msg);
        }
		
		// Odwrócenie kolejności rzędów w sekcji przeciwnika
		function loadEnemyRowsPreference() {
			// Domyślnie true (6-7-8 na górze), chyba że użytkownik wybrał inaczej
			const reversed = storage.getBool('enemyRowsReversed', true);
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
			localStorage.setItem('enemyRowsReversed', isReversed);
			
			const msg = isReversed 
				? t('layout.top678')
				: t('layout.top123');
			showToast(msg);
		}
		
		// Odwrócenie kolejności rzędów w wyszukiwarce
		function loadSearchRowsPreference() {
			// Domyślnie true (6-7-8 na górze)
			const reversed = storage.getBool('searchRowsReversed', true);
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
			localStorage.setItem('searchRowsReversed', isReversed);
			
			const msg = isReversed 
				? t('layout.top678')
				: t('layout.top123');
			showToast(msg);
		}

		// Zwraca pola wyszukiwarki w kolejności wizualnej
		function getSearchFieldsInOrder() {
			const reversed = storage.getBool('searchRowsReversed', true);

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

		// Przełączanie układu: obok siebie vs góra-dół
		function loadFormLayoutPreference() {
			const stacked = storage.getBool('addFormStacked');
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
			localStorage.setItem('addFormStacked', isStacked);
			
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
        
        // FIREBASE
        try {
            firebase.initializeApp(firebaseConfig);
            db = firebase.database();
            formationsRef = db.ref('formations');
            heroesRef = db.ref('heroes');
            petsRef = db.ref('pets');
            
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
                    // Regeneruj tagi po załadowaniu bohaterów z bazy
                    generateWarTags();
                    generateKreatorTags();
                    generateAddFormTags();
                }
            });
            
            petsRef.on('value', snap => {
                if (snap.val()) {
                    pets = Object.values(snap.val()).map(getPetName).sort();
                    if (isAdmin) renderPetsList();
                    // Regeneruj tagi po załadowaniu petów z bazy
                    generateWarTags();
                    generateKreatorTags();
                    generateAddFormTags();
                }
            });
            
            db.ref('.info/connected').on('value', snap => setOnlineStatus(snap.val() === true));
        } catch (e) {
            console.error('Firebase error:', e);
            setOnlineStatus(false);
            $('loading').classList.add('hidden');
        }

        // UI
        function setOnlineStatus(online) {
            isOnline = online;
            $('status-dot').className = `status-dot ${online ? 'online' : 'offline'}`;
            $('status-text').textContent = t(online ? 'status.online' : 'status.offline');
            const info = $('connection-info');
            if (info) info.innerHTML = `<strong>${online ? '🟢' : '🔴'} ${t(online ? 'status.online' : 'status.offline')}:</strong> ${t(online ? 'settings.online' : 'settings.offline')}`;
        }
        
        function updateUI() {
            $('total-count').textContent = allFormations.length;
            $('db-stat-total').textContent = allFormations.length;
            $('db-stat-base').textContent = allFormations.filter(f => f.isBase).length;
            $('db-stat-user').textContent = allFormations.filter(f => !f.isBase).length;
            filterDatabase();
            generateQuickTags();
            generateAddFormTags();
            generateWarTags();
            generateKreatorTags();
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
            setOnlineStatus(isOnline);
        }
        
        // =====================================================
        // QUICK TAGS - UNIWERSALNA FUNKCJA
        // =====================================================
        
        // Domyślna kolejność ras (konfigurowalna)
        const DEFAULT_RACE_ORDER = ['Human', 'Fire', 'Elf', 'Undead', 'Dark', 'Light'];
        let RACE_ORDER = storage.getJson('souls_race_order', null) || [...DEFAULT_RACE_ORDER];
        const RACE_EMOJI = { Dark: '🌑', Light: '☀️', Human: '👤', Fire: '🔥', Elf: '🌿', Undead: '💀' };
        
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
					html += `<div class="quick-tags-section"><div class="quick-tags-header" onclick="toggleQuickTagSection(this)"><span class="toggle-icon">▶</span>${RACE_EMOJI[race]} ${race} (${raceGroups[race].length})</div><div class="quick-tags-content"><div class="quick-tags">${raceGroups[race].map(h => `<span class="quick-tag tag-${race.toLowerCase()}" onclick="${clickHandler}('${h.name || h}', event)"${showCounts && h.count ? ` title="${h.count}x"` : ''}>${h.name || h}</span>`).join('')}</div></div></div>`;
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
					<span class="race-order-label">${RACE_EMOJI[race]} ${race}</span>
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
            showToast('Wszystkie pola Pet są zajęte!', true);
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
            showToast('Wszystkie pola Pet są zajęte!', true);
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
            let count = getFieldValues('search-pos', 8).filter(v => v).length;
            if ($('search-pet').value.trim()) count++;
            
            let counter = $('search-counter');
            if (count > 0) {
                if (!counter) {
                    counter = document.createElement('div');
                    counter.id = 'search-counter';
                    counter.className = 'search-counter';
                    $('quick-tags-container').parentNode.insertBefore(counter, $('quick-tags-container').nextSibling);
                }
                counter.innerHTML = `${t('search.selected')}: <strong>${count}</strong> / 6`;
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
			
			const searchHeroes = getFieldValues('search-pos', 8).filter(v => v).map(normalize);
			const searchPet = normalize($('search-pet').value);
			
			if (!searchHeroes.length && !searchPet) { showToast(t('search.enterAtLeastOne'), true); return; }
			
			const results = allFormations.map(f => {
				const enemyHeroes = f.enemy.filter(h => h).map(normalize);
				const enemyPet = normalize(f.enemyPet);
				const matchedHeroes = searchHeroes.filter(sh => enemyHeroes.some(eh => heroMatchScore(sh, eh) > 0));
				const petMatched = searchPet && heroMatchScore(searchPet, enemyPet) > 0;
				const score = matchedHeroes.length + (petMatched ? 1 : 0);
				
				return score > 0 ? { formation: f, matchedHeroes, petMatched, score, maxScore: searchHeroes.length + (searchPet ? 1 : 0) } : null;
			}).filter(Boolean).sort((a, b) => b.score - a.score);
			
			displayResults(results, searchHeroes);
		}
        
		// =====================================================
		// AUTO-PRZESKAKIWANIE I SKRÓTY KLAWISZOWE - UNIWERSALNE
		// =====================================================

		// Konfiguracja pól dla każdej sekcji
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
			}
		};

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

		// Zwraca pola przeciwnika w kolejności wizualnej (uwzględnia odwrócenie rzędów)
		function getEnemyFieldsInOrder() {
			const reversed = storage.getBool('enemyRowsReversed', true);

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
			const emptyEl = $('excluded-empty');
			
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
			localStorage.setItem('souls_hide_excluded', hideExcludedResults);
			
			// Odśwież aktywną zakładkę
			filterDatabase();
		}

		function isFormationExcluded(formation) {
			if (excludedHeroes.length === 0) return { excluded: false, heroes: [] };
			
			const myHeroes = formation.my.filter(h => h).map(h => h.toLowerCase());
			const excludedInFormation = excludedHeroes.filter(ex => 
				myHeroes.includes(ex.toLowerCase())
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
					`<div class="autocomplete-item race-${h.race.toLowerCase()}" data-value="${h.name}">${h.name} <span class="race">(${h.race})</span></div>`
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
		
		function displayResults(results, searchHeroes) {
			// Reset selekcji przy nowym wyszukiwaniu
			selectedForCompare = [];
			
			if (!results.length) {
				$('results-section').innerHTML = `<div class="empty-state"><p>${t('search.noResults')}</p></div>`;
				return;
			}
			
			// Filtruj wyniki według wykluczonych
			let displayedResults = results;
			let hiddenCount = 0;
			
			if (hideExcludedResults && excludedHeroes.length > 0) {
				displayedResults = results.filter(r => !isFormationExcluded(r.formation).excluded);
				hiddenCount = results.length - displayedResults.length;
			}
			
			let html = `<div class="results-header">
				<h3>${t('search.results')}</h3>
				<span class="results-count">${t('search.found')}: ${displayedResults.length}${hiddenCount > 0 ? ` <span style="color:#f44336;">(+${hiddenCount} 🚫)</span>` : ''}</span>
			</div>`;
			
			if (!displayedResults.length) {
				html += `<div class="empty-state"><p>${t('search.noResults')}</p><p style="font-size:0.8rem;color:var(--text-muted);margin-top:10px;">${t('excluded.hiddenInResults', {n: hiddenCount})}</p></div>`;
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
				
				// Info o dopasowaniu w komentarzu
				const commentMatchInfo = r.commentMatched && r.matchedHeroes.length === 0 && !r.petMatched 
					? `<div style="font-size:0.7rem;color:var(--accent-gold);margin-top:3px;">💬 ${t('search.foundInComment')}</div>`
					: '';
				
				return `
					<div class="result-card ${hasExcluded ? 'has-excluded' : ''}" id="result-card-${f.id}">
						<div class="result-card-checkbox">
							<input type="checkbox" id="compare-${f.id}" onchange="toggleCompareSelection(${f.id})" title="${t('compare.select')}">
						</div>
						<div class="result-card-content" onclick="showFormation(${f.id})">
							<div class="result-card-header">
								<span class="result-id">ID: ${f.id}${f.isBase ? '' : ` <span class="badge user-badge">${t('badge.user')}</span>`}</span>
								<span class="match-score match-${Math.min(Math.floor(r.score), 6)}">${r.score % 1 === 0 ? r.score : '💬'}/${r.maxScore}</span>
							</div>
							<div class="result-name">${f.name}</div>
							<div class="result-heroes">${t('search.enemy')}: ${enemyDisplay} + ${petDisplay}</div>
							<div class="result-heroes result-my-heroes">⚔️ Kontra: ${f.my.filter(h => h).map(h => `<span class="my-hero">${h}</span>`).join(', ') || '—'}${f.myPet ? ` + <span class="my-pet">${f.myPet}</span>` : ''}</div>
							${missingHeroes.length ? `<div class="result-missing">❌ ${t('search.missing')}: ${missingHeroes.join(', ')}</div>` : ''}
							${commentMatchInfo}
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
            $('results-section').innerHTML = `<div class="empty-state"><p>${t('search.emptyState')}</p></div>`;
            document.querySelectorAll('.quick-tag.selected').forEach(t => t.classList.remove('selected'));
            $('search-counter')?.remove();
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
		
		// =====================================================
		// HISTORIA PLANERA WOJNY
		// =====================================================

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
		
		// =====================================================
		// PORÓWNYWARKA SKŁADÓW
		// =====================================================

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
							<span class="compare-card-name" title="${f.name}">${f.name}</span>
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
							
							${f.comment ? `<div class="compare-comment">💬 ${f.comment}</div>` : ''}
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
				
				const hero = heroes.find(h => h.name.toLowerCase() === name.toLowerCase());
				const rc = hero ? `race-${hero.race.toLowerCase()}` : '';
				
				return `<div class="battle-slot filled ${rc} ${diffClass}"><span class="hero-name">${name}</span></div>`;
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
			
			return `<div class="battle-pet filled ${diffClass}"><span class="pet-icon">🐾</span><span>${petName}</span></div>`;
		}
        
        // =====================================================
        // FORMULARZ DODAWANIA
        // =====================================================
        
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

		function showDuplicateWarning(existing, newData) {
			// Usuń stare ostrzeżenie jeśli istnieje
			hideDuplicateWarning();
			
			const warningHtml = `
				<div class="duplicate-warning" id="duplicate-warning">
					<h4>⚠️ ${t('duplicates.warningTitle')}</h4>
					<p>${t('duplicates.warningText')}</p>
					<div style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 8px; margin: 10px 0;">
						<strong>#${existing.id}</strong> - "${existing.name}"
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

		async function forceSaveFormation() {
			if (!window.pendingFormation) return;
			
			const { name, my, myPet, enemy, enemyPet } = window.pendingFormation;
			await performSaveFormation(name, my, myPet, enemy, enemyPet);
		}
		
		function checkForExactDuplicate(my, myPet, enemy, enemyPet) {
			const myClean = my.filter(h => h).map(h => h.toLowerCase()).sort();
			const enemyClean = enemy.filter(h => h).map(h => h.toLowerCase()).sort();
			const myPetClean = (myPet || '').toLowerCase();
			const enemyPetClean = (enemyPet || '').toLowerCase();
			
			for (const f of allFormations) {
				const fMyClean = f.my.filter(h => h).map(h => h.toLowerCase()).sort();
				const fEnemyClean = f.enemy.filter(h => h).map(h => h.toLowerCase()).sort();
				const fMyPetClean = (f.myPet || '').toLowerCase();
				const fEnemyPetClean = (f.enemyPet || '').toLowerCase();
				
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
        
        // =====================================================
        // QUICK SELECT MODAL
        // =====================================================
        
        function openQuickSelect(targetId, label) {
            quickSelectTarget = targetId;
            $('quick-select-target').innerHTML = `${t('quickSelect.selectFor')}: <strong>${label}</strong>`;
            
            const isPet = targetId.includes('Pet');
            const raceGroups = { Dark: [], Light: [], Human: [], Fire: [], Elf: [], Undead: [] };
            if (!isPet) heroes.forEach(h => raceGroups[h.race]?.push(h.name));
            RACE_ORDER.forEach(r => raceGroups[r].sort((a, b) => a.localeCompare(b)));
            
            $('quick-select-tags').innerHTML = isPet ? 
                `<div class="quick-tags-section"><div class="quick-tags-header expanded" onclick="toggleQuickTagSection(this)"><span class="toggle-icon">▶</span> 🐾 ${t('quickTags.pets')}</div><div class="quick-tags-content show"><div class="quick-tags">${pets.map(p => `<span class="quick-tag tag-pet" onclick="selectQuickItem('${getPetName(p)}')">${getPetName(p)}</span>`).join('')}</div></div></div>` :
                RACE_ORDER.filter(r => raceGroups[r].length).map(r => `<div class="quick-tags-section"><div class="quick-tags-header expanded" onclick="toggleQuickTagSection(this)"><span class="toggle-icon">▶</span>${RACE_EMOJI[r]} ${r} (${raceGroups[r].length})</div><div class="quick-tags-content show"><div class="quick-tags">${raceGroups[r].map(n => `<span class="quick-tag tag-${r.toLowerCase()}" onclick="selectQuickItem('${n}')">${n}</span>`).join('')}</div></div></div>`).join('');
            
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
        
        // =====================================================
        // BAZA DANYCH
        // =====================================================
        function setDbFilter(filter) {
            currentDbFilter = filter;
            document.querySelectorAll('.filter-btn[data-filter]').forEach(b => b.classList.toggle('active', b.dataset.filter === filter));
            filterDatabase();
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
			
			if (searchTerm) formations = formations.filter(f => normalize(f.name).includes(searchTerm));
			
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
						<div class="db-item-header"><span class="db-item-id">#${f.id}</span><span class="badge ${f.isBase ? 'base-badge' : 'user-badge'}">${t(f.isBase ? 'badge.base' : 'badge.user')}</span></div>
						<div class="db-item-name">${f.name}</div>
						<div class="db-item-details"><div>⚔️ ${f.my.filter(h => h).join(', ') || '—'} + ${f.myPet || '—'}</div><div>👹 ${f.enemy.filter(h => h).join(', ') || '—'} + ${f.enemyPet || '—'}</div></div>
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
        
        // =====================================================
        // PODGLĄD FORMACJI
        // =====================================================
        
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
						<div class="preview-title"><span class="preview-id">#${f.id}</span>${f.name}<span class="formation-type-badge ${f.isBase ? 'base' : 'user'}">${t(f.isBase ? 'badge.base' : 'badge.user')}</span></div>
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
					${f.comment ? `<div class="preview-comment"><span class="comment-icon">💬</span>${f.comment}</div>` : ''}
				</div>
				${similarHtml}`;
		}
        
        // =====================================================
        // OSTATNIO PRZEGLĄDANE
        // =====================================================
        
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
			localStorage.setItem('souls_rv_expanded', list.classList.contains('show'));
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
										<div class="similar-formation-name">${f.name}</div>
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
            });
        }
        
        function getEnemyKey(formation) {
            // Tworzymy unikalny klucz dla przeciwnika (sortowane dla spójności)
            const enemyHeroes = formation.enemy.filter(h => h).map(h => h.toLowerCase()).sort();
            const enemyPet = (formation.enemyPet || '').toLowerCase();
            return enemyHeroes.join('|') + '||' + enemyPet;
        }
        
		function buildFormationNav(currentId) {
			const idx = navFormationIds.indexOf(currentId);
			const total = navFormationIds.length;
			
			const hasPrev = idx > 0;
			const hasNext = idx < total - 1;
			const prevLabel = t('preview.prev');
			const nextLabel = t('preview.next');
			const showLabel = t('preview.show');
			
			return `
				<div class="formation-nav">
					<button class="formation-nav-btn" onclick="navigateFormation(-1)" ${!hasPrev ? 'disabled' : ''} title="${prevLabel}">◀</button>
					<div class="formation-nav-center">
						<div class="id-lookup">
							<input type="number" id="lookup-id" value="${currentId}" placeholder="ID">
							<button class="btn" onclick="lookupById()">${showLabel}</button>
						</div>
						${total > 1 ? `<div class="formation-nav-counter"><strong>${idx + 1}</strong> / ${total}</div>` : ''}
					</div>
					<button class="formation-nav-btn" onclick="navigateFormation(1)" ${!hasNext ? 'disabled' : ''} title="${nextLabel}">▶</button>
				</div>
			`;
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
				
        function setNavContext(formationIds) {
            navFormationIds = formationIds || [];
            navCurrentIndex = -1;
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
        
        function collectWarPlanData() {
            // Zbierz dane o wrogach z inputów
            const battles = [];
            
            for (let i = 1; i <= 3; i++) {
                const enemyHeroes = [];
                for (let j = 1; j <= 5; j++) {
                    const val = $(`war-e${i}-h${j}`)?.value.trim();
                    if (val) enemyHeroes.push(val);
                }
                const enemyPet = $(`war-e${i}-pet`)?.value.trim();
                
                // Szukaj kontry w wynikach (jeśli jest)
                const counterData = currentWarResults?.[i-1];
                
                battles.push({
                    enemy: { heroes: enemyHeroes, pet: enemyPet },
                    counter: counterData ? {
                        heroes: counterData.formation.my.filter(h => h),
                        pet: counterData.formation.myPet,
                        comment: counterData.formation.comment
                    } : { heroes: [], pet: '', comment: '' }
                });
            }
            
            return battles;
        }
        
        // Przechowuj aktualne wyniki wojny
        let currentWarResults = null;
        
        function renderBattleGrid(arr, isEnemy) {
            const slot = i => {
                const name = arr[i] || '';
                if (!name) return `<div class="battle-slot empty"></div>`;
                const hero = heroes.find(h => h.name.toLowerCase() === name.toLowerCase());
                const rc = hero ? `race-${hero.race.toLowerCase()}` : '';
                return `<div class="battle-slot filled ${rc}"><span class="hero-name">${name}</span></div>`;
            };
            
            return isEnemy ? `<div class="battle-grid"><div class="battle-row">${slot(5)}${slot(6)}${slot(7)}</div><div class="battle-row">${slot(3)}${slot(4)}</div><div class="battle-row">${slot(0)}${slot(1)}${slot(2)}</div></div>` :
                `<div class="battle-grid"><div class="battle-row">${slot(0)}${slot(1)}${slot(2)}</div><div class="battle-row">${slot(3)}${slot(4)}</div><div class="battle-row">${slot(5)}${slot(6)}${slot(7)}</div></div>`;
        }
        
        function renderBattlePet(name) {
            return name ? `<div class="battle-pet filled"><span class="pet-icon">🐾</span><span>${name}</span></div>` :
                `<div class="battle-pet empty"><span class="pet-icon">🐾</span><span>${t('preview.noPet')}</span></div>`;
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
				if ($('lookup-id').value == editingFormationId) {
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
        
        // =====================================================
        // ADMIN
        // =====================================================
        
        function headerClick() {
            headerClickCount++;
            clearTimeout(headerClickTimer);
            if (headerClickCount >= 5) {
                headerClickCount = 0;
                isAdmin ? showToast(t('admin.alreadyLogged')) : $('admin-modal').classList.remove('hidden');
            } else headerClickTimer = setTimeout(() => headerClickCount = 0, 2000);
        }
        
        function closeAdminModal() {
            $('admin-modal').classList.add('hidden');
            $('admin-password').value = '';
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
        
		function enableAdminMode() {
			isAdmin = true;
			$('admin-badge').style.display = 'inline';
			$('nav-admin').classList.add('show');
			$('nav-settings').classList.add('show');
			$('nav-war').classList.add('show');
			// Pokaż opcję "formacja bazowa" w formularzu dodawania
			const baseOption = $('add-base-option');
			if (baseOption) baseOption.style.display = 'block';
			renderHeroesList();
			renderPetsList();
			filterDatabase();
		}
        
		function adminLogout() {
			isAdmin = false;
			localStorage.removeItem('souls_admin');
			$('admin-badge').style.display = 'none';
			$('nav-admin').classList.remove('show');
			$('nav-settings').classList.remove('show');
			$('nav-war').classList.remove('show');
			// Ukryj opcję "formacja bazowa" w formularzu dodawania
			const baseOption = $('add-base-option');
			if (baseOption) baseOption.style.display = 'none';
			switchTab('search');
			filterDatabase();
			showToast('🚪 ' + t('admin.loggedOut'));
		}
        
        function renderHeroesList() {
            $('heroes-count').textContent = heroes.length;
            const byRace = {};
            heroes.forEach(h => { (byRace[h.race] = byRace[h.race] || []).push(h); });
            
            $('heroes-list').innerHTML = Object.keys(byRace).sort().map(r =>
                `<div style="font-size:0.7rem;color:var(--accent-gold);margin:10px 0 5px;border-bottom:1px solid var(--border);padding-bottom:3px;">${r} (${byRace[r].length})</div>` +
                byRace[r].map(h => `<div class="entity-item"><span class="entity-name">${h.name}</span><button class="btn btn-danger btn-small" onclick="deleteHero('${h.name}')">🗑️</button></div>`).join('')
            ).join('') || `<p style="color:var(--text-muted);text-align:center;">${t('database.noFormations')}</p>`;
        }
        
        function renderPetsList() {
            $('pets-count').textContent = pets.length;
            $('pets-list').innerHTML = pets.map(p => `<div class="entity-item"><span class="entity-name">🐾 ${p}</span><button class="btn btn-danger btn-small" onclick="deletePet('${p}')">🗑️</button></div>`).join('') ||
                `<p style="color:var(--text-muted);text-align:center;">${t('database.noFormations')}</p>`;
        }
        
        async function addHero() {
            const name = $('new-hero-name').value.trim();
            const race = $('new-hero-race').value;
            if (!name) { showToast(t('admin.enterHeroName'), true); return; }
            if (heroes.some(h => h.name.toLowerCase() === name.toLowerCase())) { showToast(t('admin.heroExists'), true); return; }
            try {
                await heroesRef.child(name).set({ name, race });
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
		
		// ========== SKANER DUPLIKATÓW ==========

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
			
			const formations = allFormations;
			
			for (let i = 0; i < formations.length; i++) {
				for (let j = i + 1; j < formations.length; j++) {
					const a = formations[i];
					const b = formations[j];
					
					const similarity = compareFormations(a, b);
					
					if (similarity.type === 'identical') {
						addToGroup(results.identical, a, b, similarity);
					} else if (similarity.type === 'almostIdentical') {
						addToGroup(results.almostIdentical, a, b, similarity);
					}
				}
			}
			
			return results;
		}

		function compareFormations(a, b) {
			// Porównaj enemy
			const enemyA = a.enemy.filter(h => h).map(h => h.toLowerCase()).sort();
			const enemyB = b.enemy.filter(h => h).map(h => h.toLowerCase()).sort();
			const enemyMatch = enemyA.length === enemyB.length && enemyA.every((h, i) => h === enemyB[i]);
			
			// Porównaj my
			const myA = a.my.filter(h => h).map(h => h.toLowerCase()).sort();
			const myB = b.my.filter(h => h).map(h => h.toLowerCase()).sort();
			const myMatch = myA.length === myB.length && myA.every((h, i) => h === myB[i]);
			
			// Porównaj pety
			const enemyPetSame = (a.enemyPet || '').toLowerCase() === (b.enemyPet || '').toLowerCase();
			const myPetSame = (a.myPet || '').toLowerCase() === (b.myPet || '').toLowerCase();
			
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
									<span class="duplicate-item-name">${f.name}</span>
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
			
			$('dup-preview-title').innerHTML = `👁️ #${f.id} - ${f.name} ${f.isBase ? '<span style="color: var(--accent-gold);">👑 BAZA</span>' : ''}`;
			
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
					
					${f.comment ? `<div class="preview-comment"><span class="comment-icon">💬</span>${f.comment}</div>` : ''}
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

		// ========== PODWÓJNE POTWIERDZENIE USUWANIA WSZYSTKICH ==========

		function confirmDeleteAllUserFormations() {
			const userFormations = allFormations.filter(f => !f.isBase);
			
			if (userFormations.length === 0) {
				showToast(t('admin.noUserFormations') || 'Brak formacji użytkowników do usunięcia!');
				return;
			}
			
			// Pierwsze potwierdzenie
			if (!confirm(`⚠️ ${t('admin.deleteAllConfirm1')} ${userFormations.length} ${t('admin.formations')}?`)) return;
			
			// Drugie potwierdzenie - wpisanie liczby
			const confirmNumber = prompt(`${t('admin.deleteAllConfirm2')} ${userFormations.length}:`);
			
			if (confirmNumber !== String(userFormations.length)) {
				showToast('❌ ' + t('admin.deleteAllCancelled'), true);
				return;
			}
			
			// Wykonaj usunięcie
			deleteAllUserFormationsConfirmed(userFormations);
		}

		async function deleteAllUserFormationsConfirmed(userFormations) {
			if (!isOnline) { showToast(t('common.noConnection'), true); return; }
			
			try {
				for (const f of userFormations) {
					await formationsRef.child(String(f.id)).remove();
				}
				showToast(`✅ ${t('admin.deletedAll')} ${userFormations.length} ${t('admin.formations')}!`);
			} catch (e) {
				showToast(`${t('common.error')}: ${e.message}`, true);
			}
		}
        
        // =====================================================
        // IMPORT / EKSPORT
        // =====================================================
		function exportToCSV() {
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
			
			const rows = allFormations.map(f => {
				// Upewnij się że my i enemy mają 8 elementów
				const myArr = f.my || [];
				const enemyArr = f.enemy || [];
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
			showToast(`${t('settings.exported')} ${allFormations.length} ${t('status.formations')}`);
		}
        
		async function importFromCSV(event) {
			const file = event.target.files[0];
			if (!file) return;
			if (!isOnline) { showToast(t('common.noConnection'), true); return; }
			
			const reader = new FileReader();
			reader.onload = async e => {
				try {
					const lines = e.target.result.split('\n').filter(l => l.trim());
					if (lines.length < 2) { showToast('Plik jest pusty lub ma tylko nagłówki', true); return; }
					
					const sep = lines[0].includes(';') ? ';' : ',';
					const headers = parseCSVLine(lines[0], sep).map(h => h.toLowerCase().trim());
					
					// Sprawdź czy mamy nowy format (z komentarzem) czy stary
					const hasComment = headers.includes('komentarz') || headers.length >= 22;
					
					let imported = 0, skipped = 0;
					let maxId = allFormations.length ? Math.max(...allFormations.map(f => f.id)) : 0;
					const existingIds = allFormations.map(f => f.id);
					
					for (let i = 1; i < lines.length; i++) {
						const vals = parseCSVLine(lines[i], sep);
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
						
						// Komentarz i isBase (jeśli dostępne)
						let comment = '';
						let isBase = false;
						
						if (hasComment && vals.length >= startIdx + 21) {
							comment = cleanVal(vals[startIdx + 19]);
							isBase = cleanVal(vals[startIdx + 20]) === '1';
						}
						
						await formationsRef.child(String(maxId)).set({
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
					
					let msg = `${t('settings.imported')} ${imported} ${t('status.formations')}!`;
					if (skipped > 0) msg += ` (${skipped} pominięto)`;
					showToast(msg);
					
				} catch (e) { 
					console.error('Import error:', e);
					showToast(`${t('common.error')}: ${e.message}`, true); 
				}
			};
			reader.readAsText(file);
			event.target.value = '';
		}
        
        function parseCSVLine(line, sep = ';') {
            const result = [];
            let current = '', inQuotes = false;
            for (const char of line) {
                if (char === '"') inQuotes = !inQuotes;
                else if (char === sep && !inQuotes) { result.push(current); current = ''; }
                else current += char;
            }
            result.push(current);
            return result;
        }
        
        const cleanVal = v => (v || '').replace(/"/g, '').trim();
        const refreshData = () => location.reload();
        
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
				heroes: heroesNorm,      // Do matchowania (bez pustych, lowercase)
				heroesRaw: heroesRaw,    // Do wyświetlania (z pozycjami, oryginalne nazwy)
				pet: petRaw ? normalize(petRaw) : null,  // Do matchowania
				petRaw: petRaw           // Do wyświetlania
			};
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

        function findMatchingFormations(enemyTeam, minMatch = 1) {
            const results = [];
            
            allFormations.forEach(f => {
                const enemyHeroes = f.enemy.map(h => h ? normalize(h) : '');
                const enemyPet = normalize(f.enemyPet);
                
                // Licz dopasowania z uwzględnieniem pozycji
                let matchedHeroes = [];
                let positionBonus = 0;
                
                // Sprawdź każdego bohatera z wyszukiwania
                enemyTeam.heroes.forEach((searchHero, searchIdx) => {
                    if (!searchHero) return;
                    
                    let matched = false;
                    
                    enemyHeroes.forEach((formationHero, formationIdx) => {
                        if (!formationHero) return;
                        
                        const matchScore = heroMatchScore(searchHero, formationHero);
                        if (matchScore > 0) {
                            matched = true;
                            // Bonus za tę samą pozycję (używamy heroesRaw dla pozycji)
                            if (enemyTeam.heroesRaw && enemyTeam.heroesRaw[searchIdx]) {
                                const searchPosIdx = enemyTeam.heroesRaw.findIndex((h, i) => h && normalize(h) === searchHero);
                                if (searchPosIdx === formationIdx) {
                                    positionBonus += 0.3; // bonus za dopasowanie pozycji
                                }
                            }
                        }
                    });
                    
                    if (matched) {
                        matchedHeroes.push(searchHero);
                    }
                });
                
                // Pet matching z minimalną długością
                const petMatched = enemyTeam.pet && enemyPet && 
                    heroMatchScore(enemyTeam.pet, enemyPet) > 0;
                
                const baseScore = matchedHeroes.length + (petMatched ? 1 : 0);
                const score = baseScore + positionBonus; // score z bonusem pozycji
                const maxScore = enemyTeam.heroes.length + (enemyTeam.pet ? 1 : 0);
                
                if (baseScore >= minMatch) {
                    results.push({
                        formation: f,
                        score,
                        baseScore, // wynik bez bonusu (do wyświetlania)
                        maxScore,
                        matchedHeroes,
                        petMatched,
                        positionBonus
                    });
                }
            });
            
            return results.sort((a, b) => b.score - a.score);
        }
        
        function countHeroConflicts(formations) {
            const heroCount = {};
            const petCount = {};
            const conflicts = [];
            
            formations.forEach((f, idx) => {
                f.formation.my.filter(h => h).forEach(hero => {
                    const h = normalize(hero);
                    if (!heroCount[h]) heroCount[h] = [];
                    heroCount[h].push(idx);
                });
                // Sprawdź też pety
                if (f.formation.myPet) {
                    const p = normalize(f.formation.myPet);
                    if (!petCount[p]) petCount[p] = [];
                    petCount[p].push(idx);
                }
            });
            
            // Znajdź konflikty (bohaterowie użyci więcej niż raz)
            Object.entries(heroCount).forEach(([hero, indices]) => {
                if (indices.length > 1) {
                    conflicts.push({ hero, usedIn: indices, count: indices.length, type: 'hero' });
                }
            });
            
            // Znajdź konflikty petów
            Object.entries(petCount).forEach(([pet, indices]) => {
                if (indices.length > 1) {
                    conflicts.push({ hero: pet, usedIn: indices, count: indices.length, type: 'pet' });
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
			const emptyMsg = $('war-excluded-empty');
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
			localStorage.setItem('souls_war_hide_excluded', warHideExcluded);
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

		// ===== WYKLUCZANIE BOHATERÓW W KREATORZE =====
		// kreatorExcludedHeroes zdefiniowane wcześniej (przed generateKreatorTags)
		
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
            
            // Znajdź pasujące formacje dla każdego wroga
            const matches1 = findMatchingFormations(enemy1, 1).slice(0, 20);
            const matches2 = findMatchingFormations(enemy2, 1).slice(0, 20);
            const matches3 = findMatchingFormations(enemy3, 1).slice(0, 20);
            
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
            
            // KROK 1: Generuj WSZYSTKIE kombinacje (bez filtrowania)
            const allCombinations = [];
            
            for (const m1 of matches1) {
                for (const m2 of matches2) {
                    if (m1.formation.id === m2.formation.id) continue;
                    
                    for (const m3 of matches3) {
                        if (m1.formation.id === m3.formation.id || m2.formation.id === m3.formation.id) continue;
                        
                        const conflicts = countHeroConflicts([m1, m2, m3]);
                        const totalScore = m1.score + m2.score + m3.score;
                        const totalBaseScore = (m1.baseScore || m1.score) + (m2.baseScore || m2.score) + (m3.baseScore || m3.score);
                        
                        allCombinations.push({
                            formations: [m1, m2, m3],
                            conflicts: conflicts.total,
                            conflictDetails: conflicts.details,
                            totalScore,
                            totalBaseScore,
                            avgScore: totalBaseScore / 3
                        });
                    }
                }
            }
            
			// KROK 2: Sortuj WSZYSTKIE po jakości (najlepsze na górze)
			allCombinations.sort((a, b) => {
				const maxPossibleA = a.formations.reduce((sum, m) => sum + m.maxScore, 0);
				const maxPossibleB = b.formations.reduce((sum, m) => sum + m.maxScore, 0);
				
				// Używamy totalBaseScore (bez bonusu za pozycję) - to samo co wyświetlane procenty
				const percentA = maxPossibleA > 0 ? (a.totalBaseScore / maxPossibleA) * 100 : 0;
				const percentB = maxPossibleB > 0 ? (b.totalBaseScore / maxPossibleB) * 100 : 0;
				
				const conflictPenaltyA = Math.pow(a.conflicts, 1.5) * 8;
				const conflictPenaltyB = Math.pow(b.conflicts, 1.5) * 8;
				
				const scoreA = percentA - conflictPenaltyA;
				const scoreB = percentB - conflictPenaltyB;
				
				if (Math.abs(scoreA - scoreB) > 0.1) return scoreB - scoreA;
				return a.conflicts - b.conflicts;
			});
            
			// KROK 3: Filtruj podobne (jeśli włączone) - z posortowanej listy zostają NAJLEPSZE
			let top;
			if (filterSimilar) {
				top = [];
				const fingerprints = [];
				
				for (const combo of allCombinations) {
					if (top.length >= 20) break; // Early exit - mamy już 20 unikalnych
					
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
				top = allCombinations.slice(0, 20);
			}
            
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
											<div class="war-match-bar">
												<div class="war-match-fill ${scoreClass}" style="width: ${matchPercent}%"></div>
											</div>
											<span class="war-match-score ${scoreClass}">${displayScore}/${m.maxScore}</span>
										</div>
									</div>`;
							}).join('')}
						</div>
						${combo.conflictDetails.length ? `
							<div class="war-conflicts-summary">
								⚠️ <strong>Konflikty:</strong> ${combo.conflictDetails.map(c => 
									`<span class="conflict-hero">${c.hero}</span>`
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

		// =====================================================
		// PINEZKI - ZAPISYWANIE SKŁADÓW
		// =====================================================
		
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
        
		// =====================================================
		// WAR PLANNER - ZAPIS/ODCZYT Z LOCALSTORAGE
		// =====================================================

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

		function getTimeAgo(date) {
			const now = new Date();
			const diff = Math.floor((now - date) / 1000); // sekundy
			
			if (diff < 60) return 'przed chwilą';
			if (diff < 3600) return `${Math.floor(diff / 60)} min temu`;
			if (diff < 86400) return `${Math.floor(diff / 3600)} godz. temu`;
			if (diff < 604800) return `${Math.floor(diff / 86400)} dni temu`;
			return date.toLocaleDateString('pl-PL');
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

		// Funkcja debounce - opóźnia wykonanie
		function debounce(func, wait) {
			let timeout;
			return function(...args) {
				clearTimeout(timeout);
				timeout = setTimeout(() => func.apply(this, args), wait);
			};
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
						text += `Skład ${i}\n`;
					}
					text += formatFormationAsText(formation.heroes, formation.pet);
					text += '\n';
				}
			}
			
			if (!hasContent) {
				showToast('Wpisz przynajmniej jednego bohatera!', true);
				return;
			}
			
			navigator.clipboard.writeText(text.trim()).then(() => {
				showToast('📋 Składy skopiowane do schowka!');
			}).catch(() => {
				const textarea = document.createElement('textarea');
				textarea.value = text.trim();
				document.body.appendChild(textarea);
				textarea.select();
				document.execCommand('copy');
				document.body.removeChild(textarea);
				showToast('📋 Składy skopiowane do schowka!');
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
				showToast('Wpisz przynajmniej jednego bohatera!', true);
				return;
			}
			
			const defaultName = `Skład ${kreatorSaved.length + 1}`;
			const name = prompt('Nazwa dla tego zestawu:', defaultName);
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
			showToast('💾 Skład zapisany!');
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
			showToast(`Załadowano: ${saved.name}`);
		}
		
		function deleteKreatorSaved(id, event) {
			event.stopPropagation();
			if (!confirm('Usunąć ten zapis?')) return;
			
			kreatorSaved = kreatorSaved.filter(s => s.id !== id);
			storage.setJson('souls_kreator_saved', kreatorSaved);
			renderKreatorSaved();
			showToast('Usunięto');
		}
		
		function clearAllKreatorSaved() {
			if (!kreatorSaved.length) return;
			if (!confirm('Usunąć WSZYSTKIE zapisane składy?')) return;
			
			kreatorSaved = [];
			storage.setJson('souls_kreator_saved', kreatorSaved);
			renderKreatorSaved();
			showToast('Wszystkie zapisy usunięte');
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
			showToast('Wyczyszczono');
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
						return `<div style="margin-top:4px;"><strong>Skład ${idx + 1}:</strong> ${heroes.join(', ') || '-'}${f.pet ? ` + ${f.pet}` : ''}</div>`;
					})
					.filter(p => p)
					.join('');
				
				return `
					<div class="kreator-saved-item" onclick="loadKreatorSaved(${saved.id})">
						<div class="kreator-saved-item-header">
							<span class="kreator-saved-item-name">${saved.name}</span>
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
        
		function renderCompactGridFromArray(heroesArr, matchedHeroes, showConflicts, conflictSet, isEnemy = false) {
			const slot = (name) => {
				if (!name) return `<div class="compact-slot empty">—</div>`;
				const hero = heroes.find(h => h.name.toLowerCase() === name.toLowerCase());
				const race = hero?.race?.toLowerCase() || '';
				const normName = normalize(name);
				
				// Sprawdź czy to trafiony bohater (zielone tło)
				const isMatched = matchedHeroes.some(mh => mh === normName || mh.startsWith(normName) || normName.startsWith(mh));
				
				// Sprawdź czy to konflikt (pomarańczowe obramowanie)
				const isConflict = showConflicts && conflictSet && conflictSet.has(normName);
				
				let classes = 'compact-slot filled';
				if (race) classes += ` race-${race}`;
				if (isMatched) classes += ' matched';
				if (isConflict) classes += ' conflict';
				
				let style = race ? `border-color:var(--race-${race});color:var(--race-${race})` : '';
				
				return `<div class="${classes}" style="${style}">${name}</div>`;
			};
			
			// Użyj tablicy z zachowaniem pozycji (8 slotów)
			const h = [];
			for (let i = 0; i < 8; i++) {
				h.push(heroesArr[i] || '');
			}
			
			// Układ 3-2-3 - odwrócony dla wroga
			if (isEnemy) {
				return `
					<div class="compact-row">${slot(h[5])}${slot(h[6])}${slot(h[7])}</div>
					<div class="compact-row">${slot(h[3])}${slot(h[4])}</div>
					<div class="compact-row">${slot(h[0])}${slot(h[1])}${slot(h[2])}</div>
				`;
			} else {
				return `
					<div class="compact-row">${slot(h[0])}${slot(h[1])}${slot(h[2])}</div>
					<div class="compact-row">${slot(h[3])}${slot(h[4])}</div>
					<div class="compact-row">${slot(h[5])}${slot(h[6])}${slot(h[7])}</div>
				`;
			}
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
			combo.formations.forEach((match, idx) => {
				match.formation.my.filter(h => h).forEach(hero => {
					const h = normalize(hero);
					if (!allMyHeroes[h]) allMyHeroes[h] = [];
					allMyHeroes[h].push(idx);
				});
				// Sprawdź też pety
				if (match.formation.myPet) {
					const p = normalize(match.formation.myPet);
					if (!allMyPets[p]) allMyPets[p] = [];
					allMyPets[p].push(idx);
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
			
			let html = `
				<!-- Podsumowanie kombinacji -->
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
				
				<!-- Legenda kolorów -->
				<div class="war-preview-legend">
					<div class="war-legend-item">
						<span class="war-legend-dot matched"></span>
						<span>${t('war.legendMatched')}</span>
					</div>
					<div class="war-legend-item">
						<span class="war-legend-dot missing"></span>
						<span>${t('war.legendMissing')}</span>
					</div>
					<div class="war-legend-item">
						<span class="war-legend-dot extra"></span>
						<span>${t('war.legendExtra')}</span>
					</div>
					<div class="war-legend-item">
						<span class="war-legend-dot conflict"></span>
						<span>${t('war.legendConflict')}</span>
					</div>
				</div>
			`;
			
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
							<!-- Porównanie: Szukany vs Baza -->
							<div class="war-compare-grid">
								<div class="war-compare-side">
									<div class="war-compare-side-title searched">🔍 ${t('war.searchedEnemy')}</div>
									<div style="text-align:center">
										${renderWarPetComparison(searchedEnemy.petRaw, f.enemyPet, 'searched')}
									</div>
									<div class="compact-grid">
										${renderWarSearchedGrid(searchedEnemy.heroesRaw, analysis)}
									</div>
								</div>
								
								<div class="war-compare-vs">➜</div>
								
								<div class="war-compare-side">
									<div class="war-compare-side-title database">📚 ${t('war.databaseEnemy')}</div>
									<div style="text-align:center">
										${renderWarPetComparison(f.enemyPet, searchedEnemy.pet, 'database')}
									</div>
									<div class="compact-grid">
										${renderWarDatabaseGrid(f.enemy, analysis)}
									</div>
								</div>
							</div>
							
							<!-- Separator - Twój skład -->
							<div class="war-your-team-separator">
								<span class="war-your-team-badge">⚔️ ${t('war.yourTeam')}</span>
							</div>

							<!-- Twój skład z konfliktami - ładniejszy -->
							<div class="war-your-team-section">
								${renderWarMyTeamGrid(f.my, conflictHeroes)}
								<div style="text-align: center;">
									${renderWarMyTeamPet(f.myPet, conflictPets)}
								</div>
							</div>
							
							<!-- Podsumowanie dopasowania -->
							<div class="war-match-summary">
								<div class="war-match-item matched">
									<span class="war-match-item-icon">✅</span>
									<span class="war-match-item-list">${analysis.matched.length ? analysis.matched.join(', ') : '—'}</span>
								</div>
								<div class="war-match-item missing">
									<span class="war-match-item-icon">❌</span>
									<span class="war-match-item-list">${analysis.missing.length ? analysis.missing.join(', ') : '—'}</span>
								</div>
								<div class="war-match-item extra">
									<span class="war-match-item-icon">➕</span>
									<span class="war-match-item-list">${analysis.extra.length ? analysis.extra.join(', ') : '—'}</span>
								</div>
							</div>
							
							<!-- Komentarz -->
							${f.comment ? `
								<div class="war-comment-section">
									<div class="war-comment-label">💬 ${t('war.comment')}</div>
									<div class="war-comment-text">${f.comment}</div>
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
			
			// Podsumowanie konfliktów na dole
			const hasHeroConflicts = conflictHeroes.size > 0;
			const hasPetConflicts = conflictPets.size > 0;
			
			if (hasHeroConflicts || hasPetConflicts) {
				const conflictList = [];
				Object.entries(allMyHeroes).forEach(([hero, indices]) => {
					if (indices.length > 1) {
						conflictList.push({
							name: hero.charAt(0).toUpperCase() + hero.slice(1),
							battles: indices.map(i => i + 1),
							type: 'hero'
						});
					}
				});
				Object.entries(allMyPets).forEach(([pet, indices]) => {
					if (indices.length > 1) {
						conflictList.push({
							name: pet.charAt(0).toUpperCase() + pet.slice(1),
							battles: indices.map(i => i + 1),
							type: 'pet'
						});
					}
				});
				
				html += `
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
				html += `
					<div class="war-conflicts-box no-conflicts">
						<h3 class="war-conflicts-title good">✅ ${t('war.noConflictsTitle')}</h3>
						<p style="font-size: 0.8rem; color: var(--text-muted);">
							${t('war.noConflictsDesc')}
						</p>
					</div>
				`;
			}
			
			$('war-preview-content').innerHTML = html;
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
		function renderWarSearchedGrid(heroesRaw, analysis) {
			const slot = (idx) => {
				const name = heroesRaw[idx] || '';
				if (!name) return `<div class="compact-slot empty">—</div>`;
				
				const isMatched = analysis.matched.some(m => normalize(m) === normalize(name));
				const isMissing = analysis.missing.some(m => normalize(m) === normalize(name));
				
				const hero = heroes.find(h => h.name.toLowerCase() === name.toLowerCase());
				const race = hero?.race?.toLowerCase() || '';
				
				let classes = 'compact-slot filled';
				if (race) classes += ` race-${race}`;
				if (isMatched) classes += ' war-matched';
				if (isMissing) classes += ' war-missing';
				
				// Kapitalizuj nazwę (pierwsza duża)
				const displayName = hero ? hero.name : (name.charAt(0).toUpperCase() + name.slice(1).toLowerCase());
				
				return `<div class="${classes}">${displayName}</div>`;
			};
			
			return `
				<div class="compact-row">${slot(5)}${slot(6)}${slot(7)}</div>
				<div class="compact-row">${slot(3)}${slot(4)}</div>
				<div class="compact-row">${slot(0)}${slot(1)}${slot(2)}</div>
			`;
		}

		// Renderuj siatkę wroga z bazy
		function renderWarDatabaseGrid(heroesArr, analysis) {
			const slot = (idx) => {
				const name = heroesArr[idx] || '';
				if (!name) return `<div class="compact-slot empty">—</div>`;
				
				const normName = normalize(name);
				const isMatched = analysis.searchedHeroesNorm.some(sh => normName === sh || normName.startsWith(sh) || sh.startsWith(normName));
				const isExtra = analysis.extra.some(e => normalize(e) === normName);
				
				const hero = heroes.find(h => h.name.toLowerCase() === name.toLowerCase());
				const race = hero?.race?.toLowerCase() || '';
				
				let classes = 'compact-slot filled';
				if (race) classes += ` race-${race}`;
				if (isMatched) classes += ' war-matched';
				if (isExtra) classes += ' war-extra';
				
				return `<div class="${classes}">${name}</div>`;
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
				
				const hero = heroes.find(h => h.name.toLowerCase() === name.toLowerCase());
				const race = hero?.race?.toLowerCase() || '';
				
				let classes = 'war-your-team-slot filled';
				if (race) classes += ` race-${race}`;
				if (isConflict) classes += ' conflict';
				
				return `<div class="${classes}">${name}</div>`;
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
			return `<div class="war-your-team-pet${conflictClass}">🐾 ${petName}</div>`;
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
			if (side === 'searched') {
				if (normOther && (normPet === normOther || normPet.startsWith(normOther) || normOther.startsWith(normPet))) {
					petClass += ' war-matched';
				} else if (normPet && !normOther) {
					petClass += ' war-missing';
				}
			} else {
				if (normOther && (normPet === normOther || normPet.startsWith(normOther) || normOther.startsWith(normPet))) {
					petClass += ' war-matched';
				} else if (normPet && !normOther) {
					petClass += ' war-extra';
				}
			}
			
			return `<div class="compact-pet ${petClass}">🐾 ${displayName}</div>`;
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
        
		function setupAutocomplete() {
			document.querySelectorAll('input[data-type]').forEach(input => {
				const list = $('list-' + input.id);
				const type = input.dataset.type;

				const isWarField = input.id.startsWith('war-');
				const isEditField = input.id.startsWith('edit-') && !['edit-name', 'edit-comment', 'edit-id'].includes(input.id);
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
					
					// Aktualizuj kolor inputa dla War Planner i Kreator
					if (input.id.startsWith('war-') || input.id.startsWith('kreator-')) {
						const isPet = input.id.includes('-pet');
						updateInputHeroColor(input, isPet);
					}
					
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
					
					const val = input.value.toLowerCase();
					if (val.length < 1) { targetList.classList.remove('show'); return; }
					
					const items = type === 'pet' ? pets : heroes;
					const filtered = type === 'pet' ? items.filter(p => p.toLowerCase().startsWith(val)).slice(0, 6) :
						items.filter(h => h.name.toLowerCase().startsWith(val)).slice(0, 6);
					
					if (!filtered.length) { targetList.classList.remove('show'); return; }
					
					targetList.innerHTML = filtered.map(item => type === 'pet' ?
						`<div class="autocomplete-item" data-value="${item}">${item}</div>` :
						`<div class="autocomplete-item race-${item.race.toLowerCase()}" data-value="${item.name}">${item.name} <span class="race">(${item.race})</span></div>`
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
            
			document.querySelectorAll('#tab-search input[data-type]').forEach(input => {
				input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); searchFormations(); } });
				input.addEventListener('focus', () => { activeSearchField = input.id; });
				input.addEventListener('blur', () => { setTimeout(() => { activeSearchField = null; }, 200); });
			});
            
            $('lookup-id').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); lookupById(); } });
            
			$('quick-select-modal').addEventListener('click', e => { if (e.target === $('quick-select-modal')) closeQuickSelect(); });
			$('edit-modal')?.addEventListener('click', e => { if (e.target === $('edit-modal')) closeEditModal(); });
			document.addEventListener('keydown', e => { 
				if (e.key === 'Escape') {
					if (!$('quick-select-modal').classList.contains('hidden')) closeQuickSelect();
					if (!$('edit-modal').classList.contains('hidden')) closeEditModal();
				}
			});
            
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
