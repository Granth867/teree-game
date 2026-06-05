const socket = io();

// UI Elements - Screens
const loginScreen = document.getElementById('login-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');

// UI Elements - Login Form
const usernameInput = document.getElementById('username');
const roomIdInput = document.getElementById('room-id');
const joinBtn = document.getElementById('join-btn');

// UI Elements - Lobby
const lobbyRoomDisplay = document.getElementById('lobby-room-display');
const playersList = document.getElementById('players-list');
const addBotBtn = document.getElementById('add-bot-btn');
const startEarlyBtn = document.getElementById('start-early-btn');
const lobbyChatMessages = document.getElementById('lobby-chat-messages');
const lobbyChatInput = document.getElementById('lobby-chat-input');
const lobbySendBtn = document.getElementById('lobby-send-btn');

// UI Elements - Game Headers
const gameRoomDisplay = document.getElementById('game-room-display');
const trumpIndicator = document.getElementById('trump-indicator');
const matchInfoCenter = document.getElementById('match-info-center');
const tugOfWarMarker = document.getElementById('tug-of-war-marker');
const trumpPuck = document.getElementById('trump-puck');
const puckSuitIcon = document.getElementById('puck-suit-icon');

// UI Elements - Game Details
const bidWinnerDisplay = document.getElementById('bid-winner-display');
const bidValueDisplay = document.getElementById('bid-value-display');
const heapSizeDisplay = document.getElementById('heap-size-display');
const collectedADisplay = document.getElementById('collected-a-display');
const collectedBDisplay = document.getElementById('collected-b-display');
const gameChatMessages = document.getElementById('game-chat-messages');
const gameChatInput = document.getElementById('game-chat-input');
const gameSendBtn = document.getElementById('game-send-btn');

// UI Elements - Modals
const biddingModal = document.getElementById('bidding-modal');
const bidHighInfo = document.getElementById('current-high-bid-info');
const trumpModal = document.getElementById('trump-modal');
const roundOutcomeModal = document.getElementById('round-outcome-modal');
const roundOutcomeTitle = document.getElementById('round-outcome-title');
const roundOutcomeDetails = document.getElementById('round-outcome-details');
const nextRoundBtn = document.getElementById('next-round-btn');
const gameOverModal = document.getElementById('game-over-modal');
const winnerTeamDisplay = document.getElementById('winner-team-display');
const restartMatchBtn = document.getElementById('restart-match-btn');

// Local Game State Variables
let myPlayerIdx = -1;
let currentGameState = null;

// Suit symbols dictionary
const SUIT_SYMBOLS = { H: '♥️', D: '♦️', C: '♣️', S: '♠️' };
const PUCK_SUIT_SYMBOLS = { H: '♥', D: '♦', C: '♣', S: '♠' };
const SUIT_CLASSES = { H: 'red', D: 'red', C: 'black', S: 'black' };
const SUIT_FULL_NAMES = { H: 'Hearts', D: 'Diamonds', C: 'Clubs', S: 'Spades' };

// Scalable Image Asset configuration pointing to local assets
const CARD_IMAGE_BASE = '/assets/cards';

function getCardImageUrl(card) {
  if (!card || card.hidden) {
    return `${CARD_IMAGE_BASE}/back.png`;
  }
  
  let valStr = card.value.toString();
  if (card.value === 14) valStr = 'ace';
  else if (card.value === 13) valStr = 'king';
  else if (card.value === 12) valStr = 'queen';
  else if (card.value === 11) valStr = 'jack';

  const suitMap = { H: 'hearts', D: 'diamonds', C: 'clubs', S: 'spades' };
  const suitName = suitMap[card.suit] || 'spades';

  return `${CARD_IMAGE_BASE}/${valStr}_of_${suitName}.svg`;
}

// Initialize Username with a random guest name
usernameInput.value = `Player_${Math.floor(100 + Math.random() * 900)}`;

// Lobby / Login Event Listeners
joinBtn.addEventListener('click', () => {
  const name = usernameInput.value.trim();
  const room = roomIdInput.value.trim().toUpperCase() || 'LOBBY1';
  if (!name) return alert('Please enter a name');
  
  socket.emit('join_room', { roomId: room, playerName: name });
  lobbyRoomDisplay.textContent = room;
  gameRoomDisplay.textContent = room;
});

addBotBtn.addEventListener('click', () => {
  socket.emit('add_bot');
});

startEarlyBtn.addEventListener('click', () => {
  socket.emit('start_game_early');
});

function clearAllModals() {
  const modalIds = ['bidding-modal', 'trump-modal', 'round-outcome-modal', 'game-over-modal', 'cooldown-modal'];
  modalIds.forEach(id => {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
  });
}

// Leave Lobby / Leave Game Event Listeners
const leaveLobbyBtn = document.getElementById('leave-lobby-btn');
leaveLobbyBtn.addEventListener('click', () => {
  if (confirm('Are you sure you want to leave the lobby?')) {
    socket.emit('leave_room');
    lobbyScreen.classList.remove('active');
    loginScreen.classList.add('active');
    clearAllModals();
    myPlayerIdx = -1;
    currentGameState = null;
  }
});

const leaveGameBtn = document.getElementById('leave-game-btn');
leaveGameBtn.addEventListener('click', () => {
  if (confirm('Are you sure you want to leave the game? This will replace you with a bot.')) {
    socket.emit('leave_room');
    gameScreen.classList.remove('active');
    loginScreen.classList.add('active');
    clearAllModals();
    myPlayerIdx = -1;
    currentGameState = null;
  }
});

// Cooldown Modal Event Listeners
const call13Btn = document.getElementById('call-13-btn');
const skip13Btn = document.getElementById('skip-13-btn');
call13Btn.addEventListener('click', () => {
  socket.emit('call_13_sar');
});
skip13Btn.addEventListener('click', () => {
  socket.emit('skip_13_cooldown');
});

// Bidding Event Listeners
const bidButtons = document.querySelectorAll('.bid-val-btn');
bidButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const val = parseInt(btn.getAttribute('data-value'));
    socket.emit('place_bid', val);
  });
});

document.getElementById('bid-pass-btn').addEventListener('click', () => {
  socket.emit('place_bid', 0); // 0 = Pass
});

// Trump Selection Event Listeners
const trumpButtons = document.querySelectorAll('.trump-suit-btn');
trumpButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const suit = btn.getAttribute('data-suit');
    socket.emit('select_trump', suit);
  });
});

// Next Round / Restart Listeners
nextRoundBtn.addEventListener('click', () => {
  socket.emit('restart_round');
  roundOutcomeModal.classList.remove('active');
});

restartMatchBtn.addEventListener('click', () => {
  socket.emit('restart_round');
  gameOverModal.classList.remove('active');
});

// Chat Event Listeners
function sendChatMessage(inputEl) {
  const text = inputEl.value.trim();
  if (text) {
    socket.emit('chat_message', text);
    inputEl.value = '';
  }
}

lobbySendBtn.addEventListener('click', () => sendChatMessage(lobbyChatInput));
lobbyChatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendChatMessage(lobbyChatInput);
});

gameSendBtn.addEventListener('click', () => sendChatMessage(gameChatInput));
gameChatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendChatMessage(gameChatInput);
});

// Socket.io Handlers
socket.on('error_message', (msg) => {
  alert(msg);
});

socket.on('room_players_update', (players) => {
  loginScreen.classList.remove('active');
  lobbyScreen.classList.add('active');
  gameScreen.classList.remove('active');

  playersList.innerHTML = '';
  players.forEach((p, idx) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span><strong>Player ${idx + 1}:</strong> ${p.name}</span>
      <span class="badge">${p.isBot ? 'BOT' : 'HUMAN'}</span>
    `;
    playersList.appendChild(li);
  });
});

socket.on('chat_message', ({ sender, text }) => {
  const msgHtml = `<p><span class="sender">${sender}:</span> ${text}</p>`;
  
  lobbyChatMessages.innerHTML += msgHtml;
  lobbyChatMessages.scrollTop = lobbyChatMessages.scrollHeight;

  gameChatMessages.innerHTML += msgHtml;
  gameChatMessages.scrollTop = gameChatMessages.scrollHeight;
});

socket.on('game_state_update', (state) => {
  currentGameState = state;
  myPlayerIdx = state.myPlayerIdx;

  // Move from Lobby to Game Screen if active
  if (state.status !== 'LOBBY') {
    loginScreen.classList.remove('active');
    lobbyScreen.classList.remove('active');
    gameScreen.classList.add('active');
  }

  updateHeaderAndScoreboard(state);
  updatePlayerInfoSlots(state);
  updateGameDetailsPanel(state);
  renderHands(state);
  renderCenterHeap(state);
  handleModals(state);
});

// UI Render Sub-routines
function updateHeaderAndScoreboard(state) {
  // Trump indicator badge (wax seal style)
  if (state.trumpSuit) {
    const suitChar = SUIT_SYMBOLS[state.trumpSuit];
    const isRed = SUIT_CLASSES[state.trumpSuit] === 'red';
    trumpIndicator.innerHTML = `<span class="${isRed ? 'color-red' : 'color-black'}">${suitChar} ${SUIT_FULL_NAMES[state.trumpSuit]}</span>`;
  } else {
    trumpIndicator.textContent = 'Not Chosen Yet';
  }

  // Update physical Red Trump Puck on the table
  if (state.trumpSuit && state.bidWinnerIdx !== -1) {
    const suitChar = PUCK_SUIT_SYMBOLS[state.trumpSuit];
    puckSuitIcon.textContent = suitChar;
    
    // Set text shadow / color for suit icon to be high-contrast on red wax
    const isRed = SUIT_CLASSES[state.trumpSuit] === 'red';
    if (isRed) {
      puckSuitIcon.style.color = '#ffffff'; /* Brilliant white for red suits */
      puckSuitIcon.style.textShadow = '-1px -1px 0px #600, 1px 1px 2px #000';
    } else {
      puckSuitIcon.style.color = '#ffd700'; /* Brilliant gold for black suits */
      puckSuitIcon.style.textShadow = '-1px -1px 0px #540, 1px 1px 2px #000';
    }

    trumpPuck.classList.remove('hidden');
  } else {
    trumpPuck.classList.add('hidden');
  }

  // Score marker position
  // scale 0 to 52, 26 is center
  const pct = (state.score / 52) * 100;
  tugOfWarMarker.style.left = `${pct}%`;
  matchInfoCenter.textContent = `Tug of War Score: ${state.score} / 52`;
}

function updatePlayerInfoSlots(state) {
  // sIdx maps DOM elements 0..3:
  // 0: Bottom (Self)
  // 1: Right
  // 2: Top (Partner)
  // 3: Left
  const slots = [
    document.getElementById('slot-0'),
    document.getElementById('slot-1'),
    document.getElementById('slot-2'),
    document.getElementById('slot-3')
  ];

  for (let sIdx = 0; sIdx < 4; sIdx++) {
    const actualPlayerIdx = (myPlayerIdx + sIdx) % 4;
    const pData = state.players[actualPlayerIdx];
    const slotEl = slots[sIdx];

    if (pData) {
      // Name label
      let roleText = '';
      if (actualPlayerIdx === state.dealerIdx) roleText += ' (Dealer)';
      if (state.is13Sar && actualPlayerIdx === (state.bidWinnerIdx + 2) % 4) roleText += ' [EXPOSED]';

      slotEl.querySelector('.player-name-text').textContent = pData.name + roleText;
      
      // Star dealer
      if (actualPlayerIdx === state.dealerIdx) {
        slotEl.classList.add('is-dealer');
      } else {
        slotEl.classList.remove('is-dealer');
      }

      // Active player turn indicator
      if (state.currentTurnIdx === actualPlayerIdx && state.status === 'PLAYING') {
        slotEl.classList.add('active');
      } else {
        slotEl.classList.remove('active');
      }

      // Individual Sirs/tricks won (just for reference)
      document.getElementById(`tricks-won-${sIdx}`).textContent = state.tricksWon[actualPlayerIdx];
    }
  }
}

function updateGameDetailsPanel(state) {
  if (state.bidWinnerIdx !== -1) {
    const bidWinnerName = state.players[state.bidWinnerIdx]?.name || 'N/A';
    bidWinnerDisplay.textContent = bidWinnerName;
    bidValueDisplay.textContent = state.highestBid;
  } else {
    bidWinnerDisplay.textContent = '-';
    bidValueDisplay.textContent = '-';
  }

  const heapSize = state.heap.length;
  heapSizeDisplay.textContent = `${heapSize} cards (${heapSize / 4} Sirs)`;

  // Total collected Sirs (Team A = index 0, Team B = index 1)
  // Team A is Players 0 and 2. Team B is Players 1 and 3.
  collectedADisplay.textContent = `${state.tricksCollected[0]} Sirs`;
  collectedBDisplay.textContent = `${state.tricksCollected[1]} Sirs`;
}

// Convert numeric card rank to display character
function getCardRankChar(val) {
  if (val === 14) return 'A';
  if (val === 13) return 'K';
  if (val === 12) return 'Q';
  if (val === 11) return 'J';
  return val.toString();
}

function renderHands(state) {
  // sIdx DOM slots:
  // 0 = bottom (self)
  // 1 = right
  // 2 = top (partner)
  // 3 = left
  for (let sIdx = 0; sIdx < 4; sIdx++) {
    const actualPlayerIdx = (myPlayerIdx + sIdx) % 4;
    let hand = state.hands[actualPlayerIdx];
    const handContainer = document.getElementById(`hand-${sIdx}`);
    handContainer.innerHTML = '';

    if (!hand) continue;

    // Compact face-down hands for opponents (slots 1, 2, 3) to at most 5 cards as representation.
    // Decrease the cards when they go below 5.
    if (sIdx !== 0 && hand.length > 5 && hand.every(card => card.hidden)) {
      hand = hand.slice(0, 5);
    }

    // If cards are visible (not face down) and Trump suit is active, sort Trump suit to leftmost side
    if (hand.length > 0 && !hand[0].hidden && state.trumpSuit) {
      hand = [...hand].sort((a, b) => {
        const aIsTrump = (a.suit === state.trumpSuit);
        const bIsTrump = (b.suit === state.trumpSuit);
        if (aIsTrump && !bIsTrump) return -1;
        if (!aIsTrump && bIsTrump) return 1;
        if (a.suit !== b.suit) {
          const suitOrder = { S: 0, H: 1, D: 2, C: 3 };
          return suitOrder[a.suit] - suitOrder[b.suit];
        }
        return b.value - a.value;
      });
    }

    hand.forEach((card, idx) => {
      const cardEl = document.createElement('div');
      
      // Calculate dynamic arch/fanning layout for all players (0=Bottom, 1=Right, 2=Top, 3=Left)
      let transformStr = '';
      let hasFanListeners = false;
      let translateX = 0;
      let translateY = 0;
      let rotDeg = 0;

      const N = hand.length;
      if (N > 0) {
        const centerIdx = (N - 1) / 2;
        const distFromCenter = idx - centerIdx;

        if (sIdx === 0) {
          // Bottom Player: Arches upwards (moves down at the ends)
          const maxRotation = 18;
          const stepAngle = N > 1 ? maxRotation / (N - 1) : 0;
          const yCurveMagnitude = 1.0;
          const xOverlapVal = -10;
          
          rotDeg = distFromCenter * stepAngle;
          translateY = Math.abs(distFromCenter) * Math.abs(distFromCenter) * yCurveMagnitude;
          translateX = distFromCenter * xOverlapVal;
          
          transformStr = `translateX(${translateX}px) translateY(${translateY}px) rotate(${rotDeg}deg)`;
          hasFanListeners = true;
        } else if (sIdx === 1 || sIdx === 2 || sIdx === 3) {
          // Opponents (Right, Top, Left): Fanned horizontally, arching upwards, tucked behind nameplates
          const maxRotation = 14;
          const stepAngle = N > 1 ? maxRotation / (N - 1) : 0;
          const yCurveMagnitude = 0.8;
          const xOverlapVal = -8;
          
          rotDeg = distFromCenter * stepAngle;
          translateY = Math.abs(distFromCenter) * Math.abs(distFromCenter) * yCurveMagnitude;
          translateX = distFromCenter * xOverlapVal;
          
          transformStr = `translateX(${translateX}px) translateY(${translateY}px) rotate(${rotDeg}deg)`;
        }
      }
      
      if (card.hidden) {
        // Face down
        cardEl.className = 'card card-back';
        cardEl.innerHTML = `<img src="${getCardImageUrl({ hidden: true })}" class="card-img" />`;
      } else {
        // Face up
        const imgUrl = getCardImageUrl(card);
        const isTrump = (state.trumpSuit && card.suit === state.trumpSuit);
        cardEl.className = `card${isTrump ? ' trump-glow' : ''}`;
        cardEl.innerHTML = `<img src="${imgUrl}" class="card-img" />`;

        // Click handler for card plays
        const isMyTurn = (state.currentTurnIdx === myPlayerIdx);
        const isMyTeammateExposedTurn = (state.is13Sar && state.bidWinnerIdx === myPlayerIdx && state.currentTurnIdx === actualPlayerIdx && sIdx === 2);

        if (state.status === 'PLAYING') {
          if (isMyTurn && sIdx === 0) {
            cardEl.addEventListener('click', () => {
              socket.emit('play_card', { suit: card.suit, value: card.value });
            });
          } else if (isMyTeammateExposedTurn) {
            cardEl.addEventListener('click', () => {
              socket.emit('play_card', { suit: card.suit, value: card.value });
            });
          }
        }
      }

      // Apply fanning transforms and bind interactive animations
      if (transformStr) {
        cardEl.style.transform = transformStr;
        
        if (hasFanListeners) {
          cardEl.style.transition = 'transform 0.2s ease-out, box-shadow 0.2s';
          
          cardEl.addEventListener('mouseenter', () => {
            cardEl.style.transform = `translateX(${translateX}px) translateY(${translateY - 20}px) rotate(${rotDeg}deg) scale(1.08)`;
            cardEl.style.zIndex = '100';
            cardEl.style.boxShadow = '0 10px 20px rgba(0,0,0,0.5)';
          });
          cardEl.addEventListener('mouseleave', () => {
            cardEl.style.transform = transformStr;
            cardEl.style.zIndex = '';
            cardEl.style.boxShadow = '';
          });
        }
      }

      handContainer.appendChild(cardEl);
    });
  }
}

function renderCenterHeap(state) {
  const heapContainer = document.getElementById('heap-cards');
  const instructionEl = document.getElementById('center-instruction');
  heapContainer.innerHTML = '';

  // Calculate center instruction description
  if (state.status === 'BIDDING') {
    const activeBidderName = state.players[state.currentBidderIdx]?.name || 'Someone';
    instructionEl.textContent = `${activeBidderName} Bidding...`;
  } else if (state.status === 'TRUMP_SELECTION') {
    const chooserName = state.players[state.bidWinnerIdx]?.name || 'Winner';
    instructionEl.textContent = `${chooserName} choosing Trump...`;
  } else if (state.status === 'PLAYING') {
    const activePlayerName = state.players[state.currentTurnIdx]?.name || 'Someone';
    let leadText = state.leadSuit ? `(Lead: ${SUIT_SYMBOLS[state.leadSuit]})` : '';
    instructionEl.textContent = `${activePlayerName}'s turn ${leadText}`;
  } else {
    instructionEl.textContent = '';
  }

  // Draw ALL items in heap + current trick
  // Render heap first (base cards at bottom of heap)
  state.heap.forEach(item => {
    drawHeapCard(heapContainer, item, state, true);
  });

  // Render current trick cards (on top of heap cards)
  state.currentTrick.forEach(item => {
    drawHeapCard(heapContainer, item, state, false);
  });
}

function drawHeapCard(container, item, state, isOldHeap) {
  const wrapper = document.createElement('div');
  wrapper.className = 'heap-card-wrapper';
  
  // Calculate physical directional offsets for cards in the current active trick
  const offset = item.offset || { x: 0, y: 0, rot: 0 };
  let dx = offset.x;
  let dy = offset.y;
  const rot = offset.rot;

  if (!isOldHeap) {
    // 0: Bottom, 1: Right, 2: Top, 3: Left
    const sIdx = (item.playerIdx - myPlayerIdx + 4) % 4;
    if (sIdx === 0) dy += 30;
    else if (sIdx === 1) dx += 30;
    else if (sIdx === 2) dy -= 30;
    else if (sIdx === 3) dx -= 30;
  }

  wrapper.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg)`;
  
  // Set lower opacity for old heap cards to distinguish active trick vs older pile cards
  if (isOldHeap) {
    wrapper.style.opacity = '0.5';
    wrapper.style.zIndex = '1';
  } else {
    wrapper.style.zIndex = '3';
  }

  const card = item.card;
  const imgUrl = getCardImageUrl(card);

  const cardEl = document.createElement('div');
  cardEl.className = 'card';
  cardEl.innerHTML = `<img src="${imgUrl}" class="card-img" />`;

  wrapper.appendChild(cardEl);

  // ONLY display the player name label for the active trick (prevents old pile tags overlapping)
  if (!isOldHeap) {
    const player = state.players[item.playerIdx];
    const nameLabel = document.createElement('div');
    nameLabel.className = 'heap-card-owner';
    nameLabel.textContent = player ? player.name : '';
    wrapper.appendChild(nameLabel);
  }

  container.appendChild(wrapper);
}

function handleModals(state) {
  // 1. Bidding Modal
  const isMyBiddingTurn = (state.status === 'BIDDING' && state.currentBidderIdx === myPlayerIdx);
  if (isMyBiddingTurn) {
    biddingModal.classList.add('active');
    bidHighInfo.innerHTML = state.highestBid > 0 
      ? `Current High Bid: <strong>${state.highestBid}</strong> (by ${state.players[state.bidWinnerIdx]?.name})`
      : `Current High Bid: <strong>None</strong> (min bid is 7)`;

    // Enable/Disable bid buttons based on current highest bid
    bidButtons.forEach(btn => {
      const val = parseInt(btn.getAttribute('data-value'));
      if (val === 13) {
        // Limit initial bidding to 12. 13-Sar is decided during cooldown.
        btn.disabled = true;
        btn.style.display = 'none';
      } else if (val > state.highestBid) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
        btn.style.display = '';
      } else {
        btn.disabled = true;
        btn.style.opacity = '0.4';
        btn.style.pointerEvents = 'none';
        btn.style.display = '';
      }
    });
  } else {
    biddingModal.classList.remove('active');
  }

  // 2. Trump selection modal
  const isMyTrumpTurn = (state.status === 'TRUMP_SELECTION' && state.bidWinnerIdx === myPlayerIdx);
  if (isMyTrumpTurn) {
    trumpModal.classList.add('active');
  } else {
    trumpModal.classList.remove('active');
  }

  // 3. Round Outcome modal
  if (state.status === 'ROUND_OVER') {
    const bidderTeamIdx = state.bidWinnerIdx % 2 === 0 ? 0 : 1;
    const isBiddingTeamYou = (myPlayerIdx % 2 === bidderTeamIdx);
    
    // Check if the bidding team collected enough tricks
    const target = state.highestBid;
    const collected = state.tricksCollected[bidderTeamIdx];
    const success = collected >= target;

    roundOutcomeTitle.textContent = success ? 'Bid Success!' : 'Bid Failed!';
    
    const bidTeamName = bidderTeamIdx === 0 ? 'Team A (You/Partner)' : 'Team B (Opponents)';
    const resultText = success 
      ? `Bidding Team <strong>${bidTeamName}</strong> successfully won <strong>${collected}</strong> Sirs (needed ${target}).`
      : `Bidding Team <strong>${bidTeamName}</strong> won only <strong>${collected}</strong> Sirs (needed ${target}).`;

    const penaltyText = state.is13Sar && !success
      ? `<br><span class="color-red" style="font-weight: bold;">Grand Slam Failure! Opponents pull double penalty (+26 points).</span>`
      : '';

    roundOutcomeDetails.innerHTML = `
      <p>${resultText}${penaltyText}</p>
      <p style="margin-top: 15px;"><strong>New Score:</strong> ${state.score} / 52 (Neutral Center: 26)</p>
    `;
    
    roundOutcomeModal.classList.add('active');
  } else {
    roundOutcomeModal.classList.remove('active');
  }

  // 4. Game Over Modal
  if (state.status === 'GAME_OVER') {
    const winnerTeam = state.score >= 52 ? 'Team A (You/Partner)' : 'Team B (Opponents)';
    winnerTeamDisplay.textContent = `${winnerTeam} Wins the Match!`;
    gameOverModal.classList.add('active');
  } else {
    gameOverModal.classList.remove('active');
  }

  // 5. 13-Sar Cooldown Modal Handling
  const cooldownModal = document.getElementById('cooldown-modal');
  const cooldownProgress = document.getElementById('cooldown-progress');
  const cooldownSeconds = document.getElementById('cooldown-seconds');
  const cooldownButtons = document.getElementById('cooldown-buttons');

  if (state.status === 'COOLDOWN') {
    cooldownModal.classList.add('active');
    const isMyChoice = (state.bidWinnerIdx === myPlayerIdx);
    const bidderName = state.players[state.bidWinnerIdx]?.name || 'Bid Winner';
    
    if (isMyChoice) {
      document.getElementById('cooldown-title').textContent = "Grand Slam Opportunity (13 Sirs)";
      document.getElementById('cooldown-desc').textContent = "Would you like to upgrade your bid to 13? Opponents winning even 1 trick defeats you.";
      cooldownButtons.style.display = 'flex';
    } else {
      document.getElementById('cooldown-title').textContent = "Waiting for Bid Winner...";
      document.getElementById('cooldown-desc').textContent = `${bidderName} is deciding whether to call 13 Sirs (Grand Slam).`;
      cooldownButtons.style.display = 'none';
    }
    
    cooldownSeconds.textContent = `Time remaining: ${state.cooldownTimeLeft}s`;
    cooldownProgress.style.width = `${(state.cooldownTimeLeft / 10) * 100}%`;
  } else {
    cooldownModal.classList.remove('active');
  }
}
