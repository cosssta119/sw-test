# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Struktura repozytorium

To jest **jednoplikowa aplikacja webowa**. Cała logika, struktura HTML i style znajdują się w `souls-war.html` (~9500 linii). Nie ma systemu build, menedżera pakietów, testów ani konfiguracji lintera — zmiany wprowadza się bezpośrednio w pliku HTML i wdraża tak jak jest.

- `souls-war.html` — cała aplikacja (HTML + inline `<style>` + inline `<script>`)
- `SOULS_Heroes_Database.xlsx` — arkusz referencyjny (nie ładowany przez aplikację)
- `README.md` — dokumentacja użytkownika (po polsku)
- Hosting to GitHub Pages; URL aplikacji to bezpośredni link do `souls-war.html`

## Uruchamianie / podgląd

Brak poleceń build/test. Aby rozwijać: otwórz `souls-war.html` bezpośrednio w przeglądarce lub serwuj folder po HTTP (np. `python -m http.server 8000`), żeby auth i realtime Firebase działały poprawnie. Firebase łączy się na żywo z produkcyjną bazą RTDB przy starcie — uruchomienia lokalne współdzielą dane produkcyjne.

## Architektura wysokiego poziomu

Aplikacja zorganizowana jest jako zbiór **zakładek** (single-page, bez routera). Każda zakładka to blok `<div id="tab-{name}" class="tab-content">` przełączany przez `switchTab(name)`. Przyciski nawigacji są podpięte inline przez `onclick="switchTab('...')"`.

Zakładki i ich role:

| ID zakładki | Cel | Uwagi |
|---|---|---|
| `tab-search` | Wyszukiwanie kontr-formacji — użytkownik wpisuje skład wroga, dostaje posortowane dopasowania | Główna funkcja |
| `tab-database` | Przeglądarka pełnej bazy z filtrami (wszystkie/bazowe/dodane/ulubione), porównywanie 2–3 formacji | |
| `tab-view` | Wizualizacja pojedynczej formacji w układzie 3-2-3 + nawigacja między ID | |
| `tab-add` | Formularz zapisu nowej formacji | |
| `tab-war` / `tab-war-preview` | **Admin**. Planowanie 3 walk naraz; ranking kombinacji przez score minus kara za konflikty | |
| `tab-kreator` | Ręczny builder 3 składów z tagami | |
| `tab-settings` | **Admin**. Import/eksport CSV + ręczne odświeżanie | |
| `tab-admin` | **Admin**. Zarządzanie bohaterami/petami, oznaczanie bazowych, operacje masowe | Ukryta bez admina |

### Warstwa danych (Firebase Realtime Database)

Config Firebase jest **inline na górze `<script>`** (`firebaseConfig`, ~linia 3483). Przy inicjalizacji `allFormations` jest wypełniane z `/formations` i trzymane w pamięci na potrzeby wszystkich wyszukiwań. Bohaterowie i pety ładowani są z `/heroes` i `/pets`, z hardcodowanymi tablicami fallbackowymi w ~liniach 3528–3548 używanymi, gdy lookupy w DB są puste.

- `allFormations` to jedyne źródło prawdy po załadowaniu — większość funkcji filtruje/scoruje na nim w pamięci zamiast odpytywać Firebase ponownie.
- Kształt danych (szczegóły w README): `formations/{id}` ma `enemy[8]`, `enemyPet`, `my[8]`, `myPet`, `isBase`, plus metadane.

### Model autoryzacji

Dwa hashe SHA-256 haseł siedzą w kodzie klienta (~linie 3525–3526):

- `GUILD_PASSWORD_HASH` chroni wejście; odblokowanie jest persystowane jako `localStorage['souls_guild_access']`.
- `ADMIN_PASSWORD_HASH` odblokowuje zakładki admina (`nav-settings`, `nav-admin`, funkcje Planera Wojny). Formularz loginu admina pokazuje się po kliknięciu nagłówka strony **5 razy w ciągu 2 sekund** (logika `headerClickCount`). Tak ma być — nie refaktoruj tego.
- Nie ma autoryzacji po stronie serwera. Wszystkie akcje "admin" są gated tylko po stronie klienta; reguły bezpieczeństwa Firebase to jedyna realna granica autoryzacji.

### Algorytmy scoringu (nieoczywiste elementy)

Istnieją dwie osobne ścieżki wyszukiwania:

1. **`searchFormations()`** (~linia 4755) — widoczna dla użytkownika zakładka Szukaj. Prosty score: `liczba trafionych bohaterów + (pet trafiony ? 1 : 0)`, sortowane malejąco.
2. **`findMatchingFormations(enemyTeam, minMatch)`** (~linia 7217) — używane przez Planer Wojny. Dodaje **+0.3 bonusu za pozycję** za każdego bohatera trafionego na tym samym indeksie slotu.

Ranking kombinacji w Planerze Wojny używa `countHeroConflicts` (wykrywanie wspólnych bohaterów między 3 wybranymi kontrami) i aplikuje karę **`konflikty^1.5 × 8`** do zsumowanego score — to formuła wymieniona w README. Jeśli zmieniasz stałe position-bonus lub conflict-penalty, zaktualizuj też README.

Dopasowanie bohaterów/petów idzie przez `normalize()` + `heroMatchScore()` (fuzzy/prefix match); zawsze korzystaj z tych helperów zamiast bezpośredniego porównania stringów, żeby skrócone nazwy i input case-insensitive działały dalej.

### Stan i persystencja

Cały stan lokalny siedzi w `localStorage` pod prefiksem `souls_`:

- `souls_favorites`, `souls_lang`, `souls_theme`, `souls_guild_access`
- `souls_search_history`, `souls_war_history`, `souls_recently_viewed`
- `souls_excluded_heroes`, `souls_hide_excluded`, `souls_pinned_combos`
- `souls_race_order`, `souls_kreator_excluded_heroes`
- Różne preferencje UI: `enemyRowsReversed`, `searchRowsReversed`, `addFormSectionsReversed`, `addFormStacked`

Gdy dodajesz nową persystowaną preferencję, zachowaj prefiks `souls_` dla danych aplikacji, żeby przyszła logika bulk-clear mogła je znaleźć.

### i18n

Słownik dwujęzyczny (`translations.pl`, `translations.en`) w ~linii 3554. Elementy opt-in przez atrybut `data-i18n="key"`; `applyTranslations()` chodzi po DOM i podmienia tekst. `currentLang` persystuje w `localStorage['souls_lang']`. Gdy dodajesz napisy widoczne dla użytkownika, dodawaj wpisy zarówno do `pl` jak i `en` zamiast hardcodować polski.

### Tag pickery i auto-skok między polami

Każda zakładka z dużą ilością inputów (search, add, war-e1/e2/e3, kreator-1/2/3, edit) rejestruje swoje pola pozycji w `FORM_FIELD_CONFIG` (~linia 4781). Auto-skok do następnego pustego pola, wybór tagu i flow "next section" — wszystko czyta z tej mapy. **Gdy dodajesz nową zakładkę lub sekcję z inputami, zarejestruj ją w `FORM_FIELD_CONFIG`** — inaczej kliknięcia tagów i nawigacja klawiaturą cicho przestają działać.

## Konwencje do zachowania

- Trzymaj aplikację jako **pojedynczy plik**. Żadnego bundlera, żadnych zewnętrznych modułów JS. Biblioteki trzecich stron inline przez `<script src="https://…">` (obecnie tylko Firebase compat SDK v9.22.0).
- Napisy UI i komentarze w kodzie są przeważnie **po polsku**. Dopasuj się do języka otaczającego kodu przy edycjach i przy dodawaniu toastów; dla nowych napisów widocznych dla użytkownika dodawaj wpisy tłumaczeń w `pl` i `en`.
- Nie commituj zmian w `firebaseConfig`, hashach haseł ani hardcodowanych tablicach heroes/pets bez wyraźnej prośby — to wartości produkcyjne.
