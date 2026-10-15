function resizeCanvas() {
    // resize to fit screen (square)
    const size = Math.min(window.innerWidth, window.innerHeight);
    const canvas = document.getElementById('gameCanvas');
    canvas.width = size;
    canvas.height = size;
    // set canvas size in css
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
}
function addVec(a,b){
    return [a[0]+b[0], a[1]+b[1]];
}
function equalVec(a,b){
    return a[0] === b[0] && a[1] === b[1];
}
function compareVec(a,b,c){
    // if a + b == c, return true.
    return equalVec(addVec(a,b), c);
}
function inBounds(vec){
    const [x, y] = vec;
    return x >= 0 && x < 8 && y >= 0 && y < 8;
}
function createPiece(type){
    return {type, moves:0};
}
const KNIGHT_DIRECTIONS = [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]];
function pieceRuleKey(type){
    if (type.includes("P")) return "pawn";
    if (type.includes("N")) return "knight";
    if (type.includes("B")) return "bishop";
    if (type.includes("R")) return "rook";
    if (type.includes("Q")) return "queen";
    if (type.includes("K")) return "king";
    if (type.includes("D")) return "dragon";
    return "";
}
function canUseJumpChain(piece){
    return pieceRuleKey(piece.type) === "dragon" || piece.type === "bK";
}
function canJumpOverDragon(piece, obstacle){
    return piece.promoted
        && pieceRuleKey(piece.type) === "dragon"
        && pieceRuleKey(obstacle.type) === "dragon";
}
function directionsFor(piece, rules, kind){
    const directions = [...(rules[kind] ?? [])];
    if (piece.promoted && pieceRuleKey(piece.type) === "dragon") {
        directions.push(...KNIGHT_DIRECTIONS);
    }
    return directions;
}
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.chessImage = null;
        this.dragonImage = null;
        this.spriteMap = null;
        this.pieceRules = null;

        this.attachEvents();

        this.annotations = {"move":[],"check":[],"attack":[],"select":[]};
        this.promotionPending = false;
        this.turn = "w";
        this.gameOver = false;
        this.annotationTypes = {
            "move":{},
            "check":{},
            "attack":{},
            "select":{}
        }
    }

    async load() {
        // get chess pieces
        const img = new Image();
        img.src = 'chess.png';
        const pieces = ['wK', 'wQ', 'wB', 'wN', 'wR', 'wP', 'bK', 'bQ', 'bB', 'bN', 'bR', 'bP'];
        let cols = 6;
        let imgLoadPromise = new Promise((resolve, reject) => {
            img.onload = () => {
                const spriteMap = {};
                const squareSize = img.width / cols;
                for (let i = 0; i < pieces.length; i++) {
                    const col = i % cols;
                    const row = Math.floor(i / cols);
                    spriteMap[pieces[i]] = {
                        x: col * squareSize,
                        y: row * squareSize,
                        width: squareSize,
                        height: squareSize
                    };
                }
                resolve(spriteMap);
            };
            img.onerror = reject;
        });
        this.spriteMap = await imgLoadPromise;
        this.chessImage = img;

        // load dragon (black only)
        const dragonImg = new Image();
        dragonImg.src = 'dragon.png';
        let dragonLoadPromise = new Promise((resolve, reject) => {
            dragonImg.onload = () => {
                this.spriteMap['bD'] = {
                    x: 0,
                    y: 0,
                    width: dragonImg.width,
                    height: dragonImg.height
                };
                resolve();
            };
            dragonImg.onerror = reject;
        });
        await dragonLoadPromise;
        this.dragonImage = dragonImg;

        // load pieces.json
        await fetch('pieces.json')
            .then(response => response.json())
            .then(data => {
                this.pieceRules = data;
            })
            .catch(error => console.error('Error loading pieces.json:', error));

        // annotation displays
        function createMoveCanvas() {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = 50;
            tempCanvas.height = 50;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.fillStyle = 'rgba(0,255,0,0.5)';
            tempCtx.beginPath();
            tempCtx.arc(25, 25, 25, 0, Math.PI * 2);
            tempCtx.fill();
            this.annotationTypes['move'].canvas = tempCanvas;
        }
        function createCheckCanvas() {
            const checkCanvas = document.createElement('canvas');
            checkCanvas.width = 50;
            checkCanvas.height = 50;
            const checkCtx = checkCanvas.getContext('2d');
            checkCtx.fillStyle = 'rgba(255,0,0,0.25)';
            checkCtx.fillRect(0, 0, 50, 50);
            this.annotationTypes['check'].canvas = checkCanvas;
        }
        function createAttackCanvas() {
            const attackCanvas = document.createElement('canvas');
            attackCanvas.width = 50;
            attackCanvas.height = 50;
            const attackCtx = attackCanvas.getContext('2d');
            attackCtx.strokeStyle = 'rgba(255,0,0,0.5)';
            attackCtx.lineWidth = 5;
            attackCtx.beginPath();
            attackCtx.arc(25, 25, 20, 0, Math.PI * 2);
            attackCtx.stroke();
            this.annotationTypes['attack'].canvas = attackCanvas;
        }
        function createSelectCanvas() {
            const selectCanvas = document.createElement('canvas');
            selectCanvas.width = 50;
            selectCanvas.height = 50;
            const selectCtx = selectCanvas.getContext('2d');
            selectCtx.strokeStyle = 'rgba(0,0,0,0.5)';
            selectCtx.lineWidth = 5;
            selectCtx.strokeRect(0, 0, 50, 50);
            this.annotationTypes['select'].canvas = selectCanvas;
        }
        createMoveCanvas.call(this);
        createCheckCanvas.call(this);
        createAttackCanvas.call(this);
        createSelectCanvas.call(this);

        this.generateBoard();
        this.updateCheckAnnotations();
        this.render();
    }

    generateBoard() {
        this.board = [
            [createPiece("wR"), createPiece("wN"), createPiece("wB"), createPiece("wK"), createPiece("wQ"), createPiece("wB"), createPiece("wN"), createPiece("wR")],
            [createPiece("wP"), createPiece("wP"), createPiece("wP"), createPiece("wP"), createPiece("wP"), createPiece("wP"), createPiece("wP"), createPiece("wP")],
            [null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null],
            [createPiece("bD"), createPiece("bD"), createPiece("bD"), createPiece("bD"), createPiece("bD"), createPiece("bD"), createPiece("bD"), createPiece("bD")],
            [createPiece("bD"), createPiece("bD"), createPiece("bD"), createPiece("bK"), createPiece("bD"), createPiece("bD"), createPiece("bD"), createPiece("bD")],
        ]
    }

    render() {
        // clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        const squareSize = this.canvas.width / 8;
        function renderCheckerboard() {
            // checkerboard
            for (let row = 0; row < 8; row++) {
                for (let col = 0; col < 8; col++) {
                    if ((row + col) % 2 === 0) {
                        this.ctx.fillStyle = '#f0d9b5'; // light square
                    } else {
                        this.ctx.fillStyle = '#b58863'; // dark square
                    }
                    this.ctx.fillRect(col * squareSize, row * squareSize, squareSize, squareSize);
                }
            }
        }
        // render peices
        function renderPieces(){
            for (let row = 0; row < 8; row++) {
                for (let col = 0; col < 8; col++) {
                    const piece = this.board[row][col];
                    if (piece) {
                        const isDragon = pieceRuleKey(piece.type) === 'dragon';
                        const sprite = this.spriteMap[isDragon ? 'bD' : piece.type];
                        if (sprite) {
                            if (piece.promoted && isDragon) {
                                const tintedDragon = document.createElement('canvas');
                                tintedDragon.width = sprite.width;
                                tintedDragon.height = sprite.height;
                                const tintedCtx = tintedDragon.getContext('2d');
                                tintedCtx.drawImage(
                                    this.dragonImage,
                                    sprite.x, sprite.y, sprite.width, sprite.height,
                                    0, 0, sprite.width, sprite.height
                                );
                                tintedCtx.globalCompositeOperation = 'source-in';
                                tintedCtx.fillStyle = piece.type[0] === 'w' ? '#8a2be2' : '#d4af37';
                                tintedCtx.fillRect(0, 0, sprite.width, sprite.height);
                                this.ctx.drawImage(
                                    tintedDragon, 0, 0, sprite.width, sprite.height,
                                    col * squareSize, row * squareSize, squareSize, squareSize
                                );
                            } else {
                                this.ctx.drawImage(
                                    isDragon ? this.dragonImage : this.chessImage,
                                    sprite.x, sprite.y, sprite.width, sprite.height,
                                    col * squareSize, row * squareSize, squareSize, squareSize
                                );
                            }
                        }
                    }
                }
            }
        }
        // render annotations
        function renderAnnotations() {
            const squareSize = this.canvas.width / 8;
            for (const type in this.annotations) {
                const annotationCanvas = this.annotationTypes[type].canvas;
                if (!annotationCanvas) continue;
                for (const annotation of this.annotations[type]) {
                    const { x, y } = annotation;
                    this.ctx.drawImage(annotationCanvas, x * squareSize, y * squareSize, squareSize, squareSize);
                }
            }
        }
        renderCheckerboard.call(this);
        renderAnnotations.call(this);
        renderPieces.call(this);
    }

    attachEvents(){
        this.canvas.addEventListener('click', (event) => {
            if (this.gameOver || this.promotionPending) {
                return;
            }

            const rect = this.canvas.getBoundingClientRect();
            const scale = this.canvas.width / rect.width;
            const x = (event.clientX - rect.left) * scale;
            const y = (event.clientY - rect.top) * scale;
            const squareSize = this.canvas.width / 8;
            const col = Math.floor(x / squareSize);
            const row = Math.floor(y / squareSize);

            this.onClick(col, row)
        });
    }
    movePiece(x,y){
        // see if the clicked square is in the move or attack annotations, if so, move the selected piece to that square.
        const selected = this.annotations["select"][0];
        if(!selected) return false;
        const selX = selected.x;
        const selY = selected.y;
        const moveAnnotations = this.annotations["move"];
        const attackAnnotations = this.annotations["attack"];
        const isMove = moveAnnotations.some(a => a.x === x && a.y === y);
        const isAttack = attackAnnotations.some(a => a.x === x && a.y === y);
        if(isMove || isAttack){
            const movingPiece = this.board[selY][selX];
            const targetPiece = this.board[y][x];
            if (targetPiece && pieceRuleKey(targetPiece.type) === "king") return false;
            const isCastle = movingPiece
                && pieceRuleKey(movingPiece.type) === "king"
                && Math.abs(x - selX) === 2;

            this.board[y][x] = movingPiece;
            this.board[selY][selX] = null;
            movingPiece.moves++;

            if (isCastle) {
                const rookX = x > selX ? 7 : 0;
                const rook = this.board[selY][rookX];
                const rookTargetX = x > selX ? x - 1 : x + 1;
                this.board[selY][rookTargetX] = rook;
                this.board[selY][rookX] = null;
                rook.moves++;
            }

            // clear annotations
            this.annotations["select"] = [];
            this.annotations["move"] = [];
            this.annotations["attack"] = [];
            this.updateCheckAnnotations();
            if (this.shouldPromote(movingPiece, x, y)) {
                if (pieceRuleKey(movingPiece.type) === "dragon") {
                    movingPiece.promoted = true;
                } else {
                    this.showPromotionPicker(x, y);
                    return true;
                }
            }
            this.finishTurn();
            return true;
        }
        return false;
    }
    shouldPromote(piece, x, y) {
        const promotionRank = piece.type[0] === "w" ? 7 : 0;
        return y === promotionRank
            && (pieceRuleKey(piece.type) === "pawn" || pieceRuleKey(piece.type) === "dragon");
    }
    showPromotionPicker(x, y) {
        this.promotionPending = true;
        const picker = document.createElement('div');
        picker.className = 'promotion-picker';
        picker.innerHTML = '<div class="promotion-title">Promote pawn</div>';
        for (const [type, label] of [
            ['Q', 'Queen'], ['R', 'Rook'], ['B', 'Bishop'], ['N', 'Knight'], ['D', 'Dragon']
        ]) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = label;
            button.addEventListener('click', () => {
                const piece = this.board[y][x];
                if (piece && pieceRuleKey(piece.type) === "pawn") {
                    piece.type = `${piece.type[0]}${type}`;
                    if (type === 'D') piece.promoted = true;
                }
                picker.remove();
                this.promotionPending = false;
                this.updateCheckAnnotations();
                this.finishTurn();
            });
            picker.appendChild(button);
        }
        document.body.appendChild(picker);
    }
    onClick(x, y) {
        // if we click on selected piece, deselect it
        const selected = this.annotations["select"][0];
        if(selected && selected.x === x && selected.y === y){
            this.annotations["select"] = [];
            this.annotations["move"] = [];
            this.annotations["attack"] = [];
            this.annotations["check"] = [];
            return;
        }
        const move = this.movePiece(x,y);
        if(move) return;
        const piece = this.pieceAt(x, y);
        if (piece && piece.type[0] !== this.turn) return;
        this.annotations["select"] = [{x,y}];
        this.calculateMoves(x, y);
    }
    pieceAt(x,y){
        return this.board[y][x];
    }
    isFilled(x, y) {
        return this.board[y][x] !== null;
    }
    cloneBoard(board = this.board){
        return board.map(row => row.map(piece => piece ? {...piece} : null));
    }
    applyMove(board, fromX, fromY, toX, toY){
        const nextBoard = this.cloneBoard(board);
        const movingPiece = nextBoard[fromY][fromX];
        nextBoard[toY][toX] = movingPiece;
        nextBoard[fromY][fromX] = null;

        if (movingPiece && pieceRuleKey(movingPiece.type) === "king"
            && Math.abs(toX - fromX) === 2) {
            const rookX = toX > fromX ? 7 : 0;
            const rookTargetX = toX > fromX ? toX - 1 : toX + 1;
            nextBoard[toY][rookTargetX] = nextBoard[fromY][rookX];
            nextBoard[fromY][rookX] = null;
        }
        return nextBoard;
    }
    isSquareAttacked(board, x, y, byColor){
        for (let row = 0; row < board.length; row++) {
            for (let col = 0; col < board[row].length; col++) {
                const piece = board[row][col];
                if (!piece || piece.type[0] !== byColor) continue;

                const rules = this.pieceRules[pieceRuleKey(piece.type)];
                if (!rules) continue;
                const directions = directionsFor(piece, rules, "capture");

                for (const dir of directions) {
                    let current = addVec([col, row], dir);
                    if (!inBounds(current)) continue;

                    while (inBounds(current)) {
                        const occupant = board[current[1]][current[0]];
                        if (current[0] === x && current[1] === y) {
                            return !occupant || occupant.type[0] !== byColor;
                        }
                        if (occupant || !rules.repeat) break;
                        current = addVec(current, dir);
                    }
                }

                const jumpChain = canUseJumpChain(piece) ? (rules.jumpChain ?? []) : [];
                for (const dir of rules.capture ?? []) {
                    let current = addVec([col, row], dir);
                    let jumped = false;
                    while (inBounds(current)) {
                        const occupant = board[current[1]][current[0]];
                        if (!occupant) break;
                        if (!jumpChain.includes(pieceRuleKey(occupant.type))) break;
                        jumped = true;
                        current = addVec(current, dir);
                    }
                    if (jumped && inBounds(current)
                        && current[0] === x && current[1] === y
                        && board[current[1]][current[0]]
                        && board[current[1]][current[0]].type[0] !== byColor) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
    scanChecks(board = this.board){
        const checks = {white: false, black: false};
        for (let row = 0; row < board.length; row++) {
            for (let col = 0; col < board[row].length; col++) {
                const piece = board[row][col];
                if (!piece || pieceRuleKey(piece.type) !== "king") continue;
                const color = piece.type[0] === "w" ? "white" : "black";
                const opponent = color === "white" ? "b" : "w";
                if (this.isSquareAttacked(board, col, row, opponent)) {
                    checks[color] = true;
                }
            }
        }
        return checks;
    }
    isLegalMove(fromX, fromY, toX, toY){
        const piece = this.board[fromY][fromX];
        if (!piece) return false;
        const nextBoard = this.applyMove(this.board, fromX, fromY, toX, toY);
        const color = piece.type[0] === "w" ? "white" : "black";
        return !this.scanChecks(nextBoard)[color];
    }
    updateCheckAnnotations(){
        const checks = this.scanChecks();
        this.annotations["check"] = [];
        for (let row = 0; row < this.board.length; row++) {
            for (let col = 0; col < this.board[row].length; col++) {
                const piece = this.board[row][col];
                if (!piece || pieceRuleKey(piece.type) !== "king") continue;
                const color = piece.type[0] === "w" ? "white" : "black";
                if (checks[color]) this.annotations["check"].push({x: col, y: row});
            }
        }
    }
    getLegalMovesForColor(color) {
        const savedAnnotations = Object.fromEntries(
            Object.entries(this.annotations).map(([type, annotations]) => [type, [...annotations]])
        );
        let hasMoves = false;

        for (let row = 0; row < this.board.length && !hasMoves; row++) {
            for (let col = 0; col < this.board[row].length && !hasMoves; col++) {
                const piece = this.board[row][col];
                if (!piece || piece.type[0] !== color) continue;

                const moves = this.calculateMoves(col, row) ?? {"move": [], "attack": []};
                hasMoves = [...moves.move, ...moves.attack].some(target => {
                    const targetPiece = this.pieceAt(target.x, target.y);
                    return !targetPiece || (
                        targetPiece.type[0] !== color
                        && pieceRuleKey(targetPiece.type) !== "king"
                    );
                });
            }
        }

        this.annotations = savedAnnotations;
        return hasMoves;
    }
    finishTurn() {
        this.turn = this.turn === "w" ? "b" : "w";
        const checks = this.scanChecks();
        if (this.getLegalMovesForColor(this.turn)) return;

        this.gameOver = true;
        const color = this.turn === "w" ? "White" : "Black";
        if (checks[this.turn === "w" ? "white" : "black"]) {
            const winner = this.turn === "w" ? "Black" : "White";
            alert(`Checkmate! ${winner} wins.`);
        } else {
            alert(`Stalemate! ${color} has no legal moves.`);
        }
    }
    calculateMoves(x,y){
        const moves = {"move":[],"attack":[],"check":[]};
        const piece = this.board[y][x];
        const selVec = [x,y]; // selected position vector
        if(!piece){
            this.annotations["move"] = [];
            this.annotations["attack"] = [];
            this.updateCheckAnnotations();
            return;
        }
        const rules = this.pieceRules[pieceRuleKey(piece.type)];
        if (!rules) {
            this.annotations["move"] = [];
            this.annotations["attack"] = [];
            this.updateCheckAnnotations();
            return;
        }


        // first standard movement.
        const moveDirs = directionsFor(piece, rules, "movement"); // [x,y]
        for(const dir of moveDirs){
            const targetVec = addVec(selVec, dir);
            if (!inBounds(targetVec)) continue;
            if (!this.isFilled(targetVec[0], targetVec[1])) {
                moves["move"].push({x: targetVec[0], y: targetVec[1]});
            }
            // if the piece rules has 'repeat' true, keep moving in that direction until we hit a filled square or out of bounds
            if (rules["repeat"]) {
                let repeatVec = [selVec[0],selVec[1]];
                while (true) {
                    repeatVec = addVec(repeatVec, dir);
                    if (!inBounds(repeatVec)) break;
                    if (this.isFilled(repeatVec[0], repeatVec[1])) break;
                    else {
                        moves["move"].push({x: repeatVec[0], y: repeatVec[1]});
                    }
                }
            }
        }

        if (piece.promoted && pieceRuleKey(piece.type) === "dragon") {
            for (const dir of moveDirs) {
                let jumpVec = addVec(selVec, dir);
                let jumpedPiece = false;

                while (inBounds(jumpVec)) {
                    const jumpedTarget = this.pieceAt(jumpVec[0], jumpVec[1]);
                    if (!jumpedTarget) {
                        if (jumpedPiece) {
                            moves["move"].push({x: jumpVec[0], y: jumpVec[1]});
                        }
                        break;
                    }
                    if (!canJumpOverDragon(piece, jumpedTarget)) break;
                    jumpedPiece = true;
                    jumpVec = addVec(jumpVec, dir);
                }
            }
        }

        // then attack movement
        const attackDirs = directionsFor(piece, rules, "capture");
        for(const dir of attackDirs){
            const targetVec = addVec(selVec, dir);
            if (!inBounds(targetVec)) continue;
            if (this.isFilled(targetVec[0], targetVec[1])) {
                // skip if same color
                const targetPiece = this.pieceAt(targetVec[0], targetVec[1]);
                if (piece.type[0] === targetPiece.type[0]) continue;
                moves["attack"].push({x: targetVec[0], y: targetVec[1]});
            }
            if (rules["repeat"] && !this.isFilled(targetVec[0], targetVec[1])) {
                let repeatVec = targetVec;
                while (true) {
                    repeatVec = addVec(repeatVec, dir);
                    if (!inBounds(repeatVec)) break;
                    if (this.isFilled(repeatVec[0], repeatVec[1])) {
                        const targetPiece = this.pieceAt(repeatVec[0], repeatVec[1]);
                        if (piece.type[0] !== targetPiece.type[0]) {
                            moves["attack"].push({x: repeatVec[0], y: repeatVec[1]});
                        }
                        break;
                    }
                }
            }
        }

        // Jump captures may cross pieces whose types are listed in jumpChain.
        // The landing square must contain an opposing piece.
        const jumpChain = canUseJumpChain(piece) ? (rules["jumpChain"] ?? []) : [];
        if (jumpChain.length > 0) {
            for (const dir of attackDirs) {
                let jumpVec = addVec(selVec, dir);
                let jumpedPiece = false;

                while (inBounds(jumpVec)) {
                    const jumpedTarget = this.pieceAt(jumpVec[0], jumpVec[1]);
                    if (!jumpedTarget) break;

                    const jumpedType = pieceRuleKey(jumpedTarget.type);
                    if (!jumpChain.includes(jumpedType)) break;

                    jumpedPiece = true;
                    jumpVec = addVec(jumpVec, dir);
                }

                if (!jumpedPiece || !inBounds(jumpVec)) continue;

                const landingPiece = this.pieceAt(jumpVec[0], jumpVec[1]);
                if (landingPiece && piece.type[0] !== landingPiece.type[0]) {
                    const alreadyListed = moves["attack"].some(
                        target => target.x === jumpVec[0] && target.y === jumpVec[1]
                    );
                    if (!alreadyListed) {
                        moves["attack"].push({x: jumpVec[0], y: jumpVec[1]});
                    }
                }
            }
        }

        // if the peice does not contain 'first' true flag, add first moves
        if(piece.moves === 0 && rules["first"]){
            const firstDirs = rules["first"];
            for(const dir of firstDirs){
                const targetVec = addVec(selVec, dir);
                if (!inBounds(targetVec)) continue;
                if (!this.isFilled(targetVec[0], targetVec[1])) {
                    moves["move"].push({x: targetVec[0], y: targetVec[1]});
                }
            }
        }

        const castling = rules.castling;
        if (pieceRuleKey(piece.type) === "king" && piece.moves === 0 && castling) {
            const color = piece.type[0];
            const opponent = color === "w" ? "b" : "w";
            const currentInCheck = this.isSquareAttacked(this.board, x, y, opponent);

            if (!currentInCheck) {
                for (const [direction] of castling.moves) {
                    const step = Math.sign(direction);
                    const targetX = x + direction;
                    const rookX = step > 0 ? 7 : 0;
                    const rook = this.pieceAt(rookX, y);
                    if (!inBounds([targetX, y]) || !rook
                        || rook.type[0] !== color
                        || rook.moves !== 0
                        || !castling.with.includes(pieceRuleKey(rook.type))) {
                        continue;
                    }

                    let pathClear = true;
                    for (let pathX = x + step; pathX !== rookX; pathX += step) {
                        if (this.isFilled(pathX, y)) {
                            pathClear = false;
                            break;
                        }
                    }
                    if (!pathClear) continue;

                    const transitX = x + step;
                    if (this.isSquareAttacked(this.board, transitX, y, opponent)) continue;
                    if (this.isLegalMove(x, y, targetX, y)) {
                        moves["move"].push({x: targetX, y});
                    }
                }
            }
        }

        const legalMoves = moves["move"].filter(move =>
            this.isLegalMove(x, y, move.x, move.y)
        );
        const legalAttacks = moves["attack"].filter(move =>
            this.isLegalMove(x, y, move.x, move.y)
            && pieceRuleKey(this.pieceAt(move.x, move.y).type) !== "king"
        );

        // push moves to annotations
        this.annotations["move"] = legalMoves;
        this.annotations["attack"] = legalAttacks;
        this.updateCheckAnnotations();
        return {move: legalMoves, attack: legalAttacks};

    }

    update() {
        this.render();
        requestAnimationFrame(() => this.update());
    }
}
document.addEventListener('DOMContentLoaded', async () => {
    resizeCanvas();
    const game = new Game();
    await game.load();
    window.addEventListener('resize', () => {
        resizeCanvas();
        game.render();
    });
    game.update();
});