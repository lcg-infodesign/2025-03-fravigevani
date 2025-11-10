// Dati CSV dei vulcani (oggetto loadTable)
let table; 
// Array contenente gli oggetti vulcano processati
let volcanoes = []; 
// Mappa tipo -> indice glifo
let glyphMap = {}; 
// Valore minimo elevazione trovato nei dati
let minElevation = Infinity; 
// Valore massimo elevazione trovato nei dati
let maxElevation = -Infinity; 
// Limite minimo latitudine calcolato dai dati
let minLat = Infinity; 
// Limite massimo latitudine calcolato dai dati
let maxLat = -Infinity; 
// Limite minimo longitudine calcolato dai dati
let minLon = Infinity; 
// Limite massimo longitudine calcolato dai dati
let maxLon = -Infinity; 

// Variabili per il filtro interattivo 
let activeTypeFilter = 'All Types'; 
// Lista ordinata dei tipi di vulcano per l'interfaccia utente
let filterOptions = []; 

// Colori per l'interpolazione dell'elevazione (basso -> alto)
const COLOR_LOW = '#66CCFF'; // Light Blue
const COLOR_HIGH = '#FF6666'; // Coral Red

// Parametri di layout e dimensioni del canvas/mappa
const LEGEND_HEIGHT = 90; 
const OUTER_MARGIN = 12; 
const INNER_PAD = 8; 

// Base glyph size
let GLYPH_SIZE = 6;

// Widths reserved for panels
const SIDEBAR_WIDTH = 180; // Width of the Filter panel on the left
const LEGEND_GUTTER = 24; 
const INFO_WIDTH = 320; // Width of the information panel on the right

const PANEL_PAD = 12; // Uniform internal padding for panels

// Dynamic canvas and map dimensions
let CANVAS_WIDTH;
let CANVAS_HEIGHT;
let MAP_WIDTH;
let MAP_HEIGHT;
let MAP_INNER_MARGIN = 20; // Internal margin used for linear projection within the map

// Variabili globali per la posizione della mappa calcolate in draw() e usate in mousePressed()
let mapYOffset = 0; 
let mapXStart = 0; 

// Load CSV file in preload phase
function preload() {
    // Loading the CSV table with headers (assuming file is in the project folder)
    table = loadTable('volcanoes-2025-10-27 - Es.3 - Original Data.csv', 'csv', 'header');
}

// Initialization and dimension calculation
function setup() {
    // Assign canvas dimensions based on window size
    CANVAS_WIDTH = windowWidth;
    CANVAS_HEIGHT = windowHeight;
    
    // Available height for the map
    const AVAILABLE_HEIGHT = CANVAS_HEIGHT - LEGEND_HEIGHT - 2 * OUTER_MARGIN - LEGEND_GUTTER;
    
    // Max map height respecting internal padding
    const MAX_MAP_H = max(60, AVAILABLE_HEIGHT - (INNER_PAD * 2) - 20);
    // Available width for the map, reserving space for sidebar, info panel, and margins
    const availableWidthForMap = max(200, CANVAS_WIDTH - SIDEBAR_WIDTH - INFO_WIDTH - 2 * OUTER_MARGIN - INNER_PAD);

    // Calculate map dimensions respecting aspect ratio 2:1 and vertical constraints
    MAP_WIDTH = min(availableWidthForMap, MAX_MAP_H * 2);
    MAP_HEIGHT = min(MAP_WIDTH / 2, MAX_MAP_H);
    
    const maxWidthFromHeight = (AVAILABLE_HEIGHT) * 2;
    MAP_WIDTH = min(MAP_WIDTH, maxWidthFromHeight);
    MAP_HEIGHT = MAP_WIDTH / 2;

    // Glyph scale based on final map height
    GLYPH_SIZE = constrain(round(MAP_HEIGHT / 120), 6, 20);
    
    // Create p5.js canvas and initial configuration
    createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    angleMode(DEGREES);
    noLoop(); 
    
    // Process CSV data (unchanged)
    for (let i = 0; i < table.getRowCount(); i++) {
        const row = table.getRow(i);
        const lat = parseFloat(row.getString('Latitude'));
        const lon = parseFloat(row.getString('Longitude'));
        const elevationStr = row.getString('Elevation (m)');
        const type = row.getString('TypeCategory').trim(); 
        
        let elevation = parseFloat(elevationStr);
        if (isNaN(lat) || isNaN(lon) || type === '' || isNaN(elevation)) continue;

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
        
        if (elevation > maxElevation) maxElevation = elevation;
        if (elevation < minElevation) minElevation = elevation;
        if (lat > maxLat) maxLat = lat;
        if (lat < minLat) minLat = lat;
        if (lon > maxLon) maxLon = lon;
        if (lon < minLon) minLon = lon;
    }

    // Fallback checks (unchanged)
    if (!isFinite(minLat) || !isFinite(maxLat)) { minLat = -60; maxLat = 60; }
    if (!isFinite(minLon) || !isFinite(maxLon)) { minLon = -180; maxLon = 180; }
    if (maxLat - minLat < 1) { minLat -= 1; maxLat += 1; }
    if (maxLon - minLon < 1) { minLon -= 1; maxLon += 1; }

    initializeGlyphMap();
    const uniqueTypes = [...new Set(volcanoes.map(v => v.type))].sort();
    filterOptions = ['All Types', ...uniqueTypes];
}

// Initializes the mapping of volcano types to the 9 glyph indices (unchanged)
function initializeGlyphMap() {
    const uniqueTypes = [...new Set(volcanoes.map(v => v.type))].sort();
    const fallbackIndex = 4; // Diamond for 'others'

    function idxForType(type) {
        const t = type.toLowerCase();
        if (t.includes('caldera')) return 0; // Circle
        if (t.includes('cone') || t.includes('cinder')) return 1; // Triangle
        if (t.includes('crater system') || t.includes('crater')) return 2; // Horizontal segment
        if (t.includes('maar') || t.includes('maars')) return 3; // 4-point star
        if (t.includes('other') || t.includes('unknown') || t.includes('others')) return 4; // Diamond
        if (t.includes('shield')) return 5; // Wide ellipse
        if (t.includes('stratov') || t.includes('strato') || t.includes('composite')) return 6; // Three rectangles
        if (t.includes('subglacial')) return 7; // Square
        if (t.includes('submarine') || t.includes('seamount')) return 8; // Triangle+wave
        return fallbackIndex;
    }

    // Assign index to each unique type found in the data
    uniqueTypes.forEach(type => {
        glyphMap[type] = idxForType(type);
    });
}

// X linear projection internal to the map (unchanged)
function projectX(lon) {
    const left = MAP_INNER_MARGIN;
    const right = MAP_WIDTH - MAP_INNER_MARGIN;
    let minL = minLon;
    let maxL = maxLon;
    if (abs(maxL - minL) < 1e-6) { minL -= 1; maxL += 1; }
    return map(lon, minL, maxL, left, right);
}

// Y linear projection internal to the map (inverted: higher lat -> lower Y) (unchanged)
function projectY(lat) {
    const top = MAP_INNER_MARGIN;
    const bottom = MAP_HEIGHT - MAP_INNER_MARGIN;
    let minL = minLat;
    let maxL = maxLat;
    if (abs(maxL - minL) < 1e-6) { minL -= 1; maxL += 1; }
    return map(lat, minL, maxL, bottom, top);
}

// Drawing function for the 9 glyphs (unchanged)
function drawGlyph(x, y, glyphIndex, s) {
    push();
    translate(x, y);
    rectMode(CENTER);
    noStroke();

    switch (glyphIndex) {
        case 0: // Caldera: circle
            ellipse(0, 0, s * 1.0, s * 1.0);
            break;
        case 1: // Cone: triangle
            triangle(-s*0.9, s*0.8, s*0.9, s*0.8, 0, -s*1.1);
            break;
        case 2: // Crater System: three horizontal stepped segments
            for (let i = 0; i < 3; i++) {
                const w = s * (1.0 - i * 0.20);
                const h = s * 0.12;
                rect(0, -s*0.28 + i * (h + 1.5), w, h, 3);
            }
            break;
        case 3: // Maars: four-point star
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
        case 4: // Others: diamond
            push();
            rotate(45);
            rect(0, 0, s * 0.6, s * 0.6);
            pop();
            break;
        case 5: // Shield: wide ellipse
            ellipse(0, s*0.06, s * 1.2, s * 0.5);
            break;
        case 6: // Stratovolcano: three stacked rectangles
            fill(getColorForElevation(minElevation + (maxElevation - minElevation) * 0.33));
            rect(0, s*0.35, s * 0.9, s * 0.18, 2);
            fill(getColorForElevation(minElevation + (maxElevation - minElevation) * 0.66));
            rect(0, s*0.05, s * 0.65, s * 0.18, 2);
            fill(getColorForElevation(maxElevation * 0.9));
            rect(0, -s*0.18, s * 0.35, s * 0.18, 2);
            break;
        case 7: // Subglacial: square
            rect(0, 0, s * 0.9, s * 0.9);
            break;
case 8: // Submarine: triangle with wave (MODIFICATO: onda sopra il triangolo invertito)
case 8: // Submarine: triangle with wave (MODIFICATO: onda sopra la punta del triangolo verso l'alto)
            // Triangolo originale (punta in alto)
            triangle(-s*0.8, s*0.5, s*0.8, s*0.5, 0, -s*0.8);
            
            // Disegna l'onda sopra la punta
            stroke(lerpColor(color(COLOR_LOW), color(COLOR_HIGH), 0.25));
            strokeWeight(max(1, s * 0.06));
            noFill();
            
            push(); // Isola la trasformazione dell'onda
            translate(0, -s*1.0); // Sposta l'onda più in alto, sopra la punta
            
            beginShape();
            // Punti di inizio e fine dell'onda, centrati sulla punta
            vertex(-s*0.4, 0); 
            // Punto di controllo (il vertice dell'onda)
            quadraticVertex(0, -s*0.2, s*0.4, 0); 
            endShape();
            pop(); 
            
            noStroke();
            break;
        default: // Fallback: simple circle
            ellipse(0, 0, s * 0.6, s * 0.6);
            break;
    }
    pop();
}

// Returns an interpolated color based on elevation (unchanged)
function getColorForElevation(elevation) {
    let normalizedElevation = map(elevation, minElevation, maxElevation, 0, 1);
    let lowColor = color(COLOR_LOW);
    let highColor = color(COLOR_HIGH);
    return lerpColor(lowColor, highColor, normalizedElevation);
}

// Draw the type filter panel (MODIFICATA: aggiunge il glifo)
function drawFilterPanel(x, y, w, h) {
    push();
    translate(x, y);
    noStroke();
    fill('#1E1E1E');
    rect(0, 0, w, h, 6);

    fill('#FFF');
    textSize(16);
    textStyle(BOLD);
    textAlign(LEFT, TOP);
    text("Filtro per Tipo", PANEL_PAD, 10);

    const startY = 36;
    const itemH = 32;
    // Dimensione ridotta del glifo nel pannello filtro
    const glyphPanelSize = 10; 
    const glyphX = PANEL_PAD + 10; // Posizione X del glifo
    const textX = glyphX + glyphPanelSize + 6; // Posizione X del testo, spostato a destra

    for (let i = 0; i < filterOptions.length; i++) {
        const type = filterOptions[i];
        const itemY = startY + i * itemH;
        const isSelected = type === activeTypeFilter;
        const centerGlyphY = itemY + itemH / 2;

        // Draw selection background
        if (isSelected) {
            fill('#333333');
            rect(PANEL_PAD / 2, itemY, w - PANEL_PAD, itemH, 4);
        }

        // Draw GLYPH for the specific type
        if (type !== 'All Types') {
            const glyphIndex = glyphMap[type];
            // Usa un colore neutro per il glifo nel pannello filtro (bianco)
            fill('#FFFFFF'); 
            stroke('#121212');
            strokeWeight(0.5);
            drawGlyph(glyphX, centerGlyphY, glyphIndex, glyphPanelSize);
        } else {
            // Per l'opzione "All Types" disegna un piccolo cerchio come placeholder
            fill('#AAAAAA');
            ellipse(glyphX, centerGlyphY, 6, 6);
        }

        // Draw text
        fill(isSelected ? '#FFFFFF' : '#AAAAAA');
        textSize(12); // Dimensione testo leggermente ridotta
        textStyle(isSelected ? BOLD : NORMAL);
        textAlign(LEFT, CENTER);
        text(type, textX, centerGlyphY);
    }
    pop();
}

// Main drawing function: legend, filter, map, info panel
function draw() {
    background('#121212'); 

    // 1. CALCOLO POSIZIONE (Y)
    const AVAILABLE_Y_START = LEGEND_HEIGHT + OUTER_MARGIN + LEGEND_GUTTER;
    const AVAILABLE_Y_END = CANVAS_HEIGHT - OUTER_MARGIN;
    const MAP_TOTAL_H = MAP_HEIGHT + INNER_PAD * 2 + 20; 
    mapYOffset = AVAILABLE_Y_START + (AVAILABLE_Y_END - AVAILABLE_Y_START - MAP_TOTAL_H) / 2; 

    // 2. DRAW LEGEND (TOP)
    drawLegend(OUTER_MARGIN, OUTER_MARGIN, CANVAS_WIDTH - 2 * OUTER_MARGIN, LEGEND_HEIGHT - 2 * OUTER_MARGIN);

    // 3. DRAW FILTER PANEL (LEFT SIDEBAR)
    const filterPanelX = OUTER_MARGIN;
    const filterPanelY = mapYOffset;
    const filterPanelW = SIDEBAR_WIDTH - 4; 
    const filterPanelH = MAP_HEIGHT + INNER_PAD * 2 + 20; 
    drawFilterPanel(filterPanelX, filterPanelY, filterPanelW, filterPanelH);

    // 4. CALCOLO POSIZIONE (X) E DISEGNO MAPPA
    const availableWidthForMap = CANVAS_WIDTH - SIDEBAR_WIDTH - INFO_WIDTH - 2 * OUTER_MARGIN - INNER_PAD;
    mapXStart = OUTER_MARGIN + SIDEBAR_WIDTH + INNER_PAD + max(0, (availableWidthForMap - MAP_WIDTH) / 2);
    
    push();
    translate(mapXStart, mapYOffset);

    // External title above the map (unchanged)
    fill('#FFF');
    noStroke();
    textSize(18);
    textAlign(LEFT, BOTTOM);
    textStyle(BOLD);
    const titleY = -8;
    text("Distribuzione Globale dei Vulcani (Proiezione lineare)", 0, titleY);
    
    // Map background (unchanged)
    fill('#000000'); 
    rect(0, 0, MAP_WIDTH, MAP_HEIGHT); 

    // Map border (unchanged)
    noFill();
    stroke('#333333');
    strokeWeight(1);
    rect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    
    // Drawing volcanoes and checking for mouse hover (unchanged logic)
    let hovered = null; 
    let hoveredLocal = null; 

    volcanoes.forEach(v => {
        // FILTRO: Disegna solo se il filtro è 'All Types' O se il tipo corrisponde.
        if (activeTypeFilter !== 'All Types' && v.type !== activeTypeFilter) {
            return; 
        }

        const xLocal = projectX(v.lon);
        const yLocal = projectY(v.lat);
        const xGlobal = mapXStart + xLocal;
        const yGlobal = mapYOffset + yLocal;

        // Distance calculation for hover
        const d = dist(mouseX, mouseY, xGlobal, yGlobal);
        const hitR = max(8, GLYPH_SIZE * 1.2);
        
        if (d < hitR) {
            hovered = { v: v, x: xGlobal, y: yGlobal };
            hoveredLocal = { v: v, xLocal: xLocal, yLocal: yLocal, glyphIndex: glyphMap[v.type] };
        }

        // Draw the glyph
        fill(getColorForElevation(v.elevation)); 
        stroke('#121212'); 
        strokeWeight(0.5);
        const glyphIndex = glyphMap[v.type];
        drawGlyph(xLocal, yLocal, glyphIndex, GLYPH_SIZE);
    });

    // If a volcano is hovered, redraw it in the foreground, larger
    if (hoveredLocal && (activeTypeFilter === 'All Types' || hoveredLocal.v.type === activeTypeFilter)) {
        const v = hoveredLocal.v;
        const glowSize = GLYPH_SIZE * 1.8;
        const baseColor = getColorForElevation(v.elevation);
        const brightColor = lerpColor(baseColor, color('#FFFFFF'), 0.55);

        push();
        fill(brightColor);
        stroke('#FFFFFF');
        strokeWeight(1.5);
        drawGlyph(hoveredLocal.xLocal, hoveredLocal.yLocal, hoveredLocal.glyphIndex, glowSize);
        pop();
    } else {
        hovered = null; 
    }

    // Function to draw crosshair and rotated labels (unchanged)
    (function drawCrosshairAndLabels() {
        const mx = mouseX - mapXStart;
        const my = mouseY - mapYOffset;
        const overMap = mouseX >= mapXStart && mouseX <= mapXStart + MAP_WIDTH && mouseY >= mapYOffset && mouseY <= mapYOffset + MAP_HEIGHT;

        if (!overMap) return;

        const mxLocal = constrain(mx, 0, MAP_WIDTH);
        const myLocal = constrain(my, 0, MAP_HEIGHT);

        push();
        stroke('#888888');
        strokeWeight(1);
        line(mxLocal, 0, mxLocal, MAP_HEIGHT); 
        line(0, myLocal, MAP_WIDTH, myLocal); 
        pop();

        const left = MAP_INNER_MARGIN;
        const right = MAP_WIDTH - MAP_INNER_MARGIN;
        const top = MAP_INNER_MARGIN;
        const bottom = MAP_HEIGHT - MAP_INNER_MARGIN;
        const lonVal = map(mxLocal, left, right, minLon, maxLon);
        const latVal = map(myLocal, bottom, top, minLat, maxLat);

        const labelW = 110;
        const labelH = 20;

        // LONGITUDE LABEL
        push();
        rectMode(CENTER);
        fill('#0A0A0A');
        stroke('#222');
        rect(mxLocal, MAP_HEIGHT + 12, labelW, labelH, 4);
        noStroke();
        fill('#FFFFFF');
        textSize(12);
        textAlign(CENTER, CENTER);
        text(`Lon: ${nf(lonVal, 0, 4)}°`, mxLocal, MAP_HEIGHT + 12);
        pop();

        // LATITUDE LABEL 
        const latLabelX = - (labelH / 2 + 2); 
        
        push();
        translate(latLabelX, myLocal);
        rotate(90);
        
        rectMode(CENTER);
        fill('#0A0A0A');
        stroke('#222');
        rect(0, 0, labelW, labelH, 4); 
        
        noStroke();
        fill('#FFFFFF');
        textSize(12);
        textAlign(CENTER, CENTER);
        text(`Lat: ${nf(latVal, 0, 4)}°`, 0, 0); 
        
        pop(); 
    })();
    
    pop(); 
    
    // 5. DRAW INFORMATION PANEL (RIGHT) (unchanged logic)
    const infoX = mapXStart + MAP_WIDTH + 16;
    const infoY = mapYOffset;
    const panelW = INFO_WIDTH - 16;
    const panelH = MAP_HEIGHT + INNER_PAD * 2 + 20; 

    push();
    translate(infoX, infoY);
    noStroke();
    fill('#1E1E1E');
    rect(0, 0, panelW, panelH, 6);

    fill('#FFF');
    textSize(16);
    textStyle(BOLD);
    textAlign(LEFT, TOP);
    text("Dettagli Vulcano", PANEL_PAD, 10);

    const fields = [
        { key: 'name', label: 'Nome', index: '1' },
        { key: 'country', label: 'Nazione', index: '2' },
        { key: 'location', label: 'Località', index: '3' },
        { key: 'lat', label: 'Latitudine', index: '4' },
        { key: 'lon', label: 'Longitudine', index: '5' },
        { key: 'elevation', label: 'Elevazione', index: '6' },
        { key: 'type', label: 'Tipo', index: '7' },
        { key: 'status', label: 'Stato', index: '8' }
    ];

    const startY = 36;
    const availableH = panelH - startY - PANEL_PAD;
    const gap = 8;
    const boxH = Math.max(28, (availableH - gap * (fields.length - 1)) / fields.length);
    const boxX = PANEL_PAD;
    const boxW = panelW - PANEL_PAD * 2;

    textSize(12);
    textStyle(NORMAL);
    for (let i = 0; i < fields.length; i++) {
        const f = fields[i];
        const y = startY + i * (boxH + gap);

        push();
        stroke('#333333');
        strokeWeight(1);
        fill('#0A0A0A');
        rect(boxX, y, boxW, boxH, 6);
        pop();

        fill('#AAAAAA');
        textSize(11);
        textAlign(LEFT, TOP);
        text(f.label, boxX + 8, y + 6);

        if (hovered) {
            const info = hovered.v;
            let value = info[f.key];
            if (f.key === 'lat' || f.key === 'lon') {
                value = typeof value === 'number' ? nf(value, 0, 4) : (value || '—');
            } else if (f.key === 'elevation') {
                value = (value !== undefined && value !== null) ? `${value} m` : '—';
            } else {
                value = value || '—';
            }

            fill('#FFFFFF');
            textSize(13);
            textStyle(BOLD);
            textAlign(LEFT, TOP);
            text(value, boxX + 8, y + 6 + 14);
            textStyle(NORMAL);
        } else {
             fill('#FFFFFF');
             textSize(13);
             textStyle(BOLD);
             textAlign(LEFT, TOP);
             text('—', boxX + 8, y + 6 + 14);
             textStyle(NORMAL);
        }
    }

    pop();
}

// Draw legend: elevation colors (unchanged)
function drawLegend(xOffset, yOffset, width, height) {
    push();
    translate(xOffset + PANEL_PAD, yOffset);
    
    // Title
    fill('#FFF');
    textSize(18);
    textStyle(BOLD);
    textAlign(LEFT);
    text("Legenda", 0, 15);

    let cursorX = 0;
    let cursorY = 32;

    // Sezione Colore (Elevazione) con barra del gradiente estesa
    textSize(14);
    textStyle(NORMAL);
    fill('#FFF');
    text("Colore (Elevazione):", cursorX, cursorY);
    cursorY += 18;

    // Estende la barra del gradiente fino quasi alla fine della legenda (come richiesto)
    const BAR_W = width - (cursorX + 2 * PANEL_PAD); 
    const BAR_H = 14;
    for (let i = 0; i < BAR_W; i++) {
        let inter = map(i, 0, BAR_W, 0, 1);
        let c = lerpColor(color(COLOR_LOW), color(COLOR_HIGH), inter);
        stroke(c);
        line(cursorX + i, cursorY + BAR_H, cursorX + i, cursorY);
    }
    noStroke();

    // Etichette Min/Max Elevazione
    fill('#FFF');
    textSize(10);
    textAlign(LEFT, TOP);
    text(`${nf(minElevation, 0, 0)} m (Basso)`, cursorX, cursorY + BAR_H + 8);
    textAlign(RIGHT, TOP);
    text(`${nf(maxElevation, 0, 0)} m (Alto)`, cursorX + BAR_W, cursorY + BAR_H + 8);

    pop();
}

function mousePressed() {
    // Il calcolo delle coordinate si basa sulle variabili globali aggiornate in draw()
    const filterPanelX = OUTER_MARGIN;
    const filterPanelY = mapYOffset; 
    const filterPanelW = SIDEBAR_WIDTH - 4;
    const filterPanelH = MAP_HEIGHT + INNER_PAD * 2 + 20;

    // 1. Controlla se il click è avvenuto nel pannello filtro
    if (mouseX >= filterPanelX && mouseX <= filterPanelX + filterPanelW &&
        mouseY >= filterPanelY && mouseY <= filterPanelY + filterPanelH) {
        
        const clickY = mouseY - filterPanelY;
        const startY = 36;
        const itemH = 32;

        // 2. Trova quale opzione è stata cliccata
        for (let index = 0; index < filterOptions.length; index++) {
            const type = filterOptions[index];
            const itemY = startY + index * itemH;

            if (clickY >= itemY && clickY < itemY + itemH) { 
                // 3. AGGIORNA il filtro attivo
                activeTypeFilter = type;
                // 4. RICHIAMA DRAW
                redraw(); 
                return; 
            }
        }
    }
}

// Functions that trigger redraw on mouse movement/drag
function mouseMoved() {
    redraw();
}

function mouseDragged() {
    redraw();
}

// Window resize handling: recalculate dimensions and redraw
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