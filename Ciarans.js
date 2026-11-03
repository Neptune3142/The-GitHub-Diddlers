(() => {
    "use strict";

    const presets = {
        beginner: { rows: 9, columns: 9, mines: 10, label: "Beginner" },
        intermediate: { rows: 16, columns: 16, mines: 40, label: "Intermediate" },
        expert: { rows: 16, columns: 30, mines: 99, label: "Expert" }
    };

    const boardElement = document.querySelector("#game-board");
    const difficultyElement = document.querySelector("#difficulty");
    const mineCountElement = document.querySelector("#mine-count");
    const timerElement = document.querySelector("#timer");
    const statusElement = document.querySelector("#game-status");
    const resetButton = document.querySelector("#reset-game");
    const flagModeButton = document.querySelector("#flag-mode");

    let game;
    let timerInterval;

    function setStatus(message, state = "") {
        statusElement.textContent = message;
        statusElement.dataset.state = state;
    }

    function formatCounter(value) {
        const boundedValue = Math.max(-99, Math.min(999, value));
        return boundedValue < 0
            ? `-${String(Math.abs(boundedValue)).padStart(2, "0")}`
            : String(boundedValue).padStart(3, "0");
    }

    function updateCounters() {
        mineCountElement.textContent = formatCounter(game.mines - game.flags);
        timerElement.textContent = formatCounter(game.elapsed);
    }

    function stopTimer() {
        window.clearInterval(timerInterval);
        timerInterval = undefined;
    }

    function startTimer() {
        if (timerInterval || game.startedAt === null) return;
        timerInterval = window.setInterval(() => {
            game.elapsed = Math.min(999, Math.floor((Date.now() - game.startedAt) / 1000));
            timerElement.textContent = formatCounter(game.elapsed);
            if (game.elapsed >= 999) stopTimer();
        }, 250);
    }

    function getNeighbors(index) {
        const row = Math.floor(index / game.columns);
        const column = index % game.columns;
        const neighbors = [];

        for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
            for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
                if (rowOffset === 0 && columnOffset === 0) continue;
                const nextRow = row + rowOffset;
                const nextColumn = column + columnOffset;
                if (nextRow >= 0 && nextRow < game.rows && nextColumn >= 0 && nextColumn < game.columns) {
                    neighbors.push(nextRow * game.columns + nextColumn);
                }
            }
        }

        return neighbors;
    }

    function prepareMines(safeIndex) {
        const safeArea = new Set([safeIndex, ...getNeighbors(safeIndex)]);
        const candidates = Array.from({ length: game.cells.length }, (_, index) => index)
            .filter(index => !safeArea.has(index));

        for (let index = candidates.length - 1; index > 0; index -= 1) {
            const swapIndex = Math.floor(Math.random() * (index + 1));
            [candidates[index], candidates[swapIndex]] = [candidates[swapIndex], candidates[index]];
        }

        candidates.slice(0, game.mines).forEach(index => {
            game.cells[index].mine = true;
        });

        game.cells.forEach((cell, index) => {
            cell.adjacent = getNeighbors(index).filter(neighbor => game.cells[neighbor].mine).length;
        });
    }

    function cellDescription(index) {
        const cell = game.cells[index];
        const row = Math.floor(index / game.columns) + 1;
        const column = index % game.columns + 1;
        const position = `Row ${row}, column ${column}`;

        if (game.state === "lost" && cell.mine) return `${position}: mine`;
        if (game.state === "lost" && cell.flagged) return `${position}: incorrect flag`;
        if (cell.flagged) return `${position}: flagged`;
        if (!cell.revealed) return `${position}: covered`;
        if (cell.mine) return `${position}: mine`;
        if (cell.adjacent === 0) return `${position}: empty`;
        return `${position}: ${cell.adjacent} ${cell.adjacent === 1 ? "mine" : "mines"} nearby`;
    }

    function renderCell(index) {
        const cell = game.cells[index];
        const button = game.buttons[index];
        button.className = "cell";
        button.dataset.number = cell.adjacent || "";
        button.textContent = "";
        button.setAttribute("aria-label", cellDescription(index));
        button.tabIndex = index === game.activeIndex ? 0 : -1;

        if (cell.flagged) {
            button.classList.add("is-flagged");
            button.textContent = "⚑";
        }

        if (cell.revealed) {
            button.classList.add("is-revealed");
            if (cell.mine) {
                button.classList.add("is-mine");
                button.textContent = "✹";
            } else if (cell.adjacent > 0) {
                button.textContent = String(cell.adjacent);
            }
        }

        if (game.state === "lost" && cell.mine) {
            button.classList.add("is-revealed", "is-mine");
            if (index === game.hitIndex) button.classList.add("is-hit");
            button.textContent = "✹";
        } else if (game.state === "lost" && cell.flagged && !cell.mine) {
            button.classList.add("is-wrong-flag");
            button.textContent = "×";
        }

        button.setAttribute("aria-label", cellDescription(index));
    }

    function renderBoard() {
        game.buttons.forEach((_, index) => renderCell(index));
        updateCounters();
    }

    function createBoard() {
        const fragment = document.createDocumentFragment();
        game.buttons = [];
        boardElement.replaceChildren();
        boardElement.setAttribute("aria-rowcount", String(game.rows));
        boardElement.setAttribute("aria-colcount", String(game.columns));

        for (let row = 0; row < game.rows; row += 1) {
            const rowElement = document.createElement("div");
            rowElement.setAttribute("role", "row");
            rowElement.setAttribute("aria-rowindex", String(row + 1));
            rowElement.className = "board-row";
            rowElement.style.gridTemplateColumns = `repeat(${game.columns}, minmax(0, 1fr))`;

            for (let column = 0; column < game.columns; column += 1) {
                const index = row * game.columns + column;
                const button = document.createElement("button");
                button.type = "button";
                button.className = "cell";
                button.setAttribute("role", "gridcell");
                button.setAttribute("aria-rowindex", String(row + 1));
                button.setAttribute("aria-colindex", String(column + 1));
                button.tabIndex = index === 0 ? 0 : -1;
                button.addEventListener("click", () => handleCellClick(index));
                button.addEventListener("contextmenu", event => {
                    event.preventDefault();
                    toggleFlag(index);
                });
                button.addEventListener("keydown", event => handleCellKeydown(event, index));
                game.buttons.push(button);
                rowElement.append(button);
            }

            fragment.append(rowElement);
        }

        boardElement.append(fragment);
        renderBoard();
    }

    function startGame(config) {
        stopTimer();
        const safeMines = Math.max(1, Math.min(config.mines, config.rows * config.columns - 1));
        game = {
            rows: config.rows,
            columns: config.columns,
            mines: safeMines,
            label: config.label,
            cells: Array.from({ length: config.rows * config.columns }, () => ({
                mine: false,
                revealed: false,
                flagged: false,
                adjacent: 0
            })),
            flags: 0,
            revealedSafe: 0,
            elapsed: 0,
            startedAt: null,
            state: "playing",
            activeIndex: 0,
            hitIndex: -1,
            buttons: []
        };
        resetButton.textContent = "🙂";
        resetButton.setAttribute("aria-label", "Start a new game");
        flagModeButton.setAttribute("aria-pressed", "false");
        flagModeButton.innerHTML = '<span aria-hidden="true">&#9873;</span> Flag mode: off';
        setStatus(`New ${config.label} game. Your first click is safe.`);
        createBoard();
    }

    function finishGame(won, hitIndex = -1) {
        game.state = won ? "won" : "lost";
        game.hitIndex = hitIndex;
        stopTimer();
        resetButton.textContent = won ? "😎" : "😵";
        resetButton.setAttribute("aria-label", "Play again");

        if (won) {
            game.cells.forEach(cell => {
                if (cell.mine && !cell.flagged) {
                    cell.flagged = true;
                    game.flags += 1;
                }
            });
            setStatus(`Board cleared! You won ${game.label} in ${game.elapsed} seconds.`, "won");
        } else {
            setStatus("Boom! You hit a mine. Start a new game and give it another go.", "lost");
        }

        renderBoard();
    }

    function reveal(index) {
        const cell = game.cells[index];
        if (!cell || cell.revealed || cell.flagged || game.state !== "playing") return;

        if (game.startedAt === null) {
            game.startedAt = Date.now();
            prepareMines(index);
            startTimer();
        }

        if (cell.mine) {
            cell.revealed = true;
            finishGame(false, index);
            return;
        }

        const pending = [index];
        while (pending.length) {
            const nextIndex = pending.pop();
            const nextCell = game.cells[nextIndex];
            if (nextCell.revealed || nextCell.flagged || nextCell.mine) continue;

            nextCell.revealed = true;
            game.revealedSafe += 1;
            if (nextCell.adjacent === 0) {
                getNeighbors(nextIndex).forEach(neighbor => {
                    if (!game.cells[neighbor].revealed && !game.cells[neighbor].flagged) pending.push(neighbor);
                });
            }
        }

        if (game.revealedSafe === game.cells.length - game.mines) {
            finishGame(true);
            return;
        }

        renderBoard();
    }

    function chord(index) {
        const cell = game.cells[index];
        if (!cell.revealed || cell.adjacent === 0) return;

        const neighbors = getNeighbors(index);
        const adjacentFlags = neighbors.filter(neighbor => game.cells[neighbor].flagged).length;
        if (adjacentFlags !== cell.adjacent) return;

        for (const neighbor of neighbors) {
            if (!game.cells[neighbor].flagged && game.cells[neighbor].mine) {
                game.cells[neighbor].revealed = true;
                finishGame(false, neighbor);
                return;
            }
        }

        neighbors.forEach(neighbor => {
            if (!game.cells[neighbor].flagged) reveal(neighbor);
        });
    }

    function handleCellClick(index) {
        game.activeIndex = index;
        if (game.state !== "playing") return;

        if (flagModeButton.getAttribute("aria-pressed") === "true") {
            toggleFlag(index);
        } else if (game.cells[index].revealed) {
            chord(index);
        } else {
            reveal(index);
        }
    }

    function toggleFlag(index) {
        const cell = game.cells[index];
        if (game.state !== "playing" || !cell || cell.revealed) return;

        cell.flagged = !cell.flagged;
        game.flags += cell.flagged ? 1 : -1;
        game.activeIndex = index;
        renderBoard();
    }

    function moveFocus(index, key) {
        const row = Math.floor(index / game.columns);
        const column = index % game.columns;
        let nextRow = row;
        let nextColumn = column;

        if (key === "ArrowUp") nextRow = Math.max(0, row - 1);
        if (key === "ArrowDown") nextRow = Math.min(game.rows - 1, row + 1);
        if (key === "ArrowLeft") nextColumn = Math.max(0, column - 1);
        if (key === "ArrowRight") nextColumn = Math.min(game.columns - 1, column + 1);

        const nextIndex = nextRow * game.columns + nextColumn;
        if (nextIndex !== index) {
            game.activeIndex = nextIndex;
            game.buttons.forEach((button, buttonIndex) => {
                button.tabIndex = buttonIndex === nextIndex ? 0 : -1;
            });
            game.buttons[nextIndex].focus();
        }
    }

    function handleCellKeydown(event, index) {
        if (event.key.startsWith("Arrow")) {
            event.preventDefault();
            moveFocus(index, event.key);
        } else if (event.key.toLowerCase() === "f") {
            event.preventDefault();
            toggleFlag(index);
        }
    }

    difficultyElement.addEventListener("change", () => {
        startGame(presets[difficultyElement.value]);
    });

    resetButton.addEventListener("click", () => {
        startGame(presets[difficultyElement.value] || presets.beginner);
    });

    flagModeButton.addEventListener("click", () => {
        const enabled = flagModeButton.getAttribute("aria-pressed") !== "true";
        flagModeButton.setAttribute("aria-pressed", String(enabled));
        flagModeButton.innerHTML = `<span aria-hidden="true">&#9873;</span> Flag mode: ${enabled ? "on" : "off"}`;
    });

    startGame(presets.beginner);
})();
