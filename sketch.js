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

// Load CSV file in preload phase
function preload() {
    // Loading the CSV table with headers (assuming file is in the project folder)
    // NOTE: Replace 'volcanoes-2025-10-27 - Es.3 - Original Data.csv' with your actual file path/name.
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
    // Further reduction if necessary
    MAP_WIDTH = min(MAP_WIDTH, availableWidthForMap);
    MAP_HEIGHT = MAP_WIDTH / 2;

    const maxWidthFromHeight = (AVAILABLE_HEIGHT) * 2;
    MAP_WIDTH = min(MAP_WIDTH, maxWidthFromHeight);
    MAP_HEIGHT = MAP_WIDTH / 2;

    // Glyph scale based on final map height
    GLYPH_SIZE = constrain(round(MAP_HEIGHT / 120), 6, 20);
    
    // Create p5.js canvas and initial configuration
    createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    angleMode(DEGREES);
    noLoop(); // Draw only on request (for hover/click)
    
    // Process CSV data
    for (let i = 0; i < table.getRowCount(); i++) {
        const row = table.getRow(i);
        const lat = parseFloat(row.getString('Latitude'));
        const lon = parseFloat(row.getString('Longitude'));
        const elevationStr = row.getString('Elevation (m)');
        const type = row.getString('TypeCategory').trim(); 
        
        let elevation = parseFloat(elevationStr);
        // Skip rows with missing or invalid data
        if (isNaN(lat) || isNaN(lon) || type === '' || isNaN(elevation)) continue;

        // Push volcano object to the array
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
        
        // Update min/max elevation and geographic limits
        if (elevation > maxElevation) maxElevation = elevation;
        if (elevation < minElevation) minElevation = elevation;
        if (lat > maxLat) maxLat = lat;
        if (lat < minLat) minLat = lat;
        if (lon > maxLon) maxLon = lon;
        if (lon < minLon) minLon = lon;
    }

    // Fallback checks for geographic limits
    if (!isFinite(minLat) || !isFinite(maxLat)) { minLat = -60; maxLat = 60; }
    if (!isFinite(minLon) || !isFinite(maxLon)) { minLon = -180; maxLon = 180; }
    if (maxLat - minLat < 1) { minLat -= 1; maxLat += 1; }
    if (maxLon - minLon < 1) { minLon -= 1; maxLon += 1; }

    // Initialize type -> glyph map and filter options
    initializeGlyphMap();
    const uniqueTypes = [...new Set(volcanoes.map(v => v.type))].sort();
    filterOptions = ['All Types', ...uniqueTypes];
}

// Initializes the mapping of volcano types to the 9 glyph indices
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

// X linear projection internal to the map
function projectX(lon) {
    const left = MAP_INNER_MARGIN;
    const right = MAP_WIDTH - MAP_INNER_MARGIN;
    let minL = minLon;
    let maxL = maxLon;
    if (abs(maxL - minL) < 1e-6) { minL -= 1; maxL += 1; }
    // Linear mapping longitude -> local X coordinate within the map
    return map(lon, minL, maxL, left, right);
}

// Y linear projection internal to the map (inverted: higher lat -> lower Y)
function projectY(lat) {
    const top = MAP_INNER_MARGIN;
    const bottom = MAP_HEIGHT - MAP_INNER_MARGIN;
    let minL = minLat;
    let maxL = maxLat;
    if (abs(maxL - minL) < 1e-6) { minL -= 1; maxL += 1; }
    // Linear mapping latitude -> local Y coordinate within the map (inverted)
    return map(lat, minL, maxL, bottom, top);
}

// Drawing function for the 9 glyphs
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
        case 8: // Submarine: triangle with wave
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
        default: // Fallback: simple circle
            ellipse(0, 0, s * 0.6, s * 0.6);
            break;
    }
    pop();
}

// Returns an interpolated color based on elevation
function getColorForElevation(elevation) {
    let normalizedElevation = map(elevation, minElevation, maxElevation, 0, 1);
    let lowColor = color(COLOR_LOW);
    let highColor = color(COLOR_HIGH);
    return lerpColor(lowColor, highColor, normalizedElevation);
}

// Main drawing function: legend, filter, map, info panel
function draw() {
    background('#121212'); 

    // 1. MAP POSITION CALCULATION (Y)
    const AVAILABLE_Y_START = LEGEND_HEIGHT + OUTER_MARGIN + LEGEND_GUTTER;
    const AVAILABLE_Y_END = CANVAS_HEIGHT - OUTER_MARGIN;
    const MAP_TOTAL_H = MAP_HEIGHT + INNER_PAD * 2 + 20; 
    const MAP_Y_OFFSET = AVAILABLE_Y_START + (AVAILABLE_Y_END - AVAILABLE_Y_START - MAP_TOTAL_H) / 2;

    // 2. DRAW LEGEND (TOP)
    drawLegend(OUTER_MARGIN, OUTER_MARGIN, CANVAS_WIDTH - 2 * OUTER_MARGIN, LEGEND_HEIGHT - 2 * OUTER_MARGIN);

    // 3. DRAW FILTER PANEL (LEFT SIDEBAR)
    const filterPanelX = OUTER_MARGIN;
    const filterPanelY = MAP_Y_OFFSET;
    const filterPanelW = SIDEBAR_WIDTH - 4; 
    const filterPanelH = MAP_HEIGHT + INNER_PAD * 2 + 20; 
    drawFilterPanel(filterPanelX, filterPanelY, filterPanelW, filterPanelH);

    // 4. MAP POSITION CALCULATION (X) AND DRAWING
    const availableWidthForMap = CANVAS_WIDTH - SIDEBAR_WIDTH - INFO_WIDTH - 2 * OUTER_MARGIN - INNER_PAD;
    const mapXStart = OUTER_MARGIN + SIDEBAR_WIDTH + INNER_PAD + max(0, (availableWidthForMap - MAP_WIDTH) / 2);
    
    push();
    translate(mapXStart, MAP_Y_OFFSET);

    // External title above the map
    fill('#FFF');
    noStroke();
    textSize(18);
    textAlign(LEFT, BOTTOM);
    textStyle(BOLD);
    const titleY = -8;
    text("Distribuzione Globale dei Vulcani (Proiezione lineare)", 0, titleY);
    
    // Map background (black area)
    fill('#000000'); 
    rect(0, 0, MAP_WIDTH, MAP_HEIGHT); 

    // Map border
    noFill();
    stroke('#333333');
    strokeWeight(1);
    rect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    
    // Drawing volcanoes and checking for mouse hover
    let hovered = null; 
    let hoveredLocal = null; 

    // Iterate over all volcanoes
    volcanoes.forEach(v => {
        // FILTERING: skip drawing if the type is not the active filter
        if (activeTypeFilter !== 'All Types' && v.type !== activeTypeFilter) {
            return; 
        }

        const xLocal = projectX(v.lon);
        const yLocal = projectY(v.lat);
        const xGlobal = mapXStart + xLocal;
        const yGlobal = MAP_Y_OFFSET + yLocal;

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
    if (hoveredLocal) {
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
    }

    // Function to draw crosshair and rotated labels
    (function drawCrosshairAndLabels() {
        const mx = mouseX - mapXStart;
        const my = mouseY - MAP_Y_OFFSET;
        // Check if the mouse is over the map area
        const overMap = mouseX >= mapXStart && mouseX <= mapXStart + MAP_WIDTH && mouseY >= MAP_Y_OFFSET && mouseY <= MAP_Y_OFFSET + MAP_HEIGHT;

        if (!overMap) return;

        // Constrain coordinates within the map
        const mxLocal = constrain(mx, 0, MAP_WIDTH);
        const myLocal = constrain(my, 0, MAP_HEIGHT);

        // Draw crosshair lines
        push();
        stroke('#888888');
        strokeWeight(1);
        line(mxLocal, 0, mxLocal, MAP_HEIGHT); // Vertical
        line(0, myLocal, MAP_WIDTH, myLocal); // Horizontal
        pop();

        // Calculate lon/lat (inverse projection)
        const left = MAP_INNER_MARGIN;
        const right = MAP_WIDTH - MAP_INNER_MARGIN;
        const top = MAP_INNER_MARGIN;
        const bottom = MAP_HEIGHT - MAP_INNER_MARGIN;
        const lonVal = map(mxLocal, left, right, minLon, maxLon);
        const latVal = map(myLocal, bottom, top, minLat, maxLat);

        const labelW = 110;
        const labelH = 20;

        // LONGITUDE LABEL (Bottom, horizontal)
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

        // LATITUDE LABEL (Left, ROTATED)
        // X position of the rotated box center to be flush with the map edge (X=0)
        const latLabelX = - (labelH / 2 + 2); 
        
        push();
        // 1. Translate origin to the center of the label position (along the horizontal line myLocal)
        translate(latLabelX, myLocal);
        // 2. Rotate the coordinate system 90 degrees clockwise
        rotate(90);
        
        rectMode(CENTER);
        
        // 3. Draw background (the rectangle is rotated, so it's vertical)
        fill('#0A0A0A');
        stroke('#222');
        rect(0, 0, labelW, labelH, 4); 
        
        // 4. Draw rotated text
        noStroke();
        fill('#FFFFFF');
        textSize(12);
        textAlign(CENTER, CENTER);
        text(`Lat: ${nf(latVal, 0, 4)}°`, 0, 0); 
        
        pop(); // Restore coordinate system
    })();
    
    pop(); 
    
    // 5. DRAW INFORMATION PANEL (RIGHT)
    const infoX = mapXStart + MAP_WIDTH + 16;
    const infoY = MAP_Y_OFFSET;
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
        }
    }

    pop();
}

// Draw the filter control panel (SIDEBAR)
function drawFilterPanel(x, y, w, h) {
    push();
    translate(x, y);

    // Filter panel background
    fill('#1E1E1E');
    rect(0, 0, w, h, 6);

    // Title
    fill('#FFF');
    textSize(16);
    textStyle(BOLD);
    textAlign(LEFT, TOP);
    text("Filtra per Tipo", PANEL_PAD, 10);

    const startY = 36;
    const itemH = 32;
    const textX = PANEL_PAD + 26; // Space for glyph
    
    textSize(12);
    textStyle(NORMAL);
    
    // Draw filter options
    filterOptions.forEach((type, index) => {
        const itemY = startY + index * itemH;
        
        // Check if the mouse is over the element
        const isHover = mouseX >= x && mouseX <= x + w && mouseY >= y + itemY && mouseY <= y + itemY + itemH;
        
        // Option background
        if (type === activeTypeFilter) {
            fill('#444444'); // Color for active filter
            rect(0, itemY, w, itemH, 4);
        } else if (isHover) {
            fill('#292929'); // Color for hover
            rect(0, itemY, w, itemH, 4);
        } else {
             fill('#1E1E1E'); // Normal background
             rect(0, itemY, w, itemH);
        }
        
        // Text for the volcano type
        fill(type === activeTypeFilter ? '#FFD700' : '#FFFFFF'); // Highlight active text
        textAlign(LEFT, CENTER);
        const displayName = type === 'All Types' ? 'Tutti i Tipi' : type;
        text(displayName, textX, itemY + itemH / 2);
        
        // Draw the glyph only if it's not 'All Types'
        if (type !== 'All Types') {
            const glyphIndex = glyphMap[type];
            push();
            fill(type === activeTypeFilter ? '#FFD700' : '#FFFFFF'); // Active glyph color
            noStroke();
            drawGlyph(PANEL_PAD + 10, itemY + itemH / 2, glyphIndex, GLYPH_SIZE * 0.6);
            pop();
        } else {
             // Icon for "All Types" (e.g., a square)
            push();
            fill(type === activeTypeFilter ? '#FFD700' : '#FFFFFF');
            noStroke();
            rectMode(CENTER);
            rect(PANEL_PAD + 10, itemY + itemH / 2, GLYPH_SIZE * 0.6, GLYPH_SIZE * 0.6, 2);
            pop();
        }
    });

    pop();
}

// Draw legend: elevation colors and typological glyphs
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

    // Color section (elevation) with gradient bar
    textSize(14);
    textStyle(NORMAL);
    fill('#FFF');
    text("Colore (Elevazione):", cursorX, cursorY);
    cursorY += 18;

    const BAR_W = min(240, width / 2 - 40); 
    const BAR_H = 14;
    for (let i = 0; i < BAR_W; i++) {
        let inter = map(i, 0, BAR_W, 0, 1);
        let c = lerpColor(color(COLOR_LOW), color(COLOR_HIGH), inter);
        stroke(c);
        line(cursorX + i, cursorY + BAR_H, cursorX + i, cursorY);
    }
    noStroke();

    // Min/max elevation labels
    fill('#FFF');
    textSize(10);
    textAlign(LEFT, TOP);
    text(`${minElevation} m (Basso)`, cursorX, cursorY + BAR_H + 8);
    textAlign(RIGHT, TOP);
    text(`${maxElevation} m (Alto)`, cursorX + BAR_W, cursorY + BAR_H + 8);

    // Advance cursor for glyph section
    cursorX += BAR_W + 30;
    cursorY = 32;

    // Glyph section (typology)
    textSize(14);
    textAlign(LEFT, TOP);
    fill('#FFF');
    text("Glifi (Tipologia):", cursorX, cursorY);
    cursorY += 18;

    const uniqueTypes = Object.keys(glyphMap).sort();
    const COLUMNS = 3;
    const ITEM_H = 28; 
    const ITEM_W = max(110, (width - cursorX - PANEL_PAD) / COLUMNS); 

    // Draw glyphs
    uniqueTypes.forEach((type, index) => {
        const col = index % COLUMNS;
        const row = floor(index / COLUMNS);

        const gx = cursorX + col * ITEM_W;
        const gy = cursorY + row * ITEM_H;

        push();
        fill('#FFF');
        noStroke();
        drawGlyph(gx + 8, gy + 8, glyphMap[type], GLYPH_SIZE * 0.8);
        pop();

        fill('#FFF');
        textSize(12);
        textAlign(LEFT, CENTER);
        text(type, gx + 22, gy + 8);
    });

    pop();
}

// Handles mouse click for the filter
function mousePressed() {
    const filterPanelX = OUTER_MARGIN;
    const filterPanelY = MAP_Y_OFFSET;
    const filterPanelW = SIDEBAR_WIDTH - 4;
    const filterPanelH = MAP_HEIGHT + INNER_PAD * 2 + 20;

    // Check if the click is within the filter panel area
    if (mouseX >= filterPanelX && mouseX <= filterPanelX + filterPanelW &&
        mouseY >= filterPanelY && mouseY <= filterPanelY + filterPanelH) {
        
        // Y position relative to the content area
        const clickY = mouseY - filterPanelY;
        const startY = 36;
        const itemH = 32;

        // Check which filter element was clicked
        for (let index = 0; index < filterOptions.length; index++) {
            const type = filterOptions[index];
            const itemY = startY + index * itemH;

            if (clickY >= itemY && clickY <= itemY + itemH) {
                // Update the active filter and redraw
                activeTypeFilter = type;
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