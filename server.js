const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Global state for rooms
const rooms = {};

const SUITS = ['H', 'D', 'C', 'S']; // Hearts, Diamonds, Clubs, Spades
const SUIT_NAMES = { H: 'Hearts', D: 'Diamonds', C: 'Clubs', S: 'Spades' };

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (let value = 2; value <= 14; value++) {
      deck.push({ suit, value });
    }
  }
  return deck;
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Bot logic definitions
function evaluateHandStrength(cards) {
  // Simple heuristic for first 5 cards strength
  let score = 0;
  cards.forEach(c => {
    if (c.value === 14) score += 4; // Ace
    else if (c.value === 13) score += 3; // King
    else if (c.value === 12) score += 2; // Queen
    else if (c.value === 11) score += 1; // Jack
  });
  return score;
}

function getBestSuit(cards) {
  const counts = { H: 0, D: 0, C: 0, S: 0 };
  cards.forEach(c => counts[c.suit]++);
  let bestSuit = 'S';
  let maxCount = -1;
  for (const suit of SUITS) {
    if (counts[suit] > maxCount) {
      maxCount = counts[suit];
      bestSuit = suit;
    }
  }
  return bestSuit;
}

// Helper to determine who wins a trick
function determineTrickWinner(trick, trumpSuit, leadSuit) {
  let winningIndex = 0;
  let winningCard = trick[0].card;

  for (let i = 1; i < trick.length; i++) {
    const candidate = trick[i].card;
    // Rule: Trump wins over lead suit. Higher value wins within the same suit.
    const winCurrent = (winningCard, candidate, trumpSuit, leadSuit) => {
      if (candidate.suit === trumpSuit && winningCard.suit !== trumpSuit) {
        return true;
      }
      if (winningCard.suit === trumpSuit && candidate.suit !== trumpSuit) {
        return false;
      }
      if (candidate.suit === winningCard.suit) {
        return candidate.value > winningCard.value;
      }
      // If candidate is lead suit and winner is not lead suit/trump, candidate wins.
      // But winner is always at least lead suit or trump.
      return false;
    };

    if (winCurrent(winningCard, candidate, trumpSuit, leadSuit)) {
      winningCard = candidate;
      winningIndex = i;
    }
  }
  return trick[winningIndex].playerIdx;
}

// Check if a card play is legal
function isPlayLegal(card, playerHand, leadSuit) {
  if (!leadSuit) return true; // Leading can be any card
  if (card.suit === leadSuit) return true; // Following suit is legal
  // If player has cards of the lead suit, they MUST follow suit
  const hasLeadSuit = playerHand.some(c => c.suit === leadSuit);
  return !hasLeadSuit;
}

// Initialize room state
function initGame(room) {
  const g = {
    status: 'DEAL1',
    dealerIdx: Math.floor(Math.random() * 4),
    bidWinnerIdx: -1,
    highestBid: 0,
    trumpSuit: null,
    currentBidderIdx: -1,
    bids: [], // { playerIdx, bid } (bid=0 is Pass)
    hands: [[], [], [], []],
    leadSuit: null,
    currentTrick: [], // { playerIdx, card }
    heap: [], // { playerIdx, card, offset: { x, y, rot } }
    lastTrickWinnerIdx: -1,
    tricksWon: [0, 0, 0, 0],
    tricksCollected: [0, 0], // Team 0 (0 & 2) vs Team 1 (1 & 3)
    trickCount: 0,
    currentTurnIdx: -1,
    is13Sar: false,
    score: 26 // neutral starting score
  };

  room.gameState = g;
  startNewRound(room);
}

function startNewRound(room) {
  const g = room.gameState;
  g.status = 'DEAL1';
  g.bidWinnerIdx = -1;
  g.highestBid = 0;
  g.trumpSuit = null;
  g.bids = [];
  g.leadSuit = null;
  g.currentTrick = [];
  g.heap = [];
  g.lastTrickWinnerIdx = -1;
  g.tricksWon = [0, 0, 0, 0];
  g.tricksCollected = [0, 0];
  g.trickCount = 0;
  g.is13Sar = false;

  // Set next dealer
  g.dealerIdx = (g.dealerIdx + 1) % 4;

  // Shuffle & Deal Part 1 (5 cards each)
  const deck = shuffle(createDeck());
  g.hands = [[], [], [], []];
  for (let p = 0; p < 4; p++) {
    g.hands[p] = deck.splice(0, 5);
    // Sort hands: first by suit, then value
    sortHand(g.hands[p]);
  }
  g.deck = deck;

  // Bidding starts with the player to the dealer's right
  g.currentBidderIdx = (g.dealerIdx + 1) % 4;
  g.status = 'BIDDING';

  sendStateToRoom(room);

  // If bot is up to bid, run bot bidding
  checkAndRunBotBidding(room);
}

function sortHand(hand) {
  const suitOrder = { S: 0, H: 1, D: 2, C: 3 };
  hand.sort((a, b) => {
    if (a.suit !== b.suit) {
      return suitOrder[a.suit] - suitOrder[b.suit];
    }
    return b.value - a.value; // highest value first
  });
}

function dealPart2(room) {
  const g = room.gameState;
  g.status = 'DEAL2';

  // Deal remaining 8 cards each
  for (let p = 0; p < 4; p++) {
    const additional = g.deck.splice(0, 8);
    g.hands[p] = g.hands[p].concat(additional);
    sortHand(g.hands[p]);
  }
  g.deck = []; // clear

  // Enter 13-Sar Cooldown phase
  g.status = 'COOLDOWN';
  g.cooldownTimeLeft = 10;

  if (room.cooldownTimerId) {
    clearInterval(room.cooldownTimerId);
  }

  sendStateToRoom(room);

  // Trigger bot decision heuristic if active
  checkAndRunBotCooldown(room);

  room.cooldownTimerId = setInterval(() => {
    g.cooldownTimeLeft--;
    if (g.cooldownTimeLeft <= 0) {
      clearInterval(room.cooldownTimerId);
      room.cooldownTimerId = null;
      // Cooldown expired, begin standard playing round
      g.status = 'PLAYING';
      g.currentTurnIdx = g.bidWinnerIdx;
      sendStateToRoom(room);
      checkAndRunBotPlay(room);
    } else {
      sendStateToRoom(room);
    }
  }, 1000);
}

function checkAndRunBotCooldown(room) {
  const g = room.gameState;
  if (g.status !== 'COOLDOWN') return;

  room.players.forEach((player, playerIdx) => {
    if (!player.isBot) return;

    setTimeout(() => {
      if (g.status !== 'COOLDOWN') return;
      const hand = g.hands[playerIdx];
      const trumpCards = hand.filter(c => c.suit === g.trumpSuit);
      const hasAce = trumpCards.some(c => c.value === 14);
      const hasKing = trumpCards.some(c => c.value === 13);
      const otherAces = hand.filter(c => c.suit !== g.trumpSuit && c.value === 14).length;
      
      // Heuristic: Bot upgrades if it has 7+ trumps including Ace & King, and 2 other Aces
      if (trumpCards.length >= 7 && hasAce && hasKing && otherAces >= 2) {
        console.log(`Bot ${player.name} called Teree!`);
        upgradeTo13Sar(room, playerIdx);
      } else if (g.bidWinnerIdx === playerIdx) {
        // Only the original bid winner decides to skip/end the cooldown
        console.log(`Bot ${player.name} skipped 13-Sar.`);
        endCooldown(room);
      }
    }, 1500 + playerIdx * 200);
  });
}

function upgradeTo13Sar(room, callerIdx) {
  const g = room.gameState;
  if (g.status !== 'COOLDOWN') return;
  
  if (room.cooldownTimerId) {
    clearInterval(room.cooldownTimerId);
    room.cooldownTimerId = null;
  }
  
  g.bidWinnerIdx = callerIdx;
  g.highestBid = 13;
  g.is13Sar = false; // Delay teammate card reveal until after the Trump suit is chosen!
  g.status = 'TRUMP_SELECTION'; // Go to Trump Selection for the Teree caller!
  g.currentTurnIdx = callerIdx;
  
  sendStateToRoom(room);
  checkAndRunBotTrumpSelection(room);
}

function endCooldown(room) {
  const g = room.gameState;
  if (g.status !== 'COOLDOWN') return;
  
  if (room.cooldownTimerId) {
    clearInterval(room.cooldownTimerId);
    room.cooldownTimerId = null;
  }
  
  g.status = 'PLAYING';
  g.currentTurnIdx = g.bidWinnerIdx;
  
  sendStateToRoom(room);
  checkAndRunBotPlay(room);
}

function checkAndRunBotBidding(room) {
  const g = room.gameState;
  if (g.status !== 'BIDDING') return;

  const activePlayer = room.players[g.currentBidderIdx];
  if (!activePlayer || !activePlayer.isBot) return;

  // Bot bidding logic
  setTimeout(() => {
    const hand = g.hands[g.currentBidderIdx];
    const strength = evaluateHandStrength(hand);
    
    // Check what the current highest bid is
    const minBid = 7;
    const currentMax = g.highestBid;
    
    let botBid = 0; // Pass
    
    if (strength >= 10 && currentMax < 9) {
      botBid = Math.max(minBid, currentMax + 1);
    } else if (strength >= 8 && currentMax < 8) {
      botBid = Math.max(minBid, currentMax + 1);
    } else if (strength >= 6 && currentMax < 7) {
      botBid = minBid;
    }

    // Clamp initial bidding to 12. 13-Sar is called during cooldown.
    if (botBid > 12) botBid = 12;

    if (botBid > currentMax) {
      processBid(room, g.currentBidderIdx, botBid);
    } else {
      processBid(room, g.currentBidderIdx, 0); // Pass
    }
  }, 1000);
}

function processBid(room, playerIdx, bidValue) {
  const g = room.gameState;
  if (g.status !== 'BIDDING' || g.currentBidderIdx !== playerIdx) return;

  // Enforce validation: bid must be either 0 (Pass) or between 7 and 12, and must outbid the current high bid
  if (bidValue !== 0) {
    if (bidValue < 7 || bidValue > 12 || bidValue <= g.highestBid) {
      return; // Ignore invalid bids
    }
  }

  g.bids.push({ playerIdx, bid: bidValue });

  if (bidValue > 0) {
    g.highestBid = bidValue;
    g.bidWinnerIdx = playerIdx;
  }

  // Find next bidder
  // Bidding ends when all players have bid once
  if (g.bids.length === 4) {
    if (g.highestBid === 0) {
      // Everyone passed, force a minimum bid of 7 on the dealer or redeal
      // Let's force dealer (or player right of dealer) to bid 7
      g.highestBid = 7;
      g.bidWinnerIdx = (g.dealerIdx + 1) % 4;
    }
    
    g.status = 'TRUMP_SELECTION';
    g.currentTurnIdx = g.bidWinnerIdx;
    
    sendStateToRoom(room);
    
    // Bot trump selection
    checkAndRunBotTrumpSelection(room);
  } else {
    g.currentBidderIdx = (g.currentBidderIdx + 1) % 4;
    sendStateToRoom(room);
    checkAndRunBotBidding(room);
  }
}

function checkAndRunBotTrumpSelection(room) {
  const g = room.gameState;
  if (g.status !== 'TRUMP_SELECTION') return;

  const activePlayer = room.players[g.bidWinnerIdx];
  if (!activePlayer || !activePlayer.isBot) return;

  setTimeout(() => {
    const hand = g.hands[g.bidWinnerIdx];
    const bestSuit = getBestSuit(hand);
    processTrumpSelection(room, g.bidWinnerIdx, bestSuit);
  }, 1000);
}

function processTrumpSelection(room, playerIdx, suit) {
  const g = room.gameState;
  if (g.status !== 'TRUMP_SELECTION' || g.bidWinnerIdx !== playerIdx) return;

  g.trumpSuit = suit;
  
  if (g.highestBid === 13) {
    g.is13Sar = true;
  }

  // If cards are already dealt (hands have 13 cards), start playing directly
  if (g.hands[0] && g.hands[0].length === 13) {
    g.status = 'PLAYING';
    g.currentTurnIdx = g.bidWinnerIdx;
    
    sendStateToRoom(room);
    checkAndRunBotPlay(room);
  } else {
    dealPart2(room);
  }
}

function checkAndRunBotPlay(room) {
  const g = room.gameState;
  if (g.status !== 'PLAYING') return;

  // Determine who plays the current turn.
  // In 13-Sar commander mode, the bidder plays both their own hand and their teammate's hand.
  // The teammate is (bidWinnerIdx + 2) % 4.
  let playOwnerIdx = g.currentTurnIdx;
  if (g.is13Sar && g.currentTurnIdx === (g.bidWinnerIdx + 2) % 4) {
    playOwnerIdx = g.bidWinnerIdx; // Bidder plays for teammate
  }

  const activePlayer = room.players[playOwnerIdx];
  if (!activePlayer || !activePlayer.isBot) return;

  setTimeout(() => {
    botPlayCard(room, g.currentTurnIdx);
  }, 1200);
}

function botPlayCard(room, playerIdx) {
  const g = room.gameState;
  const hand = g.hands[playerIdx];
  if (hand.length === 0) return;

  // Filter legal cards
  let legalCards = hand.filter(c => isPlayLegal(c, hand, g.leadSuit));
  if (legalCards.length === 0) legalCards = hand; // Fallback

  // Pick a card
  // Bot logic:
  // - If leading: pick highest card of a strong suit, or lowest card if saving high cards
  // - If following: if we can win, try to play high. If teammate is winning, discard low.
  let selectedCard = legalCards[0];

  // Try to follow simple strategy
  if (!g.leadSuit) {
    // Leading: try to play high non-trump or highest card
    const nonTrumps = legalCards.filter(c => c.suit !== g.trumpSuit);
    if (nonTrumps.length > 0) {
      nonTrumps.sort((a, b) => b.value - a.value);
      selectedCard = nonTrumps[0];
    } else {
      legalCards.sort((a, b) => b.value - a.value);
      selectedCard = legalCards[0];
    }
  } else {
    // Following suit
    const matchingSuit = legalCards.filter(c => c.suit === g.leadSuit);
    if (matchingSuit.length > 0) {
      // Determine if partner is winning
      const partnerIdx = (playerIdx + 2) % 4;
      let partnerWinning = false;
      if (g.currentTrick.length > 0) {
        // Evaluate winner of the trick so far
        const currentWinner = determineTrickWinner(g.currentTrick, g.trumpSuit, g.leadSuit);
        if (currentWinner === partnerIdx) {
          partnerWinning = true;
        }
      }

      matchingSuit.sort((a, b) => b.value - a.value);
      if (partnerWinning) {
        // Discard lowest card of matching suit
        selectedCard = matchingSuit[matchingSuit.length - 1];
      } else {
        // Play highest to win
        selectedCard = matchingSuit[0];
      }
    } else {
      // Cutting/Discarding
      const trumps = legalCards.filter(c => c.suit === g.trumpSuit);
      if (trumps.length > 0) {
        trumps.sort((a, b) => a.value - b.value); // low trump to cut
        selectedCard = trumps[0];
      } else {
        legalCards.sort((a, b) => a.value - b.value); // throw away lowest
        selectedCard = legalCards[0];
      }
    }
  }

  processPlayCard(room, playerIdx, selectedCard);
}

function processPlayCard(room, playerIdx, card) {
  const g = room.gameState;
  if (g.status !== 'PLAYING' || g.currentTurnIdx !== playerIdx) return;

  // Validate card is in hand
  const hand = g.hands[playerIdx];
  const cardIndex = hand.findIndex(c => c.suit === card.suit && c.value === card.value);
  if (cardIndex === -1) return;

  // Validate play is legal
  if (!isPlayLegal(card, hand, g.leadSuit)) return;

  // Remove card from hand
  hand.splice(cardIndex, 1);

  // Set lead suit if it is the first card of the trick
  if (g.currentTrick.length === 0) {
    g.leadSuit = card.suit;
  }

  // Create a randomized layout offset for the center heap representation (to make previous cards visible)
  const offset = {
    x: (Math.random() - 0.5) * 40,  // random X offset between -20px and 20px
    y: (Math.random() - 0.5) * 40,  // random Y offset between -20px and 20px
    rot: (Math.random() - 0.5) * 30 // random rotation between -15deg and 15deg
  };

  g.currentTrick.push({ playerIdx, card, offset });
  g.currentTurnIdx = (g.currentTurnIdx + 1) % 4;

  // Emit event to update center heap immediately
  sendStateToRoom(room);

  // Trick is complete when all 4 players have played
  if (g.currentTrick.length === 4) {
    setTimeout(() => {
      resolveTrick(room);
    }, 1500); // give players time to see the trick
  } else {
    checkAndRunBotPlay(room);
  }
}

function resolveTrick(room) {
  const g = room.gameState;
  
  // Determine winner of the 4-card trick
  const winnerIdx = determineTrickWinner(g.currentTrick, g.trumpSuit, g.leadSuit);
  g.trickCount++;

  // Add the 4 played cards from current trick to the heap
  g.heap = g.heap.concat(g.currentTrick);
  g.currentTrick = [];
  g.leadSuit = null;

  // Check 13-Sar special rule:
  // If bidding 13 (is13Sar), opponents (not the bidder/partner) winning even a single trick means immediate loss.
  const bidderTeam = [g.bidWinnerIdx, (g.bidWinnerIdx + 2) % 4];
  const opponentsWonTrick = !bidderTeam.includes(winnerIdx);
  
  if (g.is13Sar && opponentsWonTrick) {
    // Bidding team loses immediately!
    resolveRound(room, false);
    return;
  }

  // Check double-sir capture condition:
  // Heap collected ONLY if the winner of this trick is the SAME as the winner of the previous trick.
  let heapCollected = false;
  let collectingTeam = -1; // 0 or 1

  if (g.lastTrickWinnerIdx !== -1) {
    if (winnerIdx === g.lastTrickWinnerIdx) {
      heapCollected = true;
      collectingTeam = winnerIdx % 2 === 0 ? 0 : 1;
    }
  }

  // The 13th trick winner always collects whatever remains in the heap
  if (g.trickCount === 13) {
    heapCollected = true;
    collectingTeam = winnerIdx % 2 === 0 ? 0 : 1;
  }

  if (heapCollected) {
    // Add the tricks in heap to the team's total collected.
    // Total tricks in heap = heap.length / 4.
    const tricksInHeap = g.heap.length / 4;
    g.tricksCollected[collectingTeam] += tricksInHeap;
    g.tricksWon[winnerIdx] += tricksInHeap; // Increment individual tricks won only when they actually collect the heap!

    // Clear the heap
    // In frontend, we will animate cards flying to the collectingTeam
    g.heap = [];
  }

  g.lastTrickWinnerIdx = winnerIdx;
  g.currentTurnIdx = winnerIdx; // winner of trick leads the next trick

  // Check if round is over (13 tricks completed)
  if (g.trickCount === 13) {
    // Check if bidder team got their bid
    const bidderTeamIdx = g.bidWinnerIdx % 2 === 0 ? 0 : 1;
    const collectedByBidder = g.tricksCollected[bidderTeamIdx];
    const success = collectedByBidder >= g.highestBid;
    resolveRound(room, success);
  } else {
    sendStateToRoom(room);
    checkAndRunBotPlay(room);
  }
}

function resolveRound(room, success) {
  const g = room.gameState;
  g.status = 'ROUND_OVER';

  const bidderTeamIdx = g.bidWinnerIdx % 2 === 0 ? 0 : 1;
  const bidVal = g.highestBid;

  let pull = bidVal;
  
  if (g.is13Sar) {
    if (success) {
      pull = 13;
    } else {
      pull = 26; // Double penalty for failing 13-Sar
    }
  }

  // Adjust Tug-of-war score
  // Team 0 pulls score UP (towards 52). Team 1 pulls score DOWN (towards 0).
  // If Team 0 was the bidder:
  // - If success: score goes +pull.
  // - If fail: score goes -pull.
  // If Team 1 was the bidder:
  // - If success: score goes -pull.
  // - If fail: score goes +pull.
  let change = 0;
  if (bidderTeamIdx === 0) {
    change = success ? pull : -pull;
  } else {
    change = success ? -pull : pull;
  }

  g.score += change;

  // Clamp score between 0 and 52
  if (g.score >= 52) {
    g.score = 52;
    g.status = 'GAME_OVER';
  } else if (g.score <= 0) {
    g.score = 0;
    g.status = 'GAME_OVER';
  }

  sendStateToRoom(room);
}

// Room message broadcast helpers
function sendStateToRoom(room) {
  const g = room.gameState;
  if (!g) return;

  room.players.forEach((player, idx) => {
    if (player.isBot) return;

    // Filter state for each player to prevent cheating:
    // - Hands: player can only see their own hand.
    // - EXCEPTION 13-Sar: If teammate's cards are exposed, everyone can see the teammate's hand.
    // Teammate of bidder is (bidWinnerIdx + 2) % 4.
    const filteredHands = [[], [], [], []];
    for (let p = 0; p < 4; p++) {
      if (p === idx) {
        filteredHands[p] = g.hands[p];
      } else if (g.is13Sar && p === (g.bidWinnerIdx + 2) % 4) {
        filteredHands[p] = g.hands[p]; // exposed teammate hand
      } else {
        // Mask other players' cards, only send count
        filteredHands[p] = g.hands[p].map(() => ({ hidden: true }));
      }
    }

    const stateToSend = {
      status: g.status,
      dealerIdx: g.dealerIdx,
      bidWinnerIdx: g.bidWinnerIdx,
      highestBid: g.highestBid,
      trumpSuit: g.trumpSuit,
      currentBidderIdx: g.currentBidderIdx,
      bids: g.bids,
      hands: filteredHands,
      leadSuit: g.leadSuit,
      currentTrick: g.currentTrick,
      heap: g.heap,
      lastTrickWinnerIdx: g.lastTrickWinnerIdx,
      tricksWon: g.tricksWon,
      tricksCollected: g.tricksCollected,
      trickCount: g.trickCount,
      currentTurnIdx: g.currentTurnIdx,
      is13Sar: g.is13Sar,
      cooldownTimeLeft: g.cooldownTimeLeft || 0,
      score: g.score,
      myPlayerIdx: idx,
      players: room.players.map(p => ({ name: p.name, isBot: p.isBot }))
    };

    io.to(player.id).emit('game_state_update', stateToSend);
  });
}

function handleDisconnect(socket) {
  for (const roomId in rooms) {
    const room = rooms[roomId];
    const playerIdx = room.players.findIndex(p => p.id === socket.id);
    if (playerIdx !== -1) {
      const player = room.players[playerIdx];
      // If game has started, replace player with a bot so game doesn't break
      if (room.gameState && room.gameState.status !== 'LOBBY') {
        room.players[playerIdx] = {
          id: `bot_${Date.now()}_${playerIdx}`,
          name: `${player.name} (Bot)`,
          isBot: true
        };
        
        // Garbage collection: If no human players are left in the room, delete it immediately.
        const humanCount = room.players.filter(p => !p.isBot).length;
        if (humanCount === 0) {
          console.log(`Cleaning up empty/abandoned room: ${roomId}`);
          if (room.cooldownTimerId) {
            clearInterval(room.cooldownTimerId);
            room.cooldownTimerId = null;
          }
          delete rooms[roomId];
        } else {
          io.to(roomId).emit('chat_message', {
            sender: 'System',
            text: `${player.name} left. Replaced with a Bot.`
          });
          sendStateToRoom(room);
          // Check if bot needs to play/bid immediately
          checkAndRunBotBidding(room);
          checkAndRunBotTrumpSelection(room);
          checkAndRunBotPlay(room);
        }
      } else {
        // In lobby, just remove the player
        room.players.splice(playerIdx, 1);
        if (room.players.length === 0) {
          delete rooms[roomId];
        } else {
          io.to(roomId).emit('room_players_update', room.players);
          io.to(roomId).emit('chat_message', {
            sender: 'System',
            text: `${player.name} left the lobby.`
          });
        }
      }
      break;
    }
  }
}

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join_room', ({ roomId, playerName }) => {
    const id = roomId.trim().toUpperCase() || 'DEFAULT';
    socket.join(id);

    if (!rooms[id]) {
      rooms[id] = {
        id,
        players: [],
        gameState: null
      };
    }

    const room = rooms[id];

    if (room.players.length >= 4) {
      socket.emit('error_message', 'Room is already full.');
      return;
    }

    const newPlayer = {
      id: socket.id,
      name: playerName.trim() || `Player ${room.players.length + 1}`,
      isBot: false
    };

    room.players.push(newPlayer);
    io.to(id).emit('room_players_update', room.players);

    io.to(id).emit('chat_message', {
      sender: 'System',
      text: `${newPlayer.name} joined the room.`
    });

    // Auto-start if we reach 4 human players
    if (room.players.length === 4) {
      initGame(room);
    }
  });

  socket.on('add_bot', () => {
    // Find room of this socket
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (room.players.some(p => p.id === socket.id)) {
        if (room.players.length >= 4) {
          socket.emit('error_message', 'Room is already full.');
          return;
        }

        const botIdx = room.players.length;
        const botNames = ['DeepBlue', 'AlphaGo', 'Siri', 'Alexa'];
        const newBot = {
          id: `bot_${Date.now()}_${botIdx}`,
          name: botNames[botIdx - 1] || `Bot ${botIdx}`,
          isBot: true
        };

        room.players.push(newBot);
        io.to(roomId).emit('room_players_update', room.players);
        io.to(roomId).emit('chat_message', {
          sender: 'System',
          text: `${newBot.name} (Bot) added.`
        });

        if (room.players.length === 4) {
          initGame(room);
        }
        break;
      }
    }
  });

  socket.on('start_game_early', () => {
    // Fill remaining spots with bots and start
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (room.players.some(p => p.id === socket.id)) {
        while (room.players.length < 4) {
          const botIdx = room.players.length;
          const botNames = ['DeepBlue', 'AlphaGo', 'Siri', 'Alexa'];
          room.players.push({
            id: `bot_${Date.now()}_${botIdx}`,
            name: botNames[botIdx - 1] || `Bot ${botIdx}`,
            isBot: true
          });
        }
        io.to(roomId).emit('room_players_update', room.players);
        initGame(room);
        break;
      }
    }
  });

  socket.on('place_bid', (bidValue) => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const playerIdx = room.players.findIndex(p => p.id === socket.id);
      if (playerIdx !== -1) {
        processBid(room, playerIdx, bidValue);
        break;
      }
    }
  });

  socket.on('select_trump', (suit) => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const playerIdx = room.players.findIndex(p => p.id === socket.id);
      if (playerIdx !== -1) {
        processTrumpSelection(room, playerIdx, suit);
        break;
      }
    }
  });

  socket.on('play_card', (card) => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      let activeTurnIdx = room.gameState?.currentTurnIdx;
      
      // Check if this socket owns the active turn.
      // In 13-Sar, the bidder plays both their own hand and teammate's hand.
      let playerIdx = room.players.findIndex(p => p.id === socket.id);
      
      if (playerIdx !== -1) {
        let isAuthorized = (playerIdx === activeTurnIdx);
        
        // 13-Sar Commander Mode override
        if (room.gameState?.is13Sar && activeTurnIdx === (room.gameState.bidWinnerIdx + 2) % 4) {
          isAuthorized = (playerIdx === room.gameState.bidWinnerIdx);
          // If authorized, we play the teammate's card (turn index remains teammate, but input is from bidder)
          if (isAuthorized) {
            processPlayCard(room, activeTurnIdx, card);
            break;
          }
        }

        if (isAuthorized) {
          processPlayCard(room, playerIdx, card);
        }
        break;
      }
    }
  });

  socket.on('restart_round', () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (room.players.some(p => p.id === socket.id)) {
        if (room.gameState && (room.gameState.status === 'ROUND_OVER' || room.gameState.status === 'GAME_OVER')) {
          // If game is completely over, reset Tug-of-war score to 26
          if (room.gameState.status === 'GAME_OVER') {
            room.gameState.score = 26;
          }
          startNewRound(room);
        }
        break;
      }
    }
  });

  socket.on('chat_message', (text) => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const player = room.players.find(p => p.id === socket.id);
      if (player) {
        io.to(roomId).emit('chat_message', {
          sender: player.name,
          text: text
        });
        break;
      }
    }
  });

  socket.on('leave_room', () => {
    handleDisconnect(socket);
    socket.leaveAll(); // makes socket leave all current rooms
  });

  socket.on('call_13_sar', () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const playerIdx = room.players.findIndex(p => p.id === socket.id);
      if (playerIdx !== -1 && room.gameState?.status === 'COOLDOWN') {
        upgradeTo13Sar(room, playerIdx);
        break;
      }
    }
  });

  socket.on('skip_13_cooldown', () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const playerIdx = room.players.findIndex(p => p.id === socket.id);
      if (playerIdx !== -1 && room.gameState?.status === 'COOLDOWN' && room.gameState.bidWinnerIdx === playerIdx) {
        endCooldown(room);
        break;
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    handleDisconnect(socket);
  });
});

server.listen(PORT, () => {
  console.log(`Teree server running on http://localhost:${PORT}`);
});
