# MBD — Budżet Domowy

Lokalna aplikacja webowa do zarządzania budżetem domowym. Działa w Dockerze na lokalnym serwerze.

## Stack

- **Backend:** Node.js + Express + TypeScript (`backend/`)
- **Frontend:** React + TypeScript + Vite + Recharts + Tailwind CSS (`frontend/`)
- **Baza danych:** SQLite via better-sqlite3 (plik `data/budget.db`)
- **Deploy:** Docker + docker-compose, port 3000

## Uruchamianie

```bash
# Docker (produkcja)
docker compose up --build -d

# Development (dwa terminale)
npm install
npm run dev:backend    # Express na :3000
npm run dev:frontend   # Vite na :5173 z proxy do :3000
```

## Struktura projektu

```
backend/src/
  index.ts              # Express server entry
  db/connection.ts      # SQLite connection (better-sqlite3)
  db/schema.ts          # DDL, migracje, seed domyślnych kategorii
  types.ts              # TypeScript interfaces
  routes/
    accounts.ts         # CRUD kont bankowych
    categories.ts       # CRUD kategorii wydatków
    transactions.ts     # Lista, filtry, split na elementy
    import.ts           # Upload CSV + e-paragonów, deduplikacja
    receipts.ts         # E-paragony, matching z transakcjami
    products.ts         # Baza produktów z auto-kategoryzacją
    reports.ts          # Agregacje: wg kategorii, trend, saldo
  parsers/
    index.ts            # Rejestr parserów
    pekao.ts            # Parser CSV PeKaO SA
    pkobp.ts            # Parser CSV PKO BP
    creditagricole.ts   # Parser CSV Credit Agricole
    receipt.ts          # Parser e-paragonów (JSON)

frontend/src/
  App.tsx               # React Router
  api/client.ts         # Fetch wrapper dla API
  components/
    Layout.tsx          # Sidebar nawigacja
    CategoryBadge.tsx
    TransactionSplitModal.tsx  # Modal rozbijania transakcji
  pages/
    Dashboard.tsx       # Podsumowanie + wykresy
    Accounts.tsx        # Zarządzanie kontami
    Import.tsx          # Upload CSV / e-paragonów
    Transactions.tsx    # Lista z filtrami, kategorie, split
    Categories.tsx      # CRUD kategorii z kolorami
    Receipts.tsx        # E-paragony, matching
    Products.tsx        # Baza produktów
    Reports.tsx         # Wykresy (pie, bar, line)
```

## Baza danych (SQLite)

Tabele: `accounts`, `categories`, `transactions`, `transaction_items`, `products`, `receipts`, `receipt_items`, `imports`

Kluczowe relacje:
- `transactions.account_id` → `accounts.id`
- `transactions.category_id` → `categories.id` (jeśli nie rozbita)
- `transaction_items.transaction_id` → `transactions.id` (elementy rozbicia)
- `transaction_items.product_id` → `products.id`
- `receipts.transaction_id` → `transactions.id` (skojarzenie paragonu)
- `receipt_items.receipt_id` → `receipts.id`

Deduplikacja importu: `transactions.import_hash` = SHA256(account_id|date|amount|description), UNIQUE constraint + INSERT OR IGNORE.

## API

Prefix: `/api`

- `GET/POST/DELETE /accounts`
- `GET/POST/PUT/DELETE /categories`
- `GET /transactions?account_id=&from=&to=&category_id=&search=&limit=&offset=`
- `GET/PUT /transactions/:id`
- `POST/DELETE /transactions/:id/split` — rozbij/cofnij rozbicie
- `POST /import/csv` (multipart: file + account_id)
- `POST /import/receipt` (multipart: file JSON)
- `GET /imports`
- `GET /receipts`, `GET /receipts/:id`, `POST /receipts/:id/match`
- `GET /products`, `PUT /products/:id`
- `GET /reports/by-category?from=&to=&account_id=`
- `GET /reports/monthly-trend?year=&account_id=`
- `GET /reports/balance-history?account_id=&from=&to=`

## Kluczowe funkcjonalności

1. **Import CSV** — upload wyciągu, parser wg banku, deduplikacja hashem
2. **Rozbijanie transakcji** — modal z pozycjami, kwoty muszą się bilansować
3. **E-paragony** — import JSON, auto-matching z transakcją (kwota ± data), tworzenie produktów
4. **Produkty** — budowane z historii, domyślna kategoria → auto-kategoryzacja
5. **Raporty** — Recharts: pie (kategorie), bar (trend miesięczny), line (historia salda)

## Konwencje

- UI po polsku
- Kwoty: ujemne = wydatki, dodatnie = wpływy
- Daty w bazie: YYYY-MM-DD
- Parsery CSV obsługują polskie formaty (DD.MM.YYYY, przecinek jako separator dziesiętny, Windows-1250)
- Domyślne kategorie: Jedzenie, Opłaty, Zdrowie, Transport, Rozrywka, Ubrania, Dom, Inne
- Banki: `pekao`, `pkobp`, `creditagricole`

## TODO / Dalszy rozwój

- Dostrojenie parserów CSV po dostarczeniu przykładowych plików (formaty mogą się różnić)
- Rozszerzenie parsera e-paragonów o PDF/XML
- Reguły auto-kategoryzacji transakcji na podstawie opisu/kontrahenta
- Eksport raportów do CSV/PDF
