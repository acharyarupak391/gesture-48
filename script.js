// Game constants
const CELL_SIZE = 110;
const GAP = 14;
const PADDING = 14;

// Game State
let grid = [];
let score = 0;
let bestScore = parseInt(localStorage.getItem('best2048') || '0');
let gameOver = false;

// Hand tracking state
let currentHandPos = { x: 0, y: 0 };
let constrainedCursorPos = { x: 0, y: 0 };
let swipeStartPos = null;
let swipeStartTime = null;
let isHandDetected = false;
let isPinching = false;
let wasPinching = false; // Track previous pinch state
let isCursorInsideGame = false;
let isControlModeActive = false;
let controlModeLocked = false; // Lock after move until pinch released
let lastMoveTime = 0;
let currentPinchDistance = 1;
const PINCH_THRESHOLD = 0.08; // Distance threshold for pinch detection
const SWIPE_THRESHOLD = 80;
const SWIPE_TIME_LIMIT = 700;
const MOVE_COOLDOWN = 300;

// Game boundary (will be calculated)
let gameBounds = { left: 0, top: 0, right: 0, bottom: 0 };

// DOM Elements
const gameGrid = document.getElementById('gameGrid');
const gameContainer = document.getElementById('gameContainer');
const scoreElement = document.getElementById('score');
const bestScoreElement = document.getElementById('bestScore');
const cursor = document.getElementById('cursor');
const skeletonCanvas = document.getElementById('skeletonCanvas');
const skeletonCtx = skeletonCanvas.getContext('2d');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const loadingOverlay = document.getElementById('loadingOverlay');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const directionArrow = document.getElementById('directionArrow');
const pinchIndicator = document.getElementById('pinchIndicator');
const pinchStatus = document.getElementById('pinchStatus');
const pinchDistanceBar = document.getElementById('pinchDistanceBar');
const gestureIndicator = document.getElementById('gestureIndicator');

// Cursor bounding box expansion (pixels)
const BOUNDS_PADDING = 80;

// Check if user has seen the guide before
function checkGuidePreference() {
    const hasSeenGuide = localStorage.getItem('2048GuideShown');
    if (hasSeenGuide === 'true') {
        guideModal.classList.remove('show');
    } else {
        guideModal.classList.add('show');
    }
}

// Handle guide OK button
guideOkBtn.addEventListener('click', () => {
    localStorage.setItem('2048GuideShown', 'true');
    guideModal.classList.remove('show');
});

// Calculate game bounds with expanded area for cursor
function updateGameBounds() {
    const rect = gameContainer.getBoundingClientRect();
    gameBounds = {
        left: rect.left - BOUNDS_PADDING,
        top: rect.top - BOUNDS_PADDING,
        right: rect.right + BOUNDS_PADDING,
        bottom: rect.bottom + BOUNDS_PADDING,
        // Store original bounds for constraining cursor inside visible area
        innerLeft: rect.left,
        innerTop: rect.top,
        innerRight: rect.right,
        innerBottom: rect.bottom
    };
}

// Check if position is inside game bounds
function isInsideGameBounds(x, y) {
    return x >= gameBounds.left && x <= gameBounds.right &&
        y >= gameBounds.top && y <= gameBounds.bottom;
}

// Constrain cursor position to expanded game bounds
function constrainToGameBounds(x, y) {
    return {
        x: Math.max(gameBounds.left + 25, Math.min(gameBounds.right - 25, x)),
        y: Math.max(gameBounds.top + 25, Math.min(gameBounds.bottom - 25, y))
    };
}

// Check if position is inside inner game container (for visual feedback)
function isInsideInnerBounds(x, y) {
    return x >= gameBounds.innerLeft && x <= gameBounds.innerRight &&
        y >= gameBounds.innerTop && y <= gameBounds.innerBottom;
}

// Initialize the grid cells
function initializeGrid() {
    gameGrid.innerHTML = '';
    for (let i = 0; i < 16; i++) {
        const cell = document.createElement('div');
        cell.className = 'grid-cell';
        cell.dataset.index = i;
        gameGrid.appendChild(cell);
    }
}

// Initialize game
function initGame() {
    grid = Array(4).fill(null).map(() => Array(4).fill(0));
    score = 0;
    gameOver = false;
    updateScore();
    addRandomTile();
    addRandomTile();
    renderGrid();
    gameOverOverlay.classList.remove('show');

    // Update game bounds after render
    setTimeout(updateGameBounds, 100);
}

// Add random tile (2 or 4)
function addRandomTile() {
    const emptyCells = [];
    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
            if (grid[r][c] === 0) {
                emptyCells.push({ r, c });
            }
        }
    }
    if (emptyCells.length > 0) {
        const { r, c } = emptyCells[Math.floor(Math.random() * emptyCells.length)];
        grid[r][c] = Math.random() < 0.9 ? 2 : 4;
        return { r, c, value: grid[r][c] };
    }
    return null;
}

// Render the grid with animations
function renderGrid(newTile = null) {
    // Clear existing tiles
    document.querySelectorAll('.tile').forEach(t => t.remove());

    // Create tiles
    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
            if (grid[r][c] !== 0) {
                createTile(r, c, grid[r][c], newTile && newTile.r === r && newTile.c === c);
            }
        }
    }
}

// Create a tile element
function createTile(row, col, value, isNew = false) {
    const tile = document.createElement('div');
    tile.className = `tile tile-${value}`;
    tile.textContent = value;

    tile.style.left = `${PADDING + col * (CELL_SIZE + GAP)}px`;
    tile.style.top = `${PADDING + row * (CELL_SIZE + GAP)}px`;

    gameGrid.appendChild(tile);

    if (isNew) {
        gsap.fromTo(tile,
            { scale: 0, opacity: 0 },
            { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(1.7)" }
        );
    }
}

// Move tiles with animation
function moveTiles(direction) {
    if (gameOver || Date.now() - lastMoveTime < MOVE_COOLDOWN) return false;

    const oldGrid = grid.map(row => [...row]);
    let moved = false;

    // Process movement based on direction
    if (direction === 'left') {
        for (let r = 0; r < 4; r++) {
            const row = grid[r].filter(v => v !== 0);
            for (let i = 0; i < row.length - 1; i++) {
                if (row[i] === row[i + 1]) {
                    row[i] *= 2;
                    score += row[i];
                    row.splice(i + 1, 1);
                }
            }
            while (row.length < 4) row.push(0);
            grid[r] = row;
        }
    } else if (direction === 'right') {
        for (let r = 0; r < 4; r++) {
            const row = grid[r].filter(v => v !== 0);
            for (let i = row.length - 1; i > 0; i--) {
                if (row[i] === row[i - 1]) {
                    row[i] *= 2;
                    score += row[i];
                    row.splice(i - 1, 1);
                    i--;
                }
            }
            while (row.length < 4) row.unshift(0);
            grid[r] = row;
        }
    } else if (direction === 'up') {
        for (let c = 0; c < 4; c++) {
            let col = [];
            for (let r = 0; r < 4; r++) col.push(grid[r][c]);
            col = col.filter(v => v !== 0);
            for (let i = 0; i < col.length - 1; i++) {
                if (col[i] === col[i + 1]) {
                    col[i] *= 2;
                    score += col[i];
                    col.splice(i + 1, 1);
                }
            }
            while (col.length < 4) col.push(0);
            for (let r = 0; r < 4; r++) grid[r][c] = col[r];
        }
    } else if (direction === 'down') {
        for (let c = 0; c < 4; c++) {
            let col = [];
            for (let r = 0; r < 4; r++) col.push(grid[r][c]);
            col = col.filter(v => v !== 0);
            for (let i = col.length - 1; i > 0; i--) {
                if (col[i] === col[i - 1]) {
                    col[i] *= 2;
                    score += col[i];
                    col.splice(i - 1, 1);
                    i--;
                }
            }
            while (col.length < 4) col.unshift(0);
            for (let r = 0; r < 4; r++) grid[r][c] = col[r];
        }
    }

    // Check if grid changed
    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
            if (oldGrid[r][c] !== grid[r][c]) moved = true;
        }
    }

    if (moved) {
        lastMoveTime = Date.now();
        showDirectionFeedback(direction);

        // Lock control mode - require re-pinch
        controlModeLocked = true;
        isControlModeActive = false;

        // Add moving class to cursor
        cursor.classList.add('moving');
        setTimeout(() => cursor.classList.remove('moving'), 250);

        // Animate existing tiles
        const tiles = document.querySelectorAll('.tile');
        gsap.to(tiles, {
            duration: 0.15,
            ease: "power2.out",
            onComplete: () => {
                updateScore();
                const newTile = addRandomTile();
                renderGrid(newTile);
                checkGameOver();
            }
        });
    }

    return moved;
}

// Show direction feedback
function showDirectionFeedback(direction) {
    const arrows = { up: '↑', down: '↓', left: '←', right: '→' };
    directionArrow.textContent = arrows[direction];
    directionArrow.style.left = '50%';
    directionArrow.style.top = '50%';
    directionArrow.style.transform = 'translate(-50%, -50%)';

    gsap.fromTo(directionArrow,
        { opacity: 1, scale: 1 },
        { opacity: 0, scale: 3, duration: 0.7, ease: "power2.out" }
    );
}

// Update score display
function updateScore() {
    scoreElement.textContent = score;
    if (score > bestScore) {
        bestScore = score;
        localStorage.setItem('best2048', bestScore);
    }
    bestScoreElement.textContent = bestScore;
}

// Check if game is over
function checkGameOver() {
    // Check for empty cells
    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
            if (grid[r][c] === 0) return false;
        }
    }

    // Check for possible merges
    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
            if (c < 3 && grid[r][c] === grid[r][c + 1]) return false;
            if (r < 3 && grid[r][c] === grid[r + 1][c]) return false;
        }
    }

    gameOver = true;
    document.getElementById('finalScore').textContent = score;
    gameOverOverlay.classList.add('show');
    return true;
}

// Detect pinch gesture (thumb tip close to index finger tip)
function detectPinch(landmarks) {
    // Thumb tip is landmark 4
    // Index finger tip is landmark 8
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];

    // Calculate distance between thumb and index finger tips
    const dx = thumbTip.x - indexTip.x;
    const dy = thumbTip.y - indexTip.y;
    const dz = (thumbTip.z || 0) - (indexTip.z || 0);
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    currentPinchDistance = distance;

    return distance < PINCH_THRESHOLD;
}

// Hand tracking setup
async function setupHandTracking() {
    const video = document.getElementById('videoInput');

    const hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.75,
        minTrackingConfidence: 0.6
    });

    hands.onResults(onHandResults);

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480 }
        });
        video.srcObject = stream;
        video.play();

        async function processFrame() {
            if (video.readyState >= 2) {
                await hands.send({ image: video });
            }
            requestAnimationFrame(processFrame);
        }

        video.onloadeddata = () => {
            loadingOverlay.style.display = 'none';
            updateGameBounds();
            processFrame();
        };
    } catch (err) {
        console.error('Camera access error:', err);
        loadingOverlay.innerHTML = `
                    <p class="text-white text-xl">Camera access denied</p>
                    <p class="text-white/50 text-sm mt-2">You can still play with arrow keys!</p>
                    <button onclick="loadingOverlay.style.display='none'" class="mt-6 px-8 py-3 bg-purple-500 text-white rounded-lg cursor-pointer text-lg">Continue</button>
                `;
    }
}

// Process hand tracking results
function onHandResults(results) {
    // Clear skeleton canvas
    skeletonCtx.clearRect(0, 0, 220, 165);

    // Update game bounds on each frame (in case of resize)
    updateGameBounds();

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        isHandDetected = true;

        const landmarks = results.multiHandLandmarks[0];

        // Store previous pinch state
        wasPinching = isPinching;

        // Detect pinch gesture
        isPinching = detectPinch(landmarks);

        // If pinch was released, unlock control mode
        if (wasPinching && !isPinching) {
            controlModeLocked = false;
        }

        // Get palm center position
        const wrist = landmarks[0];
        const middleMcp = landmarks[9];
        const palmX = (wrist.x + middleMcp.x) / 2;
        const palmY = (wrist.y + middleMcp.y) / 2;

        // Map to screen coordinates (mirror the x-axis)
        const screenX = (1 - palmX) * window.innerWidth;
        const screenY = palmY * window.innerHeight;

        currentHandPos = { x: screenX, y: screenY };

        // Check if cursor is inside expanded game bounds (for cursor visibility)
        const isInExpandedBounds = isInsideGameBounds(screenX, screenY);

        // Check if cursor is inside inner game bounds (for control mode activation)
        const isInInnerBounds = isInsideInnerBounds(screenX, screenY);
        isCursorInsideGame = isInInnerBounds;

        // Control mode is active when: pinch AND cursor inside inner game bounds AND not locked
        isControlModeActive = isPinching && isInInnerBounds && !controlModeLocked;

        // Show cursor when inside expanded bounds
        if (isInExpandedBounds) {
            // Constrain cursor position within expanded bounds
            constrainedCursorPos = constrainToGameBounds(screenX, screenY);
            cursor.style.opacity = '1';

            // Update cursor position with smooth animation
            gsap.to(cursor, {
                left: constrainedCursorPos.x,
                top: constrainedCursorPos.y,
                duration: 0.08,
                ease: "power2.out"
            });
        } else {
            // Hide cursor when outside expanded bounds
            cursor.style.opacity = '0';
        }

        // Update cursor appearance
        cursor.classList.remove('inside-game', 'control-mode', 'near-game');
        if (isControlModeActive) {
            cursor.classList.add('control-mode');
        } else if (isInInnerBounds) {
            cursor.classList.add('inside-game');
        } else if (isInExpandedBounds) {
            cursor.classList.add('near-game');
        }

        // Update status indicators
        updateStatusIndicators();

        // Draw hand skeleton
        drawHandSkeleton(landmarks, isPinching, isControlModeActive);

        // Only track swipes when control mode is active
        if (isControlModeActive) {
            if (!swipeStartPos) {
                swipeStartPos = { x: screenX, y: screenY };
                swipeStartTime = Date.now();
            } else {
                const dx = screenX - swipeStartPos.x;
                const dy = screenY - swipeStartPos.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const elapsed = Date.now() - swipeStartTime;

                if (distance > SWIPE_THRESHOLD && elapsed < SWIPE_TIME_LIMIT) {
                    // Determine swipe direction
                    let direction = null;
                    if (Math.abs(dx) > Math.abs(dy)) {
                        direction = dx > 0 ? 'right' : 'left';
                    } else {
                        direction = dy > 0 ? 'down' : 'up';
                    }

                    if (direction) {
                        moveTiles(direction);
                    }

                    // Reset swipe tracking
                    swipeStartPos = null;
                    swipeStartTime = null;
                } else if (elapsed > SWIPE_TIME_LIMIT) {
                    // Reset if taking too long
                    swipeStartPos = { x: screenX, y: screenY };
                    swipeStartTime = Date.now();
                }
            }
        } else {
            // Reset swipe tracking when not in control mode
            swipeStartPos = null;
            swipeStartTime = null;
        }

    } else {
        // No hand detected
        isHandDetected = false;
        isPinching = false;
        wasPinching = false;
        isCursorInsideGame = false;
        isControlModeActive = false;
        controlModeLocked = false;

        statusDot.classList.remove('connected', 'control');
        statusText.textContent = 'No Hand';
        cursor.style.opacity = '0';
        cursor.classList.remove('inside-game', 'control-mode', 'near-game');
        gameContainer.classList.remove('active');
        pinchIndicator.classList.remove('active');
        pinchStatus.textContent = 'Show hand to camera';
        pinchDistanceBar.style.width = '0%';
        gestureIndicator.classList.remove('active');
        gestureIndicator.innerHTML = '✋ Move hand inside game area • 👌 Pinch to control';
        swipeStartPos = null;
        swipeStartTime = null;
    }
}

// Update all status indicators
function updateStatusIndicators() {
    statusDot.classList.remove('connected', 'control');

    // Update pinch distance bar
    const pinchPercent = Math.max(0, Math.min(100, (1 - currentPinchDistance / 0.2) * 100));
    pinchDistanceBar.style.width = `${pinchPercent}%`;

    if (isControlModeActive) {
        statusDot.classList.add('connected', 'control');
        statusText.textContent = 'Control Active';
        gameContainer.classList.add('active');
        pinchIndicator.classList.add('active');
        pinchStatus.textContent = 'Move hand to shift tiles!';
        gestureIndicator.classList.add('active');
        gestureIndicator.innerHTML = '👌 <strong>CONTROL MODE</strong> — Move hand to shift tiles';
    } else if (controlModeLocked && isPinching) {
        statusDot.classList.add('connected');
        statusText.textContent = 'Release Pinch';
        gameContainer.classList.remove('active');
        pinchIndicator.classList.remove('active');
        pinchStatus.textContent = 'Release and pinch again';
        gestureIndicator.classList.remove('active');
        gestureIndicator.innerHTML = '✋ Release pinch to reset, then pinch again';
    } else if (isPinching && !isCursorInsideGame) {
        statusDot.classList.add('connected');
        statusText.textContent = 'Pinch (Outside)';
        gameContainer.classList.remove('active');
        pinchIndicator.classList.remove('active');
        pinchStatus.textContent = 'Move inside game area';
        gestureIndicator.classList.remove('active');
        gestureIndicator.innerHTML = '👌 Pinch detected — Move inside game area';
    } else if (isCursorInsideGame && !isPinching) {
        statusDot.classList.add('connected');
        statusText.textContent = 'Hand Inside';
        gameContainer.classList.remove('active');
        pinchIndicator.classList.remove('active');
        pinchStatus.textContent = 'Pinch to control';
        gestureIndicator.classList.remove('active');
        gestureIndicator.innerHTML = '✋ Inside game area — 👌 Pinch to activate';
    } else if (isInsideGameBounds(currentHandPos.x, currentHandPos.y)) {
        // In expanded bounds but not inner bounds
        statusDot.classList.add('connected');
        statusText.textContent = 'Move Closer';
        gameContainer.classList.remove('active');
        pinchIndicator.classList.remove('active');
        pinchStatus.textContent = 'Move into game area';
        gestureIndicator.classList.remove('active');
        gestureIndicator.innerHTML = '✋ Move hand into game area • 👌 Then pinch to control';
    } else {
        statusDot.classList.add('connected');
        statusText.textContent = 'Hand Outside';
        gameContainer.classList.remove('active');
        pinchIndicator.classList.remove('active');
        pinchStatus.textContent = 'Move inside game area';
        gestureIndicator.classList.remove('active');
        gestureIndicator.innerHTML = '✋ Move hand inside game area • 👌 Pinch to control';
    }
}

// Draw hand skeleton on canvas
function drawHandSkeleton(landmarks, isPinch, isControl) {
    const connections = [
        [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
        [0, 5], [5, 6], [6, 7], [7, 8],       // Index
        [0, 9], [9, 10], [10, 11], [11, 12],  // Middle
        [0, 13], [13, 14], [14, 15], [15, 16],// Ring
        [0, 17], [17, 18], [18, 19], [19, 20],// Pinky
        [5, 9], [9, 13], [13, 17]             // Palm
    ];

    // Draw connections
    let color = 'rgba(255, 255, 255, 0.5)';
    if (isControl) {
        color = 'rgba(79, 172, 254, 1)';
    } else if (isPinch) {
        color = 'rgba(255, 200, 100, 0.8)';
    }

    skeletonCtx.strokeStyle = color;
    skeletonCtx.lineWidth = 2;

    connections.forEach(([i, j]) => {
        const start = landmarks[i];
        const end = landmarks[j];
        skeletonCtx.beginPath();
        skeletonCtx.moveTo((1 - start.x) * 220, start.y * 165);
        skeletonCtx.lineTo((1 - end.x) * 220, end.y * 165);
        skeletonCtx.stroke();
    });

    // Draw line between thumb and index tip when pinching
    if (isPinch || currentPinchDistance < 0.15) {
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        skeletonCtx.strokeStyle = isControl ? 'rgba(79, 172, 254, 1)' : 'rgba(255, 200, 100, 1)';
        skeletonCtx.lineWidth = 3;
        skeletonCtx.beginPath();
        skeletonCtx.moveTo((1 - thumbTip.x) * 220, thumbTip.y * 165);
        skeletonCtx.lineTo((1 - indexTip.x) * 220, indexTip.y * 165);
        skeletonCtx.stroke();
    }

    // Draw landmarks
    landmarks.forEach((landmark, index) => {
        const x = (1 - landmark.x) * 220;
        const y = landmark.y * 165;

        // Highlight thumb tip (4) and index tip (8)
        const isKeyPoint = index === 4 || index === 8;
        const radius = isKeyPoint ? 6 : (index === 0 ? 5 : 3);

        skeletonCtx.beginPath();
        skeletonCtx.arc(x, y, radius, 0, Math.PI * 2);

        if (isControl) {
            skeletonCtx.fillStyle = isKeyPoint ? '#4facfe' : 'rgba(79, 172, 254, 0.8)';
        } else if (isPinch) {
            skeletonCtx.fillStyle = isKeyPoint ? '#ffcc66' : 'rgba(255, 200, 100, 0.7)';
        } else {
            skeletonCtx.fillStyle = isKeyPoint ? '#ff6b6b' : 'rgba(255, 255, 255, 0.6)';
        }
        skeletonCtx.fill();
    });

    // Draw status label
    skeletonCtx.font = 'bold 11px Poppins';
    if (isControl) {
        skeletonCtx.fillStyle = 'rgba(79, 172, 254, 1)';
        skeletonCtx.fillText('👌 CONTROL ACTIVE', 55, 158);
    } else if (isPinch) {
        skeletonCtx.fillStyle = 'rgba(255, 200, 100, 1)';
        skeletonCtx.fillText('👌 PINCH DETECTED', 55, 158);
    }
}

// Keyboard controls (fallback)
document.addEventListener('keydown', (e) => {
    const keyMap = {
        'ArrowUp': 'up',
        'ArrowDown': 'down',
        'ArrowLeft': 'left',
        'ArrowRight': 'right'
    };

    if (keyMap[e.key]) {
        e.preventDefault();
        moveTiles(keyMap[e.key]);
    }
});

// Window resize handler
window.addEventListener('resize', updateGameBounds);

// Button event listeners
document.getElementById('newGameBtn').addEventListener('click', initGame);
document.getElementById('playAgainBtn').addEventListener('click', initGame);

// Initialize
initializeGrid();
initGame();
setupHandTracking();

// Update best score display
bestScoreElement.textContent = bestScore;