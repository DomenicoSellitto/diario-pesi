# Diario Pesi — brief di progetto

Questo file descrive il progetto e le decisioni già prese. Leggilo per intero prima di scrivere codice e tienilo aggiornato quando cambia qualcosa di importante.

## Cos'è

Una web app installabile (PWA) che fa da diario di allenamento con i pesi, per uso personale. Si usa quasi solo da **iPhone 17 Pro**, aggiunta alla schermata Home da Safari. Il PC è secondario.

L'utente si allena 6 giorni a settimana:
- **2 giorni pesi** (giovedì e sabato): due schede full body fisse, A e B. È qui che serve lo strumento.
- **4 giorni pugilato**: lunedì tecnica, martedì sacco (velocità o potenza), mercoledì sparring condizionato, venerdì sparring libero. Si registrano solo con un tocco, senza dettagli.

L'obiettivo dei pesi è l'**ipertrofia**. Fanno eccezione gli esercizi per le gambe, orientati alla prestazione nel pugilato. L'utente va quasi sempre a cedimento e decide da solo quando aumentare il carico: **niente suggerimenti automatici di progressione**.

La scheda cambia ogni 2-3 mesi, di solito quando c'è uno stallo.

## Vincoli

- **Tutto gratuito**: niente servizi a pagamento, abbonamenti o API a pagamento.
- **Niente App Store.** È una PWA ospitata su **GitHub Pages**.
- **Interfaccia in italiano**, semplice ed essenziale, pensata per essere usata tra una serie e l'altra con poche dita.
- L'utente non è uno sviluppatore: spiega in modo semplice ogni passo che deve fare lui (GitHub, impostazioni, test sull'iPhone).

## Scelte tecniche

- HTML, CSS e JavaScript **senza framework e senza build step**, così si pubblica com'è su GitHub Pages.
- Dati salvati in locale con **IndexedDB**. Non c'è nessun server.
- `manifest.webmanifest` più icone, così l'app si installa sulla schermata Home e si apre a schermo intero (`display: standalone`).
- **Service worker** per il funzionamento offline. Va versionato in modo che gli aggiornamenti arrivino all'iPhone senza dover reinstallare l'app.
- Design mobile-first: rispetta le safe area dell'iPhone, usa target di tocco grandi, prevede la modalità scura (segue il sistema) e usa tastiere numeriche per i campi peso e ripetizioni.

## Funzioni della prima versione (MVP)

1. **Schede A e B**, ciascuna con 8 esercizi principali più 1-2 esercizi per core/addome e lo stretching finale. Core e stretching sono marcati come **opzionali** ("se c'è tempo").
2. **Sessione di allenamento**: si sceglie A o B e si ritrovano gli esercizi già in ordine. Per ogni serie si registrano:
   - peso (kg) e ripetizioni;
   - **RIR** con pulsanti rapidi: 0 (cedimento), 1, 2, 3+;
   - note facoltative, per serie o per esercizio.
3. **Valori della volta precedente** sempre visibili accanto a ogni serie, ad esempio "ultima volta: 80 × 8 @RIR0". È la funzione più importante.
4. **Timer di recupero** che parte con un tocco dopo aver completato una serie. Il recupero effettivo viene salvato.
   - Limite di iOS: in background il JavaScript si sospende. Il timer va quindi calcolato dai timestamp, non da un contatore, così resta corretto quando si riapre l'app. Il suono a schermo bloccato non è garantito.
5. **Peso corporeo** facoltativo, a inizio sessione.
6. **Giorni di pugilato**: registrazione con un tocco del tipo di seduta (tecnica, sacco velocità, sacco potenza, sparring condizionato, sparring libero).
7. **Storico per esercizio**: le sessioni passate e un grafico semplice dell'1RM stimato (formula di Epley) e del carico massimo.
8. **Record personali**: rilevamento automatico durante la sessione, con un avviso discreto.
9. **Riepilogo settimanale/mensile**: sessioni fatte, volume totale (kg × ripetizioni), serie per gruppo muscolare e giorni di pugilato.
10. **Backup**: esportazione in JSON (backup completo, reimportabile) e CSV (per analisi), più l'importazione del JSON. Su iPhone l'esportazione deve passare dal foglio di condivisione o dal salvataggio in File/iCloud Drive.
11. **Cambio scheda**: la scheda vecchia viene archiviata, non cancellata. Lo storico di un esercizio continua se lo stesso esercizio compare nella scheda nuova.

## Fuori dalla prima versione

- Suggerimenti di progressione, intelligenza artificiale, funzioni social.
- Account, login e sincronizzazione su cloud. Si potranno valutare più avanti, solo con soluzioni gratuite.
- Calcolatore dei dischi.

## Modello dati (indicativo)

- `exercises`: id, nome, gruppo muscolare, tipo (bilanciere, manubri, macchina, corpo libero), note.
- `templates`: id, nome (A/B), elenco ordinato di esercizi con serie e ripetizioni target e flag opzionale, attiva/archiviata, date.
- `sessions`: id, data, template, peso corporeo, note, inizio e fine.
- `sets`: id, sessione, esercizio, numero serie, peso, ripetizioni, RIR, recupero in secondi, nota, timestamp.
- `boxing`: id, data, tipo.

Gli esercizi sono entità indipendenti dalle schede, così lo storico sopravvive ai cambi di scheda.

## Settimana tipo (aggiornata)

La suddivisione reale è un po' diversa da quella scritta sopra in "Cos'è":

- **Lunedì – Pugilato, tecnica**: vuoti con le combinazioni, riprese al sacco con le combinazioni.
- **Martedì – Pugilato, sparring condizionato**: qualche ripresa di sacco per scaldarsi, poi sparring condizionato provando le azioni.
- **Mercoledì – Pugilato, fisico**: ripetute al sacco (10" velocità, 5" potenza…) **oppure** circuito a stazioni (jump squat sul box, colpi con pesetti da 1-2 kg, affondi con kettlebell, palla medica al muro, addominali…).
- **Giovedì – Pesi, Scheda A**.
- **Venerdì – Pugilato, sparring libero**: riscaldamento tra sacco e vuoto, poi sparring libero (più intenso del martedì).
- **Sabato – Pesi, Scheda B**.

Tipi di seduta di pugilato registrabili con un tocco: tecnica, sparring condizionato, sacco (ripetute velocità/potenza), circuito, sparring libero.

## Scheda attuale

Le cifre tra parentesi sono i carichi dell'ultima volta registrata nelle Note (ripetute come primo storico non serve: l'app parte vuota).

### Scheda A – Giovedì

| # | Esercizio | Serie × rip. | Recupero | Ultimo carico |
|---|---|---|---|---|
| 1 | Swing con kettlebell | 4 × 40" lavoro | 20" | 20 kg |
| 2 | Box jump (60 cm) | 5 × 40" lavoro | 20" | corpo libero |
| 3 | Panca piana con manubri | 2 × 8-10 | 2' | 26 kg ×10, 26 kg ×8 |
| 4 | Lat machine presa prona | 2 × 8-10 | 2' | 80 kg ×9, 75 kg ×10 |
| 5 | Pulley row | 2 × 8-10 | 1'30" | 50 kg ×10, ×10 |
| 6 | Military press con manubri | 2 × 8-10 | 2' | 22 kg ×7, 20 kg ×9 |
| 7 | Curl con bilanciere EZ | 2 × 10 | 1' | 10 kg ×10, ×8 |
| 8 | French press al cavo singolo | 2 × 10 | 1' | 18 kg ×10, 14 kg ×10 |

### Scheda B – Sabato

| # | Esercizio | Serie × rip. | Recupero | Ultimo carico |
|---|---|---|---|---|
| 1 | Affondi bulgari | 3 × 6 + 6 (per gamba) | 1'30" | 16 kg |
| 2 | Hip thrust | 3 × 8-10 | 2' | 50 kg per lato |
| 3 | Chest press inclinata (alternata ×3) | 2 × 8-10 | 2' | 22,5 kg ×9, 20 kg ×9 |
| 4 | Trazioni | 2 × max | 2' | ×9, ×6 |
| 5 | Alzate laterali al cavo | 2 × 10-12 | 1' | 14 kg ×10 |
| 6 | Push down al cavo | 2 × 10 | 1' | 45 kg ×10 |
| 7 | Curl su panca a 45° | 2 × 10 | 1' | 12 kg ×10, 10 kg ×7 |

**In entrambe le schede**, opzionali ("se c'è tempo"): **Core** (esercizi che cambiano spesso: si sceglie o si aggiunge l'esercizio sul momento) e **Stretching** finale.

Note sulla scheda:
- **Affondi bulgari 3 × 6 + 6**: 6 ripetizioni con i manubri da 16 kg e subito dopo 6 ripetizioni senza peso, esplosive. Le ripetizioni sono per gamba. Nell'app si registrano peso e ripetizioni col peso; le 6 esplosive sono indicate nella nota dell'esercizio.
- **Swing e box jump** sono a tempo (40" di lavoro, 20" di pausa): nell'app si registrano peso e secondi invece delle ripetizioni.
- **Hip thrust**: il carico si scrive per lato. Manubri: il carico è quello del singolo manubrio.
- Nella scheda A gli esercizi principali sono 8, nella B 7.

## Struttura del codice

- `index.html`, `css/style.css`, `manifest.webmanifest`, `sw.js`, `icons/`.
- `js/main.js` carica i moduli; ogni schermata è in `js/views/` e si registra da sola nel router (`js/router.js`).
- `js/db.js`: IndexedDB e migrazioni (`DB_VERSION`). `js/seed.js`: esercizi e schede iniziali.
- **Ad ogni rilascio va aumentato `VERSION` in `sw.js`**, altrimenti l'iPhone continua a usare i file vecchi.

## Pubblicazione

- Repository: `github.com/DomenicoSellitto/diario-pesi` (pubblico, contiene solo il codice). App: **https://domenicosellitto.github.io/diario-pesi/** (GitHub Pages dal ramo `main`, cartella radice).
- Per pubblicare basta `git push`: Pages si aggiorna da solo in circa un minuto.
- Sul Mac sono collegati due account GitHub: **monaci-dev** (lavoro, deve restare quello attivo) e **DomenicoSellitto** (personale). Questo repository usa sempre l'account personale grazie a un credential helper impostato solo in `.git/config` (`gh auth token --user DomenicoSellitto`). Non cambiare l'account attivo di `gh` e non toccare la configurazione globale di git.
- Email dei commit (solo in questo repository): l'indirizzo noreply di GitHub, così l'email personale non diventa pubblica.

## Modo di lavorare

- Procedi per passi piccoli e verificabili. Dopo ogni passo spiega all'utente cosa può provare sull'iPhone.
- Fai un commit per ogni funzione, con messaggi in italiano.
- Prima di ogni modifica al formato dei dati, prevedi una migrazione che non perda i dati già salvati.
