const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

// Serve static files
app.use(express.static(path.join(__dirname)));

// Game state management
const games = new Map();
const players = new Map();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Handle player joining
    socket.on('joinGame', (playerName) => {
        players.set(socket.id, { 
            name: playerName, 
            socket: socket,
            score: 0
        });

        // Find available game or create new one
        let joinedGame = false;
        for (const [gameId, game] of games.entries()) {
            if (game.players.length === 1) {
                game.players.push(socket.id);
                socket.join(gameId);
                joinedGame = true;
                
                // Start game with both players
                io.to(gameId).emit('gameStart', {
                    players: game.players.map(id => ({
                        id,
                        name: players.get(id).name,
                        score: players.get(id).score
                    }))
                });

                // Start toss
                const tossWinner = Math.random() < 0.5 ? game.players[0] : game.players[1];
                io.to(gameId).emit('tossResult', { 
                    winnerId: tossWinner,
                    winnerName: players.get(tossWinner).name
                });
                break;
            }
        }

        if (!joinedGame) {
            const gameId = `game-${Date.now()}`;
            games.set(gameId, {
                id: gameId,
                players: [socket.id],
                scores: {},
                currentBatsman: null,
                currentBowler: null,
                currentInnings: 1,
                currentChoices: {},
                gameState: 'waiting' // waiting, toss, batting, finished
            });
            socket.join(gameId);
            socket.emit('waiting');
        }
    });

    // Handle batting choice after toss
    socket.on('battingChoice', ({ choice }) => {
        const game = findGameByPlayerId(socket.id);
        if (game) {
            if (choice === 'bat') {
                game.currentBatsman = socket.id;
                game.currentBowler = game.players.find(id => id !== socket.id);
            } else {
                game.currentBowler = socket.id;
                game.currentBatsman = game.players.find(id => id !== socket.id);
            }
            
            game.gameState = 'batting';
            io.to(game.id).emit('gameReady', {
                batsman: game.currentBatsman,
                bowler: game.currentBowler,
                batsmanName: players.get(game.currentBatsman).name,
                bowlerName: players.get(game.currentBowler).name
            });
        }
    });

    // Handle number choices during game
    socket.on('numberChoice', (number) => {
        const game = findGameByPlayerId(socket.id);
        if (!game || game.gameState !== 'batting') return;

        game.currentChoices[socket.id] = number;
        
        // Notify opponent of choice made
        const opponent = game.players.find(id => id !== socket.id);
        io.to(opponent).emit('opponentMadeChoice');

        // If both players have made choices
        if (Object.keys(game.currentChoices).length === 2) {
            const batsmanChoice = game.currentChoices[game.currentBatsman];
            const bowlerChoice = game.currentChoices[game.currentBowler];

            // Process the outcome
            if (batsmanChoice === bowlerChoice) {
                // Wicket - switch innings or end game
                if (game.currentInnings === 1) {
                    // First innings over
                    game.currentInnings = 2;
                    const temp = game.currentBatsman;
                    game.currentBatsman = game.currentBowler;
                    game.currentBowler = temp;
                    
                    io.to(game.id).emit('inningsChange', {
                        scores: game.scores,
                        newBatsman: game.currentBatsman,
                        newBowler: game.currentBowler,
                        batsmanName: players.get(game.currentBatsman).name,
                        bowlerName: players.get(game.currentBowler).name
                    });
                } else {
                    // Game over
                    game.gameState = 'finished';
                    const winner = determineWinner(game);
                    io.to(game.id).emit('gameOver', {
                        winner: winner,
                        finalScores: game.scores
                    });
                }
            } else {
                // Update score
                game.scores[game.currentBatsman] = (game.scores[game.currentBatsman] || 0) + batsmanChoice;
                
                io.to(game.id).emit('scoreUpdate', {
                    scores: game.scores,
                    batsmanChoice,
                    bowlerChoice,
                    batsman: game.currentBatsman,
                    bowler: game.currentBowler
                });
            }
            
            // Reset choices for next round
            game.currentChoices = {};
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        const game = findGameByPlayerId(socket.id);
        if (game) {
            io.to(game.id).emit('playerLeft', {
                playerId: socket.id,
                playerName: players.get(socket.id)?.name
            });
            games.delete(game.id);
        }
        players.delete(socket.id);
    });
});

// Helper functions
function findGameByPlayerId(playerId) {
    for (const game of games.values()) {
        if (game.players.includes(playerId)) {
            return game;
        }
    }
    return null;
}

function determineWinner(game) {
    const firstInningsScore = game.scores[game.currentBowler] || 0;
    const secondInningsScore = game.scores[game.currentBatsman] || 0;
    
    if (firstInningsScore > secondInningsScore) {
        return {
            id: game.currentBowler,
            name: players.get(game.currentBowler).name,
            score: firstInningsScore
        };
    } else if (secondInningsScore > firstInningsScore) {
        return {
            id: game.currentBatsman,
            name: players.get(game.currentBatsman).name,
            score: secondInningsScore
        };
    } else {
        return {
            tie: true,
            score: firstInningsScore
        };
    }
}

// Start server
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
