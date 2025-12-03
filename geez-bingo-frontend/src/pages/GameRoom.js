import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket } from '../context/SocketContext';
import { useGame } from '../context/GameContext';
import BingoCard from '../components/Game/BingoCard';
import NumberGrid from '../components/Game/NumberGrid';
import PlayerList from '../components/Game/PlayerList';
import GameChat from '../components/Game/GameChat';
import GameControls from '../components/Game/GameControls';
import WinnerModal from '../components/Game/WinnerModal';
import { 
  Trophy, Users, Clock, DollarSign, 
  Zap, RefreshCw, Volume2, Settings
} from 'lucide-react';
import toast from 'react-hot-toast';

const GameRoom = () => {
  const { gameId } = useParams();
  const { socket, isConnected } = useSocket();
  const { currentGame, joinGame, leaveGame, purchaseCard } = useGame();
  
  const [gameState, setGameState] = useState(null);
  const [myCards, setMyCards] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);
  const [players, setPlayers] = useState([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [winner, setWinner] = useState(null);

  useEffect(() => {
    if (!socket || !gameId) return;

    // Join game room
    socket.emit('joinGame', { gameId });
    joinGame(gameId);

    // Listen for game updates
    socket.on('gameState', (state) => {
      setGameState(state);
      setTimeLeft(state.timeLeft || 0);
    });

    socket.on('numberCalled', (data) => {
      toast.success(`Number called: ${data.number}`, {
        icon: '🎯',
        position: 'top-center'
      });
    });

    socket.on('cardPurchased', (data) => {
      if (data.playerId === socket.id) {
        toast.success(`Card #${data.cardNumber} purchased!`);
      }
    });

    socket.on('winnerDeclared', (data) => {
      setWinner(data);
      toast.custom((t) => (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white px-6 py-4 rounded-lg shadow-xl"
        >
          <div className="flex items-center space-x-3">
            <Trophy className="w-8 h-8" />
            <div>
              <p className="font-bold text-lg">🎉 BINGO! 🎉</p>
              <p>{data.winner.username} won ${data.winnings}!</p>
            </div>
          </div>
        </motion.div>
      ));
    });

    socket.on('gameEnded', (data) => {
      toast('Game ended. No winner this round.', {
        icon: '⏰',
        duration: 5000
      });
    });

    return () => {
      socket.off('gameState');
      socket.off('numberCalled');
      socket.off('cardPurchased');
      socket.off('winnerDeclared');
      socket.off('gameEnded');
      leaveGame(gameId);
    };
  }, [socket, gameId, joinGame, leaveGame]);

  const handlePurchaseCard = async (cardNumber) => {
    try {
      const card = await purchaseCard(gameId, cardNumber);
      setMyCards(prev => [...prev, card]);
      toast.success(`Card #${cardNumber} purchased!`);
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleClaimBingo = () => {
    socket.emit('claimBingo', { gameId });
    toast('Checking for BINGO...', { icon: '🎯' });
  };

  if (!gameState) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white text-lg">Loading game room...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black text-white p-4">
      {/* Game Header */}
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6 p-4 bg-gray-800/50 rounded-xl backdrop-blur-sm">
          <div className="flex items-center space-x-4">
            <div className="bg-blue-600 p-3 rounded-lg">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Geez Bingo</h1>
              <p className="text-gray-400">Game #{gameId.slice(0, 8)}</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-6">
            <div className="text-center">
              <div className="flex items-center space-x-2 text-yellow-400">
                <Clock className="w-5 h-5" />
                <span className="text-xl font-mono">{timeLeft}s</span>
              </div>
              <p className="text-gray-400 text-sm">Time Left</p>
            </div>
            
            <div className="text-center">
              <div className="flex items-center space-x-2 text-green-400">
                <DollarSign className="w-5 h-5" />
                <span className="text-xl font-mono">${gameState.pot}</span>
              </div>
              <p className="text-gray-400 text-sm">Prize Pool</p>
            </div>
            
            <div className="text-center">
              <div className="flex items-center space-x-2 text-purple-400">
                <Users className="w-5 h-5" />
                <span className="text-xl font-mono">{players.length}</span>
              </div>
              <p className="text-gray-400 text-sm">Players</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Game Board & Cards */}
          <div className="lg:col-span-2 space-y-6">
            {/* Called Numbers Grid */}
            <div className="bg-gray-800/50 rounded-xl p-6 backdrop-blur-sm">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold flex items-center space-x-2">
                  <RefreshCw className="w-5 h-5" />
                  <span>Called Numbers</span>
                </h2>
                <div className="flex space-x-2">
                  <button className="p-2 bg-gray-700 rounded-lg hover:bg-gray-600">
                    <Settings className="w-5 h-5" />
                  </button>
                  <button className="p-2 bg-gray-700 rounded-lg hover:bg-gray-600">
                    <Volume2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <NumberGrid calledNumbers={gameState.calledNumbers} />
            </div>

            {/* My Bingo Cards */}
            <div className="bg-gray-800/50 rounded-xl p-6 backdrop-blur-sm">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">My Bingo Cards</h2>
                <span className="bg-blue-600 px-3 py-1 rounded-full text-sm">
                  {myCards.length}/5
                </span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {myCards.length === 0 ? (
                  <div className="col-span-full text-center py-12">
                    <p className="text-gray-400 mb-4">No cards purchased yet</p>
                    <button 
                      onClick={() => handlePurchaseCard(Math.floor(Math.random() * 400) + 1)}
                      className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition"
                    >
                      Buy Random Card ($10)
                    </button>
                  </div>
                ) : (
                  myCards.map((card, index) => (
                    <motion.div
                      key={card.number}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      onClick={() => setSelectedCard(card)}
                      className={`cursor-pointer transform transition-transform hover:scale-105 ${
                        selectedCard?.number === card.number ? 'ring-2 ring-blue-500' : ''
                      }`}
                    >
                      <BingoCard 
                        card={card} 
                        calledNumbers={gameState.calledNumbers}
                        compact={true}
                      />
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Players & Chat */}
          <div className="space-y-6">
            {/* Player List */}
            <div className="bg-gray-800/50 rounded-xl p-6 backdrop-blur-sm h-[300px]">
              <h2 className="text-xl font-bold mb-4">Players Online</h2>
              <PlayerList players={players} />
            </div>

            {/* Game Chat */}
            <div className="bg-gray-800/50 rounded-xl p-6 backdrop-blur-sm h-[400px]">
              <GameChat gameId={gameId} />
            </div>

            {/* Game Controls */}
            <div className="bg-gray-800/50 rounded-xl p-6 backdrop-blur-sm">
              <GameControls 
                onClaimBingo={handleClaimBingo}
                gameStatus={gameState.status}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Winner Modal */}
      <AnimatePresence>
        {winner && (
          <WinnerModal winner={winner} onClose={() => setWinner(null)} />
        )}
      </AnimatePresence>

      {/* Selected Card Modal */}
      {selectedCard && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-gray-900 rounded-2xl p-8 max-w-4xl w-full"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">Card #{selectedCard.number}</h2>
              <button
                onClick={() => setSelectedCard(null)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-gray-800 p-6 rounded-xl">
                <BingoCard 
                  card={selectedCard} 
                  calledNumbers={gameState.calledNumbers}
                  compact={false}
                />
              </div>
              <div className="space-y-4">
                <div className="bg-gray-800 p-6 rounded-xl">
                  <h3 className="text-lg font-bold mb-3">Card Statistics</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Numbers Marked:</span>
                      <span className="text-green-400">
                        {selectedCard.numbers.flat().filter(cell => cell.called).length}/25
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Bingo Progress:</span>
                      <span className="text-yellow-400">75%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Card Value:</span>
                      <span className="text-blue-400">$10.00</span>
                    </div>
                  </div>
                </div>
                <div className="bg-gray-800 p-6 rounded-xl">
                  <h3 className="text-lg font-bold mb-3">Quick Actions</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <button className="bg-blue-600 hover:bg-blue-700 py-3 rounded-lg font-semibold transition">
                      Mark Numbers
                    </button>
                    <button className="bg-purple-600 hover:bg-purple-700 py-3 rounded-lg font-semibold transition">
                      Share Card
                    </button>
                    <button className="bg-green-600 hover:bg-green-700 py-3 rounded-lg font-semibold transition">
                      Auto-Mark
                    </button>
                    <button className="bg-red-600 hover:bg-red-700 py-3 rounded-lg font-semibold transition">
                      Sell Card
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default GameRoom;
