# Feature Roadmap — Was Safari To-Dos von Trello, Asana & Notion lernen kann

Analyse der drei großen Task-Tools (+ AppFlowy als Open-Source-Referenz) und ein konkreter,
priorisierter Plan, welche Konzepte in Safari To-Dos passen — ohne das Kernprinzip zu verletzen:
**"Here are your to-dos. Here is the deadline. Complete them. Admin approves."** Lean bleibt Gesetz.

---

## 1. Wie die Vorbilder funktionieren (Kern-Mechaniken)

### Trello — "Alles ist eine Karte"
| Mechanik | Beschreibung |
|---|---|
| Karten-DNA | Eine Karte trägt alles: Checkliste, Kommentare, Anhänge, Labels, Due Date, Mitglieder |
| Drag & Drop überall | Karten zwischen Listen, Listen zwischen Positionen — sofort, optimistisch, ohne Modal |
| Labels mit Farben | 6-10 farbige Labels pro Board, filterbar, auf der Karte sichtbar |
| Quick-Add | `n` drücken oder unten in der Liste tippen → Karte entsteht inline, kein Formular |
| Butler-Automationen | "Wenn Karte nach Done → archiviere nach 3 Tagen" — Regeln statt Handarbeit |
| Board-Filter | Ein Klick: nur meine Karten / nur überfällig / nur Label X |

### Asana — "Arbeit hat einen Besitzer und ein Datum"
| Mechanik | Beschreibung |
|---|---|
| My Tasks als Inbox | Zentrale persönliche Liste, automatisch sortiert in Today / Upcoming / Later |
| Multi-Homing | Ein Task kann in mehreren Projekten zugleich leben (eine Quelle, mehrere Sichten) |
| Sections + Board/List/Calendar Toggle | Dieselben Daten, drei Darstellungen — ein Klick zum Wechseln |
| Inbox/Benachrichtigungs-Triage | Benachrichtigungen sind abarbeitbar (archivieren, follow-up erstellen) |
| Abhängigkeiten | "Blocked by X" — Task wartet sichtbar auf einen anderen |
| Celebrations | Einhorn fliegt über den Bildschirm beim Abhaken — Vorbild für unser XP-System ✅ (haben wir jetzt) |

### Notion — "Datenbank mit Gesichtern"
| Mechanik | Beschreibung |
|---|---|
| Eine DB, viele Views | Table / Board / Calendar / Timeline / Gallery auf denselben Daten, mit gespeicherten Filtern |
| Properties statt Schema-Zwang | Felder pro Bedarf: Select, Multi-Select, Person, Datum, Relation |
| Slash-Kommandos | `/` öffnet alles — schnelles Einfügen ohne Maus |
| Templates auf DB-Ebene | "Neuer Eintrag aus Template" direkt am Erstellknopf ✅ (haben wir rudimentär) |
| Verlinkte Erwähnungen | @Person, @Task, @Datum überall im Text |

### AppFlowy (Open Source, AGPL — nur als Konzept-Referenz, kein Code-Import)
- Gleiche "eine Datenquelle, mehrere Views"-Philosophie wie Notion, lokale Daten.
- Sauberes Grid/Board/Calendar-Umschalten und Property-System — gutes UI-Vorbild für
  unsere Board/Calendar-Vereinheitlichung.

---

## 2. Was davon zu Safari To-Dos passt — priorisiert

### 🟢 Phase A — Quick Wins (je < 1 Tag, hoher Impact)
1. **Board-Filterleiste** (Trello): "Nur meine Tasks", "Überfällig", Priorität, Label —
   Client-seitig filtern, keine Schema-Änderung.
2. **Inline Quick-Add** (Trello): Im "Add task"-Row direkt Titel tippen + Enter → Task mit
   Section-Defaults, Formular nur noch für Details. Senkt die Hürde massiv.
3. **My-Tasks-Gruppierung** (Asana): Dashboard-Liste in Today / This Week / Later gruppieren
   statt flacher Liste.
4. **Notification-Triage** (Asana): Einzelne Notification als gelesen markieren + Klick führt
   zum Task (task_id ist schon da, TaskModal-Deeplink fehlt).
5. **Farbige Labels** (Trello): Labels existieren als `text[]` — feste Farbpalette per
   Hash aufs Label mappen, filterbar machen.

### 🟡 Phase B — Mittlerer Aufwand (je 1-3 Tage)
6. **View-Umschalter pro Board** (Notion/Asana): Board ⇄ Liste ⇄ Kalender auf denselben
   Task-Daten. Kalender existiert schon global — pro Board einbinden.
7. **Task-Deeplinks** (`/board/x?task=y`): Voraussetzung für Notifications, Erwähnungen,
   Sharing. TaskModal aus URL-Param öffnen.
8. **@Mentions in Kommentaren** (Notion/Asana): `@name` parsen → `mention`-Notification
   (Typ existiert schon in der DB!).
9. **Wiederkehrende Tasks aktivieren**: Felder + Spec existieren (`recurring_*`), es fehlt nur
   der Cron (Supabase Edge Function / pg_cron), der neue Instanzen erzeugt — Spec-konform als
   neue Tasks, nie Mutation.
10. **Overdue-Automation** (Trello Butler): pg_cron markiert überfällige Tasks + Notification —
    `overdue`-Notification-Typ existiert schon.

### 🔴 Phase C — Groß, nur bei echtem Bedarf
11. **Task-Abhängigkeiten** (Asana): `blocked_by`-Relation + UI. Erst wenn das Team wirklich
    sequenzielle Arbeit hat — sonst Feature-Bloat.
12. **Timeline/Gantt** (Asana/Notion): Widerspricht eher dem Lean-Prinzip. Nur auf explizite
    Nachfrage.
13. **Automationen-Builder** (Trello Butler): Generischer Regel-Editor ist Overkill; feste,
    hart kodierte Automationen (Punkt 9/10) decken 90 % ab.

### ❌ Bewusst NICHT übernehmen
- Notion-artige Freiform-Seiten/Docs — wir sind ein Task-Tool, kein Wiki.
- Trello Power-Up-Marktplatz, Asana Goals/Portfolios/Workload — KPI-Bloat, explizit gegen V1-Scope.
- ClickUp-Feature-Sammelsurium — genau davor sind wir geflohen.

---

## 3. Empfohlene Reihenfolge

```
Sprint 1 (Quick Wins):     A1 Filterleiste → A2 Quick-Add → A4 Notification-Triage + B7 Deeplinks
Sprint 2 (Flow):           A3 My-Tasks-Gruppierung → A5 Labels → B8 Mentions
Sprint 3 (Automation):     B9 Recurring-Cron → B10 Overdue-Cron
Später (nach Team-Feedback): B6 View-Umschalter, dann ggf. Phase C
```

Begründung: Sprint 1 macht das tägliche Arbeiten schneller (weniger Klicks, direkte Wege),
Sprint 2 verbessert Kommunikation, Sprint 3 eliminiert Admin-Handarbeit. Alles davon bleibt
im Lean-Rahmen und braucht keine neuen externen Dienste.
