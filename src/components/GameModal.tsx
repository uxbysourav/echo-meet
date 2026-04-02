import { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { X, Circle, RotateCcw } from 'lucide-react';
import { motion } from 'motion/react';
import clsx from 'clsx';

export default function GameModal({ roomId, userId, onClose }: { roomId: string, userId: string, onClose: () => void }) {
  const [gameState, setGameState] = useState<any>(null);
  const [room, setRoom] = useState<any>(null);

  useEffect(() => {
    const roomRef = doc(db, 'rooms', roomId);
    const unsubscribeRoom = onSnapshot(roomRef, (docSnap) => {
      if (docSnap.exists()) {
        setRoom(docSnap.data());
      }
    });

    const gameRef = doc(db, 'rooms', roomId, 'game', 'state');
    const unsubscribeGame = onSnapshot(gameRef, (docSnap) => {
      if (docSnap.exists()) {
        setGameState(docSnap.data());
      } else {
        setGameState(null);
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `rooms/${roomId}/game/state`));

    return () => {
      unsubscribeRoom();
      unsubscribeGame();
    };
  }, [roomId]);

  const initializeGame = async () => {
    if (!room || room.participants.length < 2) {
      alert('Waiting for another player to join.');
      return;
    }

    const p1 = room.participants[0];
    const p2 = room.participants[1];

    try {
      await setDoc(doc(db, 'rooms', roomId, 'game', 'state'), {
        board: Array(9).fill(null),
        turn: p1,
        winner: null,
        status: 'playing',
        players: {
          [p1]: 'X',
          [p2]: 'O'
        }
      });
    } catch (err) {
      console.error('Failed to initialize game', err);
    }
  };

  const checkWinner = (board: any[]) => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
      [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
      [0, 4, 8], [2, 4, 6]             // diagonals
    ];
    for (let i = 0; i < lines.length; i++) {
      const [a, b, c] = lines[i];
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return board[a];
      }
    }
    return null;
  };

  const handleMove = async (index: number) => {
    if (!gameState || gameState.status !== 'playing' || gameState.turn !== userId || gameState.board[index]) {
      return;
    }

    const newBoard = [...gameState.board];
    const mySymbol = gameState.players[userId];
    newBoard[index] = mySymbol;

    const winnerSymbol = checkWinner(newBoard);
    let newStatus = 'playing';
    let winnerId = null;

    if (winnerSymbol) {
      newStatus = 'finished';
      winnerId = userId;
    } else if (!newBoard.includes(null)) {
      newStatus = 'draw';
    }

    const otherUserId = Object.keys(gameState.players).find(id => id !== userId);

    try {
      await updateDoc(doc(db, 'rooms', roomId, 'game', 'state'), {
        board: newBoard,
        turn: otherUserId,
        status: newStatus,
        winner: winnerId
      });
    } catch (err) {
      console.error('Failed to make move', err);
    }
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900"
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Tic-Tac-Toe</h2>
          <button onClick={onClose} className="rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800">
            <X className="h-6 w-6" />
          </button>
        </div>

        {!gameState ? (
          <div className="text-center">
            <p className="mb-6 text-gray-600 dark:text-gray-400">Start a new game of Tic-Tac-Toe with your friend!</p>
            <button
              onClick={initializeGame}
              className="w-full rounded-xl bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              Start Game
            </button>
          </div>
        ) : (
          <div>
            <div className="mb-6 flex justify-between text-sm font-medium">
              <div className={clsx("flex items-center gap-2 rounded-lg px-3 py-1", gameState.turn === userId ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" : "text-gray-500 dark:text-gray-400")}>
                <span>You ({gameState.players[userId]})</span>
              </div>
              <div className={clsx("flex items-center gap-2 rounded-lg px-3 py-1", gameState.turn !== userId ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" : "text-gray-500 dark:text-gray-400")}>
                <span>Opponent</span>
              </div>
            </div>

            <div className="mb-6 grid grid-cols-3 gap-2">
              {gameState.board.map((cell: string | null, i: number) => (
                <button
                  key={i}
                  onClick={() => handleMove(i)}
                  disabled={gameState.status !== 'playing' || cell !== null || gameState.turn !== userId}
                  className={clsx(
                    "flex h-24 items-center justify-center rounded-xl text-4xl transition-colors",
                    cell ? "bg-gray-50 dark:bg-gray-800" : "bg-gray-100 hover:bg-gray-200 dark:bg-gray-800/50 dark:hover:bg-gray-700",
                    gameState.turn === userId && !cell && gameState.status === 'playing' ? "cursor-pointer" : "cursor-default"
                  )}
                >
                  {cell === 'X' && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}><X className="h-12 w-12 text-blue-500" strokeWidth={2.5} /></motion.div>}
                  {cell === 'O' && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}><Circle className="h-10 w-10 text-red-500" strokeWidth={3} /></motion.div>}
                </button>
              ))}
            </div>

            {gameState.status !== 'playing' && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center"
              >
                <div className="mb-4 text-xl font-bold">
                  {gameState.status === 'draw' ? (
                    <span className="text-gray-600 dark:text-gray-400">It's a Draw!</span>
                  ) : gameState.winner === userId ? (
                    <span className="text-green-600 dark:text-green-400">You Won! 🎉</span>
                  ) : (
                    <span className="text-red-600 dark:text-red-400">You Lost! 😢</span>
                  )}
                </div>
                <button
                  onClick={initializeGame}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-3 font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
                >
                  <RotateCcw className="h-5 w-5" />
                  Play Again
                </button>
              </motion.div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
