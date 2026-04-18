# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Kontekst: to jest repo TESTOWE (sandbox)

Produkcyjna wersja aplikacji żyje w osobnym repo `Souls-war` (publiczne, https://cosssta119.github.io/Souls-war/souls-war.html, używane przez graczy gildii). To repo (`sw-test`) służy do eksperymentów — zmiany najpierw lądują tutaj, testujemy, dopiero sprawdzoną zmianę kopiujemy ręcznie do produkcji.

- Hasło gildii w teście: **`sandbox`** (produkcja ma inne)
- Hash admina taki sam jak produkcja
- **Firebase jest współdzielony z produkcją** — każda operacja destrukcyjna (delete, bulk, load base) uderza w żywe dane graczy. Testuj ostrożnie.

## Struktura repozytorium

Aplikacja rozbita na trzy pliki serwowane statycznie (GitHub Pages, bez build systemu, bez menedżera pakietów, bez testów):

- `souls-war.html` — szkielet HTML (~880 linii): `<head>`, modale, zakładki jako `<div>`, pasek nawigacji
- `souls-war.css` — wszystkie style (~2600 linii)
- `souls-war.js` — całość logiki (~6050 linii): init Firebase, stan globalny, tłumaczenia, wszystkie funkcje
- `README.md` — dokumentacja użytkownika (po polsku, identyczna z produkcją)
- `SOULS_Heroes_Database.xlsx` — arkusz referencyjny (nie ładowany przez aplikację)

HTML ładuje CSS przez `<link rel="stylesheet" href="souls-war.css">` i JS przez `<script src="souls-war.js">` (po Firebase compat SDK v9.22.0, który jest inline w `<head>`).

## Uruchamianie / podgląd

Brak poleceń build/test. Aby rozwijać: serwuj folder po HTTP (np. `python -m http.server 8000`), żeby auth i realtime Firebase działały poprawnie. Firebase łączy się na żywo z tą samą RTDB co produkcja.

Po pushu na `main` GitHub Pages automatycznie deployuje w ~1 min pod `https://cosssta119.github.io/sw-test/souls-war.html`.

## Architektura wysokiego poziomu

Aplikacja zorganizowana jest jako zbiór **zakładek** (single-page, bez routera). Każda zakładka to blok `<div id="tab-{name}" class="tab-content">` w `souls-war.html` przełączany przez `switchTab(name)` z `souls-war.js`. Przyciski nawigacji są podpięte inline przez `onclick="switchTab('...')"`.

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

Config Firebase jest na górze `souls-war.js` (`firebaseConfig`). Przy inicjalizacji `allFormations` jest wypełniane z `/formations` i trzymane w pamięci na potrzeby wszystkich wyszukiwań. Bohaterowie i pety ładowani są z `/heroes` i `/pets`, z hardcodowanymi fallbackami w `souls-war.js` używanymi, gdy lookupy w DB są puste/offline.

- Fallback `heroes` jest w formie zgrupowanej po rasie (`Object.entries({...}).flatMap(...)`) dla czytelności — runtime struktura to nadal `[{name, race}, ...]`.
- `allFormations` to jedyne źródło prawdy po załadowaniu — większość funkcji filtruje/scoruje na nim w pamięci zamiast odpytywać Firebase ponownie.
- Kształt danych (szczegóły w README): `formations/{id}` ma `enemy[8]`, `enemyPet`, `my[8]`, `myPet`, `isBase`, plus metadane.

### Model autoryzacji

Dwa hashe SHA-256 haseł siedzą w kodzie klienta (`GUILD_PASSWORD_HASH`, `ADMIN_PASSWORD_HASH` w `souls-war.js`):

- `GUILD_PASSWORD_HASH` chroni wejście; odblokowanie jest persystowane jako `localStorage['souls_guild_access']`.
- `ADMIN_PASSWORD_HASH` odblokowuje zakładki admina (`nav-settings`, `nav-admin`, funkcje Planera Wojny). Formularz loginu admina pokazuje się po kliknięciu nagłówka strony **5 razy w ciągu 2 sekund** (logika `headerClickCount`). Tak ma być — nie refaktoruj tego.
- Nie ma autoryzacji po stronie serwera. Wszystkie akcje "admin" są gated tylko po stronie klienta; reguły bezpieczeństwa Firebase to jedyna realna granica autoryzacji.

### Algorytmy scoringu (nieoczywiste elementy)

Scoring formacji jest wspólny — `scoreFormation(formation, query, { withPositionBonus })` zwraca `{ score, baseScore, positionBonus, matchedHeroes, petMatched, maxScore }`. Wołają go:

1. **`searchFormations()`** — zakładka Szukaj. `withPositionBonus: false`. Pokazuje wyniki ze `score > 0`, sortowanie malejąco.
2. **`findMatchingFormations(enemyTeam, minMatch)`** — Planer Wojny. `withPositionBonus: true` → **+0.3 za każdego bohatera trafionego na tym samym indeksie slotu**. `enemyTeam` musi mieć `heroesRaw` (8-slot z pozycjami) — bonus idzie przez `findIndex` po tej tablicy.

Ranking kombinacji w Planerze Wojny używa `countHeroConflicts` (wykrywanie wspólnych bohaterów między 3 wybranymi kontrami) i aplikuje karę **`konflikty^1.5 × 8`** do zsumowanego score — to formuła wymieniona w README. Jeśli zmieniasz stałe position-bonus lub conflict-penalty, zaktualizuj też README.

Dopasowanie bohaterów/petów idzie przez `normalize()` + `heroMatchScore()` (fuzzy/prefix match); zawsze korzystaj z tych helperów zamiast bezpośredniego porównania stringów, żeby skrócone nazwy i input case-insensitive działały dalej.

### Stan i persystencja

Cały stan lokalny siedzi w `localStorage` pod prefiksem `souls_`:

- `souls_favorites`, `souls_lang`, `souls_theme`, `souls_guild_access`
- `souls_search_history`, `souls_war_history`, `souls_recently_viewed`
- `souls_excluded_heroes`, `souls_hide_excluded`, `souls_pinned_combos`
- `souls_race_order`, `souls_kreator_excluded_heroes`
- Preferencje UI: `souls_enemyRowsReversed`, `souls_searchRowsReversed`, `souls_addFormSectionsReversed`, `souls_addFormStacked` (camelCase zachowany, tylko prefiks dodany)

Czytanie/zapis JSON i bool idzie przez helper `storage` na górze `souls-war.js` (`storage.getJson/setJson/getBool`); używaj go zamiast surowego `localStorage.getItem/setItem`, żeby nowa persystencja była spójna. Gdy dodajesz nową persystowaną preferencję, zachowaj prefiks `souls_`.

Na górze `souls-war.js` siedzi jednorazowa IIFE migrująca 4 klucze preferencji UI z wersji bez prefiksu do `souls_*`. Jeśli w przyszłości wprowadzasz podobny rename kluczy, dopisz je do tej migracji zamiast rozbijać po kodzie.

### i18n

Słownik dwujęzyczny (`translations.pl`, `translations.en`) w `souls-war.js`. Elementy opt-in przez atrybut `data-i18n="key"`; `applyTranslations()` chodzi po DOM i podmienia tekst. `currentLang` persystuje w `localStorage['souls_lang']`. Gdy dodajesz napisy widoczne dla użytkownika, dodawaj wpisy zarówno do `pl` jak i `en` zamiast hardcodować polski.

### Tag pickery i auto-skok między polami

Każda zakładka z dużą ilością inputów (search, add, war-e1/e2/e3, kreator-1/2/3, edit) rejestruje swoje pola pozycji w `FORM_FIELD_CONFIG` w `souls-war.js`. Auto-skok do następnego pustego pola, wybór tagu i flow "next section" — wszystko czyta z tej mapy. **Gdy dodajesz nową zakładkę lub sekcję z inputami, zarejestruj ją w `FORM_FIELD_CONFIG`** — inaczej kliknięcia tagów i nawigacja klawiaturą cicho przestają działać.

## Konwencje do zachowania

- Pliki zewnętrzne (`souls-war.css`, `souls-war.js`) ładowane są względnymi ścieżkami — trzymaj wszystkie trzy pliki w tym samym katalogu.
- Napisy UI i komentarze w kodzie są przeważnie **po polsku**. Dopasuj się do języka otaczającego kodu przy edycjach i przy dodawaniu toastów; dla nowych napisów widocznych dla użytkownika dodawaj wpisy tłumaczeń w `pl` i `en`.
- Nie commituj zmian w `firebaseConfig`, hashach haseł ani hardcodowanych tablicach heroes/pets bez wyraźnej prośby — to wartości produkcyjne.
- Jeśli zmiana tutaj została przetestowana i ma pójść na produkcję: pamiętaj że produkcja wciąż jest **jednoplikowa** (`souls-war.html` w repo `Souls-war`). Trzeba ręcznie zainlineować CSS/JS z powrotem LUB najpierw rozbić produkcję na 3 pliki (wymaga osobnego pushu).
