const socket = io();

let currentPlayer = {
    id: null,
    name: null,
    isBatting: false,
    score: 0
};

let gameState = {
    opponent: null,
    currentChoice: null,
    inningsNumber: 1,
    targetScore: null,
    gameOver: false
};

// Utility Functions
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

function showToast(message, isError = false) {
    const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'error' : ''}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('show');
    }, 100);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

// Game Functions
function joinGame() {
    const nameInput = document.getElementById('playerName');
    const playerName = nameInput.value.trim();

    if (!playerName) {
        showToast('Please enter your name', true);
        return;
    }

    currentPlayer.name = playerName;
    socket.emit('joinGame', playerName);
    showScreen('lobby');
}

function handleKeyPress(event) {
    if (event.key === 'Enter' && document.getElementById('homepage').classList.contains('active')) {
        joinGame();
    }
}

function chooseBatting(choice) {
    socket.emit('battingChoice', { choice });
    document.getElementById('battingChoice').classList.add('hidden');

    const message = choice === 'bat' ? 
        'You chose to bat first!' : 
        'You chose to bowl first!';

    document.getElementById('tossResult').textContent = message;
}

function selectNumber(number) {
    if (gameState.currentChoice !== null || gameState.gameOver) return;

    gameState.currentChoice = number;

    // Visual feedback
    document.querySelectorAll('.number-btn').forEach(btn => {
        btn.classList.remove('selected');
        if (parseInt(btn.textContent) === number) {
            btn.classList.add('selected');
        }
    });

    document.getElementById('currentChoice').textContent = number;
    document.getElementById('opponentStatus').textContent = 'Waiting for opponent...';

    socket.emit('numberChoice', number);
}

function updateScoreboard(scores, roles) {
    const player1ScoreElement = document.getElementById('player1Score');
    const player2ScoreElement = document.getElementById('player2Score');
    const player1RoleElement = document.getElementById('player1Role');
    const player2RoleElement = document.getElementById('player2Role');

    player1ScoreElement.textContent = scores.player1 || '0';
    player2ScoreElement.textContent = scores.player2 || '0';

    player1RoleElement.textContent = `(${roles.player1})`;
    player2RoleElement.textContent = `(${roles.player2})`;
}

function updateGameStatus(message, isError = false) {
    const gameStatus = document.getElementById('gameStatus');
    gameStatus.textContent = message;
    gameStatus.style.color = isError ? 'var(--error-color)' : 'var(--primary-yellow)';
}

function updateInningsStatus() {
    const inningsStatus = document.getElementById('inningsStatus');
    if (gameState.targetScore) {
        inningsStatus.textContent = `Target: ${gameState.targetScore} runs`;
    } else {
        inningsStatus.textContent = `1st Innings`;
    }
}

function resetNumberButtons() {
    gameState.currentChoice = null;
    document.getElementById('currentChoice').textContent = '-';
    document.getElementById('opponentStatus').textContent = 'Waiting...';
    document.querySelectorAll('.number-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
}

// Socket Event Handlers
socket.on('waiting', () => {
    document.getElementById('waitingMessage').textContent = 'Waiting for another player to join...';
});

socket.on('gameStart', ({ players }) => {
    currentPlayer.id = socket.id;
    gameState.opponent = players.find(p => p.id !== currentPlayer.id);

    document.getElementById('player1Name').textContent = currentPlayer.name;
    document.getElementById('player2Name').textContent = gameState.opponent.name;

    showScreen('toss');
    // Start coin animation
    const coin = document.querySelector('.coin');
    coin.classList.add('flipping');
});

socket.on('tossResult', ({ winnerId, winnerName }) => {
    const isTossWinner = winnerId === currentPlayer.id;
    const tossResultDiv = document.getElementById('tossResult');
    const battingChoiceDiv = document.getElementById('battingChoice');

    tossResultDiv.textContent = isTossWinner ? 
        "You won the toss!" : 
        `${winnerName} won the toss!`;

    if (isTossWinner) {
        battingChoiceDiv.classList.remove('hidden');
    } else {
        battingChoiceDiv.classList.add('hidden');
    }
});

socket.on('gameReady', ({ batsman, bowler, batsmanName, bowlerName }) => {
    currentPlayer.isBatting = batsman === currentPlayer.id;
    showScreen('game');

    const roles = {
        player1: currentPlayer.id === batsman ? 'Batting' : 'Bowling',
        player2: currentPlayer.id === batsman ? 'Bowling' : 'Batting'
    };

    updateScoreboard({ player1: 0, player2: 0 }, roles);
    updateGameStatus(currentPlayer.isBatting ? 
        "You're batting! Choose a number." : 
        "You're bowling! Choose a number."
    );
    updateInningsStatus();
});

socket.on('scoreUpdate', ({ scores, batsmanChoice, bowlerChoice, batsman }) => {
    const roles = {
        player1: currentPlayer.id === batsman ? 'Batting' : 'Bowling',
        player2: currentPlayer.id === batsman ? 'Bowling' : 'Batting'
    };

    updateScoreboard({
        player1: currentPlayer.id === batsman ? scores[batsman] : scores[gameState.opponent.id],
        player2: currentPlayer.id === batsman ? scores[gameState.opponent.id] : scores[batsman]
    }, roles);

    showToast(`Batsman: ${batsmanChoice}, Bowler: ${bowlerChoice} | +${batsmanChoice} runs`);
    resetNumberButtons();
});

socket.on('inningsChange', ({ scores, newBatsman, newBowler }) => {
    gameState.inningsNumber = 2;
    gameState.targetScore = scores[newBowler] + 1;
    currentPlayer.isBatting = newBatsman === currentPlayer.id;

    const roles = {
        player1: currentPlayer.id === newBatsman ? 'Batting' : 'Bowling',
        player2: currentPlayer.id === newBatsman ? 'Bowling' : 'Batting'
    };

    updateScoreboard({
        player1: currentPlayer.id === newBowler ? scores[newBowler] : 0,
        player2: currentPlayer.id === newBowler ? 0 : scores[newBowler]
    }, roles);

    updateGameStatus(`2nd Innings - Target: ${gameState.targetScore} runs`);
    updateInningsStatus();
    resetNumberButtons();
});

socket.on('wicket', ({ batsmanChoice }) => {
    showToast(`OUT! Both chose ${batsmanChoice}`, true);
    if (gameState.inningsNumber === 1) {
        updateGameStatus("Innings Complete!");
    }
    resetNumberButtons();
});

socket.on('gameOver', ({ winnerName, isDraw }) => {
    gameState.gameOver = true;

    const message = isDraw ? 
        "It's a draw!" : 
        `${winnerName} wins the game!`;

    updateGameStatus(message);
    showToast(message);
});
