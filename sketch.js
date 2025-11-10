let table; // Dati CSV dei vulcani (oggetto loadTable)
let volcanoes = []; // Array contenente gli oggetti vulcano processati
let glyphMap = {}; // Mappa tipo -> indice glifo
let minElevation = Infinity; // Valore minimo elevazione trovato nei dati
let maxElevation = -Infinity; // Valore massimo elevazione trovato nei dati
let minLat = Infinity; // Limite minimo latitudine calcolato dai dati
let maxLat = -Infinity; // Limite massimo latitudine calcolato dai dati
let minLon = Infinity; // Limite minimo longitudine calcolato dai dati
let maxLon = -Infinity; // Limite massimo longitudine calcolato dai dati

// Colori per l'interpolazione dell'elevazione (basso -> alto)
const COLOR_LOW = '#4EA699';
const COLOR_HIGH = '#3E000C';

// Parametri di layout e dimensioni del canvas/mappa
const LEGEND_HEIGHT = 90; // Altezza riservata alla legenda superiore
const OUTER_MARGIN = 12; // Margine esterno attorno al canvas
const INNER_PAD = 8; // Padding interno per etichette nella mappa

// Dimensione base del glifo, ridotta per visualizzazione compatta
let GLYPH_SIZE = 6;

// Larghezze riservate per colonne e pannelli
const SIDEBAR_WIDTH = 60; // Spazio a sinistra riservato (eventuale)
const LEGEND_GUTTER = 24; // Gap tra legenda e contenuto della mappa per evitare sovrapposizioni
const INFO_WIDTH = 320; // Larghezza pannello informazioni a destra

// Variabili per dimensione canvas e mappa calcolate dinamicamente
let CANVAS_WIDTH;
let CANVAS_HEIGHT;
let MAP_WIDTH;
let MAP_HEIGHT;
let MAP_INNER_MARGIN = 20; // Margine interno usato per proiezione lineare dentro la mappa

// Caricamento file CSV nella fase di preload
function preload() {
    // Caricamento tabella CSV con intestazioni (assunto file presente nella cartella di progetto)
    table = loadTable('volcanoes-2025-10-27 - Es.3 - Original Data.csv', 'csv', 'header');
}

// Inizializzazione e calcolo dimensioni
function setup() {
    // Assegnazione dimensione canvas in base alla finestra del browser
    CANVAS_WIDTH = windowWidth;
    CANVAS_HEIGHT = windowHeight;
    
    // Altezza disponibile per la mappa, escludendo legenda, margini e gutter
    const AVAILABLE_HEIGHT = CANVAS_HEIGHT - LEGEND_HEIGHT - 2 * OUTER_MARGIN - LEGEND_GUTTER;
    
    // Altezza massima della mappa rispettando padding interno
    const MAX_MAP_H = max(60, AVAILABLE_HEIGHT - (INNER_PAD * 2) - 20);
    // Larghezza disponibile per la mappa, riservando spazio per il pannello info a destra
    const availableWidthForMap = max(200, CANVAS_WIDTH - SIDEBAR_WIDTH - INFO_WIDTH - 2 * OUTER_MARGIN - INNER_PAD);

    // Calcolo dimensione mappa preferita rispettando rapporto W/H = 2:1 e vincoli verticali
    MAP_WIDTH = min(availableWidthForMap, MAX_MAP_H * 2);
    MAP_HEIGHT = min(MAP_WIDTH / 2, MAX_MAP_H);
    // Riduzione ulteriore se necessario per rispettare lo spazio già calcolato
    MAP_WIDTH = min(MAP_WIDTH, availableWidthForMap);
    MAP_HEIGHT = MAP_WIDTH / 2;

    // Se spazio verticale aggiuntivo è disponibile, limitare la larghezza conseguentemente
    const maxWidthFromHeight = (AVAILABLE_HEIGHT) * 2;
    MAP_WIDTH = min(MAP_WIDTH, maxWidthFromHeight);
    MAP_HEIGHT = MAP_WIDTH / 2;

    // Scala dei glifi basata sull'altezza finale della mappa (valori limitati)
    GLYPH_SIZE = constrain(round(MAP_HEIGHT / 120), 6, 20);
    
    // Creazione canvas p5.js e configurazione iniziale
    createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    angleMode(DEGREES);
    noLoop(); // Disegno su richiesta per migliorare le prestazioni
    
    // Processamento righe CSV per costruire l'array volcanoes e aggiornare i limiti
    for (let i = 0; i < table.getRowCount(); i++) {
        const row = table.getRow(i);
        const lat = parseFloat(row.getString('Latitude'));
        const lon = parseFloat(row.getString('Longitude'));
        const elevationStr = row.getString('Elevation (m)');
        const type = row.getString('TypeCategory').trim(); 
        
        let elevation = parseFloat(elevationStr);
        // Saltare righe con dati geografici mancanti o tipo vuoto
        if (isNaN(lat) || isNaN(lon) || type === '' || isNaN(elevation)) continue;

        // Inserimento oggetto vulcano nell'array con campi rilevanti
        volcanoes.push({
            name: row.getString('Volcano Name'),
            country: row.getString('Country'),
            location: row.getString('Location'),
            lat: lat,
            lon: lon,
            elevation: elevation,
            type: type,
            status: row.getString('Status')
        });
        
        // Aggiornamento min/max elevation
        if (elevation > maxElevation) maxElevation = elevation;
        if (elevation < minElevation) minElevation = elevation;

        // Aggiornamento limiti geografici min/max lat/lon
        if (lat > maxLat) maxLat = lat;
        if (lat < minLat) minLat = lat;
        if (lon > maxLon) maxLon = lon;
        if (lon < minLon) minLon = lon;
    }

    // Controlli di fallback per limiti geografici se dati mancanti o non validi
    if (!isFinite(minLat) || !isFinite(maxLat)) { minLat = -60; maxLat = 60; }
    if (!isFinite(minLon) || !isFinite(maxLon)) { minLon = -180; maxLon = 180; }

    // Espansione minima del range geografico per evitare compressioni estreme
    if (maxLat - minLat < 1) { minLat -= 1; maxLat += 1; }
    if (maxLon - minLon < 1) { minLon -= 1; maxLon += 1; }

    // Inizializzazione mappa tipo -> glifo
    initializeGlyphMap();
}

// Inizializza la mappatura dei tipi di vulcano agli indici dei 9 glifi definiti
function initializeGlyphMap() {
    const uniqueTypes = [...new Set(volcanoes.map(v => v.type))].sort();
    let fallbackIndex = 4; // Indice predefinito per "others" se non viene trovata corrispondenza

    // Funzione che restituisce indice glifo per una stringa tipo (controlli keyword)
    function idxForType(type) {
        const t = type.toLowerCase();
        if (t.includes('caldera')) return 0; // Cerchio -> caldera
        if (t.includes('cone') || t.includes('cinder')) return 1; // Triangolo -> cone
        if (t.includes('crater system') || t.includes('crater')) return 2; // Segmento orizzontale -> crater system
        if (t.includes('maar') || t.includes('maars')) return 3; // Stella 4 punte -> maars
        if (t.includes('other') || t.includes('unknown') || t.includes('others')) return 4; // Rombo -> others
        if (t.includes('shield')) return 5; // Shield -> ellisse esistente
        if (t.includes('stratov') || t.includes('strato') || t.includes('composite')) return 6; // Stratovulcano -> tre rettangoli
        if (t.includes('subglacial')) return 7; // Subglacial -> quadrato
        if (t.includes('submarine') || t.includes('seamount')) return 8; // Submarine -> triangolo+onda
        // Fallback: restituire indice "others"
        return fallbackIndex;
    }

    // Assegnazione indice a ciascun tipo unico trovato nei dati
    uniqueTypes.forEach(type => {
        glyphMap[type] = idxForType(type);
    });
}

// Proiezione X lineare interna alla mappa, con margini interni
function projectX(lon) {
    const left = MAP_INNER_MARGIN;
    const right = MAP_WIDTH - MAP_INNER_MARGIN;
    let minL = minLon;
    let maxL = maxLon;
    if (abs(maxL - minL) < 1e-6) { minL -= 1; maxL += 1; }
    // Mappatura lineare longitudine -> coordinata X locale alla mappa
    return map(lon, minL, maxL, left, right);
}

// Proiezione Y lineare interna alla mappa, con inverso Y (latitudine verso alto)
function projectY(lat) {
    const top = MAP_INNER_MARGIN;
    const bottom = MAP_HEIGHT - MAP_INNER_MARGIN;
    let minL = minLat;
    let maxL = maxLat;
    if (abs(maxL - minL) < 1e-6) { minL -= 1; maxL += 1; }
    // Mappatura lineare latitudine -> coordinata Y locale alla mappa (invertita)
    return map(lat, minL, maxL, bottom, top);
}

// Funzione di disegno dei 9 glifi; il colore fill viene impostato dal chiamante
function drawGlyph(x, y, glyphIndex, s) {
    push();
    translate(x, y);
    rectMode(CENTER);
    noStroke();

    // Switch che disegna la forma corrispondente all'indice del glifo
    switch (glyphIndex) {
        case 0: // Caldera: cerchio pieno senza cerchio interno
            ellipse(0, 0, s * 1.0, s * 1.0);
            break;

        case 1: // Cone: triangolo appuntito
            triangle(-s*0.9, s*0.8, s*0.9, s*0.8, 0, -s*1.1);
            break;

        case 2: // Crater System: tre segmenti orizzontali a gradini
            for (let i = 0; i < 3; i++) {
                const w = s * (1.0 - i * 0.20);
                const h = s * 0.12;
                rect(0, -s*0.28 + i * (h + 1.5), w, h, 3);
            }
            break;

        case 3: // Maars: stella a quattro punte ottenuta da rettangoli ruotati
            push();
            rotate(45);
            rect(0, 0, s * 0.18, s * 0.8, 2);
            pop();
            rect(0, 0, s * 0.18, s * 0.8, 2);
            push();
            rotate(90);
            rect(0, 0, s * 0.14, s * 0.6, 2);
            pop();
            break;

        case 4: // Others: rombo
            push();
            rotate(45);
            rect(0, 0, s * 0.6, s * 0.6);
            pop();
            break;

        case 5: // Shield: ellisse ampia (forma mantenuta)
            ellipse(0, s*0.06, s * 1.2, s * 0.5);
            break;

        case 6: // Stratovolcano: tre rettangoli sovrapposti simulano i livelli
            fill(getColorForElevation((minElevation + maxElevation) / 3));
            rect(0, s*0.35, s * 0.9, s * 0.18, 2);
            fill(getColorForElevation((minElevation + maxElevation) / 2));
            rect(0, s*0.05, s * 0.65, s * 0.18, 2);
            fill(getColorForElevation((minElevation + maxElevation) * 0.85));
            rect(0, -s*0.18, s * 0.35, s * 0.18, 2);
            break;

        case 7: // Subglacial: quadrato semplice
            rect(0, 0, s * 0.9, s * 0.9);
            break;

        case 8: // Submarine: triangolo con singola onda sottostante
            triangle(-s*0.8, s*0.5, s*0.8, s*0.5, 0, -s*0.8);
            stroke(lerpColor(color(COLOR_LOW), color(COLOR_HIGH), 0.25));
            strokeWeight(max(1, s * 0.06));
            noFill();
            beginShape();
            vertex(-s*0.7, s*0.65);
            quadraticVertex(0, s*0.55, s*0.7, s*0.65);
            endShape();
            noStroke();
            break;

        default: // Fallback: cerchio semplice
            ellipse(0, 0, s * 0.6, s * 0.6);
            break;
    }

    pop();
}

// Restituisce un colore interpolato tra COLOR_LOW e COLOR_HIGH in base all'elevazione
function getColorForElevation(elevation) {
    let normalizedElevation = map(elevation, minElevation, maxElevation, 0, 1);
    let lowColor = color(COLOR_LOW);
    let highColor = color(COLOR_HIGH);
    return lerpColor(lowColor, highColor, normalizedElevation);
}

// Disegno della griglia parallela e meridiani con etichette
function drawGrid(mapW, mapH) {
    const latInterval = 30; 
    const lonInterval = 60; 

    // Stile delle linee della griglia
    stroke('#555555');
    strokeWeight(1);
    noFill();
    textSize(10);
    
    // Disegno paralleli (linee orizzontali) usando projectY lineare
    for (let lat = Math.ceil(minLat / latInterval) * latInterval; lat <= Math.floor(maxLat / latInterval) * latInterval; lat += latInterval) { 
        const y = projectY(lat); 
        line(0, y, mapW, y);
        
        // Etichetta latitudine posizionata a sinistra della mappa (uso del padding)
        fill('#FFF');
        textAlign(RIGHT, CENTER);
        text(`${lat}°`, -INNER_PAD, y); 
    }

    // Disegno meridiani (linee verticali) usando projectX lineare
    for (let lon = Math.ceil(minLon / lonInterval) * lonInterval; lon <= Math.floor(maxLon / lonInterval) * lonInterval; lon += lonInterval) {
        const x = projectX(lon);
        line(x, 0, x, mapH);
        
        // Etichetta longitudine posizionata sotto la mappa
        fill('#FFF');
        textAlign(CENTER, TOP);
        text(`${lon}°`, x, mapH + INNER_PAD);
    }
    
    noStroke();
}

// Funzione principale di disegno; layout: legenda, mappa, pannello info
function draw() {
    // Colore sfondo generale
    background('#2A2D34'); 

    // Disegno della legenda nella parte alta della pagina
    drawLegend(OUTER_MARGIN, OUTER_MARGIN, CANVAS_WIDTH - 2 * OUTER_MARGIN, LEGEND_HEIGHT - 2 * OUTER_MARGIN);

    // Calcolo verticale e posizionamento della mappa sotto la legenda con gutter di separazione
    const AVAILABLE_Y_START = LEGEND_HEIGHT + OUTER_MARGIN + LEGEND_GUTTER;
    const AVAILABLE_Y_END = CANVAS_HEIGHT - OUTER_MARGIN;
    const MAP_TOTAL_H = MAP_HEIGHT + INNER_PAD * 2 + 20; // Altezza totale con etichette
    const MAP_Y_OFFSET = AVAILABLE_Y_START + (AVAILABLE_Y_END - AVAILABLE_Y_START - MAP_TOTAL_H) / 2;

    // Calcolo orizzontale per centrare la mappa nello spazio disponibile a destra della sidebar
    const availableWidthForMap = CANVAS_WIDTH - SIDEBAR_WIDTH - INFO_WIDTH - 2 * OUTER_MARGIN - INNER_PAD;
    const mapXStart = OUTER_MARGIN + SIDEBAR_WIDTH + INNER_PAD + max(0, (availableWidthForMap - MAP_WIDTH) / 2);
    push();
    translate(mapXStart, MAP_Y_OFFSET);

    // Titolo esterno sopra la mappa, posizionato poco sotto la legenda per evitare sovrapposizioni
    fill('#FFF');
    noStroke();
    textSize(18);
    textAlign(LEFT, BOTTOM);
    textStyle(BOLD);
    const titleY = -8;
    text("Distribuzione Globale dei Vulcani (Proiezione lineare)", 0, titleY);
    
    // Sfondo rettangolare della mappa (area nera)
    fill('#000000'); 
    rect(0, 0, MAP_WIDTH, MAP_HEIGHT); 

    // Disegno griglia e bordo della mappa
    drawGrid(MAP_WIDTH, MAP_HEIGHT);
    noFill();
    stroke('#888');
    strokeWeight(1);
    rect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    
    // Disegno dei vulcani e rilevamento hover del mouse
    let hovered = null; // Oggetto con informazioni globali del vulcano in hover
    let hoveredLocal = null; // Coordinate locali e indice glifo per il vulcano in hover

    // Iterazione su tutti i vulcani per disegno e controllo distanza mouse
    volcanoes.forEach(v => {
        const xLocal = projectX(v.lon);
        const yLocal = projectY(v.lat);
        const xGlobal = mapXStart + xLocal;
        const yGlobal = MAP_Y_OFFSET + yLocal;

        // Calcolo distanza tra posizione mouse e posizione globale del glifo
        const d = dist(mouseX, mouseY, xGlobal, yGlobal);
        // Raggio di hit leggermente generoso per facilitare l'hover
        const hitR = max(8, GLYPH_SIZE * 1.2);
        if (d < hitR) {
            hovered = { v: v, x: xGlobal, y: yGlobal };
            hoveredLocal = { v: v, xLocal: xLocal, yLocal: yLocal, glyphIndex: glyphMap[v.type] };
        }

        // Disegno del glifo nella dimensione normale con colore in base all'elevazione
        fill(getColorForElevation(v.elevation)); 
        stroke('#000'); 
        strokeWeight(0.5);
        const glyphIndex = glyphMap[v.type];
        drawGlyph(xLocal, yLocal, glyphIndex, GLYPH_SIZE);
    });

    // Se un vulcano è in hover, ridisegnarlo in primo piano più grande e con colore più vivido
    if (hoveredLocal) {
        const v = hoveredLocal.v;
        const glowSize = GLYPH_SIZE * 1.8;
        // Colore base interpolato in base all'elevazione
        const baseColor = getColorForElevation(v.elevation);
        // Aumento della vividezza tramite interpolazione verso il bianco
        const brightColor = lerpColor(baseColor, color('#FFFFFF'), 0.55);

        // Disegno del glifo ingrandito direttamente in primo piano con il colore più vivido
        push();
        fill(brightColor);
        stroke('#FFFFFF');
        strokeWeight(1);
        drawGlyph(hoveredLocal.xLocal, hoveredLocal.yLocal, hoveredLocal.glyphIndex, glowSize);
        pop();
    }
    
    pop(); 
    
    // Pannello informazioni a destra che mostra i dettagli del vulcano in hover
    const infoX = mapXStart + MAP_WIDTH + 16;
    const infoY = MAP_Y_OFFSET;
    const infoW = INFO_WIDTH - 32;
    const infoH = MAP_HEIGHT;

    // Disegno dello sfondo del pannello informazioni
    push();
    translate(infoX, infoY);
    noStroke();
    fill('#0F1720');
    rect(0, 0, INFO_WIDTH - 16, MAP_HEIGHT, 6);

    // Titolo del pannello informazioni
    fill('#FFF');
    textSize(16);
    textStyle(BOLD);
    textAlign(LEFT, TOP);
    text("Dettagli Vulcano", 12, 10);

    // Contenuto del pannello: se hover presente mostra i dettagli, altrimenti messaggio
    textSize(13);
    textStyle(NORMAL);
    fill('#DDDDDD');
    const lineH = 18;
    let cursorY = 36;
    if (hovered) {
        const info = hovered.v;
        textAlign(LEFT, TOP);
        text(`Name: ${info.name}`, 12, cursorY); cursorY += lineH;
        text(`Country: ${info.country || '—'}`, 12, cursorY); cursorY += lineH;
        text(`Location: ${info.location || '—'}`, 12, cursorY); cursorY += lineH;
        text(`Lat: ${nf(info.lat, 0, 4)}`, 12, cursorY); cursorY += lineH;
        text(`Lon: ${nf(info.lon, 0, 4)}`, 12, cursorY); cursorY += lineH;
        text(`Elevation: ${info.elevation} m`, 12, cursorY); cursorY += lineH;
        text(`Type: ${info.type}`, 12, cursorY); cursorY += lineH;
        text(`Status: ${info.status || '—'}`, 12, cursorY); cursorY += lineH;
        // Evidenziazione sulla mappa rimossa su richiesta (nessun cerchio)
    } else {
        fill('#AAAAAA');
        textAlign(CENTER, TOP);
        text("Passa il mouse su un vulcano\nper vedere i dettagli", (INFO_WIDTH - 16) / 2, 36);
    }

    pop();
}

// Disegno della legenda: colori elevazione e glifi tipologici
function drawLegend(xOffset, yOffset, width, height) {
    push();
    translate(xOffset, yOffset);
    
    // Titolo della legenda
    fill('#FFF');
    textSize(18);
    textStyle(BOLD);
    textAlign(LEFT);
    text("Legenda", 0, 15);

    // Sezione legenda colore (elevazione)
    let colorLegendX = 5;
    let colorLegendY = 30;

    textSize(14);
    text("Colore (Elevazione):", colorLegendX, colorLegendY);
    colorLegendY += 5;

    // Barra di sfumatura orizzontale per rappresentare interpolazione colore elevazione
    const BAR_W = 200;
    const BAR_H = 15;

    for (let i = 0; i < BAR_W; i++) {
        let inter = map(i, 0, BAR_W, 0, 1);
        let c = lerpColor(color(COLOR_LOW), color(COLOR_HIGH), inter); 
        stroke(c);
        line(colorLegendX + i, colorLegendY + BAR_H, colorLegendX + i, colorLegendY);
    }

    // Etichette min/max elevazione sulla barra
    noStroke();
    fill('#FFF');
    textSize(10);
    textStyle(NORMAL);
    textAlign(LEFT);
    text(`${minElevation} m (Basso)`, colorLegendX, colorLegendY + BAR_H + 12);
    textAlign(RIGHT);
    text(`${maxElevation} m (Alto)`, colorLegendX + BAR_W, colorLegendY + BAR_H + 12);

    // Sezione legenda glifi: disegno di esempio per ciascun tipo presente nella mappa
    let glyphLegendX = colorLegendX + BAR_W + 50;
    let glyphLegendY = 30;

    textSize(14);
    textAlign(LEFT);
    text("Glifi (Tipologia):", glyphLegendX, glyphLegendY);
    glyphLegendY += 10;
    
    const uniqueTypes = Object.keys(glyphMap).sort();
    const COLUMNS = 3;
    const ITEM_SPACING = 150;
    const ROW_SPACING = 30;

    // Iterazione e disegno di ciascun glifo nella legenda con etichetta testuale
    uniqueTypes.forEach((type, index) => {
        const col = index % COLUMNS;
        const row = floor(index / COLUMNS);
        
        const currentX = glyphLegendX + col * ITEM_SPACING;
        const currentY = glyphLegendY + row * ROW_SPACING;
        
        const glyphIndex = glyphMap[type];
        
        // Disegno del glifo in legenda (bianco per contrasto)
        push();
        fill('#FFF'); 
        noStroke();
        drawGlyph(currentX + GLYPH_SIZE/2, currentY + GLYPH_SIZE/2, glyphIndex, GLYPH_SIZE * 0.8); 
        pop();
        
        // Testo descrittivo del tipo
        fill('#FFF');
        textSize(12);
        textAlign(LEFT, CENTER);
        text(type, currentX + GLYPH_SIZE + 5, currentY + GLYPH_SIZE/2);
    });
    
    pop();
}

// Gestione ridimensionamento finestra: ricalcolo dimensioni e ridisegno
function windowResized() {
    CANVAS_WIDTH = windowWidth;
    CANVAS_HEIGHT = windowHeight;
    
    const AVAILABLE_HEIGHT = CANVAS_HEIGHT - LEGEND_HEIGHT - 2 * OUTER_MARGIN - LEGEND_GUTTER;
    const MAX_MAP_H = max(60, AVAILABLE_HEIGHT - (INNER_PAD * 2) - 20);
    const availableWidthForMap = max(200, CANVAS_WIDTH - SIDEBAR_WIDTH - INFO_WIDTH - 2 * OUTER_MARGIN - INNER_PAD);
    MAP_WIDTH = min(availableWidthForMap, MAX_MAP_H * 2);
    MAP_HEIGHT = min(MAP_WIDTH / 2, MAX_MAP_H);
    const maxWidthFromHeight = (AVAILABLE_HEIGHT) * 2;
    MAP_WIDTH = min(MAP_WIDTH, maxWidthFromHeight);
    MAP_HEIGHT = MAP_WIDTH / 2;
    GLYPH_SIZE = constrain(round(MAP_HEIGHT / 120), 6, 20);
    
    resizeCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    redraw(); 
}

// Funzioni che causano ridisegno su movimento/drag del mouse (noLoop è ancora attivo)
function mouseMoved() {
    redraw();
}

function mouseDragged() {
    redraw();
}